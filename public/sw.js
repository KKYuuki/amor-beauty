// Inksight RDMD Service Worker
// Provides offline support and caching for the PWA

const CACHE_VERSION = "v1"
const STATIC_CACHE = `inksight-static-${CACHE_VERSION}`
const PAGES_CACHE = `inksight-pages-${CACHE_VERSION}`
const API_CACHE = `inksight-api-${CACHE_VERSION}`
const IMAGE_CACHE = `inksight-images-${CACHE_VERSION}`
const FONT_CACHE = `inksight-fonts-${CACHE_VERSION}`

// Assets to precache on install
const PRECACHE_URLS = [
    "/",
    "/manifest.webmanifest",
    "/icon-512.svg",
    "/icon.svg",
]

// Install event - precache core assets
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            return cache.addAll(PRECACHE_URLS).catch((err) => {
                console.warn("[SW] Precaching failed for some assets:", err)
            })
        })
    )
    self.skipWaiting()
})

// Activate event - clean old caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name.startsWith("inksight-") && name !== STATIC_CACHE && name !== PAGES_CACHE && name !== API_CACHE && name !== IMAGE_CACHE && name !== FONT_CACHE)
                    .map((name) => caches.delete(name))
            )
        })
    )
    self.clients.claim()
})

// Helper: determine if request is an API call
function isApiRequest(request) {
    const url = new URL(request.url)
    return url.pathname.startsWith("/api/")
}

// Helper: determine if request is a page navigation
function isPageRequest(request) {
    return request.mode === "navigate" || (request.method === "GET" && request.headers.get("accept")?.includes("text/html"))
}

// Helper: determine if request is for static assets
function isStaticAsset(request) {
    const url = new URL(request.url)
    return (
        url.pathname.startsWith("/_next/static/") ||
        url.pathname.startsWith("/static/") ||
        /\.(js|css|json|ico|webmanifest)$/.test(url.pathname)
    )
}

// Helper: determine if request is for an image
function isImage(request) {
    const url = new URL(request.url)
    return /\.(png|jpg|jpeg|gif|webp|svg|avif)$/.test(url.pathname)
}

// Helper: determine if request is for a font
function isFont(request) {
    const url = new URL(request.url)
    return /\.(woff|woff2|ttf|otf|eot)$/.test(url.pathname)
}

// Fetch event - serve from cache with network fallback strategies
self.addEventListener("fetch", (event) => {
    const { request } = event

    // Skip non-GET requests
    if (request.method !== "GET") return

    // Handle API requests: Network first, cache fallback
    if (isApiRequest(request)) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clonedResponse = response.clone()
                    caches.open(API_CACHE).then((cache) => {
                        if (response.ok) {
                            cache.put(request, clonedResponse)
                        }
                    })
                    return response
                })
                .catch(() => {
                    return caches.match(request)
                })
        )
        return
    }

    // Handle page navigations: Network first, offline fallback
    if (isPageRequest(request)) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clonedResponse = response.clone()
                    caches.open(PAGES_CACHE).then((cache) => {
                        cache.put(request, clonedResponse)
                    })
                    return response
                })
                .catch(() => {
                    return caches.match(request).then((cached) => {
                        return cached || caches.match("/")
                    })
                })
        )
        return
    }

    // Handle images: Cache first, network fallback
    if (isImage(request)) {
        event.respondWith(
            caches.match(request).then((cached) => {
                return (
                    cached ||
                    fetch(request).then((response) => {
                        const clonedResponse = response.clone()
                        caches.open(IMAGE_CACHE).then((cache) => {
                            cache.put(request, clonedResponse)
                        })
                        return response
                    })
                )
            })
        )
        return
    }

    // Handle fonts: Cache first
    if (isFont(request)) {
        event.respondWith(
            caches.match(request).then((cached) => {
                return (
                    cached ||
                    fetch(request).then((response) => {
                        const clonedResponse = response.clone()
                        caches.open(FONT_CACHE).then((cache) => {
                            cache.put(request, clonedResponse)
                        })
                        return response
                    })
                )
            })
        )
        return
    }

    // Handle static assets: Stale-while-revalidate
    if (isStaticAsset(request)) {
        event.respondWith(
            caches.open(STATIC_CACHE).then((cache) => {
                return cache.match(request).then((cached) => {
                    const fetchPromise = fetch(request).then((response) => {
                        cache.put(request, response.clone())
                        return response
                    })
                    return cached || fetchPromise
                })
            })
        )
        return
    }

    // Default: Network first for everything else
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    const clonedResponse = response.clone()
                    caches.open(STATIC_CACHE).then((cache) => {
                        cache.put(request, clonedResponse)
                    })
                }
                return response
            })
            .catch(() => {
                return caches.match(request)
            })
    )
})

// ==========================================================================
// PUSH NOTIFICATIONS
// ==========================================================================

self.addEventListener("push", (event) => {
    let payload = { title: "New Notification", body: "", data: {} }

    if (event.data) {
        try {
            payload = event.data.json()
        } catch {
            payload.body = event.data.text()
        }
    }

    const { title, ...options } = payload

    event.waitUntil(
        self.registration.showNotification(title, {
            body: options.body || "",
            icon: options.icon || "/icon-192.png",
            badge: options.badge || "/icon-192.png",
            tag: options.tag || "payroll-notification",
            data: options.data || {},
            vibrate: [200, 100, 200],
            requireInteraction: false,
        })
    )
})

self.addEventListener("notificationclick", (event) => {
    event.notification.close()

    const { path = "/" } = event.notification.data || {}

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            // If a window is already open, focus it and navigate
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && "focus" in client) {
                    client.focus()
                    client.postMessage({ type: "notification-navigate", path })
                    return
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow(path)
            }
        })
    )
})
