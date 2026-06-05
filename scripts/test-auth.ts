#!/usr/bin/env bun
/**
 * Auth System Health Check
 * Tests all critical auth components
 */

import { config } from 'dotenv'
import { db } from '../server/db'
import { invitations } from '../server/db/schema/invitations'
import { user } from '../server/db/schema/auth'
import { gt } from 'drizzle-orm'

config({ path: '.env.local' })

console.log('🔍 Better Auth Health Check\n')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

let hasErrors = false

// Test 1: Environment Variables
console.log('1️⃣  Checking Environment Variables...')
const requiredEnvVars = [
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'NEXT_PUBLIC_BETTER_AUTH_URL',
]

for (const envVar of requiredEnvVars) {
    const value = process.env[envVar]
    if (!value) {
        console.log(`   ❌ ${envVar} is missing`)
        hasErrors = true
    } else if (envVar === 'BETTER_AUTH_SECRET' && value.length < 32) {
        console.log(`   ⚠️  ${envVar} should be at least 32 characters (current: ${value.length})`)
        hasErrors = true
    } else {
        const displayValue = envVar.includes('SECRET')
            ? `${value.substring(0, 8)}... (${value.length} chars)`
            : value
        console.log(`   ✓ ${envVar} = ${displayValue}`)
    }
}

console.log()

// Test 2: Database Connection
console.log('2️⃣  Checking Database Connection...')
try {
    // Test connection with a simple query
    await db.$client.query('SELECT 1')
    console.log('   ✓ Database connection successful')
    console.log()
} catch (error) {
    console.log('   ❌ Database connection failed:', error instanceof Error ? error.message : 'Unknown error')
    hasErrors = true
    console.log()
    process.exit(1)
}

// Test 3: Auth Tables
console.log('3️⃣  Checking Auth Tables...')
const requiredTables = ['user', 'session', 'account', 'verification', 'two_factor', 'passkey', 'invitations']

try {
    const result = await db.$client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ANY($1::text[])
    `, [requiredTables])

    const foundTables = result.rows.map(row => row.table_name)
    
    for (const table of requiredTables) {
        if (foundTables.includes(table)) {
            console.log(`   ✓ ${table}`)
        } else {
            console.log(`   ❌ ${table} (missing)`)
            hasErrors = true
        }
    }
    console.log()
} catch (error) {
    console.log('   ❌ Failed to check tables:', error instanceof Error ? error.message : 'Unknown error')
    hasErrors = true
    console.log()
}

// Test 4: Valid Invitations
console.log('4️⃣  Checking Valid Invitations...')
try {
    const validInvitations = await db
        .select()
        .from(invitations)
        .where(
            gt(invitations.expiresAt, new Date())
        )

    if (validInvitations.length === 0) {
        console.log('   ⚠️  No valid invitation codes found')
        console.log('   📝 Run `bun run invite` to create one')
        hasErrors = true
    } else {
        console.log(`   ✓ ${validInvitations.length} valid invitation(s) available`)
        console.log()
        console.log('   Available Invitations:')
        for (const inv of validInvitations) {
            console.log(`   • ${inv.email} (${inv.role}) - expires ${inv.expiresAt.toLocaleDateString()}`)
            console.log(`     Code: ${inv.token}`)
        }
    }
    console.log()
} catch (error) {
    console.log('   ❌ Failed to check invitations:', error instanceof Error ? error.message : 'Unknown error')
    hasErrors = true
    console.log()
}

// Test 5: Existing Users
console.log('5️⃣  Checking Existing Users...')
try {
    const users = await db.select({
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
    }).from(user)

    if (users.length === 0) {
        console.log('   ℹ️  No users registered yet')
    } else {
        console.log(`   ✓ ${users.length} user(s) registered`)
        console.log()
        console.log('   Registered Users:')
        for (const u of users) {
            console.log(`   • ${u.email} (${u.role || 'N/A'}) - joined ${u.createdAt.toLocaleDateString()}`)
        }
    }
    console.log()
} catch (error) {
    console.log('   ❌ Failed to check users:', error instanceof Error ? error.message : 'Unknown error')
    hasErrors = true
    console.log()
}

// Test 6: Auth Route Handler
console.log('6️⃣  Checking Auth Route Handler...')
try {
    const { auth } = await import('../server/auth')
    if (typeof auth.handler === 'function') {
        console.log('   ✓ Auth handler is properly configured')
    } else {
        console.log('   ❌ Auth handler is not a function')
        hasErrors = true
    }
    console.log()
} catch (error) {
    console.log('   ❌ Failed to import auth:', error instanceof Error ? error.message : 'Unknown error')
    hasErrors = true
    console.log()
}

// Summary
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
if (hasErrors) {
    console.log('❌ Health check completed with errors')
    console.log('   Please fix the issues above and try again\n')
    process.exit(1)
} else {
    console.log('✅ All checks passed!')
    console.log('   Your auth system is ready to use\n')
    console.log('   Next steps:')
    console.log('   1. Start dev server: bun run dev')
    console.log('   2. Visit: https://localhost:3000/auth')
    console.log('   3. Sign up with an invitation code\n')
}

// Cleanup
await db.$client.end()
