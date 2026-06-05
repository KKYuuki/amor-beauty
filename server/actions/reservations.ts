'use server'

import { db } from '@/server/db'
import { stockReservations, inventory } from '@/server/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { getCurrentUser } from '@/utils/auth/permissions'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import { createLogs, logError } from './logs'

// ============================================================================
// Stock Reservation Actions
// ============================================================================

export interface ReservationItem {
    inventory_id: string
    quantity: number
}

/**
 * Reserve stock for an appointment
 * Checks available stock (current - pending reservations) before reserving
 */
export async function reserveStock(
    inventoryId: string,
    appointmentId: string,
    quantity: number,
    expiresAt?: Date
): Promise<ActionResponse<{ reservationId: string }>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure("Unauthorized: Not authenticated")
    }

    try {
        // Check available stock
        const [item] = await db
            .select()
            .from(inventory)
            .where(eq(inventory.id, inventoryId))
            .limit(1)

        if (!item) {
            return failure('Inventory item not found')
        }

        const currentStock = Number(item.currentStock)
        
        // Calculate existing pending reservations for this item
        const existingReservations = await db
            .select({ total: sql<number>`coalesce(sum(${stockReservations.quantity}), 0)` })
            .from(stockReservations)
            .where(and(
                eq(stockReservations.inventoryId, inventoryId),
                eq(stockReservations.status, 'PENDING')
            ))

        const reservedQuantity = existingReservations[0]?.total || 0
        const availableStock = currentStock - Number(reservedQuantity)

        if (availableStock < quantity) {
            return failure(`Insufficient stock. Available: ${availableStock}, Requested: ${quantity}`)
        }

        // Create reservation with default 24-hour expiration
        const [reservation] = await db
            .insert(stockReservations)
            .values({
                inventoryId,
                appointmentId,
                quantity,
                status: 'PENDING',
                expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours default
            })
            .returning({ id: stockReservations.id })

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'INVENTORY',
                message: `Stock reserved: ${quantity} ${item.name} for appointment ${appointmentId}`,
                user_id: user.id,
            }]
        })

        return success({ reservationId: reservation.id })
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Error reserving stock: ${error instanceof Error ? error.message : String(error)}`,
            userId: user.id,
        })
        return failure(error instanceof Error ? error.message : 'Failed to reserve stock')
    }
}

/**
 * Confirm a stock reservation (when appointment is completed)
 */
export async function confirmReservation(reservationId: string): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure("Unauthorized: Not authenticated")
    }

    try {
        const [reservation] = await db
            .update(stockReservations)
            .set({ status: 'CONFIRMED', confirmedAt: new Date() })
            .where(eq(stockReservations.id, reservationId))
            .returning({ id: stockReservations.id, status: stockReservations.status })

        if (!reservation) {
            return failure('Reservation not found')
        }

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'INVENTORY',
                message: `Reservation confirmed: ${reservationId}`,
                user_id: user.id,
            }]
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Error confirming reservation: ${error instanceof Error ? error.message : String(error)}`,
            userId: user.id,
        })
        return failure(error instanceof Error ? error.message : 'Failed to confirm reservation')
    }
}

/**
 * Release a stock reservation (when appointment is cancelled or stock no longer needed)
 */
export async function releaseReservation(reservationId: string): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure("Unauthorized: Not authenticated")
    }

    try {
        const [reservation] = await db
            .update(stockReservations)
            .set({ status: 'RELEASED', releasedAt: new Date() })
            .where(eq(stockReservations.id, reservationId))
            .returning({ id: stockReservations.id, status: stockReservations.status })

        if (!reservation) {
            return failure('Reservation not found')
        }

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'INVENTORY',
                message: `Reservation released: ${reservationId}`,
                user_id: user.id,
            }]
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Error releasing reservation: ${error instanceof Error ? error.message : String(error)}`,
            userId: user.id,
        })
        return failure(error instanceof Error ? error.message : 'Failed to release reservation')
    }
}

/**
 * Mark a reservation as converted (when stock is actually used/consumed)
 */
export async function convertReservation(reservationId: string): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure("Unauthorized: Not authenticated")
    }

    try {
        const [reservation] = await db
            .update(stockReservations)
            .set({ status: 'CONVERTED', convertedAt: new Date() })
            .where(eq(stockReservations.id, reservationId))
            .returning({ id: stockReservations.id, status: stockReservations.status })

        if (!reservation) {
            return failure('Reservation not found')
        }

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'INVENTORY',
                message: `Reservation converted to usage: ${reservationId}`,
                user_id: user.id,
            }]
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Error converting reservation: ${error instanceof Error ? error.message : String(error)}`,
            userId: user.id,
        })
        return failure(error instanceof Error ? error.message : 'Failed to convert reservation')
    }
}

/**
 * Get all reservations for an appointment with inventory details
 */
export async function getReservationsForAppointment(appointmentId: string): Promise<ActionResponse<Array<{
    reservation: typeof stockReservations.$inferSelect
    item: typeof inventory.$inferSelect
}>>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure("Unauthorized: Not authenticated")
    }

    try {
        const results = await db
            .select({
                reservation: stockReservations,
                item: inventory,
            })
            .from(stockReservations)
            .innerJoin(inventory, eq(stockReservations.inventoryId, inventory.id))
            .where(eq(stockReservations.appointmentId, appointmentId))
            .orderBy(stockReservations.createdAt)

        return success(results)
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Error fetching reservations: ${error instanceof Error ? error.message : String(error)}`,
            userId: user.id,
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch reservations')
    }
}

/**
 * Get all pending reservations that have expired
 * Useful for cleanup jobs
 */
export async function getExpiredReservations(): Promise<ActionResponse<typeof stockReservations.$inferSelect[]>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure("Unauthorized: Not authenticated")
    }

    try {
        const results = await db
            .select()
            .from(stockReservations)
            .where(and(
                eq(stockReservations.status, 'PENDING'),
                sql`${stockReservations.expiresAt} < NOW()`
            ))
            .orderBy(stockReservations.expiresAt)

        return success(results)
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Error fetching expired reservations: ${error instanceof Error ? error.message : String(error)}`,
            userId: user.id,
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch expired reservations')
    }
}

/**
 * Release all reservations for an appointment (bulk operation)
 */
export async function releaseAllReservationsForAppointment(appointmentId: string): Promise<ActionResponse<{ releasedCount: number }>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure("Unauthorized: Not authenticated")
    }

    try {
        const result = await db
            .update(stockReservations)
            .set({ status: 'RELEASED', releasedAt: new Date() })
            .where(and(
                eq(stockReservations.appointmentId, appointmentId),
                eq(stockReservations.status, 'PENDING')
            ))
            .returning({ id: stockReservations.id })

        const releasedCount = result.length

        if (releasedCount > 0) {
            await createLogs({
                logs: [{
                    level: 'INFO',
                    type: 'INVENTORY',
                    message: `Released ${releasedCount} reservations for appointment ${appointmentId}`,
                    user_id: user.id,
                }]
            })
        }

        return success({ releasedCount })
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Error releasing reservations: ${error instanceof Error ? error.message : String(error)}`,
            userId: user.id,
        })
        return failure(error instanceof Error ? error.message : 'Failed to release reservations')
    }
}
