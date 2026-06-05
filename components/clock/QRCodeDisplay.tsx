"use client"

import { useState, useEffect, useCallback } from "react"
import { Building2, Clock, Loader2, RefreshCw, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBranchContext } from "@/components/branch-context"
import { generateQRCode } from "@/server/actions/time-clock"
import { ActionResponse } from "@/utils/types/responses"

interface QRCodeDisplayProps {
    onRefresh?: () => void
}

interface QRCodeData {
    qrCode: string
    qrDataUrl: string
    branchName: string
    branchCode: string
    validUntil: string
    isSingleUse: boolean
}

export default function QRCodeDisplay({ onRefresh }: QRCodeDisplayProps) {
    const { currentBranch } = useBranchContext()
    const [isSingleUse, setIsSingleUse] = useState(true)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [qrData, setQrData] = useState<QRCodeData | null>(null)
    const [validityTime, setValidityTime] = useState<string>("")

    const branchId = currentBranch?.id ?? null

    const generateQR = useCallback(async () => {
        if (!branchId) {
            setError("Please select a branch first")
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            const result: ActionResponse<QRCodeData> = await generateQRCode(branchId, isSingleUse)

            if (!result.success) {
                setError(result.error)
                setQrData(null)
                return
            }

            setQrData(result.data)
            updateValidityTime(result.data.validUntil)
            onRefresh?.()
        } catch (_err) {
            setError("Failed to generate QR code. Please try again.")
            setQrData(null)
        } finally {
            setIsLoading(false)
        }
    }, [branchId, isSingleUse, onRefresh])

    const updateValidityTime = (validUntil: string) => {
        const date = new Date(validUntil)
        const hours = date.getHours().toString().padStart(2, "0")
        const minutes = date.getMinutes().toString().padStart(2, "0")
        setValidityTime(`${hours}:${minutes}`)
    }

    // Auto-refresh validity time every minute
    useEffect(() => {
        if (!qrData) return

        const interval = setInterval(() => {
            updateValidityTime(qrData.validUntil)
        }, 60000)

        return () => clearInterval(interval)
    }, [qrData])

    return (
        <div className="flex flex-col gap-6 p-6 bg-zinc-900 border border-zinc-800 rounded-lg">
            <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-white">Time Clock QR Code</h2>
            </div>

            {!currentBranch ? (
                <div className='bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-center'>
                    <p className='text-amber-300 text-sm'>
                        Select a branch from the sidebar to generate QR codes
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between py-3 px-4 bg-white/5 rounded-lg">
                        <div>
                            <p className="text-sm font-medium text-white">
                                Current branch: {currentBranch.name}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between py-3 px-4 bg-white/5 rounded-lg">
                        <div>
                            <p className="text-sm font-medium text-white">Single-use QR code</p>
                            <p className="text-xs text-white/40">Invalidates after one scan for added security</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={isSingleUse}
                            onClick={() => setIsSingleUse(!isSingleUse)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isSingleUse ? 'bg-blue-500' : 'bg-white/20'}`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isSingleUse ? 'translate-x-6' : 'translate-x-1'}`}
                            />
                        </button>
                    </div>

                    <Button
                        onClick={generateQR}
                        disabled={isLoading || !branchId}
                        className="w-full"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="w-4 h-4" />
                                Generate QR Code
                            </>
                        )}
                    </Button>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-md">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-300">{error}</p>
                </div>
            )}

            {qrData && !error && (
                <div className="flex flex-col items-center gap-4 p-6 bg-zinc-950 border border-zinc-800 rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={qrData.qrDataUrl}
                        alt={`QR Code for ${qrData.branchName}`}
                        className="w-48 h-48 rounded-lg"
                    />

                    <div className="text-center space-y-2">
                        <div className="flex items-center justify-center gap-2 text-white">
                            <Building2 className="w-4 h-4 text-zinc-400" />
                            <span className="font-medium">{qrData.branchName}</span>
                        </div>
                        <p className="text-sm text-zinc-500">
                            Code: {qrData.branchCode}
                        </p>
                        <div className="flex items-center justify-center gap-2 text-sm text-amber-400">
                            <Clock className="w-4 h-4" />
                            <span>Valid until {validityTime}</span>
                        </div>
                        {qrData.isSingleUse && (
                            <div className="flex items-center justify-center gap-2 text-sm text-amber-400 mt-2">
                                <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-xs font-medium">
                                    Single-Use
                                </span>
                                <span>Expires after one scan</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!qrData && !error && !isLoading && (
                <div className="flex flex-col items-center justify-center gap-4 py-8 text-zinc-500">
                    <div className="p-4 bg-zinc-800 rounded-full">
                        <Clock className="w-8 h-8" />
                    </div>
                    <p className="text-sm text-center">
                        Select a branch and generate a QR code<br />
                        for staff to clock in
                    </p>
                </div>
            )}
        </div>
    )
}
