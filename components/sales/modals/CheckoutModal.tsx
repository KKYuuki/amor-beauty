'use client'

import { useState, useEffect } from 'react'
import { XCircleIcon, CheckCircle2Icon, UserIcon, CreditCardIcon, UsersIcon, ToggleLeftIcon, ToggleRightIcon, FileTextIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { CurrencyTaxValue } from '@/utils/types/settings'
import { CartItem } from '@/components/sales/context/SalesContext'
import { ServiceWithItems } from '@/server/actions/services'
import { SplitPayment } from '@/utils/types/transactions'
import { ActionResponse } from '@/utils/types/responses'
import { CreateTransactionResult } from '@/server/actions/transactions'
import { calculateDownpaymentAmount } from '@/components/sales/utils/downpayment'
import CustomerSelection from '../checkout/CustomerSelection'
import PaymentMethodSelector from '../checkout/PaymentMethodSelector'
import SplitPaymentBuilder from '../checkout/SplitPaymentBuilder'

interface CheckoutModalProps {
    isOpen: boolean
    onClose: () => void
    cart: CartItem[]
    services: ServiceWithItems[]
    taxSettings: CurrencyTaxValue
    grossTotal: number
    taxAmount: number
    netSubtotal: number
    total: number
    discountAmount: number
    appliedDiscount: number
    discountType: 'PERCENTAGE' | 'FIXED'
    customerMode: 'REGISTERED' | 'WALKIN'
    setCustomerMode: (mode: 'REGISTERED' | 'WALKIN') => void
    walkinName: string
    setWalkinName: (name: string) => void
    walkinPhone: string
    setWalkinPhone: (phone: string) => void
    walkinEmail: string
    setWalkinEmail: (email: string) => void
    paymentMethod: 'CASH' | 'CARD' | 'GCASH' | 'BANK_TRANSFER' | 'PAYMAYA' | 'SPLIT'
    setPaymentMethod: (method: 'CASH' | 'CARD' | 'GCASH' | 'BANK_TRANSFER' | 'PAYMAYA' | 'SPLIT') => void
    cashReceived: string
    setCashReceived: (amount: string) => void
    referenceNumber: string
    setReferenceNumber: (reference: string) => void
    selectedStaffId: string
    setSelectedStaffId: (id: string) => void
    staffList: Array<{ id: string; full_name: string; avatar_url?: string; role?: string; rate_level_id?: string; rate_level_name?: string }>
    clientType: 'WALKIN' | 'PERSONAL'
    setClientType: (type: 'WALKIN' | 'PERSONAL') => void
    isPartialPayment: boolean
    setIsPartialPayment: (partial: boolean) => void
    amountToPay: string
    setAmountToPay: (amount: string) => void
    change: number
    processing: boolean
    handleCheckout: () => Promise<ActionResponse<CreateTransactionResult> | undefined>
    addNotification: (message: string, type?: 'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING', title?: string, ephemeral?: boolean) => void
    splitPayments: SplitPayment[]
    setSplitPayments: (payments: SplitPayment[]) => void
    totalOverride: number | null
    calculatedTotal: number
    downpaymentType: 'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM' | null
    setDownpaymentType: (type: 'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM' | null) => void
    downpaymentAmount: number
    setDownpaymentAmount: (amount: number) => void
    downpaymentPercentageRate: number
    setDownpaymentPercentageRate: (rate: number) => void
    downpaymentEstimatedTotal: number
    setDownpaymentEstimatedTotal: (total: number) => void
    payrollSplitMode: 'PER_PAYMENT' | 'ON_COMPLETION'
    setPayrollSplitMode: (mode: 'PER_PAYMENT' | 'ON_COMPLETION') => void
    salesDescription: string
    setSalesDescription: (desc: string) => void
}

export default function CheckoutModal({
    isOpen,
    onClose,
    cart,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    services,
    taxSettings,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    grossTotal,
    taxAmount,
    netSubtotal,
    total,
    discountAmount,
    appliedDiscount,
    discountType,
    customerMode,
    setCustomerMode,
    walkinName,
    setWalkinName,
    walkinPhone,
    setWalkinPhone,
    walkinEmail,
    setWalkinEmail,
    paymentMethod,
    setPaymentMethod,
    cashReceived,
    setCashReceived,
    referenceNumber,
    setReferenceNumber,
    selectedStaffId,
    setSelectedStaffId,
    staffList,
    clientType,
    setClientType,
    isPartialPayment,
    setIsPartialPayment,
    amountToPay,
    setAmountToPay,
    change,
    processing,
    handleCheckout,
    addNotification,
    splitPayments,
    setSplitPayments,
    totalOverride,
    calculatedTotal,
    downpaymentType,
    setDownpaymentType,
    downpaymentAmount,
    setDownpaymentAmount,
    downpaymentPercentageRate,
    setDownpaymentPercentageRate,
    downpaymentEstimatedTotal,
    setDownpaymentEstimatedTotal,
    payrollSplitMode,
    setPayrollSplitMode,
    salesDescription,
    setSalesDescription,
}: CheckoutModalProps) {
    const [showDownpayment, setShowDownpayment] = useState(false)

    useEffect(() => {
        if (downpaymentType) {
            const calculatedAmount = calculateDownpaymentAmount(
                downpaymentType,
                downpaymentAmount,
                downpaymentPercentageRate,
                downpaymentEstimatedTotal
            )
            if (calculatedAmount > 0) {
                setIsPartialPayment(true)
                setAmountToPay(calculatedAmount.toFixed(2))
            } else {
                setIsPartialPayment(false)
                setAmountToPay(total.toFixed(2))
            }
        } else {
            setIsPartialPayment(false)
            setAmountToPay(total.toFixed(2))
        }
    }, [downpaymentType, downpaymentAmount, downpaymentPercentageRate, downpaymentEstimatedTotal, setIsPartialPayment, setAmountToPay, total])

    if (!isOpen) return null

    const hasServices = cart.some(item => item.type === 'SERVICE')
    const isSufficientPayment = paymentMethod === 'SPLIT' 
        ? splitPayments.reduce((sum, p) => sum + p.amount, 0) >= total || isPartialPayment
        : paymentMethod === 'CASH'
        ? parseFloat(cashReceived) >= total || isPartialPayment
        : true

    const hasRequiredReferences = paymentMethod !== 'SPLIT' || splitPayments.every(
        p => p.payment_method === 'CASH' || (p.reference_number?.trim() ?? '') !== ''
    )

    const isValid =
        cart.length > 0 &&
        (customerMode === 'WALKIN' ? walkinName.trim() !== '' : true) &&
        selectedStaffId !== '' &&
        isSufficientPayment &&
        hasRequiredReferences &&
        (paymentMethod !== 'CASH' && paymentMethod !== 'SPLIT' ? referenceNumber.trim() !== '' : true)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const totalToPay = isPartialPayment ? parseFloat(amountToPay) || total : total

    const downpaymentCalculatedAmount = calculateDownpaymentAmount(
        downpaymentType,
        downpaymentAmount,
        downpaymentPercentageRate,
        downpaymentEstimatedTotal
    )

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[90svh] lg:max-h-[80svh] overflow-hidden flex flex-col'
            >
                <div className='p-6 border-b border-zinc-200 dark:border-border flex justify-between items-center'>
                    <h3 className='text-xl font-bold flex items-center gap-2'>
                        <CreditCardIcon className='w-5 h-5 text-blue-600 dark:text-blue-400' />
                        Checkout
                    </h3>
                    <button
                        onClick={onClose}
                        className='text-muted-foreground hover:text-foreground'
                    >
                        <XCircleIcon className='w-6 h-6' />
                    </button>
                </div>

                <div className='flex-1 overflow-y-auto p-6 space-y-6'>
                    <CustomerSelection
                        customerMode={customerMode}
                        setCustomerMode={setCustomerMode}
                        walkinName={walkinName}
                        setWalkinName={setWalkinName}
                        walkinPhone={walkinPhone}
                        setWalkinPhone={setWalkinPhone}
                        walkinEmail={walkinEmail}
                        setWalkinEmail={setWalkinEmail}
                    />

                    <div className='border-t border-zinc-200 dark:border-border'></div>

                    <div className='space-y-4'>
                        <div>
                            <label className='block text-sm font-medium mb-2 text-muted-foreground dark:text-foreground flex items-center gap-2'>
                                <UsersIcon className='w-4 h-4' />
                                Staff Assignment
                            </label>
                            <select
                                value={selectedStaffId}
                                onChange={(e) => setSelectedStaffId(e.target.value)}
                                className='w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-border bg-white dark:bg-muted focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                            >
                                <option value=''>Select Staff Member</option>
                                <option value='SHOP_SALE'>Shop Sale (No Commission)</option>
                                {staffList.map((staff) => (
                                    <option key={staff.id} value={staff.id}>
                                        {staff.full_name} ({staff.role || 'staff'}{staff.rate_level_name ? ` - ${staff.rate_level_name}` : ''})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {hasServices && (
                            <div>
                                <label className='block text-sm font-medium mb-2 text-muted-foreground dark:text-foreground flex items-center gap-2'>
                                    <UserIcon className='w-4 h-4' />
                                    Client Type
                                </label>
                                <p className='text-xs text-muted-foreground dark:text-muted-foreground mb-2'>For calculating staff rates</p>
                                <div className='flex gap-2'>
                                    <button
                                        type='button'
                                        onClick={() => setClientType('WALKIN')}
                                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all border-2 ${
                                            clientType === 'WALKIN'
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                                                : 'border-zinc-200 dark:border-border bg-white dark:bg-muted hover:border-zinc-300 dark:hover:border-zinc-600'
                                        }`}
                                    >
                                        Walk-in
                                    </button>
                                    <button
                                        type='button'
                                        onClick={() => setClientType('PERSONAL')}
                                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all border-2 ${
                                            clientType === 'PERSONAL'
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                                                : 'border-zinc-200 dark:border-border bg-white dark:bg-muted hover:border-zinc-300 dark:hover:border-zinc-600'
                                        }`}
                                    >
                                        Personal
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Transaction Description */}
                    <div>
                        <label className='block text-sm font-medium mb-2 text-muted-foreground dark:text-foreground flex items-center gap-2'>
                            <FileTextIcon className='w-4 h-4' />
                            Transaction Description
                        </label>
                        <p className='text-xs text-muted-foreground dark:text-muted-foreground mb-2'>
                            This description will appear in the accounting ledger.
                        </p>
                        <textarea
                            value={salesDescription}
                            onChange={(e) => setSalesDescription(e.target.value.slice(0, 500))}
                            placeholder='e.g. Custom portrait tattoo + aftercare products'
                            maxLength={500}
                            rows={3}
                            className='w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-border bg-white dark:bg-muted focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none'
                        />
                        <p className='text-xs text-muted-foreground dark:text-muted-foreground mt-1 text-right'>
                            {salesDescription.length}/500
                        </p>
                    </div>

                    <div className='border-t border-zinc-200 dark:border-border'></div>

                    {/* Downpayment Section */}
                    <div>
                        <button
                            type='button'
                            onClick={() => {
                                setShowDownpayment(!showDownpayment)
                                if (showDownpayment) {
                                    setDownpaymentType(null)
                                }
                            }}
                            className='flex items-center gap-2 text-sm font-medium text-muted-foreground dark:text-foreground'
                        >
                            {showDownpayment ? (
                                <ToggleRightIcon className='w-5 h-5 text-blue-600 dark:text-blue-400' />
                            ) : (
                                <ToggleLeftIcon className='w-5 h-5 text-muted-foreground dark:text-muted-foreground' />
                            )}
                            Add Downpayment
                        </button>

                        {showDownpayment && (
                            <div className='mt-3 space-y-3 p-3 bg-zinc-50 dark:bg-muted/50 rounded-lg border border-zinc-200 dark:border-border'>
                                <div>
                                    <label className='block text-xs font-medium mb-1 text-muted-foreground dark:text-muted-foreground'>Downpayment Type</label>
                                    <select
                                        value={downpaymentType || ''}
                                        onChange={(e) => setDownpaymentType(e.target.value as 'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM' | null)}
                                        className='w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-border bg-white dark:bg-muted text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                                    >
                                        <option value=''>Select Type</option>
                                        <option value='FLAT_FEE'>Flat Fee</option>
                                        <option value='PERCENTAGE'>Percentage</option>
                                        <option value='CUSTOM'>Custom</option>
                                    </select>
                                </div>

                                {downpaymentType === 'FLAT_FEE' && (
                                    <div>
                                        <label className='block text-xs font-medium mb-1 text-muted-foreground dark:text-muted-foreground'>Amount</label>
                                        <input
                                            type='number'
                                            min='0'
                                            step='0.01'
                                            value={downpaymentAmount}
                                            onChange={(e) => setDownpaymentAmount(Number(e.target.value))}
                                            className='w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-border bg-white dark:bg-muted text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono'
                                        />
                                    </div>
                                )}

                                {downpaymentType === 'CUSTOM' && (
                                    <div>
                                        <label className='block text-xs font-medium mb-1 text-muted-foreground dark:text-muted-foreground'>Custom Amount</label>
                                        <input
                                            type='number'
                                            min='0'
                                            step='0.01'
                                            value={downpaymentAmount}
                                            onChange={(e) => setDownpaymentAmount(Number(e.target.value))}
                                            className='w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-border bg-white dark:bg-muted text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono'
                                        />
                                    </div>
                                )}

                                {downpaymentType === 'PERCENTAGE' && (
                                    <div className='space-y-3'>
                                        <div>
                                            <label className='block text-xs font-medium mb-1 text-muted-foreground dark:text-muted-foreground'>Percentage Rate (%)</label>
                                            <input
                                                type='number'
                                                min='0'
                                                max='100'
                                                step='0.01'
                                                value={downpaymentPercentageRate}
                                                onChange={(e) => setDownpaymentPercentageRate(Number(e.target.value))}
                                                className='w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-border bg-white dark:bg-muted text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono'
                                            />
                                        </div>
                                        <div>
                                            <label className='block text-xs font-medium mb-1 text-muted-foreground dark:text-muted-foreground'>Estimated Total</label>
                                            <input
                                                type='number'
                                                min='0'
                                                step='0.01'
                                                value={downpaymentEstimatedTotal}
                                                onChange={(e) => setDownpaymentEstimatedTotal(Number(e.target.value))}
                                                className='w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-border bg-white dark:bg-muted text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono'
                                            />
                                        </div>
                                        {downpaymentCalculatedAmount > 0 && (
                                            <p className='text-xs text-muted-foreground dark:text-muted-foreground'>
                                                Downpayment: {taxSettings.currency_symbol}{downpaymentCalculatedAmount.toFixed(2)}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {downpaymentType && (
                                    <div>
                                        <label className='block text-xs font-medium mb-1 text-muted-foreground dark:text-muted-foreground'>Payroll Split Mode</label>
                                        <select
                                            value={payrollSplitMode}
                                            onChange={(e) => setPayrollSplitMode(e.target.value as 'PER_PAYMENT' | 'ON_COMPLETION')}
                                            className='w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-border bg-white dark:bg-muted text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                                        >
                                            <option value='PER_PAYMENT'>Per Payment</option>
                                            <option value='ON_COMPLETION'>On Completion</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className='border-t border-zinc-200 dark:border-border'></div>

                    {paymentMethod === 'SPLIT' ? (
                        <SplitPaymentBuilder
                            splitPayments={splitPayments}
                            setSplitPayments={setSplitPayments}
                            taxSettings={taxSettings}
                            total={total}
                            allowPartial={isPartialPayment}
                            setAllowPartial={setIsPartialPayment}
                        />
                    ) : (
                        <PaymentMethodSelector
                            paymentMethod={paymentMethod}
                            setPaymentMethod={setPaymentMethod}
                            taxSettings={taxSettings}
                            cashReceived={cashReceived}
                            setCashReceived={setCashReceived}
                            referenceNumber={referenceNumber}
                            setReferenceNumber={setReferenceNumber}
                            change={change}
                            isPartialPayment={isPartialPayment}
                        />
                    )}

                    <div className='border-t border-zinc-200 dark:border-border'></div>

                    <div className='bg-zinc-50 dark:bg-muted/50 rounded-xl p-4 space-y-2 border border-zinc-200 dark:border-border'>
                        <div className='flex justify-between text-sm'>
                            <span className='text-muted-foreground dark:text-muted-foreground'>Net Subtotal:</span>
                            <span className='text-foreground text-foreground'>
                                {taxSettings.currency_symbol} {netSubtotal.toFixed(2)}
                            </span>
                        </div>
                        {taxSettings.tax_enabled && (
                            <div className='flex justify-between text-sm'>
                                <span className='text-muted-foreground dark:text-muted-foreground'>
                                    VAT ({(taxSettings.tax_rate * 100).toFixed(0)}%):
                                </span>
                                <span className='text-foreground text-foreground'>
                                    {taxSettings.currency_symbol} {taxAmount.toFixed(2)}
                                </span>
                            </div>
                        )}
                        {appliedDiscount > 0 && (
                            <div className='flex justify-between text-sm'>
                                <span className='text-green-600 dark:text-green-400'>
                                    Discount ({discountType === 'PERCENTAGE' ? `${appliedDiscount}%` : `${taxSettings.currency_symbol} ${appliedDiscount.toFixed(2)}`}):
                                </span>
                                <span className='text-green-600 dark:text-green-400'>
                                    -{taxSettings.currency_symbol} {discountAmount.toFixed(2)}
                                </span>
                            </div>
                        )}
                        {totalOverride !== null && (
                            <div className='flex justify-between text-sm text-amber-500'>
                                <span>Price Adjustment:</span>
                                <span>
                                    {totalOverride > calculatedTotal ? '+' : totalOverride < calculatedTotal ? '-' : ''}
                                    {taxSettings.currency_symbol} {Math.abs(totalOverride - calculatedTotal).toFixed(2)}
                                </span>
                            </div>
                        )}
                        <div className='border-t border-zinc-300 dark:border-zinc-600 pt-2 mt-2'>
                            {totalOverride !== null && (
                                <div className='flex justify-between text-sm text-muted-foreground'>
                                    <span>Calculated Total:</span>
                                    <span className='line-through'>
                                        {taxSettings.currency_symbol} {calculatedTotal.toFixed(2)}
                                    </span>
                                </div>
                            )}
                            <div className='flex justify-between font-bold text-lg'>
                                <span className='text-foreground text-foreground'>
                                    {totalOverride !== null ? 'Adjusted Total:' : 'Total'}
                                </span>
                                <span className='text-blue-600 dark:text-blue-400'>
                                    {taxSettings.currency_symbol} {total.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className='p-6 border-t border-zinc-200 dark:border-border space-y-4'>
                    {downpaymentCalculatedAmount > 0 && (
                        <div className='p-3 bg-purple-500/10 rounded-lg border border-purple-500/30'>
                            <p className='text-sm font-medium text-purple-700 dark:text-purple-300'>Downpayment Summary</p>
                            <p className='text-xs text-muted-foreground dark:text-muted-foreground mt-1'>
                                Paying now: {taxSettings.currency_symbol}{downpaymentCalculatedAmount.toFixed(2)}
                            </p>
                            <p className='text-xs text-muted-foreground dark:text-muted-foreground'>
                                Balance due: {taxSettings.currency_symbol}{(total - downpaymentCalculatedAmount).toFixed(2)}
                            </p>
                        </div>
                    )}
                    <button
                        onClick={async () => {
                            const result = await handleCheckout()
                            if (result?.success && result.data.payrollErrors?.length) {
                                const firstError = result.data.payrollErrors[0].error
                                const moreCount = result.data.payrollErrors.length - 1
                                const errorMsg = moreCount > 0
                                    ? `Warning: ${result.data.payrollErrors.length} service(s) could not calculate commission. ${firstError} (+${moreCount} more)`
                                    : `Warning: 1 service could not calculate commission: ${firstError}`
                                addNotification(errorMsg, 'WARNING')
                            }
                        }}
                        disabled={processing || !isValid}
                        className='w-full px-6 py-4 rounded-xl bg-blue-600 text-foreground font-semibold text-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl'
                    >
                        {processing ? (
                            <>
                                <div className='w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin' />
                                Processing...
                            </>
                        ) : (
                            <>
                                <CheckCircle2Icon className='w-5 h-5' />
                                Complete Transaction
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    )
}
