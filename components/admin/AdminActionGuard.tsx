/**
 * AdminActionGuard Component
 * 
 * Protects sensitive admin actions by requiring passkey verification.
 * 
 * Behavior:
 * - Production: Admins must verify with passkey
 * - Development: Bypassed automatically (!isProduction check)
 * - Non-admins: Always bypassed (no permission for protected actions anyway)
 * - Prop `bypass`: Explicit opt-out of verification
 * 
 * To disable in production on specific dev/staging servers,
 * set BYPASS_ADMIN_VALIDATION=true in environment (NOT RECOMMENDED for prod)
 */

"use client"

import { useState, useContext } from "react"
import { SideBarContext } from "@/components/sidebar"
import { authClient } from "@/lib/auth-client"
import { AnimatePresence, motion } from "motion/react"
import { Fingerprint, Lock, XIcon, Loader2 } from "lucide-react"
import { NotificationContext } from "@/components/notifications"
import { usePasskeySession } from "@/contexts/PasskeySessionContext"

interface AdminActionGuardProps {
    children: React.ReactNode
    onAction: () => void | Promise<void>
    bypass?: boolean
}

export default function AdminActionGuard({
    children,
    onAction,
    bypass = false,
}: AdminActionGuardProps) {
    const { userInfo } = useContext(SideBarContext)
    const { addNotification } = useContext(NotificationContext)
    const { isVerified, markVerified } = usePasskeySession()
    const [showModal, setShowModal] = useState(false)
    const [loading, setLoading] = useState(false)
    const [isVerifying, setIsVerifying] = useState(false)

    const handleInteraction = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        // Check conditions
        const isProduction = process.env.NODE_ENV === "production"
        const isAdmin = userInfo?.role === "admin"

        // Complex bypass logic with environment variable support
        const bypassAdminValidation = 
            bypass ||                                    // Explicit prop bypass
            !isProduction ||                            // Development mode
            !isAdmin ||                                 // Non-admin user
            process.env.NEXT_PUBLIC_BYPASS_ADMIN_VALIDATION === 'true'  // Explicit env flag

        if (bypassAdminValidation) {
            await onAction()
            return
        }

        // If already verified in this session, skip verification
        if (isVerified) {
            await onAction()
            return
        }

        if (isVerifying) return

        setShowModal(true)
    }

    const verifyPasskey = async () => {
        setIsVerifying(true)
        setLoading(true)
        try {
            // Re-authenticate with passkey
            const result = await authClient.signIn.passkey({
                autoFill: false,
            })

            if (result.error) {
                if (result.error.message?.includes("User not found") || result.error.message?.includes("not found")) {
                    addNotification(
                        "Passkeys are required for this action. Please set up a passkey first in your profile settings.",
                        "ERROR"
                    )
                } else {
                    addNotification(
                        result.error.message || "Verification failed",
                        "ERROR"
                    )
                }
            } else {
                addNotification("Identity verified", "SUCCESS")
                setShowModal(false)
                markVerified()
                // Small delay to allow modal to close before action
                setTimeout(async () => {
                    await onAction()
                }, 300)
            }
        } catch (err) {
            console.error(err)
            addNotification("An error occurred during verification", "ERROR")
        } finally {
            setLoading(false)
            setIsVerifying(false)
        }
    }

    return (
        <>
            <span onClick={handleInteraction} className='contents'>
                {children}
            </span>
            <AnimatePresence>
                {showModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className='fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'
                        onClick={() => setShowModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className='bg-black/90 border-2 border-white/10 rounded-xl w-full max-w-md overflow-hidden shadow-2xl'
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className='p-4 border-b border-white/10 flex justify-between items-center bg-white/5'>
                                <div className='flex items-center gap-2 text-red-400'>
                                    <Lock className='w-5 h-5' />
                                    <h2 className='text-lg font-semibold text-white'>
                                        Admin Verification
                                    </h2>
                                </div>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className='p-1 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white'
                                >
                                    <XIcon size={20} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className='p-6 flex flex-col items-center text-center gap-4'>
                                <div className='w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 mb-2'>
                                    <Fingerprint className='w-8 h-8' />
                                </div>
                                <div>
                                    <p className='text-white font-medium text-lg'>
                                        Passkey Required
                                    </p>
                                    <p className='text-white/60 text-sm mt-1'>
                                        This is a protected admin action. Please
                                        verify your identity using your passkey to
                                        proceed.
                                    </p>
                                </div>

                                <button
                                    onClick={verifyPasskey}
                                    disabled={loading}
                                    className='w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 mt-2 shadow-lg shadow-blue-500/20'
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className='w-5 h-5 animate-spin' />
                                            Verifying...
                                        </>
                                    ) : (
                                        <>
                                            <Fingerprint className='w-5 h-5' />
                                            Verify Identity
                                        </>
                                    )}
                                </button>

                                <button
                                    onClick={() => setShowModal(false)}
                                    className='text-sm text-white/40 hover:text-white/60 transition-colors'
                                >
                                    Cancel Action
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
