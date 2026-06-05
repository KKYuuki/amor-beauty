"use client"

import Link from "next/link"
import { SideBarContext } from "@/components/sidebar"
import { normalizeFlag } from "@/utils/auth/access-flags"
import {
    BanknoteIcon,
    BoxIcon,
    CalendarFoldIcon,
    ClipboardClockIcon,
    ClockIcon,
    FileBoxIcon,
    LoaderCircleIcon,
    ImageIcon,
    CircleDollarSignIcon,
    HomeIcon,
    UserIcon,
} from "lucide-react"
import { Component, ErrorInfo, ReactNode, useCallback, useContext, useEffect, useState, useMemo } from "react"
import { getInventory } from "@/server/actions/inventory"
import { InventoryItem } from "@/utils/types/inventory"

import { Appointment } from "@/utils/types/general"
import { getTodaySummary, GetTodaySummaryResult } from "@/server/actions/transactions"
import { FinancialMetrics, getFinancialMetrics } from "@/server/actions/metrics"

import { AnimatePresence, motion } from "motion/react"
import WalkinAppointmentModal from "@/components/appointments/WalkinAppointmentModal"
import StatsGrid from "@/components/ui/StatsGrid"
import StatCard from "@/components/ui/StatCard"
import TimeClockWidget from "@/components/dashboard/timeClockWidget"
import {
    getUserAppointments,
    getMonthlyAppointments,
} from "@/server/actions/appointments"

import { UserProfile } from "@/utils/types/auth"
import { useBranchContext } from "@/components/branch-context"
import { getSetting } from "@/server/actions/settings"
import { CurrencyTaxValue } from "@/utils/types/settings"

export interface DashboardData {
    staff?: {
        inventory: InventoryItem[]
        appointments: Appointment[]
        dailySales: { totalRevenue: number; completedCount: number; pendingCount: number; itemsSold: number; servicesRendered: number }
    }
    admin?: {
        inventory: InventoryItem[]
        appointments: Appointment[]
        dailySales: { totalRevenue: number; completedCount: number; pendingCount: number; itemsSold: number; servicesRendered: number }
        financialMetrics: FinancialMetrics
    }
}

interface DashboardClientProps {
    initialData?: DashboardData
    userProfile?: UserProfile
}

export default function DashboardClient({
    initialData,
    userProfile,
}: DashboardClientProps) {
    // Context
    const { userInfo: contextUserInfo } = useContext(SideBarContext)
    const userInfo = contextUserInfo.id
        ? contextUserInfo
        : userProfile || contextUserInfo

    const renderDashboard = () => {
        // Dispatch directly by role, not just admin vs non-admin
        const role = userInfo.role

        const content = role === "admin" ? (
            <AdminDashboard initialData={initialData?.admin} userProfile={userInfo} />
        ) : role === "manager" ? (
            <ManagerDashboard initialData={initialData?.staff} userProfile={userInfo} />
        ) : role === "artist" ? (
            <ArtistDashboard initialData={initialData?.staff} userProfile={userInfo} />
        ) : (
            <StaffDashboard initialData={initialData?.staff} userProfile={userInfo} />
        )

        return (
            <DashboardErrorBoundary>
                {content}
            </DashboardErrorBoundary>
        )
    }

    return (
        <div className='w-full flex-1 flex flex-col gap-4 @container overflow-y-auto'>
            <div className='flex flex-row gap-2 w-full justify-between flex-wrap'>
                <div>
                    <h1 className='text-2xl font-bold flex items-center gap-2'>
                        <HomeIcon className='w-6 h-6' />
                        Dashboard
                    </h1>
                    <p className='text-white/60 text-sm mt-1'>
                        Welcome back, {userInfo.full_name}
                    </p>
                </div>

            </div>
            {renderDashboard()}
        </div>
    )
}

// Currency formatter hook
function useCurrencySettings() {
    const [currencySettings, setCurrencySettings] = useState<{
        locale: string
        currency: string
        symbol: string
    }>({
        locale: "en-PH",
        currency: "PHP",
        symbol: "₱",
    })

    useEffect(() => {
        const fetchCurrencySettings = async () => {
            const result = await getSetting("currency_tax")
            if (result?.success && result.data) {
                const data = result.data as CurrencyTaxValue
                setCurrencySettings({
                    locale: "en-US", // Use en-US for consistent number formatting
                    currency: "PHP",
                    symbol: data.currency_symbol || "₱",
                })
            }
        }

        fetchCurrencySettings()
    }, [])

    const formatCurrency = useCallback(
        (value: number) => {
            return new Intl.NumberFormat(currencySettings.locale, {
                style: "currency",
                currency: currencySettings.currency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(value)
        },
        [currencySettings]
    )

    return { formatCurrency, symbol: currencySettings.symbol }
}

interface StaffDashboardProps {
    initialData?: DashboardData["staff"]
    userProfile: UserProfile
}

function StaffDashboard({ initialData, userProfile }: StaffDashboardProps) {
    // Context
    const { userInfo: contextUserInfo } = useContext(SideBarContext)
    const userInfo = userProfile || contextUserInfo
    const { currentBranch } = useBranchContext()

    // State
    // -- Page
    const [loading, setLoading] = useState(!initialData)
    // -- Database
    const [inventory, setInventory] = useState<InventoryItem[]>(
        initialData?.inventory || [],
    )
    const [appointments, setAppointments] = useState<Appointment[]>(
        initialData?.appointments || [],
    )

    // -- Modals
    const [walkinModal, setWalkinModal] = useState(false)

    // Branch filtering
    const filteredInventory = useMemo(() => {
        if (!currentBranch?.id) return inventory
        return inventory.filter(
            (inv) => !inv.branch_id || inv.branch_id === currentBranch.id
        )
    }, [inventory, currentBranch])

    const filteredAppointments = useMemo(() => {
        if (!currentBranch?.id) return appointments
        return appointments.filter(
            (ap) => !ap.branch_id || ap.branch_id === currentBranch.id
        )
    }, [appointments, currentBranch])

    // Handlers
    const fetchInventoryItems = useCallback(async () => {
        await getInventory().then((items) => {
            if (items) setInventory(items)
        })
    }, [setInventory])

    const fetchAppointments = useCallback(async () => {
        // Get appointments for user
        const res = await getUserAppointments(userInfo.id)
        if (res.success && res.data) {
            setAppointments(res.data)
        }
    }, [setAppointments, userInfo.id])

    const getValues = useCallback(async () => {
        if (initialData) {
            setLoading(false)
            return
        }
        await fetchInventoryItems()
        await fetchAppointments()
        setLoading(false)
    }, [fetchAppointments, fetchInventoryItems, initialData])

    // Effects
    useEffect(() => {
        getValues()
    }, [getValues])

    // Loading
    if (loading) {
        return (
            <div
                key='appointment-loading'
                className='w-full flex-1 flex items-center justify-center select-none'
            >
                <LoaderCircleIcon
                    size={24}
                    className='animate-spin ease-in-out'
                />
            </div>
        )
    }

    // Render
    return (
        <>
            <AnimatePresence>
                {walkinModal && (
                    <WalkinAppointmentModal
                        isOpen={walkinModal}
                        onClose={() => setWalkinModal(false)}
                        onSuccess={() => {
                            fetchAppointments()
                            setWalkinModal(false)
                        }}
                    />
                )}
            </AnimatePresence>
            <div className='w-full flex-1 overflow-y-auto flex flex-col gap-4'>
                {/* Time Clock Hero - Full Width */}
                <TimeClockWidget staffId={userInfo.id} />

                {/* Stats Row */}
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <StatCard
                        label='Appointments'
                        value={filteredAppointments.length}
                        icon={
                            <ClipboardClockIcon
                                size={42}
                                className='stroke-white'
                            />
                        }
                    />

                    {/* Quick Actions - Staff Only */}
                    <div className='md:col-span-2 flex flex-col gap-2 bg-white/10 p-4 border-2 border-white/5 rounded-lg select-none'>
                        <div className='flex flex-row gap-2 flex-1'>
                            <button
                                onClick={() => setWalkinModal(true)}
                                className='flex-1 flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border-2 border-green-500/20 rounded-md transition-colors'
                            >
                                <UserIcon
                                    size={24}
                                    className='text-green-400'
                                />
                                <span className='text-xs font-medium'>
                                    + Walk-in
                                </span>
                            </button>
                            <a
                                href='/images'
                                className='flex-1 flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border-2 border-white/5 rounded-md transition-colors'
                            >
                                <ImageIcon
                                    size={24}
                                    className='text-blue-400'
                                />
                                <span className='text-xs font-medium'>Gallery</span>
                            </a>
                        </div>
                    </div>
                </div>

                {/* Upcoming */}
                <div
                    title='Upcoming Appointments'
                    className='flex flex-col gap-2 bg-white/10 p-4 border-2 border-white/5 rounded-lg select-none'
                >
                    <div className='flex flex-row gap-2 w-full justify-between items-top'>
                        <span className='text-white/60 font-medium text-sm'>
                            Upcoming Appointments
                        </span>
                        <a
                            title='View Appointments'
                            className='px-4 py-1 bg-white/5 rounded-md border-2 border-white/10 hover:bg-white/10 transition-colors cursor-pointer'
                            href={`/appointments`}
                            target='_blank'
                        >
                            View Appointments
                        </a>
                    </div>
                    <div className='flex-1 flex flex-col overflow-y-auto max-h-[400px]'>
                        {filteredAppointments
                            .filter(
                                (ap) =>
                                    ap.status === "CONFIRMED" &&
                                    (ap.staff_id === userInfo.id ||
                                        ap.client_id === userInfo.id) &&
                                    new Date(ap.time_start).getTime() >
                                        Date.now(),
                            )
                            .map((appointment) => (
                                <AppointmentContainer
                                    key={appointment.id + "-all"}
                                    appointment={appointment}
                                />
                            ))}
                    </div>
                </div>
                {/* Inventory */}
                {userInfo.access_flags?.some(f => normalizeFlag(f) === "inventory_manage") && (
                    <div className='flex flex-col gap-2 bg-white/10 p-4 border-2 border-white/5 rounded-lg select-none'>
                        <div className='flex flex-row gap-2 w-full justify-between items-top'>
                            <span className='text-white/60 font-medium text-sm'>
                                Inventory Alerts
                            </span>
                            <a
                                title='View Inventory'
                                className='px-4 py-1 bg-white/5 rounded-md border-2 border-white/10 hover:bg-white/10 transition-colors cursor-pointer'
                                href={`/inventory`}
                            >
                                View Inventory
                            </a>
                        </div>
                        <div className='flex-1 flex flex-col overflow-y-auto'>
                            {filteredInventory
                                .filter(
                                    (inv) =>
                                        inv.stock_warning_threshold &&
                                        inv.current_stock <=
                                            inv.stock_warning_threshold,
                                )
                                .map((inv, idx) => (
                                    <motion.div
                                        key={idx + "-inv"}
                                        className='flex flex-col gap-2 items-center p-2 border-2 border-transparent transition-colors hover:border-white/5 rounded-md cursor-pointer hover:bg-white/10 active:bg-white/20'
                                    >
                                        <div className='w-full flex flex-row justify-between items-center'>
                                            <span className='font-medium flex flex-row gap-1'>
                                                {inv.name}
                                            </span>
                                            <span className='font-semibold capitalize px-2 bg-red-400/20 text-white/80 rounded-sm border-2 border-white/5'>
                                                Low Stock
                                            </span>
                                        </div>
                                        <div className='w-full flex flex-row justify-between'>
                                            <span
                                                className='text-xs font-semibold text-white/60 flex flex-row gap-1 items-center'
                                                title='Item Code'
                                            >
                                                <FileBoxIcon size={16} />
                                                {inv.item_code}
                                            </span>
                                            <span
                                                className='text-xs font-semibold text-white/60 flex flex-row gap-1 items-center'
                                                title={`Minimum Stock ${inv.stock_warning_threshold ?? 0}`}
                                            >
                                                <BoxIcon size={16} />
                                                {inv.current_stock}
                                            </span>
                                        </div>
                                    </motion.div>
                                ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}

function ArtistDashboard({ initialData, userProfile }: StaffDashboardProps) {
    const { userInfo: contextUserInfo } = useContext(SideBarContext)
    const userInfo = userProfile || contextUserInfo

    const [appointments, setAppointments] = useState<Appointment[]>(
        initialData?.appointments || [],
    )
    const [loading, setLoading] = useState(!initialData)
    const [walkinModal, setWalkinModal] = useState(false)

    const fetchAppointments = useCallback(async () => {
        const res = await getUserAppointments(userInfo.id)
        if (res.success && res.data) {
            setAppointments(res.data)
        }
    }, [userInfo.id])

    useEffect(() => {
        if (initialData) { setLoading(false); return }
        fetchAppointments().then(() => setLoading(false))
    }, [fetchAppointments, initialData])

    if (loading) {
        return (
            <div className='w-full flex-1 flex items-center justify-center select-none'>
                <LoaderCircleIcon size={24} className='animate-spin ease-in-out' />
            </div>
        )
    }

    return (
        <>
            <AnimatePresence>
                {walkinModal && (
                    <WalkinAppointmentModal
                        isOpen={walkinModal}
                        onClose={() => setWalkinModal(false)}
                        onSuccess={() => { fetchAppointments(); setWalkinModal(false) }}
                    />
                )}
            </AnimatePresence>
            <div className='w-full flex-1 overflow-y-auto flex flex-col gap-4'>
                <TimeClockWidget staffId={userInfo.id} />
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <div className='bg-white/10 p-4 border-2 border-white/5 rounded-lg flex flex-col gap-2'>
                        <ClipboardClockIcon size={42} className='stroke-white' />
                        <span className='text-white/60 font-medium text-sm'>My Appointments</span>
                        <span className='text-2xl font-bold'>{appointments.length}</span>
                    </div>
                    <div className='md:col-span-2 flex flex-col gap-2 bg-white/10 p-4 border-2 border-white/5 rounded-lg'>
                        <div className='flex flex-row gap-2 flex-1'>
                            <button onClick={() => setWalkinModal(true)} className='flex-1 flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border-2 border-green-500/20 rounded-md transition-colors cursor-pointer'>
                                <UserIcon size={24} className='text-green-400' />
                                <span className='text-xs font-medium'>+ Walk-in</span>
                            </button>
                            <a href='/images' className='flex-1 flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border-2 border-white/5 rounded-md transition-colors'>
                                <ImageIcon size={24} className='text-blue-400' />
                                <span className='text-xs font-medium'>Gallery</span>
                            </a>
                        </div>
                    </div>
                </div>
                <div className='flex flex-col gap-2 bg-white/10 p-4 border-2 border-white/5 rounded-lg'>
                    <div className='flex flex-row gap-2 w-full justify-between items-top'>
                        <span className='text-white/60 font-medium text-sm'>My Upcoming Appointments</span>
                        <Link title='View Appointments' className='px-4 py-1 bg-white/5 rounded-md border-2 border-white/10 hover:bg-white/10 transition-colors cursor-pointer' href='/appointments'>View All</Link>
                    </div>
                    <div className='flex-1 flex flex-col overflow-y-auto max-h-[400px]'>
                        {appointments.filter(ap => ap.status === "CONFIRMED" && ap.staff_id === userInfo.id && new Date(ap.time_start).getTime() > Date.now()).map(ap => (
                            <AppointmentContainer key={ap.id} appointment={ap} />
                        ))}
                        {appointments.filter(ap => ap.status === "CONFIRMED" && ap.staff_id === userInfo.id && new Date(ap.time_start).getTime() > Date.now()).length === 0 && (
                            <p className='text-white/30 text-sm py-4 text-center'>No upcoming appointments</p>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}

function ManagerDashboard({ initialData, userProfile }: StaffDashboardProps) {
    const { userInfo: contextUserInfo } = useContext(SideBarContext)
    const userInfo = userProfile || contextUserInfo
    const { currentBranch } = useBranchContext()
    const { formatCurrency } = useCurrencySettings()

    const [loading, setLoading] = useState(!initialData)
    const [inventory, setInventory] = useState<InventoryItem[]>(initialData?.inventory || [])
    const [appointments, setAppointments] = useState<Appointment[]>(initialData?.appointments || [])
    const [walkinModal, setWalkinModal] = useState(false)

    const filteredInventory = useMemo(() => {
        if (!currentBranch?.id) return inventory
        return inventory.filter(inv => !inv.branch_id || inv.branch_id === currentBranch.id)
    }, [inventory, currentBranch])

    const filteredAppointments = useMemo(() => {
        if (!currentBranch?.id) return appointments
        return appointments.filter(ap => !ap.branch_id || ap.branch_id === currentBranch.id)
    }, [appointments, currentBranch])

    const fetchData = useCallback(async () => {
        const [inv, appts] = await Promise.all([getInventory(), getMonthlyAppointments()])
        if (inv) setInventory(inv)
        if (appts?.success && appts.data) setAppointments(appts.data)
    }, [])

    useEffect(() => {
        if (initialData) { setLoading(false); return }
        fetchData().then(() => setLoading(false))
    }, [fetchData, initialData])

    if (loading) {
        return (
            <div className='w-full flex-1 flex items-center justify-center select-none'>
                <LoaderCircleIcon size={24} className='animate-spin ease-in-out' />
            </div>
        )
    }

    return (
        <>
            <AnimatePresence>
                {walkinModal && (
                    <WalkinAppointmentModal
                        isOpen={walkinModal}
                        onClose={() => setWalkinModal(false)}
                        onSuccess={() => { fetchData(); setWalkinModal(false) }}
                    />
                )}
            </AnimatePresence>
            <div className='w-full flex-1 overflow-y-auto flex flex-col gap-4'>
                <TimeClockWidget staffId={userInfo.id} />
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <div className='bg-white/10 p-4 border-2 border-white/5 rounded-lg flex flex-col gap-2'>
                        <BanknoteIcon size={42} className='stroke-green-300' />
                        <span className='text-white/60 font-medium text-sm'>Inventory Valuation</span>
                        <span className='text-2xl font-bold'>{formatCurrency(filteredInventory.reduce((acc, item) => acc + (item.unit_price || 0) * item.current_stock, 0))}</span>
                    </div>
                    <div className='bg-white/10 p-4 border-2 border-white/5 rounded-lg flex flex-col gap-2'>
                        <ClipboardClockIcon size={42} className='stroke-white' />
                        <span className='text-white/60 font-medium text-sm'>Site Appointments</span>
                        <span className='text-2xl font-bold'>{filteredAppointments.length}</span>
                    </div>
                </div>
                <div className='flex flex-col gap-2 bg-white/10 p-4 border-2 border-white/5 rounded-lg'>
                    <div className='flex flex-row gap-2 flex-1'>
                        <button onClick={() => setWalkinModal(true)} className='flex-1 flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border-2 border-green-500/20 rounded-md transition-colors cursor-pointer'>
                            <UserIcon size={24} className='text-green-400' />
                            <span className='text-xs font-medium'>+ Walk-in</span>
                        </button>
                        <a href='/inventory' className='flex-1 flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border-2 border-white/5 rounded-md transition-colors'>
                            <BoxIcon size={24} className='text-blue-400' />
                            <span className='text-xs font-medium'>Inventory</span>
                        </a>
                    </div>
                </div>
                <div className='flex flex-col gap-2 bg-white/10 p-4 border-2 border-white/5 rounded-lg'>
                    <div className='flex flex-row gap-2 w-full justify-between items-top'>
                        <span className='text-white/60 font-medium text-sm'>Upcoming Appointments</span>
                        <Link title='View Appointments' className='px-4 py-1 bg-white/5 rounded-md border-2 border-white/10 hover:bg-white/10 transition-colors cursor-pointer' href='/appointments'>View All</Link>
                    </div>
                    <div className='flex-1 flex flex-col overflow-y-auto max-h-[400px]'>
                        {filteredAppointments.filter(ap => ap.status === "CONFIRMED" && new Date(ap.time_start).getTime() > Date.now()).map(ap => (
                            <AppointmentContainer key={ap.id} appointment={ap} />
                        ))}
                    </div>
                </div>
                {userInfo.access_flags?.some(f => normalizeFlag(f) === "inventory_manage") && (
                    <div className='flex flex-col gap-2 bg-white/10 p-4 border-2 border-white/5 rounded-lg'>
                        <div className='flex flex-row gap-2 w-full justify-between items-top'>
                            <span className='text-white/60 font-medium text-sm'>Inventory Alerts</span>
                            <a title='View Inventory' className='px-4 py-1 bg-white/5 rounded-md border-2 border-white/10 hover:bg-white/10 transition-colors cursor-pointer' href='/inventory'>View Inventory</a>
                        </div>
                        <div className='flex-1 flex flex-col overflow-y-auto'>
                            {filteredInventory.filter(inv => inv.stock_warning_threshold && inv.current_stock <= inv.stock_warning_threshold).length === 0 && (
                                <p className='text-white/30 text-sm py-4 text-center'>No inventory alerts</p>
                            )}
                            {filteredInventory.filter(inv => inv.stock_warning_threshold && inv.current_stock <= inv.stock_warning_threshold).map((inv, idx) => (
                                <div key={idx + "-inv"} className='flex flex-col gap-2 items-center p-2 border-2 border-transparent hover:border-white/5 rounded-md cursor-pointer hover:bg-white/10 active:bg-white/20'>
                                    <div className='w-full flex flex-row justify-between items-center'>
                                        <span className='font-medium flex flex-row gap-1'>{inv.name}</span>
                                        <span className='font-semibold capitalize px-2 bg-red-400/20 text-white/80 rounded-sm border-2 border-white/5'>Low Stock</span>
                                    </div>
                                    <div className='w-full flex flex-row justify-between'>
                                        <span className='text-xs font-semibold text-white/60 flex flex-row gap-1 items-center'><span>Code:</span> {inv.item_code}</span>
                                        <span className='text-xs font-semibold text-white/60 flex flex-row gap-1 items-center'><span>Stock:</span> {inv.current_stock}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}

interface AdminDashboardProps {
    initialData?: DashboardData["admin"]
    userProfile: UserProfile
}
function AdminDashboard({ initialData, userProfile }: AdminDashboardProps) {
    // Context
    const { userInfo: contextUserInfo } = useContext(SideBarContext)
    const userInfo = userProfile || contextUserInfo
    const { currentBranch } = useBranchContext()
    const { formatCurrency } = useCurrencySettings()

    // Constant
    // State
    // -- Page
    const [loading, setLoading] = useState(!initialData)
    // -- Database
    const [inventory, setInventory] = useState<InventoryItem[]>(
        initialData?.inventory || [],
    )
    const [appointments, setAppointments] = useState<Appointment[]>(
        initialData?.appointments || [],
    )
    const [dailySales, setDailySales] = useState<GetTodaySummaryResult>(
        initialData?.dailySales || {
            totalRevenue: 0,
            completedCount: 0,
            pendingCount: 0,
            itemsSold: 0,
            servicesRendered: 0,
        },
    )
    const [financialMetrics, setFinancialMetrics] = useState<FinancialMetrics>(
        initialData?.financialMetrics || {
            revenue: 0,
            transactions: 0,
            averageTicket: 0,
        },
    )
    // -- Modals
    const [walkinModal, setWalkinModal] = useState(false)

    // Branch filtering
    const filteredInventory = useMemo(() => {
        if (!currentBranch?.id) return inventory
        return inventory.filter(
            (inv) => !inv.branch_id || inv.branch_id === currentBranch.id
        )
    }, [inventory, currentBranch])

    const filteredAppointments = useMemo(() => {
        if (!currentBranch?.id) return appointments
        return appointments.filter(
            (ap) => !ap.branch_id || ap.branch_id === currentBranch.id
        )
    }, [appointments, currentBranch])

    // Handlers
    const fetchInventoryItems = useCallback(async () => {
        await getInventory().then((items) => {
            if (items) setInventory(items)
        })
    }, [setInventory])

    const fetchAppointments = useCallback(async () => {
        const result = await getMonthlyAppointments()
        if (result && result.success && result.data) {
            setAppointments(result.data)
        }
    }, [setAppointments])

    const fetchDailySales = useCallback(async () => {
        const result = await getTodaySummary()
        if (result && result.success && result.data) {
            setDailySales(result.data)
        }
    }, [])

    const fetchFinancialMetrics = useCallback(async (branchId?: string) => {
        const result = await getFinancialMetrics(branchId)
        if (result && result.success && result.data) {
            setFinancialMetrics(result.data)
        }
    }, [])

    const getValues = useCallback(async () => {
        if (initialData) {
            setLoading(false)
            return
        }
        await fetchInventoryItems()
        await fetchAppointments()
        await fetchDailySales()
        await fetchFinancialMetrics(currentBranch?.id)
        setLoading(false)
    }, [
        fetchAppointments,
        fetchInventoryItems,
        fetchDailySales,
        fetchFinancialMetrics,
        initialData,
        currentBranch?.id,
    ])

    // Effects
    useEffect(() => {
        getValues()
    }, [getValues])

    if (loading) {
        return (
            <div
                key='appointment-loading'
                className='w-full flex-1 flex items-center justify-center select-none'
            >
                <LoaderCircleIcon
                    size={24}
                    className='animate-spin ease-in-out'
                />
            </div>
        )
    }

    // Render
    return (
        <>
            <AnimatePresence>
                {walkinModal && (
                    <WalkinAppointmentModal
                        isOpen={walkinModal}
                        onClose={() => setWalkinModal(false)}
                        onSuccess={() => {
                            fetchAppointments()
                            setWalkinModal(false)
                        }}
                    />
                )}
            </AnimatePresence>
            <div className='w-full flex-1 overflow-y-auto flex flex-col gap-4'>
                {/* Time Clock Hero - Full Width */}
                <TimeClockWidget staffId={userInfo.id} />

                {/* Stats Grid */}
                <StatsGrid columns={{ mobile: 1, tablet: 2, desktop: 4 }}>
                    <StatCard
                        label='Inventory Valuation'
                        value={formatCurrency(
                            filteredInventory.reduce((acc, item) => {
                                return (
                                    acc +
                                    (item.unit_price || 0) * item.current_stock
                                )
                            }, 0),
                        )}
                        icon={
                            <BanknoteIcon
                                size={42}
                                className='stroke-green-300'
                            />
                        }
                    />
                    <StatCard
                        label='Daily Sales'
                        value={formatCurrency(dailySales.totalRevenue)}
                        icon={
                            <BanknoteIcon
                                size={42}
                                className='stroke-blue-300'
                            />
                        }
                    />
                    <StatCard
                        label='Avg. Transaction Value'
                        value={formatCurrency(financialMetrics.averageTicket)}
                        icon={
                            <CircleDollarSignIcon
                                size={42}
                                className='stroke-yellow-300'
                            />
                        }
                    />
                    <StatCard
                        label='Site Appointments'
                        value={filteredAppointments.length}
                        icon={
                            <ClipboardClockIcon
                                size={42}
                                className='stroke-white'
                            />
                        }
                    />
                </StatsGrid>

                {/* Quick Actions - Admin */}
                <div className='flex flex-col gap-2 bg-white/10 p-4 border-2 border-white/5 rounded-lg select-none'>
                    <div className='flex flex-row gap-2 flex-1'>
                        <button
                            onClick={() => setWalkinModal(true)}
                            className='flex-1 flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border-2 border-green-500/20 rounded-md transition-colors'
                        >
                            <UserIcon
                                size={24}
                                className='text-green-400'
                            />
                            <span className='text-xs font-medium'>
                                + Walk-in
                            </span>
                        </button>
                        <a
                            href='/inventory'
                            className='flex-1 flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border-2 border-white/5 rounded-md transition-colors'
                        >
                            <BoxIcon
                                size={24}
                                className='text-blue-400'
                            />
                            <span className='text-xs font-medium'>
                                Inventory
                            </span>
                        </a>
                    </div>
                </div>

                {/* Upcoming */}
                <div
                    title='Upcoming Appointments'
                    className='flex flex-col gap-2 bg-white/10 p-4 border-2 border-white/5 rounded-lg select-none'
                >
                    <div className='flex flex-row gap-2 w-full justify-between items-top'>
                        <span className='text-white/60 font-medium text-sm'>
                            Upcoming Appointments
                        </span>
                        <a
                            title='View Appointments'
                            className='px-4 py-1 bg-white/5 rounded-md border-2 border-white/10 hover:bg-white/10 transition-colors cursor-pointer'
                            href={`/appointments`}
                            target='_blank'
                        >
                            View Appointments
                        </a>
                    </div>
                    <div className='flex-1 flex flex-col overflow-y-auto max-h-[400px]'>
                        {filteredAppointments
                            .filter(
                                (ap) =>
                                    ap.status === "CONFIRMED" &&
                                    (ap.staff_id === userInfo.id ||
                                        ap.client_id === userInfo.id) &&
                                    new Date(ap.time_start).getTime() >
                                        Date.now(),
                            )
                            .map((appointment) => (
                                <AppointmentContainer
                                    key={appointment.id + "-all"}
                                    appointment={appointment}
                                />
                            ))}
                    </div>
                </div>
                {/* Inventory */}
                <div className='flex flex-col gap-2 bg-white/10 p-4 border-2 border-white/5 rounded-lg select-none'>
                    <div className='flex flex-row gap-2 w-full justify-between items-top'>
                        <span className='text-white/60 font-medium text-sm'>
                            Inventory Alerts
                        </span>
                        <a
                            title='View Inventory'
                            className='px-4 py-1 bg-white/5 rounded-md border-2 border-white/10 hover:bg-white/10 transition-colors cursor-pointer'
                            href={`/inventory`}
                        >
                            View Inventory
                        </a>
                    </div>
                    <div className='flex-1 flex flex-col overflow-y-auto'>
                        {filteredInventory
                            .filter(
                                (inv) =>
                                    inv.stock_warning_threshold &&
                                    inv.current_stock <=
                                        inv.stock_warning_threshold,
                            )
                            .map((inv, idx) => (
                                <motion.div
                                    key={idx + "-inv"}
                                    className='flex flex-col gap-2 items-center p-2 border-2 border-transparent transition-colors hover:border-white/5 rounded-md cursor-pointer hover:bg-white/10 active:bg-white/20'
                                >
                                    <div className='w-full flex flex-row justify-between items-center'>
                                        <span className='font-medium flex flex-row gap-1'>
                                            {inv.name}
                                        </span>
                                        <span className='font-semibold capitalize px-2 bg-red-400/20 text-white/80 rounded-sm border-2 border-white/5'>
                                            Low Stock
                                        </span>
                                    </div>
                                    <div className='w-full flex flex-row justify-between'>
                                        <span
                                            className='text-xs font-semibold text-white/60 flex flex-row gap-1 items-center'
                                            title='Item Code'
                                        >
                                            <FileBoxIcon size={16} />
                                            {inv.item_code}
                                        </span>
                                        <span
                                            className='text-xs font-semibold text-white/60 flex flex-row gap-1 items-center'
                                            title={`Minimum Stock ${inv.stock_warning_threshold ?? 0}`}
                                        >
                                            <BoxIcon size={16} />
                                            {inv.current_stock}
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                    </div>
                </div>
            </div>
        </>
    )
}

function AppointmentContainer({ appointment }: { appointment: Appointment }) {
    // Context
    const { userInfo } = useContext(SideBarContext)

    // Format time strings without extra whitespace
    const startTime = new Date(appointment.time_start).toLocaleTimeString(
        "en-PH",
        {
            hour: "numeric",
            minute: "numeric",
        },
    )
    const endTime = new Date(appointment.time_end).toLocaleTimeString(
        "en-PH",
        {
            hour: "numeric",
            minute: "numeric",
        },
    )

    // Render
    return (
        <motion.a
            key={appointment.id}
            title='Open Appointment'
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`flex flex-col gap-2 items-center p-2 border-2 border-transparent transition-colors hover:border-white/5 rounded-md cursor-pointer hover:bg-white/10 active:bg-white/20`}
            href={`/appointments/${appointment.id}`}
            target='_blank'
        >
            <div className='w-full flex flex-row justify-between items-center'>
                <span className='font-medium flex flex-row gap-1'>
                    {appointment.title}
                    {appointment.status === "PENDING" && (
                        <span className='text-xs h-max font-semibold capitalize px-1 bg-yellow-400/20 text-yellow-400 rounded-sm border-2 border-yellow-400/20'>
                            Pending
                        </span>
                    )}
                    {appointment.client_id !== userInfo.id && (
                        <span className='text-xs h-max font-semibold capitalize px-1 bg-orange-400/20 text-white/80 rounded-sm border-2 border-white/5'>
                            Client
                        </span>
                    )}
                </span>
                <span className='font-semibold capitalize px-2 bg-blue-400/20 text-white/80 rounded-sm border-2 border-white/5'>
                    {appointment.type?.toLowerCase() || "Other"}
                </span>
            </div>
            <div className='w-full flex flex-row justify-between'>
                <span
                    className='text-xs font-semibold text-white/60 flex flex-row gap-1 items-center'
                    title='Date'
                >
                    <CalendarFoldIcon size={16} />
                    {new Date(appointment.time_start).toLocaleDateString(
                        "en-PH",
                        {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                        },
                    )}{" "}
                    {new Date().getTime() -
                        new Date(appointment.time_start).getTime() >
                        0 &&
                        !appointment.actual_time_start &&
                        appointment.status !== "CANCELLED" && (
                            <span className='text-xs h-max font-semibold capitalize px-1 bg-red-400/20 text-white/80 rounded-sm border-2 border-white/5'>
                                Late
                            </span>
                        )}
                </span>
                <span
                    className='text-xs font-semibold text-white/60 flex flex-row gap-1 items-center'
                    title='Time'
                >
                    <ClockIcon size={16} />
                    <span>{startTime} - {endTime}</span>
                </span>
            </div>
        </motion.a>
    )
}

interface ErrorBoundaryProps {
    children: ReactNode
}

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
}

class DashboardErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        import("@/server/actions/logs").then(({ createLogs }) => {
            createLogs({
                logs: [{
                    level: "ERROR",
                    type: "SYSTEM",
                    message: `Dashboard render error: ${error.message}\nComponent stack: ${info.componentStack}`
                }]
            })
        }).catch(() => {
            console.error("Dashboard render error:", error, info)
        })
    }

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <div className="w-full flex-1 flex flex-col items-center justify-center gap-4 p-8">
                    <p className="text-lg font-semibold text-white/80">
                        Dashboard temporarily unavailable
                    </p>
                    <p className="text-sm text-white/40 max-w-md text-center">
                        An unexpected error occurred while loading this dashboard view.
                        Please try reloading the page.
                    </p>
                    <button
                        onClick={() => {
                            this.setState({ hasError: false, error: null })
                            window.location.reload()
                        }}
                        className="px-4 py-2 bg-white/10 border border-white/20 rounded-md text-sm hover:bg-white/20 transition-colors cursor-pointer"
                    >
                        Reload Dashboard
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}
