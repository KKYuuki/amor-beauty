"use client"

import React, { useMemo } from "react"
import { PayrollEntry } from "@/utils/types/payroll"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

interface CalendarViewProps {
    year: number
    month: number
    entries: PayrollEntry[]
    selectedDate: Date | null
    onSelectDate: (date: Date | null) => void
    onMonthChange: (year: number, month: number) => void
    currencySymbol?: string
    minDate?: Date
}

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]

export default function CalendarView({
    year,
    month,
    entries,
    selectedDate,
    onSelectDate,
    onMonthChange,
    // currencySymbol removed as it is unused
    minDate,
}: CalendarViewProps) {
    const now = useMemo(() => new Date(), [])
    const currentYear = now.getFullYear()

    const minYear = minDate ? minDate.getFullYear() : currentYear - 5
    const years = useMemo(() => {
        const arr = []
        for (let y = currentYear; y >= minYear; y--) arr.push(y)
        return arr
    }, [minYear, currentYear])

    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const firstDayOfMonth = new Date(year, month, 1).getDay()

    const entriesByDate = useMemo(() => {
        const map = new Map<
            number,
            { total: number; count: number; hasPending: boolean }
        >()
        entries.forEach((entry) => {
            const d = new Date(entry.service_date)
            if (d.getMonth() === month && d.getFullYear() === year) {
                const day = d.getDate()
                const current = map.get(day) || {
                    total: 0,
                    count: 0,
                    hasPending: false,
                }
                map.set(day, {
                    total: current.total + Number(entry.staff_cut),
                    count: current.count + 1,
                    hasPending:
                        current.hasPending ||
                        entry.payment_status === "PENDING",
                })
            }
        })
        return map
    }, [entries, month, year])

    const canGoPrev =
        !minDate ||
        year > minDate.getFullYear() ||
        (year === minDate.getFullYear() && month > minDate.getMonth())
    const canGoNext =
        year < currentYear || (year === currentYear && month < now.getMonth())

    const prevMonth = () => {
        if (!canGoPrev) return
        if (month === 0) onMonthChange(year - 1, 11)
        else onMonthChange(year, month - 1)
    }

    const nextMonth = () => {
        if (!canGoNext) return
        if (month === 11) onMonthChange(year + 1, 0)
        else onMonthChange(year, month + 1)
    }

    const isCurrentMonth =
        now.getMonth() === month && now.getFullYear() === year

    const calendarDays = useMemo(() => {
        const days: React.ReactNode[] = []
        const totalRows = Math.ceil((daysInMonth + firstDayOfMonth) / 7)
        const totalCells = totalRows * 7

        for (let i = 0; i < totalCells; i++) {
            const dayNumber = i - firstDayOfMonth + 1
            const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth

            if (!isValidDay) {
                days.push(
                    <div
                        key={`empty-${i}`}
                        className='h-10 bg-white/[0.02] rounded'
                    />
                )
                continue
            }

            const data = entriesByDate.get(dayNumber)
            const isToday = now.getDate() === dayNumber && isCurrentMonth
            const isSelected =
                selectedDate?.getDate() === dayNumber &&
                selectedDate?.getMonth() === month &&
                selectedDate?.getFullYear() === year

            days.push(
                <button
                    key={`day-${dayNumber}`}
                    onClick={() =>
                        onSelectDate(
                            isSelected ? null : new Date(year, month, dayNumber)
                        )
                    }
                    className={`h-10 rounded flex items-center justify-center text-sm transition-colors relative
                        ${isSelected ? "bg-blue-600 text-white" : isToday ? "bg-white/20 font-bold" : data ? "bg-green-500/20 hover:bg-green-500/30" : "bg-white/5 hover:bg-white/10"}
                    `}
                >
                    <span>{dayNumber}</span>
                    {data?.hasPending && (
                        <span className='absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-yellow-400' />
                    )}
                </button>
            )
        }
        return days
    }, [
        daysInMonth,
        firstDayOfMonth,
        entriesByDate,
        selectedDate,
        month,
        year,
        isCurrentMonth,
        now,
        onSelectDate,
    ])

    return (
        <div className='space-y-3'>
            {/* Header */}
            <div className='flex items-center justify-between'>
                <div className='flex items-center gap-1'>
                    <button
                        onClick={prevMonth}
                        disabled={!canGoPrev}
                        className='p-1 hover:bg-white/10 rounded disabled:opacity-30'
                    >
                        <ChevronLeftIcon className='w-4 h-4' />
                    </button>
                    <select
                        value={month}
                        onChange={(e) =>
                            onMonthChange(year, parseInt(e.target.value))
                        }
                        className='bg-white/10 rounded px-2 py-1 text-sm cursor-pointer outline-none'
                    >
                        {MONTHS.map((m, i) => (
                            <option
                                key={i}
                                value={i}
                                disabled={
                                    year === currentYear && i > now.getMonth()
                                }
                            >
                                {m}
                            </option>
                        ))}
                    </select>
                    <select
                        value={year}
                        onChange={(e) =>
                            onMonthChange(parseInt(e.target.value), month)
                        }
                        className='bg-white/10 rounded px-2 py-1 text-sm cursor-pointer outline-none'
                    >
                        {years.map((y) => (
                            <option
                                key={y}
                                value={y}
                            >
                                {y}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={nextMonth}
                        disabled={!canGoNext}
                        className='p-1 hover:bg-white/10 rounded disabled:opacity-30'
                    >
                        <ChevronRightIcon className='w-4 h-4' />
                    </button>
                </div>
                {!isCurrentMonth && (
                    <button
                        onClick={() => {
                            onMonthChange(now.getFullYear(), now.getMonth())
                            onSelectDate(now)
                        }}
                        className='text-xs px-2 py-1 bg-white/10 hover:bg-white/20 rounded'
                    >
                        Today
                    </button>
                )}
            </div>

            {/* Weekdays */}
            <div className='grid grid-cols-7 gap-1 text-center text-xs text-white/40 font-medium'>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <div key={i}>{d}</div>
                ))}
            </div>

            {/* Days */}
            <div className='grid grid-cols-7 gap-1'>{calendarDays}</div>
        </div>
    )
}
