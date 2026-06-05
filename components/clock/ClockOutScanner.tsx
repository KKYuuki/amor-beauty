"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Camera, CheckCircle, XCircle, Loader2, X } from "lucide-react"
import { Html5Qrcode } from "html5-qrcode"
import { Button } from "@/components/ui/button"
import PasskeyVerification from "@/components/auth/PasskeyVerification"
import PasskeyOnboarding from "@/components/auth/PasskeyOnboarding"
import { usePasskeyStatus } from "@/hooks/usePasskeyStatus"
import { usePasskeySession } from "@/contexts/PasskeySessionContext"
import { createLogs } from "@/server/actions/logs"

const SUCCESS_REDIRECT_DELAY_MS = 1500

interface ClockOutScannerProps {
    staffId: string
    onSuccess: () => void
    onCancel: () => void
}

export default function ClockOutScanner({ staffId, onSuccess, onCancel }: ClockOutScannerProps) {
    const [isScanning, setIsScanning] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [cameraError, setCameraError] = useState<string | null>(null)
    const [showVerification, setShowVerification] = useState(false)
    const [showPasskeySetup, setShowPasskeySetup] = useState(false)
    const [pendingQrCode, setPendingQrCode] = useState<string | null>(null)
    const [pendingCheck, setPendingCheck] = useState(false)
    const [isVerifying, setIsVerifying] = useState(false)
    const scannerRef = useRef<Html5Qrcode | null>(null)
    const scannerContainerId = useRef(`qr-reader-out-${Math.random().toString(36).substr(2, 9)}`).current
    const isStartingRef = useRef(false)

    const { hasPasskeys, isLoading: passkeysLoading } = usePasskeyStatus()
    const { isVerified, markVerified } = usePasskeySession()

    // Refs to avoid dependency issues in callbacks
    const staffIdRef = useRef(staffId)
    const onSuccessRef = useRef(onSuccess)
    const isLoadingRef = useRef(isLoading)

    // Keep refs in sync with props/state
    useEffect(() => {
        staffIdRef.current = staffId
    }, [staffId])

    useEffect(() => {
        onSuccessRef.current = onSuccess
    }, [onSuccess])

    useEffect(() => {
        isLoadingRef.current = isLoading
    }, [isLoading])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                scannerRef.current.stop().catch(() => {
                    // Ignore stop errors on unmount
                })
            }
        }
    }, [])

    const isVerifyingRef = useRef(isVerifying)

    useEffect(() => {
        isVerifyingRef.current = isVerifying
    }, [isVerifying])

    const verificationInProgressRef = useRef(false)

    const handleVerified = async (verificationMethod: 'passkey' | 'session_cache' = 'passkey') => {
        if (verificationInProgressRef.current || !pendingQrCode) return

        verificationInProgressRef.current = true
        setIsVerifying(false)
        setShowVerification(false)
        setShowPasskeySetup(false)
        markVerified()
        setIsLoading(true)
        setError(null)

        try {
            const { clockOutWithQR } = await import("@/server/actions/time-clock")
            const result = await clockOutWithQR(staffIdRef.current, pendingQrCode, undefined, verificationMethod)

            if (!result.success) {
                setError(result.error)
                setIsLoading(false)
                verificationInProgressRef.current = false
                return
            }

            setSuccess(true)
            setPendingQrCode(null)
            setIsLoading(false)
            verificationInProgressRef.current = false

            setTimeout(() => {
                onSuccessRef.current()
            }, SUCCESS_REDIRECT_DELAY_MS)
        } catch {
            createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: 'Clock out failed' }] })
            setError("Failed to process clock out. Please try again.")
            setIsLoading(false)
            verificationInProgressRef.current = false
        }
    }

    const handleScanSuccess = useCallback(async (decodedText: string) => {
        if (isLoadingRef.current || isVerifyingRef.current || pendingQrCode) return

        await stopScanner()

        setPendingQrCode(decodedText)
        setIsVerifying(true)

        if (passkeysLoading) {
            setPendingCheck(true)
            return
        }

        if (hasPasskeys) {
            if (isVerified) {
                await handleVerified('session_cache')
                return
            }
            setShowVerification(true)
        } else {
            setShowPasskeySetup(true)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasPasskeys, passkeysLoading, pendingQrCode, isVerified])

    useEffect(() => {
        if (!passkeysLoading && pendingCheck && pendingQrCode) {
            setPendingCheck(false)
            if (hasPasskeys) {
                if (isVerified) {
                    handleVerified('session_cache')
                } else {
                    setShowVerification(true)
                }
            } else {
                setShowPasskeySetup(true)
            }
            stopScanner()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [passkeysLoading, pendingCheck, pendingQrCode, hasPasskeys, isVerified])

    const handleScanError = useCallback((errorMessage: string) => {
        if (errorMessage && !errorMessage.includes("No QR code found")) {
            createLogs({ logs: [{ level: 'WARN', type: 'PAYROLL', message: `Scan error: ${errorMessage}` }] })
        }
    }, [])

    const checkCameraPermissions = async (): Promise<boolean> => {
        try {
            // Check if mediaDevices API is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setCameraError("Camera API not supported in this browser")
                return false
            }

            // Try to get permission
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "environment",
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            })

            // Stop the stream immediately after checking permission
            stream.getTracks().forEach(track => track.stop())
            return true
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Camera permission error: ${errorMsg}` }] })

            if (errorMsg.includes("Permission denied") || errorMsg.includes("NotAllowedError")) {
                setCameraError("Camera permission denied. Please allow camera access in your browser settings.")
            } else if (errorMsg.includes("NotFoundError") || errorMsg.includes("DevicesNotFoundError")) {
                setCameraError("No camera found. Please ensure your device has a camera.")
            } else if (errorMsg.includes("NotReadableError") || errorMsg.includes("TrackStartError")) {
                setCameraError("Camera is in use by another application. Please close other apps using the camera.")
            } else {
                setCameraError(`Camera access error: ${errorMsg}`)
            }
            return false
        }
    }

    const startScanner = useCallback(async () => {
        // Prevent double-start
        if (isStartingRef.current) {
            return
        }

        isStartingRef.current = true
        setError(null)
        setCameraError(null)

        try {
            // Check permissions first
            const hasPermission = await checkCameraPermissions()
            if (!hasPermission) {
                setIsScanning(false)
                isStartingRef.current = false
                return
            }

            setIsScanning(true)

            // Wait for the DOM element to be ready
            await new Promise(resolve => setTimeout(resolve, 100))

            const element = document.getElementById(scannerContainerId)
            if (!element) {
                throw new Error("Scanner container element not found")
            }

            // Create scanner instance
            scannerRef.current = new Html5Qrcode(scannerContainerId)

            // Try with environment camera first, then fallback to any camera
            const cameraConfig = {
                facingMode: "environment"
            }

            try {
                await scannerRef.current.start(
                    cameraConfig,
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0,
                    },
                    handleScanSuccess,
                    handleScanError
                )
            } catch (envError) {
                const envErrorMsg = envError instanceof Error ? envError.message : String(envError)
                createLogs({ logs: [{ level: 'WARN', type: 'PAYROLL', message: `Environment camera failed, trying any camera: ${envErrorMsg}` }] })
                // Fallback to any available camera
                await scannerRef.current.start(
                    { facingMode: "user" },
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0,
                    },
                    handleScanSuccess,
                    handleScanError
                )
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Failed to start scanner: ${errorMsg}` }] })

            if (errorMsg.includes("Permission denied")) {
                setError("Camera permission denied. Please allow camera access and try again.")
            } else if (errorMsg.includes("not found")) {
                setError("Camera not found. Please ensure your device has a camera.")
            } else if (errorMsg.includes("in use") || errorMsg.includes("busy")) {
                setError("Camera is in use by another application.")
            } else {
                setError(`Failed to start camera: ${errorMsg}`)
            }

            setIsScanning(false)
        } finally {
            isStartingRef.current = false
        }
    }, [scannerContainerId, handleScanSuccess, handleScanError])

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop()
            } catch {
                // Ignore stop errors
            }
            scannerRef.current = null
        }
        setIsScanning(false)
        isStartingRef.current = false
    }

    const handleCancel = async () => {
        await stopScanner()
        onCancel()
    }

    if (success) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 p-8 bg-white/5 border border-white/10 rounded-lg">
                <CheckCircle className="w-16 h-16 text-green-500" />
                <p className="text-lg font-medium text-white">Successfully Clocked Out!</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4 p-6 bg-white/5 border border-white/10 rounded-lg min-w-[320px] max-w-md">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">Clock Out Scanner</h3>
                <button
                    onClick={handleCancel}
                    className="p-2 hover:bg-white/10 rounded-md transition-colors"
                    aria-label="Cancel"
                >
                    <X className="w-5 h-5 text-white/70" />
                </button>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center gap-4 py-12">
                    <div className="p-4 bg-white/5 rounded-full">
                        <Loader2 className="w-12 h-12 text-white/70 animate-spin" />
                    </div>
                    <p className="text-sm text-white/60 text-center">
                        Processing clock out...
                    </p>
                </div>
            ) : !isScanning ? (
                <div className="flex flex-col items-center gap-4 py-8">
                    <div className="p-4 bg-white/5 rounded-full">
                        <Camera className="w-12 h-12 text-white/70" />
                    </div>
                    <p className="text-sm text-white/60 text-center">
                        Scan the studio QR code to clock out
                    </p>
                    {cameraError && (
                        <div className="flex items-center gap-2 p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-md max-w-full">
                            <XCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                            <p className="text-sm text-yellow-200">{cameraError}</p>
                        </div>
                    )}
                    <Button onClick={startScanner} size="lg" disabled={isStartingRef.current}>
                        {isStartingRef.current ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Starting...
                            </>
                        ) : (
                            "Start Scanner"
                        )}
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    <div
                        id={scannerContainerId}
                        className="w-full aspect-square bg-black rounded-lg overflow-hidden relative [&_video]:!w-full [&_video]:!h-full [&_video]:object-cover"
                    />
                    <Button
                        onClick={stopScanner}
                        variant="outline"
                        size="sm"
                        className="w-full"
                    >
                        Stop Scanner
                    </Button>
                </div>
            )}

            {error && (
                <div className="flex flex-col gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-md">
                    <div className="flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-200">{error}</p>
                    </div>
                </div>
            )}

            <div className="text-xs text-white/40 text-center">
                Make sure you have granted camera permissions to this site
            </div>

            <PasskeyVerification
                isOpen={showVerification}
                onClose={() => {
                    setShowVerification(false)
                    setIsVerifying(false)
                    setPendingQrCode(null)
                }}
                onVerified={() => handleVerified('passkey')}
                title="Verify Clock Out"
                description="Please verify your identity to clock out."
            />

            <PasskeyOnboarding
                isOpen={showPasskeySetup}
                onClose={() => {
                    setShowPasskeySetup(false)
                    setIsVerifying(false)
                    setPendingQrCode(null)
                }}
                onComplete={() => {
                    setShowPasskeySetup(false)
                    setIsVerifying(false)
                    setShowVerification(true)
                }}
                showSkip={false}
            />

            {isVerifying && !isLoading && pendingQrCode && (
                <div className="flex items-center justify-center gap-2 text-white/70 py-4">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Verifying identity...</span>
                </div>
            )}
        </div>
    )
}
