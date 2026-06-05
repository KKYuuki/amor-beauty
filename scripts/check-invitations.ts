#!/usr/bin/env bun
import { Client } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:cIl1s02otMlO4gjGPznR8U@100.67.98.55:5561/postgres'

async function checkInvitations() {
    console.log('\n🔍 Checking Invitations\n')
    
    const client = new Client({
        connectionString: DATABASE_URL,
    })
    
    try {
        await client.connect()
        
        const result = await client.query('SELECT * FROM invitations')
        
        console.log(`Found ${result.rows.length} invitation(s):\n`)
        
        result.rows.forEach((row, i) => {
            console.log(`Invitation ${i + 1}:`)
            console.log(`  Email: ${row.email}`)
            console.log(`  Token: ${row.token}`)
            console.log(`  Role: ${row.role}`)
            console.log(`  Expires: ${row.expires_at}`)
            console.log(`  Used At: ${row.used_at || 'Not used'}`)
            console.log(`  Created: ${row.created_at}`)
            console.log()
        })
        
    } catch (error) {
        console.error('\n❌ Failed:\n')
        console.error((error as Error).message)
    } finally {
        await client.end()
    }
}

checkInvitations()
