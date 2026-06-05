# Metrics Page Audit, Mobile Responsiveness & Skeleton Loading

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit and fix all logic and UI issues on the metrics page, ensure full mobile responsiveness, and replace the full-blur loading state with skeleton components.

**Architecture:** Replace the current backdrop-blur overlay loading pattern with per-section skeleton components that match the final layout. Extract duplicated UI components (MetricCard, TimeframeSelector) into shared components. Fix mobile layout issues with responsive Tailwind classes. Clean up dead code and fix logic bugs.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Recharts, Lucide React

---

## Issues Audit

### Critical: Loading State (Primary Request)
- **File:** `components/metrics/businessInsights.tsx:335-356`
- **Problem:** Two loading states exist:
  1. `initialLoad` shows a centered spinner in an 80dvh container (line 336-343) — poor UX, no visual structure
  2. Subsequent refreshes show a full `backdrop-blur-sm` overlay (line 349-356) — jarring, blocks all interaction
- **Fix:** Replace both with skeleton components that mirror the actual layout structure, so users see the page "fill in" naturally

### Critical: Mobile Layout Issues
1. **Tab bar + Branch selector overflow** (`app/metrics/metricsPage.tsx:21-59`): On mobile, the `flex-row` layout with tab buttons and `ml-auto` branch selector will squeeze or overflow. The branch selector needs to stack below tabs on mobile.
2. **Fixed chart height** (`businessInsights.tsx:543`, `ExecutiveAccounting.tsx:358,538`): `h-80` (320px) is too tall for small mobile screens in landscape, and wastes space in portrait. Use `h-60 sm:h-80`.
3. **Timeframe selector "Selected Range"** (`businessInsights.tsx:452-459`, `ExecutiveAccounting.tsx:253-260`): `items-end` alignment stacks oddly on mobile when `flex-wrap` kicks in.
4. **Artist leaderboard items** (`businessInsights.tsx:758-806`): Flex layout with avatar + name + price can overflow on narrow screens. The price column needs wrapping.
5. **Client Sources nested grid** (`businessInsights.tsx:684`): `grid-cols-2` inside `md:grid-cols-2` creates very narrow cards on mobile (375px).
6. **Pie chart label overlap** (`businessInsights.tsx:726-728`, `ExecutiveAccounting.tsx:449-451`): Labels with percentages can overlap on small screens.
7. **Export dropdown** (`businessInsights.tsx:381-411`): Positioned `absolute right-0` — may overflow on small viewports.
8. **MetricCard text sizes**: BusinessInsights MetricCard uses `text-2xl md:text-3xl` (good), ExecutiveAccounting uses only `text-2xl` (less responsive).

### Critical: Duplicate Components (DRY Violations)
1. **Two MetricCard definitions** with DIFFERENT interfaces:
   - `businessInsights.tsx:1180-1217`: `value?: number`, no `currencySymbol`, uses `Intl.NumberFormat` with PHP
   - `ExecutiveAccounting.tsx:616-659`: `value: number`, has `currencySymbol`, uses `toLocaleString`
   - **Fix:** Create a single shared `MetricCard` in `components/ui/MetricCard.tsx` with a unified interface
2. **Two TIMEFRAME_LABELS** with DIFFERENT values:
   - `businessInsights.tsx:67-75`: "Weekly", "Monthly", "Yearly"
   - `ExecutiveAccounting.tsx:41-49`: "This Week", "This Month", "This Year"
   - **Fix:** Create a single shared constant and extract the timeframe selector into a reusable component
3. **Duplicate timeframe selector + custom date UI**: Both components have nearly identical timeframe picker code (~50 lines each)
   - **Fix:** Extract into a shared `TimeframeSelector` component

### High: Logic Issues
1. **Export menu shows unsupported formats** (`businessInsights.tsx:380-411`): The export dropdown offers CSV, XLSX, and PDF, but `exportMetrics` only supports CSV (line 1120-1122 in `server/actions/metrics.ts`). Clicking XLSX or PDF will show an error notification.
   - **Fix:** Either implement XLSX/PDF export or remove those options from the dropdown
2. **`Promise.all` without individual error handling** (`businessInsights.tsx:177-212`): If ANY fetch fails, all subsequent `.success` checks silently skip. The user sees partial data with no indication of failure.
   - **Fix:** Use `Promise.allSettled` and handle individual failures
3. **Dead code — reviews state and UI** (`businessInsights.tsx:108-113, 217-229, 314-318`): `reviews`, `reviewsPage`, `reviewsHasMore`, `reviewsLoading`, `reviewsExpanded`, `reviewsTotal`, `_loadMoreReviews` are defined but the reviews section is never rendered in JSX.
   - **Fix:** Either implement the reviews section or remove the dead code
4. **Dead code — unused prefixed variables** (`_staffPerf`, `_groupBy`): Underscore-prefixed variables indicate they're stored but never read.
   - **Fix:** Remove or properly use them
5. **`console.error` in export handler** (`businessInsights.tsx:303`): Project convention is to use `createLogs`, not `console.error`.
   - **Fix:** Replace with `createLogs`
6. **`inventory.topSelling` always empty** (`server/actions/metrics.ts:329`): Comment says "Requires transaction data". The inventory section always shows "No sales data yet."
   - **Fix:** Implement top-selling items using `payroll_entry` or `transactions` data, or remove the empty section
7. **ExecutiveAccounting's `ReferenceLine` component** (`ExecutiveAccounting.tsx:164-184`): It's a custom SVG component that draws at 50% Y position, which doesn't represent the zero line on the chart. It's incorrect and doesn't align with Recharts' coordinate system.
   - **Fix:** Use Recharts' built-in `ReferenceLine` component, or remove it
8. **`getRatingMetrics` never called in BusinessInsights**: The function exists and has been updated with branch/date filtering, but it's not used in the component.
   - **Fix:** Either add a ratings section to BusinessInsights or note it as a TODO
9. **`getRevenueExpenseTrend` not cached** while other similar trend functions are cached.
   - **Fix:** Add caching consistent with other metrics functions

### Medium: Additional Suggestions
1. **`logsMetrics.tsx` component unused**: It exists in `components/metrics/` but isn't imported anywhere on the metrics page.
2. **No empty state for zero data**: When metrics return all zeros (new business), the charts show empty axes with no guidance.
3. **Currency symbol inconsistency**: BusinessInsights hardcodes "₱" via `Intl.NumberFormat("en-PH")`, while ExecutiveAccounting fetches from settings. Both should use the settings value.
4. **Chart tooltip colors**: Some tooltips use `backgroundColor: "#1f2937"` while others use `backgroundColor: "#000"`. Inconsistent styling.

---

## Task 1: Create Skeleton Component Primitives

**Files:**
- Create: `components/ui/skeleton.tsx`

**Step 1: Create the base Skeleton component**

This is a reusable animated skeleton primitive used by all skeleton layouts.

```tsx
"use client"

interface SkeletonProps {
    className?: string
}

export function Skeleton({ className = "" }: SkeletonProps) {
    return (
        <div
            className={`animate-pulse bg-white/10 rounded-md ${className}`}
            aria-hidden="true"
        />
    )
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    className={`h-4 ${i === lines - 1 ? "w-3/4" : "w-full"}`}
                />
            ))}
        </div>
    )
}
```

**Step 2: Verify the component compiles**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add components/ui/skeleton.tsx
git commit -m "feat(ui): add Skeleton and SkeletonText primitive components"
```

---

## Task 2: Create MetricCardSkeleton Component

**Files:**
- Create: `components/ui/MetricCardSkeleton.tsx`

**Step 1: Create the skeleton for a single metric card**

Mirrors the layout of the final `MetricCard` component (icon area + title + value).

```tsx
import { Skeleton } from "@/components/ui/skeleton"

interface MetricCardSkeletonProps {
    count?: number
}

export function MetricCardSkeleton({ count = 1 }: MetricCardSkeletonProps) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className='bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-2 select-none'
                >
                    <div className='flex justify-between items-start'>
                        <Skeleton className='h-4 w-24' />
                        <Skeleton className='h-5 w-5 rounded' />
                    </div>
                    <Skeleton className='h-8 w-32' />
                </div>
            ))}
        </>
    )
}
```

**Step 2: Verify**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add components/ui/MetricCardSkeleton.tsx
git commit -m "feat(ui): add MetricCardSkeleton component"
```

---

## Task 3: Create ChartSkeleton Component

**Files:**
- Create: `components/ui/ChartSkeleton.tsx`

**Step 1: Create the skeleton for chart containers**

Mirrors the chart container layout (title + chart area).

```tsx
import { Skeleton } from "@/components/ui/skeleton"

interface ChartSkeletonProps {
    className?: string
}

export function ChartSkeleton({ className = "" }: ChartSkeletonProps) {
    return (
        <div className={`w-full h-60 sm:h-80 bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-2 ${className}`}>
            <Skeleton className='h-4 w-40' />
            <div className='flex-1 flex items-end gap-1'>
                {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton
                        key={i}
                        className='flex-1'
                        style={{ height: `${30 + Math.random() * 60}%` }}
                    />
                ))}
            </div>
        </div>
    )
}
```

**Step 2: Create PieChartSkeleton**

```tsx
interface PieChartSkeletonProps {
    className?: string
    showLegend?: boolean
}

export function PieChartSkeleton({ className = "", showLegend = true }: PieChartSkeletonProps) {
    return (
        <div className={`bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-2 ${className}`}>
            <Skeleton className='h-4 w-36' />
            <div className='flex-1 flex items-center justify-center'>
                <Skeleton className='w-28 h-28 sm:w-32 sm:h-32 rounded-full' />
            </div>
            {showLegend && (
                <div className='flex justify-center gap-4'>
                    <Skeleton className='h-3 w-16' />
                    <Skeleton className='h-3 w-16' />
                </div>
            )}
        </div>
    )
}
```

**Step 3: Create LeaderboardSkeleton**

```tsx
interface LeaderboardSkeletonProps {
    count?: number
}

export function LeaderboardSkeleton({ count = 3 }: LeaderboardSkeletonProps) {
    return (
        <div className='space-y-2'>
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className='bg-white/5 rounded-lg p-4 flex items-center justify-between'
                >
                    <div className='flex items-center gap-3'>
                        <Skeleton className='w-8 h-8 rounded-full' />
                        <Skeleton className='w-10 h-10 rounded-full' />
                        <div className='flex flex-col gap-1'>
                            <Skeleton className='h-4 w-24' />
                            <Skeleton className='h-3 w-16' />
                        </div>
                    </div>
                    <div className='flex flex-col items-end gap-1'>
                        <Skeleton className='h-5 w-20' />
                        <Skeleton className='h-3 w-24' />
                    </div>
                </div>
            ))}
        </div>
    )
}
```

**Step 4: Verify**

Run: `bun run lint`
Expected: No errors

**Step 5: Commit**

```bash
git add components/ui/ChartSkeleton.tsx
git commit -m "feat(ui): add ChartSkeleton, PieChartSkeleton, and LeaderboardSkeleton"
```

---

## Task 4: Create BusinessInsightsSkeleton Full-Page Skeleton

**Files:**
- Create: `components/metrics/BusinessInsightsSkeleton.tsx`

**Step 1: Create the full skeleton layout for Business Insights tab**

This mirrors the actual `BusinessInsights` component layout structure so users see the page skeleton fill in naturally.

```tsx
import { Skeleton } from "@/components/ui/skeleton"
import { MetricCardSkeleton } from "@/components/ui/MetricCardSkeleton"
import { ChartSkeleton, PieChartSkeleton, LeaderboardSkeleton } from "@/components/ui/ChartSkeleton"

export function BusinessInsightsSkeleton() {
    return (
        <div className='w-full flex flex-col gap-6 pb-10'>
            <div className='flex flex-row justify-between items-center'>
                <Skeleton className='h-8 w-48' />
                <Skeleton className='h-9 w-24 rounded-md' />
            </div>

            <div className='flex flex-col gap-4'>
                <div className='flex items-center justify-between flex-wrap gap-4'>
                    <div className='flex gap-2 p-1 bg-white/5 w-fit rounded-lg border border-white/5'>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className='h-8 w-20 rounded-md' />
                        ))}
                    </div>
                    <div className='flex flex-col gap-1 items-end'>
                        <Skeleton className='h-3 w-24' />
                        <Skeleton className='h-4 w-36' />
                    </div>
                </div>
            </div>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-52' />
                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'>
                    <MetricCardSkeleton count={3} />
                </div>
                <ChartSkeleton />
                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'>
                    <MetricCardSkeleton count={3} />
                </div>
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-36' />
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div className='grid grid-cols-2 gap-4'>
                        <MetricCardSkeleton count={2} />
                    </div>
                    <PieChartSkeleton />
                </div>
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-56' />
                <LeaderboardSkeleton count={3} />
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-40' />
                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'>
                    <MetricCardSkeleton count={3} />
                </div>
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-44' />
                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4'>
                    <MetricCardSkeleton count={4} />
                </div>
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-40' />
                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4'>
                    <MetricCardSkeleton count={4} />
                </div>
                <ChartSkeleton />
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-40' />
                <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                    <MetricCardSkeleton count={1} />
                    <div className='lg:col-span-2 bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-4'>
                        <Skeleton className='h-4 w-44' />
                        <Skeleton className='h-8 w-full' />
                        <Skeleton className='h-8 w-full' />
                    </div>
                </div>
            </section>
        </div>
    )
}
```

**Step 2: Verify**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add components/metrics/BusinessInsightsSkeleton.tsx
git commit -m "feat(metrics): add BusinessInsightsSkeleton full-page skeleton layout"
```

---

## Task 5: Create ExecutiveAccountingSkeleton Full-Page Skeleton

**Files:**
- Create: `components/metrics/ExecutiveAccountingSkeleton.tsx`

**Step 1: Create the full skeleton layout for Executive Accounting tab**

```tsx
import { Skeleton } from "@/components/ui/skeleton"
import { MetricCardSkeleton } from "@/components/ui/MetricCardSkeleton"
import { ChartSkeleton, PieChartSkeleton } from "@/components/ui/ChartSkeleton"

export function ExecutiveAccountingSkeleton() {
    return (
        <div className='w-full flex flex-col gap-6 pb-10'>
            <div className='flex flex-col gap-4'>
                <div className='flex items-center justify-between flex-wrap gap-4'>
                    <div className='flex gap-2 p-1 bg-white/5 w-fit rounded-lg border border-white/5'>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className='h-8 w-20 rounded-md' />
                        ))}
                    </div>
                    <div className='flex flex-col gap-1 items-end'>
                        <Skeleton className='h-3 w-24' />
                        <Skeleton className='h-4 w-36' />
                    </div>
                </div>
            </div>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-48' />
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
                    <MetricCardSkeleton count={4} />
                </div>
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-56' />
                <ChartSkeleton />
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-44' />
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                    <PieChartSkeleton showLegend={false} />
                    <div className='bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-4'>
                        <Skeleton className='h-4 w-32' />
                        <div className='space-y-3'>
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className='flex items-center justify-between p-3 bg-white/5 rounded-lg'>
                                    <div className='flex items-center gap-3'>
                                        <Skeleton className='w-3 h-3 rounded-full' />
                                        <Skeleton className='h-4 w-20' />
                                    </div>
                                    <div className='text-right flex flex-col gap-1 items-end'>
                                        <Skeleton className='h-4 w-20' />
                                        <Skeleton className='h-3 w-10' />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-40' />
                <ChartSkeleton />
            </section>
        </div>
    )
}
```

**Step 2: Verify**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add components/metrics/ExecutiveAccountingSkeleton.tsx
git commit -m "feat(metrics): add ExecutiveAccountingSkeleton full-page skeleton layout"
```

---

## Task 6: Replace Loading States with Skeleton Components

**Files:**
- Modify: `components/metrics/businessInsights.tsx:335-356`
- Modify: `components/metrics/ExecutiveAccounting.tsx:208-214`

**Step 1: Update BusinessInsights loading state**

Replace the `initialLoad` spinner and the blur overlay with the skeleton component.

In `businessInsights.tsx`, add the import at the top:
```typescript
import { BusinessInsightsSkeleton } from "./BusinessInsightsSkeleton"
```

Replace the `initialLoad` block (lines 335-343):
```tsx
// REMOVE THIS ENTIRE BLOCK:
if (initialLoad) {
    return (
        <div className='w-full h-[80dvh] flex items-center justify-center'>
            <LoaderCircleIcon
                className='animate-spin'
                size={32}
            />
        </div>
    )
}
```

Replace with:
```tsx
if (initialLoad) {
    return <BusinessInsightsSkeleton />
}
```

Remove the blur overlay (lines 349-356):
```tsx
// REMOVE THIS ENTIRE BLOCK:
{loading && (
    <div className='absolute inset-0 bg-background/50 backdrop-blur-sm z-40 flex items-center justify-center rounded-xl'>
        <LoaderCircleIcon
            className='animate-spin text-white/60'
            size={24}
        />
    </div>
)}
```

Also remove the `relative` class from the main container div since we no longer need it for the overlay:
```tsx
// Change:
<div className='w-full flex flex-col gap-6 pb-10 relative'>
// To:
<div className='w-full flex flex-col gap-6 pb-10'>
```

And remove `LoaderCircleIcon` from the lucide imports if it's no longer used elsewhere. Check first — it IS still used in the export button (line 372), so keep the import.

**Step 2: Update ExecutiveAccounting loading state**

In `ExecutiveAccounting.tsx`, add the import at the top:
```typescript
import { ExecutiveAccountingSkeleton } from "./ExecutiveAccountingSkeleton"
```

Replace the blur overlay (lines 208-214):
```tsx
// REMOVE THIS ENTIRE BLOCK:
{loading && (
    <div className='absolute inset-0 bg-background/50 backdrop-blur-sm z-40 flex items-center justify-center rounded-xl'>
        <LoaderCircleIcon
            className='animate-spin text-white/60'
            size={24}
        />
    </div>
)}
```

Add an initial load guard similar to BusinessInsights. First, add `initialLoad` state:
```typescript
const [initialLoad, setInitialLoad] = useState(true)
```

Update the `fetchData` function — add `setInitialLoad(false)` in the `finally` block:
```typescript
} finally {
    setLoading(false)
    setInitialLoad(false)
}
```

Then add the initial load skeleton before the return:
```tsx
if (initialLoad) {
    return <ExecutiveAccountingSkeleton />
}
```

Remove the `relative` class from the main container:
```tsx
// Change:
<div className='w-full flex flex-col gap-6 pb-10 relative'>
// To:
<div className='w-full flex flex-col gap-6 pb-10'>
```

Remove `LoaderCircleIcon` from imports if no longer used. Check — it's only used in the blur overlay, so remove it from the import.

**Step 3: Verify both components render skeletons on load**

Run: `bun run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/metrics/businessInsights.tsx components/metrics/ExecutiveAccounting.tsx
git commit -m "feat(metrics): replace blur overlay and spinner loading states with skeleton components"
```

---

## Task 7: Create Shared MetricCard Component

**Files:**
- Create: `components/ui/MetricCard.tsx`
- Modify: `components/metrics/businessInsights.tsx` (remove local MetricCard)
- Modify: `components/metrics/ExecutiveAccounting.tsx` (remove local MetricCard)

**Step 1: Create the unified MetricCard**

Combines features from both existing MetricCard implementations. Supports optional value, currency formatting with configurable symbol, percent format, number format, and responsive text sizing.

```tsx
"use client"

interface MetricCardProps {
    title: string
    value?: number
    format?: "currency" | "number" | "percent"
    icon?: React.ReactNode
    currencySymbol?: string
}

export default function MetricCard({
    title,
    value,
    format = "number",
    icon,
    currencySymbol = "₱",
}: MetricCardProps) {
    const formattedValue = value === undefined
        ? "-"
        : format === "currency"
            ? `${currencySymbol}${value.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })}`
            : format === "percent"
                ? `${value.toFixed(1)}%`
                : value.toLocaleString()

    const getTrendColor = () => {
        if (value === undefined) return "text-white/40"
        if (format === "percent") return value >= 0 ? "text-green-400" : "text-red-400"
        if (value < 0) return "text-red-400"
        return "text-white"
    }

    return (
        <div className='bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-2 select-none hover:bg-white/10 transition-colors'>
            <div className='flex justify-between items-start'>
                <span className='text-white/60 font-medium text-sm'>
                    {title}
                </span>
                {icon}
            </div>
            <span
                className={`font-bold text-2xl md:text-3xl ${getTrendColor()}`}
                title={value?.toString()}
            >
                {formattedValue}
            </span>
        </div>
    )
}

export type { MetricCardProps }
```

**Step 2: Update BusinessInsights to use shared MetricCard**

In `businessInsights.tsx`:
1. Add import: `import MetricCard from "@/components/ui/MetricCard"`
2. Remove the local `MetricCard` function definition (lines 1180-1217)
3. All existing `<MetricCard>` calls should work without changes since the new shared component accepts the same `value?: number` prop

**Step 3: Update ExecutiveAccounting to use shared MetricCard**

In `ExecutiveAccounting.tsx`:
1. Add import: `import MetricCard from "@/components/ui/MetricCard"`
2. Remove the local `MetricCard` function definition (lines 608-659)
3. All existing `<MetricCard>` calls should work — they pass `value={plMetrics?.revenue ?? 0}` which converts `undefined` to `0`, and the `currencySymbol` prop is already supported

**Step 4: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 5: Commit**

```bash
git add components/ui/MetricCard.tsx components/metrics/businessInsights.tsx components/metrics/ExecutiveAccounting.tsx
git commit -m "refactor(metrics): extract shared MetricCard component, remove duplicates"
```

---

## Task 8: Create Shared TimeframeSelector Component

**Files:**
- Create: `components/ui/TimeframeSelector.tsx`
- Modify: `components/metrics/businessInsights.tsx` (replace inline timeframe UI)
- Modify: `components/metrics/ExecutiveAccounting.tsx` (replace inline timeframe UI)

**Step 1: Create the TimeframeSelector component**

Extracts the duplicated timeframe picker + custom date range + selected range display into a single reusable component. Uses consistent labels (the "This Week" / "This Month" / "This Year" style is clearer than "Weekly" / "Monthly" / "Yearly").

```tsx
"use client"

import { CalendarIcon } from "lucide-react"
import { DateRangePreset, getDateRangeFromPreset } from "@/utils/date-utils"

const TIMEFRAME_LABELS: Record<DateRangePreset, string> = {
    this_week: "This Week",
    this_month: "This Month",
    this_year: "This Year",
    today: "Today",
    last_year: "Last Year",
    custom: "Custom",
    all: "All Time",
}

interface TimeframeSelectorProps {
    timeframe: DateRangePreset
    onTimeframeChange: (preset: DateRangePreset) => void
    customStartDate: string
    customEndDate: string
    onCustomStartDateChange: (date: string) => void
    onCustomEndDateChange: (date: string) => void
    dateRangeStr: string
}

export default function TimeframeSelector({
    timeframe,
    onTimeframeChange,
    customStartDate,
    customEndDate,
    onCustomStartDateChange,
    onCustomEndDateChange,
    dateRangeStr,
}: TimeframeSelectorProps) {
    return (
        <div className='flex flex-col gap-4'>
            <div className='flex items-center justify-between flex-wrap gap-4'>
                <div className='flex gap-2 p-1 bg-white/5 w-fit rounded-lg border border-white/5 flex-wrap'>
                    {(
                        [
                            "this_week",
                            "this_month",
                            "this_year",
                        ] as DateRangePreset[]
                    ).map((preset) => (
                        <button
                            key={preset}
                            onClick={() => onTimeframeChange(preset)}
                            className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                                timeframe === preset
                                    ? "bg-white/10 text-white shadow-sm"
                                    : "text-white/40 hover:text-white/60 hover:bg-white/5"
                            }`}
                        >
                            {TIMEFRAME_LABELS[preset]}
                        </button>
                    ))}
                    <button
                        onClick={() => onTimeframeChange("custom")}
                        className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                            timeframe === "custom"
                                ? "bg-purple-500/20 text-purple-300 shadow-sm border border-purple-500/30"
                                : "text-white/40 hover:text-white/60 hover:bg-white/5"
                        }`}
                    >
                        <CalendarIcon size={14} />
                        Custom
                    </button>
                </div>

                <div className='flex flex-col items-end gap-1'>
                    <span className='text-xs text-white/40 font-mono'>
                        Selected Range
                    </span>
                    <span className='text-sm text-white/80 font-medium'>
                        {dateRangeStr || "Select a range"}
                    </span>
                </div>
            </div>

            {timeframe === "custom" && (
                <div className='flex items-center gap-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg flex-wrap'>
                    <div className='flex flex-col gap-1'>
                        <label className='text-xs text-white/60 font-medium'>
                            Start Date
                        </label>
                        <input
                            type='date'
                            value={customStartDate}
                            onChange={(e) => onCustomStartDateChange(e.target.value)}
                            className='px-3 py-2 bg-white/10 border border-white/10 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all'
                        />
                    </div>
                    <span className='text-white/40 mt-5'>to</span>
                    <div className='flex flex-col gap-1'>
                        <label className='text-xs text-white/60 font-medium'>
                            End Date
                        </label>
                        <input
                            type='date'
                            value={customEndDate}
                            onChange={(e) => onCustomEndDateChange(e.target.value)}
                            max={new Date().toISOString().split("T")[0]}
                            className='px-3 py-2 bg-white/10 border border-white/10 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all'
                        />
                    </div>
                    {customStartDate &&
                        customEndDate &&
                        new Date(customStartDate) >
                            new Date(customEndDate) && (
                            <span className='text-red-400 text-xs mt-5'>
                                Start date must be before end date
                            </span>
                        )}
                </div>
            )}
        </div>
    )
}

export { TIMEFRAME_LABELS }
```

**Step 2: Update BusinessInsights to use TimeframeSelector**

In `businessInsights.tsx`:
1. Add import: `import TimeframeSelector from "@/components/ui/TimeframeSelector"`
2. Remove the local `TIMEFRAME_LABELS` constant (lines 67-75)
3. Replace the inline timeframe selector block (lines 417-503) with:
```tsx
<TimeframeSelector
    timeframe={timeframe}
    onTimeframeChange={setTimeframe}
    customStartDate={customStartDate}
    customEndDate={customEndDate}
    onCustomStartDateChange={setCustomStartDate}
    onCustomEndDateChange={setCustomEndDate}
    dateRangeStr={dateRangeStr}
/>
```
4. Remove `CalendarIcon` from the lucide import IF it's no longer used directly (it's only used in the timeframe selector, which is now extracted). Check — `CalendarIcon` IS still used in the old code's timeframe button. After extraction, it won't be used directly, so remove it.

**Step 3: Update ExecutiveAccounting to use TimeframeSelector**

In `ExecutiveAccounting.tsx`:
1. Add import: `import TimeframeSelector from "@/components/ui/TimeframeSelector"`
2. Remove the local `TIMEFRAME_LABELS` constant (lines 41-49)
3. Remove `CalendarIcon` from lucide imports (only used in timeframe selector which is now extracted)
4. Replace the inline timeframe selector block (lines 218-302) with:
```tsx
<TimeframeSelector
    timeframe={timeframe}
    onTimeframeChange={setTimeframe}
    customStartDate={customStartDate}
    customEndDate={customEndDate}
    onCustomStartDateChange={setCustomStartDate}
    onCustomEndDateChange={setCustomEndDate}
    dateRangeStr={dateRangeStr}
/>
```

**Step 4: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 5: Commit**

```bash
git add components/ui/TimeframeSelector.tsx components/metrics/businessInsights.tsx components/metrics/ExecutiveAccounting.tsx
git commit -m "refactor(metrics): extract shared TimeframeSelector component with consistent labels"
```

---

## Task 9: Fix Metrics Page Tab Bar for Mobile

**Files:**
- Modify: `app/metrics/metricsPage.tsx:21-59`

**Step 1: Make the tab bar responsive**

The current layout uses `flex-row` with `ml-auto` for the branch selector, which doesn't work on mobile. On small screens, the branch selector should be on its own row below the tabs.

Replace the tab bar div:
```tsx
<div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 border-b-2 border-white/10 pb-2'>
    <div className='flex flex-row items-center gap-2'>
        <button
            onClick={() => setActiveTab("insights")}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
                activeTab === "insights"
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
        >
            <BarChart3Icon size={18} />
            Insights
        </button>
        <button
            onClick={() => setActiveTab("accounting")}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
                activeTab === "accounting"
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
        >
            <BriefcaseIcon size={18} />
            Accounting
        </button>
    </div>

    <div className='sm:ml-auto'>
        <BranchSelectorInline
            value={currentBranch?.id}
            onChange={(branchId) => {
                if (branchId === null) {
                    setCurrentBranch(null)
                } else {
                    const branch = branches.find(b => b.id === branchId)
                    if (branch) setCurrentBranch(branch)
                }
            }}
            showSharedOption={true}
        />
    </div>
</div>
```

Key changes:
- Tab text shortened: "Business Insights" → "Insights", "Executive Accounting" → "Accounting"
- `flex-col sm:flex-row` for stacking on mobile
- Branch selector below tabs on mobile, inline on desktop via `sm:ml-auto`
- Smaller padding on mobile: `px-3 sm:px-4`
- `text-sm` for mobile-friendly tab text

**Step 2: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add app/metrics/metricsPage.tsx
git commit -m "fix(metrics): responsive tab bar with stacked layout on mobile"
```

---

## Task 10: Fix Chart Container Heights for Mobile

**Files:**
- Modify: `components/metrics/businessInsights.tsx`
- Modify: `components/metrics/ExecutiveAccounting.tsx`

**Step 1: Update BusinessInsights chart heights**

Find and replace all `h-80` chart containers with responsive heights:

1. Revenue trend chart (currently `h-80`): Change to `h-60 sm:h-80`
2. Payroll status breakdown (currently `h-64`): Change to `h-48 sm:h-64`
3. Accounting summary by type (currently `h-[150px]`): Change to `h-[120px] sm:h-[150px]`

In the revenue chart div, change:
```tsx
<div className='w-full h-80 bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-2'>
```
to:
```tsx
<div className='w-full h-60 sm:h-80 bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-2'>
```

For the payroll status chart, change:
```tsx
<div className='h-64'>
```
to:
```tsx
<div className='h-48 sm:h-64'>
```

For the accounting by-type chart, change:
```tsx
<div className='h-[150px]'>
```
to:
```tsx
<div className='h-[120px] sm:h-[150px]'>
```

**Step 2: Update ExecutiveAccounting chart heights**

1. Revenue vs Expense trend chart: Change `h-80` to `h-60 sm:h-80`
2. Net Profit trend chart: Change `h-80` to `h-60 sm:h-80`

**Step 3: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/metrics/businessInsights.tsx components/metrics/ExecutiveAccounting.tsx
git commit -m "fix(metrics): responsive chart heights for mobile viewports"
```

---

## Task 11: Fix Artist Leaderboard Layout for Mobile

**Files:**
- Modify: `components/metrics/businessInsights.tsx` (leaderboard section)

**Step 1: Make leaderboard items mobile-friendly**

The current leaderboard item layout can overflow on narrow screens. The avatar + name + price columns need better wrapping.

Replace the leaderboard item layout (inside the `artistLeaderboard.slice(0, 5).map()` block):

```tsx
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
            ₱{artist.total_artist_cut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
        <span className='text-xs text-white/40 hidden sm:block'>
            of ₱{artist.total_gross.toLocaleString(undefined, { minimumFractionDigits: 2 })} total
        </span>
    </div>
</div>
```

Key mobile improvements:
- `gap-2 sm:gap-3` for tighter mobile spacing
- `min-w-0` on name container + `truncate` on name text to prevent overflow
- Smaller rank badge and avatar on mobile
- `shrink-0` on price column to prevent it from being compressed
- Hide "of ₱X total" subtext on mobile (`hidden sm:block`)
- "appointments" shortened to "appts" on mobile
- Smaller padding: `p-3 sm:p-4`

**Step 2: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add components/metrics/businessInsights.tsx
git commit -m "fix(metrics): responsive artist leaderboard layout for mobile"
```

---

## Task 12: Fix Client Sources and Pie Chart Mobile Layout

**Files:**
- Modify: `components/metrics/businessInsights.tsx` (Client Sources section)

**Step 1: Fix Client Sources nested grid for mobile**

The current layout has `grid-cols-2` inside `md:grid-cols-2`, creating very narrow cards on mobile. Change the inner grid to stack on mobile:

Change:
```tsx
<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
    <div className='grid grid-cols-2 gap-4'>
```
to:
```tsx
<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
    <div className='grid grid-cols-2 sm:grid-cols-2 gap-4'>
```

Wait — `grid-cols-2` to `grid-cols-2` is the same. The real issue is that on a 375px screen, two metric cards side by side at ~180px each are quite narrow. The fix is to stack them on very small screens:

```tsx
<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
    <div className='grid grid-cols-2 gap-4'>
```

This stays as `grid-cols-2` since the cards are simple metric cards that fit in 180px. The real fix is making the pie chart section handle small screens better.

**Step 2: Fix PieChart labels for mobile**

On small screens, the `label` function on the `<Pie>` component can produce overlapping text. Use a simpler label or hide it on mobile:

For the Client Type Distribution pie chart, change the label:
```tsx
label={({ name, percent }) =>
    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
}
```
to:
```tsx
label={({ name, percent }) =>
    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
}
```

Actually the issue is Recharts' label positioning on small containers. The best fix is to reduce the pie size on mobile and let the Legend handle identification:

Change the pie chart container:
```tsx
<div className='bg-white/5 border-2 border-white/5 rounded-xl p-4'>
    <h3 className='font-semibold text-white/60 text-sm mb-2'>
        Client Type Distribution
    </h3>
    <ResponsiveContainer
        width='100%'
        height={150}
    >
```
to:
```tsx
<div className='bg-white/5 border-2 border-white/5 rounded-xl p-4'>
    <h3 className='font-semibold text-white/60 text-sm mb-2'>
        Client Type Distribution
    </h3>
    <ResponsiveContainer
        width='100%'
        height={140}
    >
```

And simplify the pie label to remove the percentage (the Legend already shows it):
```tsx
<Pie
    data={[
        { name: "Walk-in", value: clientTypes?.walkinCount ?? 0 },
        { name: "Personal", value: clientTypes?.personalCount ?? 0 },
    ]}
    cx='50%'
    cy='50%'
    innerRadius={35}
    outerRadius={55}
    paddingAngle={5}
    dataKey='value'
>
```

Remove the `label` prop entirely from this pie chart and let the `<Legend>` handle it instead. Add a Legend if not present:

```tsx
<Legend
    wrapperStyle={{ fontSize: "11px" }}
    formatter={(value) => (
        <span className='text-white/60'>{value}</span>
    )}
/>
```

**Step 3: Fix ExecutiveAccounting expense pie chart similarly**

In `ExecutiveAccounting.tsx`, the expense breakdown pie chart has:
```tsx
label={({ name, percent }) =>
    `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
}
```

On mobile, this label overlaps. Remove the `label` prop and rely on the `<Legend>` that's already present:
```tsx
<Pie
    data={expenseBreakdown}
    cx='50%'
    cy='50%'
    labelLine={false}
    outerRadius={70}
    fill='#8884d8'
    dataKey='amount'
    nameKey='category'
>
```

Change `outerRadius={80}` to `outerRadius={70}` for mobile breathing room.

**Step 4: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 5: Commit**

```bash
git add components/metrics/businessInsights.tsx components/metrics/ExecutiveAccounting.tsx
git commit -m "fix(metrics): improve pie chart and client sources layout for mobile"
```

---

## Task 13: Fix Export Dropdown for Mobile

**Files:**
- Modify: `components/metrics/businessInsights.tsx` (export dropdown section)

**Step 1: Make export dropdown mobile-safe**

The dropdown is positioned `absolute right-0 top-full`. On very small screens, it might extend beyond the viewport. Add constraints and a mobile-friendly approach:

Change the export dropdown:
```tsx
{showExportMenu && (
    <div className='absolute right-0 top-full mt-1 w-40 bg-zinc-900 border border-white/10 rounded-md shadow-lg z-50 overflow-hidden'>
```
to:
```tsx
{showExportMenu && (
    <div className='absolute right-0 sm:right-0 top-full mt-1 w-40 bg-zinc-900 border border-white/10 rounded-md shadow-lg z-50 overflow-hidden'>
```

Also make the export button text responsive — hide the "Export" label on very small screens:
```tsx
<button
    onClick={() => setShowExportMenu(!showExportMenu)}
    disabled={loading || exporting}
    className='flex items-center gap-1.5 px-2 sm:px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2 border-blue-500/30 cursor-pointer'
    title='Export metrics'
>
    {exporting ? (
        <LoaderCircleIcon className='w-4 h-4 animate-spin' />
    ) : (
        <DownloadIcon className='w-4 h-4' />
    )}
    <span className='text-sm font-medium hidden sm:inline'>Export</span>
    <ChevronDownIcon className='w-4 h-4 hidden sm:inline' />
</button>
```

**Step 2: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add components/metrics/businessInsights.tsx
git commit -m "fix(metrics): responsive export button and dropdown for mobile"
```

---

## Task 14: Fix Export Menu — Disable Unsupported Formats

**Files:**
- Modify: `components/metrics/businessInsights.tsx` (export menu)

**Step 1: Disable XLSX and PDF export options**

Since `exportMetrics` only supports CSV (see `server/actions/metrics.ts:1120-1122`), the XLSX and PDF buttons will always fail. Either implement them (complex) or disable them with a "Coming Soon" indicator. The simplest correct fix is to disable them:

Change the export menu buttons:
```tsx
<button
    onClick={() => handleExport("csv")}
    className='w-full px-4 py-2 text-left text-sm hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-2'
>
    <span className='text-green-400 font-mono text-xs'>
        CSV
    </span>
    <span className='text-white/60'>
        Spreadsheet
    </span>
</button>
<button
    disabled
    className='w-full px-4 py-2 text-left text-sm hover:bg-white/10 transition-colors flex items-center gap-2 opacity-50 cursor-not-allowed'
>
    <span className='text-emerald-400 font-mono text-xs'>
        XLSX
    </span>
    <span className='text-white/60'>Excel</span>
    <span className='text-white/30 text-xs ml-auto'>Soon</span>
</button>
<button
    disabled
    className='w-full px-4 py-2 text-left text-sm hover:bg-white/10 transition-colors flex items-center gap-2 opacity-50 cursor-not-allowed'
>
    <span className='text-red-400 font-mono text-xs'>
        PDF
    </span>
    <span className='text-white/60'>Report</span>
    <span className='text-white/30 text-xs ml-auto'>Soon</span>
</button>
```

**Step 2: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add components/metrics/businessInsights.tsx
git commit -m "fix(metrics): disable unsupported XLSX/PDF export options with 'Soon' label"
```

---

## Task 15: Fix Promise.all Error Handling

**Files:**
- Modify: `components/metrics/businessInsights.tsx:177-212`

**Step 1: Replace Promise.all with Promise.allSettled**

The current code uses `Promise.all` which fails entirely if any single request throws. Switch to `Promise.allSettled` to handle individual failures gracefully:

```typescript
const [
    fin,
    trend,
    ops,
    inv,
    perf,
    ledger,
    payroll,
    earnings,
    netIncomeData,
    clientTypeData,
    leaderboardData,
] = await Promise.allSettled([
    getScopedFinancialMetrics(startDate, endDate, branchId),
    getRevenueTrend(startDate, endDate, groupBy, branchId),
    getOperationalMetrics(startDate, endDate, branchId),
    getInventoryMetrics(startDate, branchId),
    getStaffPerformance(branchId),
    getLedgerSummary(timeframe, startDate, endDate, branchId),
    getPayrollDashboardSummary(branchId ?? null),
    getStaffPayrollSummary(branchId ?? null),
    getNetIncomeMetrics(startDate, endDate, branchId),
    getClientTypeMetrics(startDate, endDate, branchId),
    getArtistLeaderboard(startDate, endDate, branchId),
])

const settle = <T>(result: PromiseSettledResult<T>): T | null =>
    result.status === "fulfilled" && result.value.success ? result.value.data : null

if (fin.status === "rejected") {
    addNotification("Failed to fetch financial metrics", "ERROR")
}
if (trend.status === "rejected") {
    addNotification("Failed to fetch revenue trend", "ERROR")
}

setFinancials(settle(fin))
setRevenueTrend(settle(trend) ?? [])
setOperations(settle(ops))
setInventory(settle(inv))
setStaffPerf(settle(perf) ?? [])
if (settle(ledger)) setAccountingSummary(settle(ledger))
if (settle(payroll)) setPayrollSummary(settle(payroll))
if (settle(earnings)) setArtistEarnings(settle(earnings)!)
setNetIncome(settle(netIncomeData))
setClientTypes(settle(clientTypeData))
setArtistLeaderboard(settle(leaderboardData) ?? [])
```

**Step 2: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add components/metrics/businessInsights.tsx
git commit -m "fix(metrics): use Promise.allSettled for graceful individual fetch failures"
```

---

## Task 16: Fix ExecutiveAccounting ReferenceLine Bug

**Files:**
- Modify: `components/metrics/ExecutiveAccounting.tsx`

**Step 1: Remove the custom ReferenceLine component**

The custom `ReferenceLine` at lines 164-184 is an SVG hack that draws at 50% Y position regardless of data. It doesn't represent the zero line. Remove it entirely:

Delete the `ReferenceLine` function (lines 164-184):
```tsx
// DELETE THIS ENTIRE FUNCTION:
function ReferenceLine({
    stroke,
    strokeDasharray,
}: {
    stroke: string
    strokeDasharray?: string
}) {
    return (
        <g>
            <line
                x1='0%'
                y1={`${50}%`}
                x2='100%'
                y2={`${50}%`}
                stroke={stroke}
                strokeDasharray={strokeDasharray}
                strokeWidth={1}
            />
        </g>
    )
}
```

**Step 2: Use Recharts' built-in ReferenceLine**

Import `ReferenceLine` from recharts (it's already available — it's a standard Recharts component):
```typescript
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
    LineChart,
    Line,
    ReferenceLine,
} from "recharts"
```

Then in the Net Profit LineChart, add the Recharts ReferenceLine:
```tsx
<LineChart data={trendData}>
    <CartesianGrid
        strokeDasharray='3 3'
        stroke='#ffffff20'
        vertical={false}
    />
    <XAxis
        dataKey='date'
        stroke='#ffffff60'
        fontSize={12}
        tickLine={false}
        axisLine={false}
    />
    <YAxis
        stroke='#ffffff60'
        fontSize={12}
        tickLine={false}
        axisLine={false}
        tickFormatter={(value: number) =>
            `${currencySymbol}${value >= 1000 ? (value / 1000).toFixed(0) + "k" : value}`
        }
    />
    <Tooltip
        contentStyle={{
            backgroundColor: "#000",
            borderColor: "#333",
            borderRadius: "8px",
        }}
        itemStyle={{ color: "#fff" }}
        formatter={(value: number) => [
            `${currencySymbol}${Number(value).toLocaleString()}`,
            "Net Profit",
        ]}
    />
    <ReferenceLine y={0} stroke='#ffffff40' strokeDasharray='3 3' />
    <Line
        type='monotone'
        dataKey='netProfit'
        name='Net Profit'
        stroke='#06b6d4'
        strokeWidth={2}
        dot={{
            fill: "#06b6d4",
            strokeWidth: 0,
            r: 4,
        }}
        activeDot={{ r: 6, fill: "#06b6d4" }}
    />
</LineChart>
```

The key change: `<ReferenceLine y={0} stroke='#ffffff40' strokeDasharray='3 3' />` — this correctly draws a horizontal line at Y=0 in the chart's data coordinate space.

**Step 3: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/metrics/ExecutiveAccounting.tsx
git commit -m "fix(metrics): replace broken custom ReferenceLine with Recharts ReferenceLine at y=0"
```

---

## Task 17: Replace console.error with createLogs

**Files:**
- Modify: `components/metrics/businessInsights.tsx:303`

**Step 1: Fix the console.error in export handler**

Change:
```typescript
console.error("Export error:", error)
```
to:
```typescript
createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Export error: ${error instanceof Error ? error.message : String(error)}` }] })
```

Make sure `createLogs` is imported. Check the current imports — `createLogs` is imported from `@/server/actions/logs`. If not already imported, add it. It IS already imported indirectly via the metrics actions, but the direct import is needed. Check — it's NOT imported in `businessInsights.tsx`. Add:

```typescript
import { createLogs } from "@/server/actions/logs"
```

**Step 2: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add components/metrics/businessInsights.tsx
git commit -m "fix(metrics): replace console.error with createLogs in export handler"
```

---

## Task 18: Add Caching to getRevenueExpenseTrend

**Files:**
- Modify: `server/actions/metrics.ts` (getRevenueExpenseTrend function)

**Step 1: Add caching to getRevenueExpenseTrend**

This function is the only trend function without caching. Add it for consistency:

After the auth check and before the try block, add cache check:
```typescript
try {
    const cacheKey = `revenue_expense_trend:${startDate}:${endDate}:${branchId || 'all'}`
    const cached = cache.get<RevenueExpenseTrendItem[]>(cacheKey)
    if (cached) {
        return success(cached)
    }
```

Before the return success, add cache set:
```typescript
    cache.set(cacheKey, trend, METRICS_CACHE_TTL)

    return success(trend)
```

**Step 2: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "perf(metrics): add caching to getRevenueExpenseTrend for consistency"
```

---

## Task 19: Fix Currency Symbol Inconsistency in BusinessInsights

**Files:**
- Modify: `components/metrics/businessInsights.tsx`

**Step 1: Fetch currency symbol from settings**

BusinessInsights hardcodes "₱" while ExecutiveAccounting correctly fetches from settings. Align them:

Add a `currencySymbol` state and fetch it from settings, same as ExecutiveAccounting:
```typescript
const [currencySymbol, setCurrencySymbol] = useState("₱")
```

Add a useEffect to fetch the currency setting:
```typescript
useEffect(() => {
    const fetchCurrency = async () => {
        const taxData = await getSetting("currency_tax")
        if (taxData.success && taxData.data) {
            setCurrencySymbol(taxData.data.currency_symbol)
        }
    }
    fetchCurrency()
}, [])
```

Add the import for `getSetting`:
```typescript
import { getSetting } from "@/server/actions/settings"
```

Update the shared `MetricCard` to pass `currencySymbol` prop where used for currency formatting. Since we extracted the shared MetricCard (Task 7), it accepts `currencySymbol`. Update all currency MetricCard calls in BusinessInsights to pass `currencySymbol`:
```tsx
<MetricCard
    title='Total Revenue'
    value={financials?.revenue}
    format='currency'
    icon={<BanknoteIcon className='text-green-400' />}
    currencySymbol={currencySymbol}
/>
```

Do this for all MetricCard instances with `format='currency'` in BusinessInsights.

Also update the revenue chart Y-axis and Tooltip formatters to use the dynamic symbol:
```tsx
tickFormatter={(value: number) => `${currencySymbol}${value}`}
// ...
formatter={(value: number) => [`${currencySymbol}${value.toLocaleString()}`, "Revenue"]}
```

And the leaderboard earnings display:
```tsx
<span className='text-sm sm:text-lg font-bold text-green-400'>
    {currencySymbol}{artist.total_artist_cut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
</span>
```

**Step 2: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add components/metrics/businessInsights.tsx
git commit -m "fix(metrics): use dynamic currency symbol from settings in BusinessInsights"
```

---

## Task 20: Remove Dead Code from BusinessInsights

**Files:**
- Modify: `components/metrics/businessInsights.tsx`

**Step 1: Remove unused reviews state and handlers**

The reviews-related state variables and fetch function are defined but the reviews section is never rendered in the JSX. Remove all of them:

Remove these state declarations:
```typescript
const [reviews, setReviews] = useState<AppointmentReview[]>([])
const [reviewsPage, setReviewsPage] = useState(1)
const [_reviewsHasMore, setReviewsHasMore] = useState(true)
const [_reviewsLoading, setReviewsLoading] = useState(false)
const [reviewsExpanded, _setReviewsExpanded] = useState(false)
const [_reviewsTotal, setReviewsTotal] = useState(0)
```

Remove the `fetchReviews` callback function (lines 217-229).

Remove the `useEffect` that fetches reviews (lines 236-240).

Remove the `_loadMoreReviews` function (lines 314-318).

Remove the `AppointmentReview` type from the metrics import if no longer needed. Check — `AppointmentReview` is only used by the removed reviews state, so remove it from the import.

Remove the `getAppointmentReviews` import from the metrics import.

**Step 2: Remove unused _staffPerf variable**

Change:
```typescript
const [_staffPerf, setStaffPerf] = useState<StaffPerformanceMetric[]>([])
```
to:
```typescript
const [, setStaffPerf] = useState<StaffPerformanceMetric[]>([])
```

And remove `StaffPerformanceMetric` from the import if `_staffPerf` was the only consumer. Check — `StaffPerformanceMetric` IS used in the `useState` type, so keep the import but use `_` for the unused value.

Actually, better: just remove the underscore convention entirely since we still need `setStaffPerf`:
```typescript
const [, setStaffPerf] = useState<StaffPerformanceMetric[]>([])
```

**Step 3: Run lint**

Run: `bun run lint`
Expected: No errors (unused variable warnings should be gone)

**Step 4: Commit**

```bash
git add components/metrics/businessInsights.tsx
git commit -m "cleanup(metrics): remove dead reviews code and unused variables from BusinessInsights"
```

---

## Task 21: Remove Unused _groupBy Variable in ExecutiveAccounting

**Files:**
- Modify: `components/metrics/ExecutiveAccounting.tsx`

**Step 1: Remove unused _groupBy calculation**

In `ExecutiveAccounting.tsx` line 121:
```typescript
const _groupBy = daysDiff > 90 ? "month" : daysDiff > 30 ? "week" : "day"
```

This variable is calculated but never used. Remove it. The `daysDiff` calculation before it IS used for the comment, but since `_groupBy` is unused, we can remove both the `_groupBy` line and the `daysDiff` calculation since it serves no purpose:

Change:
```typescript
const daysDiff = Math.ceil(
    (range.end.getTime() - range.start.getTime()) /
        (1000 * 60 * 60 * 24)
)
const _groupBy = daysDiff > 90 ? "month" : daysDiff > 30 ? "week" : "day"
```

to just remove both lines entirely.

**Step 2: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add components/metrics/ExecutiveAccounting.tsx
git commit -m "cleanup(metrics): remove unused _groupBy and daysDiff calculation"
```

---

## Task 22: Unify Chart Tooltip Styling

**Files:**
- Modify: `components/metrics/businessInsights.tsx`
- Modify: `components/metrics/ExecutiveAccounting.tsx`

**Step 1: Standardize all tooltip contentStyle**

Some tooltips use `backgroundColor: "#000"` while others use `backgroundColor: "#1f2937"`. Standardize to a consistent dark style across all charts in both components. Use `#0a0a0a` as the base (near-black that matches the dark theme):

In both files, find all `Tooltip` components and ensure they use:
```tsx
<Tooltip
    contentStyle={{
        backgroundColor: "#0a0a0a",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "8px",
    }}
    itemStyle={{ color: "#fff" }}
/>
```

This replaces:
- `backgroundColor: "#000"` → `backgroundColor: "#0a0a0a"`
- `borderColor: "#333"` → `border: "1px solid rgba(255,255,255,0.1)"`
- Inconsistent `backgroundColor: "#1f2937"` → `backgroundColor: "#0a0a0a"`
- Inconsistent `border: "1px solid rgba(255,255,255,0.1)"` — keep this one as-is

**Step 2: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add components/metrics/businessInsights.tsx components/metrics/ExecutiveAccounting.tsx
git commit -m "style(metrics): unify chart tooltip styling across all components"
```

---

## Task 23: Implement Top Selling Inventory Items

**Files:**
- Modify: `server/actions/metrics.ts` (getInventoryMetrics function)

**Step 1: Implement topSelling using payroll_entry data**

Currently `topSelling` is always empty (line 329 comment). Use `payroll_entry` joined with `inventory` to get top-selling items by revenue. However, this requires an `inventoryId` field on `payrollEntry` which may not exist.

Alternative approach: Use `transactions` joined with `inventory` to find top-selling items. But the schema may not have a direct link.

**Simpler approach:** Use the `appointments` table which has service/item relationships. For now, since the data model doesn't directly support item-level sales tracking through payroll, change the "Top Selling Items" section to show the data that IS available — inventory by value.

Update `getInventoryMetrics` to include items sorted by stock value:

```typescript
const topSelling = items
    .map((item) => ({
        name: "Item",
        quantity: Number(item.currentStock) || 0,
        revenue: Number(item.sellingPrice) || 0,
    }))
    .sort((a, b) => b.revenue * b.quantity - a.revenue * a.quantity)
    .slice(0, 5)
```

Wait — we don't have the item name in the current query. We need to add it:

```typescript
const items = await db
    .select({
        name: inventory.name,
        currentStock: inventory.currentStock,
        unitPrice: inventory.unitPrice,
        sellingPrice: inventory.sellingPrice,
    })
    .from(inventory)
    .where(and(...conditions))
```

Then update the topSelling calculation:

```typescript
const topSelling = items
    .map((item) => ({
        name: item.name || "Unknown",
        quantity: Number(item.currentStock) || 0,
        revenue: (Number(item.sellingPrice) || 0) * (Number(item.currentStock) || 0),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
```

This shows inventory items sorted by potential revenue (selling price × stock). Rename the section heading in BusinessInsights from "Top Selling Items (Last 30 Days)" to "Top Inventory by Value".

**Step 2: Update BusinessInsights heading**

In `businessInsights.tsx`, change:
```tsx
<h3 className='font-semibold text-white/60 text-sm'>
    Top Selling Items (Last 30 Days)
</h3>
```
to:
```tsx
<h3 className='font-semibold text-white/60 text-sm'>
    Top Inventory by Value
</h3>
```

And update the "units sold" label:
```tsx
<span className='text-xs text-white/40'>
    {item.quantity} units in stock
</span>
```

**Step 3: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add server/actions/metrics.ts components/metrics/businessInsights.tsx
git commit -m "feat(metrics): implement top inventory items by value instead of empty topSelling"
```

---

## Task 24: Final Build Verification

**Step 1: Run lint on all files**

Run: `bun run lint`
Expected: Zero errors, zero warnings

**Step 2: Run the build**

Run: `bun run build`
Expected: Build succeeds with no TypeScript errors

**Step 3: Manual testing checklist**

Test the following scenarios on both desktop and mobile (use browser DevTools responsive mode):

1. **Skeleton loading**: On first load, the skeleton layout should appear instead of a spinner or blur
2. **Tab switching**: Switch between "Insights" and "Accounting" tabs — skeleton should show on initial load of each
3. **Mobile tab bar**: On 375px viewport, tabs and branch selector should stack vertically
4. **Charts on mobile**: Charts should be shorter on mobile (h-60) and taller on desktop (h-80)
5. **Artist leaderboard on mobile**: Names should truncate, prices should remain visible
6. **Export dropdown**: Only CSV should be active; XLSX/PDF should show "Soon" and be disabled
7. **Currency symbol**: Both tabs should display the currency symbol from settings
8. **Timeframe selector**: Preset buttons and custom date range should work on both tabs
9. **Branch selector**: Changing branches should refresh data in both tabs
10. **Error handling**: If a single metric fetch fails, other metrics should still display
11. **Net profit line**: The zero reference line should be at Y=0 in the Executive Accounting Net Profit chart
12. **Tooltip consistency**: All chart tooltips should have consistent dark styling

---

## Summary of All Tasks

| # | Task | Files | Type |
|---|------|-------|------|
| 1 | Create Skeleton primitive | `components/ui/skeleton.tsx` | feat |
| 2 | Create MetricCardSkeleton | `components/ui/MetricCardSkeleton.tsx` | feat |
| 3 | Create ChartSkeleton variants | `components/ui/ChartSkeleton.tsx` | feat |
| 4 | Create BusinessInsightsSkeleton | `components/metrics/BusinessInsightsSkeleton.tsx` | feat |
| 5 | Create ExecutiveAccountingSkeleton | `components/metrics/ExecutiveAccountingSkeleton.tsx` | feat |
| 6 | Replace loading states with skeletons | `businessInsights.tsx`, `ExecutiveAccounting.tsx` | feat |
| 7 | Extract shared MetricCard | `components/ui/MetricCard.tsx` + both metric components | refactor |
| 8 | Extract shared TimeframeSelector | `components/ui/TimeframeSelector.tsx` + both metric components | refactor |
| 9 | Fix tab bar for mobile | `app/metrics/metricsPage.tsx` | fix |
| 10 | Fix chart heights for mobile | Both metric components | fix |
| 11 | Fix leaderboard for mobile | `businessInsights.tsx` | fix |
| 12 | Fix pie charts for mobile | Both metric components | fix |
| 13 | Fix export dropdown for mobile | `businessInsights.tsx` | fix |
| 14 | Disable unsupported export formats | `businessInsights.tsx` | fix |
| 15 | Fix Promise.all error handling | `businessInsights.tsx` | fix |
| 16 | Fix ReferenceLine bug | `ExecutiveAccounting.tsx` | fix |
| 17 | Replace console.error with createLogs | `businessInsights.tsx` | fix |
| 18 | Add caching to getRevenueExpenseTrend | `server/actions/metrics.ts` | perf |
| 19 | Fix currency symbol inconsistency | `businessInsights.tsx` | fix |
| 20 | Remove dead code from BusinessInsights | `businessInsights.tsx` | cleanup |
| 21 | Remove unused _groupBy in ExecutiveAccounting | `ExecutiveAccounting.tsx` | cleanup |
| 22 | Unify chart tooltip styling | Both metric components | style |
| 23 | Implement top inventory by value | `server/actions/metrics.ts`, `businessInsights.tsx` | feat |
| 24 | Final build verification | All | verify |
