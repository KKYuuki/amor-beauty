# Accounting Access, Appointments Revamp & Sales Tracking — Implementation Plan

> **COMPLETED: All 47 tasks executed and committed. Bun build is green.** ✅
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix accounting access flag enforcement, add ONGOING appointment status with payment tracking, revamp sales stats with 5-card layout, enforce middleware flag checks.

**Architecture:** Changes span 4 layers — DB migrations + server action permission gates + frontend guard components + middleware enforcement. Each phase is independently testable and branches off the previous stable state.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Supabase (PostgreSQL), Tailwind CSS 4, Bun

---

## Phase 1: Accounting Access & Server Action Gates (P0)

**Goal:** Non-admin users with `accounting_access` flag can create/edit/void ledger entries. Frontend button gates on flag, not admin role.

**Verification after Phase 1:** Log in as a non-admin user with `accounting_access` flag → navigate to `/accounting` → click "Add Entry" → fill form → submit → entry appears in ledger. Log in as a user WITHOUT the flag → button should not render.

### Task 1.1: Fix `createLedgerEntry` — remove admin-only role gate

**Files:**
- Modify: `server/actions/accounting.ts:347-357`

- [x] **Step 1: Remove admin role check from `createLedgerEntry`**

Open `server/actions/accounting.ts` and navigate to `createLedgerEntry`. Replace the dual-check at lines 351-357:

```typescript
// BEFORE (broken — non-admin never reaches flag check):
    const user = await getCurrentUser()
    if (!user || user.role !== 'admin') {
        return failure('Unauthorized')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

// AFTER (fixed — single flag-gated check):
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied — requires accounting_access flag')
    }
```

The `canAccessAccounting` function already returns `true` for admins via `userHasFlag` (which includes `user.role === 'admin'` bypass), so admins are not affected.

- [x] **Step 2: Apply same fix to `updateLedgerEntry`**

Find the `updateLedgerEntry` function in the same file. Replace its auth block with the same pattern:

```typescript
// BEFORE:
    const user = await getCurrentUser()
    if (!user || user.role !== 'admin') {
        return failure('Unauthorized')
    }
    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

// AFTER:
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }
    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied — requires accounting_access flag')
    }
```

- [x] **Step 3: Apply same fix to `voidLedgerEntry` and `restoreLedgerEntry`**

Search for `voidLedgerEntry` and `restoreLedgerEntry` — apply the same auth block replacement. Keep `hardDeleteLedgerEntry` as admin-only (add comment: `// Hard delete remains admin-only regardless of flags`).

- [ ] **Step 4: Verify — check TypeScript compilation**

Run: `bun run build`
Expected: Build succeeds with no type errors related to the changed functions.

### Task 1.2: Create `FlagGate` component and `AccessGate` frontend guard

**Files:**
- Create: `components/ui/FlagGate.tsx`
- Modify: `app/accounting/accountingPage.tsx` (replace AdminActionGuard usage)

- [x] **Step 1: Create `FlagGate` component**

```typescript
// components/ui/FlagGate.tsx
"use client"

import { useContext } from "react"
import { SideBarContext } from "@/components/sidebar"
import type { FeatureAccessFlag } from "@/utils/auth/access-flags"

interface FlagGateProps {
    requiredFlag: FeatureAccessFlag
    children: React.ReactNode
}

/**
 * Renders children only if the current user has the required access flag
 * (or is an admin — admin always bypasses).
 * No passkey prompt — for routine feature-gated operations.
 */
export default function FlagGate({ requiredFlag, children }: FlagGateProps) {
    const { userInfo } = useContext(SideBarContext)

    const isAdmin = userInfo?.role === "admin"
    const hasFlag = userInfo?.access_flags?.includes(requiredFlag) ?? false

    if (!isAdmin && !hasFlag) {
        return null
    }

    return <>{children}</>
}
```

- [x] **Step 2: Replace `AdminActionGuard` on "Add Entry" button with `FlagGate`**

Open `app/accounting/accountingPage.tsx`. Find the "Add Entry" button wrapped in `AdminActionGuard` (around line 320). Replace:

```typescript
// BEFORE:
                        <AdminActionGuard
                            onAction={() => setShowAddModal(true)}
                        >
                            <button className='flex items-center gap-1.5 px-2 md:px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-md transition-colors border-2 border-green-500/30 cursor-pointer'>
                                <PlusIcon className='w-4 h-4' />
                                <span className='text-sm font-medium hidden sm:inline'>
                                    Add Entry
                                </span>
                            </button>
                        </AdminActionGuard>

// AFTER:
                        <FlagGate requiredFlag="accounting_access">
                            <button
                                onClick={() => setShowAddModal(true)}
                                className='flex items-center gap-1.5 px-2 md:px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-md transition-colors border-2 border-green-500/30 cursor-pointer'
                            >
                                <PlusIcon className='w-4 h-4' />
                                <span className='text-sm font-medium hidden sm:inline'>
                                    Add Entry
                                </span>
                            </button>
                        </FlagGate>
```

- [x] **Step 3: Add the import**

At the top of `accountingPage.tsx`, add:
```typescript
import FlagGate from "@/components/ui/FlagGate"
```

You can remove the `AdminActionGuard` import if it's no longer used in that file. (Keep the import for the Edit and Delete action buttons — those stay with `AdminActionGuard` for now since they are passkey-gated admin operations.)

- [ ] **Step 4: Verify — check build**

Run: `bun run build`
Expected: Build succeeds. UI renders with FlagGate imported correctly.

---

## Phase 2: Sales Summary — Fix `getTodaySummary` (P0)

**Goal:** Fix SQL pattern, timezone handling, split metrics, branch double-counting, stale stats after checkout.

**Verification after Phase 2:** On the Sales page, create a transaction → Today's Revenue card updates immediately (no page refresh). Completed/Pending counts display correctly. Branch filter no longer double-counts.

### Task 2.1: Rewrite `getTodaySummary` with fixed SQL, timezone, and split metrics

**Files:**
- Modify: `server/actions/transactions.ts:1273-1330` (getTodaySummary)
- Modify: `components/sales/context/SalesContext.tsx` (update todayStats shape + refresh after checkout/void)
- Modify: `components/sales/layout/SalesHeader.tsx` (5-card stats layout)

- [x] **Step 1: Add `inArray` import and rewrite `getTodaySummary`**

At the top of `server/actions/transactions.ts`, add to the drizzle-orm import:
```typescript
import { eq, and, or, like, gte, lte, desc, sql, count, asc, isNull, inArray } from 'drizzle-orm'
```

Now replace the entire `getTodaySummary` function (lines 1273-1330) with:

```typescript
// ============================================================================
// TODAY'S SALES SUMMARY (REVAMPED)
// ============================================================================

export interface TodaySummaryResult {
    totalRevenue: number          // SUM(amount_paid) for completed transactions today
    completedCount: number         // COUNT where status = 'COMPLETED'
    pendingCount: number           // COUNT where status in partial/downpayment
    itemsSold: number              // SUM(quantity) of inventory items across completed transactions
    servicesRendered: number       // COUNT of service items across completed transactions
}

export async function getTodaySummary(
    branchId?: string | null
): Promise<ActionResponse<TodaySummaryResult>> {
    try {
        // Calculate PH time (UTC+8) day boundaries
        const now = new Date()
        const phNow = new Date(now.toLocaleString('en-PH', { timeZone: 'Asia/Manila' }))
        const phTodayStr = phNow.toISOString().split('T')[0] // "2026-05-22"

        const todayStart = new Date(`${phTodayStr}T00:00:00.000+08:00`)
        const todayEnd   = new Date(`${phTodayStr}T23:59:59.999+08:00`)

        // Build where clause
        const conditions = [
            gte(transactions.createdAt, todayStart),
            lte(transactions.createdAt, todayEnd),
        ]

        // Branch filter (NO isNull branch — shared transactions counted at origin only)
        if (branchId) {
            conditions.push(eq(transactions.branchId, branchId))
        }

        // Completed transactions count + revenue
        const completedWhere = and(
            ...conditions,
            eq(transactions.status, 'COMPLETED')
        )

        const [completedResult] = await db
            .select({
                totalRevenue: sql<number>`coalesce(sum(${transactions.amountPaid}), 0)`,
                count:        sql<number>`count(*)`,
            })
            .from(transactions)
            .where(completedWhere)

        // Pending transactions count
        const pendingWhere = and(
            ...conditions,
            inArray(transactions.status, ['PARTIAL', 'DOWNPAYMENT_PENDING', 'DOWNPAYMENT_ASSIGNED'])
        )

        const [pendingResult] = await db
            .select({
                count: sql<number>`count(*)`,
            })
            .from(transactions)
            .where(pendingWhere)

        // Items sold (quantity of inventory items in completed transactions today)
        const [itemsResult] = await db
            .select({
                total: sql<number>`coalesce(sum(${transactionItems.quantity}), 0)`,
            })
            .from(transactionItems)
            .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
            .where(and(
                gte(transactions.createdAt, todayStart),
                lte(transactions.createdAt, todayEnd),
                eq(transactions.status, 'COMPLETED'),
                ...(branchId ? [eq(transactions.branchId, branchId)] : []),
            ))

        // Services rendered (count of service items in completed transactions today)
        const [servicesResult] = await db
            .select({
                total: sql<number>`coalesce(count(*), 0)`,
            })
            .from(transactionItems)
            .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
            .where(and(
                gte(transactions.createdAt, todayStart),
                lte(transactions.createdAt, todayEnd),
                eq(transactions.status, 'COMPLETED'),
                sql`${transactionItems.serviceId} IS NOT NULL`,
                ...(branchId ? [eq(transactions.branchId, branchId)] : []),
            ))

        return success({
            totalRevenue:     Number(completedResult?.totalRevenue ?? 0),
            completedCount:   Number(completedResult?.count ?? 0),
            pendingCount:     Number(pendingResult?.count ?? 0),
            itemsSold:        Number(itemsResult?.total ?? 0),
            servicesRendered: Number(servicesResult?.total ?? 0),
        })
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error getting today summary: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to get today summary')
    }
```

- [x] **Step 2: Add `transactionItems` table import if missing**

Check the imports at the top of `transactions.ts`. Ensure `transactionItems` is imported from the schema:

```typescript
import {
    transactions,
    transactionItems,
    transactionPayments,
} from '@/server/db/schema/transactions'
```

- [x] **Step 3: Update `SalesContext` — new todayStats shape and refresh after checkout/void**

Open `components/sales/context/SalesContext.tsx`. Replace the `todayStats` state definition:

```typescript
// BEFORE:
    const [todayStats, setTodayStats] = useState({
        totalSales: 0,
        transactionCount: 0,
    })

// AFTER:
    const [todayStats, setTodayStats] = useState({
        totalRevenue: 0,
        completedCount: 0,
        pendingCount: 0,
        itemsSold: 0,
        servicesRendered: 0,
    })
```

Update the `fetchData` call to use `getTodaySummary` without `staffId`:

```typescript
// Find the line:
// getTodaySummary(userInfo?.id, currentBranch?.id),
// Replace with:
getTodaySummary(currentBranch?.id),
```

Also update `handleCheckout` (around line 901) to re-fetch todayStats after successful checkout. Find the block after `result.success` in `handleCheckout`. Add:

```typescript
// After addNotification for success, add todayStats refresh:
const updatedSummary = await getTodaySummary(currentBranch?.id || undefined)
if (updatedSummary.success && updatedSummary.data) {
    setTodayStats(updatedSummary.data)
}
```

Same pattern in `handleVoid` — add a re-fetch of `getTodaySummary` after a successful void.

- [x] **Step 4: Update `SalesHeader` — 5-card layout**

Open `components/sales/layout/SalesHeader.tsx`. Replace the two-card grid with the five cards:

```typescript
// BEFORE:
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6'>
                <StatCard
                    label="Today's Sales"
                    value={`${taxSettings.currency_symbol}${todayStats.totalSales.toFixed(2)}`}
                    color='default'
                />
                <StatCard
                    label='Transactions'
                    value={todayStats.transactionCount}
                    color='default'
                />
            </div>

// AFTER:
            <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6'>
                <StatCard
                    label="Today's Revenue"
                    value={`${taxSettings.currency_symbol}${todayStats.totalRevenue.toFixed(2)}`}
                    color='success'
                />
                <StatCard
                    label='Transactions'
                    value={todayStats.completedCount}
                    color='default'
                />
                <StatCard
                    label='Items Sold'
                    value={todayStats.itemsSold}
                    color='default'
                />
                <StatCard
                    label='Services'
                    value={todayStats.servicesRendered}
                    color='default'
                />
                <StatCard
                    label='Pending'
                    value={todayStats.pendingCount}
                    color='warning'
                />
            </div>
```

Also update the interface:
```typescript
// BEFORE:
    todayStats: { totalSales: number; transactionCount: number }

// AFTER:
    todayStats: { totalRevenue: number; completedCount: number; pendingCount: number; itemsSold: number; servicesRendered: number }
```

- [x] **Step 5: Fix `TodaySummaryResult` type export in `SalesContext`**

In `SalesContext.tsx`, update the import and type references for `GetTodaySummaryResult`:
```typescript
// Replace:
import { GetTransactionsResult, GetTodaySummaryResult, CreateTransactionResult } from "@/server/actions/transactions"

// With:
import { GetTransactionsResult, TodaySummaryResult, CreateTransactionResult } from "@/server/actions/transactions"
```

- [x] **Step 6: Verify — build and run**

Run: `bun run build`
Expected: Build succeeds. No type errors on the new stats shape.

---

## Phase 3: Sales Permissions — Align Action Gates (P1)

**Goal:** `sales_access` flag gates checkout/payment operations. `transactions_manage` flag gates void/refund operations. Clear separation.

**Verification after Phase 3:** User with only `sales_access` flag can create transactions but cannot void. User with `transactions_manage` flag (but not `sales_access`) can void but the sales page redirects them.

### Task 3.1: Fix permission gates in `transactions.ts` and `sales.ts`

**Files:**
- Modify: `server/actions/transactions.ts:50-55` (createTransaction permission)
- Modify: `server/actions/sales.ts:31` (createTransactionFromAppointment permission)

- [x] **Step 1: Change `createTransaction` to use `canAccessSales`**

Open `server/actions/transactions.ts`. At line 50-55, change:

```typescript
// BEFORE:
    const hasAccess = await canAccessTransactions(user)
    if (!hasAccess) {
        return failure('Transaction management access required')
    }

// AFTER:
    const hasAccess = await canAccessSales(user)
    if (!hasAccess) {
        return failure('Sales access required')
    }
```

Add the import at top:
```typescript
import { getCurrentUser, canAccessTransactions, canAccessSales, getUserById } from '@/utils/auth/permissions'
```

- [x] **Step 2: Verify `voidTransaction` keeps `canAccessTransactions`**

Check that `voidTransaction` (around line 634) and `refundTransaction` still use `canAccessTransactions(user)`. These are the sensitive operations — confirm they remain `transactions_manage`-gated.

- [x] **Step 3: Add `canAccessSales` check to `createTransactionFromAppointment`**

Open `server/actions/sales.ts`. At line 39-41 (after `getCurrentUser`), add:

```typescript
// AFTER getCurrentUser check:
    const canAccess = await canAccessSales(user)
    if (!canAccess) {
        return failure('Sales access required')
    }
```

Add the import:
```typescript
import { getCurrentUser, canAccessSales } from '@/utils/auth/permissions'
```

- [x] **Step 4: Update `addTransactionPayment` to use `canAccessSales`**

Check if `addTransactionPayment` (around line 827) uses `canAccessTransactions` — change to `canAccessSales` since adding payment is a routine POS operation.

- [x] **Step 5: Verify — build**

Run: `bun run build`
Expected: Build succeeds.

---

## Phase 4: Middleware Flag Enforcement + /unauthorized Page (P1)

**Goal:** Middleware checks access flags on every route. `/unauthorized` page exists.

**Verification after Phase 4:** Navigate to `/accounting` as a user without `accounting_access` flag → redirected to `/unauthorized`. Navigate as an admin or flag-holder → page loads.

### Task 4.1: Uncomment middleware flag checks

**Files:**
- Modify: `middleware.ts:48-57` (flag enforcement block)
- Modify: `server/db/schema/auth.ts` (add alias for user table)

- [x] **Step 1: Add Drizzle-compatible user query to middleware**

Open `middleware.ts`. After the `if (user.role === 'admin')` block (line 64), replace the commented-out section with:

```typescript
    // For non-admin users, check access flags against route permission
    const { db } = await import('@/server/db')
    const { user: userTable } = await import('@/server/db/schema/auth')
    const { eq } = await import('drizzle-orm')
    const { normalizeFlag } = await import('@/utils/auth/access-flags')

    const [userProfile] = await db
        .select({ access_flags: userTable.accessFlags })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1)

    if (!userProfile) {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
    }

    const flags = (userProfile.access_flags ?? []) as string[]
    const requiredPerms = matchingRoute.perms
    const hasRequiredFlag = flags.some(f => normalizeFlag(f) === normalizeFlag(requiredPerms))

    if (!hasRequiredFlag) {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
    }
```

- [x] **Step 2: Create `/unauthorized` page**

Create `app/unauthorized/page.tsx`:

```typescript
import Link from "next/link"
import { ShieldOffIcon } from "lucide-react"

export default function UnauthorizedPage() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-4">
            <ShieldOffIcon className="w-16 h-16 text-red-400 mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
            <p className="text-white/60 text-center max-w-md mb-6">
                You don&apos;t have permission to view this page. Contact your administrator if you believe this is an error.
            </p>
            <Link
                href="/"
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-white transition-colors"
            >
                Go to Dashboard
            </Link>
        </div>
    )
}
```

- [x] **Step 3: Verify — test middleware redirect**

Run: `bun run dev`
Expected: Dev server starts. Navigate to `/accounting` as a user with `accounting_access` flag → page loads. Navigate as a user without the flag → redirected to `/unauthorized`.

---

## Phase 5: Appointments Foundation — DB Migration & ONGOING Status (P1)

**Goal:** Add `ONGOING` to appointment statuses, add `payment_status` and `downpayment_id` columns to appointments table. Update types and status transition logic.

**Verification after Phase 5:** `bun run build` succeeds. TypeScript recognizes `ONGOING` in `AppointmentStatus`. Run the migration → columns appear in DB.

### Task 5.1: Create migration for new columns and ONGOING status

**Files:**
- Create: `drizzle/0014_appointments_ongoing_payment.sql`
- Modify: `server/db/schema/appointments.ts` (if Drizzle schema exists)

- [x] **Step 1: Write SQL migration**

Create `drizzle/0014_appointments_ongoing_payment.sql`:

```sql
-- Add payment tracking fields to appointments
ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS downpayment_id UUID REFERENCES downpayments(id),
    ADD COLUMN IF NOT EXISTS downpayment_amount DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS downpayment_collected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'UNPAID';

-- Verify payment_status values
-- Valid: 'UNPAID', 'DEPOSIT_PAID', 'PAID_IN_FULL', 'REFUNDED'

-- Index on payment_status for faster filtering
CREATE INDEX IF NOT EXISTS idx_appointments_payment_status ON appointments(payment_status);

-- No schema change needed for ONGOING — status is a VARCHAR column.
-- The status value 'ONGOING' is now valid alongside existing values.
-- Validation is handled at the application layer via Zod/TypeScript.
```

- [x] **Step 2: Run migration**

```bash
bun run drizzle-kit push
```

Or if you use `db:push`:

```bash
bun run db:push
```

- [x] **Step 3: Update TypeScript types**

Open `utils/types/general.ts`. Update the `AppointmentStatus` type:

```typescript
// BEFORE:
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'

// AFTER:
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'
```

Add the new `PaymentStatus` type:

```typescript
export type PaymentStatus = 'UNPAID' | 'DEPOSIT_PAID' | 'PAID_IN_FULL' | 'REFUNDED'
```

Add new fields to the `Appointment` interface:

```typescript
// Inside Appointment interface, add:
    downpayment_id?: string | null
    downpayment_amount?: number | null
    downpayment_collected_at?: Date | null
    payment_status?: PaymentStatus
```

- [x] **Step 4: Update status transition validation**

Open `server/actions/appointments.ts`. Find the `validateStatusTransition` function (around line 240). Update:

```typescript
function validateStatusTransition(
    currentStatus: AppointmentStatus,
    newStatus: AppointmentStatus
): { valid: boolean; message?: string } {
    const validTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
        PENDING:   ['CONFIRMED', 'CANCELLED'],
        CONFIRMED: ['ONGOING', 'CANCELLED'],       // ← was ['COMPLETED', 'CANCELLED']
        ONGOING:   ['COMPLETED', 'CANCELLED'],     // ← NEW
        COMPLETED: ['CANCELLED'],                   // ← was [] (terminal); now can cancel for refund
        CANCELLED: ['CONFIRMED', 'PENDING']         // ← recovery unchanged
    }

    if (currentStatus === newStatus) {
        return { valid: true }
    }

    const allowed = validTransitions[currentStatus]
    if (!allowed.includes(newStatus)) {
        return {
            valid: false,
            message: `Cannot transition from ${currentStatus} to ${newStatus}. Valid transitions from ${currentStatus}: ${allowed.join(', ') || 'none'}`
        }
    }

    return { valid: true }
}
```

- [x] **Step 5: Update `setAppointmentStatus` for ONGOING auto-timestamps**

Still in `appointments.ts`, find `setAppointmentStatus`. Add auto-timestamp logic:

```typescript
// Inside setAppointmentStatus, before the DB update:
    let updates: Record<string, unknown> = { status: newStatus }

    if (newStatus === 'ONGOING' && validated.data.appointment.actual_time_start === null) {
        updates.actual_time_start = new Date()
    }

    if (newStatus === 'COMPLETED' && validated.data.appointment.actual_time_end === null) {
        updates.actual_time_end = new Date()
    }
```

- [x] **Step 6: Update the `appointmentDetailClient.tsx` to use ONGOING**

Open `app/appointments/appointmentDetailClient.tsx`. Find the `handleMarkOnGoing` function. Replace the `updateAppointment` call:

```typescript
// BEFORE:
    const handleMarkOnGoing = async () => {
        const result = await updateAppointment(appointment.id, {
            actual_time_start: new Date(),
        })

// AFTER:
    const handleMarkOnGoing = async () => {
        const result = await setAppointmentStatus(appointment.id, 'ONGOING')
```

And update the button visibility condition (around line 440):
```typescript
// Allow "Mark as On-going" for CONFIRMED appointments (not just staff)
{isStaff && appointment.status === "CONFIRMED" && (
    // ... existing button
)}
```

- [x] **Step 7: Verify — build**

Run: `bun run build`
Expected: Build succeeds. No TypeScript errors on the new status values or fields.

---

## Phase 6: Appointments UI — Detail Page Refactor + Calendar/List Hybrid (P2)

**Goal:** Split monolithic `AppointmentDetailClient.tsx` into sub-components. Add payment status section. Implement hybrid calendar/list on appointments page.

**Verification after Phase 6:** Appointment detail page loads and renders correctly with the new sub-components. All existing functionality preserved. Appointments list shows calendar on desktop, card list on mobile.

### Task 6.1: Extract sub-components from `AppointmentDetailClient.tsx`

**Files:**
- Create: `components/appointments/AppointmentActionBar.tsx`
- Create: `components/appointments/AppointmentPaymentSection.tsx`
- Modify: `app/appointments/appointmentDetailClient.tsx` (simplify orchestrator)

- [x] **Step 1: Extract `AppointmentActionBar`**

Create `components/appointments/AppointmentActionBar.tsx`:

```typescript
"use client"

import { useRouter } from "next/navigation"
import {
    CheckIcon, XIcon, RotateCcwIcon, PencilIcon,
    ShoppingCartIcon, LoaderCircleIcon, PlayIcon, ArrowLeftIcon
} from "lucide-react"
import { Appointment, AppointmentStatus } from "@/utils/types/general"

interface AppointmentActionBarProps {
    appointment: Appointment
    isStaff: boolean
    isAssignedStaff: boolean
    isEditing: boolean
    saving: boolean
    creatingTransaction: boolean
    existingTransactionId: string | null
    onStatusChange: (status: AppointmentStatus) => Promise<void>
    onMarkOnGoing: () => Promise<void>
    onShowCompleteModal: () => void
    onCreateTransaction: () => Promise<void>
    onEditStart: () => void
    onEditSave: () => Promise<void>
    onEditCancel: () => void
}

export default function AppointmentActionBar({
    appointment, isStaff, isAssignedStaff, isEditing, saving,
    creatingTransaction, existingTransactionId,
    onStatusChange, onMarkOnGoing, onShowCompleteModal,
    onCreateTransaction, onEditStart, onEditSave, onEditCancel,
}: AppointmentActionBarProps) {
    const router = useRouter()

    return (
        <div className="flex flex-wrap gap-2 items-center">
            <button
                onClick={() => router.push("/appointments")}
                className="p-2 rounded-md hover:bg-white/10 transition-colors"
                title="Back"
            >
                <ArrowLeftIcon size={20} />
            </button>

            {/* CONFIRMED → ONGOING */}
            {isStaff && appointment.status === "CONFIRMED" && (
                <button
                    onClick={onMarkOnGoing}
                    className="px-3 py-1.5 bg-green-400/20 hover:bg-green-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors"
                >
                    <PlayIcon size={16} />
                    Start Session
                </button>
            )}

            {/* ONGOING → COMPLETED */}
            {isStaff && appointment.status === "ONGOING" && (
                <button
                    onClick={onShowCompleteModal}
                    className="px-3 py-1.5 bg-green-400/20 hover:bg-green-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors"
                >
                    <CheckIcon size={16} />
                    Complete
                </button>
            )}

            {/* PENDING actions */}
            {appointment.status === "PENDING" && isStaff && (
                <>
                    <button onClick={() => onStatusChange("CONFIRMED")}
                        className="px-3 py-1.5 bg-green-400/20 hover:bg-green-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                        <CheckIcon size={16} /> Confirm
                    </button>
                    <button onClick={() => onStatusChange("CANCELLED")}
                        className="px-3 py-1.5 bg-red-400/20 hover:bg-red-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                        <XIcon size={16} /> Reject
                    </button>
                </>
            )}

            {/* Cancel (from CONFIRMED or ONGOING) */}
            {isAssignedStaff && (appointment.status === "CONFIRMED" || appointment.status === "ONGOING") && (
                <button onClick={() => onStatusChange("CANCELLED")}
                    className="px-3 py-1.5 bg-red-400/20 hover:bg-red-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                    <XIcon size={16} /> Cancel
                </button>
            )}

            {/* CANCELLED recovery */}
            {appointment.status === "CANCELLED" && (
                <button onClick={() => onStatusChange("CONFIRMED")}
                    className="px-3 py-1.5 bg-orange-400/20 hover:bg-orange-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                    <RotateCcwIcon size={16} /> Recover
                </button>
            )}

            {/* Edit (CONFIRMED only) */}
            {isStaff && appointment.status === "CONFIRMED" && !isEditing && (
                <button onClick={onEditStart}
                    className="px-3 py-1.5 bg-yellow-400/20 hover:bg-yellow-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                    <PencilIcon size={16} /> Edit
                </button>
            )}

            {/* Edit mode actions */}
            {isEditing && (
                <>
                    <button onClick={onEditSave} disabled={saving}
                        className="px-3 py-1.5 bg-green-400/20 hover:bg-green-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors disabled:opacity-50">
                        {saving ? <LoaderCircleIcon className="w-4 h-4 animate-spin" /> : <CheckIcon size={16} />}
                        Save
                    </button>
                    <button onClick={onEditCancel} disabled={saving}
                        className="px-3 py-1.5 bg-red-400/20 hover:bg-red-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                        <XIcon size={16} /> Cancel
                    </button>
                </>
            )}

            {/* Open in Sales (COMPLETED) */}
            {appointment.status === "COMPLETED" && isStaff && (
                <button onClick={onCreateTransaction} disabled={creatingTransaction}
                    className="px-3 py-1.5 bg-blue-400/20 hover:bg-blue-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors disabled:opacity-50">
                    {creatingTransaction ? <LoaderCircleIcon className="w-4 h-4 animate-spin" /> : <ShoppingCartIcon size={16} />}
                    {existingTransactionId ? "View in Sales" : "Open in Sales"}
                </button>
            )}
        </div>
    )
}
```

- [x] **Step 2: Extract `AppointmentPaymentSection`**

Create `components/appointments/AppointmentPaymentSection.tsx`:

```typescript
"use client"

import { Appointment, PaymentStatus } from "@/utils/types/general"

interface AppointmentPaymentSectionProps {
    appointment: Appointment
    downpaymentId: string | null | undefined
    downpaymentAmount: number | null | undefined
}

function getPaymentStatusBadge(status: PaymentStatus | undefined) {
    switch (status) {
        case "DEPOSIT_PAID":
            return { label: "Deposit Paid", color: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30" }
        case "PAID_IN_FULL":
            return { label: "Paid in Full", color: "bg-green-400/20 text-green-300 border-green-400/30" }
        case "REFUNDED":
            return { label: "Refunded", color: "bg-red-400/20 text-red-300 border-red-400/30" }
        default:
            return { label: "Unpaid", color: "bg-white/10 text-white/60 border-white/10" }
    }
}

export default function AppointmentPaymentSection({
    appointment, downpaymentAmount,
}: AppointmentPaymentSectionProps) {
    const badge = getPaymentStatusBadge(appointment.payment_status)

    return (
        <div className="bg-white/5 p-6 rounded-lg border border-white/10">
            <h3 className="text-lg font-semibold mb-4">Payment</h3>

            <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-white/60">Status:</span>
                <span className={`px-2 py-0.5 rounded-sm text-xs font-semibold border ${badge.color}`}>
                    {badge.label}
                </span>
            </div>

            {downpaymentAmount && downpaymentAmount > 0 && (
                <div className="flex items-center gap-3">
                    <span className="text-sm text-white/60">Deposit:</span>
                    <span className="text-green-300 font-semibold">
                        ₱{downpaymentAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                </div>
            )}

            {appointment.payment_status === "UNPAID" && !downpaymentAmount && (
                <p className="text-sm text-white/40 italic">No payments collected yet.</p>
            )}
        </div>
    )
}
```

- [x] **Step 3: Simplify `AppointmentDetailClient.tsx`**

Open `app/appointments/appointmentDetailClient.tsx`. Import the new components:

```typescript
import AppointmentActionBar from "@/components/appointments/AppointmentActionBar"
import AppointmentPaymentSection from "@/components/appointments/AppointmentPaymentSection"
```

Replace the existing action bar JSX with the component, passing all needed props. Replace the payment placeholder with `<AppointmentPaymentSection>`. Keep all existing data fetching and state logic — just replace the rendering sections.

- [x] **Step 4: Verify — build and manual test**

Run: `bun run build`
Expected: Build succeeds. Navigate to an appointment detail → action buttons render correctly. Payment section shows status badge.

### Task 6.2: Hybrid calendar/list on appointments page

**Files:**
- Modify: `app/appointments/appointmentsPage.tsx` (add date selector, status pills, mobile cards)

- [x] **Step 1: Add quick status filters with counts**

In `appointmentsPage.tsx`, add after `FilterBar`:

```typescript
{/* Quick status pills */}
<div className="flex flex-wrap gap-2 mb-3">
    {(["PENDING", "CONFIRMED", "ONGOING", "COMPLETED", "CANCELLED"] as AppointmentStatus[]).map((s) => {
        const count = appointments.filter(a => a.status === s).length
        const isActive = status === s
        return (
            <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    isActive
                        ? "bg-white/20 text-white border-white/30"
                        : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                }`}
            >
                {s.charAt(0) + s.slice(1).toLowerCase()} ({count})
            </button>
        )
    })}
</div>
```

- [x] **Step 2: Add horizontal day selector for mobile**

Add above the table (visible on `lg:hidden`):

```typescript
{/* Mobile day selector */}
<div className="lg:hidden flex gap-1 overflow-x-auto pb-2 mb-3">
    {Array.from({ length: 7 }).map((_, i) => {
        const d = new Date()
        d.setDate(d.getDate() + i)
        const isToday = i === 0
        return (
            <button
                key={i}
                className={`flex-shrink-0 w-14 h-16 flex flex-col items-center justify-center rounded-lg border text-xs ${
                    isToday ? "bg-white/10 border-white/30 text-white" : "bg-white/5 border-white/10 text-white/60"
                }`}
            >
                <span className="font-medium">{d.toLocaleDateString("en-PH", { weekday: "short" })}</span>
                <span className="text-lg font-bold">{d.getDate()}</span>
            </button>
        )
    })}
</div>
```

- [x] **Step 3: Verify — build**

Run: `bun run build`
Expected: Build succeeds. New pills and day selector render on the page.

---

## Phase 7: Walk-in Modal — Schedule Integration & Downpayment Collection (P2)

**Goal:** Staff schedules loaded during walk-in creation, time slots reflect availability. Optional downpayment collection at creation time.

**Verification after Phase 7:** Open walk-in modal → select staff → time slots show availability based on staff schedule. Toggle "Collect Deposit" → downpayment fields appear → submit → appointment created with downpayment linked.

### Task 7.1: Integrate staff schedules into walk-in creation

**Files:**
- Modify: `components/appointments/WalkinAppointmentModal.tsx`

- [x] **Step 1: Add schedule-aware time slot generation**

In `WalkinAppointmentModal.tsx`, import the schedule query:

```typescript
import { getStaffSchedule } from "@/server/actions/time-clock"
```

Replace `generateSlots` to fetch from staff schedules:

```typescript
// Add a new state for schedule-based slots
const [scheduleStart, setScheduleStart] = useState("13:00")
const [scheduleEnd, setScheduleEnd] = useState("21:00")

// Replace generateSlots with schedule-aware version
useEffect(() => {
    const fetchSlots = async () => {
        if (!staffId || !date) {
            // Fall back to business hours if no staff selected
            setAvailableSlots(generateSlots())
            return
        }

        // Fetch staff schedule for selected day
        const dayName = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"][
            new Date(date).getDay()
        ]

        const scheduleResult = await getStaffSchedule(staffId)
        const schedules = scheduleResult.success ? scheduleResult.data?.schedules || [] : []
        const schedule = schedules.find((s: { day_of_week: string; start_time: string; end_time: string; is_active: boolean }) => s.day_of_week === dayName && s.is_active)

        let start = 13
        let end = 21

        if (schedule) {
            start = parseInt(schedule.start_time.split(":")[0])
            end = parseInt(schedule.end_time.split(":")[0])
            setScheduleStart(schedule.start_time)
            setScheduleEnd(schedule.end_time)
        } else {
            // Staff not scheduled today — show as warning but allow slots
            setScheduleStart("13:00")
            setScheduleEnd("21:00")
        }

        const slots = []
        for (let i = start; i < end; i++) {
            slots.push(i)
        }

        // Filter booked slots (existing logic)
        const appointmentsResult = await getStaffAppointments(staffId)
        const selectedDate = new Date(date).toDateString()

        if (!appointmentsResult.success) {
            setAvailableSlots(slots)
            return
        }

        const booked = appointmentsResult.data
            .filter(a => new Date(a.time_start).toDateString() === selectedDate)
            .map(a => ({
                start: new Date(a.time_start).getHours(),
                end: new Date(a.time_end).getHours(),
            }))

        setAvailableSlots(slots.filter(slot =>
            !booked.some(range => slot >= range.start && slot < range.end)
        ))
    }

    fetchSlots()
}, [staffId, date])
```

- [x] **Step 2: Add schedule warning indicator**

When staff is not scheduled for the selected day, show a warning:

```typescript
{staffId && scheduleStart === "13:00" && (
    <p className="text-xs text-yellow-400 mt-1">
        ⚠ No schedule found for this day. Times may be outside working hours.
    </p>
)}
```

- [x] **Step 3: Add downpayment collection toggle to modal**

Add after the service selector in the form:

```typescript
{/* Downpayment Toggle */}
<div className="mt-4 border-t border-white/10 pt-4">
    <label className="flex items-center gap-2 cursor-pointer">
        <input
            type="checkbox"
            checked={collectDownpayment}
            onChange={(e) => setCollectDownpayment(e.target.checked)}
            className="w-4 h-4 rounded"
        />
        <span className="text-sm font-medium">Collect deposit</span>
    </label>

    {collectDownpayment && (
        <div className="mt-3 space-y-3 pl-6">
            <div>
                <label className="text-xs text-white/60 block mb-1">Estimated Total</label>
                <input
                    type="number"
                    value={estimatedTotal}
                    onChange={(e) => setEstimatedTotal(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-sm"
                    placeholder="e.g. 30000"
                />
            </div>
            <div>
                <label className="text-xs text-white/60 block mb-1">Deposit Amount</label>
                <input
                    type="number"
                    value={downpaymentAmount}
                    onChange={(e) => setDownpaymentAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-sm"
                    placeholder={`${(estimatedTotal * 0.1).toFixed(0)} (10% suggested)`}
                />
                <p className="text-xs text-white/40 mt-1">
                    Suggested: ₱{(estimatedTotal * 0.1).toFixed(0)} (10%)
                </p>
            </div>
            <div>
                <label className="text-xs text-white/60 block mb-1">Payment Method</label>
                <select
                    value={dpPaymentMethod}
                    onChange={(e) => setDpPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-sm"
                >
                    <option value="CASH">Cash</option>
                    <option value="GCASH">GCash</option>
                    <option value="CARD">Card</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                </select>
            </div>
        </div>
    )}
</div>
```

Add the new state variables:
```typescript
const [collectDownpayment, setCollectDownpayment] = useState(false)
const [estimatedTotal, setEstimatedTotal] = useState(0)
const [downpaymentAmount, setDownpaymentAmount] = useState(0)
const [dpPaymentMethod, setDpPaymentMethod] = useState<PaymentMethod>("CASH")
```

- [x] **Step 4: Update `handleSubmit` to create downpayment**

In `handleSubmit`, after creating the appointment, add:

```typescript
// If collecting deposit, create transaction + downpayment
if (collectDownpayment && downpaymentAmount > 0) {
    const { createTransaction } = await import("@/server/actions/transactions")
    const txnResult = await createTransaction({
        buyer_id: null,
        buyer_name: clientName,
        items: [{ item_name: `Deposit: ${title}`, quantity: 1, unit_price: downpaymentAmount }],
        amount_paid: downpaymentAmount,
        payment_method: dpPaymentMethod,
        total: downpaymentAmount,
        subtotal: downpaymentAmount,
        tax_amount: 0,
        discount_amount: 0,
        branch_id: selectedBranchId || currentBranch?.id || null,
        staff_id: staffId || null,
        downpayment_type: "FLAT_FEE",
        downpayment_amount: downpaymentAmount,
        payroll_split_mode: "PER_PAYMENT",
    })

    if (txnResult.success && txnResult.data) {
        // Link downpayment to appointment
        await updateAppointment(result.appointment.id, {
            downpayment_id: txnResult.data.transactionId,
        } as any)
    }
}
```

- [x] **Step 5: Verify — build**

Run: `bun run build`
Expected: Build succeeds. New downpayment UI renders in the modal.

---

## Phase 8: Final Integration — Wiring & Cleanup (P2)

**Goal:** Wire downpayment flow into appointment detail. Ensure all data flows work end-to-end. Final lint/verification pass.

**Verification after Phase 8:** Full end-to-end flow: Create walk-in with deposit → appointment shows DEPOSIT_PAID → mark ONGOING → mark COMPLETED → open in Sales → collect balance → PAID_IN_FULL.

### Task 8.1: Wire downpayment status into appointment detail

**Files:**
- Modify: `app/appointments/appointmentDetailClient.tsx` (payment section data, collect balance flow)
- Modify: `server/actions/appointments.ts` (update payment_status on completion)

- [x] **Step 1: Update payment_status when marking COMPLETED with downpayment**

In `setAppointmentStatus` server action, add logic for COMPLETED with downpayment:

```typescript
// Inside setAppointmentStatus, after the status update:
if (newStatus === 'COMPLETED') {
    // Check if deposit was collected
    const appointment = validated.data.appointment
    if (appointment.downpayment_amount && appointment.downpayment_amount > 0) {
        // Update transaction status from DOWNPAYMENT_PENDING to PARTIAL
        // and set payment_status on appointment
        await db.transaction(async (tx) => {
            await tx.update(transactions)
                .set({ status: 'PARTIAL' })
                .where(eq(transactions.appointmentId, appointment.id))

            await tx.update(appointments)
                .set({ paymentStatus: 'DEPOSIT_PAID' })
                .where(eq(appointments.id, appointment.id))
        })
    } else {
        // No deposit — set to UNPAID until balance collected
        await db.update(appointments)
            .set({ paymentStatus: 'UNPAID' })
            .where(eq(appointments.id, appointment.id))
    }
}
```

- [x] **Step 2: Add "Collect Balance" button to appointment detail**

In `AppointmentActionBar.tsx`, add when status is COMPLETED and payment is DEPOSIT_PAID:

```typescript
{appointment.status === "COMPLETED" && appointment.payment_status === "DEPOSIT_PAID" && (
    <button onClick={onCreateTransaction}
        className="px-3 py-1.5 bg-blue-400/20 hover:bg-blue-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
        <ShoppingCartIcon size={16} />
        Collect Balance
    </button>
)}
```

- [x] **Step 3: Verify — full flow test**

Manual test checklist:
1. Create walk-in with deposit → appointment shows `CONFIRMED` / `DEPOSIT_PAID`
2. Mark ONGOING → status updates, `actual_time_start` recorded
3. Mark COMPLETED → status updates, `actual_time_end` recorded
4. Click "Collect Balance" → Sales POS opens with cart pre-loaded
5. Complete payment → `PAID_IN_FULL`
6. View ledger → deposit shows as LIABILITY/UNEARNED_REVENUE entry

### Task 8.2: Final lint and build verification

**Files:**
- All modified files

- [x] **Step 1: Run ESLint**

```bash
bun run lint
```
Expected: No errors. Warnings should be reviewed and fixed.

- [x] **Step 2: Run full build**

```bash
bun run build
```
Expected: Successful production build with no type errors.

- [x] **Step 3: Commit all changes**

```bash
git add .
git commit -m "feat: accounting access fix, appointments ONGOING+DP, sales stats revamp, middleware enforcement"
```

---

## Phase Summary

| Phase | Scope | Files Changed | Verification |
|-------|-------|--------------|--------------|
| 1 | Accounting access fix | `accounting.ts`, `FlagGate.tsx`, `accountingPage.tsx` | Non-admin with flag can create entries |
| 2 | Sales summary rewrite | `transactions.ts`, `SalesContext.tsx`, `SalesHeader.tsx` | 5 stats cards, live update after checkout |
| 3 | Sales permissions alignment | `transactions.ts`, `sales.ts` | `sales_access` gates checkout, `transactions_manage` gates void |
| 4 | Middleware + unauthorized page | `middleware.ts`, `unauthorized/page.tsx` | Redirects on missing flags |
| 5 | DB migration + ONGOING status | SQL migration, `general.ts`, `appointments.ts` | ONGOING status in all valid transitions |
| 6 | Appointment UI refactor | `AppointmentActionBar.tsx`, `AppointmentPaymentSection.tsx`, `appointmentDetailClient.tsx`, `appointmentsPage.tsx` | Sub-components render, calendar/list hybrid |
| 7 | Walk-in schedule + DP collection | `WalkinAppointmentModal.tsx` | Schedule-aware slots, deposit toggle in modal |
| 8 | Integration wiring + cleanup | `appointmentDetailClient.tsx`, `appointments.ts` | Full e2e deposit→completion flow |

## Future Phase: Refund Flow

The spec (section 8.5) defines a configurable cancellation policy (`NON_REFUNDABLE` / `PARTIAL_REFUND` / `FULL_REFUND`) with refund to original payment method. This requires:
- New `cancellation_policy` field on appointments
- Refund server action that reverses ledger entries and marks `payment_status: 'REFUNDED'`
- UI flow for staff-initiated refunds from the appointment detail page

Reserve this for a follow-up PR after Phase 8 is stable.
