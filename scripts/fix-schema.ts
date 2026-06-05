#!/usr/bin/env bun
import { Client } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:cIl1s02otMlO4gjGPznR8U@100.67.98.55:5561/postgres'

async function fixSchema() {
    console.log('\n🔧 Fixing User Table Schema\n')
    
    const client = new Client({
        connectionString: DATABASE_URL,
    })
    
    try {
        await client.connect()
        
        // Add password column if it doesn't exist
        console.log('Adding password column...')
        await client.query(`
            ALTER TABLE "user" 
            ADD COLUMN IF NOT EXISTS password text
        `)
        console.log('✅ Password column added')
        
        // Add other missing columns that Better-Auth might expect
        console.log('Adding role column...')
        await client.query(`
            ALTER TABLE "user" 
            ADD COLUMN IF NOT EXISTS role varchar(50)
        `)
        console.log('✅ Role column added')
        
        console.log('Adding banned column...')
        await client.query(`
            ALTER TABLE "user" 
            ADD COLUMN IF NOT EXISTS banned boolean DEFAULT false
        `)
        console.log('✅ Banned column added')
        
        console.log('Adding ban_reason column...')
        await client.query(`
            ALTER TABLE "user" 
            ADD COLUMN IF NOT EXISTS ban_reason text
        `)
        console.log('✅ Ban_reason column added')
        
        console.log('Adding ban_expires column...')
        await client.query(`
            ALTER TABLE "user" 
            ADD COLUMN IF NOT EXISTS ban_expires timestamp with time zone
        `)
        console.log('✅ Ban_expires column added')
        
        console.log('\n✅ Schema fix complete!\n')
        
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
        console.error('\n❌ Schema fix failed:\n')
        console.error((error as Error).message)
        process.exit(1)
    } finally {
        await client.end()
    }
}

fixSchema()
