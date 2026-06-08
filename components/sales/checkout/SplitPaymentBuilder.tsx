'use client'

import { PlusIcon, Trash2Icon, WalletIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { TRANSACTION_PAYMENT_METHODS } from '@/utils/types/payment'

const splitMethods = TRANSACTION_PAYMENT_METHODS.filter(m => m.key !== 'SPLIT') as Array<{ key: 'CASH' | 'CARD' | 'GCASH' | 'BANK_TRANSFER' | 'PAYMAYA'; label: string; icon: typeof WalletIcon; description: string }>

export default function SplitPaymentBuilder({
    splitPayments,
    setSplitPayments,
    taxSettings,
    total,
    allowPartial,
    setAllowPartial,
}: {
    splitPayments: Array<{
        id: string
        payment_method: typeof splitMethods[number]['key']
        amount: number
        reference_number?: string
    }>
    setSplitPayments: (payments: Array<{
        id: string
        payment_method: typeof splitMethods[number]['key']
        amount: number
        reference_number?: string
    }>) => void
    taxSettings: { currency_symbol: string }
    total: number
    allowPartial: boolean
    setAllowPartial: (allow: boolean) => void
}) {
    const totalEntered = splitPayments.reduce((sum, p) => sum + p.amount, 0)
    const remaining = total - totalEntered

    const addPayment = () => {
        const newPayment = {
            id: crypto.randomUUID(),
            payment_method: 'CASH' as const,
            amount: 0,
            reference_number: '',
        }
        setSplitPayments([...splitPayments, newPayment])
    }

    const removePayment = (id: string) => {
        setSplitPayments(splitPayments.filter((p) => p.id !== id))
    }

    const updatePayment = (id: string, field: string, value: string | number) => {
        setSplitPayments(
            splitPayments.map((p) => (p.id === id ? { ...p, [field]: value } : p))
        )
    }

    const isSufficient = totalEntered >= total
    const isWarning = totalEntered > 0 && totalEntered < total

    return (
        <div className='space-y-4 bg-muted backdrop-blur-lg rounded-xl p-4 border border-border'>
            <div className='flex items-center justify-between'>
                <h3 className='text-sm font-semibold text-foreground text-foreground'>
                    Split Payments
                </h3>
                <label className='flex items-center gap-2 text-sm'>
                    <input
                        type='checkbox'
                        checked={allowPartial}
                        onChange={(e) => setAllowPartial(e.target.checked)}
                        className='w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500'
                    />
                    <span className='text-muted-foreground dark:text-foreground'>Allow Partial Payment</span>
                </label>
            </div>

            <AnimatePresence>
                {splitPayments.map((payment) => (
                    <motion.div
                        key={payment.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className='flex flex-wrap gap-2 items-center p-3 bg-zinc-50 dark:bg-muted/50 rounded-lg'
                    >
                        <select
                            value={payment.payment_method}
                            onChange={(e) =>
                                updatePayment(payment.id, 'payment_method', e.target.value)
                            }
                            className='px-3 py-2 rounded-lg border border-zinc-200 dark:border-border bg-white dark:bg-muted text-sm focus:ring-2 focus:ring-blue-500'
                        >
                            {splitMethods.map((method) => (
                                <option key={method.key} value={method.key}>{method.label}</option>
                            ))}
                        </select>

                        <div className='relative flex-1 min-w-[120px]'>
                            <span className='absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm'>
                                {taxSettings.currency_symbol}
                            </span>
                            <input
                                type='number'
                                value={payment.amount || ''}
                                onChange={(e) =>
                                    updatePayment(payment.id, 'amount', parseFloat(e.target.value) || 0)
                                }
                                placeholder='0.00'
                                className='w-full pl-8 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-border bg-white dark:bg-muted text-sm focus:ring-2 focus:ring-blue-500'
                            />
                        </div>

                        {payment.payment_method !== 'CASH' && (
                            <div className='relative'>
                                <input
                                    type='text'
                                    value={payment.reference_number || ''}
                                    onChange={(e) =>
                                        updatePayment(payment.id, 'reference_number', e.target.value)
                                    }
                                    placeholder='Ref # (required)'
                                    className={`w-24 px-3 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-blue-500 ${
                                        !payment.reference_number?.trim()
                                            ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
                                            : 'border-zinc-200 dark:border-border bg-white dark:bg-muted'
                                    }`}
                                />
                                {!payment.reference_number?.trim() && (
                                    <span className='text-amber-500 text-xs absolute -bottom-4 left-0'>Required</span>
                                )}
                            </div>
                        )}

                        <button
                            type='button'
                            onClick={() => removePayment(payment.id)}
                            className='p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors'
                        >
                            <Trash2Icon className='w-4 h-4' />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>

            <button
                type='button'
                onClick={addPayment}
                className='w-full px-4 py-2 rounded-lg border-2 border-dashed border-zinc-300 dark:border-border text-muted-foreground dark:text-muted-foreground hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all flex items-center justify-center gap-2'
            >
                <PlusIcon className='w-4 h-4' />
                Add Payment Method
            </button>

            <div className='space-y-2 pt-2 border-t border-zinc-200 dark:border-border'>
                <div className='flex justify-between text-sm'>
                    <span className='text-muted-foreground dark:text-muted-foreground'>Total Due:</span>
                    <span className='font-medium text-foreground text-foreground'>
                        {taxSettings.currency_symbol} {total.toFixed(2)}
                    </span>
                </div>
                <div className='flex justify-between text-sm'>
                    <span className='text-muted-foreground dark:text-muted-foreground'>Total Entered:</span>
                    <span className='font-medium text-foreground text-foreground'>
                        {taxSettings.currency_symbol} {totalEntered.toFixed(2)}
                    </span>
                </div>
                <div
                    className={`flex justify-between text-sm font-semibold p-2 rounded-lg ${
                        isSufficient
                            ? 'bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400'
                            : isWarning
                            ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400'
                            : 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
                    }`}
                >
                    <span>
                        {allowPartial
                            ? 'Remaining Balance:'
                            : isSufficient
                            ? 'Change Due:'
                            : 'Still Need:'}
                    </span>
                    <span className='absolute right-6'>
                        {taxSettings.currency_symbol} {Math.abs(remaining).toFixed(2)}
                    </span>
                </div>
            </div>
        </div>
    )
}
