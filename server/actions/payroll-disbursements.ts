'use server'

import { eq, and, sum } from "drizzle-orm"

import { db } from "@/server/db"
import { withTransaction } from "@/server/db/transactions"
import { payrollDisbursement, payrollRequest, payrollEntry, user, transactions } from "@/server/db/schema"
import { PaymentMethod } from "@/utils/types/payroll"
import { ActionResponse, success, failure } from "@/utils/types/responses"
import { normalizePaymentMethod } from "@/utils/types/payment"
import { getCurrentUser, isAdmin } from "@/utils/auth/permissions"
import { uploadFile } from "@/utils/storage"
import { cache } from '@/utils/cache'

import { createLogs, logError } from "./logs"
import { completePayrollRequest } from "./payroll"
import { CreateDisbursementSchema } from "./payroll-schemas"

export interface CreateDisbursementInput {
    request_id: string
    amount: number
    payment_method: PaymentMethod
    reference_number?: string
    notes?: string
    proof_file?: File | null
}

export async function createDisbursement(
    payload: CreateDisbursementInput
): Promise<ActionResponse<{ disbursement_id: string }>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) return failure('Unauthorized')

    const admin = await isAdmin(currentUser)
    if (!admin) return failure('Admin access required')

    const validation = CreateDisbursementSchema.safeParse(payload)
    if (!validation.success) {
        return failure(validation.error.issues.map(i => i.message).join(', '))
    }

    try {
        const [request] = await db
            .select()
            .from(payrollRequest)
            .where(eq(payrollRequest.id, payload.request_id))
            .limit(1)

        if (!request) return failure('Payroll request not found')
        if (request.status !== 'CONFIRMED') {
            return failure('Only confirmed payrolls can be disbursed')
        }

        const existingDisbursements = await db
            .select({ total: sum(payrollDisbursement.amount) })
            .from(payrollDisbursement)
            .where(
                and(
                    eq(payrollDisbursement.requestId, payload.request_id),
                    eq(payrollDisbursement.status, 'COMPLETED')
                )
            )

        const alreadyDisbursed = Number(existingDisbursements[0]?.total || 0)
        const totalStaffCut = Number(request.totalStaffCut)
        const remaining = totalStaffCut - alreadyDisbursed

        if (payload.amount > remaining) {
            return failure(`Disbursement amount (${payload.amount}) exceeds remaining (${remaining})`)
        }

        let proofUrl: string | undefined
        if (payload.proof_file) {
            try {
                const buffer = Buffer.from(await payload.proof_file.arrayBuffer())
                const extension = payload.proof_file.name.split('.').pop() || 'jpg'
                const key = `payroll-proofs/${payload.request_id}-${Date.now()}.${extension}`
                const uploadResult = await uploadFile(buffer, key, payload.proof_file.type)
                proofUrl = uploadResult.url
            } catch (uploadError) {
                await logError({
                    type: 'PAYROLL',
                    message: `Failed to upload proof for disbursement: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`
                })
            }
        }

        const normalizedPaymentMethod = normalizePaymentMethod(payload.payment_method, 'PAYROLL')

        const txResult = await withTransaction(async (tx) => {
            const [disbursement] = await tx
                .insert(payrollDisbursement)
                .values({
                    requestId: payload.request_id,
                    amount: String(payload.amount),
                    paymentMethod: normalizedPaymentMethod,
                    referenceNumber: payload.reference_number || null,
                    proofUrl: proofUrl || null,
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    completedBy: currentUser.id,
                    notes: payload.notes || null,
                })
                .returning()

            const newDisbursed = alreadyDisbursed + payload.amount
            const isFullyDisbursed = newDisbursed >= totalStaffCut
            if (isFullyDisbursed) {
                const completeResult = await completePayrollRequest(payload.request_id, {
                    payment_method: payload.payment_method,
                    reference_number: payload.reference_number,
                    skip_disbursement_check: true,
                    // Accounting entry is created by completePayrollRequest (not here)
                    // to prevent double-counting
                    skip_accounting_entry: false,
                })
                if (!completeResult.success) {
                    throw new Error(completeResult.error || 'Failed to complete payroll request')
                }
            }

            return { disbursement, isFullyDisbursed }
        }, { action: 'PAYROLL', userId: currentUser.id })

        if (!txResult.success) {
            return failure(txResult.error || 'Failed to create disbursement')
        }

        const { disbursement, isFullyDisbursed } = txResult.data

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Disbursement created: ${disbursement.id} for request ${payload.request_id} - ${payload.amount} via ${payload.payment_method}`,
            }],
        })

        // Create accounting entry only for partial disbursements;
        // full completion's accounting is handled by completePayrollRequest
        if (!isFullyDisbursed) {
            try {
            const { createAutoLedgerEntry } = await import('./accounting')
            const { mapPayrollToAccountingPaymentMethod } = await import('@/utils/types/payment')

            const [staffUser] = await db
                .select({ fullName: user.fullName })
                .from(user)
                .where(eq(user.id, request.staffId))
                .limit(1)
            const staffName = staffUser?.fullName || 'Unknown Staff'

            const [firstPayrollEntry] = await db
                .select({
                    id: payrollEntry.id,
                    branchId: transactions.branchId,
                })
                .from(payrollEntry)
                .innerJoin(transactions, eq(payrollEntry.transactionId, transactions.id))
                .where(eq(payrollEntry.payrollRequestId, payload.request_id))
                .limit(1)

            await createAutoLedgerEntry('PAYROLL', firstPayrollEntry?.id || disbursement.id, {
                entry_date: new Date(),
                entry_type: 'EXPENSE',
                category: 'PAYROLL',
                description: `Payroll disbursement - Staff: ${staffName} - ${payload.payment_method}`,
                reference: `PAYROLL-DISB-${disbursement.id.slice(0, 8)}`,
                debit: payload.amount,
                credit: 0,
                branch_id: firstPayrollEntry?.branchId || null,
                payment_method: mapPayrollToAccountingPaymentMethod(payload.payment_method),
            }, currentUser.id)
        } catch (accountingError) {
            await logError({
                type: 'ACCOUNTING',
                message: `Failed to create accounting entry for disbursement ${disbursement.id}: ${accountingError instanceof Error ? accountingError.message : String(accountingError)}`
            })
        }
        }

        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        return success({ disbursement_id: disbursement.id })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error creating disbursement: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to create disbursement')
    }
}

export async function getDisbursements(
    requestId: string
): Promise<ActionResponse<import("@/utils/types/payroll").PayrollDisbursement[]>> {
    try {
        const rows = await db
            .select()
            .from(payrollDisbursement)
            .where(eq(payrollDisbursement.requestId, requestId))
            .orderBy(payrollDisbursement.createdAt)

        const data = rows.map(r => ({
            id: r.id,
            created_at: r.createdAt,
            request_id: r.requestId,
            amount: Number(r.amount),
            payment_method: r.paymentMethod as PaymentMethod,
            reference_number: r.referenceNumber || undefined,
            proof_url: r.proofUrl || undefined,
            status: r.status as 'PENDING' | 'COMPLETED' | 'CANCELLED',
            completed_at: r.completedAt || undefined,
            completed_by: r.completedBy || undefined,
            notes: r.notes || undefined,
        }))

        return success(data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching disbursements: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to fetch disbursements')
    }
}
