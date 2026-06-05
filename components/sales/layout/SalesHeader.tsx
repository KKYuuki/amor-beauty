"use client"

import { HandCoinsIcon, SearchIcon } from "lucide-react"
import PageHeader from "@/components/ui/PageHeader"
import StatCard from "@/components/ui/StatCard"
import { CurrencyTaxValue } from "@/utils/types/settings"

interface SalesHeaderProps {
    todayStats: { totalRevenue: number; completedCount: number; pendingCount: number; itemsSold: number; servicesRendered: number }
    taxSettings: CurrencyTaxValue
    searchQuery: string
    setSearchQuery: (query: string) => void
    activeTab: "PRODUCTS" | "APPOINTMENTS"
    setActiveTab: (tab: "PRODUCTS" | "APPOINTMENTS") => void
    isPartialPayment: boolean
    setIsPartialPayment: (partial: boolean) => void
    total: number
    children?: React.ReactNode
}

export default function SalesHeader({
    todayStats,
    taxSettings,
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    isPartialPayment,
    setIsPartialPayment,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    total,
    children,
}: SalesHeaderProps) {
    return (
        <div>
            <PageHeader
                title='Sales & POS'
                description='Point of Sale System'
                icon={<HandCoinsIcon className='w-6 h-6' />}
            >
                {children}
            </PageHeader>
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6'>
                <StatCard
                    label="Today's Revenue"
                    value={`${taxSettings.currency_symbol}${todayStats.totalRevenue.toFixed(2)}`}
                    color='success'
                />
                <StatCard
                    label='Transactions'
                    value={todayStats.completedCount}
                    color='default'
                />
                <StatCard
                    label='Items Sold'
                    value={todayStats.itemsSold}
                    color='default'
                />
                <StatCard
                    label='Services'
                    value={todayStats.servicesRendered}
                    color='default'
                />
                <StatCard
                    label='Pending'
                    value={todayStats.pendingCount}
                    color='warning'
                />
            </div>
            <div className='grid grid-cols-2 gap-4 mb-6'>
                {/* Partial Payment Toggle */}
                <div className='flex items-center gap-3 px-4 py-2 bg-zinc-100 dark:bg-zinc-800/50 rounded-lg'>
                    <label className='flex items-center gap-2 cursor-pointer w-full'>
                        <input
                            type='checkbox'
                            checked={isPartialPayment}
                            onChange={(e) => {
                                setIsPartialPayment(e.target.checked)
                                if (!e.target.checked) {
                                    // This will be handled by the parent component
                                    // Just set the flag here
                                }
                            }}
                            className='w-5 h-5 rounded border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 checked:bg-blue-600'
                        />
                        <span className='text-sm font-medium'>
                            Deposit / Partial Payment
                        </span>
                    </label>
                </div>

                {/* Search Tabs */}
                <div className='flex flex-row gap-4'>
                    {/* Search Bar */}
                    <div className='relative flex-1'>
                        <SearchIcon className='absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-5 h-5' />
                        <input
                            type='text'
                            placeholder='Search products, services, or codes...'
                            className='w-full pl-10 pr-4 py-2 bg-white/10 rounded-md border-2 border-white/5 focus:border-white/20 outline-none transition-all text-white placeholder:text-white/40'
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <select
                        className='w-max bg-white/10 hover:bg-white/20 transition-colors px-3 py-1 rounded-md text-sm cursor-pointer border-2 border-white/5'
                        value={activeTab}
                        onChange={(e) =>
                            setActiveTab(
                                e.target.value as "PRODUCTS" | "APPOINTMENTS",
                            )
                        }
                    >
                        <option value='PRODUCTS'>Products & Services</option>
                        <option value='APPOINTMENTS'>Appointments</option>
                    </select>
                </div>
            </div>
        </div>
    )
}
