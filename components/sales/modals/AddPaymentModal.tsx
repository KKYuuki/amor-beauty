'use client'

import { useState, useEffect } from 'react'
import { XCircleIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { CurrencyTaxValue } from '@/utils/types/settings'
import { Transaction, PaymentMethod } from '@/utils/types/transactions'
import { TRANSACTION_PAYMENT_METHODS } from '@/utils/types/payment'
import { getTransactionById } from '@/server/actions/transactions'

const addPaymentMethods = TRANSACTION_PAYMENT_METHODS.filter(m => m.key !== 'SPLIT')

interface AddPaymentModalProps {
    isOpen: boolean
    onClose: () => void
    selectedTransaction: Transaction | null
    paymentMethod: PaymentMethod
    setPaymentMethod: (method: PaymentMethod) => void
    paymentAmount: string
    setPaymentAmount: (amount: string) => void
    referenceNumber: string
    setReferenceNumber: (reference: string) => void
    processing: boolean
    onAddPayment: () => void
    taxSettings: CurrencyTaxValue
}

export default function AddPaymentModal({
    isOpen,
    onClose,
    selectedTransaction,
    paymentMethod,
    setPaymentMethod,
    paymentAmount,
    setPaymentAmount,
    referenceNumber,
    setReferenceNumber,
    processing,
    onAddPayment,
    taxSettings,
}: AddPaymentModalProps) {
    const [refreshedTransaction, setRefreshedTransaction] = useState<Transaction | null>(null)
    const [staleWarning, setStaleWarning] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen || !selectedTransaction?.id) return

        const refresh = async () => {
            try {
                const result = await getTransactionById(selectedTransaction.id)
                if (result.success && result.data) {
                    setRefreshedTransaction(result.data.transaction)
                    // Check if status changed
                    if (result.data.transaction.status !== selectedTransaction.status) {
                        setStaleWarning(`Transaction status has changed from ${selectedTransaction.status} to ${result.data.transaction.status}. Refreshing data.`)
                    } else {
                        setStaleWarning(null)
                    }
                }
            } catch {
                // Silently fail — use the original data
                setRefreshedTransaction(null)
            }
        }
        refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, selectedTransaction?.id])

    if (!isOpen || !selectedTransaction) return null

    // Use refreshed data if available, otherwise use original
    const displayTransaction = refreshedTransaction || selectedTransaction

    const paymentAmountNum = parseFloat(paymentAmount) || 0
    const isValid = paymentAmountNum > 0 && (
        paymentMethod === 'CASH' || referenceNumber.trim() !== ''
    )

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden'
            >
                <div className='p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>Add Payment</h3>
                    <button
                        onClick={onClose}
                        className='text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                    >
                        <XCircleIcon className='w-6 h-6' />
                    </button>
                </div>

                <div className='p-6 space-y-6'>
                    {staleWarning && (
                        <div className='bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm text-yellow-700 dark:text-yellow-300'>
                            {staleWarning}
                        </div>
                    )}
                    <div className='bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 space-y-2'>
                        <div className='flex justify-between text-sm'>
                            <span className='text-zinc-600 dark:text-zinc-400'>Transaction #:</span>
                            <span className='font-medium text-zinc-900 dark:text-zinc-100'>
                                {displayTransaction.transaction_number.slice(-8)}
                            </span>
                        </div>
                        <div className='flex justify-between text-sm'>
                            <span className='text-zinc-600 dark:text-zinc-400'>Total:</span>
                            <span className='font-medium'>{taxSettings.currency_symbol} {parseFloat(String(displayTransaction.total)).toFixed(2)}</span>
                        </div>
                        <div className='flex justify-between text-sm'>
                            <span className='text-zinc-600 dark:text-zinc-400'>Already Paid:</span>
                            <span className='font-medium text-green-600'>{taxSettings.currency_symbol} {parseFloat(String(displayTransaction.amount_paid)).toFixed(2)}</span>
                        </div>
                        <div className='flex justify-between text-sm font-medium'>
                            <span className='text-zinc-600 dark:text-zinc-400'>Balance Due:</span>
                            <span className='text-amber-600 dark:text-amber-400'>
                                {taxSettings.currency_symbol} {(parseFloat(String(displayTransaction.total)) - parseFloat(String(displayTransaction.amount_paid))).toFixed(2)}
                            </span>
                        </div>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-3 text-zinc-700 dark:text-zinc-300'>
                            Payment Method
                        </label>
                        <div className='grid grid-cols-2 gap-3'>
                            {addPaymentMethods.map((method) => (
                                <button
                                    key={method.key}
                                    type='button'
                                    onClick={() => setPaymentMethod(method.key)}
                                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all border-2 ${
                                        paymentMethod === method.key
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                                            : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600'
                                    }`}
                                >
                                    <method.icon className='w-4 h-4' />
                                    {method.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300'>
                            Payment Amount
                        </label>
                        <div className='relative'>
                            <span className='absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500'>
                                {taxSettings.currency_symbol}
                            </span>
                            <input
                                type='number'
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                                placeholder='0.00'
                                className='w-full pl-8 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                            />
                        </div>
                    </div>

                    {paymentMethod !== 'CASH' && (
                        <div>
                            <label className='block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300'>
                                Reference Number
                            </label>
                            <input
                                type='text'
                                value={referenceNumber}
                                onChange={(e) => setReferenceNumber(e.target.value)}
                                placeholder='Enter reference number'
                                className='w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                            />
                        </div>
                    )}

                    <div className='flex gap-3 pt-4'>
                        <button
                            type='button'
                            onClick={onClose}
                            disabled={processing}
                            className='flex-1 px-4 py-3 rounded-lg border-2 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all disabled:opacity-50'
                        >
                            Cancel
                        </button>
                        <button
                            type='button'
                            onClick={onAddPayment}
                            disabled={processing || !isValid}
                            className='flex-1 px-4 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
                        >
                            {processing ? (
                                <>
                                    <div className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin' />
                                    Processing...
                                </>
                            ) : (
                                'Add Payment'
                            )}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
