#!/usr/bin/env bun
import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from '../server/db/index'
import { appointments } from '../server/db/schema/appointments'
import { branches } from '../server/db/schema/branches'
import { user } from '../server/db/schema/auth'
import { eq } from 'drizzle-orm'

async function main() {
    console.log('📅 Creating E2E test appointments\n')

    // Get branch
    const [branch] = await db.select().from(branches).where(eq(branches.code, 'MAIN'))
    if (!branch) { console.error('❌ Branch not found'); process.exit(1) }
    console.log(`✅ Branch: ${branch.name}`)

    // Get artist
    const [artist] = await db.select().from(user).where(eq(user.email, 'e2e-artist@rdmdstudio.com'))
    if (!artist) { console.error('❌ Artist not found'); process.exit(1) }
    console.log(`✅ Artist: ${artist.name}`)

    // Get manager
    const [manager] = await db.select().from(user).where(eq(user.email, 'e2e-manager@rdmdstudio.com'))
    if (!manager) { console.error('❌ Manager not found'); process.exit(1) }
    console.log(`✅ Creator: ${manager.name}`)

    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dayAfter = new Date(now)
    dayAfter.setDate(dayAfter.getDate() + 2)

    // Create appointments for each type
    const appts = [
        {
            title: '[E2E] Full Tattoo Lifecycle Test',
            staffId: artist.id,
            timeStart: new Date(tomorrow.setHours(10, 0, 0, 0)),
            timeEnd: new Date(tomorrow.setHours(12, 0, 0, 0)),
            status: 'COMPLETED' as const,
            type: 'TATTOO' as const,
            clientName: 'Test Client A',
            clientPhone: '+639000000001',
            createdBy: manager.id,
            branchId: branch.id,
            isWalkin: false,
            isActive: true,
            paymentStatus: 'UNPAID' as const,
        },
        {
            title: '[E2E] Piercing Lifecycle Test',
            staffId: artist.id,
            timeStart: new Date(new Date(now).setDate(now.getDate() + 2)),
            timeEnd: new Date(new Date(now).setDate(now.getDate() + 2)),
            status: 'CONFIRMED' as const,
            type: 'PIERCING' as const,
            clientName: 'Test Client B',
            clientPhone: '+639000000002',
            createdBy: manager.id,
            branchId: branch.id,
            isWalkin: false,
            isActive: true,
            paymentStatus: 'UNPAID' as const,
        },
        {
            title: '[E2E] Shoe Cleaning Test',
            staffId: artist.id,
            timeStart: new Date(new Date(now).setDate(now.getDate() + 3)),
            timeEnd: new Date(new Date(now).setDate(now.getDate() + 3)),
            status: 'CONFIRMED' as const,
            type: 'SHOE' as const,
            clientName: 'Test Client C',
            clientPhone: '+639000000003',
            createdBy: manager.id,
            branchId: branch.id,
            isWalkin: false,
            isActive: true,
            paymentStatus: 'UNPAID' as const,
        },
        {
            title: '[E2E] Walk-in Tattoo with Downpayment',
            staffId: artist.id,
            timeStart: now,
            timeEnd: new Date(now.getTime() + 2 * 60 * 60 * 1000),
            status: 'COMPLETED' as const,
            type: 'TATTOO' as const,
            clientName: 'Walk-in Client Z',
            clientPhone: '+639000000005',
            createdBy: manager.id,
            branchId: branch.id,
            isWalkin: true,
            isActive: true,
            paymentStatus: 'DEPOSIT_PAID' as const,
            downpaymentAmount: '500.00',
            downpaymentCollectedAt: now,
        },
        {
            title: '[E2E] Reschedule Test',
            staffId: artist.id,
            timeStart: new Date(new Date(now).setDate(now.getDate() + 4)),
            timeEnd: new Date(new Date(now).setDate(now.getDate() + 4)),
            status: 'CONFIRMED' as const,
            type: 'TATTOO' as const,
            clientName: 'Test Client D',
            clientPhone: '+639000000004',
            createdBy: manager.id,
            branchId: branch.id,
            isWalkin: false,
            isActive: true,
            paymentStatus: 'UNPAID' as const,
        },
    ]

    for (const appt of appts) {
        const [existing] = await db.select({ id: appointments.id })
            .from(appointments)
            .where(eq(appointments.title, appt.title))
        
        if (existing) {
            console.log(`   ⚠️  Already exists: ${appt.title}`)
            continue
        }

        const [inserted] = await db.insert(appointments).values(appt).returning()
        console.log(`   ✅ Created: ${inserted.title} (${inserted.status}, ${inserted.type})`)
    }

    console.log('\n✅ Appointments created successfully')
    await db.$client.end()
    process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })
