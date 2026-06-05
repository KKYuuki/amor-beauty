'use server'

import { db } from '@/server/db'
import { generalLedger, accountingCategory, branches } from '@/server/db/schema'
import { sanitizeText, sanitizeMinimal } from '@/utils/sanitize'
import { createLogs, logError } from './logs'
import { getCurrentUser, canAccessAccounting } from '@/utils/auth/permissions'
import { getAccountingPeriodLock } from './settings'
import { LedgerEntryType } from '@/utils/types/ledger'
import { AccountingPaymentMethod } from '@/utils/types/payment'
import { revalidatePath } from 'next/cache'
import { withTransaction } from '@/server/db/transactions'

export interface AccountingImportRow extends Record<string, unknown> {
    entry_date: string
    entry_type: string
    payment_method?: string
    category?: string
    description: string
    reference?: string
    debit?: number
    credit?: number
    branch?: string
}

export async function importAccountingEntries(
    entries: AccountingImportRow[],
    userId: string,
    branchId: string | null
): Promise<{ success: boolean; created: number; errors: string[] }> {
    const errors: string[] = []

    // Get current user for permission check
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, created: 0, errors: ['Unauthorized'] }
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return { success: false, created: 0, errors: ['Access denied'] }
    }

    const validTypes: LedgerEntryType[] = ['EXPENSE', 'REVENUE', 'ASSET', 'LIABILITY', 'EQUITY']
    const validPaymentMethods: string[] = ['CASH', 'CARD', 'BANK_TRANSFER', 'GCASH', 'PAYMAYA', 'CRYPTO']

    const allBranches = await db.select({ id: branches.id, name: branches.name, code: branches.code }).from(branches)
    const branchNameMap = new Map(allBranches.map(b => [b.name.toLowerCase(), b.id]))
    const branchCodeMap = new Map(allBranches.map(b => [b.code.toLowerCase(), b.id]))

    function resolveBranchId(branchValue: string | undefined, defaultBranchId: string | null): string | null {
        if (!branchValue || branchValue.trim() === '') return defaultBranchId
        const lower = branchValue.trim().toLowerCase()
        return branchNameMap.get(lower) || branchCodeMap.get(lower) || defaultBranchId
    }

    // Fetch all categories from database
    const dbCategories = await db
        .select({ id: accountingCategory.id, name: accountingCategory.name, type: accountingCategory.type, isActive: accountingCategory.isActive })
        .from(accountingCategory)

    const categoryMap = new Map(dbCategories.map(c => [c.name.toLowerCase(), c]))

    // Get accounting period lock for validation
    const lockCheck = await getAccountingPeriodLock()
    const lockedUntil = lockCheck.success && lockCheck.data?.locked_until
        ? new Date(lockCheck.data.locked_until)
        : null

    // Validate all entries
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const rowNum = i + 1

        // Validate entry type
        if (!validTypes.includes(entry.entry_type.toUpperCase() as LedgerEntryType)) {
            errors.push(
                `Row ${rowNum}: Invalid entry type "${entry.entry_type}". Must be one of: ${validTypes.join(', ')}`
            )
        }

        // Validate payment method
        if (entry.payment_method && !validPaymentMethods.includes(entry.payment_method.toUpperCase())) {
            errors.push(`Row ${rowNum}: Invalid payment method "${entry.payment_method}". Must be one of: ${validPaymentMethods.join(', ')}`)
        }

        // Validate description
        if (!entry.description || entry.description.trim().length === 0) {
            errors.push(`Row ${rowNum}: Description is required`)
        }

        // Validate date
        const entryDate = new Date(entry.entry_date)
        if (isNaN(entryDate.getTime())) {
            errors.push(`Row ${rowNum}: Invalid date format "${entry.entry_date}"`)
        }

        // Check accounting period lock
        if (lockedUntil && entryDate <= lockedUntil) {
            errors.push(
                `Row ${rowNum}: Entry date ${entry.entry_date} is within a locked accounting period`
            )
        }

        // Validate debit/credit
        const debit = entry.debit || 0
        const credit = entry.credit || 0
        if (debit === 0 && credit === 0) {
            errors.push(`Row ${rowNum}: Either debit or credit must be non-zero`)
        }
        if (debit < 0 || credit < 0) {
            errors.push(`Row ${rowNum}: Debit and credit must be non-negative`)
        }
        if (debit > 0 && credit > 0) {
            errors.push(`Row ${rowNum}: Only one of debit or credit should be entered`)
        }

        // Check category if provided - collect unknown categories for auto-create
        if (entry.category) {
            const categoryLower = entry.category.toLowerCase()
            const existingCategory = categoryMap.get(categoryLower)

            if (!existingCategory) {
                // Will be auto-created later - track it
            } else if (!existingCategory.isActive) {
                errors.push(`Row ${rowNum}: Category "${entry.category}" is archived`)
            } else if (existingCategory.type !== entry.entry_type.toUpperCase()) {
                errors.push(`Row ${rowNum}: Category "${entry.category}" is a ${existingCategory.type} category but entry is ${entry.entry_type.toUpperCase()}`)
            }
        }
    }

    if (errors.length > 0) {
        return { success: false, created: 0, errors }
    }

    // Auto-create any categories that don't exist
    const categoriesToCreate = new Map<string, { name: string; type: LedgerEntryType }>()
    for (const entry of entries) {
        if (entry.category) {
            const categoryLower = entry.category.toLowerCase()
            if (!categoryMap.has(categoryLower) && !categoriesToCreate.has(categoryLower)) {
                categoriesToCreate.set(categoryLower, {
                    name: entry.category,
                    type: entry.entry_type.toUpperCase() as LedgerEntryType,
                })
            }
        }
    }

    if (categoriesToCreate.size > 0) {
        const newCategories = await db
            .insert(accountingCategory)
            .values(
                Array.from(categoriesToCreate.entries()).map(([_, { name, type }]) => ({
                    name: sanitizeText(name),
                    type: type,
                    isActive: true,
                }))
            )
            .returning()

        for (const cat of newCategories) {
            categoryMap.set(cat.name.toLowerCase(), cat)
        }

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'ACCOUNTING',
                message: `Auto-created ${newCategories.length} accounting categories during CSV import`,
                user_id: userId,
                branch_id: branchId ?? undefined,
            }],
        })
    }

    // Prepare entries for insert
    const entriesToInsert = entries.map(entry => {
        const entryDate = new Date(entry.entry_date)
        const categoryId = entry.category ? categoryMap.get(entry.category.toLowerCase())?.id : null
        const resolvedBranchId = resolveBranchId(entry.branch, branchId)
        const paymentMethod = (entry.payment_method?.toUpperCase() && validPaymentMethods.includes(entry.payment_method.toUpperCase()))
            ? entry.payment_method.toUpperCase() as AccountingPaymentMethod
            : null

        return {
            entryDate: entryDate,
            entryType: entry.entry_type.toUpperCase() as LedgerEntryType,
            category: entry.category || null,
            categoryId: categoryId ?? undefined,
            description: sanitizeText(entry.description),
            reference: entry.reference ? sanitizeMinimal(entry.reference) : null,
            debit: String(entry.debit || 0),
            credit: String(entry.credit || 0),
            branchId: resolvedBranchId,
            paymentMethod,
            createdBy: userId,
            isVoided: false,
            sourceType: 'MANUAL' as const,
            sourceId: null,
            proofUrl: null,
            voidedAt: null,
            voidedBy: null,
            voidReason: null,
            updatedAt: null,
            updatedBy: null,
        }
    })

    const result = await withTransaction(async (tx) => {
        const BATCH_SIZE = 100
        let created = 0

        for (let i = 0; i < entriesToInsert.length; i += BATCH_SIZE) {
            const batch = entriesToInsert.slice(i, i + BATCH_SIZE)
            await tx.insert(generalLedger).values(batch)
            created += batch.length
        }

        return created
    }, { action: 'ACCOUNTING', userId })

    if (result.success) {
        createLogs({
            logs: [{
                level: 'INFO',
                type: 'ACCOUNTING',
                message: `Imported ${result.data} accounting entries via CSV`,
                user_id: userId,
                branch_id: branchId ?? undefined,
            }]
        })
        revalidatePath('/accounting')

        return {
            success: true,
            created: result.data,
            errors: []
        }
    } else {
        await logError({
            type: 'ACCOUNTING',
            message: `Failed to import accounting entries: ${result.error}`
        })
        return {
            success: false,
            created: 0,
            errors: [result.error || 'Failed to import entries']
        }
    }
}
