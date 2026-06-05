"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { XIcon, LoaderCircleIcon } from "lucide-react"
import { PayrollSplitMode } from "@/utils/types/payroll"

interface AssignStaffModalProps {
    staffList: Array<{ id: string; full_name: string }>
    onClose: () => void
    onConfirm: (staffId: string, payrollSplitMode: PayrollSplitMode) => Promise<void>
}

export function AssignStaffModal({
    staffList,
    onClose,
    onConfirm,
}: AssignStaffModalProps) {
    const [staffId, setStaffId] = useState("")
    const [payrollSplitMode, setPayrollSplitMode] = useState<PayrollSplitMode>("PER_PAYMENT")
    const [loading, setLoading] = useState(false)

    const handleConfirm = async () => {
        if (!staffId) return
        setLoading(true)
        await onConfirm(staffId, payrollSplitMode)
        setLoading(false)
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-white/10'
            >
                <div className='p-6 border-b border-white/10 flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>Assign Staff</h3>
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
                            <option value=''>Select Staff</option>
                            {staffList.map((staff) => (
                                <option key={staff.id} value={staff.id}>{staff.full_name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Payroll Split Mode</label>
                        <select
                            value={payrollSplitMode}
                            onChange={(e) => setPayrollSplitMode(e.target.value as PayrollSplitMode)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        >
                            <option value='PER_PAYMENT'>Per Payment</option>
                            <option value='ON_COMPLETION'>On Completion</option>
                        </select>
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'>Cancel</button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading || !staffId}
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium flex items-center gap-2'
                        >
                            {loading && <LoaderCircleIcon className='w-4 h-4 animate-spin' />}
                            {loading ? "Assigning..." : "Assign"}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
