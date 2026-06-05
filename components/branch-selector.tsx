"use client"

import { useEffect } from "react"
import { Building2Icon, ChevronDownIcon } from "lucide-react"
import { useBranchContext } from "./branch-context"

interface BranchSelectorProps {
    showAllOption?: boolean
    forceSelect?: boolean
    onBranchChange?: (branch: string | null) => void
    className?: string
}

export default function BranchSelector({
    showAllOption = false,
    forceSelect = false,
    onBranchChange,
    className = "",
}: BranchSelectorProps) {
    const { branches, currentBranch, setCurrentBranch, isLoading } = useBranchContext()

    useEffect(() => {
        if (forceSelect && !currentBranch && branches.length > 0) {
            setCurrentBranch(branches[0])
            onBranchChange?.(branches[0].id)
        }
    }, [forceSelect, currentBranch, branches, setCurrentBranch, onBranchChange])

    const handleBranchChange = (branchId: string) => {
        if (branchId === "all") {
            setCurrentBranch(null)
            onBranchChange?.(null)
        } else {
            const branch = branches.find((b) => b.id === branchId)
            if (branch) {
                setCurrentBranch(branch)
                onBranchChange?.(branch.id)
            }
        }
    }

    if (isLoading) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-white/5 rounded-md ${className}`}>
                <Building2Icon size={16} className="text-white/40" />
                <span className="text-sm text-white/40">Loading branches...</span>
            </div>
        )
    }

    if (branches.length === 0) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-white/5 rounded-md ${className}`}>
                <Building2Icon size={16} className="text-white/40" />
                <span className="text-sm text-white/40">No branches</span>
            </div>
        )
    }

    if (branches.length === 1) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-white/5 rounded-md ${className}`}>
                <Building2Icon size={16} className="text-blue-400" />
                <span className="text-sm font-medium">{branches[0].name}</span>
            </div>
        )
    }

    return (
        <div className={`relative ${className}`}>
            <select
                value={currentBranch?.id ?? (forceSelect && branches[0] ? branches[0].id : "all")}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm font-medium cursor-pointer hover:bg-white/10 focus:outline-none focus:border-white/30 appearance-none pr-8 w-full"
            >
                {showAllOption && !forceSelect && (
                    <option value="all">All Branches</option>
                )}
                {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                    </option>
                ))}
            </select>
            <ChevronDownIcon
                size={16}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
            />
        </div>
    )
}

// Smaller inline version for forms
export function BranchSelectorInline({
    value,
    onChange,
    showSharedOption = true,
    disabled = false,
    className = "",
}: {
    value: string | null | undefined
    onChange: (value: string | null, isShared: boolean) => void
    showSharedOption?: boolean
    disabled?: boolean
    className?: string
}) {
    const { branches, isLoading } = useBranchContext()

    if (isLoading) return null

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            <select
                value={value ?? "shared"}
                onChange={(e) => {
                    const newValue = e.target.value === "shared" ? null : e.target.value
                    onChange(newValue, newValue === null)
                }}
                disabled={disabled}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-white/30 disabled:opacity-50"
            >
                {showSharedOption && (
                    <option value="shared">Shared (All Branches)</option>
                )}
                {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                        {branch.name}
                    </option>
                ))}
            </select>
        </div>
    )
}
