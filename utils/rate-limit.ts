import { headers } from 'next/headers'
import { createLogs } from '@/server/actions/logs'

interface RateLimitConfig {
    windowMs: number
    maxRequests: number
    key?: string
}

const requestCounts = new Map<string, { count: number; resetTime: number }>()

export async function rateLimit(config: RateLimitConfig): Promise<{ success: boolean; remaining: number }> {
    const headersList = await headers()
    const ip = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? 'unknown'
    const key = `${config.key ?? 'default'}:${ip}`
    const now = Date.now()
    const record = requestCounts.get(key)

    if (!record || now > record.resetTime) {
        requestCounts.set(key, { count: 1, resetTime: now + config.windowMs })
        return { success: true, remaining: config.maxRequests - 1 }
    }

    if (record.count >= config.maxRequests) {
        await createLogs({
            logs: [{ level: 'WARN', type: 'AUTH', message: `Rate limit exceeded for ${key}` }]
        })
        return { success: false, remaining: 0 }
    }

    record.count++
    return { success: true, remaining: config.maxRequests - record.count }
}
