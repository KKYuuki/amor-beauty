"use client"

import { useState } from "react"
import { motion } from "motion/react"

interface CancelScheduledModalProps {
    scheduledId: string
    onClose: () => void
    onConfirm: (scheduledId: string, reason?: string) => Promise<void>
}

export function CancelScheduledModal({
    scheduledId,
    onClose,
    onConfirm,
}: CancelScheduledModalProps) {
    const [reason, setReason] = useState("")
    const [loading, setLoading] = useState(false)

    const handleConfirm = async () => {
        setLoading(true)
        await onConfirm(scheduledId, reason || undefined)
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
                    <h3 className='text-xl font-bold text-red-400'>Cancel Scheduled Payment</h3>
                    <p className='text-sm text-muted-foreground mt-1'>
                        This action cannot be undone
                    </p>
                </div>

                <div className='p-6 space-y-4'>
                    <div>
                        <label className='block text-sm font-medium mb-1'>
                            Reason (optional)
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder='Enter cancellation reason...'
                            rows={2}
                            className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none resize-none'
                        />
                    </div>

                    <div className='flex justify-end gap-3'>
                        <button
                            onClick={onClose}
                            className='px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors'
                        >
                            Back
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading}
                            className='px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                        >
                            {loading ? "Cancelling..." : "Cancel Scheduled"}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
