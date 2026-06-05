#!/usr/bin/env bun
import { Client } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL environment variable is required')
    console.error('   Please set it in your .env.local file')
    process.exit(1)
}

async function checkSchema() {
    console.log('\n🔍 Checking User Table Schema\n')
    
    const client = new Client({
        connectionString: DATABASE_URL,
    })
    
    try {
        await client.connect()
        
        // Check user table columns
        const result = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'user'
            ORDER BY ordinal_position
        `)
        
        console.log('User table columns:')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        result.rows.forEach((row) => {
            console.log(`  ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(NOT NULL)' : ''}`)
        })
        
        console.log('\n✅ Schema check complete\n')
        process.exit(0)
    } catch (error) {
        console.error('\n❌ Schema check failed:\n')
        console.error((error as Error).message)
        process.exit(1)
    } finally {
        await client.end()
    }
}

checkSchema()
