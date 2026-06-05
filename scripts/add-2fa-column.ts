#!/usr/bin/env bun
import { Client } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:cIl1s02otMlO4gjGPznR8U@100.67.98.55:5561/postgres'

async function addTwoFactorEnabledColumn() {
    console.log('\n🔧 Adding two_factor_enabled column\n')
    
    const client = new Client({
        connectionString: DATABASE_URL,
    })
    
    try {
        await client.connect()
        
        await client.query(`
            ALTER TABLE "user" 
            ADD COLUMN IF NOT EXISTS two_factor_enabled boolean DEFAULT false
        `)
        
        console.log('✅ two_factor_enabled column added\n')
        
    } catch (error) {
        console.error('\n❌ Failed:\n')
        console.error((error as Error).message)
        process.exit(1)
    } finally {
        await client.end()
    }
}

addTwoFactorEnabledColumn()
