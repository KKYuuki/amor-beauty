"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { XIcon } from "lucide-react"
import { PayrollStaffRate, RateLevelItem } from "@/utils/types/payroll"

interface EditRateModalProps {
    rate: PayrollStaffRate
    rateLevels: RateLevelItem[]
    onClose: () => void
    onSave: (
        shopPct: number,
        staffPct: number,
        paymentMode: 'PERCENTAGE' | 'FIXED',
        fixedAmount: number | undefined,
        serviceType: string,
        clientType: string,
        rateLevelId: string,
        isActive: boolean
    ) => Promise<void>
    onDeactivate: (rateId: string) => Promise<void>
    onDelete: (rateId: string) => Promise<void>
    deletable: boolean
    entryCount: number
}

export function EditRateModal({
    rate,
    rateLevels,
    onClose,
    onSave,
    onDeactivate: _onDeactivate,
    onDelete,
    deletable,
    entryCount,
}: EditRateModalProps) {
    const [serviceType, setServiceType] = useState<string>(rate.service_type || 'HAIR')
    const [clientType, setClientType] = useState<string>(rate.client_type || 'WALKIN')
    const [rateLevelId, setRateLevelId] = useState(rate.rate_level_id || '')
    const [shopPct, setShopPct] = useState(rate.shop_percentage)
    const [staffPct, setStaffPct] = useState(rate.staff_percentage)
    const [paymentMode, setPaymentMode] = useState<'PERCENTAGE' | 'FIXED'>(
        rate.payment_mode || 'PERCENTAGE'
    )
    const [fixedAmount, setFixedAmount] = useState(rate.fixed_amount || 0)
    const [loading, setLoading] = useState(false)
    const [isActive, setIsActive] = useState(rate.is_active)

    const handleSave = async () => {
        setLoading(true)
        await onSave(
            shopPct,
            staffPct,
            paymentMode,
            paymentMode === 'FIXED' ? fixedAmount : undefined,
            serviceType,
            clientType,
            rateLevelId,
            isActive
        )
        setLoading(false)
    }

    // Auto-calculate complement
    const handleShopChange = (value: number) => {
        setShopPct(value)
        setStaffPct(100 - value)
    }

    const handleStaffChange = (value: number) => {
        setStaffPct(value)
        setShopPct(100 - value)
    }

    const rateName = `${serviceType} - ${clientType} - ${rateLevels.find(l => l.id === rateLevelId)?.name || 'No Level'}`

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-border'
            >
                <div className='p-6 border-b border-border flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>Edit Rate</h3>
                    <button
                        onClick={onClose}
                        className='text-muted-foreground hover:text-foreground'
                    >
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div className='p-3 bg-muted rounded-md'>
                        <p className='text-sm text-muted-foreground'>Rate</p>
                        <p className='font-medium'>{rateName}</p>
                    </div>

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
                            <option value=''>No Level</option>
                            {rateLevels.map((level) => (
                                <option key={level.id} value={level.id}>{level.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Status Toggle */}
                    <div>
                        <label className='block text-sm font-medium mb-2'>Status</label>
                        <div className='grid grid-cols-2 gap-2'>
                            <button
                                type='button'
                                onClick={() => setIsActive(true)}
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${isActive ? 'bg-green-600' : 'bg-card hover:bg-muted'}`}
                            >
                                Active
                            </button>
                            <button
                                type='button'
                                onClick={() => setIsActive(false)}
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${!isActive ? 'bg-red-600' : 'bg-card hover:bg-muted'}`}
                            >
                                Inactive
                            </button>
                        </div>
                    </div>

                    {/* Payment Mode Toggle */}
                    <div>
                        <label className='block text-sm font-medium mb-2'>
                            Payment Mode
                        </label>
                        <div className='grid grid-cols-2 gap-2'>
                            <button
                                type='button'
                                onClick={() => setPaymentMode('PERCENTAGE')}
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${
                                    paymentMode === 'PERCENTAGE'
                                        ? 'bg-blue-600'
                                        : 'bg-card hover:bg-muted'
                                }`}
                            >
                                Percentage
                            </button>
                            <button
                                type='button'
                                onClick={() => setPaymentMode('FIXED')}
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${
                                    paymentMode === 'FIXED'
                                        ? 'bg-blue-600'
                                        : 'bg-card hover:bg-muted'
                                }`}
                            >
                                Fixed Amount
                            </button>
                        </div>
                    </div>

                    {/* Percentage Mode Inputs */}
                    {paymentMode === 'PERCENTAGE' && (
                        <div className='grid grid-cols-2 gap-4'>
                            <div>
                                <label className='block text-sm font-medium mb-1'>
                                    Shop %
                                </label>
                                <input
                                    type='number'
                                    min='0'
                                    max='100'
                                    value={shopPct}
                                    onChange={(e) =>
                                        handleShopChange(Number(e.target.value))
                                    }
                                    className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none font-mono'
                                />
                            </div>
                            <div>
                                <label className='block text-sm font-medium mb-1'>
                                    Staff %
                                </label>
                                <input
                                    type='number'
                                    min='0'
                                    max='100'
                                    value={staffPct}
                                    onChange={(e) =>
                                        handleStaffChange(Number(e.target.value))
                                    }
                                    className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none font-mono'
                                />
                            </div>
                        </div>
                    )}

                    {/* Fixed Mode Input */}
                    {paymentMode === 'FIXED' && (
                        <div>
                            <label className='block text-sm font-medium mb-1'>
                                Fixed Amount for Staff
                            </label>
                            <input
                                type='number'
                                min='0'
                                step='0.01'
                                value={fixedAmount}
                                onChange={(e) => setFixedAmount(Number(e.target.value))}
                                className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none font-mono'
                            />
                            <p className='text-xs text-muted-foreground/70 mt-1'>
                                Shop receives: (Total - Fixed Amount)
                            </p>
                        </div>
                    )}

                    <div className='flex justify-between items-center pt-4 border-t border-border'>
                        {deletable ? (
                            <button
                                type='button'
                                onClick={() => onDelete(rate.id)}
                                disabled={loading}
                                className='px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-md transition-colors font-medium text-sm disabled:opacity-50'
                            >
                                Delete Rate
                            </button>
                        ) : (
                            <span
                                className='px-4 py-2 text-xs text-muted-foreground/70 cursor-not-allowed'
                                title={`Cannot delete: rate is referenced by ${entryCount} payroll entr${entryCount === 1 ? 'y' : 'ies'}. Deactivate instead.`}
                            >
                                Delete Rate
                            </span>
                        )}
                        <div className='flex gap-3'>
                            <button
                                onClick={onClose}
                                className='px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors'
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={
                                    loading ||
                                    (paymentMode === 'PERCENTAGE' &&
                                        shopPct + staffPct !== 100)
                                }
                                className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                            >
                                {loading ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
