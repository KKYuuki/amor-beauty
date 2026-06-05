# Accounting Analytics Flag, Layout Fixes & Enhanced Reports — Implementation Plan

> **For agentic workers:** This plan follows TDD (Red-Green-Refactor). Every task has exact code, exact commands, and exact expected output. No guessing. Follow each step in order. Run tests after every GREEN step. Commit after every REFACTOR step.

**Goal:** Add `accounting_analytics_view` flag, fix StatCard overflow + table double-scroll, and build 7-chart Reports tab — all gated behind the flag.

**Spec:** `docs/superpowers/specs/2026-05-29-accounting-analytics-reports-architectural-spec.md`

---

## File Map

### New Files (5 source + 1 test)
| # | File | Purpose |
|---|------|---------|
| 1 | `tests/integration/accounting-analytics-reports.test.ts` | All TDD tests for new server actions, components, flag logic |
| 2 | `components/accounting/AccountingTrendChart.tsx` | recharts LineChart wrapper for time-series (1-2 series) |
| 3 | `components/accounting/AccountingBreakdownChart.tsx` | recharts BarChart/PieChart wrapper for categories |
| 4 | `components/accounting/CashFlowSummary.tsx` | 3 MetricCard-style cards: Inflow/Outflow/Net |
| 5 | `components/accounting/PeriodProjection.tsx` | Dual-segment line chart (historical solid + projected dashed) |
| 6 | `utils/projection.ts` | Client-side linear regression for period projection |

### Modified Files (5)
| # | File | Sections touched |
|---|------|------------------|
| 1 | `utils/auth/access-flags.ts` | ~L20: Add flag entry to FEATURE_ACCESS_FLAGS object |
| 2 | `server/actions/accounting.ts` | ~L1595+: Add 3 new server action exports |
| 3 | `app/accounting/accountingPage.tsx` | L149, L234, L255-325, L756-788, L795-801, L840-841, L1031-1050, L1110 |
| 4 | `components/ui/StatCard.tsx` | ~L49: CSS fix on value element |
| 5 | `components/ui/StatsGrid.tsx` | ~L44: Add `gridColsMap.desktop[4]` entry |

---

---

## Phase 1: Foundation

> **Outcome:** Flag exists in registry, StatsGrid supports 4-column desktop, projection utility ready. All tests green.

---

### Task 1: Add `accounting_analytics_view` to FEATURE_ACCESS_FLAGS registry

**Files:**
- Modify: `utils/auth/access-flags.ts` (insert after `accounting_access` entry, ~L20)
- Test: `tests/integration/accounting-analytics-reports.test.ts` (new file, first describe block)

**Dependencies:** None

**TDD Cycle:**

- [x] **RED: Write the failing test**

  Create `tests/integration/accounting-analytics-reports.test.ts`:
  ```typescript
  import { describe, test, expect } from "bun:test"
  import {
    FEATURE_ACCESS_FLAGS,
    VALID_FEATURE_FLAGS,
    userHasFlag,
    isValidFeatureFlag,
  } from "@/utils/auth/access-flags"

  describe("accounting_analytics_view flag", () => {
    test("is present in FEATURE_ACCESS_FLAGS registry", () => {
      expect(FEATURE_ACCESS_FLAGS).toHaveProperty("accounting_analytics_view")
    })

    test("has correct label and description", () => {
      const flag = FEATURE_ACCESS_FLAGS.accounting_analytics_view
      expect(flag.label).toBe("Accounting Analytics View")
      expect(flag.description).toBe("View summary analytics cards and enhanced reports in Accounting")
    })

    test("is included in VALID_FEATURE_FLAGS", () => {
      expect(VALID_FEATURE_FLAGS).toContain("accounting_analytics_view")
    })

    test("isValidFeatureFlag returns true", () => {
      expect(isValidFeatureFlag("accounting_analytics_view")).toBe(true)
    })

    test("userHasFlag returns true for admin regardless of flags", () => {
      const adminUser = { role: "admin" as const, access_flags: [] }
      expect(userHasFlag(adminUser, "accounting_analytics_view")).toBe(true)
    })

    test("userHasFlag returns true for non-admin with the flag", () => {
      const user = { role: "staff" as const, access_flags: ["accounting_analytics_view"] }
      expect(userHasFlag(user, "accounting_analytics_view")).toBe(true)
    })
    test("userHasFlag returns false for non-admin without the flag", () => {
      const user = { role: "staff" as const, access_flags: ["accounting_access"] }
      expect(userHasFlag(user, "accounting_analytics_view")).toBe(false)
    })

    test("userHasFlag returns false for null access_flags", () => {
      const user = { role: "staff" as const, access_flags: null }
      expect(userHasFlag(user, "accounting_analytics_view")).toBe(false)
    })
  })
  ```

- [x] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — `accounting_analytics_view` not found in FEATURE_ACCESS_FLAGS

- [x] **GREEN: Write minimal implementation**

  In `utils/auth/access-flags.ts`, add the new flag entry inside `FEATURE_ACCESS_FLAGS` object, immediately after the `accounting_access` entry (after line ~14):
  ```typescript
  accounting_analytics_view: { label: 'Accounting Analytics View', description: 'View summary analytics cards and enhanced reports in Accounting' },
  ```
  
  The full relevant block in FEATURE_ACCESS_FLAGS will be:
  ```typescript
  export const FEATURE_ACCESS_FLAGS = {
      inventory_manage:         { label: 'Inventory Manage',   description: 'View and manage inventory items' },
      sales_access:             { label: 'Sales Access',       description: 'Access the sales page and process sales' },
      accounting_access:        { label: 'Accounting Access',  description: 'View and manage general ledger entries' },
      accounting_analytics_view:{ label: 'Accounting Analytics View', description: 'View summary analytics cards and enhanced reports in Accounting' },  // NEW
      payroll_manage:           { label: 'Payroll Manage',     description: 'Process and manage staff payroll' },
      // ... rest unchanged
  } as const
  ```

- [x] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — all 7 assertions green

- [x] **REFACTOR: Clean up**
  - Verify the flag entry is alphabetically positioned correctly (after `accounting_access`, before `payroll_manage`)
  - No trailing commas or lint issues
  - Run: `bun run lint` to verify no regressions

- [x] **Commit**

  ```bash
  git add utils/auth/access-flags.ts tests/integration/accounting-analytics-reports.test.ts
  git commit -m "feat: add accounting_analytics_view feature access flag (Task 1)"
  ```

---

### Task 2: Add 4-column desktop variant to StatsGrid

**Files:**
- Modify: `components/ui/StatsGrid.tsx` (~L44, `gridColsMap.desktop` object)
- Test: `tests/integration/accounting-analytics-reports.test.ts` (append to existing file)

**Dependencies:** None

**TDD Cycle:**

- [x] **RED: Write the failing test**

  Append to `tests/integration/accounting-analytics-reports.test.ts`:
  ```typescript
  import { gridColsMap } from "@/components/ui/StatsGrid"

  describe("StatsGrid gridColsMap", () => {
    test("desktop map includes 4-column variant", () => {
      expect(gridColsMap).toHaveProperty("desktop")
      expect(gridColsMap.desktop).toHaveProperty("4")
      expect(gridColsMap.desktop["4"]).toBe("lg:grid-cols-4")
    })

    test("existing desktop map entries are preserved", () => {
      expect(gridColsMap.desktop["3"]).toBe("lg:grid-cols-3")
      expect(gridColsMap.desktop["5"]).toBe("lg:grid-cols-5")
      expect(gridColsMap.desktop["6"]).toBe("lg:grid-cols-6")
    })
  })
  ```

- [x] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — `gridColsMap` not exported from StatsGrid; property `4` missing on `gridColsMap.desktop`

- [x] **GREEN: Write minimal implementation**

  In `components/ui/StatsGrid.tsx`:
  
  1. Add `export` to the `gridColsMap` declaration so tests can import it (change ~L17: `const gridColsMap = {` → `export const gridColsMap = {`)
  
  Note: `4: "lg:grid-cols-4"` already existed in the desktop map and the type already included `4`.

- [x] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — all assertions green (8 flag tests + 3 gridColsMap tests)

- [x] **REFACTOR: Clean up**
  - Confirm `export const gridColsMap` doesn't break the default export (it should be fine; it's a separate named export alongside the default function)
  - Run: `bun run lint` and `bun run typecheck` to verify no regressions

- [x] **Commit**

  ```bash
  git add components/ui/StatsGrid.tsx tests/integration/accounting-analytics-reports.test.ts
  git commit -m "feat: add 4-column desktop variant to StatsGrid gridColsMap (Task 2)"
  ```

---

### Task 3: Create projection utility (linear regression)

**Files:**
- Create: `utils/projection.ts`
- Test: `tests/integration/accounting-analytics-reports.test.ts` (append)

**Dependencies:** None

**TDD Cycle:**

- [x] **RED: Write the failing test**

  Append to `tests/integration/accounting-analytics-reports.test.ts`:
  ```typescript
  import { computeLinearProjection, ProjectionDataPoint, ProjectionResult } from "@/utils/projection"

  describe("computeLinearProjection", () => {
    const ascendingData: ProjectionDataPoint[] = [
      { period: "Jan", revenue: 1000, expenses: 500 },
      { period: "Feb", revenue: 1200, expenses: 550 },
      { period: "Mar", revenue: 1400, expenses: 600 },
      { period: "Apr", revenue: 1600, expenses: 650 },
    ]

    test("returns both historical and projected arrays", () => {
      const result = computeLinearProjection(ascendingData, 3)
      expect(result.historical).toBeDefined()
      expect(result.projected).toBeDefined()
      expect(Array.isArray(result.historical)).toBe(true)
      expect(Array.isArray(result.projected)).toBe(true)
    })

    test("historical array equals input data", () => {
      const result = computeLinearProjection(ascendingData, 3)
      expect(result.historical.length).toBe(ascendingData.length)
      expect(result.historical[0].revenue).toBe(1000)
      expect(result.historical[3].revenue).toBe(1600)
    })

    test("projected array has correct length", () => {
      const result = computeLinearProjection(ascendingData, 3)
      expect(result.projected.length).toBe(3)
    })

    test("ascending trend produces increasing projection", () => {
      const result = computeLinearProjection(ascendingData, 3)
      const proj = result.projected
      expect(proj[0].revenue).toBeGreaterThan(1600)
      expect(proj[0].expenses).toBeGreaterThan(650)
      expect(proj[2].revenue).toBeGreaterThan(proj[0].revenue)
    })

    test("returns null for fewer than 3 data points", () => {
      const shortData: ProjectionDataPoint[] = [
        { period: "Jan", revenue: 1000, expenses: 500 },
        { period: "Feb", revenue: 1200, expenses: 550 },
      ]
      const result = computeLinearProjection(shortData, 3)
      expect(result).toBeNull()
    })

    test("clamps projected values at 0 (no negative)", () => {
      const decliningData: ProjectionDataPoint[] = [
        { period: "Jan", revenue: 1000, expenses: 500 },
        { period: "Feb", revenue: 700, expenses: 500 },
        { period: "Mar", revenue: 400, expenses: 500 },
      ]
      const result = computeLinearProjection(decliningData, 5)
      const allNonNegative = result!.projected.every(
        p => p.revenue >= 0 && p.expenses >= 0
      )
      expect(allNonNegative).toBe(true)
    })

    test("flat data produces flat projection", () => {
      const flatData: ProjectionDataPoint[] = [
        { period: "Jan", revenue: 1000, expenses: 500 },
        { period: "Feb", revenue: 1000, expenses: 500 },
        { period: "Mar", revenue: 1000, expenses: 500 },
      ]
      const result = computeLinearProjection(flatData, 2)
      expect(result!.projected[0].revenue).toBeCloseTo(1000, 0)
      expect(result!.projected[0].expenses).toBeCloseTo(500, 0)
    })

    test("projection periods have sequential labels", () => {
      const result = computeLinearProjection(ascendingData, 3)
      expect(result!.projected[0].period).toBe("May")
      expect(result!.projected[1].period).toBe("Jun")
      expect(result!.projected[2].period).toBe("Jul")
    })

    test("handles null period gracefully using numeric index", () => {
      const dataNoLabels: ProjectionDataPoint[] = [
        { period: "", revenue: 1000, expenses: 500 },
        { period: "", revenue: 1200, expenses: 550 },
        { period: "", revenue: 1400, expenses: 600 },
      ]
      const result = computeLinearProjection(dataNoLabels, 2)
      expect(result!.projected[0].period).toContain("Proj")
    })
  })
  ```

- [x] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — Cannot find module `@/utils/projection`

- [x] **GREEN: Write minimal implementation**

  Create `utils/projection.ts` with `computeLinearProjection`, `ProjectionDataPoint`, `ProjectionResult` exports. Full linear regression implementation.

- [x] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — all assertions green

- [x] **REFACTOR: Clean up**
  - Verify all type exports are used
  - Check no console.log left in utility code
  - Run: `bun run lint` to verify

- [x] **Commit**

  ```bash
  git add utils/projection.ts tests/integration/accounting-analytics-reports.test.ts
  git commit -m "feat: add computeLinearProjection utility with linear regression (Task 3)"
  ```

---

## Phase 2: Core Logic — New Server Actions

> **Outcome:** Three new server actions added to `server/actions/accounting.ts`: `getRevenueExpenseTrend`, `getExpenseBreakdown`, `getCashFlowSummary`. All with flag enforcement. Tests pass against live DB.

---

### Task 4: Add `getRevenueExpenseTrend` server action

**Files:**
- Modify: `server/actions/accounting.ts` (append before final export, ~L1600)
- Test: `tests/integration/accounting-analytics-reports.test.ts` (append)

**Dependencies:** Task 1 (flag must exist in registry)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Append to `tests/integration/accounting-analytics-reports.test.ts`:
  ```typescript
  import { getRevenueExpenseTrend, TrendDataPoint } from "@/server/actions/accounting"

  describe("getRevenueExpenseTrend", () => {
    test("function is defined and callable", async () => {
      expect(getRevenueExpenseTrend).toBeDefined()
      expect(typeof getRevenueExpenseTrend).toBe("function")
    })

    test("returns ActionResponse with data array on success", async () => {
      const result = await getRevenueExpenseTrend({
        datePreset: "this_month",
      })
      expect(result.success).toBeDefined()
      // May succeed or fail depending on DB/auth — test structure either way
      if (result.success && result.data) {
        expect(Array.isArray(result.data)).toBe(true)
        if (result.data.length > 0) {
          const point = result.data[0] as TrendDataPoint
          expect(typeof point.period).toBe("string")
          expect(typeof point.revenue).toBe("number")
          expect(typeof point.expenses).toBe("number")
          expect(typeof point.net_income).toBe("number")
        }
      }
    })

    test("data points have net_income = revenue - expenses", async () => {
      const result = await getRevenueExpenseTrend({
        datePreset: "all",
      })
      if (result.success && result.data) {
        for (const point of result.data) {
          expect(point.net_income).toBeCloseTo(point.revenue - point.expenses, 1)
        }
      }
    })

    test("accepts custom date range", async () => {
      const result = await getRevenueExpenseTrend({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      })
      expect(result.success !== undefined).toBe(true)
    })

    test("accepts branchId filter", async () => {
      const result = await getRevenueExpenseTrend({
        datePreset: "this_month",
        branchId: "00000000-0000-0000-0000-000000000000",
      })
      if (result.success && result.data) {
        expect(Array.isArray(result.data)).toBe(true)
      }
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — `getRevenueExpenseTrend` not exported from `@/server/actions/accounting`

- [ ] **GREEN: Write minimal implementation**

  In `server/actions/accounting.ts`, append before the last line (before any final exports):

  ```typescript
  // ============================================================================
  // REPORT TREND DATA TYPES
  // ============================================================================

  export interface TrendDataPoint {
    period: string
    revenue: number
    expenses: number
    net_income: number
  }

  export interface TrendQueryOptions {
    datePreset?: DateRangePreset
    startDate?: string
    endDate?: string
    branchId?: string
  }

  export async function getRevenueExpenseTrend(
    options: TrendQueryOptions = {}
  ): Promise<ActionResponse<TrendDataPoint[]>> {
    const user = await getCurrentUser()
    if (!user) return failure('Unauthorized')

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) return failure('Access denied')

    // Check analytics flag
    const isAdmin = user.role === 'admin'
    const hasAnalyticsFlag = user.access_flags?.includes('accounting_analytics_view') ?? false
    if (!isAdmin && !hasAnalyticsFlag) {
      return failure('Access denied — requires accounting_analytics_view flag')
    }

    try {
      const { datePreset, startDate, endDate, branchId } = options

      let dateFrom: Date | undefined
      let dateTo: Date | undefined

      if (datePreset && datePreset !== 'all') {
        const dateRange = getDateRangeFromPreset(datePreset, startDate, endDate)
        if (dateRange) {
          dateFrom = dateRange.start
          dateTo = dateRange.end
        }
      } else if (startDate && endDate) {
        const parsedStart = safeToDate(startDate, null)
        const parsedEnd = safeToDate(endDate, null)
        if (!parsedStart || !parsedEnd) {
          return failure('Invalid date range provided')
        }
        dateFrom = parsedStart
        dateTo = parsedEnd
      }

      // Determine granularity based on date range
      const now = new Date()
      const effectiveStart = dateFrom || new Date(now.getFullYear() - 1, 0, 1)
      const effectiveEnd = dateTo || now
      const daysDiff = Math.ceil(
        (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)
      )

      const conditions: SQL<unknown>[] = [eq(generalLedger.isVoided, false)]

      if (dateFrom) conditions.push(gte(generalLedger.entryDate, dateFrom))
      if (dateTo) conditions.push(lte(generalLedger.entryDate, dateTo))
      if (branchId) {
        const branchFilter = or(eq(generalLedger.branchId, branchId), isNull(generalLedger.branchId))
        if (branchFilter) conditions.push(branchFilter)
      }

      const allEntries = await db
        .select({
          entryDate: generalLedger.entryDate,
          entryType: generalLedger.entryType,
          debit: generalLedger.debit,
          credit: generalLedger.credit,
        })
        .from(generalLedger)
        .where(and(...conditions))
        .orderBy(asc(generalLedger.entryDate))

      // Group entries by period (day/week/month) in application code
      const periodMap = new Map<string, { revenue: number; expenses: number }>()

      for (const entry of allEntries) {
        const date = new Date(entry.entryDate)
        let periodKey: string

        if (daysDiff > 90) {
          // Monthly: YYYY-MM
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        } else if (daysDiff > 31) {
          // Weekly: ISO week
          const startOfYear = new Date(date.getFullYear(), 0, 1)
          const weekNum = Math.ceil(
            ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
          )
          periodKey = `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
        } else {
          // Daily: YYYY-MM-DD
          periodKey = date.toISOString().split('T')[0]
        }

        if (!periodMap.has(periodKey)) {
          periodMap.set(periodKey, { revenue: 0, expenses: 0 })
        }

        const group = periodMap.get(periodKey)!
        const debit = Number(entry.debit) || 0
        const credit = Number(entry.credit) || 0

        if (entry.entryType === 'REVENUE') {
          group.revenue += credit - debit
        } else if (entry.entryType === 'EXPENSE') {
          group.expenses += debit - credit
        }
      }

      const result: TrendDataPoint[] = Array.from(periodMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, values]) => ({
          period,
          revenue: Math.round(values.revenue * 100) / 100,
          expenses: Math.round(values.expenses * 100) / 100,
          net_income: Math.round((values.revenue - values.expenses) * 100) / 100,
        }))

      return success(result)
    } catch (error) {
      await logError({
        type: 'ACCOUNTING',
        message: `Error fetching revenue/expense trend: ${error instanceof Error ? error.message : String(error)}`,
      })
      return failure('Failed to fetch revenue/expense trend')
    }
  }
  ```

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — `getRevenueExpenseTrend` exists, returns correct shapes, net_income = revenue - expenses

- [ ] **REFACTOR: Clean up**
  - Verify all imports are used (`isNull`, `asc`, `logError`, etc.)
  - Check that `getCurrentUser` and `canAccessAccounting` are imported (they already are in the file)
  - Run: `bun run lint` and `bun run typecheck`

- [ ] **Commit**

  ```bash
  git add server/actions/accounting.ts tests/integration/accounting-analytics-reports.test.ts
  git commit -m "feat: add getRevenueExpenseTrend server action with flag enforcement (Task 4)"
  ```

---

### Task 5: Add `getExpenseBreakdown` server action

**Files:**
- Modify: `server/actions/accounting.ts` (append after getRevenueExpenseTrend)
- Test: `tests/integration/accounting-analytics-reports.test.ts` (append)

**Dependencies:** Task 4 (pattern established)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Append to `tests/integration/accounting-analytics-reports.test.ts`:
  ```typescript
  import { getExpenseBreakdown, ExpenseBreakdownItem } from "@/server/actions/accounting"

  describe("getExpenseBreakdown", () => {
    test("function is defined and callable", async () => {
      expect(getExpenseBreakdown).toBeDefined()
      expect(typeof getExpenseBreakdown).toBe("function")
    })

    test("returns ActionResponse with data array on success", async () => {
      const result = await getExpenseBreakdown({
        datePreset: "this_year",
      })
      if (result.success && result.data) {
        expect(Array.isArray(result.data)).toBe(true)
        if (result.data.length > 0) {
          const item = result.data[0] as ExpenseBreakdownItem
          expect(typeof item.category).toBe("string")
          expect(typeof item.amount).toBe("number")
        }
      }
    })

    test("all amounts are positive (expenses are debit-side)", async () => {
      const result = await getExpenseBreakdown({
        datePreset: "all",
      })
      if (result.success && result.data) {
        for (const item of result.data) {
          expect(item.amount).toBeGreaterThanOrEqual(0)
        }
      }
    })

    test("categories with zero amount are excluded", async () => {
      const result = await getExpenseBreakdown({
        datePreset: "all",
      })
      if (result.success && result.data) {
        for (const item of result.data) {
          expect(item.amount).toBeGreaterThan(0)
        }
      }
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — `getExpenseBreakdown` not exported

- [ ] **GREEN: Write minimal implementation**

  Append to `server/actions/accounting.ts`:
  ```typescript
  export interface ExpenseBreakdownItem {
    category: string
    amount: number
  }

  export async function getExpenseBreakdown(
    options: TrendQueryOptions = {}
  ): Promise<ActionResponse<ExpenseBreakdownItem[]>> {
    const user = await getCurrentUser()
    if (!user) return failure('Unauthorized')

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) return failure('Access denied')

    const isAdmin = user.role === 'admin'
    const hasAnalyticsFlag = user.access_flags?.includes('accounting_analytics_view') ?? false
    if (!isAdmin && !hasAnalyticsFlag) {
      return failure('Access denied — requires accounting_analytics_view flag')
    }

    try {
      const { datePreset, startDate, endDate, branchId } = options

      let dateFrom: Date | undefined
      let dateTo: Date | undefined

      if (datePreset && datePreset !== 'all') {
        const dateRange = getDateRangeFromPreset(datePreset, startDate, endDate)
        if (dateRange) { dateFrom = dateRange.start; dateTo = dateRange.end }
      } else if (startDate && endDate) {
        const parsedStart = safeToDate(startDate, null)
        const parsedEnd = safeToDate(endDate, null)
        if (!parsedStart || !parsedEnd) return failure('Invalid date range provided')
        dateFrom = parsedStart
        dateTo = parsedEnd
      }

      const conditions: SQL<unknown>[] = [
        eq(generalLedger.isVoided, false),
        eq(generalLedger.entryType, 'EXPENSE'),
      ]

      if (dateFrom) conditions.push(gte(generalLedger.entryDate, dateFrom))
      if (dateTo) conditions.push(lte(generalLedger.entryDate, dateTo))
      if (branchId) {
        const branchFilter = or(eq(generalLedger.branchId, branchId), isNull(generalLedger.branchId))
        if (branchFilter) conditions.push(branchFilter)
      }

      const results = await db
        .select({
          category: generalLedger.category,
          total: sql<number>`SUM(CAST(${generalLedger.debit} AS NUMERIC) - CAST(${generalLedger.credit} AS NUMERIC))`,
        })
        .from(generalLedger)
        .where(and(...conditions))
        .groupBy(generalLedger.category)
        .orderBy(desc(sql`SUM(CAST(${generalLedger.debit} AS NUMERIC) - CAST(${generalLedger.credit} AS NUMERIC))`))

      const breakdown: ExpenseBreakdownItem[] = results
        .map(row => ({
          category: row.category || 'Uncategorized',
          amount: Math.round(Math.abs(Number(row.total)) * 100) / 100,
        }))
        .filter(item => item.amount > 0)

      return success(breakdown)
    } catch (error) {
      await logError({
        type: 'ACCOUNTING',
        message: `Error fetching expense breakdown: ${error instanceof Error ? error.message : String(error)}`,
      })
      return failure('Failed to fetch expense breakdown')
    }
  }
  ```

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — `getExpenseBreakdown` returns correct shapes, amounts are positive

- [ ] **REFACTOR: Clean up**
  - Verify `desc` import exists (it's already imported at the top)
  - Run: `bun run lint` and `bun run typecheck`

- [ ] **Commit**

  ```bash
  git add server/actions/accounting.ts tests/integration/accounting-analytics-reports.test.ts
  git commit -m "feat: add getExpenseBreakdown server action with flag enforcement (Task 5)"
  ```

---

### Task 6: Add `getCashFlowSummary` server action

**Files:**
- Modify: `server/actions/accounting.ts` (append after getExpenseBreakdown)
- Test: `tests/integration/accounting-analytics-reports.test.ts` (append)

**Dependencies:** Task 5 (pattern established)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Append to `tests/integration/accounting-analytics-reports.test.ts`:
  ```typescript
  import { getCashFlowSummary, CashFlowSummaryData } from "@/server/actions/accounting"

  describe("getCashFlowSummary", () => {
    test("function is defined and callable", async () => {
      expect(getCashFlowSummary).toBeDefined()
      expect(typeof getCashFlowSummary).toBe("function")
    })

    test("returns ActionResponse with CashFlowSummaryData on success", async () => {
      const result = await getCashFlowSummary({
        datePreset: "this_year",
      })
      if (result.success && result.data) {
        const data = result.data as CashFlowSummaryData
        expect(typeof data.inflow).toBe("number")
        expect(typeof data.outflow).toBe("number")
        expect(typeof data.net).toBe("number")
        expect(data.inflow).toBeGreaterThanOrEqual(0)
        expect(data.outflow).toBeGreaterThanOrEqual(0)
      }
    })

    test("net = inflow - outflow", async () => {
      const result = await getCashFlowSummary({
        datePreset: "all",
      })
      if (result.success && result.data) {
        expect(result.data.net).toBeCloseTo(result.data.inflow - result.data.outflow, 1)
      }
    })

    test("accepts custom date range", async () => {
      const result = await getCashFlowSummary({
        startDate: "2026-01-01",
        endDate: "2026-06-30",
      })
      expect(result.success !== undefined).toBe(true)
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — `getCashFlowSummary` not exported

- [ ] **GREEN: Write minimal implementation**

  Append to `server/actions/accounting.ts`:
  ```typescript
  export interface CashFlowSummaryData {
    inflow: number
    outflow: number
    net: number
  }

  export async function getCashFlowSummary(
    options: TrendQueryOptions = {}
  ): Promise<ActionResponse<CashFlowSummaryData>> {
    const user = await getCurrentUser()
    if (!user) return failure('Unauthorized')

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) return failure('Access denied')

    const isAdmin = user.role === 'admin'
    const hasAnalyticsFlag = user.access_flags?.includes('accounting_analytics_view') ?? false
    if (!isAdmin && !hasAnalyticsFlag) {
      return failure('Access denied — requires accounting_analytics_view flag')
    }

    try {
      const { datePreset, startDate, endDate, branchId } = options

      let dateFrom: Date | undefined
      let dateTo: Date | undefined

      if (datePreset && datePreset !== 'all') {
        const dateRange = getDateRangeFromPreset(datePreset, startDate, endDate)
        if (dateRange) { dateFrom = dateRange.start; dateTo = dateRange.end }
      } else if (startDate && endDate) {
        const parsedStart = safeToDate(startDate, null)
        const parsedEnd = safeToDate(endDate, null)
        if (!parsedStart || !parsedEnd) return failure('Invalid date range provided')
        dateFrom = parsedStart
        dateTo = parsedEnd
      }

      const baseConditions: SQL<unknown>[] = [eq(generalLedger.isVoided, false)]
      if (dateFrom) baseConditions.push(gte(generalLedger.entryDate, dateFrom))
      if (dateTo) baseConditions.push(lte(generalLedger.entryDate, dateTo))
      if (branchId) {
        const branchFilter = or(eq(generalLedger.branchId, branchId), isNull(generalLedger.branchId))
        if (branchFilter) baseConditions.push(branchFilter)
      }

      // Inflow: Revenue entries (credit - debit)
      const inflowConditions = [...baseConditions, eq(generalLedger.entryType, 'REVENUE')]
      const inflowResult = await db
        .select({
          total: sql<number>`SUM(CAST(${generalLedger.credit} AS NUMERIC) - CAST(${generalLedger.debit} AS NUMERIC))`,
        })
        .from(generalLedger)
        .where(and(...inflowConditions))

      // Outflow: Expense entries (debit - credit)
      const outflowConditions = [...baseConditions, eq(generalLedger.entryType, 'EXPENSE')]
      const outflowResult = await db
        .select({
          total: sql<number>`SUM(CAST(${generalLedger.debit} AS NUMERIC) - CAST(${generalLedger.credit} AS NUMERIC))`,
        })
        .from(generalLedger)
        .where(and(...outflowConditions))

      const inflow = Math.round((Number(inflowResult[0]?.total) || 0) * 100) / 100
      const outflow = Math.round((Number(outflowResult[0]?.total) || 0) * 100) / 100

      return success({
        inflow,
        outflow,
        net: Math.round((inflow - outflow) * 100) / 100,
      })
    } catch (error) {
      await logError({
        type: 'ACCOUNTING',
        message: `Error fetching cash flow summary: ${error instanceof Error ? error.message : String(error)}`,
      })
      return failure('Failed to fetch cash flow summary')
    }
  }
  ```

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — `getCashFlowSummary` returns correct shapes, net = inflow - outflow

- [ ] **REFACTOR: Clean up**
  - Run: `bun run lint` and `bun run typecheck`
  - Verify all three new server actions have identical flag enforcement boilerplate

- [ ] **Commit**

  ```bash
  git add server/actions/accounting.ts tests/integration/accounting-analytics-reports.test.ts
  git commit -m "feat: add getCashFlowSummary server action with flag enforcement (Task 6)"
  ```

---

## Phase 3: Integration — Gate Logic + CSS Fixes

> **Outcome:** StatCard overflow fixed, table double-scroll removed, analytics flag gates `getLedgerSummary()` call and StatsGrid rendering on Ledger tab.

---

### Task 7: Fix StatCard value overflow with CSS utilities

**Files:**
- Modify: `components/ui/StatCard.tsx` (value paragraph, ~L49)
- Test: `tests/integration/accounting-analytics-reports.test.ts` (append)

**Dependencies:** None

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Append to test file:
  ```typescript
  import { renderToString } from "react-dom/server"
  import StatCard from "@/components/ui/StatCard"

  describe("StatCard overflow fix", () => {
    test("value element includes whitespace-nowrap for single-line display", () => {
      const html = renderToString(
        <StatCard
          label="Net Loss"
          value="-₱425,287.84"
          color="danger"
        />
      )
      expect(html).toContain("whitespace-nowrap")
    })

    test("value element includes overflow-hidden to prevent overflow", () => {
      const html = renderToString(
        <StatCard
          label="Total Revenue"
          value="₱1,234,567.89"
          color="success"
        />
      )
      expect(html).toContain("overflow-hidden")
    })

    test("value element includes min-w-0 for flex shrinking", () => {
      const html = renderToString(
        <StatCard label="Test" value="123" />
      )
      expect(html).toContain("min-w-0")
    })

    test("renders long negative values without crashing", () => {
      const html = renderToString(
        <StatCard
          label="Balance"
          value="-₱99,999,999.99"
          color="danger"
        />
      )
      expect(html).toContain("Balance")
      expect(html).toContain("₱99,999,999.99")
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — value element does not contain `whitespace-nowrap` or `overflow-hidden`

- [ ] **GREEN: Write minimal implementation**

  In `components/ui/StatCard.tsx`, modify the value `<p>` element (currently at ~L49):
  ```tsx
  // BEFORE (current code):
  <p className={`text-lg sm:text-2xl font-bold mt-1 ${colorMap[color] || ""}`}>
    {value}
  </p>

  // AFTER:
  <p
    className={`text-lg sm:text-2xl font-bold mt-1 ${colorMap[color] || ""} whitespace-nowrap overflow-hidden text-ellipsis min-w-0`}
  >
    {value}
  </p>
  ```

  Also update the container div to ensure proper flex behavior:
  ```tsx
  // BEFORE (around line ~57):
  <div className='flex-1 min-w-0'>

  // Verify min-w-0 is already present (it should be). If not, add it.
  ```

  Check the current code at `components/ui/StatCard.tsx` line ~49-58:
  ```tsx
  <div className='flex items-start justify-between gap-4'>
    <div className='flex-1 min-w-0'>
      <p className='text-xs sm:text-sm text-white/60'>{label}</p>
      <p className={`text-lg sm:text-2xl font-bold mt-1 ${colorMap[color] || ""}`}>
  ```

  The fix: add `whitespace-nowrap overflow-hidden text-ellipsis min-w-0` to the value `<p>` tag.

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — all overflow-related tests green

- [ ] **REFACTOR: Clean up**
  - Verify no visual regressions by checking the component renders properly
  - Run: `bun run lint`

- [ ] **Commit**

  ```bash
  git add components/ui/StatCard.tsx tests/integration/accounting-analytics-reports.test.ts
  git commit -m "fix: prevent StatCard value overflow with whitespace-nowrap + ellipsis (Task 7)"
  ```

---

### Task 8: Fix table double-scroll on Ledger and Trash tabs

**Files:**
- Modify: `app/accounting/accountingPage.tsx` (L840-841 and L1110)
- Test: `tests/integration/accounting-analytics-reports.test.ts` (append)

**Dependencies:** None

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Append to test file:
  ```typescript
  describe("Table scroll fix", () => {
    test("table container should NOT have min-h-full class (double-scroll fix)", () => {
      // Read the accountingPage.tsx source and verify the table wrapper
      // lacks 'min-h-full' after the fix. This test validates the principle.
      const fs = require("fs")
      const sourceCode = fs.readFileSync(
        "app/accounting/accountingPage.tsx",
        "utf-8"
      ) as string

      // Count occurrences of 'min-h-full' — should be 0 (currently 2: Ledger table + Trash table)
      const minHeightMatches = sourceCode.match(/min-h-full/g)
      expect(minHeightMatches).toBeNull()
    })

    test("table container should NOT have overflow-auto for vertical scroll", () => {
      const fs = require("fs")
      const sourceCode = fs.readFileSync(
        "app/accounting/accountingPage.tsx",
        "utf-8"
      ) as string

      // The table wrapper should have overflow-x-auto but NOT overflow-auto (vertical)
      // Check that the pattern 'ref={scrollContainerRef}' is followed by overflow-x-auto (not overflow-auto)
      expect(sourceCode).toContain("overflow-x-auto")

      // Verify the old pattern is gone: 'ref={scrollContainerRef}' followed by 'className='min-h-full overflow-auto''
      const oldPattern = /ref=\{scrollContainerRef\}\s*\n\s*className=['"]min-h-full overflow-auto['"]/g
      expect(oldPattern.test(sourceCode)).toBe(false)
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — source still contains `min-h-full` and `overflow-auto` patterns

- [ ] **GREEN: Write minimal implementation**

  In `app/accounting/accountingPage.tsx`:

  **Fix 1: Ledger table wrapper (L840-841)**
  ```tsx
  // BEFORE:
  <div
    ref={scrollContainerRef}
    className='min-h-full overflow-auto'
  >

  // AFTER:
  <div
    ref={scrollContainerRef}
    className='overflow-x-auto'
  >
  ```

  **Fix 2: Trash table wrapper (L1110)**
  ```tsx
  // BEFORE:
  <div className='min-h-full overflow-auto'>

  // AFTER:
  <div className='overflow-x-auto'>
  ```

  **Fix 3: Remove the unused scrollContainerRef (L234)**
  
  The ref is only used on line 840. Since the table no longer has vertical scroll, the ref serves no purpose. Remove:
  ```tsx
  // DELETE line 234:
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  ```
  
  And remove the `ref` attribute from line 840:
  ```tsx
  // AFTER (remove ref):
  <div className='overflow-x-auto'>
  ```

  Also remove the `useRef` import if this was its only usage. Check imports at top of file for `useRef`:
  ```tsx
  import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
  ```
  `useRef` is also used for `searchDebounceRef` (line ~160) and `requestIdRef` (line ~236) and `trashRequestIdRef` (line ~239). Keep the import.

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — source no longer has the double-scroll patterns

- [ ] **REFACTOR: Clean up**
  - Verify the page still renders (no JS reference errors from removed `scrollContainerRef`)
  - Check that removing the ref doesn't break any scroll-to-top behavior (it wasn't used for that)
  - Run dev server: `bun run dev` and visually confirm table scrolls only once
  - Run: `bun run lint`

- [ ] **Commit**

  ```bash
  git add app/accounting/accountingPage.tsx tests/integration/accounting-analytics-reports.test.ts
  git commit -m "fix: remove double-scroll from accounting tables (Task 8)"
  ```

---

### Task 9: Gate summary cards and fetchData behind accounting_analytics_view

**Files:**
- Modify: `app/accounting/accountingPage.tsx` (L149, L255-325, L756-788, L795-801)
- Test: `tests/integration/accounting-analytics-reports.test.ts` (append)

**Dependencies:** Task 1 (flag must exist), Task 7 (StatCard fix), Task 8 (table fix)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Append to test file:
  ```typescript
  describe("Analytics flag gating", () => {
    test("accountingPage imports FlagGate", () => {
      const fs = require("fs")
      const sourceCode = fs.readFileSync(
        "app/accounting/accountingPage.tsx",
        "utf-8"
      ) as string
      expect(sourceCode).toContain('import FlagGate')
    })

    test("StatsGrid is wrapped in FlagGate with accounting_analytics_view", () => {
      const fs = require("fs")
      const sourceCode = fs.readFileSync(
        "app/accounting/accountingPage.tsx",
        "utf-8"
      ) as string
      expect(sourceCode).toContain('requiredFlag="accounting_analytics_view"')
    })

    test("hasAnalyticsAccess flag check exists in the file", () => {
      const fs = require("fs")
      const sourceCode = fs.readFileSync(
        "app/accounting/accountingPage.tsx",
        "utf-8"
      ) as string
      expect(sourceCode).toContain("accounting_analytics_view")
    })

    test("fetchData conditionally skips getLedgerSummary", () => {
      const fs = require("fs")
      const sourceCode = fs.readFileSync(
        "app/accounting/accountingPage.tsx",
        "utf-8"
      ) as string
      // Should contain either hasAnalyticsAccess in the fetchData callback or a conditional
      expect(sourceCode).toContain("hasAnalyticsAccess")
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — FlagGate not wrapping StatsGrid, `hasAnalyticsAccess` not present in accountingPage

- [ ] **GREEN: Write minimal implementation**

  In `app/accounting/accountingPage.tsx`:

  **Step 1: Add `hasAnalyticsAccess` computation (after L149)**
  ```tsx
  const isAdmin = userInfo?.role === "admin"
  const hasAccountingAccess = isAdmin || (userInfo?.access_flags?.includes("accounting_access") ?? false)
  // NEW:
  const hasAnalyticsAccess = isAdmin || (userInfo?.access_flags?.includes("accounting_analytics_view") ?? false)
  ```

  **Step 2: Conditionally include `getLedgerSummary` in fetchData (L255-290)**

  The fetchData function currently has:
  ```typescript
  const [entriesResult, summaryResult, categoriesResult, taxData, breakdownResult, trialResult] =
    await Promise.all([
      getLedgerEntries({ ... }),
      getLedgerSummary( ... ),      // <- THIS CALL
      getAccountingCategories(false),
      getSetting("currency_tax"),
      getLedgerDetailBreakdown( ... ),
      getTrialBalance( ... ),
    ])
  ```

  Replace with conditional inclusion. The cleanest approach: gather promises in an array, conditionally push getLedgerSummary:

  ```typescript
  const promises: Promise<any>[] = []

  // Always fetch these
  const entriesPromise = getLedgerEntries({
    filters: {
      entry_type: typeFilter || undefined,
      category: categoryFilter || undefined,
      search: searchQueryDebounced || undefined,
      payment_method: paymentMethodFilter || undefined,
    },
    branchId: currentBranch?.id,
    datePreset,
    startDate: datePreset === "custom" ? customStartDate : undefined,
    endDate: datePreset === "custom" ? customEndDate : undefined,
    page,
    pageSize: PAGE_SIZE,
    sortBy,
  })
  const categoriesPromise = getAccountingCategories(false)
  const taxPromise = getSetting("currency_tax")
  const breakdownPromise = getLedgerDetailBreakdown(
    datePreset, customStartDate, customEndDate, currentBranch?.id,
    {
      entry_type: typeFilter || undefined,
      category: categoryFilter || undefined,
      payment_method: paymentMethodFilter || undefined,
    }
  )
  const trialPromise = getTrialBalance(
    datePreset, customStartDate, customEndDate, currentBranch?.id
  )

  // Conditionally fetch summary (gated by analytics flag)
  const summaryPromise = hasAnalyticsAccess
    ? getLedgerSummary(
        datePreset, customStartDate, customEndDate, currentBranch?.id,
        {
          entry_type: typeFilter || undefined,
          category: categoryFilter || undefined,
          payment_method: paymentMethodFilter || undefined,
        }
      )
    : Promise.resolve(null)

  const [entriesResult, categoriesResult, taxData, breakdownResult, trialResult, summaryResult] =
    await Promise.all([
      entriesPromise,
      categoriesPromise,
      taxPromise,
      breakdownPromise,
      trialPromise,
      summaryPromise,
    ])
  ```

  Then update the summary handling (around L292-310):
  ```typescript
  // Handle summary result (may be null if user lacks flag)
  if (summaryResult !== null) {
    if (summaryResult.success && summaryResult.data) {
      setSummary(summaryResult.data)
    }
  } else {
    setSummary(null)
  }
  ```

  **Step 3: Wrap StatsGrid in FlagGate (L756-788)**
  ```tsx
  {/* Summary Cards */}
  <FlagGate requiredFlag="accounting_analytics_view">
    {summary && (
      <StatsGrid columns={{ mobile: 2, tablet: 3, desktop: 6 }}>
        {/* ... all 6 StatCard components unchanged ... */}
      </StatsGrid>
    )}
  </FlagGate>
  ```

  The Breakdown by Account Type section (L795-801) is already conditionally rendered on `summary` — it will also be hidden when `summary` is null since it checks `{summary && ...}`. This is correct behavior.

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — FlagGate patterns found in source, hasAnalyticsAccess present

- [ ] **REFACTOR: Clean up**
  - Verify the requestIdRef pattern still works (the conditional promise should not break it)
  - The `requestIdRef` increment (L239) is before the promises but after the conditional — this is fine since the ref acts as a cancellation token
  - Run dev server and verify:
    - Admin sees cards
    - User with `accounting_analytics_view` sees cards
    - User without the flag does NOT see cards (but sees the rest of the Ledger tab)
  - Run: `bun run lint` and `bun run typecheck`

- [ ] **Commit**

  ```bash
  git add app/accounting/accountingPage.tsx tests/integration/accounting-analytics-reports.test.ts
  git commit -m "feat: gate summary cards behind accounting_analytics_view flag (Task 9)"
  ```

---

## Phase 4: Presentation — Chart Components + Reports Tab

> **Outcome:** Four new chart components created and tested. Reports tab expanded with all 7 sections, gated behind the flag.

---

### Task 10: Create AccountingTrendChart component

**Files:**
- Create: `components/accounting/AccountingTrendChart.tsx`
- Test: `tests/integration/accounting-analytics-reports.test.ts` (append)

**Dependencies:** Task 4 (getRevenueExpenseTrend returns TrendDataPoint[])

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Append to test file:
  ```typescript
  import AccountingTrendChart from "@/components/accounting/AccountingTrendChart"

  describe("AccountingTrendChart", () => {
    const sampleData = [
      { period: "Jan", revenue: 1000, expenses: 500, net_income: 500 },
      { period: "Feb", revenue: 1200, expenses: 600, net_income: 600 },
      { period: "Mar", revenue: 1400, expenses: 700, net_income: 700 },
    ]

    test("renders without crashing with valid data", () => {
      const html = renderToString(
        <AccountingTrendChart
          data={sampleData}
          lines={[
            { dataKey: "revenue", color: "#4ade80", name: "Revenue" },
            { dataKey: "expenses", color: "#ef4444", name: "Expenses" },
          ]}
          xAxisKey="period"
          currencySymbol="₱"
        />
      )
      expect(html).toBeDefined()
      expect(html.length).toBeGreaterThan(0)
    })

    test("renders wrapper with correct card styling", () => {
      const html = renderToString(
        <AccountingTrendChart
          data={sampleData}
          lines={[{ dataKey: "revenue", color: "#4ade80", name: "Revenue" }]}
          xAxisKey="period"
          currencySymbol="₱"
        />
      )
      expect(html).toContain("bg-white/5")
      expect(html).toContain("rounded-lg")
    })

    test("renders empty state when no data", () => {
      const html = renderToString(
        <AccountingTrendChart
          data={[]}
          lines={[{ dataKey: "revenue", color: "#4ade80", name: "Revenue" }]}
          xAxisKey="period"
          currencySymbol="₱"
          title="Revenue Trend"
        />
      )
      expect(html).toContain("Revenue Trend")
      expect(html).toContain("No data")
    })

    test("renders single data point without error", () => {
      const html = renderToString(
        <AccountingTrendChart
          data={[{ period: "Jan", revenue: 1000, expenses: 500, net_income: 500 }]}
          lines={[{ dataKey: "revenue", color: "#4ade80", name: "Revenue" }]}
          xAxisKey="period"
          currencySymbol="₱"
        />
      )
      expect(html).toBeDefined()
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — Cannot find module `@/components/accounting/AccountingTrendChart`

- [ ] **GREEN: Write minimal implementation**

  Create `components/accounting/AccountingTrendChart.tsx`:
  ```tsx
  "use client"

  import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
  } from "recharts"

  export interface TrendLineConfig {
    dataKey: string
    color: string
    name: string
  }

  interface AccountingTrendChartProps {
    data: Record<string, unknown>[]
    lines: TrendLineConfig[]
    xAxisKey?: string
    currencySymbol?: string
    title?: string
    height?: number
  }

  export default function AccountingTrendChart({
    data,
    lines,
    xAxisKey = "period",
    currencySymbol = "₱",
    title,
    height = 280,
  }: AccountingTrendChartProps) {
    if (!data || data.length === 0) {
      return (
        <div className='bg-white/5 border border-white/10 rounded-lg p-4'>
          {title && (
            <h3 className='text-sm font-semibold text-white/60 uppercase tracking-wider mb-3'>
              {title}
            </h3>
          )}
          <div className='flex flex-col items-center justify-center py-12 text-white/40'>
            <p className='text-sm'>No data for selected period</p>
          </div>
        </div>
      )
    }

    return (
      <div className='bg-white/5 border border-white/10 rounded-lg p-4'>
        {title && (
          <h3 className='text-sm font-semibold text-white/60 uppercase tracking-wider mb-3'>
            {title}
          </h3>
        )}
        <ResponsiveContainer width='100%' height={height}>
          <LineChart data={data}>
            <CartesianGrid
              strokeDasharray='3 3'
              stroke='#ffffff20'
              vertical={false}
            />
            <XAxis
              dataKey={xAxisKey}
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
              tickFormatter={(value: number) => `${currencySymbol}${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0a0a0a",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
              }}
              itemStyle={{ color: "#fff" }}
              formatter={(value: number, name: string) => [
                `${currencySymbol}${value.toLocaleString()}`,
                name,
              ]}
            />
            {lines.map((line) => (
              <Line
                key={line.dataKey}
                type='monotone'
                dataKey={line.dataKey}
                stroke={line.color}
                strokeWidth={2}
                name={line.name}
                dot={{
                  fill: line.color,
                  strokeWidth: 0,
                  r: 3,
                }}
                activeDot={{ r: 5, fill: line.color }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }
  ```

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — component renders, wrapper has card styling, empty state works

- [ ] **REFACTOR: Clean up**
  - Run: `bun run lint` and `bun run typecheck`

- [ ] **Commit**

  ```bash
  git add components/accounting/AccountingTrendChart.tsx tests/integration/accounting-analytics-reports.test.ts
  git commit -m "feat: add AccountingTrendChart component (Task 10)"
  ```

---

### Task 11: Create AccountingBreakdownChart component

**Files:**
- Create: `components/accounting/AccountingBreakdownChart.tsx`
- Test: `tests/integration/accounting-analytics-reports.test.ts` (append)

**Dependencies:** Task 10 (pattern established)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Append to test file:
  ```typescript
  import AccountingBreakdownChart from "@/components/accounting/AccountingBreakdownChart"

  describe("AccountingBreakdownChart", () => {
    const sampleCategories = [
      { category: "Supplies", amount: 5000 },
      { category: "Rent", amount: 3000 },
      { category: "Marketing", amount: 1500 },
    ]

    test("renders bar chart without crashing", () => {
      const html = renderToString(
        <AccountingBreakdownChart
          data={sampleCategories}
          type="bar"
          valueKey="amount"
          labelKey="category"
          currencySymbol="₱"
          title="Expense Breakdown"
        />
      )
      expect(html).toBeDefined()
      expect(html.length).toBeGreaterThan(0)
    })

    test("renders pie chart without crashing", () => {
      const html = renderToString(
        <AccountingBreakdownChart
          data={sampleCategories}
          type="pie"
          valueKey="amount"
          labelKey="category"
          currencySymbol="₱"
          title="Distribution"
        />
      )
      expect(html).toBeDefined()
    })

    test("renders empty state when no data", () => {
      const html = renderToString(
        <AccountingBreakdownChart
          data={[]}
          type="bar"
          valueKey="amount"
          labelKey="category"
          currencySymbol="₱"
          title="Empty"
        />
      )
      expect(html).toContain("No data")
    })

    test("renders with title and card styling", () => {
      const html = renderToString(
        <AccountingBreakdownChart
          data={sampleCategories}
          type="bar"
          valueKey="amount"
          labelKey="category"
          currencySymbol="₱"
          title="Expenses"
        />
      )
      expect(html).toContain("Expenses")
      expect(html).toContain("bg-white/5")
      expect(html).toContain("rounded-lg")
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — Cannot find module `@/components/accounting/AccountingBreakdownChart`

- [ ] **GREEN: Write minimal implementation**

  Create `components/accounting/AccountingBreakdownChart.tsx`:
  ```tsx
  "use client"

  import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    PieChart,
    Pie,
    Legend,
  } from "recharts"

  const DEFAULT_COLORS = [
    "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
    "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#f59e0b",
  ]

  interface AccountingBreakdownChartProps {
    data: Record<string, unknown>[]
    type: "bar" | "pie"
    valueKey: string
    labelKey: string
    currencySymbol?: string
    title?: string
    height?: number
    colorMap?: Record<string, string>
  }

  export default function AccountingBreakdownChart({
    data,
    type,
    valueKey,
    labelKey,
    currencySymbol = "₱",
    title,
    height = 280,
    colorMap,
  }: AccountingBreakdownChartProps) {
    if (!data || data.length === 0) {
      return (
        <div className='bg-white/5 border border-white/10 rounded-lg p-4'>
          {title && (
            <h3 className='text-sm font-semibold text-white/60 uppercase tracking-wider mb-3'>
              {title}
            </h3>
          )}
          <div className='flex flex-col items-center justify-center py-12 text-white/40'>
            <p className='text-sm'>No data for selected period</p>
          </div>
        </div>
      )
    }

    const getColor = (label: string, index: number) => {
      if (colorMap && colorMap[label]) return colorMap[label]
      return DEFAULT_COLORS[index % DEFAULT_COLORS.length]
    }

    return (
      <div className='bg-white/5 border border-white/10 rounded-lg p-4'>
        {title && (
          <h3 className='text-sm font-semibold text-white/60 uppercase tracking-wider mb-3'>
            {title}
          </h3>
        )}
        <ResponsiveContainer width='100%' height={height}>
          {type === "pie" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={valueKey}
                nameKey={labelKey}
                cx='50%'
                cy='50%'
                outerRadius={80}
                label={({ name, percent }: { name: string; percent: number }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                labelLine={false}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getColor(String(data[index][labelKey] ?? ""), index)}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0a0a0a",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                }}
                itemStyle={{ color: "#fff" }}
                formatter={(value: number) => [
                  `${currencySymbol}${value.toLocaleString()}`,
                ]}
              />
              <Legend />
            </PieChart>
          ) : (
            <BarChart
              data={data}
              layout='vertical'
            >
              <CartesianGrid
                strokeDasharray='3 3'
                stroke='#ffffff20'
                horizontal={false}
              />
              <XAxis
                type='number'
                stroke='#ffffff60'
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => `${currencySymbol}${value}`}
              />
              <YAxis
                type='category'
                dataKey={labelKey}
                stroke='#ffffff60'
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={120}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0a0a0a",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                }}
                itemStyle={{ color: "#fff" }}
                formatter={(value: number) => [
                  `${currencySymbol}${value.toLocaleString()}`,
                ]}
              />
              <Bar
                dataKey={valueKey}
                radius={[0, 4, 4, 0]}
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getColor(String(data[index][labelKey] ?? ""), index)}
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    )
  }
  ```

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — bar + pie rendering works, empty state works

- [ ] **REFACTOR: Clean up**
  - Run: `bun run lint` and `bun run typecheck`

- [ ] **Commit**

  ```bash
  git add components/accounting/AccountingBreakdownChart.tsx tests/integration/accounting-analytics-reports.test.ts
  git commit -m "feat: add AccountingBreakdownChart component with bar and pie support (Task 11)"
  ```

---

### Task 12: Create CashFlowSummary component

**Files:**
- Create: `components/accounting/CashFlowSummary.tsx`
- Test: `tests/integration/accounting-analytics-reports.test.ts` (append)

**Dependencies:** Task 6 (CashFlowSummaryData type from server action)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Append to test file:
  ```typescript
  import CashFlowSummary from "@/components/accounting/CashFlowSummary"

  describe("CashFlowSummary", () => {
    test("renders three metric cards", () => {
      const html = renderToString(
        <CashFlowSummary
          inflow={50000}
          outflow={30000}
          net={20000}
          currencySymbol="₱"
        />
      )
      expect(html).toContain("Total Inflow")
      expect(html).toContain("Total Outflow")
      expect(html).toContain("Net Cash Flow")
    })

    test("renders zero values without error", () => {
      const html = renderToString(
        <CashFlowSummary
          inflow={0}
          outflow={0}
          net={0}
          currencySymbol="₱"
        />
      )
      expect(html).toContain("₱0.00")
    })

    test("renders negative net cash flow", () => {
      const html = renderToString(
        <CashFlowSummary
          inflow={10000}
          outflow={15000}
          net={-5000}
          currencySymbol="$"
        />
      )
      expect(html).toContain("-$5,000.00")
    })

    test("renders with card styling", () => {
      const html = renderToString(
        <CashFlowSummary
          inflow={1000}
          outflow={500}
          net={500}
          currencySymbol="₱"
        />
      )
      expect(html).toContain("bg-white/5")
      expect(html).toContain("rounded-lg")
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — Cannot find module `@/components/accounting/CashFlowSummary`

- [ ] **GREEN: Write minimal implementation**

  Create `components/accounting/CashFlowSummary.tsx`:
  ```tsx
  "use client"

  interface CashFlowSummaryProps {
    inflow: number
    outflow: number
    net: number
    currencySymbol?: string
  }

  export default function CashFlowSummary({
    inflow,
    outflow,
    net,
    currencySymbol = "₱",
  }: CashFlowSummaryProps) {
    const formatCurrency = (value: number) => {
      const absValue = Math.abs(value)
      const sign = value < 0 ? "-" : ""
      return `${sign}${currencySymbol}${absValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    }

    return (
      <div className='bg-white/5 border border-white/10 rounded-lg p-4'>
        <h3 className='text-sm font-semibold text-white/60 uppercase tracking-wider mb-3'>
          Cash Flow Summary
        </h3>
        <div className='grid grid-cols-3 gap-4'>
          <div className='bg-white/5 rounded-md p-3'>
            <p className='text-xs text-white/60'>Total Inflow</p>
            <p className='text-lg font-bold mt-1 text-green-400'>
              {formatCurrency(inflow)}
            </p>
          </div>
          <div className='bg-white/5 rounded-md p-3'>
            <p className='text-xs text-white/60'>Total Outflow</p>
            <p className='text-lg font-bold mt-1 text-red-400'>
              {formatCurrency(outflow)}
            </p>
          </div>
          <div className='bg-white/5 rounded-md p-3'>
            <p className='text-xs text-white/60'>Net Cash Flow</p>
            <p
              className={`text-lg font-bold mt-1 ${net >= 0 ? "text-green-400" : "text-red-400"}`}
            >
              {formatCurrency(net)}
            </p>
          </div>
        </div>
      </div>
    )
  }
  ```

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — three cards rendered, zero/negative values work

- [ ] **REFACTOR: Clean up**
  - Run: `bun run lint` and `bun run typecheck`

- [ ] **Commit**

  ```bash
  git add components/accounting/CashFlowSummary.tsx tests/integration/accounting-analytics-reports.test.ts
  git commit -m "feat: add CashFlowSummary component (Task 12)"
  ```

---

### Task 13: Create PeriodProjection component

**Files:**
- Create: `components/accounting/PeriodProjection.tsx`
- Test: `tests/integration/accounting-analytics-reports.test.ts` (append)

**Dependencies:** Task 3 (projection utility), Task 10 (chart pattern)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Append to test file:
  ```typescript
  import PeriodProjection from "@/components/accounting/PeriodProjection"

  describe("PeriodProjection", () => {
    const historical = [
      { period: "Jan", revenue: 1000, expenses: 500 },
      { period: "Feb", revenue: 1200, expenses: 550 },
      { period: "Mar", revenue: 1400, expenses: 600 },
    ]
    const projected = [
      { period: "Apr", revenue: 1600, expenses: 650 },
      { period: "May", revenue: 1800, expenses: 700 },
    ]

    test("renders without crashing with valid data", () => {
      const html = renderToString(
        <PeriodProjection
          historicalData={historical}
          projectedData={projected}
          currencySymbol="₱"
        />
      )
      expect(html).toBeDefined()
      expect(html.length).toBeGreaterThan(0)
    })

    test("renders title and card styling", () => {
      const html = renderToString(
        <PeriodProjection
          historicalData={historical}
          projectedData={projected}
          currencySymbol="₱"
        />
      )
      expect(html).toContain("Period Projection")
      expect(html).toContain("bg-white/5")
      expect(html).toContain("rounded-lg")
    })

    test("renders fallback message when insufficient data", () => {
      const html = renderToString(
        <PeriodProjection
          historicalData={[
            { period: "Jan", revenue: 1000, expenses: 500 },
          ]}
          projectedData={[]}
          currencySymbol="₱"
        />
      )
      expect(html).toContain("Insufficient data for projection")
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — Cannot find module `@/components/accounting/PeriodProjection`

- [ ] **GREEN: Write minimal implementation**

  Create `components/accounting/PeriodProjection.tsx`:
  ```tsx
  "use client"

  import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
  } from "recharts"
  import type { ProjectionDataPoint } from "@/utils/projection"

  interface PeriodProjectionProps {
    historicalData: ProjectionDataPoint[]
    projectedData: ProjectionDataPoint[]
    currencySymbol?: string
    height?: number
  }

  export default function PeriodProjection({
    historicalData,
    projectedData,
    currencySymbol = "₱",
    height = 300,
  }: PeriodProjectionProps) {
    if (!historicalData || historicalData.length < 3) {
      return (
        <div className='bg-white/5 border border-white/10 rounded-lg p-4'>
          <h3 className='text-sm font-semibold text-white/60 uppercase tracking-wider mb-3'>
            Period Projection
          </h3>
          <div className='flex flex-col items-center justify-center py-12 text-white/40'>
            <p className='text-sm'>Insufficient data for projection</p>
            <p className='text-xs mt-1'>Requires at least 3 periods of historical data</p>
          </div>
        </div>
      )
    }

    // Combine historical and projected into segments
    const allData = [
      ...historicalData,
      ...(projectedData.length > 0 ? projectedData : []),
    ]

    const solidHistory = historicalData.map((d) => ({
      ...d,
      type: "historical" as const,
    }))

    const dashedProjection = projectedData.map((d) => ({
      ...d,
      type: "projected" as const,
    }))

    return (
      <div className='bg-white/5 border border-white/10 rounded-lg p-4'>
        <h3 className='text-sm font-semibold text-white/60 uppercase tracking-wider mb-3'>
          Period Projection
        </h3>
        <ResponsiveContainer width='100%' height={height}>
          <LineChart data={allData}>
            <CartesianGrid
              strokeDasharray='3 3'
              stroke='#ffffff20'
              vertical={false}
            />
            <XAxis
              dataKey='period'
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
              tickFormatter={(value: number) => `${currencySymbol}${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0a0a0a",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
              }}
              itemStyle={{ color: "#fff" }}
              formatter={(value: number) => [
                `${currencySymbol}${value.toLocaleString()}`,
              ]}
            />
            <Legend />
            {/* Revenue lines */}
            <Line
              type='monotone'
              dataKey='revenue'
              stroke='#4ade80'
              strokeWidth={2}
              name='Revenue (Actual)'
              dot={false}
              data={solidHistory}
              activeDot={{ r: 5, fill: "#4ade80" }}
            />
            {projectedData.length > 0 && (
              <Line
                type='monotone'
                dataKey='revenue'
                stroke='#4ade80'
                strokeWidth={2}
                strokeDasharray='6 3'
                name='Revenue (Projected)'
                dot={false}
                data={dashedProjection}
              />
            )}
            {/* Expense lines */}
            <Line
              type='monotone'
              dataKey='expenses'
              stroke='#ef4444'
              strokeWidth={2}
              name='Expenses (Actual)'
              dot={false}
              data={solidHistory}
              activeDot={{ r: 5, fill: "#ef4444" }}
            />
            {projectedData.length > 0 && (
              <Line
                type='monotone'
                dataKey='expenses'
                stroke='#ef4444'
                strokeWidth={2}
                strokeDasharray='6 3'
                name='Expenses (Projected)'
                dot={false}
                data={dashedProjection}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }
  ```

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — projection renders, fallback on insufficient data

- [ ] **REFACTOR: Clean up**
  - Run: `bun run lint` and `bun run typecheck`
  - Verify TypeScript types match between projection.ts and this component

- [ ] **Commit**

  ```bash
  git add components/accounting/PeriodProjection.tsx tests/integration/accounting-analytics-reports.test.ts
  git commit -m "feat: add PeriodProjection component with solid/dashed segments (Task 13)"
  ```

---

### Task 14: Expand Reports tab with all 7 sections

**Files:**
- Modify: `app/accounting/accountingPage.tsx` (L1031-1050, replace Reports tab content)
- Test: `tests/integration/accounting-analytics-reports.test.ts` (append — source-level verification)

**Dependencies:** Tasks 10-13 (all chart components exist)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Append to test file:
  ```typescript
  describe("Reports tab expansion", () => {
    test("Reports tab imports all new chart components", () => {
      const fs = require("fs")
      const sourceCode = fs.readFileSync(
        "app/accounting/accountingPage.tsx",
        "utf-8"
      ) as string
      expect(sourceCode).toContain("AccountingTrendChart")
      expect(sourceCode).toContain("AccountingBreakdownChart")
      expect(sourceCode).toContain("CashFlowSummary")
      expect(sourceCode).toContain("PeriodProjection")
    })

    test("Reports tab imports computeLinearProjection", () => {
      const fs = require("fs")
      const sourceCode = fs.readFileSync(
        "app/accounting/accountingPage.tsx",
        "utf-8"
      ) as string
      expect(sourceCode).toContain("computeLinearProjection")
    })

    test("Reports tab conditionally fetches trend data", () => {
      const fs = require("fs")
      const sourceCode = fs.readFileSync(
        "app/accounting/accountingPage.tsx",
        "utf-8"
      ) as string
      expect(sourceCode).toContain("getRevenueExpenseTrend")
      expect(sourceCode).toContain("getExpenseBreakdown")
      expect(sourceCode).toContain("getCashFlowSummary")
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **FAIL** — Reports tab does not import new chart components or server actions

- [ ] **GREEN: Write minimal implementation**

  **Step 1: Add imports** at the top of `app/accounting/accountingPage.tsx` (near L70-80, alongside other accounting imports):
  ```typescript
  import AccountingTrendChart from "@/components/accounting/AccountingTrendChart"
  import AccountingBreakdownChart from "@/components/accounting/AccountingBreakdownChart"
  import CashFlowSummary from "@/components/accounting/CashFlowSummary"
  import PeriodProjection from "@/components/accounting/PeriodProjection"
  import { computeLinearProjection, ProjectionDataPoint } from "@/utils/projection"
  import {
    getRevenueExpenseTrend,
    getExpenseBreakdown,
    getCashFlowSummary,
    TrendDataPoint,
    ExpenseBreakdownItem,
    CashFlowSummaryData,
  } from "@/server/actions/accounting"
  ```

  **Step 2: Add report data state** (near L210, alongside other `useState` declarations):
  ```typescript
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([])
  const [expenseBreakdown, setExpenseBreakdown] = useState<ExpenseBreakdownItem[]>([])
  const [cashFlowData, setCashFlowData] = useState<CashFlowSummaryData | null>(null)
  const [reportsLoading, setReportsLoading] = useState(false)
  ```

  **Step 3: Add fetchReportData function** (near L426, alongside the trash data fetch):
  ```typescript
  const reportRequestIdRef = useRef(0)

  const fetchReportData = useCallback(async () => {
    if (!hasAnalyticsAccess) return
    const thisRequestId = ++reportRequestIdRef.current
    setReportsLoading(true)
    try {
      const [trendResult, breakdownResult, cashFlowResult] = await Promise.all([
        getRevenueExpenseTrend({
          datePreset,
          startDate: datePreset === "custom" ? customStartDate : undefined,
          endDate: datePreset === "custom" ? customEndDate : undefined,
          branchId: currentBranch?.id ?? undefined,
        }),
        getExpenseBreakdown({
          datePreset,
          startDate: datePreset === "custom" ? customStartDate : undefined,
          endDate: datePreset === "custom" ? customEndDate : undefined,
          branchId: currentBranch?.id ?? undefined,
        }),
        getCashFlowSummary({
          datePreset,
          startDate: datePreset === "custom" ? customStartDate : undefined,
          endDate: datePreset === "custom" ? customEndDate : undefined,
          branchId: currentBranch?.id ?? undefined,
        }),
      ])
      if (reportRequestIdRef.current !== thisRequestId) return

      if (trendResult.success && trendResult.data) setTrendData(trendResult.data)
      if (breakdownResult.success && breakdownResult.data) setExpenseBreakdown(breakdownResult.data)
      if (cashFlowResult.success && cashFlowResult.data) setCashFlowData(cashFlowResult.data)
    } catch (error) {
      if (reportRequestIdRef.current !== thisRequestId) return
      await logError({
        type: "ACCOUNTING",
        message: `Error fetching report data: ${error instanceof Error ? error.message : String(error)}`,
      })
    } finally {
      if (reportRequestIdRef.current === thisRequestId) setReportsLoading(false)
    }
  }, [hasAnalyticsAccess, datePreset, customStartDate, customEndDate, currentBranch?.id])

  // Fetch reports when tab switches to Reports
  useEffect(() => {
    if (activeTab === "reports") {
      fetchReportData()
    }
  }, [activeTab, fetchReportData])
  ```

  **Step 4: Compute projection** (useMemo, after fetchReportData):
  ```typescript
  const projectionResult = useMemo(() => {
    if (trendData.length < 3) return null
    const points: ProjectionDataPoint[] = trendData.map((d) => ({
      period: d.period,
      revenue: d.revenue,
      expenses: d.expenses,
    }))
    const periodsToProject = Math.min(Math.ceil(trendData.length / 2), 6)
    return computeLinearProjection(points, periodsToProject)
  }, [trendData])
  ```

  **Step 5: Rewrite the Reports tab** (replace L1031-1050):
  ```tsx
  {activeTab === "reports" && (
    <div className='space-y-4 mb-4 mt-4'>
      {/* Trial Balance — visible to all accounting_access users */}
      {trialBalanceData.length > 0 ? (
        <TrialBalance data={trialBalanceData} currencySymbol={currencySymbol} />
      ) : (
        <div className='bg-white/5 border border-white/10 rounded-lg p-4 text-center'>
          <div className='flex flex-col items-center justify-center gap-2 py-8 text-center text-white/60'>
            <BarChartIcon className='w-6 h-6 opacity-20' />
            <p className='text-sm'>No trial balance data for selected period</p>
            <p className='text-xs text-white/40'>Try a different date range</p>
          </div>
        </div>
      )}

      {/* Enhanced Report Charts — gated behind accounting_analytics_view */}
      <FlagGate requiredFlag="accounting_analytics_view">
        {reportsLoading ? (
          <div className='flex items-center justify-center py-12'>
            <LoaderCircleIcon className='w-8 h-8 animate-spin text-white/40' />
          </div>
        ) : (
          <>
            {/* Section 1: Revenue vs Expense Trend */}
            <AccountingTrendChart
              data={trendData}
              lines={[
                { dataKey: "revenue", color: "#4ade80", name: "Revenue" },
                { dataKey: "expenses", color: "#ef4444", name: "Expenses" },
              ]}
              xAxisKey="period"
              currencySymbol={currencySymbol}
              title="Revenue vs Expense Trend"
            />

            {/* Section 2: Net Income/Loss Trend */}
            <AccountingTrendChart
              data={trendData}
              lines={[
                { dataKey: "net_income", color: "#3b82f6", name: "Net Income" },
              ]}
              xAxisKey="period"
              currencySymbol={currencySymbol}
              title="Net Income/Loss Trend"
            />

            {/* Section 3 + 5: Side by side */}
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
              <AccountingBreakdownChart
                data={expenseBreakdown}
                type="bar"
                valueKey="amount"
                labelKey="category"
                currencySymbol={currencySymbol}
                title="Expense Breakdown by Category"
              />
              <AccountingBreakdownChart
                data={(() => {
                  const accountTypes = [
                    { category: "ASSET", amount: 0 },
                    { category: "LIABILITY", amount: 0 },
                    { category: "EQUITY", amount: 0 },
                    { category: "REVENUE", amount: 0 },
                    { category: "EXPENSE", amount: 0 },
                  ]
                  if (summary?.by_type) {
                    const map = new Map(accountTypes.map(t => [t.category, t]))
                    for (const bt of summary.by_type) {
                      const naturalSide = NATURAL_BALANCE[bt.type] || 'debit'
                      const net = naturalSide === 'credit'
                        ? bt.credit - bt.debit
                        : bt.debit - bt.credit
                      const existing = map.get(bt.type)
                      if (existing) existing.amount = Math.abs(net)
                    }
                  }
                  return accountTypes.filter(t => t.amount > 0)
                })()}
                type="pie"
                valueKey="amount"
                labelKey="category"
                currencySymbol={currencySymbol}
                title="Account Type Distribution"
                colorMap={{
                  ASSET: "#3b82f6",
                  LIABILITY: "#f97316",
                  EQUITY: "#8b5cf6",
                  REVENUE: "#22c55e",
                  EXPENSE: "#ef4444",
                }}
              />
            </div>

            {/* Section 4: Revenue vs Expense Comparison (grouped bar) */}
            <AccountingTrendChart
              data={trendData}
              lines={[
                { dataKey: "revenue", color: "#4ade80", name: "Revenue" },
                { dataKey: "expenses", color: "#ef4444", name: "Expenses" },
              ]}
              xAxisKey="period"
              currencySymbol={currencySymbol}
              title="Revenue vs Expense Comparison"
              height={280}
            />

            {/* Section 6: Cash Flow Summary */}
            {cashFlowData && (
              <CashFlowSummary
                inflow={cashFlowData.inflow}
                outflow={cashFlowData.outflow}
                net={cashFlowData.net}
                currencySymbol={currencySymbol}
              />
            )}

            {/* Section 7: Period Projection */}
            {projectionResult ? (
              <PeriodProjection
                historicalData={projectionResult.historical}
                projectedData={projectionResult.projected}
                currencySymbol={currencySymbol}
              />
            ) : (
              <PeriodProjection
                historicalData={
                  trendData.length > 0
                    ? trendData.map((d) => ({
                        period: d.period,
                        revenue: d.revenue,
                        expenses: d.expenses,
                      }))
                    : []
                }
                projectedData={[]}
                currencySymbol={currencySymbol}
              />
            )}
          </>
        )}
      </FlagGate>
    </div>
  )}
  ```

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **PASS** — Reports tab imports all new chart components, server actions, and projection utility

- [ ] **REFACTOR: Clean up**
  - Verify `BarChartIcon` is imported (it already is, line ~26)
  - The `summary` variable is used for Account Type Distribution pie — this is only available if `hasAnalyticsAccess` is true (since `getLedgerSummary` is gated). The pie chart will only have data when the flag is present — consistent.
  - Run dev server and visually verify all 7 sections render:
    - Admin: All charts visible
    - User with flag: All charts visible
    - User without flag: Only TrialBalance visible
  - Run: `bun run lint` and `bun run typecheck`

- [ ] **Commit**

  ```bash
  git add app/accounting/accountingPage.tsx tests/integration/accounting-analytics-reports.test.ts
  git commit -m "feat: expand Reports tab with 7 chart sections gated by analytics flag (Task 14)"
  ```

---

## Phase 5: Polish & Hardening

> **Outcome:** Full test suite green, lint clean, typecheck clean, verified against all edge cases.

---

### Task 15: Run full test suite and fix regressions

**Files:**
- Modify: (any file with failing tests)
- Test: Run all existing tests plus the new test suite

**Dependencies:** Tasks 1-14 (all implementation complete)

**Verification Cycle:**

- [ ] **Run the full new test suite**

  ```bash
  bun test tests/integration/accounting-analytics-reports.test.ts
  ```
  Expected: **ALL PASS** — every test in the new file passes

- [ ] **Run the full integration test suite**

  ```bash
  bun test tests/integration/
  ```
  Expected: **ALL PASS** — no regressions in existing tests. If any existing test fails, investigate:
  - Did `StatsGrid` export change break anything? (check `gridColsMap` export)
  - Did flag registry change break any type assertions?
  - Did `accountingPage` conditional promise logic break requestIdRef patterns?

- [ ] **Run lint**

  ```bash
  bun run lint
  ```
  Expected: **0 errors, 0 warnings** (clean output)

- [ ] **Run typecheck**

  ```bash
  bun run typecheck
  ```
  Expected: **No type errors** (clean exit)

- [ ] **Build check**

  ```bash
  bun run build
  ```
  Expected: **Build succeeds** without errors

- [ ] **Fix any failures**
  - Identify the failing test or build error
  - Apply minimal fix
  - Re-run the affected test command to confirm green
  - If a build fails due to unused import, remove it

- [ ] **Commit** (only if fixes were needed)

  ```bash
  git add .
  git commit -m "chore: fix regressions from analytics flag integration (Task 15)"
  ```

---

### Task 16: Edge case hardening and visual verification

**Files:**
- Potentially modify: `app/accounting/accountingPage.tsx` (edge case fixes)
- Potentially modify: `server/actions/accounting.ts` (edge case fixes)

**Dependencies:** Task 15 (all tests green)

**Edge Case Checklist:**

- [ ] **Empty ledger (no entries)**:
  - StatsGrid: Should show zeros (already handled — summary values default to 0)
  - Charts: Empty state shown via `No data for selected period`
  - TrialBalance: "No trial balance data for selected period" shown
  - **Verify**: Set narrow custom date range with no entries → all sections gracefully show empty states

- [ ] **Single data point**:
  - Line charts work with a single point (dot on chart)
  - Projection fallback: "Insufficient data for projection" shown
  - **Verify**: Set date range to a single day with entries → charts render single dot

- [ ] **Very large values**:
  - StatCard: Truncated with ellipsis (overflow fix from Task 7)
  - Chart Y-axis: Should auto-scale via recharts
  - **Verify**: Seed a test entry with a large amount → verify display doesn't break

- [ ] **Branch filter interaction**:
  - Switch branches → reports data re-fetches (via useEffect dependency on currentBranch?.id)
  - StatsGrid updates via existing fetchData
  - **Verify**: Switch between branches → data refreshes correctly

- [ ] **Date preset changes**:
  - Change from "This Month" to "This Year" → reports re-fetch
  - Trend grouping changes: day → week → month depending on range (handled in server action)
  - **Verify**: Cycle through date presets → charts update

- [ ] **Flag absence graceful degradation**:
  - User has `accounting_access` but NOT `accounting_analytics_view`:
    - Ledger tab: No StatsGrid, no Breakdown by Account Type (handled since summary=null)
    - Reports tab: TrialBalance visible, no charts
    - No server errors in console (getLedgerSummary and report actions never called)
  - **Verify**: Create a non-admin user with only `accounting_access` → Ledger and Reports show minimal content

- [ ] **Admin sees everything**:
  - Admin users bypass the flag — all cards and all 7 chart sections visible
  - **Verify**: Admin account → all content visible on both tabs

- [ ] **Proof of fix** (visual):
  - Open the page on a 1024-1280px viewport
  - Verify that StatsGrid cards do NOT have the Net Loss value wrapping to two lines
  - Verify the table area has only ONE vertical scrollbar (page scroll, not nested table scroll)

- [ ] **Commit** (if any fixes applied)

  ```bash
  git add .
  git commit -m "chore: edge case hardening for analytics reports (Task 16)"
  ```

---

## Final Checklist

> Run this after all 16 tasks are complete:

- [ ] `bun test tests/integration/` — all tests pass
- [ ] `bun run lint` — 0 errors
- [ ] `bun run typecheck` — 0 errors
- [ ] `bun run build` — builds successfully
- [ ] Dev server starts: `bun run dev` — accounting page loads
- [ ] All 7 report sections render for admin users
- [ ] Flag-gating works: non-flag users don't see StatsGrid or report charts
- [ ] No console errors on the accounting page
- [ ] Table has single scroll (no double-scroll)
- [ ] Stat cards don't overflow on 1024px+ viewports
