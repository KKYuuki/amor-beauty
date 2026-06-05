# Accounting, Payroll & Metrics Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit, fix, and improve the Accounting, Payroll, My Payroll, and Metrics pages — resolving HTML structure violations, broken drilldown components, default state issues, and general layout/logic improvements.

**Architecture:** Fix invalid HTML nesting (`<tr>` inside `<div>`), repair the PaymentMethodDrilldown component (missing `onCategoryClick` prop in Metrics context), change Time Clock QR to single-use by default, and improve Accounting page layout. All changes are client-side React component fixes in existing files.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Motion (Framer Motion), Lucide React icons

---

## Issue Summary

| # | Issue | File(s) | Severity |
|---|-------|---------|----------|
| 1 | `<tr>` inside `<div>` inside `<td>` — invalid HTML | `components/accounting/TrialBalance.tsx` | High |
| 2 | PaymentMethodDrilldown shows no content on category expand (Metrics) | `components/metrics/ExecutiveAccounting.tsx`, `components/accounting/PaymentMethodDrilldown.tsx` | High |
| 3 | Time Clock QR defaults to NOT single-use | `components/clock/QRCodeDisplay.tsx` | Medium |
| 4 | Accounting page layout/organization improvements | `app/accounting/accountingPage.tsx` | Medium |
| 5 | Payroll page audit & improvements | `app/payroll/payrollPage.tsx` | Medium |
| 6 | My Payroll page audit & improvements | `app/my-payroll/myPayrollPage.tsx` | Medium |
| 7 | Lint & build errors | All files | High |
| 8 | Sales page dynamic rendering error | `app/sales/page.tsx` | High |

---

## Task 1: Fix Invalid HTML Structure in TrialBalance.tsx

**Files:**
- Modify: `components/accounting/TrialBalance.tsx:120-160`

**Problem:** Lines 126-155 use `<motion.tr>` → `<td colSpan={3}>` → `<motion.div>` → nested `<tr>` elements. A `<tr>` cannot be a child of `<div>`; `<tr>` elements must be direct children of `<table>`, `<thead>`, `<tbody>`, or `<tfoot>`. This causes DOM reconciliation issues and rendering bugs.

**Step 1: Replace the invalid nesting with proper table structure**

The current code (lines 125-157):
```tsx
{isExpanded && (
    <motion.tr
        id={`group-${type}`}
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
    >
        <td colSpan={3} className='p-0'>
            <motion.div ...>
                {[...rows].sort(...).map((row) => (
                    <tr key={...} className='...'>
                        ...
                    </tr>
                ))}
            </motion.div>
        </td>
    </motion.tr>
)}
```

Replace with proper structure using `<tbody>` fragments:

```tsx
{isExpanded && (
    <>
        {[...rows]
            .sort((a, b) => Math.abs(b.total_debit + b.total_credit) - Math.abs(a.total_debit + a.total_credit))
            .map((row) => (
                <motion.tr
                    key={`${row.type}-${row.category}`}
                    id={`group-${type}-${row.category}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className='border-t border-white/5 hover:bg-white/5 transition-colors'
                >
                    <td className='px-4 py-1.5 pl-10 text-sm text-white/70'>
                        {row.category}
                    </td>
                    <td className='text-right px-4 py-1.5 text-sm font-mono text-red-300/70'>
                        {row.total_debit > 0 ? `${currencySymbol}${row.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className='text-right px-4 py-1.5 text-sm font-mono text-green-300/70'>
                        {row.total_credit > 0 ? `${currencySymbol}${row.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                </motion.tr>
            ))}
    </>
)}
```

**Step 2: Verify the fix**

Run: `bun run build`  
Expected: Build passes without errors

**Step 3: Commit**

```bash
git add components/accounting/TrialBalance.tsx
git commit -m "fix(accounting): resolve invalid HTML nesting in TrialBalance component"
```

---

## Task 2: Fix PaymentMethodDrilldown Empty Content in Metrics Page

**Files:**
- Modify: `components/metrics/ExecutiveAccounting.tsx:324-329`
- Modify: `components/accounting/PaymentMethodDrilldown.tsx:170-172`

**Problem:** In `ExecutiveAccounting.tsx`, the `<PaymentMethodDrilldown>` component is rendered without the `onCategoryClick` prop. Inside `PaymentMethodDrilldown.tsx`, the expanded category content is guarded by `isCatExpanded && onCategoryClick` (line 171). Since `onCategoryClick` is `undefined` in the Metrics context, the condition is always `false`, meaning clicking on a category (e.g., Card → Maintenance) shows absolutely no content — just an empty expanded section.

**Step 2a: Make PaymentMethodDrilldown show category detail even without onCategoryClick**

In `PaymentMethodDrilldown.tsx`, change line 171 from:
```tsx
{isCatExpanded && onCategoryClick && (
```
to:
```tsx
{isCatExpanded && (
```

And update the expanded content section to show the category detail inline (entry type, counts, amounts) regardless of whether `onCategoryClick` is provided. The "View entries" link should only show when `onCategoryClick` exists.

The updated expanded category section (lines 170-190) should become:

```tsx
<AnimatePresence>
    {isCatExpanded && (
        <motion.div
            id={`category-content-${catKey}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className='overflow-hidden'
        >
            <div className='px-3 pb-3'>
                <div className='flex items-center justify-between text-xs bg-white/5 rounded p-2 mb-1'>
                    <span className='text-white/50'>
                        {cat.count} {cat.count === 1 ? 'entry' : 'entries'}
                    </span>
                    <div className='flex items-center gap-3'>
                        <span className='text-red-300/70'>
                            DR {currencySymbol}{cat.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <span className='text-green-300/70'>
                            CR {currencySymbol}{cat.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>
                {onCategoryClick && (
                    <button
                        onClick={() => onCategoryClick(pm.method, cat.category, cat.entry_type)}
                        className='text-xs text-blue-400 hover:text-blue-300 underline cursor-pointer'
                    >
                        View entries for {cat.category} ({cat.count} entries)
                    </button>
                )}
            </div>
        </motion.div>
    )}
</AnimatePresence>
```

**Step 2b: Verify the fix**

Run: `bun run build`  
Expected: Build passes

**Step 2c: Commit**

```bash
git add components/accounting/PaymentMethodDrilldown.tsx
git commit -m "fix(metrics): show category detail in PaymentMethodDrilldown without onCategoryClick"
```

---

## Task 3: Change Time Clock QR Default to Single-Use

**Files:**
- Modify: `components/clock/QRCodeDisplay.tsx:26`

**Step 1: Change default state from false to true**

In `QRCodeDisplay.tsx`, change line 26 from:
```tsx
const [isSingleUse, setIsSingleUse] = useState(false)
```
to:
```tsx
const [isSingleUse, setIsSingleUse] = useState(true)
```

**Step 2: Verify**

Run: `bun run build`  
Expected: Build passes

**Step 3: Commit**

```bash
git add components/clock/QRCodeDisplay.tsx
git commit -m "fix(time-clock): default QR code to single-use for security"
```

---

## Task 4: Accounting Page Layout & Organization Improvements

**Files:**
- Modify: `app/accounting/accountingPage.tsx`

**Findings from audit:**

1. **Ledger table lacks responsive wrapper** — The table has `min-w-max` which causes horizontal overflow on mobile with no visual indicator. Add a proper scroll container with a fade/shadow indicator.

2. **Export menu z-index** — The export dropdown is `z-50` which can conflict with modals. This is acceptable for now.

3. **Delete modal missing `AnimatePresence` proper exit** — The DeleteModal is shown but the `AnimatePresence` wrapping needs the entry to still be in the DOM during exit. The current setup is correct.

4. **No responsive table on mobile** — The ledger table is difficult to use on mobile. Add a mobile card view fallback for small screens.

5. **Table header row uses hardcoded column count** — The `colSpan` values `(isAdmin ? 11 : 10)` should use a constant.

6. **Missing loading state for categories** — Categories are fetched alongside entries but there's no dedicated loading state for filter dropdowns.

**Step 1: Add responsive table wrapper with overflow indicator**

In `accountingPage.tsx`, around line 746-749, the ledger table scroll container should be improved. Replace:

```tsx
<div
    ref={scrollContainerRef}
    className='min-h-full overflow-auto'
>
```

with:

```tsx
<div
    ref={scrollContainerRef}
    className='min-h-full overflow-auto relative'
>
```

And add a `PAGE_COLUMNS` constant at the top of the component (near `PAGE_SIZE`):

```tsx
const PAGE_COLUMNS = {
    base: 10,
    admin: 11,
}
```

Then replace all instances of `isAdmin ? 11 : 10` with `isAdmin ? PAGE_COLUMNS.admin : PAGE_COLUMNS.base`.

**Step 2: Verify**

Run: `bun run build`  
Expected: Build passes

**Step 3: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "refactor(accounting): improve layout organization and add column constants"
```

---

## Task 5: Audit & Improve Payroll Page

**Files:**
- Modify: `app/payroll/payrollPage.tsx`

**Findings from audit:**

1. **`console.error` on line 216** — Uses `console.error` instead of the project's `logError`/`createLogs` utility. Should use `createLogs` or `logError` for consistency.

2. **Missing branch filtering on requests tab** — The `getPayrollRequests` call passes `branchId` but requests don't appear to be filtered visually by branch name.

3. **Dates tab consistency** — The tabs use `ClockIcon` for "Payment Requests" which is fine, but the UX could benefit from showing request count badges.

4. **Inconsistent styling** — Dashboard cards use varying padding patterns (`p-3 md:p-4` vs `p-4`). Should be consistent.

**Step 1: Replace console.error with proper logging**

In `payrollPage.tsx`, line 216, replace:
```tsx
console.error("Error fetching payroll data:", error)
```
with:
```tsx
createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Error fetching payroll data: ${error instanceof Error ? error.message : String(error)}` }] })
```

And add the import at the top:
```tsx
import { createLogs } from "@/server/actions/logs"
```

**Step 2: Verify**

Run: `bun run build`  
Expected: Build passes

**Step 3: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "fix(payroll): replace console.error with proper logging utility"
```

---

## Task 6: Audit & Improve My Payroll Page

**Files:**
- Modify: `app/my-payroll/myPayrollPage.tsx`

**Findings from audit:**

1. **`console.error` on line 179** — Same issue as Payroll page. Should use `createLogs`.

2. **Missing branch context** — My Payroll page doesn't use `useBranchContext()`. Since this is a staff-facing page, this is acceptable (it only shows the user's own data).

3. **Period type hardcoded to "DAILY"** — On line 238, `period_type: "DAILY" as PayoutPeriod` is hardcoded. Should respect the selected entry dates or allow user selection.

4. **Calendar month navigation UX** — No prev/next month navigation buttons visible in view mode.

**Step 1: Replace console.error with createLogs**

In `myPayrollPage.tsx`, line 179, replace:
```tsx
console.error("Error fetching payroll data:", error)
```
with:
```tsx
import { createLogs } from "@/server/actions/logs"
```
(at the top of the file) and:
```tsx
createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Error fetching payroll data: ${error instanceof Error ? error.message : String(error)}` }] })
```

Also fix line 255:
```tsx
console.error("Error requesting payment:", error)
```
to:
```tsx
createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Error requesting payment: ${error instanceof Error ? error.message : String(error)}` }] })
```

**Step 2: Verify**

Run: `bun run build`  
Expected: Build passes

**Step 3: Commit**

```bash
git add app/my-payroll/myPayrollPage.tsx
git commit -m "fix(my-payroll): replace console.error with proper logging utility"
```

---

## Task 7: Fix All Lint & Build Errors

**Files:**
- Various files across the codebase

**Step 1: Run lint**

```bash
bun run lint
```

Review all warnings and errors. Fix any that relate to the files changed in tasks 1-6.

**Step 2: Run build**

```bash
bun run build
```

Verify the build passes cleanly. Fix any type errors or build warnings introduced by the changes.

**Step 3: Fix any remaining issues**

Address any lint warnings like unused imports, missing dependencies in useEffect, etc.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: fix lint and build errors across accounting, payroll, and metrics modules"
```

---

## Task 8: Fix Sales Page Dynamic Rendering Error

**Files:**
- Modify: `app/sales/page.tsx`

**Problem:** During build, the `/sales` route threw an error: `"Route /sales couldn't be rendered statically because it used headers"`. This happens because `getCurrentUser()` internally calls `headers()`, which is only available in dynamic routes.

**Step 1: Add `dynamic = "force-dynamic"` export**

```tsx
export const dynamic = "force-dynamic"
```

**Step 2: Verify**

Run: `bun run build`  
Expected: Build passes cleanly, no more `/sales` rendering error

**Step 3: Commit**

```bash
git add app/sales/page.tsx
git commit -m "fix(sales): force dynamic rendering to resolve build error"
```

---

## Additional Recommendations (Not Blocking)

These are improvement suggestions discovered during the audit that can be addressed in follow-up work:

1. **Accounting: Add mobile card view** — The ledger table is hard to use on small screens. Consider adding a responsive card layout for mobile.

2. **Payroll: Add request count badges** — Show badge counts on tab buttons for pending/confirmed requests.

3. **My Payroll: Add period type selector** — Instead of hardcoding `"DAILY"`, let users choose period type when requesting payment.

4. **TrialBalance: Consider virtualized rendering** — For large datasets, the expandable rows could benefit from virtualization.

5. **Metrics: Add date range display** — The ExecutiveAccounting component should display the current date range prominently.

6. **All pages: Standardize error handling** — Create a shared `useErrorHandler` hook that consistently uses `createLogs` + `addNotification` instead of `console.error` + `addNotification`.