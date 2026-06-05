# Architectural Specification: Accounting Analytics Flag, Layout Fixes & Enhanced Reports

## 1. Executive Summary

Add a per-user `accounting_analytics_view` feature access flag to gate the summary analytics cards and enhanced Reports tab in the Accounting module. Fix existing layout issues with stat card value overflow and table double-scrolling. Enhance the Reports tab with 7 financial chart sections (trends, breakdown, cash flow, projection) using the existing recharts library, gated behind the same flag.

---

## 2. Constraints & Non-Negotiables

### Security
- **Flag enforcement at both UI and server-action level.** The `accounting_analytics_view` flag must gate both the rendering of analytics/reporting UI elements AND the corresponding server action calls. A user without the flag must never trigger the summary or report server actions.
- **Admin bypass unchanged.** Admin users continue to bypass all access flags (existing pattern). No change to admin behavior.
- **Existing `accounting_access` flag remains the page-level gate.** The new flag is an additive layer — a user must have `accounting_access` (or be admin) to reach the page at all.

### Performance
- **Skip API calls when flag absent.** Users without `accounting_analytics_view` must not call `getLedgerSummary()` or any new report server actions during page load or tab switches. `getTrialBalance()` is NOT gated — it runs for all users with `accounting_access`.
- **Batch report queries.** All report data fetches for the Reports tab must run in a single `Promise.all()` batch (consistent with existing data-fetching pattern in `fetchData`).

### Technology
- **recharts only.** All charts must use the existing recharts library (already installed, used in BusinessInsights). No new charting dependency.
- **Tailwind CSS only for layout.** No CSS-in-JS or inline styles for layout; all fixes via Tailwind utility classes.
- **Server actions for new queries.** New report data must be fetched via server actions in `server/actions/accounting.ts`, not direct DB calls from client components.

### Frontend Architecture
- **Single client component.** The accounting page is a single `"use client"` component (`accountingPage.tsx`). New chart components may be separate if they warrant it, but the data orchestration lives in the page component.
- **No React state management library.** Existing `useState`/`useCallback`/`useEffect` pattern in the page component is the correct pattern. No new state management.

---

## 3. System Boundaries

### IN Scope
1. **New access flag** `accounting_analytics_view` in `FEATURE_ACCESS_FLAGS` registry
2. **Summary cards gating** — StatsGrid section wrapped in FlagGate; `getLedgerSummary()` call skipped for users without the flag
3. **StatCard overflow fix** — CSS adjustments for long value strings, especially negative values with currency symbols
4. **StatsGrid responsive layout** — Better column behavior on smaller non-mobile screens (tablet, small desktop) to prevent card wrapping/overflow
5. **Table double-scroll fix** — Remove `min-h-full` and vertical `overflow-auto` from the table wrapper div; keep horizontal scroll for wide tables
6. **Reports tab enhancement** — 7 chart/report sections gated behind the flag:
   - Revenue vs Expense trend (line chart, dual series)
   - Net Income/Loss trend (line chart)
   - Expense breakdown by category (bar chart)
   - Revenue vs Expense comparison (grouped bar chart)
   - Account type distribution (pie chart)
   - Cash flow summary (inflow/outflow/net cards)
   - Period projection (line chart with historical + projected segments)
7. **New server actions** for report data queries
8. **New chart components** under `components/accounting/` (1-2 composable chart wrappers)
9. **Auto-discovery** in user edit page — new flag appears automatically via existing dynamic checkbox rendering

### OUT of Scope
1. E2E browser testing (user declined)
2. Modifications to the existing Business Insights /metrics page
3. Modifications to the export engine
4. Backend data model changes (general_ledger table is sufficient)
5. PDF/CSV export of new reports
6. Mobile-responsive behavior below tablet size (existing `mobile: 2` grid is adequate)
7. Modifications to the existing TrialBalance component
8. Any password/passkey-based re-authorization for viewing analytics

### Integration Surfaces
- **`utils/auth/access-flags.ts`** — Flag registry (1 new entry)
- **`app/accounting/accountingPage.tsx`** — Main modification surface (data flow, FlagGate wrapper, Reports tab expansion)
- **`components/ui/FlagGate.tsx`** — Used as-is (no changes needed)
- **`components/ui/StatCard.tsx`** — CSS fix
- **`components/ui/StatsGrid.tsx`** — CSS/column fix
- **`server/actions/accounting.ts`** — 3-4 new server action functions
- **`components/accounting/`** — 1-2 new chart components
- **`app/accounts/[id]/page.tsx`** — No changes needed (dynamic flag rendering)

---

## 4. Component Architecture

### New Components

```
components/accounting/
  AccountingTrendChart.tsx    (NEW) — Wrapper around recharts LineChart for time-series data
  AccountingBreakdownChart.tsx (NEW) — Wrapper around recharts BarChart/PieChart for categorical data
  CashFlowSummary.tsx         (NEW) — Summary cards for cash flow
  PeriodProjection.tsx        (NEW) — Line chart with historical + projected overlay
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| `AccountingTrendChart` | Renders a recharts LineChart with one or two series. Props: data, lines (config array with dataKey, color, name), xAxisKey, yAxisLabel, currencySymbol |
| `AccountingBreakdownChart` | Renders a recharts BarChart (for categories) or PieChart (for distribution). Props: data, type ('bar'|'pie'), valueKey, labelKey, colorMap |
| `CashFlowSummary` | Three MetricCard-style items: Total Inflow, Total Outflow, Net Cash Flow. Props: data, currencySymbol |
| `PeriodProjection` | Renders a dual-segment line chart (solid = historical, dashed = projected). Props: historicalData, projectedData, currencySymbol |

### Existing Components (unchanged)

| Component | Usage |
|-----------|-------|
| `FlagGate` | Wraps StatsGrid and Reports tab sections |
| `StatCard` | Summary cards (with CSS fix) |
| `StatsGrid` | Grid for summary cards (with responsive fix) |
| `TrialBalance` | Existing trial balance table in Reports tab |
| `AdminActionGuard` | Action buttons in ledger table |

### Component Tree (modified)

```
AccountingPageClient
├── PageHeader
├── TabBar (Ledger | Reports | Trash)
├── [Tab=Ledger]
│   ├── FilterBar
│   ├── [FlagGate: accounting_analytics_view]  ← NEW GATE
│   │   └── StatsGrid
│   │       └── StatCard × 6
│   ├── Breakdown by Account Type
│   ├── PaymentMethodDrilldown
│   └── Ledger Table (scroll-fixed)            ← FIXED
│       └── Pagination
├── [Tab=Reports]
│   ├── TrialBalance (existing — visible to all accounting_access users, ungated)
│   ├── [FlagGate: accounting_analytics_view]  ← NEW GATE
│   │   ├── Revenue vs Expense Trend (new chart)
│   │   ├── Net Income Trend (new chart)
│   │   ├── Expense Breakdown (new chart)
│   │   ├── Revenue vs Expense Comparison (new chart)
│   │   ├── Account Type Distribution (new chart)
│   │   ├── Cash Flow Summary (new)
│   │   └── Period Projection (new)
│   │       └── Historical + Projected Trend
│   └── [no flag fallback: TrialBalance still visible, charts omitted]
└── [Tab=Trash] ... (unchanged)
```

---

## 5. Data Flow

### 5.1 Page Load Flow

```
accountingPage.tsx mount
  ├── Check accounting_access (already done via server redirect)
  ├── Check accounting_analytics_view flag
  │   ├── NO: set hasAnalyticsAccess = false
  │   │     fetchData() calls: getLedgerEntries, getAccountingCategories,
  │   │                       getSetting (currency), getLedgerDetailBreakdown,
  │   │                       getTrialBalance (NOT gated)
  │   │     skip: getLedgerSummary, all NEW report actions
  │   │     render: no StatsGrid (cards), TrialBalance visible, no report charts
  │   └── YES: set hasAnalyticsAccess = true
  │         fetchData() calls: ALL existing + getLedgerSummary + NEW report actions
  │         render: StatsGrid + full Reports tab with all 7 sections
  └──
```

### 5.2 Tab Switch Flow

```
Tab: Ledger → Reports
  ├── TrialBalance is already loaded from initial fetchData() — reuse state
  ├── hasAnalyticsAccess = false:
  │     Show TrialBalance (existing data)
  │     No additional data fetching for charts
  │     Chart sections not rendered
  └── hasAnalyticsAccess = true:
        fetchReportData()
          → Promise.all([
              getRevenueExpenseTrend(...),
              getExpenseBreakdown(...),
              getCashFlowSummary(...),
            ])
          → Client-side: compute projection from trend data via useMemo
          → Set report state → render 7 sections + TrialBalance
```

### 5.3 Server Action: getRevenueExpenseTrend

```
Input: { datePreset, startDate, endDate, branchId }
Processing:
  1. Determine groupBy granularity:
     - dateRange <= 31 days: group by 'day'
     - dateRange <= 90 days: group by 'week'
     - dateRange > 90 days: group by 'month'
  2. Query:
     SELECT DATE_TRUNC(groupBy, entry_date) as period,
            SUM(credit) FILTER(WHERE entry_type='REVENUE') as revenue,
            SUM(debit) FILTER(WHERE entry_type='EXPENSE') as expenses
     FROM general_ledger
     WHERE isVoided=false
       AND entry_date BETWEEN startDate AND endDate
       [AND branchId filter]
     GROUP BY period ORDER BY period
  3. Compute net_income = revenue - expenses per period
Output: Array of { period: string, revenue: number, expenses: number, net_income: number }
```

### 5.4 Server Action: getExpenseBreakdown

```
Input: { datePreset, startDate, endDate, branchId }
Query:
  SELECT category, SUM(debit - credit) as amount
  FROM general_ledger
  WHERE entry_type='EXPENSE' AND isVoided=false
    AND entry_date BETWEEN startDate AND endDate
    [AND branchId filter]
  GROUP BY category
  ORDER BY amount DESC
Output: Array of { category: string, amount: number }
  Client: compute percentage = amount / total * 100
```

### 5.5 Server Action: getCashFlowSummary

```
Input: { datePreset, startDate, endDate, branchId }
Query (two parts):
  -- Inflow: Revenue entries
  SELECT SUM(credit - debit) as inflow
  FROM general_ledger
  WHERE entry_type='REVENUE' AND isVoided=false
    AND entry_date BETWEEN startDate AND endDate
    [AND branchId filter]

  -- Outflow: Expense entries
  SELECT SUM(debit - credit) as outflow
  FROM general_ledger
  WHERE entry_type='EXPENSE' AND isVoided=false
    AND entry_date BETWEEN startDate AND endDate
    [AND branchId filter]
Output: { inflow: number, outflow: number, net: number }
```

### 5.6 Period Projection (Client-side)

```
Input: Trends data from getRevenueExpenseTrend (min 3 periods)
Algorithm: Simple linear regression on revenue and expense series
  1. Compute slope and intercept for revenue series
  2. Compute slope and intercept for expense series
  3. Extrapolate next 3-6 periods
  4. Ensure projection values don't go negative (clamp at 0)
Output: { historical: [...], projected: [...] }
  rendered as dual-segment line chart
```

### State Ownership

| State | Location | Lifecycle |
|-------|----------|-----------|
| `hasAnalyticsAccess` | `useMemo` in page component | Computed on mount from userInfo.access_flags |
| `summary` (LedgerSummary) | `useState` in page | Fetched on mount + filter change, only if hasAnalyticsAccess |
| `reportData` (trend, breakdown, cashFlow) | `useState` in page | Fetched on Reports tab activation, only if hasAnalyticsAccess |
| `projectionData` | `useMemo` in page | Computed from trend data whenever trend data changes |

### Caching Strategy

- No explicit caching layer. Server actions are the single source of truth.
- `useMemo` on client side prevents unnecessary re-computation of chart data transformations.
- The existing `Promise.all` + request-id pattern (requestIdRef) prevents stale data races.

---

## 6. Security & Error Handling

### Authentication/Authorization Model

| Layer | Check | Responsibility |
|-------|-------|----------------|
| Server page | `canAccessAccounting(user)` → redirect | `app/accounting/page.tsx` |
| Client page | `userInfo?.access_flags?.includes("accounting_analytics_view")` | `accountingPage.tsx` |
| UI rendering | `<FlagGate requiredFlag="accounting_analytics_view">` | `components/ui/FlagGate.tsx` |
| Server actions | `await canAccessAccounting(user)` + new flag check | `server/actions/accounting.ts` |

### New Flag Server Validation

Each new report server action must include a flag check:
```typescript
const user = await getCurrentUser()
if (!user) return failure('Unauthorized')
const hasAccess = await canAccessAccounting(user)
if (!hasAccess) return failure('Access denied')
// NEW: Check analytics flag
const isAdmin = user.role === 'admin'
const hasAnalyticsFlag = user.access_flags?.includes('accounting_analytics_view') ?? false
if (!isAdmin && !hasAnalyticsFlag) return failure('Access denied — requires accounting_analytics_view flag')
```

### Input Validation

- All date inputs validated via existing `safeToDate()` / `getDateRangeFromPreset()` pattern.
- SQL injection prevented via parameterized drizzle-orm queries (same as existing).
- LIKE wildcard escaping via existing `escapeLike()` utility.
- Sanitize: Server-side sanitization via `sanitizeText()` for any string inputs (existing pattern).
- Zod validation: Use existing `Zod` schemas in settings if any new settings are added (not expected — flags are user-based).

### Error Handling

- **Fail-closed**: If the flag check server action fails (e.g., database error during user lookup), default to denying access.
- **Retry policy**: Server actions are stateless — retry is on the client. Existing pattern: single attempt, error notification via `addNotification`.
- **Logging**: All failures logged via `logError()` with appropriate type ('ACCOUNTING').
- **Chart rendering errors**: recharts handles gracefully (no data → empty chart, null data → nothing rendered).
- **Empty data safety**: Each chart section checks `data.length > 0` before rendering; renders an empty state message when no data exists.

### Race Conditions

- The existing `requestIdRef` pattern handles stale responses from rapid filter changes. This must be applied to the new report data fetches as well.
- The `trashRequestIdRef` pattern is a template for new report fetches.

---

## 7. Migration & Rollback

### Database Migrations

None required. The `general_ledger` table already contains all fields needed. No schema changes. The flag is a user metadata field (JSON array of strings), not a database column.

### Backward Compatibility

- **Flag absent**: Users without `accounting_analytics_view` see everything they had before:
  - Ledger tab: Shows everything except the summary StatsGrid (6 cards)
  - Reports tab: Shows the existing TrialBalance (unchanged), but no enhanced chart sections
  
  This is the most backward-compatible approach — existing users with `accounting_access` but not `accounting_analytics_view` lose nothing they previously had, because the TrialBalance was the only Reports content and remains visible.

  **Final Gating Rules**:
  - Summary cards (StatsGrid) → gated by `accounting_analytics_view`
  - Enhanced report charts (7 sections) → gated by `accounting_analytics_view`
  - Existing TrialBalance in Reports tab → NOT gated (remains visible to all with `accounting_access`)

- **Admin users**: Admins always bypass the flag and see everything.

### Rollback Strategy

1. Remove the `accounting_analytics_view` entry from `FEATURE_ACCESS_FLAGS` registry
2. Remove FlagGate wrappers from accounting page
3. Remove new server actions
4. Keep chart components (they won't be rendered if not called)
5. Keep CSS fixes (StatCard overflow, table scroll) — these are pure improvements

---

## 8. Testing Strategy

### Unit/Integration (TDD — Mandatory)

Every source file added or modified must have a corresponding test file with Red-Green-Refactor cycles:

| File | Test Focus |
|------|------------|
| `utils/auth/access-flags.ts` | New flag is in registry; `userHasFlag()` works for new flag; admin bypass; normalization |
| `server/actions/accounting.ts` new functions | `getRevenueExpenseTrend`: correct aggregation, empty results, date range boundary, branch filter, flag enforcement |
| `server/actions/accounting.ts` new functions | `getExpenseBreakdown`: correct aggregation, empty categories, category ordering |
| `server/actions/accounting.ts` new functions | `getCashFlowSummary`: correct inflow/outflow computation, zero values |
| `components/accounting/AccountingTrendChart.tsx` | Render with data, render empty, render with single data point, currency formatting |
| `components/accounting/AccountingBreakdownChart.tsx` | Render with categories, empty, single category |
| `components/accounting/CashFlowSummary.tsx` | Render positive/negative/zero net |
| `components/accounting/PeriodProjection.tsx` | Render with sufficient data, too few points (fallback), flat trend |
| `app/accounting/accountingPage.tsx` | Flag gating of StatsGrid, flag gating of Reports tab, table scroll fix CSS, stat card overflow fix |

### E2E Browser Testing

**NOT APPLICABLE** — User declined E2E testing. Unit/integration tests only.

---

## 9. Detailed Requirements by Section

### 9.1 New Flag: `accounting_analytics_view`

- **Location**: `utils/auth/access-flags.ts` — add to `FEATURE_ACCESS_FLAGS` object
- **Label**: "Accounting Analytics View"
- **Description**: "View summary analytics cards and enhanced reports in Accounting"
- **Type propagation**: Auto-derived through existing `FeatureAccessFlag` type
- **Admin UI**: Auto-appears in user edit page's Feature Access checkbox grid (no changes needed)

### 9.2 Summary Cards Gating

- In `accountingPage.tsx`:
  1. Compute `hasAnalyticsAccess` early: `isAdmin || userInfo?.access_flags?.includes("accounting_analytics_view")`
  2. In `fetchData()`: Only call `getLedgerSummary()` if `hasAnalyticsAccess`
  3. In JSX: Wrap `<StatsGrid>` with `<FlagGate requiredFlag="accounting_analytics_view">`
  4. The Breakdown by Account Type section (below StatsGrid) should follow the same gate — if summary is null, skip it (it already does this)

### 9.3 StatCard Overflow Fix

- **Problem**: Values like `-₱425,287.84` break across two lines due to the negative sign + currency symbol + long number in a narrow card
- **Root cause**: The `text-lg sm:text-2xl` font size combined with narrow grid columns on tablet/small desktop
- **Fix**: Add CSS utility classes to the value element in `StatCard.tsx`:
  - `truncate` to force single-line with ellipsis
  - OR `whitespace-nowrap` and `text-ellipsis overflow-hidden` for longer visible text
  - Ensure the value container has `min-w-0` to allow shrinking properly
- **StatsGrid fix**: On desktop (lg), reduce from 6 columns to 4 or 5 when stat values are long:
  - Current: `{ mobile: 2, tablet: 3, desktop: 6 }`
  - Consider: `{ mobile: 2, tablet: 3, desktop: 4 }` (fewer columns = wider cards = less overflow risk)
  - **Decision**: Keep 6 columns on desktop, but fix the StatCard value rendering. Use `whitespace-nowrap` + `overflow-hidden text-ellipsis` on the value. If the value is too long, it gets ellipsized. Also ensure the label text doesn't wrap awkwardly.

### 9.4 Table Double-Scroll Fix

- **Current code**:
  ```tsx
  <div ref={scrollContainerRef} className='min-h-full overflow-auto'>
  ```
- **Fix**: 
  ```tsx
  <div ref={scrollContainerRef} className='overflow-x-auto'>
  ```
- Remove `min-h-full` (which forces the div to be at least full parent height) and remove `overflow-y-auto` (which creates inner vertical scroll). Keep `overflow-x-auto` for horizontal scroll on wide tables.
- Remove or repurpose `scrollContainerRef` if it was only being used for scroll management (check usages).
- **Risk**: If `scrollContainerRef` is referenced elsewhere (e.g., scroll-to-top logic), deprecate carefully.

### 9.5 Reports Tab Enhancement — 7 Sections

Each section follows a consistent pattern:

```
<section>
  <h3>Section Title</h3>
  {loading ? <Skeleton /> : data.length > 0 ? <Chart /> : <EmptyState />}
</section>
```

#### Section 1: Revenue vs Expense Trend
- **Chart type**: recharts LineChart with two Line series
- **Series 1**: Revenue (green, `#4ade80`)
- **Series 2**: Expenses (red, `#ef4444`)
- **X-axis**: Time period (day/week/month depending on range)
- **Y-axis**: Currency amount
- **Granularity logic**: Same as BusinessInsights (`daysDiff > 90 ? "month" : daysDiff > 31 ? "week" : "day"`)

#### Section 2: Net Income/Loss Trend
- **Chart type**: recharts LineChart with one Line series
- **Series**: Net income (green for positive, red for negative via gradient or conditional dot fill)
- **X-axis**: Time period
- **Y-axis**: Currency amount
- **Color logic**: `stroke="#10b981"` for positive, `stroke="#ef4444"` for negative at each point; or use a single color with area fill

#### Section 3: Expense Breakdown by Category
- **Chart type**: recharts BarChart (horizontal for readability)
- **X-axis**: Category name
- **Y-axis**: Amount
- **Color**: Red variants or single theme color
- **Sort**: Descending by amount

#### Section 4: Revenue vs Expense Comparison
- **Chart type**: recharts grouped BarChart
- **Groups**: Each time period has one bar for Revenue and one for Expense
- **Colors**: Green for revenue, red for expenses
- **X-axis**: Time period

#### Section 5: Account Type Distribution
- **Chart type**: recharts PieChart
- **Slices**: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
- **Colors**: Use existing `ENTRY_TYPE_COLORS` mapping
- **Value**: Total balance (credit - debit for liability/equity/revenue, debit - credit for asset/expense)
- **Legend**: Show type name + percentage

#### Section 6: Cash Flow Summary
- **Component**: `CashFlowSummary` (3 metric cards)
- **Card 1**: Total Inflow (green, credit side)
- **Card 2**: Total Outflow (red, debit side)
- **Card 3**: Net Cash Flow (green if positive, red if negative)
- **Format**: Currency with 2 decimal places

#### Section 7: Period Projection
- **Chart type**: recharts LineChart with two line segments
- **Historical segment**: Solid line (actual data)
- **Projected segment**: Dashed line (`strokeDasharray`) 
- **Algorithm**: Simple linear regression
  - Requires minimum 3 data points
  - Extrapolate next 3-6 periods (matching current granularity)
  - Clamp projected values at 0 (no negative revenue/expense)
- **Fallback**: If < 3 data points, show message "Insufficient data for projection"

### 9.6 Reports Tab Layout

The Reports tab should follow a vertical layout:
```
[Section 1: Revenue vs Expense Trend]       ← full width
[Section 2: Net Income/Loss Trend]          ← full width
[Section 3: Expense Breakdown]   [Section 5: Account Type Distribution]  ← side by side
[Section 4: Revenue vs Expense Comparison]   ← full width
[Section 6: Cash Flow Summary]              ← 3 cards row (grid grid-cols-3 gap-4)
[Section 7: Period Projection]              ← full width
[Existing Trial Balance]                   ← full width (below all new sections)
```

All sections use `bg-white/5 border border-white/10 rounded-lg p-4` for consistent card styling.

---

## 10. Open Questions

None. All requirements have been clarified with the user:

| Question | Resolution |
|----------|------------|
| Reports enhancement scope | All 7 sections (trends, breakdown, comparison, distribution, cash flow, projection) |
| Flag type | Per-user access flag (`accounting_analytics_view`) |
| E2E testing | Skip (user declined) |
| TrialBalance gating | Keep TrialBalance accessible to all with `accounting_access` (not gated by new flag) |
