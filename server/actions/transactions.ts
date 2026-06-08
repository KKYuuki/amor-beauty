'use server'

import { eq, sql, desc, gte, lte, and, isNull, or, like, inArray } from 'drizzle-orm'

import { db } from '@/server/db'
import { transactions, transactionItems, transactionPayments } from '@/server/db/schema/transactions'
import { downpayments } from '@/server/db/schema/payroll'
import { branches } from '@/server/db/schema/branches'
import { inventory, generalLedger } from '@/server/db/schema'
import { withTransaction, type TransactionClient } from '@/server/db/transactions'
import { CreateTransactionPayload, VoidTransactionPayload, AddTransactionPaymentPayload, UpdateTransactionPayload, Transaction, PaymentMethod, TransactionStatus, PayrollError } from "@/utils/types/transactions"
import { mapTransactionToAccountingPaymentMethod, getTransactionPaymentMethodLabel, derivePrimaryPaymentMethod } from "@/utils/types/payment"
import { DateRangePreset } from "@/utils/date-utils"
import { ClientType } from '@/utils/types/payroll'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import { createExportResponse, ExportColumn } from '@/utils/export'
import { generateReceiptPdf } from '@/utils/receipt-pdf'
import { getCurrentUser, canAccessTransactions, canAccessSales, getUserById } from '@/utils/auth/permissions'
import { UserProfile } from '@/utils/types/auth'
import { sanitizeText, sanitizeMinimal } from '@/utils/sanitize'

import { createLogs, logError } from './logs'
import { createAutoLedgerEntry } from './accounting'
import { deriveSalesCategoryAndDescription } from "./accounting-ledger-utils"
import { calculateAndCreatePayrollEntry } from './payroll'

export type DateFilterPreset = DateRangePreset

export interface TransactionFilters {
    datePreset?: DateFilterPreset
    startDate?: string
    endDate?: string
    status?: 'COMPLETED' | 'PENDING' | 'PARTIAL' | 'VOIDED' | 'REFUNDED'
    branchId?: string
    search?: string
}

// ============================================================================
// CREATE TRANSACTION
// ============================================================================

export interface CreateTransactionResult {
    transaction: typeof transactions.$inferSelect
    payrollErrors?: PayrollError[]
}

export async function createTransaction(payload: CreateTransactionPayload): Promise<ActionResponse<CreateTransactionResult>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessSales(user)
    if (!hasAccess) {
        return failure('Sales access required')
    }

    // Validate branch exists if provided (outside transaction - read-only operation)
    if (payload.branch_id) {
        const [branch] = await db
            .select()
            .from(branches)
            .where(eq(branches.id, payload.branch_id))
            .limit(1)

        if (!branch) {
            return failure('Invalid branch ID')
        }
    }

    // Validate items exist and have sufficient stock
    if (!payload.items || payload.items.length === 0) {
        return failure('Transaction must have at least one item')
    }

    for (const item of payload.items) {
        if (item.inventory_id && !item.is_free) {
            const [inventoryItem] = await db
                .select()
                .from(inventory)
                .where(eq(inventory.id, item.inventory_id))
                .limit(1)

            if (!inventoryItem) {
                return failure(`Inventory item not found: ${item.item_name}`)
            }

            const currentStock = Number(inventoryItem.currentStock) || 0
            if (currentStock < item.quantity) {
                return failure(`Insufficient stock for ${item.item_name}. Available: ${currentStock}, Required: ${item.quantity}`)
            }
        }
    }

    // Validate payment amounts match total
    const expectedAmount = payload.total
    let paymentTotal = 0

    if (payload.payment_method === 'SPLIT' && payload.payments && payload.payments.length > 0) {
        paymentTotal = payload.payments.reduce((sum, p) => sum + p.amount, 0)
        if (!payload.balance_due && Math.abs(paymentTotal - expectedAmount) > 0.01) {
            return failure(`Split payment total (${paymentTotal}) must equal transaction total (${expectedAmount})`)
        }
    }

    // Validate amount paid doesn't exceed total (unless it's a partial payment)
    if (payload.amount_paid && !payload.balance_due && payload.amount_paid > expectedAmount + 0.01) {
        return failure('Amount paid cannot exceed transaction total')
    }

    // Validate discount amount doesn't exceed subtotal
    if (payload.discount_amount > payload.subtotal) {
        return failure('Discount amount cannot exceed subtotal')
    }

    // Look up staff name for enriched description
    let staffName: string | undefined
    if (payload.staff_id) {
        const staffProfile = await getUserById(payload.staff_id)
        if (staffProfile) {
            staffName = staffProfile.full_name
        }
    }

    const transactionResult = await withTransaction(async (tx) => {
        // Generate transaction number with branch code
        const transactionNumber = await generateTransactionNumberWithTx(tx, payload.branch_id)

        // Validate client_type consistency (non-blocking — logs warning only)
        if (payload.client_type && payload.items && payload.items.length > 0) {
            const hasServiceItems = payload.items.some((i: { service_type?: string }) => i.service_type && i.service_type !== 'MANUAL')
            if (!hasServiceItems) {
                await logError({
                    type: 'OTHER',
                    message: `Transaction ${transactionNumber}: client_type=${payload.client_type} but no service-type items found`,
                })
            }
        }

        // Create transaction
        const [newTransaction] = await tx
            .insert(transactions)
            .values({
                transactionNumber,
                buyerId: payload.buyer_id,
                buyerName: payload.buyer_name ? sanitizeText(payload.buyer_name) : null,
                customerPhone: payload.customer_phone ? sanitizeMinimal(payload.customer_phone) : null,
                customerEmail: payload.customer_email,
                staffId: payload.staff_id,
                branchId: payload.branch_id,
                subtotal: payload.subtotal.toString(),
                taxAmount: payload.tax_amount.toString(),
                discountAmount: payload.discount_amount.toString(),
                total: payload.total.toString(),
                adjustmentAmount: (payload.adjustment_amount ?? 0).toString(),
                amountPaid: (payload.amount_paid ?? payload.total).toString(),
                balanceDue: (payload.balance_due ?? 0).toString(),
                paymentMethod: payload.payment_method,
                cashReceived: payload.cash_received?.toString(),
                changeGiven: payload.change_given?.toString(),
                referenceNumber: payload.reference_number ? sanitizeMinimal(payload.reference_number) : null,
                status: payload.balance_due && payload.balance_due > 0 ? 'PARTIAL' : 'COMPLETED',
                
                notes: payload.notes ? sanitizeText(payload.notes) : null,
                salesDescription: payload.sales_description ? sanitizeText(payload.sales_description) : null,
                salesLabels: payload.sales_labels && payload.sales_labels.length > 0
                    ? payload.sales_labels.map(sl => ({ itemId: sl.itemId, label: sanitizeText(sl.label) }))
                    : null,
                clientType: payload.client_type || null,
                createdBy: user.id,
            })
            .returning()

        // Create transaction items and adjust inventory
        if (payload.items && payload.items.length > 0) {
            await tx
                .insert(transactionItems)
                .values(payload.items.map(item => ({
                    transactionId: newTransaction.id,
                    inventoryId: item.inventory_id,
                    serviceId: item.service_id,
                    artistId: item.artist_id || null,
                    itemName: sanitizeText(item.item_name),
                    itemLabel: item.item_label ? sanitizeText(item.item_label) : null,
                    quantity: item.quantity.toString(),
                    unitPrice: item.is_free ? '0' : item.unit_price.toString(),
                    lineTotal: (item.quantity * (item.is_free ? 0 : item.unit_price)).toString(),
                })))

            // Decrement inventory stock for items (skip free items - they're included with the service)
            for (const item of payload.items) {
                if (item.inventory_id && !item.is_free) {
                    const [inventoryItem] = await tx
                        .select({ currentStock: inventory.currentStock })
                        .from(inventory)
                        .where(eq(inventory.id, item.inventory_id))
                        .limit(1)

                    if (inventoryItem) {
                        const newStock = Math.max(0, Number(inventoryItem.currentStock) - item.quantity)
                        await tx
                            .update(inventory)
                            .set({ currentStock: String(newStock) })
                            .where(eq(inventory.id, item.inventory_id))
                    }
                }
            }
        }

        // Create split payments if applicable
        if (payload.payment_method === 'SPLIT' && payload.payments) {
            for (const payment of payload.payments) {
                await tx
                    .insert(transactionPayments)
                    .values({
                        transactionId: newTransaction.id,
                        amount: payment.amount.toString(),
                        paymentMethod: payment.payment_method,
                        referenceNumber: payment.reference_number,
                    })
            }
        }

        // Create downpayment record if applicable
        if (payload.downpayment_type) {
            const downpaymentAmount = payload.downpayment_amount ?? payload.amount_paid ?? payload.total

            // Validate downpayment amount
            if (downpaymentAmount <= 0) {
                throw new Error('Downpayment amount must be greater than zero')
            }
            if (downpaymentAmount > payload.total) {
                throw new Error('Downpayment amount must be less than the transaction total')
            }

            try {
                const { createDownpayment } = await import('./downpayments')
                await createDownpayment({
                    transaction_id: newTransaction.id,
                    amount: downpaymentAmount,
                    downpayment_type: payload.downpayment_type,
                    percentage_rate: payload.downpayment_percentage_rate,
                    estimated_total: payload.downpayment_estimated_total,
                    staff_id: payload.staff_id ?? undefined,
                    payroll_split_mode: payload.payroll_split_mode || 'PER_PAYMENT',
                }, tx)

                await tx
                    .update(transactions)
                    .set({
                        status: payload.staff_id ? 'DOWNPAYMENT_ASSIGNED' : 'DOWNPAYMENT_PENDING',
                    })
                    .where(eq(transactions.id, newTransaction.id))

                    // Create LIABILITY entry for the downpayment obligation (unearned revenue)
                    await createAutoLedgerEntry(
                        'TRANSACTION',
                        newTransaction.id,
                        {
                            entry_date: new Date(),
                            entry_type: 'LIABILITY',
                            category: 'UNEARNED_REVENUE',
                            description: `Downpayment received: ${transactionNumber}`,
                            reference: `DP-${transactionNumber}`,
                            debit: 0,
                            credit: downpaymentAmount,
                            branch_id: payload.branch_id,
                            payment_method: mapTransactionToAccountingPaymentMethod(
                                payload.payment_method === 'SPLIT'
                                    ? derivePrimaryPaymentMethod(payload.payments?.map(p => ({ payment_method: p.payment_method, amount: p.amount })) ?? [])
                                    : payload.payment_method
                            ),
                        },
                        user.id,
                        tx
                    )
            } catch (downpaymentError) {
                await logError({
                    type: 'PAYROLL',
                    message: `Failed to create downpayment for transaction ${transactionNumber}: ${downpaymentError instanceof Error ? downpaymentError.message : String(downpaymentError)}`
                })
            }
        }

        // --- Build enriched ledger description from service types ---
        const { category: enrichedCategory, description: enrichedDescription } = deriveSalesCategoryAndDescription(
            (payload.items || []).map(item => ({
                service_type: item.service_type,
                item_name: item.item_name || item.item_label || "Item",
                quantity: item.quantity || 1,
                unit_price: item.unit_price || 0,
            })),
            transactionNumber,
            payload.sales_description ? sanitizeText(payload.sales_description) : undefined,
            staffName
        )

        // Create accounting entries for the sale
        if (payload.payment_method === 'SPLIT' && payload.payments && payload.payments.length > 0) {
            // Create a separate ledger entry per split payment method
            for (const payment of payload.payments) {
                await createAutoLedgerEntry(
                    'TRANSACTION',
                    newTransaction.id,
                    {
                        entry_date: new Date(),
                        entry_type: 'REVENUE',
                        category: enrichedCategory,
                        description: `${enrichedDescription} (${getTransactionPaymentMethodLabel(payment.payment_method)})`,
                        reference: `${transactionNumber}-${payment.payment_method}`,
                        debit: 0,
                        credit: payment.amount,
                        branch_id: payload.branch_id,
                        payment_method: mapTransactionToAccountingPaymentMethod(payment.payment_method),
                    },
                    user.id,
                    tx
                )
            }
        } else {
            // Single payment method — credit the amount actually paid
            const creditAmount = payload.amount_paid ?? payload.total
            await createAutoLedgerEntry(
                'TRANSACTION',
                newTransaction.id,
                {
                    entry_date: new Date(),
                    entry_type: 'REVENUE',
                    category: enrichedCategory,
                    description: enrichedDescription,
                    reference: transactionNumber,
                    debit: 0,
                    credit: creditAmount,
                    branch_id: payload.branch_id,
                    payment_method: mapTransactionToAccountingPaymentMethod(payload.payment_method),
                },
                user.id,
                tx
            )
        }

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'OTHER',
                message: `Transaction created: ${transactionNumber}`,
            }]
        })

        return newTransaction
    }, { action: 'ACCOUNTING', userId: user.id })

    if (!transactionResult.success) {
        return failure(transactionResult.error)
    }

    const newTransaction = transactionResult.data

    // Derive primary payment method from the largest split payment
    const primaryPaymentMethod = payload.payment_method === 'SPLIT' && payload.payments
        ? payload.payments.reduce((prev, curr) => curr.amount > prev.amount ? curr : prev, payload.payments[0])?.payment_method
        : payload.payment_method

    // Create payroll entries for services (outside transaction to avoid poisoning)
    // Non-guarded — payroll is attempted for every service item after a completed sale
    const payrollErrors: PayrollError[] = []
    for (const item of payload.items) {
        if (item.service_id) {
            const performerId = item.artist_id || payload.staff_id
            if (!performerId) {
                // Service item with no artist assignment — skip payroll for this item
                payrollErrors.push({
                    serviceId: item.service_id,
                    error: 'No artist assigned — payroll entry not created'
                })
                continue
            }
            try {
                const payrollResult = await calculateAndCreatePayrollEntry({
                    transactionId: newTransaction.id,
                    serviceId: item.service_id,
                    staffId: performerId,
                    amount: item.quantity * item.unit_price,
                    quantity: item.quantity,
                    clientType: payload.client_type as ClientType | undefined,
                    serviceType: item.service_type,
                    paymentMethod: primaryPaymentMethod,
                })
                if (!payrollResult.success) {
                    payrollErrors.push({
                        serviceId: item.service_id,
                        error: payrollResult.error || 'Failed to create payroll entry'
                    })
                }
            } catch (payrollError) {
                const errorMessage = payrollError instanceof Error ? payrollError.message : 'Unknown payroll error'
                await logError({
                    type: 'PAYROLL',
                    message: `Failed to create payroll entry for transaction ${newTransaction.transactionNumber}: ${errorMessage}`
                })
                payrollErrors.push({
                    serviceId: item.service_id,
                    error: errorMessage
                })
            }
        }
    }

    return success({
        transaction: newTransaction,
        payrollErrors: payrollErrors.length > 0 ? payrollErrors : undefined
    })
}

export async function generateTransactionNumberWithTx(tx: TransactionClient, branchId?: string | null): Promise<string> {
    const date = new Date()
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
    
    // Get branch code if available
    let branchCode = 'TXN'
    if (branchId) {
        const [branch] = await tx
            .select()
            .from(branches)
            .where(eq(branches.id, branchId))
            .limit(1)
        if (branch) {
            branchCode = branch.code
        }
    }

    // Count transactions for today with this branch code
    const todayStart = new Date(date)
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(date)
    todayEnd.setHours(23, 59, 59, 999)

    const todayTransactions = await tx
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(and(
            branchId ? eq(transactions.branchId, branchId) : undefined,
            gte(transactions.createdAt, todayStart),
            lte(transactions.createdAt, todayEnd)
        ))

    const sequence = (Number(todayTransactions[0]?.count) ?? 0) + 1

    return `${branchCode}-${dateStr}-${sequence.toString().padStart(3, '0')}`
}

// ============================================================================
// GET TRANSACTIONS
// ============================================================================

function transformTransaction(
    dbTxn: typeof transactions.$inferSelect,
    staff?: UserProfile | null,
    buyer?: UserProfile | null,
    branch?: import('@/utils/types/branch').Branch | null,
): Transaction {
    return {
        id: dbTxn.id,
        created_at: dbTxn.createdAt.toISOString(),
        transaction_number: dbTxn.transactionNumber,
        buyer_id: dbTxn.buyerId || undefined,
        buyer_name: dbTxn.buyerName || undefined,
        customer_phone: dbTxn.customerPhone || undefined,
        customer_email: dbTxn.customerEmail || undefined,
        staff_id: dbTxn.staffId ?? null,
        staff: staff || undefined,
        buyer: buyer || undefined,
        branch_id: dbTxn.branchId ?? null,
        branch: branch || undefined,
        subtotal: Number(dbTxn.subtotal),
        tax_amount: Number(dbTxn.taxAmount),
        discount_amount: Number(dbTxn.discountAmount),
        total: Number(dbTxn.total),
        adjustment_amount: Number(dbTxn.adjustmentAmount) || 0,
        amount_paid: Number(dbTxn.amountPaid),
        balance_due: Number(dbTxn.balanceDue),
        payment_method: dbTxn.paymentMethod as PaymentMethod,
        cash_received: dbTxn.cashReceived ? Number(dbTxn.cashReceived) : undefined,
        change_given: dbTxn.changeGiven ? Number(dbTxn.changeGiven) : undefined,
        reference_number: dbTxn.referenceNumber || undefined,
        status: dbTxn.status as TransactionStatus,
        client_type: dbTxn.clientType as ClientType | undefined,
        notes: dbTxn.notes || undefined,
        sales_description: dbTxn.salesDescription || undefined,
        sales_labels: (dbTxn.salesLabels as Array<{ itemId: string; label: string }>) || undefined,
        voided_at: dbTxn.voidedAt?.toISOString(),
        voided_by: dbTxn.voidedBy || undefined,
        void_reason: dbTxn.voidReason || undefined,
    }
}

export interface GetTransactionsResult {
    data: Transaction[]
    total: number
    hasMore: boolean
}

export async function getTransactions(options?: {
    page?: number
    pageSize?: number
    filters?: TransactionFilters
}): Promise<ActionResponse<GetTransactionsResult>> {
    try {
        const { page = 1, pageSize = 50, filters } = options || {}
        const offset = (page - 1) * pageSize

        const whereConditions = []

        // Apply date filters
        if (filters?.startDate) {
            whereConditions.push(gte(transactions.createdAt, new Date(filters.startDate)))
        }
        if (filters?.endDate) {
            whereConditions.push(lte(transactions.createdAt, new Date(filters.endDate)))
        }

        // Apply status filter
        if (filters?.status) {
            whereConditions.push(eq(transactions.status, filters.status))
        }

        // Apply branch filter - include shared entries (null branchId) when filtering by branch
        if (filters?.branchId) {
            whereConditions.push(or(eq(transactions.branchId, filters.branchId), isNull(transactions.branchId)))
        }

        // Apply search filter
        if (filters?.search) {
            const searchTerm = `%${filters.search}%`
            whereConditions.push(
                or(
                    like(transactions.transactionNumber, searchTerm),
                    sql`${transactions.buyerName} ILIKE ${searchTerm}`
                )
            )
        }

        const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined

        // Get transactions
        const data = await db
            .select()
            .from(transactions)
            .where(whereClause)
            .orderBy(desc(transactions.createdAt))
            .limit(pageSize)
            .offset(offset)

        // Get total count
        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(transactions)
            .where(whereClause)

        const total = Number(countResult[0]?.count) ?? 0

        // Fetch staff, buyer, and branch data for all transactions
        const staffIds = [...new Set(data.map(t => t.staffId).filter(Boolean))]
        const buyerIds = [...new Set(data.map(t => t.buyerId).filter(Boolean))]
        const branchIds = [...new Set(data.map(t => t.branchId).filter(Boolean))]

        // Batch fetch users and branches
        const [staffMap, buyerMap, branchMap] = await Promise.all([
            Promise.all(staffIds.map(async (id) => ({ id, user: await getUserById(id!) }))).then(r => new Map(r.map(({ id, user }) => [id, user]))),
            Promise.all(buyerIds.map(async (id) => ({ id, user: await getUserById(id!) }))).then(r => new Map(r.map(({ id, user }) => [id, user]))),
            Promise.resolve(new Map()),
        ])

        const transformedData = data.map(t =>
            transformTransaction(
                t,
                t.staffId ? staffMap.get(t.staffId) ?? null : null,
                t.buyerId ? buyerMap.get(t.buyerId) ?? null : null,
                t.branchId ? branchMap.get(t.branchId) ?? null : null,
            )
        )

        return success({ 
            data: transformedData, 
            total, 
            hasMore: total > offset + data.length 
        })
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error fetching transactions: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch transactions')
    }
}

// ============================================================================
// GET TRANSACTION BY ID
// ============================================================================

export interface GetTransactionByIdResult {
    transaction: Transaction
    items: (typeof transactionItems.$inferSelect)[]
    payments: (typeof transactionPayments.$inferSelect)[]
}

export async function getTransactionById(id: string): Promise<ActionResponse<GetTransactionByIdResult | null>> {
    try {
        const [transaction] = await db
            .select()
            .from(transactions)
            .where(eq(transactions.id, id))
            .limit(1)

        if (!transaction) {
            return success(null)
        }

        // Get items
        const items = await db
            .select()
            .from(transactionItems)
            .where(eq(transactionItems.transactionId, id))

        // Get payments
        const payments = await db
            .select()
            .from(transactionPayments)
            .where(eq(transactionPayments.transactionId, id))

        // Get downpayment if exists
        const [downpayment] = await db
            .select()
            .from(downpayments)
            .where(eq(downpayments.transactionId, id))
            .limit(1)

        // Fetch staff, buyer, and branch data
        const [staff, buyer, branchData] = await Promise.all([
            transaction.staffId ? getUserById(transaction.staffId) : null,
            transaction.buyerId ? getUserById(transaction.buyerId) : null,
            null,
        ])

        const transformedTransaction = transformTransaction(
            transaction,
            staff,
            buyer,
            branchData,
        )

        if (downpayment) {
            transformedTransaction.downpayment = {
                id: downpayment.id,
                amount: Number(downpayment.amount),
                downpayment_type: downpayment.downpaymentType as 'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM',
                percentage_rate: downpayment.percentageRate ? Number(downpayment.percentageRate) : null,
                estimated_total: downpayment.estimatedTotal ? Number(downpayment.estimatedTotal) : null,
                payroll_split_mode: downpayment.payrollSplitMode as 'PER_PAYMENT' | 'ON_COMPLETION',
                staff_id: downpayment.staffId ?? null,
                is_settled: downpayment.isSettled,
                assigned_at: downpayment.assignedAt?.toISOString() ?? null,
                settled_at: downpayment.isSettled && downpayment.updatedAt ? downpayment.updatedAt.toISOString() : null,
            }
        }

        return success({
            transaction: transformedTransaction,
            items,
            payments,
        })
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error fetching transaction: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch transaction')
    }
}

// ============================================================================
// VOID TRANSACTION
// ============================================================================

export async function voidTransaction(payload: VoidTransactionPayload): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessTransactions(user)
    if (!hasAccess) {
        return failure('Transaction management access required')
    }

    return await withTransaction(async (tx) => {
        // Atomically update status to VOIDED — only matches if status is COMPLETED
        const [transaction] = await tx
            .update(transactions)
            .set({
                status: 'VOIDED',
                voidedAt: new Date(),
                voidedBy: user.id,
                voidReason: payload.void_reason,
            })
            .where(
                and(
                    eq(transactions.id, payload.transaction_id),
                    eq(transactions.status, 'COMPLETED')
                )
            )
            .returning()

        if (!transaction) {
            return failure('Transaction not found, already voided, or already refunded')
        }

        // Get transaction items to restore inventory
        const items = await tx
            .select()
            .from(transactionItems)
            .where(eq(transactionItems.transactionId, payload.transaction_id))

        // Restore inventory stock for each item
        for (const item of items) {
            if (item.inventoryId) {
                const [inventoryItem] = await tx
                    .select({ currentStock: inventory.currentStock })
                    .from(inventory)
                    .where(eq(inventory.id, item.inventoryId))
                    .limit(1)

                if (inventoryItem) {
                    const quantity = Number(item.quantity) || 0
                    const currentStock = Number(inventoryItem.currentStock) || 0
                    const newStock = currentStock + quantity
                    await tx
                        .update(inventory)
                        .set({ currentStock: String(newStock) })
                        .where(eq(inventory.id, item.inventoryId))
                }
            }
        }

        // Look up the original ledger entry category for dynamic reverse category naming
        const [originalEntry] = await tx
            .select({ category: generalLedger.category })
            .from(generalLedger)
            .where(and(
                eq(generalLedger.sourceType, 'TRANSACTION'),
                eq(generalLedger.sourceId, transaction.id),
                eq(generalLedger.isVoided, false),
                eq(generalLedger.entryType, 'REVENUE')
            ))
            .limit(1)

        const originalCategory = originalEntry?.category || 'SALES'
        const voidCategory = `VOIDED: ${originalCategory}`

        // Create accounting entry to reverse the sale
        let originalPayments: (typeof transactionPayments.$inferSelect)[] = []
        if (transaction.paymentMethod === 'SPLIT') {
            originalPayments = await tx
                .select()
                .from(transactionPayments)
                .where(eq(transactionPayments.transactionId, transaction.id))
        }

        if (originalPayments.length > 0) {
            for (const payment of originalPayments) {
                await createAutoLedgerEntry(
                    'TRANSACTION',
                    transaction.id,
                    {
                        entry_date: new Date(),
                        entry_type: 'REVENUE',
                        category: voidCategory,
                        description: `Voided: ${transaction.transactionNumber} (${getTransactionPaymentMethodLabel(payment.paymentMethod)})`,
                        reference: `VOID-${transaction.transactionNumber}-${payment.paymentMethod}`,
                        debit: Number(payment.amount),
                        credit: 0,
                        branch_id: transaction.branchId,
                        payment_method: mapTransactionToAccountingPaymentMethod(payment.paymentMethod),
                    },
                    user.id,
                    tx
                )
            }
        } else {
            // Single reversing entry for non-split or split with no payments
            // Debit only the amount that was actually paid (and previously credited)
            const amountPaid = Number(transaction.amountPaid)
            await createAutoLedgerEntry('TRANSACTION', transaction.id, {
                entry_date: new Date(),
                entry_type: 'REVENUE',
                category: voidCategory,
                description: `Voided: ${transaction.transactionNumber}`,
                reference: `VOID-${transaction.transactionNumber}`,
                debit: amountPaid,
                credit: 0,
                branch_id: transaction.branchId,
                payment_method: mapTransactionToAccountingPaymentMethod(transaction.paymentMethod),
            }, user.id, tx)
        }

        // Settle associated downpayment if exists
        try {
            const [downpayment] = await tx
                .select()
                .from(downpayments)
                .where(eq(downpayments.transactionId, transaction.id))
                .limit(1)

            if (downpayment && !downpayment.isSettled) {
                await tx
                    .update(downpayments)
                    .set({ isSettled: true, updatedAt: new Date() })
                    .where(eq(downpayments.id, downpayment.id))

                // Reverse the original UNEARNED_REVENUE liability entry
                await createAutoLedgerEntry(
                    'TRANSACTION',
                    transaction.id,
                    {
                        entry_date: new Date(),
                        entry_type: 'LIABILITY',
                        category: 'UNEARNED_REVENUE',
                        description: `Voided downpayment: ${transaction.transactionNumber}`,
                        reference: `VOID-DP-${transaction.transactionNumber}`,
                        // Use transaction.amountPaid as source of truth (it may differ from downpayment.amount)
                        debit: Number(transaction.amountPaid) || Number(downpayment.amount),
                        credit: 0,
                        branch_id: transaction.branchId,
                    },
                    user.id,
                    tx
                )
            }
        } catch (dpError) {
            await logError({
                type: 'PAYROLL',
                message: `Failed to settle downpayment on void for transaction ${transaction.transactionNumber}: ${dpError instanceof Error ? dpError.message : String(dpError)}`
            })
        }

        // Reverse payroll entries for this transaction
        // IMPORTANT: cancelPayrollEntriesForTransaction queries payrollEntry
        // WHERE transactionId = ? directly — it handles zero entries gracefully
        // and catches per-item artist assignments that have no transaction-level staffId.
        try {
            const { cancelPayrollEntriesForTransaction } = await import('./payroll')
            const payrollResult = await cancelPayrollEntriesForTransaction(transaction.id, user.id, tx)
            if (!payrollResult.success) {
                throw new Error(`Failed to cancel payroll entries: ${payrollResult.error}`)
            }
        } catch (payrollError) {
            // Errors here cause withTransaction to roll back the entire void operation
            if (payrollError instanceof Error) {
                throw payrollError
            }
            throw new Error(`Payroll reversal failed for voided transaction ${transaction.transactionNumber}: ${String(payrollError)}`)
        }

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'OTHER',
                message: `Transaction voided: ${payload.transaction_id} by ${user.id}`,
            }]
        })

        return { success: true, data: undefined } as ActionResponse<void>
    }, { action: 'ACCOUNTING', userId: user.id }).then(result => {
        if (!result.success) {
            return failure(result.error)
        }
        return result.data
    })
}

// ============================================================================
// REFUND TRANSACTION
// ============================================================================

export async function refundTransaction(
    transactionId: string,
    reason: string,
    options?: { partialAmount?: number }
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessTransactions(user)
    if (!hasAccess) {
        return failure('Transaction management access required')
    }

    return await withTransaction(async (tx) => {
        // Atomically update status to REFUNDED — only matches if status is COMPLETED
        const [originalTxn] = await tx
            .update(transactions)
            .set({ status: 'REFUNDED', voidedAt: new Date(), voidedBy: user.id, voidReason: reason })
            .where(
                and(
                    eq(transactions.id, transactionId),
                    eq(transactions.status, 'COMPLETED')
                )
            )
            .returning()

        if (!originalTxn) {
            return failure('Transaction not found, already voided, or already refunded')
        }

        const refundAmount = options?.partialAmount || Number(originalTxn.total)

        // Restore inventory stock (same pattern as voidTransaction)
        const originalItems = await tx
            .select()
            .from(transactionItems)
            .where(eq(transactionItems.transactionId, transactionId))

        for (const item of originalItems) {
            if (item.inventoryId) {
                const [inv] = await tx
                    .select({ currentStock: inventory.currentStock })
                    .from(inventory)
                    .where(eq(inventory.id, item.inventoryId))
                    .limit(1)

                if (inv) {
                    const quantity = Number(item.quantity) || 0
                    const currentStock = Number(inv.currentStock) || 0
                    const newStock = currentStock + quantity
                    await tx
                        .update(inventory)
                        .set({ currentStock: String(newStock) })
                        .where(eq(inventory.id, item.inventoryId))
                }
            }
        }

        // Create refund transaction
        const [refundTxn] = await tx
            .insert(transactions)
            .values({
                transactionNumber: `REFUND-${originalTxn.transactionNumber}`,
                staffId: user.id,
                branchId: originalTxn.branchId,
                subtotal: String(-refundAmount),
                taxAmount: '0',
                discountAmount: '0',
                total: String(-refundAmount),
                amountPaid: String(-refundAmount),
                balanceDue: '0',
                paymentMethod: originalTxn.paymentMethod,
                status: 'REFUNDED',
                notes: `Refund for ${originalTxn.transactionNumber}: ${reason}`,
                createdBy: user.id,
            })
            .returning()

        // (Status was already set to REFUNDED atomically above)

        // Look up the original ledger entry category for dynamic refund category naming
        const [originalRefundEntry] = await tx
            .select({ category: generalLedger.category })
            .from(generalLedger)
            .where(and(
                eq(generalLedger.sourceType, 'TRANSACTION'),
                eq(generalLedger.sourceId, originalTxn.id),
                eq(generalLedger.isVoided, false),
                eq(generalLedger.entryType, 'REVENUE')
            ))
            .limit(1)

        const originalRefundCategory = originalRefundEntry?.category || 'SALES'
        const refundCategory = `REFUND: ${originalRefundCategory}`

        // Create accounting entry for refund
        let originalPayments: (typeof transactionPayments.$inferSelect)[] = []
        if (originalTxn.paymentMethod === 'SPLIT') {
            originalPayments = await tx
                .select()
                .from(transactionPayments)
                .where(eq(transactionPayments.transactionId, originalTxn.id))
        }

        if (originalPayments.length > 0) {
            const originalTotalAmount = originalPayments.reduce((sum, p) => sum + Number(p.amount), 0)

            if (originalTotalAmount === 0) {
                // Fallback: single entry with refundAmount
                await createAutoLedgerEntry('TRANSACTION', refundTxn.id, {
                    entry_date: new Date(),
                    entry_type: 'REVENUE',
                    category: refundCategory,
                    description: `Refund: ${originalTxn.transactionNumber}`,
                    reference: `REFUND-${originalTxn.transactionNumber}`,
                    debit: refundAmount,
                    credit: 0,
                    branch_id: originalTxn.branchId,
                    payment_method: undefined,
                }, user.id, tx)
            } else {
                let remainingRefund = refundAmount
                for (let i = 0; i < originalPayments.length; i++) {
                    const payment = originalPayments[i]
                    const isLast = i === originalPayments.length - 1
                    const debitAmount = options?.partialAmount
                        ? isLast
                            ? remainingRefund
                            : Math.round((Number(payment.amount) / originalTotalAmount) * refundAmount * 100) / 100
                        : Number(payment.amount)
                    remainingRefund -= debitAmount

                    await createAutoLedgerEntry(
                        'TRANSACTION',
                        refundTxn.id,
                        {
                            entry_date: new Date(),
                            entry_type: 'REVENUE',
                            category: refundCategory,
                            description: `Refund: ${originalTxn.transactionNumber} (${getTransactionPaymentMethodLabel(payment.paymentMethod)})`,
                            reference: `REFUND-${originalTxn.transactionNumber}-${payment.paymentMethod}`,
                            debit: debitAmount,
                            credit: 0,
                            branch_id: originalTxn.branchId,
                            payment_method: mapTransactionToAccountingPaymentMethod(payment.paymentMethod),
                        },
                        user.id,
                        tx
                    )
                }
            }
        } else {
            // Single entry for non-split or split with no payments
            await createAutoLedgerEntry(
                'TRANSACTION',
                refundTxn.id,
                {
                    entry_date: new Date(),
                    entry_type: 'REVENUE',
                    category: refundCategory,
                    description: `Refund: ${originalTxn.transactionNumber}`,
                    reference: refundTxn.transactionNumber,
                    debit: refundAmount,
                    credit: 0,
                    branch_id: originalTxn.branchId,
                    payment_method: mapTransactionToAccountingPaymentMethod(originalTxn.paymentMethod),
                },
                user.id,
                tx
            )
        }

        // Reverse payroll entries for this transaction
        if (originalTxn.staffId) {
            try {
                const { cancelPayrollEntriesForTransaction } = await import('./payroll')
                const payrollResult = await cancelPayrollEntriesForTransaction(originalTxn.id, user.id, tx)
                if (!payrollResult.success) {
                    throw new Error(`Failed to cancel payroll entries: ${payrollResult.error}`)
                }
            } catch (payrollError) {
                // Errors here cause withTransaction to roll back the entire refund operation
                if (payrollError instanceof Error) {
                    throw payrollError
                }
                throw new Error(`Payroll reversal failed for refunded transaction ${originalTxn.transactionNumber}: ${String(payrollError)}`)
            }
        }

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'ACCOUNTING',
                message: `Transaction refunded: ${originalTxn.transactionNumber} by ${user.id}, amount: ${refundAmount}`,
            }]
        })

        return { success: true, data: undefined } as ActionResponse<void>
    }, { action: 'ACCOUNTING', userId: user.id }).then(result => {
        if (!result.success) {
            return failure(result.error)
        }
        return result.data
    })
}

// ============================================================================
// ADD TRANSACTION PAYMENT
// ============================================================================

export interface AddTransactionPaymentResult {
    transaction: GetTransactionByIdResult
    payment: typeof transactionPayments.$inferSelect
}

export async function addTransactionPayment(payload: AddTransactionPaymentPayload): Promise<ActionResponse<AddTransactionPaymentResult>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessSales(user)
    if (!hasAccess) {
        return failure('Sales access required')
    }

    // Get current transaction (read-only check outside transaction)
    const [transaction] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, payload.transaction_id))
        .limit(1)

    if (!transaction) {
        return failure('Transaction not found')
    }

    return await withTransaction(async (tx) => {
        // Create payment record
        const [payment] = await tx
            .insert(transactionPayments)
            .values({
                transactionId: payload.transaction_id,
                amount: payload.amount.toString(),
                paymentMethod: payload.payment_method,
                referenceNumber: payload.reference_number,
                createdBy: user.id,
            })
            .returning()

        // Update transaction balance
        const newAmountPaid = Number(transaction.amountPaid) + payload.amount
        const newBalanceDue = Number(transaction.total) - newAmountPaid
        const newStatus = newBalanceDue <= 0 ? 'COMPLETED' : 'PARTIAL'

        await tx
            .update(transactions)
            .set({
                amountPaid: newAmountPaid.toString(),
                balanceDue: Math.max(0, newBalanceDue).toString(),
                status: newStatus,
            })
            .where(eq(transactions.id, payload.transaction_id))

        // Create accounting entry for the additional payment
        try {
            await createAutoLedgerEntry(
                'TRANSACTION',
                payload.transaction_id,
                {
                    entry_date: new Date(),
                    entry_type: 'REVENUE',
                    category: 'SALES',
                    description: `Additional payment: ${transaction.transactionNumber} (${getTransactionPaymentMethodLabel(payload.payment_method)})`,
                    reference: `${transaction.transactionNumber}-ADDL-${Date.now()}`,
                    debit: 0,
                    credit: payload.amount,
                    branch_id: transaction.branchId,
                    payment_method: mapTransactionToAccountingPaymentMethod(payload.payment_method),
                },
                user.id,
                tx
            )
        } catch (accountingError) {
            await logError({
                type: 'ACCOUNTING',
                message: `Failed to create accounting entry for additional payment on ${transaction.transactionNumber}: ${accountingError instanceof Error ? accountingError.message : String(accountingError)}`
            })
        }

        // Handle downpayment settlement if transaction is now completed
        if (newStatus === 'COMPLETED') {
            try {
                const [downpayment] = await tx
                    .select()
                    .from(downpayments)
                    .where(eq(downpayments.transactionId, payload.transaction_id))
                    .limit(1)

                if (downpayment && !downpayment.isSettled) {
                    if (downpayment.payrollSplitMode === 'ON_COMPLETION' && transaction.staffId) {
                        const { calculateAndCreatePayrollEntry } = await import('./payroll')
                        await calculateAndCreatePayrollEntry({
                            transactionId: transaction.id,
                            serviceId: '', // Downpayment doesn't have a specific service
                            serviceType: 'MANUAL',
                            staffId: transaction.staffId,
                            amount: Number(transaction.total),
                            quantity: 1,
                            clientType: (transaction.clientType as ClientType) || undefined,
                            paymentMethod: payload.payment_method,
                        }, tx)
                    }

                    await tx
                        .update(downpayments)
                        .set({ isSettled: true, updatedAt: new Date() })
                        .where(eq(downpayments.id, downpayment.id))

                    // Convert liability to revenue
                    await createAutoLedgerEntry(
                        'TRANSACTION',
                        downpayment.id,
                        {
                            entry_date: new Date(),
                            entry_type: 'LIABILITY',
                            category: 'UNEARNED_REVENUE',
                            description: `Downpayment settled: ${transaction.transactionNumber}`,
                            reference: `DP-SETTLE-${transaction.transactionNumber}`,
                            debit: Number(downpayment.amount),
                            credit: 0,
                            branch_id: transaction.branchId,
                        },
                        user.id,
                        tx
                    )

                    await createAutoLedgerEntry(
                        'TRANSACTION',
                        `${downpayment.id}-REV`,
                        {
                            entry_date: new Date(),
                            entry_type: 'REVENUE',
                            category: 'SALES',
                            description: `Downpayment revenue recognized: ${transaction.transactionNumber}`,
                            reference: `DP-REV-${transaction.transactionNumber}`,
                            debit: 0,
                            credit: Number(downpayment.amount),
                            branch_id: transaction.branchId,
                            payment_method: mapTransactionToAccountingPaymentMethod(payload.payment_method),
                        },
                        user.id,
                        tx
                    )
                }
            } catch (downpaymentError) {
                await logError({
                    type: 'PAYROLL',
                    message: `Failed to settle downpayment for transaction ${transaction.id}: ${downpaymentError instanceof Error ? downpaymentError.message : String(downpaymentError)}`
                })
            }
        }

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'OTHER',
                message: `Payment added to transaction: ${payload.transaction_id}`,
            }]
        })

        return { payment }
    }, { action: 'ACCOUNTING', userId: user.id }).then(async (result) => {
        if (!result.success) {
            return failure(result.error)
        }

        // Fetch the full updated transaction (outside the transaction to get complete data)
        const updatedTransaction = await getTransactionById(payload.transaction_id)

        if (!updatedTransaction.success || !updatedTransaction.data) {
            return failure('Failed to retrieve updated transaction')
        }

        return success({
            transaction: updatedTransaction.data,
            payment: result.data.payment
        })
    })
}

// ============================================================================
// UPDATE TRANSACTION
// ============================================================================

export interface UpdateTransactionResult {
    transaction: Transaction
}

export async function updateTransaction(payload: UpdateTransactionPayload): Promise<ActionResponse<UpdateTransactionResult>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    // Get current transaction
    const [transaction] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, payload.transaction_id))
        .limit(1)

    if (!transaction) {
        return failure('Transaction not found')
    }

    if (transaction.status === 'VOIDED') {
        return failure('Cannot update a voided transaction')
    }

    const updates: Partial<typeof transactions.$inferInsert> = {}
    
    if (payload.notes !== undefined) {
        updates.notes = payload.notes ? sanitizeText(payload.notes) : null
    }
    if (payload.reference_number !== undefined) {
        updates.referenceNumber = payload.reference_number ? sanitizeMinimal(payload.reference_number) : null
    }
    if (payload.payment_method !== undefined) {
        updates.paymentMethod = payload.payment_method
    }
    if (payload.sales_description !== undefined) {
        updates.salesDescription = payload.sales_description ? sanitizeText(payload.sales_description) : null
    }

    if (Object.keys(updates).length === 0) {
        return failure('No fields to update')
    }

    const [updatedTransaction] = await db
        .update(transactions)
        .set(updates)
        .where(eq(transactions.id, payload.transaction_id))
        .returning()

    await createLogs({
        logs: [{
            level: 'INFO',
            type: 'OTHER',
            message: `Transaction updated: ${payload.transaction_id}`,
        }]
    })

    return success({ transaction: transformTransaction(updatedTransaction) })
}

// ============================================================================
// GET TRANSACTION PAYMENTS
// ============================================================================

export async function getTransactionPayments(transactionId: string): Promise<ActionResponse<(typeof transactionPayments.$inferSelect)[]>> {
    try {
        const [transaction] = await db
            .select()
            .from(transactions)
            .where(eq(transactions.id, transactionId))
            .limit(1)

        if (!transaction) {
            return failure('Transaction not found')
        }

        const payments = await db
            .select()
            .from(transactionPayments)
            .where(eq(transactionPayments.transactionId, transactionId))
            .orderBy(desc(transactionPayments.createdAt))

        return success(payments)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error fetching transaction payments: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch transaction payments')
    }
}

// ============================================================================
// TODAY'S SUMMARY
// ============================================================================

export interface GetTodaySummaryResult {
    totalRevenue: number          // SUM(amount_paid) for completed transactions today
    completedCount: number         // COUNT where status = 'COMPLETED'
    pendingCount: number           // COUNT where status in partial/downpayment
    itemsSold: number              // SUM(quantity) of inventory items across completed transactions
    servicesRendered: number       // COUNT of service items across completed transactions
}

export async function getTodaySummary(
    branchId?: string | null
): Promise<ActionResponse<GetTodaySummaryResult>> {
    try {
        // Calculate PH time (UTC+8) day boundaries
        const now = new Date()
        const phNow = new Date(now.toLocaleString('en-PH', { timeZone: 'Asia/Manila' }))
        const phTodayStr = phNow.toISOString().split('T')[0] // "2026-05-22"

        const todayStart = new Date(`${phTodayStr}T00:00:00.000+08:00`)
        const todayEnd   = new Date(`${phTodayStr}T23:59:59.999+08:00`)

        // Build where clause
        const conditions = [
            gte(transactions.createdAt, todayStart),
            lte(transactions.createdAt, todayEnd),
        ]

        // Branch filter (NO isNull branch — shared transactions counted at origin only)
        if (branchId) {
            conditions.push(eq(transactions.branchId, branchId))
        }

        // Completed transactions count + revenue
        const completedWhere = and(
            ...conditions,
            eq(transactions.status, 'COMPLETED')
        )

        const [completedResult] = await db
            .select({
                totalRevenue: sql<number>`coalesce(sum(${transactions.amountPaid}), 0)`,
                count:        sql<number>`count(*)`,
            })
            .from(transactions)
            .where(completedWhere)

        // Pending transactions count
        const pendingWhere = and(
            ...conditions,
            inArray(transactions.status, ['PARTIAL', 'DOWNPAYMENT_PENDING', 'DOWNPAYMENT_ASSIGNED'])
        )

        const [pendingResult] = await db
            .select({
                count: sql<number>`count(*)`,
            })
            .from(transactions)
            .where(pendingWhere)

        // Items sold (quantity of inventory items in completed transactions today)
        const [itemsResult] = await db
            .select({
                total: sql<number>`coalesce(sum(${transactionItems.quantity}), 0)`,
            })
            .from(transactionItems)
            .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
            .where(and(
                gte(transactions.createdAt, todayStart),
                lte(transactions.createdAt, todayEnd),
                eq(transactions.status, 'COMPLETED'),
                ...(branchId ? [eq(transactions.branchId, branchId)] : []),
            ))

        // Services rendered (count of service items in completed transactions today)
        const [servicesResult] = await db
            .select({
                total: sql<number>`coalesce(count(*), 0)`,
            })
            .from(transactionItems)
            .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
            .where(and(
                gte(transactions.createdAt, todayStart),
                lte(transactions.createdAt, todayEnd),
                eq(transactions.status, 'COMPLETED'),
                sql`${transactionItems.serviceId} IS NOT NULL`,
                ...(branchId ? [eq(transactions.branchId, branchId)] : []),
            ))

        return success({
            totalRevenue:     Number(completedResult?.totalRevenue ?? 0),
            completedCount:   Number(completedResult?.count ?? 0),
            pendingCount:     Number(pendingResult?.count ?? 0),
            itemsSold:        Number(itemsResult?.total ?? 0),
            servicesRendered: Number(servicesResult?.total ?? 0),
        })
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error getting today summary: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to get today summary')
    }
}

// ============================================================================
// EXPORT TRANSACTIONS
// ============================================================================

export interface ExportTransactionsResult {
    data?: string
    filename?: string
    mimeType?: string
}

const TRANSACTION_EXPORT_COLUMNS: ExportColumn[] = [
    { key: 'id', header: 'Transaction ID' },
    { key: 'date', header: 'Date' },
    { key: 'type', header: 'Type' },
    { key: 'amount', header: 'Amount', formatter: (v) => String(Number(v) || 0) },
    { key: 'currency', header: 'Currency' },
    { key: 'status', header: 'Status' },
    { key: 'category', header: 'Category' },
    { key: 'description', header: 'Description' },
    { key: 'created_by', header: 'Created By' },
]

export async function exportTransactions(options: {
    format: 'csv' | 'excel' | 'pdf'
    filters?: TransactionFilters
}): Promise<ActionResponse<ExportTransactionsResult>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized: Not authenticated")
        }

        // Get transactions based on filters
        const result = await getTransactions({ filters: options.filters, pageSize: 10000 })
        
        if (!result.success || !result.data) {
            return failure("Failed to fetch transactions for export")
        }

        // Only support csv and json for now (pdf and excel not implemented)
        if (options.format === 'pdf' || options.format === 'excel') {
            return failure('Export format not yet supported')
        }

        // Map transactions for export
        const exportData = result.data.data.map((t: Transaction) => ({
            id: t.id,
            date: t.created_at,
            type: t.payment_method,
            amount: t.total,
            currency: 'PHP',
            status: t.status,
            category: 'TRANSACTION',
            description: t.notes || '',
            created_by: t.staff_id || '',
        }))

        const format = options.format === 'csv' ? 'csv' : 'json'
        const exportResult = createExportResponse(exportData, {
            filename: 'transactions_export',
            format,
            columns: TRANSACTION_EXPORT_COLUMNS,
        })

        // Convert to base64 to match existing API
        const base64Content = btoa(exportResult.content)

        return success({
            data: base64Content,
            filename: exportResult.filename,
            mimeType: exportResult.contentType,
        })
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Failed to export transactions: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to export transactions')
    }
}

// ============================================================================
// GENERATE RECEIPT
// ============================================================================

export interface GenerateReceiptResult {
    pdf: Uint8Array
    filename: string
}

export async function generateReceipt(transactionId: string): Promise<ActionResponse<GenerateReceiptResult>> {
    const txnResult = await getTransactionById(transactionId)
    if (!txnResult.success || !txnResult.data) {
        return failure('Transaction not found')
    }

    const { transaction, items } = txnResult.data

    // Get branch name if branch_id exists
    let branchName = 'AMOR BEAUTY LOUNGE'

    // Get staff name if staff_id exists
    let staffName: string | undefined
    if (transaction.staff_id) {
        const staffUser = await getUserById(transaction.staff_id)
        if (staffUser) {
            staffName = staffUser.full_name
        }
    }

    const pdf = await generateReceiptPdf({
        transactionNumber: transaction.transaction_number,
        date: transaction.created_at,
        items: items.map(i => ({
            name: i.itemName || 'Unknown',
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            lineTotal: Number(i.lineTotal),
        })),
        subtotal: transaction.subtotal,
        tax: transaction.tax_amount,
        discount: transaction.discount_amount,
        total: transaction.total,
        amountPaid: transaction.amount_paid,
        changeGiven: transaction.change_given,
        paymentMethod: transaction.payment_method,
        branchName,
        staffName,
    })

    return success({
        pdf,
        filename: `receipt-${transaction.transaction_number}.pdf`,
    })
}
