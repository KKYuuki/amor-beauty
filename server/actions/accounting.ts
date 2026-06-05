'use server'

import { sanitizeText, sanitizeMinimal } from '@/utils/sanitize'
import { db } from '@/server/db'
import {
    accountingCategory,
    generalLedger,
    branches,
    payrollEntry,
} from '@/server/db/schema'
import { eq, and, or, like, gte, lte, desc, sql, count, asc, isNull, SQL, inArray } from 'drizzle-orm'

/**
 * Escapes special LIKE pattern characters (% and _) to prevent wildcard injection
 */
function escapeLike(input: string): string {
    return input.replace(/[%_]/g, '\\$&')
}

async function firePostPersistSideEffects(actions: (() => void | Promise<void>)[]): Promise<void> {
    for (const action of actions) {
        try {
            await action()
        } catch (err) {
            await logError({
                type: 'ACCOUNTING',
                message: `Post-persist side effect failed: ${err instanceof Error ? err.message : String(err)}`
            })
        }
    }
}

import {
    LedgerEntry,
    LedgerEntryType,
    LedgerSourceType,
    CreateLedgerEntryPayload,
    UpdateLedgerEntryPayload,
    LedgerFilters,
    LedgerExportType,
    PaymentMethodCategoryBreakdown,
    LedgerDetailBreakdown,
} from '@/utils/types/ledger'
import { AccountingPaymentMethod, getAccountingPaymentMethodLabel } from '@/utils/types/payment'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import { createLogs, logError } from './logs'
import { type TransactionClient } from '@/server/db/transactions'
import { getDateRangeFromPreset, DateRangePreset, safeToDate, safeFormatDate } from '@/utils/date-utils'
import { uploadFile } from "@/utils/storage"
import {
    generateGroupedLedgerExport,
} from '@/utils/export-engine'
import type {
    GroupingConfig,
    GroupedExportOptions,
    ExportFormat,
    ExportResult,
    BranchInfo,
    LedgerExportRow,
} from '@/utils/export-engine/types'
import {
    getCurrentUser,
    isAdmin,
    canAccessAccounting,
} from '@/utils/auth/permissions'
import { getAccountingPeriodLock } from './settings'
import { revalidatePath } from 'next/cache'
import { withTransaction } from '@/server/db/transactions'
import { cache } from '@/utils/cache'

// ============================================================================
// Balance Validation Helpers
// ============================================================================

/**
 * Validates that a single entry has at least one non-zero value
 */
function validateSingleEntry(debit: number, credit: number): { valid: boolean; error?: string } {
    if (debit === 0 && credit === 0) {
        return { valid: false, error: 'Entry must have non-zero debit or credit' }
    }
    if (debit < 0 || credit < 0) {
        return { valid: false, error: 'Debit and credit must be non-negative' }
    }
    return { valid: true }
}

/**
 * Validates that a batch of entries balances (total debits = total credits)
 */
function validateBalancedEntries(entries: { debit: number; credit: number }[]): { valid: boolean; error?: string } {
    const totalDebits = entries.reduce((sum, e) => sum + e.debit, 0)
    const totalCredits = entries.reduce((sum, e) => sum + e.credit, 0)

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
        return {
            valid: false,
            error: `Entries must balance: total debits (${totalDebits}) must equal total credits (${totalCredits})`
        }
    }
    return { valid: true }
}

export interface JournalEntryLine {
    accountId?: string
    category: string
    description: string
    debit: number
    credit: number
    entry_type: LedgerEntryType
    payment_method?: string
}

export interface GetLedgerEntriesOptions {
    filters?: LedgerFilters
    branchId?: string | null
    datePreset?: DateRangePreset
    startDate?: string
    endDate?: string
    page?: number
    pageSize?: number
    sortBy?: 'entry_date' | 'created_at'
}

export interface GetLedgerEntriesResult {
    data: LedgerEntry[]
    total: number
}

export async function getLedgerEntries(
    options: GetLedgerEntriesOptions = {}
): Promise<ActionResponse<GetLedgerEntriesResult>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Unauthorized')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const {
            filters,
            datePreset,
            startDate,
            endDate,
            page = 1,
            pageSize = 50,
            sortBy = 'entry_date',
        } = options

        // Build date range
        let dateFrom: Date | undefined
        let dateTo: Date | undefined

        if (datePreset && datePreset !== 'all') {
            const dateRange = getDateRangeFromPreset(datePreset, startDate, endDate)
            if (dateRange) {
                dateFrom = dateRange.start
                dateTo = dateRange.end
            }
        } else if (startDate && endDate) {
            const parsedStart = safeToDate(startDate, null)
            const parsedEnd = safeToDate(endDate, null)
            if (!parsedStart || !parsedEnd) {
                return failure('Invalid date range provided')
            }
            dateFrom = parsedStart
            dateTo = parsedEnd
        }

        // Build where conditions
        const conditions: ReturnType<typeof and>[] = []

        // Voided filter: voided_only takes priority, then default exclude, then include_voided
        if (filters?.voided_only) {
            conditions.push(eq(generalLedger.isVoided, true))
        } else if (!filters?.include_voided) {
            conditions.push(eq(generalLedger.isVoided, false))
        }

        if (filters?.entry_type) {
            conditions.push(eq(generalLedger.entryType, filters.entry_type))
        }

        if (filters?.category) {
            conditions.push(eq(generalLedger.category, filters.category))
        }

        if (filters?.source_type) {
            conditions.push(eq(generalLedger.sourceType, filters.source_type))
        }

        if (options.branchId) {
            conditions.push(or(eq(generalLedger.branchId, options.branchId), isNull(generalLedger.branchId)))
        }

        if (dateFrom) {
            conditions.push(gte(generalLedger.entryDate, dateFrom))
        }

        if (dateTo) {
            conditions.push(lte(generalLedger.entryDate, dateTo))
        }

        if (filters?.search) {
            const searchTerm = `%${escapeLike(filters.search)}%`
            conditions.push(
                or(
                    like(generalLedger.description, searchTerm),
                    like(generalLedger.reference, searchTerm),
                    like(generalLedger.category, searchTerm)
                )
            )
        }

        if (filters?.payment_method) {
            conditions.push(eq(generalLedger.paymentMethod, filters.payment_method))
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined

        // Get total count
        const totalResult = await db
            .select({ count: count() })
            .from(generalLedger)
            .where(whereClause || sql`TRUE`)

        const total = totalResult[0]?.count || 0

        // Get entries with pagination
        const entries = await db
            .select()
            .from(generalLedger)
            .where(whereClause || sql`TRUE`)
            .orderBy(
                ...(sortBy === 'created_at'
                    ? [desc(generalLedger.createdAt), desc(generalLedger.entryDate)]
                    : [desc(generalLedger.entryDate), desc(generalLedger.createdAt)])
            )
            .limit(pageSize)
            .offset((page - 1) * pageSize)

        // Wrap payroll cuts aggregation in a read-only transaction for snapshot consistency
        const { payrollEntryMap, transactionCutMap } = await db.transaction(async (tx) => {
            const payrollEntryMap = new Map<string, { staffCut: string; shopCut: string }>()
            const transactionCutMap = new Map<string, { staffCut: number; shopCut: number }>()

            // PAYROLL-source lookup
            const payrollSourceIds = entries
                .filter(e => e.sourceType === "PAYROLL")
                .map(e => e.sourceId)
                .filter((id): id is string => id !== null)

            if (payrollSourceIds.length > 0) {
                const rows = await tx
                    .select({
                        id: payrollEntry.id,
                        staffCut: payrollEntry.staffCut,
                        shopCut: payrollEntry.shopCut,
                    })
                    .from(payrollEntry)
                    .where(inArray(payrollEntry.id, payrollSourceIds))

                for (const row of rows) {
                    payrollEntryMap.set(row.id, {
                        staffCut: row.staffCut,
                        shopCut: row.shopCut,
                    })
                }
            }

            // TRANSACTION-source lookup
            const transactionSourceIds = entries
                .filter(e => e.sourceType === "TRANSACTION")
                .map(e => e.sourceId)
                .filter((id): id is string => id !== null)

            if (transactionSourceIds.length > 0) {
                const txnRows = await tx
                    .select({
                        transactionId: payrollEntry.transactionId,
                        staffCut: payrollEntry.staffCut,
                        shopCut: payrollEntry.shopCut,
                    })
                    .from(payrollEntry)
                    .where(inArray(payrollEntry.transactionId, transactionSourceIds))

                for (const row of txnRows) {
                    if (!row.transactionId) continue
                    const existing = transactionCutMap.get(row.transactionId)
                    if (existing) {
                        existing.staffCut += Number(row.staffCut)
                        existing.shopCut += Number(row.shopCut)
                    } else {
                        transactionCutMap.set(row.transactionId, {
                            staffCut: Number(row.staffCut),
                            shopCut: Number(row.shopCut),
                        })
                    }
                }
            }

            return { payrollEntryMap, transactionCutMap }
        })

        // Transform to LedgerEntry type
        const transformedEntries: LedgerEntry[] = entries.map((entry) => ({
            id: entry.id,
            created_at: entry.createdAt,
            entry_date: entry.entryDate,
            entry_type: entry.entryType as LedgerEntryType,
            category: entry.category || undefined,
            description: entry.description,
            reference: entry.reference || undefined,
            debit: Number(entry.debit),
            credit: Number(entry.credit),
            source_type: (entry.sourceType as LedgerSourceType) || undefined,
            source_id: entry.sourceId || undefined,
            created_by: entry.createdBy,
            updated_at: entry.updatedAt || undefined,
            updated_by: entry.updatedBy || undefined,
            proof_url: entry.proofUrl || undefined,
            is_voided: entry.isVoided,
            voided_at: entry.voidedAt || undefined,
            voided_by: entry.voidedBy || undefined,
            void_reason: entry.voidReason || undefined,
            branch_id: entry.branchId,
            payment_method: (entry.paymentMethod as AccountingPaymentMethod) || undefined,
            // Attach payroll cuts: PAYROLL-sourced uses direct lookup, TRANSACTION-sourced uses aggregation
            ...(entry.sourceType === "PAYROLL" && entry.sourceId && payrollEntryMap.has(entry.sourceId)
                ? {
                    staff_cut: Number(payrollEntryMap.get(entry.sourceId)!.staffCut),
                    shop_cut: Number(payrollEntryMap.get(entry.sourceId)!.shopCut),
                  }
                : entry.sourceType === "TRANSACTION" && entry.sourceId && transactionCutMap.has(entry.sourceId)
                  ? {
                      staff_cut: transactionCutMap.get(entry.sourceId)!.staffCut,
                      shop_cut: transactionCutMap.get(entry.sourceId)!.shopCut,
                    }
                  : {}),
        }))

        return success({
            data: transformedEntries,
            total,
        })
    } catch (error) {
        createLogs({
            logs: [
                {
                    level: 'ERROR',
                    type: 'ACCOUNTING',
                    message: `Failed to fetch ledger entries: ${error instanceof Error ? error.message : 'Unknown error'}`,
                },
            ],
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch ledger entries')
    }
}

export async function getLedgerEntry(
    id: string
): Promise<ActionResponse<LedgerEntry>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Unauthorized')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const entries = await db
            .select()
            .from(generalLedger)
            .where(eq(generalLedger.id, id))
            .limit(1)

        if (entries.length === 0) {
            return failure('Entry not found')
        }

        const entry = entries[0]
        const transformedEntry: LedgerEntry = {
            id: entry.id,
            created_at: entry.createdAt,
            entry_date: entry.entryDate,
            entry_type: entry.entryType as LedgerEntryType,
            category: entry.category || undefined,
            description: entry.description,
            reference: entry.reference || undefined,
            debit: Number(entry.debit),
            credit: Number(entry.credit),
            source_type: (entry.sourceType as LedgerSourceType) || undefined,
            source_id: entry.sourceId || undefined,
            created_by: entry.createdBy,
            updated_at: entry.updatedAt || undefined,
            updated_by: entry.updatedBy || undefined,
            proof_url: entry.proofUrl || undefined,
            is_voided: entry.isVoided,
            voided_at: entry.voidedAt || undefined,
            voided_by: entry.voidedBy || undefined,
            void_reason: entry.voidReason || undefined,
            branch_id: entry.branchId,
            payment_method: (entry.paymentMethod as AccountingPaymentMethod) || undefined,
        }

        return success(transformedEntry)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error fetching ledger entry: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch ledger entry')
    }
}

export async function createLedgerEntry(
    payload: CreateLedgerEntryPayload & { proof_file?: File | null }
): Promise<ActionResponse<LedgerEntry>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied — requires accounting_access flag')
    }

    try {
        // Validation
        const sanitizedDescription = sanitizeText(payload.description)
        if (!sanitizedDescription) {
            return failure('Description is required')
        }

        // Validate single entry
        const validation = validateSingleEntry(payload.debit, payload.credit)
        if (!validation.valid) {
            return failure(validation.error!)
        }

        if (payload.debit > 0 && payload.credit > 0) {
            return failure('Only one of debit or credit should be entered')
        }

        // Validate entry date is reasonable (not more than 1 year in future, not more than 10 years in past)
        const entryDate = new Date(payload.entry_date)
        const now = new Date()
        const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
        const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate())

        if (entryDate > oneYearFromNow) {
            return failure('Entry date cannot be more than 1 year in the future')
        }

        if (entryDate < tenYearsAgo) {
            return failure('Entry date cannot be more than 10 years in the past')
        }

        // Check accounting period lock
        const periodLocked = await getAccountingPeriodLock()
        if (periodLocked.success && periodLocked.data) {
            const { locked_until } = periodLocked.data
            if (locked_until && entryDate <= new Date(locked_until)) {
                return failure('Cannot create entries for locked accounting periods')
            }
        }

        // Validate or auto-create category if provided
        let categoryId: string | undefined
        if (payload.category) {
            const categoryCheck = await db
                .select()
                .from(accountingCategory)
                .where(eq(accountingCategory.name, sanitizeText(payload.category)))
                .limit(1)

            if (categoryCheck.length === 0) {
                const sanitizedName = sanitizeText(payload.category)
                const [newCategory] = await db
                    .insert(accountingCategory)
                    .values({
                        name: sanitizedName,
                        type: payload.entry_type,
                        isActive: true,
                    })
                    .returning()

                categoryId = newCategory.id

                createLogs({
                    logs: [{
                        level: 'INFO',
                        type: 'ACCOUNTING',
                        message: `Auto-created accounting category: ${sanitizedName} (${newCategory.id}) type: ${payload.entry_type}`,
                    }],
                })
            } else if (!categoryCheck[0].isActive) {
                return failure('Category is archived and cannot be used')
            } else {
                if (categoryCheck[0].type !== payload.entry_type) {
                    return failure(`Category type (${categoryCheck[0].type}) does not match entry type (${payload.entry_type})`)
                }
                categoryId = categoryCheck[0].id
            }
        }

        // Upload proof file if provided
        let proofUrl: string | undefined
        if (payload.proof_file) {
            const buffer = Buffer.from(await payload.proof_file.arrayBuffer())
            const extension = payload.proof_file.name.split('.').pop() || 'jpg'
            const key = `accounting-proofs/${Date.now()}.${extension}`
            const uploadResult = await uploadFile(buffer, key, payload.proof_file.type)
            proofUrl = uploadResult.url
        }

        const [entry] = await db
            .insert(generalLedger)
            .values({
                entryDate: payload.entry_date,
                entryType: payload.entry_type,
                category: payload.category,
                categoryId: categoryId,
                description: sanitizedDescription,
                reference: payload.reference ? sanitizeMinimal(payload.reference) : null,
                debit: String(payload.debit),
                credit: String(payload.credit),
                sourceType: payload.source_type,
                sourceId: payload.source_id,
                createdBy: user.id,
                proofUrl: proofUrl,
                branchId: payload.branch_id,
                paymentMethod: payload.payment_method || null,
            })
            .returning()

        const transformedEntry: LedgerEntry = {
            id: entry.id,
            created_at: entry.createdAt,
            entry_date: entry.entryDate,
            entry_type: entry.entryType as LedgerEntryType,
            category: entry.category || undefined,
            description: entry.description,
            reference: entry.reference || undefined,
            debit: Number(entry.debit),
            credit: Number(entry.credit),
            source_type: (entry.sourceType as LedgerSourceType) || undefined,
            source_id: entry.sourceId || undefined,
            created_by: entry.createdBy,
            updated_at: entry.updatedAt || undefined,
            updated_by: entry.updatedBy || undefined,
            proof_url: entry.proofUrl || undefined,
            is_voided: entry.isVoided,
            voided_at: entry.voidedAt || undefined,
            voided_by: entry.voidedBy || undefined,
            void_reason: entry.voidReason || undefined,
            branch_id: entry.branchId,
            payment_method: (entry.paymentMethod as AccountingPaymentMethod) || undefined,
        }

        await firePostPersistSideEffects([
            () => createLogs({
                logs: [{
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Ledger entry created: ${entry.id} by ${user.id}`,
                }],
            }),
            () => revalidatePath('/accounting'),
            () => cache.invalidate('financial_metrics'),
            () => cache.invalidate('net_income'),
            () => cache.invalidate('ledger_summary'),
            () => cache.invalidate('revenue_trend'),
            () => cache.invalidate('pl_metrics'),
            () => cache.invalidate('expense_breakdown'),
            () => cache.invalidate('revenue_expense_trend'),
            () => cache.invalidate('business_insights'),
            () => cache.invalidate('exec_accounting'),
        ])

        return success(transformedEntry)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error creating ledger entry: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to create ledger entry')
    }
}

export async function createJournalEntry(
    lines: JournalEntryLine[],
    options: {
        description: string
        entryDate?: Date
        proofFile?: File
        branch_id?: string | null
    }
): Promise<ActionResponse<{ entryIds: string[] }>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    // Validate balance
    const validation = validateBalancedEntries(lines)
    if (!validation.valid) {
        return failure(validation.error!)
    }

    // Validate each line
    for (const line of lines) {
        const lineValidation = validateSingleEntry(line.debit, line.credit)
        if (!lineValidation.valid) {
            return failure(lineValidation.error!)
        }
    }

    const entryDate = options.entryDate || new Date()

    // Create entries within transaction
    return await withTransaction(async (tx) => {
        const entryIds: string[] = []

        for (const line of lines) {
            const [entry] = await tx
                .insert(generalLedger)
                .values({
                    entryDate,
                    entryType: line.entry_type,
                    category: line.category,
                    description: `${options.description} - ${line.description}`,
                    debit: String(line.debit),
                    credit: String(line.credit),
                    createdBy: user.id,
                    paymentMethod: line.payment_method,
                    branchId: options.branch_id || null,
                })
                .returning({ id: generalLedger.id })

            entryIds.push(entry.id)
        }

        return { entryIds }
    }, { action: 'ACCOUNTING', userId: user.id }, async () => {
        await firePostPersistSideEffects([
            () => createLogs({
                logs: [{
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Journal entry created with ${lines.length} lines`,
                }],
            }),
            () => revalidatePath('/accounting'),
            () => revalidatePath('/metrics'),
            () => cache.invalidate('financial_metrics'),
            () => cache.invalidate('net_income'),
            () => cache.invalidate('ledger_summary'),
            () => cache.invalidate('revenue_trend'),
            () => cache.invalidate('pl_metrics'),
            () => cache.invalidate('expense_breakdown'),
            () => cache.invalidate('revenue_expense_trend'),
            () => cache.invalidate('business_insights'),
            () => cache.invalidate('exec_accounting'),
        ])
    })
}

export async function createAutoLedgerEntry(
    source: LedgerSourceType,
    sourceId: string,
    entryData: {
        entry_date: Date
        entry_type: LedgerEntryType
        category?: string
        description: string
        reference?: string
        debit: number
        credit: number
        branch_id?: string | null
        payment_method?: AccountingPaymentMethod
    },
    userId: string,
    tx?: TransactionClient
): Promise<ActionResponse<{ id: string }>> {
    const dbClient = tx || db

    // Check accounting period lock for automated entries
    try {
        const periodLocked = await getAccountingPeriodLock()
        if (periodLocked.success && periodLocked.data) {
            const { locked_until } = periodLocked.data
            if (locked_until && entryData.entry_date <= new Date(locked_until)) {
                return failure(`Cannot create auto-ledger entry: accounting period locked until ${locked_until}`)
            }
        }
    } catch (lockError) {
        // If we can't check the lock, log and proceed (don't block sales)
        await logError({
            type: 'ACCOUNTING',
            message: `Failed to check accounting period lock for auto entry: ${lockError instanceof Error ? lockError.message : String(lockError)}`
        })
    }

    try {
        let categoryId: string | undefined
        const categoryName: string | undefined = entryData.category

        if (entryData.category) {
            const existing = await dbClient
                .select()
                .from(accountingCategory)
                .where(eq(accountingCategory.name, entryData.category))
                .limit(1)

            if (existing.length === 0) {
                const [newCategory] = await dbClient
                    .insert(accountingCategory)
                    .values({
                        name: entryData.category,
                        type: entryData.entry_type,
                        isActive: true,
                    })
                    .returning({ id: accountingCategory.id })
                categoryId = newCategory?.id
            } else {
                categoryId = existing[0]?.id
            }
        }

        // Check for existing non-voided entry with the same source (explicit pre-check instead of error-code parsing)
        const existingEntry = await dbClient
            .select({ id: generalLedger.id })
            .from(generalLedger)
            .where(and(
                eq(generalLedger.sourceType, source),
                eq(generalLedger.sourceId, sourceId),
                eq(generalLedger.isVoided, false)
            ))
            .limit(1)

        if (existingEntry.length > 0) {
            createLogs({
                logs: [{
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Auto ledger entry already exists for ${source}:${sourceId}, returning existing id ${existingEntry[0].id}`,
                }],
            })
            return success({ id: existingEntry[0].id })
        }

        let entryId: string

        try {
            const [inserted] = await dbClient.insert(generalLedger).values({
                entryDate: entryData.entry_date,
                entryType: entryData.entry_type,
                category: categoryName,
                categoryId: categoryId,
                description: sanitizeText(entryData.description),
                reference: entryData.reference ? sanitizeMinimal(entryData.reference) : null,
                debit: String(entryData.debit),
                credit: String(entryData.credit),
                sourceType: source,
                sourceId: sourceId,
                createdBy: userId,
                branchId: entryData.branch_id || null,
                paymentMethod: entryData.payment_method || null,
            }).returning({ id: generalLedger.id })

            entryId = inserted.id
        } catch (insertError) {
            await logError({
                type: 'ACCOUNTING',
                message: `Failed to insert auto ledger entry: ${insertError instanceof Error ? insertError.message : String(insertError)}`
            })
            return failure('Failed to create auto ledger entry')
        }

        await firePostPersistSideEffects([
            () => createLogs({
                logs: [{
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Auto ledger entry created from ${source}: ${sourceId}`,
                }],
            }),
            () => revalidatePath('/accounting'),
            () => revalidatePath('/metrics'),
            () => cache.invalidate('financial_metrics'),
            () => cache.invalidate('net_income'),
            () => cache.invalidate('ledger_summary'),
            () => cache.invalidate('revenue_trend'),
            () => cache.invalidate('pl_metrics'),
            () => cache.invalidate('expense_breakdown'),
            () => cache.invalidate('revenue_expense_trend'),
            () => cache.invalidate('business_insights'),
            () => cache.invalidate('exec_accounting'),
        ])

        return success({ id: entryId })
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error creating auto ledger entry: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to create auto ledger entry')
    }
}

export async function updateLedgerEntry(
    id: string,
    updates: UpdateLedgerEntryPayload
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied — requires accounting_access flag')
    }

    if (user.role !== 'admin') {
        return failure('Unauthorized: only admin users can edit entries')
    }

    try {
        // Check if entry exists and is not voided
        const existing = await db
            .select()
            .from(generalLedger)
            .where(eq(generalLedger.id, id))
            .limit(1)

        if (existing.length === 0) {
            return failure('Entry not found')
        }

        if (existing[0].isVoided) {
            return failure('Cannot edit a voided entry')
        }

        // Check if period is locked
        const lockResult = await getAccountingPeriodLock()
        if (lockResult.success && lockResult.data) {
            const { locked_until } = lockResult.data
            if (locked_until && new Date(existing[0].entryDate) <= new Date(locked_until)) {
                return failure('This accounting period is locked and cannot be modified')
            }
        }

        // Validation
        if (updates.description !== undefined) {
            const sanitizedDescription = sanitizeText(updates.description)
            if (!sanitizedDescription) {
                return failure('Description is required')
            }
        }

        if (updates.debit !== undefined && updates.debit < 0) {
            return failure('Debit cannot be negative')
        }

        if (updates.credit !== undefined && updates.credit < 0) {
            return failure('Credit cannot be negative')
        }

        // Validate entry date is reasonable if updating
        if (updates.entry_date) {
            const entryDate = new Date(updates.entry_date)
            const now = new Date()
            const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
            const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate())

            if (entryDate > oneYearFromNow) {
                return failure('Entry date cannot be more than 1 year in the future')
            }

            if (entryDate < tenYearsAgo) {
                return failure('Entry date cannot be more than 10 years in the past')
            }
        }

        // Validate or auto-create category if provided
        let newCategoryId: string | undefined
        if (updates.category) {
            const categoryCheck = await db
                .select()
                .from(accountingCategory)
                .where(eq(accountingCategory.name, sanitizeText(updates.category)))
                .limit(1)

            if (categoryCheck.length === 0) {
                const sanitizedName = sanitizeText(updates.category)
                const entryType = updates.entry_type || existing[0].entryType
                const [newCategory] = await db
                    .insert(accountingCategory)
                    .values({
                        name: sanitizedName,
                        type: entryType,
                        isActive: true,
                    })
                    .returning()

                newCategoryId = newCategory.id

                createLogs({
                    logs: [{
                        level: 'INFO',
                        type: 'ACCOUNTING',
                        message: `Auto-created accounting category: ${sanitizedName} (${newCategory.id}) type: ${entryType}`,
                    }],
                })
            } else if (!categoryCheck[0].isActive) {
                return failure('Category is archived and cannot be used')
            } else {
                const entryType = updates.entry_type || existing[0].entryType
                if (categoryCheck[0].type !== entryType) {
                    return failure(`Category type (${categoryCheck[0].type}) does not match entry type (${entryType})`)
                }
                newCategoryId = categoryCheck[0].id
            }
        }

        const updateData: Partial<typeof generalLedger.$inferInsert> = {
            updatedAt: new Date(),
            updatedBy: user.id,
        }

        if (updates.entry_date) updateData.entryDate = updates.entry_date
        if (updates.entry_type) updateData.entryType = updates.entry_type
        if (updates.category !== undefined) updateData.category = updates.category
        if (updates.description) updateData.description = sanitizeText(updates.description)
        if (updates.reference !== undefined) updateData.reference = updates.reference ? sanitizeMinimal(updates.reference) : null
        if (updates.debit !== undefined) updateData.debit = String(updates.debit)
        if (updates.credit !== undefined) updateData.credit = String(updates.credit)
        if (updates.branch_id !== undefined) updateData.branchId = updates.branch_id
        if (updates.payment_method !== undefined) updateData.paymentMethod = updates.payment_method
        if (newCategoryId) updateData.categoryId = newCategoryId

        await db.update(generalLedger).set(updateData).where(eq(generalLedger.id, id))

        await firePostPersistSideEffects([
            () => createLogs({
                logs: [{
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Ledger entry updated: ${id} by ${user.id}`,
                }],
            }),
            () => revalidatePath('/accounting'),
            () => cache.invalidate('financial_metrics'),
            () => cache.invalidate('net_income'),
            () => cache.invalidate('ledger_summary'),
            () => cache.invalidate('revenue_trend'),
            () => cache.invalidate('pl_metrics'),
            () => cache.invalidate('expense_breakdown'),
            () => cache.invalidate('revenue_expense_trend'),
            () => cache.invalidate('business_insights'),
            () => cache.invalidate('exec_accounting'),
        ])

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error updating ledger entry: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to update ledger entry')
    }
}

export async function voidLedgerEntry(
    id: string,
    reason: string
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied — requires accounting_access flag')
    }

    if (user.role !== 'admin') {
        return failure('Unauthorized: only admin users can void entries')
    }

    // Validate reason is provided
    if (!reason || reason.trim().length === 0) {
        return failure('Void reason is required')
    }

    if (reason.trim().length < 5) {
        return failure('Void reason must be at least 5 characters')
    }

    try {
        // Check if entry exists
        const existing = await db
            .select()
            .from(generalLedger)
            .where(eq(generalLedger.id, id))
            .limit(1)

        if (existing.length === 0) {
            return failure('Entry not found')
        }

        if (existing[0].isVoided) {
            return failure('Entry is already voided')
        }

        // Check if period is locked
        const lockResult = await getAccountingPeriodLock()
        if (lockResult.success && lockResult.data) {
            const { locked_until } = lockResult.data
            if (locked_until && new Date(existing[0].entryDate) <= new Date(locked_until)) {
                return failure('This accounting period is locked and cannot be modified')
            }
        }

        await db
            .update(generalLedger)
            .set({
                isVoided: true,
                voidedAt: new Date(),
                voidedBy: user.id,
                voidReason: reason,
            })
            .where(eq(generalLedger.id, id))

        await firePostPersistSideEffects([
            () => createLogs({
                logs: [{
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Ledger entry voided: ${id} by ${user.id}, reason: ${reason}`,
                }],
            }),
            () => revalidatePath('/accounting'),
            () => cache.invalidate('financial_metrics'),
            () => cache.invalidate('net_income'),
            () => cache.invalidate('ledger_summary'),
            () => cache.invalidate('revenue_trend'),
            () => cache.invalidate('pl_metrics'),
            () => cache.invalidate('expense_breakdown'),
            () => cache.invalidate('revenue_expense_trend'),
            () => cache.invalidate('business_insights'),
            () => cache.invalidate('exec_accounting'),
        ])

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error voiding ledger entry: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to void ledger entry')
    }
}

export async function restoreLedgerEntry(
    id: string
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied — requires accounting_access flag')
    }

    if (user.role !== 'admin') {
        return failure('Unauthorized: only admin users can restore entries')
    }

    try {
        const existing = await db
            .select()
            .from(generalLedger)
            .where(eq(generalLedger.id, id))
            .limit(1)

        if (existing.length === 0) {
            return failure('Entry not found')
        }

        if (!existing[0].isVoided) {
            return failure('Entry is not voided — nothing to restore')
        }

        const lockResult = await getAccountingPeriodLock()
        if (lockResult.success && lockResult.data) {
            const { locked_until } = lockResult.data
            if (locked_until && new Date(existing[0].entryDate) <= new Date(locked_until)) {
                return failure('Cannot restore entry: this accounting period is locked')
            }
        }

        if (existing[0].sourceType && existing[0].sourceId) {
            const conflictCheck = await db
                .select({ id: generalLedger.id })
                .from(generalLedger)
                .where(and(
                    eq(generalLedger.sourceType, existing[0].sourceType),
                    eq(generalLedger.sourceId, existing[0].sourceId),
                    eq(generalLedger.isVoided, false)
                ))
                .limit(1)

            if (conflictCheck.length > 0) {
                return failure('Cannot restore: a non-voided entry already exists for this source. Void the current entry first, then restore this one.')
            }
        }

        await db
            .update(generalLedger)
            .set({
                isVoided: false,
                voidedAt: null,
                voidedBy: null,
                voidReason: null,
                updatedAt: new Date(),
                updatedBy: user.id,
            })
            .where(eq(generalLedger.id, id))

        await firePostPersistSideEffects([
            () => createLogs({
                logs: [{
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Ledger entry restored: ${id} by ${user.id}`,
                }],
            }),
            () => revalidatePath('/accounting'),
            () => cache.invalidate('financial_metrics'),
            () => cache.invalidate('net_income'),
            () => cache.invalidate('ledger_summary'),
            () => cache.invalidate('revenue_trend'),
            () => cache.invalidate('pl_metrics'),
            () => cache.invalidate('expense_breakdown'),
            () => cache.invalidate('revenue_expense_trend'),
            () => cache.invalidate('business_insights'),
            () => cache.invalidate('exec_accounting'),
        ])

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error restoring ledger entry: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to restore ledger entry')
    }
}

export async function hardDeleteLedgerEntry(
    id: string
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user || user.role !== 'admin') {
        return failure('Unauthorized: admin access required')
    }
    // Hard delete remains admin-only regardless of flags

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        // Check if entry exists
        const existing = await db
            .select()
            .from(generalLedger)
            .where(eq(generalLedger.id, id))
            .limit(1)

        if (existing.length === 0) {
            return failure('Entry not found')
        }

        if (!existing[0].isVoided) {
            return failure('Entry must be voided before permanent deletion')
        }

        // Check if period is locked
        const lockResult = await getAccountingPeriodLock()
        if (lockResult.success && lockResult.data) {
            const { locked_until } = lockResult.data
            if (locked_until && new Date(existing[0].entryDate) <= new Date(locked_until)) {
                return failure('Cannot permanently delete: this accounting period is locked')
            }
        }

        // Log BEFORE deletion so we have the audit trail
        await firePostPersistSideEffects([
            () => createLogs({
                logs: [{
                    level: 'WARN',
                    type: 'ACCOUNTING',
                    message: `Ledger entry PERMANENTLY DELETED: ${id} (${existing[0].description}) by ${user.id}`,
                }],
            }),
            () => revalidatePath('/accounting'),
            () => cache.invalidate('financial_metrics'),
            () => cache.invalidate('net_income'),
            () => cache.invalidate('ledger_summary'),
            () => cache.invalidate('revenue_trend'),
            () => cache.invalidate('pl_metrics'),
            () => cache.invalidate('expense_breakdown'),
            () => cache.invalidate('revenue_expense_trend'),
            () => cache.invalidate('business_insights'),
            () => cache.invalidate('exec_accounting'),
        ])

        await db
            .delete(generalLedger)
            .where(eq(generalLedger.id, id))

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error permanently deleting ledger entry: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to permanently delete ledger entry')
    }
}

export interface LedgerSummary {
    total_debit: number
    total_credit: number
    balance: number // Keep for backward compat (raw debit - credit)
    revenue: number // NEW: total revenue (credit - debit for REVENUE entries)
    expenses: number // NEW: total expenses (debit - credit for EXPENSE entries)
    net_income: number // NEW: revenue - expenses
    by_type: {
        type: LedgerEntryType
        debit: number
        credit: number
    }[]
    by_payment_method: {
        method: string | null
        method_label: string
        debit: number
        credit: number
        count: number
    }[]
}

export async function getLedgerSummary(
    datePreset?: DateRangePreset,
    startDate?: string,
    endDate?: string,
    branchId?: string,
    filters?: {
        entry_type?: LedgerEntryType
        category?: string
        payment_method?: AccountingPaymentMethod
    }
): Promise<ActionResponse<LedgerSummary>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Unauthorized')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        // Build date range
        let dateFrom: Date | undefined
        let dateTo: Date | undefined

        if (datePreset && datePreset !== 'all') {
            const dateRange = getDateRangeFromPreset(datePreset, startDate, endDate)
            if (dateRange) {
                dateFrom = dateRange.start
                dateTo = dateRange.end
            }
        } else if (startDate && endDate) {
            const parsedStart = safeToDate(startDate, null)
            const parsedEnd = safeToDate(endDate, null)
            if (!parsedStart || !parsedEnd) {
                return failure('Invalid date range provided')
            }
            dateFrom = parsedStart
            dateTo = parsedEnd
        }

        // Build base conditions (exclude voided)
        const conditions: SQL<unknown>[] = [eq(generalLedger.isVoided, false)]

        if (dateFrom) {
            conditions.push(gte(generalLedger.entryDate, dateFrom))
        }

        if (dateTo) {
            conditions.push(lte(generalLedger.entryDate, dateTo))
        }

        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        if (filters?.entry_type) {
            conditions.push(eq(generalLedger.entryType, filters.entry_type))
        }

        if (filters?.category) {
            conditions.push(eq(generalLedger.category, filters.category))
        }

        if (filters?.payment_method) {
            conditions.push(eq(generalLedger.paymentMethod, filters.payment_method))
        }

        const whereClause = and(...conditions)

        // Get totals
        const totalsResult = await db
            .select({
                totalDebit: sql<number>`SUM(CAST(${generalLedger.debit} AS NUMERIC))`,
                totalCredit: sql<number>`SUM(CAST(${generalLedger.credit} AS NUMERIC))`,
            })
            .from(generalLedger)
            .where(whereClause)

        // Get breakdown by type
        const byTypeResult = await db
            .select({
                type: generalLedger.entryType,
                debit: sql<number>`SUM(CAST(${generalLedger.debit} AS NUMERIC))`,
                credit: sql<number>`SUM(CAST(${generalLedger.credit} AS NUMERIC))`,
            })
            .from(generalLedger)
            .where(whereClause)
            .groupBy(generalLedger.entryType)

        // Get breakdown by payment method
        const byMethodResult = await db
            .select({
                method: generalLedger.paymentMethod,
                debit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
                credit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
                count: count(),
            })
            .from(generalLedger)
            .where(whereClause)
            .groupBy(generalLedger.paymentMethod)

        const totalDebit = Number(totalsResult[0]?.totalDebit || 0)
        const totalCredit = Number(totalsResult[0]?.totalCredit || 0)

        // Compute revenue and expenses from by_type breakdown
        let revenue = 0
        let expenses = 0
        byTypeResult.forEach((row) => {
            const debit = Number(row.debit || 0)
            const credit = Number(row.credit || 0)
            if (row.type === 'REVENUE') {
                revenue += credit - debit
            } else if (row.type === 'EXPENSE') {
                expenses += debit - credit
            }
        })

        const summary: LedgerSummary = {
            total_debit: totalDebit,
            total_credit: totalCredit,
            balance: totalDebit - totalCredit,
            revenue,
            expenses,
            net_income: revenue - expenses,
            by_type: byTypeResult.map((row) => ({
                type: row.type as LedgerEntryType,
                debit: Number(row.debit || 0),
                credit: Number(row.credit || 0),
            })),
            by_payment_method: byMethodResult.map((row) => ({
                method: row.method || null,
                method_label: getAccountingPaymentMethodLabel(row.method),
                debit: Number(row.debit || 0),
                credit: Number(row.credit || 0),
                count: Number(row.count || 0),
            })),
        }

        return success(summary)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error fetching ledger summary: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to fetch ledger summary')
    }
}

export async function getLedgerDetailBreakdown(
    datePreset?: DateRangePreset,
    startDate?: string,
    endDate?: string,
    branchId?: string,
    filters?: {
        entry_type?: LedgerEntryType
        category?: string
        payment_method?: AccountingPaymentMethod
    }
): Promise<ActionResponse<LedgerDetailBreakdown>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Unauthorized')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        let dateFrom: Date | undefined
        let dateTo: Date | undefined

        if (datePreset && datePreset !== 'all') {
            const dateRange = getDateRangeFromPreset(datePreset, startDate, endDate)
            if (dateRange) {
                dateFrom = dateRange.start
                dateTo = dateRange.end
            }
        } else if (startDate && endDate) {
            const parsedStart = safeToDate(startDate, null)
            const parsedEnd = safeToDate(endDate, null)
            if (!parsedStart || !parsedEnd) {
                return failure('Invalid date range provided')
            }
            dateFrom = parsedStart
            dateTo = parsedEnd
        }

        const conditions: SQL<unknown>[] = [eq(generalLedger.isVoided, false)]

        if (dateFrom) conditions.push(gte(generalLedger.entryDate, dateFrom!))
        if (dateTo) conditions.push(lte(generalLedger.entryDate, dateTo!))
        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }
        if (filters?.entry_type) conditions.push(eq(generalLedger.entryType, filters.entry_type))
        if (filters?.category) conditions.push(eq(generalLedger.category, filters.category))
        if (filters?.payment_method) conditions.push(eq(generalLedger.paymentMethod, filters.payment_method))

        const whereClause = and(...conditions)

        const results = await db
            .select({
                method: generalLedger.paymentMethod,
                category: generalLedger.category,
                entryType: generalLedger.entryType,
                debit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
                credit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
                count: count(),
            })
            .from(generalLedger)
            .where(whereClause)
            .groupBy(generalLedger.paymentMethod, generalLedger.category, generalLedger.entryType)

        const methodMap = new Map<string, PaymentMethodCategoryBreakdown>()

        for (const row of results) {
            const methodKey = row.method || 'UNSPECIFIED'
            const methodLabel = row.method ? getAccountingPaymentMethodLabel(row.method) : 'Unspecified'
            const rowDebit = Number(row.debit || 0)
            const rowCredit = Number(row.credit || 0)

            if (!methodMap.has(methodKey)) {
                methodMap.set(methodKey, {
                    method: methodKey,
                    method_label: methodLabel,
                    total_debit: 0,
                    total_credit: 0,
                    net: 0,
                    count: 0,
                    categories: [],
                })
            }

            const methodData = methodMap.get(methodKey)!
            methodData.total_debit += rowDebit
            methodData.total_credit += rowCredit
            methodData.net += rowDebit - rowCredit
            methodData.count += Number(row.count)

            methodData.categories.push({
                category: row.category || 'Uncategorized',
                entry_type: row.entryType as LedgerEntryType,
                total_debit: rowDebit,
                total_credit: rowCredit,
                net: rowDebit - rowCredit,
                count: Number(row.count),
            })
        }

        const breakdown: LedgerDetailBreakdown = {
            by_payment_method: Array.from(methodMap.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
        }

        return success(breakdown)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error fetching ledger detail breakdown: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to fetch ledger detail breakdown')
    }
}

export interface TrialBalanceRow {
    type: LedgerEntryType
    category: string
    total_debit: number
    total_credit: number
}

export async function getTrialBalance(
    datePreset?: DateRangePreset,
    startDate?: string,
    endDate?: string,
    branchId?: string
): Promise<ActionResponse<TrialBalanceRow[]>> {
    const user = await getCurrentUser()
    if (!user) return failure('Unauthorized')

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) return failure('Access denied')

    try {
        let dateFrom: Date | undefined
        let dateTo: Date | undefined

        if (datePreset && datePreset !== 'all') {
            const dateRange = getDateRangeFromPreset(datePreset, startDate, endDate)
            if (dateRange) {
                dateFrom = dateRange.start
                dateTo = dateRange.end
            }
        } else if (startDate && endDate) {
            const parsedStart = safeToDate(startDate, null)
            const parsedEnd = safeToDate(endDate, null)
            if (!parsedStart || !parsedEnd) {
                return failure('Invalid date range provided')
            }
            dateFrom = parsedStart
            dateTo = parsedEnd
        }

        const conditions: SQL<unknown>[] = [eq(generalLedger.isVoided, false)]
        if (dateFrom) conditions.push(gte(generalLedger.entryDate, dateFrom!))
        if (dateTo) conditions.push(lte(generalLedger.entryDate, dateTo!))
        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        const results = await db
            .select({
                type: generalLedger.entryType,
                category: generalLedger.category,
                debit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
                credit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
            })
            .from(generalLedger)
            .where(and(...conditions))
            .groupBy(generalLedger.entryType, generalLedger.category)

        const rows: TrialBalanceRow[] = results.map((row) => ({
            type: row.type as LedgerEntryType,
            category: row.category || 'Uncategorized',
            total_debit: Number(row.debit || 0),
            total_credit: Number(row.credit || 0),
        }))

        return success(rows)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error fetching trial balance: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to fetch trial balance')
    }
}

export interface ExportLedgerOptions {
    exportType: LedgerExportType
    format: 'csv' | 'excel' | 'pdf'
    datePreset?: DateRangePreset
    startDate?: string
    endDate?: string
    filters?: LedgerFilters
}

export async function exportLedger(options: ExportLedgerOptions): Promise<ActionResponse<ExportResult>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Unauthorized')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const { filters, datePreset, startDate, endDate } = options

        let dateFrom: Date | undefined
        let dateTo: Date | undefined

        if (datePreset && datePreset !== 'all') {
            const dateRange = getDateRangeFromPreset(datePreset, startDate, endDate)
            if (dateRange) {
                dateFrom = dateRange.start
                dateTo = dateRange.end
            }
        } else if (startDate && endDate) {
            const parsedStart = safeToDate(startDate, null)
            const parsedEnd = safeToDate(endDate, null)
            if (!parsedStart || !parsedEnd) {
                return failure('Invalid date range provided')
            }
            dateFrom = parsedStart
            dateTo = parsedEnd
        }

        const conditions: ReturnType<typeof and>[] = [eq(generalLedger.isVoided, false)]

        switch (options.exportType) {
            case 'CASH_RECEIPTS':
                conditions.push(eq(generalLedger.entryType, 'REVENUE'))
                break
            case 'CASH_DISBURSEMENTS':
                conditions.push(eq(generalLedger.entryType, 'EXPENSE'))
                break
            case 'SALES':
                conditions.push(eq(generalLedger.sourceType, 'TRANSACTION'))
                break
            case 'PURCHASES':
                conditions.push(eq(generalLedger.sourceType, 'INVENTORY'))
                break
            case 'GENERAL_LEDGER':
            default:
                break
        }

        if (filters?.entry_type) {
            conditions.push(eq(generalLedger.entryType, filters.entry_type))
        }

        if (filters?.category) {
            conditions.push(eq(generalLedger.category, filters.category))
        }

        if (dateFrom) {
            conditions.push(gte(generalLedger.entryDate, dateFrom))
        }

        if (dateTo) {
            conditions.push(lte(generalLedger.entryDate, dateTo))
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined

        const sortByPaymentMethod = options.exportType === 'BY_PAYMENT_METHOD'

        const entries = sortByPaymentMethod
            ? await db
                .select({
                    id: generalLedger.id,
                    entryDate: generalLedger.entryDate,
                    entryType: generalLedger.entryType,
                    category: generalLedger.category,
                    description: generalLedger.description,
                    reference: generalLedger.reference,
                    debit: generalLedger.debit,
                    credit: generalLedger.credit,
                    sourceType: generalLedger.sourceType,
                    paymentMethod: generalLedger.paymentMethod,
                    branchId: generalLedger.branchId,
                })
                .from(generalLedger)
                .where(whereClause || sql`TRUE`)
                .orderBy(asc(generalLedger.paymentMethod), asc(generalLedger.entryDate))
            : await db
                .select({
                    id: generalLedger.id,
                    entryDate: generalLedger.entryDate,
                    entryType: generalLedger.entryType,
                    category: generalLedger.category,
                    description: generalLedger.description,
                    reference: generalLedger.reference,
                    debit: generalLedger.debit,
                    credit: generalLedger.credit,
                    sourceType: generalLedger.sourceType,
                    paymentMethod: generalLedger.paymentMethod,
                    branchId: generalLedger.branchId,
                })
                .from(generalLedger)
                .where(whereClause || sql`TRUE`)
                .orderBy(desc(generalLedger.entryDate))

        let runningBalance = 0
        const transformedEntries: LedgerExportRow[] = entries.map((entry) => {
            runningBalance += Number(entry.debit) - Number(entry.credit)
            return {
                id: entry.id,
                date: safeFormatDate(entry.entryDate, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                }),
                type: entry.entryType,
                payment_method: getAccountingPaymentMethodLabel(entry.paymentMethod as AccountingPaymentMethod | undefined),
                category: entry.category || 'Uncategorized',
                description: entry.description,
                reference: entry.reference || '',
                debit: Number(entry.debit),
                credit: Number(entry.credit),
                balance: runningBalance,
                source: entry.sourceType || 'MANUAL',
                branch: 'Shared',
                branchCode: '',
            }
        })

        const scope: GroupedExportOptions['scope'] = {
            type: options.exportType as 'GENERAL_LEDGER' | 'CASH_RECEIPTS' | 'CASH_DISBURSEMENTS' | 'SALES' | 'PURCHASES',
            datePreset,
            startDate,
            endDate,
            filters,
        }

        const exportOptions: GroupedExportOptions = {
            format: options.format === 'excel' ? 'xlsx' : options.format,
            grouping: {
                dimensions: [],
                includeSummary: false,
                includeCharts: false,
            },
            scope,
            title: 'Ledger Report',
            subtitle: '',
            generatedAt: new Date().toISOString(),
        }

        const result = await generateGroupedLedgerExport(transformedEntries, exportOptions)
        return success(result)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error exporting ledger: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to export ledger')
    }
}

export interface ExportGroupedLedgerOptions {
    format: ExportFormat
    grouping: GroupingConfig
    datePreset?: DateRangePreset
    startDate?: string
    endDate?: string
    filters?: LedgerFilters
}

export async function exportGroupedLedger(
    options: ExportGroupedLedgerOptions
): Promise<ActionResponse<ExportResult>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Unauthorized')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const { grouping, datePreset, startDate, endDate, filters } = options

        let dateFrom: Date | undefined
        let dateTo: Date | undefined

        if (datePreset && datePreset !== 'all') {
            const dateRange = getDateRangeFromPreset(datePreset, startDate, endDate)
            if (dateRange) {
                dateFrom = dateRange.start
                dateTo = dateRange.end
            }
        } else if (startDate && endDate) {
            const parsedStart = safeToDate(startDate, null)
            const parsedEnd = safeToDate(endDate, null)
            if (!parsedStart || !parsedEnd) {
                return failure('Invalid date range provided')
            }
            dateFrom = parsedStart
            dateTo = parsedEnd
        }

        const conditions: ReturnType<typeof and>[] = [eq(generalLedger.isVoided, false)]

        if (filters?.entry_type) {
            conditions.push(eq(generalLedger.entryType, filters.entry_type))
        }

        if (filters?.category) {
            conditions.push(eq(generalLedger.category, filters.category))
        }

        if (filters?.payment_method) {
            conditions.push(eq(generalLedger.paymentMethod, filters.payment_method))
        }

        if (filters?.include_voided === false) {
            conditions.push(eq(generalLedger.isVoided, false))
        } else if (filters?.include_voided === true) {
            // include voided - don't add the condition
        }

        if (dateFrom) {
            conditions.push(gte(generalLedger.entryDate, dateFrom))
        }

        if (dateTo) {
            conditions.push(lte(generalLedger.entryDate, dateTo))
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined

        const entries = await db
            .select({
                id: generalLedger.id,
                createdAt: generalLedger.createdAt,
                entryDate: generalLedger.entryDate,
                entryType: generalLedger.entryType,
                category: generalLedger.category,
                description: generalLedger.description,
                reference: generalLedger.reference,
                debit: generalLedger.debit,
                credit: generalLedger.credit,
                sourceType: generalLedger.sourceType,
                sourceId: generalLedger.sourceId,
                createdBy: generalLedger.createdBy,
                updatedAt: generalLedger.updatedAt,
                updatedBy: generalLedger.updatedBy,
                proofUrl: generalLedger.proofUrl,
                isVoided: generalLedger.isVoided,
                voidedAt: generalLedger.voidedAt,
                voidedBy: generalLedger.voidedBy,
                voidReason: generalLedger.voidReason,
                branchId: generalLedger.branchId,
                paymentMethod: generalLedger.paymentMethod,
                branchName: branches.name,
                branchCode: branches.code,
            })
            .from(generalLedger)
            .leftJoin(branches, eq(generalLedger.branchId, branches.id))
            .where(whereClause || sql`TRUE`)
            .orderBy(desc(generalLedger.entryDate))

        let runningBalance = 0
        const transformedEntries: LedgerExportRow[] = entries.map((entry) => {
            runningBalance += Number(entry.debit) - Number(entry.credit)
            return {
                id: entry.id,
                date: safeFormatDate(entry.entryDate, {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                }),
                type: entry.entryType,
                payment_method: getAccountingPaymentMethodLabel(entry.paymentMethod as AccountingPaymentMethod | undefined),
                category: entry.category || 'Uncategorized',
                description: entry.description,
                reference: entry.reference || '',
                debit: Number(entry.debit),
                credit: Number(entry.credit),
                balance: runningBalance,
                source: entry.sourceType || 'MANUAL',
                branch: entry.branchName || 'Shared',
                branchCode: entry.branchCode || '',
            }
        })

        const branchList: BranchInfo[] = entries
            .filter((e) => e.branchId)
            .map((e) => ({
                id: e.branchId,
                name: e.branchName || '',
                code: e.branchCode || '',
            }))
            .filter((b, idx, arr) => arr.findIndex((x) => x.id === b.id) === idx)

        const scope: GroupedExportOptions['scope'] = {
            type: 'GENERAL_LEDGER',
            datePreset,
            startDate,
            endDate,
            filters,
        }

        const exportOptions: GroupedExportOptions = {
            format: options.format,
            grouping,
            scope,
            title: 'Grouped Ledger Report',
            subtitle: grouping.dimensions.join(', '),
            generatedAt: new Date().toISOString(),
        }

        const result = await generateGroupedLedgerExport(transformedEntries, exportOptions, branchList)
        return success(result)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error exporting grouped ledger: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to export grouped ledger')
    }
}

// ============================================================================
// Category Management
// ============================================================================

export interface AccountingCategory {
    id: string
    name: string
    type: LedgerEntryType
    is_active: boolean
    created_at: Date
    updated_at?: Date
}

export interface CreateCategoryPayload {
    name: string
    type: LedgerEntryType
}

export interface UpdateCategoryPayload {
    name?: string
    type?: LedgerEntryType
}

export async function getAccountingCategories(
    includeInactive: boolean = false
): Promise<ActionResponse<AccountingCategory[]>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Unauthorized')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Forbidden')
    }

    try {
        const conditions: ReturnType<typeof and>[] = []

        if (!includeInactive) {
            conditions.push(eq(accountingCategory.isActive, true))
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined

        const categories = await db
            .select()
            .from(accountingCategory)
            .where(whereClause || sql`TRUE`)
            .orderBy(asc(accountingCategory.name))

        return success(categories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            type: cat.type as LedgerEntryType,
            is_active: cat.isActive,
            created_at: cat.createdAt,
            updated_at: cat.updatedAt || undefined,
        })))
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error fetching accounting categories: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to fetch accounting categories')
    }
}

export async function getAccountingCategory(
    id: string
): Promise<ActionResponse<AccountingCategory>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Unauthorized')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const categories = await db
            .select()
            .from(accountingCategory)
            .where(eq(accountingCategory.id, id))
            .limit(1)

        if (categories.length === 0) {
            return failure('Category not found')
        }

        const cat = categories[0]
        return success({
            id: cat.id,
            name: cat.name,
            type: cat.type as LedgerEntryType,
            is_active: cat.isActive,
            created_at: cat.createdAt,
            updated_at: cat.updatedAt || undefined,
        })
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error fetching accounting category: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to fetch category')
    }
}

export async function createAccountingCategory(
    payload: CreateCategoryPayload
): Promise<ActionResponse<AccountingCategory>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Unauthorized')
    }

    const admin = await isAdmin(user)
    if (!admin) {
        return failure('Admin access required')
    }

    try {
        // Validation
        const sanitizedName = sanitizeText(payload.name)
        if (!sanitizedName) {
            return failure('Category name is required')
        }

        if (!payload.type) {
            return failure('Category type is required')
        }

        // Check for duplicate name (case-insensitive)
        const existing = await db
            .select()
            .from(accountingCategory)
            .where(sql`LOWER(${accountingCategory.name}) = LOWER(${sanitizedName})`)
            .limit(1)

        if (existing.length > 0) {
            return failure('A category with this name already exists')
        }

        const [category] = await db
            .insert(accountingCategory)
            .values({
                name: sanitizedName,
                type: payload.type,
                isActive: true,
            })
            .returning()

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Accounting category created: ${category.name} (${category.id}) by ${user.id}`,
                },
            ],
        })

        return success({
            id: category.id,
            name: category.name,
            type: category.type as LedgerEntryType,
            is_active: category.isActive,
            created_at: category.createdAt,
            updated_at: category.updatedAt || undefined,
        })
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error creating accounting category: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to create category')
    }
}

export async function updateAccountingCategory(
    id: string,
    payload: UpdateCategoryPayload
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Unauthorized')
    }

    const admin = await isAdmin(user)
    if (!admin) {
        return failure('Admin access required')
    }

    try {
        // Check if category exists
        const existing = await db
            .select()
            .from(accountingCategory)
            .where(eq(accountingCategory.id, id))
            .limit(1)

        if (existing.length === 0) {
            return failure('Category not found')
        }

        // Check for duplicate name if updating name
        if (payload.name) {
            const sanitizedName = sanitizeText(payload.name)
            if (!sanitizedName) {
                return failure('Category name is required')
            }

            const duplicate = await db
                .select()
                .from(accountingCategory)
                .where(
                    and(
                        sql`LOWER(${accountingCategory.name}) = LOWER(${sanitizedName})`,
                        sql`${accountingCategory.id} != ${id}`
                    )
                )
                .limit(1)

            if (duplicate.length > 0) {
                return failure('A category with this name already exists')
            }
        }

        const updateData: Partial<typeof accountingCategory.$inferInsert> = {
            updatedAt: new Date(),
        }

        if (payload.name) updateData.name = sanitizeText(payload.name)
        if (payload.type) updateData.type = payload.type

        await db.update(accountingCategory).set(updateData).where(eq(accountingCategory.id, id))

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Accounting category updated: ${id} by ${user.id}`,
                },
            ],
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error updating accounting category: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to update category')
    }
}

export async function archiveAccountingCategory(
    id: string
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Unauthorized')
    }

    const admin = await isAdmin(user)
    if (!admin) {
        return failure('Admin access required')
    }

    try {
        // Check if category exists
        const existing = await db
            .select()
            .from(accountingCategory)
            .where(eq(accountingCategory.id, id))
            .limit(1)

        if (existing.length === 0) {
            return failure('Category not found')
        }

        if (!existing[0].isActive) {
            return failure('Category is already archived')
        }

        await db
            .update(accountingCategory)
            .set({
                isActive: false,
                updatedAt: new Date(),
            })
            .where(eq(accountingCategory.id, id))

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Accounting category archived: ${id} by ${user.id}`,
                },
            ],
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error archiving accounting category: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to archive category')
    }
}

export async function restoreAccountingCategory(
    id: string
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Unauthorized')
    }

    const admin = await isAdmin(user)
    if (!admin) {
        return failure('Admin access required')
    }

    try {
        // Check if category exists
        const existing = await db
            .select()
            .from(accountingCategory)
            .where(eq(accountingCategory.id, id))
            .limit(1)

        if (existing.length === 0) {
            return failure('Category not found')
        }

        if (existing[0].isActive) {
            return failure('Category is already active')
        }

        await db
            .update(accountingCategory)
            .set({
                isActive: true,
                updatedAt: new Date(),
            })
            .where(eq(accountingCategory.id, id))

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Accounting category restored: ${id} by ${user.id}`,
                },
            ],
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error restoring accounting category: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to restore category')
    }
}

// Legacy function for backward compatibility
export async function getLedgerCategories(): Promise<string[]> {
    const result = await getAccountingCategories()
    if (!result.success) {
        return []
    }
    const activeCategories = result.data.filter((c) => c.is_active)
    // Deduplicate by name (case-insensitive)
    const seen = new Set<string>()
    return activeCategories.filter((c) => {
        const lowerName = c.name.toLowerCase()
        if (seen.has(lowerName)) {
            return false
        }
        seen.add(lowerName)
        return true
    }).map((c) => c.name)
}

// ============================================================================
// REPORT TREND DATA TYPES
// ============================================================================

export interface TrendDataPoint {
  period: string
  revenue: number
  expenses: number
  net_income: number
}

export interface TrendQueryOptions {
  datePreset?: DateRangePreset
  startDate?: string
  endDate?: string
  branchId?: string
}

export async function getRevenueExpenseTrend(
  options: TrendQueryOptions = {}
): Promise<ActionResponse<TrendDataPoint[]>> {
  const user = await getCurrentUser()
  if (!user) return failure('Unauthorized')

  const hasAccess = await canAccessAccounting(user)
  if (!hasAccess) return failure('Access denied')

  // Check analytics flag
  const isAdmin = user.role === 'admin'
  const hasAnalyticsFlag = user.access_flags?.includes('accounting_analytics_view') ?? false
  if (!isAdmin && !hasAnalyticsFlag) {
    return failure('Access denied — requires accounting_analytics_view flag')
  }

  try {
    const { datePreset, startDate, endDate, branchId } = options

    let dateFrom: Date | undefined
    let dateTo: Date | undefined

    if (datePreset && datePreset !== 'all') {
      const dateRange = getDateRangeFromPreset(datePreset, startDate, endDate)
      if (dateRange) {
        dateFrom = dateRange.start
        dateTo = dateRange.end
      }
    } else if (startDate && endDate) {
      const parsedStart = safeToDate(startDate, null)
      const parsedEnd = safeToDate(endDate, null)
      if (!parsedStart || !parsedEnd) {
        return failure('Invalid date range provided')
      }
      dateFrom = parsedStart
      dateTo = parsedEnd
    }

    // Determine granularity based on date range
    const now = new Date()
    const effectiveStart = dateFrom || new Date(now.getFullYear() - 1, 0, 1)
    const effectiveEnd = dateTo || now
    const daysDiff = Math.ceil(
      (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)
    )

    const conditions: SQL<unknown>[] = [eq(generalLedger.isVoided, false)]

    if (dateFrom) conditions.push(gte(generalLedger.entryDate, dateFrom))
    if (dateTo) conditions.push(lte(generalLedger.entryDate, dateTo))
    if (branchId) {
      const branchFilter = or(eq(generalLedger.branchId, branchId), isNull(generalLedger.branchId))
      if (branchFilter) conditions.push(branchFilter)
    }

    const allEntries = await db
      .select({
        entryDate: generalLedger.entryDate,
        entryType: generalLedger.entryType,
        debit: generalLedger.debit,
        credit: generalLedger.credit,
      })
      .from(generalLedger)
      .where(and(...conditions))
      .orderBy(asc(generalLedger.entryDate))

    // Group entries by period (day/week/month) in application code
    const periodMap = new Map<string, { revenue: number; expenses: number }>()

    for (const entry of allEntries) {
      const date = new Date(entry.entryDate)
      let periodKey: string

      if (daysDiff > 90) {
        // Monthly: YYYY-MM
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      } else if (daysDiff > 31) {
        // Weekly: ISO week
        const startOfYear = new Date(date.getFullYear(), 0, 1)
        const weekNum = Math.ceil(
          ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
        )
        periodKey = `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
      } else {
        // Daily: YYYY-MM-DD
        periodKey = date.toISOString().split('T')[0]
      }

      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, { revenue: 0, expenses: 0 })
      }

      const group = periodMap.get(periodKey)!
      const debit = Number(entry.debit) || 0
      const credit = Number(entry.credit) || 0

      if (entry.entryType === 'REVENUE') {
        group.revenue += credit - debit
      } else if (entry.entryType === 'EXPENSE') {
        group.expenses += debit - credit
      }
    }

    const result: TrendDataPoint[] = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, values]) => ({
        period,
        revenue: Math.round(values.revenue * 100) / 100,
        expenses: Math.round(values.expenses * 100) / 100,
        net_income: Math.round((values.revenue - values.expenses) * 100) / 100,
      }))

    return success(result)
  } catch (error) {
    await logError({
      type: 'ACCOUNTING',
      message: `Error fetching revenue/expense trend: ${error instanceof Error ? error.message : String(error)}`,
    })
    return failure('Failed to fetch revenue/expense trend')
  }
}

export interface ExpenseBreakdownItem {
  category: string
  amount: number
}

export async function getExpenseBreakdown(
  options: TrendQueryOptions = {}
): Promise<ActionResponse<ExpenseBreakdownItem[]>> {
  const user = await getCurrentUser()
  if (!user) return failure('Unauthorized')

  const hasAccess = await canAccessAccounting(user)
  if (!hasAccess) return failure('Access denied')

  const isAdmin = user.role === 'admin'
  const hasAnalyticsFlag = user.access_flags?.includes('accounting_analytics_view') ?? false
  if (!isAdmin && !hasAnalyticsFlag) {
    return failure('Access denied — requires accounting_analytics_view flag')
  }

  try {
    const { datePreset, startDate, endDate, branchId } = options

    let dateFrom: Date | undefined
    let dateTo: Date | undefined

    if (datePreset && datePreset !== 'all') {
      const dateRange = getDateRangeFromPreset(datePreset, startDate, endDate)
      if (dateRange) { dateFrom = dateRange.start; dateTo = dateRange.end }
    } else if (startDate && endDate) {
      const parsedStart = safeToDate(startDate, null)
      const parsedEnd = safeToDate(endDate, null)
      if (!parsedStart || !parsedEnd) return failure('Invalid date range provided')
      dateFrom = parsedStart
      dateTo = parsedEnd
    }

    const conditions: SQL<unknown>[] = [
      eq(generalLedger.isVoided, false),
      eq(generalLedger.entryType, 'EXPENSE'),
    ]

    if (dateFrom) conditions.push(gte(generalLedger.entryDate, dateFrom))
    if (dateTo) conditions.push(lte(generalLedger.entryDate, dateTo))
    if (branchId) {
      const branchFilter = or(eq(generalLedger.branchId, branchId), isNull(generalLedger.branchId))
      if (branchFilter) conditions.push(branchFilter)
    }

    const results = await db
      .select({
        category: generalLedger.category,
        total: sql<number>`SUM(CAST(${generalLedger.debit} AS NUMERIC) - CAST(${generalLedger.credit} AS NUMERIC))`,
      })
      .from(generalLedger)
      .where(and(...conditions))
      .groupBy(generalLedger.category)
      .orderBy(desc(sql`SUM(CAST(${generalLedger.debit} AS NUMERIC) - CAST(${generalLedger.credit} AS NUMERIC))`))

    const breakdown: ExpenseBreakdownItem[] = results
      .map(row => ({
        category: row.category || 'Uncategorized',
        amount: Math.round(Math.abs(Number(row.total)) * 100) / 100,
      }))
      .filter(item => item.amount > 0)

    return success(breakdown)
  } catch (error) {
    await logError({
      type: 'ACCOUNTING',
      message: `Error fetching expense breakdown: ${error instanceof Error ? error.message : String(error)}`,
    })
    return failure('Failed to fetch expense breakdown')
  }
}

export interface CashFlowSummaryData {
  inflow: number
  outflow: number
  net: number
}

export async function getCashFlowSummary(
  options: TrendQueryOptions = {}
): Promise<ActionResponse<CashFlowSummaryData>> {
  const user = await getCurrentUser()
  if (!user) return failure('Unauthorized')

  const hasAccess = await canAccessAccounting(user)
  if (!hasAccess) return failure('Access denied')

  const isAdmin = user.role === 'admin'
  const hasAnalyticsFlag = user.access_flags?.includes('accounting_analytics_view') ?? false
  if (!isAdmin && !hasAnalyticsFlag) {
    return failure('Access denied — requires accounting_analytics_view flag')
  }

  try {
    const { datePreset, startDate, endDate, branchId } = options

    let dateFrom: Date | undefined
    let dateTo: Date | undefined

    if (datePreset && datePreset !== 'all') {
      const dateRange = getDateRangeFromPreset(datePreset, startDate, endDate)
      if (dateRange) { dateFrom = dateRange.start; dateTo = dateRange.end }
    } else if (startDate && endDate) {
      const parsedStart = safeToDate(startDate, null)
      const parsedEnd = safeToDate(endDate, null)
      if (!parsedStart || !parsedEnd) return failure('Invalid date range provided')
      dateFrom = parsedStart
      dateTo = parsedEnd
    }

    const baseConditions: SQL<unknown>[] = [eq(generalLedger.isVoided, false)]
    if (dateFrom) baseConditions.push(gte(generalLedger.entryDate, dateFrom))
    if (dateTo) baseConditions.push(lte(generalLedger.entryDate, dateTo))
    if (branchId) {
      const branchFilter = or(eq(generalLedger.branchId, branchId), isNull(generalLedger.branchId))
      if (branchFilter) baseConditions.push(branchFilter)
    }

    // Inflow: Revenue entries (credit - debit)
    const inflowConditions = [...baseConditions, eq(generalLedger.entryType, 'REVENUE')]
    const inflowResult = await db
      .select({
        total: sql<number>`SUM(CAST(${generalLedger.credit} AS NUMERIC) - CAST(${generalLedger.debit} AS NUMERIC))`,
      })
      .from(generalLedger)
      .where(and(...inflowConditions))

    // Outflow: Expense entries (debit - credit)
    const outflowConditions = [...baseConditions, eq(generalLedger.entryType, 'EXPENSE')]
    const outflowResult = await db
      .select({
        total: sql<number>`SUM(CAST(${generalLedger.debit} AS NUMERIC) - CAST(${generalLedger.credit} AS NUMERIC))`,
      })
      .from(generalLedger)
      .where(and(...outflowConditions))

    const inflow = Math.round((Number(inflowResult[0]?.total) || 0) * 100) / 100
    const outflow = Math.round((Number(outflowResult[0]?.total) || 0) * 100) / 100

    return success({
      inflow,
      outflow,
      net: Math.round((inflow - outflow) * 100) / 100,
    })
  } catch (error) {
    await logError({
      type: 'ACCOUNTING',
      message: `Error fetching cash flow summary: ${error instanceof Error ? error.message : String(error)}`,
    })
    return failure('Failed to fetch cash flow summary')
  }
}
