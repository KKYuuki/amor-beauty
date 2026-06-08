"use client"

import { useState, useEffect } from "react"
import { getDateRangeFromPreset, type DateRangePreset } from "@/utils/date-utils"

interface DateRange {
    dateFrom: string
    dateTo: string
}

interface DateRangeSelectorProps {
    value: DateRange
    onChange: (range: DateRange) => void
}

const PRESETS: { key: DateRangePreset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "this_week", label: "This Week" },
    { key: "this_month", label: "This Month" },
    { key: "this_year", label: "This Year" },
]

export default function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
    const [activePreset, setActivePreset] = useState<DateRangePreset | null>("this_month")
    const [customFrom, setCustomFrom] = useState(value.dateFrom)
    const [customTo, setCustomTo] = useState(value.dateTo)
    const [customError, setCustomError] = useState<string | null>(null)

    // Sync internal custom date fields when parent's value prop changes externally
    useEffect(() => {
        setCustomFrom(value.dateFrom)
        setCustomTo(value.dateTo)
    }, [value.dateFrom, value.dateTo])

    const handlePreset = (preset: DateRangePreset) => {
        setActivePreset(preset)
        const range = getDateRangeFromPreset(preset)
        if (range) {
            const newRange = {
                dateFrom: range.start.toISOString().split("T")[0],
                dateTo: range.end.toISOString().split("T")[0],
            }
            setCustomFrom(newRange.dateFrom)
            setCustomTo(newRange.dateTo)
            onChange(newRange)
        }
    }

    const handleCustomApply = () => {
        setActivePreset(null)
        if (!customFrom || !customTo) {
            setCustomError("Please select both dates")
            return
        }
        if (new Date(customFrom) > new Date(customTo)) {
            setCustomError("Start date must be before end date")
            return
        }
        setCustomError(null)
        onChange({ dateFrom: customFrom, dateTo: customTo })
    }

    return (
        <div className='flex flex-wrap items-center gap-2'>
            <div className='flex gap-1 bg-muted p-1 rounded'>
                {PRESETS.map((preset) => (
                    <button
                        key={preset.key}
                        onClick={() => handlePreset(preset.key)}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            activePreset === preset.key
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                    >
                        {preset.label}
                    </button>
                ))}
                <button
                    onClick={() => setActivePreset(null)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        activePreset === null
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                >
                    Custom
                </button>
            </div>
            {activePreset === null && (
                <div className='flex items-center gap-2'>
                    <input
                        type='date'
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className='px-2 py-1.5 bg-muted border border-border rounded text-xs text-foreground focus:outline-none focus:border-primary'
                    />
                    <span className='text-muted-foreground/70 text-xs'>to</span>
                    <input
                        type='date'
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className='px-2 py-1.5 bg-muted border border-border rounded text-xs text-foreground focus:outline-none focus:border-primary'
                    />
                    <button
                        onClick={handleCustomApply}
                        className='px-2 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded text-xs'
                    >
                        Apply
                    </button>
                    {customError && (
                        <span className='text-red-400 text-xs ml-2'>{customError}</span>
                    )}
                </div>
            )}
        </div>
    )
}
