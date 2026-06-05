"use client"

import { useState, useEffect, useCallback, useContext } from "react"
import { FileText, Search, Download, RefreshCw, ShieldAlert, X } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import PageWrapper from "@/components/page-wrapper"
import { SideBarContext } from "@/components/sidebar"
import { NotificationContext } from "@/components/notifications"
import { BranchSelector } from "@/components/ui/branch-selector"
import { getLogs, GetLogsResult } from "@/server/actions/logs"
import { LogEntry, LogLevel, LogType } from "@/utils/types/logs"
import { canAccessLogs } from "@/utils/auth/permissions"

type FilterState = {
    search: string
    level: LogLevel | ""
    type: LogType | ""
    branchId: string | null
    startDate: string
    endDate: string
}

const LOGS_PAGE_SIZE = 50

const LOG_LEVELS: LogLevel[] = ["INFO", "WARN", "ERROR", "DEBUG", "FATAL"]
const LOG_TYPES: LogType[] = [
    "APPOINTMENT",
    "INVENTORY",
    "SYSTEM",
    "AUTH",
    "ACCOUNTING",
    "PAYROLL",
    "STORAGE",
    "METRICS",
    "OTHER",
]

const LEVEL_COLORS: Record<LogLevel, string> = {
    INFO: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    WARN: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    ERROR: "bg-red-500/20 text-red-400 border-red-500/30",
    DEBUG: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    FATAL: "bg-red-900/40 text-red-300 border-red-700/50",
}

export default function AdminLogsPage() {
    const { userInfo } = useContext(SideBarContext)
    const { addNotification } = useContext(NotificationContext)

    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null)
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [exportingAll, setExportingAll] = useState(false)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [hasMore, setHasMore] = useState(false)
    const [filters, setFilters] = useState<FilterState>({
        search: "",
        level: "",
        type: "",
        branchId: null,
        startDate: "",
        endDate: "",
    })

    // Debounced search query
    const [debouncedSearch, setDebouncedSearch] = useState("")

    const checkAccess = useCallback(async () => {
        if (!userInfo) {
            setIsAuthorized(false)
            return
        }
        const hasAccess = await canAccessLogs(userInfo)
        setIsAuthorized(hasAccess)
        if (!hasAccess) {
            addNotification("You do not have permission to access this page", "ERROR")
        }
    }, [userInfo, addNotification])

    useEffect(() => {
        checkAccess()
    }, [checkAccess])

    const fetchLogs = useCallback(async () => {
        if (!isAuthorized) return

        setLoading(true)
        try {
            const result = await getLogs(
                page,
                filters.level || undefined,
                filters.type || undefined,
                filters.branchId || undefined,
                filters.startDate || undefined,
                filters.endDate || undefined,
                debouncedSearch || undefined
            )

            if (!result.success) {
                addNotification(result.error || "Failed to fetch logs", "ERROR")
            } else {
                const data = result.data as GetLogsResult
                setLogs(data.logs)
                setTotal(data.total)
                setHasMore(data.hasMore)
            }
        } catch (_error) {
            addNotification("An error occurred while fetching logs", "ERROR")
        } finally {
            setLoading(false)
        }
    }, [isAuthorized, page, filters.level, filters.type, filters.branchId, filters.startDate, filters.endDate, debouncedSearch, addNotification])

    // Effect 1: Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(filters.search), 300)
        return () => clearTimeout(timer)
    }, [filters.search])

    // Effect 2: Reset page to 1 when filters change (except page itself)
    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, filters.level, filters.type, filters.branchId, filters.startDate, filters.endDate])

    // Effect 3: Fetch logs when page or debounced filters change
    useEffect(() => {
        if (isAuthorized) {
            fetchLogs()
        }
    }, [isAuthorized, page, debouncedSearch, filters.level, filters.type, filters.branchId, filters.startDate, filters.endDate, fetchLogs])

    const handleClearFilters = () => {
        setFilters({
            search: "",
            level: "",
            type: "",
            branchId: null,
            startDate: "",
            endDate: "",
        })
        setPage(1)
    }

    const generateCSV = (logEntries: LogEntry[], filename: string) => {
        const headers = ["Timestamp", "Level", "Type", "User", "Branch", "Message"]
        const rows = logEntries.map((log) => [
            new Date(log.date).toISOString(),
            log.level,
            log.type,
            log.user_name || log.user_id || "System",
            log.branch_name || log.branch_id || "-",
            log.message || "",
        ])

        const csvContent = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join("\n")

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
        const link = document.createElement("a")
        const url = URL.createObjectURL(blob)
        link.setAttribute("href", url)
        link.setAttribute("download", filename)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleExportCSV = () => {
        generateCSV(logs, `system-logs-${new Date().toISOString().split("T")[0]}.csv`)
        addNotification("Logs exported successfully", "SUCCESS")
    }

    const handleExportAllCSV = async () => {
        if (total === 0) {
            addNotification("No logs to export", "ERROR")
            return
        }

        setExportingAll(true)
        try {
            const result = await getLogs(
                1,
                filters.level || undefined,
                filters.type || undefined,
                filters.branchId || undefined,
                filters.startDate || undefined,
                filters.endDate || undefined,
                debouncedSearch || undefined,
                total // Get all matching logs
            )

            if (!result.success) {
                addNotification(result.error || "Failed to fetch logs for export", "ERROR")
                return
            }

            const data = result.data as GetLogsResult
            generateCSV(data.logs, `system-logs-all-${new Date().toISOString().split("T")[0]}.csv`)
            addNotification(`Exported ${data.logs.length} logs`, "SUCCESS")
        } catch (_error) {
            addNotification("An error occurred while exporting logs", "ERROR")
        } finally {
            setExportingAll(false)
        }
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        })
    }

    const hasActiveFilters =
        filters.search || filters.level || filters.type || filters.branchId || filters.startDate || filters.endDate

    if (isAuthorized === null) {
        return (
            <PageWrapper>
                <div className="flex items-center justify-center h-full">
                    <div className="animate-pulse text-white/40">Checking permissions...</div>
                </div>
            </PageWrapper>
        )
    }

    if (!isAuthorized) {
        return (
            <PageWrapper>
                <div className="flex flex-col items-center justify-center h-full gap-6">
                    <div className="p-6 bg-red-500/10 border-2 border-red-500/30 rounded-full">
                        <ShieldAlert className="w-16 h-16 text-red-400" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                        <p className="text-white/60 max-w-md">
                            You do not have permission to access the System Logs page. Please contact an administrator if
                            you need access.
                        </p>
                    </div>
                </div>
            </PageWrapper>
        )
    }

    return (
        <PageWrapper>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                        <FileText className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">System Logs</h1>
                        <p className="text-white/60 text-sm">View and manage system activity logs</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportAllCSV}
                        disabled={logs.length === 0 || loading || exportingAll}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                        title="Export all matching logs"
                    >
                        <Download className={`w-4 h-4 ${exportingAll ? "animate-pulse" : ""}`} />
                        {exportingAll ? "Exporting..." : "Export All"}
                    </button>
                    <button
                        onClick={handleExportCSV}
                        disabled={logs.length === 0 || loading}
                        className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                        title="Export current page only"
                    >
                        <Download className="w-4 h-4" />
                        Export CSV
                    </button>
                    <button
                        onClick={fetchLogs}
                        disabled={loading}
                        className="p-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 rounded-md transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-4 p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex flex-col lg:flex-row gap-4">
                    {/* Search */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <input
                            type="text"
                            placeholder="Search messages..."
                            value={filters.search}
                            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                            className="w-full pl-10 pr-4 py-2 bg-black/30 border border-white/20 rounded-md text-white placeholder:text-white/40 focus:outline-none focus:border-blue-500"
                        />
                    </div>

                    {/* Level Filter */}
                    <select
                        value={filters.level}
                        onChange={(e) => setFilters((f) => ({ ...f, level: e.target.value as LogLevel | "" }))}
                        className="px-4 py-2 bg-black/30 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
                    >
                        <option value="">All Levels</option>
                        {LOG_LEVELS.map((level) => (
                            <option key={level} value={level}>
                                {level}
                            </option>
                        ))}
                    </select>

                    {/* Type Filter */}
                    <select
                        value={filters.type}
                        onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as LogType | "" }))}
                        className="px-4 py-2 bg-black/30 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
                    >
                        <option value="">All Types</option>
                        {LOG_TYPES.map((type) => (
                            <option key={type} value={type}>
                                {type}
                            </option>
                        ))}
                    </select>

                    {/* Branch Filter */}
                    <div className="w-64">
                        <BranchSelector
                            value={filters.branchId}
                            onChange={(branchId) => setFilters((f) => ({ ...f, branchId }))}
                            placeholder="All Branches"
                        />
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                    {/* Date Range */}
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                            className="px-4 py-2 bg-black/30 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
                        />
                        <span className="text-white/60">to</span>
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                            className="px-4 py-2 bg-black/30 border border-white/20 rounded-md text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>

                    {/* Clear Filters */}
                    {hasActiveFilters && (
                        <button
                            onClick={handleClearFilters}
                            className="flex items-center gap-2 px-4 py-2 text-white/60 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                        >
                            <X className="w-4 h-4" />
                            Clear Filters
                        </button>
                    )}
                </div>
            </div>

            {/* Results Info */}
            <div className="flex items-center justify-between text-sm text-white/60">
                <span>
                    Showing {logs.length} of {total} logs
                </span>
                {hasActiveFilters && <span>Filters applied</span>}
            </div>

            {/* Logs Table */}
            <div className="overflow-x-auto flex-1 rounded-lg border border-white/10">
                <table className="w-full">
                    <thead className="bg-white/5">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-white/60">Timestamp</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-white/60">Level</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-white/60">Type</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-white/60">User</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-white/60">Branch</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-white/60">Message</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                        <AnimatePresence>
                            {logs.map((log, index) => (
                                <motion.tr
                                    key={log.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2, delay: index * 0.02 }}
                                    className="hover:bg-white/5"
                                >
                                    <td className="px-4 py-3 text-sm text-white/80 whitespace-nowrap">
                                        {formatDate(log.date)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`inline-flex px-2 py-1 text-xs font-medium rounded border ${LEVEL_COLORS[log.level]}`}
                                        >
                                            {log.level}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white/80">{log.type}</td>
                                    <td className="px-4 py-3 text-sm text-white/80">
                                        {log.user_name || log.user_id || "System"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white/80">
                                        {log.branch_name || log.branch_id || "-"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white/60 max-w-md truncate" title={log.message}>
                                        {log.message || "-"}
                                    </td>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    </tbody>
                </table>

                {logs.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center py-12 text-white/40">
                        <FileText className="w-12 h-12 mb-4 opacity-30" />
                        <p>No logs found</p>
                        {hasActiveFilters && <p className="text-sm mt-1">Try adjusting your filters</p>}
                    </div>
                )}

                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="w-8 h-8 animate-spin text-white/40" />
                    </div>
                )}
            </div>

            {/* Pagination */}
            {total > 0 && (
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1 || loading}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                    >
                        Previous
                    </button>
                    <span className="text-sm text-white/60">
                        Page {page} of {Math.ceil(total / LOGS_PAGE_SIZE)}
                    </span>
                    <button
                        onClick={() => setPage((p) => p + 1)}
                        disabled={!hasMore || loading}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                    >
                        Next
                    </button>
                </div>
            )}
        </PageWrapper>
    )
}
