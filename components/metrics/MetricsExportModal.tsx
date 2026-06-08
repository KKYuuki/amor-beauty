"use client"

import { useState, useRef } from "react"
import { motion } from "motion/react"
import {
    XIcon,
    LoaderCircleIcon,
    FileSpreadsheetIcon,
    FileIcon,
    FileTextIcon,
    DownloadIcon,
    ChevronDownIcon,
} from "lucide-react"
import { DateRangePreset } from "@/utils/date-utils"
import useOutsideClick from "@/utils/useOutsideClick"

const DATE_PRESETS: { key: DateRangePreset; label: string }[] = [
    { key: "this_month", label: "This Month" },
    { key: "this_week", label: "This Week" },
    { key: "this_year", label: "This Year" },
    { key: "last_year", label: "Last Year" },
    { key: "today", label: "Today" },
    { key: "all", label: "All Time" },
    { key: "custom", label: "Custom Range" },
]

const EXPORT_SCOPES: { key: "business_insights" | "executive_accounting"; label: string }[] = [
    { key: "business_insights", label: "Business Insights" },
    { key: "executive_accounting", label: "Executive Accounting" },
]

const FORMAT_OPTIONS: { key: "xlsx" | "csv" | "pdf"; label: string; icon: typeof FileSpreadsheetIcon }[] = [
    { key: "xlsx", label: "XLSX", icon: FileSpreadsheetIcon },
    { key: "csv", label: "CSV", icon: FileIcon },
    { key: "pdf", label: "PDF", icon: FileTextIcon },
]

export interface MetricsExportConfig {
    format: "xlsx" | "csv" | "pdf"
    scope: "business_insights" | "executive_accounting"
    datePreset: DateRangePreset | "custom"
    startDate?: Date
    endDate?: Date
    includeSummarySheet: boolean
    includeCharts: boolean
}

interface MetricsExportModalProps {
    isOpen: boolean
    onClose: () => void
    onExport: (config: MetricsExportConfig) => Promise<void>
}

export default function MetricsExportModal({
    isOpen,
    onClose,
    onExport,
}: MetricsExportModalProps) {
    const [format, setFormat] = useState<"xlsx" | "csv" | "pdf">("xlsx")
    const [scope, setScope] = useState<"business_insights" | "executive_accounting">("business_insights")
    const [datePreset, setDatePreset] = useState<DateRangePreset | "custom">("this_month")
    const [startDate, setStartDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    const [endDate, setEndDate] = useState<Date>(new Date())
    const [includeSummarySheet, setIncludeSummarySheet] = useState(true)
    const [includeCharts, setIncludeCharts] = useState(true)
    const [loading, setLoading] = useState(false)
    const [showScopeDropdown, setShowScopeDropdown] = useState(false)
    const [showDateDropdown, setShowDateDropdown] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const scopeDropdownRef = useRef<HTMLDivElement>(null)
    const dateDropdownRef = useRef<HTMLDivElement>(null)

    useOutsideClick(
        scopeDropdownRef,
        () => setShowScopeDropdown(false),
        showScopeDropdown
    )
    useOutsideClick(
        dateDropdownRef,
        () => setShowDateDropdown(false),
        showDateDropdown
    )

    const handleExport = async () => {
        setError(null)
        if (datePreset === "custom" && startDate > endDate) {
            setError("Start date must be before or equal to end date")
            return
        }
        setLoading(true)
        try {
            await onExport({
                format,
                scope,
                datePreset,
                startDate: datePreset === "custom" ? startDate : undefined,
                endDate: datePreset === "custom" ? endDate : undefined,
                includeSummarySheet,
                includeCharts: format !== "csv" ? includeCharts : false,
            })
            onClose()
        } catch (err) {
            console.error("Export error:", err)
            setError(err instanceof Error ? err.message : "Export failed")
            return
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-card rounded-xl shadow-2xl w-full max-w-lg border border-border overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <DownloadIcon className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold">Export Metrics</h3>
                            <p className="text-sm text-muted-foreground">Configure export options</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-foreground">
                            Format
                        </label>
                        <div className="flex gap-2">
                            {FORMAT_OPTIONS.map((option) => {
                                const Icon = option.icon
                                return (
                                    <button
                                        key={option.key}
                                        onClick={() => setFormat(option.key)}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                                            format === option.key
                                                ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
                                                : "bg-muted border-border text-muted-foreground hover:border-border"
                                        }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span className="font-medium">{option.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-foreground">
                            Group By
                        </label>
                        <div className="px-4 py-3 bg-muted border border-border rounded-lg text-foreground">
                            Branch
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Metrics are grouped by branch by default
                        </p>
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-foreground">
                            Export Scope
                        </label>
                        <div className="relative" ref={scopeDropdownRef}>
                            <button
                                onClick={() => setShowScopeDropdown(!showScopeDropdown)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-muted border border-border rounded-lg hover:border-border transition-colors"
                            >
                                <span className="text-foreground">
                                    {EXPORT_SCOPES.find((s) => s.key === scope)?.label}
                                </span>
                                <ChevronDownIcon
                                    className={`w-4 h-4 text-muted-foreground transition-transform ${
                                        showScopeDropdown ? "rotate-180" : ""
                                    }`}
                                />
                            </button>
                            {showScopeDropdown && (
                                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-muted border border-border rounded-lg shadow-xl overflow-hidden">
                                    {EXPORT_SCOPES.map((option) => (
                                        <button
                                            key={option.key}
                                            onClick={() => {
                                                setScope(option.key)
                                                setShowScopeDropdown(false)
                                            }}
                                            className={`w-full px-4 py-2.5 text-left text-sm hover:bg-muted transition-colors ${
                                                scope === option.key
                                                    ? "text-blue-400 bg-blue-500/10"
                                                    : "text-foreground"
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-foreground">
                            Date Range
                        </label>
                        <div className="space-y-3">
                            <div className="relative" ref={dateDropdownRef}>
                                <button
                                    onClick={() => setShowDateDropdown(!showDateDropdown)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-muted border border-border rounded-lg hover:border-border transition-colors"
                                >
                                    <span className="text-foreground">
                                        {DATE_PRESETS.find((p) => p.key === datePreset)?.label}
                                    </span>
                                    <ChevronDownIcon
                                        className={`w-4 h-4 text-muted-foreground transition-transform ${
                                            showDateDropdown ? "rotate-180" : ""
                                        }`}
                                    />
                                </button>
                                {showDateDropdown && (
                                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-muted border border-border rounded-lg shadow-xl overflow-hidden">
                                        {DATE_PRESETS.map((preset) => (
                                            <button
                                                key={preset.key}
                                                onClick={() => {
                                                    setDatePreset(preset.key)
                                                    setShowDateDropdown(false)
                                                }}
                                                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-muted transition-colors ${
                                                    datePreset === preset.key
                                                        ? "text-blue-400 bg-blue-500/10"
                                                        : "text-foreground"
                                                }`}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {datePreset === "custom" && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-muted-foreground mb-1.5">
                                            Start Date
                                        </label>
                                        <input
                                            type="date"
                                            value={
                                                startDate
                                                    ? startDate.toISOString().split("T")[0]
                                                    : ""
                                            }
                                            onChange={(e) =>
                                                setStartDate(new Date(e.target.value))
                                            }
                                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:border-blue-500/50 outline-none transition-colors text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-muted-foreground mb-1.5">
                                            End Date
                                        </label>
                                        <input
                                            type="date"
                                            value={
                                                endDate
                                                    ? endDate.toISOString().split("T")[0]
                                                    : ""
                                            }
                                            onChange={(e) =>
                                                setEndDate(new Date(e.target.value))
                                            }
                                            className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:border-blue-500/50 outline-none transition-colors text-sm"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-foreground">
                            Options
                        </label>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-4 py-3 bg-muted rounded-lg border border-border">
                                <div>
                                    <span className="text-sm font-medium">Include Summary Sheet</span>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Add a summary tab with totals
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIncludeSummarySheet(!includeSummarySheet)}
                                    className={`w-10 h-6 rounded-full transition-colors relative ${
                                        includeSummarySheet ? "bg-blue-500" : "bg-muted"
                                    }`}
                                >
                                    <div
                                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                            includeSummarySheet ? "translate-x-5" : "translate-x-1"
                                        }`}
                                    />
                                </button>
                            </div>

                            {format !== "csv" && (
                                <div className="flex items-center justify-between px-4 py-3 bg-muted rounded-lg border border-border">
                                    <div>
                                        <span className="text-sm font-medium">Include Charts</span>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Add visual charts to the export
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setIncludeCharts(!includeCharts)}
                                        className={`w-10 h-6 rounded-full transition-colors relative ${
                                            includeCharts ? "bg-blue-500" : "bg-muted"
                                        }`}
                                    >
                                        <div
                                            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                                includeCharts ? "translate-x-5" : "translate-x-1"
                                            }`}
                                        />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="px-4 py-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-300 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-border flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 bg-card hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500/30 hover:bg-blue-500/40 text-blue-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2 border-blue-500/30"
                    >
                        {loading ? (
                            <>
                                <LoaderCircleIcon className="w-4 h-4 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            <>
                                <DownloadIcon className="w-4 h-4" />
                                Export
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    )
}
