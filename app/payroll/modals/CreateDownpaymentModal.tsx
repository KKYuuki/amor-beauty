"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { XIcon, LoaderCircleIcon } from "lucide-react"
import { DownpaymentType, PayrollSplitMode } from "@/utils/types/payroll"

interface CreateDownpaymentModalProps {
    transactions: Array<{ id: string; transaction_number: string; total: number }>
    staffList: Array<{ id: string; full_name: string }>
    currencySymbol: string
    onClose: () => void
    onSave: (
        transactionId: string,
        downpaymentType: DownpaymentType,
        amount: number,
        percentageRate: number,
        estimatedTotal: number,
        staffId: string | undefined,
        payrollSplitMode: PayrollSplitMode,
        notes: string
    ) => Promise<void>
}

export function CreateDownpaymentModal({
    transactions,
    staffList,
    currencySymbol,
    onClose,
    onSave,
}: CreateDownpaymentModalProps) {
    const [transactionId, setTransactionId] = useState("")
    const [downpaymentType, setDownpaymentType] = useState<DownpaymentType>("FLAT_FEE")
    const [amount, setAmount] = useState(0)
    const [percentageRate, setPercentageRate] = useState(0)
    const [estimatedTotal, setEstimatedTotal] = useState(0)
    const [staffId, setStaffId] = useState("")
    const [payrollSplitMode, setPayrollSplitMode] = useState<PayrollSplitMode>("PER_PAYMENT")
    const [notes, setNotes] = useState("")
    const [loading, setLoading] = useState(false)

    const handleSave = async () => {
        setLoading(true)
        await onSave(
            transactionId,
            downpaymentType,
            amount,
            percentageRate,
            estimatedTotal,
            staffId || undefined,
            payrollSplitMode,
            notes
        )
        setLoading(false)
    }

    const calculatedDownpayment = downpaymentType === 'PERCENTAGE' && estimatedTotal > 0 && percentageRate > 0
        ? estimatedTotal * percentageRate / 100
        : amount

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10'
            >
                <div className='p-6 border-b border-white/10 flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>Create Downpayment</h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div>
                        <label className='block text-sm font-medium mb-1'>Transaction</label>
                        <select
                            value={transactionId}
                            onChange={(e) => setTransactionId(e.target.value)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        >
                            <option value=''>Select Transaction</option>
                            {transactions.map((txn) => (
                                <option key={txn.id} value={txn.id}>
                                    {txn.transaction_number} — {currencySymbol}{txn.total.toFixed(2)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Downpayment Type</label>
                        <select
                            value={downpaymentType}
                            onChange={(e) => setDownpaymentType(e.target.value as DownpaymentType)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        >
                            <option value='FLAT_FEE'>Flat Fee</option>
                            <option value='PERCENTAGE'>Percentage</option>
                            <option value='CUSTOM'>Custom</option>
                        </select>
                    </div>

                    {(downpaymentType === 'FLAT_FEE' || downpaymentType === 'CUSTOM') && (
                        <div>
                            <label className='block text-sm font-medium mb-1'>Amount</label>
                            <input
                                type='number' min='0' step='0.01'
                                value={amount}
                                onChange={(e) => setAmount(Number(e.target.value))}
                                className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none font-mono'
                            />
                        </div>
                    )}

                    {downpaymentType === 'PERCENTAGE' && (
                        <div className='space-y-4'>
                            <div>
                                <label className='block text-sm font-medium mb-1'>Percentage Rate (%)</label>
                                <input
                                    type='number' min='0' max='100' step='0.01'
                                    value={percentageRate}
                                    onChange={(e) => setPercentageRate(Number(e.target.value))}
                                    className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none font-mono'
                                />
                            </div>
                            <div>
                                <label className='block text-sm font-medium mb-1'>Estimated Total</label>
                                <input
                                    type='number' min='0' step='0.01'
                                    value={estimatedTotal}
                                    onChange={(e) => setEstimatedTotal(Number(e.target.value))}
                                    className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none font-mono'
                                />
                            </div>
                            {percentageRate > 0 && estimatedTotal > 0 && (
                                <p className='text-xs text-white/40'>
                                    Calculated downpayment: {currencySymbol}{calculatedDownpayment.toFixed(2)}
                                </p>
                            )}
                        </div>
                    )}

                    <div>
                        <label className='block text-sm font-medium mb-1'>Staff (optional)</label>
                        <select
                            value={staffId}
                            onChange={(e) => setStaffId(e.target.value)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        >
                            <option value=''>Unassigned</option>
                            {staffList.map((staff) => (
                                <option key={staff.id} value={staff.id}>{staff.full_name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Payroll Split Mode</label>
                        <select
                            value={payrollSplitMode}
                            onChange={(e) => setPayrollSplitMode(e.target.value as PayrollSplitMode)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        >
                            <option value='PER_PAYMENT'>Per Payment</option>
                            <option value='ON_COMPLETION'>On Completion</option>
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Notes</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none resize-none'
                        />
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'>Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={loading || !transactionId || (downpaymentType === 'PERCENTAGE' && (!percentageRate || !estimatedTotal))}
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium flex items-center gap-2'
                        >
                            {loading && <LoaderCircleIcon className='w-4 h-4 animate-spin' />}
                            {loading ? "Creating..." : "Create Downpayment"}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
