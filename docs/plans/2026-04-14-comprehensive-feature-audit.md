# Comprehensive Feature Audit & Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit and fix all logic, flows, UI flow, branch integration, and accounting integration issues across Appointments, Metrics, Inventory, and Sales features, then resolve all lint/build errors.

**Architecture:** Systematic per-feature audit with cross-feature integration fixes at the end. Each phase addresses critical bugs first, then moderate issues, then improvements. Final phase ensures zero lint/build warnings.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Tailwind CSS 4, Supabase (PostgreSQL + Auth), Drizzle ORM, Bun

---

## Phase 1: Appointments Audit & Fixes

### Task 1.1: Fix type-specific detail edits not persisting to database

**Severity:** CRITICAL (data loss bug)

**Files:**
- Modify: `app/appointments/appointmentDetailClient.tsx:939-975`
- Modify: `server/actions/appointments.ts` (verify `updateAppointmentDetails` exists)

**Problem:** The `TattooDetailsEdit`, `PiercingDetailsEdit`, and `ShoeDetailsEdit` components call `onUpdate` which only updates local state via `setTypeSpecificDetails`. There is no save handler that calls `updateAppointmentDetails()` to persist changes to the database. Users can edit these fields in the UI but changes are lost on refresh.

**Step 1: Add a `handleSaveDetails` function in `appointmentDetailClient.tsx`**

In the detail client, add a handler that calls `updateAppointmentDetails`:

```typescript
const handleSaveDetails = async (type: string, details: Record<string, unknown>) => {
    const result = await updateAppointmentDetails({
        appointment_id: appointment.id,
        type: type as 'TATTOO' | 'PIERCING' | 'SHOE',
        details,
    })
    if (result.success) {
        addNotification({ type: 'success', message: 'Details saved' })
    } else {
        addNotification({ type: 'error', message: result.error || 'Failed to save details' })
    }
}
```

**Step 2: Wire `onSave` callback to each detail edit component**

Pass `onSave` to `TattooDetailsEdit`, `PiercingDetailsEdit`, and `ShoeDetailsEdit` that calls `handleSaveDetails` with the appropriate type and details object.

**Step 3: Add a "Save" button next to each detail section**

Add a visible save button within each detail edit section that triggers `onSave`.

**Step 4: Verify persistence manually**

Create/edit an appointment, modify tattoo/piercing/shoe details, save, and refresh to confirm data persists.

**Step 5: Commit**

```bash
git add app/appointments/appointmentDetailClient.tsx
git commit -m "fix(appointments): persist type-specific detail edits to database"
```

---

### Task 1.2: Fix `branch_name` not populated in appointments list view

**Severity:** CRITICAL (data display bug)

**Files:**
- Modify: `server/actions/appointments.ts:388-428`

**Problem:** `getUserAppointments` doesn't join with the `branches` table, so `branch_name` is always empty. The list page renders a `branch_name` column that shows "All Branches" or blank. `getAppointment` (line 536) correctly joins branches.

**Step 1: Add branch join to `getUserAppointments`**

In `server/actions/appointments.ts`, modify the `getUserAppointments` function to include a branch join similar to `getAppointment`:

```typescript
const data = await db.query.appointments.findMany({
    where: and(...filters),
    with: {
        branch: true,
    },
    columns: {
        // ... existing columns
        branch_id: true,
    },
    orderBy: [desc(appointments.timeStart)],
})
```

Then map the result to include `branch_name: appointment.branch?.name || 'All Branches'`.

**Step 2: Do the same for `getAllAppointments` and `getMonthlyAppointments`**

Apply the same branch join pattern to `getAllAppointments` (line 430) and `getMonthlyAppointments` (line 493).

**Step 3: Verify the branch column displays correctly**

Check the appointments list page shows correct branch names.

**Step 4: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "fix(appointments): populate branch_name in list queries with branch join"
```

---

### Task 1.3: Fix unvalidated `branch_id` in `createAppointment`

**Severity:** CRITICAL (security/validation)

**Files:**
- Modify: `server/actions/appointments.ts:730`

**Problem:** `createAppointment` uses `appointment.branch_id` (raw input) instead of `validated.data.branch_id` (Zod-validated) on line 730. This bypasses validation.

**Step 1: Replace raw input with validated data**

Change line 730 from:

```typescript
branchId: appointment.branch_id
```

to:

```typescript
branchId: validated.data.branch_id
```

**Step 2: Review other fields for similar issues**

Check all other fields in the `createAppointment` and `updateAppointment` functions to ensure they use `validated.data.*` instead of raw input.

**Step 3: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "fix(appointments): use validated branch_id instead of raw input"
```

---

### Task 1.4: Fix `createWalkinAppointment` race condition

**Severity:** HIGH (data integrity)

**Files:**
- Modify: `server/actions/appointments.ts:1588-1670`

**Problem:** Unlike `createAppointment` which uses `db.transaction()` for overlap checks, `createWalkinAppointment` performs the overlap check outside a transaction, creating a TOCTOU race condition.

**Step 1: Wrap walk-in creation in a transaction**

Refactor `createWalkinAppointment` to use `withTransaction()` for the overlap check and insert, similar to `createAppointment`:

```typescript
export async function createWalkinAppointment(...) {
    // ... validation ...

    const result = await withTransaction(async (tx) => {
        // Overlap check inside transaction
        const overlaps = await tx.query.appointments.findMany({...})
        if (overlaps.length > 0) {
            return failure('Staff member has a scheduling conflict')
        }

        // Insert inside transaction
        const [newAppointment] = await tx.insert(appointments).values({...}).returning()
        // ... create type-specific details ...
        return success(newAppointment)
    })
    return result
}
```

**Step 2: Verify walk-in creation still works**

Test creating a walk-in appointment.

**Step 3: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "fix(appointments): wrap walk-in creation in transaction to prevent race condition"
```

---

### Task 1.5: Fix simplified detail edit components missing fields

**Severity:** MODERATE (UX gap)

**Files:**
- Modify: `components/appointments/TattooDetailsEdit.tsx`
- Modify: `components/appointments/PiercingDetailsEdit.tsx`
- Modify: `components/appointments/ShoeDetailsEdit.tsx`

**Problem:**
- `TattooDetailsEdit` is missing: `artist_prep_time`, `reference_image_id`, `final_image_id`
- `PiercingDetailsEdit` is missing: `previous_piercing_issues`, `aftercare_instructions`
- `ShoeDetailsEdit` is missing: `pick_up_date`, `add_ons`, `sole_whitening`, `reglue_service`, `total_cost`

**Step 1: Add missing fields to `ShoeDetailsEdit.tsx`**

Add form fields for `pick_up_date` (date input), `add_ons` (checkbox group for rush, replacement, water repellent), `sole_whitening` (checkbox), `reglue_service` (checkbox), `total_cost` (computed/display only).

**Step 2: Add missing fields to `PiercingDetailsEdit.tsx`**

Add `previous_piercing_issues` (textarea) and `aftercare_instructions` (textarea) fields.

**Step 3: Add missing fields to `TattooDetailsEdit.tsx`**

Add `artist_prep_time` (number input) and reference image upload fields. Note: `final_image_id` is handled in the complete modal, so skip it here.

**Step 4: Commit**

```bash
git add components/appointments/
git commit -m "fix(appointments): add missing fields to detail edit components"
```

---

### Task 1.6: Fix inconsistent return types in item/service actions

**Severity:** MODERATE (type safety)

**Files:**
- Modify: `server/actions/appointments.ts` (functions around lines 1349-1557)

**Problem:** `addServiceToAppointment` returns `{ success: boolean; message?: string }`, while `removeServiceFromAppointment` and item actions return just `boolean`. They should all use the `ActionResponse<T>` pattern.

**Step 1: Refactor `addServiceToAppointment` return type**

Change return type to `ActionResponse<{ id: string }>` and use `success()`/`failure()` helpers.

**Step 2: Refactor `removeServiceFromAppointment` return type**

Change from returning `boolean` to `ActionResponse<boolean>`.

**Step 3: Refactor all appointment item actions similarly**

Apply `ActionResponse` pattern to `getAppointmentItems`, `addAppointmentItem`, `updateAppointmentItem`, `deleteAppointmentItem`.

**Step 4: Update client callers to handle new return types**

Update `appointmentDetailClient.tsx` to properly handle the new `ActionResponse` return types (check `result.success` instead of treating return values as booleans).

**Step 5: Commit**

```bash
git add server/actions/appointments.ts app/appointments/appointmentDetailClient.tsx
git commit -m "refactor(appointments): standardize action return types to ActionResponse"
```

---

### Task 1.7: Fix `console.error` to use `createLogs` utility

**Severity:** LOW (code quality)

**Files:**
- Modify: `components/appointments/WalkinAppointmentModal.tsx:341`

**Step 1: Replace `console.error` with `createLogs`**

Change:
```typescript
console.error(...)
```
to:
```typescript
import { createLogs } from '@/utils/logs'
// ...
createLogs({ logs: [{ level: 'ERROR', message: error.message }] })
```

**Step 2: Audit all appointment files for other `console.error/log` calls**

Search and replace all console calls in appointment components with the proper logging utility.

**Step 3: Commit**

```bash
git add components/appointments/ app/appointments/
git commit -m "fix(appointments): replace console.error with createLogs utility"
```

---

### Task 1.8: Fix missing `client_email` in edit form reset

**Severity:** LOW (data integrity)

**Files:**
- Modify: `app/appointments/appointmentDetailClient.tsx:493-506`

**Problem:** When cancelling edits, the reset function doesn't include `client_email`, causing it to revert to the value at mount time instead of the original value.

**Step 1: Add `client_email` to the reset logic**

In the cancel edit handler, add `client_email` to the reset object alongside `client_name` and `client_phone`.

**Step 2: Commit**

```bash
git add app/appointments/appointmentDetailClient.tsx
git commit -m "fix(appointments): include client_email in edit form reset"
```

---

### Task 1.9: Remove dead code - `logsMetrics.tsx` and `AppointmentRating` type

**Severity:** LOW (code cleanup)

**Files:**
- Delete: `components/metrics/logsMetrics.tsx`
- Modify: `utils/types/general.ts:111-122` (remove `AppointmentRating`)

**Step 1: Delete `logsMetrics.tsx`**

This component is not imported anywhere.

**Step 2: Remove unused `AppointmentRating` type from `general.ts`**

This type has no corresponding database table or server action.

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove dead code (logsMetrics, AppointmentRating type)"
```

---

### Task 1.10: Rename `appointmentBox.tsx` export for consistency

**Severity:** LOW (discoverability)

**Files:**
- Rename: `components/appointments/appointmentBox.tsx` -> `components/appointments/editAppointmentCard.tsx` (or rename the export)
- Update all imports referencing it

**Step 1: Rename the file or export**

Either rename the file to match the export, or rename the export to match the file. Since `editAppointment.tsx` already exists as the legacy full edit, rename `appointmentBox.tsx` to `appointmentCard.tsx` and update the default export name to `AppointmentCard`.

**Step 2: Update all imports**

Search for imports of the old name and update them.

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor(appointments): rename appointmentBox to appointmentCard for clarity"
```

---

## Phase 2: Metrics Audit & Fixes

### Task 2.1: Fix unused `paymentMethodFilter` not connected to data queries

**Severity:** CRITICAL (UI is broken - filter does nothing)

**Files:**
- Modify: `components/metrics/businessInsights.tsx:66,111,149-159,369-381`
- Modify: `server/actions/metrics.ts` (add `paymentMethod` parameter to relevant queries)

**Problem:** The payment method filter dropdown is rendered with state (`paymentMethodFilter`), but it's never passed to any server action call. The `fetchData` function doesn't include it as a parameter.

**Step 1: Add `paymentMethod` parameter to `getBusinessInsightsMetrics` and `getScopedFinancialMetrics`**

Modify both functions to accept an optional `paymentMethod` filter and apply it to the `general_ledger` queries via `eq(generalLedger.paymentMethod, paymentMethod)`.

**Step 2: Add `paymentMethod` parameter to `getLedgerSummary`**

Apply the same filter to the ledger summary queries.

**Step 3: Wire `paymentMethodFilter` state into `fetchData`**

In `businessInsights.tsx`, add `paymentMethodFilter` to the `fetchData` dependency array and pass it to each server action call.

**Step 4: Commit**

```bash
git add server/actions/metrics.ts components/metrics/businessInsights.tsx
git commit -m "fix(metrics): connect payment method filter to data queries"
```

---

### Task 2.2: Fix `getAppointmentReviews` missing auth check

**Severity:** CRITICAL (security)

**Files:**
- Modify: `server/actions/metrics.ts:816-891`

**Problem:** `getAppointmentReviews` has zero authentication. Any unauthenticated request could retrieve reviews.

**Step 1: Add `getCurrentUser()` and permission check**

Add `const user = await getCurrentUser()` at the top and check `canViewMetrics(user)` or `canAccessAccounting(user)`.

**Step 2: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): add auth check to getAppointmentReviews"
```

---

### Task 2.3: Fix P&L metrics with hardcoded zeros

**Severity:** HIGH (data accuracy)

**Files:**
- Modify: `server/actions/metrics.ts:1454-1465`

**Problem:** In `getExecutiveAccountingMetrics`, the aggregated P&L totals set `totalDebits: 0`, `totalCredits: 0`, `assetTotal: 0`, `liabilityTotal: 0`, `equityTotal: 0` as hardcoded zeros, even though data is available from the grouped query results.

**Step 1: Calculate actual totals from `plTotals`**

After the P&L data is fetched, compute totals from the grouped results:

```typescript
const totalDebits = plTotals
    .filter(t => t.entryType !== 'REVENUE')
    .reduce((sum, t) => sum + Number(t.totalDebit), 0)
const totalCredits = plTotals
    .filter(t => t.entryType !== 'EXPENSE')
    .reduce((sum, t) => sum + Number(t.totalCredit), 0)
const assetTotal = plTotals.find(t => t.entryType === 'ASSET')?.totalDebit || 0
const liabilityTotal = plTotals.find(t => t.entryType === 'LIABILITY')?.totalCredit || 0
const equityTotal = plTotals.find(t => t.entryType === 'EQUITY')?.totalCredit || 0
```

**Step 2: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): calculate actual P&L totals from ledger data instead of zeros"
```

---

### Task 2.4: Fix dashboard `fetchFinancialMetrics` not re-fetching on branch change

**Severity:** HIGH (data accuracy)

**Files:**
- Modify: `app/dashboardClient.tsx:511-516`
- Modify: `server/actions/metrics.ts`

**Problem:** `fetchFinancialMetrics` has an empty dependency array `[]`, never re-fetching when `currentBranch` changes.

**Step 1: Add `currentBranch` to the useEffect dependencies**

Change:
```typescript
useEffect(() => { fetchFinancialMetrics() }, [])
```
to:
```typescript
useEffect(() => { fetchFinancialMetrics(currentBranch?.id) }, [currentBranch?.id])
```

**Step 2: Make `getFinancialMetrics` accept an optional `branchId`**

Update `getFinancialMetrics` and `getScopedFinancialMetrics` to accept an optional `branchId` parameter and apply branch filtering.

**Step 3: Commit**

```bash
git add app/dashboardClient.tsx server/actions/metrics.ts
git commit -m "fix(metrics): re-fetch dashboard metrics when branch changes"
```

---

### Task 2.5: Fix `exportMetrics` not accepting `branchId` parameter

**Severity:** HIGH (data accuracy)

**Files:**
- Modify: `server/actions/metrics.ts:1829-1834`
- Modify: `components/metrics/businessInsights.tsx`

**Problem:** `exportMetrics` doesn't accept a `branchId` parameter, so exported data always includes all branches.

**Step 1: Add `branchId` parameter to `exportMetrics` and apply branch filter**

**Step 2: Pass `currentBranch?.id` from Business Insights export handler**

**Step 3: Commit**

```bash
git add server/actions/metrics.ts components/metrics/businessInsights.tsx
git commit -m "fix(metrics): support branch filtering in metrics export"
```

---

### Task 2.6: Fix `'all'` date preset silently returning null

**Severity:** MODERATE (UX bug)

**Files:**
- Modify: `utils/date-utils.ts:108-110`

**Step 1: Return a wide date range instead of null**

Change the `'all'` case from `return null` to `return { start: new Date('2000-01-01'), end: new Date() }`.

**Step 2: Commit**

```bash
git add utils/date-utils.ts
git commit -m "fix(metrics): return wide date range for 'all' preset instead of null"
```

---

### Task 2.7: Standardize error logging across metrics actions

**Severity:** MODERATE (code quality)

**Files:**
- Modify: `server/actions/metrics.ts` (multiple lines)

**Step 1:** Replace all `logError()` calls with `createLogs({ logs: [{ level: 'ERROR', message: ... }] })` per AGENTS.md convention.

**Step 2: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "refactor(metrics): standardize error logging to createLogs utility"
```

---

### Task 2.8: Fix `_loading` unused state in ExecutiveAccounting

**Severity:** LOW (code cleanup)

**Files:**
- Modify: `components/metrics/ExecutiveAccounting.tsx:67`

**Step 1:** Remove unused `_loading` state or rename to `loading` and wire it into fetch logic for proper loading UX.

**Step 2: Commit**

```bash
git add components/metrics/ExecutiveAccounting.tsx
git commit -m "fix(metrics): remove unused _loading state in ExecutiveAccounting"
```

---

### Task 2.9: Add caching to `getArtistLeaderboard` and `getStaffPerformance`

**Severity:** MODERATE (performance)

**Files:**
- Modify: `server/actions/metrics.ts:461-574` (getStaffPerformance)
- Modify: `server/actions/metrics.ts:726-797` (getArtistLeaderboard)

**Step 1: Add cache checks using the same pattern as other metrics functions**

```typescript
const cacheKey = `artist_leaderboard_${branchId}_${startDate}_${endDate}`
const cached = cache.get(cacheKey)
if (cached) return success(cached)
// ... compute ...
cache.set(cacheKey, result, 5 * 60 * 1000)
return success(result)
```

**Step 2: Ensure cache invalidation in mutating actions**

**Step 3: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "perf(metrics): add caching to getStaffPerformance and getArtistLeaderboard"
```

---

## Phase 3: Inventory Audit & Fixes

### Task 3.1: Add authentication to `checkLowStock()` and `notifyLowStock()`

**Severity:** CRITICAL (security)

**Files:**
- Modify: `server/actions/inventory.ts:1043-1065`

**Problem:** These functions have zero authentication. Any caller can access low stock data and trigger notifications.

**Step 1: Add `getCurrentUser()` and `canManageInventory()` checks**

```typescript
export async function checkLowStock() {
    const user = await getCurrentUser()
    if (!user) return failure('Unauthorized')
    if (!canManageInventory(user)) return failure('Forbidden')
    // ... existing logic ...
}

export async function notifyLowStock() {
    const user = await getCurrentUser()
    if (!user) return failure('Unauthorized')
    if (!canManageInventory(user)) return failure('Forbidden')
    // ... existing logic ...
}
```

**Step 2: Commit**

```bash
git add server/actions/inventory.ts
git commit -m "fix(inventory): add auth checks to checkLowStock and notifyLowStock"
```

---

### Task 3.2: Fix race condition in `restockInventoryItem()`

**Severity:** HIGH (data integrity)

**Files:**
- Modify: `server/actions/inventory.ts:383-457`
- Modify: `components/inventory/AdjustModal.tsx:119`

**Problem:** `restockInventoryItem()` reads current stock and updates without a transaction. Concurrent calls could result in lost updates.

**Step 1: Refactor `restockInventoryItem` to use `withTransaction()`**

Wrap the read-update operation in a transaction with row-level locking:

```typescript
export async function restockInventoryItem(payload: RestockPayload) {
    return withTransaction(async (tx) => {
        const [item] = await tx.select().from(inventory).where(eq(inventory.id, payload.item_id)).for('update')
        if (!item) return failure('Item not found')
        const newStock = (Number(item.currentStock) + Number(payload.quantity)).toString()
        await tx.update(inventory).set({ currentStock: newStock, lastRestocked: new Date() }).where(eq(inventory.id, payload.item_id))
        return success({ currentStock: newStock })
    })
}
```

**Step 2: Update `AdjustModal` to handle the new return type**

If the return type changes from `boolean` to `ActionResponse`, update the modal's success checking.

**Step 3: Commit**

```bash
git add server/actions/inventory.ts components/inventory/AdjustModal.tsx
git commit -m "fix(inventory): wrap restockInventoryItem in transaction to prevent race condition"
```

---

### Task 3.3: Fix duplicate item code check not scoped to active items

**Severity:** HIGH (functional bug)

**Files:**
- Modify: `server/actions/inventory.ts:324-339`

**Problem:** `createInventoryItem` checks for duplicate `item_code` without filtering by `isActive` or `branchId`. A soft-deleted item would block creating a new item with the same code.

**Step 1: Add `isActive` and `branchId` to the duplicate check**

```typescript
const existing = await db.query.inventory.findFirst({
    where: and(
        eq(inventory.itemCode, item.item_code),
        eq(inventory.isActive, true),
        item.branch_id ? eq(inventory.branchId, item.branch_id) : isNull(inventory.branchId)
    ),
})
```

**Step 2: Commit**

```bash
git add server/actions/inventory.ts
git commit -m "fix(inventory): scope duplicate item code check to active items in same branch"
```

---

### Task 3.4: Fix `duplicateInventoryItem()` not copying `branchId`

**Severity:** HIGH (data consistency)

**Files:**
- Modify: `server/actions/inventory.ts:649-698`

**Problem:** When duplicating, the new item doesn't inherit the original item's `branchId`, becoming null-branch/shared instead of staying in the same branch.

**Step 1: Add `branchId` to the duplicated item's values**

In the `duplicateInventoryItem` function, include `branchId: originalItem.branchId` in the insert values.

**Step 2: Commit**

```bash
git add server/actions/inventory.ts
git commit -m "fix(inventory): copy branchId when duplicating inventory items"
```

---

### Task 3.5: Fix `exportInventory()` filter chaining bug

**Severity:** HIGH (functional bug)

**Files:**
- Modify: `server/actions/inventory.ts:940-1041`

**Problem:** The query building pattern `query = query.where(...)` with type assertions (`as typeof query`) is incorrect with Drizzle ORM. Each `.where()` replaces the previous filter rather than combining them, meaning only the last filter works.

**Step 1: Replace the chained `.where()` pattern with a single `where` using `and()`**

```typescript
const conditions = [eq(inventory.isActive, isActive)]
if (options.category) conditions.push(eq(inventory.itemCategory, options.category))
if (options.type) conditions.push(eq(inventory.itemType, options.type))
if (options.branchId) conditions.push(or(eq(inventory.branchId, options.branchId), eq(inventory.isShared, true)))

const result = await db.query.inventory.findMany({
    where: and(...conditions),
    // ... 
})
```

**Step 2: Commit**

```bash
git add server/actions/inventory.ts
git commit -m "fix(inventory): use and() for combined filters instead of chained where()"
```

---

### Task 3.6: Fix missing APPAREL category in TransactionModal dropdown

**Severity:** MODERATE (UX bug)

**Files:**
- Modify: `components/inventory/TransactionModal.tsx:256`

**Problem:** The category dropdown includes TATTOO, PIERCING, EQUIPMENT, FOOD, OTHER but not APPAREL, even though the Zod schema and database support it.

**Step 1: Add APPAREL option to the category dropdown**

Add `<option value="APPAREL">Apparel</option>` to the category select in TransactionModal.

**Step 2: Commit**

```bash
git add components/inventory/TransactionModal.tsx
git commit -m "fix(inventory): add APPAREL category to item creation dropdown"
```

---

### Task 3.7: Fix inactive inventory branch filter inconsistency

**Severity:** MODERATE (data visibility)

**Files:**
- Modify: `server/actions/inventory.ts:139-205`

**Problem:** `getInactiveInventory()` doesn't include `isNull(inventory.branchId)` for global items, while `getInventory()` does. This means global inactive items that aren't explicitly shared are invisible when filtering by branch.

**Step 1: Add `isNull(inventory.branchId)` condition to `getInactiveInventory`**

Mirror the same `or()` conditions used in `getInventory()`:

```typescript
where: and(
    eq(inventory.isActive, false),
    options.branchId
        ? or(eq(inventory.branchId, options.branchId), eq(inventory.isShared, true), isNull(inventory.branchId))
        : undefined
)
```

**Step 2: Commit**

```bash
git add server/actions/inventory.ts
git commit -m "fix(inventory): include global inactive items in branch filter"
```

---

### Task 3.8: Fix `TransactionModal` missing branch selection

**Severity:** MODERATE (UX gap)

**Files:**
- Modify: `components/inventory/TransactionModal.tsx`

**Problem:** Creating an item doesn't allow selecting a branch. Items created have `branch_id: undefined` (null in DB), becoming global items regardless of context.

**Step 1: Add a branch selector to the TransactionModal form**

Add a `<select>` for branch that defaults to the current branch context (`currentBranch?.id`) but allows selecting other branches or "Global" (null).

**Step 2: Pass `branch_id` in the create payload**

Include `branch_id: selectedBranchId || undefined` in the `createInventoryItem` payload.

**Step 3: Commit**

```bash
git add components/inventory/TransactionModal.tsx
git commit -m "fix(inventory): add branch selector to item creation modal"
```

---

### Task 3.9: Refactor `RestockModal` to use `BaseModal` consistency

**Severity:** LOW (code quality)

**Files:**
- Modify: `components/inventory/RestockModal.tsx`
- Reference: `components/inventory/BaseModal.tsx`

**Problem:** RestockModal builds its own modal UI instead of using BaseModal like all other modals.

**Step 1: Refactor RestockModal to use BaseModal**

Replace the custom modal markup with `<BaseModal>` component usage, matching the pattern of other modals.

**Step 2: Commit**

```bash
git add components/inventory/RestockModal.tsx
git commit -m "refactor(inventory): use BaseModal in RestockModal for consistency"
```

---

### Task 3.10: Remove `_user_id` unused parameter from inventory actions

**Severity:** LOW (code cleanup)

**Files:**
- Modify: `server/actions/inventory.ts` (multiple functions)

**Problem:** The `_user_id` parameter is passed from the client but never used; `getCurrentUser()` is called server-side instead.

**Step 1: Remove `_user_id` parameter from all inventory action signatures**

Remove it from: `createInventoryItem`, `restockInventoryItem`, `updateInventoryItem`, `deleteInventoryItem`, `restoreInventoryItem`, `duplicateInventoryItem`, `requestInventoryRestock`.

**Step 2: Update all client callers to not pass `_user_id`**

**Step 3: Commit**

```bash
git add server/actions/inventory.ts components/inventory/
git commit -m "refactor(inventory): remove unused _user_id parameter from actions"
```

---

## Phase 4: Sales Audit & Fixes

### Task 4.1: Add permission/access check to Sales page

**Severity:** CRITICAL (security)

**Files:**
- Modify: `app/sales/page.tsx`

**Problem:** The route config requires `perms: "sales"` but the page component has no auth guard. Any authenticated user can access the Sales page.

**Step 1: Add server-side auth check in `page.tsx`**

Add `canAccessTransactions()` permission check and redirect unauthorized users:

```typescript
import { getCurrentUser } from '@/server/actions/auth'
import { canAccessTransactions } from '@/utils/auth/permissions'
import { redirect } from 'next/navigation'

export default async function SalesPage() {
    const user = await getCurrentUser()
    if (!user || !canAccessTransactions(user)) {
        redirect('/unauthorized')
    }
    // ... rest of page
}
```

**Step 2: Commit**

```bash
git add app/sales/page.tsx
git commit -m "fix(sales): add auth guard to sales page"
```

---

### Task 4.2: Fix free item pricing not propagated to backend

**Severity:** CRITICAL (pricing bug)

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:686-710, 854-862`

**Problem:** The frontend computes `grossTotal` with free-item deductions (items linked to services are considered free). However, the `CreateTransactionPayload.items` sent to the backend does not include free-quantity logic. Each inventory item in the cart is sent at `unit_price * quantity`, meaning the backend charges full price for items that should be free.

**Step 1: Add `free_quantity` field to transaction items in the checkout payload**

When building the `items` array for `createTransaction`, mark items that are linked to a service with `is_free: true` and `unit_price: 0`.

**Step 2: Update `createTransaction` server action to handle free items**

In the backend, respect the `is_free` flag and set `unit_price` to 0 for free items, skip inventory decrement for free items (they're included with the service).

**Step 3: Update the transaction item types**

Add `is_free?: boolean` to `TransactionItem` type.

**Step 4: Commit**

```bash
git add components/sales/context/SalesContext.tsx server/actions/transactions.ts utils/types/transactions.ts
git commit -m "fix(sales): propagate free-item pricing to backend on checkout"
```

---

### Task 4.3: Fix double fetch on mount in SalesContext

**Severity:** MODERATE (performance)

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:323-426`
- Modify: `components/sales/layout/RecentTransactions.tsx:57-59`

**Problem:** `fetchData` is called on mount, AND `refreshTransactions` is called via `useEffect` in `RecentTransactions.tsx`. This causes redundant initial fetches with different page sizes.

**Step 1: Remove the separate `refreshTransactions` call in `RecentTransactions.tsx` on mount**

Make `RecentTransactions` use the transactions already loaded by the parent `SalesContext` instead of re-fetching.

**Step 2: Commit**

```bash
git add components/sales/context/SalesContext.tsx components/sales/layout/RecentTransactions.tsx
git commit -m "fix(sales): eliminate double fetch on mount by using context data in RecentTransactions"
```

---

### Task 4.4: Memoize computed totals in SalesContext

**Severity:** MODERATE (performance)

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:676-744`

**Problem:** `grossTotal`, `taxAmount`, `netSubtotal`, `discountAmount`, `calculatedTotal`, and `total` are all calculated in the component body without `useMemo`. They recalculate on every re-render.

**Step 1: Wrap computed totals in `useMemo`**

```typescript
const grossTotal = useMemo(() => {
    return cart.reduce((sum, item) => { ... }, 0)
}, [cart])

const taxAmount = useMemo(() => { ... }, [grossTotal, taxSettings])
// ... etc
```

**Step 2: Commit**

```bash
git add components/sales/context/SalesContext.tsx
git commit -m "perf(sales): memoize computed totals in SalesContext"
```

---

### Task 4.5: Fix duplicate `SplitPayment` type definition

**Severity:** MODERATE (type safety)

**Files:**
- Modify: `components/sales/modals/CheckoutModal.tsx:12-17`
- Modify: `components/sales/context/SalesContext.tsx:44-49`

**Problem:** `SplitPayment` interface is defined identically in both files. Should be imported from one place.

**Step 1: Move `SplitPayment` type to `utils/types/transactions.ts`**

**Step 2: Update both files to import from `@/utils/types/transactions`**

**Step 3: Commit**

```bash
git add utils/types/transactions.ts components/sales/modals/CheckoutModal.tsx components/sales/context/SalesContext.tsx
git commit -m "refactor(sales): deduplicate SplitPayment type into transactions types"
```

---

### Task 4.6: Fix `userInfo` typed as `unknown` in SalesContext

**Severity:** MODERATE (type safety)

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:204, 220`

**Problem:** `userInfo` is typed as `unknown` in `SalesContextType` and `any` in `SalesProviderProps`, losing type safety.

**Step 1: Define a proper `SalesUserInfo` type**

```typescript
interface SalesUserInfo {
    id: string
    full_name: string
    role: string
    artist_level?: string
    branch_id?: string
}
```

**Step 2: Replace `unknown` and `any` with `SalesUserInfo`**

**Step 3: Commit**

```bash
git add components/sales/context/SalesContext.tsx
git commit -m "fix(sales): type userInfo properly instead of unknown/any"
```

---

### Task 4.7: Fix `ConfirmModal` closing before async operation completes

**Severity:** MODERATE (UX bug)

**Files:**
- Modify: `components/sales/modals/ConfirmModal.tsx:75-78`

**Problem:** The confirm button calls `onConfirm()` then `onClose()` synchronously. If `onConfirm` is async (like `executeVoid`), the modal closes before the operation completes.

**Step 1: Make `onConfirm` await-able**

```typescript
const handleConfirm = async () => {
    setIsLoading(true)
    await onConfirm()
    setIsLoading(false)
    onClose()
}
```

**Step 2: Add a loading state to disable the button during async operations**

**Step 3: Commit**

```bash
git add components/sales/modals/ConfirmModal.tsx
git commit -m "fix(sales): await async confirm action before closing modal"
```

---

### Task 4.8: Fix `createTransactionFromAppointment` random transaction number

**Severity:** MODERATE (data integrity)

**Files:**
- Modify: `server/actions/sales.ts:131`

**Problem:** Uses `Math.random().toString(36).substring(2, 5)` for the transaction number sequence instead of a proper sequential counter.

**Step 1: Use the existing `generateTransactionNumberWithTx` function**

Inside `createTransactionFromAppointment`, use `generateTransactionNumberWithTx(tx)` instead of random string generation.

**Step 2: Commit**

```bash
git add server/actions/sales.ts
git commit -m "fix(sales): use sequential transaction number for appointment sales"
```

---

### Task 4.9: Add receipt generation button to RecentTransactions

**Severity:** LOW (UX gap)

**Files:**
- Modify: `components/sales/layout/RecentTransactions.tsx`

**Problem:** The `generateReceipt` server action exists but there is no UI button to trigger it.

**Step 1: Add a "Receipt" button/option to each transaction row**

Add a download receipt action in the transaction row dropdown or as a separate button that calls `generateReceipt(transactionId)` and downloads the PDF.

**Step 2: Commit**

```bash
git add components/sales/layout/RecentTransactions.tsx
git commit -m "feat(sales): add receipt download button to RecentTransactions"
```

---

### Task 4.10: Fix `DiscountModal` allows invalid discount range

**Severity:** LOW (UX polish)

**Files:**
- Modify: `components/sales/modals/DiscountModal.tsx`

**Problem:** Allows applying percentage discount > 100%. The input has `max={100}` but it's not enforced in the button's `onClick`. The context catches this at checkout time, but no feedback is given.

**Step 1: Add validation feedback in the modal**

Disable the "Apply" button when percentage > 100 or when the value is invalid. Show an inline error message.

**Step 2: Commit**

```bash
git add components/sales/modals/DiscountModal.tsx
git commit -m "fix(sales): validate discount range in modal before apply"
```

---

## Phase 5: Accounting Integration Audit & Fixes

### Task 5.1: Fix `createAutoLedgerEntry` missing `categoryId` and not returning entry ID

**Severity:** CRITICAL (data integrity)

**Files:**
- Modify: `server/actions/accounting.ts:567-637`
- Modify: `server/actions/inventory.ts:897-915`

**Problem:** 
1. `createAutoLedgerEntry` only sets `category` (varchar) but not `categoryId` (FK), meaning auto-created entries have no proper foreign key reference to the category table.
2. The function returns `success(undefined)` instead of returning the created entry ID, forcing `inventory.ts` to re-query the DB to find the entry by `sourceId` (fragile, race condition risk).

**Step 1: Make `createAutoLedgerEntry` set `categoryId` alongside `category`**

After auto-creating or finding the category, set `categoryId` on the ledger entry:

```typescript
const existingCategory = await db.query.accountingCategory.findFirst(...)
// ...
categoryId: existingCategory?.id || newCategory?.id,
category: categoryName,
```

**Step 2: Make `createAutoLedgerEntry` return the created entry ID**

Change the return from `success(undefined)` to query the newly created entry and return its ID:

```typescript
const [entry] = await dbClient.insert(generalLedger).values({...}).returning({ id: generalLedger.id })
return success({ id: entry.id })
```

**Step 3: Update `inventory.ts` to use the returned ID instead of re-querying**

Replace the fragile re-query (lines 897-915) with using the returned ID from `createAutoLedgerEntry`.

**Step 4: Commit**

```bash
git add server/actions/accounting.ts server/actions/inventory.ts
git commit -m "fix(accounting): set categoryId and return entry ID from createAutoLedgerEntry"
```

---

### Task 5.2: Fix `sales.ts` not passing `source_id` to `createAutoLedgerEntry`

**Severity:** HIGH (data traceability)

**Files:**
- Modify: `server/actions/sales.ts:221-236`

**Problem:** The call to `createAutoLedgerEntry` in `createTransactionFromAppointment` omits `source_id`, so accounting entries from appointment sales have no link back to the source transaction.

**Step 1: Pass `source_id` to `createAutoLedgerEntry`**

```typescript
await createAutoLedgerEntry({
    sourceType: 'TRANSACTION',
    sourceId: newTransaction.id,  // Add this line
    // ... rest of params
})
```

**Step 2: Commit**

```bash
git add server/actions/sales.ts
git commit -m "fix(sales): pass source_id to createAutoLedgerEntry for traceability"
```

---

### Task 5.3: Add `revalidatePath` to `createAutoLedgerEntry` and `createJournalEntry`

**Severity:** HIGH (UX - stale data)

**Files:**
- Modify: `server/actions/accounting.ts:567-637` (createAutoLedgerEntry)
- Modify: `server/actions/accounting.ts:487-565` (createJournalEntry)

**Problem:** `createLedgerEntry` calls `revalidatePath('/accounting')` but `createAutoLedgerEntry` and `createJournalEntry` don't. Users viewing `/accounting` won't see auto-created entries until manual refresh.

**Step 1: Add `revalidatePath('/accounting')` to both functions**

After the insert, add:

```typescript
import { revalidatePath } from 'next/cache'
// ...
revalidatePath('/accounting')
revalidatePath('/metrics')
```

**Step 2: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): add revalidatePath to auto-ledger and journal entries"
```

---

### Task 5.4: Fix CSV import not checking accounting period lock

**Severity:** HIGH (data integrity)

**Files:**
- Modify: `server/actions/accounting-import.ts`

**Problem:** The import function validates entry types, amounts, dates, and categories, but doesn't check whether the entry date falls within a locked accounting period.

**Step 1: Import and call `getAccountingPeriodLock()` before inserting entries**

```typescript
import { getAccountingPeriodLock } from './accounting'

// Inside importAccountingEntries, before the batch insert:
for (const entry of validatedEntries) {
    const lockCheck = await getAccountingPeriodLock()
    if (lockCheck.success && lockCheck.data) {
        const lockedDate = new Date(lockCheck.data.locked_date)
        if (new Date(entry.entry_date) <= lockedDate) {
            errors.push({ row: entry.row, message: `Entry date ${entry.entry_date} is within a locked period` })
            continue
        }
    }
}
```

**Step 2: Commit**

```bash
git add server/actions/accounting-import.ts
git commit -m "fix(accounting): check period lock during CSV import"
```

---

### Task 5.5: Fix `EntryModal` dual category input confusion

**Severity:** MODERATE (UX)

**Files:**
- Modify: `components/accounting/EntryModal.tsx:299-328`

**Problem:** The modal has both a `<select>` dropdown and a `<input>` for custom category. If the user selects from the dropdown and then types in the input, the input overrides with no visual indication.

**Step 1: Improve the category input UX**

When the user selects from the dropdown, clear the custom input. When the user types in the custom input, set the dropdown to a "Custom" option. Add a visual indicator showing which source is active.

**Step 2: Commit**

```bash
git add components/accounting/EntryModal.tsx
git commit -m "fix(accounting): improve dual category input UX in EntryModal"
```

---

### Task 5.6: Fix `getAccountingCategories` returning empty array on auth failure

**Severity:** MODERATE (debugging/masked errors)

**Files:**
- Modify: `server/actions/accounting.ts:1376-1418`

**Problem:** Returns `[]` on auth failure instead of a failure response, masking permission issues.

**Step 1: Return a proper failure response on auth failure**

```typescript
export async function getAccountingCategories(options?: { includeInactive?: boolean }) {
    const user = await getCurrentUser()
    if (!user) return failure('Unauthorized')
    if (!canAccessAccounting(user)) return failure('Forbidden')
    // ... existing logic ...
}
```

**Step 2: Update client callers to handle failure response**

**Step 3: Commit**

```bash
git add server/actions/accounting.ts components/accounting/
git commit -m "fix(accounting): return proper failure response on auth failure for getAccountingCategories"
```

---

### Task 5.7: Fix payroll deduction accounting entry missing `branch_id`

**Severity:** MODERATE (data consistency)

**Files:**
- Modify: `server/actions/payroll.ts:1252-1268`

**Problem:** Uses `payrollEntryWithBranch?.branchId` which is optional and may not resolve correctly.

**Step 1: Add fallback for `branch_id`**

```typescript
branch_id: payrollEntryWithBranch?.branchId || transaction?.branchId || null,
```

**Step 2: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): add branch_id fallback for deduction accounting entries"
```

---

### Task 5.8: Replace `console.error` with `logError` in categoriesClient

**Severity:** LOW (code quality)

**Files:**
- Modify: `app/accounting/categories/categoriesClient.tsx:59`

**Step 1: Replace `console.error` with `createLogs`**

**Step 2: Commit**

```bash
git add app/accounting/categories/categoriesClient.tsx
git commit -m "fix(accounting): replace console.error with createLogs in categories"
```

---

### Task 5.9: Add unique constraint on `accounting_category.name`

**Severity:** LOW (data integrity)

**Files:**
- Modify: `server/db/schema/accounting.ts:16`

**Problem:** `accountingCategory.name` has no DB-level unique constraint, only app-level case-insensitive checks. Concurrent operations could create duplicates.

**Step 1: Add a unique index on `name`**

In the schema file, add:

```typescript
uniqueIndex('accounting_category_name_unique').on(sql`LOWER(${accountingCategory.name})`),
```

**Step 2: Generate and run the migration**

```bash
bun run drizzle-kit generate
bun run drizzle-kit migrate
```

**Step 3: Commit**

```bash
git add server/db/schema/accounting.ts drizzle/
git commit -m "fix(accounting): add unique constraint on category name"
```

---

## Phase 6: Cross-Feature Integration Fixes

### Task 6.1: Ensure Appointments → Sales handoff is complete and correct

**Severity:** HIGH (cross-feature flow)

**Files:**
- Modify: `server/actions/sales.ts`
- Modify: `app/appointments/appointmentDetailClient.tsx`

**Problem:** The appointment → sales conversion flow needs verification:
1. When an appointment is completed and user clicks "Open in Sales", the URL passes `?appointment=<id>`.
2. `createTransactionFromAppointment` in `sales.ts` uses `Math.random()` for transaction numbers (Task 4.8 fixes this).
3. The appointment status should only allow sales conversion for COMPLETED appointments.
4. The `source_id` is not passed to `createAutoLedgerEntry` (Task 5.2 fixes this).

**Step 1: Verify the URL handoff works end-to-end**

Test creating an appointment, completing it, and clicking "Open in Sales". Verify the appointment popover loads correctly.

**Step 2: Verify the appointment status check in `createTransactionFromAppointment`**

Ensure the function only creates transactions for COMPLETED appointments and returns a proper error for other statuses.

**Step 3: Commit any fixes**

```bash
git add server/actions/sales.ts app/appointments/appointmentDetailClient.tsx
git commit -m "fix(cross): verify and fix appointments-to-sales handoff flow"
```

---

### Task 6.2: Ensure Inventory → Accounting integration is transactional

**Severity:** HIGH (cross-feature integrity)

**Files:**
- Modify: `server/actions/inventory.ts:804-938`

**Problem:** When `restockInventoryItemWithAccounting` creates an accounting entry, if the accounting entry creation fails, the restock has already been committed. There's no rollback mechanism for the accounting entry if the restock fails after it.

**Step 1: Verify the transaction boundary in `restockInventoryItemWithAccounting`**

The function already uses `withTransaction()`. Verify that the accounting entry creation happens within the same transaction and that failures roll back properly.

**Step 2: If accounting entry is outside the transaction, move it inside**

**Step 3: Commit if changes are needed**

```bash
git add server/actions/inventory.ts
git commit -m "fix(cross): ensure inventory-accounting integration is transactional"
```

---

### Task 6.3: Verify Transactions → Accounting entries are properly linked

**Severity:** HIGH (cross-feature traceability)

**Files:**
- Modify: `server/actions/transactions.ts:220-243` (createTransaction)
- Modify: `server/actions/transactions.ts:510-535` (voidTransaction)
- Modify: `server/actions/transactions.ts:618-630` (refundTransaction)

**Problem:** All three transaction flows create accounting entries via `createAutoLedgerEntry`. After Task 5.1 (which makes `createAutoLedgerEntry` return the entry ID), verify that:
1. New sales create REVENUE entries with correct amounts and source links.
2. Voided sales create EXPENSE entries that reverse the original.
3. Refunded sales create EXPENSE entries with correct amounts.

**Step 1: Audit each transaction flow's accounting entry creation**

Check that `sourceId` is properly set to the transaction ID in all three flows.

**Step 2: Verify the payment method mapping**

Ensure `mapTransactionToAccountingPaymentMethod()` correctly maps all payment method types.

**Step 3: Commit if fixes are needed**

```bash
git add server/actions/transactions.ts
git commit -m "fix(cross): verify and fix transaction-accounting entry links"
```

---

### Task 6.4: Fix branch filtering consistency across all features

**Severity:** MODERATE (cross-feature consistency)

**Files:**
- Multiple files across features

**Problem:** Branch filtering is inconsistent:
- `getInventory()` includes `isNull(inventory.branchId)` for global items
- `getInactiveInventory()` does NOT include `isNull(inventory.branchId)` for global items (Task 3.7 fixes this)
- Dashboard `fetchFinancialMetrics` doesn't re-filter on branch change (Task 2.4 fixes this)
- Metrics export doesn't pass `branchId` (Task 2.5 fixes this)
- Sales doesn't have a proper branch selector on the page (Task 4.1 should add auth, and SalesContext uses branch from context)

**Step 1: After completing Tasks 2.4, 2.5, 3.7, verify all branch filtering is consistent**

The pattern should be: `or(eq(table.branchId, branchId), eq(table.isShared, true), isNull(table.branchId))` across all queries.

**Step 2: Audit all remaining server actions for consistent branch filtering**

Check: `getAllAppointments`, `getMonthlyAppointments`, `getUserAppointments`, `getTransactions`, `getLedgerEntries`, `getLedgerSummary`.

**Step 3: Commit any additional fixes**

```bash
git add server/actions/ multiple files
git commit -m "fix(cross): ensure consistent branch filtering across all features"
```

---

### Task 6.5: Verify payroll → accounting entry integration

**Severity:** MODERATE (cross-feature consistency)

**Files:**
- Modify: `server/actions/payroll.ts`
- Modify: `server/actions/payroll-disbursements.ts`

**Problem:** Payroll deduction and payment entries need verification for proper `branch_id`, `source_id`, and `category_id`. The disbursement flow uses a dynamic import for `createAutoLedgerEntry`.

**Step 1: Audit payroll accounting entry creation**

Check that:
- `branch_id` is always set (falling back to transaction branch if needed)
- `source_id` is set to the payroll entry ID
- `category_id` is set alongside `category` (after Task 5.1 fix)
- Payment method mapping is correct

**Step 2: Commit if fixes are needed**

```bash
git add server/actions/payroll.ts server/actions/payroll-disbursements.ts
git commit -m "fix(cross): verify and fix payroll-accounting entry integration"
```

---

### Task 6.6: Fix type assertion issues across features

**Severity:** LOW (type safety)

**Files:**
- Modify: `app/appointments/appointmentDetailClient.tsx:126-127`
- Modify: `components/sales/context/SalesContext.tsx:465-470, 929-934`

**Problem:** Various `as unknown as X` double assertions bypass type safety.

**Step 1: Replace double assertions with proper type guards or interfaces**

For `appointmentDetailClient.tsx`, properly type `appServices` and `appItems`:
```typescript
const appServices = (services as AppointmentService[] || [])
const appItems = (items as AppointmentItem[] || [])
```

For `SalesContext.tsx`, properly type the appointment access:
```typescript
(appointment as Appointment).actual_time_start
(appointment as Appointment).actual_time_end
```

**Step 2: Commit**

```bash
git add app/appointments/appointmentDetailClient.tsx components/sales/context/SalesContext.tsx
git commit -m "fix(cross): replace unsafe type assertions with proper types"
```

---

### Task 6.7: Remove dead code across features

**Severity:** LOW (code cleanup)

**Files:**
- Delete: `components/metrics/logsMetrics.tsx` (unused)
- Modify: `utils/types/general.ts:111-122` (remove `AppointmentRating`)
- Modify: `components/appointments/editAppointment.tsx:32` (remove unused `_edit` state)

**Step 1: Delete `logsMetrics.tsx`**

**Step 2: Remove `AppointmentRating` type definition**

**Step 3: Remove unused `_edit` state in `editAppointment.tsx`**

**Step 4: Search for other unused imports/types across all feature files**

Run `bun run lint` to identify unused variables.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dead code across features"
```

---

## Phase 7: Lint & Build Error Fixes

### Task 7.1: Run full lint and fix all warnings/errors

**Severity:** CRITICAL (code quality gate)

**Files:**
- All project files

**Step 1: Run `bun run lint` and capture all output**

```bash
bun run lint 2>&1 | tee /tmp/lint-output.txt
```

**Step 2: Fix each lint error/warning systematically**

Common fixes expected:
- Unused variables/imports
- Missing return types
- `any` type usage (replace with proper types)
- Missing dependencies in useEffect/useMemo/useCallback
- Console.log/console.error calls (replace with `createLogs`)

**Step 3: Run lint again to verify zero errors**

```bash
bun run lint
```

**Step 4: Commit**

```bash
git add -A
git commit -m "fix(lint): resolve all lint warnings and errors"
```

---

### Task 7.2: Run full build and fix all build errors/warnings

**Severity:** CRITICAL (deployment gate)

**Files:**
- All project files

**Step 1: Run `bun run build` and capture all output**

```bash
bun run build 2>&1 | tee /tmp/build-output.txt
```

**Step 2: Fix each build error/warning**

Common fixes expected:
- TypeScript strict mode violations
- Missing type annotations
- Unused module imports
- Module resolution issues from Phase 1-6 changes

**Step 3: Re-run build to verify zero errors**

```bash
bun run build
```

**Step 4: Commit**

```bash
git add -A
git commit -m "fix(build): resolve all build errors and warnings"
```

---

### Task 7.3: Final verification - lint and build both pass clean

**Step 1: Run lint**

```bash
bun run lint
```

Expected: Clean output, zero errors, zero warnings.

**Step 2: Run build**

```bash
bun run build
```

Expected: Successful build with zero TypeScript errors.

**Step 3: Final commit if any remaining issues found**

```bash
git add -A
git commit -m "chore: final cleanup for clean lint and build"
```

---

## Summary of All Issues by Priority

### Critical (7 issues)
1. **Appointments:** Type-specific detail edits not persisting (Task 1.1)
2. **Appointments:** `branch_name` not populated in list view (Task 1.2)
3. **Appointments:** Unvalidated `branch_id` in createAppointment (Task 1.3)
4. **Metrics:** Payment method filter not connected (Task 2.1)
5. **Metrics:** `getAppointmentReviews` missing auth (Task 2.2)
6. **Inventory:** No auth on `checkLowStock`/`notifyLowStock` (Task 3.1)
7. **Sales:** No auth guard on sales page (Task 4.1)

### High (10 issues)
8. **Appointments:** Walk-in race condition (Task 1.4)
9. **Metrics:** P&L totals hardcoded to zero (Task 2.3)
10. **Metrics:** Dashboard not re-fetching on branch change (Task 2.4)
11. **Metrics:** Export doesn't support branch filtering (Task 2.5)
12. **Inventory:** Race condition in restock (Task 3.2)
13. **Inventory:** Duplicate code check not scoped to active/branch (Task 3.3)
14. **Inventory:** `duplicateInventoryItem` doesn't copy `branchId` (Task 3.4)
15. **Inventory:** Export filter chaining bug (Task 3.5)
16. **Sales:** Free item pricing not propagated to backend (Task 4.2)
17. **Accounting:** `createAutoLedgerEntry` missing `categoryId` and not returning ID (Task 5.1)

### Moderate (15 issues)
18. **Appointments:** Simplified detail edits missing fields (Task 1.5)
19. **Appointments:** Inconsistent action return types (Task 1.6)
20. **Metrics:** `'all'` date preset returns null (Task 2.6)
21. **Metrics:** Inconsistent error logging (Task 2.7)
22. **Metrics:** No caching for leaderboard/staff performance (Task 2.9)
23. **Inventory:** Missing APPAREL category (Task 3.6)
24. **Inventory:** Inactive branch filter inconsistency (Task 3.7)
25. **Inventory:** Missing branch selection in create (Task 3.8)
26. **Sales:** Double fetch on mount (Task 4.3)
27. **Sales:** Computed totals not memoized (Task 4.4)
28. **Sales:** Duplicate `SplitPayment` type (Task 4.5)
29. **Sales:** `userInfo` typed as unknown (Task 4.6)
30. **Sales:** ConfirmModal closes before async completes (Task 4.7)
31. **Accounting:** Period lock not checked in import (Task 5.4)
32. **Accounting:** `getAccountingCategories` silently returns [] on auth failure (Task 5.6)

### Low (11 issues)
33. **Appointments:** `console.error` instead of `createLogs` (Task 1.7)
34. **Appointments:** Missing `client_email` in edit reset (Task 1.8)
35. **Appointments:** Dead code (logsMetrics, AppointmentRating) (Task 1.9)
36. **Appointments:** Naming inconsistency (Task 1.10)
37. **Metrics:** Unused `_loading` state (Task 2.8)
38. **Inventory:** RestockModal not using BaseModal (Task 3.9)
39. **Inventory:** Unused `_user_id` parameter (Task 3.10)
40. **Sales:** No receipt generation button (Task 4.9)
41. **Sales:** Discount range validation (Task 4.10)
42. **Accounting:** `console.error` in categories (Task 5.8)
43. **Accounting:** No unique constraint on category name (Task 5.9)

### Cross-Feature (7 areas)
44. Appointments → Sales handoff (Task 6.1)
45. Inventory → Accounting transactional integrity (Task 6.2)
46. Transactions → Accounting entry links (Task 6.3)
47. Branch filtering consistency (Task 6.4)
48. Payroll → Accounting integration (Task 6.5)
49. Type assertion issues (Task 6.6)
50. Dead code removal (Task 6.7)

### Lint & Build (3 tasks)
51. Lint fixes (Task 7.1)
52. Build fixes (Task 7.2)
53. Final verification (Task 7.3)

---

## Execution Order Recommendation

Execute in this order to minimize conflicts:
1. **Phase 1** (Appointments) - foundational, other features depend on appointments
2. **Phase 3** (Inventory) - inventory items are referenced by sales and accounting
3. **Phase 4** (Sales) - depends on appointments and inventory
4. **Phase 2** (Metrics) - reads from all other features
5. **Phase 5** (Accounting) - integration layer between features
6. **Phase 6** (Cross-feature) - ensures everything works together
7. **Phase 7** (Lint/Build) - final cleanup