"use client"

import { useState, useEffect } from "react"
import { motion } from "motion/react"
import { XIcon } from "lucide-react"

interface CreateDeductionModalProps {
    onClose: () => void
    onSave: (
        userId: string,
        amount: number,
        reason: string,
        type: 'ADVANCE' | 'DEDUCTION' | 'ADJUSTMENT'
    ) => Promise<void>
}

export function CreateDeductionModal({
    onClose,
    onSave,
}: CreateDeductionModalProps) {
    const [staffId, setStaffId] = useState("")
    const [amount, setAmount] = useState(0)
    const [reason, setReason] = useState("")
    const [type, setType] = useState<'ADVANCE' | 'DEDUCTION' | 'ADJUSTMENT'>('DEDUCTION')
    const [loading, setLoading] = useState(false)
    const [staffList, setStaffList] = useState<{ id: string; full_name: string }[]>([])

    useEffect(() => {
        const fetchStaff = async () => {
            const { getStaffList } = await import("@/server/actions/profile")
            const list = await getStaffList()
            if (list) setStaffList(list)
        }
        fetchStaff()
    }, [])

    const handleSave = async () => {
        if (!staffId || amount <= 0) return
        setLoading(true)
        await onSave(staffId, amount, reason, type)
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
                <div className='p-6 border-b border-white/10 flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>Create Deduction</h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div>
                        <label className='block text-sm font-medium mb-1'>Staff Member</label>
                        <select
                            value={staffId}
                            onChange={(e) => setStaffId(e.target.value)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        >
                            <option value="">Select staff...</option>
                            {staffList.map((staff) => (
                                <option key={staff.id} value={staff.id}>
                                    {staff.full_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Type</label>
                        <div className='grid grid-cols-3 gap-2'>
                            {(['ADVANCE', 'DEDUCTION', 'ADJUSTMENT'] as const).map((t) => (
                                <button
                                    key={t}
                                    type='button'
                                    onClick={() => setType(t)}
                                    className={`px-3 py-2 rounded-md transition-colors font-medium text-sm ${
                                        type === t
                                            ? t === 'ADVANCE'
                                                ? 'bg-blue-600'
                                                : t === 'DEDUCTION'
                                                ? 'bg-red-600'
                                                : 'bg-purple-600'
                                            : 'bg-white/10 hover:bg-white/20'
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Amount</label>
                        <input
                            type='number'
                            min='0'
                            step='0.01'
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none font-mono'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Reason</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder='Enter reason...'
                            rows={2}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none resize-none'
                        />
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'>Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={loading || !staffId || amount <= 0}
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                        >
                            {loading ? "Creating..." : "Create"}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
