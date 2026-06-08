"use client"

import { XCircleIcon } from "lucide-react"
import { motion } from "motion/react"
import { CurrencyTaxValue } from "@/utils/types/settings"
import { CartItem } from "@/components/sales/context/SalesContext"
import { NotificationType } from "@/utils/types/notifications"

interface DiscountModalProps {
    isOpen: boolean
    onClose: () => void
    discountType: "PERCENTAGE" | "FIXED"
    setDiscountType: (type: "PERCENTAGE" | "FIXED") => void
    discountValue: string
    setDiscountValue: (value: string) => void
    discountReason: string
    setDiscountReason: (reason: string) => void
    appliedDiscount: number
    setAppliedDiscount: (value: number) => void
    grossTotal: number
    taxSettings: CurrencyTaxValue
    cart: CartItem[]
    addNotification: (message: string, type?: NotificationType, title?: string, ephemeral?: boolean) => void
}

export default function DiscountModal({
    isOpen,
    onClose,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    discountReason,
    setDiscountReason,
    appliedDiscount,
    setAppliedDiscount,
    grossTotal,
    taxSettings,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    cart,
    addNotification,
}: DiscountModalProps) {
    const parsedValue = parseFloat(discountValue || "0")
    const isPercentageInvalid = discountType === "PERCENTAGE" && parsedValue > 100
    const isValueInvalid = parsedValue <= 0 || Number.isNaN(parsedValue)
    const isApplyDisabled = !discountValue || isValueInvalid || isPercentageInvalid

    return (
        <>
            {isOpen && (
                <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className='bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'
                    >
                        <div className='p-6 border-b border-zinc-200 dark:border-border flex justify-between items-center'>
                            <h3 className='text-xl font-bold'>
                                Apply Discount
                            </h3>
                            <button
                                onClick={onClose}
                                className='text-muted-foreground hover:text-foreground'
                            >
                                <XCircleIcon className='w-6 h-6' />
                            </button>
                        </div>

                        <div className='p-6 space-y-6'>
                            {/* Discount Type Selection */}
                            <div>
                                <label className='block text-sm font-medium mb-3'>
                                    Discount Type
                                </label>
                                <div className='grid grid-cols-2 gap-3'>
                                    <button
                                        type='button'
                                        onClick={() => setDiscountType("PERCENTAGE")}
                                        className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                                            discountType === "PERCENTAGE"
                                                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                                : "border-zinc-200 dark:border-border hover:border-zinc-300"
                                        }`}
                                    >
                                        Percentage (%)
                                    </button>
                                    <button
                                        type='button'
                                        onClick={() => setDiscountType("FIXED")}
                                        className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                                            discountType === "FIXED"
                                                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                                : "border-zinc-200 dark:border-border hover:border-zinc-300"
                                        }`}
                                    >
                                        Fixed Amount (
                                        {taxSettings.currency_symbol}
                                        )
                                    </button>
                                </div>
                            </div>

                            {/* Discount Value Input */}
                            <div>
                                <label className='block text-sm font-medium mb-2'>
                                    {discountType === "PERCENTAGE"
                                        ? "Discount Percentage"
                                        : "Discount Amount"}
                                </label>
                                <div className='relative'>
                                    {discountType === "PERCENTAGE" && (
                                        <span className='absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground'>
                                            %
                                        </span>
                                    )}
                                    {discountType === "FIXED" && (
                                        <span className='absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground'>
                                            {taxSettings.currency_symbol}
                                        </span>
                                    )}
                                    <input
                                        type='number'
                                        className={`w-full px-3 py-3 bg-zinc-100 dark:bg-muted rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${
                                            discountType === "PERCENTAGE"
                                                ? "pl-8"
                                                : "pl-12"
                                        } ${isPercentageInvalid ? "border-2 border-red-500 focus:ring-red-500" : ""}`}
                                        placeholder={discountType === "PERCENTAGE"
                                        ? "0"
                                        : "0.00"}
                                        value={discountValue}
                                        onChange={(e) =>
                                            setDiscountValue(e.target.value)
                                        }
                                        min='0'
                                        max={discountType === "PERCENTAGE" ? 100 : undefined}
                                        step={discountType === "PERCENTAGE" ? "1" : "0.01"}
                                    />
                                </div>
                                {isPercentageInvalid && (
                                    <p className='text-red-500 text-sm mt-2'>
                                        Percentage discount cannot exceed 100%
                                    </p>
                                )}
                                {discountType === "FIXED" && parsedValue > grossTotal && grossTotal > 0 && (
                                    <p className='text-yellow-400 text-xs mt-1'>
                                        Discount exceeds subtotal — will be capped at {taxSettings.currency_symbol}{grossTotal.toFixed(2)}
                                    </p>
                                )}
                            </div>

                            {/* Discount Reason/Tag */}
                            <div>
                                <label className='block text-sm font-medium mb-2'>
                                    Discount Reason (Optional)
                                </label>
                                <input
                                    type='text'
                                    className='w-full px-4 py-3 bg-zinc-100 dark:bg-muted rounded-lg outline-none focus:ring-2 focus:ring-blue-500'
                                    placeholder='e.g., VIP Customer, Holiday Promo, etc.'
                                    value={discountReason}
                                    onChange={(e) =>
                                        setDiscountReason(e.target.value)
                                    }
                                />
                            </div>

                            {/* Action Buttons */}
                            <div className='flex flex-col gap-3'>
                                <button
                                    onClick={onClose}
                                    className='flex-1 px-4 py-3 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded-lg transition-colors font-medium'
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        if (isPercentageInvalid) {
                                            return
                                        }
                                        if (!isValueInvalid) {
                                            setAppliedDiscount(parsedValue)
                                            onClose()
                                            addNotification("Discount applied successfully", "SUCCESS", "Discount", true)
                                        }
                                    }}
                                    disabled={isApplyDisabled}
                                    className='flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 disabled:cursor-not-allowed rounded-lg transition-colors font-medium text-foreground'
                                >
                                    Apply Discount
                                </button>
                                <button
                                    onClick={() => {
                                        setAppliedDiscount(0)
                                        setDiscountType("PERCENTAGE")
                                        setDiscountValue("")
                                        setDiscountReason("")
                                        onClose()
                                        addNotification("Discount removed", "INFO", "Discount", true)
                                    }}
                                    disabled={appliedDiscount === 0}
                                    className='px-4 py-3 bg-red-500 hover:bg-red-600 disabled:bg-zinc-300 disabled:cursor-not-allowed rounded-lg transition-colors font-medium text-foreground flex flex-row items-center justify-center gap-2'
                                >
                                    Remove Discount
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </>
    )
}
