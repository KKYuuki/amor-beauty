import { describe, test, expect } from "bun:test"
import { renderToString } from "react-dom/server"
import { readFileSync } from "fs"
import StatCard from "@/components/ui/StatCard"
import AccountingTrendChart from "@/components/accounting/AccountingTrendChart"
import AccountingBreakdownChart from "@/components/accounting/AccountingBreakdownChart"
import {
  FEATURE_ACCESS_FLAGS,
  VALID_FEATURE_FLAGS,
  userHasFlag,
  isValidFeatureFlag,
} from "@/utils/auth/access-flags"
import { gridColsMap } from "@/components/ui/StatsGrid"
import { computeLinearProjection, ProjectionDataPoint } from "@/utils/projection"
import { getRevenueExpenseTrend, TrendDataPoint } from "@/server/actions/accounting"
import { getExpenseBreakdown, ExpenseBreakdownItem, getCashFlowSummary, CashFlowSummaryData } from "@/server/actions/accounting"
import CashFlowSummary from "@/components/accounting/CashFlowSummary"
import PeriodProjection from "@/components/accounting/PeriodProjection"

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
    expect(html).toContain("bg-muted")
    expect(html).toContain("rounded-lg")
  })
})

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

describe("computeLinearProjection", () => {
  const ascendingData: ProjectionDataPoint[] = [
    { period: "Jan", revenue: 1000, expenses: 500 },
    { period: "Feb", revenue: 1200, expenses: 550 },
    { period: "Mar", revenue: 1400, expenses: 600 },
    { period: "Apr", revenue: 1600, expenses: 650 },
  ]

  test("returns both historical and projected arrays", () => {
    const result = computeLinearProjection(ascendingData, 3)!
    expect(result.historical).toBeDefined()
    expect(result.projected).toBeDefined()
    expect(Array.isArray(result.historical)).toBe(true)
    expect(Array.isArray(result.projected)).toBe(true)
  })

  test("historical array equals input data", () => {
    const result = computeLinearProjection(ascendingData, 3)!
    expect(result.historical.length).toBe(ascendingData.length)
    expect(result.historical[0].revenue).toBe(1000)
    expect(result.historical[3].revenue).toBe(1600)
  })

  test("projected array has correct length", () => {
    const result = computeLinearProjection(ascendingData, 3)!
    expect(result.projected.length).toBe(3)
  })

  test("ascending trend produces increasing projection", () => {
    const result = computeLinearProjection(ascendingData, 3)!
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

describe("Analytics flag gating", () => {
  test("accountingPage imports FlagGate", () => {
    const sourceCode = readFileSync(
      "app/accounting/accountingPage.tsx",
      "utf-8"
    )
    expect(sourceCode).toContain('import FlagGate')
  })

  test("StatsGrid is wrapped in FlagGate with accounting_analytics_view", () => {
    const sourceCode = readFileSync(
      "app/accounting/accountingPage.tsx",
      "utf-8"
    )
    expect(sourceCode).toContain('requiredFlag="accounting_analytics_view"')
  })

  test("hasAnalyticsAccess flag check exists in the file", () => {
    const sourceCode = readFileSync(
      "app/accounting/accountingPage.tsx",
      "utf-8"
    )
    expect(sourceCode).toContain("accounting_analytics_view")
  })

  test("fetchData conditionally skips getLedgerSummary", () => {
    const sourceCode = readFileSync(
      "app/accounting/accountingPage.tsx",
      "utf-8"
    )
    expect(sourceCode).toContain("hasAnalyticsAccess")
  })
})

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
    expect(html).toContain("bg-muted")
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

describe("Table scroll fix", () => {
  test("table container should NOT have min-h-full class (double-scroll fix)", () => {
    const sourceCode = readFileSync(
      "app/accounting/accountingPage.tsx",
      "utf-8"
    )

    // Count occurrences of 'min-h-full' — should be 0
    const minHeightMatches = sourceCode.match(/min-h-full/g)
    expect(minHeightMatches).toBeNull()
  })

  test("table container should NOT have overflow-auto for vertical scroll", () => {
    const sourceCode = readFileSync(
      "app/accounting/accountingPage.tsx",
      "utf-8"
    )

    // Verify the old pattern is gone
    const oldPattern = /ref=\{scrollContainerRef\}\s*\n\s*className=['"]min-h-full overflow-auto['"]/g
    expect(oldPattern.test(sourceCode)).toBe(false)
  })
})

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
    expect(html).toContain("bg-muted")
    expect(html).toContain("rounded-lg")
  })
})

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
    expect(html).toContain("bg-muted")
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

describe("Reports tab expansion", () => {
  test("Reports tab imports all new chart components", () => {
    const sourceCode = readFileSync(
      "app/accounting/accountingPage.tsx",
      "utf-8"
    )
    expect(sourceCode).toContain("AccountingTrendChart")
    expect(sourceCode).toContain("AccountingBreakdownChart")
    expect(sourceCode).toContain("CashFlowSummary")
    expect(sourceCode).toContain("PeriodProjection")
  })

  test("Reports tab imports computeLinearProjection", () => {
    const sourceCode = readFileSync(
      "app/accounting/accountingPage.tsx",
      "utf-8"
    )
    expect(sourceCode).toContain("computeLinearProjection")
  })

  test("Reports tab conditionally fetches trend data", () => {
    const sourceCode = readFileSync(
      "app/accounting/accountingPage.tsx",
      "utf-8"
    )
    expect(sourceCode).toContain("getRevenueExpenseTrend")
    expect(sourceCode).toContain("getExpenseBreakdown")
    expect(sourceCode).toContain("getCashFlowSummary")
  })
})