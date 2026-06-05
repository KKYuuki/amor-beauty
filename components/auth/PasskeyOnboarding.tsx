'use client'

import { useState, useContext, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Fingerprint, ChevronRight, ChevronLeft, Check, X, Laptop, Smartphone, Tablet, KeyRound } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { detectDevice } from '@/utils/auth/deviceDetection'
import { NotificationContext } from '@/components/notifications'

interface PasskeyOnboardingProps {
    isOpen: boolean
    onClose: () => void
    onComplete: () => void
    showSkip?: boolean
}

type Step = 'intro' | 'register' | 'success'

export default function PasskeyOnboarding({ 
    isOpen, 
    onClose, 
    onComplete,
    showSkip = true 
}: PasskeyOnboardingProps) {
    const { addNotification } = useContext(NotificationContext)
    const [currentStep, setCurrentStep] = useState<Step>('intro')
    const [isRegistering, setIsRegistering] = useState(false)
    const [passkeyName, setPasskeyName] = useState('')
    const device = useMemo(() => detectDevice(), [])

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }
        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [onClose])

    if (!isOpen) return null

    const renderStepContent = () => {
        switch (currentStep) {
            case 'intro':
                return (
                    <motion.div
                        key="intro"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="text-center"
                    >
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                            <Fingerprint className="w-8 h-8 text-blue-400" />
                        </div>
                        <h2 id="passkey-onboarding-title" className="text-2xl font-bold text-white mb-2">
                            Secure Your Account
                        </h2>
                        <p className="text-white/60 mb-6">
                            Passkeys let you sign in quickly and securely using your device&apos;s biometric authentication.
                        </p>
                        <div className="text-left space-y-3 mb-8">
                            <div className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-green-400 mt-0.5" />
                                <span className="text-white/80">Sign in with Face ID, Touch ID, or Windows Hello</span>
                            </div>
                            <div className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-green-400 mt-0.5" />
                                <span className="text-white/80">No passwords to remember or type</span>
                            </div>
                            <div className="flex items-start gap-3">
                                <Check className="w-5 h-5 text-green-400 mt-0.5" />
                                <span className="text-white/80">Protection against phishing attacks</span>
                            </div>
                        </div>
                    </motion.div>
                )
            case 'register':
                return (
                    <motion.div
                        key="register"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                    >
                        <h2 className="text-xl font-bold text-white mb-2">
                            Register Your Passkey
                        </h2>
                        <div className="flex items-center gap-2 text-sm text-white/60 mb-6">
                            {device.icon === 'laptop' && <Laptop className="w-4 h-4" />}
                            {device.icon === 'smartphone' && <Smartphone className="w-4 h-4" />}
                            {device.icon === 'tablet' && <Tablet className="w-4 h-4" />}
                            {device.icon === 'key' && <KeyRound className="w-4 h-4" />}
                            <span>Detected: {device.platform}</span>
                        </div>
                        <div className="mb-6">
                            <label 
                                htmlFor="passkey-name"
                                className="block text-sm font-medium text-white/70 mb-2"
                            >
                                Passkey Name
                            </label>
                            <input
                                id="passkey-name"
                                type="text"
                                value={passkeyName}
                                onChange={(e) => setPasskeyName(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-md py-2.5 px-4 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
                                placeholder="e.g., MacBook Pro"
                            />
                        </div>
                        <p className="text-xs text-white/40">
                            Your device will prompt for Face ID, Touch ID, or PIN to register this passkey.
                        </p>
                    </motion.div>
                )
            case 'success':
                return (
                    <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center"
                    >
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                            <Check className="w-8 h-8 text-green-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">
                            Passkey Registered!
                        </h2>
                        <p className="text-white/60 mb-6">
                            You can now sign in without a password on this device.
                        </p>
                        <div className="bg-white/5 rounded-lg p-4 text-left mb-6">
                            <p className="text-sm font-medium text-white mb-2">Tips:</p>
                            <ul className="text-sm text-white/60 space-y-1">
                                <li>• Add passkeys on other devices for backup access</li>
                                <li>• Your passkey syncs via iCloud or Google Password Manager</li>
                            </ul>
                        </div>
                    </motion.div>
                )
        }
    }

    const handleNext = async () => {
        if (currentStep === 'intro') {
            setPasskeyName(device.suggestedName)
            setCurrentStep('register')
        } else if (currentStep === 'register') {
            await handleRegister()
        } else if (currentStep === 'success') {
            onComplete()
            onClose()
        }
    }

    const handleBack = () => {
        if (currentStep === 'register') {
            setCurrentStep('intro')
        }
    }

    const handleRegister = async () => {
        if (!passkeyName.trim()) {
            addNotification('Please enter a name for your passkey', 'WARNING')
            return
        }

        setIsRegistering(true)
        try {
            const { error } = await authClient.passkey.addPasskey({
                name: passkeyName,
            })

            if (error) {
                addNotification(error.message || 'Failed to register passkey', 'ERROR')
                return
            }

            addNotification('Passkey registered successfully', 'SUCCESS')
            setCurrentStep('success')
        } catch {
            addNotification('An unexpected error occurred', 'ERROR')
        } finally {
            setIsRegistering(false)
        }
    }

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="passkey-onboarding-title"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md overflow-hidden shadow-2xl"
            >
                <div className="flex justify-end p-4">
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5 text-white/60" />
                    </button>
                </div>

                <div className="px-6 pb-6">
                    <AnimatePresence mode="wait">
                        {renderStepContent()}
                    </AnimatePresence>

                    <div className="flex gap-3 mt-6">
                        {currentStep !== 'success' && showSkip && (
                            <button
                                onClick={onClose}
                                className="flex-1 py-2.5 text-sm text-white/60 hover:text-white transition-colors"
                                aria-label="Skip for now"
                            >
                                Skip for now
                            </button>
                        )}
                        {currentStep === 'register' && (
                            <button
                                onClick={handleBack}
                                className="py-2.5 px-4 text-white/60 hover:text-white transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            disabled={isRegistering}
                            className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-medium py-2.5 rounded-md transition-colors flex items-center justify-center gap-2"
                        >
                            {isRegistering ? (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                                />
                            ) : (
                                <>
                                    {currentStep === 'intro' && 'Set Up Passkey'}
                                    {currentStep === 'register' && 'Register Passkey'}
                                    {currentStep === 'success' && 'Done'}
                                    {currentStep !== 'success' && <ChevronRight className="w-4 h-4" />}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
