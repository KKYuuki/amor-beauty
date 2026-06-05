'use client'

import { useState } from 'react'
import { Branch } from '@/utils/types/branch'
import { X } from 'lucide-react'
import { motion } from 'motion/react'

interface BranchFormData {
    name: string
    code: string
    city: string
    address?: string | null
    phone?: string | null
}

interface BranchFormProps {
    branch?: Branch
    onSubmit: (payload: BranchFormData) => Promise<boolean>
    onClose: () => void
}

export function BranchForm({ branch, onSubmit, onClose }: BranchFormProps) {
    const [name, setName] = useState(branch?.name ?? '')
    const [code, setCode] = useState(branch?.code ?? '')
    const [city, setCity] = useState(branch?.city ?? '')
    const [address, setAddress] = useState(branch?.address ?? '')
    const [phone, setPhone] = useState(branch?.phone ?? '')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const payload: BranchFormData = {
            name,
            code,
            city,
            address: address || null,
            phone: phone || null
        }

        const success = await onSubmit(payload)
        setLoading(false)

        if (success) {
            onClose()
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md shadow-2xl"
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <h2 className="text-lg font-semibold">
                        {branch ? 'Edit Branch' : 'Add New Branch'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-white/60 mb-1.5">
                            Branch Name *
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-white/30 transition-colors"
                            placeholder="e.g., Crossroads Branch"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white/60 mb-1.5">
                            Branch Code *
                        </label>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-white/30 transition-colors"
                            placeholder="e.g., CEB-CR"
                            maxLength={10}
                            required
                        />
                        <p className="text-xs text-white/40 mt-1">Unique identifier (max 10 chars)</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white/60 mb-1.5">
                            City *
                        </label>
                        <input
                            type="text"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-white/30 transition-colors"
                            placeholder="e.g., Cebu"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white/60 mb-1.5">
                            Address
                        </label>
                        <textarea
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-white/30 transition-colors resize-none"
                            placeholder="Full address"
                            rows={2}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white/60 mb-1.5">
                            Phone
                        </label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-white/30 transition-colors"
                            placeholder="Contact number"
                        />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors font-medium disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Save Branch'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    )
}
