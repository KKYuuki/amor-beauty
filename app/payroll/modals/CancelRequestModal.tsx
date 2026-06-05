"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { PayrollRequest } from "@/utils/types/payroll"

interface CancelRequestModalProps {
    request: PayrollRequest
    onClose: () => void
    onConfirm: (reason: string) => void
}

export function CancelRequestModal({
    request,
    onClose,
    onConfirm,
}: CancelRequestModalProps) {
    const [reason, setReason] = useState("")
    const [loading, setLoading] = useState(false)

    const handleConfirm = async () => {
        if (!reason.trim()) return
        setLoading(true)
        await onConfirm(reason)
        setLoading(false)
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10'
            >
                <div className='p-6 border-b border-white/10'>
                    <h3 className='text-xl font-bold text-red-400'>
                        Cancel Request
                    </h3>
                    <p className='text-sm text-white/60 mt-1'>
                        This will return entries to pending status
                    </p>
                </div>

                <div className='p-6 space-y-4'>
                    <div className='p-3 bg-white/5 rounded-md text-sm'>
                        <span className='text-white/60'>
                            Cancelling request for:{" "}
                        </span>
                        <span className='font-medium'>
                            {(request.staff as { full_name?: string })
                                ?.full_name || "Staff"}
                        </span>
                    </div>
                    <div>
                        <label className='block text-sm font-medium mb-1'>
                            Reason *
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder='Enter cancellation reason...'
                            rows={2}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none resize-none'
                        />
                    </div>

                    <div className='flex justify-end gap-3'>
                        <button
                            onClick={onClose}
                            className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'
                        >
                            Back
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading || !reason.trim()}
                            className='px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                        >
                            {loading ? "Cancelling..." : "Cancel Request"}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
