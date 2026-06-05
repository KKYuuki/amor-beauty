import { NextResponse } from 'next/server'
import { getSetting } from '@/server/actions/settings'
import { rateLimit } from '@/utils/rate-limit'
import { createLogs } from '@/server/actions/logs'

export async function GET() {
    const rateLimitResult = await rateLimit({
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 100,
        key: 'public-hours'
    })

    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: 'Too Many Requests' },
            { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
        )
    }

    try {
        const result = await getSetting('business_hours')
        if (!result.success) {
            return NextResponse.json(
                { error: 'Failed to fetch hours settings' },
                { status: 500 }
            )
        }
        return NextResponse.json(
            { hours: result.data || {} },
            { headers: { 'X-RateLimit-Remaining': String(rateLimitResult.remaining) } }
        )
    } catch (_error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: 'Failed to fetch hours settings' }] })
        return NextResponse.json(
            { error: 'Failed to fetch hours settings' },
            { status: 500 }
        )
    }
}

export async function OPTIONS() {
    return NextResponse.json(null, {
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    })
}
