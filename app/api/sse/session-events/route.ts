import { auth } from '@/server/auth'
import { sessionEventEmitter } from '@/utils/sse/session-events'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * SSE endpoint for real-time session change notifications.
 *
 * The client (browser) opens a persistent EventSource connection here.
 * When a user's profile is updated (e.g., admin changes their access flags),
 * the server emits a 'session-changed' event, and this route pushes it
 * to the affected user's browser so they can refetch their session immediately.
 *
 * Authentication is handled via cookies (EventSource sends cookies automatically).
 */
export async function GET(request: Request): Promise<Response> {
    // Authenticate via session cookie
    const session = await auth.api.getSession({
        headers: request.headers,
    })

    if (!session?.user?.id) {
        return new Response('Unauthorized', { status: 401 })
    }

    const userId = session.user.id

    const stream = new ReadableStream({
        start(controller) {
            const handler = (targetUserId: string) => {
                if (targetUserId === userId) {
                    const payload = JSON.stringify({ event: 'session-changed' })
                    controller.enqueue(`data: ${payload}\n\n`)
                }
            }

            sessionEventEmitter.on('session-changed', handler)

            // Keep-alive ping every 30 seconds to prevent proxy timeouts
            const keepAlive = setInterval(() => {
                controller.enqueue(': keepalive\n\n')
            }, 30_000)

            // Cleanup on disconnect
            request.signal.addEventListener('abort', () => {
                clearInterval(keepAlive)
                sessionEventEmitter.off('session-changed', handler)
                controller.close()
            })
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
        },
    })
}
