import NextImage from "next/image"

import { useCallback, useContext, useEffect, useRef, useState } from "react"
import {
    getBusinessInsightsMetrics,
    exportMetrics,
    type BusinessInsightsMetrics,
} from "@/server/actions/metrics"
import { getLedgerSummary, LedgerSummary } from "@/server/actions/accounting"
import { createLogs } from "@/server/actions/logs"

import {
    getPayrollDashboardSummary,
    PayrollDashboardSummary,
    getStaffPayrollSummary,
} from "@/server/actions/payroll"
import { ACCOUNTING_PAYMENT_METHODS, AccountingPaymentMethod } from "@/utils/types/payment"
import {
    BanknoteIcon,
    CalendarCheckIcon,
    CalendarXIcon,
    LoaderCircleIcon,
    TrendingUpIcon,

    UsersIcon,
    DownloadIcon,
    ChevronDownIcon,
    BookOpenIcon,
    WalletIcon,
    TrophyIcon,
} from "lucide-react"
import TimeframeSelector from "@/components/ui/TimeframeSelector"
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    Legend,
} from "recharts"
import { MetricsExportFormat } from "@/utils/metrics-export-utils"
import { NotificationContext } from "@/components/notifications"
import { DateRangePreset, getDateRangeFromPreset } from "@/utils/date-utils"
import { BusinessInsightsSkeleton } from "./BusinessInsightsSkeleton"
import MetricCard from "@/components/ui/MetricCard"

interface BusinessInsightsProps {
    branchId?: string
    currencySymbol?: string
}

export default function BusinessInsights({ branchId, currencySymbol: propCurrencySymbol }: BusinessInsightsProps) {
    const { addNotification } = useContext(NotificationContext)

    const [loading, setLoading] = useState(true)
    const [initialLoad, setInitialLoad] = useState(true)
    const [timeframe, setTimeframe] = useState<DateRangePreset>("this_week")
    const [dateRangeStr, setDateRangeStr] = useState("")
    const [paymentMethodFilter, setPaymentMethodFilter] = useState<AccountingPaymentMethod | "">("")

    // Custom date range state
    const [customStartDate, setCustomStartDate] = useState<string>("")
    const [customEndDate, setCustomEndDate] = useState<string>("")

    const [financials, setFinancials] = useState<BusinessInsightsMetrics['financials'] | null>(null)
    const [revenueTrend, setRevenueTrend] = useState<BusinessInsightsMetrics['revenueTrend']>([])
    const [operations, setOperations] = useState<BusinessInsightsMetrics['operations'] | null>(
        null
    )
    const [inventory, setInventory] = useState<BusinessInsightsMetrics['inventory'] | null>(null)

    // Export state
    const [exporting, setExporting] = useState(false)
    const [showExportMenu, setShowExportMenu] = useState(false)
    const exportMenuRef = useRef<HTMLDivElement>(null)

    // Accounting & Payroll state
    const [accountingSummary, setAccountingSummary] =
        useState<LedgerSummary | null>(null)
    const [payrollSummary, setPayrollSummary] =
        useState<PayrollDashboardSummary | null>(null)
    const [artistEarnings, setArtistEarnings] = useState<
        {
            staff_id: string
            full_name: string
            avatar_url?: string
            pending_amount: number
            pending_count: number
        }[]
    >([])

    // New metrics state
    const [netIncome, setNetIncome] = useState<BusinessInsightsMetrics['netIncome'] | null>(null)
    const [clientTypes, setClientTypes] = useState<BusinessInsightsMetrics['clientTypes'] | null>(
        null
    )
    const [staffLeaderboard, setStaffLeaderboard] = useState<
        BusinessInsightsMetrics['staffLeaderboard']
    >([])
    const [leaderboardExpanded, setLeaderboardExpanded] = useState(false)

    const currencySymbol = propCurrencySymbol ?? ""

    const fetchData = useCallback(async () => {
        setLoading(true)

        // For custom range, validate dates first
        if (timeframe === "custom") {
            if (!customStartDate || !customEndDate) {
                setLoading(false)
                return
            }
            if (new Date(customStartDate) > new Date(customEndDate)) {
                addNotification("Start date must be before end date", "ERROR")
                setLoading(false)
                return
            }
        }

        const range = getDateRangeFromPreset(
            timeframe,
            customStartDate,
            customEndDate
        )
        if (!range) {
            setLoading(false)
            return
        }

        setDateRangeStr(range.label)

        const startDate = range.start.toISOString()
        const endDate = range.end.toISOString()

        // Determine groupBy based on date range span
        const daysDiff = Math.ceil(
            (range.end.getTime() - range.start.getTime()) /
                (1000 * 60 * 60 * 24)
        )
        const groupBy = daysDiff > 90 ? "month" : "day"

        const [
            insightsResult,
            ledgerResult,
            payrollResult,
            payrollStaffResult,
        ] = await Promise.allSettled([
            getBusinessInsightsMetrics(startDate, endDate, groupBy, branchId, paymentMethodFilter || undefined),
            getLedgerSummary(timeframe, startDate, endDate, branchId, { payment_method: paymentMethodFilter || undefined }),
            getPayrollDashboardSummary(branchId ?? null),
            getStaffPayrollSummary(branchId ?? null),
        ])

        if (insightsResult.status === "fulfilled" && insightsResult.value.success) {
            const data = insightsResult.value.data
            setFinancials(data.financials)
            setRevenueTrend(data.revenueTrend)
            setOperations(data.operations)
            setInventory(data.inventory)
            setNetIncome(data.netIncome)
            setClientTypes(data.clientTypes)
            setStaffLeaderboard(data.staffLeaderboard)
        } else if (insightsResult.status === "rejected") {
            addNotification("Failed to fetch business insights", "ERROR")
        } else if (insightsResult.status === "fulfilled" && !insightsResult.value.success) {
            addNotification(insightsResult.value.error || "Failed to fetch business insights", "ERROR")
        }

        if (ledgerResult.status === "fulfilled" && ledgerResult.value.success && ledgerResult.value.data) {
            setAccountingSummary(ledgerResult.value.data)
        }

        if (payrollResult.status === "fulfilled" && payrollResult.value.success && payrollResult.value.data) {
            setPayrollSummary(payrollResult.value.data)
        }

        if (payrollStaffResult.status === "fulfilled" && payrollStaffResult.value.success) {
            setArtistEarnings(payrollStaffResult.value.data)
        }

        const failedCalls: string[] = []
        if (ledgerResult.status === "rejected") failedCalls.push("Accounting Summary")
        if (payrollResult.status === "rejected") failedCalls.push("Payroll Summary")
        if (payrollStaffResult.status === "rejected") failedCalls.push("Artist Earnings")

        if (insightsResult.status === "rejected") {
            addNotification("Failed to load core metrics. Please try again.", "ERROR")
        } else if (failedCalls.length > 0) {
            addNotification(`Some data unavailable: ${failedCalls.join(", ")}`, "WARNING")
        }

        setLoading(false)
        setInitialLoad(false)
    }, [timeframe, customStartDate, customEndDate, addNotification, branchId, paymentMethodFilter])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Export handler
    const handleExport = async (format: MetricsExportFormat) => {
        setShowExportMenu(false)
        setExporting(true)
        try {
            const range = getDateRangeFromPreset(
                timeframe,
                customStartDate,
                customEndDate
            )
            if (!range) {
                addNotification("Invalid timeframe selected", "ERROR")
                setExporting(false)
                return
            }
            // Determine groupBy based on date range span
            const daysDiff = Math.ceil(
                (range.end.getTime() - range.start.getTime()) /
                    (1000 * 60 * 60 * 24)
            )
            const groupBy = daysDiff > 90 ? "month" : "day"

            const result = await exportMetrics(
                format,
                range.start.toISOString(),
                range.end.toISOString(),
                groupBy,
                branchId
            )

            if (!result.success) {
                addNotification(result.error || "Export failed", "ERROR")
                return
            }

            if (!result.data) {
                addNotification("Export failed", "ERROR")
                return
            }

            // Decode base64 and trigger download
            const binaryString = atob(result.data.data!)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
            }
            const blob = new Blob([bytes], { type: result.data.mimeType! })
            const url = URL.createObjectURL(blob)

            const link = document.createElement("a")
            link.href = url
            link.download = result.data.filename || `metrics.${format}`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)

            addNotification(
                `Exported metrics as ${format.toUpperCase()}`,
                "SUCCESS"
            )
        } catch (error) {
            createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Export error: ${error instanceof Error ? error.message : String(error)}` }] })
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

    if (initialLoad) {
        return <BusinessInsightsSkeleton />
    }

    return (
        <div className='w-full flex flex-col gap-6 pb-10'>
            {/* Header with Export Button */}
            <div className='flex flex-row justify-between items-center'>
                <h1 className='text-2xl font-bold'>Business Insights</h1>
                <div
                    className='relative'
                    ref={exportMenuRef}
                >
                    <button
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        disabled={loading || exporting}
                        className='flex items-center gap-1.5 px-2 sm:px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2 border-blue-500/30 cursor-pointer'
                        title='Export metrics'
                    >
                        {exporting ? (
                            <LoaderCircleIcon className='w-4 h-4 animate-spin' />
                        ) : (
                            <DownloadIcon className='w-4 h-4' />
                        )}
                        <span className='text-sm font-medium hidden sm:inline'>Export</span>
                        <ChevronDownIcon className='w-4 h-4 hidden sm:inline' />
                    </button>

                    {showExportMenu && (
                        <div className='absolute right-0 top-full mt-1 w-40 bg-zinc-900 border border-white/10 rounded-md shadow-lg z-50 overflow-hidden'>
                            <button
                                onClick={() => handleExport("csv")}
                                className='w-full px-4 py-2 text-left text-sm hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-2'
                            >
                                <span className='text-green-400 font-mono text-xs'>
                                    CSV
                                </span>
                                <span className='text-white/60'>
                                    Spreadsheet
                                </span>
                            </button>
                            <button
                                disabled={!timeframe}
                                className='w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                            >
                                <span className='text-emerald-400 font-mono text-xs'>
                                    XLSX
                                </span>
                                <span className='text-white/60'>Excel</span>
                            </button>
                            <button
                                disabled={!timeframe}
                                className='w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                            >
                                <span className='text-red-400 font-mono text-xs'>
                                    PDF
                                </span>
                                <span className='text-white/60'>Report</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Timeframe Selector */}
            <TimeframeSelector
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
                onCustomStartDateChange={setCustomStartDate}
                onCustomEndDateChange={setCustomEndDate}
                dateRangeStr={dateRangeStr}
            />

            {/* Payment Method Filter */}
            <div className='flex items-center gap-3'>
                <span className='text-sm text-white/60'>Filter:</span>
                <select
                    value={paymentMethodFilter}
                    onChange={(e) => setPaymentMethodFilter(e.target.value as AccountingPaymentMethod | "")}
                    className='bg-white/10 px-3 py-1.5 rounded text-sm border border-white/10'
                >
                    <option value="">All Methods</option>
                    {ACCOUNTING_PAYMENT_METHODS.map(m => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                </select>
            </div>

            {/* Financials Section */}
            <section className='flex flex-col gap-4'>
                <h2 className='text-xl font-bold flex items-center gap-2'>
                    <BanknoteIcon className='text-green-400' /> Financial
                    Performance
                </h2>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <MetricCard
                        title='Total Revenue'
                        value={financials?.revenue}
                        format='currency'
                        currencySymbol={currencySymbol}
                        icon={<BanknoteIcon className='text-green-400' />}
                    />
                    <MetricCard
                        title='Total Transactions'
                        value={financials?.transactions}
                        format='number'
                        icon={
                            <CalendarCheckIcon
                                className='text-white/40'
                                size={20}
                            />
                        }
                    />
                    <MetricCard
                        title='Avg. Transaction Value'
                        value={financials?.averageTicket}
                        format='currency'
                        currencySymbol={currencySymbol}
                        icon={
                            <TrendingUpIcon
                                className='text-white/40'
                                size={20}
                            />
                        }
                    />
                </div>

                {/* Revenue Chart */}
                <div className='w-full h-60 sm:h-80 bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-2'>
                    <h3 className='font-semibold text-white/60 text-sm'>
                        Revenue Trend ({dateRangeStr})
                    </h3>
                    <ResponsiveContainer
                        width='100%'
                        height='100%'
                    >
                        {timeframe === "this_year" ||
                        timeframe === "last_year" ? (
                            <LineChart data={revenueTrend}>
                                <CartesianGrid
                                    strokeDasharray='3 3'
                                    stroke='#ffffff20'
                                    vertical={false}
                                />
                                <XAxis
                                    dataKey='date'
                                    stroke='#ffffff60'
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke='#ffffff60'
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value: number) =>
                                        `${currencySymbol}${value}`
                                    }
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#0a0a0a",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "8px",
                                    }}
                                    itemStyle={{ color: "#fff" }}
                                    formatter={(value: number) => [
                                        `${currencySymbol}${value.toLocaleString()}`,
                                        "Revenue",
                                    ]}
                                />
                                <Line
                                    type='monotone'
                                    dataKey='revenue'
                                    stroke='#4ade80'
                                    strokeWidth={2}
                                    dot={{
                                        fill: "#4ade80",
                                        strokeWidth: 0,
                                        r: 4,
                                    }}
                                    activeDot={{ r: 6, fill: "#4ade80" }}
                                />
                            </LineChart>
                        ) : (
                            <BarChart data={revenueTrend}>
                                <CartesianGrid
                                    strokeDasharray='3 3'
                                    stroke='#ffffff20'
                                    vertical={false}
                                />
                                <XAxis
                                    dataKey='date'
                                    stroke='#ffffff60'
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke='#ffffff60'
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value: number) =>
                                        `${currencySymbol}${value}`
                                    }
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#0a0a0a",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "8px",
                                    }}
                                    itemStyle={{ color: "#fff" }}
                                    formatter={(value: number) => [
                                        `${currencySymbol}${value.toLocaleString()}`,
                                        "Revenue",
                                    ]}
                                />
                                <Bar
                                    dataKey='revenue'
                                    fill='#4ade80'
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </div>

                {/* Net Income Card */}
                {netIncome && (
                    <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mt-4'>
                        <MetricCard
                            title='Gross Revenue'
                            value={netIncome.revenue}
                            format='currency'
                            currencySymbol={currencySymbol}
                            icon={<TrendingUpIcon className='text-green-400' />}
                        />
                        <MetricCard
                            title='Total Expenses'
                            value={netIncome.expenses}
                            format='currency'
                            currencySymbol={currencySymbol}
                            icon={<CalendarXIcon className='text-red-400' />}
                        />
                        <MetricCard
                            title='Net Income'
                            value={netIncome.netIncome}
                            format='currency'
                            currencySymbol={currencySymbol}
                            icon={
                                <BanknoteIcon
                                    className={
                                        netIncome.netIncome >= 0
                                            ? "text-green-400"
                                            : "text-red-400"
                                    }
                                />
                            }
                        />
                    </div>
                )}
            </section>

            {/* Client Sources Section */}
            <section className='flex flex-col gap-4'>
                <h2 className='text-xl font-bold flex items-center gap-2'>
                    <UsersIcon className='text-blue-400' /> Client Sources
                </h2>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div className='grid grid-cols-2 gap-4'>
                        <MetricCard
                            title='Walk-in Clients'
                            value={clientTypes?.walkinCount ?? 0}
                            format='number'
                            icon={<UsersIcon className='text-orange-400' />}
                        />
                        <MetricCard
                            title='Personal Clients'
                            value={clientTypes?.personalCount ?? 0}
                            format='number'
                            icon={<UsersIcon className='text-purple-400' />}
                        />
                    </div>
                    <div className='bg-white/5 border-2 border-white/5 rounded-xl p-4'>
                        <h3 className='font-semibold text-white/60 text-sm mb-2'>
                            Client Type Distribution
                        </h3>
                        <ResponsiveContainer
                            width='100%'
                            height={140}
                        >
                            <PieChart>
                                <Pie
                                    data={[
                                        {
                                            name: "Walk-in",
                                            value:
                                                clientTypes?.walkinCount ?? 0,
                                        },
                                        {
                                            name: "Personal",
                                            value:
                                                clientTypes?.personalCount ?? 0,
                                        },
                                    ]}
                                    cx='50%'
                                    cy='50%'
                                    innerRadius={35}
                                    outerRadius={55}
                                    paddingAngle={5}
                                    dataKey='value'
                                >
                                    <Cell fill='#f97316' />
                                    <Cell fill='#a855f7' />
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#0a0a0a",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "8px",
                                    }}
                                    itemStyle={{ color: "#fff" }}
                                />
                                <Legend
                                    wrapperStyle={{ fontSize: "11px" }}
                                    formatter={(value) => (
                                        <span className='text-white/60'>{value}</span>
                                    )}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>

            {/* Artist Leaderboard Section */}
            <section className='flex flex-col gap-4'>
                <h2 className='text-xl font-bold flex items-center gap-2'>
                    <TrophyIcon className='text-yellow-400' /> Artist
                    Leaderboard (Earnings)
                </h2>
                {staffLeaderboard.length === 0 ? (
                    <div className='bg-white/5 rounded-xl p-6 text-center text-white/40'>
                        No staff data available for this period
                    </div>
                ) : (
                    <div className='space-y-2'>
                        {(leaderboardExpanded ? staffLeaderboard : staffLeaderboard.slice(0, 5)).map((staff, index) => (
                            <div
                                key={staff.staff_id}
                                className={`bg-white/5 hover:bg-white/10 rounded-lg p-3 sm:p-4 flex items-center justify-between gap-2 transition-colors ${
                                    index === 0
                                        ? "border border-yellow-500/30 bg-yellow-500/10"
                                        : ""
                                }`}
                            >
                                <div className='flex items-center gap-2 sm:gap-3 min-w-0'>
                                    <span className={`shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold ${
                                        index === 0 ? "bg-yellow-500 text-black" :
                                        index === 1 ? "bg-gray-400 text-black" :
                                        index === 2 ? "bg-orange-700 text-white" :
                                        "bg-white/20 text-white"
                                    }`}>
                                        {index + 1}
                                    </span>
                                    <div className='shrink-0 w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-full flex items-center justify-center text-white font-bold overflow-hidden'>
                                        {staff.avatar_url ? (
                                            <NextImage
                                                src={staff.avatar_url}
                                                alt={staff.full_name}
                                                width={40}
                                                height={40}
                                                className='w-full h-full object-cover'
                                            />
                                        ) : (
                                            staff.full_name.charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <div className='flex flex-col min-w-0'>
                                        <span className='font-medium text-sm sm:text-base truncate'>{staff.full_name}</span>
                                        <span className='text-xs text-white/40'>
                                            {staff.appointment_count} appts
                                        </span>
                                    </div>
                                </div>
                                <div className='flex flex-col items-end shrink-0'>
                                    <span className='text-sm sm:text-lg font-bold text-green-400'>
                                        {currencySymbol}{staff.total_staff_cut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                    <span className='text-xs text-white/40 hidden sm:block'>
                                        of {currencySymbol}{staff.total_gross.toLocaleString(undefined, { minimumFractionDigits: 2 })} total
                                    </span>
                                </div>
                            </div>
                        ))}
                        {staffLeaderboard.length > 5 && (
                            <button
                                onClick={() => setLeaderboardExpanded(!leaderboardExpanded)}
                                className='w-full py-2 text-sm text-white/40 hover:text-white/60 transition-colors cursor-pointer'
                            >
                                {leaderboardExpanded ? 'Show Less' : `Show ${staffLeaderboard.length - 5} More`}
                            </button>
                        )}
                    </div>
                )}
            </section>

            {/* Operations Section */}
            <section className='flex flex-col gap-4'>
                <h2 className='text-xl font-bold flex items-center gap-2'>
                    <TrendingUpIcon className='text-blue-400' /> Operational
                    Health
                </h2>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <MetricCard
                        title='Total Appointments (Month)'
                        value={operations?.totalAppointments}
                        icon={
                            <CalendarCheckIcon
                                size={20}
                                className='text-white/40'
                            />
                        }
                    />
                    <MetricCard
                        title='Completed Appointments'
                        value={operations?.completedAppointments}
                        icon={
                            <CalendarCheckIcon
                                size={20}
                                className='text-green-400/40'
                            />
                        }
                    />
                    <MetricCard
                        title='Cancellation Rate'
                        value={operations?.cancellationRate}
                        format='percent'
                        icon={
                            <CalendarXIcon
                                size={20}
                                className='text-red-400/40'
                            />
                        }
                    />
                </div>
            </section>

            {/* Accounting Summary Section */}
            {accountingSummary && (
                <section className='flex flex-col gap-4'>
                    <h2 className='text-xl font-bold flex items-center gap-2'>
                        <BookOpenIcon className='text-purple-400' /> Accounting
                        Summary
                    </h2>
                    <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                        <MetricCard
                            title='Total Debits'
                            value={accountingSummary.total_debit}
                            format='currency'
                            currencySymbol={currencySymbol}
                            icon={
                                <TrendingUpIcon
                                    size={20}
                                    className='text-green-400/40'
                                />
                            }
                        />
                        <MetricCard
                            title='Total Credits'
                            value={accountingSummary.total_credit}
                            format='currency'
                            currencySymbol={currencySymbol}
                            icon={
                                <TrendingUpIcon
                                    size={20}
                                    className='text-red-400/40'
                                />
                            }
                        />
                        <MetricCard
                            title='Net Balance'
                            value={accountingSummary.balance}
                            format='currency'
                            currencySymbol={currencySymbol}
                            icon={
                                <BanknoteIcon
                                    size={20}
                                    className='text-blue-400/40'
                                />
                            }
                        />
                        <div className='bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-2'>
                            <span className='text-white/60 font-medium text-sm'>
                                By Type
                            </span>
                            <div className='h-[120px] sm:h-[150px]'>
                                <ResponsiveContainer
                                    width='100%'
                                    height='100%'
                                >
                                    <PieChart>
                                        <Pie
                                            data={accountingSummary.by_type.map(
                                                (item) => ({
                                                    name: item.type.toLowerCase(),
                                                    value: Math.abs(
                                                        item.debit - item.credit
                                                    ),
                                                })
                                            )}
                                            cx='50%'
                                            cy='50%'
                                            innerRadius={30}
                                            outerRadius={50}
                                            dataKey='value'
                                            paddingAngle={2}
                                        >
                                            {accountingSummary.by_type.map(
                                                (_, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={
                                                            [
                                                                "#8b5cf6",
                                                                "#06b6d4",
                                                                "#22c55e",
                                                                "#f59e0b",
                                                                "#ef4444",
                                                            ][index % 5]
                                                        }
                                                    />
                                                )
                                            )}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: number) =>
                                                `${currencySymbol}${value.toLocaleString()}`
                                            }
                                            contentStyle={{
                                                backgroundColor: "#0a0a0a",
                                                border: "1px solid rgba(255,255,255,0.1)",
                                                borderRadius: "8px",
                                            }}
                                            itemStyle={{ color: "#fff" }}
                                        />
                                        <Legend
                                            wrapperStyle={{ fontSize: "10px" }}
                                            formatter={(value) => (
                                                <span className='capitalize text-white/60'>
                                                    {value}
                                                </span>
                                            )}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Payroll Summary Section */}
            {payrollSummary && (
                <section className='flex flex-col gap-4'>
                    <h2 className='text-xl font-bold flex items-center gap-2'>
                        <WalletIcon className='text-cyan-400' /> Payroll Summary
                    </h2>
                    <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                        <MetricCard
                            title='Pending Earnings'
                            value={payrollSummary.pendingAmount}
                            format='currency'
                            currencySymbol={currencySymbol}
                            icon={
                                <BanknoteIcon
                                    size={20}
                                    className='text-yellow-400/40'
                                />
                            }
                        />
                        <MetricCard
                            title='Requested Payments'
                            value={payrollSummary.requestedAmount}
                            format='currency'
                            currencySymbol={currencySymbol}
                            icon={
                                <BanknoteIcon
                                    size={20}
                                    className='text-orange-400/40'
                                />
                            }
                        />
                        <MetricCard
                            title='Confirmed Payments'
                            value={payrollSummary.confirmedAmount}
                            format='currency'
                            currencySymbol={currencySymbol}
                            icon={
                                <BanknoteIcon
                                    size={20}
                                    className='text-blue-400/40'
                                />
                            }
                        />
                        <MetricCard
                            title='Paid This Month'
                            value={payrollSummary.paidThisMonth}
                            format='currency'
                            currencySymbol={currencySymbol}
                            icon={
                                <BanknoteIcon
                                    size={20}
                                    className='text-green-400/40'
                                />
                            }
                        />
                    </div>

                    {/* Payroll Status Breakdown Pie Chart */}
                    <div className='bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-4'>
                        <h3 className='font-semibold text-white/60 text-sm'>
                            Payroll Status Breakdown
                        </h3>
                        <div className='h-48 sm:h-64'>
                            <ResponsiveContainer
                                width='100%'
                                height='100%'
                            >
                                <PieChart>
                                    <Pie
                                        data={[
                                            {
                                                name: "Pending",
                                                value: payrollSummary.pendingAmount,
                                            },
                                            {
                                                name: "Requested",
                                                value: payrollSummary.requestedAmount,
                                            },
                                            {
                                                name: "Confirmed",
                                                value: payrollSummary.confirmedAmount,
                                            },
                                            {
                                                name: "Paid",
                                                value: payrollSummary.paidThisMonth,
                                            },
                                        ].filter((d) => d.value > 0)}
                                        cx='50%'
                                        cy='50%'
                                        labelLine={false}
                                        outerRadius={80}
                                        fill='#8884d8'
                                        dataKey='value'
                                        nameKey='name'
                                    >
                                        {[
                                            "#FACC15", // Yellow - Pending
                                            "#FB923C", // Orange - Requested
                                            "#3B82F6", // Blue - Confirmed
                                            "#22C55E", // Green - Paid
                                        ].map((color, index) => (
                                            <Cell
                                                key={`payroll-cell-${index}`}
                                                fill={color}
                                                fillOpacity={0.7}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: number) =>
                                            `${currencySymbol}${value.toLocaleString()}`
                                        }
                                        contentStyle={{
                                            backgroundColor: "#0a0a0a",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            borderRadius: "8px",
                                        }}
                                        itemStyle={{ color: "#fff" }}
                                    />
                                    <Legend
                                        wrapperStyle={{ fontSize: "10px" }}
                                        formatter={(value) => (
                                            <span className='capitalize text-white/60'>
                                                {value}
                                            </span>
                                        )}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Artist Earnings Breakdown */}
                    {artistEarnings.length > 0 && (
                        <div className='bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-4'>
                            <h3 className='font-semibold text-white/60 text-sm'>
                                Artist Pending Earnings
                            </h3>
                            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                                {artistEarnings.map((artist) => (
                                    <div
                                        key={artist.staff_id}
                                        className='flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5'
                                    >
                                        <div className='flex flex-col'>
                                            <span className='font-medium'>
                                                {artist.full_name}
                                            </span>
                                            <span className='text-xs text-white/40'>
                                                {artist.pending_count} pending
                                                entries
                                            </span>
                                        </div>
                                        <div className='flex items-center gap-1 bg-yellow-400/10 px-2 py-1 rounded-md border border-yellow-400/20'>
                                            <span className='font-bold text-yellow-400'>
                                                {currencySymbol}
                                                {artist.pending_amount.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* Inventory Section */}
            <section className='flex flex-col gap-4'>
                <h2 className='text-xl font-bold flex items-center gap-2'>
                    <BanknoteIcon className='text-orange-400' /> Inventory
                    Insights
                </h2>
                <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                    <div className='lg:col-span-1'>
                        <MetricCard
                            title='Total Inventory Value'
                            value={inventory?.totalValue}
                            format='currency'
                            currencySymbol={currencySymbol}
                        />
                    </div>
                    <div className='lg:col-span-2 bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-4'>
                        <h3 className='font-semibold text-white/60 text-sm'>
                            Top Inventory by Value
                        </h3>
                        <div className='flex flex-col gap-2'>
                            {inventory?.topSelling.length === 0 ? (
                                <p className='text-white/40 text-sm italic'>
                                    No sales data yet.
                                </p>
                            ) : (
                                inventory?.topSelling.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className='flex justify-between items-center p-2 hover:bg-white/5 rounded-lg transition-colors'
                                    >
                                        <div className='flex flex-col'>
                                            <span className='font-medium'>
                                                {item.name}
                                            </span>
                                            <span className='text-xs text-white/40'>
                                                {item.quantity} units in stock
                                            </span>
                                        </div>
                                        <span className='font-bold text-green-400'>
                                            {currencySymbol}{item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </section>


        </div>
    )
}
