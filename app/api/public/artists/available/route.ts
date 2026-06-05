import { NextResponse } from 'next/server'
import { getAvailableStaff } from '@/server/actions/time-clock'
import { rateLimit } from '@/utils/rate-limit'

function isValidDateFormat(dateStr: string): boolean {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(dateStr)) return false
    const date = new Date(dateStr)
    return !isNaN(date.getTime())
}

export async function GET(request: Request) {
    const rateLimitResult = await rateLimit({
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 100,
        key: 'public-artists'
    })

    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: 'Too Many Requests' },
            { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
        )
    }

    try {
        const { searchParams } = new URL(request.url)
        const dateStr = searchParams.get('date')

        if (dateStr && !isValidDateFormat(dateStr)) {
            return NextResponse.json(
                { error: 'Invalid date format. Use YYYY-MM-DD' },
                { status: 400 }
            )
        }

        const date = dateStr ? new Date(dateStr) : new Date()

        const staffIds = await getAvailableStaff(date)
        return NextResponse.json(
            { staff: staffIds },
            { headers: { 'X-RateLimit-Remaining': String(rateLimitResult.remaining) } }
        )
    } catch (_error) {
        return NextResponse.json(
            { error: 'Failed to fetch available staff' },
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
