# Clock QR & Passkey Session Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Require QR scanning for both clock-in and clock-out, add single-use QR toggle for security, auto-trigger passkey verification for speed, and implement page-session-based passkey caching with 15-minute TTL to avoid repeated verifications.

**Architecture:** Three interconnected features: (1) QR-based clock-out using the same studio QR code with a single-use toggle option, (2) auto-triggering passkey verification that invokes WebAuthn immediately without manual button click, and (3) a PasskeySessionProvider context that caches verification state for 15 minutes per page session so multiple actions on the same page don't require re-verification.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Better Auth (passkey plugin), WebAuthn API, Drizzle ORM, PostgreSQL

---

## Feature 1: QR-Based Clock-Out & Single-Use QR Toggle

### Current State Analysis
- Clock-in: Scan QR → Passkey Verify → Clock In (already requires QR)
- Clock-out: Click button → Passkey Verify → Clock Out (NO QR required)
- QR codes are daily-per-branch, reusable until midnight
- No option for single-use (one-time) QR codes

### Target State
- Clock-in: Scan QR → Auto Passkey Verify → Clock In
- Clock-out: Scan QR → Auto Passkey Verify → Clock Out (same QR, same flow)
- Admin toggle for single-use QR codes that invalidate after one scan
- `ClockOutScanner` component mirroring `ClockInScanner` UX

---

### Task 1.1: Add Single-Use QR Fields to Database Schema

**Files:**
- Modify: `server/db/schema/timeclock.ts`

**Step 1: Add `isSingleUse` and `timesUsed` columns to `qrSessions` table**

```typescript
// In server/db/schema/timeclock.ts, update qrSessions table:
export const qrSessions = pgTable('qr_sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => sql`now()`),

    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    validDate: timestamp('valid_date').notNull(),
    qrCode: text('qr_code').notNull().unique(),
    isActive: boolean('is_active').default(true).notNull(),

    // Single-use QR support
    isSingleUse: boolean('is_single_use').default(false).notNull(),
    timesUsed: integer('times_used').default(0).notNull(),

    generatedBy: text('generated_by').references(() => user.id, { onDelete: 'set null' }),
}, (table) => ({
    branchDateIdx: index('idx_qr_sessions_branch_date').on(table.branchId, table.validDate),
    qrCodeIdx: index('idx_qr_sessions_qr_code').on(table.qrCode),
}))
```

**Step 2: Run database migration**

```bash
bunx drizzle-kit generate
bunx drizzle-kit push
```

**Step 3: Commit**

```bash
git add server/db/schema/timeclock.ts
git commit -m "feat(time-clock): add single-use QR fields to schema"
```

---

### Task 1.2: Update QR Code Generation to Support Single-Use Toggle

**Files:**
- Modify: `server/utils/qr-code.ts`
- Modify: `server/actions/time-clock.ts`

**Step 1: Update `generateDailyQRCode` to accept `isSingleUse` parameter**

In `server/utils/qr-code.ts`, change the function signature:

```typescript
export async function generateDailyQRCode(
    branchId: string,
    generatedBy: string,
    isSingleUse: boolean = false
): Promise<GenerateQRCodeResult> {
```

In the existing session check block, also check `isSingleUse` — if the existing QR is single-use and has been used, generate a new one:

```typescript
// If exists and active, check if single-use was already consumed
if (existingSessions.length > 0 && existingSessions[0].isActive) {
    const existing = existingSessions[0]

    if (existing.isSingleUse && existing.timesUsed > 0) {
        // Single-use QR already consumed, generate new one for single-use
        // (or return expiry error for non-single-use flow)
    } else {
        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `Retrieved existing QR code for branch ${branchId.slice(0, 8)}... on ${today.toISOString().split('T')[0]}`,
                user_id: generatedBy,
            }]
        })

        return {
            qrCode: existing.qrCode,
            validUntil: end,
        }
    }
}
```

Update the insert to include `isSingleUse`:

```typescript
const [newSession] = await db
    .insert(qrSessions)
    .values({
        branchId,
        validDate: today,
        qrCode: qrCodeString,
        isActive: true,
        isSingleUse,
        timesUsed: 0,
        generatedBy,
    })
    .returning()
```

**Step 2: Add `incrementQRUsage` function**

```typescript
export async function incrementQRUsage(qrCode: string): Promise<boolean> {
    try {
        const [session] = await db
            .select()
            .from(qrSessions)
            .where(eq(qrSessions.qrCode, qrCode))
            .limit(1)

        if (!session) return false

        if (session.isSingleUse) {
            await db
                .update(qrSessions)
                .set({ isActive: false, timesUsed: sql`${qrSessions.timesUsed} + 1` })
                .where(eq(qrSessions.qrCode, qrCode))
        } else {
            await db
                .update(qrSessions)
                .set({ timesUsed: sql`${qrSessions.timesUsed} + 1` })
                .where(eq(qrSessions.qrCode, qrCode))
        }

        return true
    } catch (error) {
        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'SYSTEM',
                message: `Failed to increment QR usage: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return false
    }
}
```

**Step 3: Update `generateQRCode` action to pass `isSingleUse`**

In `server/actions/time-clock.ts`, update the `GenerateQRCodeResult` interface and `generateQRCode` action:

```typescript
export interface GenerateQRCodeResult {
    qrCode: string
    qrDataUrl: string
    validUntil: string
    branchName: string
    branchCode: string
    isSingleUse: boolean
}

export async function generateQRCode(
    branchId: string,
    isSingleUse: boolean = false
): Promise<ActionResponse<GenerateQRCodeResult>> {
```

Update the call to `generateDailyQRCode`:

```typescript
const qrResult = await generateDailyQRCode(branchId, currentUser.id, isSingleUse)
```

Update the return to include `isSingleUse`:

```typescript
return success({
    qrCode: qrResult.qrCode,
    qrDataUrl,
    validUntil: qrResult.validUntil.toISOString(),
    branchName: branch.name,
    branchCode: branch.code,
    isSingleUse: qrResult.isSingleUse ?? isSingleUse,
})
```

**Step 4: Update `verifyQRCode` to check single-use consumption**

In `server/utils/qr-code.ts`, update `verifyQRCode`:

```typescript
// After checking isActive, add:
if (session.isSingleUse && session.timesUsed > 0) {
    return {
        valid: false,
        error: "This QR code has already been used. Please scan a new one.",
    }
}
```

**Step 5: Update `clockInWithQR` to increment QR usage**

In `server/actions/time-clock.ts`, add `incrementQRUsage` import and call it after successful clock-in:

```typescript
import { verifyQRCode, generateDailyQRCode, incrementQRUsage } from "@/server/utils/qr-code"

// After successful clock-in insertion:
await incrementQRUsage(qrCode)
```

**Step 6: Commit**

```bash
git add server/utils/qr-code.ts server/actions/time-clock.ts
git commit -m "feat(time-clock): add single-use QR support to generation and verification"
```

---

### Task 1.3: Create ClockOutScanner Component

**Files:**
- Create: `components/clock/ClockOutScanner.tsx`

**Step 1: Create the component**

Create `components/clock/ClockOutScanner.tsx` modeled after `ClockInScanner.tsx` but for clock-out:

```tsx
"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Camera, CheckCircle, XCircle, Loader2, X } from "lucide-react"
import { Html5Qrcode } from "html5-qrcode"
import { Button } from "@/components/ui/button"
import { usePasskeySession } from "@/contexts/PasskeySessionContext"
import { usePasskeyStatus } from "@/hooks/usePasskeyStatus"
import PasskeyVerification from "@/components/auth/PasskeyVerification"
import PasskeyOnboarding from "@/components/auth/PasskeyOnboarding"
import { createLogs } from "@/server/actions/logs"

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
    const { isVerified, verify: passkeyVerify, isVerifying: sessionVerifying } = usePasskeySession()

    const staffIdRef = useRef(staffId)
    const onSuccessRef = useRef(onSuccess)
    const isLoadingRef = useRef(isLoading)

    useEffect(() => {
        staffIdRef.current = staffId
    }, [staffId])

    useEffect(() => {
        onSuccessRef.current = onSuccess
    }, [onSuccess])

    useEffect(() => {
        isLoadingRef.current = isLoading
    }, [isLoading])

    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                scannerRef.current.stop().catch(() => {})
            }
        }
    }, [])

    const isVerifyingRef = useRef(isVerifying)
    useEffect(() => {
        isVerifyingRef.current = isVerifying
    }, [isVerifying])

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
                await handleVerified()
            } else {
                setShowVerification(true)
            }
        } else {
            setShowPasskeySetup(true)
        }
    }, [hasPasskeys, passkeysLoading, pendingQrCode, isVerified])

    useEffect(() => {
        if (!passkeysLoading && pendingCheck && pendingQrCode) {
            setPendingCheck(false)
            if (hasPasskeys) {
                if (isVerified) {
                    handleVerified()
                } else {
                    setShowVerification(true)
                }
            } else {
                setShowPasskeySetup(true)
            }
            stopScanner()
        }
    }, [passkeysLoading, pendingCheck, pendingQrCode, hasPasskeys, isVerified])

    const verificationInProgressRef = useRef(false)

    const handleVerified = async () => {
        if (verificationInProgressRef.current || !pendingQrCode) return

        verificationInProgressRef.current = true
        setIsVerifying(false)
        setShowVerification(false)
        setShowPasskeySetup(false)
        setIsLoading(true)
        setError(null)

        try {
            const { clockOutWithQR } = await import("@/server/actions/time-clock")
            const result = await clockOutWithQR(staffIdRef.current, pendingQrCode)

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
            }, 1500)
        } catch {
            createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: 'Clock out with QR failed' }] })
            setError("Failed to process clock out. Please try again.")
            setIsLoading(false)
            verificationInProgressRef.current = false
        }
    }

    const handleScanError = useCallback((errorMessage: string) => {
        if (errorMessage && !errorMessage.includes("No QR code found")) {
            createLogs({ logs: [{ level: 'WARN', type: 'PAYROLL', message: `Scan error: ${errorMessage}` }] })
        }
    }, [])

    const checkCameraPermissions = async (): Promise<boolean> => {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setCameraError("Camera API not supported in this browser")
                return false
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
            })
            stream.getTracks().forEach(track => track.stop())
            return true
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Camera permission error: ${errorMsg}` }] })

            if (errorMsg.includes("Permission denied") || errorMsg.includes("NotAllowedError")) {
                setCameraError("Camera permission denied. Please allow camera access in your browser settings.")
            } else if (errorMsg.includes("NotFoundError") || errorMsg.includes("DevicesNotFoundError")) {
                setCameraError("No camera found. Please ensure your device has a camera.")
            } else {
                setCameraError(`Camera access error: ${errorMsg}`)
            }
            return false
        }
    }

    const startScanner = useCallback(async () => {
        if (isStartingRef.current) return

        isStartingRef.current = true
        setError(null)
        setCameraError(null)

        try {
            const hasPermission = await checkCameraPermissions()
            if (!hasPermission) {
                setIsScanning(false)
                isStartingRef.current = false
                return
            }

            setIsScanning(true)
            await new Promise(resolve => setTimeout(resolve, 100))

            const element = document.getElementById(scannerContainerId)
            if (!element) {
                throw new Error("Scanner container element not found")
            }

            scannerRef.current = new Html5Qrcode(scannerContainerId)

            try {
                await scannerRef.current.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
                    handleScanSuccess,
                    handleScanError
                )
            } catch (envError) {
                await scannerRef.current.start(
                    { facingMode: "user" },
                    { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
                    handleScanSuccess,
                    handleScanError
                )
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Failed to start scanner: ${errorMsg}` }] })
            setError(`Failed to start camera: ${errorMsg}`)
            setIsScanning(false)
        } finally {
            isStartingRef.current = false
        }
    }, [scannerContainerId, handleScanSuccess, handleScanError])

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop()
            } catch {}
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
                onVerified={handleVerified}
                title="Verify Clock Out"
                description="Please verify your identity to clock out."
                autoTrigger={true}
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
```

**Step 2: Commit**

```bash
git add components/clock/ClockOutScanner.tsx
git commit -m "feat(time-clock): add ClockOutScanner component with QR + passkey"
```

---

### Task 1.4: Add `clockOutWithQR` Server Action

**Files:**
- Modify: `server/actions/time-clock.ts`

**Step 1: Add the `clockOutWithQR` action**

Add after the existing `clockOut` function in `server/actions/time-clock.ts`:

```typescript
export interface ClockOutWithQRResult {
    entryId: string
    duration: string
    clockedOutAt: string
    branchName: string | null
}

export async function clockOutWithQR(
    staffId: string,
    qrCode: string,
    deviceInfo?: string
): Promise<ActionResponse<ClockOutWithQRResult>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        const isSelf = currentUser.id === staffId
        const hasAdminAccess = await isAdmin(currentUser)

        if (!isSelf && !hasAdminAccess) {
            return failure("Access denied: Can only clock yourself out")
        }

        // Verify QR code
        if (!qrCode.startsWith('CLK-')) {
            return failure("Invalid QR code format. Please scan a valid studio QR code.")
        }

        const qrVerification = await verifyQRCode(qrCode)
        if (!qrVerification.valid || !qrVerification.branchId) {
            await createLogs({
                logs: [{
                    level: 'WARN',
                    type: 'PAYROLL',
                    message: `Invalid QR code on clock-out attempt by staff ${staffId}: ${qrVerification.error}`,
                    user_id: currentUser.id,
                    branch_id: qrVerification.branchId ?? undefined,
                }]
            })
            return failure(qrVerification.error || "Invalid QR code. Please scan a valid studio QR code.")
        }

        // Find active entry
        const [activeEntry] = await db
            .select()
            .from(timeClockEntries)
            .where(
                and(
                    eq(timeClockEntries.staffId, staffId),
                    isNull(timeClockEntries.clockOut)
                )
            )
            .limit(1)

        if (!activeEntry) {
            return failure("Not clocked in. Please clock in first.")
        }

        const now = new Date()
        const duration = now.getTime() - activeEntry.clockIn.getTime()
        const branchId = qrVerification.branchId

        // Update active entry with clock_out time
        await db
            .update(timeClockEntries)
            .set({
                clockOut: now,
                clockOutDevice: deviceInfo || null,
                updatedAt: now,
            })
            .where(eq(timeClockEntries.id, activeEntry.id))

        // Increment QR usage (handles single-use invalidation)
        await incrementQRUsage(qrCode)

        // Get branch name
        const [branch] = await db
            .select({ name: branches.name })
            .from(branches)
            .where(eq(branches.id, branchId))
            .limit(1)

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Staff ${staffId} clocked out with QR at branch ${branch?.name || branchId} after ${formatDuration(duration)}`,
                user_id: currentUser.id,
                branch_id: branchId,
            }]
        })

        return success({
            entryId: activeEntry.id,
            duration: formatDuration(duration),
            clockedOutAt: now.toISOString(),
            branchName: branch?.name || null,
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await logError({
            type: 'PAYROLL',
            message: `Error clocking out with QR: ${errorMessage}`,
        })
        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'PAYROLL',
                message: `Failed to clock out staff ${staffId} with QR: ${errorMessage}`,
            }]
        })
        return failure(errorMessage || 'Failed to clock out with QR')
    }
}
```

**Step 2: Add `incrementQRUsage` import**

Update the import at the top of `server/actions/time-clock.ts`:

```typescript
import { verifyQRCode, generateDailyQRCode, incrementQRUsage } from "@/server/utils/qr-code"
```

And also add `incrementQRUsage` call in the `clockInWithQR` function, after creating the time clock entry (around line 280):

```typescript
// After the successful clock-in insertion and before the return:
await incrementQRUsage(qrCode)
```

**Step 3: Commit**

```bash
git add server/actions/time-clock.ts
git commit -m "feat(time-clock): add clockOutWithQR server action"
```

---

### Task 1.5: Update QRCodeDisplay Component with Single-Use Toggle

**Files:**
- Modify: `components/clock/QRCodeDisplay.tsx`

**Step 1: Add single-use toggle UI**

Add a toggle switch for single-use QR codes in the QRCodeDisplay component. After the BranchSelector and before the Generate button, add:

```tsx
const [isSingleUse, setIsSingleUse] = useState(false)
```

Update the `generateQR` callback to pass `isSingleUse`:

```tsx
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
```

Update the `QRCodeData` interface and add isSingleUse to the dependent list:

```typescript
interface QRCodeData {
    qrCode: string
    qrDataUrl: string
    branchName: string
    branchCode: string
    validUntil: string
    isSingleUse: boolean
}
```

Add the toggle UI between the BranchSelector and the Generate button:

```tsx
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
```

In the QR data display section, add a badge when single-use:

```tsx
{qrData.isSingleUse && (
    <div className="flex items-center justify-center gap-2 text-sm text-amber-400 mt-2">
        <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-xs font-medium">
                            Single-Use
                        </span>
                        <span>Expires after one scan</span>
                    </div>
                )}
```

**Step 2: Commit**

```bash
git add components/clock/QRCodeDisplay.tsx
git commit -m "feat(time-clock): add single-use QR toggle to QR code display"
```

---

### Task 1.6: Update ClockOutButton to Use QR Scanner

**Files:**
- Modify: `components/clock/ClockOutButton.tsx`

**Step 1: Refactor to use ClockOutScanner**

Replace the current implementation. Instead of a simple button + passkey verification, the ClockOutButton should now open a QR scanner modal for clock-out:

```tsx
"use client"

import { useState } from "react"
import { Clock, XCircle, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePasskeySession } from "@/contexts/PasskeySessionContext"
import PasskeyVerification from "@/components/auth/PasskeyVerification"
import PasskeyOnboarding from "@/components/auth/PasskeyOnboarding"
import { usePasskeyStatus } from "@/hooks/usePasskeyStatus"
import { ClockOutScanner } from "@/components/clock/ClockOutScanner"

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
    const [showScanner, setShowScanner] = useState(false)
    const [pendingCheck, setPendingCheck] = useState(false)

    const { hasPasskeys, isLoading: passkeysLoading } = usePasskeyStatus()
    const { isVerified, verify: passkeyVerify, isVerifying: sessionVerifying } = usePasskeySession()

    const handleClockOutClick = () => {
        if (useQR) {
            // QR mode: open scanner
            setShowScanner(true)
            return
        }

        // Non-QR mode: passkey verification then direct clock-out
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
    }, [passkeysLoading, pendingCheck, hasPasskeys, isVerified])

    const handleDirectClockOut = async () => {
        setShowVerification(false)
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

    const handleScannerSuccess = () => {
        setShowScanner(false)
        onClockOut()
    }

    return (
        <div className="flex flex-col gap-3">
            <Button
                onClick={handleClockOutClick}
                disabled={isLoading || !currentEntryId}
                loading={isLoading}
                size="lg"
                className="bg-orange-500/30 hover:bg-orange-500/50 border-2 border-white/10 text-white"
            >
                {useQR ? (
                    <>
                        <LogOut className="w-5 h-5" />
                        Clock Out
                    </>
                ) : (
                    <>
                        <Clock className="w-5 h-5" />
                        Clock Out
                    </>
                )}
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

            {/* QR Scanner Modal */}
            {showScanner && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <ClockOutScanner
                        staffId={staffId}
                        onSuccess={handleScannerSuccess}
                        onCancel={() => setShowScanner(false)}
                    />
                </div>
            )}

            {/* Non-QR mode passkey verification */}
            {!useQR && (
                <>
                    <PasskeyVerification
                        isOpen={showVerification}
                        onClose={() => setShowVerification(false)}
                        onVerified={handleDirectClockOut}
                        title="Verify Clock Out"
                        description="Please verify your identity to clock out."
                        autoTrigger={true}
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
                </>
            )}
        </div>
    )
}
```

**Step 2: Commit**

```bash
git add components/clock/ClockOutButton.tsx
git commit -m "feat(time-clock): update ClockOutButton with QR scanner integration"
```

---

### Task 1.7: Update Dashboard Widget and Time Clock Page for QR Clock-Out

**Files:**
- Modify: `components/dashboard/timeClockWidget.tsx`
- Modify: `app/time-clock/page.tsx`

**Step 1: Update timeClockWidget.tsx**

In `components/dashboard/timeClockWidget.tsx`, update the clock-out flow to use the QR scanner:

Add imports:
```typescript
import ClockOutScanner from "@/components/clock/ClockOutScanner"
```

Add state for scanner:
```typescript
const [showClockOutScanner, setShowClockOutScanner] = useState(false)
```

Replace `handleClockOutClick` to open scanner:
```typescript
const handleClockOutClick = () => {
    setShowClockOutScanner(true)
}
```

Add scanner success handler:
```typescript
const handleClockOutSuccess = () => {
    setShowClockOutScanner(false)
    addNotification("Successfully clocked out!", "SUCCESS")
    fetchStatus()
}
```

Remove the existing `PasskeyVerification` modal and `handleVerified` for clock-out (since QR scan handles verification).

Add the scanner modal in the JSX (replacing the PasskeyVerification for clock-out):
```tsx
{showClockOutScanner && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <ClockOutScanner
            staffId={staffId}
            onSuccess={handleClockOutSuccess}
            onCancel={() => setShowClockOutScanner(false)}
        />
    </div>
)}
```

Remove the PasskeyVerification component since clock-out now goes through QR scanner.

**Step 2: Update time-clock page.tsx**

In `app/time-clock/page.tsx`, update the ClockOutButton usage. Since ClockOutButton now handles QR internally when `useQR={true}`, no wrapper changes needed. The button component handles the scanner modal.

**Step 3: Commit**

```bash
git add components/dashboard/timeClockWidget.tsx app/time-clock/page.tsx
git commit -m "feat(time-clock): update dashboard and page for QR-based clock-out"
```

---

## Feature 2: Auto-Trigger Passkey Verification

### Current State Analysis
- `PasskeyVerification` shows a modal with a "Verify with Passkey" button
- User must click the button to trigger WebAuthn authentication
- This adds friction when passkey verification is required frequently

### Target State
- `PasskeyVerification` auto-triggers the WebAuthn dialog when it opens
- Falls back to manual button if auto-trigger fails or is cancelled
- Reduces interaction steps from 2 (open modal + click button) to 1 (auto-trigger)

---

### Task 2.1: Add Auto-Trigger to PasskeyVerification Component

**Files:**
- Modify: `components/auth/PasskeyVerification.tsx`

**Step 1: Add `autoTrigger` prop and auto-verification logic**

Update the component props interface:

```typescript
interface PasskeyVerificationProps {
    isOpen: boolean
    onClose: () => void
    onVerified: () => void
    title?: string
    description?: string
    autoTrigger?: boolean
}
```

Add auto-trigger effect inside the component:

```typescript
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

    // Auto-trigger passkey verification when modal opens
    useEffect(() => {
        if (isOpen && autoTrigger && !autoTriggered && !isLoading) {
            setAutoTriggered(true)
            // Small delay to allow the modal animation to complete
            const timer = setTimeout(() => {
                handlePasskeyVerify()
            }, 300)
            return () => clearTimeout(timer)
        }
    }, [isOpen, autoTrigger, autoTriggered, isLoading])
```

**Step 2: Commit**

```bash
git add components/auth/PasskeyVerification.tsx
git commit -m "feat(auth): add auto-trigger mode to PasskeyVerification"
```

---

## Feature 3: Page-Session-Based Passkey Caching

### Current State Analysis
- Every action requiring passkey verification triggers a new WebAuthn authentication
- If a user makes multiple changes on the same page (e.g., multiple admin actions), they must verify each time
- This creates significant friction for admin workflows

### Target State
- A `PasskeySessionProvider` context caches verification state
- Once verified, subsequent actions on the same page are pre-approved for 15 minutes
- Verification state is page-scoped and includes a TTL
- Components can check `isVerified` and call `verify()` which either resolves immediately or triggers verification

---

### Task 3.1: Create PasskeySessionContext

**Files:**
- Create: `contexts/PasskeySessionContext.tsx`

**Step 1: Create the context**

```tsx
'use client'

import React, { createContext, useContext, useState, useRef, useCallback } from 'react'

interface PasskeySessionContextValue {
    isVerified: boolean
    verifiedAt: number | null
    isVerifying: boolean
    verify: () => Promise<boolean>
    invalidate: () => void
    remainingTime: number | null
}

const PasskeySessionContext = createContext<PasskeySessionContextValue | undefined>(undefined)

const VERIFICATION_TTL_MS = 15 * 60 * 1000 // 15 minutes

export function PasskeySessionProvider({ children }: { children: React.ReactNode }) {
    const [isVerified, setIsVerified] = useState(false)
    const [verifiedAt, setVerifiedAt] = useState<number | null>(null)
    const [isVerifying, setIsVerifying] = useState(false)
    const verifyResolveRef = useRef<((value: boolean) => void) | null>(null)
    const verifyRejectRef = useRef<((reason?: unknown) => void) | null>(null)

    const checkTTL = useCallback(() => {
        if (!verifiedAt) return false
        return Date.now() - verifiedAt < VERIFICATION_TTL_MS
    }, [verifiedAt])

    const invalidate = useCallback(() => {
        setIsVerified(false)
        setVerifiedAt(null)
    }, [])

    const verify = useCallback(async (): Promise<boolean> => {
        // If already verified and within TTL, return true immediately
        if (isVerified && checkTTL()) {
            return true
        }

        // If TTL has expired, invalidate
        if (verifiedAt && !checkTTL()) {
            invalidate()
        }

        // If a verification is already in progress, wait for it
        if (isVerifying) {
            return new Promise<boolean>((resolve, reject) => {
                verifyResolveRef.current = resolve
                verifyRejectRef.current = reject
            })
        }

        // Need to trigger passkey verification - this will be handled
        // by the component that uses this context
        return false
    }, [isVerified, checkTTL, invalidate, isVerifying, verifiedAt])

    const markVerified = useCallback(() => {
        setIsVerified(true)
        setVerifiedAt(Date.now())

        // Resolve any pending promises
        if (verifyResolveRef.current) {
            verifyResolveRef.current(true)
            verifyResolveRef.current = null
            verifyRejectRef.current = null
        }
    }, [])

    const markVerificationFailed = useCallback(() => {
        // Reject any pending promises
        if (verifyRejectRef.current) {
            verifyRejectRef.current(new Error('Verification failed'))
            verifyResolveRef.current = null
            verifyRejectRef.current = null
        }
    }, [])

    // Expose markVerified and markVerificationFailed through a ref-based approach
    // Components will use onVerified callback to mark verification
    const remainingTime = verifiedAt ? Math.max(0, VERIFICATION_TTL_MS - (Date.now() - verifiedAt)) : null

    const value: PasskeySessionContextValue = {
        isVerified: isVerified && checkTTL(),
        verifiedAt,
        isVerifying,
        verify,
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

export { PasskeySessionContext }
```

**Step 2: Commit**

```bash
git add contexts/PasskeySessionContext.tsx
git commit -m "feat(auth): create PasskeySessionProvider with 15-minute TTL"
```

---

### Task 3.2: Create usePasskeySessionVerify Hook

**Files:**
- Create: `hooks/usePasskeySessionVerify.ts`

**Step 1: Create the hook that bridges PasskeySession and PasskeyVerification**

```typescript
'use client'

import { useState, useCallback, useContext } from 'react'
import { authClient } from '@/lib/auth-client'
import { usePasskeySession } from '@/contexts/PasskeySessionContext'
import { NotificationContext } from '@/components/notifications'

interface UsePasskeySessionVerifyResult {
    isVerified: boolean
    isVerifying: boolean
    verify: () => Promise<boolean>
    showVerification: boolean
    handleVerified: () => void
    handleClose: () => void
    error: string | null
}

export function usePasskeySessionVerify(): UsePasskeySessionVerifyResult {
    const { isVerified, invalidate } = usePasskeySession()
    const { addNotification } = useContext(NotificationContext)
    const [isVerifying, setIsVerifying] = useState(false)
    const [showVerification, setShowVerification] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const verify = useCallback(async (): Promise<boolean> => {
        // If already verified within TTL, return immediately
        if (isVerified) {
            return true
        }

        // Show the verification modal
        setShowVerification(true)
        return new Promise<boolean>((resolve) => {
            // The promise will be resolved by handleVerified or handleClose
            verifyResolveRef.current = resolve
        })
    }, [isVerified])

    const verifyResolveRef = { current: null as ((value: boolean) => void) | null }

    const handleVerified = useCallback(() => {
        setShowVerification(false)
        setIsVerifying(false)
        setError(null)
        addNotification('Identity verified', 'SUCCESS')

        // Mark as verified in session
        // This is handled by PasskeyVerification's onVerified callback
        // which will call our session's markVerified

        resolvePromise(true)
    }, [addNotification])

    const handleClose = useCallback(() => {
        setShowVerification(false)
        setIsVerifying(false)
        resolvePromise(false)
    }, [])

    const resolvePromise = (value: boolean) => {
        // This would need proper ref management in real implementation
    }

    return {
        isVerified,
        isVerifying,
        verify,
        showVerification,
        handleVerified,
        handleClose,
        error,
    }
}
```

Actually, let me simplify this. The hook approach needs proper ref management. Let me write a cleaner version:

```typescript
'use client'

import { useState, useContext, useCallback, useRef } from 'react'
import { usePasskeySession } from '@/contexts/PasskeySessionContext'
import { NotificationContext } from '@/components/notifications'

export function usePasskeySessionVerify() {
    const session = usePasskeySession()
    const { addNotification } = useContext(NotificationContext)
    const [showVerification, setShowVerification] = useState(false)
    const [isVerifying, setIsVerifying] = useState(false)
    const pendingResolveRef = useRef<((value: boolean) => void) | null>(null)

    const verify = useCallback(async (): Promise<boolean> => {
        if (session.isVerified) {
            return true
        }

        return new Promise<boolean>((resolve) => {
            pendingResolveRef.current = resolve
            setShowVerification(true)
        })
    }, [session.isVerified])

    const handleVerified = useCallback(() => {
        setShowVerification(false)
        setIsVerifying(false)
        addNotification('Identity verified', 'SUCCESS')

        // Update session
        session.markVerified()

        if (pendingResolveRef.current) {
            pendingResolveRef.current(true)
            pendingResolveRef.current = null
        }
    }, [addNotification, session])

    const handleClose = useCallback(() => {
        setShowVerification(false)
        setIsVerifying(false)

        if (pendingResolveRef.current) {
            pendingResolveRef.current(false)
            pendingResolveRef.current = null
        }
    }, [])

    return {
        isVerified: session.isVerified,
        isVerifying,
        showVerification,
        verify,
        handleVerified,
        handleClose,
        invalidate: session.invalidate,
    }
}
```

Wait, `markVerified` isn't exposed on the session context value. Let me restructure. The PasskeySessionContext needs to expose a way to mark verified. Let me fix this.

**Step 2: Commit**

```bash
git add hooks/usePasskeySessionVerify.ts
git commit -m "feat(auth): add usePasskeySessionVerify hook"
```

---

### Task 3.3: Update PasskeySessionContext to Expose Verification Methods

**Files:**
- Modify: `contexts/PasskeySessionContext.tsx`

**Step 1: Add `markVerified` to the context value**

Update the interface and provider:

```typescript
interface PasskeySessionContextValue {
    isVerified: boolean
    verifiedAt: number | null
    isVerifying: boolean
    verify: () => Promise<boolean>
    markVerified: () => void
    invalidate: () => void
    remainingTime: number | null
}
```

Add `markVerified` to the provider value:

```typescript
const value: PasskeySessionContextValue = {
    isVerified: isVerified && checkTTL(),
    verifiedAt,
    isVerifying,
    verify,
    markVerified,
    invalidate,
    remainingTime,
}
```

**Step 2: Commit**

```bash
git add contexts/PasskeySessionContext.tsx
git commit -m "feat(auth): expose markVerified in PasskeySessionContext"
```

---

### Task 3.4: Integrate PasskeySessionProvider into App

**Files:**
- Modify: `app/layout.tsx` or the root layout component that wraps authenticated routes

**Step 1: Add PasskeySessionProvider to the app layout**

Find where `PasskeyStatusProvider` is used and add `PasskeySessionProvider` alongside it:

```tsx
import { PasskeySessionProvider } from '@/contexts/PasskeySessionContext'

// In the layout component, wrap children:
<PasskeyStatusProvider>
    <PasskeySessionProvider>
        {children}
    </PasskeySessionProvider>
</PasskeyStatusProvider>
```

**Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(auth): integrate PasskeySessionProvider into app layout"
```

---

### Task 3.5: Update ClockInScanner to Use Passkey Session

**Files:**
- Modify: `components/clock/ClockInScanner.tsx`

**Step 1: Replace individual passkey state with session-based verification**

Update imports:
```typescript
import { usePasskeySession } from '@/contexts/PasskeySessionContext'
```

Remove `showVerification` and `showPasskeySetup` state management and replace with:

```typescript
const { isVerified, verify: sessionVerify, isVerifying: sessionVerifying } = usePasskeySession()
```

Update `handleScanSuccess` to check session first:

```typescript
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
        // If already verified in this session, skip verification
        if (isVerified) {
            await handleVerified()
            return
        }
        setShowVerification(true)
    } else {
        setShowPasskeySetup(true)
    }
}, [hasPasskeys, passkeysLoading, pendingQrCode, isVerified])
```

Update `handleVerified` to mark session as verified:

```typescript
const handleVerified = async () => {
    if (verificationInProgressRef.current || !pendingQrCode) return

    verificationInProgressRef.current = true
    setIsVerifying(false)
    setShowVerification(false)

    // Mark passkey session as verified
    passkeySession.markVerified()

    // ... rest of existing handleVerified logic
}
```

**Step 2: Commit**

```bash
git add components/clock/ClockInScanner.tsx
git commit -m "feat(time-clock): integrate passkey session into ClockInScanner"
```

---

### Task 3.6: Update ClockOutButton/Scanner to Use Passkey Session

**Files:**
- Modify: `components/clock/ClockOutScanner.tsx`
- Modify: `components/clock/ClockOutButton.tsx`

**Step 1: In ClockOutScanner, use PasskeySession**

Already included in Task 1.3 above (the ClockOutScanner already imports and uses `usePasskeySession`).

**Step 2: In ClockOutButton, use PasskeySession for non-QR mode**

Update `ClockOutButton` to import and use `usePasskeySession`:

```typescript
import { usePasskeySession } from '@/contexts/PasskeySessionContext'
```

In the component:
```typescript
const { isVerified, markVerified, invalidate } = usePasskeySession()
```

When passkey is verified and session is active, skip verification:

```typescript
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
```

When verified:
```typescript
const handleVerified = async () => {
    setShowVerification(false)
    markVerified()  // Mark session as verified
    setIsLoading(true)
    // ... rest of logic
}
```

**Step 3: Commit**

```bash
git add components/clock/ClockOutScanner.tsx components/clock/ClockOutButton.tsx
git commit -m "feat(time-clock): integrate passkey session into clock-out components"
```

---

### Task 3.7: Update AdminActionGuard to Use Passkey Session

**Files:**
- Modify: `components/admin/AdminActionGuard.tsx`

**Step 1: Add passkey session caching to AdminActionGuard**

Import and use `usePasskeySession`:

```typescript
import { usePasskeySession } from '@/contexts/PasskeySessionContext'
```

In the component:

```typescript
const { isVerified, markVerified, invalidate } = usePasskeySession()
```

Modify `handleInteraction` to check session first:

```typescript
const handleInteraction = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const isProduction = process.env.NODE_ENV === "production"
    const isAdmin = userInfo?.role === "admin"

    const bypassAdminValidation =
        bypass ||
        !isProduction ||
        !isAdmin ||
        process.env.NEXT_PUBLIC_BYPASS_ADMIN_VALIDATION === 'true'

    if (bypassAdminValidation) {
        await onAction()
        return
    }

    // If already verified in this session, skip verification
    if (isVerified) {
        await onAction()
        return
    }

    setShowModal(true)
}
```

When verification succeeds, mark the session:

```typescript
const verifyPasskey = async () => {
    setLoading(true)
    try {
        const result = await authClient.signIn.passkey({ autoFill: false })

        if (result.error) {
            // ... existing error handling
        } else {
            addNotification("Identity verified", "SUCCESS")
            setShowModal(false)
            markVerified()  // Mark session as verified

            setTimeout(async () => {
                await onAction()
            }, 300)
        }
    } catch (err) {
        console.error(err)
        addNotification("An error occurred during verification", "ERROR")
    } finally {
        setLoading(false)
    }
}
```

**Step 2: Commit**

```bash
git add components/admin/AdminActionGuard.tsx
git commit -m "feat(auth): integrate passkey session caching into AdminActionGuard"
```

---

## Feature 4: Additional Improvements & Suggestions

### Suggestions from Analysis

1. **QR Code Auto-Refresh**: The QRCodeDisplay auto-refreshes the validity time but doesn't auto-regenerate expired QR codes. Consider adding auto-regeneration when the QR code expires.

2. **Audit Trail Enhancement**: Log the verification method (passkey vs session cache) in the server actions for compliance.

3. **Rate Limiting**: Add client-side rate limiting to passkey verification attempts (3 attempts, then cooldown).

4. **Offline Indicator**: Show a visual indicator when passkey session is active (e.g., a small shield icon with "Verified for 12m" countdown).

---

### Task 4.1: Add Passkey Session Status Indicator

**Files:**
- Create: `components/auth/PasskeySessionIndicator.tsx`

**Step 1: Create a visual indicator for passkey session status**

```tsx
"use client"

import { useState, useEffect } from "react"
import { ShieldCheck, ShieldAlert, Clock } from "lucide-react"
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
        const interval = setInterval(updateDisplay, 30000) // Update every 30s
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
```

**Step 2: Commit**

```bash
git add components/auth/PasskeySessionIndicator.tsx
git commit -m "feat(auth): add passkey session status indicator"
```

---

### Task 4.2: Add Audit Logging for Verification Method

**Files:**
- Modify: `server/actions/time-clock.ts`

**Step 1: Add verification method tracking to clock-in and clock-out**

In `clockInWithQR`, add a parameter for `verificationMethod`:

```typescript
export async function clockInWithQR(
    staffId: string,
    qrCode: string,
    deviceInfo?: string,
    verificationMethod?: 'passkey' | 'session_cache'
): Promise<ActionResponse<ClockInWithQRResult>> {
```

Update the log to include verification method:

```typescript
await createLogs({
    logs: [{
        level: 'INFO',
        type: 'PAYROLL',
        message: `Staff ${staffId} clocked in at branch ${branch?.name || branchId} via QR (${verificationMethod || 'unknown'})`,
        user_id: currentUser.id,
        branch_id: branchId,
    }]
})
```

Similarly for `clockOutWithQR`:

```typescript
export async function clockOutWithQR(
    staffId: string,
    qrCode: string,
    deviceInfo?: string,
    verificationMethod?: 'passkey' | 'session_cache'
): Promise<ActionResponse<ClockOutWithQRResult>> {
```

**Step 2: Pass verification method from client components**

In `ClockInScanner`, when calling `handleVerified`, pass the method:

```typescript
// When verified via PasskeyVerification modal (fresh verification)
const result = await clockInWithQR(staffIdRef.current, pendingQrCode, undefined, 'passkey')

// When verified via session cache
const result = await clockInWithQR(staffIdRef.current, pendingQrCode, undefined, 'session_cache')
```

**Step 3: Commit**

```bash
git add server/actions/time-clock.ts components/clock/ClockInScanner.tsx components/clock/ClockOutScanner.tsx
git commit -m "feat(time-clock): add verification method audit logging"
```

---

### Task 4.3: Update QRCodeDisplay Types to Include isSingleUse

**Files:**
- Modify: `components/clock/QRCodeDisplay.tsx`

**Step 1: Ensure QRCodeData interface includes isSingleUse**

This was already covered in Task 1.5, but verify the import of `generateQRCode` action returns `isSingleUse`.

**Step 2: Commit**

Already committed in Task 1.5.

---

### Task 4.4: Add Passkey Verification Method to PasskeyVerification

**Files:**
- Modify: `components/auth/PasskeyVerification.tsx`

**Step 1: Add `onVerificationMethod` callback**

Add an optional callback prop so the parent knows whether verification was fresh or cached:

```typescript
interface PasskeyVerificationProps {
    isOpen: boolean
    onClose: () => void
    onVerified: () => void
    title?: string
    description?: string
    autoTrigger?: boolean
}
```

The `onVerified` callback is called when passkey verification succeeds. The parent component can determine if it was a session cache (by checking `usePasskeySession().isVerified` before showing the modal) or a fresh verification.

No changes needed — the parent components already check `isVerified` before showing the modal.

**Step 2: No additional changes needed.**

---

### Task 4.5: Add Exhaustive Type Checking for QR Code Operations

**Files:**
- Modify: `server/utils/qr-code.ts`

**Step 1: Add `isSingleUse` field to `GenerateQRCodeResult`**

```typescript
export interface GenerateQRCodeResult {
    qrCode: string
    validUntil: Date
    qrImageUrl?: string
    isSingleUse: boolean
}
```

Update `generateDailyQRCode` to return `isSingleUse`:

```typescript
return {
    qrCode: existing.qrCode,
    validUntil: end,
    isSingleUse: existing.isSingleUse,
}
```

And in the new session path:

```typescript
return {
    qrCode: newSession.qrCode,
    validUntil: end,
    isSingleUse: newSession.isSingleUse,
}
```

**Step 2: Commit**

```bash
git add server/utils/qr-code.ts
git commit -m "feat(time-clock): add isSingleUse to QR generation result type"
```

---

## Final Verification

### Task 5.1: Run Lint and Build Checks

**Step 1: Run ESLint**

```bash
bun run lint
```

Expected: No errors. Fix any warnings related to the new code.

**Step 2: Run TypeScript type check**

```bash
bunx tsc --noEmit
```

Expected: No type errors.

**Step 3: Run production build**

```bash
bun run build
```

Expected: Build completes without errors.

**Step 4: Fix any lint/build errors**

If errors are found, fix them iteratively:

1. Fix lint errors first
2. Fix type errors
3. Re-run build

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve lint and build errors"
```

---

### Task 5.2: End-to-End Manual Testing Checklist

**QR-Based Clock-Out:**

1. Generate a QR code for a branch
2. Clock in by scanning the QR code
3. Click "Clock Out" — verify QR scanner appears
4. Scan the same QR code
5. Verify passkey dialog auto-triggers
6. Complete verification
7. Verify clock-out succeeds

**Single-Use QR:**

1. Generate a single-use QR code (toggle ON)
2. Scan QR code and clock in successfully
3. Attempt to scan the same QR code again — should fail with "already used" message
4. Generate a new single-use QR code
5. Verify it works for one scan only

**Passkey Auto-Trigger:**

1. Trigger any action that requires passkey verification
2. Verify that the WebAuthn dialog appears automatically (no need to click "Verify with Passkey")
3. Cancel the dialog — verify the Retry button appears
4. Complete verification — verify success

**Passkey Session Caching:**

1. Clock in (verify passkey)
2. Immediately clock out — verify that passkey verification is NOT requested again (within 15 min)
3. Wait 15+ minutes (or invalidate session) — verify that passkey is requested again
4. Perform multiple admin actions — verify only first action requires passkey
5. Check the session indicator shows "Verified 14m" countdown

**Admin Actions:**

1. Try an admin action that requires passkey
2. Verify — check that session is now marked as verified
3. Try another admin action immediately — should be pre-approved
4. Verify the session indicator appears

---

## Summary

This plan implements:

1. **QR-Based Clock-Out** — Staff must scan the same studio QR code for both clock-in and clock-out, with a new `ClockOutScanner` component and `clockOutWithQR` server action.

2. **Single-Use QR Toggle** — Admins can generate QR codes that invalidate after one scan for enhanced security, with `isSingleUse` and `timesUsed` fields in the database schema.

3. **Auto-Trigger Passkey Verification** — `PasskeyVerification` component now auto-triggers the WebAuthn dialog when opened (with `autoTrigger` prop), eliminating the need to click a button.

4. **Page-Session Passkey Caching** — `PasskeySessionProvider` context caches verification state for 15 minutes, so multiple actions on the same page don't require re-verification. Includes `PasskeySessionIndicator` to show remaining time.

5. **Audit Logging** — Verification method (fresh passkey vs session cache) is logged in clock-in/out actions for compliance.

6. **Integration** — All existing clock-in, clock-out, and admin action components updated to use the new session-based passkey verification.