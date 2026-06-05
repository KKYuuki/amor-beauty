"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { XIcon, AlertTriangleIcon } from "lucide-react"
import AdminActionGuard from "@/components/admin/AdminActionGuard"
import { RateLevelItem } from "@/utils/types/payroll"

interface DeactivateRateLevelModalProps {
    rateLevel: RateLevelItem
    onClose: () => void
    onConfirm: (id: string) => Promise<void>
}

export function DeactivateRateLevelModal({ rateLevel, onClose, onConfirm }: DeactivateRateLevelModalProps) {
    const [loading, setLoading] = useState(false)

    const handleConfirm = async () => {
        setLoading(true)
        try {
            await onConfirm(rateLevel.id)
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
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10'
            >
                <div className='p-6 border-b border-white/10 flex justify-between items-center'>
                    <h3 className='text-xl font-bold text-red-400'>Deactivate Rate Level</h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div className='flex items-start gap-3'>
                        <AlertTriangleIcon className='w-6 h-6 text-yellow-400 shrink-0 mt-0.5' />
                        <div>
                            <p className='text-white font-medium'>
                                Are you sure you want to deactivate &quot;{rateLevel.name}&quot;?
                            </p>
                            <p className='text-white/60 text-sm mt-2'>
                                This will prevent it from being assigned to new rates or staff members. Existing assignments will be preserved.
                            </p>
                        </div>
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'>Cancel</button>
                        <AdminActionGuard onAction={handleConfirm}>
                            <button
                                disabled={loading}
                                className='px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 disabled:opacity-50 rounded-md transition-colors font-medium'
                            >
                                {loading ? "Deactivating..." : "Deactivate"}
                            </button>
                        </AdminActionGuard>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
