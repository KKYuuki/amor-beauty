# Global Branch Control & Payroll Admin Disbursement View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move branch selection to a global sidebar switch and enhance the payroll admin dashboard with a period-based, per-staff expandable earnings overview.

**Architecture:** Single `BranchSelector` in the sidebar above route groups replaces 11+ page-level selectors. The `BranchProvider` context (already app-wide) propagates changes. Payroll dashboard gains a `DateRangeSelector`, expandable `StaffEarningsRow` components, and a new `getStaffEarningsForPeriod` server action that reuses existing `getPayrollEntries` with an added `branchId` filter.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Tailwind CSS 4, Motion, Supabase

> CURRENT PROGRESS: All 13 tasks complete. Build is green with zero ESLint warnings. Browser-level verification steps remain for manual testing.

---

## Phase 1: Branch Control — Sidebar Integration

### Task 1: Add BranchSelector to sidebar.tsx

**Files:**
- Modify: `components/sidebar.tsx`

- [x] **Step 1: Import BranchSelector in sidebar.tsx**

Add the import at the top of the file, after the existing `import` block (near line 30):

```typescript
import BranchSelector from "@/components/branch-selector"
```

- [x] **Step 2: Render BranchSelector between header and navigation groups**

In the sidebar JSX, after the closing `</motion.div>` of the Header ("top-section") block and BEFORE `{/* Mobile overlay background */}`, insert the BranchSelector. Locate this section (~line 578-581):

```tsx
                                    </motion.div>

                                    {/* Mobile overlay background */}
```

Replace that gap with:

```tsx
                                    </motion.div>

                                    {/* Global Branch Selector */}
                                    <div
                                        className={`${isMobile && !isExpanded ? 'hidden' : ''} ${!isExpanded && !isMobile ? 'flex justify-center' : ''}`}
                                    >
                                        <BranchSelector
                                            showAllOption={true}
                                            className={
                                                !isExpanded && !isMobile
                                                    ? "w-10"
                                                    : "w-full"
                                            }
                                        />
                                    </div>

                                    {/* Mobile overlay background */}
```

- [x] **Step 3: Commit**

```bash
git add components/sidebar.tsx
git commit -m "feat: add global BranchSelector to sidebar above route groups"
```

- [x] **Step 3: Commit**

---

## Phase 2: Branch Control — Page Cleanup (Batch 1)

### Task 2: Remove BranchSelector from payroll, accounting, transactions, metrics pages

**Files:**
- Modify: `app/payroll/payrollPage.tsx`
- Modify: `app/accounting/accountingPage.tsx`
- Modify: `app/transactions/transactionsPage.tsx`
- Modify: `app/metrics/metricsPage.tsx`

- [x] **Step 1: Remove from payroll page**

In `app/payroll/payrollPage.tsx`:
- Remove line 28: `import { BranchSelectorInline } from "@/components/branch-selector"`
- Remove the `BranchSelectorInline` JSX block (~lines 565-577) which is:
```tsx
                        <BranchSelectorInline
                            value={currentBranch?.id}
                            onChange={(branchId, _isShared) => {
                                if (branchId === null) {
                                    setCurrentBranch(null)
                                } else {
                                    const branch = branches.find(b => b.id === branchId)
                                    if (branch) setCurrentBranch(branch)
                                }
                            }}
                            showSharedOption={true}
                            className="w-48"
                        />
```
- Also remove the destructuring of `setCurrentBranch` and `branches` from `useBranchContext()` on line 115, changing:
```typescript
    const { currentBranch, branches, setCurrentBranch } = useBranchContext()
```
to:
```typescript
    const { currentBranch } = useBranchContext()
```

- [x] **Step 2: Remove from accounting page**

In `app/accounting/accountingPage.tsx`:
- Remove line 39: `import BranchSelector from "@/components/branch-selector"`
- Remove the `<BranchSelector ...>` JSX block at ~line 577. It should look similar to:
```tsx
                        <BranchSelector
                            showAllOption={...}
                            ...
                        />
```
- Verify no other `BranchSelector` references remain.

- [x] **Step 3: Remove from transactions page**

In `app/transactions/transactionsPage.tsx`:
- Remove line 28: `import BranchSelector from "@/components/branch-selector"`
- Remove the `<BranchSelector />` JSX at ~line 196.

- [x] **Step 4: Remove from metrics page**

In `app/metrics/metricsPage.tsx`:
- Remove line 5: `import { BranchSelectorInline } from "@/components/branch-selector"`
- Remove the `<BranchSelectorInline ...>` block at ~lines 70-73.
- Remove the `setCurrentBranch` and `branches` from the `useBranchContext()` destructuring if they are only used for the selector (check usage — they appear to be used for the selector only):
```typescript
    const { currentBranch, setCurrentBranch, branches } = useBranchContext()
```
Change to:
```typescript
    const { currentBranch } = useBranchContext()
```

- [x] **Step 5: Commit**

```bash
git add app/payroll/payrollPage.tsx app/accounting/accountingPage.tsx app/transactions/transactionsPage.tsx app/metrics/metricsPage.tsx
git commit -m "refactor: remove page-level BranchSelector from payroll, accounting, transactions, metrics"
```

---

## Phase 3: Branch Control — Page Cleanup (Batch 2)

### Task 3: Remove BranchSelector from inventory, calendar, appointments, sales, notify pages

**Files:**
- Modify: `app/inventory/inventoryPage.tsx`
- Modify: `app/calendar/calendarPage.tsx`
- Modify: `app/appointments/appointmentsPage.tsx`
- Modify: `app/sales/salesPage.tsx`
- Modify: `app/notify/notifyPage.tsx`

- [x] **Step 1: Remove from inventory page**

In `app/inventory/inventoryPage.tsx`:
- Remove line 47: `import BranchSelector from "@/components/branch-selector"`
- Remove `<BranchSelector showAllOption={true} />` at ~line 327.
- Verify `currentBranch` is still read from `useBranchContext()` (it is, used by `branchFilteredItems` useMemo).

- [x] **Step 2: Remove from calendar page**

In `app/calendar/calendarPage.tsx`:
- Remove line 19: `import BranchSelector from "@/components/branch-selector"`
- Remove BOTH instances of `<BranchSelector showAllOption={true} />` at ~line 366 and ~line 471.
- Verify `currentBranch` is still used by `branchFilteredAppointments` useMemo.

- [x] **Step 3: Remove from appointments page**

In `app/appointments/appointmentsPage.tsx`:
- Remove line 29: `import BranchSelector from "@/components/branch-selector"`
- Remove `<BranchSelector showAllOption={true} />` at ~line 189.
- Verify `currentBranch` is still used for filtering in the useMemo.

- [x] **Step 4: Remove from sales page**

In `app/sales/salesPage.tsx`:
- Remove line 19: `import BranchSelector from "@/components/branch-selector"`
- Remove the `<BranchSelector>` block at ~line 55.
- Verify `SalesContext` still reads `currentBranch` from `useBranchContext()` (it does).

- [x] **Step 5: Remove from notify page**

In `app/notify/notifyPage.tsx`:
- Remove line 4: `import BranchSelector from "@/components/branch-selector"`
- Remove `<BranchSelector showAllOption />` at ~line 244.
- Verify `currentBranch` is still used for filtering recipients.

- [x] **Step 6: Commit**

```bash
git add app/inventory/inventoryPage.tsx app/calendar/calendarPage.tsx app/appointments/appointmentsPage.tsx app/sales/salesPage.tsx app/notify/notifyPage.tsx
git commit -m "refactor: remove page-level BranchSelector from inventory, calendar, appointments, sales, notify"
```

---

## Phase 4: Branch Control — Config Page & QR Clock Special Cases

### Task 4: Handle config page branch selectors and QR clock forceSelect

**Files:**
- Modify: `app/config/configPage.tsx`
- Modify: `components/clock/QRCodeDisplay.tsx`

- [x] **Step 1: Remove BranchSelector from config services section**

In `app/config/configPage.tsx`, locate the services settings render function (~line 369):
```tsx
                    <BranchSelector showAllOption={true} />
```
Remove this line. This was a page-level context switch — now handled by the global sidebar selector.

- [x] **Step 2: Remove BranchSelector from config operating hours section**

At ~line 967, remove:
```tsx
                        <BranchSelector showAllOption={true} />
```

- [x] **Step 3: Replace config service form branch-assignment field**

The service form still needs a field to assign a service to a branch. The current code at ~line 369 removed in Step 1 was a dual-purpose selector. The form field for `branch_id` in the service creation/edit form already has a separate `BranchSelectorInline` usage. Check `components/services/ServiceModal.tsx` line 261 — this uses `BranchSelectorInline` from `components/ui/branch-selector-inline.tsx` which is a standalone form field. No additional change needed here.

- [x] **Step 4: Remove BranchSelector forceSelect from QR Code Display**

In `components/clock/QRCodeDisplay.tsx`:
- Remove line 7: `import BranchSelector from "@/components/branch-selector"`
- Remove the entire `<BranchSelector forceSelect />` JSX block (~line 93) which is:
```tsx
                    <BranchSelector forceSelect />
```
- Add an inline message when `currentBranch` is null. Find the branch-dependent section (~lines 85-95) and replace with:

```tsx
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
                        {/* existing single-use toggle + generate button */}
                    </div>
                )}
```
- Wrap the existing single-use toggle and button inside the `: (` branch.

- [x] **Step 5: Commit**

```bash
git add app/config/configPage.tsx components/clock/QRCodeDisplay.tsx
git commit -m "refactor: remove config page BranchSelector, replace QR clock forceSelect with sidebar prompt"
```

---

## Phase 5: Branch Control — Verification

### Task 5: Verify branch filtering works across all pages

- [x] **Step 1: Build check**

```bash
bun run build
```
Expected: Build succeeds with no errors. Pay attention to:
- Unused import warnings for any missed BranchSelector references
- TypeScript compilation errors from removed `setCurrentBranch`/`branches` destructuring

- [x] **Step 2: Dev server smoke test**

```bash
bun run dev
```
Expected: Dev server starts without errors.

- [ ] **Step 3: Manual verification checklist (open in browser)** — will be done after Task 13 end-to-end verification

1. Navigate to each page (/, /calendar, /appointments, /inventory, /accounting, /payroll, /sales, /transactions, /metrics, /config, /notify)
2. Verify the sidebar shows the BranchSelector above route links
3. Verify NO page-level BranchSelector appears in any page header
4. Switch to "All Branches" — verify data shows across all branches
5. Switch to a specific branch — verify data filters to that branch
6. Switch between branches rapidly — verify no state corruption
7. Verify the collapsed sidebar shows only the Building2 icon
8. Visit QR Clock — verify the "Select a branch" prompt appears
9. Select a branch and verify the QR code generation UI appears

- [ ] **Step 4: Commit if any fixes needed** — will be done after Task 13
```

---

## Phase 6: Payroll — Server Actions Enhancement

### Task 6: Enhance getPayrollDashboardSummary with date range params

**Files:**
- Modify: `server/actions/payroll.ts` (function `getPayrollDashboardSummary`, ~line 1565)

- [x] **Step 1: Update function signature**

Change the function signature from:
```typescript
export async function getPayrollDashboardSummary(
    branchId?: string | null
): Promise<ActionResponse<PayrollDashboardSummary>> {
```
to:
```typescript
export async function getPayrollDashboardSummary(
    branchId?: string | null,
    dateFrom?: string | null,
    dateTo?: string | null
): Promise<ActionResponse<PayrollDashboardSummary>> {
```

- [x] **Step 2: Update date range computation**

Replace the hardcoded date computation block (~lines 1572-1574):
```typescript
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
```
with:
```typescript
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

        const effectiveDateFrom = dateFrom ? new Date(dateFrom) : startOfMonth
        const effectiveDateTo = dateTo ? new Date(dateTo) : endOfMonth
        // Set to end of day for dateTo to include the full day
        if (dateTo) {
            effectiveDateTo.setHours(23, 59, 59, 999)
        }
```

- [x] **Step 3: Add date range filters to all four queries**

For the `pendingResult` query, add date range conditions. The existing where clause (for the non-branch case) is:
```typescript
eq(payrollEntry.paymentStatus, 'PENDING')
```
Update ALL four queries (pendingResult, requestedResult, confirmedResult, paidThisMonthResult) to include date range conditions. For the `pendingResult`, update to:

```typescript
            db
                .select({
                    total: sql<number>`COALESCE(SUM(${payrollEntry.staffCut}), 0)`,
                    count: count(),
                })
                .from(payrollEntry)
                .where(
                    entryBranchFilter
                        ? and(
                            eq(payrollEntry.paymentStatus, 'PENDING'),
                            gte(payrollEntry.serviceDate, effectiveDateFrom),
                            lte(payrollEntry.serviceDate, effectiveDateTo),
                            entryBranchFilter
                        )
                        : and(
                            eq(payrollEntry.paymentStatus, 'PENDING'),
                            gte(payrollEntry.serviceDate, effectiveDateFrom),
                            lte(payrollEntry.serviceDate, effectiveDateTo)
                        )
                ),
```

For the `requestedResult` and `confirmedResult`, add date range on `payrollRequest.requestedAt`:
```typescript
                .where(
                    requestBranchFilter
                        ? and(
                            eq(payrollRequest.status, 'REQUESTED'),
                            gte(payrollRequest.requestedAt, effectiveDateFrom),
                            lte(payrollRequest.requestedAt, effectiveDateTo),
                            requestBranchFilter
                        )
                        : and(
                            eq(payrollRequest.status, 'REQUESTED'),
                            gte(payrollRequest.requestedAt, effectiveDateFrom),
                            lte(payrollRequest.requestedAt, effectiveDateTo)
                        )
                ),
```

For the `paidThisMonthResult`, replace `startOfMonth`/`endOfMonth` with `effectiveDateFrom`/`effectiveDateTo`:
```typescript
                            gte(payrollRequest.completedAt, effectiveDateFrom),
                            lte(payrollRequest.completedAt, effectiveDateTo),
```

- [x] **Step 4: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "feat: add date range params to getPayrollDashboardSummary"
```

---

### Task 7: Enhance getStaffPayrollSummary with date range params

**Files:**
- Modify: `server/actions/payroll.ts` (function `getStaffPayrollSummary`, ~line 1685)

- [x] **Step 1: Update function signature**

Change:
```typescript
export async function getStaffPayrollSummary(
    branchId?: string | null
): Promise<ActionResponse<StaffPayrollSummaryItem[]>> {
```
to:
```typescript
export async function getStaffPayrollSummary(
    branchId?: string | null,
    dateFrom?: string | null,
    dateTo?: string | null
): Promise<ActionResponse<StaffPayrollSummaryItem[]>> {
```

- [x] **Step 2: Add date range to where clause**

Inside the function, after the `branchFilter` definition, add date computation:

```typescript
        const effectiveDateFrom = dateFrom ? new Date(dateFrom) : new Date(0) // epoch start
        const effectiveDateTo = dateTo ? new Date(dateTo) : new Date()
        effectiveDateTo.setHours(23, 59, 59, 999)
```

Then update the `.where()` clause. The current where clause (~lines 1708-1717) has two branches. For each branch, add `gte(payrollEntry.serviceDate, effectiveDateFrom)` and `lte(payrollEntry.serviceDate, effectiveDateTo)`:

For the branch-filtered case:
```typescript
                    ? and(
                        eq(payrollEntry.paymentStatus, 'PENDING'),
                        isNull(payrollEntry.payrollRequestId),
                        gte(payrollEntry.serviceDate, effectiveDateFrom),
                        lte(payrollEntry.serviceDate, effectiveDateTo),
                        branchFilter
                    )
```

For the non-branch case:
```typescript
                    : and(
                        eq(payrollEntry.paymentStatus, 'PENDING'),
                        isNull(payrollEntry.payrollRequestId),
                        gte(payrollEntry.serviceDate, effectiveDateFrom),
                        lte(payrollEntry.serviceDate, effectiveDateTo)
                    )
```

- [x] **Step 3: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "feat: add date range params to getStaffPayrollSummary"
```

---

### Task 8: Add branchId filter to getPayrollEntries

**Files:**
- Modify: `server/actions/payroll.ts` (function `getPayrollEntries` and interface `GetPayrollEntriesOptions`)

- [ ] **Step 1: Add branchId to options interface**

Find the `GetPayrollEntriesOptions` interface (or the inline type used by `getPayrollEntries`). The `PayrollFilterSchema` is used for validation. Locate the function params (~line 434). The function takes an `options` object typed against `PayrollFilterSchema`. Check the schema in `server/actions/payroll-schemas.ts`:

Add `branchId` as an optional string to the schema and options interface:
```typescript
    branchId?: string | null
```

- [ ] **Step 2: Add branch condition to query**

After the existing condition-building block (~lines 450-470), add the branch filter:

```typescript
        if (options.branchId) {
            conditions.push(
                sql`EXISTS (
                    SELECT 1 FROM ${transactions}
                    WHERE ${transactions.id} = ${payrollEntry.transactionId}
                    AND ${transactions.branch_id} = ${options.branchId}
                )`
            )
        }
```

Note: `transactions` table is already imported at the top of the file.

- [x] **Step 3: Commit**

```bash
git add server/actions/payroll.ts server/actions/payroll-schemas.ts
git commit -m "feat: add branchId filter support to getPayrollEntries"
```

---

## Phase 7: Payroll — New Server Action

### Task 9: Create getStaffEarningsForPeriod server action

**Files:**
- Modify: `server/actions/payroll.ts` (append new function)
- Modify: `app/payroll/payrollPage.tsx` (add import)

- [x] **Step 1: Add new server action**

At the end of `server/actions/payroll.ts` (before the last `}` of the file), add:

```typescript
export async function getStaffEarningsForPeriod(
    staffId: string,
    dateFrom: string,
    dateTo: string,
    branchId?: string | null
): Promise<ActionResponse<PayrollEntry[]>> {
    try {
        const result = await getPayrollEntries({
            staffId,
            dateFrom,
            dateTo,
            branchId,
            pageSize: 200, // larger page for period views
        })

        if (!result.success) {
            return result
        }

        return success(result.data.data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching staff earnings for period: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch staff earnings')
    }
}
```

- [x] **Step 2: Add export to payroll page imports**

In `app/payroll/payrollPage.tsx`, add `getStaffEarningsForPeriod` to the import from `@/server/actions/payroll` (around lines 41-60):
```typescript
    getStaffEarningsForPeriod,
```

- [x] **Step 3: Commit**

```bash
git add server/actions/payroll.ts app/payroll/payrollPage.tsx
git commit -m "feat: add getStaffEarningsForPeriod server action"
```

---

## Phase 8: Payroll — UI Components

### Task 10: Create DateRangeSelector component

**Files:**
- Create: `components/payroll/DateRangeSelector.tsx`

- [x] **Step 1: Create the file**

Create `components/payroll/DateRangeSelector.tsx`:

```typescript
"use client"

import { useState } from "react"
import { CalendarIcon } from "lucide-react"
import { getDateRangeFromPreset, type DateRangePreset } from "@/utils/date-utils"

interface DateRange {
    dateFrom: string
    dateTo: string
}

interface DateRangeSelectorProps {
    value: DateRange
    onChange: (range: DateRange) => void
}

const PRESETS: { key: DateRangePreset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "this_week", label: "This Week" },
    { key: "this_month", label: "This Month" },
    { key: "this_year", label: "This Year" },
]

export default function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
    const [activePreset, setActivePreset] = useState<DateRangePreset | null>("this_month")
    const [customFrom, setCustomFrom] = useState(value.dateFrom)
    const [customTo, setCustomTo] = useState(value.dateTo)

    const handlePreset = (preset: DateRangePreset) => {
        setActivePreset(preset)
        const range = getDateRangeFromPreset(preset)
        if (range) {
            const newRange = {
                dateFrom: range.start.toISOString().split("T")[0],
                dateTo: range.end.toISOString().split("T")[0],
            }
            setCustomFrom(newRange.dateFrom)
            setCustomTo(newRange.dateTo)
            onChange(newRange)
        }
    }

    const handleCustomApply = () => {
        setActivePreset(null)
        onChange({ dateFrom: customFrom, dateTo: customTo })
    }

    return (
        <div className='flex flex-wrap items-center gap-2'>
            <div className='flex gap-1 bg-white/5 p-1 rounded'>
                {PRESETS.map((preset) => (
                    <button
                        key={preset.key}
                        onClick={() => handlePreset(preset.key)}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            activePreset === preset.key
                                ? "bg-white/20 text-white"
                                : "text-white/50 hover:text-white hover:bg-white/10"
                        }`}
                    >
                        {preset.label}
                    </button>
                ))}
                <button
                    onClick={() => setActivePreset(null)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        activePreset === null
                            ? "bg-white/20 text-white"
                            : "text-white/50 hover:text-white hover:bg-white/10"
                    }`}
                >
                    Custom
                </button>
            </div>
            {activePreset === null && (
                <div className='flex items-center gap-2'>
                    <input
                        type='date'
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className='px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-white/30'
                    />
                    <span className='text-white/40 text-xs'>to</span>
                    <input
                        type='date'
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className='px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-white/30'
                    />
                    <button
                        onClick={handleCustomApply}
                        className='px-2 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded text-xs'
                    >
                        Apply
                    </button>
                </div>
            )}
        </div>
    )
}
```

- [x] **Step 2: Commit**

```bash
mkdir -p components/payroll
git add components/payroll/DateRangeSelector.tsx
git commit -m "feat: create DateRangeSelector component"
```

---

### Task 11: Create StaffEarningsRow component

**Files:**
- Create: `components/payroll/StaffEarningsRow.tsx`

- [x] **Step 1: Create the file**

Create `components/payroll/StaffEarningsRow.tsx`:

```typescript
"use client"

import { useState } from "react"
import NextImage from "next/image"
import { ChevronDownIcon, LoaderCircleIcon, SendIcon } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { PayrollEntry } from "@/utils/types/payroll"
import { getStaffEarningsForPeriod } from "@/server/actions/payroll"
import { useBranchContext } from "@/components/branch-context"

const STATUS_COLORS: Record<string, string> = {
    PENDING: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30",
    REQUESTED: "bg-orange-400/20 text-orange-300 border-orange-400/30",
    CONFIRMED: "bg-blue-400/20 text-blue-300 border-blue-400/30",
    PAID: "bg-green-400/20 text-green-300 border-green-400/30",
}

interface StaffEarningsRowProps {
    staffId: string
    staffName: string
    avatarUrl?: string
    totalEarned: number
    pendingAmount: number
    paidAmount: number
    dateFrom: string
    dateTo: string
    currencySymbol: string
    onRequestPayout: (entries: PayrollEntry[]) => void
    // Note: totalEarned/paidAmount are approximate from the summary query.
    // Actual entry-level data is lazy-loaded on expand via getStaffEarningsForPeriod().
}

export default function StaffEarningsRow({
    staffId,
    staffName,
    avatarUrl,
    totalEarned,
    pendingAmount,
    paidAmount,
    dateFrom,
    dateTo,
    currencySymbol,
    onRequestPayout,
}: StaffEarningsRowProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [entries, setEntries] = useState<PayrollEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set())
    const { currentBranch } = useBranchContext()

    const handleToggle = async () => {
        if (isExpanded) {
            setIsExpanded(false)
            return
        }
        setIsExpanded(true)
        setLoading(true)
        try {
            const result = await getStaffEarningsForPeriod(
                staffId,
                dateFrom,
                dateTo,
                currentBranch?.id ?? null
            )
            if (result.success) {
                setEntries(result.data)
            }
        } catch {}
        setLoading(false)
    }

    const toggleEntry = (id: string) => {
        const next = new Set(selectedEntryIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedEntryIds(next)
    }

    const selectAllPending = () => {
        const pending = entries.filter((e) => e.payment_status === "PENDING")
        if (selectedEntryIds.size === pending.length) {
            setSelectedEntryIds(new Set())
        } else {
            setSelectedEntryIds(new Set(pending.map((e) => e.id)))
        }
    }

    const selectedTotal = entries
        .filter((e) => selectedEntryIds.has(e.id))
        .reduce((s, e) => s + Number(e.staff_cut), 0)

    const hasPending = pendingAmount > 0

    return (
        <div className={`bg-white/5 rounded-lg transition-colors ${isExpanded ? "bg-white/10" : "hover:bg-white/10"}`}>
            {/* Header Row */}
            <button
                onClick={handleToggle}
                className={`w-full flex items-center justify-between p-4 text-left ${!hasPending ? "opacity-60" : ""}`}
            >
                <div className='flex items-center gap-3'>
                    <div className='w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white font-bold overflow-hidden'>
                        {avatarUrl ? (
                            <NextImage
                                src={avatarUrl}
                                alt={staffName}
                                width={40}
                                height={40}
                                className='w-full h-full rounded-full object-cover'
                            />
                        ) : (
                            staffName.charAt(0).toUpperCase()
                        )}
                    </div>
                    <div>
                        <p className='font-medium'>{staffName}</p>
                        <p className='text-xs text-white/40'>
                            Total: {currencySymbol}{totalEarned.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            {" · "}
                            <span className='text-green-400'>Paid: {currencySymbol}{paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            {" · "}
                            <span className={hasPending ? "text-yellow-300" : "text-white/40"}>
                                Pending: {currencySymbol}{pendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </p>
                    </div>
                </div>
                <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronDownIcon className='w-5 h-5 text-white/40' />
                </motion.div>
            </button>

            {/* Expanded Detail Panel */}
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className='overflow-hidden'
                    >
                        <div className='px-4 pb-4 border-t border-white/10'>
                            {loading ? (
                                <div className='flex justify-center py-4'>
                                    <LoaderCircleIcon className='w-5 h-5 animate-spin text-white/40' />
                                </div>
                            ) : entries.length === 0 ? (
                                <p className='text-white/40 text-sm text-center py-4'>
                                    No earnings in this period for {staffName}
                                </p>
                            ) : (
                                <>
                                    <div className='flex justify-between items-center mt-3 mb-2'>
                                        <span className='text-xs text-white/50'>
                                            {entries.filter(e => e.payment_status === "PENDING").length} pending entries
                                        </span>
                                        {entries.some(e => e.payment_status === "PENDING") && (
                                            <button
                                                onClick={selectAllPending}
                                                className='text-xs text-blue-400 hover:underline'
                                            >
                                                {selectedEntryIds.size === entries.filter(e => e.payment_status === "PENDING").length
                                                    ? "Deselect All"
                                                    : "Select All Pending"}
                                            </button>
                                        )}
                                    </div>
                                    <div className='space-y-1 max-h-64 overflow-auto'>
                                        {entries.map((entry) => (
                                            <label
                                                key={entry.id}
                                                className={`flex items-center gap-3 p-2 rounded cursor-pointer ${
                                                    entry.payment_status !== "PENDING"
                                                        ? "opacity-60"
                                                        : selectedEntryIds.has(entry.id)
                                                          ? "bg-green-500/20"
                                                          : "bg-white/5 hover:bg-white/10"
                                                }`}
                                            >
                                                {entry.payment_status === "PENDING" && (
                                                    <input
                                                        type='checkbox'
                                                        checked={selectedEntryIds.has(entry.id)}
                                                        onChange={() => toggleEntry(entry.id)}
                                                        className='accent-green-500'
                                                    />
                                                )}
                                                {entry.payment_status !== "PENDING" && (
                                                    <span className='w-4' />
                                                )}
                                                <div className='flex-1 min-w-0'>
                                                    <div className='flex items-center gap-2'>
                                                        <p className='text-sm truncate'>
                                                            {entry.service_description || "Service"}
                                                        </p>
                                                        {entry.staff_rate_snapshot?.serviceType && (
                                                            <span className='text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/60'>
                                                                {entry.staff_rate_snapshot.serviceType}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className='text-xs text-white/40'>
                                                        {new Date(entry.service_date).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <div className='text-right'>
                                                    <p className='text-sm font-bold text-green-400'>
                                                        {currencySymbol}{Number(entry.staff_cut).toFixed(2)}
                                                    </p>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[entry.payment_status] || "bg-white/10 text-white/60"}`}>
                                                        {entry.payment_status}
                                                    </span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    {selectedEntryIds.size > 0 && (
                                        <div className='flex items-center justify-between pt-3 mt-3 border-t border-white/10'>
                                            <div>
                                                <p className='text-xs text-white/50'>
                                                    {selectedEntryIds.size} entries selected
                                                </p>
                                                <p className='text-lg font-bold text-green-400'>
                                                    {currencySymbol}{selectedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const selected = entries.filter((e) =>
                                                        selectedEntryIds.has(e.id)
                                                    )
                                                    onRequestPayout(selected)
                                                }}
                                                className='flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded text-sm border border-green-500/30'
                                            >
                                                <SendIcon className='w-4 h-4' />
                                                Request
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
```

- [x] **Step 2: Commit**

```bash
git add components/payroll/StaffEarningsRow.tsx
git commit -m "feat: create StaffEarningsRow component with expandable detail panel"
```

---

## Phase 9: Payroll — Dashboard Integration

### Task 12: Enhance DashboardTab with DateRangeSelector and StaffEarningsRow

**Files:**
- Modify: `app/payroll/payrollPage.tsx` (DashboardTab component and fetchData integration)

- [x] **Step 1: Add date range state to PayrollPageClient**

In `app/payroll/payrollPage.tsx`, after the existing state declarations (~line 130), add date range state:

```typescript
    // Date range for dashboard
    const [dashboardDateRange, setDashboardDateRange] = useState({
        dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            .toISOString().split("T")[0],
        dateTo: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
            .toISOString().split("T")[0],
    })
```

- [x] **Step 2: Update fetchData for dashboard tab**

In the `fetchData` callback, update the dashboard fetch block (~lines 230-240). Change:
```typescript
            if (activeTab === "dashboard") {
                const [summaryResult, staffResult] = await Promise.all([
                    getPayrollDashboardSummary(currentBranch?.id ?? null),
                    getStaffPayrollSummary(currentBranch?.id ?? null),
                ])
```
to:
```typescript
            if (activeTab === "dashboard") {
                const [summaryResult, staffResult] = await Promise.all([
                    getPayrollDashboardSummary(
                        currentBranch?.id ?? null,
                        dashboardDateRange.dateFrom,
                        dashboardDateRange.dateTo
                    ),
                    getStaffPayrollSummary(
                        currentBranch?.id ?? null,
                        dashboardDateRange.dateFrom,
                        dashboardDateRange.dateTo
                    ),
                ])
```

- [x] **Step 3: Add dashboardDateRange to fetchData dependency array**

Update the `useEffect` and `useCallback` dependency arrays. In the `fetchData` `useCallback` (~line 285), add `dashboardDateRange` to the dependency array:
```typescript
    }, [addNotification, activeTab, requestFilter, currentBranch, downpaymentFilter, refreshRateLevels, dashboardDateRange])
```

- [x] **Step 4: Replace DashboardTab props and render**

Update the `DashboardTab` render block (~lines 685-695). Add new props and add DateRangeSelector:

```tsx
                        {activeTab === "dashboard" && (
                            <DashboardTab
                                summary={summary}
                                staffSummary={staffSummary}
                                currencySymbol={currencySymbol}
                                dateFrom={dashboardDateRange.dateFrom}
                                dateTo={dashboardDateRange.dateTo}
                                onDateRangeChange={(range) => setDashboardDateRange(range)}
                                onRequestPayout={(entries) => {
                                    if (entries.length > 0) {
                                        setStaffPendingEntries(entries)
                                        setStaffRequestModal({
                                            staffId: entries[0].staff_id || "",
                                            staffName: "", // populated by StaffRequestModal
                                        })
                                    }
                                }}
                            />
                        )}
```

- [x] **Step 5: Rewrite DashboardTab component**

Replace the entire `DashboardTab` function component (~lines 1090-1259) with the enhanced version. Import the new components at the top of the file:

```typescript
import DateRangeSelector from "@/components/payroll/DateRangeSelector"
import StaffEarningsRow from "@/components/payroll/StaffEarningsRow"
```

The enhanced `DashboardTab`:

```typescript
function DashboardTab({
    summary,
    staffSummary,
    currencySymbol,
    dateFrom,
    dateTo,
    onDateRangeChange,
    onRequestPayout,
}: {
    summary: PayrollDashboardSummary | null
    staffSummary: {
        staff_id: string
        full_name: string
        avatar_url?: string
        rate_level_id?: string
        pending_amount: number
        pending_count: number
    }[]
    currencySymbol: string
    dateFrom: string
    dateTo: string
    onDateRangeChange: (range: { dateFrom: string; dateTo: string }) => void
    onRequestPayout: (entries: PayrollEntry[]) => void
}) {
    if (!summary) return null

    return (
        <div className='space-y-6'>
            {/* Date Range Selector */}
            <DateRangeSelector
                value={{ dateFrom, dateTo }}
                onChange={onDateRangeChange}
            />

            {/* Summary Cards */}
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                <div className='bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 md:p-4'>
                    <div className='flex items-center gap-1 md:gap-2 mb-1 md:mb-2'>
                        <ClockIcon className='w-3 h-3 md:w-4 md:h-4 text-yellow-400' />
                        <p className='text-[10px] md:text-xs text-yellow-400 uppercase font-semibold'>
                            Pending
                        </p>
                    </div>
                    <p className='text-lg md:text-xl font-bold text-yellow-300'>
                        {currencySymbol}
                        {summary.pendingAmount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                        })}
                    </p>
                    <p className='text-[10px] md:text-xs text-yellow-400/60'>
                        {summary.pendingCount} entries
                    </p>
                </div>

                <div className='bg-orange-500/10 border border-orange-500/20 rounded-lg p-4'>
                    <div className='flex items-center gap-2 mb-2'>
                        <BanknoteIcon className='w-4 h-4 text-orange-400' />
                        <p className='text-xs text-orange-400 uppercase font-semibold'>
                            Requested
                        </p>
                    </div>
                    <p className='text-xl font-bold text-orange-300'>
                        {currencySymbol}
                        {summary.requestedAmount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                        })}
                    </p>
                    <p className='text-xs text-orange-400/60'>
                        {summary.requestedCount} requests
                    </p>
                </div>

                <div className='bg-blue-500/10 border border-blue-500/20 rounded-lg p-4'>
                    <div className='flex items-center gap-2 mb-2'>
                        <CheckCircleIcon className='w-4 h-4 text-blue-400' />
                        <p className='text-xs text-blue-400 uppercase font-semibold'>
                            Confirmed
                        </p>
                    </div>
                    <p className='text-xl font-bold text-blue-300'>
                        {currencySymbol}
                        {summary.confirmedAmount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                        })}
                    </p>
                    <p className='text-xs text-blue-400/60'>
                        {summary.confirmedCount} ready
                    </p>
                </div>

                <div className='bg-green-500/10 border border-green-500/20 rounded-lg p-4'>
                    <div className='flex items-center gap-2 mb-2'>
                        <WalletIcon className='w-4 h-4 text-green-400' />
                        <p className='text-xs text-green-400 uppercase font-semibold'>
                            Paid (Period)
                        </p>
                    </div>
                    <p className='text-xl font-bold text-green-300'>
                        {currencySymbol}
                        {summary.paidThisMonth.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                        })}
                    </p>
                    <p className='text-xs text-green-400/60'>
                        {summary.paidThisMonthCount} payments
                    </p>
                </div>
            </div>

            {/* Staff Period Earnings */}
            <div>
                <h2 className='text-lg font-semibold mb-3 flex items-center gap-2'>
                    <UsersIcon className='w-5 h-5' />
                    Staff Period Earnings
                </h2>
                {staffSummary.length === 0 ? (
                    <div className='bg-white/5 rounded-lg p-6 text-center text-white/60'>
                        No staff earnings for this period
                    </div>
                ) : (
                    <div className='grid gap-3'>
                        {staffSummary.map((staff) => (
                            <StaffEarningsRow
                                key={staff.staff_id}
                                staffId={staff.staff_id}
                                staffName={staff.full_name}
                                avatarUrl={staff.avatar_url}
                                totalEarned={staff.pending_amount} /* approximate; actual from expanded entries */
                                pendingAmount={staff.pending_amount}
                                paidAmount={0} /* approximate; actual from expanded entries */
                                dateFrom={dateFrom}
                                dateTo={dateTo}
                                currencySymbol={currencySymbol}
                                onRequestPayout={(entries) => {
                                    onRequestPayout(entries)
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
```

- [x] **Step 6: Handle onRequestPayout to pass correct data to StaffRequestModal**

The `onRequestPayout` callback in the parent `PayrollPageClient` now receives `PayrollEntry[]` instead of `(staffId, staffName)`. Update the handler passed to `DashboardTab` (~line 685). The `StaffRequestModal` expects `staffId`, `staffName`, `pendingEntries`. Since the entries array already has `staff_id`, extract from first entry:

Change the `onRequestPayout` handler in the JSX:
```tsx
                                onRequestPayout={(entries) => {
                                    if (entries.length > 0) {
                                        setStaffPendingEntries(entries)
                                        const first = entries[0]
                                        setStaffRequestModal({
                                            staffId: first.staff_id || "",
                                            staffName: first.staff?.full_name || "",
                                        })
                                    }
                                }}
```

- [x] **Step 7: Re-add missing imports for icons**

The `DashboardTab` uses `ClockIcon`, `BanknoteIcon`, `CheckCircleIcon`, `WalletIcon`, `UsersIcon`. These are already imported in `payrollPage.tsx`. No change needed.

- [x] **Step 8: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "feat: integrate DateRangeSelector and StaffEarningsRow into Dashboard tab"
```

---

## Phase 10: Final Verification

### Task 13: End-to-end verification

- [x] **Step 1: Build check**

```bash
bun run build
```
Expected: Build succeeds with no TypeScript errors and no ESLint warnings.

- [x] **Step 2: Dev server smoke test

```bash
bun run dev
```

- [ ] **Step 3: Branch control verification checklist** — requires browser testing

1. Sidebar shows BranchSelector above route groups on all pages
2. "All Branches" shows unfiltered data everywhere
3. Selecting a branch filters data on all pages (check inventory, calendar, appointments)
4. Payroll dashboard respects branch filter
5. QR Clock shows prompt when no branch selected
6. Config page services/hours respect branch selection
7. No page-level BranchSelector visible anywhere (except admin logs filter — should remain)

- [ ] **Step 4: Payroll admin view verification checklist** — requires browser testing

1. Payroll Management page → Dashboard tab shows DateRangeSelector at top
2. Summary cards reflect selected date range (change to "This Week" and verify numbers change)
3. Staff list shows per-staff totals for the period
4. Click staff row → expands to show entries (loading then data)
5. Select pending entries via checkboxes → "Select All Pending" works
6. Click "Request" → StaffRequestModal appears with selected entries
7. Create payment request → success notification → entries disappear
8. Switch branch via sidebar → dashboard refreshes with branch-filtered data
9. Collapse staff row → entries unload, compact view restored

- [ ] **Step 5: Edge case verification** — requires browser testing

1. Staff with no entries for period → "No earnings" message
2. Staff with all entries paid → muted row, no selectable entries
3. Staff with all entries already requested → same behavior
4. Custom date range: pick dates, click Apply, verify data refreshes
5. Rapid date preset changes → no state corruption
6. "All Branches" + "This Month" → verify cross-branch totals

- [x] **Step 6: Final commit if fixes needed

```bash
git add .
git commit -m "chore: final verification fixes"
```

---
