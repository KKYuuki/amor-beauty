"use client"

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { normalizeFlag } from "@/utils/auth/access-flags"
import Link from "next/link"
import {
    ArrowRightIcon,
    CalendarIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    MinimizeIcon,
} from "lucide-react"
import { SideBarContext } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { getAllAppointments, getUserAppointments } from "@/server/actions/appointments"
import { getProfilesByIds } from "@/server/actions/profile"
import { Appointment } from "@/utils/types/general"
import { useBranchContext } from "@/components/branch-context"

function getCalendarDetails(date: Date) {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDayofMonth = new Date(year, month, 1)
    const paddingDays = firstDayofMonth.getDay()
    const lastDayofMonth = new Date(year, month + 1, 0)
    const totalDays = lastDayofMonth.getDate()

    return { paddingDays, totalDays }
}

// Helper to get a date key string for grouping (YYYY-MM-DD)
function getDateKey(date: Date): string {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d.toISOString().split("T")[0]
}

export default function CalendarClientPage() {
    // Context
    const { userInfo, isMobile } = useContext(SideBarContext)
    const { currentBranch } = useBranchContext()

    // Constants
    const curDate = useMemo(() => {
        const date = new Date()
        date.setHours(0, 0, 0, 0)
        return date
    }, [])

    // States
    // - Calendar
    const [calendarDate, setCalendarDate] = useState(curDate)
    const [selectedDate, setSelectedDate] = useState(curDate)
    const [opened, setOpened] = useState(false)
    // - Appointments
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [view, setView] = useState<"personal" | "all">("personal")
    // - Profile Name Cache (ID -> Name)
    const [profileNames, setProfileNames] = useState<Record<string, string>>({})

    // Memoized Calendar Details
    const { paddingDays, totalDays } = useMemo(
        () => getCalendarDetails(calendarDate),
        [calendarDate]
    )

    // Filter appointments by branch
    const branchFilteredAppointments = useMemo(() => {
        // If no branch selected (All Branches), show all appointments
        if (!currentBranch) {
            return appointments
        }
        // Filter appointments: show appointments for current branch only
        return appointments.filter(
            (ap) => ap.branch_id === currentBranch.id
        )
    }, [appointments, currentBranch])

    // Memoized: Group appointments by date key for O(1) lookup
    // Only CANCELLED appointments are hidden; PENDING shows with distinct styling
    const appointmentsByDate = useMemo(() => {
        const map: Record<string, Appointment[]> = {}
        for (const ap of branchFilteredAppointments) {
            if (ap.status === "CANCELLED") continue
            const key = getDateKey(new Date(ap.time_start))
            if (!map[key]) map[key] = []
            map[key].push(ap)
        }
        // Sort each day's appointments by start time
        for (const key in map) {
            map[key].sort(
                (a, b) =>
                    new Date(a.time_start).getTime() -
                    new Date(b.time_start).getTime()
            )
        }
        return map
    }, [branchFilteredAppointments])

    // Check if day has any pending appointments (for styling)
    const hasPendingAppointments = useCallback(
        (day: number) => {
            const key = getDateKey(
                new Date(
                    calendarDate.getFullYear(),
                    calendarDate.getMonth(),
                    day
                )
            )
            const dayAppointments = appointmentsByDate[key]
            return dayAppointments?.some((ap) => ap.status === "PENDING") ?? false
        },
        [calendarDate, appointmentsByDate]
    )

    // Fetcher for appointments - passes branch filter to server actions
    const fetchUserAppointments = useCallback(async () => {
        if (userInfo.id !== "") {
            if (
                (userInfo.access_flags?.some(f => normalizeFlag(f) === "appointments_view") ||
                    userInfo.role === "admin") &&
                view === "all"
            ) {
                const res = await getAllAppointments(currentBranch?.id)
                if (res.success && res.data) setAppointments(res.data)
            } else {
                const res = await getUserAppointments(userInfo.id)
                if (res.success && res.data) setAppointments(res.data)
            }
        }
    }, [
        userInfo.id,
        view,
        userInfo.access_flags,
        userInfo.role,
        currentBranch?.id,
    ])

    // Track which profile IDs we've already fetched to prevent unnecessary re-renders
    const fetchedIdsRef = useRef<Set<string>>(new Set())

    // Batch fetch profiles when "all" view and appointments change
    useEffect(() => {
        if (view !== "all" || appointments.length === 0) return

        const idsToFetch = new Set<string>()
        for (const ap of appointments) {
            if (ap.client_id && !fetchedIdsRef.current.has(ap.client_id)) {
                idsToFetch.add(ap.client_id)
            }
            if (ap.staff_id && !fetchedIdsRef.current.has(ap.staff_id)) {
                idsToFetch.add(ap.staff_id)
            }
        }

        if (idsToFetch.size === 0) return

        // Mark these IDs as fetched before the async call
        idsToFetch.forEach((id) => fetchedIdsRef.current.add(id))

        getProfilesByIds(Array.from(idsToFetch)).then((profiles) => {
            if (profiles) {
                setProfileNames((prev) => {
                    const next = { ...prev }
                    for (const p of profiles) {
                        next[p.id] = p.full_name || "Unknown"
                    }
                    return next
                })
            }
        })
    }, [appointments, view])

    // Helpers
    const isToday = useCallback(
        (day: number) => {
            const dateToCheck = new Date(
                calendarDate.getFullYear(),
                calendarDate.getMonth(),
                day
            )
            dateToCheck.setHours(0, 0, 0, 0)
            return dateToCheck.getTime() === curDate.getTime()
        },
        [calendarDate, curDate]
    )

    const isSelected = useCallback(
        (day: number) => {
            const dateToCheck = new Date(
                calendarDate.getFullYear(),
                calendarDate.getMonth(),
                day
            )
            dateToCheck.setHours(0, 0, 0, 0)
            const normalizedDate = new Date(
                selectedDate.getFullYear(),
                selectedDate.getMonth(),
                selectedDate.getDate()
            )
            normalizedDate.setHours(0, 0, 0, 0)
            return dateToCheck.getTime() === normalizedDate.getTime()
        },
        [calendarDate, selectedDate]
    )

    // O(1) lookup using memoized map
    const hasAppointments = useCallback(
        (day: number) => {
            const key = getDateKey(
                new Date(
                    calendarDate.getFullYear(),
                    calendarDate.getMonth(),
                    day
                )
            )
            return !!appointmentsByDate[key]
        },
        [calendarDate, appointmentsByDate]
    )

    // Get appointments for a specific day
    const getAppointmentsForDay = useCallback(
        (day: number): Appointment[] => {
            const key = getDateKey(
                new Date(
                    calendarDate.getFullYear(),
                    calendarDate.getMonth(),
                    day
                )
            )
            return appointmentsByDate[key] || []
        },
        [calendarDate, appointmentsByDate]
    )

    // Setters
    const goToToday = useCallback(() => {
        setCalendarDate(curDate)
        setSelectedDate(curDate)
    }, [curDate])

    const handleDateSelect = useCallback(
        (day: number) => {
            const newDate = new Date(
                calendarDate.getFullYear(),
                calendarDate.getMonth(),
                day
            )
            newDate.setHours(0, 0, 0, 0)
            setSelectedDate(newDate)
        },
        [calendarDate]
    )

    // Simplified date navigation using setMonth (handles year rollover automatically)
    const goToPrevMonth = useCallback(() => {
        const newDate = new Date(calendarDate)
        newDate.setMonth(newDate.getMonth() - 1)
        newDate.setDate(1)
        setCalendarDate(newDate)
        setSelectedDate(newDate)
    }, [calendarDate])

    const goToNextMonth = useCallback(() => {
        const newDate = new Date(calendarDate)
        newDate.setMonth(newDate.getMonth() + 1)
        newDate.setDate(1)
        setCalendarDate(newDate)
        setSelectedDate(newDate)
    }, [calendarDate])

    // Effects
    useEffect(() => {
        fetchUserAppointments()
    }, [fetchUserAppointments])

    // Get selected day's appointments
    const selectedDayAppointments = useMemo(
        () => getAppointmentsForDay(selectedDate.getDate()),
        [getAppointmentsForDay, selectedDate]
    )

    return (
        <>
            <div>
                <h1 className='text-2xl font-bold flex items-center gap-2'>
                    <CalendarIcon className='w-6 h-6' />
                    Calendar
                </h1>
                <p className='text-white/60 text-sm mt-1'>View your calendar</p>
            </div>
            {/* Calendar Header */}
            <div className='w-full flex flex-row gap-2 items-start justify-between md:px-2 flex-wrap-reverse'>
                <div className='flex flex-row gap-2 md:gap-4 items-center flex-wrap'>
                    <Button
                        type='button'
                        title='Go To Previous Month'
                        onClick={goToPrevMonth}
                        variant='outline'
                        size='icon'
                    >
                        <ChevronLeftIcon size={18} />
                    </Button>
                    <span className='font-bold text-xl select-none md:w-42 text-center'>
                        {calendarDate.toLocaleDateString("en-US", {
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
                    >
                        <ChevronRightIcon size={18} />
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
                {!isMobile && (
                    <div className='hidden md:flex flex-row gap-1 md:gap-4 items-end flex-wrap-reverse'>
                        {(userInfo.access_flags?.includes(
                            "view_appointments"
                        ) ||
                            userInfo.role === "admin") && (
                            <select
                                title='View Appointments'
                                value={view}
                                onChange={(e) =>
                                    setView(
                                        e.target.value as "all" | "personal"
                                    )
                                }
                                className='bg-white/10 border-2 border-white/10 px-2 rounded-md hover:bg-white/20 active:bg-white/30 cursor-pointer transition-colors text-sm font-semibold text-white/80'
                            >
                                <option value='all'>All Appointments</option>
                                <option value='personal'>
                                    My Appointments
                                </option>
                            </select>
                        )}
                        <span className='select-none font-semibold text-sm text-white/80'>
                            Today is{" "}
                            {curDate.toLocaleDateString("en-US", {
                                month: "long",
                                year: "numeric",
                                day: "numeric",
                            })}
                        </span>
                    </div>
                )}
            </div>
            {/* Calendar Content */}
            <div className='h-auto md:flex-1 w-full aspect-[4/3] md:aspect-auto bg-white/5 border-2 border-white/10 px-2 py-1 rounded-xl gap-1 flex flex-col'>
                {/* Top Days */}
                <div className='w-full grid grid-cols-7 py-1 text-center font-semibold select-none border-b-2 border-white/10 text-white/80'>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                        (day) => (
                            <span key={day}>{day}</span>
                        )
                    )}
                </div>
                {/* Calendar Days */}
                <div className='w-full grid grid-cols-7 gap-1 flex-1'>
                    {Array.from({ length: paddingDays }).map((_, idx) => (
                        <div
                            key={`padding-${idx}`}
                            className='p-1 text-white/30 flex items-center justify-center'
                        />
                    ))}
                    {Array.from({ length: totalDays }).map((_, idx) => (
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
                                if (hasAppointments(idx + 1)) {
                                    setOpened(true)
                                }
                            }}
                        >
                            <span>{idx + 1}</span>
                            {hasAppointments(idx + 1) && (
                                <div
                                    className={`absolute bottom-[calc(100%-(var(--spacing)*1.5))] left-0.5 md:left-1/2 md:-translate-x-1/2 md:bottom-2 w-1 h-1 md:w-2 md:h-2 rounded-full transition-colors ${
                                        hasPendingAppointments(idx + 1)
                                            ? "bg-yellow-400 border border-yellow-400/60"
                                            : "bg-green-400/40"
                                    } ${
                                        isToday(idx + 1) ? "!bg-red-400" : ""
                                    } ${
                                        isSelected(idx + 1)
                                            ? "!bg-orange-400/40"
                                            : ""
                                    }`}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>
            {/* Appointments Panel */}
            <AnimatePresence>
                {(isMobile || opened) && (
                    <motion.div
                        key='calendar-appointments'
                        className='flex flex-col flex-1 gap-2 md:absolute md:top-1/2 md:left-1/2 md:-translate-1/2 md:w-[calc(100%-2rem)] md:h-[calc(100%-2rem)]'
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        {isMobile && (
                            <div className='flex md:hidden flex-row gap-1 md:gap-4 items-end justify-between flex-wrap-reverse w-full'>
                                {(userInfo.access_flags?.includes(
                                    "view_appointments"
                                ) ||
                                    userInfo.role === "admin") && (
                                    <select
                                        title='View Appointments'
                                        value={view}
                                        onChange={(e) =>
                                            setView(
                                                e.target.value as
                                                    | "all"
                                                    | "personal"
                                            )
                                        }
                                        className='bg-white/10 border-2 border-white/10 px-2 rounded-md hover:bg-white/20 active:bg-white/30 cursor-pointer transition-colors text-sm font-semibold text-white/80'
                                    >
                                        <option value='all'>
                                            All Appointments
                                        </option>
                                        <option value='personal'>
                                            My Appointments
                                        </option>
                                    </select>
                                )}
                                <span className='select-none font-semibold text-sm text-white/80'>
                                    Today is{" "}
                                    {curDate.toLocaleDateString("en-US", {
                                        month: "long",
                                        year: "numeric",
                                        day: "numeric",
                                    })}
                                </span>
                            </div>
                        )}
                        {/* Appointments List */}
                        <div
                            className={`flex flex-col flex-1 px-2 py-1 md:py-2 gap-1 border-2 border-white/10 ${
                                isMobile
                                    ? "bg-white/5 rounded-xl"
                                    : "bg-black/90 rounded-md"
                            }`}
                        >
                            <div className='w-full flex flex-row items-center justify-between'>
                                <span className='font-semibold text-sm md:text-xl w-max'>
                                    Appointments for{" "}
                                    {selectedDate.toLocaleDateString("en-US", {
                                        month: "long",
                                        year: "numeric",
                                        day: "numeric",
                                    })}
                                </span>
                                {!isMobile && (
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
                                )}
                            </div>
                            <div className='flex flex-col gap-2 flex-1 overflow-y-scroll'>
                                {selectedDayAppointments.length === 0 ? (
                                    <div className='text-sm md:text-base text-white/40 font-semibold'>
                                        No Appointments
                                    </div>
                                ) : (
                                    selectedDayAppointments.map((ap, idx) => (
                                        <CalendarAppointment
                                            key={ap.id}
                                            ap={ap}
                                            idx={idx}
                                            view={view}
                                            clientName={
                                                ap.client_id
                                                    ? profileNames[
                                                          ap.client_id
                                                      ] || ""
                                                    : ap.is_walkin
                                                      ? "Walk-in"
                                                      : ""
                                            }
                                            staffName={
                                                ap.staff_id ? (profileNames[ap.staff_id] || "") : ""
                                            }
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}

// Pure component: receives names as props, no internal fetching
function CalendarAppointment({
    ap,
    idx,
    view,
    clientName,
    staffName,
}: {
    ap: Appointment
    idx: number
    view: "personal" | "all"
    clientName: string
    staffName: string
}) {
    const { isMobile } = useContext(SideBarContext)

    // Determine border style based on appointment status
    const borderClass =
        ap.status === "PENDING"
            ? "border-yellow-400/40 border-dashed"
            : "border-white/10"

    return (
        <Link href={`/appointments/${ap.id}`} passHref>
            <motion.div
                className={`text-white bg-white/5 px-2 py-1 rounded-md border-2 ${borderClass} flex flex-col gap-1 hover:bg-white/10 transition-colors cursor-pointer group`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: idx * 0.05 } }}
                exit={{ opacity: 0 }}
            >
                <div className='flex flex-row gap-2 items-end justify-between w-full'>
                    <span className='font-semibold'>{ap.title}</span>
                    <span className='capitalize bg-blue-400/20 text-xs px-1 border-2 border-blue-400/10 rounded-sm'>
                        {ap.type?.toLowerCase() || "other"}
                    </span>
                </div>
                <div className='flex flex-row gap-2 justify-between items-end'>
                    <span className='text-sm font-semibold text-white/60'>
                        <span className='text-orange-400/80'>
                            {new Date(ap.time_start).toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "numeric",
                            })}
                        </span>{" "}
                        to{" "}
                        <span className='text-orange-400/80'>
                            {new Date(ap.time_end).toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "numeric",
                            })}
                        </span>
                    </span>
                    <span className='text-end text-xs md:text-base font-medium text-white/60 flex flex-row gap-1 items-center select-none'>
                        <span className='translate-x-3 group-hover:translate-x-0 transition-transform'>
                            View Appointment
                        </span>
                        <ArrowRightIcon
                            size={isMobile ? 10 : 16}
                            className='opacity-0 group-hover:opacity-100 transition-all'
                        />
                    </span>
                </div>
                {view === "all" && (
                    <div className='flex flex-row gap-2 justify-between text-sm font-semibold'>
                        <span>{clientName}</span> <span>{staffName}</span>
                    </div>
                )}
            </motion.div>
        </Link>
    )
}
