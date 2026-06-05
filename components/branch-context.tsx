"use client"

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { Branch } from "@/utils/types/branch"
import { getStoredBranchId, setStoredBranchId } from "@/utils/branch-storage"

interface BranchContextType {
    branches: Branch[]
    currentBranch: Branch | null
    setCurrentBranch: (branch: Branch | null) => void
    isLoading: boolean
    error: string | null
}

const BranchContext = createContext<BranchContextType | null>(null)

export function BranchProvider({ children }: { children: ReactNode }) {
    const [branches, setBranches] = useState<Branch[]>([])
    const [currentBranch, setCurrentBranch] = useState<Branch | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const handleSetBranch = useCallback((branch: Branch | null) => {
        setCurrentBranch(branch)
        setStoredBranchId(branch?.id ?? 'all')
    }, [])

    useEffect(() => {
        const fetchBranches = async () => {
            try {
                setIsLoading(true)
                const response = await fetch("/api/branches")
                if (!response.ok) throw new Error("Failed to fetch branches")
                const data = await response.json()
                setBranches(data)

                // Check session storage first, then default to first branch
                const storedBranchId = getStoredBranchId()
                if (storedBranchId === 'all') {
                    setCurrentBranch(null) // All Branches
                } else if (storedBranchId) {
                    const storedBranch = data.find((b: Branch) => b.id === storedBranchId)
                    if (storedBranch) {
                        setCurrentBranch(storedBranch)
                    } else if (data.length > 0) {
                        setCurrentBranch(data[0])
                    }
                } else if (data.length > 0) {
                    setCurrentBranch(data[0])
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Unknown error")
            } finally {
                setIsLoading(false)
            }
        }

        fetchBranches()
    }, [])

    return (
        <BranchContext.Provider
            value={{
                branches,
                currentBranch,
                setCurrentBranch: handleSetBranch,
                isLoading,
                error,
            }}
        >
            {children}
        </BranchContext.Provider>
    )
}

export function useBranchContext() {
    const context = useContext(BranchContext)
    if (!context) {
        throw new Error("useBranchContext must be used within a BranchProvider")
    }
    return context
}

// Hook for filtered queries - returns branch filter params
export function useBranchFilter() {
    const { currentBranch } = useBranchContext()
    return {
        branchId: currentBranch?.id ?? null,
        includeShared: true, // Always include shared items
    }
}
