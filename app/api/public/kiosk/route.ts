import { NextResponse } from 'next/server'
import { db } from '@/server/db'
import { tickets, ticketServices } from '@/server/db/schema/tickets'
import { services } from '@/server/db/schema/services'
import { eq, inArray } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

interface KioskTicketPayload {
    customerName?: string
    services: {
        serviceId: string
        quantity: number
    }[]
}

export async function POST(request: Request) {
    try {
        const body: KioskTicketPayload = await request.json()

        if (!body.services || body.services.length === 0) {
            return NextResponse.json(
                { error: 'At least one service is required' },
                { status: 400 }
            )
        }

        // Fetch service prices from DB to prevent price manipulation
        const serviceIds = body.services.map(s => s.serviceId)
        const dbServices = await db
            .select({ id: services.id, price: services.price, title: services.title })
            .from(services)
            .where(inArray(services.id, serviceIds))

        if (dbServices.length !== serviceIds.length) {
            return NextResponse.json(
                { error: 'One or more services not found' },
                { status: 400 }
            )
        }

        // Calculate total from DB prices (not client-submitted prices)
        const totalAmount = body.services.reduce((acc, s) => {
            const dbService = dbServices.find(ds => ds.id === s.serviceId)
            if (!dbService) return acc
            return acc + (Number(dbService.price) * s.quantity)
        }, 0)

        // Create ticket in transaction
        const result = await db.transaction(async (tx) => {
            const [newTicket] = await tx.insert(tickets).values({
                customerName: body.customerName?.trim() || null,
                totalAmount: String(totalAmount),
                status: 'PENDING',
            }).returning()

            const servicesToInsert = body.services.map(s => {
                const dbService = dbServices.find(ds => ds.id === s.serviceId)!
                return {
                    ticketId: newTicket.id,
                    serviceId: s.serviceId,
                    price: dbService.price,
                    quantity: s.quantity,
                }
            })

            await tx.insert(ticketServices).values(servicesToInsert)

            return newTicket
        })

        return NextResponse.json({
            success: true,
            queueNumber: result.queueNumber,
            ticketId: result.id,
            totalAmount,
        })
    } catch (error: any) {
        console.error('Kiosk ticket creation error:', error)
        return NextResponse.json(
            { error: 'Failed to create ticket' },
            { status: 500 }
        )
    }
}

// GET endpoint to fetch available services for the kiosk
export async function GET() {
    try {
        const activeServices = await db
            .select({
                id: services.id,
                title: services.title,
                price: services.price,
                serviceType: services.serviceType,
            })
            .from(services)
            .where(eq(services.isActive, true))

        return NextResponse.json({ services: activeServices })
    } catch (error: any) {
        console.error('Kiosk services fetch error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch services' },
            { status: 500 }
        )
    }
}
