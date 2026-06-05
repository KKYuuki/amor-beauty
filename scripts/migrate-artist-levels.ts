#!/usr/bin/env bun
import { db } from '../server/db'
import { rateLevels } from '../server/db/schema/rate-levels'
import { sql } from 'drizzle-orm'
import { config } from 'dotenv'

config({ path: '.env.local' })

const LEVEL_MAP: Record<string, string> = {
    NORMAL: 'standard',
    HEAD_ARTIST: 'senior',
    OWNER: 'owner',
}

async function migrateArtistLevels() {
    console.log('Migrating artist levels to rate levels...')

    // Step 1: Ensure default rate levels exist
    const defaults = [
        { name: 'Standard', slug: 'standard', sortOrder: 0, isActive: true },
        { name: 'Senior', slug: 'senior', sortOrder: 1, isActive: true },
        { name: 'Owner', slug: 'owner', sortOrder: 2, isActive: true },
    ]

    for (const level of defaults) {
        await db.insert(rateLevels).values(level).onConflictDoNothing()
    }

    // Fetch the seeded levels
    const allLevels = await db.select().from(rateLevels)
    const levelBySlug = new Map(allLevels.map(l => [l.slug, l.id]))

    // Step 2: Migrate payroll_staff_rate if old column exists
    try {
        const result = await db.execute(sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'payroll_staff_rate' AND column_name = 'artist_level'
        `)
        if (result.rows.length > 0) {
            console.log('  → Found artist_level in payroll_staff_rate, migrating...')
            for (const [oldValue, slug] of Object.entries(LEVEL_MAP)) {
                const newId = levelBySlug.get(slug)
                if (!newId) continue
                await db.execute(sql`
                    UPDATE payroll_staff_rate 
                    SET rate_level_id = ${newId} 
                    WHERE artist_level = ${oldValue}
                `)
            }
            console.log('  ✅ payroll_staff_rate migrated')
        } else {
            console.log('  ⏭️  payroll_staff_rate.artist_level column not found, skipping')
        }
    } catch (error) {
        console.error('  ⚠️  Error migrating payroll_staff_rate:', error)
    }

    // Step 3: Migrate users if old column exists
    try {
        const result = await db.execute(sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user' AND column_name = 'artist_level'
        `)
        if (result.rows.length > 0) {
            console.log('  → Found artist_level in user, migrating...')
            for (const [oldValue, slug] of Object.entries(LEVEL_MAP)) {
                const newId = levelBySlug.get(slug)
                if (!newId) continue
                await db.execute(sql`
                    UPDATE "user" 
                    SET rate_level_id = ${newId} 
                    WHERE artist_level = ${oldValue}
                `)
            }
            console.log('  ✅ user table migrated')
        } else {
            console.log('  ⏭️  user.artist_level column not found, skipping')
        }
    } catch (error) {
        console.error('  ⚠️  Error migrating user table:', error)
    }

    console.log('Migration complete')
}

migrateArtistLevels().catch(console.error)
