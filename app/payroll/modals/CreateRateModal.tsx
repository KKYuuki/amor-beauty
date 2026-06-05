"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { XIcon } from "lucide-react"
import { RateLevelItem } from "@/utils/types/payroll"

interface CreateRateModalProps {
    rateLevels: RateLevelItem[]
    onClose: () => void
    onSave: (
        rate_name: string,
        service_type: string,
        client_type: string,
        rate_level_id: string,
        shopPct: number,
        staffPct: number,
        paymentMode: 'PERCENTAGE' | 'FIXED',
        fixedAmount?: number
    ) => Promise<void>
}

export function CreateRateModal({
    rateLevels,
    onClose,
    onSave,
}: CreateRateModalProps) {
    const [serviceType, setServiceType] = useState("TATTOO")
    const [clientType, setClientType] = useState("WALKIN")
    const [rateLevelId, setRateLevelId] = useState("")
    const [shopPct, setShopPct] = useState(60)
    const [staffPct, setStaffPct] = useState(40)
    const [paymentMode, setPaymentMode] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE')
    const [fixedAmount, setFixedAmount] = useState(0)
    const [loading, setLoading] = useState(false)

    const handleShopChange = (value: number) => {
        setShopPct(value)
        setStaffPct(100 - value)
    }

    const handleStaffChange = (value: number) => {
        setStaffPct(value)
        setShopPct(100 - value)
    }

    const handleSave = async () => {
        setLoading(true)
        const levelName = rateLevels.find(l => l.id === rateLevelId)?.name || 'No Level'
        const rateName = `${serviceType} - ${clientType} - ${levelName}`
        await onSave(
            rateName,
            serviceType,
            clientType,
            rateLevelId,
            shopPct,
            staffPct,
            paymentMode,
            paymentMode === 'FIXED' ? fixedAmount : undefined
        )
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
                    <h3 className='text-xl font-bold'>Create Rate</h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div>
                        <label className='block text-sm font-medium mb-1'>Service Type</label>
                        <select
                            value={serviceType}
                            onChange={(e) => setServiceType(e.target.value)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        >
                            <option value='TATTOO'>Tattoo</option>
                            <option value='PIERCING'>Piercing</option>
                            <option value='SHOE'>Shoe</option>
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Client Type</label>
                        <select
                            value={clientType}
                            onChange={(e) => setClientType(e.target.value)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        >
                            <option value='WALKIN'>Walk-in</option>
                            <option value='PERSONAL'>Personal</option>
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Rate Level</label>
                        <select
                            value={rateLevelId}
                            onChange={(e) => setRateLevelId(e.target.value)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        >
                            <option value=''>Select Rate Level</option>
                            {rateLevels.map((level) => (
                                <option key={level.id} value={level.id}>{level.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-2'>Payment Mode</label>
                        <div className='grid grid-cols-2 gap-2'>
                            <button
                                type='button'
                                onClick={() => setPaymentMode('PERCENTAGE')}
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${paymentMode === 'PERCENTAGE' ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}
                            >
                                Percentage
                            </button>
                            <button
                                type='button'
                                onClick={() => setPaymentMode('FIXED')}
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${paymentMode === 'FIXED' ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}
                            >
                                Fixed Amount
                            </button>
                        </div>
                    </div>

                    {paymentMode === 'PERCENTAGE' && (
                        <div className='grid grid-cols-2 gap-4'>
                            <div>
                                <label className='block text-sm font-medium mb-1'>Shop %</label>
                                <input
                                    type='number' min='0' max='100'
                                    value={shopPct}
                                    onChange={(e) => handleShopChange(Number(e.target.value))}
                                    className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none font-mono'
                                />
                            </div>
                            <div>
                                <label className='block text-sm font-medium mb-1'>Staff %</label>
                                <input
                                    type='number' min='0' max='100'
                                    value={staffPct}
                                    onChange={(e) => handleStaffChange(Number(e.target.value))}
                                    className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none font-mono'
                                />
                            </div>
                        </div>
                    )}

                    {paymentMode === 'FIXED' && (
                        <div>
                            <label className='block text-sm font-medium mb-1'>Fixed Amount for Staff</label>
                            <input
                                type='number' min='0' step='0.01'
                                value={fixedAmount}
                                onChange={(e) => setFixedAmount(Number(e.target.value))}
                                className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none font-mono'
                            />
                            <p className='text-xs text-white/40 mt-1'>Shop receives: (Total - Fixed Amount)</p>
                        </div>
                    )}

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'>Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={loading || !rateLevelId || (paymentMode === 'PERCENTAGE' && shopPct + staffPct !== 100)}
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                        >
                            {loading ? "Creating..." : "Create Rate"}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
