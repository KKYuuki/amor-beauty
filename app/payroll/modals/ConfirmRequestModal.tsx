"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { PayrollRequest } from "@/utils/types/payroll"

interface ConfirmRequestModalProps {
    request: PayrollRequest
    currencySymbol: string
    onClose: () => void
    onConfirm: () => Promise<void>
}

export function ConfirmRequestModal({
    request,
    currencySymbol,
    onClose,
    onConfirm,
}: ConfirmRequestModalProps) {
    const [loading, setLoading] = useState(false)

    const handleConfirm = async () => {
        setLoading(true)
        await onConfirm()
        setLoading(false)
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-border'
            >
                <div className='p-6 border-b border-border'>
                    <h3 className='text-xl font-bold text-blue-400'>Confirm Payroll Request</h3>
                    <p className='text-sm text-muted-foreground mt-1'>
                        Review the request details before confirming
                    </p>
                </div>

                <div className='p-6 space-y-4'>
                    <div className='bg-muted rounded-lg p-3 text-sm space-y-1'>
                        <p><span className='text-muted-foreground'>Staff:</span> {(request.staff as { full_name?: string })?.full_name || 'Staff'}</p>
                        <p><span className='text-muted-foreground'>Period:</span> {new Date(request.period_start).toLocaleDateString()} - {new Date(request.period_end).toLocaleDateString()}</p>
                        <p><span className='text-muted-foreground'>Gross:</span> {currencySymbol}{Number(request.total_gross).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        <p><span className='text-muted-foreground'>Staff Cut:</span> {currencySymbol}{Number(request.total_staff_cut).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>

                    <div className='flex justify-end gap-3'>
                        <button onClick={onClose} className='px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors'>
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading}
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                        >
                            {loading ? 'Confirming...' : 'Confirm'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
