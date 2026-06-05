'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { authClient, Passkey } from '@/lib/auth-client'

interface PasskeyStatusContextValue {
    hasPasskeys: boolean
    passkeyCount: number
    isLoading: boolean
    error: string | null
    refetch: () => Promise<void>
}

const PasskeyStatusContext = createContext<PasskeyStatusContextValue | undefined>(undefined)

// Track global fetch state to prevent duplicate requests across all consumers
let globalFetchPromise: Promise<void> | null = null
let globalLastFetch: number = 0
const CACHE_DURATION = 5000 // 5 seconds cache

export function PasskeyStatusProvider({ children }: { children: React.ReactNode }) {
    const [passkeyCount, setPasskeyCount] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const mountedRef = useRef(true)
    const passkeyCountRef = useRef(passkeyCount)

    // Keep ref in sync with state
    useEffect(() => {
        passkeyCountRef.current = passkeyCount
    }, [passkeyCount])

    const fetchPasskeys = useCallback(async () => {
        // Use cached result if recent and we already have data
        const now = Date.now()
        if (now - globalLastFetch < CACHE_DURATION && !globalFetchPromise) {
            // If we already have data from a previous fetch, just ensure loading is false
            if (passkeyCountRef.current > 0 && mountedRef.current) {
                setIsLoading(false)
            }
            return
        }

        // If a fetch is already in progress, wait for it
        if (globalFetchPromise) {
            await globalFetchPromise
            return
        }

        // Create new fetch promise
        globalFetchPromise = (async () => {
            try {
                setIsLoading(true)
                setError(null)
                const { data, error: fetchError } = await authClient.passkey.listUserPasskeys()
                
                if (!mountedRef.current) return
                
                if (fetchError) {
                    setError(fetchError.message || 'Failed to fetch passkeys')
                    return
                }
                
                setPasskeyCount((data as unknown as Passkey[])?.length || 0)
                globalLastFetch = Date.now()
            } catch (err) {
                if (!mountedRef.current) return
                setError(err instanceof Error ? err.message : 'An error occurred')
            } finally {
                if (mountedRef.current) {
                    setIsLoading(false)
                }
                globalFetchPromise = null
            }
        })()

        await globalFetchPromise
    }, [])

    useEffect(() => {
        mountedRef.current = true
        fetchPasskeys()
        
        return () => {
            mountedRef.current = false
        }
    }, [fetchPasskeys])

    const value: PasskeyStatusContextValue = {
        hasPasskeys: passkeyCount > 0,
        passkeyCount,
        isLoading,
        error,
        refetch: fetchPasskeys,
    }

    return (
        <PasskeyStatusContext.Provider value={value}>
            {children}
        </PasskeyStatusContext.Provider>
    )
}

export function usePasskeyStatus(): PasskeyStatusContextValue {
    const context = useContext(PasskeyStatusContext)
    if (context === undefined) {
        throw new Error('usePasskeyStatus must be used within a PasskeyStatusProvider')
    }
    return context
}
