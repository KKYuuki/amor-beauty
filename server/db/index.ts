import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { Pool } from 'pg'
import { getEnv } from '@/utils/env'

// Validate environment variables before connecting
const env = getEnv()

const ssl = env.DATABASE_SSL ? { rejectUnauthorized: true } : false

// Use Pool instead of Client - Pool auto-connects and manages connections
// Connection pool size appropriate for typical workloads
let connectionString = env.DATABASE_URL

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined in environment variables')
}

// Database is locally hosted, so we can skip SSL configuration
if (!connectionString.includes('?sslmode=')) {
    connectionString = connectionString + '?sslmode=disable'
}

const pool = new Pool({
    connectionString: `${connectionString}`,
    ssl,
    max: 10, // Maximum number of connections in pool
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 5000, // Timeout for new connections
})

// Handle pool errors to prevent app crashes
pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err)
})

export const db = drizzle(pool)

export type Database = typeof db

export async function checkDatabaseConnection(): Promise<boolean> {
    try {
        await db.execute(sql`SELECT 1`)
        return true
    } catch {
        return false
    }
}
