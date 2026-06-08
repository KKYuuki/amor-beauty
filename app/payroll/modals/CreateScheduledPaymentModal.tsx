"use client"

import { useState, useEffect } from "react"
import { motion } from "motion/react"
import { XIcon } from "lucide-react"

interface CreateScheduledPaymentModalProps {
    onClose: () => void
    onSave: (
        staffId: string,
        amount: number,
        reason: string,
        frequency: 'MONTHLY' | 'BIMONTHLY' | 'WEEKLY' | 'CUSTOM',
        startDate: string,
        endDate?: string
    ) => Promise<void>
}

export function CreateScheduledPaymentModal({
    onClose,
    onSave,
}: CreateScheduledPaymentModalProps) {
    const [staffId, setStaffId] = useState("")
    const [amount, setAmount] = useState(0)
    const [reason, setReason] = useState("")
    const [frequency, setFrequency] = useState<'MONTHLY' | 'BIMONTHLY' | 'WEEKLY' | 'CUSTOM'>('MONTHLY')
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
    const [endDate, setEndDate] = useState("")
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
        if (!staffId || amount <= 0 || !reason) return
        setLoading(true)
        await onSave(staffId, amount, reason, frequency, startDate, endDate || undefined)
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
                <div className='p-6 border-b border-border flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>Create Scheduled Payment</h3>
                    <button onClick={onClose} className='text-muted-foreground hover:text-foreground'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div>
                        <label className='block text-sm font-medium mb-1'>Staff Member</label>
                        <select
                            value={staffId}
                            onChange={(e) => setStaffId(e.target.value)}
                            className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none'
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
                        <label className='block text-sm font-medium mb-1'>Amount</label>
                        <input
                            type='number'
                            min='0'
                            step='0.01'
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none font-mono'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Reason</label>
                        <input
                            type='text'
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder='e.g., Monthly salary advance, Staff X allowance...'
                            className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Frequency</label>
                        <select
                            value={frequency}
                            onChange={(e) => setFrequency(e.target.value as 'MONTHLY' | 'BIMONTHLY' | 'WEEKLY' | 'CUSTOM')}
                            className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none'
                        >
                            <option value='MONTHLY'>Monthly</option>
                            <option value='BIMONTHLY'>Bimonthly</option>
                            <option value='WEEKLY'>Weekly</option>
                            <option value='CUSTOM'>Custom</option>
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Start Date</label>
                        <input
                            type='date'
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>End Date (optional)</label>
                        <input
                            type='date'
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none'
                        />
                        <p className='text-xs text-muted-foreground/70 mt-1'>Leave empty for indefinite</p>
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors'>Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={loading || !staffId || amount <= 0 || !reason}
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
