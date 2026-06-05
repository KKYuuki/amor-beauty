# Sort by Date Added — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ability to sort the general ledger by date added (`created_at`) and display the "Date Added" column when this sort is active.

**Architecture:** Server action gains a `sortBy` option validated against an allowlist, which dynamically switches the `orderBy` clause. Client page adds a dropdown in the FilterBar and conditionally renders a "Date Added" column. Page resets to 1 on sort change.

**Tech Stack:** Next.js 15, React 19, Drizzle ORM, TypeScript, Tailwind CSS 4

---

## File Structure

| File | Responsibility | Change Type |
|------|---------------|-------------|
| `server/actions/accounting.ts` | Server action: add `sortBy` option to `GetLedgerEntriesOptions`, build dynamic `orderBy` | Modify |
| `app/accounting/accountingPage.tsx` | Client: add `sortBy` state, dropdown, conditional column, dynamic `colSpan` | Modify |

No new files are created. No migrations needed (`idx_gl_created_at` index already exists).

---

## Phase 1: Server-Side Sort Support

### Task 1: Add `sortBy` parameter to `getLedgerEntries`

**Files:**
- Modify: `server/actions/accounting.ts:113-120` (interface), `server/actions/accounting.ts:235` (orderBy)

- [ ] **Step 1: Add `sortBy` to `GetLedgerEntriesOptions` interface**

Add the `sortBy` field after `pageSize`:

```typescript
export interface GetLedgerEntriesOptions {
    filters?: LedgerFilters
    branchId?: string | null
    datePreset?: DateRangePreset
    startDate?: string
    endDate?: string
    page?: number
    pageSize?: number
    sortBy?: 'entry_date' | 'created_at'
}
```

- [ ] **Step 2: Destructure `sortBy` from options and build dynamic `orderBy`**

In the `getLedgerEntries` function body, destructure `sortBy` from the options object:

```typescript
const {
    filters,
    datePreset,
    startDate,
    endDate,
    page = 1,
    pageSize = 50,
    sortBy = 'entry_date',
} = options
```

Then, replace the hardcoded `.orderBy()` call at line ~235:

**Before:**
```typescript
.orderBy(desc(generalLedger.entryDate), desc(generalLedger.createdAt))
```

**After:**
```typescript
.orderBy(
    ...(sortBy === 'created_at'
        ? [desc(generalLedger.createdAt), desc(generalLedger.entryDate)]
        : [desc(generalLedger.entryDate), desc(generalLedger.createdAt)])
)
```

- [ ] **Step 3: Verify no type errors**

Run: `cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run build 2>&1 | head -40`

Expected: Build completes with no type errors related to the accounting module. The `sortBy` parameter is optional with a default, so all existing callers (trash tab, etc.) continue to work unchanged.

- [ ] **Step 4: Commit server-side changes**

```bash
git add server/actions/accounting.ts
git commit -m "feat(accounting): add sortBy option to getLedgerEntries server action"
```

---

## Phase 2: Client-Side Sort State & Request Integration

### Task 2: Add `sortBy` state and pass it through `fetchData`

**Files:**
- Modify: `app/accounting/accountingPage.tsx`

- [ ] **Step 1: Add `sortBy` state**

After the existing filter state declarations (around line ~170, after `const [paymentMethodFilter, ...]`), add:

```typescript
const [sortBy, setSortBy] = useState<'entry_date' | 'created_at'>('entry_date')
```

- [ ] **Step 2: Compute dynamic column count**

Replace the existing constant:

```typescript
const PAGE_COLUMNS = { base: 12, admin: 13 }
```

With a computed value based on `sortBy`:

```typescript
const BASE_COLUMNS = { base: 12, admin: 13 }
const extraCols = sortBy === 'created_at' ? 1 : 0
const PAGE_COLUMNS = {
    base: BASE_COLUMNS.base + extraCols,
    admin: BASE_COLUMNS.admin + extraCols,
}
```

Keep the `PAGE_SIZE` constant unchanged.

- [ ] **Step 3: Add `sortBy` to the `fetchData` callback**

In the `getLedgerEntries` call inside `fetchData` (around line 231), add the `sortBy` parameter:

```typescript
getLedgerEntries({
    filters: {
        entry_type: typeFilter || undefined,
        category: categoryFilter || undefined,
        search: searchQueryDebounced || undefined,
        payment_method: paymentMethodFilter || undefined,
    },
    branchId: currentBranch?.id,
    datePreset,
    startDate:
        datePreset === "custom"
            ? customStartDate
            : undefined,
    endDate:
        datePreset === "custom" ? customEndDate : undefined,
    page,
    pageSize: PAGE_SIZE,
    sortBy,
}),
```

- [ ] **Step 4: Add `sortBy` to the `fetchData` dependency array**

Add `sortBy` to the dependency array of `useCallback` for `fetchData` (around line ~330):

```typescript
}, [
    addNotification,
    typeFilter,
    categoryFilter,
    searchQueryDebounced,
    currentBranch?.id,
    datePreset,
    customStartDate,
    customEndDate,
    page,
    paymentMethodFilter,
    sortBy,
])
```

- [ ] **Step 5: Add `sortBy` to the page-reset effect**

Add `sortBy` to the dependency array of the `setPage(1)` effect (around line ~356):

```typescript
useEffect(() => {
    setPage(1)
}, [
    typeFilter,
    categoryFilter,
    searchQueryDebounced,
    paymentMethodFilter,
    datePreset,
    sortBy,
])
```

- [ ] **Step 6: Verify no type errors**

Run: `cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run build 2>&1 | head -40`

Expected: Build passes. The `getLedgerEntries` call now includes `sortBy` in its options.

- [ ] **Step 7: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "feat(accounting): add sortBy state and wire it to server action call"
```

---

## Phase 3: Sort Dropdown UI

### Task 3: Add sort dropdown to the FilterBar

**Files:**
- Modify: `app/accounting/accountingPage.tsx` (FilterBar section, around line ~510)

- [ ] **Step 1: Add the sort dropdown after the date filter**

After the date preset `</select>` and its custom date range block (but before the closing `</FilterBar>`), add a sort dropdown:

```tsx
<div className='flex items-center gap-2'>
    <ArrowUpDownIcon className='w-4 h-4 text-white/60' />
    <select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as 'entry_date' | 'created_at')}
        className='bg-white/10 hover:bg-white/20 transition-colors px-3 py-2 rounded-md text-sm cursor-pointer border-2 border-white/5'
    >
        <option value='entry_date'>Date (entry)</option>
        <option value='created_at'>Date Added</option>
    </select>
</div>
```

Also add `ArrowUpDownIcon` to the lucide-react import at the top of the file. Find the existing lucide import block (line ~5) and add `ArrowUpDownIcon` to the list:

```typescript
import {
    // ... existing icons ...
    ArrowUpDownIcon,
} from "lucide-react"
```

- [ ] **Step 2: Verify the dropdown renders**

Run: `cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run build 2>&1 | head -40`

Expected: Build passes with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "feat(accounting): add sort-by dropdown in FilterBar"
```

---

## Phase 4: Conditional "Date Added" Column

### Task 4: Add the "Date Added" column header and cells

**Files:**
- Modify: `app/accounting/accountingPage.tsx` (table header ~line 818, table body ~line 866)

- [ ] **Step 1: Add conditional `<th>` for "Date Added"**

After the existing "Date" `<th>` in the `<thead>`:

```tsx
<th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Date</th>
```

Insert the conditional column:

```tsx
{sortBy === 'created_at' && (
    <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Date Added</th>
)}
```

- [ ] **Step 2: Add conditional `<td>` for "Date Added" in each entry row**

After the existing "Date" `<td>` in the entry row:

```tsx
<td className='px-4 py-2 text-sm text-white/80'>
    {safeFormatDate(entry.entry_date)}
</td>
```

Insert the conditional cell:

```tsx
{sortBy === 'created_at' && (
    <td className='px-4 py-2 text-sm text-white/60'>
        {safeFormatDate(entry.created_at)}
    </td>
)}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run build 2>&1 | head -40`

Expected: Build passes. The "Date Added" column conditionally appears/disappears based on `sortBy`.

- [ ] **Step 4: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "feat(accounting): add conditional Date Added column in ledger table"
```

---

## Phase 5: Visual Polish & Validation

### Task 5: Verify dynamic `colSpan`, sort highlight, and end-to-end flow

**Files:**
- Modify: `app/accounting/accountingPage.tsx`

- [ ] **Step 1: Verify `colSpan` is dynamic**

The `PAGE_COLUMNS` constant was already made dynamic in Task 2 (Step 2). Confirm that `colSpan` usage in the loading and empty states already references `PAGE_COLUMNS`:

- Line ~843: `colSpan={isAdmin ? PAGE_COLUMNS.admin : PAGE_COLUMNS.base}` ✅ (now dynamic)
- Line ~855: `colSpan={isAdmin ? PAGE_COLUMNS.admin : PAGE_COLUMNS.base}` ✅ (now dynamic)

No additional changes needed — the dynamic `PAGE_COLUMNS` calculation handles it.

- [ ] **Step 2: Add visual indicator to active sort column header**

Update the "Date" header to show a subtle visual indicator when `sortBy === 'entry_date'`:

```tsx
<th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>
    Date{sortBy === 'entry_date' && ' ▼'}
</th>
```

And the "Date Added" header to show a similar indicator:

```tsx
{sortBy === 'created_at' && (
    <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>
        Date Added ▼
    </th>
)}
```

- [ ] **Step 3: Run the dev server and manually verify**

Run: `cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run dev`

Manual verification checklist:
1. Navigate to `/accounting`
2. Confirm ledger loads sorted by Date (entry) by default
3. Select "Date Added" from the sort dropdown → entries reorder by created_at DESC
4. Confirm "Date Added" column appears after the "Date" column
5. Confirm "Date Added ▼" is visible in the column header
6. Switch back to "Date (entry)" → entries reorder by entry_date DESC
7. Confirm "Date Added" column disappears
8. Go to page 2, change sort → confirm page resets to 1
9. Apply a filter (e.g., type = EXPENSE), then change sort → confirm filter persists
10. Check empty state colSpan is correct (no visual overflow)
11. Verify the trash tab is unaffected (no sort dropdown, no Date Added column)

- [ ] **Step 4: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "feat(accounting): add sort indicator to column headers"
```

---

## Task Summary

| Task | Phase | Description | Files |
|------|-------|-------------|-------|
| 1 | Server | Add `sortBy` to server action options + dynamic `orderBy` | `server/actions/accounting.ts` |
| 2 | Client State | Add `sortBy` state, dynamic `PAGE_COLUMNS`, wire to `fetchData` | `app/accounting/accountingPage.tsx` |
| 3 | Client UI | Add sort dropdown in FilterBar | `app/accounting/accountingPage.tsx` |
| 4 | Client UI | Add conditional "Date Added" column | `app/accounting/accountingPage.tsx` |
| 5 | Polish | Verify `colSpan`, add sort indicators, manual test | `app/accounting/accountingPage.tsx` |