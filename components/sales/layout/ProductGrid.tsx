"use client"

import { CurrencyTaxValue } from "@/utils/types/settings"
import { InventoryItem } from "@/utils/types/inventory"
import { ServiceWithItems } from "@/server/actions/services"
import { SkeletonCard } from "../ui/SkeletonCard"
import { EmptyState } from "../ui/EmptyState"

interface ProductGridProps {
    filteredInventory: InventoryItem[]
    filteredServices: ServiceWithItems[]
    loading: boolean
    taxSettings: CurrencyTaxValue
    addToCart: (item: InventoryItem | ServiceWithItems, type: "INVENTORY" | "SERVICE") => void
}

export default function ProductGrid({
    filteredInventory,
    filteredServices,
    loading,
    taxSettings,
    addToCart,
}: ProductGridProps) {
    return (
        <div className='flex-1 overflow-y-auto max-h-[calc(100%-22rem)]'>
            {loading ? (
                <div className='p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
                    <SkeletonCard count={8} />
                </div>
            ) : (
                <>
                    <div className='mb-8'>
                        <h2 className='text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4'>
                            Services
                        </h2>
                        <div className='grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
                            {filteredServices.map((service) => (
                                <button
                                    key={service.id}
                                    onClick={() => addToCart(service, "SERVICE")}
                                    className='p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 hover:shadow-md hover:scale-[1.02] transition-all text-left group cursor-pointer'
                                >
                                    <div className='font-medium text-zinc-800 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate'>
                                        {service.title}
                                    </div>
                                    <div className='text-sm text-zinc-500 mt-1'>
                                        {taxSettings.currency_symbol}
                                        {service.price.toFixed(2)}
                                    </div>
                                </button>
                            ))}
                            {filteredServices.length === 0 && filteredInventory.length === 0 && (
                                <div className='col-span-full'>
                                    <EmptyState 
                                        type="search" 
                                        action={() => {}}
                                        actionLabel="Clear Search"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <h2 className='text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4'>
                            Inventory
                        </h2>
                        <div className='grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
                            {filteredInventory.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => addToCart(item, "INVENTORY")}
                                    disabled={item.current_stock <= 0}
                                    className={`p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 text-left transition-all ${
                                        item.current_stock <= 0
                                            ? "opacity-50 cursor-not-allowed"
                                            : "hover:border-blue-500 hover:shadow-md group cursor-pointer"
                                    }`}
                                >
                                    <div className='font-medium text-zinc-800 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate'>
                                        {item.name}
                                    </div>
                                    <div className='flex justify-between items-center mt-2'>
                                        <span className='text-sm text-zinc-500'>
                                            {taxSettings.currency_symbol}
                                            {(item.selling_price || 0).toFixed(2)}
                                        </span>
                                        <span
                                            className={`text-xs px-2 py-1 rounded-full ${
                                                item.current_stock > 10
                                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                                    : item.current_stock > 0
                                                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                            }`}
                                        >
                                            {item.current_stock} left
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
