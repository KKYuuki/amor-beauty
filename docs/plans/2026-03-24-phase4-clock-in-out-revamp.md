# Phase 4: Clock In/Out Revamp Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Completely overhaul clock-in/clock-out system with QR code verification to prevent remote clock-ins. Staff must scan a daily-rotating QR code at the branch to clock in. Clock out is unrestricted.

**Architecture:**
1. Daily rotating QR codes stored in database (one per branch per day)
2. New `time_clock_admin` access flag for viewing/managing time clocks
3. Time clock entry now requires `branch_id` and `qr_session_id` for clock-in validation
4. Admin UI to display QR codes, calendar view of staff time entries
5. Staff UI to scan QR code for clock-in, simple button for clock-out

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, QRCode generation library

---

## Task 1: Create QR Session Schema and Migrations

**Files:**
- Create: `server/db/schema/qr-sessions.ts`
- Modify: `server/db/schema/index.ts`
- Modify: `server/db/schema/timeclock.ts`
- Create: `server/db/migrations/[timestamp]_add_qr_sessions.ts`

**Step 1: Create QR sessions table schema**

Create `server/db/schema/qr-sessions.ts`:

```typescript
import { pgTable, uuid, timestamp, text, boolean, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { branches } from './branches'

// Daily QR codes for clock-in verification
// One QR code per branch per day
export const qrSessions = pgTable('qr_sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    
    // Branch this QR is for
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
    
    // The date this QR is valid for (YYYY-MM-DD)
    validDate: timestamp('valid_date').notNull(),// Just the date, no time
    
    // QR code secret (used to generate and verify)
    qrCode: text('qr_code').notNull().unique(),
    
    // Whether this QR is currently active
    isActive: boolean('is_active').default(true).notNull(),
    
    // Who generated this QR (admin who displayed it)
    generatedBy: text('generated_by').references(() => user.id, { onDelete: 'set null' }),
}, (table) => ({
    branchDateIdx: index('idx_qr_sessions_branch_date').on(table.branchId, table.validDate),
    qrCodeIdx: index('idx_qr_sessions_qr_code').on(table.qrCode),
}))

export const qrSessionsRelations = relations(qrSessions, ({ one }) => ({
    branch: one(branches, {
        fields: [qrSessions.branchId],
        references: [branches.id],
    }),
    generator: one(user, {
        fields: [qrSessions.generatedBy],
        references: [user.id],
    }),
}))

export type QRSession = typeof qrSessions.$inferSelect
export type NewQRSession = typeof qrSessions.$inferInsert
```

**Step 2: Update time clock entries schema**

Modify `server/db/schema/timeclock.ts`:

```typescript
// Add to timeClockEntries table
export const timeClockEntries = pgTable('time_clock_entries', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    
    // Staff reference
    staffId: text('staff_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    
    // Clock in/out times
    clockIn: timestamp('clock_in').notNull(),
    clockOut: timestamp('clock_out'),
    
    // Branch where clocked in
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    
    // QR session used for verification (null for clock-out from anywhere)
    qrSessionId: uuid('qr_session_id').references(() => qrSessions.id, { onDelete: 'set null' }),
    
    // Device/browser info for audit
    clockInDevice: text('clock_in_device'),// User agent string
    clockOutDevice: text('clock_out_device'),
    
    // Notes
    notes: text('notes'),
}, (table) => ({
    staffIdIdx: index('idx_time_clock_staff_id').on(table.staffId),
    clockInIdx: index('idx_time_clock_clock_in').on(table.clockIn),
    branchIdx: index('idx_time_clock_branch_id').on(table.branchId),
}))
```

**Step 3: Export from schema index**

Modify `server/db/schema/index.ts`:

```typescript
export * from './qr-sessions'
// ... other exports
```

**Step 4: Add access flag type**

Modify `utils/types/auth.ts` or appropriate file:

```typescript
// Add to available access flags
export type AccessFlag = 
    | 'view_appointments'
    | 'transactions'
    | 'time_clock_admin'// New flag for viewing all time clocks
    // ... other flags
```

**Step 5: Generate migration**

Run: `bun run db:generate`
Expected: New migration files created

Run: `bun run db:migrate`
Expected: Migrations applied

**Step 6: Commit schema changes**

```bash
git add server/db/schema/*.ts utils/types/auth.ts
git commit -m "feat(clock): add QR sessions schema for verified clock-in"
```

---

## Task 2: Create QR Code Generation Utilities

**Files:**
- Create: `server/utils/qr-code.ts`
- Modify: `package.json` (add qrcode library if needed)

**Step 1: Install QR code library**

Run: `bun add qrcode @types/qrcode`

**Step 2: Create QR code utilities**

Create `server/utils/qr-code.ts`:

```typescript
import QRCode from 'qrcode'
import { nanoid } from 'nanoid'
import { db } from '@/server/db'
import { qrSessions, branches } from '@/server/db/schema'
import { eq, and, gte, lte } from 'drizzle-orm'

// Generate a unique QR code for a branch for today
export async function generateDailyQRCode(branchId: string, generatedBy: string): Promise<{
    qrCode: string
    qrDataUrl: string
    validUntil: Date
}> {
    // Get start and end of today
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfDay = new Date(startOfDay)
    endOfDay.setHours(23, 59, 59, 999)
    
    // Check if QR already exists for today
    const existing = await db
        .select()
        .from(qrSessions)
        .where(and(
            eq(qrSessions.branchId, branchId),
            gte(qrSessions.validDate, startOfDay),
            lte(qrSessions.validDate, endOfDay)
        ))
        .limit(1)
    
    if (existing.length > 0 && existing[0].isActive) {
        // Return existing QR code
        const qrDataUrl = await QRCode.toDataURL(existing[0].qrCode, {
            width: 400,
            margin: 2,
        })
        return {
            qrCode: existing[0].qrCode,
            qrDataUrl,
            validUntil: endOfDay,
        }
    }
    
    // Generate new QR code
    const qrCode = `CLK-${branchId.slice(0, 8)}-${nanoid(12)}-${Date.now().toString(36)}`
    
    // Create QR session
    await db.insert(qrSessions).values({
        branchId,
        validDate: startOfDay,
        qrCode,
        isActive: true,
        generatedBy,
    })
    
    // Generate QR image
    const qrDataUrl = await QRCode.toDataURL(qrCode, {
        width: 400,
        margin: 2,
    })
    
    return {
        qrCode,
        qrDataUrl,
        validUntil: endOfDay,
    }
}

// Verify a scanned QR code
export async function verifyQRCode(qrCode: string): Promise<{
    valid: boolean
    branchId?: string
    error?: string
}> {
    const session = await db
        .select({
            id: qrSessions.id,
            branchId: qrSessions.branchId,
            validDate: qrSessions.validDate,
            isActive: qrSessions.isActive,
        })
        .from(qrSessions)
        .where(eq(qrSessions.qrCode, qrCode))
        .limit(1)
    
    if (session.length === 0) {
        return { valid: false, error: 'Invalid QR code' }
    }
    
    const qr = session[0]
    
    if (!qr.isActive) {
        return { valid: false, error: 'QR code is no longer active' }
    }
    
    // Check if still valid today
    const now = new Date()
    const validDate = new Date(qr.validDate)
    const endOfDay = new Date(validDate)
    endOfDay.setHours(23, 59, 59, 999)
    
    if (now > endOfDay) {
        return { valid: false, error: 'QR code has expired' }
    }
    
    return {
        valid: true,
        branchId: qr.branchId,
    }
}

// Get QR sessions for a specific date
export async function getQRSessionsByDate(date: Date): Promise<typeof qrSessions.$inferSelect[]> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const endOfDay = new Date(startOfDay)
    endOfDay.setHours(23, 59, 59, 999)
    
    return db
        .select()
        .from(qrSessions)
        .where(and(
            gte(qrSessions.validDate, startOfDay),
            lte(qrSessions.validDate, endOfDay)
        ))
}
```

**Step 3: Commit utility changes**

```bash
git add server/utils/qr-code.ts package.json bun.lockb
git commit -m "feat(clock): add QR code generation and verification utilities"
```

---

## Task 3: Create Clock-In QR Scanner Component

**Files:**
- Create: `components/clock/ClockInScanner.tsx`
- Create: `components/clock/ClockOutButton.tsx`

**Step 1: Install QR scanner library**

Run: `bun add html5-qrcode @types/html5-qrcode`

**Step 2: Create clock-in scanner component**

Create `components/clock/ClockInScanner.tsx`:

```tsx
"use client"

import { useState, useRef, useEffect } from "react"
import { Html5Qrcode } from "html5-qrcode"
import { LoaderCircleIcon, CameraIcon, CheckCircleIcon, XCircleIcon } from "lucide-react"
import { clockInWithQR } from "@/server/actions/time-clock"
import { useBranchContext } from "@/components/branch-context"

interface ClockInScannerProps {
    staffId: string
    onSuccess: () => void
    onCancel: () => void
}

type ScannerState = 'idle' | 'scanning' | 'processing' | 'success' | 'error'

export default function ClockInScanner({ staffId, onSuccess, onCancel }: ClockInScannerProps) {
    const [state, setState] = useState<ScannerState>('idle')
    const [error, setError] = useState<string | null>(null)
    const scannerRef = useRef<Html5Qrcode | null>(null)
    const { branches } = useBranchContext()

    useEffect(() => {
        return () => {
            if (scannerRef.current) {
                scannerRef.current.stop().catch(() => {})
            }
        }
    }, [])

    const startScanner = async () => {
        setState('scanning')
        setError(null)

        try {
            scannerRef.current = new Html5Qrcode('clock-in-scanner')
            
            await scannerRef.current.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                async (decodedText) => {
                    await handleQRCode(decodedText)
                },
                (errorMessage) => {
                    // QR code scanning error - ignore, keep scanning
                }
            )
        } catch (err) {
            setState('error')
            setError('Failed to access camera. Please grant camera permission.')
        }
    }

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop()
            } finally {
                scannerRef.current = null
            }
        }
        setState('idle')
    }

    const handleQRCode = async (qrCode: string) => {
        setState('processing')
        setError(null)

        try {
            // Stop scanner while processing
            if (scannerRef.current) {
                await scannerRef.current.stop()
                scannerRef.current = null
            }

            const result = await clockInWithQR(staffId, qrCode)
            
            if (result.success) {
                setState('success')
                setTimeout(() => {
                    onSuccess()
                }, 1500)
            } else {
                setState('error')
                setError(result.error || 'Clock-in failed')
            }
        } catch (err) {
            setState('error')
            setError(err instanceof Error ? err.message : 'Unexpected error')
        }
    }

    const handleRetry = () => {
        setError(null)
        startScanner()
    }

    return (
        <div className="flex flex-col items-center gap-4 p-6 bg-white/5 rounded-lg border border-white/10">
            <h2 className="text-xl font-semibold">Clock In</h2>
            <p className="text-sm text-white/60 text-center max-w-sm">
                Scan the QR code displayed at your branch to clock in.
            </p>

            {state === 'idle' && (
                <button
                    onClick={startScanner}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 rounded-md text-blue-400 font-medium transition-colors"
                >
                    <CameraIcon size={20} />
                    Start Scanner
                </button>
            )}

            {state === 'scanning' && (
                <>
                    <div id="clock-in-scanner" className="w-full max-w-sm aspect-square rounded-lg overflow-hidden" />
                    <button
                        onClick={stopScanner}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-white/80 transition-colors"
                    >
                        Cancel
                    </button>
                </>
            )}

            {state === 'processing' && (
                <div className="flex flex-col items-center gap-2">
                    <LoaderCircleIcon size={32} className="animate-spin text-blue-400" />
                    <span className="text-white/60">Processing...</span>
                </div>
            )}

            {state === 'success' && (
                <div className="flex flex-col items-center gap-2">
                    <CheckCircleIcon size={32} className="text-green-400" />
                    <span className="text-green-400 font-medium">Clocked in successfully!</span>
                </div>
            )}

            {state === 'error' && (
                <div className="flex flex-col items-center gap-4">
                    <div className="flex flex-col items-center gap-2">
                        <XCircleIcon size={32} className="text-red-400" />
                        <span className="text-red-400">{error}</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleRetry}
                            className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 rounded-md text-blue-400 transition-colors"
                        >
                            Try Again
                        </button>
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-white/80 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
```

**Step 3: Create clock-out button component**

Create `components/clock/ClockOutButton.tsx`:

```tsx
"use client"

import { useState } from "react"
import { ClockIcon, LoaderCircleIcon } from "lucide-react"
import { clockOut } from "@/server/actions/time-clock"

interface ClockOutButtonProps {
    staffId: string
    currentEntryId?: string
    onClockOut: () => void
}

export default function ClockOutButton({ staffId, currentEntryId, onClockOut }: ClockOutButtonProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleClockOut = async () => {
        if (!currentEntryId) return

        setLoading(true)
        setError(null)

        try {
            const result = await clockOut(staffId)
            
            if (result.success) {
                onClockOut()
            } else {
                setError(result.error || 'Clock-out failed')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unexpected error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col items-center gap-2">
            <button
                onClick={handleClockOut}
                disabled={loading || !currentEntryId}
                className="flex items-center gap-2 px-6 py-3 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-md text-orange-400 font-medium transition-colors disabled:opacity-50"
            >
                {loading ? (
                    <>
                        <LoaderCircleIcon size={20} className="animate-spin" />
                        Clocking Out...
                    </>
                ) : (
                    <>
                        <ClockIcon size={20} />
                        Clock Out
                    </>
                )}
            </button>
            {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
    )
}
```

**Step 4: Commit components**

```bash
git add components/clock/*.tsx package.json bun.lockb
git commit -m "feat(clock): create clock-in scanner and clock-out button components"
```

---

## Task 4: Create QR Code Display Component for Admins

**Files:**
- Create: `components/clock/QRCodeDisplay.tsx`
- Create: `app/(app)/admin/time-clock/page.tsx`
- Create: `app/(app)/admin/time-clock/qr-display-client.tsx`

**Step 1: Create QR display component**

Create `components/clock/QRCodeDisplay.tsx`:

```tsx
"use client"

import { useState, useEffect } from "react"
import { RefreshCwIcon, Building2Icon, ClockIcon } from "lucide-react"
import { generateQRCode } from "@/server/actions/qr-session"
import { useBranchContext } from "@/components/branch-context"

interface QRDisplayProps {
    onRefresh?: () => void
}

export default function QRCodeDisplay({ onRefresh }: QRDisplayProps) {
    const { branches, currentBranch } = useBranchContext()
    const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [validUntil, setValidUntil] = useState<Date | null>(null)

    const selectedBranch = branches.find(b => b.id === selectedBranchId)

    useEffect(() => {
        // Auto-select first branch
        if (branches.length > 0 && !selectedBranchId) {
            setSelectedBranchId(currentBranch?.id || branches[0].id)
        }
    }, [branches, currentBranch, selectedBranchId])

    useEffect(() => {
        // Generate QR when branch is selected
        if (selectedBranchId) {
            generateQR(selectedBranchId)
        }
    }, [selectedBranchId])

    const generateQR = async (branchId: string) => {
        setLoading(true)
        setError(null)

        try {
            const result = await generateQRCode(branchId)
            
            if (result.success && result.data) {
                setQrDataUrl(result.data.qrDataUrl)
                setValidUntil(new Date(result.data.validUntil))
            } else {
                setError(result.error || 'Failed to generate QR code')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unexpected error')
        } finally {
            setLoading(false)
        }
    }

    const handleRefresh = () => {
        if (selectedBranchId) {
            generateQR(selectedBranchId)
            onRefresh?.()
        }
    }

    return (
        <div className="bg-white/5 p-6 rounded-lg border border-white/10">
            <div className="flexflex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h2 className="text-xl font-semibold">Clock-In QR Code</h2>
                <div className="flex items-center gap-2">
                    <Building2Icon size={16} className="text-white/40" />
                    <select
                        value={selectedBranchId || ""}
                        onChange={(e) => setSelectedBranchId(e.target.value)}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-white/30"
                    >
                        {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                                {branch.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {loading && (
                <div className="flex flex-col items-center justify-center py-12">
                    <RefreshCwIcon size={32} className="animate-spin text-blue-400" />
                    <span className="mt-2 text-white/60">Generating QR code...</span>
                </div>
            )}

            {error && (
                <div className="text-center py-12 text-red-400">
                    {error}
                </div>
            )}

            {!loading && !error && qrDataUrl && (
                <div className="flex flex-col items-center">
                    <div className="bg-white p-4 rounded-lg mb-4">
                        <img
                            src={qrDataUrl}
                            alt="Clock-in QR Code"
                            className="w-64 h-64"
                        />
                    </div>
                    
                    {selectedBranch && (
                        <div className="text-center mb-4">
                            <p className="font-medium">{selectedBranch.name}</p>
                            <p className="text-sm text-white/60">{selectedBranch.code}</p>
                        </div>
                    )}

                    {validUntil && (
                        <div className="flex items-center gap-2 text-sm text-white/60">
                            <ClockIcon size={14} />
                            <span>Valid until {validUntil.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>
                        </div>
                    )}

                    <button
                        onClick={handleRefresh}
                        disabled={loading}
                        className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 rounded-md text-blue-400 transition-colors disabled:opacity-50"
                    >
                        <RefreshCwIcon size={16} />
                        Regenerate QR
                    </button>
                </div>
            )}
        </div>
    )
}
```

**Step 2: Create admin time clock page**

Create `app/(app)/admin/time-clock/page.tsx`:

```tsx
import { Metadata } from "next"
import TimeClockAdminClient from "./timeClockAdminClient"

export const metadata: Metadata = {
    title: "Time Clock Administration",
    description: "Manage staff time clocks and QR codes",
}

export default function TimeClockAdminPage() {
    return <TimeClockAdminClient />
}
```

**Step 3: Create admin client component**

Create `app/(app)/admin/time-clock/timeClockAdminClient.tsx`:

```tsx
"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { QrCodeIcon, CalendarIcon, UsersIcon } from "lucide-react"
import QRCodeDisplay from "@/components/clock/QRCodeDisplay"
import TimeClockCalendar from "@/components/clock/TimeClockCalendar"
import StaffClockStatus from "@/components/clock/StaffClockStatus"
import { hasAccessFlag } from "@/utils/auth/permissions"
import { use } from "react"

export default function TimeClockAdminClient() {
    const [hasAccess, setHasAccess] = useState(false)
    const [activeTab, setActiveTab] = useState("qr")

    useEffect(() => {
        const checkAccess = async () => {
            const access = await hasAccessFlag('time_clock_admin')
            setHasAccess(access)
        }
        checkAccess()
    }, [])

    if (!hasAccess) {
        return (
            <div className="p-6">
                <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
                <p className="text-white/60">
                    You do not have permission to view this page.
                    Contact an administrator to request access.
                </p>
            </div>
        )
    }

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Time Clock Administration</h1>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="qr">
                        <QrCodeIcon size={16} className="mr-2" />
                        QR Codes
                    </TabsTrigger>
                    <TabsTrigger value="calendar">
                        <CalendarIcon size={16} className="mr-2" />
                        Calendar
                    </TabsTrigger>
                    <TabsTrigger value="status">
                        <UsersIcon size={16} className="mr-2" />
                        Staff Status
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="qr" className="mt-6">
                    <QRCodeDisplay />
                </TabsContent>

                <TabsContent value="calendar" className="mt-6">
                    <TimeClockCalendar />
                </TabsContent>

                <TabsContent value="status" className="mt-6">
                    <StaffClockStatus />
                </TabsContent>
            </Tabs>
        </div>
    )
}
```

**Step 4: Commit admin components**

```bash
git add "app/(app)/admin/time-clock/*.tsx" components/clock/*.tsx
git commit -m "feat(clock): create admin time clock page with QR display"
```

---

## Task 5: Create Time Clock Calendar View

**Files:**
- Create: `components/clock/TimeClockCalendar.tsx`

**Step 1: Create calendar component**

Create `components/clock/TimeClockCalendar.tsx`:

```tsx
"use client"

import { useState, useEffect } from "react"
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon } from "lucide-react"
import { getTimeClockEntries } from "@/server/actions/time-clock"
import { getProfilesByIds } from "@/server/actions/profile"
import { useBranchContext } from "@/components/branch-context"

interface TimeClockEntryWithUser {
    id: string
    staffId: string
    staffName: string
    clockIn: Date
    clockOut: Date | null
    branchName: string | null
    duration: string | null
}

export default function TimeClockCalendar() {
    const { currentBranch, branches } = useBranchContext()
    const [currentDate, setCurrentDate] = useState(new Date())
    const [entries, setEntries] = useState<TimeClockEntryWithUser[]>([])
    const [loading, setLoading] = useState(true)

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ]

    useEffect(() => {
        loadEntries()
    }, [currentDate, currentBranch])

    const loadEntries = async () => {
        setLoading(true)
        
        // Get first and last day of month
        const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
        
        const result = await getTimeClockEntries({
            startDate: firstDay,
            endDate: lastDay,
            branchId: currentBranch?.id,
        })
        
        if (result.success && result.data) {
            // Get unique user IDs
            const userIds = [...new Set(result.data.map(e => e.staffId))]
            const profiles = await getProfilesByIds(userIds)
            const profileMap = new Map(profiles.map(p => [p.id, p]))
            
            const branchMap = new Map(branches.map(b => [b.id, b]))
            
            const entriesWithUsers = result.data.map(entry => {
                const profile = profileMap.get(entry.staffId)
                const branch = entry.branchId ? branchMap.get(entry.branchId) : null
                
                const clockIn = new Date(entry.clockIn)
                const clockOut = entry.clockOut ? new Date(entry.clockOut) : null
                const duration = clockOut 
                    ? formatDuration(clockOut.getTime() - clockIn.getTime())
                    : null
                
                return {
                    id: entry.id,
                    staffId: entry.staffId,
                    staffName: profile?.full_name || 'Unknown',
                    clockIn,
                    clockOut,
                    branchName: branch?.name || null,
                    duration,
                }
            })
            
            setEntries(entriesWithUsers)
        }
        
        setLoading(false)
    }

    const formatDuration = (ms: number): string => {
        const hours = Math.floor(ms / (1000 * 60 * 60))
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
        return `${hours}h ${minutes}m`
    }

    const navigateMonth = (direction: number) => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1))
    }

    // Group entries by day
    const entriesByDay = entries.reduce((acc, entry) => {
        const day = entry.clockIn.getDate()
        if (!acc[day]) acc[day] = []
        acc[day].push(entry)
        return acc
    }, {} as Record<number, TimeClockEntryWithUser[]>)

    // Get days in month
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
    const firstDayOfWeek = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()

    return (
        <div className="bg-white/5 rounded-lg border border-white/10 p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h3>
                <div className="flex gap-2">
                    <button
                        onClick={() => navigateMonth(-1)}
                        className="p-2 hover:bg-white/10 rounded-md transition-colors"
                    >
                        <ChevronLeftIcon size={20} />
                    </button>
                    <button
                        onClick={() => navigateMonth(1)}
                        className="p-2 hover:bg-white/10 rounded-md transition-colors"
                    >
                        <ChevronRightIcon size={20} />
                    </button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
                {/* Weekday headers */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="p-2 text-center text-sm font-medium text-white/60">
                        {day}
                    </div>
                ))}
                
                {/* Empty cells for days before first of month */}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} className="p-2 min-h-24" />
                ))}
                
                {/* Days of month */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1
                    const dayEntries = entriesByDay[day] || []
                    const isToday = new Date().getDate() === day && 
                                    new Date().getMonth() === currentDate.getMonth() &&
                                    new Date().getFullYear() === currentDate.getFullYear()
                    
                    return (
                        <div
                            key={day}
                            className={`p-2 min-h-24 border border-white/5 rounded-md ${
                                isToday ? 'bg-blue-500/10 border-blue-500/30' : ''
                            }`}
                        >
                            <div className="text-sm font-medium mb-1">{day}</div>
                            {loading ? (
                                <div className="text-xs text-white/40">Loading...</div>
                            ) : (
                                dayEntries.slice(0, 3).map((entry, idx) => (
                                    <div
                                        key={idx}
                                        className="text-xs text-white/60 truncate flex items-center gap-1"
                                        title={`${entry.staffName} - ${entry.duration || 'Active'}`}
                                    >
                                        <ClockIcon size={10} />
                                        <span>{entry.staffName}</span>
                                    </div>
                                ))
                            )}
                            {dayEntries.length > 3 && (
                                <div className="text-xs text-white/40 mt-1">
                                    +{dayEntries.length - 3} more
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
```

**Step 2: Commit calendar component**

```bash
git add components/clock/TimeClockCalendar.tsx
git commit -m "feat(clock): create time clock calendar view for admins"
```

---

## Task 6: Create Staff Clock Status View

**Files:**
- Create: `components/clock/StaffClockStatus.tsx`

**Step 1: Create staff status component**

Create `components/clock/StaffClockStatus.tsx`:

```tsx
"use client"

import { useState, useEffect } from "react"
import { ClockIcon, CheckCircleIcon, XCircleIcon, RefreshCwIcon } from "lucide-react"
import { getStaffClockStatus } from "@/server/actions/time-clock"
import { getProfiles } from "@/server/actions/profile"
import { useBranchContext } from "@/components/branch-context"

interface StaffStatus {
    staffId: string
    staffName: string
    staffRole: string
    isClockedIn: boolean
    clockedInAt: Date | null
    branchName: string | null
    duration: string | null
}

export default function StaffClockStatus() {
    const { currentBranch } = useBranchContext()
    const [staffStatus, setStaffStatus] = useState<StaffStatus[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all')

    useEffect(() => {
        loadStaffStatus()
    }, [currentBranch])

    const loadStaffStatus = async () => {
        setLoading(true)
        
        const result = await getStaffClockStatus(currentBranch?.id)
        
        if (result.success && result.data) {
            setStaffStatus(result.data)
        }
        
        setLoading(false)
    }

    const filteredStaff = staffStatus.filter(s => {
        if (filter === 'in') return s.isClockedIn
        if (filter === 'out') return !s.isClockedIn
        return true
    })

    return (
        <div className="bg-white/5 rounded-lg border border-white/10">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="text-lg font-semibold">Staff Clock Status</h3>
                <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setFilter('all')}
                            className={`px-3 py-1 text-sm rounded-md transition-colors ${
                                filter === 'all' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'
                            }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setFilter('in')}
                            className={`px-3 py-1 text-sm rounded-md transition-colors ${
                                filter === 'in' ? 'bg-green-500/20 text-green-400' : 'text-white/60 hover:text-white'
                            }`}
                        >
                            Clocked In
                        </button>
                        <button
                            onClick={() => setFilter('out')}
                            className={`px-3 py-1 text-sm rounded-md transition-colors ${
                                filter === 'out' ? 'bg-orange-500/20 text-orange-400' : 'text-white/60 hover:text-white'
                            }`}
                        >
                            Clocked Out
                        </button>
                    </div>
                    <button
                        onClick={loadStaffStatus}
                        disabled={loading}
                        className="p-2 hover:bg-white/10 rounded-md transition-colors disabled:opacity-50"
                    >
                        <RefreshCwIcon size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Staff List */}
            <div className="divide-y divide-white/5">
                {loading ? (
                    <div className="p-8 text-center text-white/40">
                        Loading...
                    </div>
                ) : filteredStaff.length === 0 ? (
                    <div className="p-8 text-center text-white/40">
                        No staff members found
                    </div>
                ) : (
                    filteredStaff.map((staff) => (
                        <div
                            key={staff.staffId}
                            className="flex items-center justify-between p-4 hover:bg-white/5"
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-3 h-3 rounded-full ${
                                    staff.isClockedIn ? 'bg-green-400' : 'bg-white/20'
                                }`} />
                                <div>
                                    <p className="font-medium">{staff.staffName}</p>
                                    <p className="text-sm text-white/60 capitalize">{staff.staffRole}</p>
                                </div>
                            </div>
                            
                            <div className="text-right">
                                {staff.isClockedIn ? (
                                    <div className="flex items-center gap-2 text-green-400">
                                        <CheckCircleIcon size={16} />
                                        <div>
                                            <p className="text-sm font-medium">Clocked in</p>
                                            <p className="text-xs text-white/60">
                                                {staff.clockInTime?.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                                                {staff.branchName && ` at ${staff.branchName}`}
                                            </p>
                                            {staff.duration && (
                                                <p className="text-xs text-white/40">
                                                    Duration: {staff.duration}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-white/40">
                                        <XCircleIcon size={16} />
                                        <p className="text-sm">Clocked out</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
```

**Step 2: Commit status component**

```bash
git add components/clock/StaffClockStatus.tsx
git commit -m "feat(clock): create staff clock status view for admins"
```

---

## Task 7: Update Time Clock Server Actions

**Files:**
- Modify: `server/actions/time-clock.ts`
- Create: `server/actions/qr-session.ts`

**Step 1: Create QR session server actions**

Create `server/actions/qr-session.ts`:

```typescript
'use server'

import { db } from '@/server/db'
import { qrSessions, branches } from '@/server/db/schema'
import { eq, and, gte, lte } from 'drizzle-orm'
import { getCurrentUser, hasAccessFlag } from '@/utils/auth/permissions'
import { generateDailyQRCode, verifyQRCode } from '@/server/utils/qr-code'
import { createLogs } from './logs'
import { ActionResponse, success, failure } from '@/utils/types/responses'

export interface QRCodeData {
    qrCode: string
    qrDataUrl: string
    validUntil: string
    branchId: string
    branchName: string
}

export async function generateQRCode(branchId: string): Promise<ActionResponse<QRCodeData>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    // Check if user has permission to generate QR codes
    const hasAccess = await hasAccessFlag(user, 'time_clock_admin') || user.role === 'admin'
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const result = await generateDailyQRCode(branchId, user.id)
        
        const branch = await db
            .select({ name: branches.name })
            .from(branches)
            .where(eq(branches.id, branchId))
            .limit(1)

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `QR code generated for branch ${branchId} by ${user.id}`,
                user_id: user.id,
                branch_id: branchId,
            }]
        })

        return success({
            qrCode: result.qrCode,
            qrDataUrl: result.qrDataUrl,
            validUntil: result.validUntil.toISOString(),
            branchId,
            branchName: branch[0]?.name || 'Unknown',
        })
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'SYSTEM',
                message: `Failed to generate QR code: ${error}`,
                user_id: user.id,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to generate QR code')
    }
}

export async function verifyQRCodeAction(qrCode: string): Promise<ActionResponse<{ valid: boolean; branchId?: string }>> {
    try {
        const result = await verifyQRCode(qrCode)
        
        if (result.valid) {
            return success({ valid: true, branchId: result.branchId })
        } else {
            return success({ valid: false })
        }
    } catch (error) {
        return failure(error instanceof Error ? error.message : 'Verification failed')
    }
}
```

**Step 2: Update time-clock server actions**

Modify `server/actions/time-clock.ts`:

```typescript
// Add new function for QR-based clock-in
export async function clockInWithQR(
    staffId: string,
    qrCode: string,
    deviceInfo?: string
): Promise<ActionResponse<{ entryId: string; branchName: string }>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    // Allow self clock-in only
    if (user.id !== staffId) {
        return failure('You can only clock in for yourself')
    }

    try {
        // Verify QR code
        const qrResult = await verifyQRCode(qrCode)
        if (!qrResult.valid || !qrResult.branchId) {
            return failure(qrResult.error || 'Invalid QR code')
        }

        // Check for existing clock-in
        const [existingEntry] = await db
            .select()
            .from(timeClockEntries)
            .where(and(
                eq(timeClockEntries.staffId, staffId),
                isNull(timeClockEntries.clockOut)
            ))
            .limit(1)

        if (existingEntry) {
            return failure('Already clocked in')
        }

        // Get QR session for reference
        const [qrSession] = await db
            .select()
            .from(qrSessions)
            .where(eq(qrSessions.qrCode, qrCode))
            .limit(1)

        // Create time clock entry
        const [entry] = await db
            .insert(timeClockEntries)
            .values({
                staffId,
                clockIn: new Date(),
                branchId: qrResult.branchId,
                qrSessionId: qrSession?.id,
                clockInDevice: deviceInfo,
            })
            .returning()

        // Get branch name
        const [branch] = await db
            .select({ name: branches.name })
            .from(branches)
            .where(eq(branches.id, qrResult.branchId))
            .limit(1)

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Staff ${staffId} clocked in at branch ${qrResult.branchId}`,
                user_id: user.id,
                branch_id: qrResult.branchId,
            }]
        })

        return success({
            entryId: entry.id,
            branchName: branch?.name || 'Unknown',
        })
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'PAYROLL',
                message: `Clock-in failed: ${error}`,
                user_id: user.id,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Clock-in failed')
    }
}

// Update clockOut to record device info
export async function clockOut(
    staffId: string,
    notes?: string,
    deviceInfo?: string
): Promise<ActionResponse<void>> {
    // ...existing validation...

    // Update with device info
    await db
        .update(timeClockEntries)
        .set({
            clockOut: new Date(),
            notes: notes ?? activeEntry.notes,
            clockOutDevice: deviceInfo,
            updatedAt: new Date(),
        })
        .where(eq(timeClockEntries.id, activeEntry.id))

    // ... rest of function
}

// New function to get time clock entries with filters
export async function getTimeClockEntries(params: {
    startDate?: Date
    endDate?: Date
    branchId?: string
    staffId?: string
}): Promise<ActionResponse<TimeClockEntry[]>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await hasAccessFlag(user, 'time_clock_admin') || user.role === 'admin'
    
    try {
        const conditions = []
        
        if (params.startDate) {
            conditions.push(gte(timeClockEntries.clockIn, params.startDate))
        }
        if (params.endDate) {
            conditions.push(lte(timeClockEntries.clockIn, params.endDate))
        }
        if (params.branchId) {
            conditions.push(eq(timeClockEntries.branchId, params.branchId))
        }
        if (params.staffId) {
            conditions.push(eq(timeClockEntries.staffId, params.staffId))
        }
        
        // Non-admin users only see their own entries
        if (!hasAccess) {
            conditions.push(eq(timeClockEntries.staffId, user.id))
        }

        const entries = await db
            .select()
            .from(timeClockEntries)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(timeClockEntries.clockIn))

        return success(entries)
    } catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to fetch entries')
    }
}

// New function to get staff clock status
export async function getStaffClockStatus(branchId?: string): Promise<ActionResponse<StaffStatus[]>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await hasAccessFlag(user, 'time_clock_admin') || user.role === 'admin'
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        // Get all active staff
        const staff = await db
            .select()
            .from(user)
            .where(eq(user.isActive, true))

        // Get active clock entries
        const activeEntries = await db
            .select()
            .from(timeClockEntries)
            .where(isNull(timeClockEntries.clockOut))

        const entryMap = new Map(activeEntries.map(e => [e.staffId, e]))
        const branchMap = new Map(branches.map(b => [b.id, b]))

        const status: StaffStatus[] = staff.map(s => {
            const entry = entryMap.get(s.id)
            const branch = entry?.branchId ? branchMap.get(entry.branchId) : null
            
            return {
                staffId: s.id,
                staffName: s.fullName,
                staffRole: s.role,
                isClockedIn: !!entry,
                clockInTime: entry?.clockIn || null,
                branchName: branch?.name || null,
                duration: entry ? formatDuration(new Date().getTime() - entry.clockIn.getTime()) : null,
                branchId: entry?.branchId || null,
            }
        })

        // Filter by branch if specified
        if (branchId) {
            return success(status.filter(s => 
                s.branchId === branchId || !s.isClockedIn
            ))
        }

        return success(status)
    } catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to fetch status')
    }
}
```

**Step 3: Add new type definitions**

Add to `utils/types/schedules.ts`:

```typescript
export interface StaffStatus {
    staffId: string
    staffName: string
    staffRole: string
    isClockedIn: boolean
    clockInTime: Date | null
    branchName: string | null
    branchId: string | null
    duration: string | null
}

export interface TimeClockEntry {
    id: string
    staffId: string
    clockIn: Date
    clockOut: Date | null
    branchId: string | null
    qrSessionId: string | null
    clockInDevice: string | null
    clockOutDevice: string | null
    notes: string | null
    createdAt: Date
    updatedAt: Date
}
```

**Step 4: Commit server actions**

```bash
git add server/actions/time-clock.ts server/actions/qr-session.ts utils/types/schedules.ts
git commit -m "feat(clock): add QR-based clock-in and staff status server actions"
```

---

## Task 8: Create Staff Clock-In/Out Page

**Files:**
- Create: `app/time-clock/page.tsx`
- Create: `app/time-clock/timeClockPage.tsx`

**Step 1: Create time clock page for staff**

Create `app/time-clock/page.tsx`:

```tsx
import { Metadata } from "next"
import TimeClockPageClient from "./timeClockPageClient"

export const metadata: Metadata = {
    title: "Time Clock",
    description: "Clock in and out for your shift",
}

export default function TimeClockPage() {
    return <TimeClockPageClient />
}
```

**Step 2: Create client component**

Create `app/time-clock/timeClockPageClient.tsx`:

```tsx
"use client"

import { useState, useEffect } from "react"
import { ClockIcon, UserIcon } from "lucide-react"
import { use } from "react"
import { getClockStatus } from "@/server/actions/time-clock"
import ClockInScanner from "@/components/clock/ClockInScanner"
import ClockOutButton from "@/components/clock/ClockOutButton"
import { useBranchContext } from "@/components/branch-context"

export default function TimeClockPageClient() {
    const [clockStatus, setClockStatus] = useState<{
        isClockedIn: boolean
        clockedInAt: string | null
        branchId: string | null
        duration: string | null
        entryId: string | null
    } | null>(null)
    const [loading, setLoading] = useState(true)
    const [showScanner, setShowScanner] = useState(false)
    const { branches } = useBranchContext()

    useEffect(() => {
        loadStatus()
    }, [])

    const loadStatus = async () => {
        setLoading(true)
        // In real implementation, get userId from auth context
        const result = await getClockStatus(userId)
        if (result.success && result.data) {
            setClockStatus({
                isClockedIn: result.data.isClockedIn,
                clockedInAt: result.data.clockedInAt,
                branchId: result.data.currentLog?.branchId || null,
                duration: result.data.duration,
                entryId: result.data.currentLog?.id || null,
            })
        }
        setLoading(false)
    }

    const handleClockInSuccess = () => {
        setShowScanner(false)
        loadStatus()
    }

    const handleClockOut = () => {
        loadStatus()
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-96">
                <ClockIcon size={32} className="animate-spin text-white/40" />
            </div>
        )
    }

    return (
        <div className="max-w-xl mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <ClockIcon size={28} />
                Time Clock
            </h1>

            {/* Current Status Card */}
            <div className="bg-white/5 p-6 rounded-lg border border-white/10 mb-6">
                <div className="flex items-center gap-4 mb-4">
                    <div className={`w-4 h-4 rounded-full ${
                        clockStatus?.isClockedIn ? 'bg-green-400 animate-pulse' : 'bg-white/20'
                    }`} />
                    <div>
                        <p className="font-semibold">
                            {clockStatus?.isClockedIn ? 'Clocked In' : 'Clocked Out'}
                        </p>
                        {clockStatus?.clockedInAt && (
                            <p className="text-sm text-white/60">
                                Since {new Date(clockStatus.clockedInAt).toLocaleString('en-PH', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                })}
                            </p>
                        )}
                    </div>
                </div>

                {clockStatus?.duration && (
                    <div className="text-sm text-white/40">
                        Duration: {clockStatus.duration}
                    </div>
                )}

                {clockStatus?.branchId && (
                    <div className="text-sm text-white/40 mt-1">
                        Branch: {branches.find(b => b.id === clockStatus.branchId)?.name || 'Unknown'}
                    </div>
                )}
            </div>

            {/* Clock In/Out Actions */}
            {showScanner ? (
                <ClockInScanner
                    staffId={userId}
                    onSuccess={handleClockInSuccess}
                    onCancel={() => setShowScanner(false)}
                />
            ) : clockStatus?.isClockedIn ? (
                <div className="space-y-4">
                    <p className="text-center text-white/60">
                        You are currently clocked in. Click below to clock out.
                    </p>
                    <ClockOutButton
                        staffId={userId}
                        currentEntryId={clockStatus.entryId || undefined}
                        onClockOut={handleClockOut}
                    />
                </div>
            ) : (
                <div className="space-y-4">
                    <p className="text-center text-white/60">
                        Scan the QR code at your branch to clock in.
                    </p>
                    <button
                        onClick={() => setShowScanner(true)}
                        className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-green-500/20 hover:bg-green-500/30 border-2 border-green-500/40 rounded-md text-green-400 font-semibold transition-colors"
                    >
                        <UserIcon size={24} />
                        Clock In with QR Code
                    </button>
                </div>
            )}

            {/* Recent Entries */}
            <div className="mt-8">
                <h2 className="text-lg font-semibold mb-4">Recent Clock Entries</h2>
                {/* TODO: Add recent entries list */}
            </div>
        </div>
    )
}
```

**Step 3: Commit staff time clock page**

```bash
git add app/time-clock/*.tsx
git commit -m "feat(clock): create staff time clock page with QR scanner"
```

---

## Verification

After all tasks are complete:

1. Run `bun run lint` - should pass
2. Run `bun run build` - should build successfully
3. Run `bun run db:migrate` - all migrations applied
4. Test QR code generation as admin
5. Test QR code scanning for clock-in
6. Test unrestricted clock-out
7. Verify calendar view shows entries
8. Verify staff status view shows correctly

## Notes

- QR codes rotate daily per branch
- Clock-in requires scanning QR code (prevents remote clock-in)
- Clock-out can be done from anywhere (as per requirements)
- Admin can view all staff time entries in calendar format
- `time_clock_admin` access flag controls who can view/manage time clocks
- All clock entries track the branch and device info for audit purposes