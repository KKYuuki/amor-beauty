'use server'

import { db } from '@/server/db'
import { transactions, transactionItems } from '@/server/db/schema/transactions'
import { appointments, appointmentServices, appointmentItems } from '@/server/db/schema'
import { services } from '@/server/db/schema/services'
import { inventory } from '@/server/db/schema/inventory'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { createLogs, logError } from './logs'
import { createAutoLedgerEntry } from './accounting'
import { getCurrentUser, canAccessSales, getUserById } from '@/utils/auth/permissions'
import { withTransaction } from '@/server/db/transactions'
import { generateTransactionNumberWithTx } from './transactions'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import { mapAppointmentTypeToServiceType, ClientType, ServiceType } from '@/utils/types/payroll'
import { mapTransactionToAccountingPaymentMethod } from '@/utils/types/payment'
import { deriveSalesCategoryAndDescription } from "./accounting-ledger-utils"
import { calculateAndCreatePayrollEntry } from './payroll'
import { PayrollError } from '@/utils/types/transactions'

export interface CreateTransactionFromAppointmentResult {
    transactionId: string
    transactionNumber: string
    payrollErrors?: PayrollError[]
}

/**
 * Creates a new transaction (draft) from a completed appointment
 * Copies services and items from the appointment to the transaction
 */
export async function createTransactionFromAppointment(
    appointmentId: string
): Promise<ActionResponse<CreateTransactionFromAppointmentResult>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const canAccess = await canAccessSales(user)
    if (!canAccess) {
        return failure('Sales access required')
    }

    try {
        // Get appointment with services and items
        const appointmentResult = await db
            .select()
            .from(appointments)
            .where(eq(appointments.id, appointmentId))
            .limit(1)

        if (appointmentResult.length === 0) {
            return failure('Appointment not found')
        }

        const appointment = appointmentResult[0]

        // Only allow creating transactions from COMPLETED appointments
        if (appointment.status !== 'COMPLETED') {
            return failure('Transaction can only be created from completed appointments')
        }

        // Check if transaction already exists for this appointment
        const existingTransaction = await db
            .select()
            .from(transactions)
            .where(eq(transactions.appointmentId, appointmentId))
            .limit(1)

        if (existingTransaction.length > 0) {
            // Return existing transaction instead of creating a new one
            return success({
                transactionId: existingTransaction[0].id,
                transactionNumber: existingTransaction[0].transactionNumber,
            }, 'Transaction already exists for this appointment')
        }

        // Get appointment services with pricing
        const appointmentServicesData = await db
            .select({
                serviceId: appointmentServices.serviceId,
                serviceTitle: services.title,
                servicePrice: services.price,
                serviceType: services.serviceType,
            })
            .from(appointmentServices)
            .innerJoin(services, eq(appointmentServices.serviceId, services.id))
            .where(eq(appointmentServices.appointmentId, appointmentId))

        // Get appointment items with pricing
        const appointmentItemsData = await db
            .select({
                inventoryId: appointmentItems.inventoryId,
                quantity: appointmentItems.quantity,
                itemName: inventory.name,
                unitPrice: inventory.sellingPrice,
            })
            .from(appointmentItems)
            .innerJoin(inventory, eq(appointmentItems.inventoryId, inventory.id))
            .where(eq(appointmentItems.appointmentId, appointmentId))

        // Calculate totals
        let subtotal = 0

        // Calculate services total
        for (const service of appointmentServicesData) {
            const price = Number(service.servicePrice) || 0
            subtotal += price
        }

        // Calculate items total
        for (const item of appointmentItemsData) {
            const price = Number(item.unitPrice) || 0
            const qty = Number(item.quantity) || 0
            subtotal += price * qty
        }

        const taxRate = 0 // No tax by default
        const taxAmount = subtotal * taxRate
        const discountAmount = 0 // No discount by default
        const total = subtotal + taxAmount - discountAmount

        // Look up staff name for enriched description
        let staffName: string | undefined
        if (appointment.staffId) {
            const staffProfile = await getUserById(appointment.staffId)
            if (staffProfile) {
                staffName = staffProfile.full_name
            }
        }

        // Create transaction with PENDING status (represents a draft)
        const txResult = await withTransaction(async (tx) => {
            // Generate sequential transaction number with branch code
            const transactionNumber = await generateTransactionNumberWithTx(tx, appointment.branchId)

            const [newTransaction] = await tx
                .insert(transactions)
                .values({
                    transactionNumber,
                    buyerId: appointment.clientId,
                    buyerName: appointment.clientName || undefined,
                    customerPhone: appointment.clientPhone || undefined,
                    customerEmail: appointment.clientEmail || undefined,
                    staffId: appointment.staffId,
                    branchId: appointment.branchId,
                    subtotal: subtotal.toFixed(2),
                    taxAmount: taxAmount.toFixed(2),
                    discountAmount: discountAmount.toFixed(2),
                    total: total.toFixed(2),
                    amountPaid: '0.00',
                    balanceDue: total.toFixed(2),
                    paymentMethod: 'CASH',
                    status: 'PENDING',
                    appointmentId: appointmentId,
                    clientType: appointment.isWalkin ? 'WALKIN' : 'PERSONAL',
                    notes: `Created from appointment: ${appointment.title}`,
                    createdBy: user.id,
                })
                .returning()

            // Build enriched description from appointment services
            const { category: apptCategory, description: apptEnrichedDescription } = deriveSalesCategoryAndDescription(
                appointmentServicesData.map((s) => ({
                    service_type: (s.serviceType as ServiceType) || undefined,
                    item_name: s.serviceTitle || "Service",
                    quantity: 1,
                    unit_price: Number(s.servicePrice) || 0,
                })),
                transactionNumber,
                undefined,
                staffName
            )

            // Create accounting entry for the appointment sale
            // For PENDING appointments, don't create a revenue entry until payment is actually received
            if (Number(newTransaction.amountPaid) > 0) {
                await createAutoLedgerEntry(
                    'TRANSACTION',
                    newTransaction.id,
                    {
                        entry_date: new Date(),
                        entry_type: 'REVENUE',
                        category: apptCategory,
                        description: apptEnrichedDescription,
                        reference: transactionNumber,
                        debit: 0,
                        credit: Number(newTransaction.amountPaid),
                        branch_id: appointment.branchId ?? null,
                        payment_method: mapTransactionToAccountingPaymentMethod(newTransaction.paymentMethod),
                    },
                    user.id,
                    tx
                )
            }

            return { newTransaction, transactionNumber }
        }, { action: 'ACCOUNTING', userId: user.id })

        if (!txResult.success) {
            return failure(txResult.error || 'Failed to create transaction')
        }

        const { newTransaction, transactionNumber } = txResult.data

        // Create transaction items for services
        const transactionItemsData = []

        for (const service of appointmentServicesData) {
            const price = Number(service.servicePrice) || 0
            transactionItemsData.push({
                transactionId: newTransaction.id,
                serviceId: service.serviceId,
                itemName: service.serviceTitle || 'Service',
                quantity: '1',
                unitPrice: price.toFixed(2),
                lineTotal: price.toFixed(2),
            })
        }

        // Create transaction items for inventory
        for (const item of appointmentItemsData) {
            const price = Number(item.unitPrice) || 0
            const qty = Number(item.quantity) || 0
            const lineTotal = price * qty
            transactionItemsData.push({
                transactionId: newTransaction.id,
                inventoryId: item.inventoryId,
                itemName: item.itemName || 'Item',
                quantity: qty.toFixed(2),
                unitPrice: price.toFixed(2),
                lineTotal: lineTotal.toFixed(2),
            })
        }

        // Insert all transaction items
        if (transactionItemsData.length > 0) {
            await db.insert(transactionItems).values(transactionItemsData)
        }

        // Create payroll entries for services using mapped appointment type
        // Non-guarded — payroll is attempted for every service after a completed appointment
        const payrollErrors: PayrollError[] = []
        const appointmentServiceType = mapAppointmentTypeToServiceType(appointment.type)
        for (const service of appointmentServicesData) {
            if (!appointment.staffId) {
                payrollErrors.push({
                    serviceId: service.serviceId,
                    error: 'No staff assigned to appointment — payroll entry not created'
                })
                continue
            }
            const price = Number(service.servicePrice) || 0
            try {
                const payrollResult = await calculateAndCreatePayrollEntry({
                    transactionId: newTransaction.id,
                    serviceId: service.serviceId,
                    staffId: appointment.staffId,
                    amount: price,
                    quantity: 1,
                    clientType: (appointment.isWalkin ? 'WALKIN' : undefined) as ClientType | undefined,
                    serviceType: appointmentServiceType,
                    paymentMethod: newTransaction.paymentMethod,
                })
                if (!payrollResult.success) {
                    payrollErrors.push({
                        serviceId: service.serviceId,
                        error: payrollResult.error || 'Failed to create payroll entry'
                    })
                }
            } catch (payrollError) {
                const errorMessage = payrollError instanceof Error ? payrollError.message : 'Unknown payroll error'
                await logError({
                    type: 'PAYROLL',
                    message: `Failed to create payroll entry for transaction ${transactionNumber}: ${errorMessage}`
                })
                payrollErrors.push({
                    serviceId: service.serviceId,
                    error: errorMessage
                })
            }
        }

        // Log the creation
        createLogs({
            logs: [{
                level: 'INFO',
                type: 'OTHER',
                message: `Transaction ${transactionNumber} created from appointment ${appointmentId} by ${user.id}`,
                user_id: user.id,
                branch_id: appointment.branchId ?? undefined,
            }]
        })

        revalidatePath('/sales')
        revalidatePath('/appointments')

        return success({
            transactionId: newTransaction.id,
            transactionNumber: newTransaction.transactionNumber,
            payrollErrors: payrollErrors.length > 0 ? payrollErrors : undefined,
        }, 'Transaction created successfully')
    } catch (error) {
        await logError({
            type: 'OTHER',
            message: `Failed to create transaction from appointment: ${error instanceof Error ? error.message : String(error)}`,
            userId: user?.id,
        })
        return failure('Failed to create transaction from appointment')
    }
}

/**
 * Check if a transaction exists for an appointment
 */
export async function getTransactionByAppointmentId(
    appointmentId: string
): Promise<ActionResponse<{ transactionId: string; transactionNumber: string } | null>> {
    try {
        const result = await db
            .select({
                id: transactions.id,
                transactionNumber: transactions.transactionNumber,
            })
            .from(transactions)
            .where(eq(transactions.appointmentId, appointmentId))
            .limit(1)

        if (result.length === 0) {
            return success(null)
        }

        return success({
            transactionId: result[0].id,
            transactionNumber: result[0].transactionNumber,
        })
    } catch (error) {
        await logError({
            type: 'OTHER',
            message: `Failed to get transaction by appointment: ${error instanceof Error ? error.message : String(error)}`,
        })
        return failure('Failed to check for existing transaction')
    }
}
