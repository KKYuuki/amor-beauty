'use client'

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

interface PasskeySessionContextValue {
    isVerified: boolean
    verifiedAt: number | null
    isVerifying: boolean
    markVerified: () => void
    invalidate: () => void
    remainingTime: number | null
}

const PasskeySessionContext = createContext<PasskeySessionContextValue | undefined>(undefined)

const VERIFICATION_TTL_MS = 15 * 60 * 1000 // 15 minutes

export function PasskeySessionProvider({ children }: { children: React.ReactNode }) {
    const [isVerified, setIsVerified] = useState(false)
    const [verifiedAt, setVerifiedAt] = useState<number | null>(null)
    const [remainingTime, setRemainingTime] = useState<number | null>(null)
    const mountedRef = useRef(true)

    const checkTTL = useCallback(() => {
        if (!verifiedAt) return false
        return Date.now() - verifiedAt < VERIFICATION_TTL_MS
    }, [verifiedAt])

    const markVerified = useCallback(() => {
        if (!mountedRef.current) return
        setIsVerified(true)
        setVerifiedAt(Date.now())
    }, [])

    const invalidate = useCallback(() => {
        if (!mountedRef.current) return
        setIsVerified(false)
        setVerifiedAt(null)
        setRemainingTime(null)
    }, [])

    useEffect(() => {
        if (!isVerified || !verifiedAt) {
            setRemainingTime(null)
            return
        }

        const updateRemaining = () => {
            if (!verifiedAt) return
            const elapsed = Date.now() - verifiedAt
            const remaining = VERIFICATION_TTL_MS - elapsed
            if (remaining <= 0) {
                setIsVerified(false)
                setRemainingTime(null)
            } else {
                setRemainingTime(remaining)
            }
        }

        updateRemaining()
        const interval = setInterval(updateRemaining, 1000)
        return () => clearInterval(interval)
    }, [isVerified, verifiedAt])

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    const value: PasskeySessionContextValue = {
        isVerified: isVerified && checkTTL(),
        verifiedAt,
        isVerifying: false,
        markVerified,
        invalidate,
        remainingTime,
    }

    return (
        <PasskeySessionContext.Provider value={value}>
            {children}
        </PasskeySessionContext.Provider>
    )
}

export function usePasskeySession(): PasskeySessionContextValue {
    const context = useContext(PasskeySessionContext)
    if (context === undefined) {
        throw new Error('usePasskeySession must be used within a PasskeySessionProvider')
    }
    return context
}
