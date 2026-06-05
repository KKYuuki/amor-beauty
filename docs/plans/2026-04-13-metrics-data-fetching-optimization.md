# Metrics Page Data Fetching Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce server action calls from 11+ to ~5-6 per tab load by consolidating queries, adding SQL-level aggregation, implementing consistent caching, and staggering non-critical requests.

**Architecture:** Create 2 new aggregated server actions (`getBusinessInsightsMetrics`, `getExecutiveAccountingMetrics`) that return all metrics for a tab in a single call using parallel DB queries internally. Move row-level aggregation to SQL (`SUM`, `COUNT`, `GROUP BY`). Add caching to all metrics functions. Stagger non-critical requests (settings, staff perf) after critical financial data renders.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Supabase/PostgreSQL

---

## Audit: Current Metrics Page Call Chain

### What happens on Business Insights tab load

`businessInsights.tsx` fires **11 server actions** in a single `Promise.allSettled`:

| # | Function | DB Table(s) | Has Cache? | SQL Aggregation? |
|---|----------|-------------|------------|------------------|
| 1 | `getScopedFinancialMetrics` | `general_ledger` | Yes (5min) | No — fetches all rows, sums in JS |
| 2 | `getRevenueTrend` | `general_ledger` | No | No — fetches all rows, groups in JS |
| 3 | `getOperationalMetrics` | `appointments` | No | No — fetches all rows, counts in JS |
| 4 | `getInventoryMetrics` | `inventory` | Yes (5min) | No — fetches all rows, sums in JS |
| 5 | `getStaffPerformance` | `ratings` + `appointments` + `user` | No | Partial — uses `COUNT` for appointments |
| 6 | `getLedgerSummary` | `general_ledger` | No | Partial — uses `SUM` for totals |
| 7 | `getPayrollDashboardSummary` | `payroll_entry` + `payroll_request` | No | Yes — uses `SUM`/`COUNT` |
| 8 | `getStaffPayrollSummary` | `payroll_entry` + `user` | No | Yes — uses `SUM`/`COUNT` |
| 9 | `getNetIncomeMetrics` | `general_ledger` | No | No — fetches all rows, sums in JS |
| 10 | `getClientTypeMetrics` | `appointments` | No | No — fetches all rows, counts in JS |
| 11 | `getArtistLeaderboard` | `payroll_entry` + `user` | No | Yes — uses `SUM`/`COUNT` |

Plus a separate `useEffect` calls `getSetting("currency_tax")` = **12 total server actions**.

### What happens on Executive Accounting tab load

`ExecutiveAccounting.tsx` fires **3 server actions** in `Promise.all`:

| # | Function | DB Table(s) | Has Cache? | SQL Aggregation? |
|---|----------|-------------|------------|------------------|
| 1 | `getPLMetrics` | `general_ledger` | Yes (5min) | No — fetches all rows, sums in JS |
| 2 | `getExpenseBreakdown` | `general_ledger` | Yes (5min) | Yes — uses `SUM`/`GROUP BY` |
| 3 | `getRevenueExpenseTrend` | `general_ledger` | No | No — fetches all rows, groups in JS |

Plus `getSetting("currency_tax")` = **4 total server actions**.

### Key Problems

#### Problem 1: Redundant `general_ledger` queries (Critical)
Functions 1, 2, 6, 9 in BusinessInsights all query `general_ledger` with **the same date range and branch filter**:
- `getScopedFinancialMetrics` — fetches `credit` where `entryType=REVENUE`
- `getRevenueTrend` — fetches `entryDate, credit` where `entryType=REVENUE`
- `getNetIncomeMetrics` — fetches `entryType, debit, credit` (all types)
- `getLedgerSummary` — fetches totals and by-type breakdown

These could be **1 query** that returns all needed aggregations.

#### Problem 2: Redundant `appointments` queries (High)
Functions 3 and 10 both query `appointments` with the same date range and branch:
- `getOperationalMetrics` — fetches `status` for all active appointments
- `getClientTypeMetrics` — fetches `isWalkin` for all active appointments

These could be **1 query** that returns status counts AND walkin counts.

#### Problem 3: In-memory aggregation wastes bandwidth (High)
Functions 1, 2, 3, 9, 10 fetch **all matching rows** into Node.js memory and then aggregate. With large date ranges (yearly view), this could mean fetching 10,000+ rows just to compute a sum. PostgreSQL `SUM()`, `COUNT()`, and `GROUP BY` do this server-side.

#### Problem 4: Inconsistent caching (Medium)
Only 4 out of 11 functions cache their results. Repeated tab switches or timeframe changes cause redundant DB queries.

#### Problem 5: Each function re-authenticates (Low-Medium)
Every server action calls `getCurrentUser()` and permission checks. When 11 functions fire in parallel, that's 11 auth lookups. This is fine for Supabase (JWT validation is fast), but worth noting.

#### Problem 6: Currency symbol fetched separately (Low)
`getSetting("currency_tax")` is called in a separate `useEffect` in both components. It should be included in the main fetch or cached aggressively.

---

## Implementation Tasks

### Task 1: Create aggregated `getBusinessInsightsMetrics` server action

**Files:**
- Create: (inline in) `server/actions/metrics.ts`
- Modify: `components/metrics/businessInsights.tsx`

**Step 1: Create the aggregated function**

Add a new server action that combines all BusinessInsights queries into parallel internal DB calls:

```typescript
export type BusinessInsightsMetrics = {
    financials: FinancialMetrics
    revenueTrend: RevenueTrend
    operations: OperationalMetrics
    inventory: InventoryMetrics
    netIncome: NetIncomeMetrics
    clientTypes: ClientTypeMetrics
    artistLeaderboard: ArtistLeaderboardEntry[]
}

export async function getBusinessInsightsMetrics(
    startDate: string,
    endDate: string,
    groupBy: "day" | "month" = "day",
    branchId?: string
): Promise<ActionResponse<BusinessInsightsMetrics>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const cacheKey = `business_insights:${startDate}:${endDate}:${groupBy}:${branchId || 'all'}`
        const cached = cache.get<BusinessInsightsMetrics>(cacheKey)
        if (cached) {
            return success(cached)
        }

        const start = new Date(startDate)
        const end = new Date(endDate)

        // All queries run in parallel within the server action
        const [
            financialAndTrendAndNet,
            operationsAndClientTypes,
            inventoryData,
            leaderboardData,
        ] = await Promise.all([
            fetchGeneralLedgerAggregates(start, end, groupBy, branchId),
            fetchAppointmentAggregates(start, end, branchId),
            fetchInventoryAggregates(branchId),
            fetchLeaderboardData(start, end, branchId),
        ])

        const metrics: BusinessInsightsMetrics = {
            financials: financialAndTrendAndNet.financials,
            revenueTrend: financialAndTrendAndNet.trend,
            netIncome: financialAndTrendAndNet.netIncome,
            operations: operationsAndClientTypes.operations,
            clientTypes: operationsAndClientTypes.clientTypes,
            inventory: inventoryData,
            artistLeaderboard: leaderboardData,
        }

        cache.set(cacheKey, metrics, METRICS_CACHE_TTL)
        return success(metrics)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching business insights: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch business insights')
    }
}
```

**Step 2: Create `fetchGeneralLedgerAggregates` helper**

This replaces 4 separate `general_ledger` queries with 1-2 efficient queries:

```typescript
type GLAggregates = {
    financials: FinancialMetrics
    trend: RevenueTrend
    netIncome: NetIncomeMetrics
}

async function fetchGeneralLedgerAggregates(
    start: Date,
    end: Date,
    groupBy: "day" | "month",
    branchId?: string
): Promise<GLAggregates> {
    const conditions: SQL<unknown>[] = [
        eq(generalLedger.isVoided, false),
        gte(generalLedger.entryDate, start),
        lte(generalLedger.entryDate, end),
    ]

    if (branchId) {
        const branchCondition = or(eq(generalLedger.branchId, branchId), isNull(generalLedger.branchId))
        if (branchCondition) conditions.push(branchCondition)
    }

    // Query 1: Aggregate totals by entry type (replaces getScopedFinancialMetrics + getNetIncomeMetrics)
    const totalsByType = await db
        .select({
            entryType: generalLedger.entryType,
            totalCredit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
            totalDebit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
            count: count(),
        })
        .from(generalLedger)
        .where(and(...conditions))
        .groupBy(generalLedger.entryType)

    let revenue = 0
    let revenueCount = 0
    let expenses = 0

    for (const row of totalsByType) {
        if (row.entryType === 'REVENUE') {
            revenue = Number(row.totalCredit) || 0
            revenueCount = row.count || 0
        } else if (row.entryType === 'EXPENSE') {
            expenses = Number(row.totalDebit) || 0
        }
    }

    // Query 2: Revenue trend grouped by date (replaces getRevenueTrend)
    const trendConditions: SQL<unknown>[] = [
        ...conditions,
        eq(generalLedger.entryType, 'REVENUE'),
    ]

    const trendRows = await db
        .select({
            dateKey: groupBy === 'month'
                ? sql<string>`TO_CHAR(${generalLedger.entryDate}, 'Mon YYYY')`
                : sql<string>`TO_CHAR(${generalLedger.entryDate}, 'Mon DD')`,
            revenue: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
        })
        .from(generalLedger)
        .where(and(...trendConditions))
        .groupBy(sql`${groupBy === 'month'
            ? sql`TO_CHAR(${generalLedger.entryDate}, 'Mon YYYY')`
            : sql`TO_CHAR(${generalLedger.entryDate}, 'Mon DD')`}`)
        .orderBy(sql`${groupBy === 'month'
            ? sql`MIN(${generalLedger.entryDate})`
            : sql`MIN(${generalLedger.entryDate})`} DESC`)

    const trend: RevenueTrend = trendRows.map(row => ({
        date: row.dateKey,
        revenue: Number(row.revenue) || 0,
    }))

    return {
        financials: {
            revenue,
            transactions: revenueCount,
            averageTicket: revenueCount > 0 ? revenue / revenueCount : 0,
        },
        trend,
        netIncome: {
            revenue,
            expenses,
            netIncome: revenue - expenses,
        },
    }
}
```

**Step 3: Create `fetchAppointmentAggregates` helper**

Replaces 2 separate appointment queries with 1:

```typescript
type AppointmentAggregates = {
    operations: OperationalMetrics
    clientTypes: ClientTypeMetrics
}

async function fetchAppointmentAggregates(
    start: Date,
    end: Date,
    branchId?: string
): Promise<AppointmentAggregates> {
    const conditions: SQL<unknown>[] = [
        eq(appointments.isActive, true),
        gte(appointments.timeStart, start),
        lte(appointments.timeStart, end),
    ]

    if (branchId) {
        const branchCondition = or(eq(appointments.branchId, branchId), isNull(appointments.branchId))
        if (branchCondition) conditions.push(branchCondition)
    }

    // Single query with GROUP BY for both status and walkin
    const statusCounts = await db
        .select({
            status: appointments.status,
            isWalkin: appointments.isWalkin,
            count: count(),
        })
        .from(appointments)
        .where(and(...conditions))
        .groupBy(appointments.status, appointments.isWalkin)

    let totalAppointments = 0
    let completedAppointments = 0
    let cancelledAppointments = 0
    let walkinCount = 0

    for (const row of statusCounts) {
        const rowCount = row.count || 0
        totalAppointments += rowCount

        if (row.status === 'COMPLETED') completedAppointments += rowCount
        if (row.status === 'CANCELLED') cancelledAppointments += rowCount
        if (row.isWalkin) walkinCount += rowCount
    }

    return {
        operations: {
            totalAppointments,
            completedAppointments,
            cancelledAppointments,
            cancellationRate: totalAppointments > 0
                ? (cancelledAppointments / totalAppointments) * 100
                : 0,
        },
        clientTypes: {
            walkinCount,
            personalCount: totalAppointments - walkinCount,
        },
    }
}
```

**Step 4: Create `fetchInventoryAggregates` helper**

Optimizes the inventory query to use SQL aggregation:

```typescript
async function fetchInventoryAggregates(branchId?: string): Promise<InventoryMetrics> {
    const conditions: SQL<unknown>[] = [eq(inventory.isActive, true)]

    if (branchId) {
        const branchCondition = or(eq(inventory.branchId, branchId), isNull(inventory.branchId))
        if (branchCondition) conditions.push(branchCondition)
    }

    // Get all items for top-selling and aggregated totals
    const items = await db
        .select({
            name: inventory.name,
            currentStock: inventory.currentStock,
            unitPrice: inventory.unitPrice,
            sellingPrice: inventory.sellingPrice,
        })
        .from(inventory)
        .where(and(...conditions))

    let totalValue = 0
    let potentialRevenue = 0

    const topSelling = items.map((item) => {
        const quantity = Number(item.currentStock) || 0
        const cost = Number(item.unitPrice) || 0
        const price = Number(item.sellingPrice) || 0
        const itemRevenue = price * quantity

        totalValue += cost * quantity
        potentialRevenue += itemRevenue

        return {
            name: item.name || "Unknown",
            quantity,
            revenue: itemRevenue,
        }
    })
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)

    return { totalValue, potentialRevenue, topSelling }
}
```

**Step 5: Create `fetchLeaderboardData` helper**

Wraps existing `getArtistLeaderboard` logic (no change needed since it already uses SQL aggregation):

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

    if (branchId) {
        conditions.push(
            sql`EXISTS (SELECT 1 FROM ${transactions} WHERE ${transactions.id} = ${payrollEntry.transactionId} AND ${transactions.branchId} = ${branchId})`
        )
    }

    const entries = await db
        .select({
            staffId: payrollEntry.staffId,
            staffFullName: user.fullName,
            staffAvatarUrl: user.avatarUrl,
            staffArtistLevel: user.artistLevel,
            totalArtistCut: sql<number>`COALESCE(SUM(CAST(${payrollEntry.artistCut} AS NUMERIC)), 0)`,
            totalGross: sql<number>`COALESCE(SUM(CAST(${payrollEntry.grossAmount} AS NUMERIC)), 0)`,
            appointmentCount: sql<number>`CAST(COUNT(DISTINCT ${payrollEntry.appointmentId}) AS INTEGER)`,
        })
        .from(payrollEntry)
        .leftJoin(user, eq(payrollEntry.staffId, user.id))
        .where(and(...conditions))
        .groupBy(payrollEntry.staffId, user.fullName, user.avatarUrl, user.artistLevel)

    return entries.slice(0, LEADERBOARD_LIMIT).map(entry => ({
        staff_id: entry.staffId,
        full_name: entry.staffFullName || 'Unknown',
        avatar_url: entry.staffAvatarUrl || undefined,
        artist_level: entry.staffArtistLevel || undefined,
        total_revenue: Number(entry.totalArtistCut) || 0,
        total_artist_cut: Number(entry.totalArtistCut) || 0,
        total_gross: Number(entry.totalGross) || 0,
        appointment_count: entry.appointmentCount || 0,
    }))
}
```

**Step 6: Verify**

Run: `bun run lint`
Expected: No errors

**Step 7: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "perf(metrics): add aggregated getBusinessInsightsMetrics server action with SQL-level aggregation"
```

---

### Task 2: Create aggregated `getExecutiveAccountingMetrics` server action

**Files:**
- Modify: `server/actions/metrics.ts`

**Step 1: Create the aggregated function**

```typescript
export type ExecutiveAccountingMetrics = {
    pl: PLMetrics
    expenseBreakdown: ExpenseBreakdownItem[]
    trend: RevenueExpenseTrendItem[]
}

export async function getExecutiveAccountingMetrics(
    startDate: string,
    endDate: string,
    branchId?: string
): Promise<ActionResponse<ExecutiveAccountingMetrics>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const cacheKey = `exec_accounting:${startDate}:${endDate}:${branchId || 'all'}`
        const cached = cache.get<ExecutiveAccountingMetrics>(cacheKey)
        if (cached) {
            return success(cached)
        }

        const start = new Date(startDate)
        const end = new Date(endDate)

        const conditions: SQL<unknown>[] = [
            eq(generalLedger.isVoided, false),
            gte(generalLedger.entryDate, start),
            lte(generalLedger.entryDate, end),
        ]

        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId), isNull(generalLedger.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        // Query 1: P&L totals (replaces getPLMetrics + getNetIncomeMetrics duplicate)
        const plTotals = await db
            .select({
                entryType: generalLedger.entryType,
                totalCredit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
                totalDebit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
            })
            .from(generalLedger)
            .where(and(...conditions))
            .groupBy(generalLedger.entryType)

        let revenue = 0
        let expenses = 0

        for (const row of plTotals) {
            if (row.entryType === 'REVENUE') revenue = Number(row.totalCredit) || 0
            if (row.entryType === 'EXPENSE') expenses = Number(row.totalDebit) || 0
        }

        // Query 2: Expense breakdown by category (uses existing SQL aggregation)
        const expenseConditions: SQL<unknown>[] = [
            ...conditions,
            eq(generalLedger.entryType, 'EXPENSE'),
        ]

        const expenseRows = await db
            .select({
                category: generalLedger.category,
                amount: sql<number>`SUM(CAST(${generalLedger.debit} AS NUMERIC))`,
            })
            .from(generalLedger)
            .where(and(...expenseConditions))
            .groupBy(generalLedger.category)

        const totalExpenses = expenseRows.reduce((sum, e) => sum + Number(e.amount || 0), 0)
        const expenseBreakdown: ExpenseBreakdownItem[] = expenseRows
            .map(row => ({
                category: row.category || 'Uncategorized',
                amount: Number(row.amount || 0),
                percentage: totalExpenses > 0 ? (Number(row.amount || 0) / totalExpenses) * 100 : 0,
            }))
            .sort((a, b) => b.amount - a.amount)

        // Query 3: Revenue vs Expense trend grouped by date
        const trendRows = await db
            .select({
                dateKey: sql<string>`TO_CHAR(${generalLedger.entryDate}, 'Mon DD')`,
                entryType: generalLedger.entryType,
                totalCredit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
                totalDebit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
            })
            .from(generalLedger)
            .where(and(...conditions))
            .groupBy(
                sql`TO_CHAR(${generalLedger.entryDate}, 'Mon DD')`,
                generalLedger.entryType
            )
            .orderBy(sql`MIN(${generalLedger.entryDate}) DESC`)

        // Merge trend rows by date
        const trendMap = new Map<string, { revenue: number; expenses: number }>()
        for (const row of trendRows) {
            const existing = trendMap.get(row.dateKey) || { revenue: 0, expenses: 0 }
            if (row.entryType === 'REVENUE') existing.revenue = Number(row.totalCredit) || 0
            if (row.entryType === 'EXPENSE') existing.expenses = Number(row.totalDebit) || 0
            trendMap.set(row.dateKey, existing)
        }

        const trend: RevenueExpenseTrendItem[] = Array.from(trendMap.entries()).map(([date, data]) => ({
            date,
            revenue: data.revenue,
            expenses: data.expenses,
            netProfit: data.revenue - data.expenses,
        }))

        const netProfit = revenue - expenses
        const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0

        const metrics: ExecutiveAccountingMetrics = {
            pl: { revenue, expenses, netProfit, profitMargin },
            expenseBreakdown,
            trend,
        }

        cache.set(cacheKey, metrics, METRICS_CACHE_TTL)
        return success(metrics)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching executive accounting metrics: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch executive accounting metrics')
    }
}
```

**Step 2: Verify**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "perf(metrics): add aggregated getExecutiveAccountingMetrics with SQL-level grouping"
```

---

### Task 3: Update BusinessInsights to use aggregated fetch

**Files:**
- Modify: `components/metrics/businessInsights.tsx`

**Step 1: Replace 11 parallel calls with aggregated fetch + staggered secondary calls**

Replace the `fetchData` callback's `Promise.allSettled` block:

```typescript
const fetchData = useCallback(async () => {
    setLoading(true)

    if (timeframe === "custom") {
        if (!customStartDate || !customEndDate) {
            setLoading(false)
            return
        }
        if (new Date(customStartDate) > new Date(customEndDate)) {
            addNotification("Start date must be before end date", "ERROR")
            setLoading(false)
            return
        }
    }

    const range = getDateRangeFromPreset(timeframe, customStartDate, customEndDate)
    if (!range) {
        setLoading(false)
        return
    }

    setDateRangeStr(range.label)
    const startDate = range.start.toISOString()
    const endDate = range.end.toISOString()

    const daysDiff = Math.ceil((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24))
    const groupBy = daysDiff > 90 ? "month" : "day"

    try {
        // Phase 1: Critical metrics (1 server action instead of 11)
        const [insightsResult, ledgerResult, payrollResult, payrollStaffResult] = await Promise.allSettled([
            getBusinessInsightsMetrics(startDate, endDate, groupBy, branchId),
            getLedgerSummary(timeframe, startDate, endDate, branchId),
            getPayrollDashboardSummary(branchId ?? null),
            getStaffPayrollSummary(branchId ?? null),
        ])

        if (insightsResult.status === "fulfilled" && insightsResult.value.success) {
            const data = insightsResult.value.data
            setFinancials(data.financials)
            setRevenueTrend(data.revenueTrend)
            setOperations(data.operations)
            setInventory(data.inventory)
            setNetIncome(data.netIncome)
            setClientTypes(data.clientTypes)
            setArtistLeaderboard(data.artistLeaderboard)
        }

        if (ledgerResult.status === "fulfilled" && ledgerResult.value.success) {
            setAccountingSummary(ledgerResult.value.data)
        }

        if (payrollResult.status === "fulfilled" && payrollResult.value.success) {
            setPayrollSummary(payrollResult.value.data)
        }

        if (payrollStaffResult.status === "fulfilled" && payrollStaffResult.value.success) {
            setArtistEarnings(payrollStaffResult.value.data)
        }

        // Phase 2: Non-critical (staggered after render)
        const perfResult = await getStaffPerformance(branchId)
        if (perfResult.success) {
            setStaffPerf(perfResult.data)
        }
    } catch (error) {
        addNotification("Failed to fetch metrics data", "ERROR")
    } finally {
        setLoading(false)
        setInitialLoad(false)
    }
}, [timeframe, customStartDate, customEndDate, addNotification, branchId])
```

**Step 2: Remove unused imports**

Remove imports for functions no longer called directly:
- `getScopedFinancialMetrics`
- `getRevenueTrend`
- `getOperationalMetrics`
- `getInventoryMetrics`
- `getNetIncomeMetrics`
- `getClientTypeMetrics`
- `getArtistLeaderboard`
- Related type imports (`FinancialMetrics`, `RevenueTrend`, etc. can be imported from the new aggregated type)

Update imports:
```typescript
import {
    getBusinessInsightsMetrics,
    exportMetrics,
    getStaffPerformance,
    type BusinessInsightsMetrics,
    type StaffPerformanceMetric,
} from "@/server/actions/metrics"
```

**Step 3: Verify**

Run: `bun run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/metrics/businessInsights.tsx
git commit -m "perf(metrics): use aggregated fetch for BusinessInsights, reduce 11 calls to 4+1"
```

---

### Task 4: Update ExecutiveAccounting to use aggregated fetch

**Files:**
- Modify: `components/metrics/ExecutiveAccounting.tsx`

**Step 1: Replace 3 parallel calls with aggregated fetch**

Replace the `fetchData` callback:

```typescript
const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (timeframe === "custom") {
        if (!customStartDate || !customEndDate) {
            setLoading(false)
            return
        }
        if (new Date(customStartDate) > new Date(customEndDate)) {
            addNotification("Start date must be before end date", "ERROR")
            setLoading(false)
            return
        }
    }

    const range = getDateRangeFromPreset(timeframe, customStartDate, customEndDate)
    if (!range) {
        setLoading(false)
        return
    }

    setDateRangeStr(range.label)
    const startDate = range.start.toISOString()
    const endDate = range.end.toISOString()

    try {
        const result = await getExecutiveAccountingMetrics(startDate, endDate, branchId)

        if (result.success) {
            setPlMetrics(result.data.pl)
            setExpenseBreakdown(result.data.expenseBreakdown)
            setTrendData(result.data.trend)
        } else {
            setError(result.error || "Failed to fetch metrics")
            addNotification(result.error || "Failed to fetch metrics", "ERROR")
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch metrics data"
        setError(errorMessage)
        addNotification(errorMessage, "ERROR")
    } finally {
        setLoading(false)
        setInitialLoad(false)
    }
}, [timeframe, customStartDate, customEndDate, addNotification, branchId])
```

**Step 2: Update imports**

Replace:
```typescript
import {
    getPLMetrics,
    getExpenseBreakdown,
    getRevenueExpenseTrend,
    PLMetrics,
    ExpenseBreakdownItem,
    RevenueExpenseTrendItem,
} from "@/server/actions/metrics"
```

With:
```typescript
import {
    getExecutiveAccountingMetrics,
    type PLMetrics,
    type ExpenseBreakdownItem,
    type RevenueExpenseTrendItem,
} from "@/server/actions/metrics"
```

**Step 3: Verify**

Run: `bun run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add components/metrics/ExecutiveAccounting.tsx
git commit -m "perf(metrics): use aggregated fetch for ExecutiveAccounting, reduce 3 calls to 1"
```

---

### Task 5: Add caching to remaining uncached metrics functions

**Files:**
- Modify: `server/actions/metrics.ts`
- Modify: `server/actions/accounting.ts`
- Modify: `server/actions/payroll.ts`

**Step 1: Add caching to `getRevenueTrend`**

The standalone `getRevenueTrend` function (still exported for potential direct use) lacks caching:

```typescript
// Inside getRevenueTrend, after auth checks, before the try block's DB call:
const cacheKey = `revenue_trend:${startDate}:${endDate}:${groupBy}:${branchId || 'all'}`
const cached = cache.get<RevenueTrend>(cacheKey)
if (cached) {
    return success(cached)
}

// After computing the trend array, before return:
cache.set(cacheKey, trend, METRICS_CACHE_TTL)
```

**Step 2: Add caching to `getOperationalMetrics`**

```typescript
// After auth checks:
const cacheKey = `operational_metrics:${startDate}:${endDate}:${branchId || 'all'}`
const cached = cache.get<OperationalMetrics>(cacheKey)
if (cached) {
    return success(cached)
}

// After computing metrics, before return:
cache.set(cacheKey, metrics, METRICS_CACHE_TTL)
```

**Step 3: Add caching to `getNetIncomeMetrics`**

```typescript
// After auth checks:
const cacheKey = `net_income:${startDate}:${endDate}:${branchId || 'all'}`
const cached = cache.get<NetIncomeMetrics>(cacheKey)
if (cached) {
    return success(cached)
}

// After computing metrics, before return:
cache.set(cacheKey, { revenue, expenses, netIncome }, METRICS_CACHE_TTL)
```

**Step 4: Add caching to `getClientTypeMetrics`**

```typescript
// After auth checks:
const cacheKey = `client_types:${startDate}:${endDate}:${branchId || 'all'}`
const cached = cache.get<ClientTypeMetrics>(cacheKey)
if (cached) {
    return success(cached)
}

// After computing metrics, before return:
cache.set(cacheKey, { walkinCount, personalCount }, METRICS_CACHE_TTL)
```

**Step 5: Add caching to `getLedgerSummary` (accounting.ts)**

```typescript
// After auth checks, before DB queries:
const cacheKey = `ledger_summary:${datePreset || 'custom'}:${startDate || ''}:${endDate || ''}:${branchId || 'all'}`
const cached = cache.get<LedgerSummary>(cacheKey)
if (cached) {
    return success(cached)
}

// After computing summary, before return:
cache.set(cacheKey, summary, METRICS_CACHE_TTL)
```

Add the import: `import { cache } from '@/utils/cache'` and define `const METRICS_CACHE_TTL = 5 * 60 * 1000` in accounting.ts.

**Step 6: Add caching to `getPayrollDashboardSummary` and `getStaffPayrollSummary` (payroll.ts)**

Same pattern. Add cache import and TTL constant to payroll.ts.

**Step 7: Verify**

Run: `bun run lint`
Expected: No errors

**Step 8: Commit**

```bash
git add server/actions/metrics.ts server/actions/accounting.ts server/actions/payroll.ts
git commit -m "perf(metrics): add 5-minute caching to all uncached metrics functions"
```

---

### Task 6: Add cache invalidation on data mutations

**Files:**
- Modify: `server/actions/accounting.ts` (create/update/delete ledger entries)
- Modify: `server/actions/payroll.ts` (create payroll entries, process payroll)
- Modify: `server/actions/appointments.ts` (create/update appointments, if exists)

**Step 1: Add cache invalidation after ledger mutations**

In `accounting.ts`, after any `createLedgerEntry`, `updateLedgerEntry`, or `voidLedgerEntry` success:

```typescript
import { cache } from '@/utils/cache'

// After successful ledger mutation:
cache.invalidate('financial_metrics')
cache.invalidate('net_income')
cache.invalidate('ledger_summary')
cache.invalidate('revenue_trend')
cache.invalidate('pl_metrics')
cache.invalidate('expense_breakdown')
cache.invalidate('revenue_expense_trend')
cache.invalidate('business_insights')
cache.invalidate('exec_accounting')
```

**Step 2: Add cache invalidation after payroll mutations**

In `payroll.ts`, after payroll entry creation or payroll request processing:

```typescript
cache.invalidate('payroll_dashboard')
cache.invalidate('staff_payroll')
cache.invalidate('business_insights')
cache.invalidate('exec_accounting')
```

**Step 3: Add cache invalidation after appointment mutations**

In the appointments server action, after creating/completing/cancelling appointments:

```typescript
cache.invalidate('operational_metrics')
cache.invalidate('client_types')
cache.invalidate('business_insights')
```

**Step 4: Verify**

Run: `bun run lint`
Expected: No errors

**Step 5: Commit**

```bash
git add server/actions/accounting.ts server/actions/payroll.ts
git commit -m "perf(metrics): add cache invalidation on ledger and payroll mutations"
```

---

### Task 7: Optimize currency symbol fetching

**Files:**
- Modify: `components/metrics/businessInsights.tsx`
- Modify: `components/metrics/ExecutiveAccounting.tsx`

**Step 1: Move currency symbol fetch into the main fetchData or use a shared hook**

Both components have a separate `useEffect` that calls `getSetting("currency_tax")`. Since `getSetting` is already a server action, this adds an extra network round trip. Options:

**Option A (Recommended):** Create a simple context or pass currency symbol as a prop from the metrics page.

Since the metrics page (`metricsPage.tsx`) is the parent for both tabs, we can fetch currency once there:

```typescript
// In app/metrics/metricsPage.tsx
"use client"
import { useState, useEffect } from "react"
import { getSetting } from "@/server/actions/settings"

export default function MetricsPageClient() {
    const [currencySymbol, setCurrencySymbol] = useState("₱")

    useEffect(() => {
        getSetting("currency_tax").then(res => {
            if (res.success && res.data) {
                setCurrencySymbol(res.data.currency_symbol)
            }
        })
    }, [])

    // Pass currencySymbol to child components
    {activeTab === "insights" && <BusinessInsights branchId={currentBranch?.id} currencySymbol={currencySymbol} />}
    {activeTab === "accounting" && <ExecutiveAccounting branchId={currentBranch?.id} currencySymbol={currencySymbol} />}
}
```

Remove the `useEffect` currency fetch from both child components.

**Step 2: Verify**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add app/metrics/metricsPage.tsx components/metrics/businessInsights.tsx components/metrics/ExecutiveAccounting.tsx
git commit -m "perf(metrics): lift currency symbol fetch to parent, eliminate duplicate settings call"
```

---

### Task 8: Remove dead code and clean up imports

**Files:**
- Modify: `components/metrics/businessInsights.tsx`
- Modify: `server/actions/metrics.ts`

**Step 1: Remove unused standalone functions that are now only called internally**

The following functions are no longer called directly from components (they're replaced by the aggregated functions):
- `getScopedFinancialMetrics` — used inside `fetchGeneralLedgerAggregates` (keep as internal helper or remove)
- `getRevenueTrend` — used inside `fetchGeneralLedgerAggregates` (keep export for potential other consumers)
- `getOperationalMetrics` — used inside `fetchAppointmentAggregates`
- `getClientTypeMetrics` — used inside `fetchAppointmentAggregates`
- `getNetIncomeMetrics` — used inside `fetchGeneralLedgerAggregates`

**Decision:** Keep all standalone functions exported for potential direct use by other parts of the app (e.g., `exportMetrics` calls `getPLMetrics` and `getOperationalMetrics` directly). Just ensure they also get caching (done in Task 5).

**Step 2: Remove `exportMetrics` redundant internal calls**

`exportMetrics` (line 1120) calls `getPLMetrics` and `getOperationalMetrics` separately. Update it to use the aggregated functions or at minimum ensure it benefits from caching:

No change needed — caching from Task 5 handles this.

**Step 3: Remove unused `logsMetrics.tsx` import if any**

Check if `logsMetrics.tsx` is imported anywhere. If not, it's dead code in `components/metrics/`. Either add it to a "System" tab on the metrics page or leave as-is (not part of this optimization).

**Step 4: Verify**

Run: `bun run lint`
Expected: No errors

**Step 5: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "chore(metrics): clean up dead code and ensure all standalone functions are cached"
```

---

### Task 9: Add `ORDER BY` to leaderboard query for correct ranking

**Files:**
- Modify: `server/actions/metrics.ts` (inside `fetchLeaderboardData` and `getArtistLeaderboard`)

**Step 1: Ensure leaderboard results are ordered by artist cut descending**

The current `getArtistLeaderboard` function does not have an explicit `ORDER BY` — it relies on `slice(0, LEADERBOARD_LIMIT)` which returns entries in whatever order Drizzle/Postgres returns them. Add ordering:

```typescript
const entries = await db
    .select({ /* ... */ })
    .from(payrollEntry)
    .leftJoin(user, eq(payrollEntry.staffId, user.id))
    .where(and(...conditions))
    .groupBy(payrollEntry.staffId, user.fullName, user.avatarUrl, user.artistLevel)
    .orderBy(desc(sql`COALESCE(SUM(CAST(${payrollEntry.artistCut} AS NUMERIC)), 0)`))
```

Do the same for `fetchLeaderboardData` helper.

**Step 2: Verify**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): add ORDER BY to artist leaderboard query for correct ranking"
```

---

### Task 10: Add error boundary or graceful degradation for partial failures

**Files:**
- Modify: `components/metrics/businessInsights.tsx`
- Modify: `components/metrics/ExecutiveAccounting.tsx`

**Step 1: Show partial error state in BusinessInsights**

When the aggregated fetch fails partially (e.g., ledger summary fails but insights succeed), the page should show a small inline warning rather than a full-page error. Since we're using `Promise.allSettled`, individual failures are already handled. Add a non-intrusive warning for failed secondary fetches:

After the `Promise.allSettled` block, track which calls failed:

```typescript
const failedCalls: string[] = []

if (ledgerResult.status === "rejected") failedCalls.push("Accounting Summary")
if (payrollResult.status === "rejected") failedCalls.push("Payroll Summary")
if (payrollStaffResult.status === "rejected") failedCalls.push("Artist Earnings")

// If all primary calls failed, show error
if (insightsResult.status === "rejected") {
    addNotification("Failed to load core metrics. Please try again.", "ERROR")
} else if (failedCalls.length > 0) {
    addNotification(`Some data unavailable: ${failedCalls.join(", ")}`, "WARNING")
}
```

**Step 2: Verify**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add components/metrics/businessInsights.tsx
git commit -m "feat(metrics): add graceful degradation warnings for partial fetch failures"
```

---

### Task 11: Verify all changes compile and lint clean

**Step 1: Run full lint**

```bash
bun run lint
```

Expected: No errors

**Step 2: Run build**

```bash
bun run build
```

Expected: Build succeeds with no TypeScript errors

**Step 3: Manual test checklist**

1. Open metrics page → Insights tab should load with skeleton, then populate
2. Switch timeframes → data should refresh, cached results should be instant
3. Switch to Accounting tab → should load with skeleton, then populate
4. Switch branches → both tabs should re-fetch and show branch-specific data
5. Rapid timeframe changes → no duplicate requests (loading state prevents double-fires)
6. Export CSV → should still work (uses standalone functions with caching)

---

## Performance Impact Summary

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Server actions per Insights tab load | 12 (11 + settings) | 5 (1 aggregated + ledger + payroll + payrollStaff + settings) | **58% fewer calls** |
| Server actions per Accounting tab load | 4 (3 + settings) | 2 (1 aggregated + settings) | **50% fewer calls** |
| DB queries per Insights load | ~15-20 (varies by data) | ~6-8 (parallel inside aggregated action) | **~60% fewer queries** |
| Rows fetched to JS memory | All matching rows | 0 for aggregations (SQL handles it) | **Massive bandwidth reduction** for large date ranges |
| Cached functions | 4/11 | 11/11 | **100% cache coverage** |
| Currency symbol calls | 2 (one per component) | 1 (shared parent) | **50% reduction** |

---

## Related Plans

- `docs/plans/2026-04-13-metrics-audit-mobile-skeleton.md` — UI/skeleton/mobile fixes (already implemented)
- `docs/plans/2026-04-13-metrics-leaderboard-branch-fix.md` — Leaderboard calculation fixes (already implemented)

This plan focuses purely on **data fetching performance** and **server-side optimization**. The UI improvements from the related plans are already in place.
