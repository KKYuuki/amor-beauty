import ExcelJS from 'exceljs'

const CHART_STYLE = 2
const CHART_BAR_COLOR = '3B82F6'

export interface ChartData {
    labels: string[]
    values: number[]
    title: string
    type: 'bar' | 'pie' | 'line'
    seriesName: string
}

export function addBarChart(
    worksheet: ExcelJS.Worksheet,
    data: ChartData,
    startRow: number,
    startCol: number,
    width: number = 15,
    height: number = 10
): void {
    if (data.labels.length !== data.values.length) {
        throw new Error('Chart data mismatch: labels and values must have same length')
    }
    try {
        const chart = (worksheet as unknown as { addChart: (type: string) => { title: string; style: number; addSeries: (s: unknown) => unknown; setPosition: (r: number, c: number) => void; setSize: (w: number, h: number) => void } }).addChart(
            data.type === 'bar' ? 'bar' : data.type === 'pie' ? 'pie' : 'line'
        )
        chart.title = data.title
        chart.style = CHART_STYLE

        const series = chart.addSeries({
            name: data.seriesName,
            values: data.values,
            categories: data.labels,
        }) as { fill?: { color: { argb: string } } }

        if (data.type === 'bar') {
            series.fill = { color: { argb: CHART_BAR_COLOR } }
        }

        chart.setPosition(startRow, startCol)
        chart.setSize(width, height)
    } catch (e) {
        console.warn(`Chart creation failed: ${data.title}`, e)
    }
}

export function addPaymentMethodDistributionChart(
    worksheet: ExcelJS.Worksheet,
    methods: { method: string; label: string; total: number }[],
    startRow: number,
    startCol: number
): void {
    addBarChart(
        worksheet,
        {
            labels: methods.map(m => m.label),
            values: methods.map(m => m.total),
            title: 'Payment Method Distribution',
            type: 'bar',
            seriesName: 'Amount',
        },
        startRow,
        startCol
    )
}

export function addCategoryBreakdownChart(
    worksheet: ExcelJS.Worksheet,
    categories: { category: string; total: number }[],
    startRow: number,
    startCol: number
): void {
    addBarChart(
        worksheet,
        {
            labels: categories.map(c => c.category),
            values: categories.map(c => c.total),
            title: 'Category Breakdown',
            type: 'pie',
            seriesName: 'Amount',
        },
        startRow,
        startCol
    )
}

export function addRevenueExpenseTrendChart(
    worksheet: ExcelJS.Worksheet,
    trend: { date: string; revenue: number; expenses: number }[],
    startRow: number,
    startCol: number
): void {
    try {
        const chart = (worksheet as unknown as { addChart: (type: string) => { title: string; style: number; addSeries: (s: unknown) => unknown; setPosition: (r: number, c: number) => void; setSize: (w: number, h: number) => void } }).addChart('line')
        chart.title = 'Revenue vs Expenses Trend'
        chart.style = 2

        chart.addSeries({
            name: 'Revenue',
            values: trend.map(t => t.revenue),
            categories: trend.map(t => t.date),
        })

        chart.addSeries({
            name: 'Expenses',
            values: trend.map(t => t.expenses),
            categories: trend.map(t => t.date),
        })

        chart.setPosition(startRow, startCol)
        chart.setSize(15, 10)
    } catch (e) {
        console.warn('Chart creation failed: Revenue vs Expenses Trend', e)
    }
}
