interface CacheEntry<T> {
    data: T
    timestamp: number
    ttl: number
}

class MemoryCache {
    private cache = new Map<string, CacheEntry<unknown>>()

    get<T>(key: string): T | null {
        const entry = this.cache.get(key)
        if (!entry) return null

        if (Date.now() > entry.timestamp + entry.ttl) {
            this.cache.delete(key)
            return null
        }

        return entry.data as T
    }

    set<T>(key: string, data: T, ttlMs: number): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttlMs,
        })
    }

    invalidate(pattern: string): void {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key)
            }
        }
    }
}

export const cache = new MemoryCache()
