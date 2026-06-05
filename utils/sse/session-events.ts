import { EventEmitter } from 'events'

/**
 * Singleton event emitter for server-side session change notifications.
 *
 * Emits 'session-changed' with the target userId when a user's profile
 * (access flags, role, etc.) is updated. SSE endpoints listen for these
 * events to push real-time updates to connected clients.
 *
 * Extensible: add new event types here as needed for other SSE use cases.
 */
class SessionEventEmitter extends EventEmitter {
    private static instance: SessionEventEmitter

    static getInstance(): SessionEventEmitter {
        if (!SessionEventEmitter.instance) {
            SessionEventEmitter.instance = new SessionEventEmitter()
            // Support up to 100 concurrent SSE connections
            SessionEventEmitter.instance.setMaxListeners(100)
        }
        return SessionEventEmitter.instance
    }
}

export const sessionEventEmitter = SessionEventEmitter.getInstance()
