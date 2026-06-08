"use client"

import { SideBarContext } from "@/components/sidebar"
import { normalizeFlag } from "@/utils/auth/access-flags"
import {
    HomeIcon,
} from "lucide-react"
import { Component, ErrorInfo, ReactNode, useCallback, useContext, useEffect, useState, useMemo } from "react"
import { getInventory } from "@/server/actions/inventory"
import { InventoryItem } from "@/utils/types/inventory"

import { getTodaySummary, GetTodaySummaryResult } from "@/server/actions/transactions"
import { FinancialMetrics, getFinancialMetrics } from "@/server/actions/metrics"

import StatsGrid from "@/components/ui/StatsGrid"
import StatCard from "@/components/ui/StatCard"

import { UserProfile } from "@/utils/types/auth"

import { getSetting } from "@/server/actions/settings"
import { CurrencyTaxValue } from "@/utils/types/settings"

const currentBranch: any = null;

export interface DashboardData {
    staff?: {
        inventory: InventoryItem[]
        dailySales: { totalRevenue: number; completedCount: number; pendingCount: number; itemsSold: number; servicesRendered: number }
    }
    admin?: {
        inventory: InventoryItem[]
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
                    <p className='text-muted-foreground text-sm mt-1'>
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
    

    // State
    // -- Page
    const [loading, setLoading] = useState(!initialData)
    // -- Database
    const [inventory, setInventory] = useState<InventoryItem[]>(
        initialData?.inventory || [],
    )

    // Branch filtering
    const filteredInventory = useMemo(() => {
        if (!currentBranch?.id) return inventory
        return inventory.filter(
            (inv) => !inv.branch_id || inv.branch_id === currentBranch.id
        )
    }, [inventory, currentBranch])

    // Handlers
    const fetchInventoryItems = useCallback(async () => {
        await getInventory().then((items) => {
            if (items) setInventory(items)
        })
    }, [setInventory])

    const getValues = useCallback(async () => {
        if (initialData) {
            setLoading(false)
            return
        }
        await fetchInventoryItems()
        setLoading(false)
    }, [fetchInventoryItems, initialData])

    // Effects
    useEffect(() => {
        getValues()
    }, [getValues])

    // Loading
    if (loading) {
        return (
            <div className='w-full flex-1 flex items-center justify-center select-none'>
                <span>Loading...</span>
            </div>
        )
    }

    // Render
    return (
        <>
            <div className='w-full flex-1 overflow-y-auto flex flex-col gap-4'>

                {/* Quick Actions */}
                <div className='flex flex-col gap-2 bg-card p-4 border-2 border-border rounded-lg select-none'>
                    <div className='flex flex-row gap-2 flex-1'>
                        <a
                            href='/images'
                            className='flex-1 flex flex-col items-center justify-center gap-2 bg-muted hover:bg-muted border-2 border-border rounded-md transition-colors'
                        >
                            <span className='text-xs font-medium'>Gallery</span>
                        </a>
                    </div>
                </div>

                {/* Inventory */}
                {userInfo.access_flags?.some(f => normalizeFlag(f) === "inventory_manage") && (
                    <div className='flex flex-col gap-2 bg-card p-4 border-2 border-border rounded-lg select-none'>
                        <div className='flex flex-row gap-2 w-full justify-between items-top'>
                            <span className='text-muted-foreground font-medium text-sm'>
                                Inventory Alerts
                            </span>
                            <a
                                title='View Inventory'
                                className='px-4 py-1 bg-muted rounded-md border-2 border-border hover:bg-muted transition-colors cursor-pointer'
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
                                    <div
                                        key={idx + "-inv"}
                                        className='flex flex-col gap-2 items-center p-2 border-2 border border-border transition-colors hover:border-border rounded-md cursor-pointer hover:bg-muted active:bg-muted'
                                    >
                                        <div className='w-full flex flex-row justify-between items-center'>
                                            <span className='font-medium flex flex-row gap-1'>
                                                {inv.name}
                                            </span>
                                            <span className='font-semibold capitalize px-2 bg-red-400/20 text-foreground rounded-sm border-2 border-border'>
                                                Low Stock
                                            </span>
                                        </div>
                                        <div className='w-full flex flex-row justify-between'>
                                            <span
                                                className='text-xs font-semibold text-muted-foreground flex flex-row gap-1 items-center'
                                                title='Item Code'
                                            >
                                                {inv.item_code}
                                            </span>
                                            <span
                                                className='text-xs font-semibold text-muted-foreground flex flex-row gap-1 items-center'
                                                title={`Minimum Stock ${inv.stock_warning_threshold ?? 0}`}
                                            >
                                                {inv.current_stock} left
                                            </span>
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

function ArtistDashboard({ initialData, userProfile }: StaffDashboardProps) {
    const { userInfo: contextUserInfo } = useContext(SideBarContext)
    const userInfo = userProfile || contextUserInfo

    const [loading, setLoading] = useState(!initialData)

    useEffect(() => {
        if (initialData) { setLoading(false); return }
        setLoading(false)
    }, [initialData])

    if (loading) {
        return (
            <div className='w-full flex-1 flex items-center justify-center select-none'>
                <span>Loading...</span>
            </div>
        )
    }

    return (
        <div className='w-full flex-1 overflow-y-auto flex flex-col gap-4'>
            <div className='flex flex-col gap-2 bg-card p-4 border-2 border-border rounded-lg'>
                <div className='flex flex-row gap-2 flex-1'>
                    <a href='/images' className='flex-1 flex flex-col items-center justify-center gap-2 bg-muted hover:bg-muted border-2 border-border rounded-md transition-colors'>
                        <span className='text-xs font-medium'>Gallery</span>
                    </a>
                </div>
            </div>
        </div>
    )
}

function ManagerDashboard({ initialData, userProfile }: StaffDashboardProps) {
    const { userInfo: contextUserInfo } = useContext(SideBarContext)
    const userInfo = userProfile || contextUserInfo
    
    const { formatCurrency } = useCurrencySettings()

    const [loading, setLoading] = useState(!initialData)
    const [inventory, setInventory] = useState<InventoryItem[]>(initialData?.inventory || [])

    const filteredInventory = useMemo(() => {
        if (!currentBranch?.id) return inventory
        return inventory.filter(inv => !inv.branch_id || inv.branch_id === currentBranch.id)
    }, [inventory, currentBranch])

    const fetchData = useCallback(async () => {
        const [inv] = await Promise.all([getInventory()])
        if (inv) setInventory(inv)
    }, [])

    useEffect(() => {
        if (initialData) { setLoading(false); return }
        fetchData().then(() => setLoading(false))
    }, [fetchData, initialData])

    if (loading) {
        return (
            <div className='w-full flex-1 flex items-center justify-center select-none'>
                <span>Loading...</span>
            </div>
        )
    }

    return (
        <div className='w-full flex-1 overflow-y-auto flex flex-col gap-4'>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                <div className='bg-card p-4 border-2 border-border rounded-lg flex flex-col gap-2'>
                    <span className='text-muted-foreground font-medium text-sm'>Inventory Valuation</span>
                    <span className='text-2xl font-bold'>{formatCurrency(filteredInventory.reduce((acc, item) => acc + (item.unit_price || 0) * item.current_stock, 0))}</span>
                </div>
            </div>
            <div className='flex flex-col gap-2 bg-card p-4 border-2 border-border rounded-lg'>
                <div className='flex flex-row gap-2 flex-1'>
                    <a href='/inventory' className='flex-1 flex flex-col items-center justify-center gap-2 bg-muted hover:bg-muted border-2 border-border rounded-md transition-colors'>
                        <span className='text-xs font-medium'>Inventory</span>
                    </a>
                </div>
            </div>
            {userInfo.access_flags?.some(f => normalizeFlag(f) === "inventory_manage") && (
                <div className='flex flex-col gap-2 bg-card p-4 border-2 border-border rounded-lg'>
                    <div className='flex flex-row gap-2 w-full justify-between items-top'>
                        <span className='text-muted-foreground font-medium text-sm'>Inventory Alerts</span>
                        <a title='View Inventory' className='px-4 py-1 bg-muted rounded-md border-2 border-border hover:bg-muted transition-colors cursor-pointer' href='/inventory'>View Inventory</a>
                    </div>
                    <div className='flex-1 flex flex-col overflow-y-auto'>
                        {filteredInventory.filter(inv => inv.stock_warning_threshold && inv.current_stock <= inv.stock_warning_threshold).length === 0 && (
                            <p className='text-muted-foreground/70 text-sm py-4 text-center'>No inventory alerts</p>
                        )}
                        {filteredInventory.filter(inv => inv.stock_warning_threshold && inv.current_stock <= inv.stock_warning_threshold).map((inv, idx) => (
                            <div key={idx + "-inv"} className='flex flex-col gap-2 items-center p-2 border-2 border-transparent hover:border-border rounded-md cursor-pointer hover:bg-muted active:bg-muted'>
                                <div className='w-full flex flex-row justify-between items-center'>
                                    <span className='font-medium flex flex-row gap-1'>{inv.name}</span>
                                    <span className='font-semibold capitalize px-2 bg-red-400/20 text-foreground rounded-sm border-2 border-border'>Low Stock</span>
                                </div>
                                <div className='w-full flex flex-row justify-between'>
                                    <span className='text-xs font-semibold text-muted-foreground flex flex-row gap-1 items-center'><span>Code:</span> {inv.item_code}</span>
                                    <span className='text-xs font-semibold text-muted-foreground flex flex-row gap-1 items-center'><span>Stock:</span> {inv.current_stock}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

interface AdminDashboardProps {
    initialData?: DashboardData["admin"]
    userProfile: UserProfile
}
function AdminDashboard({ initialData, userProfile }: AdminDashboardProps) {
    // Context
    
    const { formatCurrency } = useCurrencySettings()

    // Constant
    // State
    // -- Page
    const [loading, setLoading] = useState(!initialData)
    // -- Database
    const [inventory, setInventory] = useState<InventoryItem[]>(
        initialData?.inventory || [],
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

    // Branch filtering
    const filteredInventory = useMemo(() => {
        if (!currentBranch?.id) return inventory
        return inventory.filter(
            (inv) => !inv.branch_id || inv.branch_id === currentBranch.id
        )
    }, [inventory, currentBranch])

    // Handlers
    const fetchInventoryItems = useCallback(async () => {
        await getInventory().then((items) => {
            if (items) setInventory(items)
        })
    }, [setInventory])

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
        await fetchDailySales()
        await fetchFinancialMetrics(currentBranch?.id)
        setLoading(false)
    }, [
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
                <span>Loading...</span>
            </div>
        )
    }

    // Render
    return (
        <div className='w-full flex-1 overflow-y-auto flex flex-col gap-4'>
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
                        <span className='text-green-300'>$</span>
                    }
                />
                <StatCard
                    label='Daily Sales'
                    value={formatCurrency(dailySales.totalRevenue)}
                    icon={
                        <span className='text-blue-300'>$</span>
                    }
                />
                <StatCard
                    label='Avg. Transaction Value'
                    value={formatCurrency(financialMetrics.averageTicket)}
                    icon={
                        <span className='text-yellow-300'>$</span>
                    }
                />
            </StatsGrid>

            {/* Quick Actions */}
            <div className='flex flex-col gap-2 bg-card p-4 border-2 border-border rounded-lg select-none'>
                <div className='flex flex-row gap-2 flex-1'>
                    <a
                        href='/inventory'
                        className='flex-1 flex flex-col items-center justify-center gap-2 bg-muted hover:bg-muted border-2 border-border rounded-md transition-colors'
                    >
                        <span className='text-xs font-medium'>
                            Inventory
                        </span>
                    </a>
                </div>
            </div>

            {/* Inventory */}
            <div className='flex flex-col gap-2 bg-card p-4 border-2 border-border rounded-lg select-none'>
                <div className='flex flex-row gap-2 w-full justify-between items-top'>
                    <span className='text-muted-foreground font-medium text-sm'>
                        Inventory Alerts
                    </span>
                    <a
                        title='View Inventory'
                        className='px-4 py-1 bg-muted rounded-md border-2 border-border hover:bg-muted transition-colors cursor-pointer'
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
                            <div
                                key={idx + "-inv"}
                                className='flex flex-col gap-2 items-center p-2 border-2 border border-border transition-colors hover:border-border rounded-md cursor-pointer hover:bg-muted active:bg-muted'
                            >
                                <div className='w-full flex flex-row justify-between items-center'>
                                    <span className='font-medium flex flex-row gap-1'>
                                        {inv.name}
                                    </span>
                                    <span className='font-semibold capitalize px-2 bg-red-400/20 text-foreground rounded-sm border-2 border-border'>
                                        Low Stock
                                    </span>
                                </div>
                                <div className='w-full flex flex-row justify-between'>
                                    <span
                                        className='text-xs font-semibold text-muted-foreground flex flex-row gap-1 items-center'
                                        title='Item Code'
                                    >
                                        {inv.item_code}
                                    </span>
                                    <span
                                        className='text-xs font-semibold text-muted-foreground flex flex-row gap-1 items-center'
                                        title={`Minimum Stock ${inv.stock_warning_threshold ?? 0}`}
                                    >
                                        {inv.current_stock} left
                                    </span>
                                </div>
                            </div>
                        ))}
                </div>
            </div>
        </div>
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
                    <p className="text-lg font-semibold text-foreground">
                        Dashboard temporarily unavailable
                    </p>
                    <p className="text-sm text-muted-foreground/70 max-w-md text-center">
                        An unexpected error occurred while loading this dashboard view.
                        Please try reloading the page.
                    </p>
                    <button
                        onClick={() => {
                            this.setState({ hasError: false, error: null })
                            window.location.reload()
                        }}
                        className="px-4 py-2 bg-card border border-border rounded-md text-sm hover:bg-muted transition-colors cursor-pointer"
                    >
                        Reload Dashboard
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}
