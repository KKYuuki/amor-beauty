"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { XIcon, AlertTriangleIcon } from "lucide-react"
import AdminActionGuard from "@/components/admin/AdminActionGuard"
import { RateLevelItem } from "@/utils/types/payroll"

interface DeleteRateLevelModalProps {
    rateLevel: RateLevelItem
    referenceCount: { rates: number; staff: number }
    onClose: () => void
    onConfirm: (id: string) => Promise<void>
}

export function DeleteRateLevelModal({ rateLevel, referenceCount, onClose, onConfirm }: DeleteRateLevelModalProps) {
    const [loading, setLoading] = useState(false)

    const hasReferences = referenceCount.rates > 0 || referenceCount.staff > 0

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
                className='bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-border'
            >
                <div className='p-6 border-b border-border flex justify-between items-center'>
                    <h3 className='text-xl font-bold text-red-400'>Delete Rate Level</h3>
                    <button onClick={onClose} className='text-muted-foreground hover:text-foreground'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    {hasReferences ? (
                        <div className='flex items-start gap-3'>
                            <AlertTriangleIcon className='w-6 h-6 text-red-400 shrink-0 mt-0.5' />
                            <div>
                                <p className='text-foreground font-medium'>Cannot delete &quot;{rateLevel.name}&quot;</p>
                                <p className='text-muted-foreground text-sm mt-2'>
                                    This rate level is still referenced by {referenceCount.rates > 0 && `${referenceCount.rates} rate${referenceCount.rates !== 1 ? 's' : ''}`}
                                    {referenceCount.rates > 0 && referenceCount.staff > 0 && ' and '}
                                    {referenceCount.staff > 0 && `${referenceCount.staff} staff member${referenceCount.staff !== 1 ? 's' : ''}`}
                                    . Deactivate it instead.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className='flex items-start gap-3'>
                            <AlertTriangleIcon className='w-6 h-6 text-yellow-400 shrink-0 mt-0.5' />
                            <div>
                                <p className='text-foreground font-medium'>
                                    Permanently delete &quot;{rateLevel.name}&quot;?
                                </p>
                                <p className='text-muted-foreground text-sm mt-2'>
                                    This cannot be undone. This level is not referenced by any rates or staff members.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors'>Cancel</button>
                        {!hasReferences && (
                            <AdminActionGuard onAction={handleConfirm}>
                                <button
                                    disabled={loading}
                                    className='px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 disabled:opacity-50 rounded-md transition-colors font-medium'
                                >
                                    {loading ? "Deleting..." : "Delete Permanently"}
                                </button>
                            </AdminActionGuard>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
