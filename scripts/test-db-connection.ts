#!/usr/bin/env bun
import { Client } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:cIl1s02otMlO4gjGPznR8U@100.67.98.55:5561/postgres'

async function testConnection() {
    console.log('\n🔌 Testing Database Connection\n')
    console.log(`URL: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`)
    
    const client = new Client({
        connectionString: DATABASE_URL,
    })
    
    try {
        console.log('Connecting...')
        await client.connect()
        console.log('✅ Connected successfully!\n')
        
        // Test query
        console.log('Running test query...')
        const result = await client.query('SELECT NOW() as current_time, version() as version')
        console.log(`✅ Query successful!`)
        console.log(`   Current Time: ${result.rows[0].current_time}`)
        console.log(`   PostgreSQL Version: ${result.rows[0].version.split(' ')[0]}\n`)
        
        // List all tables
        console.log('Listing all tables...')
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `)
        
        if (tablesResult.rows.length === 0) {
            console.log('   ⚠️  No tables found in public schema')
        } else {
            console.log(`   ✅ Found ${tablesResult.rows.length} tables:`)
            tablesResult.rows.forEach((row: { table_name: string }) => {
                console.log(`      - ${row.table_name}`)
            })
        }
        
        // Check invitations table specifically
        console.log('\nChecking invitations table...')
        try {
            const inviteResult = await client.query('SELECT COUNT(*) as count FROM invitations')
            console.log(`   ✅ Invitations table exists with ${inviteResult.rows[0].count} record(s)`)
        } catch (e) {
            console.log('   ❌ Invitations table not found or error:', (e as Error).message)
        }
        
        // Check users table
        console.log('\nChecking users table...')
        try {
            const userResult = await client.query('SELECT COUNT(*) as count FROM "user"')
            console.log(`   ✅ Users table exists with ${userResult.rows[0].count} record(s)`)
        } catch (e) {
            console.log('   ❌ Users table not found or error:', (e as Error).message)
        }
        
        console.log('\n✅ Database connection test PASSED\n')
        return true
    } catch (error) {
        console.error('\n❌ Database connection FAILED:\n')
        console.error(`   ${(error as Error).message}\n`)
        return false
    } finally {
        await client.end()
    }
}

testConnection()
    .then(success => process.exit(success ? 0 : 1))
    .catch(() => process.exit(1))
