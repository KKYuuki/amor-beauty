"use client"

import { useState, useEffect, useCallback } from "react"
import { Clock, LogOut, LogIn, Timer, Calendar, History } from "lucide-react"
import { getClockStatus, ClockStatusResult, getTodayHours } from "@/server/actions/time-clock"
import ClockInScanner from "@/components/clock/ClockInScanner"
import { NotificationContext } from "@/components/notifications"
import { useContext } from "react"
import ClockOutScanner from "@/components/clock/ClockOutScanner"
import { motion, AnimatePresence } from "motion/react"

interface TimeClockWidgetProps {
    staffId: string
}

interface TodayHoursData {
    totalHours: string
    entriesCount: number
    firstClockIn: string | null
    lastClockOut: string | null
}

export default function TimeClockWidget({ staffId }: TimeClockWidgetProps) {
    const [status, setStatus] = useState<ClockStatusResult | null>(null)
    const [todayHours, setTodayHours] = useState<TodayHoursData | null>(null)
    const [loading, setLoading] = useState(true)
    const [notes, setNotes] = useState("")
    const [showNotes, setShowNotes] = useState(false)
    const [localDuration, setLocalDuration] = useState<string | null>(null)
    const [showScanner, setShowScanner] = useState(false)
    const [showClockOutScanner, setShowClockOutScanner] = useState(false)
    const { addNotification } = useContext(NotificationContext)

    const fetchStatus = useCallback(async () => {
        const [statusResult, hoursResult] = await Promise.all([
            getClockStatus(staffId),
            getTodayHours(staffId)
        ])
        
        if (statusResult.success) {
            setStatus(statusResult.data)
        }
        if (hoursResult.success) {
            setTodayHours(hoursResult.data)
        }
        setLoading(false)
    }, [staffId])

    useEffect(() => {
        fetchStatus()
    }, [fetchStatus])

    useEffect(() => {
        if (!status?.isClockedIn || !status.clockedInAt) {
            setLocalDuration(null)
            return
        }

        const updateDuration = () => {
            const clockedIn = new Date(status.clockedInAt!).getTime()
            const now = new Date().getTime()
            const diffMs = now - clockedIn
            const seconds = Math.floor(diffMs / 1000)
            const hours = Math.floor(seconds / 3600)
            const minutes = Math.floor((seconds % 3600) / 60)
            const remainingSeconds = seconds % 60
            setLocalDuration(
                `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
            )
        }

        updateDuration()
        const interval = setInterval(updateDuration, 1000)
        return () => clearInterval(interval)
    }, [status?.isClockedIn, status?.clockedInAt])

    const handleClockInSuccess = () => {
        setShowScanner(false)
        fetchStatus()
        addNotification("Successfully clocked in!", "SUCCESS")
    }

    const handleClockInClick = () => {
        setShowScanner(true)
    }

    const handleClockOutClick = () => {
        setShowClockOutScanner(true)
    }

    const handleClockOutSuccess = () => {
        setShowClockOutScanner(false)
        addNotification("Successfully clocked out!", "SUCCESS")
        fetchStatus()
    }

    if (loading && !status) {
        return (
            <div className="w-full bg-gradient-to-br from-white/10 to-white/5 p-8 border-2 border-white/10 rounded-2xl select-none">
                <div className="flex items-center justify-center gap-4">
                    <Clock className="animate-pulse text-white/60" size={48} />
                    <span className="text-white/60 text-lg">Loading time clock...</span>
                </div>
            </div>
        )
    }

    const isClockedIn = status?.isClockedIn ?? false

    return (
        <div className={`w-full transition-all duration-500 ${isClockedIn ? 'bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent' : 'bg-gradient-to-br from-white/10 to-white/5'} p-4 sm:p-6 md:p-8 border-2 ${isClockedIn ? 'border-green-500/30' : 'border-white/10'} rounded-2xl select-none relative overflow-clip`}>
            {/* Animated background pulse when clocked in */}
            <AnimatePresence>
                {isClockedIn && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.3, 0.5, 0.3] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-0 bg-gradient-to-r from-green-500/5 via-emerald-500/10 to-green-500/5"
                    />
                )}
            </AnimatePresence>

            <div className="relative z-10">
                {/* Header with Status Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${isClockedIn ? 'bg-green-500/20' : 'bg-white/10'}`}>
                            {isClockedIn ? (
                                <motion.div
                                    animate={{ rotate: [0, 360] }}
                                    transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                                >
                                    <Clock className="text-green-400" size={32} />
                                </motion.div>
                            ) : (
                                <Clock className="text-white/60" size={32} />
                            )}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Time Clock</h2>
                            <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${isClockedIn ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/60'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isClockedIn ? 'bg-green-400 animate-pulse' : 'bg-white/60'}`} />
                                    {isClockedIn ? 'Currently Clocked In' : 'Currently Clocked Out'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Quick Stats - Desktop */}
                    <div className="hidden sm:flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-xs text-white/40 uppercase tracking-wider font-medium">Today</p>
                            <p className="text-lg font-bold text-white/80">{todayHours?.totalHours || "0h 0m"}</p>
                        </div>
                        {todayHours && todayHours.entriesCount > 0 && (
                            <div className="text-right">
                                <p className="text-xs text-white/40 uppercase tracking-wider font-medium">Entries</p>
                                <p className="text-lg font-bold text-white/80">{todayHours.entriesCount}</p>
                            </div>
                        )}
                    </div>

                    {/* Quick Stats - Mobile */}
                    <div className="flex sm:hidden items-center gap-4 bg-white/5 rounded-lg px-3 py-2">
                        <div>
                            <p className="text-xs text-white/40 uppercase tracking-wider font-medium">Today</p>
                            <p className="text-base font-bold text-white/80">{todayHours?.totalHours || "0h 0m"}</p>
                        </div>
                        {todayHours && todayHours.entriesCount > 0 && (
                            <div className="border-l border-white/10 pl-4">
                                <p className="text-xs text-white/40 uppercase tracking-wider font-medium">Sessions</p>
                                <p className="text-base font-bold text-white/80">{todayHours.entriesCount}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Timer Display */}
                <div className="flex flex-col lg:flex-row lg:items-stretch gap-4 sm:gap-6 mb-6">
                    {/* Current Session Timer */}
                    <div className="flex-1 min-w-0">
                        <AnimatePresence mode="wait">
                            {isClockedIn ? (
                                <motion.div
                                    key="clocked-in"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="bg-black/30 rounded-2xl p-4 sm:p-6 border border-green-500/20 h-full"
                                >
                                    <div className="flex items-center gap-3 mb-2">
                                        <Timer className="text-green-400 flex-shrink-0" size={20} />
                                        <span className="text-green-400/80 text-sm font-medium uppercase tracking-wider">Current Session</span>
                                    </div>
                                    <div className="font-mono text-4xl sm:text-5xl lg:text-6xl font-bold text-green-400 tabular-nums tracking-tight overflow-hidden text-ellipsis">
                                        {localDuration || status?.duration || "00:00:00"}
                                    </div>
                                    <p className="text-white/40 text-sm mt-2">
                                        Started at {status?.clockedInAt ? new Date(status.clockedInAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : "--:--"}
                                    </p>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="clocked-out"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="bg-black/30 rounded-2xl p-4 sm:p-6 border border-white/10 h-full"
                                >
                                    <div className="flex items-center gap-3 mb-2">
                                        <LogOut className="text-white/40 flex-shrink-0" size={20} />
                                        <span className="text-white/40 text-sm font-medium uppercase tracking-wider">Status</span>
                                    </div>
                                    <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white/60">
                                        Ready to Clock In
                                    </div>
                                    <p className="text-white/40 text-sm mt-2">
                                        Scan your studio QR code to start your shift
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Today's Summary */}
                    <div className="lg:w-64 bg-white/5 rounded-2xl p-4 border border-white/10 flex-shrink-0">
                        <div className="flex items-center gap-2 mb-3">
                            <Calendar className="text-white/40" size={16} />
                            <span className="text-white/60 text-sm font-medium">Today&apos;s Summary</span>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-white/40 text-sm">Total Hours</span>
                                <span className="text-white font-semibold">{todayHours?.totalHours || "0h 0m"}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-white/40 text-sm">Sessions</span>
                                <span className="text-white font-semibold">{todayHours?.entriesCount || 0}</span>
                            </div>
                            {todayHours?.firstClockIn && (
                                <div className="flex justify-between items-center">
                                    <span className="text-white/40 text-sm">First In</span>
                                    <span className="text-white font-semibold">
                                        {new Date(todayHours.firstClockIn).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Action Area */}
                <div className="flex flex-col gap-4">
                    <AnimatePresence>
                        {showNotes && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                            >
                                <input
                                    type="text"
                                    placeholder="Add a note for this session (optional)..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full bg-black/30 border-2 border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex flex-row items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setShowNotes(!showNotes)}
                            className={`flex-shrink-0 px-4 py-3 rounded-xl border-2 transition-all ${showNotes ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                        >
                            <span className="text-sm font-medium text-white/80">
                                {showNotes ? 'Hide' : 'Note'}
                            </span>
                        </button>

                        {isClockedIn ? (
                            <button
                                type="button"
                                onClick={handleClockOutClick}
                                disabled={loading}
                                className="flex-1 flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-red-500/20 text-red-400 rounded-xl border-2 border-red-500/30 hover:bg-red-500/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 font-semibold min-h-[48px]"
                            >
                                <LogOut size={20} />
                                <span>Clock Out</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleClockInClick}
                                disabled={loading}
                                className="flex-1 flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-green-500/20 text-green-400 rounded-xl border-2 border-green-500/30 hover:bg-green-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 font-semibold min-h-[48px]"
                            >
                                <LogIn size={20} />
                                <span>Clock In</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Quick Links */}
                <div className="flex items-center gap-4 mt-6 pt-6 border-t border-white/10">
                    <a 
                        href="/time-clock" 
                        className="flex items-center gap-2 text-sm text-white/40 hover:text-white/80 transition-colors"
                    >
                        <History size={16} />
                        <span>View Full History</span>
                    </a>
                </div>
            </div>

            {/* Scanner Modal */}
            {showScanner && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <ClockInScanner
                        staffId={staffId}
                        onSuccess={handleClockInSuccess}
                        onCancel={() => setShowScanner(false)}
                    />
                </div>
            )}

            {showClockOutScanner && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <ClockOutScanner
                        staffId={staffId}
                        onSuccess={handleClockOutSuccess}
                        onCancel={() => setShowClockOutScanner(false)}
                    />
                </div>
            )}
        </div>
    )
}
