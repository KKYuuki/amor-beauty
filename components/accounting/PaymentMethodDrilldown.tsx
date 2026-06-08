"use client"

import { useState } from "react"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import {
    LedgerEntryType,
    PaymentMethodCategoryBreakdown,
} from "@/utils/types/ledger"
import {
    ACCOUNTING_PAYMENT_METHOD_COLORS,
} from "@/utils/types/payment"

interface PaymentMethodDrilldownProps {
    breakdown: PaymentMethodCategoryBreakdown[]
    currencySymbol: string
    onCategoryClick?: (method: string, category: string, entryType: LedgerEntryType) => void
}

const ENTRY_TYPE_COLORS: Record<LedgerEntryType, string> = {
    EXPENSE: "bg-red-400/20 text-red-300 border-red-400/30",
    REVENUE: "bg-green-400/20 text-green-300 border-green-400/30",
    ASSET: "bg-blue-400/20 text-blue-300 border-blue-400/30",
    LIABILITY: "bg-orange-400/20 text-orange-300 border-orange-400/30",
    EQUITY: "bg-purple-400/20 text-purple-300 border-purple-400/30",
}

function formatAmount(value: number, currencySymbol: string): string {
    const prefix = value >= 0 ? "+" : "-"
    return `${prefix}${currencySymbol}${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

export default function PaymentMethodDrilldown({
    breakdown,
    currencySymbol,
    onCategoryClick,
}: PaymentMethodDrilldownProps) {
    const [expandedMethods, setExpandedMethods] = useState<Set<string>>(new Set())
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

    const toggleMethod = (method: string) => {
        setExpandedMethods((prev) => {
            const next = new Set(prev)
            if (next.has(method)) {
                next.delete(method)
            } else {
                next.add(method)
            }
            return next
        })
    }

    const toggleCategory = (key: string) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev)
            if (next.has(key)) {
                next.delete(key)
            } else {
                next.add(key)
            }
            return next
        })
    }

    return (
        <div className='space-y-2'>
            <h3 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider'>
                Payment Method Breakdown
            </h3>
            {breakdown.map((pm) => {
                const isExpanded = expandedMethods.has(pm.method)
                const methodColorClass = pm.method !== 'UNSPECIFIED' && pm.method !== null
                    ? (ACCOUNTING_PAYMENT_METHOD_COLORS as Record<string, string>)[pm.method] || 'bg-muted text-foreground/90 border-border'
                    : 'bg-card text-muted-foreground border-border'

                return (
                    <div
                        key={pm.method}
                        className='bg-muted border border-border rounded-lg overflow-hidden'
                    >
                        <button
                            onClick={() => toggleMethod(pm.method)}
                            aria-expanded={isExpanded}
                            aria-controls={`method-content-${pm.method}`}
                            className='w-full flex items-center justify-between p-4 hover:bg-muted transition-colors cursor-pointer'
                        >
                            <div className='flex items-center gap-3'>
                                {isExpanded ? (
                                    <ChevronDownIcon aria-hidden="true" className='w-4 h-4 text-muted-foreground' />
                                ) : (
                                    <ChevronRightIcon aria-hidden="true" className='w-4 h-4 text-muted-foreground' />
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded border ${methodColorClass}`}>
                                    {pm.method_label}
                                </span>
                                <span className='text-sm text-muted-foreground'>
                                    {pm.count} entries
                                </span>
                            </div>
                            <div className='flex items-center gap-4'>
                                <span className='text-xs text-muted-foreground/70'>
                                    DR {currencySymbol}{pm.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                                <span className='text-xs text-muted-foreground/70'>
                                    CR {currencySymbol}{pm.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                                <span className={`text-sm font-bold ${pm.net >= 0 ? 'text-red-300' : 'text-green-300'}`}>
                                    {formatAmount(pm.net, currencySymbol)}
                                </span>
                            </div>
                        </button>

                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    id={`method-content-${pm.method}`}
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className='overflow-clip mt-2'
                                >
                                    <div className='px-4 pb-4 space-y-2'>
                                        {[...pm.categories]
                                            .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
                                            .map((cat) => {
                                                const catKey = `${pm.method}-${cat.category}-${cat.entry_type}`
                                                const isCatExpanded = expandedCategories.has(catKey)

                                                return (
                                                    <div
                                                        key={catKey}
                                                        className='bg-muted rounded-md border border-border'
                                                    >
                                                        <button
                                                            onClick={() => toggleCategory(catKey)}
                                                            aria-expanded={isCatExpanded}
                                                            aria-controls={`category-content-${catKey}`}
                                                            className='w-full flex items-center justify-between p-3 hover:bg-muted transition-colors cursor-pointer'
                                                        >
                                                            <div className='flex items-center gap-2'>
                                                                {isCatExpanded ? (
                                                                    <ChevronDownIcon aria-hidden="true" className='w-3 h-3 text-muted-foreground/70' />
                                                                ) : (
                                                                    <ChevronRightIcon aria-hidden="true" className='w-3 h-3 text-muted-foreground/70' />
                                                                )}
                                                                <span className={`text-xs px-1.5 py-0.5 rounded border ${ENTRY_TYPE_COLORS[cat.entry_type]}`}>
                                                                    {cat.entry_type}
                                                                </span>
                                                                <span className='text-sm text-foreground'>
                                                                    {cat.category}
                                                                </span>
                                                                <span className='text-xs text-muted-foreground/70'>
                                                                    ({cat.count})
                                                                </span>
                                                            </div>
                                                            <div className='flex items-center gap-3'>
                                                                <span className='text-xs text-muted-foreground/70'>
                                                                    DR {currencySymbol}{cat.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                </span>
                                                                <span className='text-xs text-muted-foreground/70'>
                                                                    CR {currencySymbol}{cat.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                </span>
                                                                <span className={`text-sm font-semibold ${cat.net >= 0 ? 'text-red-300' : 'text-green-300'}`}>
                                                                    {formatAmount(cat.net, currencySymbol)}
                                                                </span>
                                                            </div>
                                                        </button>

                                                        <AnimatePresence>
                                                            {isCatExpanded && (
                                                                <motion.div
                                                                    id={`category-content-${catKey}`}
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: 'auto', opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    transition={{ duration: 0.15 }}
                                                                    className='overflow-hidden'
                                                                >
                                                                    <div className='px-3 pb-3'>
                                                                        <div className='flex items-center justify-between text-xs bg-muted rounded p-2 mb-1'>
                                                                            <span className='text-muted-foreground'>
                                                                                {cat.count} {cat.count === 1 ? 'entry' : 'entries'}
                                                                            </span>
                                                                            <div className='flex items-center gap-3'>
                                                                                <span className='text-red-300/70'>
                                                                                    DR {currencySymbol}{cat.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                                </span>
                                                                                <span className='text-green-300/70'>
                                                                                    CR {currencySymbol}{cat.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        {onCategoryClick && (
                                                                            <button
                                                                                onClick={() => onCategoryClick(pm.method, cat.category, cat.entry_type)}
                                                                                className='text-xs text-blue-400 hover:text-blue-300 underline cursor-pointer'
                                                                            >
                                                                                View entries for {cat.category} ({cat.count} entries)
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                )
                                            })}

                                        <div className='flex items-center justify-between pt-2 border-t border-border'>
                                            <span className='text-xs font-semibold text-muted-foreground uppercase'>
                                                Subtotal
                                            </span>
                                            <div className='flex items-center gap-3'>
                                                <span className='text-xs text-muted-foreground/70'>
                                                    DR {currencySymbol}{pm.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                                <span className='text-xs text-muted-foreground/70'>
                                                    CR {currencySymbol}{pm.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                                <span className={`text-sm font-bold ${pm.net >= 0 ? 'text-red-300' : 'text-green-300'}`}>
                                                    {formatAmount(pm.net, currencySymbol)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )
            })}
        </div>
    )
}
