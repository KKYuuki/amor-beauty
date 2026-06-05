# Pages Audit & Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit, fix, and improve the logic, flows, UI flows, branch integration, and accounting integration across Notify, Staff, Transactions, My Time Clock, and Time Clock pages.

**Architecture:** Each phase targets one page/feature area. Cross-cutting concerns (shared utilities, branch context, code duplication) are addressed in Phase 5. Lint/build fixes are Phase 6. Each task includes exact file paths and code where possible.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, Supabase, Drizzle ORM, Resend

---

## Phase 1: Notify Page Audit & Fixes

### Issues Found

| # | Category | Severity | Issue |
|---|----------|----------|-------|
| N1 | Logic | Medium | No auth/permission guard on page mount — any user with sidebar access can use it |
| N2 | Logic | High | Role filter hardcodes ADMIN/STAFF/CLIENT but `UserRoleType` includes "manager", "artist", "piercer", "shoe_tech" |
| N3 | Logic | Medium | Manual email tab has no client-side email validation |
| N4 | Logic | Low | `not-disabled:cursor-pointer` on send button is not a valid Tailwind class |
| N5 | UI Flow | Medium | No `PageWrapper` component used (inconsistent with other pages) |
| N6 | UI Flow | Low | No empty state when users list fails to load |
| N7 | Logic | Medium | `getProfiles()` response could be null — only checks `if (res)` but doesn't handle error notification |
| N8 | Branch | Medium | No branch filtering — notifications sent to all users regardless of branch assignment |
| N9 | UX | Low | Send button disabled state doesn't differentiate between "no subject" vs "no recipients" |

### Task 1.1: Add auth guard and PageWrapper to Notify page

**Files:**
- Modify: `app/notify/notifyPage.tsx:1-20`
- Modify: `app/notify/page.tsx`

**Step 1:** Wrap `NotifyClientPage` with permission check and `PageWrapper`.

In `app/notify/notifyPage.tsx`, add import for `PageWrapper` and admin guard:

```tsx
import PageWrapper from "@/components/page-wrapper"
import { SideBarContext } from "@/components/sidebar"
// ... existing imports
```

Add permission check at the top of the component:

```tsx
const { userInfo } = useContext(SideBarContext)

useEffect(() => {
    if (userInfo && !userInfo.access_flags?.includes('notify') && userInfo.role !== 'admin') {
        addNotification("You don't have permission to access this page", "ERROR")
    }
}, [userInfo])
```

Wrap the entire return JSX with `<PageWrapper>`.

**Step 2:** Run `bun run lint` to verify. Expected: PASS

**Step 3:** Commit: `fix(notify): add PageWrapper and permission guard`

---

### Task 1.2: Fix role filter to match all UserRoleTypes

**Files:**
- Modify: `app/notify/notifyPage.tsx:244-258`

**Step 1:** Replace the hardcoded role options with all `UserRoleType` values:

```tsx
<select
    value={roleFilter}
    onChange={(e) => setRoleFilter(e.target.value as UserRoleType | "")}
    className='...existing classes...'
>
    <option value=''>All Roles</option>
    <option value='admin'>Admin</option>
    <option value='manager'>Manager</option>
    <option value='staff'>Staff</option>
    <option value='artist'>Artist</option>
    <option value='piercer'>Piercer</option>
    <option value='shoe_tech'>Shoe Tech</option>
    <option value='client'>Client</option>
</select>
```

Update the role badge rendering (lines ~380-393) to handle all role types with distinct colors:

```tsx
const roleColors: Record<string, string> = {
    admin: "bg-orange-500/20 text-orange-300",
    manager: "bg-purple-500/20 text-purple-300",
    staff: "bg-blue-500/20 text-blue-300",
    artist: "bg-pink-500/20 text-pink-300",
    piercer: "bg-cyan-500/20 text-cyan-300",
    shoe_tech: "bg-amber-500/20 text-amber-300",
    client: "bg-green-500/20 text-green-300",
}
```

**Step 2:** Run `bun run lint`. Expected: PASS

**Step 3:** Commit: `fix(notify): use all UserRoleTypes in filter and role badges`

---

### Task 1.3: Add client-side email validation for manual input

**Files:**
- Modify: `app/notify/notifyPage.tsx:100-118` (`getRecipients` function)

**Step 1:** Add email validation in `getRecipients`:

```tsx
const getRecipients = (): { email: string; name: string; id?: string }[] => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (activeTab === "select") {
        return selectedUsers.map((u) => ({
            email: u.email,
            name: u.full_name,
            id: u.id,
        }))
    } else {
        return manualEmails
            .split(/[\n,]/)
            .map((e) => e.trim())
            .filter((e) => e.length > 0 && emailRegex.test(e))
            .map((e) => ({ email: e, name: "" }))
    }
}
```

Also add a check in `handleSend` to warn about invalid emails:

```tsx
const handleSend = async () => {
    const recipients = getRecipients()
    // ... existing validation ...

    // Check for invalid emails in manual mode
    if (activeTab === "manual") {
        const rawEmails = manualEmails.split(/[\n,]/).map(e => e.trim()).filter(e => e.length > 0)
        const invalidCount = rawEmails.length - recipients.length
        if (invalidCount > 0) {
            addNotification(`${invalidCount} invalid email(s) were skipped`, "WARNING")
        }
    }
    // ... rest of send logic ...
}
```

**Step 2:** Run `bun run lint`. Expected: PASS

**Step 3:** Commit: `fix(notify): add email validation for manual recipients`

---

### Task 1.4: Add error handling for getProfiles and fix invalid Tailwind class

**Files:**
- Modify: `app/notify/notifyPage.tsx:47-63`
- Modify: `app/notify/notifyPage.tsx:532`

**Step 1:** Add error handling for `getProfiles`:

```tsx
useEffect(() => {
    const fetchUsers = async () => {
        setLoading(true)
        try {
            const res = await getProfiles()
            if (res) {
                setUsers(
                    res.sort(
                        (a, b) =>
                            new Date(b.created_at).getTime() -
                            new Date(a.created_at).getTime()
                    )
                )
            } else {
                addNotification("Failed to load users", "ERROR")
            }
        } catch (error) {
            addNotification("Failed to load users", "ERROR")
        } finally {
            setLoading(false)
        }
    }
    fetchUsers()
}, [addNotification])
```

**Step 2:** Replace `not-disabled:cursor-pointer` on send and cancel buttons (lines 532, 571, 578) with valid Tailwind:

Replace:
```
disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-white/5 not-disabled:cursor-pointer
```
With:
```
disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-white/5 cursor-pointer
```

**Step 3:** Run `bun run lint`. Expected: PASS

**Step 4:** Commit: `fix(notify): add error handling and fix tailwind classes`

---

### Task 1.5: Add branch filtering to Notify

**Files:**
- Modify: `app/notify/notifyPage.tsx`
- Modify: `server/actions/email.ts` (if branch-scoped sending is desired)

**Step 1:** Import `BranchSelector` and add branch filter state:

```tsx
import BranchSelector from "@/components/branch-selector"
import { useBranchContext } from "@/components/branch-context"

// In component:
const { currentBranch } = useBranchContext()
const [branchFilter, setBranchFilter] = useState<string | null>(null)
```

**Step 2:** Add `BranchSelector` to the header area (after the `<h1>` section):

```tsx
<div className="flex items-center gap-3">
    <BranchSelector showAllOption />
</div>
```

**Step 3:** Filter users by branch when `currentBranch` is set:

```tsx
const filteredUsers = users.filter((user) => {
    if (currentBranch && !currentBranch.branch_ids?.includes(currentBranch.id)) {
        // If branch filter is set, show only users assigned to that branch
        return user.branch_ids?.includes(currentBranch.id) ?? true
    }
    return true
})
```

Use `filteredUsers` instead of `users` in the rendering and select-all logic.

**Step 4:** Run `bun run lint`. Expected: PASS

**Step 5:** Commit: `feat(notify): add branch filtering for recipients`

---

## Phase 2: Staff (Accounts) Page Audit & Fixes

### Issues Found

| # | Category | Severity | Issue |
|---|----------|----------|-------|
| S1 | UI Flow | Medium | No `PageWrapper` used |
| S2 | Logic | Medium | No error handling on `getProfiles()` and `getInactiveProfiles()` calls |
| S3 | Logic | Low | `fetchUsers` callback is missing `addNotification` in dependency array |
| S4 | UX | Medium | No link from user row to time clock entries or payroll |
| S5 | Branch | Medium | No way to view or edit branch assignments for users |
| S6 | UI Flow | Low | Page title says "Accounts" but nav says "Staff" |

### Task 2.1: Add PageWrapper and error handling to Accounts page

**Files:**
- Modify: `app/accounts/accountsPage.tsx`

**Step 1:** Import and wrap with `PageWrapper`:

```tsx
import PageWrapper from "@/components/page-wrapper"

export default function AccountsClientPage() {
    // ... existing code ...
    return (
        <PageWrapper>
            {/* existing content */}
        </PageWrapper>
    )
}
```

**Step 2:** Commit: `fix(accounts): add PageWrapper`

---

### Task 2.2: Add error handling to user data fetching

**Files:**
- Modify: `app/accounts/usersList.tsx:76-100`

**Step 1:** Add error handling and `addNotification` import:

```tsx
import { NotificationContext } from "@/components/notifications"

// In component:
const { addNotification } = useContext(NotificationContext)

const fetchUsers = useCallback(async () => {
    try {
        const res = await getProfiles()
        if (res) {
            setUsers(
                res.sort(
                    (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime()
                )
            )
        } else {
            addNotification("Failed to load users", "ERROR")
        }
    } catch (error) {
        addNotification("Failed to load users", "ERROR")
    }
}, [addNotification])

const fetchInactiveUsers = useCallback(async () => {
    try {
        const res = await getInactiveProfiles()
        if (res) {
            setInactiveUsers(
                res.sort(
                    (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime()
                )
            )
        } else {
            addNotification("Failed to load inactive users", "ERROR")
        }
    } catch (error) {
        addNotification("Failed to load inactive users", "ERROR")
    }
}, [addNotification])
```

**Step 2:** Run `bun run lint`. Expected: PASS

**Step 3:** Commit: `fix(accounts): add error handling for user fetching`

---

### Task 2.3: Add quick-action links from user rows to payroll/time-clock

**Files:**
- Modify: `components/accounts/UserRow.tsx` (or equivalent component)

**Step 1:** Add navigation links for "View Time Entries" and "View Payroll" in user row actions:

In the user row actions dropdown/area, add:

```tsx
<Link
    href={`/admin/time-clock?staffId=${user.id}`}
    className='text-sm text-blue-400 hover:text-blue-300'
>
    Time Clock
</Link>
```

A similar link for payroll can reference `/payroll?staffId=${user.id}` if payroll supports staff filtering.

**Step 2:** Commit: `feat(accounts): add quick links to time clock and payroll`

---

## Phase 3: Transactions Page Audit & Fixes

### Issues Found

| # | Category | Severity | Issue |
|---|----------|----------|-------|
| T1 | Logic | High | Client-side search filter happens AFTER server-side pagination, so filtered results may be fewer than expected |
| T2 | Logic | Medium | Export doesn't include the current search filter |
| T3 | Logic | Medium | `getSetting("currency_tax")` fetched on every data refresh (should be separate/cached) |
| T4 | UI Flow | Medium | No transaction detail view (clicking a row does nothing) |
| T5 | Logic | Medium | No void/refund action available from the list |
| T6 | Logic | Low | Transaction status filter and branch filter exist server-side but not exposed in UI |
| T7 | UI Flow | Low | Date filter reset doesn't clear custom date fields |
| T8 | Logic | Low | Export menu click-outside uses raw `addEventListener` (could use existing `useClickOutside` pattern) |

### Task 3.1: Move search filter to server-side

**Files:**
- Modify: `app/transactions/transactionsPage.tsx`
- Modify: `server/actions/transactions.ts:328-396` (`getTransactions`)

**Step 1:** Add `search` and `status` fields to `TransactionFilters`:

In `server/actions/transactions.ts`:

```tsx
export interface TransactionFilters {
    datePreset?: DateFilterPreset
    startDate?: string
    endDate?: string
    status?: 'COMPLETED' | 'PENDING' | 'PARTIAL' | 'VOIDED' | 'REFUNDED'
    branchId?: string
    search?: string
}
```

Add search filter to the `getTransactions` where clause:

```tsx
if (filters?.search) {
    const searchTerm = `%${filters.search}%`
    conditions.push(
        or(
            like(transactions.transactionNumber, searchTerm),
            sql`${transactions.buyerName} ILIKE ${searchTerm}`
        )
    )
}
```

Note: This requires joining with the `user` table for staff name search. The join approach:

```tsx
// If search is present, join with user and buyer
if (filters?.search) {
    const searchTerm = `%${filters.search}%`
    // Add SQL-level search across transaction_number, buyer_name, and staff name
    conditions.push(
        or(
            like(transactions.transactionNumber, searchTerm),
            like(transactions.buyerName, searchTerm)
        )!
    )
}
```

**Step 2:** Update client to pass `search` to server:

In `transactionsPage.tsx`, update `buildFilters`:

```tsx
const buildFilters = useCallback((): TransactionFilters => {
    return {
        datePreset,
        startDate: datePreset === "custom" ? customStartDate : undefined,
        endDate: datePreset === "custom" ? customEndDate : undefined,
        search: searchQuery || undefined,
    }
}, [datePreset, customStartDate, customEndDate, searchQuery])
```

Add `search` to the dependencies of `fetchData`:

```tsx
const fetchData = useCallback(async () => {
    // ... existing ...
}, [addNotification, buildFilters, page])
```

Remove the client-side `filteredTransactions` filter and use `transactions` directly.

**Step 3:** Run `bun run lint` then `bun run build`. Expected: PASS

**Step 4:** Commit: `fix(transactions): move search filter to server-side`

---

### Task 3.2: Add status and branch filters to Transactions UI

**Files:**
- Modify: `app/transactions/transactionsPage.tsx`

**Step 1:** Add state for status filter:

```tsx
const [statusFilter, setStatusFilter] = useState<TransactionFilters['status'] | ''>('')
```

Update `buildFilters` to include status:

```tsx
const buildFilters = useCallback((): TransactionFilters => {
    return {
        datePreset,
        startDate: datePreset === "custom" ? customStartDate : undefined,
        endDate: datePreset === "custom" ? customEndDate : undefined,
        search: searchQuery || undefined,
        status: (statusFilter || undefined) as TransactionFilters['status'],
        branchId: currentBranch?.id || undefined,
    }
}, [datePreset, customStartDate, customEndDate, searchQuery, statusFilter, currentBranch])
```

**Step 2:** Import `useBranchContext` and `BranchSelector`:

```tsx
import { useBranchContext } from "@/components/branch-context"
import BranchSelector from "@/components/branch-selector"
```

Add `currentBranch` from context:

```tsx
const { currentBranch } = useBranchContext()
```

**Step 3:** Add filter UI below the search bar:

```tsx
<div className='flex items-center gap-2 flex-wrap'>
    <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as TransactionFilters['status'] | '')}
        className='bg-white/10 hover:bg-white/20 transition-colors px-3 py-1 rounded-md text-sm cursor-pointer border-2 border-white/5'
    >
        <option value=''>All Statuses</option>
        <option value='COMPLETED'>Completed</option>
        <option value='PARTIAL'>Partial</option>
        <option value='VOIDED'>Voided</option>
        <option value='REFUNDED'>Refunded</option>
    </select>
</div>
```

Add `BranchSelector` to the header actions area.

**Step 4:** Reset status filter when filters change:

```tsx
useEffect(() => {
    setStatusFilter('')
    setCustomStartDate('')
    setCustomEndDate('')
}, [])
```

**Step 5:** Commit: `feat(transactions): add status and branch filters`

---

### Task 3.3: Cache currency setting and add transaction detail view

**Files:**
- Modify: `app/transactions/transactionsPage.tsx`
- Create: `app/transactions/[id]/page.tsx`

**Step 1:** Separate currency fetch from data fetch:

```tsx
useEffect(() => {
    const fetchCurrency = async () => {
        const taxData = await getSetting("currency_tax")
        if (taxData.success && taxData.data) {
            setCurrencySymbol(taxData.data.currency_symbol)
        }
    }
    fetchCurrency()
}, []) // Only fetch once on mount
```

Remove the `getSetting("currency_tax")` call from `fetchData`.

**Step 2:** Make transaction rows clickable:

```tsx
<tr
    key={txn.id}
    onClick={() => router.push(`/transactions/${txn.id}`)}
    className='hover:bg-white/5 transition-colors text-nowrap cursor-pointer'
>
```

**Step 3:** Create `app/transactions/[id]/page.tsx` — a transaction detail page that shows:
- Full transaction info (items, payments, timestamps)
- Void/refund actions for authorized users
- Link to the related accounting ledger entry

This page should fetch via `getTransactionById` and display the full detail.

**Step 4:** Commit: `feat(transactions): add transaction detail page and cache currency`

---

### Task 3.4: Add void action to transaction detail page

**Files:**
- Modify: `app/transactions/[id]/page.tsx`

**Step 1:** Add void button with confirmation modal:

```tsx
const handleVoid = async () => {
    if (!voidReason.trim()) {
        addNotification("Please provide a reason for voiding", "ERROR")
        return
    }
    setVoidLoading(true)
    const result = await voidTransaction({
        transaction_id: transaction.id,
        void_reason: voidReason,
    })
    if (result.success) {
        addNotification("Transaction voided successfully", "SUCCESS")
        router.push("/transactions")
    } else {
        addNotification(result.error || "Failed to void transaction", "ERROR")
    }
    setVoidLoading(false)
    setShowVoidModal(false)
}
```

Only show void button for transactions that aren't already voided/refunded, and only for users with `canAccessAccounting`.

**Step 2:** Commit: `feat(transactions): add void transaction with confirmation`

---

## Phase 4: My Time Clock & Time Clock Admin Audit & Fixes

### Issues Found

| # | Category | Severity | Issue |
|---|----------|----------|-------|
| TC1 | Logic | Critical | `my-time-clock/page.tsx` and `time-clock/page.tsx` are 99% identical — massive code duplication |
| TC2 | Logic | Medium | `staffId!` non-null assertions could crash if `userInfo` hasn't loaded yet |
| TC3 | Logic | Low | `console.error` used instead of `createLogs` in catch block |
| TC4 | UI Flow | Medium | Clock status shows `branchId` instead of `branchName` |
| TC5 | UI Flow | Low | Scanner modal doesn't use AnimatePresence exit properly |
| TC6 | Logic | Medium | Admin Time Clock `QRCodeDisplay` uses standalone `BranchSelector` instead of branch context |
| TC7 | Logic | Medium | `StaffClockStatus` doesn't filter by branch |
| TC8 | UX | Low | No total hours display for the period |
| TC9 | UX | Medium | No link from time entries to payroll |

### Task 4.1: Extract shared time clock logic into a custom hook and shared component

**Files:**
- Create: `hooks/useTimeClock.ts`
- Modify: `app/my-time-clock/page.tsx`
- Modify: `app/time-clock/page.tsx`

**Step 1:** Create `hooks/useTimeClock.ts`:

```tsx
"use client"

import { useState, useEffect, useCallback, useContext } from "react"
import { SideBarContext } from "@/components/sidebar"
import { NotificationContext } from "@/components/notifications"
import {
    getClockStatus,
    getTimeClockEntries,
    ClockStatusResult,
    TimeClockEntry,
} from "@/server/actions/time-clock"
import { ActionResponse } from "@/utils/types/responses"

export function useTimeClock() {
    const { userInfo } = useContext(SideBarContext)
    const { addNotification } = useContext(NotificationContext)

    const [clockStatus, setClockStatus] = useState<ClockStatusResult | null>(null)
    const [entries, setEntries] = useState<TimeClockEntry[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [currentDuration, setCurrentDuration] = useState<string | null>(null)

    const staffId = userInfo?.id

    const fetchData = useCallback(async () => {
        if (!staffId) return

        setIsLoading(true)
        try {
            const statusResult: ActionResponse<ClockStatusResult> = await getClockStatus(staffId)
            if (statusResult.success) {
                setClockStatus(statusResult.data)
                setCurrentDuration(statusResult.data.duration)
            }

            const endDate = new Date()
            const startDate = new Date()
            startDate.setDate(startDate.getDate() - 7)

            const entriesResult: ActionResponse<{ entries: TimeClockEntry[] }> = await getTimeClockEntries({
                staffId,
                startDate,
                endDate,
            })

            if (entriesResult.success) {
                setEntries(entriesResult.data.entries)
            }
        } catch (error) {
            addNotification("Failed to load time clock data", "ERROR")
        } finally {
            setIsLoading(false)
        }
    }, [staffId, addNotification])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    useEffect(() => {
        if (!clockStatus?.isClockedIn || !clockStatus.clockedInAt) return

        const interval = setInterval(() => {
            const clockedIn = new Date(clockStatus.clockedInAt!).getTime()
            const now = new Date().getTime()
            const diffMs = now - clockedIn

            const seconds = Math.floor(diffMs / 1000)
            const hours = Math.floor(seconds / 3600)
            const minutes = Math.floor((seconds % 3600) / 60)
            const remainingSeconds = seconds % 60

            setCurrentDuration(
                `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
            )
        }, 1000)

        return () => clearInterval(interval)
    }, [clockStatus?.isClockedIn, clockStatus?.clockedInAt])

    const handleClockInSuccess = () => {
        fetchData()
        addNotification("Successfully clocked in!", "SUCCESS")
    }

    const handleClockOutSuccess = () => {
        fetchData()
        addNotification("Successfully clocked out!", "SUCCESS")
    }

    return {
        clockStatus,
        entries,
        isLoading,
        currentDuration,
        staffId,
        fetchData,
        handleClockInSuccess,
        handleClockOutSuccess,
    }
}
```

**Step 2:** Refactor both pages to use the hook:

`app/my-time-clock/page.tsx`:
```tsx
"use client"

import { useState } from "react"
import { Clock, History, MapPin, RefreshCw, Timer } from "lucide-react"
import { motion } from "motion/react"
import PageWrapper from "@/components/page-wrapper"
import ClockInScanner from "@/components/clock/ClockInScanner"
import ClockOutButton from "@/components/clock/ClockOutButton"
import { useTimeClock } from "@/hooks/useTimeClock"

function formatTime(dateString: string) {
    return new Date(dateString).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: true,
    })
}

function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric",
    })
}

export default function MyTimeClockPage() {
    const { clockStatus, entries, isLoading, currentDuration, staffId, fetchData, handleClockInSuccess, handleClockOutSuccess } = useTimeClock()
    const [showScanner, setShowScanner] = useState(false)

    if (isLoading) {
        return (
            <PageWrapper>
                <div className="flex items-center justify-center h-full">
                    <RefreshCw className="w-8 h-8 animate-spin text-white/40" />
                </div>
            </PageWrapper>
        )
    }

    if (!staffId) {
        return (
            <PageWrapper>
                <div className="flex items-center justify-center h-full text-white/40">
                    Please log in to track time
                </div>
            </PageWrapper>
        )
    }

    // ... rest of render (same as current but using hook values)
}
```

Similarly for `app/time-clock/page.tsx`, replace all the duplicated state/logic with the hook.

**Step 3:** Run `bun run lint`. Expected: PASS

**Step 4:** Commit: `refactor(time-clock): extract shared logic into useTimeClock hook`

---

### Task 4.2: Fix branchId display, non-null assertion, and console.error

**Files:**
- Modify: `hooks/useTimeClock.ts`
- Modify: `app/my-time-clock/page.tsx`
- Modify: `app/time-clock/page.tsx`

**Step 1:** In the shared hook, remove `console.error` (already replaced with `addNotification`):

The hook already uses `addNotification("Failed to load time clock data", "ERROR")` — verify no `console.error` remains.

**Step 2:** Fix `staffId!` non-null assertions by adding a null guard:

In both pages, before the early return for loading state, add:

```tsx
if (!staffId) {
    return (
        <PageWrapper>
            <div className="flex items-center justify-center h-full text-white/40">
                Please log in to track time
            </div>
        </PageWrapper>
    )
}
```

Then `staffId` is guaranteed to be a string after this check, so `staffId` instead of `staffId!`.

**Step 3:** Show branch name instead of branch ID in status card:

In the `ClockStatusResult` type (`server/actions/time-clock.ts`), add `branchName`:

```tsx
export interface ClockStatusResult {
    isClockedIn: boolean
    clockedInAt: string | null
    branchId: string | null
    branchName: string | null
    duration: string | null
    entryId: string | null
}
```

Update `getClockStatus` to join with `branches` table and return `branchName`:

```tsx
export async function getClockStatus(staffId: string): Promise<ActionResponse<ClockStatusResult>> {
    try {
        const [activeEntry] = await db
            .select({
                id: timeClockEntries.id,
                clockIn: timeClockEntries.clockIn,
                branchId: timeClockEntries.branchId,
                clockOut: timeClockEntries.clockOut,
            })
            .from(timeClockEntries)
            .where(
                and(
                    eq(timeClockEntries.staffId, staffId),
                    isNull(timeClockEntries.clockOut)
                )
            )
            .limit(1)

        if (!activeEntry) {
            return success({
                isClockedIn: false,
                clockedInAt: null,
                branchId: null,
                branchName: null,
                duration: null,
                entryId: null,
            })
        }

        let branchName: string | null = null
        if (activeEntry.branchId) {
            const [branch] = await db
                .select({ name: branches.name })
                .from(branches)
                .where(eq(branches.id, activeEntry.branchId))
                .limit(1)
            branchName = branch?.name ?? null
        }

        const now = new Date()
        const duration = now.getTime() - activeEntry.clockIn.getTime()

        return success({
            isClockedIn: true,
            clockedInAt: activeEntry.clockIn.toISOString(),
            branchId: activeEntry.branchId,
            branchName,
            duration: formatDuration(duration),
            entryId: activeEntry.id,
        })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error getting clock status: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to get clock status')
    }
}
```

Update both pages to display `clockStatus.branchName`:

```tsx
{clockStatus?.isClockedIn && clockStatus.branchName && (
    <div className="flex items-center gap-2 text-sm text-white/60 mb-4">
        <MapPin className="w-4 h-4" />
        <span>{clockStatus.branchName}</span>
    </div>
)}
```

**Step 4:** Run `bun run lint && bun run build`. Expected: PASS

**Step 5:** Commit: `fix(time-clock): show branch name, remove non-null assertions, remove console.error`

---

### Task 4.3: Fix QRCodeDisplay to use BranchContext and add branch filter to StaffClockStatus

**Files:**
- Modify: `components/clock/QRCodeDisplay.tsx`
- Modify: `components/clock/StaffClockStatus.tsx`

**Step 1:** In `QRCodeDisplay.tsx`, replace the standalone `BranchSelector` import with context-based one:

```tsx
import { useBranchContext } from "@/components/branch-context"
import BranchSelector from "@/components/branch-selector"

// In component:
const { currentBranch } = useBranchContext()
```

Remove the local `selectedBranch` state and use `currentBranch?.id` instead.

**Step 2:** In `StaffClockStatus.tsx`, add branch filtering:

```tsx
export default function StaffClockStatus({ branchId }: { branchId?: string }) {
    // ... already accepts branchId prop, but let's add branch selector UI
```

Update the `AdminTimeClockPage` to pass `currentBranch?.id` to `StaffClockStatus`:

```tsx
import { useBranchContext } from "@/components/branch-context"

// In AdminTimeClockPage:
const { currentBranch } = useBranchContext()

// In render:
{activeTab === "staff" && <StaffClockStatus branchId={currentBranch?.id} />}
```

Also update `TimeClockCalendar` to receive and use branch context properly (it already uses it).

**Step 3:** Commit: `fix(time-clock): use BranchContext consistently and filter staff by branch`

---

### Task 4.4: Add total hours display to time clock pages

**Files:**
- Modify: `hooks/useTimeClock.ts`
- Modify: `app/my-time-clock/page.tsx`
- Modify: `app/time-clock/page.tsx`
- Modify: `server/actions/time-clock.ts` (already has `getTodayHours`)

**Step 1:** Add `todayHours` to the hook:

```tsx
import { getTodayHours, TodayHoursResult } from "@/server/actions/time-clock"

// In hook:
const [todayHours, setTodayHours] = useState<TodayHoursResult | null>(null)

// In fetchData:
const hoursResult: ActionResponse<TodayHoursResult> = await getTodayHours(staffId)
if (hoursResult.success) {
    setTodayHours(hoursResult.data)
}

// Return:
return { ..., todayHours }
```

**Step 2:** Display in the status card section of both pages:

```tsx
{todayHours && (
    <div className="flex items-center gap-4 text-sm text-white/60 mt-2">
        <span>Today: {todayHours.totalHours}</span>
        <span>{todayHours.entriesCount} session{todayHours.entriesCount !== 1 ? 's' : ''}</span>
    </div>
)}
```

**Step 3:** Commit: `feat(time-clock): add today's hours summary display`

---

## Phase 5: Cross-Cutting Concerns & Integrations

### Task 5.1: Add accounting link from Transactions to Ledger

**Files:**
- Modify: `app/transactions/[id]/page.tsx`

**Step 1:** In the transaction detail page, add a "View in Accounting" link that navigates to `/accounting?search=<transaction_number>`:

```tsx
<Link
    href={`/accounting?search=${transaction.transaction_number}`}
    className='text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1'
>
    <BookOpenIcon className='w-4 h-4' />
    View in Accounting
</Link>
```

**Step 2:** Update `app/accounting/accountingPage.tsx` to accept `search` query parameter:

```tsx
import { useSearchParams } from 'next/navigation'

const searchParams = useSearchParams()
const initialSearch = searchParams.get('search') || ''
```

Use `initialSearch` to seed the search state on mount.

**Step 3:** Commit: `feat(transactions): link to accounting ledger entry`

---

### Task 5.2: Unify branch context usage across all pages

**Files:**
- Audit: `components/ui/branch-selector.tsx` (standalone)
- Audit: `components/branch-selector.tsx` (context-based)
- Audit: `components/ui/branch-selector-inline.tsx`

**Step 1:** Document which component each page uses:
- `QRCodeDisplay` → `components/ui/branch-selector.tsx` (standalone) — **to fix** in Task 4.3
- `TimeClockCalendar` → `components/branch-context.tsx` (context) ✓
- `Accounting` → `components/branch-selector.tsx` (context) ✓
- `Payroll` → `components/ui/branch-selector-inline.tsx` (form) ✓
- `Sales` → context ✓
- `Notify` → **none** — **to fix** in Task 1.5

**Step 2:** Update `QRCodeDisplay` to use context (done in Task 4.3).

**Step 3:** Commit with Task 4.3

---

### Task 5.3: Add consistent PageWrapper usage

**Files:**
- Modify: `app/notify/notifyPage.tsx` (done in Task 1.1)
- Modify: `app/accounts/accountsPage.tsx` (done in Task 2.1)
- Verify: All other pages already use PageWrapper

**Step 1:** Ensure Notify and Accounts have `PageWrapper` wrapping (handled in previous tasks).

**Step 2:** Commit with respective tasks (1.1 and 2.1).

---

### Task 5.4: Replace console.error with createLogs across reviewed pages

**Files:**
- Search all reviewed page files for `console.error` or `console.log`
- Replace with `addNotification` for user-facing errors

**Step 1:** Search for `console.error` across the codebase:

```bash
grep -rn "console\.error\|console\.log\|console\.warn" app/notify/ app/accounts/ app/transactions/ app/my-time-clock/ app/time-clock/ app/\(app\)/admin/time-clock/
```

Replace any remaining instances with appropriate error handling.

**Step 2:** Commit: `chore: replace console.error with proper error handling`

---

### Task 5.5: Suggestions and improvements

| # | Area | Suggestion |
|---|------|-----------|
| I1 | Notify | Add email preview before sending (render template inline) |
| I2 | Notify | Add scheduled/deferred sending option |
| I3 | Staff | Add bulk action support (bulk role change, bulk branch assignment) |
| I4 | Staff | Show user's last login timestamp in the list |
| I5 | Transactions | Add transaction detail drawer (slide-over instead of full page) |
| I6 | Transactions | Add date range presets "This Week", "Last 30 Days" |
| I7 | Time Clock | Add weekly timesheet summary view |
| I8 | Time Clock | Add manual time entry for admins (missed clock-in/out) |
| I9 | Cross-cutting | Add retry logic with exponential backoff for failed server actions |
| I10 | Cross-cutting | Add optimistic updates for clock in/out actions |

These are recommendations for future work and are NOT part of the current implementation.

---

## Phase 6: Lint & Build Error Fixes

### Task 6.1: Fix all ESLint errors and warnings

**Step 1:** Run lint to capture current state:

```bash
bun run lint 2>&1
```

**Step 2:** Fix each error/warning. Common fixes:
- Remove unused imports
- Fix TypeScript type issues
- Remove unused variables
- Fix React hooks dependency arrays

**Step 3:** Run lint again to verify clean output.

**Step 4:** Commit: `chore: fix all ESLint errors and warnings`

---

### Task 6.2: Fix all TypeScript build errors

**Step 1:** Run build to capture current state:

```bash
bun run build 2>&1
```

**Step 2:** Fix each TypeScript error:
- Type mismatches from Phase 1-5 changes
- Add missing type exports
- Fix assertion types

**Step 3:** Run build again to verify clean output.

**Step 4:** Commit: `chore: fix all TypeScript build errors`

---

### Task 6.3: Final verification

**Step 1:** Run both lint and build:

```bash
bun run lint && bun run build
```

**Step 2:** Verify all pages render correctly in dev:

```bash
bun run dev
```

Manually test:
- Notify: Select users, compose, send
- Staff: Load users, filter, manage
- Transactions: Load, filter, export, navigate to detail
- My Time Clock: Clock in/out, view entries
- Time Clock Admin: Switch tabs, generate QR, view staff status

**Step 3:** Final commit: `chore: final audit verification`