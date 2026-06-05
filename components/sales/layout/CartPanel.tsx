"use client"

import React from "react"
import { ShoppingCartIcon, Trash2Icon, PlusIcon, MinusIcon, CreditCardIcon, XIcon } from "lucide-react"
import { CartItem } from "@/components/sales/context/SalesContext"
import { CurrencyTaxValue } from "@/utils/types/settings"
import { ServiceWithItems } from "@/server/actions/services"
import { EmptyState } from "../ui/EmptyState"

interface CartPanelProps {
    cart: CartItem[]
    services: ServiceWithItems[]
    taxSettings: CurrencyTaxValue
    grossTotal: number
    taxAmount: number
    netSubtotal: number
    total: number
    calculatedTotal: number
    discountAmount: number
    appliedDiscount: number
    discountType: "PERCENTAGE" | "FIXED"
    setDiscountType: (type: "PERCENTAGE" | "FIXED") => void
    setDiscountValue: (value: string) => void
    setDiscountReason: (reason: string) => void
    setAppliedDiscount: (value: number) => void
    setIsDiscountModalOpen: (open: boolean) => void
    totalOverride: number | null
    setTotalOverride: (value: number | null) => void
    updateQuantity: (id: string, delta: number) => void
    updateCustomPrice: (id: string, newPrice: number) => void
    updateLineTotal: (id: string, newTotal: number) => void
    removeFromCart: (id: string) => void
    clearCart: () => void
    setIsCheckoutModalOpen: (open: boolean) => void
    setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
    staffList: Array<{ id: string; full_name: string; avatar_url?: string; role?: string; rate_level_id?: string; rate_level_name?: string }>
    selectedStaffId: string
    itemLabels: Record<string, string>
    setItemLabel: (itemId: string, label: string) => void
}

export default function CartPanel({
    cart,
    setCart,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    services,
    taxSettings,
    grossTotal,
    taxAmount,
    netSubtotal,
    total,
    calculatedTotal,
    discountAmount,
    appliedDiscount,
    discountType,
    setDiscountType,
    setDiscountValue,
    setDiscountReason,
    setAppliedDiscount,
    setIsDiscountModalOpen,
    totalOverride,
    setTotalOverride,
    updateQuantity,
    updateCustomPrice,
    updateLineTotal,
    removeFromCart,
    clearCart,
    setIsCheckoutModalOpen,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    staffList,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    selectedStaffId,
    itemLabels,
    setItemLabel,
}: CartPanelProps) {
    return (
        <div className='w-full lg:w-sm flex flex-col h-full z-10 bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl'>
            <div className='p-6 border-b border-white/10 flex justify-between items-center'>
                <h2 className='text-xl font-bold flex items-center gap-2'>
                    <ShoppingCartIcon className='w-5 h-5' />
                    Current Order
                </h2>
                <div className='flex flex-col gap-2'>
                    {cart.length > 0 && (
                        <button
                            onClick={clearCart}
                            className='text-sm text-red-500 hover:text-red-600'
                        >
                            Clear All
                        </button>
                    )}
                </div>
            </div>

            {/* Cart Items */}
            <div className='flex-1 overflow-y-auto p-4 space-y-3'>
                {cart.length === 0 ? (
                    <EmptyState type='cart' />
                ) : (
                    cart.map((item) => {
                        const isHourly = item.pricing_type === "HOURLY"
                        const durationHours = isHourly && item.total_hours ? item.total_hours : 0
                        const calculatedAmount = isHourly && item.hourly_rate ? durationHours * item.hourly_rate * item.quantity : 0

                        return (
                            <div
                                key={item.id}
                                className={`p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-100 dark:border-zinc-800 flex flex-col gap-3`}
                            >
                                <div className='flex items-center justify-between w-full'>
                                    <div className='flex-1 min-w-0 mr-4 space-y-2'>
                                        <p className='font-medium truncate'>{item.name}</p>
                                        <div className='flex items-center gap-1'>
                                            {item.custom_price !== undefined && item.custom_price !== item.original_price && (
                                                <span className='text-white/40 line-through text-xs'>
                                                    {taxSettings.currency_symbol}{item.original_price.toFixed(2)}
                                                </span>
                                            )}
                                            <input
                                                type='number'
                                                value={item.unit_price}
                                                onChange={(e) => updateCustomPrice(item.id, parseFloat(e.target.value) || 0)}
                                                className='w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right'
                                                min='0'
                                                step='0.01'
                                            />
                                            <span className='text-sm text-zinc-500'>x {item.quantity}</span>
                                            {isHourly && (
                                                <span className='text-blue-600 dark:text-blue-400 text-xs ml-2'>
                                                    (Hourly:{" "}
                                                    {taxSettings.currency_symbol}
                                                    {item.hourly_rate?.toFixed(2)}
                                                    /hr)
                                                </span>
                                            )}
                                        </div>
                                        <div className='flex items-center gap-1 mt-1'>
                                            <span className='text-xs text-zinc-500'>Total:</span>
                                            <input
                                                type='number'
                                                value={(item.unit_price * item.quantity).toFixed(2)}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value)
                                                    if (!isNaN(val)) {
                                                        updateLineTotal(item.id, val)
                                                    }
                                                }}
                                                className='w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right'
                                                min='0'
                                                step='0.01'
                                            />
                                        </div>
                                    </div>
                                    <div className='flex items-center gap-3'>
                                        <div className='flex items-center gap-1 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 p-1'>
                                            <button
                                                onClick={() => updateQuantity(item.id, -1)}
                                                className='p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded'
                                            >
                                                <MinusIcon className='w-3 h-3' />
                                            </button>
                                            <span className='w-6 text-center text-sm font-medium'>
                                                {item.quantity}
                                            </span>
                                            <button
                                                onClick={() => updateQuantity(item.id, 1)}
                                                className='p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded'
                                            >
                                                <PlusIcon className='w-3 h-3' />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => removeFromCart(item.id)}
                                            className='text-zinc-400 hover:text-red-500 transition-colors'
                                        >
                                            <Trash2Icon className='w-4 h-4' />
                                        </button>
                                    </div>
                                </div>
                                {isHourly && (
                                    <div className='flex flex-col gap-2 w-full'>
                                        <div className='flex-1'>
                                            <label className='block text-zinc-500 mb-1'>Total Hours</label>
                                            <input
                                                type='number'
                                                value={item.total_hours || ""}
                                                onChange={(e) => {
                                                    setCart((prev) =>
                                                        prev.map((i) =>
                                                            i.id === item.id
                                                                ? { ...i, total_hours: parseFloat(e.target.value) || 0 }
                                                                : i,
                                                        ),
                                                    )
                                                }}
                                                className='w-full px-2 py-1 bg-white/10 border border-white/10 rounded text-sm'
                                                min='0'
                                                step='0.01'
                                                placeholder='0.00'
                                            />
                                        </div>
                                        <div className='flex justify-between items-center bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800'>
                                            <span className='text-blue-600 dark:text-blue-400 text-xs'>
                                                {durationHours > 0 ? `${durationHours.toFixed(2)} hrs` : 'No hours set'}
                                            </span>
                                            <span className='text-blue-600 dark:text-blue-400 font-medium text-sm'>
                                                = {taxSettings.currency_symbol}{calculatedAmount.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {/* Per-item label */}
                                <div className='w-full mt-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-700/50'>
                                    <input
                                        type='text'
                                        value={itemLabels[item.id] || ''}
                                        onChange={(e) => setItemLabel(item.id, e.target.value)}
                                        placeholder='e.g. Left forearm, Black & Grey'
                                        maxLength={200}
                                        className='w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-zinc-400 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50'
                                    />
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {/* Totals Section */}
            <div className='p-6 bg-zinc-50 dark:bg-zinc-800/30 border-t border-zinc-200 dark:border-zinc-800'>
                <div className='space-y-2 mb-4'>
                    {taxSettings.tax_enabled && taxSettings.tax_rate > 0 ? (
                        <>
                            <div className='flex justify-between text-zinc-500'>
                                <span>Net Subtotal</span>
                                <span>
                                    {taxSettings.currency_symbol}
                                    {netSubtotal.toFixed(2)}
                                </span>
                            </div>
                            <div className='flex justify-between text-zinc-500'>
                                <span>
                                    VAT ({(taxSettings.tax_rate * 100).toFixed(0)}%){taxSettings.tax_inclusive && " (Included)"}
                                </span>
                                <span>
                                    {taxSettings.currency_symbol}
                                    {taxAmount.toFixed(2)}
                                </span>
                            </div>
                        </>
                    ) : (
                        <div className='flex justify-between text-zinc-500'>
                            <span>Subtotal</span>
                            <span>
                                {taxSettings.currency_symbol}
                                {grossTotal.toFixed(2)}
                            </span>
                        </div>
                    )}
                    {appliedDiscount > 0 && (
                        <div className='flex justify-between text-green-600 dark:text-green-400'>
                            <span>
                                Discount ({discountType === "PERCENTAGE" ? `${appliedDiscount}%` : `${taxSettings.currency_symbol}${appliedDiscount.toFixed(2)}`})
                            </span>
                            <span>
                                -{taxSettings.currency_symbol}
                                {discountAmount.toFixed(2)}
                            </span>
                        </div>
                    )}
                    <div className='flex justify-between text-xl font-bold text-zinc-900 dark:text-white pt-2 border-t border-zinc-200 dark:border-zinc-700 items-center'>
                        <span>Total</span>
                        <div className='flex items-center gap-2'>
                            <input
                                type='number'
                                value={totalOverride !== null ? totalOverride : calculatedTotal}
                                onChange={(e) => {
                                    const raw = e.target.value
                                    if (raw === '' || raw === '-') {
                                        setTotalOverride(null)
                                        return
                                    }
                                    const val = parseFloat(raw)
                                    if (!isNaN(val) && val >= 0) {
                                        setTotalOverride(val !== calculatedTotal ? val : null)
                                    }
                                }}
                                onBlur={() => {
                                    if (totalOverride !== null && totalOverride === calculatedTotal) {
                                        setTotalOverride(null)
                                    }
                                }}
                                className='w-28 bg-white/5 border border-white/10 rounded px-2 py-1 text-xl font-bold text-right'
                                min='0'
                                step='0.01'
                            />
                            {totalOverride !== null && (
                                <button
                                    onClick={() => setTotalOverride(null)}
                                    className='text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors'
                                    title='Reset to calculated total'
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Add/Remove Discount Button */}
                {appliedDiscount > 0 ? (
                    <button
                        onClick={() => {
                            setAppliedDiscount(0)
                            setDiscountType("PERCENTAGE")
                            setDiscountValue("")
                            setDiscountReason("")
                        }}
                        disabled={cart.length === 0}
                        className='w-full py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/30 disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed text-red-700 dark:text-red-400 disabled:text-zinc-400 rounded-lg font-medium transition-colors flex items-center justify-center gap-2'
                    >
                        <XIcon className='w-4 h-4' />
                        Remove Discount
                    </button>
                ) : (
                    <button
                        onClick={() => setIsDiscountModalOpen(true)}
                        disabled={cart.length === 0}
                        className='w-full py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed text-zinc-700 dark:text-zinc-300 disabled:text-zinc-400 rounded-lg font-medium transition-colors flex items-center justify-center gap-2'
                    >
                        <MinusIcon className='w-4 h-4' />
                        Add Discount
                    </button>
                )}

                <button
                    onClick={() => setIsCheckoutModalOpen(true)}
                    disabled={cart.length === 0}
                    className='w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-blue-500/30 transition-all flex items-center justify-center gap-2 mt-2'
                >
                    <CreditCardIcon className='w-5 h-5' />
                    Checkout {taxSettings.currency_symbol}
                    {total.toFixed(2)}
                </button>
            </div>
        </div>
    )
}
