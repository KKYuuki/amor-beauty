import { rateLimit } from '@/utils/rate-limit'

export async function GET() {
    const rateLimitResult = await rateLimit({
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 60,
        key: 'alive'
    })

    if (!rateLimitResult.success) {
        return new Response('Too Many Requests', {
            status: 429,
            headers: {
                'X-RateLimit-Remaining': String(rateLimitResult.remaining)
            }
        })
    }

    return new Response('Still Alive', {
        status: 200,
        headers: {
            'X-RateLimit-Remaining': String(rateLimitResult.remaining)
        }
    })
}