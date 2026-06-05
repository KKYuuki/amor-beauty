"use client"

import { useEffect, useRef } from 'react'

/**
 * Subscribe to Server-Sent Events for session changes.
 *
 * When called, opens a persistent EventSource connection to
 * /api/sse/session-events. When the server emits a 'session-changed'
 * event for this user (e.g., after an admin updates their access flags),
 * the onSessionChanged callback is invoked so the session can be refetched.
 *
 * Usage:
 *   useSessionSSE(userId, () => refetch())
 *
 * The connection is automatically cleaned up on unmount or when userId changes.
 */
export function useSessionSSE(
    userId: string | undefined,
    onSessionChanged: () => void
) {
    // Use a ref for the callback to avoid reconnecting on every render
    const callbackRef = useRef(onSessionChanged)
    callbackRef.current = onSessionChanged

    useEffect(() => {
        if (!userId) return

        let eventSource: EventSource | null = null
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

        const connect = () => {
            eventSource = new EventSource('/api/sse/session-events')

            eventSource.addEventListener('session-changed', () => {
                callbackRef.current()
            })

            eventSource.onerror = () => {
                // EventSource will auto-reconnect, but with a delay.
                // We close it and handle reconnection ourselves for more control.
                eventSource?.close()
                eventSource = null
                // Retry after 5 seconds
                reconnectTimeout = setTimeout(connect, 5_000)
            }
        }

        connect()

        return () => {
            if (reconnectTimeout) clearTimeout(reconnectTimeout)
            eventSource?.close()
        }
    }, [userId])
}
