"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { HistoryIcon, ChevronUpIcon, LoaderCircleIcon, ChevronLeftIcon, ChevronRightIcon, ReceiptIcon } from "lucide-react"
import { motion } from "motion/react"
import { Transaction } from "@/utils/types/transactions"
import { CurrencyTaxValue } from "@/utils/types/settings"
import { Branch } from "@/utils/types/branch"
import { formatManilaTime } from "@/utils/timezone"
import { SkeletonRow } from "../ui/SkeletonRow"
import { generateReceipt } from "@/server/actions/transactions"

interface RecentTransactionsProps {
    transactions: Transaction[]
    loading: boolean
    taxSettings: CurrencyTaxValue
    handleVoid: (txnId: string) => void
    setSelectedTransactionForPayment: (txn: Transaction | null) => void
    setIsAddPaymentModalOpen: (open: boolean) => void
    isTransactionsOpen: boolean
    setIsTransactionsOpen: (open: boolean) => void
    txnPage: number
    setTxnPage: (page: number) => void
    txnPageSize: number
    setTxnPageSize: (size: number) => void
    txnHasMore: boolean
    txnLoading: boolean
    refreshTransactions: () => Promise<void>
}

export default function RecentTransactions({
    transactions,
    loading,
    taxSettings,
    handleVoid,
    setSelectedTransactionForPayment,
    setIsAddPaymentModalOpen,
    isTransactionsOpen,
    setIsTransactionsOpen,
    txnPage,
    setTxnPage,
    txnPageSize,
    setTxnPageSize,
    txnHasMore,
    txnLoading,
    refreshTransactions,
}: RecentTransactionsProps) {
    const [generatingReceipts, setGeneratingReceipts] = useState<Set<string>>(new Set())



    const handleDownloadReceipt = async (transactionId: string) => {
        if (generatingReceipts.has(transactionId)) return

        setGeneratingReceipts(prev => new Set(prev).add(transactionId))
        try {
            const result = await generateReceipt(transactionId)

            if (result.success && result.data) {
                const pdfBuffer = new Uint8Array(result.data.pdf)
                const blob = new Blob([pdfBuffer], { type: "application/pdf" })
                const url = URL.createObjectURL(blob)

                const link = document.createElement("a")
                link.href = url
                link.download = result.data.filename
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                URL.revokeObjectURL(url)
            }
        } catch (error) {
            console.error("Error generating receipt:", error)
        } finally {
            setGeneratingReceipts(prev => {
                const next = new Set(prev)
                next.delete(transactionId)
                return next
            })
        }
    }

    // Skip initial mount to avoid double fetch - SalesContext already fetches on mount
    const isInitialMount = useRef(true)
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false
            return
        }
        refreshTransactions()
    }, [txnPage, txnPageSize, refreshTransactions])

    return (
        <div className='absolute bottom-0 left-0 right-0 flex flex-col bg-black/95 border-t border-border z-20'>
            {/* Header - Always visible, clickable to toggle */}
            <button
                onClick={() => setIsTransactionsOpen(!isTransactionsOpen)}
                className='p-3 flex justify-between items-center bg-black/60 hover:bg-black/80 transition-colors cursor-pointer border-b border-border'
            >
                <h2 className='font-bold flex items-center gap-2 text-sm'>
                    <HistoryIcon className='w-4 h-4' />
                    Recent Transactions
                    {transactions.length > 0 && (
                        <span className='ml-2 px-2 py-0.5 bg-card rounded-full text-xs'>
                            {transactions.length}
                        </span>
                    )}
                </h2>
                <motion.div
                    animate={{ rotate: isTransactionsOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronUpIcon className='w-5 h-5' />
                </motion.div>
            </button>

            {/* Collapsible Content */}
            <motion.div
                initial={false}
                animate={{
                    height: isTransactionsOpen ? 250 : 0,
                    opacity: isTransactionsOpen ? 1 : 0,
                }}
                transition={{
                    duration: 0.3,
                    ease: "easeInOut",
                }}
                className='overflow-hidden'
            >
                <div className='h-[250px] overflow-auto'>
                    <table className='min-w-max w-full h-max table-auto border-collapse relative'>
                        <thead className='sticky top-0 bg-black/80'>
                            <tr className='text-nowrap select-none'>
                                <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                    Time
                                </th>
                                <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                    Transaction #
                                </th>
                                <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                    Branch
                                </th>
                                <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                    Items
                                </th>
                                <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                    Details
                                </th>
                                <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                    Total
                                </th>
                                <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                    Payment
                                </th>
                                <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                    Balance
                                </th>
                                <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                    Status
                                </th>
                                <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                                    Action
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <SkeletonRow count={5} />
                            ) : transactions.length === 0 ? (
                                <tr>
                                        <td colSpan={10} className='px-4 py-8 text-center text-muted-foreground/70'>
                                        No recent transactions
                                    </td>
                                </tr>
                            ) : (
                                transactions.map((txn) => (
                                    <tr key={txn.id} className='hover:bg-muted transition-colors text-nowrap'>
                                        <td 
                                            className='px-3 py-1 text-sm font-medium w-max text-muted-foreground'
                                            title={formatManilaTime(txn.created_at, 'datetime')}
                                        >
                                            {formatManilaTime(txn.created_at, 'time')}
                                        </td>
                                        <td className='px-3 py-1 text-sm font-medium w-max uppercase font-mono'>
                                            {txn.transaction_number}
                                        </td>
                                        <td className='px-3 py-1 text-sm font-medium w-max'>
                                            {txn.branch_id ? (
                                                <span className='text-xs px-1.5 py-0.5 bg-blue-400/20 text-blue-300 rounded'>
                                                    {txn.branch_id}
                                                </span>
                                            ) : (
                                                <span className='text-xs px-1.5 py-0.5 bg-card rounded'>
                                                    Shared
                                                </span>
                                            )}
                                        </td>
                                        <td className='px-3 py-1 text-sm font-medium w-max'>
                                            <span className='px-2 py-0.5 bg-card rounded text-xs border border-border'>
                                                {txn.items?.length || 0} items
                                            </span>
                                        </td>
                                        <td className='px-3 py-1 text-sm w-max max-w-48'>
                                            <div className='flex flex-col gap-1'>
                                                {txn.client_type && (
                                                    <span
                                                        className={`px-1.5 py-0.5 rounded-xs text-xs font-semibold border border-border w-fit ${
                                                            txn.client_type === 'PERSONAL'
                                                                ? 'bg-purple-400/20 text-purple-300'
                                                                : 'bg-cyan-400/20 text-cyan-300'
                                                        }`}
                                                    >
                                                        {txn.client_type === 'PERSONAL' ? 'Personal' : 'Walk-in'}
                                                    </span>
                                                )}
                                                {txn.sales_description && (
                                                    <span className='text-xs text-muted-foreground whitespace-pre-line leading-snug'>
                                                        {txn.sales_description}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className='px-3 py-1 text-sm font-bold w-max text-green-400'>
                                            {taxSettings.currency_symbol}
                                            {txn.total.toFixed(2)}
                                        </td>
                                        <td className='px-3 py-1 text-sm font-medium w-max'>
                                            <span className='px-2 py-0.5 bg-card rounded text-xs border border-border'>
                                                {txn.payment_method}
                                            </span>
                                        </td>
                                        <td className='px-3 py-1 text-sm font-medium w-max'>
                                            {txn.balance_due > 0 ? (
                                                <span className='text-amber-400 font-medium'>
                                                    {taxSettings.currency_symbol}
                                                    {txn.balance_due.toFixed(2)}
                                                </span>
                                            ) : (
                                                <span className='text-green-400'>Paid</span>
                                            )}
                                        </td>
                                        <td className='px-3 py-1 text-sm font-medium w-max'>
                                            <span
                                                className={`px-2 py-0.5 rounded-sm text-xs font-semibold border-2 border-border ${
                                                    txn.status === "COMPLETED"
                                                        ? "bg-green-400/20 text-green-300"
                                                        : txn.status === "PARTIAL"
                                                          ? "bg-amber-400/20 text-amber-300"
                                                          : txn.status === "VOIDED"
                                                            ? "bg-red-400/20 text-red-300"
                                                            : txn.status === "DOWNPAYMENT_PENDING"
                                                              ? "bg-purple-400/20 text-purple-300"
                                                              : txn.status === "DOWNPAYMENT_ASSIGNED"
                                                                ? "bg-indigo-400/20 text-indigo-300"
                                                                : txn.status === "REFUNDED"
                                                                  ? "bg-orange-400/20 text-orange-300"
                                                                  : "bg-card text-foreground"
                                                }`}
                                            >
                                                {txn.status}
                                            </span>
                                        </td>
                                        <td className='px-3 py-1 text-sm font-medium w-max'>
                                            <div className='flex items-center gap-1'>
                                                {(txn.status === "COMPLETED" || txn.status === "PARTIAL" || txn.status === "DOWNPAYMENT_PENDING" || txn.status === "DOWNPAYMENT_ASSIGNED") && (
                                                    <button
                                                        onClick={() => handleDownloadReceipt(txn.id)}
                                                        disabled={generatingReceipts.has(txn.id)}
                                                        className='flex items-center gap-1 px-2 py-0.5 bg-amber-400/20 hover:bg-amber-400/40 text-amber-300 text-xs font-semibold rounded-sm border-2 border-border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                                                        title='Download Receipt'
                                                    >
                                                        {generatingReceipts.has(txn.id) ? (
                                                            <LoaderCircleIcon className='w-3 h-3 animate-spin' />
                                                        ) : (
                                                            <ReceiptIcon className='w-3 h-3' />
                                                        )}
                                                        <span>Receipt</span>
                                                    </button>
                                                )}
                                                {(txn.status === "COMPLETED" || txn.status === "PARTIAL" || txn.status === "DOWNPAYMENT_PENDING" || txn.status === "DOWNPAYMENT_ASSIGNED") && (
                                                    <button
                                                        onClick={() => handleVoid(txn.id)}
                                                        className='px-2 py-0.5 bg-red-400/20 hover:bg-red-400/40 text-red-300 text-xs font-semibold rounded-sm border-2 border-border transition-colors cursor-pointer'
                                                    >
                                                        Void
                                                    </button>
                                                )}
                                                {(txn.status === "PARTIAL" || txn.status === "DOWNPAYMENT_PENDING" || txn.status === "DOWNPAYMENT_ASSIGNED") && (
                                                    <button
                                                        onClick={() => {
                                                            setSelectedTransactionForPayment(txn)
                                                            setIsAddPaymentModalOpen(true)
                                                        }}
                                                        className='px-2 py-0.5 bg-blue-400/20 hover:bg-blue-400/40 text-blue-300 text-xs font-semibold rounded-sm border-2 border-border transition-colors cursor-pointer'
                                                    >
                                                        Add Payment
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className='flex items-center justify-between mt-4 px-2'>
                    <div className='flex items-center gap-2'>
                        <span className='text-sm text-muted-foreground'>
                            Rows per page:
                        </span>
                        <select
                            value={txnPageSize}
                            onChange={(e) => {
                                setTxnPageSize(Number(e.target.value))
                                setTxnPage(1)
                            }}
                            className='bg-card border border-border rounded px-2 py-1 text-sm cursor-pointer'
                        >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                    <div className='flex items-center gap-2'>
                        <span className='text-sm text-muted-foreground'>
                            Page {txnPage}
                        </span>
                        <div className='flex gap-1'>
                            <button
                                onClick={() => setTxnPage(txnPage - 1)}
                                disabled={txnPage === 1 || txnLoading}
                                className='p-1.5 rounded bg-card hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer'
                            >
                                <ChevronLeftIcon size={16} />
                            </button>
                            <button
                                onClick={() => setTxnPage(txnPage + 1)}
                                disabled={!txnHasMore || txnLoading}
                                className='p-1.5 rounded bg-card hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer'
                            >
                                <ChevronRightIcon size={16} />
                            </button>
                        </div>
                        {txnLoading && (
                            <LoaderCircleIcon size={16} className='animate-spin text-muted-foreground/70' />
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
