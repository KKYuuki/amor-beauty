"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { XIcon } from "lucide-react"
import { RateLevelItem } from "@/utils/types/payroll"

interface EditRateLevelModalProps {
    rateLevel: RateLevelItem
    onClose: () => void
    onSave: (id: string, updates: { name?: string; is_active?: boolean; sort_order?: number }) => Promise<void>
}

export function EditRateLevelModal({ rateLevel, onClose, onSave }: EditRateLevelModalProps) {
    const [name, setName] = useState(rateLevel.name)
    const [sortOrder, setSortOrder] = useState(rateLevel.sort_order)
    const [isActive, setIsActive] = useState(rateLevel.is_active)
    const [loading, setLoading] = useState(false)

    const handleSave = async () => {
        setLoading(true)
        try {
            await onSave(rateLevel.id, {
                name: name.trim() !== rateLevel.name ? name.trim() : undefined,
                is_active: isActive !== rateLevel.is_active ? isActive : undefined,
                sort_order: sortOrder !== rateLevel.sort_order ? sortOrder : undefined,
            })
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
                    <h3 className='text-xl font-bold'>Edit Rate Level</h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div className='bg-white/5 rounded-md px-3 py-2 text-sm text-white/60'>
                        Editing: <span className='text-white font-medium'>{rateLevel.name}</span>
                        <span className='ml-2 text-xs'>({rateLevel.slug})</span>
                        {!rateLevel.is_active && (
                            <span className='ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-300 rounded text-xs font-semibold'>Inactive</span>
                        )}
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Name</label>
                        <input
                            type='text'
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Sort Order</label>
                        <input
                            type='number'
                            min='0'
                            value={sortOrder}
                            onChange={(e) => setSortOrder(Number(e.target.value))}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none font-mono'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-2'>Status</label>
                        <div className='grid grid-cols-2 gap-2'>
                            <button
                                type='button'
                                onClick={() => setIsActive(true)}
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${isActive ? 'bg-green-600' : 'bg-white/10 hover:bg-white/20'}`}
                            >
                                Active
                            </button>
                            <button
                                type='button'
                                onClick={() => setIsActive(false)}
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${!isActive ? 'bg-red-600' : 'bg-white/10 hover:bg-white/20'}`}
                            >
                                Inactive
                            </button>
                        </div>
                        {!isActive && rateLevel.is_active && (
                            <p className='text-xs text-yellow-400 mt-1'>Warning: Deactivating will prevent this level from being assigned to new rates or staff.</p>
                        )}
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'>Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                        >
                            {loading ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
