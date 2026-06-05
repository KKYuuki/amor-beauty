#!/usr/bin/env bun
/**
 * Migration script to regenerate all invitation codes to 8-digit numeric format
 * Run with: bun run scripts/migrate-invitation-codes.ts
 */

import { db } from '../server/db'
import { invitations } from '../server/db/schema/invitations'
import { eq } from 'drizzle-orm'

function generateNumericCode(): string {
    return Math.floor(10000000 + Math.random() * 90000000).toString()
}

async function migrateCodes() {
    console.log('Starting invitation code migration...')
    
    const existing = await db.select().from(invitations)
    console.log(`Found ${existing.length} invitations to migrate`)
    
    const usedCodes = new Set<string>()
    
    for (const inv of existing) {
        let newCode: string
        do {
            newCode = generateNumericCode()
        } while (usedCodes.has(newCode))
        
        usedCodes.add(newCode)
        
        await db
            .update(invitations)
            .set({ token: newCode })
            .where(eq(invitations.id, inv.id))
        
        console.log(`Migrated ${inv.email}: ${inv.token.slice(0, 8)}... -> ${newCode}`)
    }
    
    console.log('Migration complete!')
    process.exit(0)
}

migrateCodes().catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
})
