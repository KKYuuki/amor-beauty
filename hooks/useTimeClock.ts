"use client"

import { useState, useEffect, useCallback, useContext } from "react"
import { NotificationContext } from "@/components/notifications"
import {
    getClockStatus,
    getTimeClockEntries,
    getTodayHours,
    ClockStatusResult,
    TimeClockEntry,
    TodayHoursResult,
} from "@/server/actions/time-clock"
import { ActionResponse } from "@/utils/types/responses"

interface UseTimeClockOptions {
    staffId: string | undefined
    daysToFetch?: number
}

interface UseTimeClockReturn {
    clockStatus: ClockStatusResult | null
    entries: TimeClockEntry[]
    isLoading: boolean
    showScanner: boolean
    currentDuration: string | null
    todayHours: TodayHoursResult | null
    setShowScanner: (show: boolean) => void
    fetchData: () => Promise<void>
    handleClockInSuccess: () => void
    handleClockOutSuccess: () => void
    formatTime: (dateString: string) => string
    formatDate: (dateString: string) => string
}

export function useTimeClock({
    staffId,
    daysToFetch = 7,
}: UseTimeClockOptions): UseTimeClockReturn {
    const { addNotification } = useContext(NotificationContext)

    const [clockStatus, setClockStatus] = useState<ClockStatusResult | null>(null)
    const [entries, setEntries] = useState<TimeClockEntry[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showScanner, setShowScanner] = useState(false)
    const [currentDuration, setCurrentDuration] = useState<string | null>(null)
    const [todayHours, setTodayHours] = useState<TodayHoursResult | null>(null)

    const fetchData = useCallback(async () => {
        if (!staffId) return

        setIsLoading(true)
        try {
            // Fetch clock status
            const statusResult: ActionResponse<ClockStatusResult> = await getClockStatus(staffId)
            if (statusResult.success) {
                setClockStatus(statusResult.data)
                setCurrentDuration(statusResult.data.duration)
            }

            // Fetch recent entries
            const endDate = new Date()
            const startDate = new Date()
            startDate.setDate(startDate.getDate() - daysToFetch)

            const entriesResult: ActionResponse<{ entries: TimeClockEntry[] }> = await getTimeClockEntries({
                staffId,
                startDate,
                endDate,
            })

            if (entriesResult.success) {
                setEntries(entriesResult.data.entries)
            }

            // Fetch today's hours
            const hoursResult: ActionResponse<TodayHoursResult> = await getTodayHours(staffId)
            if (hoursResult.success) {
                setTodayHours(hoursResult.data)
            }
        } catch {
            addNotification("Failed to load time clock data", "ERROR")
        } finally {
            setIsLoading(false)
        }
    }, [staffId, addNotification, daysToFetch])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Update duration every second when clocked in
    useEffect(() => {
        if (!clockStatus?.isClockedIn || !clockStatus.clockedInAt) return

        const interval = setInterval(() => {
            const clockedIn = new Date(clockStatus.clockedInAt!).getTime()
            const now = new Date().getTime()
            const diffMs = now - clockedIn

            const seconds = Math.floor(diffMs / 1000)
            const hours = Math.floor(seconds / 3600)
            const minutes = Math.floor((seconds % 3600) / 60)
            const remainingSeconds = seconds % 60

            setCurrentDuration(
                `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
            )
        }, 1000)

        return () => clearInterval(interval)
    }, [clockStatus?.isClockedIn, clockStatus?.clockedInAt])

    const handleClockInSuccess = () => {
        setShowScanner(false)
        fetchData()
        addNotification("Successfully clocked in!", "SUCCESS")
    }

    const handleClockOutSuccess = () => {
        fetchData()
        addNotification("Successfully clocked out!", "SUCCESS")
    }

    const formatTime = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        })
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
        })
    }

    return {
        clockStatus,
        entries,
        isLoading,
        showScanner,
        currentDuration,
        todayHours,
        setShowScanner,
        fetchData,
        handleClockInSuccess,
        handleClockOutSuccess,
        formatTime,
        formatDate,
    }
}
