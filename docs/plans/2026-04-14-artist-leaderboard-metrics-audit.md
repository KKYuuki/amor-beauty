# Artist Leaderboard & Metrics Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all logic bugs in the artist leaderboard, audit all metrics page statistics and branch filtering, resolve hardcoded currency issues, and clean up code quality violations across the metrics module.

**Architecture:** The metrics system spans `server/actions/metrics.ts` (1925 lines) for all server action logic, `components/metrics/` for UI components, and `components/branch-selector.tsx` + `components/branch-context.tsx` for branch filtering. The plan consolidates duplicate leaderboard queries, fixes misleading field names, makes hardcoded currencies dynamic, improves the leaderboard UI, fixes branch selector API mismatches, and cleans up console.* violations.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Drizzle ORM, Supabase PostgreSQL, Tailwind CSS 4, Recharts

---

## Phase 1: Artist Leaderboard Logic Fix

### Task 1: Consolidate duplicate leaderboard logic

**Problem:** `getArtistLeaderboard()` (standalone, line 727) and `fetchLeaderboardData()` (internal, line 1756) are nearly identical code paths. Changes to one must be manually mirrored to the other. Currently they could diverge and cause inconsistent behavior.

**Files:**
- Modify: `server/actions/metrics.ts:716-806` (type + standalone function)
- Modify: `server/actions/metrics.ts:1756-1805` (internal helper)

**Step 1: Refactor `fetchLeaderboardData` to call `getArtistLeaderboard` internally**

Replace the duplicate `fetchLeaderboardData` function body so it delegates to `getArtistLeaderboard`. Find the `fetchLeaderboardData` function (around line 1756):

```typescript
async function fetchLeaderboardData(
    start: Date,
    end: Date,
    branchId?: string
): Promise<ArtistLeaderboardEntry[]> {
    const conditions: SQL<unknown>[] = [
        gte(payrollEntry.serviceDate, start),
        lte(payrollEntry.serviceDate, end),
    ]
    // ... ~45 lines of duplicate query logic
}
```

Replace the entire function body with a call to the existing `getArtistLeaderboard`:

```typescript
async function fetchLeaderboardData(
    start: Date,
    end: Date,
    branchId?: string
): Promise<ArtistLeaderboardEntry[]> {
    const result = await getArtistLeaderboard(
        start.toISOString(),
        end.toISOString(),
        branchId
    )
    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch leaderboard data')
    }
    return result.data
}
```

**Step 2: Verify the build passes**

Run: `bun run build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "refactor: consolidate duplicate leaderboard query into getArtistLeaderboard"
```

---

### Task 2: Fix misleading `total_revenue` field name in ArtistLeaderboardEntry

**Problem:** In `ArtistLeaderboardEntry`, `total_revenue` is set to `totalArtistCut` (the artist's personal earnings). The UI correctly uses `total_artist_cut` for display, but `total_revenue` is confusing because it contains the same value as `total_artist_cut` and the name implies total revenue (which is actually `total_gross`).

**Files:**
- Modify: `server/actions/metrics.ts:716-725` (type definition)
- Modify: `server/actions/metrics.ts:780-789` (standalone function mapping)
- Modify: `server/actions/metrics.ts:1795-1804` (internal helper mapping — now removed, but verify)
- Modify: `utils/metrics-export-utils.ts` (if it references `total_revenue`)

**Step 1: Rename `total_revenue` to `total_artist_cut` in the type**

In `server/actions/metrics.ts`, update the `ArtistLeaderboardEntry` type:

```typescript
export type ArtistLeaderboardEntry = {
    staff_id: string
    full_name: string
    avatar_url?: string
    artist_level?: ArtistLevel
    total_gross: number
    total_artist_cut: number
    appointment_count: number
}
```

Note: `total_revenue` is removed since it was always identical to `total_artist_cut`. If `total_revenue` is needed separately (meaning actual total revenue attributed to the artist's transactions), that would require a separate query. But currently it's not useful since both fields held the same value.

**Step 2: Update the mapping in `getArtistLeaderboard`**

Remove `total_revenue` from the mapping (around line 785):

```typescript
const leaderboard: ArtistLeaderboardEntry[] = entries.slice(0, LEADERBOARD_LIMIT).map(entry => ({
    staff_id: entry.staffId,
    full_name: entry.staffFullName || 'Unknown',
    avatar_url: entry.staffAvatarUrl || undefined,
    artist_level: (entry.staffArtistLevel || undefined) as ArtistLevel | undefined,
    total_artist_cut: Number(entry.totalArtistCut) || 0,
    total_gross: Number(entry.totalGross) || 0,
    appointment_count: entry.appointmentCount || 0,
}))
```

**Step 3: Check and update `utils/metrics-export-utils.ts` for references to `total_revenue`**

Search for `total_revenue` in the export utilities and replace with `total_artist_cut` or `total_gross` as appropriate for the column context.

**Step 4: Verify build passes**

Run: `bun run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add server/actions/metrics.ts utils/metrics-export-utils.ts
git commit -m "fix: remove misleading total_revenue field from ArtistLeaderboardEntry"
```

---

### Task 3: Expand leaderboard UI to show all entries (top 10 + "Show More")

**Problem:** The server returns up to 10 artists (`LEADERBOARD_LIMIT = 10`) but the UI only shows 5 via `artistLeaderboard.slice(0, 5)`. No way to see remaining artists.

**Files:**
- Modify: `server/actions/metrics.ts:16` (increase limit)
- Modify: `components/metrics/businessInsights.tsx:108-110` (add state for expanded)
- Modify: `components/metrics/businessInsights.tsx:640-701` (leaderboard section)

**Step 1: Increase leaderboard limit to 20 in server action**

In `server/actions/metrics.ts`, change:

```typescript
const LEADERBOARD_LIMIT = 10
```

to:

```typescript
const LEADERBOARD_LIMIT = 20
```

**Step 2: Add expand/collapse state to BusinessInsights component**

Add a new state after the existing leaderboard state (around line 110):

```typescript
const [leaderboardExpanded, setLeaderboardExpanded] = useState(false)
```

**Step 3: Update the leaderboard section to show 5 by default, expandable to all**

Replace the leaderboard rendering section (around lines 651-700) with:

```tsx
{artistLeaderboard.length === 0 ? (
    <div className='bg-white/5 rounded-xl p-6 text-center text-white/40'>
        No artist data available for this period
    </div>
) : (
    <div className='space-y-2'>
        {(leaderboardExpanded ? artistLeaderboard : artistLeaderboard.slice(0, 5)).map((artist, index) => (
            <div
                key={artist.staff_id}
                className={`bg-white/5 hover:bg-white/10 rounded-lg p-3 sm:p-4 flex items-center justify-between gap-2 transition-colors ${
                    index === 0
                        ? "border border-yellow-500/30 bg-yellow-500/10"
                        : ""
                }`}
            >
                <div className='flex items-center gap-2 sm:gap-3 min-w-0'>
                    <span className={`shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold ${
                        index === 0 ? "bg-yellow-500 text-black" :
                        index === 1 ? "bg-gray-400 text-black" :
                        index === 2 ? "bg-orange-700 text-white" :
                        "bg-white/20 text-white"
                    }`}>
                        {index + 1}
                    </span>
                    <div className='shrink-0 w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-full flex items-center justify-center text-white font-bold overflow-hidden'>
                        {artist.avatar_url ? (
                            <NextImage
                                src={artist.avatar_url}
                                alt={artist.full_name}
                                width={40}
                                height={40}
                                className='w-full h-full object-cover'
                            />
                        ) : (
                            artist.full_name.charAt(0).toUpperCase()
                        )}
                    </div>
                    <div className='flex flex-col min-w-0'>
                        <span className='font-medium text-sm sm:text-base truncate'>{artist.full_name}</span>
                        <span className='text-xs text-white/40'>
                            {artist.appointment_count} appts
                        </span>
                    </div>
                </div>
                <div className='flex flex-col items-end shrink-0'>
                    <span className='text-sm sm:text-lg font-bold text-green-400'>
                        {currencySymbol}{artist.total_artist_cut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className='text-xs text-white/40 hidden sm:block'>
                        of {currencySymbol}{artist.total_gross.toLocaleString(undefined, { minimumFractionDigits: 2 })} total
                    </span>
                </div>
            </div>
        ))}
        {artistLeaderboard.length > 5 && (
            <button
                onClick={() => setLeaderboardExpanded(!leaderboardExpanded)}
                className='w-full py-2 text-sm text-white/40 hover:text-white/60 transition-colors cursor-pointer'
            >
                {leaderboardExpanded ? 'Show Less' : `Show ${artistLeaderboard.length - 5} More`}
            </button>
        )}
    </div>
)}
```

**Step 4: Verify build passes**

Run: `bun run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add server/actions/metrics.ts components/metrics/businessInsights.tsx
git commit -m "feat: expand leaderboard to show top 20 artists with show more toggle"
```

---

## Phase 2: Branch Integration & Filtering Fixes

### Task 4: Fix BranchSelectorInline API mismatch in metricsPage.tsx

**Problem:** `BranchSelectorInline` has `onChange: (value: string | null, isShared: boolean) => void` but `metricsPage.tsx` calls it as `onChange={(branchId) => {...}}`, silently discarding the `isShared` parameter. This means when "Shared (All Branches)" is selected, the parent correctly receives `null` (which maps to "all branches"), but the `isShared` context is lost.

**Files:**
- Modify: `app/metrics/metricsPage.tsx:58-69` (branch selector usage)

**Step 1: Update the onChange handler to receive both parameters**

In `app/metrics/metricsPage.tsx`, update the `BranchSelectorInline` usage:

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
/>
```

This is a minor fix — the underscore prefix indicates `isShared` is intentionally unused for now. The behavior is already correct (null = all branches), but this makes the API usage explicit.

**Step 2: Verify build passes**

Run: `bun run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add app/metrics/metricsPage.tsx
git commit -m "fix: acknowledge isShared param from BranchSelectorInline onChange"
```

---

### Task 5: Verify and document branch filtering consistency across all metrics queries

**Problem:** The leaderboard uses `EXISTS (SELECT 1 FROM transactions...)` for branch filtering (since `payroll_entry` has no `branchId` column), while other metrics functions use `or(eq(table.branchId, branchId!), isNull(table.branchId))`. This is actually **correct** because `payroll_entry` needs to join through `transactions` to find the branch, but this distinction should be documented for clarity.

**Files:**
- Modify: `server/actions/metrics.ts` (add comments)

**Step 1: Add clarifying comments above the leaderboard branch filtering**

In `server/actions/metrics.ts`, add a comment above the `getArtistLeaderboard` function (around line 750):

```typescript
// Note: payroll_entry does not have a branchId column, so branch filtering
// must go through the related transaction (via transactionId foreign key).
// This uses an EXISTS subquery on transactions rather than a direct column check.
if (branchId) {
    conditions.push(
        sql`EXISTS (SELECT 1 FROM ${transactions} WHERE ${transactions.id} = ${payrollEntry.transactionId} AND (${transactions.branchId} = ${branchId} OR ${transactions.branchId} IS NULL))`
    )
}
```

**Step 2: Add similar comment above `fetchLeaderboardData` (now just the delegation function)**

No changes needed since `fetchLeaderboardData` now delegates to `getArtistLeaderboard`.

**Step 3: Verify build passes**

Run: `bun run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "docs: add comments explaining payroll branch filtering approach"
```

---

## Phase 3: Metrics Page Stats & Logic Fixes

### Task 6: Fix hardcoded ₱ currency symbol in chart Y-axis formatters

**Problem:** Lines 459 and 470 in `businessInsights.tsx` hardcode `₱` in the LineChart and chart tooltip formatters, while the rest of the component correctly uses the dynamic `currencySymbol` prop. This means if the currency is changed in settings, these charts still show `₱`.

**Files:**
- Modify: `components/metrics/businessInsights.tsx:458-460` (LineChart YAxis)
- Modify: `components/metrics/businessInsights.tsx:469-471` (LineChart Tooltip)

**Step 1: Fix the LineChart YAxis tickFormatter**

Find around line 459:

```tsx
tickFormatter={(value: number) =>
    `₱${value}`
}
```

Replace with:

```tsx
tickFormatter={(value: number) =>
    `${currencySymbol}${value}`
}
```

**Step 2: Fix the LineChart Tooltip formatter**

Find around line 470:

```tsx
formatter={(value: number) => [
    `₱${value.toLocaleString()}`,
    "Revenue",
]}
```

Replace with:

```tsx
formatter={(value: number) => [
    `${currencySymbol}${value.toLocaleString()}`,
    "Revenue",
]}
```

**Step 3: Verify build passes**

Run: `bun run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add components/metrics/businessInsights.tsx
git commit -m "fix: replace hardcoded peso symbol with dynamic currencySymbol in charts"
```

---

### Task 7: Fix hardcoded PHP currency locale in inventory section

**Problem:** Line 1065-1067 in `businessInsights.tsx` uses `Intl.NumberFormat("en-PH", { currency: "PHP" })` instead of the dynamic `currencySymbol` prop, which breaks when the currency symbol is changed in settings.

**Files:**
- Modify: `components/metrics/businessInsights.tsx:1064-1069` (inventory top selling)

**Step 1: Replace the hardcoded Intl.NumberFormat with dynamic currencySymbol**

Find around line 1064-1069:

```tsx
<span className='font-bold text-green-400'>
    {new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
    }).format(item.revenue)}
</span>
```

Replace with:

```tsx
<span className='font-bold text-green-400'>
    {currencySymbol}{item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
</span>
```

**Step 2: Verify build passes**

Run: `bun run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add components/metrics/businessInsights.tsx
git commit -m "fix: replace hardcoded PHP locale with dynamic currencySymbol in inventory"
```

---

### Task 8: Remove unused `staffPerf` state and fetch call

**Problem:** In `businessInsights.tsx`, line 81 declares `[, setStaffPerf] = useState<StaffPerformanceMetric[]>([])` — the read value is intentionally discarded (underscore prefix omitted), and `getStaffPerformance(branchId)` is called on line 202 with its result stored but never used. This is dead code that wastes a network request on every data fetch.

**Files:**
- Modify: `components/metrics/businessInsights.tsx:81` (unused state)
- Modify: `components/metrics/businessInsights.tsx:9` (unused import)
- Modify: `components/metrics/businessInsights.tsx:202-205` (unused fetch call)

**Step 1: Remove unused `staffPerf` state and its type import**

Remove line 81:

```typescript
const [, setStaffPerf] = useState<StaffPerformanceMetric[]>([])
```

Remove `StaffPerformanceMetric` from the import on line 9 (now line 8):

```typescript
// Remove StaffPerformanceMetric from the import:
import {
    getBusinessInsightsMetrics,
    exportMetrics,
    type BusinessInsightsMetrics,
} from "@/server/actions/metrics"
```

Wait — `getStaffPerformance` is still imported but used on line 202. We should remove both the import and the call.

**Step 2: Remove `getStaffPerformance` import and call**

Remove `getStaffPerformance` from the import (line 6):

```typescript
import {
    getBusinessInsightsMetrics,
    exportMetrics,
    type BusinessInsightsMetrics,
} from "@/server/actions/metrics"
```

Remove the call on lines 202-205:

```typescript
const perfResult = await getStaffPerformance(branchId)
if (perfResult.success) {
    setStaffPerf(perfResult.data)
}
```

**Step 3: Verify build passes**

Run: `bun run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add components/metrics/businessInsights.tsx
git commit -m "refactor: remove unused staffPerf state and getStaffPerformance call"
```

---

### Task 9: Audit and fix ExecutiveAccounting branch filtering passthrough

**Problem:** Verify that `ExecutiveAccounting` component properly passes `branchId` to all its data-fetching calls. Already confirmed it does on lines 118-124, but we should verify the `getLedgerDetailBreakdown` call.

**Files:**
- Modify: `components/metrics/ExecutiveAccounting.tsx` (if needed)
- Verify: `server/actions/accounting.ts` (getLedgerDetailBreakdown branch filtering)

**Step 1: Audit the ExecutiveAccounting component's data fetching**

Read the `fetchData` callback in `ExecutiveAccounting.tsx` (lines 85-153). Verify all server action calls receive the `branchId` prop:

- `getExecutiveAccountingMetrics(startDate, endDate, branchId)` — line 118 ✓
- `getLedgerDetailBreakdown(timeframe, startDate, endDate, branchId)` — line 119-124 ✓

Both already receive `branchId`. No changes needed for ExecutiveAccounting.

**Step 2: Check that `getLedgerDetailBreakdown` uses branchId correctly**

Search the accounting server action to verify it filters by `branchId` if provided. If it doesn't, that's a bug.

**Step 3: Commit only if changes are made; otherwise skip**

No commit needed if no changes.

---

### Task 10: Audit all metrics server actions for consistent branch filtering

**Problem:** Need to verify that ALL metrics server actions correctly implement branch filtering using the same pattern: `or(eq(table.branchId, branchId!), isNull(table.branchId))` for tables that have a `branchId` column, and appropriate subqueries for tables that don't.

**Files:**
- Verify: `server/actions/metrics.ts` (all functions with branchId param)

**Step 1: Audit each metrics function's branch filtering**

Functions to audit (already verified in exploration):

| Function | Branch Column | Pattern | Status |
|---|---|---|---|
| `getScopedFinancialMetrics` | `generalLedger.branchId` | `or(eq(..., branchId!), isNull(...))` | ✅ Correct |
| `getRevenueTrend` | `generalLedger.branchId` | `or(eq(..., branchId!), isNull(...))` | ✅ Correct |
| `getOperationalMetrics` | `appointments.branchId` | `or(eq(..., branchId!), isNull(...))` | ✅ Correct |
| `getInventoryMetrics` | `inventory.branchId` (via branchCondition) | Same pattern | ✅ Correct |
| `getRatingMetrics` | `appointments.branchId` (via join) | Same pattern | ✅ Correct |
| `getStaffPerformance` | `appointments.branchId` | Same pattern | ✅ Correct |
| `getNetIncomeMetrics` | `generalLedger.branchId` | Same pattern | ✅ Correct |
| `getClientTypeMetrics` | `appointments.branchId` (via join) | Same pattern | ✅ Correct |
| `getArtistLeaderboard` | `payrollEntry`→`transactions.branchId` | EXISTS subquery | ✅ Correct (no branchId on payrollEntry) |
| `getPLMetrics` | `generalLedger.branchId` | Same pattern | ✅ Correct |
| `getExpenseBreakdown` | `generalLedger.branchId` | Same pattern | ✅ Correct |
| `getRevenueBreakdown` | `generalLedger.branchId` | Same pattern | ✅ Correct |
| `getRevenueExpenseTrend` | `generalLedger.branchId` | Same pattern | ✅ Correct |

All branch filters are consistent and correct. No changes needed.

**Step 2: No commit needed**

---

## Phase 4: Code Quality & Lint/Build Fixes

### Task 11: Replace `console.error`/`console.warn` calls with `createLogs` or remove

**Problem:** The project's AGENTS.md specifies using `createLogs()` instead of `console.log/warn/error` for production code, but many files use `console.error`. This clutters the console and doesn't follow project conventions.

**Files:**
- Each file listed in the grep results for `console.error`/`console.warn`

**Step 1: Audit and categorize console.error usage**

There are ~38 `console.error` calls across the codebase. Many are in client components where `createLogs` (a server action) can't be directly called. For client components, these should either:
- Be removed if they're just for debugging
- Be replaced with `addNotification(..., "ERROR")` if user-facing feedback is needed
- Be wrapped in a try/catch that calls `createLogs` via server action if logging is important

For this task, focus ONLY on server-side and metrics-related files:

1. `app/api/branches/route.ts:22` — Server-side API route. Replace `console.error` with `createLogs`.
2. `utils/branch.ts:9` — Server utility. Replace `console.warn` with `createLogs`.
3. `components/BranchSelector.tsx:40` — Client component. Keep as-is (can't use server action directly in client error handler), but consider converting to silent fail or notification.
4. `components/metrics/businessInsights.tsx:275` — Already using `createLogs`. Good.

For the server-side files:

**In `app/api/branches/route.ts`:** Replace:
```typescript
console.error("Failed to fetch branches:", error)
```
with:
```typescript
import { createLogs } from "@/server/actions/logs"
// ...
createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Failed to fetch branches: ${error instanceof Error ? error.message : String(error)}` }] })
```

**In `utils/branch.ts`:** Replace:
```typescript
console.warn('IT_ADMIN_EMAILS environment variable not set')
```
with:
```typescript
import { createLogs } from "@/server/actions/logs"
// ...
createLogs({ logs: [{ level: 'WARNING', type: 'SYSTEM', message: 'IT_ADMIN_EMAILS environment variable not set' }] })
```

**Step 2: Verify build passes**

Run: `bun run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add app/api/branches/route.ts utils/branch.ts
git commit -m "fix: replace console.error/warn with createLogs in server code"
```

---

### Task 12: Remove misleading `₱` hardcoded fallback in currency references

**Problem:** Both `businessInsights.tsx` and `ExecutiveAccounting.tsx` have `const currencySymbol = propCurrencySymbol ?? "₱"` as a hardcoded fallback. While the parent `metricsPage.tsx` fetches the currency from settings and passes it, the hardcoded fallback means that if the settings fetch fails, the component silently falls back to PHP peso. A more neutral approach would be to use an empty string or a generic currency indicator.

**Files:**
- Modify: `components/metrics/businessInsights.tsx:112`
- Modify: `components/metrics/ExecutiveAccounting.tsx:73`

**Step 1: Change the fallback in BusinessInsights**

Find line 112:
```typescript
const currencySymbol = propCurrencySymbol ?? "₱"
```

Replace with:
```typescript
const currencySymbol = propCurrencySymbol ?? ""
```

**Step 2: Change the fallback in ExecutiveAccounting**

Find line 73:
```typescript
const currencySymbol = propCurrencySymbol ?? "₱"
```

Replace with:
```typescript
const currencySymbol = propCurrencySymbol ?? ""
```

**Step 3: Verify build passes**

Run: `bun run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add components/metrics/businessInsights.tsx components/metrics/ExecutiveAccounting.tsx
git commit -m "fix: remove hardcoded peso fallback from currency symbol"
```

---

### Task 13: Run full lint and build verification

**Problem:** After all changes, ensure no regressions were introduced.

**Step 1: Run lint check**

Run: `bun run lint`
Expected: No errors or warnings.

**Step 2: Run build check**

Run: `bun run build`
Expected: Build succeeds, all pages compile.

**Step 3: If any errors, fix them and commit**

Fix any lint warnings or build errors found. Commit fixes.

---

## Summary of All Issues Addressed

| # | Issue | Phase | Task | Severity |
|---|-------|-------|------|----------|
| 1 | Duplicate leaderboard query logic | 1 | 1 | Medium |
| 2 | Misleading `total_revenue` field name | 1 | 2 | Low |
| 3 | Leaderboard shows only top 5 of 10 | 1 | 3 | Low |
| 4 | BranchSelectorInline API mismatch | 2 | 4 | Low |
| 5 | Branch filtering documentation gap | 2 | 5 | Info |
| 6 | Hardcoded ₱ in chart Y-axis | 3 | 6 | Medium |
| 7 | Hardcoded PHP locale in inventory | 3 | 7 | Medium |
| 8 | Unused `staffPerf` state and fetch | 3 | 8 | Medium |
| 9 | ExecutiveAccounting branch audit | 3 | 9 | Info |
| 10 | Metrics branch filtering audit | 3 | 10 | Info |
| 11 | console.error/warn in server code | 4 | 11 | Low |
| 12 | Hardcoded ₱ currency fallback | 4 | 12 | Low |
| 13 | Full lint/build verification | 4 | 13 | Critical |

## Additional Suggestions (Not in Scope of This Plan)

1. **Three duplicate branch selector components** — `components/branch-selector.tsx`, `components/ui/branch-selector.tsx`, and `components/ui/branch-selector-inline.tsx` overlap in functionality and have inconsistent terminology. Consider consolidating into a single component with variants.

2. **`useBranchFilter()` hardcodes `includeShared: true`** — This could be made configurable if future features need to exclude shared items.

3. **5-minute cache TTL on all metrics** — Consider per-function cache TTLs (e.g., inventory changes less frequently than revenue).

4. **XLSX/PDF export buttons disabled** — The export utilities exist in `metrics-export-utils.ts` but the UI shows "Soon". Consider implementing or removing the dead buttons.

5. **`getStaffPerformance` has no date range** — It only accepts `branchId` but not `startDate`/`endDate`, making it impossible to filter by time period. If this data is needed in the future, date parameters should be added.