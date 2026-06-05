import { db } from '@/server/db'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        await db.execute(sql`SELECT 1`)
        return NextResponse.json({
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
        })
    } catch (error) {
        return NextResponse.json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 503 })
    }
}
