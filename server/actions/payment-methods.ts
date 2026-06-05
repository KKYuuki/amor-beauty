'use server'

import { db } from "@/server/db"
import { paymentMethod } from "@/server/db/schema"
import { eq, and } from "drizzle-orm"
import { 
    UserPaymentMethod, 
    CreatePaymentMethodPayload, 
    UpdatePaymentMethodPayload 
} from "@/utils/types/payroll"
import { getCurrentUser, isAdmin } from "@/utils/auth/permissions"
import { createLogs } from "./logs"
import { ActionResponse, success, failure } from "@/utils/types/responses"

function mapPaymentMethod(dbMethod: typeof paymentMethod.$inferSelect): UserPaymentMethod {
    return {
        id: dbMethod.id,
        created_at: dbMethod.createdAt,
        updated_at: dbMethod.updatedAt || undefined,
        user_id: dbMethod.userId,
        type: dbMethod.type as UserPaymentMethod['type'],
        provider: dbMethod.provider || undefined,
        account_name: dbMethod.accountName || undefined,
        account_number: dbMethod.accountNumber || undefined,
        is_default: dbMethod.isDefault,
        is_active: dbMethod.isActive,
    }
}

export interface GetUserPaymentMethodsResult {
    methods: UserPaymentMethod[]
}

export async function getUserPaymentMethods(userId: string): Promise<ActionResponse<GetUserPaymentMethodsResult>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure('Not authenticated')
        }
        
        // Users can only see their own payment methods (or admins can see all)
        if (currentUser.id !== userId && !(await isAdmin(currentUser))) {
            return failure('Access denied')
        }

        const methods = await db
            .select()
            .from(paymentMethod)
            .where(eq(paymentMethod.userId, userId))
            .orderBy(paymentMethod.isDefault)

        return success({ methods: methods.map(mapPaymentMethod) })
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                message: `Error fetching payment methods: ${error}`,
                type: 'PAYROLL'
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch payment methods')
    }
}

export interface CreatePaymentMethodResult {
    method: UserPaymentMethod
}

export async function createPaymentMethod(
    userId: string, 
    payload: CreatePaymentMethodPayload
): Promise<ActionResponse<CreatePaymentMethodResult>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        if (currentUser.id !== userId) {
            return failure("Cannot create payment method for another user")
        }

        // Validation
        if (!['CASH', 'GCASH', 'MAYA', 'BANK_TRANSFER'].includes(payload.type)) {
            return failure("Invalid payment method type")
        }

        // If setting as default, unset other defaults first (atomic transaction)
        let method: typeof paymentMethod.$inferSelect
        if (payload.is_default) {
            [method] = await db.transaction(async (tx) => {
                await tx
                    .update(paymentMethod)
                    .set({ isDefault: false })
                    .where(eq(paymentMethod.userId, userId))
                return await tx
                    .insert(paymentMethod)
                    .values({
                        userId,
                        type: payload.type,
                        provider: payload.provider,
                        accountName: payload.account_name,
                        accountNumber: payload.account_number,
                        isDefault: true,
                        isActive: true,
                    })
                    .returning()
            })
        } else {
            [method] = await db
                .insert(paymentMethod)
                .values({
                    userId,
                    type: payload.type,
                    provider: payload.provider,
                    accountName: payload.account_name,
                    accountNumber: payload.account_number,
                    isDefault: false,
                    isActive: true,
                })
                .returning()
        }

        createLogs({
            logs: [{
                level: 'INFO',
                message: `Payment method created for user ${userId}`,
                type: 'PAYROLL'
            }]
        })

        return success({ method: mapPaymentMethod(method) })
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                message: `Error creating payment method: ${error}`,
                type: 'PAYROLL'
            }]
        })
        return failure(error instanceof Error ? error.message : "Failed to create payment method")
    }
}

export async function updatePaymentMethod(
    methodId: string,
    userId: string,
    payload: UpdatePaymentMethodPayload
): Promise<ActionResponse<void>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        // Verify ownership
        const [existing] = await db
            .select()
            .from(paymentMethod)
            .where(and(
                eq(paymentMethod.id, methodId),
                eq(paymentMethod.userId, userId)
            ))

        if (!existing) {
            return failure("Payment method not found")
        }

        // If setting as default, unset other defaults first (atomic transaction)
        const updateData: Partial<typeof paymentMethod.$inferInsert> = {
            updatedAt: new Date(),
        }

        if (payload.type !== undefined) updateData.type = payload.type
        if (payload.provider !== undefined) updateData.provider = payload.provider
        if (payload.account_name !== undefined) updateData.accountName = payload.account_name
        if (payload.account_number !== undefined) updateData.accountNumber = payload.account_number
        if (payload.is_default !== undefined) updateData.isDefault = payload.is_default
        if (payload.is_active !== undefined) updateData.isActive = payload.is_active

        if (payload.is_default) {
            await db.transaction(async (tx) => {
                await tx
                    .update(paymentMethod)
                    .set({ isDefault: false })
                    .where(eq(paymentMethod.userId, userId))
                await tx
                    .update(paymentMethod)
                    .set(updateData)
                    .where(eq(paymentMethod.id, methodId))
            })
        } else {
            await db
                .update(paymentMethod)
                .set(updateData)
                .where(eq(paymentMethod.id, methodId))
        }

        createLogs({
            logs: [{
                level: 'INFO',
                message: `Payment method ${methodId} updated`,
                type: 'PAYROLL'
            }]
        })

        return success(undefined)
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                message: `Error updating payment method: ${error}`,
                type: 'PAYROLL'
            }]
        })
        return failure(error instanceof Error ? error.message : "Failed to update payment method")
    }
}

export async function deletePaymentMethod(
    methodId: string,
    userId: string
): Promise<ActionResponse<void>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        // Verify ownership
        const [existing] = await db
            .select()
            .from(paymentMethod)
            .where(and(
                eq(paymentMethod.id, methodId),
                eq(paymentMethod.userId, userId)
            ))

        if (!existing) {
            return failure("Payment method not found")
        }

        await db
            .delete(paymentMethod)
            .where(eq(paymentMethod.id, methodId))

        createLogs({
            logs: [{
                level: 'INFO',
                message: `Payment method ${methodId} deleted`,
                type: 'PAYROLL'
            }]
        })

        return success(undefined)
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                message: `Error deleting payment method: ${error}`,
                type: 'PAYROLL'
            }]
        })
        return failure(error instanceof Error ? error.message : "Failed to delete payment method")
    }
}

export async function setDefaultPaymentMethod(
    methodId: string,
    userId: string
): Promise<ActionResponse<void>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        // Verify ownership
        const [existing] = await db
            .select()
            .from(paymentMethod)
            .where(and(
                eq(paymentMethod.id, methodId),
                eq(paymentMethod.userId, userId)
            ))

        if (!existing) {
            return failure("Payment method not found")
        }

        // Unset all other defaults and set this one as default (atomic transaction)
        await db.transaction(async (tx) => {
            await tx
                .update(paymentMethod)
                .set({ isDefault: false })
                .where(eq(paymentMethod.userId, userId))
            await tx
                .update(paymentMethod)
                .set({ isDefault: true, updatedAt: new Date() })
                .where(eq(paymentMethod.id, methodId))
        })

        return success(undefined)
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                message: `Error setting default payment method: ${error}`,
                type: 'PAYROLL'
            }]
        })
        return failure(error instanceof Error ? error.message : "Failed to set default payment method")
    }
}
