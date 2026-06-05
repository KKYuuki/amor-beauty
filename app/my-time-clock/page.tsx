"use client"

import { useContext } from "react"
import { Clock, History, MapPin, RefreshCw, Timer } from "lucide-react"
import { motion } from "motion/react"
import PageWrapper from "@/components/page-wrapper"
import { SideBarContext } from "@/components/sidebar"
import ClockInScanner from "@/components/clock/ClockInScanner"
import ClockOutButton from "@/components/clock/ClockOutButton"
import { useTimeClock } from "@/hooks/useTimeClock"

export default function MyTimeClockPage() {
    const { userInfo } = useContext(SideBarContext)
    const staffId = userInfo?.id

    const {
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
    } = useTimeClock({ staffId })

    if (isLoading) {
        return (
            <PageWrapper>
                <div className='flex items-center justify-center h-full'>
                    <RefreshCw className='w-8 h-8 animate-spin text-white/40' />
                </div>
            </PageWrapper>
        )
    }

    return (
        <PageWrapper>
            {/* Header */}
            <div className='flex items-center justify-between'>
                <div>
                    <h1 className='text-2xl font-bold flex items-center gap-2'>
                        <Clock className='w-6 h-6' />
                        My Time Clock
                    </h1>
                    <p className='text-white/60 text-sm mt-1'>
                        Track your work hours
                    </p>
                </div>
                <button
                    onClick={fetchData}
                    disabled={isLoading}
                    className='p-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors disabled:opacity-50'
                    title='Refresh'
                >
                    <RefreshCw className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`} />
                </button>
            </div>

            {/* Status Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-6 rounded-xl border-2 ${
                    clockStatus?.isClockedIn
                        ? "bg-green-500/10 border-green-500/30"
                        : "bg-zinc-900 border-zinc-800"
                }`}
            >
                <div className='flex items-center justify-between mb-4'>
                    <div className='flex items-center gap-3'>
                        <div
                            className={`p-3 rounded-full ${
                                clockStatus?.isClockedIn
                                    ? "bg-green-500/20"
                                    : "bg-zinc-800"
                            }`}
                        >
                            <Clock
                                className={`w-6 h-6 ${
                                    clockStatus?.isClockedIn
                                        ? "text-green-400"
                                        : "text-zinc-400"
                                }`}
                            />
                        </div>
                        <div>
                            <p className='text-sm text-white/60'>Status</p>
                            <p
                                className={`text-xl font-bold ${
                                    clockStatus?.isClockedIn
                                        ? "text-green-400"
                                        : "text-zinc-400"
                                }`}
                            >
                                {clockStatus?.isClockedIn
                                    ? "Clocked In"
                                    : "Clocked Out"}
                            </p>
                        </div>
                    </div>

                    {clockStatus?.isClockedIn && currentDuration && (
                        <div className='text-right'>
                            <p className='text-sm text-white/60'>Duration</p>
                            <p className='text-2xl font-mono font-bold text-white'>
                                {currentDuration}
                            </p>
                        </div>
                    )}
                </div>

                {clockStatus?.isClockedIn && clockStatus.branchName && (
                    <div className='flex items-center gap-2 text-sm text-white/60 mb-4'>
                        <MapPin className='w-4 h-4' />
                        <span>Branch: {clockStatus.branchName}</span>
                    </div>
                )}

                {todayHours && (
                    <div className='flex items-center gap-4 text-sm text-white/60 mt-2'>
                        <span>Today: {todayHours.totalHours}</span>
                        <span>{todayHours.entriesCount} session{todayHours.entriesCount !== 1 ? 's' : ''}</span>
                    </div>
                )}

                {/* Action Buttons */}
                <div className='flex gap-3'>
                    {!clockStatus?.isClockedIn ? (
                        <button
                            onClick={() => setShowScanner(true)}
                            className='flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg transition-colors font-medium'
                        >
                            <Clock className='w-5 h-5' />
                            Clock In
                        </button>
                    ) : staffId ? (
                        <ClockOutButton
                            staffId={staffId}
                            currentEntryId={clockStatus.entryId || undefined}
                            onClockOut={handleClockOutSuccess}
                        />
                    ) : null}
                </div>
            </motion.div>

            {/* Scanner Modal */}
            {showScanner && staffId && (
                <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                    >
                        <ClockInScanner
                            staffId={staffId}
                            onSuccess={handleClockInSuccess}
                            onCancel={() => setShowScanner(false)}
                        />
                    </motion.div>
                </div>
            )}

            {/* Recent Entries */}
            <div className='space-y-3'>
                <div className='flex items-center gap-2'>
                    <History className='w-5 h-5 text-white/60' />
                    <h2 className='text-lg font-semibold'>Recent Entries</h2>
                    <span className='text-sm text-white/40'>(Last 7 days)</span>
                </div>

                {entries.length === 0 ? (
                    <div className='flex flex-col items-center justify-center gap-4 py-12 text-zinc-500'>
                        <Timer className='w-12 h-12' />
                        <p className='text-sm'>No time entries in the last 7 days</p>
                    </div>
                ) : (
                    <div className='space-y-2'>
                        {entries.map((entry) => (
                            <motion.div
                                key={entry.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className='flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-lg'
                            >
                                <div className='space-y-1'>
                                    <p className='font-medium text-white'>
                                        {formatDate(entry.clock_in)}
                                    </p>
                                    {entry.branch_name && (
                                        <p className='text-xs text-zinc-500 flex items-center gap-1'>
                                            <MapPin className='w-3 h-3' />
                                            {entry.branch_name}
                                        </p>
                                    )}
                                </div>
                                <div className='text-right space-y-1'>
                                    <div className='flex items-center justify-end gap-2 text-sm text-white'>
                                        <Clock className='w-4 h-4 text-zinc-400' />
                                        <span>{formatTime(entry.clock_in)}</span>
                                        {entry.clock_out && (
                                            <>
                                                <span className='text-zinc-600'>→</span>
                                                <span>{formatTime(entry.clock_out)}</span>
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
                                        {entry.duration || "In Progress"}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </PageWrapper>
    )
}
