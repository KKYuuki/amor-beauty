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
                className='bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-border'
            >
                <div className='p-6 border-b border-border flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>Create Rate</h3>
                    <button onClick={onClose} className='text-muted-foreground hover:text-foreground'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div>
                        <label className='block text-sm font-medium mb-1'>Service Type</label>
                        <select
                            value={serviceType}
                            onChange={(e) => setServiceType(e.target.value)}
                            className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none'
                        >
                            <option value='HAIR'>Hair</option>
                            <option value='NAILS'>Nails</option>
                            <option value='FACIAL'>Facial</option>
                            <option value='BODY_MASSAGE'>Body Massage</option>
                            <option value='WAXING'>Waxing</option>
                            <option value='LASH_BROW'>Lash & Brow</option>
                            <option value='MAKEUP'>Makeup</option>
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Client Type</label>
                        <select
                            value={clientType}
                            onChange={(e) => setClientType(e.target.value)}
                            className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none'
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
                            className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none'
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
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${paymentMode === 'PERCENTAGE' ? 'bg-blue-600' : 'bg-card hover:bg-muted'}`}
                            >
                                Percentage
                            </button>
                            <button
                                type='button'
                                onClick={() => setPaymentMode('FIXED')}
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${paymentMode === 'FIXED' ? 'bg-blue-600' : 'bg-card hover:bg-muted'}`}
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
                                    className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none font-mono'
                                />
                            </div>
                            <div>
                                <label className='block text-sm font-medium mb-1'>Staff %</label>
                                <input
                                    type='number' min='0' max='100'
                                    value={staffPct}
                                    onChange={(e) => handleStaffChange(Number(e.target.value))}
                                    className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none font-mono'
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
                                className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none font-mono'
                            />
                            <p className='text-xs text-muted-foreground/70 mt-1'>Shop receives: (Total - Fixed Amount)</p>
                        </div>
                    )}

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors'>Cancel</button>
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
