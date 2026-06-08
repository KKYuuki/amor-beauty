'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ShieldAlert, X, Fingerprint } from 'lucide-react'
import { usePasskeyStatus } from '@/hooks/usePasskeyStatus'
import PasskeyOnboarding from './PasskeyOnboarding'

export default function PasskeyBanner() {
    const { hasPasskeys, isLoading, refetch } = usePasskeyStatus()
    const [showOnboarding, setShowOnboarding] = useState(false)
    const [isDismissed, setIsDismissed] = useState(false)
    const [isAnimatingOut, setIsAnimatingOut] = useState(false)

    const handleDismiss = () => {
        setIsAnimatingOut(true)
    }

    if (isLoading || hasPasskeys || isDismissed) {
        return null
    }

    return (
        <>
            <AnimatePresence onExitComplete={() => setIsDismissed(true)}>
                {!isAnimatingOut && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-yellow-500/10 border-b border-yellow-500/20"
                    >
                        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <ShieldAlert className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                                <p className="text-sm text-yellow-200">
                                    <span className="font-medium">Passkeys are required for clock-in and admin actions.</span>{' '}
                                    Set up a passkey now to enable check-in.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowOnboarding(true)}
                                    className="px-4 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-black text-sm font-medium rounded-md transition-colors flex items-center gap-2"
                                >
                                    <Fingerprint className="w-4 h-4" />
                                    Set Up Now
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDismiss}
                                    className="p-1.5 hover:bg-muted rounded-md transition-colors"
                                    aria-label="Dismiss banner"
                                >
                                    <X className="w-4 h-4 text-muted-foreground" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <PasskeyOnboarding
                isOpen={showOnboarding}
                onClose={() => setShowOnboarding(false)}
                onComplete={async () => {
                    setShowOnboarding(false)
                    await refetch()
                }}
                showSkip={true}
            />
        </>
    )
}
