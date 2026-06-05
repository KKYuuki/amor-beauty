# Rate Levels CRUD & Sales Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement full CRUD for rate levels, fix all "Artist Level" → "Rate Level" label issues, ensure sales/checkout correctly detects and uses rate levels, and fix lint/build errors.

**Architecture:** Add a "Rate Levels" management tab to the payroll page with create/edit/deactivate modals. Fix the sales checkout flow to show staff rate levels and properly handle edge cases where staff lack rate levels. Change the "Artist Level" column header in the accounts table to "Rate Level".

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Tailwind CSS 4, Motion (Framer Motion), Supabase/Drizzle, Server Actions

---

## Problem Summary

1. **No Rate Level CRUD UI exists** — Server actions (`createRateLevel`, `updateRateLevel`, `deactivateRateLevel`, `deleteRateLevel`) exist but no UI calls them. Rate levels are currently seed-only.
2. **"Artist Level" label** still appears in `UserTable.tsx` column header (line 48).
3. **Sales checkout has rate level detection gaps** — staff list lacks `rate_level_id`, `clientType` defaults to WALKIN when loading appointments, and payroll entries silently fail when staff lack rate levels.
4. **Minor cleanup** — Stale "was: artist_level" comments, migration script reference.

---

## Task 1: Rename "Artist Level" Column → "Rate Level"

**Files:**
- Modify: `components/accounts/UserTable.tsx:48`

**Step 1: Change the column header**

In `components/accounts/UserTable.tsx`, line 48, change:
```
Artist Level
```
to:
```
Rate Level
```

**Step 2: Verify no other "Artist Level" strings in UI code**

Run: `rg "Artist Level" --type tsx --type ts components/ app/`
Expected: Zero matches in UI-facing strings (comments in types are acceptable).

**Step 3: Commit**

```bash
git add components/accounts/UserTable.tsx
git commit -m "fix: rename Artist Level column to Rate Level in accounts table"
```

---

## Task 2: Create RateLevel CRUD Modals

**Files:**
- Create: `app/payroll/modals/CreateRateLevelModal.tsx`
- Create: `app/payroll/modals/EditRateLevelModal.tsx`
- Create: `app/payroll/modals/DeactivateRateLevelModal.tsx`
- Modify: `app/payroll/modals/index.ts`

**Step 1: Create CreateRateLevelModal.tsx**

Follow the pattern from `CreateRateModal.tsx`. The modal needs:
- `name` (text input, required)
- `sort_order` (number input, optional, defaults to 0)
- Loading state, disabled when `!name.trim()`
- Props: `onClose: () => void`, `onSave: (name: string, sortOrder?: number) => Promise<void>`
- Imports: `useState` from React, `motion` from `motion/react`, `XIcon` from `lucide-react`

```tsx
"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { XIcon } from "lucide-react"

interface CreateRateLevelModalProps {
    onClose: () => void
    onSave: (name: string, sortOrder?: number) => Promise<void>
}

export function CreateRateLevelModal({ onClose, onSave }: CreateRateLevelModalProps) {
    const [name, setName] = useState("")
    const [sortOrder, setSortOrder] = useState(0)
    const [loading, setLoading] = useState(false)

    const handleSave = async () => {
        setLoading(true)
        await onSave(name.trim(), sortOrder || undefined)
        setLoading(false)
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
                    <h3 className='text-xl font-bold'>Create Rate Level</h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div>
                        <label className='block text-sm font-medium mb-1'>Name</label>
                        <input
                            type='text'
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder='e.g. Standard, Senior, Owner'
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Sort Order</label>
                        <input
                            type='number'
                            min='0'
                            value={sortOrder}
                            onChange={(e) => setSortOrder(Number(e.target.value))}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none font-mono'
                        />
                        <p className='text-xs text-white/40 mt-1'>Lower numbers appear first</p>
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'>Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={loading || !name.trim()}
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                        >
                            {loading ? "Creating..." : "Create Level"}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
```

**Step 2: Create EditRateLevelModal.tsx**

Follow the `EditRateModal.tsx` pattern. Allows editing name, sort_order, and toggling active status. The `isActive` toggle uses the same style as the payment mode toggle in `CreateRateModal.tsx`.

```tsx
"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { XIcon } from "lucide-react"
import { RateLevelItem } from "@/utils/types/payroll"

interface EditRateLevelModalProps {
    rateLevel: RateLevelItem
    onClose: () => void
    onSave: (id: string, updates: { name?: string; is_active?: boolean; sort_order?: number }) => Promise<void>
}

export function EditRateLevelModal({ rateLevel, onClose, onSave }: EditRateLevelModalProps) {
    const [name, setName] = useState(rateLevel.name)
    const [sortOrder, setSortOrder] = useState(rateLevel.sort_order)
    const [isActive, setIsActive] = useState(rateLevel.is_active)
    const [loading, setLoading] = useState(false)

    const handleSave = async () => {
        setLoading(true)
        await onSave(rateLevel.id, {
            name: name.trim() !== rateLevel.name ? name.trim() : undefined,
            is_active: isActive !== rateLevel.is_active ? isActive : undefined,
            sort_order: sortOrder !== rateLevel.sort_order ? sortOrder : undefined,
        })
        setLoading(false)
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
                    <h3 className='text-xl font-bold'>Edit Rate Level</h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div className='bg-white/5 rounded-md px-3 py-2 text-sm text-white/60'>
                        Editing: <span className='text-white font-medium'>{rateLevel.name}</span>
                        <span className='ml-2 text-xs'>({rateLevel.slug})</span>
                        {!rateLevel.is_active && (
                            <span className='ml-2 px-1.5 py-0.5 bg-red-500/20 text-red-300 rounded text-xs font-semibold'>Inactive</span>
                        )}
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Name</label>
                        <input
                            type='text'
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Sort Order</label>
                        <input
                            type='number'
                            min='0'
                            value={sortOrder}
                            onChange={(e) => setSortOrder(Number(e.target.value))}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none font-mono'
                        />
                    </div>

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
                        {!isActive && rateLevel.is_active && (
                            <p className='text-xs text-yellow-400 mt-1'>Warning: Deactivating will prevent this level from being assigned to new rates or staff.</p>
                        )}
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'>Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                        >
                            {loading ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
```

**Step 3: Create DeactivateRateLevelModal.tsx**

Confirmation modal following the `CancelDeductionModal.tsx` pattern with `AdminActionGuard`.

```tsx
"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { XIcon, AlertTriangleIcon } from "lucide-react"
import AdminActionGuard from "@/components/admin/AdminActionGuard"
import { RateLevelItem } from "@/utils/types/payroll"

interface DeactivateRateLevelModalProps {
    rateLevel: RateLevelItem
    onClose: () => void
    onConfirm: (id: string) => Promise<void>
}

export function DeactivateRateLevelModal({ rateLevel, onClose, onConfirm }: DeactivateRateLevelModalProps) {
    const [loading, setLoading] = useState(false)

    const handleConfirm = async () => {
        setLoading(true)
        await onConfirm(rateLevel.id)
        setLoading(false)
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
                    <h3 className='text-xl font-bold text-red-400'>Deactivate Rate Level</h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div className='flex items-start gap-3'>
                        <AlertTriangleIcon className='w-6 h-6 text-yellow-400 shrink-0 mt-0.5' />
                        <div>
                            <p className='text-white font-medium'>
                                Are you sure you want to deactivate &quot;{rateLevel.name}&quot;?
                            </p>
                            <p className='text-white/60 text-sm mt-2'>
                                This will prevent it from being assigned to new rates or staff members. Existing assignments will be preserved.
                            </p>
                        </div>
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'>Cancel</button>
                        <AdminActionGuard onAction={handleConfirm}>
                            <button
                                disabled={loading}
                                className='px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 disabled:opacity-50 rounded-md transition-colors font-medium'
                            >
                                {loading ? "Deactivating..." : "Deactivate"}
                            </button>
                        </AdminActionGuard>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
```

**Step 4: Export the new modals from `app/payroll/modals/index.ts`**

Add these lines:
```typescript
export { CreateRateLevelModal } from './CreateRateLevelModal'
export { EditRateLevelModal } from './EditRateLevelModal'
export { DeactivateRateLevelModal } from './DeactivateRateLevelModal'
```

**Step 5: Verify no lint errors**

Run: `bun run lint`
Expected: No new warnings or errors.

**Step 6: Commit**

```bash
git add app/payroll/modals/CreateRateLevelModal.tsx app/payroll/modals/EditRateLevelModal.tsx app/payroll/modals/DeactivateRateLevelModal.tsx app/payroll/modals/index.ts
git commit -m "feat: add rate level CRUD modals (create, edit, deactivate)"
```

---

## Task 3: Add Rate Levels Tab to Payroll Page

**Files:**
- Modify: `app/payroll/payrollPage.tsx`

**Step 1: Add the "rateLevels" tab type**

In `payrollPage.tsx`, update the `TabType` union to include `"rateLevels"`:
```typescript
type TabType = "dashboard" | "requests" | "rates" | "deductions" | "scheduled" | "downpayments" | "rateLevels"
```

**Step 2: Add state variables for rate level modals**

Add alongside existing modal state (after `editingRate`, `creatingRate`, etc.):
```typescript
const [creatingRateLevel, setCreatingRateLevel] = useState(false)
const [editingRateLevel, setEditingRateLevel] = useState<RateLevelItem | null>(null)
const [deactivatingRateLevel, setDeactivatingRateLevel] = useState<RateLevelItem | null>(null)
const [allRateLevels, setAllRateLevels] = useState<RateLevelItem[]>([])
```

**Step 3: Add the "Rate Levels" tab button**

In the tabs array (around line 492), add after the existing tabs:
```typescript
{
    key: "rateLevels",
    label: "Rate Levels",
    shortLabel: "Levels",
    icon: LayersIcon, // import from lucide-react
}
```

**Step 4: Create the RateLevelsTab function component**

Define it at the bottom of `payrollPage.tsx` following the same pattern as `RatesTab`, `DownpaymentsTab`, etc. It should:
- Accept `rateLevels: RateLevelItem[]`, `isAdmin: boolean`, `onCreate`, `onEdit`, `onDeactivate` props
- Display a table with columns: Name, Slug, Status (Active/Inactive badge), Sort Order, Actions (Edit, Deactivate)
- Show a "Create Rate Level" button when `isAdmin` is true, wrapped in `<AdminActionGuard>`
- Inactive levels show a muted/dimmed row style with an "Inactive" badge
- Edit button calls `onEdit(level)`, Deactivate button calls `onDeactivate(level)`

```tsx
function RateLevelsTab({
    rateLevels,
    isAdmin,
    onCreate,
    onEdit,
    onDeactivate,
}: {
    rateLevels: RateLevelItem[]
    isAdmin: boolean
    onCreate: () => void
    onEdit: (level: RateLevelItem) => void
    onDeactivate: (level: RateLevelItem) => void
}) {
    return (
        <div className='space-y-4'>
            <div className='flex justify-between items-center'>
                <p className='text-white/60 text-sm'>Manage rate levels that determine commission splits for staff.</p>
                {isAdmin && (
                    <AdminActionGuard onAction={onCreate}>
                        <button className='px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors font-medium flex items-center gap-2'>
                            <PlusIcon className='w-4 h-4' />
                            Create Level
                        </button>
                    </AdminActionGuard>
                )}
            </div>

            <div className='rounded-lg border border-white/10 overflow-hidden'>
                <table className='w-full'>
                    <thead className='bg-white/5'>
                        <tr>
                            <th className='text-left px-4 py-3 text-sm font-semibold text-white/60'>Name</th>
                            <th className='text-left px-4 py-3 text-sm font-semibold text-white/60'>Slug</th>
                            <th className='text-left px-4 py-3 text-sm font-semibold text-white/60'>Status</th>
                            <th className='text-left px-4 py-3 text-sm font-semibold text-white/60'>Order</th>
                            {isAdmin && (
                                <th className='text-right px-4 py-3 text-sm font-semibold text-white/60'>Actions</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {rateLevels.map((level) => (
                            <tr
                                key={level.id}
                                className={`border-t border-white/5 ${!level.is_active ? 'opacity-50' : 'hover:bg-white/5'}`}
                            >
                                <td className='px-4 py-3 text-sm font-medium'>{level.name}</td>
                                <td className='px-4 py-3 text-sm text-white/60 font-mono'>{level.slug}</td>
                                <td className='px-4 py-3'>
                                    {level.is_active ? (
                                        <span className='px-2 py-0.5 rounded text-xs font-semibold bg-green-500/30 text-green-300'>Active</span>
                                    ) : (
                                        <span className='px-2 py-0.5 rounded text-xs font-semibold bg-red-500/30 text-red-300'>Inactive</span>
                                    )}
                                </td>
                                <td className='px-4 py-3 text-sm font-mono'>{level.sort_order}</td>
                                {isAdmin && (
                                    <td className='px-4 py-3 text-right'>
                                        <div className='flex justify-end gap-2'>
                                            <button
                                                onClick={() => onEdit(level)}
                                                className='px-2 py-1 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors'
                                            >
                                                Edit
                                            </button>
                                            {level.is_active && (
                                                <button
                                                    onClick={() => onDeactivate(level)}
                                                    className='px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors'
                                                >
                                                    Deactivate
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                        {rateLevels.length === 0 && (
                            <tr>
                                <td colSpan={5} className='px-4 py-8 text-center text-white/40'>
                                    No rate levels found. Create one to get started.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
```

**Step 5: Add tab content rendering**

In the content section where other tabs render, add:
```tsx
{activeTab === "rateLevels" && (
    <RateLevelsTab
        rateLevels={allRateLevels}
        isAdmin={isAdmin}
        onCreate={() => setCreatingRateLevel(true)}
        onEdit={setEditingRateLevel}
        onDeactivate={setDeactivatingRateLevel}
    />
)}
```

**Step 6: Add modal rendering**

In the modals section at the bottom of the JSX, add alongside other `<AnimatePresence>` blocks:
```tsx
<AnimatePresence>
    {creatingRateLevel && (
        <CreateRateLevelModal
            onClose={() => setCreatingRateLevel(false)}
            onSave={handleCreateRateLevel}
        />
    )}
</AnimatePresence>

<AnimatePresence>
    {editingRateLevel && (
        <EditRateLevelModal
            rateLevel={editingRateLevel}
            onClose={() => setEditingRateLevel(null)}
            onSave={handleUpdateRateLevel}
        />
    )}
</AnimatePresence>

<AnimatePresence>
    {deactivatingRateLevel && (
        <DeactivateRateLevelModal
            rateLevel={deactivatingRateLevel}
            onClose={() => setDeactivatingRateLevel(null)}
            onConfirm={handleDeactivateRateLevel}
        />
    )}
</AnimatePresence>
```

**Step 7: Add handler functions**

Add handler functions in the `PayrollPageClient` component:
```typescript
const handleCreateRateLevel = async (name: string, sortOrder?: number) => {
    try {
        const result = await createRateLevel({ name, sort_order: sortOrder })
        addNotification("Rate level created", "SUCCESS")
        setCreatingRateLevel(false)
        await refreshRateLevels()
    } catch (error) {
        addNotification(error instanceof Error ? error.message : "Failed to create rate level", "ERROR")
    }
}

const handleUpdateRateLevel = async (id: string, updates: { name?: string; is_active?: boolean; sort_order?: number }) => {
    try {
        await updateRateLevel({ id, ...updates })
        addNotification("Rate level updated", "SUCCESS")
        setEditingRateLevel(null)
        await refreshRateLevels()
    } catch (error) {
        addNotification(error instanceof Error ? error.message : "Failed to update rate level", "ERROR")
    }
}

const handleDeactivateRateLevel = async (id: string) => {
    try {
        await deactivateRateLevel(id)
        addNotification("Rate level deactivated", "SUCCESS")
        setDeactivatingRateLevel(null)
        await refreshRateLevels()
    } catch (error) {
        addNotification(error instanceof Error ? error.message : "Failed to deactivate rate level", "ERROR")
    }
}
```

**Step 8: Add refreshRateLevels helper and update data fetching**

Add a helper function that refreshes both `rateLevels` (active only) and `allRateLevels` (all):
```typescript
const refreshRateLevels = async () => {
    const [allLevels, activeLevels] = await Promise.all([
        getRateLevels(false),
        getRateLevels(true),
    ])
    setAllRateLevels(allLevels)
    setRateLevels(activeLevels)
}
```

Modify the existing `rateLevels` mount effect to also set `allRateLevels` and fetch all on the rateLevels tab:
```typescript
useEffect(() => {
    refreshRateLevels().catch(console.error)
}, [])
```

And in `fetchData`, add:
```typescript
if (activeTab === "rateLevels") {
    const levels = await getRateLevels(false)
    setAllRateLevels(levels)
}
```

**Step 9: Add required imports**

At the top of `payrollPage.tsx`, add:
```typescript
import { LayersIcon, PlusIcon } from "lucide-react"
import { createRateLevel, updateRateLevel, deactivateRateLevel } from "@/server/actions/rate-levels"
import { CreateRateLevelModal, EditRateLevelModal, DeactivateRateLevelModal } from "./modals"
```

(Adjust the import paths as needed based on how other modals are imported.)

**Step 10: Verify the page builds and renders**

Run: `bun run build`
Expected: No build errors.

**Step 11: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "feat: add Rate Levels management tab to payroll page with full CRUD"
```

---

## Task 4: Show Rate Level in Sales Checkout Staff Dropdown

**Files:**
- Modify: `components/sales/modals/CheckoutModal.tsx`
- Modify: `server/actions/profile.ts` (the `getStaffList` function)

**Step 1: Add `rate_level_id` and `rate_level_name` to `getStaffList` return type**

In `server/actions/profile.ts`, find the `getStaffList` function (around line 290-313). The current return strips `rate_level_id`. Add it back:

```typescript
// In the mapping of staff results:
return staff.map(s => ({
    id: s.id,
    full_name: s.full_name,
    avatar_url: s.avatar_url,
    access_flags: s.access_flags,
    role: s.role,
    rate_level_id: s.rate_level_id ?? undefined,    // ADD
    rate_level_name: s.rate_level_name ?? undefined,   // ADD
}))
```

Also update the corresponding TypeScript type/interface for the staff list item.

**Step 2: Update the staff list type in SalesContext**

In `components/sales/context/SalesContext.tsx`, find the staff list type/interface and add `rate_level_id` and `rate_level_name` as optional fields if they don't already exist.

**Step 3: Display rate level in the staff dropdown**

In `components/sales/modals/CheckoutModal.tsx`, update the staff `<option>` elements to show the rate level name:

```tsx
{staffList.map((staff) => (
    <option key={staff.id} value={staff.id}>
        {staff.full_name} ({staff.role || 'staff'}{staff.rate_level_name ? ` - ${staff.rate_level_name}` : ''})
    </option>
))}
```

**Step 4: Verify lint and build**

Run: `bun run lint && bun run build`
Expected: No errors.

**Step 5: Commit**

```bash
git add server/actions/profile.ts components/sales/context/SalesContext.tsx components/sales/modals/CheckoutModal.tsx
git commit -m "feat: show rate level in sales checkout staff dropdown"
```

---

## Task 5: Fix Silent Payroll Entry Failure in Sales

**Files:**
- Modify: `server/actions/transactions.ts`
- Modify: `server/actions/payroll.ts`

**Step 1: Add warning notification when staff lacks rate level**

In `server/actions/payroll.ts`, the `calculateAndCreatePayrollEntry` function (around line 688) returns a failure message when no rate is found. Modify the error message to include the staff ID and service type for debugging:

Change:
```typescript
return failure(`No rate found for ${serviceType} / ${clientType}`)
```
to:
```typescript
return failure(`No rate found for ${serviceType} / ${clientType}${rateLevelId ? ` (level: ${rateLevelId})` : ' (no rate level assigned)'}`)
```

**Step 2: Propagate payroll failure info to the client**

In `server/actions/transactions.ts` (around lines 211-217), change the catch block from silently logging to also storing the error info so it can be surfaced to the user:

```typescript
if (payload.staff_id) {
    for (const item of payload.items) {
        if (item.service_id) {
            try {
                await calculateAndCreatePayrollEntry({...}, tx)
            } catch (payrollError) {
                await logError({...})
                payrollErrors.push({
                    serviceId: item.service_id,
                    error: payrollError instanceof Error ? payrollError.message : 'Unknown payroll error'
                })
            }
        }
    }
}
```

Then include `payrollErrors` in the transaction response so the client can display warnings:
```typescript
return success({
    ...newTransaction,
    payrollErrors: payrollErrors.length > 0 ? payrollErrors : undefined,
})
```

**Step 3: Display payroll warnings in CheckoutModal**

In `CheckoutModal.tsx`, after the transaction completes, check for `payrollErrors` and display a warning notification:
```typescript
if (result.data?.payrollErrors?.length) {
    addNotification(
        `Warning: ${result.data.payrollErrors.length} service(s) could not calculate commission. Staff may not have a rate level assigned.`,
        "ERROR"
    )
}
```

**Step 4: Update the transaction return type**

Update the `CreateTransactionPayload` return type (or the interface in `utils/types/transactions.ts`) to include the optional `payrollErrors` field.

**Step 5: Verify lint and build**

Run: `bun run lint && bun run build`
Expected: No errors.

**Step 6: Commit**

```bash
git add server/actions/payroll.ts server/actions/transactions.ts components/sales/modals/CheckoutModal.tsx utils/types/transactions.ts
git commit -m "fix: surface payroll entry failures as warnings during checkout"
```

---

## Task 6: Auto-Assign Rate Level When Staff Missing One

**Files:**
- Modify: `components/accounts/EditUserModal.tsx`
- Modify: `app/accounts/[id]/page.tsx`

**Step 1: Warn when editing a user who should have a rate level but doesn't**

In `components/accounts/EditUserModal.tsx`, add a visual warning when a user with `shouldHaveRateLevel` is true but `rate_level_id` is empty. This ensures admins notice the gap:

After the rate level dropdown (around line 455), add:
```tsx
{shouldHaveRateLevel(localUser) && !localUser.rate_level_id && (
    <p className='text-yellow-400 text-xs mt-1'>
        Warning: This user has no rate level assigned. Commission calculations will fail.
    </p>
)}
```

Import `shouldHaveRateLevel` from `@/utils/auth/user-capabilities` if not already imported.

**Step 2: Same warning in the user detail page**

In `app/accounts/[id]/page.tsx`, around the rate level selector (line 540), add a similar warning:
```tsx
{hasWorkCapability(editData) && !editData.rate_level_id && (
    <p className='text-yellow-400 text-xs mt-1'>
        Warning: No rate level assigned. Commission calculations will fail.
    </p>
)}
```

**Step 3: Verify lint**

Run: `bun run lint`
Expected: No errors.

**Step 4: Commit**

```bash
git add components/accounts/EditUserModal.tsx app/accounts/[id]/page.tsx
git commit -m "feat: add warning for users missing rate level assignment"
```

---

## Task 7: Clean Up Stale "Artist Level" Comments

**Files:**
- Modify: `utils/types/payroll.ts` (lines 36, 104, 260)

**Step 1: Remove stale `// was: artist_level` comments**

In `utils/types/payroll.ts`, change:
- Line 36: `rate_level_id?: string // was: artist_level: ArtistLevel` → `rate_level_id?: string`
- Line 104: `rate_level_id?: string // was: artist_level` → `rate_level_id?: string`
- Line 260: `rate_level_id?: string // was: artist_level` → `rate_level_id?: string`

**Step 2: Verify no other "artist_level" or "ArtistLevel" references in app code**

Run: `rg "artist_level|ArtistLevel" --type ts --type tsx app/ components/ utils/ server/`
Expected: No matches (migration script and drizzle can be excluded).

**Step 3: Commit**

```bash
git add utils/types/payroll.ts
git commit -m "chore: remove stale artist_level comments from payroll types"
```

---

## Task 8: Final Lint, Build, and Type Verification

**Files:**
- Potentially multiple files if issues are found

**Step 1: Run full lint check**

Run: `bun run lint`
Expected: Zero warnings and errors. If any appear, fix them.

**Step 2: Run full type check**

Run: `bunx tsc --noEmit`
Expected: Zero type errors. If any appear, fix them.

**Step 3: Run production build**

Run: `bun run build`
Expected: Build succeeds with no errors. If any appear, fix them.

**Step 4: Fix any issues found**

For each issue found in Steps 1-3, fix the specific file, re-run the check, and verify.

**Step 5: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve lint, type, and build errors"
```

(Only commit if there were actual fixes needed.)

---

## Summary of Changes

| Task | Description | Risk |
|------|-------------|------|
| 1 | Rename "Artist Level" → "Rate Level" in UserTable column header | Low — simple text change |
| 2 | Create CRUD modals (Create, Edit, Deactivate) for rate levels | Low — new files, follows existing modal pattern |
| 3 | Add Rate Levels tab to payroll page | Medium — modifies main payroll page, adds state and handlers |
| 4 | Show rate level in sales checkout staff dropdown | Medium — modifies server action return type |
| 5 | Surface payroll entry failures as warnings in checkout | Medium — changes transaction response type |
| 6 | Add warning for users missing rate level | Low — visual warning, no logic change |
| 7 | Clean up stale "artist_level" comments | Very Low — comment removal only |
| 8 | Final lint, build, type verification | Low — verification step |

**Total estimated effort:** 8 tasks, ~2-3 hours of implementation.