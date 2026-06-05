'use client'

import { useBranchContext } from '@/components/branch-context'
import { ChevronDownIcon } from 'lucide-react'

interface BranchSelectorInlineProps {
    value: string | null | undefined
    onChange: (branchId: string | null) => void
    showAllOption?: boolean
    disabled?: boolean
    className?: string
    label?: string
}

export function BranchSelectorInline({
    value,
    onChange,
    showAllOption = true,
    disabled = false,
    className = '',
    label = 'Branch',
}: BranchSelectorInlineProps) {
    const { branches, isLoading } = useBranchContext()
    
    if (isLoading) {
        return (
            <div className={`flex flex-col gap-1 ${className}`}>
                {label && <label className='text-sm text-white/60'>{label}</label>}
                <div className='px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white/40'>
                    Loading...
                </div>
            </div>
        )
    }

    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            {label && <label className='text-sm text-white/60'>{label}</label>}
            <div className='relative'>
                <select
                    value={value ?? 'all'}
                    onChange={(e) => {
                        const newValue = e.target.value === 'all' ? null : e.target.value
                        onChange(newValue)
                    }}
                    disabled={disabled}
                    className='w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-white/30 disabled:opacity-50 appearance-none pr-8'
                >
                    {showAllOption && (
                        <option value='all'>All Branches (Shared)</option>
                    )}
                    {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                            {branch.name}
                        </option>
                    ))}
                </select>
                <ChevronDownIcon
                    size={16}
                    className='absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none'
                />
            </div>
        </div>
    )
}
