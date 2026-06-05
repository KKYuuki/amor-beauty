"use client"

import { usePushNotifications } from "@/hooks/use-push-notifications"
import { BellIcon, BellOffIcon, Loader2Icon } from "lucide-react"

export default function PushNotificationSettings() {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  } = usePushNotifications()

  if (!isSupported) {
    return null
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-500/20 p-2">
            {isSubscribed ? (
              <BellIcon size={18} className="text-blue-400" />
            ) : (
              <BellOffIcon size={18} className="text-zinc-500" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Push Notifications
            </h3>
            <p className="text-xs text-zinc-400">
              {isSubscribed
                ? "You will receive payroll notifications on your device"
                : "Get notified when payroll requests are submitted or disbursed"}
            </p>
          </div>
        </div>
        <button
          onClick={isSubscribed ? unsubscribe : subscribe}
          disabled={isLoading}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors ${
            isSubscribed
              ? "border-blue-500 bg-blue-500"
              : "border-zinc-700 bg-zinc-700"
          } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          aria-label={isSubscribed ? "Disable push notifications" : "Enable push notifications"}
        >
          {isLoading ? (
            <Loader2Icon size={12} className="absolute left-0.5 animate-spin text-white" />
          ) : (
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                isSubscribed ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          )}
        </button>
      </div>
      {error && (
        <p className="mt-3 text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}
