"use client"

import { useState, useEffect } from "react"
import { motion } from "motion/react"
import { XIcon, CheckIcon, BanknoteIcon } from "lucide-react"
import { PayrollRequest, PaymentMethod } from "@/utils/types/payroll"
import { getExpectedPaymentMethod } from "@/server/actions/payroll"
import {
    normalizePayrollMethod,
    getAlternativeMethodGroups,
    PAYROLL_PAYMENT_METHODS,
    getPayrollPaymentMethodLabel,
} from "@/utils/types/payment"

interface CompletePaymentModalProps {
    request: PayrollRequest
    currencySymbol: string
    onClose: () => void
    onComplete: (method: PaymentMethod, referenceNumber?: string, proofFile?: File | null) => void
}

export function CompletePaymentModal({
    request,
    currencySymbol,
    onClose,
    onComplete,
}: CompletePaymentModalProps) {
    const [step, setStep] = useState<'confirm' | 'pay'>('confirm')
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null)
    const [referenceNumber, setReferenceNumber] = useState('')
    const [proofFile, setProofFile] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)
    const [expectedMethod, setExpectedMethod] = useState<string | null>(null)
    const [methodBreakdown, setMethodBreakdown] = useState<{ method: string; count: number; total: number }[]>([])
    const [showWarning, setShowWarning] = useState(false)
    const [confirmedAlternative, setConfirmedAlternative] = useState(false)

    useEffect(() => {
        const fetchExpected = async () => {
            const result = await getExpectedPaymentMethod(request.id)
            if (result.success && result.data) {
                setExpectedMethod(result.data.method)
                setMethodBreakdown(result.data.breakdown)
                if (result.data.method) {
                    const normalized = normalizePayrollMethod(result.data.method)
                    setSelectedMethod(normalized as PaymentMethod)
                }
            }
        }
        fetchExpected()
    }, [request.id])

    const handleMethodSelect = (method: PaymentMethod) => {
        setSelectedMethod(method)
        if (expectedMethod && method !== normalizePayrollMethod(expectedMethod)) {
            setShowWarning(true)
            setConfirmedAlternative(false)
        } else {
            setShowWarning(false)
            setConfirmedAlternative(false)
        }
    }

    const handleConfirm = async () => {
        if (!selectedMethod) return
        if (showWarning && !confirmedAlternative) {
            setConfirmedAlternative(true)
            return
        }
        setLoading(true)
        await onComplete(selectedMethod, referenceNumber || undefined, proofFile)
        setLoading(false)
    }

    const primaryMethod = expectedMethod ? normalizePayrollMethod(expectedMethod) as PaymentMethod : null

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10'
            >
                <div className='p-6 border-b border-white/10 flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>
                        {step === 'confirm' ? 'Confirm Payment' : 'Disbursement Details'}
                    </h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6'>
                    {/* Amount display — always visible */}
                    <div className='text-center mb-6'>
                        <p className='text-white/60 text-sm'>Amount to pay</p>
                        <p className='text-3xl font-bold text-green-300'>
                            {currencySymbol}{Number(request.total_staff_cut).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                        <p className='text-sm text-white/60 mt-1'>
                            to {(request.staff as { full_name?: string })?.full_name || 'Staff'}
                        </p>
                    </div>

                    {step === 'confirm' ? (
                        /* Step 1: Confirm details */
                        <div>
                            <div className='bg-white/5 rounded-lg p-3 mb-4 text-sm space-y-1'>
                                <p><span className='text-white/60'>Period:</span> {new Date(request.period_start).toLocaleDateString()} - {new Date(request.period_end).toLocaleDateString()}</p>
                                <p><span className='text-white/60'>Gross:</span> {currencySymbol}{Number(request.total_gross).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                <p><span className='text-white/60'>Shop Cut:</span> {currencySymbol}{Number(request.total_shop_cut).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                <p><span className='text-white/60'>Staff Cut:</span> {currencySymbol}{Number(request.total_staff_cut).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                            <button
                                onClick={() => setStep('pay')}
                                className='w-full px-4 py-3 bg-green-600 hover:bg-green-700 rounded-md transition-colors font-medium'
                            >
                                Proceed to Disburse
                            </button>
                        </div>
                    ) : (
                        <div className='space-y-4'>
                            {/* Default Method */}
                            {primaryMethod && (
                                <div>
                                    <p className='text-xs font-semibold mb-2 uppercase tracking-wider text-green-400'>
                                        Payment Method
                                    </p>
                                    <button
                                        onClick={() => handleMethodSelect(primaryMethod)}
                                        className={`w-full p-4 rounded-lg transition-colors text-left border-2 ${
                                            selectedMethod === primaryMethod
                                                ? 'bg-green-500/20 border-green-500/50 text-green-300'
                                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                                        }`}
                                    >
                                        <div className='flex items-center justify-between'>
                                            <div className='flex items-center gap-3'>
                                                <div className='w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center'>
                                                    <BanknoteIcon className='w-4 h-4 text-green-400' />
                                                </div>
                                                <span className='text-lg font-bold'>
                                                    {getPayrollPaymentMethodLabel(primaryMethod)}
                                                </span>
                                            </div>
                                            <div className='flex items-center gap-2'>
                                                <span className='text-xs px-2 py-0.5 rounded bg-green-500/30 text-green-300 font-medium'>
                                                    Default
                                                </span>
                                                {selectedMethod === primaryMethod && (
                                                    <CheckIcon className='w-5 h-5 text-green-400' />
                                                )}
                                            </div>
                                        </div>
                                        {methodBreakdown.length > 0 && (
                                            <p className='text-xs text-white/50 mt-2 ml-11'>
                                                {methodBreakdown.find(b => normalizePayrollMethod(b.method) === primaryMethod)?.count || 0} service(s)
                                                &nbsp;·&nbsp;
                                                {currencySymbol}{(methodBreakdown.find(b => normalizePayrollMethod(b.method) === primaryMethod)?.total || 0).toFixed(2)}
                                            </p>
                                        )}
                                    </button>
                                </div>
                            )}

                            {/* Divider */}
                            {primaryMethod && (
                                <div className='relative'>
                                    <div className='absolute inset-0 flex items-center'>
                                        <div className='w-full border-t border-white/10' />
                                    </div>
                                    <div className='relative flex justify-center text-xs'>
                                        <span className='px-2 bg-zinc-900 text-amber-400 flex items-center gap-1'>
                                            <span>⚠</span> Select Alternative Method
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Warning when selecting alternative */}
                            {showWarning && selectedMethod && selectedMethod !== primaryMethod && (
                                <div className='bg-amber-500/10 border border-amber-500/30 rounded-lg p-3'>
                                    <p className='text-sm text-amber-300'>
                                        The original sale was paid via <strong>{getPayrollPaymentMethodLabel(primaryMethod)}</strong>.
                                        Disbursing via <strong>{getPayrollPaymentMethodLabel(selectedMethod)}</strong> may cause accounting discrepancies.
                                    </p>
                                    {!confirmedAlternative && (
                                        <button
                                            onClick={() => setConfirmedAlternative(true)}
                                            className='mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 rounded text-xs font-medium'
                                        >
                                            I understand, proceed with {getPayrollPaymentMethodLabel(selectedMethod)}
                                        </button>
                                    )}
                                    {confirmedAlternative && (
                                        <p className='text-xs text-amber-400 mt-1'>Alternative method confirmed.</p>
                                    )}
                                </div>
                            )}

                            {/* Alternative Methods — Grouped */}
                            {primaryMethod ? (
                                <div className='space-y-3'>
                                    {getAlternativeMethodGroups(primaryMethod).map(group => (
                                        <div key={group.label}>
                                            <p className='text-xs text-white/40 mb-1 uppercase tracking-wider'>
                                                {group.label}
                                            </p>
                                            <div className={`grid ${
                                                group.methods.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                                            } gap-2`}>
                                                {group.methods.map((method) => (
                                                    <button
                                                        key={method.key}
                                                        onClick={() => handleMethodSelect(method.key as PaymentMethod)}
                                                        className={`p-3 rounded-lg transition-colors text-center text-sm border ${
                                                            selectedMethod === method.key
                                                                ? 'bg-green-500/20 border-green-500/40 text-green-300'
                                                                : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/60'
                                                        }`}
                                                    >
                                                        {method.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div>
                                    <p className='text-sm font-medium mb-2'>Select payment method:</p>
                                    <div className='grid grid-cols-2 gap-2'>
                                        {PAYROLL_PAYMENT_METHODS.filter(m => m.key !== 'BANK').map((method) => (
                                            <button
                                                key={method.key}
                                                onClick={() => setSelectedMethod(method.key as PaymentMethod)}
                                                className={`p-3 rounded-lg transition-colors text-center text-sm border ${
                                                    selectedMethod === method.key
                                                        ? 'bg-green-500/20 border-green-500/40 text-green-300'
                                                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                                                }`}
                                            >
                                                {method.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Reference & Proof */}
                            <div>
                                <label className='block text-sm font-medium mb-1'>Reference Number</label>
                                <input
                                    type='text'
                                    value={referenceNumber}
                                    onChange={(e) => setReferenceNumber(e.target.value)}
                                    placeholder='e.g. TRX-12345, OR #1234...'
                                    className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none text-sm'
                                />
                            </div>
                            <div>
                                <label className='block text-sm font-medium mb-1'>Proof / Receipt</label>
                                <input
                                    type='file'
                                    accept='image/*,application/pdf'
                                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                                    className='w-full text-sm text-white/60 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-white/10 file:text-white/80 hover:file:bg-white/20'
                                />
                            </div>
                            <div className='flex gap-2 pt-2'>
                                <button
                                    onClick={() => setStep('confirm')}
                                    className='flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors text-sm'
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    disabled={loading || !selectedMethod || (showWarning && !confirmedAlternative)}
                                    className='flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-md transition-colors font-medium text-sm'
                                >
                                    {loading ? 'Processing...' : 'Complete Payment'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    )
}
