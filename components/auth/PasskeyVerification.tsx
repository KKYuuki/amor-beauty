'use client'

import { useState, useContext, useRef, useEffect, useCallback } from 'react'
import { motion } from 'motion/react'
import { Fingerprint, X, AlertCircle, KeyRound } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { NotificationContext } from '@/components/notifications'

interface PasskeyVerificationProps {
    isOpen: boolean
    onClose: () => void
    onVerified: () => void
    title?: string
    description?: string
    autoTrigger?: boolean
}

export default function PasskeyVerification({
    isOpen,
    onClose,
    onVerified,
    title = 'Verify Your Identity',
    description = 'Please verify with your passkey to continue.',
    autoTrigger = false,
}: PasskeyVerificationProps) {
    const { addNotification } = useContext(NotificationContext)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [hasRetried, setHasRetried] = useState(false)
    const [autoTriggered, setAutoTriggered] = useState(false)

    const verifiedCalledRef = useRef(false)

    useEffect(() => {
        if (isOpen) {
            verifiedCalledRef.current = false
            setError(null)
            setHasRetried(false)
            setAutoTriggered(false)
        }
    }, [isOpen])

    const handlePasskeyVerify = useCallback(async () => {
        if (verifiedCalledRef.current || isLoading) return

        setError(null)
        setIsLoading(true)

        try {
            const result = await authClient.signIn.passkey({
                autoFill: false,
            })

            if (result.error) {
                setError(result.error.message || 'Passkey verification failed')
                return
            }

            if (!verifiedCalledRef.current) {
                verifiedCalledRef.current = true
                addNotification('Identity verified', 'SUCCESS')
                onVerified()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Verification failed')
        } finally {
            setIsLoading(false)
        }
    }, [isLoading, addNotification, onVerified])

    useEffect(() => {
        if (isOpen && autoTrigger && !autoTriggered && !isLoading) {
            setAutoTriggered(true)
            const timer = setTimeout(() => {
                if (!verifiedCalledRef.current) {
                    handlePasskeyVerify()
                }
            }, 300)
            return () => clearTimeout(timer)
        }
    }, [isOpen, autoTrigger, autoTriggered, isLoading, handlePasskeyVerify])

    if (!isOpen) return null

    const handleRetry = () => {
        setHasRetried(true)
        setError(null)
        setAutoTriggered(false)
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="passkey-verification-title"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-card border border-border rounded-xl w-full max-w-sm overflow-hidden shadow-2xl"
            >
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h3 id="passkey-verification-title" className="text-lg font-semibold text-foreground">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-muted rounded-full transition-colors"
                        type="button"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                <div className="p-6">
                    <p className="text-muted-foreground text-sm mb-6">{description}</p>

                    {error && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-md flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-2">
                                <p className="text-sm text-red-400">{error}</p>
                                <p className="text-xs text-muted-foreground/70">
                                    Passkey verification is required. Please ensure you have a passkey set up on your device.
                                </p>
                            </div>
                        </div>
                    )}

                    {!error ? (
                        <button
                            onClick={handlePasskeyVerify}
                            disabled={isLoading}
                            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-foreground font-medium py-3 rounded-md transition-colors flex items-center justify-center gap-2"
                            type="button"
                        >
                            {isLoading ? (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    className="w-5 h-5 border-2 border-border border-t-primary rounded-full"
                                />
                            ) : (
                                <>
                                    <Fingerprint className="w-5 h-5" />
                                    Verify with Passkey
                                </>
                            )}
                        </button>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleRetry}
                                className="w-full bg-blue-500 hover:bg-blue-600 text-foreground font-medium py-3 rounded-md transition-colors flex items-center justify-center gap-2"
                                type="button"
                            >
                                <Fingerprint className="w-5 h-5" />
                                Try Passkey Again
                            </button>
                            {hasRetried && (
                                <div className="flex items-center justify-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
                                    <KeyRound className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                                    <p className="text-xs text-yellow-200">
                                        If you don&apos;t have a passkey set up, please contact your administrator or set one up in your account settings.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    )
}