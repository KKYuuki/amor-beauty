'use server'

import { revalidateTag } from 'next/cache'
import { eq, and, gte, lte, inArray, desc, sql, count, isNull, aliasedTable, ne } from "drizzle-orm"

import { db } from "@/server/db"
import { payrollStaffRate, payrollEntry, payrollRequest, payrollDeductions, payrollDisbursement, user, transactions, services, transactionItems } from "@/server/db/schema"
import { rateLevels } from "@/server/db/schema/rate-levels"
import { withTransaction, type TransactionClient } from "@/server/db/transactions"
import {
    PayrollStaffRate,
    PayrollEntry,
    PayrollRequest,
    PayrollRequestStatus,
    PaymentStatus,
    CreatePayrollRequestPayload,
    CompletePayrollRequestPayload,
    UpdateStaffRatePayload,
    ClientType,
    ServiceType,
    StaffRateSnapshot,
    PayrollEntryTransactionItem,
} from "@/utils/types/payroll"
import { ActionResponse, success, failure } from "@/utils/types/responses"
import { mapPayrollToAccountingPaymentMethod, normalizePaymentMethod } from "@/utils/types/payment"
import { getCurrentUser, canManagePayroll } from "@/utils/auth/permissions"
import { cache } from '@/utils/cache'

import { createAutoLedgerEntry } from "./accounting"
import { createLogs, logError } from "./logs"
import { getSetting } from "./settings"
import {
    ProcessPayrollSchema,
    PayrollFilterSchema,
    PayrollApprovalSchema,
    PayrollRejectionSchema,
    CompletePayrollSchema,
    CalculatePayrollSchema,
    ManualPayrollEntrySchema,
    CreateStaffRateSchema,
    CreateAdvanceSchema,
    CreateScheduledPaymentSchema,
} from "./payroll-schemas"

interface TaxBracket {
    min: number
    max: number
    rate: number
    label: string
}

const TAX_BRACKETS: TaxBracket[] = [
    { min: 0, max: 10000, rate: 0, label: 'Zero' },
    { min: 10000.01, max: 30000, rate: 0.05, label: 'Basic' },
    { min: 30000.01, max: 50000, rate: 0.10, label: 'Mid' },
    { min: 50000.01, max: Infinity, rate: 0.15, label: 'High' },
]

async function isPayrollTaxEnabled(): Promise<boolean> {
    try {
        const result = await getSetting('currency_tax')
        if (result.success && result.data) {
            return result.data.tax_enabled
        }
        return false
    } catch {
        return false
    }
}

function calculateTax(grossAmount: number): { rate: number; amount: number; bracket: string } {
    const bracket = TAX_BRACKETS.find(b => grossAmount >= b.min && grossAmount <= b.max)
        || TAX_BRACKETS[TAX_BRACKETS.length - 1]

    return {
        rate: bracket.rate,
        amount: Math.round(grossAmount * bracket.rate * 100) / 100,
        bracket: bracket.label,
    }
}

export interface PayrollEntryInput {
    transactionId: string
    serviceId: string
    staffId: string
    amount: number
    quantity: number
    serviceType?: ServiceType
    clientType?: ClientType
    paymentMethod?: string
    // Original transaction payment method
}

export async function getStaffRates(): Promise<ActionResponse<PayrollStaffRate[]>> {
    try {
        const rates = await db
            .select({
                rate: payrollStaffRate,
                level: rateLevels,
            })
            .from(payrollStaffRate)
            .leftJoin(rateLevels, eq(payrollStaffRate.rateLevelId, rateLevels.id))
            .where(eq(payrollStaffRate.isActive, true))
            .orderBy(payrollStaffRate.serviceType, payrollStaffRate.clientType, payrollStaffRate.rateLevelId)

        const data = rates.map(({ rate, level }) => ({
            id: rate.id,
            created_at: rate.createdAt,
            rate_name: rate.rateName,
            service_type: rate.serviceType as ServiceType,
            client_type: rate.clientType as ClientType,
            rate_level_id: rate.rateLevelId || undefined,
            rate_level_name: level?.name || undefined,
            shop_percentage: Number(rate.shopPercentage),
            staff_percentage: Number(rate.staffPercentage),
            payment_mode: (rate.paymentMode as 'PERCENTAGE' | 'FIXED') || 'PERCENTAGE',
            fixed_amount: Number(rate.fixedAmount) || 0,
            is_active: rate.isActive,
            updated_at: rate.updatedAt || undefined,
            updated_by: rate.updatedBy || undefined,
        }))

        return success(data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Failed to fetch staff rates: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch staff rates')
    }
}

export async function getApplicableRate(
    serviceType: ServiceType,
    clientType: ClientType,
    rateLevelId?: string | null
): Promise<ActionResponse<PayrollStaffRate | null>> {
    try {
        const rates = await db
            .select({
                rate: payrollStaffRate,
                level: rateLevels,
            })
            .from(payrollStaffRate)
            .leftJoin(rateLevels, eq(payrollStaffRate.rateLevelId, rateLevels.id))
            .where(
                and(
                    eq(payrollStaffRate.serviceType, serviceType),
                    eq(payrollStaffRate.clientType, clientType),
                    rateLevelId
                        ? eq(payrollStaffRate.rateLevelId, rateLevelId)
                        : isNull(payrollStaffRate.rateLevelId),
                    eq(payrollStaffRate.isActive, true)
                )
            )
            .limit(1)

        if (rates.length === 0) {
            return success(null)
        }

        const { rate, level } = rates[0]
        const data = {
            id: rate.id,
            created_at: rate.createdAt,
            rate_name: rate.rateName,
            service_type: rate.serviceType as ServiceType,
            client_type: rate.clientType as ClientType,
            rate_level_id: rate.rateLevelId || undefined,
            rate_level_name: level?.name || undefined,
            shop_percentage: Number(rate.shopPercentage),
            staff_percentage: Number(rate.staffPercentage),
            payment_mode: (rate.paymentMode as 'PERCENTAGE' | 'FIXED') || 'PERCENTAGE',
            fixed_amount: Number(rate.fixedAmount) || 0,
            is_active: rate.isActive,
            updated_at: rate.updatedAt || undefined,
            updated_by: rate.updatedBy || undefined,
        }

        return success(data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching applicable rate: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch applicable rate')
    }
}

export async function updateStaffRate(
    id: string,
    updates: UpdateStaffRatePayload
): Promise<ActionResponse<void>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    try {
        const existing = await db
            .select()
            .from(payrollStaffRate)
            .where(eq(payrollStaffRate.id, id))
            .limit(1)

        if (existing.length === 0) {
            return failure('Rate not found')
        }

        const payment_mode = updates.payment_mode ?? existing[0].paymentMode
        if (payment_mode === 'PERCENTAGE') {
            const newShopPercentage = updates.shop_percentage ?? Number(existing[0].shopPercentage)
            const newStaffPercentage = updates.staff_percentage ?? Number(existing[0].staffPercentage)
            if (newShopPercentage + newStaffPercentage !== 100) {
                return failure('Shop and staff percentages must sum to 100')
            }
        }

        const updateData: Partial<typeof payrollStaffRate.$inferInsert> = {
            updatedAt: new Date(),
            updatedBy: currentUser.id,
        }

        if (updates.rate_name !== undefined) updateData.rateName = updates.rate_name
        if (updates.service_type !== undefined) updateData.serviceType = updates.service_type
        if (updates.client_type !== undefined) updateData.clientType = updates.client_type
        if (updates.rate_level_id !== undefined) updateData.rateLevelId = updates.rate_level_id || null
        if (updates.shop_percentage !== undefined) updateData.shopPercentage = String(updates.shop_percentage)
        if (updates.staff_percentage !== undefined) updateData.staffPercentage = String(updates.staff_percentage)
        if (updates.payment_mode !== undefined) updateData.paymentMode = updates.payment_mode
        if (updates.fixed_amount !== undefined) updateData.fixedAmount = String(updates.fixed_amount)
        if (updates.is_active !== undefined) updateData.isActive = updates.is_active

        // Check for unique constraint conflict if changing service/client/level
        if (updates.service_type || updates.client_type || updates.rate_level_id !== undefined) {
            const newServiceType = updates.service_type || existing[0].serviceType
            const newClientType = updates.client_type || existing[0].clientType
            const newRateLevelId = updates.rate_level_id !== undefined ? updates.rate_level_id : existing[0].rateLevelId

            const conflictConditions = [
                eq(payrollStaffRate.serviceType, newServiceType),
                eq(payrollStaffRate.clientType, newClientType),
                ne(payrollStaffRate.id, id),
            ]
            if (newRateLevelId) {
                conflictConditions.push(eq(payrollStaffRate.rateLevelId, newRateLevelId))
            } else {
                conflictConditions.push(isNull(payrollStaffRate.rateLevelId))
            }

            const [conflict] = await db
                .select({ id: payrollStaffRate.id })
                .from(payrollStaffRate)
                .where(and(...conflictConditions))
                .limit(1)

            if (conflict) {
                return failure('A rate with this service type, client type, and rate level already exists')
            }
        }

        // Auto-regenerate rate_name if service/client/level changed
        if (updates.service_type || updates.client_type || updates.rate_level_id !== undefined) {
            const svc = updates.service_type || existing[0].serviceType
            const cli = updates.client_type || existing[0].clientType
            const lvlId = updates.rate_level_id !== undefined ? updates.rate_level_id : existing[0].rateLevelId

            let levelName = 'Standard'
            if (lvlId) {
                const [level] = await db.select().from(rateLevels).where(eq(rateLevels.id, lvlId)).limit(1)
                if (level) levelName = level.name
            }
            updateData.rateName = `${svc} - ${cli} - ${levelName}`
        }

        await db
            .update(payrollStaffRate)
            .set(updateData)
            .where(eq(payrollStaffRate.id, id))

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'PAYROLL',
                    message: `Staff rate updated: ${id} by ${currentUser.id}. Old: shop=${existing[0].shopPercentage}%/staff=${existing[0].staffPercentage}%, New: shop=${updates.shop_percentage ?? Number(existing[0].shopPercentage)}%/staff=${updates.staff_percentage ?? Number(existing[0].staffPercentage)}%`,
                },
            ],
        })

        cache.invalidate('payroll_rates')

        return success(undefined, 'Rate updated successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error updating staff rate: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to update rate')
    }
}

export interface CreateStaffRatePayload {
    rate_name: string
    service_type: ServiceType
    client_type: ClientType
    rate_level_id?: string
    shop_percentage: number
    staff_percentage: number
    payment_mode: 'PERCENTAGE' | 'FIXED'
    fixed_amount?: number
}

export async function createStaffRate(
    payload: CreateStaffRatePayload
): Promise<ActionResponse<PayrollStaffRate>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    const validation = CreateStaffRateSchema.safeParse(payload)
    if (!validation.success) {
        return failure(validation.error.issues.map(i => i.message).join(', '))
    }

    try {
        if (payload.payment_mode === 'PERCENTAGE') {
            if (payload.shop_percentage + payload.staff_percentage !== 100) {
                return failure('Shop and staff percentages must sum to 100')
            }
        }

        const existing = await db
            .select({
                id: payrollStaffRate.id,
                isActive: payrollStaffRate.isActive,
                rateName: payrollStaffRate.rateName,
            })
            .from(payrollStaffRate)
            .where(
                and(
                    eq(payrollStaffRate.serviceType, payload.service_type),
                    eq(payrollStaffRate.clientType, payload.client_type),
                    payload.rate_level_id
                        ? eq(payrollStaffRate.rateLevelId, payload.rate_level_id)
                        : isNull(payrollStaffRate.rateLevelId),
                )
            )
            .limit(1)

        if (existing.length > 0) {
            if (existing[0].isActive) {
                return failure('A rate already exists for this service/client/level combination')
            }
            return failure(`A rate already exists for this combination (currently inactive): "${existing[0].rateName}". Edit and reactivate it instead.`)
        }

        const [rate] = await db
            .insert(payrollStaffRate)
            .values({
                rateName: payload.rate_name,
                serviceType: payload.service_type,
                clientType: payload.client_type,
                rateLevelId: payload.rate_level_id,
                shopPercentage: String(payload.shop_percentage),
                staffPercentage: String(payload.staff_percentage),
                paymentMode: payload.payment_mode,
                fixedAmount: payload.fixed_amount ? String(payload.fixed_amount) : '0',
                isActive: true,
                updatedBy: currentUser.id,
            })
            .returning()

        const data: PayrollStaffRate = {
            id: rate.id,
            created_at: rate.createdAt,
            rate_name: rate.rateName,
            service_type: rate.serviceType as ServiceType,
            client_type: rate.clientType as ClientType,
            rate_level_id: rate.rateLevelId || undefined,
            shop_percentage: Number(rate.shopPercentage),
            staff_percentage: Number(rate.staffPercentage),
            payment_mode: (rate.paymentMode as 'PERCENTAGE' | 'FIXED') || 'PERCENTAGE',
            fixed_amount: Number(rate.fixedAmount) || 0,
            is_active: rate.isActive,
            updated_at: rate.updatedAt || undefined,
            updated_by: rate.updatedBy || undefined,
        }

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Staff rate created: ${rate.id} by ${currentUser.id}. New: shop=${rate.shopPercentage}%/staff=${rate.staffPercentage}%`,
            }],
        })

        cache.invalidate('payroll_rates')

        return success(data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error creating staff rate: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to create rate')
    }
}

export interface GetPayrollEntriesOptions {
    staffId?: string
    status?: PaymentStatus
    dateFrom?: string
    dateTo?: string
    branchId?: string | null
    page?: number
    pageSize?: number
}

export interface PayrollEntriesResult {
    data: PayrollEntry[]
    total: number
}

export async function getPayrollEntries(
    options: GetPayrollEntriesOptions = {}
): Promise<ActionResponse<PayrollEntriesResult>> {
    try {
        const validation = PayrollFilterSchema.safeParse(options)
        if (!validation.success) {
            return failure('Invalid filter parameters: ' + validation.error.message)
        }

        const { staffId, status, dateFrom, dateTo, branchId, page = 1, pageSize = 50 } = options

        const conditions = []

        if (staffId) {
            conditions.push(eq(payrollEntry.staffId, staffId))
        }

        if (status) {
            conditions.push(eq(payrollEntry.paymentStatus, status))
        }

        if (dateFrom) {
            conditions.push(gte(payrollEntry.serviceDate, new Date(dateFrom + "T00:00:00.000")))
        }

        if (dateTo) {
            conditions.push(lte(payrollEntry.serviceDate, new Date(dateTo + "T23:59:59.999")))
        }

        if (branchId) {
            // Include entries that either belong to this branch's transactions
            // OR have no transaction (manual entries, which are branch-agnostic)
            conditions.push(
                sql`(
                    ${payrollEntry.transactionId} IS NULL
                    OR EXISTS (
                        SELECT 1 FROM ${transactions}
                        WHERE ${transactions.id} = ${payrollEntry.transactionId}
                        AND ${transactions.branchId} = ${branchId}
                    )
                )`
            )
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined

        const offset = (page - 1) * pageSize

        const [entries, totalResult] = await Promise.all([
            db
                .select({
                    entry: payrollEntry,
                    staff: {
                        id: user.id,
                        full_name: user.fullName,
                        avatar_url: user.avatarUrl,
                        rate_level_id: user.rateLevelId,
                    },
                })
                .from(payrollEntry)
                .leftJoin(user, eq(payrollEntry.staffId, user.id))
                .where(whereClause)
                .orderBy(desc(payrollEntry.serviceDate))
                .limit(pageSize)
                .offset(offset),
            db
                .select({ total: count() })
                .from(payrollEntry)
                .where(whereClause)
                .then(res => res[0]?.total || 0),
        ])

        const data: PayrollEntry[] = entries.map(({ entry, staff }) => ({
            id: entry.id,
            created_at: entry.createdAt,
            staff_id: entry.staffId,
            transaction_id: entry.transactionId || undefined,
            appointment_id: entry.appointmentId || undefined,
            service_date: entry.serviceDate,
            service_description: entry.serviceDescription || undefined,
            client_type: (entry.clientType as ClientType) || undefined,
            gross_amount: Number(entry.grossAmount),
            shop_cut: Number(entry.shopCut),
            staff_cut: Number(entry.staffCut),
            rate_id: entry.rateId || undefined,
            payment_status: entry.paymentStatus as PaymentStatus,
            payroll_request_id: entry.payrollRequestId || undefined,
            paid_at: entry.paidAt || undefined,
            tax_rate: Number(entry.taxRate) || 0,
            tax_amount: Number(entry.taxAmount) || 0,
            net_amount: Number(entry.netAmount) || 0,
            tax_bracket: entry.taxBracket || '',
            staff_rate_snapshot: entry.staffRateSnapshot || undefined,
            shop_rate_snapshot: entry.shopRateSnapshot || undefined,
            rate_version: entry.rateVersion || undefined,
            payment_method: (entry.paymentMethod ? normalizePaymentMethod(entry.paymentMethod) : undefined) as string | undefined,
            staff: staff ? {
                id: staff.id,
                full_name: staff.full_name || '',
                avatar_url: staff.avatar_url || undefined,
                rate_level_id: staff.rate_level_id || undefined,
            } : undefined,
        }))

        return success({ data, total: totalResult })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching payroll entries: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch payroll entries')
    }
}

export async function getPendingEntries(staffId: string): Promise<ActionResponse<PayrollEntry[]>> {
    try {
        if (!staffId) {
            return failure('Staff ID is required')
        }

        const entries = await db
            .select({
                entry: payrollEntry,
                staff: {
                    id: user.id,
                    full_name: user.fullName,
                    avatar_url: user.avatarUrl,
                    rate_level_id: user.rateLevelId,
                },
            })
            .from(payrollEntry)
            .leftJoin(user, eq(payrollEntry.staffId, user.id))
            .where(
                and(
                    eq(payrollEntry.staffId, staffId),
                    eq(payrollEntry.paymentStatus, 'PENDING'),
                    isNull(payrollEntry.payrollRequestId)
                )
            )
            .orderBy(desc(payrollEntry.serviceDate))

        const data: PayrollEntry[] = entries.map(({ entry, staff }) => ({
            id: entry.id,
            created_at: entry.createdAt,
            staff_id: entry.staffId,
            transaction_id: entry.transactionId || undefined,
            appointment_id: entry.appointmentId || undefined,
            service_date: entry.serviceDate,
            service_description: entry.serviceDescription || undefined,
            client_type: (entry.clientType as ClientType) || undefined,
            gross_amount: Number(entry.grossAmount),
            shop_cut: Number(entry.shopCut),
            staff_cut: Number(entry.staffCut),
            rate_id: entry.rateId || undefined,
            payment_status: entry.paymentStatus as PaymentStatus,
            payroll_request_id: entry.payrollRequestId || undefined,
            paid_at: entry.paidAt || undefined,
            tax_rate: Number(entry.taxRate) || 0,
            tax_amount: Number(entry.taxAmount) || 0,
            net_amount: Number(entry.netAmount) || 0,
            tax_bracket: entry.taxBracket || '',
            staff_rate_snapshot: entry.staffRateSnapshot || undefined,
            shop_rate_snapshot: entry.shopRateSnapshot || undefined,
            rate_version: entry.rateVersion || undefined,
            payment_method: (entry.paymentMethod ? normalizePaymentMethod(entry.paymentMethod) : undefined) as string | undefined,
            staff: staff ? {
                id: staff.id,
                full_name: staff.full_name || '',
                avatar_url: staff.avatar_url || undefined,
                rate_level_id: staff.rate_level_id || undefined,
            } : undefined,
        }))

        return success(data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching pending entries: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch pending entries')
    }
}

/**
 * INTERNAL USE ONLY — called from sales.ts transaction creation.
 * Not intended for direct client invocation.
 */
export async function calculateAndCreatePayrollEntry(
    input: PayrollEntryInput,
    tx?: TransactionClient
): Promise<ActionResponse<{ entryId: string }>> {
    const dbClient = tx || db

    try {
        // Get service details to determine service type and client type
        const { serviceId: _serviceId, staffId, amount, transactionId } = input

        let serviceType: ServiceType
        let clientType: ClientType

        if (input.serviceType) {
            serviceType = input.serviceType
        } else if (input.serviceId && input.serviceId.length > 0) {
            const serviceRecord = await dbClient
                .select({ serviceType: services.serviceType })
                .from(services)
                .where(eq(services.id, input.serviceId))
                .limit(1)

            serviceType = (serviceRecord[0]?.serviceType as ServiceType) || 'MANUAL'
        } else {
            // No service context available — record as MANUAL, not TATTOO
            serviceType = 'MANUAL'
        }

        if (input.clientType) {
            clientType = input.clientType
        } else {
            clientType = 'WALKIN'
        }

        // Fetch the staff member's rate level from user record
        const staffRecord = await dbClient
            .select({ rateLevelId: user.rateLevelId })
            .from(user)
            .where(eq(user.id, staffId))
            .limit(1)

        const rateLevelId = staffRecord[0]?.rateLevelId

        // Three-tier fallback chain:
        //  1st: exact match (serviceType + clientType + rateLevelId)
        //  2nd: level-less fallback (serviceType + clientType, no rate level)
        //  3rd: walkin-default (serviceType + WALKIN, no rate level)
        let rate: PayrollStaffRate | null = null
        const fallbackAttempts: Array<{ serviceType: ServiceType; clientType: ClientType; rateLevelId: string | undefined | null }> = [
            { serviceType, clientType, rateLevelId },
            { serviceType, clientType, rateLevelId: null },
            { serviceType, clientType: 'WALKIN', rateLevelId: null },
        ]

        for (const attempt of fallbackAttempts) {
            const rateResult = await getApplicableRate(
                attempt.serviceType,
                attempt.clientType,
                attempt.rateLevelId ?? undefined
            )
            if (rateResult.success && rateResult.data) {
                rate = rateResult.data
                break
            }
        }

        if (!rate) {
            return failure(
                `No rate found for ${serviceType} / ${clientType}` +
                (rateLevelId ? ` (level: ${rateLevelId})` : '') +
                ` — tried exact match, standard rate, and walk-in default. ` +
                `Configure a rate in Payroll Settings.`
            )
        }

        let shopCut: number
        let staffCut: number

        if (rate.payment_mode === 'FIXED') {
            if (rate.fixed_amount > amount) {
                return failure('Fixed amount cannot exceed gross amount')
            }
            staffCut = rate.fixed_amount
            shopCut = amount - staffCut
        } else {
            shopCut = Math.round(amount * (rate.shop_percentage / 100) * 100) / 100
            staffCut = Math.round(amount * (rate.staff_percentage / 100) * 100) / 100
        }

        // Calculate tax withholding (only if tax is enabled in settings)
        const taxEnabled = await isPayrollTaxEnabled()
        const taxInfo = taxEnabled
            ? calculateTax(staffCut)
            : { rate: 0, amount: 0, bracket: 'Zero' }
        const taxAmount = Math.round(taxInfo.amount * 100) / 100
        const netAmount = taxEnabled
            ? Math.round((staffCut - taxAmount) * 100) / 100
            : staffCut

        // Create payroll entry using the transaction client with rate snapshot
        const [entry] = await dbClient
            .insert(payrollEntry)
            .values({
                staffId: staffId,
                transactionId: transactionId,
                serviceDate: new Date(),
                clientType: clientType,
                serviceType: serviceType,
                grossAmount: String(amount),
                shopCut: String(shopCut),
                staffCut: String(staffCut),
                rateId: rate.id,
                paymentStatus: 'PENDING',
                taxRate: taxInfo.rate,
                taxAmount: String(taxAmount),
                netAmount: String(netAmount),
                taxBracket: taxInfo.bracket,
                staffRateSnapshot: {
                    percentage: rate.staff_percentage,
                    fixedAmount: rate.payment_mode === 'FIXED' ? rate.fixed_amount : undefined,
                    serviceType: rate.service_type,
                    clientType: clientType,
                    rateLevelId: rate.rate_level_id,
                    rateLevelName: rate.rate_level_name,
                } as StaffRateSnapshot,
                shopRateSnapshot: {
                    percentage: rate.shop_percentage,
                    fixedAmount: undefined,
                },
                rateVersion: 1,
                paymentMethod: input.paymentMethod ? normalizePaymentMethod(input.paymentMethod) : null,
            })
            .returning()

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'PAYROLL',
                    message: `Payroll entry created: ${entry.id} for staff ${staffId}`,
                },
            ],
        })

        return success({ entryId: entry.id }, 'Payroll entry calculated and created')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error calculating payroll entry: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to calculate payroll entry')
    }
}

export interface CreateManualPayrollEntryPayload {
    staff_id: string
    amount: number
    description: string
    service_date: Date
    notes?: string
    service_type?: ServiceType
    rate_id?: string
}

export async function createManualPayrollEntry(
    payload: CreateManualPayrollEntryPayload
): Promise<ActionResponse<{ entryId: string }>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) return failure('Unauthorized')

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) return failure('Payroll management access required')

    const validation = ManualPayrollEntrySchema.safeParse(payload)
    if (!validation.success) {
        return failure(validation.error.issues.map(i => i.message).join(', '))
    }
    const validatedPayload = validation.data

    try {
        const serviceType = validatedPayload.service_type || 'HAIR'

        // Get staff rate level for rate lookup
        const [staffRecord] = await db
            .select({ rateLevelId: user.rateLevelId })
            .from(user)
            .where(eq(user.id, validatedPayload.staff_id))
            .limit(1)

        const rateLevelId = staffRecord?.rateLevelId

        // Look up applicable rate; MANUAL entries or missing rates fall back to 100% staff / 0% shop
        let shopCut: number
        let staffCut: number

        if (serviceType === 'MANUAL') {
            shopCut = 0
            staffCut = validatedPayload.amount
        } else {
            const rateResult = await getApplicableRate(serviceType, 'WALKIN', rateLevelId)
            if (rateResult.success && rateResult.data) {
                const rate = rateResult.data
                if (rate.payment_mode === 'FIXED') {
                    staffCut = Math.min(rate.fixed_amount, validatedPayload.amount)
                    shopCut = validatedPayload.amount - staffCut
                } else {
                    shopCut = (validatedPayload.amount * rate.shop_percentage) / 100
                    staffCut = (validatedPayload.amount * rate.staff_percentage) / 100
                }
            } else {
                // No rate found — full amount to staff
                shopCut = 0
                staffCut = validatedPayload.amount
            }
        }

        const taxEnabled = await isPayrollTaxEnabled()
        const taxInfo = taxEnabled
            ? calculateTax(staffCut)
            : { rate: 0, amount: 0, bracket: 'Zero' }
        const netAmount = taxEnabled
            ? staffCut - taxInfo.amount
            : staffCut
        if (netAmount < 0) {
            return failure('Tax amount exceeds staff cut')
        }

        const [entry] = await db
            .insert(payrollEntry)
            .values({
                staffId: validatedPayload.staff_id,
                serviceDate: validatedPayload.service_date,
                clientType: 'WALKIN',
                serviceType: serviceType,
                grossAmount: String(validatedPayload.amount),
                shopCut: String(shopCut),
                staffCut: String(staffCut),
                paymentStatus: 'PENDING',
                taxRate: taxInfo.rate,
                taxAmount: String(taxInfo.amount),
                netAmount: String(netAmount),
                taxBracket: taxInfo.bracket,
                serviceDescription: validatedPayload.description || null,
                rateId: validatedPayload.rate_id || null,
            })
            .returning()

        // Log warning if rate_id is provided for audit trail awareness
        if (validatedPayload.rate_id) {
            await logError({
                type: 'PAYROLL',
                message: `Manual payroll entry ${entry.id} linked to rate ${validatedPayload.rate_id}. Verify amounts match rate config.`
            })
        }

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Manual payroll entry created: ${entry.id} for staff ${validatedPayload.staff_id}`,
            }],
        })

        revalidateTag('payroll_dashboard')
        revalidateTag('staff_payroll')
        revalidateTag('business_insights')
        revalidateTag('exec_accounting')

        return success({ entryId: entry.id })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error creating manual payroll entry: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to create manual payroll entry')
    }
}

export interface GetPayrollRequestsOptions {
    staffId?: string
    status?: PayrollRequestStatus
    page?: number
    pageSize?: number
    branchId?: string | null
}

export interface PayrollRequestsResult {
    data: PayrollRequest[]
    total: number
}

export async function getPayrollRequests(
    options: GetPayrollRequestsOptions = {}
): Promise<ActionResponse<PayrollRequestsResult>> {
    try {
        const { staffId, status, page = 1, pageSize = 50, branchId } = options

        const conditions = []

        if (staffId) {
            conditions.push(eq(payrollRequest.staffId, staffId))
        }

        if (status) {
            conditions.push(eq(payrollRequest.status, status))
        }

        // Filter by branch if provided - join through payroll entries to transactions
        if (branchId) {
            conditions.push(
                sql`${payrollRequest.id} IN (
                    SELECT DISTINCT pr.id
                    FROM ${payrollRequest} pr
                    JOIN ${payrollEntry} pe ON pe.payroll_request_id = pr.id
                    JOIN transactions t ON t.id = pe.transaction_id
                    WHERE t.branch_id = ${branchId}
                )`
            )
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined

        const offset = (page - 1) * pageSize

        const requesterUser = aliasedTable(user, 'requester_user')

        const [requests, totalResult] = await Promise.all([
            db
                .select({
                    request: payrollRequest,
                    staff: {
                        id: user.id,
                        full_name: user.fullName,
                        avatar_url: user.avatarUrl,
                    },
                    requester: {
                        id: requesterUser.id,
                        full_name: requesterUser.fullName,
                    },
                })
                .from(payrollRequest)
                .leftJoin(user, eq(payrollRequest.staffId, user.id))
                .leftJoin(requesterUser, eq(payrollRequest.requestedBy, requesterUser.id))
                .where(whereClause)
                .orderBy(desc(payrollRequest.createdAt))
                .limit(pageSize)
                .offset(offset),
            db
                .select({ total: count() })
                .from(payrollRequest)
                .where(whereClause)
                .then(res => res[0]?.total || 0),
        ])

        const data: PayrollRequest[] = requests.map(({ request, staff, requester }) => ({
            id: request.id,
            created_at: request.createdAt,
            staff_id: request.staffId,
            period_type: request.periodType as import("@/utils/types/payroll").PayoutPeriod,
            period_start: request.periodStart,
            period_end: request.periodEnd,
            total_gross: Number(request.totalGross),
            total_shop_cut: Number(request.totalShopCut),
            total_staff_cut: Number(request.totalStaffCut),
            total_net_amount: Number(request.totalNetAmount),
            total_tax_amount: Number(request.totalTaxAmount),
            status: request.status as PayrollRequestStatus,
            requested_by: request.requestedBy,
            requested_at: request.requestedAt,
            confirmed_by: request.confirmedBy || undefined,
            confirmed_at: request.confirmedAt || undefined,
            payment_method: (normalizePaymentMethod(request.paymentMethod || '') as import("@/utils/types/payroll").PaymentMethod) || undefined,
            completed_by: request.completedBy || undefined,
            completed_at: request.completedAt || undefined,
            cancelled_by: request.cancelledBy || undefined,
            cancelled_at: request.cancelledAt || undefined,
            cancel_reason: request.cancelReason || undefined,
            notes: request.notes || undefined,
            reference_number: request.referenceNumber || undefined,
            proof_url: request.proofUrl || undefined,
            staff: staff ? {
                id: staff.id,
                full_name: staff.full_name || '',
                avatar_url: staff.avatar_url || undefined,
            } : undefined,
            requester: requester ? {
                id: requester.id,
                full_name: requester.full_name || '',
            } : undefined,
        }))

        return success({ data, total: totalResult })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching payroll requests: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch payroll requests')
    }
}

export async function createPayrollRequest(
    payload: CreatePayrollRequestPayload
): Promise<ActionResponse<PayrollRequest>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    try {
        const validation = ProcessPayrollSchema.safeParse(payload)
        if (!validation.success) {
            return failure('Invalid input: ' + validation.error.message)
        }

        const { staff_id, period_type, period_start, period_end, entry_ids, notes } = payload

        if (entry_ids.length === 0) {
            return failure('At least one entry is required')
        }

        const result = await db.transaction(async (tx) => {
            const entries = await tx
                .select()
                .from(payrollEntry)
                .where(
                    and(
                        inArray(payrollEntry.id, entry_ids),
                        eq(payrollEntry.staffId, staff_id),
                        eq(payrollEntry.paymentStatus, 'PENDING')
                    )
                )

            if (entries.length !== entry_ids.length) {
                throw new Error('Some entries were not found or are not pending')
            }

            const duplicateEntries = await tx
                .select({ id: payrollEntry.id })
                .from(payrollEntry)
                .where(
                    and(
                        inArray(payrollEntry.id, entry_ids),
                        sql`${payrollEntry.paymentStatus} IN ('REQUESTED', 'CONFIRMED')`,
                        sql`${payrollEntry.payrollRequestId} IS NOT NULL`
                    )
                )

            if (duplicateEntries.length > 0) {
                throw new Error(
                    `${duplicateEntries.length} entry/entries are already in an active payroll request. ` +
                    `Entry IDs already claimed: ${duplicateEntries.map(e => e.id.slice(0, 8)).join(', ')}`
                )
            }

            let totalGross = 0
            let totalShopCut = 0
            let totalStaffCut = 0
            let totalNetAmount = 0
            let totalTaxAmount = 0

            for (const entry of entries) {
                totalGross += Number(entry.grossAmount)
                totalShopCut += Number(entry.shopCut)
                totalStaffCut += Number(entry.staffCut)
                totalNetAmount += Number(entry.netAmount ?? entry.staffCut)
                totalTaxAmount += Number(entry.taxAmount || 0)
            }

            const [request] = await tx
                .insert(payrollRequest)
                .values({
                    staffId: staff_id,
                    periodType: period_type,
                    periodStart: period_start,
                    periodEnd: period_end,
                    totalGross: String(totalGross),
                    totalShopCut: String(totalShopCut),
                    totalStaffCut: String(totalStaffCut),
                    totalNetAmount: String(totalNetAmount),
                    totalTaxAmount: String(totalTaxAmount),
                    status: 'REQUESTED',
                    requestedBy: currentUser.id,
                    requestedAt: new Date(),
                    notes: notes,
                })
                .returning()

            await tx
                .update(payrollEntry)
                .set({
                    payrollRequestId: request.id,
                    paymentStatus: 'REQUESTED',
                })
                .where(inArray(payrollEntry.id, entry_ids))

            const data: PayrollRequest = {
                id: request.id,
                created_at: request.createdAt,
                staff_id: request.staffId,
                period_type: request.periodType as import("@/utils/types/payroll").PayoutPeriod,
                period_start: request.periodStart,
                period_end: request.periodEnd,
                total_gross: Number(request.totalGross),
                total_shop_cut: Number(request.totalShopCut),
                total_staff_cut: Number(request.totalStaffCut),
                total_net_amount: Number(request.totalNetAmount),
                total_tax_amount: Number(request.totalTaxAmount),
                status: request.status as PayrollRequestStatus,
                requested_by: request.requestedBy,
                requested_at: request.requestedAt,
                confirmed_by: request.confirmedBy || undefined,
                confirmed_at: request.confirmedAt || undefined,
                payment_method: (normalizePaymentMethod(request.paymentMethod || '') as import("@/utils/types/payroll").PaymentMethod) || undefined,
                completed_by: request.completedBy || undefined,
                completed_at: request.completedAt || undefined,
                cancelled_by: request.cancelledBy || undefined,
                cancelled_at: request.cancelledAt || undefined,
                cancel_reason: request.cancelReason || undefined,
                notes: request.notes || undefined,
            }

            return { request, data }
        })

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'PAYROLL',
                    message: `Payroll request created: ${result.request.id} for staff ${result.data.staff_id} by ${currentUser.id}`,
                },
            ],
        })

        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')

        // Push notification: notify admins of new payroll request
        // Fire-and-forget — never blocks the response
        db
          .select({ fullName: user.fullName })
          .from(user)
          .where(eq(user.id, staff_id))
          .limit(1)
          .catch(() => {})

        return success(result.data, 'Payroll request created successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error creating payroll request: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to create payroll request')
    }
}

export async function confirmPayrollRequest(
    requestId: string
): Promise<ActionResponse<void>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    try {
        const validation = PayrollApprovalSchema.safeParse({ request_id: requestId })
        if (!validation.success) {
            return failure('Invalid request ID: ' + validation.error.message)
        }

        const [request] = await db
            .select()
            .from(payrollRequest)
            .where(eq(payrollRequest.id, requestId))
            .limit(1)

        if (!request) {
            return failure('Payroll request not found')
        }

        if (request.status !== 'REQUESTED') {
            return failure('Only requested payrolls can be confirmed')
        }

        const txResult = await withTransaction(async (tx) => {
            await tx
                .update(payrollRequest)
                .set({
                    status: 'CONFIRMED',
                    confirmedBy: currentUser.id,
                    confirmedAt: new Date(),
                })
                .where(eq(payrollRequest.id, requestId))

            await tx
                .update(payrollEntry)
                .set({ paymentStatus: 'CONFIRMED' })
                .where(eq(payrollEntry.payrollRequestId, requestId))
        }, { action: 'PAYROLL', userId: currentUser.id })

        if (!txResult.success) {
            return failure(txResult.error || 'Failed to confirm payroll request')
        }

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'PAYROLL',
                    message: `Payroll request confirmed: ${requestId} by ${currentUser.id}`,
                },
            ],
        })

        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')

        return success(undefined, 'Payroll request confirmed successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error confirming payroll request: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to confirm payroll request')
    }
}

export async function completePayrollRequest(
    requestId: string,
    payload: CompletePayrollRequestPayload
): Promise<ActionResponse<void>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    try {
        const validation = CompletePayrollSchema.safeParse({
            request_id: requestId,
            payment_method: payload.payment_method,
            notes: payload.notes,
        })
        if (!validation.success) {
            return failure('Invalid input: ' + validation.error.message)
        }

        const [request] = await db
            .select()
            .from(payrollRequest)
            .where(eq(payrollRequest.id, requestId))
            .limit(1)

        if (!request) {
            return failure('Payroll request not found')
        }

        if (request.status !== 'CONFIRMED') {
            return failure('Only confirmed payrolls can be completed')
        }

        // Upload proof file if provided
        let proofUrl: string | undefined
        if (payload.proof_file) {
            try {
                const { uploadFile } = await import('@/utils/storage')
                const buffer = Buffer.from(await payload.proof_file.arrayBuffer())
                const extension = payload.proof_file.name.split('.').pop() || 'jpg'
                const key = `payroll-proofs/${requestId}-${Date.now()}.${extension}`
                const uploadResult = await uploadFile(buffer, key, payload.proof_file.type)
                proofUrl = uploadResult.url
            } catch (uploadError) {
                await logError({
                    type: 'PAYROLL',
                    message: `Failed to upload payroll proof: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`
                })
            }
        }

        const updateData: Record<string, unknown> = {
            status: 'COMPLETED',
            paymentMethod: normalizePaymentMethod(payload.payment_method),
            completedBy: currentUser.id,
            completedAt: new Date(),
        }
        if (payload.reference_number) updateData.referenceNumber = payload.reference_number
        if (proofUrl) updateData.proofUrl = proofUrl

        await db
            .update(payrollRequest)
            .set(updateData)
            .where(eq(payrollRequest.id, requestId))

        await db
            .update(payrollEntry)
            .set({
                paymentStatus: 'PAID',
                paidAt: new Date(),
            })
            .where(eq(payrollEntry.payrollRequestId, requestId))

        // Get staff name for the ledger entry
        const [staffUser] = await db
            .select({ fullName: user.fullName })
            .from(user)
            .where(eq(user.id, request.staffId))
            .limit(1)
        const staffName = staffUser?.fullName || 'Unknown Staff'

        // Get the first payroll entry for source_id and branch_id
        const [firstPayrollEntry] = await db
            .select({
                id: payrollEntry.id,
                branchId: transactions.branchId,
            })
            .from(payrollEntry)
            .innerJoin(transactions, eq(payrollEntry.transactionId, transactions.id))
            .where(eq(payrollEntry.payrollRequestId, requestId))
            .limit(1)

        // Apply pending deductions for this staff member
        try {
            const pendingDeductions = await db
                .select()
                .from(payrollDeductions)
                .where(
                    and(
                        eq(payrollDeductions.userId, request.staffId),
                        eq(payrollDeductions.status, 'PENDING')
                    )
                )

            if (pendingDeductions.length > 0) {
                const totalDeduction = pendingDeductions.reduce(
                    (sum, d) => sum + d.amount, 0
                )

                // Mark deductions as applied
                for (const deduction of pendingDeductions) {
                    await db
                        .update(payrollDeductions)
                        .set({
                            status: 'DEDUCTED',
                            deductedAt: new Date(),
                        })
                        .where(eq(payrollDeductions.id, deduction.id))
                }

                createLogs({
                    logs: [{
                        level: 'INFO',
                        type: 'PAYROLL',
                        message: `Applied ${pendingDeductions.length} deductions totaling ${totalDeduction} for staff ${request.staffId}`,
                    }],
                })

                for (const deduction of pendingDeductions) {
                    const deductionCategory = deduction.type === 'ADVANCE'
                        ? 'SALARY_ADVANCES'
                        : deduction.type === 'ADJUSTMENT'
                        ? 'PAYROLL_ADJUSTMENTS'
                        : 'PAYROLL_DEDUCTIONS'

                    try {
                        await createAutoLedgerEntry('PAYROLL', firstPayrollEntry?.id || request.id, {
                            entry_date: new Date(),
                            entry_type: 'LIABILITY',
                            category: deductionCategory,
                            description: `${deduction.type || 'Deduction'} - ${deduction.reason || 'No reason'} - Staff: ${staffName}`,
                            reference: `PAYROLL-DEDUCT-${requestId.slice(0, 8)}`,
                            debit: 0,
                            credit: Number(deduction.amount),
                            branch_id: firstPayrollEntry?.branchId || null,
                        }, currentUser.id)
                    } catch (ledgerError) {
                        await logError({
                            type: 'ACCOUNTING',
                            message: `Failed to create accounting entry for deduction ${deduction.id}: ${ledgerError instanceof Error ? ledgerError.message : String(ledgerError)}`
                        })
                    }
                }
            }
        } catch (deductionError) {
            await logError({
                type: 'PAYROLL',
                message: `Failed to apply deductions for payroll ${requestId}: ${deductionError instanceof Error ? deductionError.message : String(deductionError)}`
            })
            // Don't fail the payment - deductions are best-effort
        }

        // Check if disbursements already exist for this request
        if (!payload.skip_disbursement_check) {
            const existingDisbursements = await db
                .select({ count: count() })
                .from(payrollDisbursement)
                .where(eq(payrollDisbursement.requestId, requestId))

            const hasExistingDisbursements = Number(existingDisbursements[0]?.count || 0) > 0

            // Prevent mixing staggered disbursements with direct completion
            if (hasExistingDisbursements) {
                return failure('This payroll request already has disbursements. Please use the disbursement flow to complete payment.')
            }
        }

        // Create accounting entries for payroll payment
        if (!payload.skip_accounting_entry) {
            try {
                await createAutoLedgerEntry(
                    'PAYROLL',
                    firstPayrollEntry?.id || request.id,
                    {
                        entry_date: new Date(),
                        entry_type: 'EXPENSE',
                        category: 'PAYROLL',
                        description: `Payroll payment (net) - Staff: ${staffName}`,
                        reference: `PAYROLL-${requestId.slice(0, 8)}`,
                        debit: Number(request.totalNetAmount),
                        credit: 0,
                        branch_id: firstPayrollEntry?.branchId || null,
                        payment_method: mapPayrollToAccountingPaymentMethod(payload.payment_method),
                    },
                    currentUser.id
                )

                // Create liability entry for tax withholding if tax is enabled
                const taxEnabledForRequest = await isPayrollTaxEnabled()
                if (taxEnabledForRequest && Number(request.totalTaxAmount) > 0) {
                    await createAutoLedgerEntry(
                        'PAYROLL',
                        firstPayrollEntry?.id || request.id,
                        {
                            entry_date: new Date(),
                            entry_type: 'LIABILITY',
                            category: 'TAX_WITHHOLDING',
                            description: `Tax withholding - Staff: ${staffName}`,
                            reference: `TAX-${requestId.slice(0, 8)}`,
                            debit: 0,
                            credit: Number(request.totalTaxAmount),
                            branch_id: firstPayrollEntry?.branchId || null,
                        },
                        currentUser.id
                    )
                }
            } catch (accountingError) {
                // Log but don't fail the payroll completion
                await logError({
                    type: 'ACCOUNTING',
                    message: `Failed to create accounting entry for payroll ${requestId}: ${accountingError instanceof Error ? accountingError.message : String(accountingError)}`
                })
            }
        }

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'PAYROLL',
                    message: `Payroll request completed: ${requestId} by ${currentUser.id} via ${payload.payment_method}`,
                },
            ],
        })

        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')

        return success(undefined, 'Payment completed successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error completing payroll request: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to complete payment')
    }
}

export async function cancelPayrollRequest(
    requestId: string,
    reason: string
): Promise<ActionResponse<void>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    try {
        const validation = PayrollRejectionSchema.safeParse({
            request_id: requestId,
            reason: reason,
        })
        if (!validation.success) {
            return failure('Invalid input: ' + validation.error.message)
        }

        await db.transaction(async (tx) => {
            const [request] = await tx
                .select()
                .from(payrollRequest)
                .where(eq(payrollRequest.id, requestId))
                .limit(1)

            if (!request) {
                throw new Error('Payroll request not found')
            }

            if (request.status === 'COMPLETED' || request.status === 'CANCELLED') {
                throw new Error('Cannot cancel completed or already cancelled payrolls')
            }

            await tx
                .update(payrollRequest)
                .set({
                    status: 'CANCELLED',
                    cancelledBy: currentUser.id,
                    cancelledAt: new Date(),
                    cancelReason: reason,
                })
                .where(eq(payrollRequest.id, requestId))

            await tx
                .update(payrollEntry)
                .set({
                    paymentStatus: 'PENDING',
                    payrollRequestId: null,
                })
                .where(eq(payrollEntry.payrollRequestId, requestId))
        })

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'PAYROLL',
                    message: `Payroll request cancelled: ${requestId} by ${currentUser.id}. Reason: ${reason}`,
                },
            ],
        })

        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')

        return success(undefined, 'Payroll request cancelled successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error cancelling payroll request: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to cancel payroll request')
    }
}

export interface PayrollDashboardSummary {
    pendingAmount: number
    pendingCount: number
    requestedAmount: number
    requestedCount: number
    confirmedAmount: number
    confirmedCount: number
    paidThisMonth: number
    paidThisMonthCount: number
}

export async function getPayrollDashboardSummary(
    branchId?: string | null,
    dateFrom?: string | null,
    dateTo?: string | null
): Promise<ActionResponse<PayrollDashboardSummary>> {
    try {
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        const effectiveDateFrom = dateFrom
            ? new Date(dateFrom + "T00:00:00.000")
            : startOfMonth
        const effectiveDateTo = dateTo
            ? new Date(dateTo + "T23:59:59.999")
            : endOfMonth

        // Build branch filter condition for payroll entries (via transactions)
        // Also includes entries without a transaction (manual entries), which are branch-agnostic
        const entryBranchFilter = branchId
            ? sql`(
                ${payrollEntry.transactionId} IS NULL
                OR EXISTS (
                    SELECT 1 FROM transactions t
                    WHERE t.id = ${payrollEntry.transactionId}
                    AND t.branch_id = ${branchId}
                )
            )`
            : undefined

        // Build branch filter condition for payroll requests (via payroll entries -> transactions)
        const requestBranchFilter = branchId
            ? sql`EXISTS (
                SELECT 1 FROM ${payrollEntry} pe
                JOIN transactions t ON t.id = pe.transaction_id
                WHERE pe.payroll_request_id = ${payrollRequest.id}
                AND t.branch_id = ${branchId}
            )`
            : undefined

        const [
            pendingResult,
            requestedResult,
            confirmedResult,
            paidThisMonthResult,
        ] = await Promise.all([
            db
                .select({
                    total: sql<number>`COALESCE(SUM(${payrollEntry.staffCut}), 0)`,
                    count: count(),
                })
                .from(payrollEntry)
                .where(
                    entryBranchFilter
                        ? and(
                            eq(payrollEntry.paymentStatus, 'PENDING'),
                            gte(payrollEntry.serviceDate, effectiveDateFrom),
                            lte(payrollEntry.serviceDate, effectiveDateTo),
                            entryBranchFilter
                        )
                        : and(
                            eq(payrollEntry.paymentStatus, 'PENDING'),
                            gte(payrollEntry.serviceDate, effectiveDateFrom),
                            lte(payrollEntry.serviceDate, effectiveDateTo)
                        )
                ),
            db
                .select({
                    total: sql<number>`COALESCE(SUM(${payrollRequest.totalStaffCut}), 0)`,
                    count: count(),
                })
                .from(payrollRequest)
                .where(
                    requestBranchFilter
                        ? and(
                            eq(payrollRequest.status, 'REQUESTED'),
                            gte(payrollRequest.requestedAt, effectiveDateFrom),
                            lte(payrollRequest.requestedAt, effectiveDateTo),
                            requestBranchFilter
                        )
                        : and(
                            eq(payrollRequest.status, 'REQUESTED'),
                            gte(payrollRequest.requestedAt, effectiveDateFrom),
                            lte(payrollRequest.requestedAt, effectiveDateTo)
                        )
                ),
            db
                .select({
                    total: sql<number>`COALESCE(SUM(${payrollRequest.totalStaffCut}), 0)`,
                    count: count(),
                })
                .from(payrollRequest)
                .where(
                    requestBranchFilter
                        ? and(
                            eq(payrollRequest.status, 'CONFIRMED'),
                            gte(payrollRequest.requestedAt, effectiveDateFrom),
                            lte(payrollRequest.requestedAt, effectiveDateTo),
                            requestBranchFilter
                        )
                        : and(
                            eq(payrollRequest.status, 'CONFIRMED'),
                            gte(payrollRequest.requestedAt, effectiveDateFrom),
                            lte(payrollRequest.requestedAt, effectiveDateTo)
                        )
                ),
            db
                .select({
                    total: sql<number>`COALESCE(SUM(${payrollRequest.totalStaffCut}), 0)`,
                    count: count(),
                })
                .from(payrollRequest)
                .where(
                    requestBranchFilter
                        ? and(
                            eq(payrollRequest.status, 'COMPLETED'),
                            gte(payrollRequest.completedAt, effectiveDateFrom),
                            lte(payrollRequest.completedAt, effectiveDateTo),
                            requestBranchFilter
                        )
                        : and(
                            eq(payrollRequest.status, 'COMPLETED'),
                            gte(payrollRequest.completedAt, effectiveDateFrom),
                            lte(payrollRequest.completedAt, effectiveDateTo)
                        )
                ),
        ])

        const summary: PayrollDashboardSummary = {
            pendingAmount: Number(pendingResult[0]?.total || 0),
            pendingCount: pendingResult[0]?.count || 0,
            requestedAmount: Number(requestedResult[0]?.total || 0),
            requestedCount: requestedResult[0]?.count || 0,
            confirmedAmount: Number(confirmedResult[0]?.total || 0),
            confirmedCount: confirmedResult[0]?.count || 0,
            paidThisMonth: Number(paidThisMonthResult[0]?.total || 0),
            paidThisMonthCount: paidThisMonthResult[0]?.count || 0,
        }

        return success(summary)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching payroll dashboard summary: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch dashboard summary')
    }
}

export interface StaffPayrollSummaryItem {
    staff_id: string
    full_name: string
    avatar_url?: string
    rate_level_id?: string
    pending_amount: number
    pending_count: number
    paid_amount: number
    paid_count: number
    total_earned: number
    total_count: number
}

export async function getStaffPayrollSummary(
    branchId?: string | null,
    dateFrom?: string | null,
    dateTo?: string | null
): Promise<ActionResponse<StaffPayrollSummaryItem[]>> {
    try {
        // Build branch filter condition (via transactions)
        // Also includes entries without a transaction (manual entries), which are branch-agnostic
        const branchFilter = branchId
            ? sql`(
                ${payrollEntry.transactionId} IS NULL
                OR EXISTS (
                    SELECT 1 FROM transactions t
                    WHERE t.id = ${payrollEntry.transactionId}
                    AND t.branch_id = ${branchId}
                )
            )`
            : undefined

        const effectiveDateFrom = dateFrom
            ? new Date(dateFrom + "T00:00:00.000")
            : new Date(0) // epoch start
        const effectiveDateTo = dateTo
            ? new Date(dateTo + "T23:59:59.999")
            : new Date()

        // Build the base date + branch conditions
        const baseConditions = [
            gte(payrollEntry.serviceDate, effectiveDateFrom),
            lte(payrollEntry.serviceDate, effectiveDateTo),
        ]
        if (branchFilter) {
            baseConditions.push(branchFilter)
        }

        // Fetch ALL entries for this period (excluding CANCELLED) grouped by staff
        const allResults = await db
            .select({
                staffId: payrollEntry.staffId,
                fullName: user.fullName,
                avatarUrl: user.avatarUrl,
                rateLevelId: user.rateLevelId,
                totalAmount: sql<number>`COALESCE(SUM(${payrollEntry.staffCut}), 0)`,
                count: count(),
            })
            .from(payrollEntry)
            .leftJoin(user, eq(payrollEntry.staffId, user.id))
            .where(
                and(
                    ...baseConditions,
                    sql`${payrollEntry.paymentStatus} != 'CANCELLED'`
                )
            )
            .groupBy(payrollEntry.staffId, user.fullName, user.avatarUrl, user.rateLevelId)

        // Fetch PENDING entries (no request ID) grouped by staff
        const pendingResults = await db
            .select({
                staffId: payrollEntry.staffId,
                totalAmount: sql<number>`COALESCE(SUM(${payrollEntry.staffCut}), 0)`,
                count: count(),
            })
            .from(payrollEntry)
            .where(
                and(
                    ...baseConditions,
                    eq(payrollEntry.paymentStatus, 'PENDING'),
                    isNull(payrollEntry.payrollRequestId)
                )
            )
            .groupBy(payrollEntry.staffId)

        // Fetch PAID entries (completed payments within the period) grouped by staff
        const paidResults = await db
            .select({
                staffId: payrollEntry.staffId,
                totalAmount: sql<number>`COALESCE(SUM(${payrollEntry.staffCut}), 0)`,
                count: count(),
            })
            .from(payrollEntry)
            .where(
                and(
                    ...baseConditions,
                    eq(payrollEntry.paymentStatus, 'PAID')
                )
            )
            .groupBy(payrollEntry.staffId)

        // Build lookup maps
        const pendingMap = new Map<string, { amount: number; count: number }>()
        for (const r of pendingResults) {
            pendingMap.set(r.staffId, { amount: Number(r.totalAmount), count: Number(r.count) })
        }

        const paidMap = new Map<string, { amount: number; count: number }>()
        for (const r of paidResults) {
            paidMap.set(r.staffId, { amount: Number(r.totalAmount), count: Number(r.count) })
        }

        // Build final data from allResults (includes ALL staff with any non-cancelled entries)
        const data: StaffPayrollSummaryItem[] = allResults.map((r) => {
            const pending = pendingMap.get(r.staffId)
            const paid = paidMap.get(r.staffId)
            return {
                staff_id: r.staffId,
                full_name: r.fullName || 'Unknown',
                avatar_url: r.avatarUrl || undefined,
                rate_level_id: r.rateLevelId || undefined,
                pending_amount: pending?.amount || 0,
                pending_count: pending?.count || 0,
                paid_amount: paid?.amount || 0,
                paid_count: paid?.count || 0,
                total_earned: Number(r.totalAmount),
                total_count: Number(r.count),
            }
        })

        // Sort by total earned descending
        data.sort((a, b) => b.total_earned - a.total_earned)

        return success(data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching staff payroll summary: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch staff summary')
    }
}

export async function calculatePayroll(
    grossAmount: number,
    serviceType: ServiceType,
    clientType: ClientType,
    rateLevelId?: string | null
): Promise<ActionResponse<{ shopCut: number; staffCut: number; rateId: string }>> {
    try {
        const validation = CalculatePayrollSchema.safeParse({
            gross_amount: grossAmount,
            service_type: serviceType,
            client_type: clientType,
            rate_level_id: rateLevelId,
        })
        if (!validation.success) {
            return failure('Invalid input: ' + validation.error.message)
        }

        const rateResult = await getApplicableRate(serviceType, clientType, rateLevelId)
        if (!rateResult.success) {
            return failure(rateResult.error || 'Failed to get applicable rate')
        }

        const rate = rateResult.data
        if (!rate) {
            return failure(`No rate found for ${serviceType} / ${clientType} / ${rateLevelId}`)
        }

        let shopCut: number
        let staffCut: number

        if (rate.payment_mode === 'FIXED') {
            if (rate.fixed_amount > grossAmount) {
                return failure('Fixed amount cannot exceed gross amount')
            }
            staffCut = rate.fixed_amount
            shopCut = grossAmount - staffCut
        } else {
            shopCut = (grossAmount * rate.shop_percentage) / 100
            staffCut = (grossAmount * rate.staff_percentage) / 100
        }

        return success({
            shopCut: Math.round(shopCut * 100) / 100,
            staffCut: Math.round(staffCut * 100) / 100,
            rateId: rate.id,
        })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error calculating payroll: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to calculate payroll')
    }
}

export async function processPayroll(
    payload: import("@/utils/types/payroll").CreatePayrollRequestPayload
): Promise<ActionResponse<PayrollRequest>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    try {
        const result = await createPayrollRequest(payload)
        return result
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error processing payroll: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to process payroll')
    }
}

export async function approvePayrollRequest(requestId: string): Promise<ActionResponse<void>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    return confirmPayrollRequest(requestId)
}

export async function rejectPayrollRequest(
    requestId: string,
    reason: string
): Promise<ActionResponse<void>> {
    return cancelPayrollRequest(requestId, reason)
}

export async function getPayrollEntriesByRequest(
    requestId: string
): Promise<ActionResponse<PayrollEntry[]>> {
    try {
        const entries = await db
            .select({
                entry: payrollEntry,
                staff: {
                    id: user.id,
                    full_name: user.fullName,
                    avatar_url: user.avatarUrl,
                    rate_level_id: user.rateLevelId,
                },
            })
            .from(payrollEntry)
            .leftJoin(user, eq(payrollEntry.staffId, user.id))
            .where(eq(payrollEntry.payrollRequestId, requestId))
            .orderBy(desc(payrollEntry.serviceDate))

        const data: PayrollEntry[] = entries.map(({ entry, staff }) => ({
            id: entry.id,
            created_at: entry.createdAt,
            staff_id: entry.staffId,
            transaction_id: entry.transactionId || undefined,
            appointment_id: entry.appointmentId || undefined,
            service_date: entry.serviceDate,
            service_description: entry.serviceDescription || undefined,
            client_type: (entry.clientType as ClientType) || undefined,
            gross_amount: Number(entry.grossAmount),
            shop_cut: Number(entry.shopCut),
            staff_cut: Number(entry.staffCut),
            rate_id: entry.rateId || undefined,
            payment_status: entry.paymentStatus as PaymentStatus,
            payroll_request_id: entry.payrollRequestId || undefined,
            paid_at: entry.paidAt || undefined,
            tax_rate: Number(entry.taxRate) || 0,
            tax_amount: Number(entry.taxAmount) || 0,
            net_amount: Number(entry.netAmount) || 0,
            tax_bracket: entry.taxBracket || '',
            staff_rate_snapshot: entry.staffRateSnapshot || undefined,
            shop_rate_snapshot: entry.shopRateSnapshot || undefined,
            rate_version: entry.rateVersion || undefined,
            payment_method: (entry.paymentMethod ? normalizePaymentMethod(entry.paymentMethod) : undefined) as string | undefined,
            staff: staff ? {
                id: staff.id,
                full_name: staff.full_name || '',
                avatar_url: staff.avatar_url || undefined,
                rate_level_id: staff.rate_level_id || undefined,
            } : undefined,
        }))

        return success(data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching payroll entries by request: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch entries')
    }
}

// ============================================================================
// DEDUCTION/ADVANCE TRACKING
// ============================================================================

export interface Deduction {
    id: string
    user_id: string
    type: 'ADVANCE' | 'DEDUCTION' | 'ADJUSTMENT'
    amount: number
    reason?: string
    status: 'PENDING' | 'DEDUCTED' | 'CANCELLED'
    created_at: Date
    deducted_at?: Date
}

export async function createAdvance(
    userId: string,
    amount: number,
    reason: string
): Promise<ActionResponse<Deduction>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    const advanceValidation = CreateAdvanceSchema.safeParse({ userId, amount, reason })
    if (!advanceValidation.success) {
        return failure(advanceValidation.error.issues.map(i => i.message).join(', '))
    }

    try {
        if (!userId || amount <= 0) {
            return failure('Valid user ID and positive amount are required')
        }

        const [deduction] = await db
            .insert(payrollDeductions)
            .values({
                userId,
                type: 'ADVANCE',
                amount,
                reason,
                status: 'PENDING',
            })
            .returning()

        const data: Deduction = {
            id: deduction.id,
            user_id: deduction.userId,
            type: deduction.type as 'ADVANCE' | 'DEDUCTION' | 'ADJUSTMENT',
            amount: deduction.amount,
            reason: deduction.reason || undefined,
            status: deduction.status as 'PENDING' | 'DEDUCTED' | 'CANCELLED',
            created_at: deduction.createdAt,
            deducted_at: deduction.deductedAt || undefined,
        }

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'PAYROLL',
                    message: `Advance created: ${deduction.id} for user ${userId} amount ${amount} by ${currentUser.id}`,
                },
            ],
        })

        return success(data, 'Advance created successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error creating advance: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to create advance')
    }
}

export async function createDeduction(
    userId: string,
    amount: number,
    reason: string,
    type: 'DEDUCTION' | 'ADJUSTMENT' = 'DEDUCTION'
): Promise<ActionResponse<Deduction>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    const advanceValidation = CreateAdvanceSchema.safeParse({ userId, amount, reason })
    if (!advanceValidation.success) {
        return failure(advanceValidation.error.issues.map(i => i.message).join(', '))
    }

    try {
        if (!userId || amount <= 0) {
            return failure('Valid user ID and positive amount are required')
        }

        const [deduction] = await db
            .insert(payrollDeductions)
            .values({
                userId,
                type,
                amount,
                reason,
                status: 'PENDING',
            })
            .returning()

        const data: Deduction = {
            id: deduction.id,
            user_id: deduction.userId,
            type: deduction.type as 'ADVANCE' | 'DEDUCTION' | 'ADJUSTMENT',
            amount: deduction.amount,
            reason: deduction.reason || undefined,
            status: deduction.status as 'PENDING' | 'DEDUCTED' | 'CANCELLED',
            created_at: deduction.createdAt,
            deducted_at: deduction.deductedAt || undefined,
        }

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'PAYROLL',
                    message: `Deduction created: ${deduction.id} for user ${userId} amount ${amount} type ${type} by ${currentUser.id}`,
                },
            ],
        })

        return success(data, 'Deduction created successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error creating deduction: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to create deduction')
    }
}

export async function getPendingDeductions(userId: string): Promise<ActionResponse<Deduction[]>> {
    try {
        const deductions = await db
            .select()
            .from(payrollDeductions)
            .where(
                and(
                    eq(payrollDeductions.userId, userId),
                    eq(payrollDeductions.status, 'PENDING')
                )
            )
            .orderBy(payrollDeductions.createdAt)

        const data: Deduction[] = deductions.map((d) => ({
            id: d.id,
            user_id: d.userId,
            type: d.type as 'ADVANCE' | 'DEDUCTION' | 'ADJUSTMENT',
            amount: d.amount,
            reason: d.reason || undefined,
            status: d.status as 'PENDING' | 'DEDUCTED' | 'CANCELLED',
            created_at: d.createdAt,
            deducted_at: d.deductedAt || undefined,
        }))

        return success(data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching pending deductions: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch pending deductions')
    }
}

export interface DeductionWithStaff extends Deduction {
    staff_name?: string
    staff_avatar_url?: string
}

export async function getAllDeductions(branchId?: string | null): Promise<ActionResponse<DeductionWithStaff[]>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    try {
        const whereClause = branchId
            ? sql`${user.branchIds}::jsonb ? ${branchId}::text`
            : undefined

        const deductions = await db
            .select({
                id: payrollDeductions.id,
                user_id: payrollDeductions.userId,
                type: payrollDeductions.type,
                amount: payrollDeductions.amount,
                reason: payrollDeductions.reason,
                status: payrollDeductions.status,
                created_at: payrollDeductions.createdAt,
                deducted_at: payrollDeductions.deductedAt,
                staff_name: user.fullName,
                staff_avatar_url: user.avatarUrl,
            })
            .from(payrollDeductions)
            .leftJoin(user, eq(payrollDeductions.userId, user.id))
            .where(whereClause)
            .orderBy(desc(payrollDeductions.createdAt))

        const data: DeductionWithStaff[] = deductions.map((d) => ({
            id: d.id,
            user_id: d.user_id,
            type: d.type as 'ADVANCE' | 'DEDUCTION' | 'ADJUSTMENT',
            amount: d.amount,
            reason: d.reason || undefined,
            status: d.status as 'PENDING' | 'DEDUCTED' | 'CANCELLED',
            created_at: d.created_at,
            deducted_at: d.deducted_at || undefined,
            staff_name: d.staff_name || undefined,
            staff_avatar_url: d.staff_avatar_url || undefined,
        }))

        return success(data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching all deductions: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch deductions')
    }
}

export async function cancelDeduction(
    deductionId: string,
    reason?: string
): Promise<ActionResponse<void>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    try {
        const [deduction] = await db
            .select()
            .from(payrollDeductions)
            .where(eq(payrollDeductions.id, deductionId))
            .limit(1)

        if (!deduction) {
            return failure('Deduction not found')
        }

        if (deduction.status === 'DEDUCTED') {
            return failure('Cannot cancel already deducted item')
        }

        if (deduction.status === 'CANCELLED') {
            return failure('Deduction is already cancelled')
        }

        await db
            .update(payrollDeductions)
            .set({
                status: 'CANCELLED',
            })
            .where(eq(payrollDeductions.id, deductionId))

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'PAYROLL',
                    message: `Deduction cancelled: ${deductionId} by ${currentUser.id}${reason ? `. Reason: ${reason}` : ''}`,
                },
            ],
        })

        return success(undefined, 'Deduction cancelled successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error cancelling deduction: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to cancel deduction')
    }
}

export interface CreateScheduledPaymentPayload {
    staff_id: string
    amount: number
    reason: string
    frequency: 'MONTHLY' | 'BIMONTHLY' | 'WEEKLY' | 'CUSTOM'
    start_date: string
    end_date?: string
}

export async function createScheduledPayment(
    payload: CreateScheduledPaymentPayload
): Promise<ActionResponse<{ id: string }>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) return failure('Unauthorized')

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) return failure('Payroll management access required')

    const scheduledValidation = CreateScheduledPaymentSchema.safeParse({
        ...payload,
        userId: payload.staff_id,
        startDate: payload.start_date,
        endDate: payload.end_date,
    })
    if (!scheduledValidation.success) {
        return failure(scheduledValidation.error.issues.map(i => i.message).join(', '))
    }

    try {
        const recurrenceRule = {
            frequency: payload.frequency,
            interval: 1,
            startDate: payload.start_date,
            endDate: payload.end_date || undefined,
        }

        const [deduction] = await db
            .insert(payrollDeductions)
            .values({
                userId: payload.staff_id,
                type: 'ADVANCE',
                amount: payload.amount,
                reason: `Scheduled: ${payload.reason}`,
                status: 'PENDING',
                scheduledAmount: String(payload.amount),
                disbursementType: 'STAGGERED',
                recurrenceRule: recurrenceRule,
            })
            .returning()

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Scheduled payment created: ${deduction.id} for staff ${payload.staff_id} - ${payload.amount} ${payload.frequency}`,
            }],
        })

        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')

        return success({ id: deduction.id })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error creating scheduled payment: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to create scheduled payment')
    }
}

export interface ScheduledPaymentWithStaff extends Deduction {
    staff_name?: string
    staff_avatar_url?: string
    scheduled_amount?: string
    disbursement_type?: string
    recurrence_rule?: { frequency: string; interval: number; startDate: string; endDate?: string | null }
}

export async function getScheduledPayments(branchId?: string | null): Promise<ActionResponse<ScheduledPaymentWithStaff[]>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    try {
        const whereClause = branchId
            ? and(
                eq(payrollDeductions.disbursementType, 'STAGGERED'),
                sql`${user.branchIds}::jsonb ? ${branchId}::text`
            )
            : eq(payrollDeductions.disbursementType, 'STAGGERED')

        const deductions = await db
            .select({
                id: payrollDeductions.id,
                user_id: payrollDeductions.userId,
                type: payrollDeductions.type,
                amount: payrollDeductions.amount,
                reason: payrollDeductions.reason,
                status: payrollDeductions.status,
                created_at: payrollDeductions.createdAt,
                deducted_at: payrollDeductions.deductedAt,
                scheduled_amount: payrollDeductions.scheduledAmount,
                disbursement_type: payrollDeductions.disbursementType,
                recurrence_rule: payrollDeductions.recurrenceRule,
                staff_name: user.fullName,
                staff_avatar_url: user.avatarUrl,
            })
            .from(payrollDeductions)
            .leftJoin(user, eq(payrollDeductions.userId, user.id))
            .where(whereClause)
            .orderBy(desc(payrollDeductions.createdAt))

        const data: ScheduledPaymentWithStaff[] = deductions.map((d) => ({
            id: d.id,
            user_id: d.user_id,
            type: d.type as 'ADVANCE' | 'DEDUCTION' | 'ADJUSTMENT',
            amount: d.amount,
            reason: d.reason || undefined,
            status: d.status as 'PENDING' | 'DEDUCTED' | 'CANCELLED',
            created_at: d.created_at,
            deducted_at: d.deducted_at || undefined,
            scheduled_amount: d.scheduled_amount || undefined,
            disbursement_type: d.disbursement_type || undefined,
            recurrence_rule: d.recurrence_rule || undefined,
            staff_name: d.staff_name || undefined,
            staff_avatar_url: d.staff_avatar_url || undefined,
        }))

        return success(data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching scheduled payments: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch scheduled payments')
    }
}

export async function getExpectedPaymentMethod(
    requestId: string
): Promise<ActionResponse<{ method: string | null; breakdown: { method: string; count: number; total: number }[] }>> {
    try {
        const entries = await db
            .select({
                paymentMethod: payrollEntry.paymentMethod,
                staffCut: payrollEntry.staffCut,
            })
            .from(payrollEntry)
            .where(eq(payrollEntry.payrollRequestId, requestId))

        if (entries.length === 0) {
            return success({ method: null, breakdown: [] })
        }

        const methodCounts: Record<string, { count: number; total: number }> = {}
        for (const entry of entries) {
            let method = entry.paymentMethod || 'UNKNOWN'
            if (method === 'BANK') method = 'BANK_TRANSFER'
            if (!methodCounts[method]) {
                methodCounts[method] = { count: 0, total: 0 }
            }
            methodCounts[method].count++
            methodCounts[method].total += Number(entry.staffCut)
        }

        const breakdown = Object.entries(methodCounts).map(([method, data]) => ({
            method,
            count: data.count,
            total: data.total,
        }))

        breakdown.sort((a, b) => b.total - a.total)

        let dominantMethod = breakdown[0]?.method || null
        if (dominantMethod === 'BANK') dominantMethod = 'BANK_TRANSFER'
        if (dominantMethod === 'UNKNOWN') dominantMethod = null

        return success({ method: dominantMethod, breakdown })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error getting expected payment method: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to get expected payment method')
    }
}

async function recalculatePayrollRequestTotals(
    requestId: string,
    tx?: typeof db | TransactionClient
): Promise<void> {
    const dbClient = tx || db

    const entries = await dbClient
        .select()
        .from(payrollEntry)
        .where(eq(payrollEntry.payrollRequestId, requestId))

    let totalGross = 0
    let totalShopCut = 0
    let totalStaffCut = 0
    let totalNetAmount = 0
    let totalTaxAmount = 0

    for (const entry of entries) {
        totalGross += Number(entry.grossAmount)
        totalShopCut += Number(entry.shopCut)
        totalStaffCut += Number(entry.staffCut)
        totalNetAmount += Number(entry.netAmount ?? entry.staffCut)
        totalTaxAmount += Number(entry.taxAmount || 0)
    }

    await dbClient
        .update(payrollRequest)
        .set({
            totalGross: String(totalGross),
            totalShopCut: String(totalShopCut),
            totalStaffCut: String(totalStaffCut),
            totalNetAmount: String(totalNetAmount),
            totalTaxAmount: String(totalTaxAmount),
        })
        .where(eq(payrollRequest.id, requestId))
}

export async function cancelPayrollEntriesForTransaction(
    transactionId: string,
    userId: string,
    tx?: TransactionClient
): Promise<ActionResponse<void>> {
    const dbClient = tx || db

    // BLOCK: Check for PAID entries that cannot be cancelled
    const paidEntries = await dbClient
        .select({ id: payrollEntry.id })
        .from(payrollEntry)
        .where(
            and(
                eq(payrollEntry.transactionId, transactionId),
                eq(payrollEntry.paymentStatus, 'PAID')
            )
        )
        .limit(1)

    if (paidEntries.length > 0) {
        return failure(
            `Cannot cancel: payroll entries already paid to staff. ` +
            `Reverse the payment before voiding/refunding this transaction.`
        )
    }

    // Find all active payroll entries for this transaction
    // (PENDING, REQUESTED, CONFIRMED — but NOT PAID or already CANCELLED)
    const entries = await dbClient
        .select({ id: payrollEntry.id, payrollRequestId: payrollEntry.payrollRequestId })
        .from(payrollEntry)
        .where(
            and(
                eq(payrollEntry.transactionId, transactionId),
                sql`${payrollEntry.paymentStatus} IN ('PENDING', 'REQUESTED', 'CONFIRMED')`
            )
        )

    if (entries.length === 0) {
        return success(undefined)
    }

    // Mark entries as cancelled
    for (const entry of entries) {
        await dbClient
            .update(payrollEntry)
            .set({
                paymentStatus: 'CANCELLED',
                // Detach from any payroll request so the request total can be
                // recalculated without counting this voided work
                payrollRequestId: null,
            })
            .where(eq(payrollEntry.id, entry.id))
    }

    // Recalculate request totals if any entries belong to a request
    const requestIds = [...new Set(entries.map(e => e.payrollRequestId).filter(Boolean))]
    for (const requestId of requestIds) {
        if (requestId) {
            await recalculatePayrollRequestTotals(requestId, dbClient)
        }
    }

    return success(undefined)
}

export async function deactivateStaffRate(id: string): Promise<ActionResponse<void>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    try {
        const [rate] = await db
            .select()
            .from(payrollStaffRate)
            .where(eq(payrollStaffRate.id, id))
            .limit(1)

        if (!rate) {
            return failure('Rate not found')
        }

        await db
            .update(payrollStaffRate)
            .set({
                isActive: false,
                updatedAt: new Date(),
                updatedBy: currentUser.id,
            })
            .where(eq(payrollStaffRate.id, id))

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Staff rate deactivated: ${id} (${rate.rateName}) by ${currentUser.id}`,
            }],
        })

        cache.invalidate('payroll_rates')
        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')

        return success(undefined, 'Rate deactivated successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error deactivating staff rate: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to deactivate rate')
    }
}

export async function deleteStaffRate(id: string): Promise<ActionResponse<void>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    try {
        const [refCount] = await db
            .select({ count: count() })
            .from(payrollEntry)
            .where(eq(payrollEntry.rateId, id))

        const entryCount = Number(refCount?.count ?? 0)
        if (entryCount > 0) {
            return failure(`Cannot delete: rate is referenced by ${entryCount} payroll entr${entryCount === 1 ? 'y' : 'ies'}. Deactivate instead.`)
        }

        const [rate] = await db
            .select({ rateName: payrollStaffRate.rateName })
            .from(payrollStaffRate)
            .where(eq(payrollStaffRate.id, id))
            .limit(1)

        await db
            .delete(payrollStaffRate)
            .where(eq(payrollStaffRate.id, id))

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Staff rate deleted: ${id} (${rate?.rateName ?? 'unknown'}) by ${currentUser.id}`,
            }],
        })

        cache.invalidate('payroll_rates')
        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')

        return success(undefined, 'Rate deleted successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error deleting staff rate: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to delete rate')
    }
}

export async function getStaffEarningsForPeriod(
    staffId: string,
    dateFrom: string,
    dateTo: string,
    branchId?: string | null
): Promise<ActionResponse<PayrollEntry[]>> {
    try {
        const result = await getPayrollEntries({
            staffId,
            dateFrom,
            dateTo,
            branchId,
            pageSize: 200,
        })

        if (!result.success) {
            return result
        }

        return success(result.data.data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching staff earnings for period: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch staff earnings')
    }
}

export async function getPayrollEntryTransactionItems(
    entryId: string
): Promise<ActionResponse<PayrollEntryTransactionItem[]>> {
    try {
        // Fetch the payroll entry to get transaction_id and staff_cut/gross_amount
        const [entry] = await db
            .select({
                id: payrollEntry.id,
                transactionId: payrollEntry.transactionId,
                staffCut: payrollEntry.staffCut,
                shopCut: payrollEntry.shopCut,
                grossAmount: payrollEntry.grossAmount,
            })
            .from(payrollEntry)
            .where(eq(payrollEntry.id, entryId))
            .limit(1)

        if (!entry) {
            return failure("Payroll entry not found")
        }

        if (!entry.transactionId) {
            return success([])
        }

        // Fetch transaction items
        const items = await db
            .select({
                itemName: transactionItems.itemName,
                quantity: transactionItems.quantity,
                unitPrice: transactionItems.unitPrice,
                lineTotal: transactionItems.lineTotal,
                serviceId: transactionItems.serviceId,
            })
            .from(transactionItems)
            .where(eq(transactionItems.transactionId, entry.transactionId))

        if (items.length === 0) {
            return success([])
        }

        const grossAmount = Number(entry.grossAmount)
        const staffCut = Number(entry.staffCut)
        const shopCut = Number(entry.shopCut)

        // Fetch service types for items with service_id
        const serviceIds = items
            .filter((item) => item.serviceId)
            .map((item) => item.serviceId as string)

        const serviceTypeMap = new Map<string, string>()
        if (serviceIds.length > 0) {
            const servicesData = await db
                .select({
                    id: services.id,
                    serviceType: services.serviceType,
                })
                .from(services)
                .where(inArray(services.id, serviceIds))

            for (const svc of servicesData) {
                serviceTypeMap.set(svc.id, svc.serviceType)
            }
        }

        // Build result with proportional cuts
        const result: PayrollEntryTransactionItem[] = items.map((item) => {
            const lineTotal = Number(item.lineTotal)
            const proportion = grossAmount > 0 ? lineTotal / grossAmount : 0

            return {
                item_name: item.itemName,
                quantity: Number(item.quantity),
                unit_price: Number(item.unitPrice),
                line_total: lineTotal,
                service_id: item.serviceId || undefined,
                service_type: item.serviceId
                    ? (serviceTypeMap.get(item.serviceId) as import("@/utils/types/payroll").ServiceType)
                    : undefined,
                staff_cut: Math.round(proportion * staffCut * 100) / 100,
                shop_cut: Math.round(proportion * shopCut * 100) / 100,
            }
        })

        return success(result)
    } catch (error) {
        await logError({
            type: "PAYROLL",
            message: `Error fetching payroll entry transaction items: ${error instanceof Error ? error.message : String(error)}`,
        })
        return failure(
            error instanceof Error
                ? error.message
                : "Failed to fetch transaction items"
        )
    }
}
