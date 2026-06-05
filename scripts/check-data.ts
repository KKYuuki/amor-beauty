#!/usr/bin/env bun
import { Client } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:cIl1s02otMlO4gjGPznR8U@100.67.98.55:5561/postgres'

async function checkData() {
    console.log('\n🔍 Checking Data in Tables\n')
    
    const client = new Client({
        connectionString: DATABASE_URL,
    })
    
    try {
        await client.connect()
        
        // Check users
        const userResult = await client.query('SELECT COUNT(*) as count FROM "user"')
        console.log(`Users: ${userResult.rows[0].count}`)
        
        // Check sessions
        const sessionResult = await client.query('SELECT COUNT(*) as count FROM session')
        console.log(`Sessions: ${sessionResult.rows[0].count}`)
        
        // Show any users
        const users = await client.query('SELECT id, email, role FROM "user" LIMIT 5')
        if (users.rows.length > 0) {
            console.log('\nUsers:')
            users.rows.forEach(u => console.log(`  ${u.id}: ${u.email} (${u.role})`))
        }
        
        // Show invitations
        const invites = await client.query('SELECT email, token, role, used_at FROM invitations')
        console.log('\nInvitations:')
        invites.rows.forEach(i => {
            console.log(`  ${i.email}: ${i.used_at ? 'USED' : 'AVAILABLE'}`)
        })
        
    } catch (error) {
        console.error('Error:', (error as Error).message)
    } finally {
        await client.end()
    }
}

checkData()
