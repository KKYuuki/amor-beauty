'use client'

import { PaymentMethod } from '@/utils/types/transactions'
import { TRANSACTION_PAYMENT_METHODS } from '@/utils/types/payment'

export default function PaymentMethodSelector({
    paymentMethod,
    setPaymentMethod,
    taxSettings,
    cashReceived,
    setCashReceived,
    referenceNumber,
    setReferenceNumber,
    change,
    isPartialPayment,
}: {
    paymentMethod: PaymentMethod
    setPaymentMethod: (method: PaymentMethod) => void
    taxSettings: { currency_symbol: string }
    cashReceived: string
    setCashReceived: (amount: string) => void
    referenceNumber: string
    setReferenceNumber: (reference: string) => void
    change: number
    isPartialPayment: boolean
}) {

    return (
        <div className='space-y-4'>
            <div className='grid grid-cols-2 gap-3'>
                {TRANSACTION_PAYMENT_METHODS.map((method) => (
                    <button
                        key={method.key}
                        type='button'
                        onClick={() => setPaymentMethod(method.key)}
                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all border-2 ${
                            paymentMethod === method.key
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                                : 'border-zinc-200 dark:border-border bg-white dark:bg-muted hover:border-zinc-300 dark:hover:border-zinc-600'
                        }`}
                    >
                        <method.icon className='w-4 h-4' />
                        {method.label}
                    </button>
                ))}
            </div>

            {paymentMethod === 'CASH' && !isPartialPayment && (
                <div className='space-y-2'>
                    <label className='text-sm font-medium text-muted-foreground dark:text-foreground'>
                        Cash Received
                    </label>
                    <div className='relative'>
                        <span className='absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground'>
                            {taxSettings.currency_symbol}
                        </span>
                        <input
                            type='text'
                            value={cashReceived}
                            onChange={(e) => setCashReceived(e.target.value)}
                            placeholder='0.00'
                            className='w-full pl-8 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-border bg-white dark:bg-muted focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        />
                    </div>
                    {cashReceived && change >= 0 && (
                        <div className='flex items-center justify-between text-sm'>
                            <span className='text-muted-foreground dark:text-muted-foreground'>Change Due:</span>
                            <span className='font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-3 py-1 rounded-full'>
                                {taxSettings.currency_symbol} {change.toFixed(2)}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {paymentMethod !== 'CASH' && paymentMethod !== 'SPLIT' && (
                <div className='space-y-2'>
                    <label className='text-sm font-medium text-muted-foreground dark:text-foreground'>
                        Reference Number
                    </label>
                    <input
                        type='text'
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                        placeholder='Enter reference number'
                        className='w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-border bg-white dark:bg-muted focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    />
                </div>
            )}
        </div>
    )
}
