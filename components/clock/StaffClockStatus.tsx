"use client"

import { useState, useEffect, useCallback } from "react"
import { Clock, MapPin, Users, Filter, Loader2 } from "lucide-react"
import { getStaffClockStatus, StaffClockStatus as StaffClockStatusType } from "@/server/actions/time-clock"
import { ActionResponse } from "@/utils/types/responses"

type FilterType = "all" | "clocked_in" | "clocked_out"

interface StaffClockStatusProps {
    branchId?: string
}

export default function StaffClockStatus({ branchId }: StaffClockStatusProps) {
    const [staffStatus, setStaffStatus] = useState<StaffClockStatusType[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState<FilterType>("all")

    const fetchStaffStatus = useCallback(async () => {
        setIsLoading(true)
        setError(null)

        try {
            const result: ActionResponse<{ staff: StaffClockStatusType[] }> = await getStaffClockStatus(branchId)

            if (!result.success) {
                setError(result.error)
                setStaffStatus([])
                return
            }

            setStaffStatus(result.data.staff)
        } catch (_err) {
            setError("Failed to fetch staff clock status")
            setStaffStatus([])
        } finally {
            setIsLoading(false)
        }
    }, [branchId])

    useEffect(() => {
        fetchStaffStatus()

        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchStaffStatus, 30000)
        return () => clearInterval(interval)
    }, [fetchStaffStatus])

    const filteredStaff = staffStatus.filter((staff) => {
        if (filter === "clocked_in") return staff.is_clocked_in
        if (filter === "clocked_out") return !staff.is_clocked_in
        return true
    })

    const clockedInCount = staffStatus.filter((s) => s.is_clocked_in).length
    const clockedOutCount = staffStatus.filter((s) => !s.is_clocked_in).length

    const formatTime = (dateString: string | null) => {
        if (!dateString) return "—"
        const date = new Date(dateString)
        return date.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
        })
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
                <Loader2 className="w-8 h-8 animate-spin text-white/60" />
                <p className="text-sm text-white/60">Loading staff status...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-300">{error}</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Stats and Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 border border-green-500/30 rounded-md">
                        <Clock className="w-4 h-4 text-green-400" />
                        <span className="text-sm font-medium text-green-300">
                            {clockedInCount} Clocked In
                        </span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md">
                        <Clock className="w-4 h-4 text-zinc-400" />
                        <span className="text-sm font-medium text-zinc-300">
                            {clockedOutCount} Clocked Out
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-zinc-400" />
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as FilterType)}
                        className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-white focus:border-white/30 outline-none"
                    >
                        <option value="all">All Staff</option>
                        <option value="clocked_in">Clocked In</option>
                        <option value="clocked_out">Clocked Out</option>
                    </select>
                </div>
            </div>

            {/* Staff List */}
            {filteredStaff.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 py-12 text-zinc-500">
                    <Users className="w-12 h-12" />
                    <p className="text-sm">
                        {filter === "all"
                            ? "No staff members found"
                            : filter === "clocked_in"
                              ? "No staff currently clocked in"
                              : "All staff are clocked in"}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredStaff.map((staff) => (
                        <div
                            key={staff.staff_id}
                            className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-lg"
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className={`w-3 h-3 rounded-full ${
                                        staff.is_clocked_in
                                            ? "bg-green-500 animate-pulse"
                                            : "bg-zinc-600"
                                    }`}
                                />
                                <div>
                                    <p className="font-medium text-white">
                                        {staff.staff_name || staff.staff_email.split('@')[0]}
                                    </p>
                                    <p className="text-xs text-zinc-500">
                                        {staff.staff_email}
                                    </p>
                                </div>
                            </div>

                            <div className="text-right space-y-1">
                                {staff.is_clocked_in ? (
                                    <>
                                        <div className="flex items-center justify-end gap-2 text-sm text-green-400">
                                            <Clock className="w-4 h-4" />
                                            <span>Clocked In</span>
                                        </div>
                                        <div className="flex items-center justify-end gap-2 text-xs text-zinc-400">
                                            <MapPin className="w-3 h-3" />
                                            <span>
                                                {staff.branch_name || "Unknown Branch"}
                                            </span>
                                        </div>
                                        <p className="text-xs text-zinc-500">
                                            Since {formatTime(staff.clocked_in_at)}
                                        </p>
                                        {staff.duration && (
                                            <p className="text-xs text-amber-400">
                                                Duration: {staff.duration}
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex items-center justify-end gap-2 text-sm text-zinc-500">
                                        <Clock className="w-4 h-4" />
                                        <span>Clocked Out</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
