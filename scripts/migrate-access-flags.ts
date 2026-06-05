/**
 * One-shot migration script: Migrate old access flag names → canonical names.
 *
 * Usage: bun run scripts/migrate-access-flags.ts
 *
 * SAFETY: This script does NOT auto-commit. It logs what would change
 * in dry-run mode. Set DRY_RUN=false to execute.
 */

import { db } from '../server/db'
import { user } from '../server/db/schema/auth'
import { normalizeFlag, ACCESS_FLAGS } from '../utils/auth/access-flags'
import { eq } from 'drizzle-orm'

const DRY_RUN = process.env.DRY_RUN !== 'false'

async function main() {
    console.log(DRY_RUN ? '🔍 DRY RUN MODE — no changes will be made' : '⚠️  LIVE MODE — changes will be committed')
    console.log('')

    // Fetch all users with non-empty access_flags
    const users = await db
        .select({ id: user.id, email: user.email, accessFlags: user.accessFlags })
        .from(user)

    let totalMigrated = 0
    let totalUsers = 0

    for (const u of users) {
        const flags = (u.accessFlags ?? []) as string[]
        if (flags.length === 0) continue

        const oldFlags = [...flags]
        const newFlags = flags.map(f => normalizeFlag(f))

        // Deduplicate (e.g., both 'sales' and 'transactions' → 'transactions_manage')
        const uniqueNewFlags = [...new Set(newFlags)]

        // Filter to only valid flags
        const validFlags = uniqueNewFlags.filter(f => f in ACCESS_FLAGS)
        const invalidFlags = uniqueNewFlags.filter(f => !(f in ACCESS_FLAGS))

        if (JSON.stringify(oldFlags.sort()) === JSON.stringify(validFlags.sort())) {
            // No change needed
            continue
        }

        totalUsers++
        totalMigrated += oldFlags.length - validFlags.length

        console.log(`User: ${u.email} (${u.id})`)
        console.log(`  Old: [${oldFlags.join(', ')}]`)
        console.log(`  New: [${validFlags.join(', ')}]`)
        if (invalidFlags.length > 0) {
            console.log(`  ⚠️  Dropped unknown flags: [${invalidFlags.join(', ')}]`)
        }
        console.log('')

        if (!DRY_RUN) {
            await db
                .update(user)
                .set({ accessFlags: validFlags })
                .where(eq(user.id, u.id))
        }
    }

    console.log(`Total users with changes: ${totalUsers}`)
    console.log(`Total flag migrations: ${totalMigrated}`)

    if (DRY_RUN) {
        console.log('')
        console.log('Run with DRY_RUN=false to apply changes:')
        console.log('  DRY_RUN=false bun run scripts/migrate-access-flags.ts')
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Migration failed:', err)
        process.exit(1)
    })
