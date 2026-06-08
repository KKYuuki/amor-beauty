"use client"

import NextImage from "next/image"

import { useCallback, useContext, useEffect, useState, useMemo } from "react"
import {
    LoaderCircleIcon,
    WalletIcon,
    RefreshCwIcon,
    UsersIcon,
    CheckCircleIcon,
    ClockIcon,
    BanknoteIcon,
    SettingsIcon,
    CheckIcon,
    XCircleIcon,
    PlusIcon,
    MinusCircleIcon,
    PercentIcon,
    PaperclipIcon,
    CalendarIcon,
} from "lucide-react"
import { AnimatePresence } from "motion/react"
import { SideBarContext } from "@/components/sidebar"
import { NotificationContext } from "@/components/notifications"
import AdminActionGuard from "@/components/admin/AdminActionGuard"

import {
    PayrollRequest,
    PayrollStaffRate,
    PaymentMethod,
    PayrollEntry,
    RateLevelItem,
    Downpayment,
} from "@/utils/types/payroll"
import {
    getPayrollPaymentMethodLabel,
    PAYROLL_PAYMENT_METHOD_COLORS,
} from "@/utils/types/payment"
import {
    getPayrollDashboardSummary,
    getPayrollRequests,
    getStaffPayrollSummary,
    getStaffRates,
    updateStaffRate,
    createStaffRate,
    deactivateStaffRate,
    deleteStaffRate,
    confirmPayrollRequest,
    completePayrollRequest,
    cancelPayrollRequest,
    createManualPayrollEntry,
    PayrollDashboardSummary,
    StaffPayrollSummaryItem,
    createAdvance,
    createDeduction,
    getAllDeductions,
    cancelDeduction,
    DeductionWithStaff,
    createScheduledPayment,
    getScheduledPayments,
    ScheduledPaymentWithStaff,
    getExpectedPaymentMethod,
} from "@/server/actions/payroll"
import DateRangeSelector from "@/components/payroll/DateRangeSelector"
import StaffEarningsRow from "@/components/payroll/StaffEarningsRow"
import {
    getDownpayments,
    assignStaffToDownpayment,
} from "@/server/actions/downpayments"
import {
    getRateLevels,
    createRateLevel,
    updateRateLevel,
    deactivateRateLevel,
    deleteRateLevel,
} from "@/server/actions/rate-levels"
import { getSetting } from "@/server/actions/settings"
import { createLogs } from "@/server/actions/logs"

const currentBranch: any = null;
import {
    CompletePaymentModal,
    StaggeredPaymentModal,
    ConfirmRequestModal,
    CancelRequestModal,
    ManualPayrollEntryModal,
    EditRateModal,
    CreateRateModal,
    DeactivateRateModal,
    CreateDeductionModal,
    CancelDeductionModal,
    CreateScheduledPaymentModal,
    CancelScheduledModal,
    StaffRequestModal,
    CreateDownpaymentModal,
    AssignStaffModal,
    CreateRateLevelModal,
    EditRateLevelModal,
    DeactivateRateLevelModal,
    DeleteRateLevelModal,
} from "./modals"

const STATUS_COLORS = {
    REQUESTED: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30",
    CONFIRMED: "bg-blue-400/20 text-blue-300 border-blue-400/30",
    COMPLETED: "bg-green-400/20 text-green-300 border-green-400/30",
    CANCELLED: "bg-red-400/20 text-red-300 border-red-400/30",
}

type TabType = "dashboard" | "requests" | "rateConfiguration" | "deductions" | "scheduled" | "downpayments"


export default function PayrollPageClient() {
    const { userInfo } = useContext(SideBarContext)
    const { addNotification } = useContext(NotificationContext)
    
    const isAdmin = userInfo?.role === "admin"

    // State
    const [activeTab, setActiveTab] = useState<TabType>("dashboard")
    const [loading, setLoading] = useState(true)
    const [currencySymbol, setCurrencySymbol] = useState("₱")

    // Dashboard data
    const [summary, setSummary] = useState<PayrollDashboardSummary | null>(null)
    const [staffSummary, setStaffSummary] = useState<StaffPayrollSummaryItem[]>([])

    // Date range for dashboard
    const [dashboardDateRange, setDashboardDateRange] = useState({
        dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            .toISOString().split("T")[0],
        dateTo: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
            .toISOString().split("T")[0],
    })

    // Requests data
    const [requests, setRequests] = useState<PayrollRequest[]>([])
    const [requestFilter, setRequestFilter] = useState<
        "all" | "REQUESTED" | "CONFIRMED" | "COMPLETED"
    >("all")

    // Rates data
    const [rates, setRates] = useState<PayrollStaffRate[]>([])
    const [editingRate, setEditingRate] = useState<PayrollStaffRate | null>(
        null
    )
    const [creatingRate, setCreatingRate] = useState(false)
    const [deactivatingRate, setDeactivatingRate] = useState<PayrollStaffRate | null>(null)


    // Manual payroll entry
    const [manualEntryModal, setManualEntryModal] = useState(false)

    // Action modals
    const [processingRequest, setProcessingRequest] =
        useState<PayrollRequest | null>(null)
    const [cancellingRequest, setCancellingRequest] =
        useState<PayrollRequest | null>(null)
    // Confirm & disburse stepped flow
    const [confirmAndDisburseRequest, setConfirmAndDisburseRequest] = useState<PayrollRequest | null>(null)
    const [confirmStep, setConfirmStep] = useState<'confirm' | 'disburse'>('confirm')
    // Staggered payment state
    const [staggeredPaymentRequest, setStaggeredPaymentRequest] = useState<PayrollRequest | null>(null)
    const [requestDisbursements, setRequestDisbursements] = useState<import("@/utils/types/payroll").PayrollDisbursement[]>([])
    const [staggeredExpectedMethod, setStaggeredExpectedMethod] = useState<string | null>(null)
    // Disbursement history for completed requests
    const [requestDisbursementsMap, setRequestDisbursementsMap] = useState<Record<string, import("@/utils/types/payroll").PayrollDisbursement[]>>({})
    const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null)
    // Manager request payout state
    const [staffRequestModal, setStaffRequestModal] = useState<{
        staffId: string
        staffName: string
    } | null>(null)
    const [staffPendingEntries, setStaffPendingEntries] = useState<
        PayrollEntry[]
    >([])

    // Deductions data
    const [deductions, setDeductions] = useState<DeductionWithStaff[]>([])
    const [creatingDeduction, setCreatingDeduction] = useState(false)
    const [cancellingDeduction, setCancellingDeduction] = useState<string | null>(null)

    // Scheduled payments data
    const [scheduledPayments, setScheduledPayments] = useState<ScheduledPaymentWithStaff[]>([])
    const [creatingScheduled, setCreatingScheduled] = useState(false)
    const [cancellingScheduled, setCancellingScheduled] = useState<string | null>(null)

    // Rate levels
    const [rateLevels, setRateLevels] = useState<RateLevelItem[]>([])
    const [allRateLevels, setAllRateLevels] = useState<RateLevelItem[]>([])
    const [creatingRateLevel, setCreatingRateLevel] = useState(false)
    const [editingRateLevel, setEditingRateLevel] = useState<RateLevelItem | null>(null)
    const [deactivatingRateLevel, setDeactivatingRateLevel] = useState<RateLevelItem | null>(null)
    const [deletingRateLevel, setDeletingRateLevel] = useState<RateLevelItem | null>(null)

    const refreshRateLevels = useCallback(async () => {
        const [allLevelsResult, activeLevelsResult] = await Promise.all([
            getRateLevels(false),
            getRateLevels(true),
        ])
        if (allLevelsResult.success) {
            setAllRateLevels(allLevelsResult.data)
        }
        if (activeLevelsResult.success) {
            setRateLevels(activeLevelsResult.data)
        }
    }, [])

    useEffect(() => {
        refreshRateLevels().catch(console.error)
    }, [refreshRateLevels])

    // Downpayments data
    const [downpayments, setDownpayments] = useState<Downpayment[]>([])
    const [creatingDownpayment, setCreatingDownpayment] = useState(false)
    const [assigningDownpayment, setAssigningDownpayment] = useState<Downpayment | null>(null)
    const [downpaymentFilter, setDownpaymentFilter] = useState<"all" | "unassigned" | "settled">("all")

    // --- Data Fetching ---
    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const [taxData] = await Promise.all([getSetting("currency_tax")])

            if (taxData.success && taxData.data) {
                setCurrencySymbol(taxData.data.currency_symbol)
            }

            // Fetch based on active tab
            if (activeTab === "dashboard") {
                const [summaryResult, staffResult] = await Promise.all([
                    getPayrollDashboardSummary(
                        currentBranch?.id ?? null,
                        dashboardDateRange.dateFrom,
                        dashboardDateRange.dateTo
                    ),
                    getStaffPayrollSummary(
                        currentBranch?.id ?? null,
                        dashboardDateRange.dateFrom,
                        dashboardDateRange.dateTo
                    ),
                ])
                if (summaryResult.success && summaryResult.data) {
                    setSummary(summaryResult.data)
                }
                if (staffResult.success) {
                    setStaffSummary(staffResult.data)
                }
            } else if (activeTab === "requests") {
                const result = await getPayrollRequests({
                    status: requestFilter === "all" ? undefined : requestFilter,
                    branchId: currentBranch?.id ?? null,
                })
                if (result.success) {
                    setRequests(result.data.data)
                }
            } else if (activeTab === "rateConfiguration") {
                const [ratesData] = await Promise.all([
                    getStaffRates(),
                ])
                if (ratesData.success) {
                    setRates(ratesData.data)
                }
                await refreshRateLevels()
            } else if (activeTab === "deductions") {
                const deductionsResult = await getAllDeductions(currentBranch?.id ?? null)
                if (deductionsResult.success) {
                    setDeductions(deductionsResult.data)
                }
            } else if (activeTab === "scheduled") {
                const scheduledResult = await getScheduledPayments(currentBranch?.id ?? null)
                if (scheduledResult.success) {
                    setScheduledPayments(scheduledResult.data)
                }
            } else if (activeTab === "downpayments") {
                const dpResult = await getDownpayments({
                    isSettled: downpaymentFilter === "settled" ? true : downpaymentFilter === "unassigned" ? false : undefined,
                    unassignedOnly: downpaymentFilter === "unassigned" ? true : undefined,
                })
                setDownpayments(dpResult)
            }
        } catch (error) {
            createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Error fetching payroll data: ${error instanceof Error ? error.message : String(error)}` }] })
            addNotification("Failed to load payroll data", "ERROR")
        } finally {
            setLoading(false)
        }
    }, [addNotification, activeTab, requestFilter, currentBranch, downpaymentFilter, refreshRateLevels, dashboardDateRange])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // --- Request Actions ---
    const handleConfirmRequest = async (request: PayrollRequest) => {
        const result = await confirmPayrollRequest(request.id)
        if (result.success) {
            addNotification("Request confirmed", "SUCCESS")
            fetchData()
        } else {
            addNotification(result.error || "Failed to confirm", "ERROR")
        }
    }

    const handleCompleteRequest = async (method: PaymentMethod, referenceNumber?: string, proofFile?: File | null) => {
        if (!processingRequest) return
        const result = await completePayrollRequest(processingRequest.id, {
            payment_method: method,
            reference_number: referenceNumber,
            proof_file: proofFile,
        })
        if (result.success) {
            addNotification("Payment completed", "SUCCESS")
            setProcessingRequest(null)
            fetchData()
        } else {
            addNotification(result.error || "Failed to complete", "ERROR")
        }
    }

    const handleCancelRequest = async (reason: string) => {
        if (!cancellingRequest) return
        const result = await cancelPayrollRequest(cancellingRequest.id, reason)
        if (result.success) {
            addNotification("Request cancelled", "SUCCESS")
            setCancellingRequest(null)
            fetchData()
        } else {
            addNotification(result.error || "Failed to cancel", "ERROR")
        }
    }

    const handleViewDisbursements = async (requestId: string) => {
        if (expandedRequestId === requestId) {
            setExpandedRequestId(null)
            return
        }
        const { getDisbursements } = await import('@/server/actions/payroll-disbursements')
        const result = await getDisbursements(requestId)
        if (result.success) {
            setRequestDisbursementsMap(prev => ({ ...prev, [requestId]: result.data }))
        }
        setExpandedRequestId(requestId)
    }

    // --- Rate Update ---
    const handleUpdateRate = async (
        shopPct: number,
        staffPct: number,
        paymentMode: 'PERCENTAGE' | 'FIXED',
        fixedAmount: number | undefined,
        serviceType: string,
        clientType: string,
        rateLevelId: string,
        isActive: boolean
    ) => {
        if (!editingRate) return
        const result = await updateStaffRate(editingRate.id, {
            shop_percentage: shopPct,
            staff_percentage: staffPct,
            payment_mode: paymentMode,
            fixed_amount: fixedAmount,
            service_type: serviceType,
            client_type: clientType,
            rate_level_id: rateLevelId,
            is_active: isActive,
        })
        if (result.success) {
            addNotification("Rate updated", "SUCCESS")
            setEditingRate(null)
            fetchData()
        } else {
            addNotification(result.error || "Failed to update", "ERROR")
        }
    }

    // --- Rate Create ---
    const handleCreateRate = async (
        rate_name: string,
        service_type: string,
        client_type: string,
        rate_level_id: string,
        shopPct: number,
        staffPct: number,
        paymentMode: 'PERCENTAGE' | 'FIXED',
        fixedAmount?: number
    ) => {
        const result = await createStaffRate({
            rate_name,
            service_type: service_type as 'HAIR' | 'NAILS' | 'FACIAL' | 'BODY_MASSAGE' | 'WAXING' | 'LASH_BROW' | 'MAKEUP',
            client_type: client_type as 'WALKIN' | 'PERSONAL',
            rate_level_id,
            shop_percentage: shopPct,
            staff_percentage: staffPct,
            payment_mode: paymentMode,
            fixed_amount: fixedAmount,
        })
        if (result.success) {
            addNotification("Rate created", "SUCCESS")
            setCreatingRate(false)
            fetchData()
        } else {
            addNotification(result.error || "Failed to create", "ERROR")
        }
    }

    const handleDeactivateRate = async (rateId: string) => {
        const result = await deactivateStaffRate(rateId)
        if (result.success) {
            addNotification("Rate deactivated", "SUCCESS")
            setDeactivatingRate(null)
            fetchData()
        } else {
            addNotification(result.error || "Failed to deactivate rate", "ERROR")
        }
    }

    const handleDeleteRate = async (rateId: string) => {
        const result = await deleteStaffRate(rateId)
        if (result.success) {
            addNotification("Rate deleted", "SUCCESS")
            fetchData()
        } else {
            addNotification(result.error || "Failed to delete rate", "ERROR")
        }
    }

    // --- Rate Level Actions ---
    const handleCreateRateLevel = async (name: string) => {
        const result = await createRateLevel({ name })
        if (result.success) {
            addNotification("Rate level created", "SUCCESS")
            setCreatingRateLevel(false)
            await refreshRateLevels()
        } else {
            addNotification(result.error || "Failed to create rate level", "ERROR")
        }
    }

    const handleUpdateRateLevel = async (id: string, updates: { name?: string; is_active?: boolean; sort_order?: number }) => {
        const result = await updateRateLevel({ id, ...updates })
        if (result.success) {
            addNotification("Rate level updated", "SUCCESS")
            setEditingRateLevel(null)
            await refreshRateLevels()
        } else {
            addNotification(result.error || "Failed to update rate level", "ERROR")
        }
    }

    const handleDeactivateRateLevel = async (id: string) => {
        const result = await deactivateRateLevel(id)
        if (result.success) {
            addNotification("Rate level deactivated", "SUCCESS")
            setDeactivatingRateLevel(null)
            await refreshRateLevels()
        } else {
            addNotification(result.error || "Failed to deactivate rate level", "ERROR")
        }
    }

    // --- Rate Level Delete ---
    const handleDeleteRateLevel = async (id: string) => {
        try {
            await deleteRateLevel(id)
            addNotification("Rate level deleted", "SUCCESS")
            setDeletingRateLevel(null)
            await refreshRateLevels()
        } catch (error) {
            addNotification(
                error instanceof Error ? error.message : "Failed to delete rate level",
                "ERROR"
            )
        }
    }

    // --- Deduction Actions ---
    const handleCreateDeduction = async (
        userId: string,
        amount: number,
        reason: string,
        type: 'ADVANCE' | 'DEDUCTION' | 'ADJUSTMENT'
    ) => {
        let result
        if (type === 'ADVANCE') {
            result = await createAdvance(userId, amount, reason)
        } else {
            result = await createDeduction(userId, amount, reason, type)
        }
        if (result.success) {
            addNotification(`${type.toLowerCase()} created`, "SUCCESS")
            setCreatingDeduction(false)
            fetchData()
        } else {
            addNotification(result.error || "Failed to create", "ERROR")
        }
    }

    const handleOpenStaggeredPayment = async (request: PayrollRequest) => {
        setStaggeredPaymentRequest(request)
        const result = await getExpectedPaymentMethod(request.id)
        const expected = result.success ? result.data?.method : null
        setStaggeredExpectedMethod(expected)
        const { getDisbursements } = await import('@/server/actions/payroll-disbursements')
        const disbResult = await getDisbursements(request.id)
        if (disbResult.success) {
            setRequestDisbursements(disbResult.data)
        }
    }

    const handleCancelDeduction = async (deductionId: string, reason?: string) => {
        const result = await cancelDeduction(deductionId, reason)
        if (result.success) {
            addNotification("Deduction cancelled", "SUCCESS")
            setCancellingDeduction(null)
            fetchData()
        } else {
            addNotification(result.error || "Failed to cancel", "ERROR")
        }
    }

    const handleCreateScheduled = async (
        staffId: string,
        amount: number,
        reason: string,
        frequency: 'MONTHLY' | 'BIMONTHLY' | 'WEEKLY' | 'CUSTOM',
        startDate: string,
        endDate?: string
    ) => {
        const result = await createScheduledPayment({
            staff_id: staffId,
            amount,
            reason,
            frequency,
            start_date: startDate,
            end_date: endDate,
        })
        if (result.success) {
            addNotification("Scheduled payment created", "SUCCESS")
            setCreatingScheduled(false)
            fetchData()
        } else {
            addNotification(result.error || "Failed to create", "ERROR")
        }
    }

    const handleCancelScheduled = async (scheduledId: string, reason?: string) => {
        const result = await cancelDeduction(scheduledId, reason)
        if (result.success) {
            addNotification("Scheduled payment cancelled", "SUCCESS")
            setCancellingScheduled(null)
            fetchData()
        } else {
            addNotification(result.error || "Failed to cancel", "ERROR")
        }
    }

    return (
        <div className='flex-1 w-full flex flex-col h-full overflow-hidden'>
            {/* Header */}
            <div className='mb-4'>
                <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4'>
                    <div className='flex flex-col md:flex-row items-start md:items-center gap-4'>
                        <div>
                            <h1 className='text-xl md:text-2xl font-bold flex items-center gap-2'>
                                <WalletIcon className='w-5 h-5 md:w-6 md:h-6' />
                                Payroll Management
                            </h1>
                            <p className='text-muted-foreground text-xs md:text-sm mt-1'>
                                Manage staff payments and rates
                            </p>
                        </div>
                    </div>
                    <div className='flex gap-2'>
                        {isAdmin && (
                            <AdminActionGuard
                                onAction={() => setManualEntryModal(true)}
                            >
                                <button
                                    className='p-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors border-2 border-border cursor-pointer flex items-center gap-2 px-4'
                                    title='Manual Payroll Entry'
                                >
                                    <PlusIcon className='w-4 h-4' />
                                    <span className='hidden md:inline'>Manual Entry</span>
                                </button>
                            </AdminActionGuard>
                        )}
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
                    </div>
                </div>

                {/* Tabs */}
                <div className='flex flex-wrap gap-1 md:gap-2'>
                    {[
                        {
                            key: "dashboard",
                            label: "Dashboard",
                            shortLabel: "Home",
                            icon: UsersIcon,
                        },
                        {
                            key: "requests",
                            label: "Payment Requests",
                            shortLabel: "Requests",
                            icon: ClockIcon,
                        },
                        {
                            key: "rateConfiguration",
                            label: "Rate Configuration",
                            shortLabel: "Rates",
                            icon: SettingsIcon,
                        },
                        {
                            key: "deductions",
                            label: "Deductions",
                            shortLabel: "Deductions",
                            icon: MinusCircleIcon,
                        },
                        {
                            key: "scheduled",
                            label: "Scheduled",
                            shortLabel: "Scheduled",
                            icon: CalendarIcon,
                        },
                        {
                            key: "downpayments",
                            label: "Downpayments",
                            shortLabel: "DP",
                            icon: BanknoteIcon,
                        },

                    ].map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as TabType)}
                            className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 rounded-md transition-colors ${
                                activeTab === tab.key
                                    ? "bg-muted text-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                        >
                            <tab.icon className='w-4 h-4' />
                            <span className='text-xs md:text-sm font-medium hidden sm:inline'>
                                {tab.label}
                            </span>
                            <span className='text-xs font-medium sm:hidden'>
                                {tab.shortLabel}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className='flex-1 overflow-auto relative'>
                {loading && (
                    <div className='absolute inset-0 z-10 flex items-center justify-center bg-black/60'>
                        <LoaderCircleIcon className='w-8 h-8 animate-spin text-muted-foreground/70' />
                    </div>
                )}
                <>
                        {activeTab === "dashboard" && (
                            <DashboardTab
                                summary={summary}
                                staffSummary={staffSummary}
                                currencySymbol={currencySymbol}
                                dateFrom={dashboardDateRange.dateFrom}
                                dateTo={dashboardDateRange.dateTo}
                                onDateRangeChange={(range) => setDashboardDateRange(range)}
                                onRequestPayout={(entries) => {
                                    if (entries.length > 0) {
                                        setStaffPendingEntries(entries)
                                        const first = entries[0]
                                        setStaffRequestModal({
                                            staffId: first.staff_id || "",
                                            staffName: first.staff?.full_name || "",
                                        })
                                    }
                                }}
                            />
                        )}

                        {/* Requests Tab */}
                        {activeTab === "requests" && (
                            <RequestsTab
                                requests={requests}
                                filter={requestFilter}
                                onFilterChange={setRequestFilter}
                                currencySymbol={currencySymbol}
                                onConfirm={handleConfirmRequest}
                                onConfirmAndDisburse={async (request) => {
                                    setConfirmAndDisburseRequest(request)
                                    setConfirmStep('confirm')
                                }}
                                onComplete={setProcessingRequest}
                                onCancel={setCancellingRequest}
                                onStaggeredPayment={handleOpenStaggeredPayment}
                                onViewDisbursements={handleViewDisbursements}
                                expandedRequestId={expandedRequestId}
                                requestDisbursementsMap={requestDisbursementsMap}
                            />
                        )}

                        {/* Rate Configuration Tab */}
                        {activeTab === "rateConfiguration" && (
                            <RateConfigurationTab
                                rates={rates}
                                allRateLevels={allRateLevels}
                                isAdmin={isAdmin}
                                onEditRate={setEditingRate}
                                onCreateRate={() => setCreatingRate(true)}
                                onDeactivateRate={setDeactivatingRate}
                                onDeleteRate={async (rate) => { await handleDeleteRate(rate.id) }}
                                onCreateLevel={() => setCreatingRateLevel(true)}
                                onEditLevel={setEditingRateLevel}
                                onDeactivateLevel={setDeactivatingRateLevel}
                                onDeleteLevel={setDeletingRateLevel}
                            />
                        )}

                        {/* Deductions Tab */}
                        {activeTab === "deductions" && (
                            <DeductionsTab
                                deductions={deductions}
                                currencySymbol={currencySymbol}
                                isAdmin={isAdmin}
                                onCreate={() => setCreatingDeduction(true)}
                                onCancel={setCancellingDeduction}
                            />
                        )}

                        {/* Scheduled Payments Tab */}
                        {activeTab === "scheduled" && (
                            <ScheduledPaymentsTab
                                scheduledPayments={scheduledPayments}
                                currencySymbol={currencySymbol}
                                isAdmin={isAdmin}
                                onCreate={() => setCreatingScheduled(true)}
                                onCancel={setCancellingScheduled}
                            />
                        )}

                        {/* Downpayments Tab */}
                        {activeTab === "downpayments" && (
                            <DownpaymentsTab
                                downpayments={downpayments}
                                currencySymbol={currencySymbol}
                                isAdmin={isAdmin}
                                filter={downpaymentFilter}
                                onFilterChange={setDownpaymentFilter}
                                onAssign={setAssigningDownpayment}
                            />
                        )}
                    </>
            </div>

            {/* Complete Payment Modal */}
            <AnimatePresence>
                {processingRequest && (
                    <CompletePaymentModal
                        request={processingRequest}
                        currencySymbol={currencySymbol}
                        onClose={() => setProcessingRequest(null)}
                        onComplete={handleCompleteRequest}
                    />
                )}
            </AnimatePresence>

            {/* Staggered Payment Modal */}
            <AnimatePresence>
                {staggeredPaymentRequest && (
                    <StaggeredPaymentModal
                        request={staggeredPaymentRequest}
                        currencySymbol={currencySymbol}
                        existingDisbursements={requestDisbursements}
                        expectedMethod={staggeredExpectedMethod}
                        onClose={() => {
                            setStaggeredPaymentRequest(null)
                            setRequestDisbursements([])
                            setStaggeredExpectedMethod(null)
                        }}
                        onComplete={() => {
                            setStaggeredPaymentRequest(null)
                            setRequestDisbursements([])
                            setStaggeredExpectedMethod(null)
                            fetchData()
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Cancel Request Modal */}
            <AnimatePresence>
                {cancellingRequest && (
                    <CancelRequestModal
                        request={cancellingRequest}
                        onClose={() => setCancellingRequest(null)}
                        onConfirm={handleCancelRequest}
                    />
                )}
            </AnimatePresence>

            {/* Confirm & Disburse Flow */}
            <AnimatePresence>
                {confirmAndDisburseRequest && confirmStep === 'confirm' && (
                    <ConfirmRequestModal
                        request={confirmAndDisburseRequest}
                        currencySymbol={currencySymbol}
                        onClose={() => setConfirmAndDisburseRequest(null)}
                        onConfirm={async () => {
                            const result = await confirmPayrollRequest(confirmAndDisburseRequest.id)
                            if (result.success) {
                                setConfirmStep('disburse')
                            } else {
                                addNotification(result.error || 'Failed to confirm', 'ERROR')
                                setConfirmAndDisburseRequest(null)
                            }
                        }}
                    />
                )}
                {confirmAndDisburseRequest && confirmStep === 'disburse' && (
                    <CompletePaymentModal
                        request={confirmAndDisburseRequest}
                        currencySymbol={currencySymbol}
                        onClose={() => {
                            setConfirmAndDisburseRequest(null)
                            fetchData()
                        }}
                        onComplete={async (method, ref, proof) => {
                            await handleCompleteRequest(method, ref, proof)
                            setConfirmAndDisburseRequest(null)
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Edit Rate Modal */}
            <AnimatePresence>
                {editingRate && (
                    <EditRateModal
                        rate={editingRate}
                        rateLevels={rateLevels}
                        onClose={() => setEditingRate(null)}
                        onSave={handleUpdateRate}
                        onDeactivate={handleDeactivateRate}
                        onDelete={handleDeleteRate}
                        deletable={true}
                        entryCount={0}
                    />
                )}
            </AnimatePresence>

            {/* Create Rate Modal */}
            <AnimatePresence>
                {creatingRate && (
                    <CreateRateModal
                        rateLevels={rateLevels}
                        onClose={() => setCreatingRate(false)}
                        onSave={handleCreateRate}
                    />
                )}
            </AnimatePresence>

            {/* Create Rate Level Modal */}
            <AnimatePresence>
                {creatingRateLevel && (
                    <CreateRateLevelModal
                        onClose={() => setCreatingRateLevel(false)}
                        onSave={handleCreateRateLevel}
                    />
                )}
            </AnimatePresence>

            {/* Edit Rate Level Modal */}
            <AnimatePresence>
                {editingRateLevel && (
                    <EditRateLevelModal
                        rateLevel={editingRateLevel}
                        onClose={() => setEditingRateLevel(null)}
                        onSave={handleUpdateRateLevel}
                    />
                )}
            </AnimatePresence>

            {/* Deactivate Rate Level Modal */}
            <AnimatePresence>
                {deactivatingRateLevel && (
                    <DeactivateRateLevelModal
                        rateLevel={deactivatingRateLevel}
                        onClose={() => setDeactivatingRateLevel(null)}
                        onConfirm={handleDeactivateRateLevel}
                    />
                )}
            </AnimatePresence>

            {/* Delete Rate Level Modal */}
            <AnimatePresence>
                {deletingRateLevel && (
                    <DeleteRateLevelModal
                        rateLevel={deletingRateLevel}
                        referenceCount={{ rates: 0, staff: 0 }}
                        onClose={() => setDeletingRateLevel(null)}
                        onConfirm={handleDeleteRateLevel}
                    />
                )}
            </AnimatePresence>

            {/* Deactivate Rate Modal */}
            <AnimatePresence>
                {deactivatingRate && (
                    <DeactivateRateModal
                        rateName={deactivatingRate.rate_name}
                        onClose={() => setDeactivatingRate(null)}
                        onConfirm={() => handleDeactivateRate(deactivatingRate.id)}
                    />
                )}
            </AnimatePresence>

            {/* Manual Payroll Entry Modal */}
            <AnimatePresence>
                {manualEntryModal && (
                    <ManualPayrollEntryModal
                        onClose={() => setManualEntryModal(false)}
                        onSubmit={async (data) => {
                            const result = await createManualPayrollEntry(data)
                            if (result.success) {
                                addNotification("Manual payroll entry created", "SUCCESS")
                                setManualEntryModal(false)
                                fetchData()
                            } else {
                                addNotification(result.error || "Failed to create entry", "ERROR")
                            }
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Manager Request Payout Modal */}
            <AnimatePresence>
                {staffRequestModal && (
                    <StaffRequestModal
                        staffId={staffRequestModal.staffId}
                        staffName={staffRequestModal.staffName}
                        currencySymbol={currencySymbol}
                        pendingEntries={staffPendingEntries}
                        staffList={staffSummary.map(s => ({ id: s.staff_id, full_name: s.full_name }))}
                        onClose={() => {
                            setStaffRequestModal(null)
                        }}
                        onSuccess={() => {
                            setStaffRequestModal(null)
                            fetchData()
                        }}
                        addNotification={addNotification}
                    />
                )}
            </AnimatePresence>

            {/* Create Deduction Modal */}
            <AnimatePresence>
                {creatingDeduction && (
                    <CreateDeductionModal
                        onClose={() => setCreatingDeduction(false)}
                        onSave={handleCreateDeduction}
                    />
                )}
            </AnimatePresence>

            {/* Cancel Deduction Modal */}
            <AnimatePresence>
                {cancellingDeduction && (
                    <CancelDeductionModal
                        deductionId={cancellingDeduction}
                        onClose={() => setCancellingDeduction(null)}
                        onConfirm={handleCancelDeduction}
                    />
                )}
            </AnimatePresence>

            {/* Create Scheduled Payment Modal */}
            <AnimatePresence>
                {creatingScheduled && (
                    <CreateScheduledPaymentModal
                        onClose={() => setCreatingScheduled(false)}
                        onSave={handleCreateScheduled}
                    />
                )}
            </AnimatePresence>

            {/* Cancel Scheduled Payment Modal */}
            <AnimatePresence>
                {cancellingScheduled && (
                    <CancelScheduledModal
                        scheduledId={cancellingScheduled}
                        onClose={() => setCancellingScheduled(null)}
                        onConfirm={handleCancelScheduled}
                    />
                )}
            </AnimatePresence>

            {/* Create Downpayment Modal */}
            <AnimatePresence>
                {creatingDownpayment && (
                    <CreateDownpaymentModal
                        transactions={[]}
                        staffList={staffSummary.map(s => ({ id: s.staff_id, full_name: s.full_name }))}
                        currencySymbol={currencySymbol}
                        onClose={() => setCreatingDownpayment(false)}
                        onSave={async (
                            transactionId,
                            dpType,
                            amount,
                            percentageRate,
                            estimatedTotal,
                            staffId,
                            payrollSplitMode,
                            notes
                        ) => {
                            const { createDownpayment } = await import('@/server/actions/downpayments')
                            const result = await createDownpayment({
                                transaction_id: transactionId,
                                amount: dpType === 'PERCENTAGE' && estimatedTotal > 0 && percentageRate > 0
                                    ? estimatedTotal * percentageRate / 100
                                    : amount,
                                downpayment_type: dpType,
                                percentage_rate: dpType === 'PERCENTAGE' ? percentageRate : undefined,
                                estimated_total: dpType === 'PERCENTAGE' ? estimatedTotal : undefined,
                                staff_id: staffId,
                                payroll_split_mode: payrollSplitMode,
                                notes: notes || undefined,
                            })
                            if (result) {
                                addNotification("Downpayment created", "SUCCESS")
                                setCreatingDownpayment(false)
                                fetchData()
                            } else {
                                addNotification("Failed to create downpayment", "ERROR")
                            }
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Assign Staff Modal */}
            <AnimatePresence>
                {assigningDownpayment && (
                    <AssignStaffModal
                        staffList={staffSummary.map(s => ({ id: s.staff_id, full_name: s.full_name }))}
                        onClose={() => setAssigningDownpayment(null)}
                        onConfirm={async (staffId, payrollSplitMode) => {
                            const result = await assignStaffToDownpayment({
                                downpayment_id: assigningDownpayment.id,
                                staff_id: staffId,
                                payroll_split_mode: payrollSplitMode,
                            })
                            if (result) {
                                addNotification("Staff assigned to downpayment", "SUCCESS")
                                setAssigningDownpayment(null)
                                fetchData()
                            } else {
                                addNotification("Failed to assign staff", "ERROR")
                            }
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}

// ============================================
// Dashboard Tab Component
// ============================================

function DashboardTab({
    summary,
    staffSummary,
    currencySymbol,
    dateFrom,
    dateTo,
    onDateRangeChange,
    onRequestPayout,
}: {
    summary: PayrollDashboardSummary | null
    staffSummary: StaffPayrollSummaryItem[]
    currencySymbol: string
    dateFrom: string
    dateTo: string
    onDateRangeChange: (range: { dateFrom: string; dateTo: string }) => void
    onRequestPayout: (entries: PayrollEntry[]) => void
}) {
    if (!summary) return null

    return (
        <div className='space-y-6'>
            {/* Date Range Selector */}
            <DateRangeSelector
                value={{ dateFrom, dateTo }}
                onChange={onDateRangeChange}
            />

            {/* Summary Cards */}
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                <div className='bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 md:p-4'>
                    <div className='flex items-center gap-1 md:gap-2 mb-1 md:mb-2'>
                        <ClockIcon className='w-3 h-3 md:w-4 md:h-4 text-yellow-400' />
                        <p className='text-[10px] md:text-xs text-yellow-400 uppercase font-semibold'>
                            Pending
                        </p>
                    </div>
                    <p className='text-lg md:text-xl font-bold text-yellow-300'>
                        {currencySymbol}
                        {summary.pendingAmount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                        })}
                    </p>
                    <p className='text-[10px] md:text-xs text-yellow-400/60'>
                        {summary.pendingCount} entries
                    </p>
                </div>

                <div className='bg-orange-500/10 border border-orange-500/20 rounded-lg p-4'>
                    <div className='flex items-center gap-2 mb-2'>
                        <BanknoteIcon className='w-4 h-4 text-orange-400' />
                        <p className='text-xs text-orange-400 uppercase font-semibold'>
                            Requested
                        </p>
                    </div>
                    <p className='text-xl font-bold text-orange-300'>
                        {currencySymbol}
                        {summary.requestedAmount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                        })}
                    </p>
                    <p className='text-xs text-orange-400/60'>
                        {summary.requestedCount} requests
                    </p>
                </div>

                <div className='bg-blue-500/10 border border-blue-500/20 rounded-lg p-4'>
                    <div className='flex items-center gap-2 mb-2'>
                        <CheckCircleIcon className='w-4 h-4 text-blue-400' />
                        <p className='text-xs text-blue-400 uppercase font-semibold'>
                            Confirmed
                        </p>
                    </div>
                    <p className='text-xl font-bold text-blue-300'>
                        {currencySymbol}
                        {summary.confirmedAmount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                        })}
                    </p>
                    <p className='text-xs text-blue-400/60'>
                        {summary.confirmedCount} ready
                    </p>
                </div>

                <div className='bg-green-500/10 border border-green-500/20 rounded-lg p-4'>
                    <div className='flex items-center gap-2 mb-2'>
                        <WalletIcon className='w-4 h-4 text-green-400' />
                        <p className='text-xs text-green-400 uppercase font-semibold'>
                            Paid (Period)
                        </p>
                    </div>
                    <p className='text-xl font-bold text-green-300'>
                        {currencySymbol}
                        {summary.paidThisMonth.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                        })}
                    </p>
                    <p className='text-xs text-green-400/60'>
                        {summary.paidThisMonthCount} payments
                    </p>
                </div>
            </div>

            {/* Staff Period Earnings */}
            <div>
                <h2 className='text-lg font-semibold mb-3 flex items-center gap-2'>
                    <UsersIcon className='w-5 h-5' />
                    Staff Period Earnings
                </h2>
                {staffSummary.length === 0 ? (
                    <div className='bg-muted rounded-lg p-6 text-center text-muted-foreground'>
                        No staff earnings for this period
                    </div>
                ) : (
                    <div className='grid gap-3'>
                        {staffSummary.map((staff) => (
                            <StaffEarningsRow
                                key={staff.staff_id}
                                staffId={staff.staff_id}
                                staffName={staff.full_name}
                                avatarUrl={staff.avatar_url}
                                totalEarned={staff.total_earned}
                                pendingAmount={staff.pending_amount}
                                paidAmount={staff.paid_amount}
                                dateFrom={dateFrom}
                                dateTo={dateTo}
                                currencySymbol={currencySymbol}
                                onRequestPayout={(entries) => {
                                    onRequestPayout(entries)
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// ============================================
// Requests Tab Component
// ============================================

function RequestsTab({
    requests,
    filter,
    onFilterChange,
    currencySymbol,
    onConfirm: _onConfirm,
    onConfirmAndDisburse,
    onComplete,
    onCancel,
    onStaggeredPayment,
    onViewDisbursements,
    expandedRequestId,
    requestDisbursementsMap,
}: {
    requests: PayrollRequest[]
    filter: "all" | "REQUESTED" | "CONFIRMED" | "COMPLETED"
    onFilterChange: (
        filter: "all" | "REQUESTED" | "CONFIRMED" | "COMPLETED"
    ) => void
    currencySymbol: string
    onConfirm: (request: PayrollRequest) => void
    onConfirmAndDisburse: (request: PayrollRequest) => void
    onComplete: (request: PayrollRequest) => void
    onCancel: (request: PayrollRequest) => void
    onStaggeredPayment: (request: PayrollRequest) => void
    onViewDisbursements: (requestId: string) => void
    expandedRequestId: string | null
    requestDisbursementsMap: Record<string, import("@/utils/types/payroll").PayrollDisbursement[]>
}) {
    // Group requests by staff member
    const groupedByStaff = useMemo(() => {
        const groups: Record<
            string,
            {
                staffName: string
                avatarUrl?: string
                requests: PayrollRequest[]
            }
        > = {}

        requests.forEach((request) => {
            const staffId = request.staff_id
            const staff = request.staff as {
                full_name?: string
                avatar_url?: string
            }
            const staffName = staff?.full_name || "Unknown"
            if (!groups[staffId]) {
                groups[staffId] = {
                    staffName,
                    avatarUrl: staff?.avatar_url,
                    requests: [],
                }
            }
            groups[staffId].requests.push(request)
        })

        return groups
    }, [requests])

    return (
        <div className='space-y-4'>
            {/* Filter */}
            <div className='flex gap-2'>
                {["all", "REQUESTED", "CONFIRMED", "COMPLETED"].map((f) => (
                    <button
                        key={f}
                        onClick={() => onFilterChange(f as typeof filter)}
                        className={`px-3 py-1 rounded-md text-sm transition-colors ${
                            filter === f
                                ? "bg-muted text-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted"
                        }`}
                    >
                        {f === "all"
                            ? "All"
                            : f.charAt(0) + f.slice(1).toLowerCase()}
                    </button>
                ))}
            </div>

            {/* Request List - Grouped by Staff */}
            {requests.length === 0 ? (
                <div className='flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground'>
                    <WalletIcon className='w-8 h-8 opacity-20' />
                    <p className='text-sm'>No payment requests found</p>
                    <p className='text-xs text-muted-foreground/70'>Staff must have pending earnings to create a request</p>
                </div>
            ) : (
                <div className='space-y-4'>
                    {Object.entries(groupedByStaff).map(([staffId, group]) => (
                        <div
                            key={staffId}
                            className='bg-muted rounded-xl p-4'
                        >
                            {/* Staff Header */}
                            <div className='flex items-center gap-3 mb-3 pb-3 border-b border-border'>
                                <div className='w-10 h-10 bg-muted rounded-full flex items-center justify-center text-foreground font-bold overflow-hidden'>
                                    {group.avatarUrl ? (
                                        <NextImage
                                            src={group.avatarUrl}
                                            alt={group.staffName}
                                            width={40}
                                            height={40}
                                            className='w-full h-full object-cover'
                                        />
                                    ) : (
                                        group.staffName.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <div>
                                    <p className='font-semibold'>
                                        {group.staffName}
                                    </p>
                                    <p className='text-xs text-muted-foreground'>
                                        {group.requests.length} request
                                        {group.requests.length !== 1 ? "s" : ""}
                                    </p>
                                </div>
                            </div>

                            {/* Staff's Requests */}
                            <div className='space-y-2'>
                                {group.requests.map((request) => (
                                    <div
                                        key={request.id}
                                        className='bg-muted hover:bg-muted rounded-lg p-3 transition-colors'
                                    >
                                        <div className='flex items-start justify-between'>
                                            <div>
                                                <div className='flex items-center gap-2 mb-1'>
                                                    <span className='text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded'>
                                                        {request.period_type}
                                                    </span>
                                                    <span
                                                        className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[request.status]}`}
                                                    >
                                                        {request.status}
                                                    </span>
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
                                            </div>
                                            <p className='text-lg font-bold text-green-300'>
                                                {currencySymbol}
                                                {Number(
                                                    request.total_staff_cut
                                                ).toLocaleString(undefined, {
                                                    minimumFractionDigits: 2,
                                                })}
                                            </p>
                                        </div>

                                        {/* Actions */}
                                        {(request.status === "REQUESTED" ||
                                            request.status === "CONFIRMED") && (
                                            <div className='flex flex-wrap gap-2 mt-2 pt-2 border-t border-border'>
                                                {request.status === "REQUESTED" && (
                                                    <>
                                                        <AdminActionGuard
                                                            onAction={() => onConfirmAndDisburse(request)}
                                                        >
                                                            <button className='flex items-center gap-1 px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded transition-colors text-xs'>
                                                                <CheckIcon className='w-3 h-3' />
                                                                Confirm & Pay
                                                            </button>
                                                        </AdminActionGuard>
                                                        <AdminActionGuard
                                                            onAction={() => _onConfirm(request)}
                                                        >
                                                            <button className='flex items-center gap-1 px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded transition-colors text-xs border border-blue-500/20'>
                                                                <CheckIcon className='w-3 h-3' />
                                                                Confirm Only
                                                            </button>
                                                        </AdminActionGuard>
                                                        <AdminActionGuard
                                                            onAction={() => onCancel(request)}
                                                        >
                                                            <button className='flex items-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors text-xs'>
                                                                <XCircleIcon className='w-3 h-3' />
                                                                Cancel
                                                            </button>
                                                        </AdminActionGuard>
                                                    </>
                                                )}
                                                {request.status === "CONFIRMED" && (
                                                    <>
                                                        <AdminActionGuard
                                                            onAction={() => onComplete(request)}
                                                        >
                                                            <button className='flex items-center gap-1 px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded transition-colors text-xs'>
                                                                <BanknoteIcon className='w-3 h-3' />
                                                                Disburse
                                                            </button>
                                                        </AdminActionGuard>
                                                        <AdminActionGuard
                                                            onAction={() => onStaggeredPayment(request)}
                                                        >
                                                            <button className='flex items-center gap-1 px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded transition-colors text-xs'>
                                                                <BanknoteIcon className='w-3 h-3' />
                                                                Staggered Pay
                                                            </button>
                                                        </AdminActionGuard>
                                                        <AdminActionGuard
                                                            onAction={() => onCancel(request)}
                                                        >
                                                            <button className='flex items-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors text-xs'>
                                                                <XCircleIcon className='w-3 h-3' />
                                                                Cancel
                                                            </button>
                                                        </AdminActionGuard>
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {request.status === "COMPLETED" && request.payment_method && (
                                            <div className='mt-2 pt-2 border-t border-border'>
                                                <div className='flex items-center gap-2'>
                                                    <span className={`text-xs px-2 py-0.5 rounded border ${PAYROLL_PAYMENT_METHOD_COLORS[request.payment_method] || 'bg-card text-muted-foreground border-border'}`}>
                                                        {getPayrollPaymentMethodLabel(request.payment_method)}
                                                    </span>
                                                    <span className='text-xs text-muted-foreground'>
                                                        Completed {request.completed_at ? new Date(request.completed_at).toLocaleDateString() : ''}
                                                    </span>
                                                    {request.reference_number && (
                                                        <span className='text-xs font-mono text-foreground/90'>
                                                            Ref: {request.reference_number}
                                                        </span>
                                                    )}
                                                    {request.proof_url && (
                                                        <a
                                                            href={request.proof_url}
                                                            target='_blank'
                                                            rel='noopener noreferrer'
                                                            className='inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300'
                                                        >
                                                            <PaperclipIcon className='w-3 h-3' />
                                                            Proof
                                                        </a>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => onViewDisbursements(request.id)}
                                                    className='mt-1 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'
                                                >
                                                    {expandedRequestId === request.id ? 'Hide' : 'View'} Disbursements
                                                </button>
                                                {expandedRequestId === request.id && requestDisbursementsMap[request.id] && (
                                                    <div className='mt-2 space-y-1'>
                                                        {requestDisbursementsMap[request.id].map(d => (
                                                            <div key={d.id} className='flex items-center justify-between text-xs bg-muted rounded p-2'>
                                                                <div className='flex items-center gap-2'>
                                                                    <span className={`px-1.5 py-0.5 rounded ${PAYROLL_PAYMENT_METHOD_COLORS[d.payment_method] || 'bg-card text-muted-foreground'}`}>
                                                                        {getPayrollPaymentMethodLabel(d.payment_method)}
                                                                    </span>
                                                                    <span className='text-foreground/90'>
                                                                        {currencySymbol}{Number(d.amount).toFixed(2)}
                                                                    </span>
                                                                </div>
                                                                <div className='text-muted-foreground'>
                                                                    {d.reference_number && <span className='font-mono mr-2'>Ref: {d.reference_number}</span>}
                                                                    {d.completed_at && new Date(d.completed_at).toLocaleDateString()}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ============================================
// Rates Tab Component
// ============================================

function RatesTab({
    rates,
    isAdmin,
    onEdit,
    onCreate,
    onDeactivate,
    onDelete,
}: {
    rates: PayrollStaffRate[]
    isAdmin: boolean
    onEdit: (rate: PayrollStaffRate) => void
    onCreate: () => void
    onDeactivate: (rate: PayrollStaffRate) => void
    onDelete: (rate: PayrollStaffRate) => Promise<void>
}) {
    // Group rates by service type
    const hairRates = rates.filter((r) => r.service_type === "HAIR")
    const nailsRates = rates.filter((r) => r.service_type === "NAILS")
    const facialRates = rates.filter((r) => r.service_type === "FACIAL")
    const massageRates = rates.filter((r) => r.service_type === "BODY_MASSAGE")
    const waxingRates = rates.filter((r) => r.service_type === "WAXING")
    const lashBrowRates = rates.filter((r) => r.service_type === "LASH_BROW")
    const makeupRates = rates.filter((r) => r.service_type === "MAKEUP")

    const RateTable = ({
        title,
        rateList,
    }: {
        title: string
        rateList: PayrollStaffRate[]
    }) => (
        <div className='mb-6'>
            <h3 className='text-lg font-semibold mb-3'>{title}</h3>
            {rateList.length === 0 ? (
                <div className='flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground'>
                    <SettingsIcon className='w-6 h-6 opacity-20' />
                    <p className='text-sm'>No rates configured</p>
                    <p className='text-xs text-muted-foreground/70'>Create staff rates to configure commission splits</p>
                </div>
            ) : (
                <table className='w-full'>
                    <thead>
                        <tr className='text-left text-xs text-muted-foreground uppercase'>
                            <th className='pb-2'>Client Type</th>
                            <th className='pb-2'>Rate Level</th>
                            <th className='pb-2 text-right'>Shop %</th>
                            <th className='pb-2 text-right'>Staff %</th>
                            {isAdmin && (
                                <th className='pb-2 text-right'>Actions</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {rateList.map((rate) => (
                            <tr
                                key={rate.id}
                                className='border-t border-border'
                            >
                                <td className='py-3 text-sm'>
                                    {rate.client_type}
                                </td>
                                <td className='py-3 text-sm'>
                                    {rate.rate_level_name || rate.rate_level_id || '—'}
                                </td>
                                <td className='py-3 text-sm text-right font-mono text-red-300'>
                                    {rate.shop_percentage}%
                                </td>
                                <td className='py-3 text-sm text-right font-mono text-green-300'>
                                    {rate.staff_percentage}%
                                </td>
                                {isAdmin && (
                                    <td className='py-3 text-right'>
                                        <div className='flex justify-end gap-1'>
                                            <AdminActionGuard
                                                onAction={() => onEdit(rate)}
                                            >
                                                <button
                                                    className='px-2 py-1 text-xs bg-card hover:bg-muted rounded transition-colors'
                                                >
                                                    Edit
                                                </button>
                                            </AdminActionGuard>
                                            {rate.is_active && (
                                                <AdminActionGuard
                                                    onAction={() => onDeactivate(rate)}
                                                >
                                                    <button
                                                        className='px-2 py-1 text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded transition-colors'
                                                    >
                                                        Deactivate
                                                    </button>
                                                </AdminActionGuard>
                                            )}
                                            <AdminActionGuard
                                                onAction={() => onDelete(rate)}
                                            >
                                                <button
                                                    className='px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors'
                                                >
                                                    Delete
                                                </button>
                                            </AdminActionGuard>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    )

    return (
        <div>
            {isAdmin && (
                <div className='flex justify-end mb-4'>
                    <AdminActionGuard onAction={onCreate}>
                        <button className='px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors font-medium flex items-center gap-2'>
                            <PlusIcon className='w-4 h-4' />
                            Create Rate
                        </button>
                    </AdminActionGuard>
                </div>
            )}
            <RateTable
                title='Hair Rates'
                rateList={hairRates}
            />
            <RateTable
                title='Nails Rates'
                rateList={nailsRates}
            />
            <RateTable
                title='Facial Rates'
                rateList={facialRates}
            />
            <RateTable
                title='Body Massage Rates'
                rateList={massageRates}
            />
            <RateTable
                title='Waxing Rates'
                rateList={waxingRates}
            />
            <RateTable
                title='Lash & Brow Rates'
                rateList={lashBrowRates}
            />
            <RateTable
                title='Makeup Rates'
                rateList={makeupRates}
            />
        </div>
    )
}



// ============================================
// Deductions Tab Component
// ============================================

const DEDUCTION_STATUS_COLORS: Record<string, string> = {
    PENDING: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30",
    DEDUCTED: "bg-green-400/20 text-green-300 border-green-400/30",
    CANCELLED: "bg-red-400/20 text-red-300 border-red-400/30",
}

const DEDUCTION_TYPE_COLORS: Record<string, string> = {
    ADVANCE: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    DEDUCTION: "bg-red-500/20 text-red-300 border-red-500/30",
    ADJUSTMENT: "bg-purple-500/20 text-purple-300 border-purple-500/30",
}

function DeductionsTab({
    deductions,
    currencySymbol,
    isAdmin,
    onCreate,
    onCancel,
}: {
    deductions: DeductionWithStaff[]
    currencySymbol: string
    isAdmin: boolean
    onCreate: () => void
    onCancel: (deductionId: string) => void
}) {
    return (
        <div className='space-y-4'>
            {isAdmin && (
                <div className='flex justify-end'>
                    <AdminActionGuard onAction={onCreate}>
                        <button className='px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors font-medium flex items-center gap-2'>
                            <PlusIcon className='w-4 h-4' />
                            Create Deduction
                        </button>
                    </AdminActionGuard>
                </div>
            )}

            {deductions.length === 0 ? (
                <div className='flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground'>
                    <PercentIcon className='w-8 h-8 opacity-20' />
                    <p className='text-sm'>No deductions found</p>
                    <p className='text-xs text-muted-foreground/70'>Use &apos;Create Deduction&apos; to add a new deduction</p>
                </div>
            ) : (
                <div className='bg-muted rounded-xl overflow-hidden'>
                    <table className='w-full'>
                        <thead>
                            <tr className='text-left text-xs text-muted-foreground uppercase border-b border-border'>
                                <th className='p-4'>Staff</th>
                                <th className='p-4'>Type</th>
                                <th className='p-4 text-right'>Amount</th>
                                <th className='p-4'>Reason</th>
                                <th className='p-4'>Status</th>
                                <th className='p-4'>Date</th>
                                {isAdmin && <th className='p-4 text-right'>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {deductions.map((deduction) => (
                                <tr
                                    key={deduction.id}
                                    className='border-b border-border hover:bg-muted transition-colors'
                                >
                                    <td className='p-4'>
                                        <div className='flex items-center gap-2'>
                                            <div className='w-8 h-8 bg-muted rounded-full flex items-center justify-center text-foreground font-bold text-sm overflow-hidden'>
                                                {deduction.staff_avatar_url ? (
                                                    <NextImage
                                                        src={deduction.staff_avatar_url}
                                                        alt={deduction.staff_name || 'Staff'}
                                                        width={32}
                                                        height={32}
                                                        className='w-full h-full object-cover'
                                                    />
                                                ) : (
                                                    (deduction.staff_name || 'U').charAt(0).toUpperCase()
                                                )}
                                            </div>
                                            <span className='font-medium'>
                                                {deduction.staff_name || 'Unknown'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className='p-4'>
                                        <span className={`text-xs px-2 py-0.5 rounded border ${DEDUCTION_TYPE_COLORS[deduction.type]}`}>
                                            {deduction.type}
                                        </span>
                                    </td>
                                    <td className='p-4 text-right font-mono'>
                                        <span className={deduction.type === 'ADVANCE' ? 'text-blue-300' : 'text-red-300'}>
                                            {deduction.type === 'ADVANCE' ? '+' : '-'}
                                            {currencySymbol}
                                            {Number(deduction.amount).toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                            })}
                                        </span>
                                    </td>
                                    <td className='p-4 text-sm text-foreground/90 max-w-[200px] truncate'>
                                        {deduction.reason || '-'}
                                    </td>
                                    <td className='p-4'>
                                        <span className={`text-xs px-2 py-0.5 rounded border ${DEDUCTION_STATUS_COLORS[deduction.status]}`}>
                                            {deduction.status}
                                        </span>
                                    </td>
                                    <td className='p-4 text-sm text-muted-foreground'>
                                        {new Date(deduction.created_at).toLocaleDateString()}
                                    </td>
                                    {isAdmin && (
                                        <td className='p-4 text-right'>
                                            {deduction.status === 'PENDING' && (
                                                <AdminActionGuard
                                                    onAction={() => onCancel(deduction.id)}
                                                >
                                                    <button className='px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors'>
                                                        Cancel
                                                    </button>
                                                </AdminActionGuard>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

// ============================================
// Scheduled Payments Tab
// ============================================

function ScheduledPaymentsTab({
    scheduledPayments,
    currencySymbol,
    isAdmin,
    onCreate,
    onCancel,
}: {
    scheduledPayments: ScheduledPaymentWithStaff[]
    currencySymbol: string
    isAdmin: boolean
    onCreate: () => void
    onCancel: (scheduledId: string) => void
}) {
    const FREQUENCY_LABELS: Record<string, string> = {
        MONTHLY: 'Monthly',
        BIMONTHLY: 'Bimonthly',
        WEEKLY: 'Weekly',
        CUSTOM: 'Custom',
    }

    return (
        <div className='space-y-4'>
            {isAdmin && (
                <div className='flex justify-end'>
                    <AdminActionGuard onAction={onCreate}>
                        <button className='px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors font-medium flex items-center gap-2'>
                            <PlusIcon className='w-4 h-4' />
                            Create Scheduled Payment
                        </button>
                    </AdminActionGuard>
                </div>
            )}

            {scheduledPayments.length === 0 ? (
                <div className='flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground'>
                    <CalendarIcon className='w-8 h-8 opacity-20' />
                    <p className='text-sm'>No scheduled payments found</p>
                    <p className='text-xs text-muted-foreground/70'>Schedule payments from the payment requests tab</p>
                </div>
            ) : (
                <div className='bg-muted rounded-xl overflow-hidden'>
                    <table className='w-full'>
                        <thead>
                            <tr className='text-left text-xs text-muted-foreground uppercase border-b border-border'>
                                <th className='p-4'>Staff</th>
                                <th className='p-4'>Amount</th>
                                <th className='p-4'>Frequency</th>
                                <th className='p-4'>Start Date</th>
                                <th className='p-4'>End Date</th>
                                <th className='p-4'>Status</th>
                                {isAdmin && <th className='p-4 text-right'>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {scheduledPayments.map((payment) => (
                                <tr
                                    key={payment.id}
                                    className='border-b border-border hover:bg-muted transition-colors'
                                >
                                    <td className='p-4'>
                                        <div className='flex items-center gap-2'>
                                            <div className='w-8 h-8 bg-muted rounded-full flex items-center justify-center text-foreground font-bold text-sm overflow-hidden'>
                                                {payment.staff_avatar_url ? (
                                                    <NextImage
                                                        src={payment.staff_avatar_url}
                                                        alt={payment.staff_name || 'Staff'}
                                                        width={32}
                                                        height={32}
                                                        className='w-full h-full object-cover'
                                                    />
                                                ) : (
                                                    (payment.staff_name || 'U').charAt(0).toUpperCase()
                                                )}
                                            </div>
                                            <span className='font-medium'>
                                                {payment.staff_name || 'Unknown'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className='p-4 text-right font-mono text-blue-300'>
                                        {currencySymbol}
                                        {Number(payment.scheduled_amount || payment.amount).toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                        })}
                                    </td>
                                    <td className='p-4'>
                                        <span className='text-xs px-2 py-0.5 rounded border bg-purple-500/20 text-purple-300 border-purple-500/30'>
                                            {payment.recurrence_rule?.frequency
                                                ? FREQUENCY_LABELS[payment.recurrence_rule.frequency] || payment.recurrence_rule.frequency
                                                : '-'}
                                        </span>
                                    </td>
                                    <td className='p-4 text-sm text-foreground/90'>
                                        {payment.recurrence_rule?.startDate
                                            ? new Date(payment.recurrence_rule.startDate).toLocaleDateString()
                                            : '-'}
                                    </td>
                                    <td className='p-4 text-sm text-foreground/90'>
                                        {payment.recurrence_rule?.endDate
                                            ? new Date(payment.recurrence_rule.endDate).toLocaleDateString()
                                            : 'Indefinite'}
                                    </td>
                                    <td className='p-4'>
                                        <span className={`text-xs px-2 py-0.5 rounded border ${DEDUCTION_STATUS_COLORS[payment.status]}`}>
                                            {payment.status}
                                        </span>
                                    </td>
                                    {isAdmin && (
                                        <td className='p-4 text-right'>
                                            {payment.status === 'PENDING' && (
                                                <AdminActionGuard
                                                    onAction={() => onCancel(payment.id)}
                                                >
                                                    <button className='px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors'>
                                                        Cancel
                                                    </button>
                                                </AdminActionGuard>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

const DOWNPAYMENT_STATUS_COLORS: Record<string, string> = {
    DOWNPAYMENT_PENDING: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30",
    DOWNPAYMENT_ASSIGNED: "bg-blue-400/20 text-blue-300 border-blue-400/30",
    SETTLED: "bg-green-400/20 text-green-300 border-green-400/30",
}

// ============================================
// Rate Levels Tab Component
// ============================================

function RateLevelsTab({
    rateLevels,
    isAdmin,
    onCreate,
    onEdit,
    onDeactivate,
    onDelete,
}: {
    rateLevels: RateLevelItem[]
    isAdmin: boolean
    onCreate: () => void
    onEdit: (level: RateLevelItem) => void
    onDeactivate: (level: RateLevelItem) => void
    onDelete: (level: RateLevelItem) => void
}) {
    return (
        <div className='space-y-4'>
            <div className='flex justify-between items-center'>
                <p className='text-muted-foreground text-sm'>Manage rate levels that determine commission splits for staff.</p>
                {isAdmin && (
                    <AdminActionGuard onAction={onCreate}>
                        <button className='px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors font-medium flex items-center gap-2'>
                            <PlusIcon className='w-4 h-4' />
                            Create Level
                        </button>
                    </AdminActionGuard>
                )}
            </div>

            <div className='rounded-lg border border-border overflow-hidden'>
                <table className='w-full'>
                    <thead className='bg-muted'>
                        <tr>
                            <th className='text-left px-4 py-3 text-sm font-semibold text-muted-foreground'>Name</th>
                            <th className='text-left px-4 py-3 text-sm font-semibold text-muted-foreground'>Slug</th>
                            <th className='text-left px-4 py-3 text-sm font-semibold text-muted-foreground'>Status</th>
                            <th className='text-left px-4 py-3 text-sm font-semibold text-muted-foreground'>Sort Order</th>
                            {isAdmin && (
                                <th className='text-right px-4 py-3 text-sm font-semibold text-muted-foreground'>Actions</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {rateLevels.map((level) => (
                            <tr
                                key={level.id}
                                className={`border-t border-border ${!level.is_active ? 'opacity-50' : 'hover:bg-muted'}`}
                            >
                                <td className='px-4 py-3 text-sm font-medium'>{level.name}</td>
                                <td className='px-4 py-3 text-sm text-muted-foreground font-mono'>{level.slug}</td>
                                <td className='px-4 py-3'>
                                    {level.is_active ? (
                                        <span className='px-2 py-0.5 rounded text-xs font-semibold bg-green-500/30 text-green-300'>Active</span>
                                    ) : (
                                        <span className='px-2 py-0.5 rounded text-xs font-semibold bg-red-500/30 text-red-300'>Inactive</span>
                                    )}
                                </td>
                                <td className='px-4 py-3 text-sm font-mono'>{level.sort_order}</td>
                                {isAdmin && (
                                    <td className='px-4 py-3 text-right'>
                                        <div className='flex justify-end gap-2'>
                                            <AdminActionGuard
                                                onAction={() => onEdit(level)}
                                            >
                                                <button
                                                    className='px-2 py-1 text-xs bg-card hover:bg-muted rounded transition-colors'
                                                >
                                                    Edit
                                                </button>
                                            </AdminActionGuard>
                                            {level.is_active && (
                                                <AdminActionGuard
                                                    onAction={() => onDeactivate(level)}
                                                >
                                                    <button
                                                        className='px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors'
                                                    >
                                                        Deactivate
                                                    </button>
                                                </AdminActionGuard>
                                            )}
                                            <AdminActionGuard
                                                onAction={() => onDelete(level)}
                                            >
                                                <button
                                                    className='px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors'
                                                >
                                                    Delete
                                                </button>
                                            </AdminActionGuard>
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                        {rateLevels.length === 0 && (
                            <tr>
                                <td colSpan={isAdmin ? 5 : 4} className='px-4 py-8 text-center text-muted-foreground/70'>
                                    No rate levels found. Create one to get started.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// ============================================
// Rate Configuration Tab (Merged Rates + Rate Levels)
// ============================================

function RateConfigurationTab({
    rates,
    allRateLevels,
    isAdmin,
    onEditRate,
    onCreateRate,
    onDeactivateRate,
    onDeleteRate,
    onCreateLevel,
    onEditLevel,
    onDeactivateLevel,
    onDeleteLevel,
}: {
    rates: PayrollStaffRate[]
    allRateLevels: RateLevelItem[]
    isAdmin: boolean
    onEditRate: (rate: PayrollStaffRate) => void
    onCreateRate: () => void
    onDeactivateRate: (rate: PayrollStaffRate) => void
    onDeleteRate: (rate: PayrollStaffRate) => Promise<void>
    onCreateLevel: () => void
    onEditLevel: (level: RateLevelItem) => void
    onDeactivateLevel: (level: RateLevelItem) => void
    onDeleteLevel: (level: RateLevelItem) => void
}) {
    const [view, setView] = useState<"staffRates" | "rateLevels">("staffRates")

    return (
        <div className='space-y-4'>
            {/* View Toggle */}
            <div className='flex gap-1 p-1 bg-muted rounded-lg w-fit'>
                <button
                    onClick={() => setView("staffRates")}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        view === "staffRates"
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                >
                    Staff Rates
                </button>
                <button
                    onClick={() => setView("rateLevels")}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        view === "rateLevels"
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                >
                    Rate Levels
                </button>
            </div>

            {/* Content based on selected view */}
            {view === "staffRates" ? (
                <RatesTab
                    rates={rates}
                    isAdmin={isAdmin}
                    onEdit={onEditRate}
                    onCreate={onCreateRate}
                    onDeactivate={onDeactivateRate}
                    onDelete={onDeleteRate}
                />
            ) : (
                <RateLevelsTab
                    rateLevels={allRateLevels}
                    isAdmin={isAdmin}
                    onCreate={onCreateLevel}
                    onEdit={onEditLevel}
                    onDeactivate={onDeactivateLevel}
                    onDelete={onDeleteLevel}
                />
            )}
        </div>
    )
}

// ============================================
// Downpayments Tab Component
// ============================================

function DownpaymentsTab({
    downpayments,
    currencySymbol,
    isAdmin,
    filter,
    onFilterChange,
    onAssign,
}: {
    downpayments: Downpayment[]
    currencySymbol: string
    isAdmin: boolean
    filter: "all" | "unassigned" | "settled"
    onFilterChange: (filter: "all" | "unassigned" | "settled") => void
    onAssign: (downpayment: Downpayment) => void
}) {
    const totalDownpayments = downpayments.reduce((s, d) => s + d.amount, 0)
    const unassignedCount = downpayments.filter((d) => !d.staff_id && !d.is_settled).length
    const settledCount = downpayments.filter((d) => d.is_settled).length

    return (
        <div className='space-y-4'>
            {/* Summary Cards */}
            <div className='grid grid-cols-3 gap-4'>
                <div className='bg-muted border border-border rounded-lg p-4'>
                    <p className='text-xs text-muted-foreground uppercase font-semibold'>Total</p>
                    <p className='text-lg font-bold text-foreground'>
                        {currencySymbol}{totalDownpayments.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className='text-xs text-muted-foreground/70'>{downpayments.length} entries</p>
                </div>
                <div className='bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4'>
                    <p className='text-xs text-yellow-400 uppercase font-semibold'>Unassigned</p>
                    <p className='text-lg font-bold text-yellow-300'>{unassignedCount}</p>
                </div>
                <div className='bg-green-500/10 border border-green-500/20 rounded-lg p-4'>
                    <p className='text-xs text-green-400 uppercase font-semibold'>Settled</p>
                    <p className='text-lg font-bold text-green-300'>{settledCount}</p>
                </div>
            </div>

            {/* Filters */}
            <div className='flex gap-2'>
                {(["all", "unassigned", "settled"] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => onFilterChange(f)}
                        className={`px-3 py-1 rounded-md text-sm transition-colors ${
                            filter === f
                                ? "bg-muted text-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted"
                        }`}
                    >
                        {f === "all" ? "All" : f === "unassigned" ? "Unassigned" : "Settled"}
                    </button>
                ))}
            </div>

            {/* Table */}
            {downpayments.length === 0 ? (
                <div className='bg-muted rounded-lg p-8 text-center text-muted-foreground'>
                    No downpayments found
                </div>
            ) : (
                <div className='bg-muted rounded-xl overflow-hidden'>
                    <table className='w-full'>
                        <thead>
                            <tr className='text-left text-xs text-muted-foreground uppercase border-b border-border'>
                                <th className='p-4'>Transaction</th>
                                <th className='p-4 text-right'>Amount</th>
                                <th className='p-4'>Type</th>
                                <th className='p-4'>Staff</th>
                                <th className='p-4'>Split Mode</th>
                                <th className='p-4'>Status</th>
                                {isAdmin && <th className='p-4 text-right'>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {downpayments.map((dp) => (
                                <tr
                                    key={dp.id}
                                    className='border-b border-border hover:bg-muted transition-colors'
                                >
                                    <td className='p-4 text-sm font-mono text-foreground/90'>
                                        {dp.transaction_id.slice(0, 8)}...
                                    </td>
                                    <td className='p-4 text-right font-mono text-foreground'>
                                        {currencySymbol}{dp.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className='p-4'>
                                        <span className='text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30'>
                                            {dp.downpayment_type}
                                        </span>
                                    </td>
                                    <td className='p-4 text-sm text-muted-foreground'>
                                        {dp.staff_id ? dp.staff_id.slice(0, 8) + '...' : <span className='text-yellow-400'>Unassigned</span>}
                                    </td>
                                    <td className='p-4 text-sm text-muted-foreground'>
                                        {dp.payroll_split_mode}
                                    </td>
                                    <td className='p-4'>
                                        <span className={`text-xs px-2 py-0.5 rounded border ${
                                            dp.is_settled
                                                ? DOWNPAYMENT_STATUS_COLORS.SETTLED
                                                : dp.staff_id
                                                    ? DOWNPAYMENT_STATUS_COLORS.DOWNPAYMENT_ASSIGNED
                                                    : DOWNPAYMENT_STATUS_COLORS.DOWNPAYMENT_PENDING
                                        }`}>
                                            {dp.is_settled ? "SETTLED" : dp.staff_id ? "ASSIGNED" : "PENDING"}
                                        </span>
                                    </td>
                                    {isAdmin && (
                                        <td className='p-4 text-right'>
                                            {!dp.staff_id && !dp.is_settled && (
                                                <button
                                                    onClick={() => onAssign(dp)}
                                                    className='px-2 py-1 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded transition-colors'
                                                >
                                                    Assign Staff
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}




