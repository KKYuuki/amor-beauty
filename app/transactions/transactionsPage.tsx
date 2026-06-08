"use client"

import { useCallback, useContext, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
    SearchIcon,
    LoaderCircleIcon,
    FileTextIcon,
    RefreshCwIcon,
    CalendarIcon,
    DownloadIcon,
    ChevronDownIcon,
    ReceiptIcon,
} from "lucide-react"
import PageHeader from "@/components/ui/PageHeader"
import FilterBar from "@/components/ui/FilterBar"
import { NotificationContext } from "@/components/notifications"
import { Transaction } from "@/utils/types/transactions"
import {
    getTransactions,
    DateFilterPreset,
    TransactionFilters,
    exportTransactions,
} from "@/server/actions/transactions"
import { getSetting } from "@/server/actions/settings"
import { ExportFormat } from "@/utils/export-utils"
import { getDateRangeFromPreset, DateRangePreset } from "@/utils/date-utils"

const currentBranch: any = null;


const PAGE_SIZE = 30

export default function TransactionsPageClient() {
    const router = useRouter()
    const { addNotification } = useContext(NotificationContext)

    // Data State
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [searchQueryDebounced, setSearchQueryDebounced] = useState("")
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
    const [currencySymbol, setCurrencySymbol] = useState("$")

    // Debounce search query
    useEffect(() => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = setTimeout(() => {
            setSearchQueryDebounced(searchQuery)
        }, 300)
        return () => {
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
        }
    }, [searchQuery])

    // Pagination State
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const totalPages = Math.ceil(total / PAGE_SIZE)

    // Date Filter State
    const [datePreset, setDatePreset] = useState<DateFilterPreset>("all")
    const [customStartDate, setCustomStartDate] = useState("")
    const [customEndDate, setCustomEndDate] = useState("")

    // Status Filter State
    const [statusFilter, setStatusFilter] = useState<TransactionFilters['status'] | ''>('')

    // Branch Context
    

    // Refs
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // Export State
    const [exporting, setExporting] = useState(false)
    const [showExportMenu, setShowExportMenu] = useState(false)
    const exportMenuRef = useRef<HTMLDivElement>(null)

    // --- Helper to build filters ---
    const buildFilters = useCallback((): TransactionFilters => {
        return {
            datePreset,
            startDate: datePreset === "custom" ? customStartDate : undefined,
            endDate: datePreset === "custom" ? customEndDate : undefined,
            search: searchQueryDebounced || undefined,
            status: (statusFilter || undefined) as TransactionFilters['status'],
            branchId: currentBranch?.id || undefined,
        }
    }, [datePreset, customStartDate, customEndDate, searchQueryDebounced, statusFilter, currentBranch])

    // --- Currency Fetch (cached, runs once on mount) ---
    useEffect(() => {
        const fetchCurrency = async () => {
            const taxData = await getSetting("currency_tax")
            if (taxData.success && taxData.data) {
                setCurrencySymbol(taxData.data.currency_symbol)
            }
        }
        fetchCurrency()
    }, [])

    // --- Initial Data Fetching ---

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const filters = buildFilters()
            const txnResult = await getTransactions({ page, pageSize: PAGE_SIZE, filters })

            if (txnResult.success && txnResult.data) {
                setTransactions(txnResult.data.data)
                setTotal(txnResult.data.total)
            }
        } catch (error) {
            console.error("Error fetching transactions:", error)
            addNotification("Failed to load transactions", "ERROR")
        } finally {
            setLoading(false)
        }
    }, [addNotification, buildFilters, page])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Reset to page 1 when filters change
    useEffect(() => {
        setPage(1)
    }, [datePreset, customStartDate, customEndDate, searchQueryDebounced, statusFilter])

    // Reset status filter on mount
    useEffect(() => {
        setStatusFilter('')
        setCustomStartDate('')
        setCustomEndDate('')
    }, [])



    // --- Export Handler ---

    const handleExport = async (format: ExportFormat) => {
        setShowExportMenu(false)
        setExporting(true)
        try {
            const filters = buildFilters()
            const result = await exportTransactions({ format, filters })

            if (!result.success || !result.data || !result.data.data) {
                addNotification(result.success ? "Export failed" : result.error || "Export failed", "ERROR")
                return
            }

            // Decode base64 and trigger download
            const binaryString = atob(result.data.data)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
            }
            const blob = new Blob([bytes], { type: result.data.mimeType })
            const url = URL.createObjectURL(blob)

            const link = document.createElement("a")
            link.href = url
            link.download = result.data.filename || `transactions.${format}`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)

            addNotification(
                `Exported ${transactions.length > 0 ? "transactions" : "data"} as ${format.toUpperCase()}`,
                "SUCCESS"
            )
        } catch (error) {
            console.error("Export error:", error)
            addNotification(
                "An unexpected error occurred during export",
                "ERROR"
            )
        } finally {
            setExporting(false)
        }
    }

    // Close export menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                exportMenuRef.current &&
                !exportMenuRef.current.contains(event.target as Node)
            ) {
                setShowExportMenu(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () =>
            document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    return (
        <div className='flex-1 w-full flex flex-col h-full overflow-hidden'>
            <PageHeader
                title="Transactions"
                description="View and manage your transaction history"
                icon={<FileTextIcon className='w-6 h-6' />}
                actions={
                    <>
                        <div className='relative' ref={exportMenuRef}>
                            <button
                                onClick={() =>
                                    setShowExportMenu(!showExportMenu)
                                }
                                disabled={
                                    loading ||
                                    exporting ||
                                    transactions.length === 0
                                }
                                className='flex items-center gap-1.5 px-2 md:px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2 border-blue-500/30 cursor-pointer'
                                title='Export transactions'
                            >
                                {exporting ? (
                                    <LoaderCircleIcon className='w-4 h-4 animate-spin' />
                                ) : (
                                    <DownloadIcon className='w-4 h-4' />
                                )}
                                <span className='text-sm font-medium hidden sm:inline'>
                                    Export
                                </span>
                                <ChevronDownIcon className='w-4 h-4' />
                            </button>
                            {showExportMenu && (
                                <div className='absolute right-0 top-full mt-1 w-40 bg-card border border-border rounded-md shadow-lg z-50 overflow-hidden'>
                                    <button
                                        onClick={() => handleExport("csv")}
                                        className='w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors cursor-pointer flex items-center gap-2'
                                    >
                                        <span className='text-green-400 font-mono text-xs'>CSV</span>
                                        <span className='text-muted-foreground'>Spreadsheet</span>
                                    </button>
                                    <button
                                        onClick={() => handleExport("excel")}
                                        className='w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors cursor-pointer flex items-center gap-2'
                                    >
                                        <span className='text-emerald-400 font-mono text-xs'>XLSX</span>
                                        <span className='text-muted-foreground'>Excel</span>
                                    </button>
                                    <button
                                        onClick={() => handleExport("pdf")}
                                        className='w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors cursor-pointer flex items-center gap-2'
                                    >
                                        <span className='text-red-400 font-mono text-xs'>PDF</span>
                                        <span className='text-muted-foreground'>Report</span>
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className='p-2 bg-card hover:bg-muted rounded-md transition-colors disabled:opacity-50 border-2 border-border cursor-pointer'
                            title='Refresh'
                        >
                            <RefreshCwIcon
                                className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
                            />
                        </button>
                    </>
                }
            />

            <div className='mb-4 mt-4'>
                {/* Search Bar */}
                <div className='relative w-full'>
                    <SearchIcon className='absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 w-5 h-5' />
                    <input
                        type='text'
                        placeholder='Filter by number, staff, or buyer...'
                        className='w-full pl-10 pr-4 py-2 bg-card rounded-md border-2 border-border focus:border-border outline-none transition-all text-foreground placeholder:text-muted-foreground/70'
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Status Filter */}
                <div className='flex items-center gap-2 flex-wrap mt-3'>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as TransactionFilters['status'] | '')}
                        className='bg-card hover:bg-muted transition-colors px-3 py-1 rounded-md text-sm cursor-pointer border-2 border-border'
                    >
                        <option value=''>All Statuses</option>
                        <option value='COMPLETED'>Completed</option>
                        <option value='PARTIAL'>Partial</option>
                        <option value='VOIDED'>Voided</option>
                        <option value='REFUNDED'>Refunded</option>
                    </select>
                </div>

                {/* Date Filters */}
                <FilterBar className='mt-4'>
                    <div className='flex items-center gap-2 flex-wrap'>
                        <CalendarIcon className='w-4 h-4 text-muted-foreground' />
                        <span className='text-sm text-muted-foreground font-medium'>
                            Filter by date:
                        </span>
                        <select
                            value={datePreset}
                            onChange={(e) =>
                                setDatePreset(
                                    e.target.value as DateFilterPreset
                                )
                            }
                            className='bg-card hover:bg-muted transition-colors px-3 py-1 rounded-md text-sm cursor-pointer border-2 border-border'
                        >
                            {(
                                [
                                    { key: "all", label: "All Time" },
                                    {
                                        key: "today",
                                        label: `Today (${getDateRangeFromPreset("today")?.label})`,
                                    },
                                    {
                                        key: "this_week",
                                        label: `This Week (${getDateRangeFromPreset("this_week")?.label})`,
                                    },
                                    {
                                        key: "this_month",
                                        label: `This Month (${getDateRangeFromPreset("this_month")?.label})`,
                                    },
                                    {
                                        key: "this_year",
                                        label: `This Year (${getDateRangeFromPreset("this_year")?.label})`,
                                    },
                                    {
                                        key: "last_year",
                                        label: `Last Year (${getDateRangeFromPreset("last_year")?.label})`,
                                    },
                                    { key: "custom", label: "Custom Range" },
                                ] as { key: DateRangePreset; label: string }[]
                            ).map((preset) => (
                                <option
                                    key={preset.key}
                                    value={preset.key}
                                >
                                    {preset.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Custom Date Range */}
                    {datePreset === "custom" && (
                        <div className='flex items-center gap-3 flex-wrap'>
                            <div className='flex items-center gap-2'>
                                <label className='text-sm text-muted-foreground'>
                                    From:
                                </label>
                                <input
                                    type='date'
                                    value={customStartDate}
                                    onChange={(e) =>
                                        setCustomStartDate(e.target.value)
                                    }
                                    className='px-3 py-1 bg-card border-2 border-border rounded-md text-sm focus:border-border outline-none'
                                />
                            </div>
                            <div className='flex items-center gap-2'>
                                <label className='text-sm text-muted-foreground'>
                                    To:
                                </label>
                                <input
                                    type='date'
                                    value={customEndDate}
                                    onChange={(e) =>
                                        setCustomEndDate(e.target.value)
                                    }
                                    className='px-3 py-1 bg-card border-2 border-border rounded-md text-sm focus:border-border outline-none'
                                />
                            </div>
                            <button
                                onClick={fetchData}
                                disabled={!customStartDate || !customEndDate}
                                className='px-4 py-1 bg-blue-300/30 hover:bg-blue-300/50 text-foreground text-sm font-bold rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-2 border-border cursor-pointer'
                            >
                                Apply
                            </button>
                        </div>
                    )}
                </FilterBar>
            </div>

            {/* Transactions List */}
            <div
                ref={scrollContainerRef}
                className='flex-1 overflow-auto'
            >
                <table className='min-w-max w-full h-max table-auto border-collapse relative'>
                    <thead className='sticky top-0 bg-black/80'>
                        <tr className='text-nowrap select-none'>
                            <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                Date & Time
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                Transaction #
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                Staff
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                Customer
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                Items
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                Total
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                Payment
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                Reference #
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                Type
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                Status
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td
                                    colSpan={10}
                                    className='px-4 py-12 text-center text-muted-foreground'
                                >
                                    <div className='flex flex-col items-center justify-center gap-2'>
                                        <LoaderCircleIcon className='w-8 h-8 animate-spin' />
                                        <p>Loading Transactions...</p>
                                    </div>
                                </td>
                            </tr>
                        ) : transactions.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={10}
                                    className='px-4 py-12 text-center text-muted-foreground'
                                >
                                    <div className='flex flex-col items-center justify-center gap-2'>
                                        <ReceiptIcon className='w-8 h-8 opacity-20' />
                                        <p className='text-sm'>No transactions found</p>
                                        <p className='text-xs text-muted-foreground/70'>Sales processed in the Sales page will appear here</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            transactions.map((txn) => (
                                <tr
                                    key={txn.id}
                                    onClick={() => router.push(`/transactions/${txn.id}`)}
                                    className='hover:bg-muted transition-colors text-nowrap cursor-pointer'
                                >
                                    <td className='px-3 py-1 text-sm font-medium w-max'>
                                        <div className='text-foreground'>
                                            {new Date(
                                                txn.created_at
                                            ).toLocaleDateString()}
                                        </div>
                                        <div className='text-xs text-muted-foreground'>
                                            {new Date(
                                                txn.created_at
                                            ).toLocaleTimeString([], {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </div>
                                    </td>
                                    <td className='px-3 py-1 text-sm font-medium w-max uppercase font-mono'>
                                        {txn.transaction_number}
                                    </td>
                                    <td className='px-3 py-1 text-sm font-medium w-max capitalize'>
                                        {txn.staff?.full_name || "Unknown"}
                                    </td>
                                    <td className='px-3 py-1 text-sm font-medium w-max capitalize'>
                                        {txn.buyer?.full_name ||
                                            txn.buyer_name ||
                                            "Walk-in"}
                                    </td>
                                    <td className='px-3 py-1 text-sm font-medium w-max text-center'>
                                        <span className='px-2 py-0.5 bg-card rounded text-xs border border-border'>
                                            {txn.items?.length || 0} items
                                        </span>
                                    </td>
                                    <td className='px-3 py-1 text-sm font-bold w-max text-green-400'>
                                        {currencySymbol}
                                        {txn.total.toFixed(2)}
                                    </td>
                                    <td className='px-3 py-1 text-sm font-medium w-max'>
                                        <span className='px-2 py-0.5 bg-card rounded text-xs border border-border'>
                                            {txn.payment_method}
                                        </span>
                                    </td>
                                    <td className='px-3 py-1 text-sm font-medium w-max font-mono text-muted-foreground'>
                                        {txn.reference_number || "-"}
                                    </td>
                                    <td className='px-3 py-1 text-sm font-medium w-max'>
                                        {txn.client_type ? (
                                            <span
                                                className={`px-2 py-0.5 rounded-xs text-xs font-semibold border-2 border-border ${
                                                    txn.client_type === 'PERSONAL'
                                                        ? 'bg-purple-400/20 text-purple-300'
                                                        : 'bg-cyan-400/20 text-cyan-300'
                                                }`}
                                            >
                                                {txn.client_type === 'PERSONAL' ? 'Personal' : 'Walk-in'}
                                            </span>
                                        ) : (
                                            <span className='text-muted-foreground/70 text-xs'>—</span>
                                        )}
                                    </td>
                                    <td className='px-3 py-1 text-sm font-medium w-max'>
                                        <span
                                            className={`px-2 py-0.5 rounded-sm text-xs font-semibold border-2 border-border ${
                                                txn.status === "COMPLETED"
                                                    ? "bg-green-400/20 text-green-300"
                                                    : txn.status === "VOIDED"
                                                      ? "bg-red-400/20 text-red-300"
                                                      : "bg-card text-foreground"
                                            }`}
                                        >
                                            {txn.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className='flex items-center justify-between py-4 border-t border-border'>
                    <p className='text-sm text-muted-foreground'>
                        Showing {(page - 1) * PAGE_SIZE + 1} -{" "}
                        {Math.min(page * PAGE_SIZE, total)} of {total}
                    </p>
                    <div className='flex items-center gap-2'>
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className='px-3 py-1 bg-card hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer'
                        >
                            Previous
                        </button>
                        <span className='text-sm text-muted-foreground'>
                            Page {page} of {totalPages}
                        </span>
                        <button
                            onClick={() =>
                                setPage((p) => Math.min(totalPages, p + 1))
                            }
                            disabled={page === totalPages}
                            className='px-3 py-1 bg-card hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer'
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
