"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
    ChevronLeft,
    ChevronRight,
    Clock,
    Building2,
    Loader2,
    AlertCircle,
    MinimizeIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBranchContext } from "@/components/branch-context"
import {
    getTimeClockEntries,
    TimeClockEntry,
} from "@/server/actions/time-clock"
import { ActionResponse } from "@/utils/types/responses"

interface DayEntry {
    date: Date
    entries: TimeClockEntry[]
}

interface CalendarData {
    days: DayEntry[]
    month: number
    year: number
}

export default function TimeClockCalendar() {
    const { currentBranch } = useBranchContext()
    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [opened, setOpened] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [calendarData, setCalendarData] = useState<CalendarData | null>(null)

    const curDate = useMemo(() => {
        const date = new Date()
        date.setHours(0, 0, 0, 0)
        return date
    }, [])

    const fetchEntries = useCallback(async () => {
        setIsLoading(true)
        setError(null)

        try {
            const startOfMonth = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth(),
                1,
            )
            const endOfMonth = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth() + 1,
                0,
                23,
                59,
                59,
            )

            const result: ActionResponse<{ entries: TimeClockEntry[] }> =
                await getTimeClockEntries({
                    startDate: startOfMonth,
                    endDate: endOfMonth,
                    branchId: currentBranch?.id ?? undefined,
                })

            if (!result.success) {
                setError(result.error)
                setCalendarData(null)
                return
            }

            const entriesByDate = new Map<string, TimeClockEntry[]>()
            result.data.entries.forEach((entry) => {
                const dateKey = new Date(entry.clock_in).toDateString()
                if (!entriesByDate.has(dateKey)) {
                    entriesByDate.set(dateKey, [])
                }
                entriesByDate.get(dateKey)!.push(entry)
            })

            const days: DayEntry[] = []
            const daysInMonth = endOfMonth.getDate()

            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                    day,
                )
                const dateKey = date.toDateString()
                days.push({
                    date,
                    entries: entriesByDate.get(dateKey) ?? [],
                })
            }

            setCalendarData({
                days,
                month: currentDate.getMonth(),
                year: currentDate.getFullYear(),
            })
        } catch (_err) {
            setError("Failed to fetch time clock entries. Please try again.")
            setCalendarData(null)
        } finally {
            setIsLoading(false)
        }
    }, [currentDate, currentBranch])

    useEffect(() => {
        fetchEntries()
    }, [fetchEntries])

    const goToPreviousMonth = useCallback(() => {
        const newDate = new Date(currentDate)
        newDate.setMonth(newDate.getMonth() - 1)
        newDate.setDate(1)
        setCurrentDate(newDate)
        setSelectedDate(newDate)
    }, [currentDate])

    const goToNextMonth = useCallback(() => {
        const newDate = new Date(currentDate)
        newDate.setMonth(newDate.getMonth() + 1)
        newDate.setDate(1)
        setCurrentDate(newDate)
        setSelectedDate(newDate)
    }, [currentDate])

    const goToToday = useCallback(() => {
        setCurrentDate(curDate)
        setSelectedDate(curDate)
    }, [curDate])

    const handleDateSelect = useCallback(
        (day: number) => {
            const newDate = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth(),
                day,
            )
            newDate.setHours(0, 0, 0, 0)
            setSelectedDate(newDate)
        },
        [currentDate],
    )

    const isToday = useCallback(
        (day: number) => {
            const dateToCheck = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth(),
                day,
            )
            dateToCheck.setHours(0, 0, 0, 0)
            return dateToCheck.getTime() === curDate.getTime()
        },
        [currentDate, curDate],
    )

    const isSelected = useCallback(
        (day: number) => {
            const dateToCheck = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth(),
                day,
            )
            dateToCheck.setHours(0, 0, 0, 0)
            const normalizedDate = new Date(
                selectedDate.getFullYear(),
                selectedDate.getMonth(),
                selectedDate.getDate(),
            )
            normalizedDate.setHours(0, 0, 0, 0)
            return dateToCheck.getTime() === normalizedDate.getTime()
        },
        [currentDate, selectedDate],
    )

    const hasEntries = useCallback(
        (day: number) => {
            if (!calendarData) return false
            const dayEntry = calendarData.days.find(
                (d) => d.date.getDate() === day,
            )
            return !!dayEntry && dayEntry.entries.length > 0
        },
        [calendarData],
    )

    const getEntriesForDay = useCallback(
        (day: number): TimeClockEntry[] => {
            if (!calendarData) return []
            const dayEntry = calendarData.days.find(
                (d) => d.date.getDate() === day,
            )
            return dayEntry?.entries || []
        },
        [calendarData],
    )

    const selectedDayEntries = useMemo(
        () => getEntriesForDay(selectedDate.getDate()),
        [getEntriesForDay, selectedDate],
    )

    const formatTime = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        })
    }

    const formatDuration = (clockIn: string, clockOut: string | null) => {
        if (!clockOut) return "In Progress"

        const start = new Date(clockIn).getTime()
        const end = new Date(clockOut).getTime()
        const diffMs = end - start
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60))
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

        return `${diffHrs}h ${diffMins}m`
    }

    const { paddingDays, totalDays } = useMemo(() => {
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth()
        const firstDayofMonth = new Date(year, month, 1)
        const paddingDaysCount = firstDayofMonth.getDay()
        const lastDayofMonth = new Date(year, month + 1, 0)
        const totalDaysCount = lastDayofMonth.getDate()
        return { paddingDays: paddingDaysCount, totalDays: totalDaysCount }
    }, [currentDate])

    return (
        <div className='flex flex-col gap-6 p-6 bg-zinc-900 border border-zinc-800 rounded-lg'>
            {/* Header */}
            <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                    <Clock className='w-5 h-5 text-blue-400' />
                    <h2 className='text-lg font-semibold text-white'>
                        Time Clock Calendar
                    </h2>
                </div>
                {currentBranch && (
                    <div className='flex items-center gap-2 text-sm text-zinc-400'>
                        <Building2 className='w-4 h-4' />
                        <span>{currentBranch.name}</span>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <div className='flex items-center justify-between'>
                <div className='flex flex-row gap-2 md:gap-4 items-center flex-wrap'>
                    <Button
                        type='button'
                        title='Go To Previous Month'
                        onClick={goToPreviousMonth}
                        variant='outline'
                        size='icon'
                        disabled={isLoading}
                    >
                        <ChevronLeft className='w-4 h-4' />
                    </Button>
                    <span className='font-bold text-xl select-none w-42 text-center'>
                        {currentDate.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                        })}
                    </span>
                    <Button
                        type='button'
                        title='Go To Next Month'
                        onClick={goToNextMonth}
                        variant='outline'
                        size='icon'
                        disabled={isLoading}
                    >
                        <ChevronRight className='w-4 h-4' />
                    </Button>
                    <AnimatePresence>
                        {selectedDate.toDateString() !==
                            curDate.toDateString() && (
                            <motion.div
                                key='goToCurrentDate'
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                <Button
                                    type='button'
                                    title='Go To Current Date'
                                    onClick={goToToday}
                                    variant='outline'
                                    size='sm'
                                >
                                    Today
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Loading State */}
            {isLoading ? (
                <div className='flex flex-col items-center justify-center gap-4 py-12'>
                    <Loader2 className='w-8 h-8 animate-spin text-blue-400' />
                    <p className='text-sm text-zinc-500'>
                        Loading time clock entries...
                    </p>
                </div>
            ) : error ? (
                <div className='flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-md'>
                    <AlertCircle className='w-5 h-5 text-red-400 flex-shrink-0' />
                    <p className='text-sm text-red-300'>{error}</p>
                </div>
            ) : (
                calendarData && (
                    <div className='space-y-4'>
                        {/* Calendar Grid */}
                        <div className='h-auto w-full aspect-[4/3] md:aspect-auto bg-white/5 border-2 border-white/10 px-2 py-1 rounded-xl gap-1 flex flex-col'>
                            {/* Day Headers */}
                            <div className='w-full grid grid-cols-7 py-1 text-center font-semibold select-none border-b-2 border-white/10 text-white/80'>
                                {[
                                    "Sun",
                                    "Mon",
                                    "Tue",
                                    "Wed",
                                    "Thu",
                                    "Fri",
                                    "Sat",
                                ].map((day) => (
                                    <span key={day}>{day}</span>
                                ))}
                            </div>
                            {/* Calendar Days */}
                            <div className='w-full grid grid-cols-7 gap-1 flex-1'>
                                {Array.from({ length: paddingDays }).map(
                                    (_, idx) => (
                                        <div
                                            key={`padding-${idx}`}
                                            className='p-1 text-white/30 flex items-center justify-center'
                                        />
                                    ),
                                )}
                                {Array.from({ length: totalDays }).map(
                                    (_, idx) => (
                                        <div
                                            key={`day-${idx + 1}`}
                                            className={`flex flex-col select-none items-center justify-center rounded-lg font-medium text-white/90 cursor-pointer transition-colors relative border-2 border-transparent hover:bg-white/10 active:bg-white/20 ${
                                                isToday(idx + 1)
                                                    ? "bg-blue-400/10 !border-blue-400/30"
                                                    : ""
                                            } ${
                                                isSelected(idx + 1)
                                                    ? "bg-orange-400/10 !border-orange-400/30"
                                                    : ""
                                            }`}
                                            onClick={() => {
                                                handleDateSelect(idx + 1)
                                                if (hasEntries(idx + 1)) {
                                                    setOpened(true)
                                                }
                                            }}
                                        >
                                            <span>{idx + 1}</span>
                                            {hasEntries(idx + 1) && (
                                                <div
                                                    className={`absolute bottom-[calc(100%-(var(--spacing)*1.5))] left-2 md:-translate-x-1/2 md:bottom-2 w-1 h-1 md:w-2 md:h-2 rounded-full transition-colors bg-green-400/40 ${
                                                        isToday(idx + 1)
                                                            ? "!bg-red-400"
                                                            : ""
                                                    } ${
                                                        isSelected(idx + 1)
                                                            ? "!bg-orange-400/40"
                                                            : ""
                                                    }`}
                                                />
                                            )}
                                        </div>
                                    ),
                                )}
                            </div>
                        </div>

                        {/* Selected Date Panel */}
                        <AnimatePresence>
                            {opened && (
                                <motion.div
                                    key='time-clock-entries-panel'
                                    className='flex flex-col gap-2'
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 20 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div className='flex flex-col px-2 py-2 gap-2 border-2 border-white/10 bg-zinc-950 rounded-md'>
                                        <div className='w-full flex flex-row items-center justify-between'>
                                            <span className='font-semibold text-sm md:text-lg'>
                                                Entries for{" "}
                                                {selectedDate.toLocaleDateString(
                                                    "en-US",
                                                    {
                                                        month: "long",
                                                        year: "numeric",
                                                        day: "numeric",
                                                    },
                                                )}
                                            </span>
                                            <Button
                                                type='button'
                                                title='Close'
                                                variant='ghost'
                                                size='icon'
                                                onClick={() => setOpened(false)}
                                                className='group hover:text-red-400'
                                            >
                                                <MinimizeIcon className='group-hover:stroke-red-400 transition-colors' />
                                            </Button>
                                        </div>
                                        <div className='flex flex-col gap-2 max-h-64 overflow-y-auto'>
                                            {selectedDayEntries.length === 0 ? (
                                                <div className='flex flex-col items-center justify-center gap-4 py-8 text-zinc-500'>
                                                    <Clock className='w-8 h-8' />
                                                    <p className='text-sm'>
                                                        No time clock entries
                                                        for this day
                                                    </p>
                                                </div>
                                            ) : (
                                                selectedDayEntries.map(
                                                    (entry, idx) => (
                                                        <motion.div
                                                            key={entry.id}
                                                            className='flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-md hover:bg-zinc-800/50 transition-colors'
                                                            initial={{
                                                                opacity: 0,
                                                            }}
                                                            animate={{
                                                                opacity: 1,
                                                                transition: {
                                                                    delay:
                                                                        idx *
                                                                        0.05,
                                                                },
                                                            }}
                                                            exit={{
                                                                opacity: 0,
                                                            }}
                                                        >
                                                            <div className='space-y-1'>
                                                                <p className='text-sm font-medium text-white'>
                                                                    {
                                                                        entry.staff_email
                                                                    }
                                                                </p>
                                                                <div className='flex items-center gap-2 text-xs text-zinc-500'>
                                                                    <Building2 className='w-3 h-3' />
                                                                    <span>
                                                                        {
                                                                            entry.branch_name
                                                                        }
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className='text-right space-y-1'>
                                                                <div className='flex items-center gap-2 text-sm text-zinc-300'>
                                                                    <Clock className='w-3 h-3' />
                                                                    <span>
                                                                        {formatTime(
                                                                            entry.clock_in,
                                                                        )}
                                                                    </span>
                                                                    {entry.clock_out && (
                                                                        <>
                                                                            <span className='text-zinc-600'>
                                                                                →
                                                                            </span>
                                                                            <span>
                                                                                {formatTime(
                                                                                    entry.clock_out,
                                                                                )}
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                                <p
                                                                    className={`text-xs ${
                                                                        entry.clock_out
                                                                            ? "text-zinc-500"
                                                                            : "text-amber-400"
                                                                    }`}
                                                                >
                                                                    {formatDuration(
                                                                        entry.clock_in,
                                                                        entry.clock_out,
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </motion.div>
                                                    ),
                                                )
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Month Summary */}
                        {!opened && (
                            <div className='mt-4 p-4 bg-zinc-950 border border-zinc-800 rounded-lg'>
                                <div className='flex items-center justify-between mb-3'>
                                    <h4 className='text-sm font-medium text-zinc-400'>
                                        Month Summary
                                    </h4>
                                    <span className='text-xs text-zinc-500'>
                                        {calendarData.days.reduce(
                                            (acc, day) =>
                                                acc + day.entries.length,
                                            0,
                                        )}{" "}
                                        total entries
                                    </span>
                                </div>
                                <div className='flex items-center gap-4 text-xs text-zinc-500'>
                                    <div className='flex items-center gap-1.5'>
                                        <div className='w-2 h-2 rounded-full bg-blue-400/30' />
                                        <span>Today</span>
                                    </div>
                                    <div className='flex items-center gap-1.5'>
                                        <div className='w-2 h-2 rounded-full bg-orange-400/30' />
                                        <span>Selected</span>
                                    </div>
                                    <div className='flex items-center gap-1.5'>
                                        <div className='w-2 h-2 rounded-full bg-green-400/40' />
                                        <span>Has Entries</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )
            )}
        </div>
    )
}
