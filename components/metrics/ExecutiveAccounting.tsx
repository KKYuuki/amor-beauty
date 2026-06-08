"use client"

import { useCallback, useContext, useEffect, useState } from "react"
import { AlertCircleIcon } from "lucide-react"
import {
    getExecutiveAccountingMetrics,
    type PLMetrics,
    type ExpenseBreakdownItem,
    type RevenueBreakdownItem,
    type RevenueExpenseTrendItem,
} from "@/server/actions/metrics"
import { getLedgerDetailBreakdown } from "@/server/actions/accounting"
import { LedgerDetailBreakdown } from "@/utils/types/ledger"
import PaymentMethodDrilldown from "@/components/accounting/PaymentMethodDrilldown"

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
    LineChart,
    Line,
    ReferenceLine,
} from "recharts"
import {
    TrendingUpIcon,
    TrendingDownIcon,
    DollarSignIcon,
    PieChartIcon,
    BarChart3Icon,
    WalletIcon,
} from "lucide-react"
import { DateRangePreset, getDateRangeFromPreset } from "@/utils/date-utils"
import { NotificationContext } from "@/components/notifications"
import { ExecutiveAccountingSkeleton } from "./ExecutiveAccountingSkeleton"
import MetricCard from "@/components/ui/MetricCard"
import TimeframeSelector from "@/components/ui/TimeframeSelector"

const COLORS = [
    "#22c55e",
    "#3b82f6",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#06b6d4",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#6366f1",
]

interface ExecutiveAccountingProps {
    branchId?: string
    currencySymbol?: string
}

export default function ExecutiveAccounting({ branchId, currencySymbol: propCurrencySymbol }: ExecutiveAccountingProps) {
    const { addNotification } = useContext(NotificationContext)

    const [, setLoading] = useState(true)
    const [initialLoad, setInitialLoad] = useState(true)
    const [timeframe, setTimeframe] = useState<DateRangePreset>("this_month")
    const [customStartDate, setCustomStartDate] = useState<string>("")
    const [customEndDate, setCustomEndDate] = useState<string>("")
    const [dateRangeStr, setDateRangeStr] = useState("")
    const currencySymbol = propCurrencySymbol ?? ""

    const [plMetrics, setPlMetrics] = useState<PLMetrics | null>(null)
    const [expenseBreakdown, setExpenseBreakdown] = useState<
        ExpenseBreakdownItem[]
    >([])
    const [revenueBreakdown, setRevenueBreakdown] = useState<RevenueBreakdownItem[]>([])
    const [trendData, setTrendData] = useState<RevenueExpenseTrendItem[]>([])
    const [operating, setOperating] = useState<{ revenue: number; expenses: number; netOperating: number } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [detailBreakdown, setDetailBreakdown] = useState<LedgerDetailBreakdown | null>(null)

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError(null)

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

        try {
            const [metricsResult, breakdownResult] = await Promise.allSettled([
                getExecutiveAccountingMetrics(startDate, endDate, branchId),
                getLedgerDetailBreakdown(
                    timeframe === 'custom' ? undefined : timeframe,
                    timeframe === 'custom' ? startDate : undefined,
                    timeframe === 'custom' ? endDate : undefined,
                    branchId
                ),
            ])

            if (metricsResult.status === "fulfilled" && metricsResult.value.success) {
                const data = metricsResult.value.data
                setPlMetrics(data.pl)
                setExpenseBreakdown(data.expenseBreakdown)
                setRevenueBreakdown(data.revenueBreakdown)
                setTrendData(data.trend)
                setOperating(data.operating)
            } else {
                const errorMsg = metricsResult.status === "fulfilled" && !metricsResult.value.success 
                    ? metricsResult.value.error 
                    : "Failed to fetch metrics"
                setError(errorMsg || "Failed to fetch metrics")
                addNotification(errorMsg || "Failed to fetch metrics", "ERROR")
            }

            if (breakdownResult.status === "fulfilled" && breakdownResult.value.success && breakdownResult.value.data) {
                setDetailBreakdown(breakdownResult.value.data)
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Failed to fetch metrics data"
            setError(errorMessage)
            addNotification(errorMessage, "ERROR")
        } finally {
            setLoading(false)
            setInitialLoad(false)
        }
    }, [timeframe, customStartDate, customEndDate, addNotification, branchId])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const formatCurrency = (value: number) => {
        return `${currencySymbol}${value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`
    }

    if (error) {
        return (
            <div className='w-full flex flex-col gap-6 pb-10'>
                <div className='flex flex-col items-center justify-center p-12 bg-red-500/10 border border-red-500/20 rounded-xl text-center'>
                    <AlertCircleIcon className='text-red-400 mb-4' size={48} />
                    <h2 className='text-xl font-bold text-foreground mb-2'>
                        Failed to Load Metrics
                    </h2>
                    <p className='text-muted-foreground mb-4'>{error}</p>
                    <button
                        onClick={() => fetchData()}
                        className='px-4 py-2 bg-card hover:bg-muted text-foreground rounded-lg transition-colors cursor-pointer'
                    >
                        Retry
                    </button>
                </div>
            </div>
        )
    }

    if (initialLoad) {
        return <ExecutiveAccountingSkeleton />
    }

    return (
        <div className='w-full flex flex-col gap-6 pb-10'>

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

            {/* P&L Summary Cards */}
            <section className='flex flex-col gap-4'>
                <h2 className='text-xl font-bold flex items-center gap-2'>
                    <BarChart3Icon className='text-blue-400' /> Profit & Loss
                    Summary
                </h2>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
                    <MetricCard
                        title='Total Revenue'
                        value={plMetrics?.revenue ?? 0}
                        format='currency'
                        icon={<TrendingUpIcon className='text-green-400' size={20} />}
                        currencySymbol={currencySymbol}
                        trend={(plMetrics?.revenue ?? 0) >= (plMetrics?.previousPeriod?.revenue ?? 0) ? 'up' : 'down'}
                        trendValue={plMetrics?.previousPeriod ?
                            `${((plMetrics.revenue - plMetrics.previousPeriod.revenue) >= 0 ? '+' : '-')}${currencySymbol}${Math.abs(plMetrics.revenue - plMetrics.previousPeriod.revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })} vs prev`
                            : undefined}
                    />
                    <MetricCard
                        title='Total Expenses'
                        value={plMetrics?.expenses ?? 0}
                        format='currency'
                        icon={<TrendingDownIcon className='text-red-400' size={20} />}
                        currencySymbol={currencySymbol}
                        trend={(plMetrics?.expenses ?? 0) <= (plMetrics?.previousPeriod?.expenses ?? 0) ? 'up' : 'down'}
                        trendValue={plMetrics?.previousPeriod ?
                            `${((plMetrics.expenses - plMetrics.previousPeriod.expenses) <= 0 ? '+' : '-')}${currencySymbol}${Math.abs(plMetrics.expenses - plMetrics.previousPeriod.expenses).toLocaleString(undefined, { minimumFractionDigits: 2 })} vs prev`
                            : undefined}
                    />
                    <MetricCard
                        title='Net Profit'
                        value={plMetrics?.netProfit ?? 0}
                        format='currency'
                        icon={
                            <DollarSignIcon
                                className={
                                    (plMetrics?.netProfit ?? 0) >= 0
                                        ? "text-green-400"
                                        : "text-red-400"
                                }
                                size={20}
                            />
                        }
                        currencySymbol={currencySymbol}
                        trend={(plMetrics?.netProfit ?? 0) >= (plMetrics?.previousPeriod?.netProfit ?? 0) ? 'up' : 'down'}
                        trendValue={plMetrics?.previousPeriod ?
                            `${((plMetrics.netProfit - plMetrics.previousPeriod.netProfit) >= 0 ? '+' : '-')}${currencySymbol}${Math.abs(plMetrics.netProfit - plMetrics.previousPeriod.netProfit).toLocaleString(undefined, { minimumFractionDigits: 2 })} vs prev`
                            : undefined}
                    />
                    <MetricCard
                        title='Profit Margin'
                        value={plMetrics?.profitMargin ?? 0}
                        format='percent'
                        icon={<PieChartIcon className='text-blue-400' size={20} />}
                        currencySymbol={currencySymbol}
                    />
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
                    <MetricCard
                        title='Total Debits'
                        value={plMetrics?.totalDebits ?? 0}
                        format='currency'
                        icon={<TrendingDownIcon className='text-red-400' size={20} />}
                        currencySymbol={currencySymbol}
                    />
                    <MetricCard
                        title='Total Credits'
                        value={plMetrics?.totalCredits ?? 0}
                        format='currency'
                        icon={<TrendingUpIcon className='text-green-400' size={20} />}
                        currencySymbol={currencySymbol}
                    />
                    <MetricCard
                        title='Assets (Net)'
                        value={plMetrics?.assetTotal ?? 0}
                        format='currency'
                        icon={<DollarSignIcon className='text-blue-400' size={20} />}
                        currencySymbol={currencySymbol}
                    />
                    <MetricCard
                        title='Liabilities (Net)'
                        value={plMetrics?.liabilityTotal ?? 0}
                        format='currency'
                        icon={<DollarSignIcon className='text-orange-400' size={20} />}
                        currencySymbol={currencySymbol}
                    />
                </div>
            </section>

            {/* Operating Summary */}
            <section className='flex flex-col gap-4'>
                <h2 className='text-xl font-bold flex items-center gap-2'>
                    <WalletIcon className='text-emerald-400' /> Operating Summary
                </h2>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <MetricCard
                        title='Revenue'
                        value={operating?.revenue ?? 0}
                        format='currency'
                        icon={<TrendingUpIcon className='text-green-400' size={20} />}
                        currencySymbol={currencySymbol}
                    />
                    <MetricCard
                        title='Expenses'
                        value={operating?.expenses ?? 0}
                        format='currency'
                        icon={<TrendingDownIcon className='text-red-400' size={20} />}
                        currencySymbol={currencySymbol}
                    />
                    <MetricCard
                        title='Net Operating'
                        value={operating?.netOperating ?? 0}
                        format='currency'
                        icon={<DollarSignIcon className={operating && operating.netOperating >= 0 ? 'text-green-400' : 'text-red-400'} size={20} />}
                        currencySymbol={currencySymbol}
                    />
                </div>
            </section>

            {/* Payment Method Breakdown */}
            {detailBreakdown && detailBreakdown.by_payment_method.length > 0 && (
                <PaymentMethodDrilldown
                    breakdown={detailBreakdown.by_payment_method}
                    currencySymbol={currencySymbol}
                />
            )}

            {/* Revenue vs Expense Trend Chart */}
            <section className='flex flex-col gap-4'>
                <h2 className='text-xl font-bold flex items-center gap-2'>
                    <BarChart3Icon className='text-purple-400' /> Revenue vs
                    Expenses Trend
                </h2>
                <div className='w-full h-60 sm:h-80 bg-muted border-2 border-border rounded-xl p-4 flex flex-col gap-2'>
                    <h3 className='font-semibold text-muted-foreground text-sm'>
                        {dateRangeStr || "Select a date range"}
                    </h3>
                    {trendData.length === 0 ? (
                        <div className='flex-1 flex items-center justify-center text-muted-foreground/70'>
                            No data available for the selected period
                        </div>
                    ) : (
                        <ResponsiveContainer width='100%' height='100%'>
                            <BarChart data={trendData}>
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
                                        `${currencySymbol}${value >= 1000 ? (value / 1000).toFixed(0) + "k" : value}`
                                    }
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#0a0a0a",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "8px",
                                    }}
                                    itemStyle={{ color: "#fff" }}
                                    formatter={(value: number, name: string) => [
                                        `${currencySymbol}${Number(value).toLocaleString()}`,
                                        name,
                                    ]}
                                />
                                <Legend
                                    wrapperStyle={{ fontSize: "12px" }}
                                    formatter={(value) => (
                                        <span className='text-foreground'>{value}</span>
                                    )}
                                />
                                <Bar
                                    dataKey='revenue'
                                    name='Revenue'
                                    fill='#22c55e'
                                    radius={[4, 4, 0, 0]}
                                />
                                <Bar
                                    dataKey='expenses'
                                    name='Expenses'
                                    fill='#ef4444'
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </section>

            {/* Expense Breakdown Chart */}
            <section className='flex flex-col gap-4'>
                <h2 className='text-xl font-bold flex items-center gap-2'>
                    <PieChartIcon className='text-orange-400' /> Expense
                    Breakdown
                </h2>
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                    <div className='w-full h-80 bg-muted border-2 border-border rounded-xl p-4 flex flex-col gap-2'>
                        <h3 className='font-semibold text-muted-foreground text-sm'>
                            By Category
                        </h3>
                        {expenseBreakdown.length === 0 ? (
                            <div className='flex-1 flex items-center justify-center text-muted-foreground/70'>
                                No expense data available
                            </div>
                        ) : (
                            <ResponsiveContainer width='100%' height='100%'>
                                <PieChart>
                                    <Pie
                                        data={expenseBreakdown}
                                        cx='50%'
                                        cy='50%'
                                        labelLine={false}
                                        outerRadius={70}
                                        fill='#8884d8'
                                        dataKey='amount'
                                        nameKey='category'
                                    >
                                        {expenseBreakdown.map((_, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={
                                                    COLORS[index % COLORS.length]
                                                }
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: number, name: string) => [
                                            `${currencySymbol}${Number(value).toLocaleString()}`,
                                            name,
                                        ]}
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
                                            <span className='capitalize text-muted-foreground'>
                                                {value}
                                            </span>
                                        )}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    <div className='w-full bg-muted border-2 border-border rounded-xl p-4'>
                        <h3 className='font-semibold text-muted-foreground text-sm mb-4'>
                            Expense Details
                        </h3>
                        {expenseBreakdown.length === 0 ? (
                            <div className='flex items-center justify-center text-muted-foreground/70 py-8'>
                                No expense data available
                            </div>
                        ) : (
                            <div className='space-y-3 max-h-72 overflow-y-auto'>
                                {expenseBreakdown.map((item, index) => (
                                    <div
                                        key={`${item.category}-${index}`}
                                        className='flex items-center justify-between p-3 bg-muted rounded-lg'
                                    >
                                        <div className='flex items-center gap-3'>
                                            <div
                                                className='w-3 h-3 rounded-full'
                                                style={{
                                                    backgroundColor:
                                                        COLORS[index % COLORS.length],
                                                }}
                                            />
                                            <span className='font-medium'>
                                                {item.category}
                                            </span>
                                        </div>
                                        <div className='text-right'>
                                            <p className='font-bold'>
                                                {formatCurrency(item.amount)}
                                            </p>
                                            <p className='text-xs text-muted-foreground'>
                                                {item.percentage.toFixed(1)}%
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Revenue Breakdown Chart */}
            <section className='flex flex-col gap-4'>
                <h2 className='text-xl font-bold flex items-center gap-2'>
                    <TrendingUpIcon className='text-green-400' /> Revenue Breakdown
                </h2>
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                    <div className='w-full h-80 bg-muted border-2 border-border rounded-xl p-4 flex flex-col gap-2'>
                        <h3 className='font-semibold text-muted-foreground text-sm'>
                            By Category
                        </h3>
                        {revenueBreakdown.length === 0 ? (
                            <div className='flex-1 flex items-center justify-center text-muted-foreground/70'>
                                No revenue data available
                            </div>
                        ) : (
                            <ResponsiveContainer width='100%' height='100%'>
                                <PieChart>
                                    <Pie
                                        data={revenueBreakdown}
                                        cx='50%'
                                        cy='50%'
                                        labelLine={false}
                                        outerRadius={70}
                                        fill='#8884d8'
                                        dataKey='amount'
                                        nameKey='category'
                                    >
                                        {revenueBreakdown.map((_, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={COLORS[index % COLORS.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: number, name: string) => [
                                            `${currencySymbol}${Number(value).toLocaleString()}`,
                                            name,
                                        ]}
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
                                            <span className='capitalize text-muted-foreground'>
                                                {value}
                                            </span>
                                        )}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    <div className='w-full bg-muted border-2 border-border rounded-xl p-4'>
                        <h3 className='font-semibold text-muted-foreground text-sm mb-4'>
                            Revenue Details
                        </h3>
                        {revenueBreakdown.length === 0 ? (
                            <div className='flex items-center justify-center text-muted-foreground/70 py-8'>
                                No revenue data available
                            </div>
                        ) : (
                            <div className='space-y-3 max-h-72 overflow-y-auto'>
                                {revenueBreakdown.map((item, index) => (
                                    <div
                                        key={`${item.category}-${index}`}
                                        className='flex items-center justify-between p-3 bg-muted rounded-lg'
                                    >
                                        <div className='flex items-center gap-3'>
                                            <div
                                                className='w-3 h-3 rounded-full'
                                                style={{
                                                    backgroundColor:
                                                        COLORS[index % COLORS.length],
                                                }}
                                            />
                                            <span className='font-medium'>
                                                {item.category}
                                            </span>
                                        </div>
                                        <div className='text-right'>
                                            <p className='font-bold'>
                                                {formatCurrency(item.amount)}
                                            </p>
                                            <p className='text-xs text-muted-foreground'>
                                                {item.percentage.toFixed(1)}%
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Net Profit Trend */}
            <section className='flex flex-col gap-4'>
                <h2 className='text-xl font-bold flex items-center gap-2'>
                    <TrendingUpIcon className='text-cyan-400' /> Net Profit Trend
                </h2>
                <div className='w-full h-60 sm:h-80 bg-muted border-2 border-border rounded-xl p-4 flex flex-col gap-2'>
                    <h3 className='font-semibold text-muted-foreground text-sm'>
                        Net Profit Over Time
                    </h3>
                    {trendData.length === 0 ? (
                        <div className='flex-1 flex items-center justify-center text-muted-foreground/70'>
                            No data available for the selected period
                        </div>
                    ) : (
                        <ResponsiveContainer width='100%' height='100%'>
                            <LineChart data={trendData}>
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
                                        `${currencySymbol}${value >= 1000 ? (value / 1000).toFixed(0) + "k" : value}`
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
                                        `${currencySymbol}${Number(value).toLocaleString()}`,
                                        "Net Profit",
                                    ]}
                                />
                                <ReferenceLine y={0} stroke='#ffffff40' strokeDasharray='3 3' />
                                <Line
                                    type='monotone'
                                    dataKey='netProfit'
                                    name='Net Profit'
                                    stroke='#06b6d4'
                                    strokeWidth={2}
                                    dot={{
                                        fill: "#06b6d4",
                                        strokeWidth: 0,
                                        r: 4,
                                    }}
                                    activeDot={{ r: 6, fill: "#06b6d4" }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </section>
        </div>
    )
}


