"use client"

import React, { useState } from "react"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { motion } from "motion/react"
import { LedgerEntryType } from "@/utils/types/ledger"

interface TrialBalanceRow {
    type: LedgerEntryType
    category: string
    total_debit: number
    total_credit: number
}

interface TrialBalanceProps {
    data: TrialBalanceRow[]
    currencySymbol: string
}

const ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
    EXPENSE: "Expenses",
    REVENUE: "Revenue",
    ASSET: "Assets",
    LIABILITY: "Liabilities",
    EQUITY: "Equity",
}

const ENTRY_TYPE_COLORS: Record<LedgerEntryType, string> = {
    EXPENSE: "bg-red-400/20 text-red-300 border-red-400/30",
    REVENUE: "bg-green-400/20 text-green-300 border-green-400/30",
    ASSET: "bg-blue-400/20 text-blue-300 border-blue-400/30",
    LIABILITY: "bg-orange-400/20 text-orange-300 border-orange-400/30",
    EQUITY: "bg-purple-400/20 text-purple-300 border-purple-400/30",
}

export default function TrialBalance({ data, currencySymbol }: TrialBalanceProps) {
    const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())

    const toggleType = (type: string) => {
        setExpandedTypes((prev) => {
            const next = new Set(prev)
            if (next.has(type)) next.delete(type)
            else next.add(type)
            return next
        })
    }

    // Group by type
    const grouped: Record<string, TrialBalanceRow[]> = {}
    data.forEach((row) => {
        if (!grouped[row.type]) grouped[row.type] = []
        grouped[row.type].push(row)
    })

    const typeOrder: LedgerEntryType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']

    const totalDebits = data.reduce((sum, row) => sum + row.total_debit, 0)
    const totalCredits = data.reduce((sum, row) => sum + row.total_credit, 0)
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

    return (
        <div className='bg-muted border border-border rounded-lg overflow-hidden'>
            <div className='px-4 py-3 bg-muted border-b border-border flex items-center justify-between'>
                <h3 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider'>
                    Trial Balance
                </h3>
                <span className={`text-xs px-2 py-1 rounded ${isBalanced ? 'bg-green-400/20 text-green-300' : 'bg-red-400/20 text-red-300'}`}>
                    {isBalanced ? 'Balanced' : `Difference: ${currencySymbol}${Math.abs(totalDebits - totalCredits).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                </span>
            </div>

            <div className='overflow-x-auto'>
                <table className='w-full min-w-[600px]'>
                    <thead>
                        <tr className='text-xs text-muted-foreground border-b border-border'>
                            <th className='text-left px-4 py-2'>Account</th>
                            <th className='text-right px-4 py-2'>Debit</th>
                            <th className='text-right px-4 py-2'>Credit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {typeOrder.map((type) => {
                            const rows = grouped[type]
                            if (!rows || rows.length === 0) return null

                            const typeDebit = rows.reduce((sum, r) => sum + r.total_debit, 0)
                            const typeCredit = rows.reduce((sum, r) => sum + r.total_credit, 0)
                            const isExpanded = expandedTypes.has(type)

                            return (
                                <React.Fragment key={type}>
                                    <tr
                                        role="button"
                                        tabIndex={0}
                                        aria-expanded={isExpanded}
                                        aria-controls={`group-${type}`}
                                        onClick={() => toggleType(type)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault()
                                                toggleType(type)
                                            }
                                        }}
                                        className='bg-muted cursor-pointer hover:bg-muted transition-colors'
                                    >
                                        <td className='px-4 py-2'>
                                            <div className='flex items-center gap-2'>
                                                {isExpanded ? (
                                                    <ChevronDownIcon className='w-3 h-3 text-muted-foreground/70' aria-hidden="true" />
                                                ) : (
                                                    <ChevronRightIcon className='w-3 h-3 text-muted-foreground/70' aria-hidden="true" />
                                                )}
                                                <span className={`text-xs px-2 py-0.5 rounded border ${ENTRY_TYPE_COLORS[type]}`}>
                                                    {ENTRY_TYPE_LABELS[type]}
                                                </span>
                                            </div>
                                        </td>
                                        <td className='text-right px-4 py-2 text-sm font-mono text-red-300'>
                                            {typeDebit > 0 ? `${currencySymbol}${typeDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                        </td>
                                        <td className='text-right px-4 py-2 text-sm font-mono text-green-300'>
                                            {typeCredit > 0 ? `${currencySymbol}${typeCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <>
                                            {[...rows]
                                                .sort((a, b) => Math.abs(b.total_debit + b.total_credit) - Math.abs(a.total_debit + a.total_credit))
                                                .map((row) => (
                                                    <motion.tr
                                                        key={`${row.type}-${row.category}`}
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className='border-b border-border hover:bg-muted'
                                                    >
                                                        <td className='px-4 py-1.5 pl-10 text-sm text-foreground/90'>
                                                            {row.category}
                                                        </td>
                                                        <td className='text-right px-4 py-1.5 text-sm font-mono text-red-300/70'>
                                                            {row.total_debit > 0 ? `${currencySymbol}${row.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                        </td>
                                                        <td className='text-right px-4 py-1.5 text-sm font-mono text-green-300/70'>
                                                            {row.total_credit > 0 ? `${currencySymbol}${row.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                                        </td>
                                                    </motion.tr>
                                                ))}
                                        </>
                                    )}
                                </React.Fragment>
                            )
                        })}
                    </tbody>
                    <tfoot>
                        <tr className='bg-card border-t-2 border-border font-bold'>
                            <td className='px-4 py-2 text-sm'>Total</td>
                            <td className='text-right px-4 py-2 text-sm font-mono text-red-300'>
                                {currencySymbol}{totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className='text-right px-4 py-2 text-sm font-mono text-green-300'>
                                {currencySymbol}{totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    )
}
