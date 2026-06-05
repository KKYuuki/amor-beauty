/**
 * Lightweight retry wrapper for server action calls.
 * Only retries on thrown errors (network/transport failures).
 * Never retries on ActionResponse failures (validation/logic errors).
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: {
        maxAttempts?: number
        baseDelayMs?: number
    } = {}
): Promise<T> {
    const { maxAttempts = 3, baseDelayMs = 1000 } = options
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error
            if (attempt < maxAttempts) {
                const delay = baseDelayMs * Math.pow(2, attempt - 1)
                await new Promise(resolve => setTimeout(resolve, delay))
            }
        }
    }

    throw lastError
}
