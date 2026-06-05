"use client"

import { useState, useEffect } from "react"
import { Clock, Calendar, X } from "lucide-react"
import { StaffSchedule, ScheduleInput } from "@/utils/types/schedules"
import { getStaffSchedule, updateStaffSchedule } from "@/server/actions/time-clock"
import { NotificationContext } from "@/components/notifications"
import { useContext } from "react"

const DAYS_OF_WEEK = [
    { id: 0, name: "Sunday" },
    { id: 1, name: "Monday" },
    { id: 2, name: "Tuesday" },
    { id: 3, name: "Wednesday" },
    { id: 4, name: "Thursday" },
    { id: 5, name: "Friday" },
    { id: 6, name: "Saturday" },
]

interface ScheduleEditorProps {
    staffId: string
    staffName: string
    onClose: () => void
    readonly?: boolean
    inline?: boolean
}

export default function ScheduleEditor({ staffId, staffName, onClose, readonly = false, inline = false }: ScheduleEditorProps) {
    const [schedules, setSchedules] = useState<ScheduleInput[]>(
        DAYS_OF_WEEK.map((day) => ({
            day_of_week: day.id,
            start_time: "09:00",
            end_time: "18:00",
            is_off: false,
        }))
    )
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const { addNotification } = useContext(NotificationContext)

    useEffect(() => {
        const fetchSchedule = async () => {
            const result = await getStaffSchedule(staffId)
            
            if (result.success && result.data.schedules.length > 0) {
                const scheduleMap: Record<number, StaffSchedule> = {}
                result.data.schedules.forEach((s: StaffSchedule) => {
                    scheduleMap[s.day_of_week] = s
                })

                setSchedules(
                    DAYS_OF_WEEK.map((day) => {
                        const existing = scheduleMap[day.id]
                        return existing
                            ? {
                                  day_of_week: existing.day_of_week,
                                  start_time: existing.start_time || "09:00",
                                  end_time: existing.end_time || "18:00",
                                  is_off: existing.is_off,
                              }
                            : {
                                  day_of_week: day.id,
                                  start_time: "09:00",
                                  end_time: "18:00",
                                  is_off: true,
                              }
                    })
                )
            }
            setLoading(false)
        }

        fetchSchedule()
    }, [staffId])

    const handleSave = async () => {
        setSaving(true)
        const result = await updateStaffSchedule(staffId, schedules)
        
        if (result.success) {
            addNotification("Schedule updated successfully", "SUCCESS")
            onClose()
        } else {
            addNotification(result.error || "Failed to update schedule", "ERROR")
        }
        setSaving(false)
    }

    const updateDay = (dayOfWeek: number, updates: Partial<ScheduleInput>) => {
        setSchedules((prev) =>
            prev.map((s) =>
                s.day_of_week === dayOfWeek ? { ...s, ...updates } : s
            )
        )
    }

    if (loading) {
        const loadingContent = (
            <div className="flex items-center justify-center p-8">
                <Clock className="animate-spin" size={32} />
            </div>
        )
        
        if (inline) {
            return (
                <div className="w-full bg-black/90 border-2 border-white/10 rounded-xl flex flex-col gap-4 p-6">
                    {loadingContent}
                </div>
            )
        }
        
        return (
            <div className="fixed top-1/2 left-1/2 -translate-1/2 w-[calc(100%-2rem)] max-w-2xl bg-black/90 border-2 border-white/10 rounded-xl flex flex-col gap-4 p-6 z-10">
                {loadingContent}
            </div>
        )
    }

    const containerClass = inline 
        ? "w-full bg-black/90 border-2 border-white/10 rounded-xl flex flex-col gap-4 p-6"
        : "fixed top-1/2 left-1/2 -translate-1/2 w-[calc(100%-2rem)] max-w-2xl bg-black/90 border-2 border-white/10 rounded-xl flex flex-col gap-4 p-6 z-10"

    return (
        <div className={containerClass}>
            <div className="flex flex-row gap-4 items-start justify-between">
                <div className="flex flex-row gap-3 items-center">
                    <div className="p-2 bg-white/5 rounded-lg">
                        <Calendar className="text-white/60" size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Weekly Schedule</h2>
                        <p className="text-white/60 text-sm">{staffName}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1 transition-colors rounded-md bg-transparent hover:bg-white/10 cursor-pointer"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
                {DAYS_OF_WEEK.map((day) => {
                    const daySchedule = schedules.find((s) => s.day_of_week === day.id)
                    return (
                        <div
                            key={day.id}
                            className="flex flex-row gap-4 items-center p-4 bg-white/5 rounded-lg border border-white/5"
                        >
                            <div className="w-24 font-semibold text-sm">{day.name}</div>
                            
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={daySchedule?.is_off || false}
                                    onChange={(e) =>
                                        updateDay(day.id, { is_off: e.target.checked })
                                    }
                                    disabled={readonly}
                                    className="w-4 h-4 rounded border-white/20 bg-white/10 text-green-500 focus:ring-2 focus:ring-green-500/50"
                                />
                                <span className="text-sm text-white/80">Day Off</span>
                            </label>

                            {!daySchedule?.is_off && (
                                <div className="flex-1 flex flex-row gap-4">
                                    <div className="flex-1">
                                        <label className="text-xs text-white/60 block mb-1">
                                            Start Time
                                        </label>
                                        <input
                                            type="time"
                                            value={daySchedule?.start_time || "09:00"}
                                            onChange={(e) =>
                                                updateDay(day.id, { start_time: e.target.value })
                                            }
                                            disabled={readonly}
                                            className="w-full bg-white/10 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-white/20 disabled:opacity-50"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs text-white/60 block mb-1">
                                            End Time
                                        </label>
                                        <input
                                            type="time"
                                            value={daySchedule?.end_time || "18:00"}
                                            onChange={(e) =>
                                                updateDay(day.id, { end_time: e.target.value })
                                            }
                                            disabled={readonly}
                                            className="w-full bg-white/10 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus:border-white/20 disabled:opacity-50"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {!readonly && (
                <div className="flex flex-row gap-2 justify-end pt-4 border-t border-white/10">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2 bg-white/5 rounded-md border border-white/10 hover:bg-white/10 transition-colors cursor-pointer font-semibold text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 bg-green-400/20 text-green-400 rounded-md border border-green-400/30 hover:bg-green-400/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-semibold text-sm"
                    >
                        {saving ? "Saving..." : "Save Schedule"}
                    </button>
                </div>
            )}
        </div>
    )
}
