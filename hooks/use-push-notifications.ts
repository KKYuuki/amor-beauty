"use client"

import { useState, useEffect, useCallback } from "react"
import {
  subscribePushSubscription,
  unsubscribePushSubscription,
  getVapidPublicKey,
} from "@/server/actions/push-subscriptions"

export type PushPermissionState = "default" | "granted" | "denied"

interface UsePushNotificationsReturn {
  isSupported: boolean
  permission: PushPermissionState
  isSubscribed: boolean
  isLoading: boolean
  error: string | null
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [permission, setPermission] = useState<PushPermissionState>("default")
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window

  useEffect(() => {
    if (!isSupported) return

    setPermission(Notification.permission as PushPermissionState)

    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((subscription) => {
        setIsSubscribed(!!subscription)
      }).catch(() => {
        setIsSubscribed(false)
      })
    }).catch(() => {
      setIsSubscribed(false)
    })
  }, [isSupported])

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      setError("Push notifications are not supported in this browser")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      let currentPermission = Notification.permission as PushPermissionState
      if (currentPermission === "default") {
        currentPermission = (await Notification.requestPermission()) as PushPermissionState
        setPermission(currentPermission)
      }

      if (currentPermission === "denied") {
        setError("Notification permission was denied. Please enable it in your browser settings.")
        setIsLoading(false)
        return
      }

      const vapidPublicKey = await getVapidPublicKey()
      if (!vapidPublicKey) {
        setError("Push notification configuration is not available")
        setIsLoading(false)
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      })

      const result = await subscribePushSubscription({
        endpoint: subscription.endpoint,
        p256dhKey: (subscription.toJSON() as PushSubscriptionJSON).keys?.p256dh || "",
        authKey: (subscription.toJSON() as PushSubscriptionJSON).keys?.auth || "",
        userAgent: navigator.userAgent,
      })

      if (!result.success) {
        setError(result.error || "Failed to save subscription")
        setIsSubscribed(false)
      } else {
        setIsSubscribed(true)
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to enable push notifications"
      )
      setIsSubscribed(false)
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return

    setIsLoading(true)
    setError(null)

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        await subscription.unsubscribe()
        await unsubscribePushSubscription(subscription.endpoint)
      }

      setIsSubscribed(false)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to disable push notifications"
      )
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  }
}