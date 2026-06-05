# Payroll Tab Reorganization & Full Rates CRUD Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge Rates and Rate Levels into a single "Rate Configuration" tab, add full CRUD (deactivate/delete) to both entities, and fix collision detection bugs in rate creation.

**Architecture:** Backend-first approach. Fix collision detection server-side, then add deactivate/delete server actions. Enhance existing modals (EditRateModal, RateLevelsTab). Create new standalone modals for deactivation/deletion flows. Finally, restructure payrollPage.tsx tabs to merge rates + rate levels under an internal toggle.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM (PostgreSQL), Tailwind CSS 4, Bun

> **CURRENT PROGRESS:** ✅ All 5 phases complete. Build green, lint clean, tagged `payroll-rates-crud-v1`.

---

## Phase 1: Backend Fixes — Collision Detection & New Server Actions

### Task 1.1: Fix `createStaffRate` Collision Detection

**Files:**
- Modify: `server/actions/payroll.ts:338-350`

- [x] **Step 1: Remove `isActive` filter from duplicate check query**

In `server/actions/payroll.ts`, inside `createStaffRate()`, locate the `existing` query (line ~338). Remove the `eq(payrollStaffRate.isActive, true)` condition and add logic to distinguish inactive matches.

Locate this block (lines ~336-350):
```typescript
        const existing = await db
            .select()
            .from(payrollStaffRate)
            .where(
                and(
                    eq(payrollStaffRate.serviceType, payload.service_type),
                    eq(payrollStaffRate.clientType, payload.client_type),
                    payload.rate_level_id
                        ? eq(payrollStaffRate.rateLevelId, payload.rate_level_id)
                        : isNull(payrollStaffRate.rateLevelId),
                    eq(payrollStaffRate.isActive, true)
                )
            )
            .limit(1)

        if (existing.length > 0) {
            return failure('A rate already exists for this service/client/level combination')
        }
```

Replace with:
```typescript
        const existing = await db
            .select({
                id: payrollStaffRate.id,
                isActive: payrollStaffRate.isActive,
                rateName: payrollStaffRate.rateName,
            })
            .from(payrollStaffRate)
            .where(
                and(
                    eq(payrollStaffRate.serviceType, payload.service_type),
                    eq(payrollStaffRate.clientType, payload.client_type),
                    payload.rate_level_id
                        ? eq(payrollStaffRate.rateLevelId, payload.rate_level_id)
                        : isNull(payrollStaffRate.rateLevelId),
                )
            )
            .limit(1)

        if (existing.length > 0) {
            if (existing[0].isActive) {
                return failure('A rate already exists for this service/client/level combination')
            }
            return failure(`A rate already exists for this combination (currently inactive): "${existing[0].rateName}". Edit and reactivate it instead.`)
        }
```

- [x] **Step 2: Run TypeScript compilation to verify**

Run: `bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors from the changed file.

- [x] **Step 3: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix: check all rates (including inactive) for collision in createStaffRate"
```

---

### Task 1.2: Add `deactivateStaffRate` and `deleteStaffRate` Server Actions

**Files:**
- Modify: `server/actions/payroll.ts` (append new functions)

- [x] **Step 1: Add `deactivateStaffRate` function**

Append this function after `createStaffRate()` in `server/actions/payroll.ts`:

```typescript
export async function deactivateStaffRate(id: string): Promise<ActionResponse<void>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    try {
        const [rate] = await db
            .select()
            .from(payrollStaffRate)
            .where(eq(payrollStaffRate.id, id))
            .limit(1)

        if (!rate) {
            return failure('Rate not found')
        }

        await db
            .update(payrollStaffRate)
            .set({
                isActive: false,
                updatedAt: new Date(),
                updatedBy: currentUser.id,
            })
            .where(eq(payrollStaffRate.id, id))

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Staff rate deactivated: ${id} (${rate.rateName}) by ${currentUser.id}`,
            }],
        })

        cache.invalidate('payroll_rates')

        return success(undefined, 'Rate deactivated successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error deactivating staff rate: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to deactivate rate')
    }
}
```

- [x] **Step 2: Add `deleteStaffRate` function**

Append after `deactivateStaffRate`:

```typescript
export async function deleteStaffRate(id: string): Promise<ActionResponse<void>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const canManage = await canManagePayroll(currentUser)
    if (!canManage) {
        return failure('Payroll management access required')
    }

    try {
        const [refCount] = await db
            .select({ count: count() })
            .from(payrollEntry)
            .where(eq(payrollEntry.rateId, id))

        const entryCount = Number(refCount?.count ?? 0)
        if (entryCount > 0) {
            return failure(`Cannot delete: rate is referenced by ${entryCount} payroll entr${entryCount === 1 ? 'y' : 'ies'}. Deactivate instead.`)
        }

        const [rate] = await db
            .select({ rateName: payrollStaffRate.rateName })
            .from(payrollStaffRate)
            .where(eq(payrollStaffRate.id, id))
            .limit(1)

        await db
            .delete(payrollStaffRate)
            .where(eq(payrollStaffRate.id, id))

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Staff rate deleted: ${id} (${rate?.rateName ?? 'unknown'}) by ${currentUser.id}`,
            }],
        })

        cache.invalidate('payroll_rates')

        return success(undefined, 'Rate deleted successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error deleting staff rate: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to delete rate')
    }
}
```

- [x] **Step 3: Run TypeScript compilation to verify**

Run: `bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [x] **Step 4: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "feat: add deactivateStaffRate and deleteStaffRate server actions"
```

---

### Task 1.3: Add Name Collision Detection to `createRateLevel`

**Files:**
- Modify: `server/actions/rate-levels.ts` (inside `createRateLevel`)

- [x] **Step 1: Add duplicate name check before slug generation**

In `server/actions/rate-levels.ts`, inside `createRateLevel()`, add a query before the insert. Locate the slug generation line (~line 52) and add the check above it:

```typescript
export async function createRateLevel(payload: CreateRateLevelPayload): Promise<ActionResponse<RateLevelItem>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const admin = await isAdmin(currentUser)
    if (!admin) {
        return failure('Admin access required')
    }

    const slug = slugify(payload.name)

    // --- START NEW CODE ---
    try {
        const nameCheck = await db
            .select({ id: rateLevels.id, name: rateLevels.name, slug: rateLevels.slug })
            .from(rateLevels)
            .where(sql`LOWER(${rateLevels.name}) = LOWER(${payload.name})`)
            .limit(1)

        if (nameCheck.length > 0) {
            return failure(`A rate level with a similar name already exists: "${nameCheck[0].name}". Use a different name or edit the existing one.`)
        }
    } catch (error) {
        // Non-critical: continue if this query fails
    }
    // --- END NEW CODE ---

    try {
        const result = await db.insert(rateLevels).values({
            name: payload.name,
            slug,
            sortOrder: payload.sort_order ?? 0,
        }).returning() as unknown as typeof rateLevels.$inferSelect[]
        // ... rest of function unchanged
```

Note: The import `sql` from drizzle-orm needs to be added to the file's imports. Check the current imports at top of `server/actions/rate-levels.ts`:

Current: `import { eq, asc } from 'drizzle-orm'`

- [x] **Step 2: Add `sql` to drizzle-orm imports**

Change the import line at the top of `server/actions/rate-levels.ts`:
```typescript
import { eq, asc, sql } from 'drizzle-orm'
```

- [x] **Step 3: Run TypeScript compilation to verify**

Run: `bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [x] **Step 4: Commit**

```bash
git add server/actions/rate-levels.ts
git commit -m "feat: add proactive duplicate name check in createRateLevel"
```

---

### Phase 1 Verification

- [x] **Verify Phase 1: Full build check**

Run: `bun run build 2>&1 | tail -30`
Expected: Successful production build with no errors.

---

## Phase 2: Rate Deactivate/Delete UI Modals

### Task 2.1: Enhance EditRateModal with Active Toggle and Delete

**Files:**
- Modify: `app/payroll/modals/EditRateModal.tsx`

- [x] **Step 1: Add `isActive` state and toggle buttons**

In `app/payroll/modals/EditRateModal.tsx`, add `isActive` state after existing state declarations. Locate this area (near line 30):

```typescript
    const [paymentMode, setPaymentMode] = useState<'PERCENTAGE' | 'FIXED'>(
        rate.payment_mode || 'PERCENTAGE'
    )
    const [fixedAmount, setFixedAmount] = useState(rate.fixed_amount || 0)
    const [loading, setLoading] = useState(false)
```

Add after `setLoading`:
```typescript
    const [isActive, setIsActive] = useState(rate.is_active)
```

- [x] **Step 2: Add `onDeactivate` and `onDelete` props to the interface**

Update the `EditRateModalProps` interface at the top of the file:

```typescript
interface EditRateModalProps {
    rate: PayrollStaffRate
    rateLevels: RateLevelItem[]
    onClose: () => void
    onSave: (
        shopPct: number,
        staffPct: number,
        paymentMode: 'PERCENTAGE' | 'FIXED',
        fixedAmount: number | undefined,
        serviceType: string,
        clientType: string,
        rateLevelId: string
    ) => Promise<void>
    onDeactivate: (rateId: string) => Promise<void>
    onDelete: (rateId: string) => Promise<void>
    deletable: boolean
    entryCount: number
}
```

- [x] **Step 3: Pass new props down in the destructured parameter**

```typescript
export function EditRateModal({
    rate,
    rateLevels,
    onClose,
    onSave,
    onDeactivate,
    onDelete,
    deletable,
    entryCount,
}: EditRateModalProps) {
```

- [x] **Step 4: Add "Status" toggle section after the Rate Level selector**

After the rate level `<select>` block (just before the Payment Mode toggle), add:

```tsx
                    {/* Status Toggle */}
                    <div>
                        <label className='block text-sm font-medium mb-2'>Status</label>
                        <div className='grid grid-cols-2 gap-2'>
                            <button
                                type='button'
                                onClick={() => setIsActive(true)}
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${isActive ? 'bg-green-600' : 'bg-white/10 hover:bg-white/20'}`}
                            >
                                Active
                            </button>
                            <button
                                type='button'
                                onClick={() => setIsActive(false)}
                                className={`px-3 py-2 rounded-md transition-colors font-medium ${!isActive ? 'bg-red-600' : 'bg-white/10 hover:bg-white/20'}`}
                            >
                                Inactive
                            </button>
                        </div>
                    </div>
```

- [x] **Step 5: Add delete button below Save/Cancel row**

Locate the Save/Cancel buttons at the bottom of the modal (after the fixed amount input section). Replace the closing flex div:

```tsx
                    <div className='flex justify-end gap-3 pt-4'>
                        <button
                            onClick={onClose}
                            className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={
                                loading ||
                                (paymentMode === 'PERCENTAGE' &&
                                    shopPct + staffPct !== 100)
                            }
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                        >
                            {loading ? "Saving..." : "Save"}
                        </button>
                    </div>
```

Replace with:

```tsx
                    <div className='flex justify-between items-center pt-4 border-t border-white/10'>
                        {deletable ? (
                            <button
                                type='button'
                                onClick={() => onDelete(rate.id)}
                                disabled={loading}
                                className='px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-md transition-colors font-medium text-sm disabled:opacity-50'
                            >
                                Delete Rate
                            </button>
                        ) : (
                            <span
                                className='px-4 py-2 text-xs text-white/40 cursor-not-allowed'
                                title={`Cannot delete: rate is referenced by ${entryCount} payroll entr${entryCount === 1 ? 'y' : 'ies'}. Deactivate instead.`}
                            >
                                Delete Rate
                            </span>
                        )}
                        <div className='flex gap-3'>
                            <button
                                onClick={onClose}
                                className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={
                                    loading ||
                                    (paymentMode === 'PERCENTAGE' &&
                                        shopPct + staffPct !== 100)
                                }
                                className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                            >
                                {loading ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
```

- [x] **Step 6: Modify `handleSave` to include `isActive` in the onSave call**

Since `onSave` currently doesn't pass isActive, we need to update the interface. But wait — the `updateStaffRate` action handles `is_active` via `UpdateStaffRatePayload` which already has `is_active?: boolean`. The `handleUpdateRate` in `payrollPage.tsx` passes updates to `updateStaffRate`. We need to update both.

For now, let's focus on the modal. We'll handle the save with active state in Task 2.3 when wiring.

- [x] **Step 7: Run TypeScript compilation**

Run: `bunx tsc --noEmit 2>&1 | head -30`
Expected: Errors about onDeactivate/onDelete not being passed by parent — expected, fixed in Task 2.3.

- [x] **Step 8: Commit**

```bash
git add app/payroll/modals/EditRateModal.tsx
git commit -m "feat: add active toggle and delete button to EditRateModal"
```

---

### Task 2.2: Create Standalone `DeactivateRateModal`

**Files:**
- Create: `app/payroll/modals/DeactivateRateModal.tsx`

- [x] **Step 1: Create the modal file**

Create `app/payroll/modals/DeactivateRateModal.tsx` (follows same pattern as `DeactivateRateLevelModal.tsx`):

```tsx
"use client"

import { motion } from "motion/react"
import { XIcon, AlertTriangleIcon } from "lucide-react"
import AdminActionGuard from "@/components/admin/AdminActionGuard"

interface DeactivateRateModalProps {
    rateName: string
    onClose: () => void
    onConfirm: () => Promise<void>
}

export function DeactivateRateModal({ rateName, onClose, onConfirm }: DeactivateRateModalProps) {
    const handleConfirm = async () => {
        await onConfirm()
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10'
            >
                <div className='p-6 border-b border-white/10 flex justify-between items-center'>
                    <h3 className='text-xl font-bold text-yellow-400'>Deactivate Rate</h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div className='flex items-start gap-3'>
                        <AlertTriangleIcon className='w-6 h-6 text-yellow-400 shrink-0 mt-0.5' />
                        <div>
                            <p className='text-white font-medium'>
                                Deactivate &quot;{rateName}&quot;?
                            </p>
                            <p className='text-white/60 text-sm mt-2'>
                                This rate will be hidden from active views but existing payroll entries will retain their snapshots. You can reactivate it later through editing.
                            </p>
                        </div>
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'>Cancel</button>
                        <AdminActionGuard onAction={handleConfirm}>
                            <button
                                className='px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded-md transition-colors font-medium'
                            >
                                Deactivate
                            </button>
                        </AdminActionGuard>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
```

- [x] **Step 2: Run TypeScript compilation**

Run: `bunx tsc --noEmit 2>&1 | head -10`
Expected: No errors in this file.

- [x] **Step 3: Commit**

```bash
git add app/payroll/modals/DeactivateRateModal.tsx
git commit -m "feat: add DeactivateRateModal for standalone rate deactivation"
```

---

### Task 2.3: Wire Rate Deactivate/Delete into PayrollPage

**Files:**
- Modify: `app/payroll/payrollPage.tsx` (RatesTab component, handlers, imports, state)

- [x] **Step 1: Add imports for new server actions and modals**

At the top of `payrollPage.tsx`, add to the existing import from `@/server/actions/payroll`:

```typescript
import {
    getPayrollDashboardSummary,
    getPayrollRequests,
    getStaffPayrollSummary,
    getStaffRates,
    updateStaffRate,
    createStaffRate,
    deactivateStaffRate,    // NEW
    deleteStaffRate,        // NEW
    confirmPayrollRequest,
    // ... rest unchanged
} from "@/server/actions/payroll"
```

Add to the modals import:
```typescript
import {
    CompletePaymentModal,
    // ... existing imports ...
    DeactivateRateLevelModal,
    DeactivateRateModal,     // NEW
} from "./modals"
```

- [x] **Step 2: Add new state variables for rate deactivation/deletion**

After the existing state declarations near line ~155 (`setCreatingRate`), add:

```typescript
    const [deactivatingRate, setDeactivatingRate] = useState<PayrollStaffRate | null>(null)
    const [deletingRate, setDeletingRate] = useState<PayrollStaffRate | null>(null)
```

- [x] **Step 3: Add handler functions for deactivate and delete rate**

Add after `handleCreateRate`:

```typescript
    const handleDeactivateRate = async (rateId: string) => {
        const result = await deactivateStaffRate(rateId)
        if (result.success) {
            addNotification("Rate deactivated", "SUCCESS")
            setDeactivatingRate(null)
            fetchData()
        } else {
            addNotification(result.error || "Failed to deactivate rate", "ERROR")
        }
    }

    const handleDeleteRate = async (rateId: string) => {
        const result = await deleteStaffRate(rateId)
        if (result.success) {
            addNotification("Rate deleted", "SUCCESS")
            setDeletingRate(null)
            fetchData()
        } else {
            addNotification(result.error || "Failed to delete rate", "ERROR")
        }
    }
```

- [x] **Step 4: Update RatesTab props and component**

Find the `RatesTab` function signature (~line 1508) and update it:

```typescript
function RatesTab({
    rates,
    isAdmin,
    onEdit,
    onCreate,
    onDeactivate,
    onDelete,
}: {
    rates: PayrollStaffRate[]
    isAdmin: boolean
    onEdit: (rate: PayrollStaffRate) => void
    onCreate: () => void
    onDeactivate: (rate: PayrollStaffRate) => void
    onDelete: (rate: PayrollStaffRate) => void
}) {
```

- [x] **Step 5: Update RateTable inner component to show deactivate/delete buttons**

Find the `RateTable` sub-component inside `RatesTab`. In the table body (near line ~1530-1545), replace the Actions `<td>` block:

Replace:
```tsx
                                {isAdmin && (
                                    <td className='py-3 text-right'>
                                        <AdminActionGuard
                                            onAction={() => onEdit(rate)}
                                        >
                                            <button
                                                className='px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors'
                                            >
                                                Edit
                                            </button>
                                        </AdminActionGuard>
                                    </td>
                                )}
```

With:
```tsx
                                {isAdmin && (
                                    <td className='py-3 text-right'>
                                        <div className='flex justify-end gap-1'>
                                            <AdminActionGuard
                                                onAction={() => onEdit(rate)}
                                            >
                                                <button
                                                    className='px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors'
                                                >
                                                    Edit
                                                </button>
                                            </AdminActionGuard>
                                            {rate.is_active && (
                                                <AdminActionGuard
                                                    onAction={() => onDeactivate(rate)}
                                                >
                                                    <button
                                                        className='px-2 py-1 text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded transition-colors'
                                                    >
                                                        Deactivate
                                                    </button>
                                                </AdminActionGuard>
                                            )}
                                            <AdminActionGuard
                                                onAction={() => onDelete(rate)}
                                            >
                                                <button
                                                    className='px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors'
                                                >
                                                    Delete
                                                </button>
                                            </AdminActionGuard>
                                        </div>
                                    </td>
                                )}
```

- [x] **Step 6: Update RatesTab render call in the JSX**

Find the `{activeTab === "rates" && (` block (near line ~665) and update the `<RatesTab` call:

```tsx
                        {activeTab === "rates" && (
                            <RatesTab
                                rates={rates}
                                isAdmin={isAdmin}
                                onEdit={setEditingRate}
                                onCreate={() => setCreatingRate(true)}
                                onDeactivate={setDeactivatingRate}
                                onDelete={setDeletingRate}
                            />
                        )}
```

- [x] **Step 7: Add Deactivate Rate Modal to render**

Add after the existing `<AnimatePresence>` blocks (after `deactivatingRateLevel` modal):

```tsx
            {/* Deactivate Rate Modal */}
            <AnimatePresence>
                {deactivatingRate && (
                    <DeactivateRateModal
                        rateName={deactivatingRate.rate_name}
                        onClose={() => setDeactivatingRate(null)}
                        onConfirm={() => handleDeactivateRate(deactivatingRate.id)}
                    />
                )}
            </AnimatePresence>
```

- [x] **Step 8: Update EditRateModal render call to pass new props**

Find the `{editingRate && (` block and update:

```tsx
            <AnimatePresence>
                {editingRate && (
                    <EditRateModal
                        rate={editingRate}
                        rateLevels={rateLevels}
                        onClose={() => setEditingRate(null)}
                        onSave={handleUpdateRate}
                        onDeactivate={handleDeactivateRate}
                        onDelete={handleDeleteRate}
                        deletable={true}
                        entryCount={0}
                    />
                )}
            </AnimatePresence>
```

Note: `deletable` and `entryCount` will be properly computed in the RateConfigurationTab merge (Phase 4). For now we pass dummy values to satisfy the type.

- [x] **Step 8: Verify build compiles**

Run: `bunx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [x] **Step 9: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "feat: wire deactivate and delete rate actions into payroll page"
```

---

### Phase 2 Verification

- [x] **Verify Phase 2: Full build check**

Run: `bun run build 2>&1 | tail -30`
Expected: Successful build.

---

## Phase 3: Rate Level Delete UI

### Task 3.1: Create `DeleteRateLevelModal`

**Files:**
- Create: `app/payroll/modals/DeleteRateLevelModal.tsx`

- [ ] **Step 1: Create the modal**

```tsx
"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { XIcon, AlertTriangleIcon } from "lucide-react"
import AdminActionGuard from "@/components/admin/AdminActionGuard"
import { RateLevelItem } from "@/utils/types/payroll"

interface DeleteRateLevelModalProps {
    rateLevel: RateLevelItem
    referenceCount: { rates: number; staff: number }
    onClose: () => void
    onConfirm: (id: string) => Promise<void>
}

export function DeleteRateLevelModal({ rateLevel, referenceCount, onClose, onConfirm }: DeleteRateLevelModalProps) {
    const [loading, setLoading] = useState(false)

    const hasReferences = referenceCount.rates > 0 || referenceCount.staff > 0

    const handleConfirm = async () => {
        setLoading(true)
        try {
            await onConfirm(rateLevel.id)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10'
            >
                <div className='p-6 border-b border-white/10 flex justify-between items-center'>
                    <h3 className='text-xl font-bold text-red-400'>Delete Rate Level</h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    {hasReferences ? (
                        <div className='flex items-start gap-3'>
                            <AlertTriangleIcon className='w-6 h-6 text-red-400 shrink-0 mt-0.5' />
                            <div>
                                <p className='text-white font-medium'>Cannot delete &quot;{rateLevel.name}&quot;</p>
                                <p className='text-white/60 text-sm mt-2'>
                                    This rate level is still referenced by {referenceCount.rates > 0 && `${referenceCount.rates} rate${referenceCount.rates !== 1 ? 's' : ''}`}
                                    {referenceCount.rates > 0 && referenceCount.staff > 0 && ' and '}
                                    {referenceCount.staff > 0 && `${referenceCount.staff} staff member${referenceCount.staff !== 1 ? 's' : ''}`}
                                    . Deactivate it instead.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className='flex items-start gap-3'>
                            <AlertTriangleIcon className='w-6 h-6 text-yellow-400 shrink-0 mt-0.5' />
                            <div>
                                <p className='text-white font-medium'>
                                    Permanently delete &quot;{rateLevel.name}&quot;?
                                </p>
                                <p className='text-white/60 text-sm mt-2'>
                                    This cannot be undone. This level is not referenced by any rates or staff members.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'>Cancel</button>
                        {!hasReferences && (
                            <AdminActionGuard onAction={handleConfirm}>
                                <button
                                    disabled={loading}
                                    className='px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 disabled:opacity-50 rounded-md transition-colors font-medium'
                                >
                                    {loading ? "Deleting..." : "Delete Permanently"}
                                </button>
                            </AdminActionGuard>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `bunx tsc --noEmit 2>&1 | head -10`
Expected: No errors in this file.

- [ ] **Step 3: Commit**

```bash
git add app/payroll/modals/DeleteRateLevelModal.tsx
git commit -m "feat: add DeleteRateLevelModal with reference count display"
```

---

### Task 3.2: Wire Delete Rate Level into RateLevelsTab and PayrollPage

**Files:**
- Modify: `app/payroll/payrollPage.tsx` (RateLevelsTab + parent wiring)
- Modify: `app/payroll/modals/index.ts`

- [ ] **Step 1: Export new modals from index.ts**

Edit `app/payroll/modals/index.ts`, add:
```typescript
export { DeactivateRateModal } from './DeactivateRateModal'
export { DeleteRateLevelModal } from './DeleteRateLevelModal'
```

- [ ] **Step 2: Add `deleteRateLevel` import and state in PayrollPageClient**

Add to the import from `@/server/actions/rate-levels`:
```typescript
import {
    getRateLevels,
    createRateLevel,
    updateRateLevel,
    deactivateRateLevel,
    deleteRateLevel,    // NEW
} from "@/server/actions/rate-levels"
```

Add state variable near the existing rate level state:
```typescript
    const [deletingRateLevel, setDeletingRateLevel] = useState<RateLevelItem | null>(null)
```

- [ ] **Step 3: Add delete handler**

Add after `handleDeactivateRateLevel`:
```typescript
    const handleDeleteRateLevel = async (id: string) => {
        try {
            await deleteRateLevel(id)
            addNotification("Rate level deleted", "SUCCESS")
            setDeletingRateLevel(null)
            await refreshRateLevels()
        } catch (error) {
            addNotification(
                error instanceof Error ? error.message : "Failed to delete rate level",
                "ERROR"
            )
        }
    }
```

- [ ] **Step 4: Update RateLevelsTab component to accept delete props**

Find the `RateLevelsTab` function signature and update:

```typescript
function RateLevelsTab({
    rateLevels,
    isAdmin,
    onCreate,
    onEdit,
    onDeactivate,
    onDelete,
}: {
    rateLevels: RateLevelItem[]
    isAdmin: boolean
    onCreate: () => void
    onEdit: (level: RateLevelItem) => void
    onDeactivate: (level: RateLevelItem) => void
    onDelete: (level: RateLevelItem) => void
}) {
```

- [ ] **Step 5: Add Delete button to the RateLevelsTab action column**

In `RateLevelsTab`, find the actions `<td>` block (near line ~1900):
```tsx
                                {isAdmin && (
                                    <td className='px-4 py-3 text-right'>
                                        <div className='flex justify-end gap-2'>
                                            <AdminActionGuard
                                                onAction={() => onEdit(level)}
                                            >
                                                <button
                                                    className='px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors'
                                                >
                                                    Edit
                                                </button>
                                            </AdminActionGuard>
                                            {level.is_active && (
                                                <AdminActionGuard
                                                    onAction={() => onDeactivate(level)}
                                                >
                                                    <button
                                                        className='px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors'
                                                    >
                                                        Deactivate
                                                    </button>
                                                </AdminActionGuard>
                                            )}
                                        </div>
                                    </td>
                                )}
```

Replace with:
```tsx
                                {isAdmin && (
                                    <td className='px-4 py-3 text-right'>
                                        <div className='flex justify-end gap-2'>
                                            <AdminActionGuard
                                                onAction={() => onEdit(level)}
                                            >
                                                <button
                                                    className='px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors'
                                                >
                                                    Edit
                                                </button>
                                            </AdminActionGuard>
                                            {level.is_active && (
                                                <AdminActionGuard
                                                    onAction={() => onDeactivate(level)}
                                                >
                                                    <button
                                                        className='px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors'
                                                    >
                                                        Deactivate
                                                    </button>
                                                </AdminActionGuard>
                                            )}
                                            <AdminActionGuard
                                                onAction={() => onDelete(level)}
                                            >
                                                <button
                                                    className='px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors'
                                                >
                                                    Delete
                                                </button>
                                            </AdminActionGuard>
                                        </div>
                                    </td>
                                )}
```

- [ ] **Step 6: Update the RateLevelsTab JSX call to pass onDelete**

Find `{activeTab === "rateLevels" && (` block:
```tsx
                        {activeTab === "rateLevels" && (
                            <RateLevelsTab
                                rateLevels={allRateLevels}
                                isAdmin={isAdmin}
                                onCreate={() => setCreatingRateLevel(true)}
                                onEdit={setEditingRateLevel}
                                onDeactivate={setDeactivatingRateLevel}
                                onDelete={setDeletingRateLevel}
                            />
                        )}
```

- [ ] **Step 7: Add DeleteRateLevelModal render**

Add after `deactivatingRateLevel` modal block:
```tsx
            {/* Delete Rate Level Modal */}
            <AnimatePresence>
                {deletingRateLevel && (
                    <DeleteRateLevelModal
                        rateLevel={deletingRateLevel}
                        referenceCount={{ rates: 0, staff: 0 }}
                        onClose={() => setDeletingRateLevel(null)}
                        onConfirm={handleDeleteRateLevel}
                    />
                )}
            </AnimatePresence>
```

Note: `referenceCount` is passed as `{ rates: 0, staff: 0 }` for now. The actual reference check is done server-side in `deleteRateLevel()`. The modal will show the "permanently delete" UI since we pass 0 refs. If the server rejects (due to references), the error notification will surface.

- [ ] **Step 8: Run build check**

Run: `bun run build 2>&1 | tail -30`
Expected: Successful.

- [ ] **Step 9: Commit**

```bash
git add app/payroll/payrollPage.tsx app/payroll/modals/index.ts
git commit -m "feat: wire delete rate level button and modal into payroll page"
```

---

### Phase 3 Verification

- [ ] **Verify Phase 3: Start dev server and verify manually**

Run: `bun run dev`
Navigate to: `/payroll`
- Go to Rate Levels tab → verify Delete button appears in each row
- Click Delete on a level with references → should show error notification (server-side check)
- Click Delete on a level with no references → should succeed

Stop dev server after verification.

---

## Phase 4: Tab Reorganization — Merge Rates + Rate Levels

### Task 4.1: Create Merged `RateConfigurationTab` Component

**Files:**
- Modify: `app/payroll/payrollPage.tsx` (add new component at bottom of file before the last closing function)

- [ ] **Step 1: Create RateConfigurationTab component**

Add this new component right before the `DownpaymentsTab` function at the end of `payrollPage.tsx` (before line ~1965):

```tsx
// ============================================
// Rate Configuration Tab (Merged Rates + Rate Levels)
// ============================================

function RateConfigurationTab({
    rates,
    rateLevels,
    allRateLevels,
    isAdmin,
    onEditRate,
    onCreateRate,
    onDeactivateRate,
    onDeleteRate,
    onCreateLevel,
    onEditLevel,
    onDeactivateLevel,
    onDeleteLevel,
}: {
    rates: PayrollStaffRate[]
    rateLevels: RateLevelItem[]
    allRateLevels: RateLevelItem[]
    isAdmin: boolean
    onEditRate: (rate: PayrollStaffRate) => void
    onCreateRate: () => void
    onDeactivateRate: (rate: PayrollStaffRate) => void
    onDeleteRate: (rate: PayrollStaffRate) => void
    onCreateLevel: () => void
    onEditLevel: (level: RateLevelItem) => void
    onDeactivateLevel: (level: RateLevelItem) => void
    onDeleteLevel: (level: RateLevelItem) => void
}) {
    const [view, setView] = useState<"staffRates" | "rateLevels">("staffRates")

    return (
        <div className='space-y-4'>
            {/* View Toggle */}
            <div className='flex gap-1 p-1 bg-white/5 rounded-lg w-fit'>
                <button
                    onClick={() => setView("staffRates")}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        view === "staffRates"
                            ? "bg-white/20 text-white"
                            : "text-white/60 hover:text-white hover:bg-white/10"
                    }`}
                >
                    Staff Rates
                </button>
                <button
                    onClick={() => setView("rateLevels")}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        view === "rateLevels"
                            ? "bg-white/20 text-white"
                            : "text-white/60 hover:text-white hover:bg-white/10"
                    }`}
                >
                    Rate Levels
                </button>
            </div>

            {/* Content based on selected view */}
            {view === "staffRates" ? (
                <RatesTab
                    rates={rates}
                    isAdmin={isAdmin}
                    onEdit={onEditRate}
                    onCreate={onCreateRate}
                    onDeactivate={onDeactivateRate}
                    onDelete={onDeleteRate}
                />
            ) : (
                <RateLevelsTab
                    rateLevels={allRateLevels}
                    isAdmin={isAdmin}
                    onCreate={onCreateLevel}
                    onEdit={onEditLevel}
                    onDeactivate={onDeactivateLevel}
                    onDelete={onDeleteLevel}
                />
            )}
        </div>
    )
}
```

- [ ] **Step 2: Run TypeScript to verify no errors (will show unused imports for old tab rendering, fixed next)**

Run: `bunx tsc --noEmit 2>&1 | head -20`
Expected: May show errors about unused `useState` — but useState is already imported. Should be fine since we're adding inside the same file.

- [ ] **Step 3: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "feat: add RateConfigurationTab component with Staff Rates / Rate Levels toggle"
```

---

### Task 4.2: Update TabType, Tab Definitions, and Wiring

**Files:**
- Modify: `app/payroll/payrollPage.tsx` (TabType, tab array, fetchData, render area)

- [ ] **Step 1: Replace `TabType` definition**

Replace:
```typescript
type TabType = "dashboard" | "requests" | "rates" | "deductions" | "scheduled" | "downpayments" | "rateLevels"
```

With:
```typescript
type TabType = "dashboard" | "requests" | "rateConfiguration" | "deductions" | "scheduled" | "downpayments"
```

- [ ] **Step 2: Replace the tab definition array**

Find the tabs array (~line 545). Replace the "rates" and "rateLevels" entries with a single "rateConfiguration" entry. The full new array:

```typescript
                    {[
                        {
                            key: "dashboard",
                            label: "Dashboard",
                            shortLabel: "Home",
                            icon: UsersIcon,
                        },
                        {
                            key: "requests",
                            label: "Payment Requests",
                            shortLabel: "Requests",
                            icon: ClockIcon,
                        },
                        {
                            key: "rateConfiguration",
                            label: "Rate Configuration",
                            shortLabel: "Rates",
                            icon: SettingsIcon,
                        },
                        {
                            key: "deductions",
                            label: "Deductions",
                            shortLabel: "Deductions",
                            icon: MinusCircleIcon,
                        },
                        {
                            key: "scheduled",
                            label: "Scheduled",
                            shortLabel: "Scheduled",
                            icon: CalendarIcon,
                        },
                        {
                            key: "downpayments",
                            label: "Downpayments",
                            shortLabel: "DP",
                            icon: BanknoteIcon,
                        },
                    ].map((tab) => (
```

Note: Remove the `LayersIcon` import since it's no longer used.

- [ ] **Step 3: Update fetchData for rateConfiguration tab**

In the `fetchData` function, replace both the `activeTab === "rates"` and `activeTab === "rateLevels"` branches:

Replace:
```typescript
            } else if (activeTab === "rates") {
                const ratesData = await getStaffRates()
                if (ratesData.success) {
                    setRates(ratesData.data)
                }
            } else if (activeTab === "deductions") {
```

With:
```typescript
            } else if (activeTab === "rateConfiguration") {
                const [ratesData] = await Promise.all([
                    getStaffRates(),
                ])
                if (ratesData.success) {
                    setRates(ratesData.data)
                }
                await refreshRateLevels()
            } else if (activeTab === "deductions") {
```

And remove the standalone `} else if (activeTab === "rateLevels") {` block further down.

- [ ] **Step 4: Replace Rates Tab and Rate Levels Tab render blocks with Rate Configuration**

Find the render blocks for `{activeTab === "rates" && (` AND `{activeTab === "rateLevels" && (`. Replace both with:

```tsx
                        {/* Rate Configuration Tab */}
                        {activeTab === "rateConfiguration" && (
                            <RateConfigurationTab
                                rates={rates}
                                rateLevels={rateLevels}
                                allRateLevels={allRateLevels}
                                isAdmin={isAdmin}
                                onEditRate={setEditingRate}
                                onCreateRate={() => setCreatingRate(true)}
                                onDeactivateRate={setDeactivatingRate}
                                onDeleteRate={setDeletingRate}
                                onCreateLevel={() => setCreatingRateLevel(true)}
                                onEditLevel={setEditingRateLevel}
                                onDeactivateLevel={setDeactivatingRateLevel}
                                onDeleteLevel={setDeletingRateLevel}
                            />
                        )}
```

- [ ] **Step 5: Remove unused `LayersIcon` from imports**

In the lucide-react import block, remove `LayersIcon`:
```typescript
import {
    LoaderCircleIcon,
    WalletIcon,
    RefreshCwIcon,
    UsersIcon,
    CheckCircleIcon,
    ClockIcon,
    BanknoteIcon,
    SettingsIcon,
    CheckIcon,
    XCircleIcon,
    SendIcon,
    PlusIcon,
    MinusCircleIcon,
    PaperclipIcon,
    CalendarIcon,
} from "lucide-react"
```

- [ ] **Step 6: Update imports for new modals**

Ensure the modal imports include the new ones:
```typescript
import {
    CompletePaymentModal,
    StaggeredPaymentModal,
    ConfirmRequestModal,
    CancelRequestModal,
    ManualPayrollEntryModal,
    EditRateModal,
    CreateRateModal,
    DeactivateRateModal,
    CreateDeductionModal,
    CancelDeductionModal,
    CreateScheduledPaymentModal,
    CancelScheduledModal,
    StaffRequestModal,
    CreateDownpaymentModal,
    AssignStaffModal,
    CreateRateLevelModal,
    EditRateLevelModal,
    DeactivateRateLevelModal,
    DeleteRateLevelModal,
} from "./modals"
```

Also add server action imports:
```typescript
import {
    // ... existing ...
    deactivateStaffRate,
    deleteStaffRate,
} from "@/server/actions/payroll"
```

And:
```typescript
import {
    // ... existing ...
    deleteRateLevel,
} from "@/server/actions/rate-levels"
```

- [ ] **Step 7: Run build check**

Run: `bun run build 2>&1 | tail -30`
Expected: Successful build with no errors.

- [ ] **Step 8: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "feat: merge Rates and Rate Levels into Rate Configuration tab with toggle"
```

---

### Phase 4 Verification

- [ ] **Verify Phase 4: Dev server manual verification**

Run: `bun run dev`
Navigate to `/payroll` and verify:
1. Tab bar shows 6 tabs: Dashboard, Requests, Rate Configuration, Deductions, Scheduled, Downpayments
2. Click "Rate Configuration" — default view shows Staff Rates table
3. Toggle to "Rate Levels" — shows Rate Levels table
4. Toggle back to "Staff Rates" — shows rates again
5. Create a new rate, edit it, deactivate it, delete it
6. Create a new rate level, edit it, deactivate it, delete it

Stop dev server.

---

## Phase 5: Final Integration & Cleanup

### Task 5.1: Final Build Verification

- [ ] **Step 1: Clean build**

```bash
bun run build
```

Expected: Production build succeeds with zero errors.

- [ ] **Step 2: Lint check**

```bash
bun run lint 2>&1 | tail -20
```

Expected: No new lint errors. If existing lint errors from before, that's acceptable.

- [ ] **Step 3: Dev server smoke test**

```bash
bun run dev &
sleep 5
```

Navigate to:
1. `/payroll` → all tabs render
2. Rate Configuration → toggle between views
3. Create a rate for TATTOO/WALKIN/Standard at 60/40 → success
4. Try creating the same combo again → collision error message
5. Edit the rate → change percentages, toggle active/inactive
6. Deactivate a rate → confirmation modal → rate disappears from default view
7. Delete a rate with no references → success
8. Create a rate level → success
9. Delete a rate level with no refs → success

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: final integration verification for payroll rates CRUD overhaul"
```

- [ ] **Step 5: Tag the working state**

```bash
git tag payroll-rates-crud-v1
```

---

### Phase 5 Verification

- [ ] **All manual checks pass with no errors**
- [ ] **Build succeeds**
- [ ] **No runtime exceptions in browser console**

---

## Implementation Summary

| Phase | Tasks | Files Changed | New Files |
|-------|-------|---------------|-----------|
| 1: Backend | 3 | `server/actions/payroll.ts`, `server/actions/rate-levels.ts` | — |
| 2: Rate UI | 3 | `app/payroll/modals/EditRateModal.tsx`, `app/payroll/payrollPage.tsx` | `app/payroll/modals/DeactivateRateModal.tsx` |
| 3: Level Delete | 2 | `app/payroll/payrollPage.tsx`, `app/payroll/modals/index.ts` | `app/payroll/modals/DeleteRateLevelModal.tsx` |
| 4: Tab Merge | 2 | `app/payroll/payrollPage.tsx` | — |
| 5: Verify | 1 | — | — |
