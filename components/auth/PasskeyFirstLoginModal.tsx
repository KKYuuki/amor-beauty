'use client'

import { useState, useEffect } from 'react'
import { usePasskeyStatus } from '@/hooks/usePasskeyStatus'
import PasskeyOnboarding from './PasskeyOnboarding'

const ONBOARDING_DISMISSED_KEY = 'passkeyOnboardingDismissed'

export default function PasskeyFirstLoginModal() {
    const { hasPasskeys, isLoading } = usePasskeyStatus()
    const [showOnboarding, setShowOnboarding] = useState(false)
    const [hasChecked, setHasChecked] = useState(false)

    useEffect(() => {
        if (isLoading || hasChecked) return

        const wasDismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true'

        if (!hasPasskeys && !wasDismissed) {
            const timer = setTimeout(() => {
                setShowOnboarding(true)
            }, 1000)
            return () => clearTimeout(timer)
        }

        setHasChecked(true)
    }, [hasPasskeys, isLoading, hasChecked])

    const handleClose = () => {
        setShowOnboarding(false)
        localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true')
    }

    const handleComplete = () => {
        setShowOnboarding(false)
        localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true')
    }

    return (
        <PasskeyOnboarding
            isOpen={showOnboarding}
            onClose={handleClose}
            onComplete={handleComplete}
            showSkip={true}
        />
    )
}
