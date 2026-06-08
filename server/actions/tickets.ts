'use server'

import { eq, inArray, desc, and, ne } from 'drizzle-orm'
import { db } from '@/server/db'
import { tickets, ticketServices } from '@/server/db/schema/tickets'
import { services } from '@/server/db/schema/services'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import { getCurrentUser } from '@/utils/auth/permissions'
import { logError } from './logs'

export interface CreateTicketPayload {
    customerName?: string
    services: {
        serviceId: string
        price: number
        quantity: number
    }[]
}

export async function createTicket(payload: CreateTicketPayload): Promise<ActionResponse<{ queueNumber: number }>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    try {
        if (!payload.services || payload.services.length === 0) {
            return failure('Ticket must have at least one service')
        }

        const totalAmount = payload.services.reduce((acc, service) => acc + (service.price * service.quantity), 0)

        // Create the ticket and the services in a transaction
        const result = await db.transaction(async (tx) => {
            const [newTicket] = await tx.insert(tickets).values({
                customerName: payload.customerName || null,
                totalAmount: String(totalAmount),
                status: 'PENDING',
            }).returning()

            const servicesToInsert = payload.services.map(s => ({
                ticketId: newTicket.id,
                serviceId: s.serviceId,
                price: String(s.price),
                quantity: s.quantity,
            }))

            await tx.insert(ticketServices).values(servicesToInsert)

            return newTicket
        })

        return success({ queueNumber: result.queueNumber }, `Ticket #${result.queueNumber} created successfully`)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to create ticket: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to create ticket')
    }
}

export async function getActiveTickets() {
    const user = await getCurrentUser()
    if (!user) {
        return []
    }

    try {
        const activeTickets = await db
            .select()
            .from(tickets)
            .where(
                ne(tickets.status, 'CANCELLED')
            )
            .orderBy(desc(tickets.createdAt))
            .limit(100)

        if (activeTickets.length === 0) return []

        const ticketIds = activeTickets.map(t => t.id)

        const ts = await db
            .select({
                id: ticketServices.id,
                ticketId: ticketServices.ticketId,
                price: ticketServices.price,
                quantity: ticketServices.quantity,
                service: {
                    id: services.id,
                    title: services.title,
                    price: services.price,
                    serviceType: services.serviceType,
                }
            })
            .from(ticketServices)
            .leftJoin(services, eq(ticketServices.serviceId, services.id))
            .where(inArray(ticketServices.ticketId, ticketIds))

        const ticketsWithServices = activeTickets.map(ticket => ({
            ...ticket,
            services: ts.filter(s => s.ticketId === ticket.id)
        }))

        return ticketsWithServices
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to fetch active tickets: ${error instanceof Error ? error.message : String(error)}`
        })
        return []
    }
}

export async function updateTicketStatus(ticketId: string, status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED'): Promise<ActionResponse> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    try {
        await db.update(tickets)
            .set({ 
                status,
                updatedAt: new Date()
            })
            .where(eq(tickets.id, ticketId))

        return success(undefined, `Ticket status updated to ${status}`)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to update ticket status: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to update ticket status')
    }
}
