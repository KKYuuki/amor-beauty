"use client"

import { useState, useRef } from "react"
import { motion } from "motion/react"
import {
    XIcon,
    LoaderCircleIcon,
    FileSpreadsheetIcon,
    FileIcon,
    FileTextIcon,
    InfoIcon,
    DownloadIcon,
    ChevronDownIcon,
    CheckIcon,
} from "lucide-react"
import { DateRangePreset, safeToDate, safeToISOString, isValidDate } from "@/utils/date-utils"
import { LedgerExportType } from "@/utils/types/ledger"
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

const EXPORT_SCOPES: { key: LedgerExportType; label: string }[] = [
    { key: "GENERAL_LEDGER", label: "General Ledger" },
    { key: "CASH_RECEIPTS", label: "Cash Receipts" },
    { key: "CASH_DISBURSEMENTS", label: "Cash Disbursements" },
    { key: "SALES", label: "Sales" },
    { key: "PURCHASES", label: "Purchases" },
    { key: "BY_PAYMENT_METHOD", label: "By Payment Method" },
]

const FORMAT_OPTIONS: { key: "xlsx" | "csv" | "pdf"; label: string; icon: typeof FileSpreadsheetIcon }[] = [
    { key: "xlsx", label: "XLSX", icon: FileSpreadsheetIcon },
    { key: "csv", label: "CSV", icon: FileIcon },
    { key: "pdf", label: "PDF", icon: FileTextIcon },
]

const GROUPING_OPTIONS: { key: "branch" | "accounting_type" | "payment_method" | "category"; label: string; tooltip: string }[] = [
    {
        key: "branch",
        label: "Branch",
        tooltip: "Group entries by branch location. Useful for multi-location studios.",
    },
    {
        key: "accounting_type",
        label: "Accounting Type",
        tooltip: "Group by entry type: Expense, Revenue, Asset, Liability, Equity.",
    },
    {
        key: "payment_method",
        label: "Payment Method",
        tooltip: "Group by payment method: Cash, Card, Bank Transfer, etc.",
    },
    {
        key: "category",
        label: "Category",
        tooltip: "Group by custom categories within each entry type (hierarchical).",
    },
]

interface ExportGroupingModalProps {
    isOpen: boolean
    onClose: () => void
    onExport: (config: ExportConfig) => Promise<void>
}

export interface ExportConfig {
    format: "xlsx" | "csv" | "pdf"
    groupings: string[]
    scope: LedgerExportType
    datePreset: DateRangePreset | "custom"
    startDate?: Date
    endDate?: Date
    includeSummarySheet: boolean
    includeCharts: boolean
}

export default function ExportGroupingModal({
    isOpen,
    onClose,
    onExport,
}: ExportGroupingModalProps) {
    const [format, setFormat] = useState<"xlsx" | "csv" | "pdf">("xlsx")
    const [groupings, setGroupings] = useState<string[]>(["branch"])
    const [scope, setScope] = useState<LedgerExportType>("GENERAL_LEDGER")
    const [datePreset, setDatePreset] = useState<DateRangePreset | "custom">("this_month")
    const [startDate, setStartDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    const [endDate, setEndDate] = useState<Date>(new Date())
    const [includeSummarySheet, setIncludeSummarySheet] = useState(true)
    const [includeCharts, setIncludeCharts] = useState(true)
    const [loading, setLoading] = useState(false)
    const [showScopeDropdown, setShowScopeDropdown] = useState(false)
    const [showDateDropdown, setShowDateDropdown] = useState(false)
    const [showTooltip, setShowTooltip] = useState<string | null>(null)
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

    const toggleGrouping = (key: string) => {
        setGroupings((prev) =>
            prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]
        )
    }

    const handleExport = async () => {
        setError(null)
        if (datePreset === "custom") {
            if (!isValidDate(startDate) || !isValidDate(endDate)) {
                setError("Please select valid start and end dates")
                return
            }
            if (startDate > endDate) {
                setError("Start date must be before or equal to end date")
                return
            }
        }
        setLoading(true)
        try {
            await onExport({
                format,
                groupings,
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
                className="bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg border border-white/10 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <DownloadIcon className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold">Export Grouped Report</h3>
                            <p className="text-sm text-white/60">Configure export options</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white/60 hover:text-white transition-colors"
                    >
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    {/* Format Selection */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-white/80">
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
                                                : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"
                                        }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span className="font-medium">{option.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Grouping Selection */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-white/80">
                            Group By
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {GROUPING_OPTIONS.map((option) => (
                                <div key={option.key} className="relative">
                                    <button
                                        onClick={() => toggleGrouping(option.key)}
                                        onMouseEnter={() => setShowTooltip(option.key)}
                                        onMouseLeave={() => setShowTooltip(null)}
                                        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors text-left ${
                                            groupings.includes(option.key)
                                                ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                                                : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"
                                        }`}
                                    >
                                        <div
                                            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                                groupings.includes(option.key)
                                                    ? "bg-blue-500 border-blue-500"
                                                    : "border-white/30"
                                            }`}
                                        >
                                            {groupings.includes(option.key) && (
                                                <CheckIcon className="w-3 h-3 text-white" />
                                            )}
                                        </div>
                                        <span className="text-sm font-medium">{option.label}</span>
                                        <InfoIcon className="w-3.5 h-3.5 ml-auto text-white/40" />
                                    </button>
                                    {showTooltip === option.key && (
                                        <div className="absolute z-10 bottom-full left-0 mb-2 w-64 p-3 bg-zinc-800 rounded-lg border border-white/10 shadow-xl text-xs text-white/80 leading-relaxed">
                                            {option.tooltip}
                                            <div className="absolute top-full left-4 border-4 border-transparent border-t-zinc-800" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Export Scope */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-white/80">
                            Export Scope
                        </label>
                        <div className="relative" ref={scopeDropdownRef}>
                            <button
                                onClick={() => setShowScopeDropdown(!showScopeDropdown)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-white/5 border border-white/10 rounded-lg hover:border-white/20 transition-colors"
                            >
                                <span className="text-white/80">
                                    {EXPORT_SCOPES.find((s) => s.key === scope)?.label}
                                </span>
                                <ChevronDownIcon
                                    className={`w-4 h-4 text-white/60 transition-transform ${
                                        showScopeDropdown ? "rotate-180" : ""
                                    }`}
                                />
                            </button>
                            {showScopeDropdown && (
                                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-zinc-800 border border-white/10 rounded-lg shadow-xl overflow-hidden">
                                    {EXPORT_SCOPES.map((option) => (
                                        <button
                                            key={option.key}
                                            onClick={() => {
                                                setScope(option.key)
                                                setShowScopeDropdown(false)
                                            }}
                                            className={`w-full px-4 py-2.5 text-left text-sm hover:bg-white/10 transition-colors ${
                                                scope === option.key
                                                    ? "text-blue-400 bg-blue-500/10"
                                                    : "text-white/80"
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Date Range */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-white/80">
                            Date Range
                        </label>
                        <div className="space-y-3">
                            <div className="relative" ref={dateDropdownRef}>
                                <button
                                    onClick={() => setShowDateDropdown(!showDateDropdown)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-white/5 border border-white/10 rounded-lg hover:border-white/20 transition-colors"
                                >
                                    <span className="text-white/80">
                                        {DATE_PRESETS.find((p) => p.key === datePreset)?.label}
                                    </span>
                                    <ChevronDownIcon
                                        className={`w-4 h-4 text-white/60 transition-transform ${
                                            showDateDropdown ? "rotate-180" : ""
                                        }`}
                                    />
                                </button>
                                {showDateDropdown && (
                                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-zinc-800 border border-white/10 rounded-lg shadow-xl overflow-hidden">
                                        {DATE_PRESETS.map((preset) => (
                                            <button
                                                key={preset.key}
                                                onClick={() => {
                                                    setDatePreset(preset.key)
                                                    setShowDateDropdown(false)
                                                }}
                                                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-white/10 transition-colors ${
                                                    datePreset === preset.key
                                                        ? "text-blue-400 bg-blue-500/10"
                                                        : "text-white/80"
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
                                        <label className="block text-xs text-white/50 mb-1.5">
                                            Start Date
                                        </label>
                                        <input
                                            type="date"
                                            value={safeToISOString(startDate)}
                                            onChange={(e) => {
                                                const d = safeToDate(e.target.value)
                                                if (isValidDate(d)) setStartDate(d)
                                            }}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500/50 outline-none transition-colors text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-white/50 mb-1.5">
                                            End Date
                                        </label>
                                        <input
                                            type="date"
                                            value={safeToISOString(endDate)}
                                            onChange={(e) => {
                                                const d = safeToDate(e.target.value)
                                                if (isValidDate(d)) setEndDate(d)
                                            }}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500/50 outline-none transition-colors text-sm"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Options Toggles */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-white/80">
                            Options
                        </label>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-lg border border-white/10">
                                <div>
                                    <span className="text-sm font-medium">Include Summary Sheet</span>
                                    <p className="text-xs text-white/50 mt-0.5">
                                        Add a summary tab with totals
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIncludeSummarySheet(!includeSummarySheet)}
                                    className={`w-10 h-6 rounded-full transition-colors relative ${
                                        includeSummarySheet ? "bg-blue-500" : "bg-white/20"
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
                                <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-lg border border-white/10">
                                    <div>
                                        <span className="text-sm font-medium">Include Charts</span>
                                        <p className="text-xs text-white/50 mt-0.5">
                                            Add visual charts to the export
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setIncludeCharts(!includeCharts)}
                                        className={`w-10 h-6 rounded-full transition-colors relative ${
                                            includeCharts ? "bg-blue-500" : "bg-white/20"
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

                {/* Footer */}
                <div className="p-6 border-t border-white/10 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={loading || groupings.length === 0}
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
