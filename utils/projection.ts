/**
 * Data point for time-series trend data used in projection.
 * period is a label string (e.g., "Jan 2026", "Week 1", "2026-05-01").
 */
export interface ProjectionDataPoint {
  period: string
  revenue: number
  expenses: number
}

/**
 * Result of linear projection computation.
 * historical: original input data
 * projected: extrapolated future periods (if sufficient data)
 */
export interface ProjectionResult {
  historical: ProjectionDataPoint[]
  projected: ProjectionDataPoint[]
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/**
 * Tries to parse a period label as a short month name and return the next N months.
 * Falls back to generic "Proj N" labels if parsing fails.
 */
function getNextPeriodLabels(lastLabel: string, count: number): string[] {
  const labels: string[] = []
  const monthIdx = MONTHS.indexOf(lastLabel)

  if (monthIdx !== -1) {
    for (let i = 1; i <= count; i++) {
      labels.push(MONTHS[(monthIdx + i) % 12])
    }
  } else {
    for (let i = 1; i <= count; i++) {
      labels.push(`Proj ${i}`)
    }
  }

  return labels
}

/**
 * Simple linear regression: y = slope * x + intercept
 * Returns { slope, intercept } or null if insufficient data.
 */
function linearRegression(values: number[]): { slope: number; intercept: number } | null {
  const n = values.length
  if (n < 2) return null

  const xValues = values.map((_, i) => i)
  const xMean = xValues.reduce((a, b) => a + b, 0) / n
  const yMean = values.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let denominator = 0

  for (let i = 0; i < n; i++) {
    numerator += (xValues[i] - xMean) * (values[i] - yMean)
    denominator += (xValues[i] - xMean) ** 2
  }

  if (denominator === 0) return { slope: 0, intercept: yMean }

  const slope = numerator / denominator
  const intercept = yMean - slope * xMean

  return { slope, intercept }
}

/**
 * Computes a linear projection from historical time-series data.
 * Requires at least 3 data points for a meaningful projection.
 * Clamps resulting values at 0 to prevent negative projections.
 *
 * @param data - Historical time-series data (revenue + expenses per period)
 * @param periods - Number of future periods to project
 * @returns ProjectionResult with historical and projected arrays, or null if < 3 data points
 */
export function computeLinearProjection(
  data: ProjectionDataPoint[],
  periods: number
): ProjectionResult | null {
  if (data.length < 3) return null

  const revenueValues = data.map(d => d.revenue)
  const expenseValues = data.map(d => d.expenses)

  const revenueReg = linearRegression(revenueValues)
  const expenseReg = linearRegression(expenseValues)

  if (!revenueReg || !expenseReg) return null

  const labels = getNextPeriodLabels(
    data[data.length - 1].period,
    periods
  )

  const n = data.length
  const projected: ProjectionDataPoint[] = []

  for (let i = 0; i < periods; i++) {
    const x = n + i
    const revenue = Math.max(0, Math.round(revenueReg.slope * x + revenueReg.intercept))
    const expenses = Math.max(0, Math.round(expenseReg.slope * x + expenseReg.intercept))
    projected.push({
      period: labels[i],
      revenue,
      expenses,
    })
  }

  return { historical: data, projected }
}