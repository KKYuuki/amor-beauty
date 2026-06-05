#!/usr/bin/env bun
import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from '../server/db/index'
import { user } from '../server/db/schema/auth'
import { rateLevels } from '../server/db/schema/rate-levels'
import { eq } from 'drizzle-orm'

async function main() {
    // Get rate level IDs
    const levels = await db.select().from(rateLevels)
    const levelMap = Object.fromEntries(levels.map(l => [l.slug, l.id]))
    console.log('Rate levels:', Object.keys(levelMap).join(', '))

    // Update e2e-admin
    await db.update(user).set({
        rateLevelId: levelMap.owner,
        accessFlags: ['artist', 'piercing', 'shoe'],
    }).where(eq(user.email, 'e2e-admin@amorbeautylounge.com'))
    console.log('✅ e2e-admin updated')

    // Update e2e-manager
    await db.update(user).set({
        rateLevelId: levelMap.senior,
        accessFlags: ['appointments_manage', 'sales_access', 'payroll_manage', 'accounting_access', 'transactions_manage', 'inventory_manage', 'metrics_view', 'logs_view', 'notifications_send'],
    }).where(eq(user.email, 'e2e-manager@amorbeautylounge.com'))
    console.log('✅ e2e-manager updated')

    // Update e2e-artist
    await db.update(user).set({
        rateLevelId: levelMap.standard,
        accessFlags: ['appointments_view', 'appointments_manage', 'time_clock_manage', 'artist'],
    }).where(eq(user.email, 'e2e-artist@amorbeautylounge.com'))
    console.log('✅ e2e-artist updated')

    // Update e2e-staff
    await db.update(user).set({
        rateLevelId: levelMap.standard,
        accessFlags: ['appointments_view', 'time_clock_manage'],
    }).where(eq(user.email, 'e2e-staff@amorbeautylounge.com'))
    console.log('✅ e2e-staff updated')

    console.log('\n✅ All accounts updated')
    await db.$client.end()
    process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })
