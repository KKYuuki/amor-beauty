"use client"

import { useState, useEffect } from "react"
import { Clock, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import PasskeyVerification from "@/components/auth/PasskeyVerification"
import PasskeyOnboarding from "@/components/auth/PasskeyOnboarding"
import ClockOutScanner from "@/components/clock/ClockOutScanner"
import { usePasskeyStatus } from "@/hooks/usePasskeyStatus"
import { usePasskeySession } from "@/contexts/PasskeySessionContext"

interface ClockOutButtonProps {
    staffId: string
    currentEntryId?: string
    onClockOut: () => void
    useQR?: boolean
}

export default function ClockOutButton({ staffId, currentEntryId, onClockOut, useQR = true }: ClockOutButtonProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showVerification, setShowVerification] = useState(false)
    const [showPasskeySetup, setShowPasskeySetup] = useState(false)
    const [pendingCheck, setPendingCheck] = useState(false)
    const [showScanner, setShowScanner] = useState(false)

    const { hasPasskeys, isLoading: passkeysLoading } = usePasskeyStatus()
    const { isVerified, markVerified } = usePasskeySession()

    const handleDirectClockOut = async () => {
        markVerified()
        setIsLoading(true)
        setError(null)

        try {
            const { clockOut } = await import("@/server/actions/time-clock")
            const result = await clockOut(staffId)

            if (!result.success) {
                setError(result.error)
                setIsLoading(false)
                return
            }

            onClockOut()
        } catch (_err) {
            setError("Failed to clock out. Please try again.")
            setIsLoading(false)
        }
    }

    const handleVerified = async () => {
        setShowVerification(false)
        markVerified()
        setIsLoading(true)
        setError(null)

        try {
            const { clockOut } = await import("@/server/actions/time-clock")
            const result = await clockOut(staffId)

            if (!result.success) {
                setError(result.error)
                setIsLoading(false)
                return
            }

            onClockOut()
        } catch (_err) {
            setError("Failed to clock out. Please try again.")
            setIsLoading(false)
        }
    }

    const handleClockOutClick = () => {
        if (useQR) {
            setShowScanner(true)
            return
        }
        if (passkeysLoading) {
            setPendingCheck(true)
            return
        }
        if (hasPasskeys) {
            if (isVerified) {
                handleDirectClockOut()
            } else {
                setShowVerification(true)
            }
        } else {
            setShowPasskeySetup(true)
        }
    }

    useEffect(() => {
        if (!passkeysLoading && pendingCheck) {
            setPendingCheck(false)
            if (hasPasskeys) {
                if (isVerified) {
                    handleDirectClockOut()
                } else {
                    setShowVerification(true)
                }
            } else {
                setShowPasskeySetup(true)
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [passkeysLoading, pendingCheck, hasPasskeys, isVerified])

    return (
        <div className="flex flex-col gap-3">
            <Button
                onClick={handleClockOutClick}
                disabled={isLoading || !currentEntryId}
                loading={isLoading}
                size="lg"
                className="bg-orange-500/30 hover:bg-orange-500/50 border-2 border-white/10 text-white"
            >
                <Clock className="w-5 h-5" />
                Clock Out
            </Button>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-md">
                    <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-200">{error}</p>
                </div>
            )}

            {!currentEntryId && (
                <p className="text-sm text-white/50 text-center">
                    No active clock-in session
                </p>
            )}

            <PasskeyVerification
                isOpen={showVerification}
                onClose={() => setShowVerification(false)}
                onVerified={handleVerified}
                title="Verify Clock Out"
                description="Please verify your identity to clock out."
            />

            <PasskeyOnboarding
                isOpen={showPasskeySetup}
                onClose={() => setShowPasskeySetup(false)}
                onComplete={() => {
                    setShowPasskeySetup(false)
                    setShowVerification(true)
                }}
                showSkip={false}
            />

            {showScanner && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <ClockOutScanner
                        staffId={staffId}
                        onSuccess={() => {
                            setShowScanner(false)
                            onClockOut()
                        }}
                        onCancel={() => setShowScanner(false)}
                    />
                </div>
            )}
        </div>
    )
}
