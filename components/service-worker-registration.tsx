"use client"

import { useEffect } from "react"

export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js", { scope: "/" })
                .then((registration) => {
                    console.log("[PWA] Service Worker registered:", registration.scope)

                    // Check for updates
                    registration.addEventListener("updatefound", () => {
                        const installingWorker = registration.installing
                        if (installingWorker) {
                            installingWorker.addEventListener("statechange", () => {
                                if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                                    console.log("[PWA] New content available - please refresh")
                                }
                            })
                        }
                    })
                })
                .catch((error) => {
                    console.error("[PWA] Service Worker registration failed:", error)
                })
        }
    }, [])

    return null
}
