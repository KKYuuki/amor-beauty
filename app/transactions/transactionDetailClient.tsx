"use client"

import { useState, useEffect, useContext } from "react"
import { useRouter } from "next/navigation"
import {
    ArrowLeftIcon,
    FileTextIcon,
    PrinterIcon,
    XCircleIcon,
    RotateCcwIcon,
    LoaderCircleIcon,
    UserIcon,
    CreditCardIcon,
    BuildingIcon,
    PackageIcon,
    HashIcon,
    AlertCircleIcon,
    WalletIcon,
} from "lucide-react"
import PageHeader from "@/components/ui/PageHeader"
import { NotificationContext } from "@/components/notifications"
import { Transaction, TransactionStatus } from "@/utils/types/transactions"
import {
    voidTransaction,
    refundTransaction,
    generateReceipt,
} from "@/server/actions/transactions"
import { getSetting } from "@/server/actions/settings"

interface TransactionDetailClientProps {
    transaction: Transaction
    items: {
        id: string
        transactionId: string
        inventoryId: string | null
        serviceId: string | null
        itemName: string | null
        quantity: string
        unitPrice: string
        lineTotal: string
    }[]
    payments: {
        id: string
        transactionId: string
        amount: string
        paymentMethod: string
        referenceNumber: string | null
        createdAt: Date
        createdBy: string | null
    }[]
    canManage: boolean
}

export default function TransactionDetailClient({
    transaction,
    items,
    payments,
    canManage,
}: TransactionDetailClientProps) {
    const router = useRouter()
    const { addNotification } = useContext(NotificationContext)

    const [currencySymbol, setCurrencySymbol] = useState("$")
    const [isLoading, setIsLoading] = useState(false)
    const [showVoidModal, setShowVoidModal] = useState(false)
    const [showRefundModal, setShowRefundModal] = useState(false)
    const [voidReason, setVoidReason] = useState("")
    const [refundReason, setRefundReason] = useState("")
    const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false)

    // Fetch currency on mount
    useEffect(() => {
        const fetchCurrency = async () => {
            const taxData = await getSetting("currency_tax")
            if (taxData.success && taxData.data) {
                setCurrencySymbol(taxData.data.currency_symbol)
            }
        }
        fetchCurrency()
    }, [])

    const handleVoid = async () => {
        if (!voidReason.trim()) {
            addNotification("Please provide a reason for voiding", "ERROR")
            return
        }

        setIsLoading(true)
        try {
            const result = await voidTransaction({
                transaction_id: transaction.id,
                void_reason: voidReason,
                voided_by: "", // Server action will set this from session
            })

            if (result.success) {
                addNotification("Transaction voided successfully", "SUCCESS")
                setShowVoidModal(false)
                // Refresh the page to show updated status
                router.refresh()
            } else {
                addNotification(result.error || "Failed to void transaction", "ERROR")
            }
        } catch (error) {
            console.error("Error voiding transaction:", error)
            addNotification("An error occurred while voiding the transaction", "ERROR")
        } finally {
            setIsLoading(false)
        }
    }

    const handleRefund = async () => {
        if (!refundReason.trim()) {
            addNotification("Please provide a reason for the refund", "ERROR")
            return
        }

        setIsLoading(true)
        try {
            const result = await refundTransaction(transaction.id, refundReason)

            if (result.success) {
                addNotification("Transaction refunded successfully", "SUCCESS")
                setShowRefundModal(false)
                // Refresh the page to show updated status
                router.refresh()
            } else {
                addNotification(result.error || "Failed to refund transaction", "ERROR")
            }
        } catch (error) {
            console.error("Error refunding transaction:", error)
            addNotification("An error occurred while processing the refund", "ERROR")
        } finally {
            setIsLoading(false)
        }
    }

    const handlePrintReceipt = async () => {
        setIsGeneratingReceipt(true)
        try {
            const result = await generateReceipt(transaction.id)

            if (result.success && result.data) {
                // Create blob from PDF data
                const pdfBuffer = new Uint8Array(result.data.pdf)
                const blob = new Blob([pdfBuffer], { type: "application/pdf" })
                const url = URL.createObjectURL(blob)

                // Open in new tab or download
                const link = document.createElement("a")
                link.href = url
                link.download = result.data.filename
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                URL.revokeObjectURL(url)

                addNotification("Receipt generated successfully", "SUCCESS")
            } else {
                addNotification("Failed to generate receipt", "ERROR")
            }
        } catch (error) {
            console.error("Error generating receipt:", error)
            addNotification("An error occurred while generating the receipt", "ERROR")
        } finally {
            setIsGeneratingReceipt(false)
        }
    }

    const getStatusBadge = (status: TransactionStatus) => {
        const styles: Record<TransactionStatus, string> = {
            COMPLETED: "bg-green-400/20 text-green-300 border-green-400/30",
            PENDING: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30",
            PARTIAL: "bg-blue-400/20 text-blue-300 border-blue-400/30",
            VOIDED: "bg-red-400/20 text-red-300 border-red-400/30",
            REFUNDED: "bg-orange-400/20 text-orange-300 border-orange-400/30",
            DOWNPAYMENT_PENDING: "bg-purple-400/20 text-purple-300 border-purple-400/30",
            DOWNPAYMENT_ASSIGNED: "bg-indigo-400/20 text-indigo-300 border-indigo-400/30",
        }

        return (
            <span
                className={`px-3 py-1 rounded-sm text-sm font-semibold border-2 ${styles[status]}`}
            >
                {status}
            </span>
        )
    }

    const isVoidedOrRefunded = transaction.status === "VOIDED" || transaction.status === "REFUNDED"

    return (
        <div className="flex-1 w-full flex flex-col h-full overflow-hidden">
            <PageHeader
                title="Transaction Details"
                description={`Transaction ${transaction.transaction_number}`}
                icon={<FileTextIcon className="w-6 h-6" />}
                actions={
                    <>
                        <button
                            onClick={() => router.push("/transactions")}
                            className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors border-2 border-white/5 cursor-pointer"
                        >
                            <ArrowLeftIcon className="w-4 h-4" />
                            <span className="text-sm font-medium">Back</span>
                        </button>
                        <button
                            onClick={handlePrintReceipt}
                            disabled={isGeneratingReceipt || isVoidedOrRefunded}
                            className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-md transition-colors border-2 border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {isGeneratingReceipt ? (
                                <LoaderCircleIcon className="w-4 h-4 animate-spin" />
                            ) : (
                                <PrinterIcon className="w-4 h-4" />
                            )}
                            <span className="text-sm font-medium hidden sm:inline">Print Receipt</span>
                        </button>
                        {canManage && !isVoidedOrRefunded && (
                            <>
                                <button
                                    onClick={() => setShowRefundModal(true)}
                                    className="flex items-center gap-2 px-3 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded-md transition-colors border-2 border-orange-500/30 cursor-pointer"
                                >
                                    <RotateCcwIcon className="w-4 h-4" />
                                    <span className="text-sm font-medium hidden sm:inline">Refund</span>
                                </button>
                                <button
                                    onClick={() => setShowVoidModal(true)}
                                    className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-md transition-colors border-2 border-red-500/30 cursor-pointer"
                                >
                                    <XCircleIcon className="w-4 h-4" />
                                    <span className="text-sm font-medium hidden sm:inline">Void</span>
                                </button>
                            </>
                        )}
                    </>
                }
            />

            <div className="flex-1 overflow-auto p-4">
                <div className="max-w-6xl mx-auto space-y-6">
                    {/* Status Banner */}
                    <div className="flex items-center justify-between bg-white/5 rounded-lg p-4 border border-white/10">
                        <div className="flex items-center gap-4">
                            <div>
                                <p className="text-sm text-white/60">Status</p>
                                <div className="mt-1">{getStatusBadge(transaction.status)}</div>
                            </div>
                            <div>
                                <p className="text-sm text-white/60">Transaction Date</p>
                                <p className="text-white font-medium">
                                    {new Date(transaction.created_at).toLocaleString()}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm text-white/60">Transaction Number</p>
                                <p className="text-white font-mono uppercase">{transaction.transaction_number}</p>
                            </div>
                        </div>
                    </div>

                    {/* Customer & Staff Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <UserIcon className="w-5 h-5 text-white/60" />
                                Customer Information
                            </h3>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-sm text-white/60">Name</p>
                                    <p className="text-white font-medium capitalize">
                                        {transaction.buyer?.full_name || transaction.buyer_name || "Walk-in Customer"}
                                    </p>
                                </div>
                                {transaction.client_type && (
                                    <div>
                                        <p className="text-sm text-white/60">Client Type</p>
                                        <span
                                            className={`inline-block mt-1 px-3 py-0.5 rounded-xs text-sm font-semibold border-2 border-white/5 ${
                                                transaction.client_type === 'PERSONAL'
                                                    ? 'bg-purple-400/20 text-purple-300'
                                                    : 'bg-cyan-400/20 text-cyan-300'
                                            }`}
                                        >
                                            {transaction.client_type === 'PERSONAL' ? 'Personal' : 'Walk-in'}
                                        </span>
                                    </div>
                                )}
                                {transaction.customer_phone && (
                                    <div>
                                        <p className="text-sm text-white/60">Phone</p>
                                        <p className="text-white font-medium">{transaction.customer_phone}</p>
                                    </div>
                                )}
                                {transaction.customer_email && (
                                    <div>
                                        <p className="text-sm text-white/60">Email</p>
                                        <p className="text-white font-medium">{transaction.customer_email}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <BuildingIcon className="w-5 h-5 text-white/60" />
                                Staff & Location
                            </h3>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-sm text-white/60">Staff</p>
                                    <p className="text-white font-medium capitalize">
                                        {transaction.staff?.full_name || "Unknown"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-white/60">Branch</p>
                                    <p className="text-white font-medium">
                                        {transaction.branch?.name || "Default Branch"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Items */}
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <PackageIcon className="w-5 h-5 text-white/60" />
                            Items ({items.length})
                        </h3>
                        {items.length === 0 ? (
                            <p className="text-white/60">No items in this transaction</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-white/10">
                                            <th className="text-left py-2 px-3 text-sm text-white/60 font-medium">Item</th>
                                            <th className="text-center py-2 px-3 text-sm text-white/60 font-medium">Qty</th>
                                            <th className="text-right py-2 px-3 text-sm text-white/60 font-medium">Unit Price</th>
                                            <th className="text-right py-2 px-3 text-sm text-white/60 font-medium">Line Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item) => (
                                            <tr key={item.id} className="border-b border-white/5 last:border-0">
                                                <td className="py-3 px-3 text-white">{item.itemName || "Unknown Item"}</td>
                                                <td className="py-3 px-3 text-center text-white">{item.quantity}</td>
                                                <td className="py-3 px-3 text-right text-white">
                                                    {currencySymbol}{Number(item.unitPrice).toFixed(2)}
                                                </td>
                                                <td className="py-3 px-3 text-right text-white font-medium">
                                                    {currencySymbol}{Number(item.lineTotal).toFixed(2)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Payment Information */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <CreditCardIcon className="w-5 h-5 text-white/60" />
                                Payment Details
                            </h3>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-white/60">Payment Method</span>
                                    <span className="text-white font-medium">{transaction.payment_method}</span>
                                </div>
                                {transaction.reference_number && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Reference Number</span>
                                        <span className="text-white font-mono">{transaction.reference_number}</span>
                                    </div>
                                )}
                                {payments.length > 0 && (
                                    <div className="mt-4">
                                        <p className="text-sm text-white/60 mb-2">Split Payments</p>
                                        <div className="space-y-2">
                                            {payments.map((payment) => (
                                                <div key={payment.id} className="flex justify-between bg-white/5 p-2 rounded">
                                                    <span className="text-white">{payment.paymentMethod}</span>
                                                    <span className="text-white font-medium">
                                                        {currencySymbol}{Number(payment.amount).toFixed(2)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Financial Summary */}
                        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <HashIcon className="w-5 h-5 text-white/60" />
                                Financial Summary
                            </h3>
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-white/60">Subtotal</span>
                                    <span className="text-white">
                                        {currencySymbol}{transaction.subtotal.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white/60">Tax</span>
                                    <span className="text-white">
                                        {currencySymbol}{transaction.tax_amount.toFixed(2)}
                                    </span>
                                </div>
                                {transaction.discount_amount > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Discount</span>
                                        <span className="text-green-400">
                                            -{currencySymbol}{transaction.discount_amount.toFixed(2)}
                                        </span>
                                    </div>
                                )}
                                <div className="border-t border-white/10 pt-2 mt-2">
                                    <div className="flex justify-between">
                                        <span className="text-white font-semibold">Total</span>
                                        <span className="text-white font-bold text-lg">
                                            {currencySymbol}{transaction.total.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex justify-between pt-1">
                                    <span className="text-white/60">Amount Paid</span>
                                    <span className="text-green-400">
                                        {currencySymbol}{transaction.amount_paid.toFixed(2)}
                                    </span>
                                </div>
                                {transaction.balance_due > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Balance Due</span>
                                        <span className="text-orange-400">
                                            {currencySymbol}{transaction.balance_due.toFixed(2)}
                                        </span>
                                    </div>
                                )}
                                {transaction.change_given && transaction.change_given > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-white/60">Change Given</span>
                                        <span className="text-white">
                                            {currencySymbol}{transaction.change_given.toFixed(2)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Downpayment Info */}
                    {(transaction.status === 'DOWNPAYMENT_PENDING' || transaction.status === 'DOWNPAYMENT_ASSIGNED') && transaction.downpayment && (
                        <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/30">
                            <h3 className="text-lg font-semibold text-purple-300 mb-4 flex items-center gap-2">
                                <WalletIcon className="w-5 h-5" />
                                Downpayment Information
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <p className="text-sm text-white/60">Type</p>
                                    <p className="text-white">{transaction.downpayment.downpayment_type}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-white/60">Amount</p>
                                    <p className="text-white">{currencySymbol}{transaction.downpayment.amount.toFixed(2)}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-white/60">Split Mode</p>
                                    <p className="text-white">{transaction.downpayment.payroll_split_mode}</p>
                                </div>
                                {transaction.downpayment.percentage_rate && (
                                    <div>
                                        <p className="text-sm text-white/60">Percentage Rate</p>
                                        <p className="text-white">{transaction.downpayment.percentage_rate}%</p>
                                    </div>
                                )}
                                {transaction.downpayment.estimated_total && (
                                    <div>
                                        <p className="text-sm text-white/60">Estimated Total</p>
                                        <p className="text-white">{currencySymbol}{transaction.downpayment.estimated_total.toFixed(2)}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-sm text-white/60">Staff Assigned</p>
                                    <p className="text-white">{transaction.downpayment.staff_id ? 'Yes' : 'Pending'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-white/60">Status</p>
                                    <p className={transaction.downpayment.is_settled ? 'text-green-400' : 'text-amber-400'}>
                                        {transaction.downpayment.is_settled ? 'Settled' : 'Outstanding'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Void/Refund Info */}
                    {(transaction.voided_at || transaction.voided_by || transaction.void_reason) && (
                        <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
                            <h3 className="text-lg font-semibold text-red-300 mb-4 flex items-center gap-2">
                                <AlertCircleIcon className="w-5 h-5" />
                                {transaction.status === "REFUNDED" ? "Refund Information" : "Void Information"}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {transaction.voided_at && (
                                    <div>
                                        <p className="text-sm text-white/60">Date</p>
                                        <p className="text-white">{new Date(transaction.voided_at).toLocaleString()}</p>
                                    </div>
                                )}
                                {transaction.voided_by && (
                                    <div>
                                        <p className="text-sm text-white/60">Processed By</p>
                                        <p className="text-white">{transaction.voided_by}</p>
                                    </div>
                                )}
                                {transaction.void_reason && (
                                    <div className="md:col-span-3">
                                        <p className="text-sm text-white/60">Reason</p>
                                        <p className="text-white">{transaction.void_reason}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Sales Description */}
                    {transaction.sales_description && (
                        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                            <h3 className="text-lg font-semibold text-white mb-2">Description</h3>
                            <p className="text-white/80 whitespace-pre-line">{transaction.sales_description}</p>
                        </div>
                    )}

                    {/* Notes */}
                    {transaction.notes && (
                        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                            <h3 className="text-lg font-semibold text-white mb-2">Notes</h3>
                            <p className="text-white/80 whitespace-pre-line">{transaction.notes}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Void Modal */}
            {showVoidModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 rounded-lg p-6 max-w-md w-full border border-white/10">
                        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                            <XCircleIcon className="w-6 h-6 text-red-400" />
                            Void Transaction
                        </h3>
                        <p className="text-white/60 mb-4">
                            Are you sure you want to void this transaction? This action will restore inventory stock and create a reversing accounting entry.
                        </p>
                        <div className="space-y-3">
                            <label className="block text-sm text-white/60">Reason for voiding</label>
                            <textarea
                                value={voidReason}
                                onChange={(e) => setVoidReason(e.target.value)}
                                placeholder="Enter reason..."
                                className="w-full px-3 py-2 bg-white/10 rounded-md border-2 border-white/10 focus:border-white/30 outline-none text-white placeholder:text-white/40 resize-none"
                                rows={3}
                            />
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowVoidModal(false)}
                                disabled={isLoading}
                                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors text-white cursor-pointer disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleVoid}
                                disabled={isLoading || !voidReason.trim()}
                                className="flex-1 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-md transition-colors border-2 border-red-500/30 cursor-pointer disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <LoaderCircleIcon className="w-4 h-4 animate-spin mx-auto" />
                                ) : (
                                    "Void Transaction"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Refund Modal */}
            {showRefundModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 rounded-lg p-6 max-w-md w-full border border-white/10">
                        <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                            <RotateCcwIcon className="w-6 h-6 text-orange-400" />
                            Refund Transaction
                        </h3>
                        <p className="text-white/60 mb-4">
                            This will create a refund transaction and mark the original as refunded. The refund amount will be {currencySymbol}{transaction.total.toFixed(2)}.
                        </p>
                        <div className="space-y-3">
                            <label className="block text-sm text-white/60">Reason for refund</label>
                            <textarea
                                value={refundReason}
                                onChange={(e) => setRefundReason(e.target.value)}
                                placeholder="Enter reason..."
                                className="w-full px-3 py-2 bg-white/10 rounded-md border-2 border-white/10 focus:border-white/30 outline-none text-white placeholder:text-white/40 resize-none"
                                rows={3}
                            />
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowRefundModal(false)}
                                disabled={isLoading}
                                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors text-white cursor-pointer disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRefund}
                                disabled={isLoading || !refundReason.trim()}
                                className="flex-1 px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded-md transition-colors border-2 border-orange-500/30 cursor-pointer disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <LoaderCircleIcon className="w-4 h-4 animate-spin mx-auto" />
                                ) : (
                                    "Process Refund"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}