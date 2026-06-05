"use client"

import { useState, useContext } from "react"
import { motion } from "motion/react"
import { XIcon, PlusIcon, LoaderCircleIcon } from "lucide-react"
import { NotificationContext } from "@/components/notifications"
import { PayrollRequest, PaymentMethod } from "@/utils/types/payroll"
import { normalizePayrollMethod, PAYROLL_PAYMENT_METHODS } from "@/utils/types/payment"

interface StaggeredPaymentModalProps {
    request: PayrollRequest
    currencySymbol: string
    existingDisbursements: import("@/utils/types/payroll").PayrollDisbursement[]
    expectedMethod: string | null
    onClose: () => void
    onComplete: () => void
}

export function StaggeredPaymentModal({
    request,
    currencySymbol,
    existingDisbursements,
    expectedMethod,
    onClose,
    onComplete,
}: StaggeredPaymentModalProps) {
    const { addNotification } = useContext(NotificationContext)
    const [lines, setLines] = useState<{ amount: number; method: PaymentMethod; ref: string; notes: string }[]>([])
    const [loading, setLoading] = useState(false)

    const totalDisbursed = existingDisbursements
        .filter(d => d.status === 'COMPLETED')
        .reduce((sum, d) => sum + Number(d.amount), 0)
    const remaining = Number(request.total_staff_cut) - totalDisbursed
    const lineTotal = lines.reduce((sum, l) => sum + l.amount, 0)

    const addLine = () => {
        const defaultMethod = normalizePayrollMethod(expectedMethod || 'CASH') as PaymentMethod
        setLines([...lines, { amount: 0, method: defaultMethod, ref: '', notes: '' }])
    }

    const updateLine = (index: number, field: 'amount' | 'method' | 'ref' | 'notes', value: string | number) => {
        const newLines = [...lines]
        if (field === 'amount') {
            newLines[index].amount = Number(value)
        } else if (field === 'method') {
            newLines[index].method = value as PaymentMethod
        } else if (field === 'ref') {
            newLines[index].ref = String(value)
        } else if (field === 'notes') {
            newLines[index].notes = String(value)
        }
        setLines(newLines)
    }

    const removeLine = (index: number) => {
        setLines(lines.filter((_, i) => i !== index))
    }

    const handleSubmit = async () => {
        if (lineTotal <= 0 || lineTotal > remaining) return
        setLoading(true)
        try {
            const { createDisbursement } = await import('@/server/actions/payroll-disbursements')
            for (const line of lines) {
                if (line.amount <= 0) continue
                const result = await createDisbursement({
                    request_id: request.id,
                    amount: line.amount,
                    payment_method: line.method,
                    reference_number: line.ref || undefined,
                    notes: line.notes || undefined,
                })
                if (!result.success) {
                    addNotification(result.error || 'Failed to create disbursement', 'ERROR')
                    setLoading(false)
                    return
                }
            }
            addNotification('Disbursements recorded', 'SUCCESS')
            onComplete()
        } catch {
            addNotification('Failed to create disbursements', 'ERROR')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-white/10 max-h-[90vh] flex flex-col'
            >
                <div className='p-6 border-b border-white/10 flex justify-between items-center'>
                    <div>
                        <h3 className='text-xl font-bold'>Staggered Payment</h3>
                        <p className='text-sm text-white/60'>Split payment across multiple methods</p>
                    </div>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 overflow-auto flex-1 space-y-4'>
                    {/* Summary */}
                    <div className='grid grid-cols-3 gap-3 text-center'>
                        <div className='bg-white/5 rounded-lg p-3'>
                            <p className='text-xs text-white/60 mb-1'>Total</p>
                            <p className='text-lg font-bold text-white'>
                                {currencySymbol}{Number(request.total_staff_cut).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className='bg-white/5 rounded-lg p-3'>
                            <p className='text-xs text-white/60 mb-1'>Disbursed</p>
                            <p className='text-lg font-bold text-green-400'>
                                {currencySymbol}{totalDisbursed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div className='bg-white/5 rounded-lg p-3'>
                            <p className='text-xs text-white/60 mb-1'>Remaining</p>
                            <p className='text-lg font-bold text-yellow-400'>
                                {currencySymbol}{remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>

                    {/* Existing Disbursements */}
                    {existingDisbursements.length > 0 && (
                        <div>
                            <p className='text-sm font-medium mb-2 text-white/60'>Existing Disbursements</p>
                            <div className='space-y-2'>
                                {existingDisbursements.map((d) => (
                                    <div key={d.id} className='flex items-center justify-between bg-white/5 rounded-lg p-2 text-sm'>
                                        <div>
                                            <span className='text-white/60'>{d.payment_method}</span>
                                            {d.reference_number && <span className='ml-2 text-white/40 font-mono text-xs'>{d.reference_number}</span>}
                                        </div>
                                        <span className='text-green-400 font-medium'>
                                            {currencySymbol}{Number(d.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* New Lines */}
                    <div>
                        <div className='flex items-center justify-between mb-2'>
                            <p className='text-sm font-medium text-white/60'>Add Disbursements</p>
                            <button
                                onClick={addLine}
                                className='text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'
                            >
                                <PlusIcon className='w-3 h-3' /> Add Line
                            </button>
                        </div>

                        {lines.length === 0 ? (
                            <p className='text-sm text-white/40 text-center py-4 bg-white/5 rounded-lg'>
                                No disbursement lines added. Click Add Line to create one.
                            </p>
                        ) : (
                            <div className='space-y-2'>
                                {lines.map((line, index) => (
                                    <div key={index} className='bg-white/5 rounded-lg p-3 space-y-2'>
                                        <div className='flex items-center justify-between'>
                                            <span className='text-xs text-white/40'>Line {index + 1}</span>
                                            <button
                                                onClick={() => removeLine(index)}
                                                className='text-white/40 hover:text-red-400'
                                            >
                                                <XIcon className='w-4 h-4' />
                                            </button>
                                        </div>
                                        <div className='grid grid-cols-2 gap-2'>
                                            <div>
                                                <label className='text-xs text-white/60 mb-1 block'>Amount</label>
                                                <input
                                                    type='number'
                                                    min='0'
                                                    step='0.01'
                                                    value={line.amount || ''}
                                                    onChange={(e) => updateLine(index, 'amount', e.target.value)}
                                                    className='w-full px-2 py-1.5 bg-white/10 border border-white/10 rounded text-sm focus:border-white/30 outline-none font-mono'
                                                />
                                            </div>
                                            <div>
                                                <label className='text-xs text-white/60 mb-1 block'>Method</label>
                                                <select
                                                    value={line.method}
                                                    onChange={(e) => updateLine(index, 'method', e.target.value)}
                                                    className='w-full px-2 py-1.5 bg-white/10 border border-white/10 rounded text-sm focus:border-white/30 outline-none'
                                                >
                                                    {PAYROLL_PAYMENT_METHODS.map((m) => (
                                                        <option key={m.key} value={m.key}>{m.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label className='text-xs text-white/60 mb-1 block'>Reference</label>
                                            <input
                                                type='text'
                                                value={line.ref}
                                                onChange={(e) => updateLine(index, 'ref', e.target.value)}
                                                placeholder='Optional'
                                                className='w-full px-2 py-1.5 bg-white/10 border border-white/10 rounded text-sm focus:border-white/30 outline-none'
                                            />
                                        </div>
                                        <div>
                                            <label className='text-xs text-white/60 mb-1 block'>Notes</label>
                                            <input
                                                type='text'
                                                value={line.notes}
                                                onChange={(e) => updateLine(index, 'notes', e.target.value)}
                                                placeholder='Optional'
                                                className='w-full px-2 py-1.5 bg-white/10 border border-white/10 rounded text-sm focus:border-white/30 outline-none'
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Summary */}
                    {lines.length > 0 && (
                        <div className={`rounded-lg p-3 text-center ${lineTotal > remaining ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
                            <p className='text-sm text-white/60'>Line Total</p>
                            <p className={`text-xl font-bold ${lineTotal > remaining ? 'text-red-400' : 'text-green-400'}`}>
                                {currencySymbol}{lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                            {lineTotal > remaining && (
                                <p className='text-xs text-red-400 mt-1'>Exceeds remaining amount</p>
                            )}
                        </div>
                    )}
                </div>

                <div className='p-4 border-t border-white/10 bg-white/5'>
                    <div className='flex gap-3'>
                        <button
                            onClick={onClose}
                            className='flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors text-sm'
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading || lineTotal <= 0 || lineTotal > remaining}
                            className='flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-md transition-colors font-medium text-sm flex items-center justify-center gap-2'
                        >
                            {loading ? (
                                <LoaderCircleIcon className='w-4 h-4 animate-spin' />
                            ) : (
                                <>Submit Disbursements</>
                            )}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
