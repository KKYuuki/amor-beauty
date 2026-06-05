"use client"

import { CalendarIcon } from "lucide-react"
import { DateRangePreset } from "@/utils/date-utils"

const TIMEFRAME_LABELS: Record<DateRangePreset, string> = {
    this_week: "This Week",
    this_month: "This Month",
    this_year: "This Year",
    today: "Today",
    last_year: "Last Year",
    custom: "Custom",
    all: "All Time",
}

interface TimeframeSelectorProps {
    timeframe: DateRangePreset
    onTimeframeChange: (preset: DateRangePreset) => void
    customStartDate: string
    customEndDate: string
    onCustomStartDateChange: (date: string) => void
    onCustomEndDateChange: (date: string) => void
    dateRangeStr: string
}

export default function TimeframeSelector({
    timeframe,
    onTimeframeChange,
    customStartDate,
    customEndDate,
    onCustomStartDateChange,
    onCustomEndDateChange,
    dateRangeStr,
}: TimeframeSelectorProps) {
    return (
        <div className='flex flex-col gap-4'>
            <div className='flex items-center justify-between flex-wrap gap-4'>
                <div className='flex gap-2 p-1 bg-white/5 w-fit rounded-lg border border-white/5 flex-wrap'>
                    {(
                        [
                            "this_week",
                            "this_month",
                            "this_year",
                        ] as DateRangePreset[]
                    ).map((preset) => (
                        <button
                            key={preset}
                            onClick={() => onTimeframeChange(preset)}
                            className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                                timeframe === preset
                                    ? "bg-white/10 text-white shadow-sm"
                                    : "text-white/40 hover:text-white/60 hover:bg-white/5"
                            }`}
                        >
                            {TIMEFRAME_LABELS[preset]}
                        </button>
                    ))}
                    <button
                        onClick={() => onTimeframeChange("custom")}
                        className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                            timeframe === "custom"
                                ? "bg-purple-500/20 text-purple-300 shadow-sm border border-purple-500/30"
                                : "text-white/40 hover:text-white/60 hover:bg-white/5"
                        }`}
                    >
                        <CalendarIcon size={14} />
                        Custom
                    </button>
                </div>

                <div className='flex flex-col items-end gap-1'>
                    <span className='text-xs text-white/40 font-mono'>
                        Selected Range
                    </span>
                    <span className='text-sm text-white/80 font-medium'>
                        {dateRangeStr || "Select a range"}
                    </span>
                </div>
            </div>

            {timeframe === "custom" && (
                <div className='flex items-center gap-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg flex-wrap'>
                    <div className='flex flex-col gap-1'>
                        <label className='text-xs text-white/60 font-medium'>
                            Start Date
                        </label>
                        <input
                            type='date'
                            value={customStartDate}
                            onChange={(e) => onCustomStartDateChange(e.target.value)}
                            className='px-3 py-2 bg-white/10 border border-white/10 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all'
                        />
                    </div>
                    <span className='text-white/40 mt-5'>to</span>
                    <div className='flex flex-col gap-1'>
                        <label className='text-xs text-white/60 font-medium'>
                            End Date
                        </label>
                        <input
                            type='date'
                            value={customEndDate}
                            onChange={(e) => onCustomEndDateChange(e.target.value)}
                            max={new Date().toISOString().split("T")[0]}
                            className='px-3 py-2 bg-white/10 border border-white/10 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all'
                        />
                    </div>
                    {customStartDate &&
                        customEndDate &&
                        new Date(customStartDate) >
                            new Date(customEndDate) && (
                            <span className='text-red-400 text-xs mt-5'>
                                Start date must be before end date
                            </span>
                        )}
                </div>
            )}
        </div>
    )
}

export { TIMEFRAME_LABELS }
