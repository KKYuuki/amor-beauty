"use client"

import { useState, useEffect } from "react"
import { motion } from "motion/react"
import { XIcon } from "lucide-react"
import { ServiceType } from "@/utils/types/payroll"

interface ManualPayrollEntryModalProps {
    onClose: () => void
    onSubmit: (data: {
        staff_id: string
        amount: number
        description: string
        service_date: Date
        notes?: string
        service_type?: ServiceType
    }) => Promise<void>
}

export function ManualPayrollEntryModal({
    onClose,
    onSubmit,
}: ManualPayrollEntryModalProps) {
    const [staffId, setStaffId] = useState("")
    const [amount, setAmount] = useState(0)
    const [description, setDescription] = useState("")
    const [notes, setNotes] = useState("")
    const [serviceDate, setServiceDate] = useState(
        new Date().toISOString().split("T")[0]
    )
    const [serviceType, setServiceType] = useState<ServiceType>('TATTOO')
    const [loading, setLoading] = useState(false)
    const [staffList, setStaffList] = useState<
        { id: string; full_name: string }[]
    >([])

    useEffect(() => {
        const fetchStaff = async () => {
            const { getStaffList } = await import("@/server/actions/profile")
            const list = await getStaffList()
            if (list) setStaffList(list)
        }
        fetchStaff()
    }, [])

    const handleSubmit = async () => {
        if (!staffId || amount <= 0 || !description) {
            return
        }
        setLoading(true)
        await onSubmit({
            staff_id: staffId,
            amount,
            description,
            service_date: new Date(serviceDate),
            notes: notes || undefined,
            service_type: serviceType,
        })
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
                    <h3 className='text-xl font-bold'>Manual Payroll Entry</h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div>
                        <label className='block text-sm font-medium mb-1'>
                            Staff Member
                        </label>
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
                        <label className='block text-sm font-medium mb-1'>
                            Amount
                        </label>
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
                        <label className='block text-sm font-medium mb-1'>
                            Description
                        </label>
                        <input
                            type='text'
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder='e.g., Bonus, adjustment, overtime...'
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>
                            Service Date
                        </label>
                        <input
                            type='date'
                            value={serviceDate}
                            onChange={(e) => setServiceDate(e.target.value)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>
                            Service Type
                        </label>
                        <select
                            value={serviceType}
                            onChange={(e) => setServiceType(e.target.value as ServiceType)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        >
                            <option value='TATTOO'>Tattoo</option>
                            <option value='PIERCING'>Piercing</option>
                            <option value='SHOE'>Shoe</option>
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>
                            Notes (optional)
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder='Additional notes...'
                            rows={2}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none resize-none'
                        />
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        <button
                            onClick={onClose}
                            className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading || !staffId || amount <= 0 || !description}
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                        >
                            {loading ? "Creating..." : "Create Entry"}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
