'use server'

import { eq, isNull, desc, and } from 'drizzle-orm'

import { db } from '@/server/db'
import { downpayments } from '@/server/db/schema/payroll'
import { transactions } from '@/server/db/schema/transactions'
import { createLogs } from '@/server/actions/logs'
import { TransactionClient } from '@/server/db/transactions'
import type {
    Downpayment,
    CreateDownpaymentPayload,
    AssignStaffToDownpaymentPayload,
    ClientType,
} from '@/utils/types/payroll'

export async function getDownpayments(filters?: {
    isSettled?: boolean
    unassignedOnly?: boolean
    staffId?: string
}): Promise<Downpayment[]> {
    try {
        const conditions = []

        if (filters?.unassignedOnly) {
            conditions.push(isNull(downpayments.staffId))
        }
        if (filters?.staffId) {
            conditions.push(eq(downpayments.staffId, filters.staffId))
        }
        if (filters?.isSettled !== undefined) {
            conditions.push(eq(downpayments.isSettled, filters.isSettled))
        }

        const results = await db
            .select()
            .from(downpayments)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(downpayments.createdAt))
        return results.map(mapDownpayment)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Failed to fetch downpayments: ${error}` }] })
        throw new Error('Failed to fetch downpayments')
    }
}

export async function createDownpayment(
    payload: CreateDownpaymentPayload,
    tx?: TransactionClient
): Promise<Downpayment> {
    if (payload.downpayment_type === 'PERCENTAGE' && !payload.percentage_rate) {
        throw new Error('Percentage rate is required for PERCENTAGE downpayments')
    }

    let amount = payload.amount
    if (payload.downpayment_type === 'PERCENTAGE' && payload.estimated_total && payload.percentage_rate) {
        amount = Number(payload.estimated_total) * Number(payload.percentage_rate) / 100
    }

    const dbClient = tx ?? db
    try {
        const [newDownpayment] = await dbClient.insert(downpayments).values({
            transactionId: payload.transaction_id,
            amount: String(amount),
            downpaymentType: payload.downpayment_type,
            percentageRate: payload.percentage_rate ? String(payload.percentage_rate) : null,
            estimatedTotal: payload.estimated_total ? String(payload.estimated_total) : null,
            staffId: payload.staff_id ?? null,
            payrollSplitMode: payload.payroll_split_mode,
            notes: payload.notes ?? null,
        }).returning()

        return mapDownpayment(newDownpayment)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Failed to create downpayment: ${error}` }] })
        throw new Error('Failed to create downpayment')
    }
}

export async function assignStaffToDownpayment(payload: AssignStaffToDownpaymentPayload): Promise<Downpayment> {
    try {
        return await db.transaction(async (tx) => {
            const [updated] = await tx
                .update(downpayments)
                .set({
                    staffId: payload.staff_id,
                    assignedAt: new Date(),
                    payrollSplitMode: payload.payroll_split_mode,
                    updatedAt: new Date(),
                })
                .where(eq(downpayments.id, payload.downpayment_id))
                .returning()

            if (!updated) throw new Error('Downpayment not found')

            await tx
                .update(transactions)
                .set({ status: 'DOWNPAYMENT_ASSIGNED' })
                .where(eq(transactions.id, updated.transactionId))

            // Create payroll entry for PER_PAYMENT mode
            if (payload.payroll_split_mode === 'PER_PAYMENT') {
                const [transaction] = await tx
                    .select()
                    .from(transactions)
                    .where(eq(transactions.id, updated.transactionId))
                    .limit(1)

                if (transaction) {
                    const { calculateAndCreatePayrollEntry } = await import('./payroll')
                    const result = await calculateAndCreatePayrollEntry({
                        transactionId: transaction.id,
                        serviceId: '',
                        serviceType: 'MANUAL',
                        staffId: payload.staff_id,
                        amount: Number(updated.amount),
                        quantity: 1,
                        clientType: (transaction.clientType as ClientType) || undefined,
                        paymentMethod: transaction.paymentMethod || undefined,
                    }, tx)
                    if (!result.success) {
                        throw new Error(result.error || 'Failed to create payroll entry')
                    }
                }
            }

            return mapDownpayment(updated)
        })
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Failed to assign staff to downpayment: ${error}` }] })
        throw new Error('Failed to assign staff')
    }
}

export async function settleDownpayment(downpaymentId: string): Promise<void> {
    try {
        await db
            .update(downpayments)
            .set({ isSettled: true, updatedAt: new Date() })
            .where(eq(downpayments.id, downpaymentId))
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Failed to settle downpayment: ${error}` }] })
        throw new Error('Failed to settle downpayment')
    }
}

function mapDownpayment(row: Record<string, unknown>): Downpayment {
    return {
        id: row.id as string,
        transaction_id: row.transactionId as string,
        amount: Number(row.amount),
        downpayment_type: row.downpaymentType as Downpayment['downpayment_type'],
        percentage_rate: row.percentageRate ? Number(row.percentageRate) : undefined,
        estimated_total: row.estimatedTotal ? Number(row.estimatedTotal) : undefined,
        is_settled: row.isSettled as boolean,
        staff_id: row.staffId as string | undefined,
        assigned_at: row.assignedAt as Date | undefined,
        payroll_split_mode: row.payrollSplitMode as Downpayment['payroll_split_mode'],
        notes: row.notes as string | undefined,
        created_at: row.createdAt as Date,
        updated_at: row.updatedAt as Date | undefined,
        created_by: row.createdBy as string | undefined,
    }
}
