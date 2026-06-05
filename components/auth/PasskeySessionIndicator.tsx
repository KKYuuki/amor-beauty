'use client'

import { useState, useEffect } from "react"
import { ShieldCheck, Clock } from "lucide-react"
import { usePasskeySession } from "@/contexts/PasskeySessionContext"

export default function PasskeySessionIndicator() {
    const { isVerified, remainingTime } = usePasskeySession()
    const [displayTime, setDisplayTime] = useState<string | null>(null)

    useEffect(() => {
        if (!isVerified || !remainingTime) {
            setDisplayTime(null)
            return
        }

        const updateDisplay = () => {
            const remaining = remainingTime
            if (remaining <= 0) {
                setDisplayTime(null)
                return
            }
            const minutes = Math.floor(remaining / 60000)
            setDisplayTime(`${minutes}m`)
        }

        updateDisplay()
        const interval = setInterval(updateDisplay, 30000)
        return () => clearInterval(interval)
    }, [isVerified, remainingTime])

    if (!isVerified) return null

    return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 border border-green-500/20 text-green-400 text-xs">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verified</span>
            {displayTime && (
                <>
                    <Clock className="w-3 h-3 ml-0.5" />
                    <span>{displayTime}</span>
                </>
            )}
        </div>
    )
}
