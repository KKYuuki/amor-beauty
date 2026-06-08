"use client"

import { NotificationContextType } from "@/utils/types/notifications"
import { CheckIcon, TriangleAlertIcon, XIcon, InfoIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { createContext, useCallback, useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"

const notificationStyles = {
    INFO: {
        icon: InfoIcon,
        borderColor: "border-blue-500/40",
        iconColor: "text-blue-400",
        iconBg: "bg-blue-500/20",
        bgAccent: "bg-blue-500/10",
        progressColor: "bg-blue-400",
    },
    SUCCESS: {
        icon: CheckIcon,
        borderColor: "border-green-500/40",
        iconColor: "text-green-400",
        iconBg: "bg-green-500/20",
        bgAccent: "bg-green-500/10",
        progressColor: "bg-green-400",
    },
    WARNING: {
        icon: TriangleAlertIcon,
        borderColor: "border-orange-500/40",
        iconColor: "text-orange-400",
        iconBg: "bg-orange-500/20",
        bgAccent: "bg-orange-500/10",
        progressColor: "bg-orange-400",
    },
    ERROR: {
        icon: XIcon,
        borderColor: "border-red-500/40",
        iconColor: "text-red-400",
        iconBg: "bg-red-500/20",
        bgAccent: "bg-red-500/10",
        progressColor: "bg-red-400",
    },
} as const

type NotificationType = keyof typeof notificationStyles

interface LegacyNotificationItem {
    id: string
    title?: string
    message: string
    type: NotificationType
}

export const NotificationContext = createContext<NotificationContextType>({
    notifications: [],
    addNotification: () => {},
    removeNotification: () => {},
    clearAll: () => {},
})

const DEFAULT_DURATION = 5000
const MAX_NOTIFICATIONS = 5

interface NotificationToastProps {
    notification: LegacyNotificationItem
    onDismiss: (id: string) => void
    onPause: (id: string, duration: number) => void
    onResume: (id: string) => void
}

function NotificationToast({
    notification,
    onDismiss,
    onPause,
    onResume,
}: NotificationToastProps) {
    const { id, title, message, type } = notification
    const style = notificationStyles[type]
    const IconComponent = style.icon
    const [paused, setPaused] = useState(false)

    const handleMouseEnter = useCallback(() => {
        setPaused(true)
        onPause(id, DEFAULT_DURATION)
    }, [id, onPause])

    const handleMouseLeave = useCallback(() => {
        setPaused(false)
        onResume(id)
    }, [id, onResume])

    return (
        <motion.div
            layout
            role="alert"
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.95, transition: { duration: 0.2 } }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            onClick={() => onDismiss(id)}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={`w-full cursor-pointer overflow-hidden rounded-xl border-2 bg-card shadow-lg select-none ${style.borderColor}`}
        >
            <div className="flex items-start gap-3 p-4 bg-black/20">
                <div className={`shrink-0 rounded-lg p-1.5 ${style.iconBg}`}>
                    <IconComponent size={16} strokeWidth={2.5} className={style.iconColor} />
                </div>
                <div className="min-w-0 flex-1">
                    {title && (
                        <p className="mb-0.5 text-sm font-semibold text-foreground select-none">
                            {title}
                        </p>
                    )}
                    <p className="text-sm leading-relaxed text-foreground select-none">
                        {message}
                    </p>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onDismiss(id)
                    }}
                    aria-label="Dismiss notification"
                    className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-muted hover:text-foreground"
                >
                    <XIcon size={14} />
                </button>
            </div>
            <div
                className={`h-0.5 origin-left ${style.progressColor}`}
                style={{
                    animation: `drain ${DEFAULT_DURATION}ms linear forwards`,
                    animationPlayState: paused ? "paused" : "running",
                }}
            />
        </motion.div>
    )
}

export default function NotificationProvider({
    children,
}: {
    children: React.ReactNode
}) {
    const [notifications, setNotifications] = useState<LegacyNotificationItem[]>([])
    const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
    const [mounted, setMounted] = useState(false)

    // Tracks remaining time per notification for pause/resume
    const remainingTimeRef = useRef<Map<string, number>>(new Map())
    const pauseStartRef = useRef<Map<string, number>>(new Map())
    const startTimeRef = useRef<Map<string, number>>(new Map())

    useEffect(() => {
        setMounted(true)
    }, [])

    // Cleanup timeouts on unmount
    useEffect(() => {
        const timeouts = timeoutsRef.current
        return () => {
            timeouts.forEach((timeout) => clearTimeout(timeout))
            timeouts.clear()
        }
    }, [])

    const removeNotification: NotificationContextType["removeNotification"] =
        useCallback((id) => {
            const timeout = timeoutsRef.current.get(id)
            if (timeout) {
                clearTimeout(timeout)
                timeoutsRef.current.delete(id)
            }
            remainingTimeRef.current.delete(id)
            pauseStartRef.current.delete(id)
            startTimeRef.current.delete(id)
            setNotifications((prevNotifications) =>
                prevNotifications.filter((n) => n.id !== id),
            )
        }, [])

    const addNotification: NotificationContextType["addNotification"] =
        useCallback(
            (message, type = "INFO", title, ephemeral = true) => {
                const id =
                    Date.now().toString(36) +
                    Math.random().toString(36).slice(2)
                const newNotification: LegacyNotificationItem = {
                    id,
                    title: title || "",
                    message,
                    type: type as NotificationType,
                }
                
                setNotifications((prevNotifications) => {
                    const updated = [newNotification, ...prevNotifications].slice(0, MAX_NOTIFICATIONS)
                    // Clear timeouts for removed notifications
                    if (prevNotifications.length >= MAX_NOTIFICATIONS) {
                        prevNotifications.slice(MAX_NOTIFICATIONS - 1).forEach((n) => {
                            const t = timeoutsRef.current.get(n.id)
                            if (t) {
                                clearTimeout(t)
                                timeoutsRef.current.delete(n.id)
                            }
                        })
                    }
                    return updated
                })
                
                // Ephemeral notifications auto-remove after 5 seconds
                if (ephemeral) {
                    startTimeRef.current.set(id, Date.now())
                    remainingTimeRef.current.set(id, DEFAULT_DURATION)
                    const timeout = setTimeout(() => {
                        removeNotification(id)
                    }, DEFAULT_DURATION)
                    timeoutsRef.current.set(id, timeout)
                }
            },
            [removeNotification],
        )

    const clearAll = useCallback(() => {
        timeoutsRef.current.forEach((timeout) => clearTimeout(timeout))
        timeoutsRef.current.clear()
        remainingTimeRef.current.clear()
        pauseStartRef.current.clear()
        startTimeRef.current.clear()
        setNotifications([])
    }, [])

    const pauseNotification = useCallback((id: string, duration: number) => {
        const timeout = timeoutsRef.current.get(id)
        if (timeout) {
            clearTimeout(timeout)
            timeoutsRef.current.delete(id)
            pauseStartRef.current.set(id, Date.now())
            // Calculate remaining time based on actual elapsed time since notification creation
            const startTime = startTimeRef.current.get(id)
            if (startTime) {
                const alreadyElapsed = Date.now() - startTime
                const remaining = duration - alreadyElapsed
                remainingTimeRef.current.set(id, remaining)
            }
        }
    }, [])

    const resumeNotification = useCallback(
        (id: string) => {
            const remaining = remainingTimeRef.current.get(id)
            if (!remaining || remaining <= 0) {
                removeNotification(id)
                return
            }
            pauseStartRef.current.delete(id)
            const timeout = setTimeout(() => removeNotification(id), remaining)
            timeoutsRef.current.set(id, timeout)
        },
        [removeNotification]
    )

    const contextValue: NotificationContextType = {
        notifications,
        addNotification,
        removeNotification,
        clearAll,
    }

    // Render toasts as portal
    const toastContainer = mounted ? createPortal(
        <div
            role="log"
            aria-live="polite"
            aria-atomic="false"
            aria-label="Notifications"
            className="fixed right-4 bottom-4 z-[999] flex w-full max-w-[90svw] sm:max-w-sm flex-col-reverse gap-2 md:right-6 md:bottom-6"
        >
            {notifications.length > 1 && (
                <motion.button
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    onClick={clearAll}
                    className="self-end rounded-full bg-card px-3 py-1 text-xs font-semibold text-foreground/90 shadow-md ring-1 ring-white/10 select-none hover:bg-muted hover:text-foreground"
                >
                    Clear all
                </motion.button>
            )}
            <AnimatePresence mode="popLayout">
                {notifications.map((notification) => (
                    <NotificationToast
                        key={notification.id}
                        notification={notification}
                        onDismiss={removeNotification}
                        onPause={pauseNotification}
                        onResume={resumeNotification}
                    />
                ))}
            </AnimatePresence>
        </div>,
        document.body
    ) : null

    return (
        <NotificationContext.Provider value={contextValue}>
            {children}
            {toastContainer}
        </NotificationContext.Provider>
    )
}
