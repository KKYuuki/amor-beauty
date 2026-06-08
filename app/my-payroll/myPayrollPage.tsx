"use client"

import { useCallback, useContext, useEffect, useState, useMemo } from "react"
import {
    LoaderCircleIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    BanknoteIcon,
    RefreshCwIcon,
    ClockIcon,
    SendIcon,
    XIcon,
    ListIcon,
    CalendarDaysIcon,
    TrendingUpIcon,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { SideBarContext } from "@/components/sidebar"
import { NotificationContext } from "@/components/notifications"
import type {
    PayrollEntry,
    PayrollRequest,
    PayrollDisbursement,
    PayoutPeriod,
    PayrollEntryTransactionItem,
} from "@/utils/types/payroll"
import {
    getPayrollPaymentMethodLabel,
    PAYROLL_PAYMENT_METHOD_COLORS,
} from "@/utils/types/payment"
import { getSetting } from "@/server/actions/settings"
import { createLogs } from "@/server/actions/logs"
import {
    getPayrollEntries,
    getPendingEntries,
    getPayrollRequests,
    createPayrollRequest,
    getPayrollEntryTransactionItems,
} from "@/server/actions/payroll"
import { CurrencyTaxValue } from "@/utils/types/settings"
import { getDateRangeFromPreset, DateRangePreset } from "@/utils/date-utils"
import PageHeader from "@/components/ui/PageHeader"
import StatsGrid from "@/components/ui/StatsGrid"
import StatCard from "@/components/ui/StatCard"

const STATUS_COLORS: Record<string, string> = {
    PENDING: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30",
    REQUESTED: "bg-orange-400/20 text-orange-300 border-orange-400/30",
    CONFIRMED: "bg-blue-400/20 text-blue-300 border-blue-400/30",
    PAID: "bg-green-400/20 text-green-300 border-green-400/30",
}

type TabType = "earnings" | "requests"
type ViewMode = "list" | "calendar"
type ServiceTypeFilter = "ALL" | "TATTOO" | "PIERCING" | "SHOE"

export default function MyPayrollPageClient() {
    const { userInfo } = useContext(SideBarContext)
    const { addNotification } = useContext(NotificationContext)

    const [activeTab, setActiveTab] = useState<TabType>("earnings")
    const [loading, setLoading] = useState(true)
    const [currencySymbol, setCurrencySymbol] = useState("₱")

    const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)
    const [transactionItemsMap, setTransactionItemsMap] = useState<
        Record<string, PayrollEntryTransactionItem[]>
    >({})
    const [itemsLoading, setItemsLoading] = useState(false)
    const [itemsError, setItemsError] = useState<string | null>(null)

    const handleExpandEntry = async (entryId: string) => {
        if (expandedEntryId === entryId) {
            setExpandedEntryId(null)
            setItemsError(null)
            return
        }
        setExpandedEntryId(entryId)
        setItemsError(null)
        if (!transactionItemsMap[entryId]) {
            setItemsLoading(true)
            try {
                const result = await getPayrollEntryTransactionItems(entryId)
                if (result.success) {
                    setTransactionItemsMap((prev) => ({
                        ...prev,
                        [entryId]: result.data,
                    }))
                } else {
                    setItemsError(result.error || "Could not load service details")
                }
            } catch {
                setItemsError("Could not load service details")
            } finally {
                setItemsLoading(false)
            }
        }
    }

    const [entries, setEntries] = useState<PayrollEntry[]>([])
    const [pendingEntries, setPendingEntries] = useState<PayrollEntry[]>([])
    const [datePreset, setDatePreset] = useState<DateRangePreset>("this_month")

    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)

    const [requests, setRequests] = useState<PayrollRequest[]>([])
    const [disbursementsMap, setDisbursementsMap] = useState<Record<string, PayrollDisbursement[]>>({})
    const [showRequestModal, setShowRequestModal] = useState(false)
    const [selectedEntries, setSelectedEntries] = useState<Set<string>>(
        new Set()
    )
    const [submitting, setSubmitting] = useState(false)
    const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceTypeFilter>("ALL")

    const [summary, setSummary] = useState({
        totalEarned: 0,
        totalPending: 0,
        totalPaid: 0,
        entryCount: 0,
    })

    const userCreatedAt = useMemo(
        () =>
            userInfo?.created_at ? new Date(userInfo.created_at) : undefined,
        [userInfo?.created_at]
    )

    const fetchData = useCallback(async () => {
        if (!userInfo?.id) return
        setLoading(true)
        try {
            const [taxData] = await Promise.all([getSetting("currency_tax")])
            if (taxData.success && taxData.data) {
                const settings = taxData.data as CurrencyTaxValue
                setCurrencySymbol(settings.currency_symbol)
            }

            if (activeTab === "earnings") {
                let dateFrom: string | undefined, dateTo: string | undefined
                if (datePreset !== "all") {
                    const range = getDateRangeFromPreset(datePreset)
                    dateFrom = range?.start.toISOString().split("T")[0]
                    dateTo = range?.end.toISOString().split("T")[0]
                }

                const [entriesResult, pendingResult] = await Promise.all([
                    getPayrollEntries({
                        staffId: userInfo.id,
                        dateFrom,
                        dateTo,
                    }),
                    getPendingEntries(userInfo.id),
                ])

                if (entriesResult.success && entriesResult.data) {
                    const entriesData = entriesResult.data.data
                    setEntries(entriesData)
                    const totalEarned = entriesData.reduce(
                        (s: number, e: { staff_cut: number }) => s + Number(e.staff_cut),
                        0
                    )
                    const totalPaid = entriesData
                        .filter((e: { payment_status: string }) => e.payment_status === "PAID")
                        .reduce((s: number, e: { staff_cut: number }) => s + Number(e.staff_cut), 0)
                    const totalPending = entriesData
                        .filter((e: { payment_status: string }) => e.payment_status === "PENDING")
                        .reduce((s: number, e: { staff_cut: number }) => s + Number(e.staff_cut), 0)
                    setSummary({
                        totalEarned,
                        totalPaid,
                        totalPending,
                        entryCount: entriesData.length,
                    })
                }
                if (pendingResult.success && pendingResult.data) {
                    setPendingEntries(pendingResult.data)
                }
            } else {
                const result = await getPayrollRequests({
                    staffId: userInfo.id,
                })
                if (result.success && result.data) {
                    setRequests(result.data.data)

                    // Fetch disbursements for completed requests
                    const completedRequestIds = result.data.data
                        .filter((r: PayrollRequest) => r.status === 'COMPLETED')
                        .map((r: PayrollRequest) => r.id)

                    if (completedRequestIds.length > 0) {
                        const { getDisbursements } = await import('@/server/actions/payroll-disbursements')
                        const disbursementResults = await Promise.all(
                            completedRequestIds.map((id: string) => getDisbursements(id))
                        )
                        const newMap: Record<string, PayrollDisbursement[]> = {}
                        completedRequestIds.forEach((id: string, i: number) => {
                            if (disbursementResults[i].success) {
                                newMap[id] = disbursementResults[i].data || []
                            }
                        })
                        setDisbursementsMap(newMap)
                    } else {
                        setDisbursementsMap({})
                    }
                }
            }
        } catch (error) {
            createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Error fetching payroll data: ${error instanceof Error ? error.message : String(error)}` }] })
            addNotification("Failed to load payroll data", "ERROR")
        } finally {
            setLoading(false)
        }
    }, [
        addNotification,
        userInfo?.id,
        activeTab,
        datePreset,
        selectedYear,
        selectedMonth,
    ])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleMonthChange = (year: number, month: number) => {
        setSelectedYear(year)
        setSelectedMonth(month)
        setSelectedDate(null)
    }

    const displayedEntries = useMemo(() => {
        let filtered = entries
        if (serviceTypeFilter !== "ALL") {
            filtered = filtered.filter(
                (e) => e.staff_rate_snapshot?.serviceType === serviceTypeFilter
            )
        }
        return filtered
    }, [entries, selectedDate, serviceTypeFilter])

    const handleRequestPayment = async () => {
        if (!userInfo?.id || selectedEntries.size === 0) return
        setSubmitting(true)
        try {
            const selectedEntryList = pendingEntries.filter((e) =>
                selectedEntries.has(e.id)
            )
            const dates = selectedEntryList.map((e) => new Date(e.service_date))
            const minDate = new Date(Math.min(...dates.map((d) => d.getTime())))
            const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())))

            const result = await createPayrollRequest({
                staff_id: userInfo.id,
                entry_ids: Array.from(selectedEntries),
                period_type: "DAILY" as PayoutPeriod,
                period_start: minDate,
                period_end: maxDate,
            })

            if (result.success) {
                addNotification("Payment request submitted", "SUCCESS")
                setShowRequestModal(false)
                setSelectedEntries(new Set())
                fetchData()
            } else {
                addNotification(
                    result.error || "Failed to submit request",
                    "ERROR"
                )
            }
        } catch (error) {
            createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Error requesting payment: ${error instanceof Error ? error.message : String(error)}` }] })
            addNotification("Failed to submit request", "ERROR")
        } finally {
            setSubmitting(false)
        }
    }

    const toggleEntry = (id: string) => {
        const newSet = new Set(selectedEntries)
        if (newSet.has(id)) newSet.delete(id)
        else newSet.add(id)
        setSelectedEntries(newSet)
    }

    const selectAllPending = () => {
        if (selectedEntries.size === pendingEntries.length)
            setSelectedEntries(new Set())
        else setSelectedEntries(new Set(pendingEntries.map((e) => e.id)))
    }

    const selectedTotal = pendingEntries
        .filter((e) => selectedEntries.has(e.id))
        .reduce((s, e) => s + Number(e.staff_cut), 0)

    return (
        <div className='flex flex-col h-full overflow-hidden'>
            <PageHeader
                title="My Payroll"
                description="View your earnings and request payments"
                icon={<BanknoteIcon className='w-6 h-6' />}
                actions={
                    <>
                        {pendingEntries.length > 0 && (
                            <button
                                onClick={() => setShowRequestModal(true)}
                                className='flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded text-sm border border-green-500/30'
                            >
                                <SendIcon className='w-4 h-4' /> Request
                            </button>
                        )}
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className='p-2 bg-card hover:bg-muted rounded disabled:opacity-50'
                        >
                            <RefreshCwIcon
                                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                            />
                        </button>
                    </>
                }
            />

            {/* Stats */}
            <StatsGrid columns={{ mobile: 2, tablet: 3, desktop: 5 }} className='mb-4'>
                <StatCard
                    label="Total Earned"
                    value={`${currencySymbol}${summary.totalEarned.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    color="default"
                />
                <StatCard
                    label="Pending"
                    value={`${currencySymbol}${summary.totalPending.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    color="warning"
                />
                <StatCard
                    label="Confirmed"
                    value={`${currencySymbol}${(entries || [])
                        .filter(e => e.payment_status === 'CONFIRMED')
                        .reduce((s, e) => s + Number(e.staff_cut), 0)
                        .toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    color="default"
                />
                <StatCard
                    label="Paid"
                    value={`${currencySymbol}${summary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    color="success"
                />
                <StatCard
                    label="Active Requests"
                    value={requests.filter((r) => r.status === "REQUESTED" || r.status === "CONFIRMED").length}
                    color="default"
                />
            </StatsGrid>

            {/* Tabs & View Toggle */}
            <div className='flex items-center justify-between mb-3'>
                <div className='flex gap-1 bg-muted p-1 rounded'>
                    {[
                        {
                            key: "earnings",
                            label: "Earnings",
                            icon: TrendingUpIcon,
                        },
                        { key: "requests", label: "Requests", icon: ClockIcon },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as TabType)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded text-sm ${activeTab === tab.key ? "bg-muted" : "text-muted-foreground hover:text-foreground"}`}
                        >
                            <tab.icon className='w-3.5 h-3.5' /> {tab.label}
                        </button>
                    ))}
                </div>
                {activeTab === "earnings" && (
                    <div className='flex items-center gap-2'>
                        <div className='flex items-center gap-2'>
                            <select
                                value={datePreset}
                                onChange={(e) =>
                                    setDatePreset(
                                        e.target.value as DateRangePreset
                                    )
                                }
                                className='bg-card rounded px-2 py-1 text-sm outline-none'
                            >
                                <option value='today'>Today</option>
                                <option value='this_week'>This Week</option>
                                <option value='this_month'>This Month</option>
                                <option value='this_year'>This Year</option>
                                <option value='all'>All Time</option>
                            </select>
                        </div>
                        <div className='flex gap-1 bg-muted p-0.5 rounded'>
                            {(["ALL", "TATTOO", "PIERCING", "SHOE"] as ServiceTypeFilter[]).map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setServiceTypeFilter(filter)}
                                    className={`px-2 py-1 rounded text-xs ${serviceTypeFilter === filter ? "bg-muted" : "text-muted-foreground/70 hover:text-foreground"}`}
                                >
                                    {filter === "ALL" ? "All" : filter.charAt(0) + filter.slice(1).toLowerCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className='flex-1 overflow-auto'>
                {loading ? (
                    <div className='flex items-center justify-center h-40'>
                        <LoaderCircleIcon className='w-6 h-6 animate-spin text-muted-foreground/70' />
                    </div>
                ) : activeTab === "earnings" ? (
                        <div className='space-y-1'>
                            {entries.length === 0 ? (
                                <p className='text-muted-foreground/70 text-sm text-center py-8'>
                                    No earnings found
                                </p>
                            ) : (
                                entries.map((entry) => (
                                    <div key={entry.id}>
                                        <div
                                            className='flex items-center justify-between bg-muted hover:bg-muted rounded p-3 text-sm cursor-pointer'
                                            onClick={() => handleExpandEntry(entry.id)}
                                        >
                                            <div className='flex items-center gap-2 flex-1 min-w-0'>
                                                {expandedEntryId === entry.id ? (
                                                    <ChevronDownIcon className='w-4 h-4 text-muted-foreground/70 flex-shrink-0' />
                                                ) : (
                                                    <ChevronRightIcon className='w-4 h-4 text-muted-foreground/70 flex-shrink-0' />
                                                )}
                                                <div className='flex-1 min-w-0'>
                                                    <div className='flex items-center gap-2'>
                                                        <p className='truncate font-medium'>
                                                            {entry.service_description ||
                                                                "Service"}
                                                        </p>
                                                        {entry.staff_rate_snapshot?.serviceType && (
                                                            <span className='text-xs px-2 py-0.5 rounded bg-card text-muted-foreground'>
                                                                {entry.staff_rate_snapshot.serviceType}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className='text-xs text-muted-foreground/70'>
                                                        {new Date(
                                                            entry.service_date
                                                        ).toLocaleDateString()}{" "}
                                                        • {entry.client_type}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className='text-right flex-shrink-0'>
                                                <p className='font-bold text-green-400'>
                                                    {currencySymbol}
                                                    {Number(
                                                        entry.staff_cut
                                                    ).toFixed(2)}
                                                </p>
                                                <span
                                                    className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[entry.payment_status]}`}
                                                >
                                                    {entry.payment_status}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Expanded: Transaction Services Breakdown */}
                                        {expandedEntryId === entry.id && (
                                            <div className='bg-muted rounded-b border-t border-border mt-[-1px] px-4 py-3 ml-6'>
                                                {itemsLoading ? (
                                                    <div className='flex items-center justify-center py-2'>
                                                        <LoaderCircleIcon className='w-4 h-4 animate-spin text-muted-foreground/70' />
                                                        <span className='text-xs text-muted-foreground/70 ml-2'>Loading services...</span>
                                                    </div>
                                                ) : itemsError ? (
                                                    <p className='text-xs text-red-400 text-center py-2'>{itemsError}</p>
                                                ) : transactionItemsMap[entry.id] ? (
                                                    transactionItemsMap[entry.id].length === 0 ? (
                                                        <p className='text-xs text-muted-foreground/70 text-center py-2'>
                                                            No transaction items found
                                                        </p>
                                                    ) : (
                                                        <table className='w-full text-xs'>
                                                            <thead>
                                                                <tr className='text-muted-foreground border-b border-border'>
                                                                    <th className='text-left py-1'>Service</th>
                                                                    <th className='text-left py-1'>Type</th>
                                                                    <th className='text-center py-1'>Qty</th>
                                                                    <th className='text-right py-1'>Price</th>
                                                                    <th className='text-right py-1'>Staff Cut</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {transactionItemsMap[entry.id].map((item, idx) => (
                                                                    <tr key={idx} className='border-b border-border'>
                                                                        <td className='py-1 text-foreground'>{item.item_name}</td>
                                                                        <td className='py-1'>
                                                                            {item.service_type ? (
                                                                                <span className='text-[10px] px-1.5 py-0.5 rounded bg-card text-muted-foreground'>
                                                                                    {item.service_type}
                                                                                </span>
                                                                            ) : (
                                                                                <span className='text-muted-foreground/70'>—</span>
                                                                            )}
                                                                        </td>
                                                                        <td className='py-1 text-center text-muted-foreground'>{item.quantity}</td>
                                                                        <td className='py-1 text-right text-foreground'>
                                                                            {currencySymbol}{item.unit_price.toFixed(2)}
                                                                        </td>
                                                                        <td className='py-1 text-right text-green-400'>
                                                                            {item.staff_cut !== undefined
                                                                                ? `${currencySymbol}${item.staff_cut.toFixed(2)}`
                                                                                : <span className='text-muted-foreground/70'>—</span>}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    )
                                                ) : entry.transaction_id ? (
                                                    <p className='text-xs text-muted-foreground/70 text-center py-2'>
                                                        Click to load service details
                                                    </p>
                                                ) : (
                                                    <p className='text-xs text-muted-foreground/70 text-center py-2'>
                                                        Manual entry — no transaction linked
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                ) : (
                    <div className='space-y-4'>
                        {requests.length === 0 ? (
                            <p className='text-muted-foreground/70 text-sm text-center py-8'>
                                No payment requests yet
                            </p>
                        ) : (
                            // Group requests by period type
                            (() => {
                                const periodOrder: Record<
                                    PayoutPeriod,
                                    number
                                > = {
                                    DAILY: 0,
                                    WEEKLY: 1,
                                    BIMONTHLY: 2,
                                    MONTHLY: 3,
                                }
                                const groups: Record<string, PayrollRequest[]> =
                                    {}
                                requests.forEach((request) => {
                                    const period = request.period_type
                                    if (!groups[period]) groups[period] = []
                                    groups[period].push(request)
                                })
                                const sortedGroups = Object.entries(
                                    groups
                                ).sort(
                                    ([a], [b]) =>
                                        periodOrder[a as PayoutPeriod] -
                                        periodOrder[b as PayoutPeriod]
                                )
                                return sortedGroups.map(
                                    ([periodType, periodRequests]) => (
                                        <div
                                            key={periodType}
                                            className='space-y-2'
                                        >
                                            <h3 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2'>
                                                <CalendarDaysIcon className='w-4 h-4' />
                                                {periodType} Payouts
                                            </h3>
                                            <div className='space-y-2'>
                                                {periodRequests.map(
                                                    (request) => (
                                                        <div
                                                            key={request.id}
                                                            className='bg-muted hover:bg-muted rounded p-3'
                                                        >
                                                            <div className='flex items-center justify-between'>
                                                                <div>
                                                                    <div className='flex items-center gap-2 mb-1'>
                                                                        <span className='text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded'>
                                                                            {
                                                                                request.period_type
                                                                            }
                                                                        </span>
                                                                        {request.entries && (
                                                                            <span className='text-xs px-2 py-0.5 bg-card text-muted-foreground rounded'>
                                                                                {request.entries.length} {request.entries.length === 1 ? 'entry' : 'entries'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className='text-sm text-muted-foreground'>
                                                                        {new Date(
                                                                            request.period_start
                                                                        ).toLocaleDateString()}{" "}
                                                                        -{" "}
                                                                        {new Date(
                                                                            request.period_end
                                                                        ).toLocaleDateString()}
                                                                    </p>
                                                                    <p className='text-xs text-muted-foreground/70'>
                                                                        Requested{" "}
                                                                        {new Date(
                                                                            request.requested_at
                                                                        ).toLocaleDateString()}
                                                                    </p>
                                                                </div>
                                                                <div className='text-right'>
                                                                    <p className='font-bold text-green-300'>
                                                                        {
                                                                            currencySymbol
                                                                        }
                                                                        {Number(
                                                                            request.total_staff_cut
                                                                        ).toLocaleString(
                                                                            undefined,
                                                                            {
                                                                                minimumFractionDigits: 2,
                                                                            }
                                                                        )}
                                                                    </p>
                                                                    {/* Status-aware UI */}
                                                                    {request.status === "REQUESTED" && (
                                                                        <span className='text-xs text-amber-300'>
                                                                            Awaiting admin confirmation
                                                                        </span>
                                                                    )}
                                                                    {request.status === "CONFIRMED" && (
                                                                        <span className='text-xs text-blue-300'>
                                                                            Confirmed — awaiting disbursement
                                                                        </span>
                                                                    )}
                                                                    {request.status === "COMPLETED" && (
                                                                        <div className='space-y-1'>
                                                                            <span className='text-xs px-1.5 py-0.5 rounded bg-green-400/20 text-green-300 border border-green-400/30'>
                                                                                Completed
                                                                            </span>
                                                                            {request.completed_at && (
                                                                                <p className='text-xs text-muted-foreground'>
                                                                                    Paid on {new Date(request.completed_at).toLocaleDateString()}
                                                                                </p>
                                                                            )}
                                                                            {/* Disbursement Details */}
                                                                            {disbursementsMap[request.id] && disbursementsMap[request.id].length > 0 && (
                                                                                <div className='mt-2 pt-2 border-t border-border'>
                                                                                    <p className='text-[10px] text-muted-foreground/70 mb-1'>Disbursements:</p>
                                                                                    <div className='space-y-1'>
                                                                                        {disbursementsMap[request.id].map((d) => (
                                                                                            <div key={d.id} className='flex items-center justify-between text-xs bg-muted rounded p-1.5'>
                                                                                                <div className='flex items-center gap-1.5'>
                                                                                                    <span className={`px-1 py-0.5 rounded text-[10px] ${PAYROLL_PAYMENT_METHOD_COLORS[d.payment_method as keyof typeof PAYROLL_PAYMENT_METHOD_COLORS] || 'bg-card text-muted-foreground'}`}>
                                                                                                        {getPayrollPaymentMethodLabel(d.payment_method)}
                                                                                                    </span>
                                                                                                    <span className='text-foreground/90'>
                                                                                                        {currencySymbol}{Number(d.amount).toFixed(2)}
                                                                                                    </span>
                                                                                                </div>
                                                                                                <div className='text-muted-foreground text-[10px]'>
                                                                                                    {d.reference_number && <span className='font-mono mr-1'>Ref: {d.reference_number}</span>}
                                                                                                </div>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    {request.status === "CANCELLED" && (
                                                                        <div className='space-y-1'>
                                                                            <span className='text-xs px-1.5 py-0.5 rounded bg-red-400/20 text-red-300 border border-red-400/30'>
                                                                                Cancelled
                                                                            </span>
                                                                            {request.cancel_reason && (
                                                                                <p className='text-xs text-muted-foreground'>
                                                                                    Reason: {request.cancel_reason}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    )
                                )
                            })()
                        )}
                    </div>
                )}
            </div>

            {/* Request Modal */}
            <AnimatePresence>
                {showRequestModal && (
                    <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className='bg-card rounded-xl w-full max-w-md border border-border flex flex-col max-h-[80vh]'
                        >
                            <div className='p-4 border-b border-border flex justify-between items-center'>
                                <h3 className='font-bold'>Request Payment</h3>
                                <button
                                    onClick={() => {
                                        setShowRequestModal(false)
                                        setSelectedEntries(new Set())
                                    }}
                                    className='text-muted-foreground hover:text-foreground'
                                >
                                    <XIcon className='w-5 h-5' />
                                </button>
                            </div>
                            <div className='p-4 overflow-auto flex-1'>
                                <div className='flex justify-between items-center mb-3'>
                                    <span className='text-sm text-muted-foreground'>
                                        Select entries:
                                    </span>
                                    <button
                                        onClick={selectAllPending}
                                        className='text-xs text-blue-400'
                                    >
                                        {selectedEntries.size ===
                                        pendingEntries.length
                                            ? "Deselect All"
                                            : "Select All"}
                                    </button>
                                </div>
                                <div className='space-y-1'>
                                    {pendingEntries.map((entry) => (
                                        <label
                                            key={entry.id}
                                            className={`flex items-center gap-2 p-2 rounded cursor-pointer ${selectedEntries.has(entry.id) ? "bg-green-500/20" : "bg-muted hover:bg-muted"}`}
                                        >
                                            <input
                                                type='checkbox'
                                                checked={selectedEntries.has(
                                                    entry.id
                                                )}
                                                onChange={() =>
                                                    toggleEntry(entry.id)
                                                }
                                                className='accent-green-500'
                                            />
                                            <div className='flex-1 min-w-0'>
                                                <div className='flex items-center gap-2'>
                                                    <p className='text-sm truncate'>
                                                        {entry.service_description ||
                                                            "Service"}
                                                    </p>
                                                    {entry.staff_rate_snapshot?.serviceType && (
                                                        <span className='text-xs px-2 py-0.5 rounded bg-card text-muted-foreground'>
                                                            {entry.staff_rate_snapshot.serviceType}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className='text-xs text-muted-foreground/70'>
                                                    {new Date(
                                                        entry.service_date
                                                    ).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <p className='text-sm font-bold text-green-400'>
                                                {currencySymbol}
                                                {Number(
                                                    entry.staff_cut
                                                ).toFixed(2)}
                                            </p>
                                        </label>
                                    ))}
                                    {pendingEntries.length === 0 && (
                                        <p className='text-center text-muted-foreground/70 py-4 text-sm'>
                                            No pending entries
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className='p-4 border-t border-border bg-muted'>
                                <div className='flex items-center justify-between'>
                                    <div>
                                        <p className='text-xs text-muted-foreground'>
                                            Total
                                        </p>
                                        <p className='text-xl font-bold text-green-400'>
                                            {currencySymbol}
                                            {selectedTotal.toLocaleString(
                                                undefined,
                                                { minimumFractionDigits: 2 }
                                            )}
                                        </p>
                                    </div>
                                    <div className='flex gap-2'>
                                        <button
                                            onClick={() => {
                                                setShowRequestModal(false)
                                                setSelectedEntries(new Set())
                                            }}
                                            className='px-3 py-1.5 bg-card hover:bg-muted rounded text-sm'
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleRequestPayment}
                                            disabled={
                                                submitting ||
                                                selectedEntries.size === 0
                                            }
                                            className='px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-sm font-medium flex items-center gap-1'
                                        >
                                            {submitting ? (
                                                <LoaderCircleIcon className='w-4 h-4 animate-spin' />
                                            ) : (
                                                <SendIcon className='w-4 h-4' />
                                            )}{" "}
                                            Submit
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
