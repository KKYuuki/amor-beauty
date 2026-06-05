#!/usr/bin/env bun
import { Client } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:cIl1s02otMlO4gjGPznR8U@100.67.98.55:5561/postgres'

async function addAllMissingColumns() {
    console.log('\n🔧 Adding All Missing Columns\n')
    
    const client = new Client({
        connectionString: DATABASE_URL,
    })
    
    try {
        await client.connect()
        
        const columns = [
            { name: 'full_name', type: 'varchar(255)' },
            { name: 'phone_number', type: 'varchar(50)' },
            { name: 'instagram_handle', type: 'varchar(100)' },
            { name: 'avatar_url', type: 'text' },
            { name: 'user_role', type: 'varchar(50)', default: "'CLIENT'" },
            { name: 'access_flags', type: 'jsonb', default: "'[]'::jsonb" },
            { name: 'is_staff', type: 'boolean', default: 'false' },
            { name: 'is_active', type: 'boolean', default: 'true' },
            { name: 'last_login_at', type: 'timestamp with time zone' },
            { name: 'tos', type: 'boolean', default: 'false' },
            { name: 'rate_level_id', type: 'uuid' },
            { name: 'payout_period', type: 'varchar(50)', default: "'WEEKLY'" },
        ]
        
        for (const col of columns) {
            console.log(`Adding ${col.name} column...`)
            let sql = `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`
            if (col.default) {
                sql += ` DEFAULT ${col.default}`
            }
            await client.query(sql)
            console.log(`✅ ${col.name} column added`)
        }
        
        console.log('\n✅ All missing columns added!\n')
        
        // Verify
        const result = await client.query(`
            SELECT column_name 
            FROM information_schema.columns
            WHERE table_name = 'user'
            ORDER BY ordinal_position
        `)
        
        console.log('Updated columns:')
        result.rows.forEach((row) => {
            console.log(`  - ${row.column_name}`)
        })
        console.log()
        
    } catch (error) {
        console.error('\n❌ Failed:\n')
        console.error((error as Error).message)
        process.exit(1)
    } finally {
        await client.end()
    }
}

addAllMissingColumns()
