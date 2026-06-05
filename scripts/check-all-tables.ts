#!/usr/bin/env bun
import { Client } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:cIl1s02otMlO4gjGPznR8U@100.67.98.55:5561/postgres'

async function checkAllTables() {
    console.log('\n🔍 Checking All Auth Tables\n')
    
    const client = new Client({
        connectionString: DATABASE_URL,
    })
    
    try {
        await client.connect()
        
        const tables = ['user', 'session', 'account', 'verification', 'two_factor', 'passkey']
        
        for (const table of tables) {
            console.log(`\n📋 Table: ${table}`)
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
            
            try {
                const result = await client.query(`
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_name = $1
                    ORDER BY ordinal_position
                `, [table])
                
                if (result.rows.length === 0) {
                    console.log('  Table does not exist')
                } else {
                    result.rows.forEach((row) => {
                        console.log(`  ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(NOT NULL)' : ''}`)
                    })
                }
            } catch (e) {
                console.log(`  Error: ${(e as Error).message}`)
            }
        }
        
        console.log('\n✅ Schema check complete\n')
        
    } catch (error) {
        console.error('\n❌ Failed:\n')
        console.error((error as Error).message)
    } finally {
        await client.end()
    }
}

checkAllTables()
