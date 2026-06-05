# Sales Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix global inventory visibility in sales, simplify hourly service inputs to use total hours instead of start/end times, fix a controlled value console error, and allow manual override of the checkout total.

**Architecture:** Three targeted changes across the sales feature: (1) fix branch filtering in server and client to include unlinked inventory items, (2) replace start/end time inputs with a total hours numeric input in CartPanel and update the calculation model in SalesContext, (3) add a total override field in SalesContext and CartPanel.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Tailwind CSS 4, Drizzle ORM, Supabase

---

## File Structure

| File | Role | Change Type |
|------|------|-------------|
| `server/actions/inventory.ts:87-95` | Server-side inventory query branch filter | **Modify** - add `isNull` condition |
| `components/sales/context/SalesContext.tsx:51-64` | `CartItem` interface | **Modify** - replace `start_time`/`end_time` with `total_hours`, add `total_override` |
| `components/sales/context/SalesContext.tsx:354-358` | Client-side inventory branch filter | **Modify** - include `branch_id === null` |
| `components/sales/context/SalesContext.tsx:529-591` | `addToCart` function | **Modify** - set `total_hours` instead of start/end for hourly items |
| `components/sales/context/SalesContext.tsx:646-661` | `grossTotal` calculation | **Modify** - use `total_hours` instead of start/end parsing |
| `components/sales/context/SalesContext.tsx:713` | `total` calculation | **Modify** - support `total_override` |
| `components/sales/context/SalesContext.tsx:715-718` | `change` calculation | **Modify** - use effective total (override or calculated) |
| `components/sales/layout/CartPanel.tsx:110-238` | Hourly item cart display | **Modify** - replace time inputs with hours input |
| `components/sales/layout/CartPanel.tsx:288-294` | Total display in cart | **Modify** - make total editable |
| `components/sales/modals/CheckoutModal.tsx:263-268` | Total display in checkout | **Modify** - show override if set |
| `components/sales/context/SalesContext.tsx:892-935` | `loadAppointmentIntoCart` | **Modify** - infer hours from appointment times |

---

## Chunk 1: Global Inventory Items Bug Fix

### Task 1: Fix Server-Side Branch Filter for Global Items

**Files:**
- Modify: `server/actions/inventory.ts:87-95`

**Root Cause:** The `getInventory` server action filters items by `branchId === options.branchId OR isShared === true`. Items with `branchId === null` (global items not linked to any branch) are excluded because `null !== branchId`.

**Fix:** Add `isNull(inventory.branchId)` to the OR condition so global items are always returned regardless of the selected branch.

- [ ] **Step 1: Add `isNull` import and branch condition**

In `server/actions/inventory.ts`, at the top of the file, ensure `isNull` is imported from `drizzle-orm`:

```typescript
import { eq, and, or, isNull, desc, SQL } from 'drizzle-orm'
```

Then change the branch filtering logic at lines 87-95:

```typescript
if (options?.branchId) {
    // Filter by branch, shared items, OR global items (no branch assigned)
    const branchCondition = or(
        eq(inventory.branchId, options.branchId),
        eq(inventory.isShared, true),
        isNull(inventory.branchId),
    )
    if (branchCondition) {
        finalCondition = and(baseCondition, branchCondition) as SQL<unknown>
    }
}
```

- [ ] **Step 2: Verify the change compiles**

Run: `bun run build` or `npx tsc --noEmit`
Expected: No type errors

### Task 2: Fix Client-Side Branch Filter for Global Items

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:354-358`

**Root Cause:** The client-side filter in `SalesContext.fetchData()` also excludes global items because it checks `item.branch_id === currentBranch?.id || item.is_shared === true`, and `null !== currentBranch?.id`.

**Fix:** Add `item.branch_id === null` to the condition.

- [ ] **Step 1: Update the client-side inventory filter**

Change lines 354-358 in `SalesContext.tsx`:

```typescript
// Filter out non-sales items and by branch
const salesInv = (invData || []).filter(
    (item) => item.show_in_sales === true && (
        item.branch_id === currentBranch?.id ||
        item.is_shared === true ||
        item.branch_id === null
    ),
)
```

- [ ] **Step 2: Verify the change compiles**

Run: `bun run build` or `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Test global inventory visibility**

1. Create an inventory item with no branch assigned (`branch_id = null`) and `show_in_sales = true`
2. Navigate to the Sales page with any branch selected
3. Verify the global item appears in the product grid
4. Verify the item can be added to the cart and checked out

- [ ] **Step 4: Commit**

```bash
git add server/actions/inventory.ts components/sales/context/SalesContext.tsx
git commit -m "fix(sales): show global inventory items across all branches"
```

---

## Chunk 2: Dynamic Hourly Services Simplification

### Overview

Replace the start/end time picker UI with a single "Total Hours" numeric input. When an hourly service is linked from an appointment, automatically infer the duration from `actual_time_start` and `actual_time_end` (or `time_start`/`time_end` as fallback). Allow manual override of the calculated hours.

Additionally, fix the console error: `"You provided a value prop to a form field without an onChange handler"` caused by the line total `<input>` using `value={item.unit_price * item.quantity}` with only an `onBlur` handler (no `onChange`).

### Task 3: Update CartItem Interface

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:51-64`

Replace `start_time` and `end_time` fields with `total_hours`. Keep the existing fields for backward compatibility during transition, but mark them as optional/unused.

- [ ] **Step 1: Update the CartItem interface**

```typescript
export interface CartItem {
    id: string
    type: "INVENTORY" | "SERVICE"
    name: string
    unit_price: number
    original_price: number
    custom_price?: number
    quantity: number
    max_quantity?: number
    pricing_type?: "FIXED" | "HOURLY"
    hourly_rate?: number
    total_hours?: number  // Total hours for hourly services (replaces start_time/end_time)
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Errors in files that reference `start_time`/`end_time` on CartItem (will be fixed in subsequent steps)

### Task 4: Update addToCart for Hourly Items

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:529-591`

- [ ] **Step 1: Replace start_time/end_time with total_hours in addToCart**

Change the hourly service section in `addToCart` (lines 578-587):

```typescript
start_time:
    type === "SERVICE" &&
    (item as ServiceWithItems).pricing_type === "HOURLY"
        ? now.toTimeString().slice(0, 5)
        : undefined,
end_time:
    type === "SERVICE" &&
    (item as ServiceWithItems).pricing_type === "HOURLY"
        ? oneHourLater.toTimeString().slice(0, 5)
        : undefined,
```

Replace with:

```typescript
total_hours:
    type === "SERVICE" &&
    (item as ServiceWithItems).pricing_type === "HOURLY"
        ? 1
        : undefined,
```

Also remove the `now` and `oneHourLater` variables (lines 548-549) as they are no longer needed:

```typescript
// Remove these two lines:
// const now = new Date()
// const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`

### Task 5: Update grossTotal Calculation

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:646-661`

- [ ] **Step 1: Replace start/end parsing with total_hours**

Change the hourly calculation block (lines 649-661):

```typescript
if (
    item.type === "SERVICE" &&
    item.pricing_type === "HOURLY" &&
    item.start_time &&
    item.end_time &&
    item.hourly_rate
) {
    const start = new Date(`1970-01-01T${item.start_time}`)
    const end = new Date(`1970-01-01T${item.end_time}`)
    const durationHours =
        (end.getTime() - start.getTime()) / (1000 * 60 * 60)
    itemTotal = durationHours * item.hourly_rate * item.quantity
}
```

Replace with:

```typescript
if (
    item.type === "SERVICE" &&
    item.pricing_type === "HOURLY" &&
    item.hourly_rate &&
    item.total_hours
) {
    itemTotal = item.total_hours * item.hourly_rate * item.quantity
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`

### Task 6: Update CartPanel Hourly UI

**Files:**
- Modify: `components/sales/layout/CartPanel.tsx:110-238`

- [ ] **Step 1: Replace time calculation logic**

Change lines 111-122 from:

```typescript
const isHourly = item.pricing_type === "HOURLY"
const start = isHourly && item.start_time ? new Date(`1970-01-01T${item.start_time}`) : null
const end = isHourly && item.end_time ? new Date(`1970-01-01T${item.end_time}`) : null
const isMidnightCrossover = start && end && end < start
const durationHours = start && end 
  ? isMidnightCrossover 
    ? (end.getTime() - start.getTime() + 24 * 60 * 60 * 1000) / (1000 * 60 * 60)
    : end <= start 
      ? -1
      : (end.getTime() - start.getTime()) / (1000 * 60 * 60)
  : 0
const calculatedAmount = isHourly && item.hourly_rate ? durationHours * item.hourly_rate * item.quantity : 0
```

Replace with:

```typescript
const isHourly = item.pricing_type === "HOURLY"
const durationHours = isHourly ? (item.total_hours || 0) : 0
const calculatedAmount = isHourly && item.hourly_rate ? durationHours * item.hourly_rate * item.quantity : 0
```

- [ ] **Step 2: Replace start/end time inputs with total hours input**

Replace lines 194-238 (the hourly time inputs section) with:

```typescript
{isHourly && (
    <div className='flex flex-col gap-2 w-full'>
        <div className='flex-1'>
            <label className='block text-zinc-500 mb-1'>Total Hours</label>
            <input
                type='number'
                value={item.total_hours || ""}
                onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0
                    setCart((prev) =>
                        prev.map((i) =>
                            i.id === item.id
                                ? { ...i, total_hours: val }
                                : i,
                        ),
                    )
                }}
                className='w-full px-2 py-1 bg-white/10 border border-white/10 rounded text-sm'
                min='0'
                step='0.25'
                placeholder='0'
            />
        </div>
        <div className='flex justify-between items-center bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800'>
            <span className='text-blue-600 dark:text-blue-400 text-xs'>
                {durationHours > 0 ? `${durationHours.toFixed(2)} hrs` : 'No hours set'}
            </span>
            <span className='text-blue-600 dark:text-blue-400 font-medium text-sm'>
                = {taxSettings.currency_symbol}{calculatedAmount.toFixed(2)}
            </span>
        </div>
    </div>
)}
```

- [ ] **Step 3: Fix the controlled value console error on line total input**

The line total input at lines 158-165 uses `value={item.unit_price * item.quantity}` with only `onBlur` but no `onChange`. This causes React's controlled component warning. Fix by adding an `onChange` handler:

```typescript
<input
    type='number'
    value={item.unit_price * item.quantity}
    onChange={(e) => {
        // Allow typing by updating the displayed value
        // Actual update happens on blur via updateLineTotal
        const val = parseFloat(e.target.value) || 0
        if (val >= 0) {
            setCart((prev) =>
                prev.map((i) =>
                    i.id === item.id
                        ? { ...i, unit_price: item.quantity > 0 ? val / item.quantity : 0 }
                        : i,
                ),
            )
        }
    }}
    onBlur={(e) => updateLineTotal(item.id, parseFloat(e.target.value) || 0)}
    className='w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right'
    min='0'
    step='0.01'
/>
```

Alternatively (simpler approach), use `defaultValue` and keep `onBlur`:

```typescript
<input
    type='number'
    defaultValue={item.unit_price * item.quantity}
    onBlur={(e) => updateLineTotal(item.id, parseFloat(e.target.value) || 0)}
    key={`line-total-${item.id}-${item.quantity}`}
    className='w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right'
    min='0'
    step='0.01'
/>
```

**Recommendation:** Use the `defaultValue` approach with a `key` prop that includes quantity. This avoids double-firing updates on every keystroke and keeps the `onBlur` pattern. The `key` ensures the input resets when quantity changes (which changes the line total).

- [ ] **Step 4: Verify compilation and console is clean**

Run: `npx tsc --noEmit` and check browser console for errors

### Task 7: Update loadAppointmentIntoCart to Infer Hours

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:892-935`

When loading an appointment into the cart, if a service has `pricing_type === "HOURLY"`, calculate `total_hours` from the appointment's `actual_time_start`/`actual_time_end` (preferred) or `time_start`/`time_end` (fallback).

- [ ] **Step 1: Update loadAppointmentIntoCart**

Change lines 896-906 where services are pushed to the cart:

```typescript
unpaidApt.appointment_services?.forEach((as) => {
    if (as.service) {
        let totalHours: number | undefined

        // For hourly services, infer duration from appointment times
        if (as.service.pricing_type === "HOURLY") {
            const startTime = (appointment as any).actual_time_start || appointment.time_start
            const endTime = (appointment as any).actual_time_end || appointment.time_end

            if (startTime && endTime) {
                const start = new Date(startTime)
                const end = new Date(endTime)
                const diffMs = end.getTime() - start.getTime()
                totalHours = Math.max(0, diffMs / (1000 * 60 * 60))
            }
        }

        newCart.push({
            id: as.service.id,
            type: "SERVICE",
            name: as.service.title,
            unit_price: as.service.price,
            original_price: as.service.price,
            quantity: 1,
            pricing_type: as.service.pricing_type || "FIXED",
            hourly_rate: as.service.hourly_rate || undefined,
            total_hours: totalHours,
        })
    }
})
```

- [ ] **Step 2: Also update the walk-in appointment loader**

In the walk-in flow (lines 460-471), apply the same logic:

```typescript
appointment.appointment_services?.forEach((as) => {
    if (as.service) {
        let totalHours: number | undefined

        if (as.service.pricing_type === "HOURLY") {
            const startTime = (appointment as any).actual_time_start || appointment.time_start
            const endTime = (appointment as any).actual_time_end || appointment.time_end

            if (startTime && endTime) {
                const start = new Date(startTime)
                const end = new Date(endTime)
                const diffMs = end.getTime() - start.getTime()
                totalHours = Math.max(0, diffMs / (1000 * 60 * 60))
            }
        }

        newCart.push({
            id: as.service.id,
            type: "SERVICE",
            name: as.service.title,
            unit_price: as.service.price,
            original_price: as.service.price,
            quantity: 1,
            pricing_type: as.service.pricing_type || "FIXED",
            hourly_rate: as.service.hourly_rate || undefined,
            total_hours: totalHours,
        })
    }
})
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Test hourly services**

1. Add an hourly service to the cart from the Products tab
2. Verify it shows a "Total Hours" input defaulting to 1
3. Change the hours value and verify the calculated amount updates
4. Link an appointment with an hourly service and verify hours are auto-inferred
5. Verify no console errors appear

- [ ] **Step 5: Commit**

```bash
git add components/sales/context/SalesContext.tsx components/sales/layout/CartPanel.tsx
git commit -m "feat(sales): simplify hourly services to use total hours input"
```

---

## Chunk 3: Checkout Total Override

### Overview

Allow the user to manually override the calculated total. When a total override is set, display it instead of the calculated total in both the CartPanel and CheckoutModal. The override resets when the cart is cleared or a new calculation is made. The override is a simple number field — no complex tax recalculation needed (the override IS the final amount the customer pays).

### Task 8: Add Total Override State to SalesContext

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:86-157` (SalesContextType interface)
- Modify: `components/sales/context/SalesContext.tsx:225-304` (state declarations)
- Modify: `components/sales/context/SalesContext.tsx:713-718` (total/change calculations)

- [ ] **Step 1: Add totalOverride to SalesContextType interface**

In the `SalesContextType` interface (around line 86), add:

```typescript
totalOverride: number | null
setTotalOverride: (value: number | null) => void
```

- [ ] **Step 2: Add state declaration**

In the state declarations section (around line 241), add:

```typescript
const [totalOverride, setTotalOverride] = useState<number | null>(null)
```

- [ ] **Step 3: Compute effective total**

Change the `total` calculation at line 713 and `change` calculation at lines 715-718:

```typescript
const calculatedTotal = Math.max(0, subtotalBeforeDiscount - discountAmount)
const total = totalOverride !== null ? totalOverride : calculatedTotal

const change =
    paymentMethod === "CASH" && cashReceived
        ? Math.max(0, parseFloat(cashReceived) - total)
        : 0
```

- [ ] **Step 4: Reset override when cart is cleared**

In `clearCart` (line 641-644), add:

```typescript
const clearCart = () => {
    setCart([])
    setSelectedAppointmentId(null)
    setTotalOverride(null)
}
```

- [ ] **Step 5: Exclude totalOverride from grossTotal dependency**

Note: `totalOverride` should NOT affect `grossTotal`, `netSubtotal`, `taxAmount`, or `discountAmount`. It only overrides the final `total` for display and payment calculation. The original calculated values should still be shown as reference.

- [ ] **Step 6: Add to context provider value**

In the provider's `value` object (around the end of the component), add:

```typescript
totalOverride,
setTotalOverride,
```

- [ ] **Step 7: Verify compilation**

Run: `npx tsc --noEmit`

### Task 9: Add Editable Total to CartPanel

**Files:**
- Modify: `components/sales/layout/CartPanel.tsx:10-39` (props interface)
- Modify: `components/sales/layout/CartPanel.tsx:288-294` (total display)

- [ ] **Step 1: Add totalOverride props to CartPanelProps**

In the `CartPanelProps` interface, add:

```typescript
totalOverride: number | null
setTotalOverride: (value: number | null) => void
calculatedTotal: number  // The original calculated total before override
```

- [ ] **Step 2: Destructure new props**

In the CartPanel function signature, add the new props to destructuring.

- [ ] **Step 3: Make total display editable**

Replace lines 288-294 (the total display) with an editable total that shows both the calculated and override values:

```typescript
<div className='flex justify-between text-xl font-bold text-zinc-900 dark:text-white pt-2 border-t border-zinc-200 dark:border-zinc-700 items-center'>
    <span>Total</span>
    <div className='flex items-center gap-2'>
        <input
            type='number'
            value={totalOverride !== null ? totalOverride : calculatedTotal}
            onChange={(e) => {
                const val = parseFloat(e.target.value)
                if (!isNaN(val) && val >= 0) {
                    // Only set override if user changed from calculated
                    if (val !== calculatedTotal) {
                        setTotalOverride(val)
                    } else {
                        setTotalOverride(null)
                    }
                }
            }}
            className='w-28 bg-white/5 border border-white/10 rounded px-2 py-1 text-xl font-bold text-right'
            min='0'
            step='0.01'
        />
        {totalOverride !== null && (
            <button
                onClick={() => setTotalOverride(null)}
                className='text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors'
                title='Reset to calculated total'
            >
                Reset
            </button>
        )}
    </div>
</div>
```

- [ ] **Step 4: Update checkout button to show effective total**

The checkout button at line 329 already uses `total.toFixed(2)` which will now reflect the override. No change needed there.

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit`

### Task 10: Update CheckoutModal to Show Override

**Files:**
- Modify: `components/sales/modals/CheckoutModal.tsx:236-268` (totals section)

- [ ] **Step 1: Pass totalOverride and calculatedTotal to CheckoutModal**

Update the CheckoutModal props interface to include `totalOverride` and `calculatedTotal`. Check what props it already receives and add the new ones.

- [ ] **Step 2: Update the total display in CheckoutModal**

Replace lines 263-268 to show both the calculated total and the override (if set):

```typescript
<div className='border-t border-zinc-200 dark:border-zinc-700 pt-2 space-y-1'>
    {totalOverride !== null && (
        <div className='flex justify-between text-sm text-zinc-400'>
            <span>Calculated Total:</span>
            <span className='line-through'>
                {taxSettings.currency_symbol} {calculatedTotal.toFixed(2)}
            </span>
        </div>
    )}
    <div className='flex justify-between font-bold text-lg'>
        <span className='text-zinc-900 dark:text-zinc-100'>
            {totalOverride !== null ? 'Adjusted Total:' : 'Total:'}
        </span>
        <span className='text-blue-600 dark:text-blue-400'>
            {taxSettings.currency_symbol} {total.toFixed(2)}
        </span>
    </div>
</div>
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`

### Task 11: Wire Up Props Through SalesContent

**Files:**
- Modify: `app/sales/salesPage.tsx:20-116` (SalesContent component)

- [ ] **Step 1: Pass new props through to CartPanel and CheckoutModal**

In `SalesContent`, destructure `totalOverride`, `setTotalOverride`, and `calculatedTotal` from the sales context, and pass them to `CartPanel` and `CheckoutModal`.

Also compute `calculatedTotal` — this is the original total before override. Since `total` is now `totalOverride ?? calculatedTotal`, we need to expose the pre-override value. Add `calculatedTotal` to the `SalesContextType` interface and compute it in the context.

- [ ] **Step 2: Add calculatedTotal to SalesContextType**

In `SalesContextType` interface, add:

```typescript
calculatedTotal: number
```

And in the context computation, expose it:

```typescript
// In the context value object:
calculatedTotal: calculatedTotal,  // the total before any override
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`

### Task 12: Integration Testing

- [ ] **Step 1: Test total override flow**

1. Add items to cart and proceed to checkout
2. Verify the calculated total is correct
3. Click on the total input in CartPanel and change it to a different value
4. Verify the checkout button shows the new total
5. Open checkout modal and verify it shows the adjusted total with the original crossed out
6. Click "Reset" and verify total returns to calculated value
7. Clear cart and verify override is reset

- [ ] **Step 2: Test with discount and tax**

1. Add items, apply a discount, verify total is correct
2. Override the total
3. Verify override takes precedence over calculated total
4. Verify change calculation uses override total

- [ ] **Step 3: Commit**

```bash
git add components/sales/context/SalesContext.tsx components/sales/layout/CartPanel.tsx components/sales/modals/CheckoutModal.tsx app/sales/salesPage.tsx
git commit -m "feat(sales): allow manual override of checkout total"
```

---

## Summary & Additional Suggestions

### Changes Summary

| Task | Type | Files Modified |
|------|------|----------------|
| Task 1 | Bug Fix | `server/actions/inventory.ts` |
| Task 2 | Bug Fix | `components/sales/context/SalesContext.tsx` |
| Task 3-7 | Feature | `SalesContext.tsx`, `CartPanel.tsx` |
| Task 8-12 | Feature | `SalesContext.tsx`, `CartPanel.tsx`, `CheckoutModal.tsx`, `salesPage.tsx` |

### Additional Suggestions for Improvement

1. **Persist total override in transaction record**: When a total override is used, store the original calculated total alongside the final total in the transaction. This provides an audit trail showing when and how much a total was adjusted. Add an `original_total` column to the transactions table.

2. **Add reason/note field for total override**: Consider requiring a short note when a total is overridden (e.g., "loyalty discount", "price match"). This improves accountability and audit trails.

3. **Hourly service minimum hours validation**: Add a minimum of 0.25 hours (15 minutes) to prevent accidental zero-amount entries. Consider showing a warning when total_hours is 0.

4. **Hourly service step increment**: The `step='0.25'` on the hours input allows quarter-hour increments. Consider making this configurable or using 0.5 (half-hour) steps for simplicity.

5. **Remove redundant double-filtering**: The current code filters inventory both server-side (in `getInventory`) and client-side (in `SalesContext.fetchData`). After fixing the server-side filter, the client-side branch filter is redundant and could be removed to reduce complexity. The `show_in_sales` check should remain client-side.

6. **Service branch filtering consistency**: Services use the same `branch_id === currentBranch?.id || is_shared` pattern. Consider also including `branch_id === null` for services to match the inventory fix, if the same "global service" concept applies.

7. **Type safety for appointment time fields**: The `(appointment as any).actual_time_start` cast is needed because the `Appointment` interface has `actual_time_start` as optional. Consider adding proper typing to avoid the `as any` cast.

### Final Lint & Typecheck

After all tasks are complete, run:

```bash
bun run lint
bun run build
```

Fix any lint warnings or build errors before considering the work complete.
