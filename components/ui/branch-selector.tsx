'use client'

import { useState, useEffect } from 'react'
import { getBranches } from '@/server/actions/branches'
import { Branch } from '@/utils/types/branch'
import { Building2, ChevronDown } from 'lucide-react'

interface BranchSelectorProps {
    value?: string | null
    onChange: (branchId: string | null) => void
    placeholder?: string
    disabled?: boolean
    className?: string
}

export function BranchSelector({
    value,
    onChange,
    placeholder = 'Select branch',
    disabled = false,
    className = '',
}: BranchSelectorProps) {
    const [branches, setBranches] = useState<Branch[]>([])
    const [isOpen, setIsOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchBranches() {
            setLoading(true)
            const result = await getBranches()
            if (!result.success) {
                setError(result.error)
            } else {
                setBranches(result.data)
            }
            setLoading(false)
        }
        fetchBranches()
    }, [])

    const selectedBranch = branches.find(b => b.id === value)

    if (loading) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg ${className}`}>
                <Building2 className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-500">Loading branches...</span>
            </div>
        )
    }

    if (error) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-red-900 rounded-lg ${className}`}>
                <Building2 className="w-4 h-4 text-red-500" />
                <span className="text-red-400">{error}</span>
            </div>
        )
    }

    return (
        <div className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className="flex items-center justify-between w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-zinc-400" />
                    <span className={selectedBranch ? 'text-white' : 'text-zinc-500'}>
                        {selectedBranch ? `${selectedBranch.name} (${selectedBranch.city})` : placeholder}
                    </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {branches.length === 0 ? (
                        <div className="px-3 py-2 text-zinc-500 text-sm">No branches available</div>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    onChange(null)
                                    setIsOpen(false)
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800 text-zinc-400"
                            >
                                No branch (Shop Sale)
                            </button>
                            {branches.map((branch) => (
                                <button
                                    key={branch.id}
                                    type="button"
                                    onClick={() => {
                                        onChange(branch.id)
                                        setIsOpen(false)
                                    }}
                                    className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-800 ${
                                        value === branch.id ? 'bg-zinc-800 text-white' : 'text-zinc-300'
                                    }`}
                                >
                                    <div className="font-medium">{branch.name}</div>
                                    <div className="text-zinc-500 text-xs">{branch.city} • {branch.code}</div>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
