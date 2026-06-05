import ExcelJS from 'exceljs'
import {
    SummaryKPI,
} from './types'
import {
    COLORS,
    FONTS,
    FILLS,
    BORDERS,
    ALIGNMENTS,
    NUMBER_FORMATS,
} from './styling'
import {
    addSectionHeader,
    addHeaderRow,
    addKPISection,
} from './worksheet-builder'
import {
    addBarChart,
    addRevenueExpenseTrendChart,
} from './chart-builder'

type BorderStyle = Partial<ExcelJS.Borders>
const b = BORDERS as Record<keyof typeof BORDERS, BorderStyle>

export interface MetricsData {
    revenue: number
    expenses: number
    netIncome: number
    transactionCount: number
    averageTicket: number
    growthRate?: number
}

export interface TrendDataPoint {
    date: string
    revenue: number
    expenses: number
    netIncome: number
}

export interface OperationalMetric {
    label: string
    value: number
    format: 'currency' | 'number' | 'percent'
}

export interface CategoryBreakdownItem {
    category: string
    revenue: number
    expenses: number
    netAmount: number
}

export interface PaymentMethodItem {
    method: string
    total: number
    transactionCount: number
}

export interface BranchMetricsItem {
    branch: string
    revenue: number
    expenses: number
    netIncome: number
    transactionCount: number
}

export interface StaffPerformanceItem {
    staffName: string
    revenue: number
    appointments: number
    averageTicket: number
    completionRate: number
}

export interface InventoryMetricItem {
    itemName: string
    quantity: number
    revenue: number
    stockLevel: number
}

export function buildMetricsSummarySheet(
    worksheet: ExcelJS.Worksheet,
    metrics: MetricsData,
    options: {
        title?: string
        subtitle?: string
        startDate?: string
        endDate?: string
        generatedAt?: string
    }
): void {
    try {
        worksheet.properties.tabColor = { argb: COLORS.summaryTabGreen }
    } catch (error) {
        console.error('Failed to set worksheet tab color:', error)
    }

    let currentRow = 1

    worksheet.mergeCells(1, 1, 1, 6)
    const titleCell = worksheet.getCell(1, 1)
    titleCell.value = options.title || 'Metrics Summary'
    titleCell.font = FONTS.title
    titleCell.alignment = ALIGNMENTS.center
    worksheet.getRow(1).height = 24
    currentRow = 3

    if (options.startDate && options.endDate) {
        worksheet.mergeCells(currentRow, 1, currentRow, 6)
        const dateRangeCell = worksheet.getCell(currentRow, 1)
        dateRangeCell.value = `Period: ${options.startDate} - ${options.endDate}`
        dateRangeCell.font = FONTS.body
        dateRangeCell.alignment = ALIGNMENTS.center
        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    const timestamp = options.generatedAt || new Date().toISOString()
    worksheet.mergeCells(currentRow, 1, currentRow, 6)
    const timestampCell = worksheet.getCell(currentRow, 1)
    timestampCell.value = `Generated: ${timestamp}`
    timestampCell.font = { ...FONTS.body, size: 9 }
    timestampCell.alignment = ALIGNMENTS.center
    worksheet.getRow(currentRow).height = 16
    currentRow += 2

    const kpis: SummaryKPI[] = [
        {
            label: 'Total Revenue',
            value: metrics.revenue,
            format: 'currency',
            color: COLORS.kpiPositive,
            trend: metrics.growthRate !== undefined ? {
                direction: metrics.growthRate >= 0 ? 'up' : 'down',
                percentChange: Math.abs(metrics.growthRate),
            } : undefined,
        },
        {
            label: 'Total Expenses',
            value: metrics.expenses,
            format: 'currency',
            color: COLORS.kpiNegative,
        },
        {
            label: 'Net Income',
            value: metrics.netIncome,
            format: 'currency',
            color: metrics.netIncome >= 0 ? COLORS.kpiPositive : COLORS.kpiNegative,
        },
        {
            label: 'Transactions',
            value: metrics.transactionCount,
            format: 'number',
            color: COLORS.kpiNeutral,
        },
    ]

    currentRow = addKPISection(worksheet, kpis, currentRow)
    currentRow++

    const avgTicketRow = currentRow
    worksheet.mergeCells(avgTicketRow, 1, avgTicketRow, 2)
    const avgTicketLabelCell = worksheet.getCell(avgTicketRow, 1)
    avgTicketLabelCell.value = 'Average Ticket'
    avgTicketLabelCell.font = FONTS.body
    avgTicketLabelCell.fill = FILLS.altRow1
    avgTicketLabelCell.border = b.body
    avgTicketLabelCell.alignment = ALIGNMENTS.left

    worksheet.mergeCells(avgTicketRow, 3, avgTicketRow, 4)
    const avgTicketValueCell = worksheet.getCell(avgTicketRow, 3)
    avgTicketValueCell.value = metrics.averageTicket
    avgTicketValueCell.numFmt = NUMBER_FORMATS.currency
    avgTicketValueCell.font = FONTS.body
    avgTicketValueCell.fill = FILLS.altRow1
    avgTicketValueCell.border = b.body
    avgTicketValueCell.alignment = ALIGNMENTS.right

    worksheet.getRow(avgTicketRow).height = 18
}

export function buildRevenueTrendSheet(
    worksheet: ExcelJS.Worksheet,
    trendData: TrendDataPoint[],
    options: {
        title?: string
        subtitle?: string
        startDate?: string
        endDate?: string
        generatedAt?: string
    }
): void {
    try {
        worksheet.properties.tabColor = { argb: COLORS.branchTabBlue }
    } catch (error) {
        console.error('Failed to set worksheet tab color:', error)
    }

    let currentRow = 1

    worksheet.mergeCells(1, 1, 1, 6)
    const titleCell = worksheet.getCell(1, 1)
    titleCell.value = options.title || 'Revenue Trend Analysis'
    titleCell.font = FONTS.title
    titleCell.alignment = ALIGNMENTS.center
    worksheet.getRow(1).height = 24
    currentRow = 3

    if (options.startDate && options.endDate) {
        worksheet.mergeCells(currentRow, 1, currentRow, 6)
        const dateRangeCell = worksheet.getCell(currentRow, 1)
        dateRangeCell.value = `Period: ${options.startDate} - ${options.endDate}`
        dateRangeCell.font = FONTS.body
        dateRangeCell.alignment = ALIGNMENTS.center
        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    const timestamp = options.generatedAt || new Date().toISOString()
    worksheet.mergeCells(currentRow, 1, currentRow, 6)
    const timestampCell = worksheet.getCell(currentRow, 1)
    timestampCell.value = `Generated: ${timestamp}`
    timestampCell.font = { ...FONTS.body, size: 9 }
    timestampCell.alignment = ALIGNMENTS.center
    worksheet.getRow(currentRow).height = 16
    currentRow += 2

    const trendColumns = [
        { key: 'date', header: 'Date', width: 14, format: 'date' as const, align: 'center' as const },
        { key: 'revenue', header: 'Revenue', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'expenses', header: 'Expenses', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'netIncome', header: 'Net Income', width: 16, format: 'currency' as const, align: 'right' as const },
    ]

    addHeaderRow(worksheet, trendColumns, currentRow, true)
    currentRow++

    for (let i = 0; i < trendData.length; i++) {
        const point = trendData[i]
        const fill = i % 2 === 0 ? FILLS.altRow1 : FILLS.altRow2

        worksheet.getCell(currentRow, 1).value = point.date
        worksheet.getCell(currentRow, 1).numFmt = NUMBER_FORMATS.date
        worksheet.getCell(currentRow, 1).font = FONTS.body
        worksheet.getCell(currentRow, 1).fill = fill
        worksheet.getCell(currentRow, 1).border = b.body
        worksheet.getCell(currentRow, 1).alignment = ALIGNMENTS.center

        worksheet.getCell(currentRow, 2).value = point.revenue
        worksheet.getCell(currentRow, 2).numFmt = NUMBER_FORMATS.currency
        worksheet.getCell(currentRow, 2).font = FONTS.body
        worksheet.getCell(currentRow, 2).fill = fill
        worksheet.getCell(currentRow, 2).border = b.body
        worksheet.getCell(currentRow, 2).alignment = ALIGNMENTS.right

        worksheet.getCell(currentRow, 3).value = point.expenses
        worksheet.getCell(currentRow, 3).numFmt = NUMBER_FORMATS.currency
        worksheet.getCell(currentRow, 3).font = FONTS.body
        worksheet.getCell(currentRow, 3).fill = fill
        worksheet.getCell(currentRow, 3).border = b.body
        worksheet.getCell(currentRow, 3).alignment = ALIGNMENTS.right

        worksheet.getCell(currentRow, 4).value = point.netIncome
        worksheet.getCell(currentRow, 4).numFmt = NUMBER_FORMATS.currency
        worksheet.getCell(currentRow, 4).font = FONTS.body
        worksheet.getCell(currentRow, 4).fill = fill
        worksheet.getCell(currentRow, 4).border = b.body
        worksheet.getCell(currentRow, 4).alignment = ALIGNMENTS.right

        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    if (trendData.length > 0) {
        currentRow++
        const totalsRow = worksheet.getRow(currentRow)
        totalsRow.getCell(1).value = 'Total'
        totalsRow.getCell(1).font = FONTS.subtotal
        totalsRow.getCell(1).fill = FILLS.subtotal
        totalsRow.getCell(1).border = b.subtotal
        totalsRow.getCell(1).alignment = ALIGNMENTS.left

        const totalRevenue = trendData.reduce((sum, p) => sum + p.revenue, 0)
        const totalExpenses = trendData.reduce((sum, p) => sum + p.expenses, 0)
        const totalNetIncome = trendData.reduce((sum, p) => sum + p.netIncome, 0)

        totalsRow.getCell(2).value = totalRevenue
        totalsRow.getCell(2).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(2).font = FONTS.subtotal
        totalsRow.getCell(2).fill = FILLS.subtotal
        totalsRow.getCell(2).border = b.subtotal
        totalsRow.getCell(2).alignment = ALIGNMENTS.right

        totalsRow.getCell(3).value = totalExpenses
        totalsRow.getCell(3).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(3).font = FONTS.subtotal
        totalsRow.getCell(3).fill = FILLS.subtotal
        totalsRow.getCell(3).border = b.subtotal
        totalsRow.getCell(3).alignment = ALIGNMENTS.right

        totalsRow.getCell(4).value = totalNetIncome
        totalsRow.getCell(4).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(4).font = FONTS.subtotal
        totalsRow.getCell(4).fill = FILLS.subtotal
        totalsRow.getCell(4).border = b.subtotal
        totalsRow.getCell(4).alignment = ALIGNMENTS.right

        totalsRow.height = 22
        currentRow += 2

        addRevenueExpenseTrendChart(worksheet, trendData, currentRow, 1)
    }
}

export function buildOperationalMetricsSheet(
    worksheet: ExcelJS.Worksheet,
    metrics: OperationalMetric[],
    options: {
        title?: string
        subtitle?: string
        startDate?: string
        endDate?: string
        generatedAt?: string
    }
): void {
    try {
        worksheet.properties.tabColor = { argb: COLORS.kpiNeutral }
    } catch (error) {
        console.error('Failed to set worksheet tab color:', error)
    }

    let currentRow = 1

    worksheet.mergeCells(1, 1, 1, 4)
    const titleCell = worksheet.getCell(1, 1)
    titleCell.value = options.title || 'Operational Metrics'
    titleCell.font = FONTS.title
    titleCell.alignment = ALIGNMENTS.center
    worksheet.getRow(1).height = 24
    currentRow = 3

    if (options.startDate && options.endDate) {
        worksheet.mergeCells(currentRow, 1, currentRow, 4)
        const dateRangeCell = worksheet.getCell(currentRow, 1)
        dateRangeCell.value = `Period: ${options.startDate} - ${options.endDate}`
        dateRangeCell.font = FONTS.body
        dateRangeCell.alignment = ALIGNMENTS.center
        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    const timestamp = options.generatedAt || new Date().toISOString()
    worksheet.mergeCells(currentRow, 1, currentRow, 4)
    const timestampCell = worksheet.getCell(currentRow, 1)
    timestampCell.value = `Generated: ${timestamp}`
    timestampCell.font = { ...FONTS.body, size: 9 }
    timestampCell.alignment = ALIGNMENTS.center
    worksheet.getRow(currentRow).height = 16
    currentRow += 2

    const opColumns = [
        { key: 'label', header: 'Metric', width: 30, format: 'text' as const, align: 'left' as const },
        { key: 'value', header: 'Value', width: 20, format: 'text' as const, align: 'right' as const },
    ]

    addHeaderRow(worksheet, opColumns, currentRow, false)
    currentRow++

    for (let i = 0; i < metrics.length; i++) {
        const metric = metrics[i]
        const fill = i % 2 === 0 ? FILLS.altRow1 : FILLS.altRow2

        worksheet.getCell(currentRow, 1).value = metric.label
        worksheet.getCell(currentRow, 1).font = FONTS.body
        worksheet.getCell(currentRow, 1).fill = fill
        worksheet.getCell(currentRow, 1).border = b.body
        worksheet.getCell(currentRow, 1).alignment = ALIGNMENTS.left

        const valueCell = worksheet.getCell(currentRow, 2)
        if (metric.format === 'currency') {
            valueCell.value = metric.value
            valueCell.numFmt = NUMBER_FORMATS.currency
        } else if (metric.format === 'percent') {
            valueCell.value = metric.value
            valueCell.numFmt = NUMBER_FORMATS.percent
        } else {
            valueCell.value = metric.value
            valueCell.numFmt = NUMBER_FORMATS.integer
        }
        valueCell.font = FONTS.body
        valueCell.fill = fill
        valueCell.border = b.body
        valueCell.alignment = ALIGNMENTS.right

        worksheet.getRow(currentRow).height = 18
        currentRow++
    }
}

export function buildCategoryBreakdownSheet(
    worksheet: ExcelJS.Worksheet,
    categories: CategoryBreakdownItem[],
    options: {
        title?: string
        subtitle?: string
        startDate?: string
        endDate?: string
        generatedAt?: string
        includeChart?: boolean
    }
): void {
    try {
        worksheet.properties.tabColor = { argb: COLORS.sectionBg }
    } catch (error) {
        console.error('Failed to set worksheet tab color:', error)
    }

    let currentRow = 1

    worksheet.mergeCells(1, 1, 1, 4)
    const titleCell = worksheet.getCell(1, 1)
    titleCell.value = options.title || 'Category Breakdown'
    titleCell.font = FONTS.title
    titleCell.alignment = ALIGNMENTS.center
    worksheet.getRow(1).height = 24
    currentRow = 3

    if (options.startDate && options.endDate) {
        worksheet.mergeCells(currentRow, 1, currentRow, 4)
        const dateRangeCell = worksheet.getCell(currentRow, 1)
        dateRangeCell.value = `Period: ${options.startDate} - ${options.endDate}`
        dateRangeCell.font = FONTS.body
        dateRangeCell.alignment = ALIGNMENTS.center
        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    const timestamp = options.generatedAt || new Date().toISOString()
    worksheet.mergeCells(currentRow, 1, currentRow, 4)
    const timestampCell = worksheet.getCell(currentRow, 1)
    timestampCell.value = `Generated: ${timestamp}`
    timestampCell.font = { ...FONTS.body, size: 9 }
    timestampCell.alignment = ALIGNMENTS.center
    worksheet.getRow(currentRow).height = 16
    currentRow += 2

    const catColumns = [
        { key: 'category', header: 'Category', width: 30, format: 'text' as const, align: 'left' as const },
        { key: 'revenue', header: 'Revenue', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'expenses', header: 'Expenses', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'netAmount', header: 'Net', width: 16, format: 'currency' as const, align: 'right' as const },
    ]

    addHeaderRow(worksheet, catColumns, currentRow, true)
    currentRow++

    let totalRevenue = 0
    let totalExpenses = 0
    let totalNet = 0

    for (let i = 0; i < categories.length; i++) {
        const cat = categories[i]
        const fill = i % 2 === 0 ? FILLS.altRow1 : FILLS.altRow2

        totalRevenue += cat.revenue
        totalExpenses += cat.expenses
        totalNet += cat.netAmount

        worksheet.getCell(currentRow, 1).value = cat.category
        worksheet.getCell(currentRow, 1).font = FONTS.body
        worksheet.getCell(currentRow, 1).fill = fill
        worksheet.getCell(currentRow, 1).border = b.body
        worksheet.getCell(currentRow, 1).alignment = ALIGNMENTS.left

        worksheet.getCell(currentRow, 2).value = cat.revenue
        worksheet.getCell(currentRow, 2).numFmt = NUMBER_FORMATS.currency
        worksheet.getCell(currentRow, 2).font = FONTS.body
        worksheet.getCell(currentRow, 2).fill = fill
        worksheet.getCell(currentRow, 2).border = b.body
        worksheet.getCell(currentRow, 2).alignment = ALIGNMENTS.right

        worksheet.getCell(currentRow, 3).value = cat.expenses
        worksheet.getCell(currentRow, 3).numFmt = NUMBER_FORMATS.currency
        worksheet.getCell(currentRow, 3).font = FONTS.body
        worksheet.getCell(currentRow, 3).fill = fill
        worksheet.getCell(currentRow, 3).border = b.body
        worksheet.getCell(currentRow, 3).alignment = ALIGNMENTS.right

        worksheet.getCell(currentRow, 4).value = cat.netAmount
        worksheet.getCell(currentRow, 4).numFmt = NUMBER_FORMATS.currency
        worksheet.getCell(currentRow, 4).font = FONTS.body
        worksheet.getCell(currentRow, 4).fill = fill
        worksheet.getCell(currentRow, 4).border = b.body
        worksheet.getCell(currentRow, 4).alignment = ALIGNMENTS.right

        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    if (categories.length > 0) {
        currentRow++
        const totalsRow = worksheet.getRow(currentRow)
        totalsRow.getCell(1).value = 'Total'
        totalsRow.getCell(1).font = FONTS.subtotal
        totalsRow.getCell(1).fill = FILLS.subtotal
        totalsRow.getCell(1).border = b.subtotal
        totalsRow.getCell(1).alignment = ALIGNMENTS.left

        totalsRow.getCell(2).value = totalRevenue
        totalsRow.getCell(2).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(2).font = FONTS.subtotal
        totalsRow.getCell(2).fill = FILLS.subtotal
        totalsRow.getCell(2).border = b.subtotal
        totalsRow.getCell(2).alignment = ALIGNMENTS.right

        totalsRow.getCell(3).value = totalExpenses
        totalsRow.getCell(3).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(3).font = FONTS.subtotal
        totalsRow.getCell(3).fill = FILLS.subtotal
        totalsRow.getCell(3).border = b.subtotal
        totalsRow.getCell(3).alignment = ALIGNMENTS.right

        totalsRow.getCell(4).value = totalNet
        totalsRow.getCell(4).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(4).font = FONTS.subtotal
        totalsRow.getCell(4).fill = FILLS.subtotal
        totalsRow.getCell(4).border = b.subtotal
        totalsRow.getCell(4).alignment = ALIGNMENTS.right

        totalsRow.height = 22
        currentRow += 2

        if (options.includeChart !== false && categories.length > 0) {
            const chartCategories = categories.map(c => ({
                category: c.category,
                total: c.netAmount,
            }))
            addBarChart(worksheet, {
                labels: chartCategories.map(c => c.category),
                values: chartCategories.map(c => c.total),
                title: 'Category Distribution',
                type: 'pie',
                seriesName: 'Net',
            }, currentRow, 1, 15, 10)
        }
    }
}

export function buildPaymentMethodBreakdownSheet(
    worksheet: ExcelJS.Worksheet,
    methods: PaymentMethodItem[],
    options: {
        title?: string
        subtitle?: string
        startDate?: string
        endDate?: string
        generatedAt?: string
        includeChart?: boolean
    }
): void {
    try {
        worksheet.properties.tabColor = { argb: COLORS.kpiPositive }
    } catch (error) {
        console.error('Failed to set worksheet tab color:', error)
    }

    let currentRow = 1

    worksheet.mergeCells(1, 1, 1, 4)
    const titleCell = worksheet.getCell(1, 1)
    titleCell.value = options.title || 'Payment Method Breakdown'
    titleCell.font = FONTS.title
    titleCell.alignment = ALIGNMENTS.center
    worksheet.getRow(1).height = 24
    currentRow = 3

    if (options.startDate && options.endDate) {
        worksheet.mergeCells(currentRow, 1, currentRow, 4)
        const dateRangeCell = worksheet.getCell(currentRow, 1)
        dateRangeCell.value = `Period: ${options.startDate} - ${options.endDate}`
        dateRangeCell.font = FONTS.body
        dateRangeCell.alignment = ALIGNMENTS.center
        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    const timestamp = options.generatedAt || new Date().toISOString()
    worksheet.mergeCells(currentRow, 1, currentRow, 4)
    const timestampCell = worksheet.getCell(currentRow, 1)
    timestampCell.value = `Generated: ${timestamp}`
    timestampCell.font = { ...FONTS.body, size: 9 }
    timestampCell.alignment = ALIGNMENTS.center
    worksheet.getRow(currentRow).height = 16
    currentRow += 2

    const pmColumns = [
        { key: 'method', header: 'Payment Method', width: 25, format: 'text' as const, align: 'left' as const },
        { key: 'transactionCount', header: 'Transactions', width: 14, format: 'number' as const, align: 'center' as const },
        { key: 'total', header: 'Amount', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'percentage', header: '% of Total', width: 12, format: 'percent' as const, align: 'right' as const },
    ]

    addHeaderRow(worksheet, pmColumns, currentRow, true)
    currentRow++

    let totalAmount = 0
    let totalTransactions = 0
    methods.forEach(m => {
        totalAmount += m.total
        totalTransactions += m.transactionCount
    })

    for (let i = 0; i < methods.length; i++) {
        const method = methods[i]
        const fill = i % 2 === 0 ? FILLS.altRow1 : FILLS.altRow2
        const percentage = totalAmount > 0 ? (method.total / totalAmount) * 100 : 0

        worksheet.getCell(currentRow, 1).value = method.method
        worksheet.getCell(currentRow, 1).font = FONTS.body
        worksheet.getCell(currentRow, 1).fill = fill
        worksheet.getCell(currentRow, 1).border = b.body
        worksheet.getCell(currentRow, 1).alignment = ALIGNMENTS.left

        worksheet.getCell(currentRow, 2).value = method.transactionCount
        worksheet.getCell(currentRow, 2).numFmt = NUMBER_FORMATS.integer
        worksheet.getCell(currentRow, 2).font = FONTS.body
        worksheet.getCell(currentRow, 2).fill = fill
        worksheet.getCell(currentRow, 2).border = b.body
        worksheet.getCell(currentRow, 2).alignment = ALIGNMENTS.center

        worksheet.getCell(currentRow, 3).value = method.total
        worksheet.getCell(currentRow, 3).numFmt = NUMBER_FORMATS.currency
        worksheet.getCell(currentRow, 3).font = FONTS.body
        worksheet.getCell(currentRow, 3).fill = fill
        worksheet.getCell(currentRow, 3).border = b.body
        worksheet.getCell(currentRow, 3).alignment = ALIGNMENTS.right

        worksheet.getCell(currentRow, 4).value = percentage
        worksheet.getCell(currentRow, 4).numFmt = NUMBER_FORMATS.percent
        worksheet.getCell(currentRow, 4).font = FONTS.body
        worksheet.getCell(currentRow, 4).fill = fill
        worksheet.getCell(currentRow, 4).border = b.body
        worksheet.getCell(currentRow, 4).alignment = ALIGNMENTS.right

        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    if (methods.length > 0) {
        currentRow++
        const totalsRow = worksheet.getRow(currentRow)
        totalsRow.getCell(1).value = 'Total'
        totalsRow.getCell(1).font = FONTS.subtotal
        totalsRow.getCell(1).fill = FILLS.subtotal
        totalsRow.getCell(1).border = b.subtotal
        totalsRow.getCell(1).alignment = ALIGNMENTS.left

        totalsRow.getCell(2).value = totalTransactions
        totalsRow.getCell(2).numFmt = NUMBER_FORMATS.integer
        totalsRow.getCell(2).font = FONTS.subtotal
        totalsRow.getCell(2).fill = FILLS.subtotal
        totalsRow.getCell(2).border = b.subtotal
        totalsRow.getCell(2).alignment = ALIGNMENTS.center

        totalsRow.getCell(3).value = totalAmount
        totalsRow.getCell(3).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(3).font = FONTS.subtotal
        totalsRow.getCell(3).fill = FILLS.subtotal
        totalsRow.getCell(3).border = b.subtotal
        totalsRow.getCell(3).alignment = ALIGNMENTS.right

        totalsRow.getCell(4).value = 1
        totalsRow.getCell(4).numFmt = NUMBER_FORMATS.percent
        totalsRow.getCell(4).font = FONTS.subtotal
        totalsRow.getCell(4).fill = FILLS.subtotal
        totalsRow.getCell(4).border = b.subtotal
        totalsRow.getCell(4).alignment = ALIGNMENTS.right

        totalsRow.height = 22
        currentRow += 2

        if (options.includeChart !== false && methods.length > 0) {
            addBarChart(worksheet, {
                labels: methods.map(m => m.method),
                values: methods.map(m => m.total),
                title: 'Payment Method Distribution',
                type: 'bar',
                seriesName: 'Amount',
            }, currentRow, 1, 15, 10)
        }
    }
}

export function buildBranchComparisonSheet(
    worksheet: ExcelJS.Worksheet,
    branches: BranchMetricsItem[],
    options: {
        title?: string
        subtitle?: string
        startDate?: string
        endDate?: string
        generatedAt?: string
    }
): void {
    try {
        worksheet.properties.tabColor = { argb: COLORS.branchTabBlue }
    } catch (error) {
        console.error('Failed to set worksheet tab color:', error)
    }

    let currentRow = 1

    worksheet.mergeCells(1, 1, 1, 5)
    const titleCell = worksheet.getCell(1, 1)
    titleCell.value = options.title || 'Branch Comparison'
    titleCell.font = FONTS.title
    titleCell.alignment = ALIGNMENTS.center
    worksheet.getRow(1).height = 24
    currentRow = 3

    if (options.startDate && options.endDate) {
        worksheet.mergeCells(currentRow, 1, currentRow, 5)
        const dateRangeCell = worksheet.getCell(currentRow, 1)
        dateRangeCell.value = `Period: ${options.startDate} - ${options.endDate}`
        dateRangeCell.font = FONTS.body
        dateRangeCell.alignment = ALIGNMENTS.center
        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    const timestamp = options.generatedAt || new Date().toISOString()
    worksheet.mergeCells(currentRow, 1, currentRow, 5)
    const timestampCell = worksheet.getCell(currentRow, 1)
    timestampCell.value = `Generated: ${timestamp}`
    timestampCell.font = { ...FONTS.body, size: 9 }
    timestampCell.alignment = ALIGNMENTS.center
    worksheet.getRow(currentRow).height = 16
    currentRow += 2

    const branchColumns = [
        { key: 'branch', header: 'Branch', width: 25, format: 'text' as const, align: 'left' as const },
        { key: 'revenue', header: 'Revenue', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'expenses', header: 'Expenses', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'netIncome', header: 'Net Income', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'transactionCount', header: 'Transactions', width: 14, format: 'number' as const, align: 'center' as const },
    ]

    addHeaderRow(worksheet, branchColumns, currentRow, true)
    currentRow++

    let totalRevenue = 0
    let totalExpenses = 0
    let totalNetIncome = 0
    let totalTransactions = 0

    for (let i = 0; i < branches.length; i++) {
        const branch = branches[i]
        const fill = i % 2 === 0 ? FILLS.altRow1 : FILLS.altRow2

        totalRevenue += branch.revenue
        totalExpenses += branch.expenses
        totalNetIncome += branch.netIncome
        totalTransactions += branch.transactionCount

        worksheet.getCell(currentRow, 1).value = branch.branch
        worksheet.getCell(currentRow, 1).font = FONTS.body
        worksheet.getCell(currentRow, 1).fill = fill
        worksheet.getCell(currentRow, 1).border = b.body
        worksheet.getCell(currentRow, 1).alignment = ALIGNMENTS.left

        worksheet.getCell(currentRow, 2).value = branch.revenue
        worksheet.getCell(currentRow, 2).numFmt = NUMBER_FORMATS.currency
        worksheet.getCell(currentRow, 2).font = FONTS.body
        worksheet.getCell(currentRow, 2).fill = fill
        worksheet.getCell(currentRow, 2).border = b.body
        worksheet.getCell(currentRow, 2).alignment = ALIGNMENTS.right

        worksheet.getCell(currentRow, 3).value = branch.expenses
        worksheet.getCell(currentRow, 3).numFmt = NUMBER_FORMATS.currency
        worksheet.getCell(currentRow, 3).font = FONTS.body
        worksheet.getCell(currentRow, 3).fill = fill
        worksheet.getCell(currentRow, 3).border = b.body
        worksheet.getCell(currentRow, 3).alignment = ALIGNMENTS.right

        worksheet.getCell(currentRow, 4).value = branch.netIncome
        worksheet.getCell(currentRow, 4).numFmt = NUMBER_FORMATS.currency
        worksheet.getCell(currentRow, 4).font = FONTS.body
        worksheet.getCell(currentRow, 4).fill = fill
        worksheet.getCell(currentRow, 4).border = b.body
        worksheet.getCell(currentRow, 4).alignment = ALIGNMENTS.right

        worksheet.getCell(currentRow, 5).value = branch.transactionCount
        worksheet.getCell(currentRow, 5).numFmt = NUMBER_FORMATS.integer
        worksheet.getCell(currentRow, 5).font = FONTS.body
        worksheet.getCell(currentRow, 5).fill = fill
        worksheet.getCell(currentRow, 5).border = b.body
        worksheet.getCell(currentRow, 5).alignment = ALIGNMENTS.center

        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    if (branches.length > 0) {
        currentRow++
        const totalsRow = worksheet.getRow(currentRow)
        totalsRow.getCell(1).value = 'Grand Total'
        totalsRow.getCell(1).font = FONTS.subtotal
        totalsRow.getCell(1).fill = FILLS.subtotal
        totalsRow.getCell(1).border = b.subtotal
        totalsRow.getCell(1).alignment = ALIGNMENTS.left

        totalsRow.getCell(2).value = totalRevenue
        totalsRow.getCell(2).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(2).font = FONTS.subtotal
        totalsRow.getCell(2).fill = FILLS.subtotal
        totalsRow.getCell(2).border = b.subtotal
        totalsRow.getCell(2).alignment = ALIGNMENTS.right

        totalsRow.getCell(3).value = totalExpenses
        totalsRow.getCell(3).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(3).font = FONTS.subtotal
        totalsRow.getCell(3).fill = FILLS.subtotal
        totalsRow.getCell(3).border = b.subtotal
        totalsRow.getCell(3).alignment = ALIGNMENTS.right

        totalsRow.getCell(4).value = totalNetIncome
        totalsRow.getCell(4).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(4).font = FONTS.subtotal
        totalsRow.getCell(4).fill = FILLS.subtotal
        totalsRow.getCell(4).border = b.subtotal
        totalsRow.getCell(4).alignment = ALIGNMENTS.right

        totalsRow.getCell(5).value = totalTransactions
        totalsRow.getCell(5).numFmt = NUMBER_FORMATS.integer
        totalsRow.getCell(5).font = FONTS.subtotal
        totalsRow.getCell(5).fill = FILLS.subtotal
        totalsRow.getCell(5).border = b.subtotal
        totalsRow.getCell(5).alignment = ALIGNMENTS.center

        totalsRow.height = 22
    }
}

export function buildStaffPerformanceSheet(
    worksheet: ExcelJS.Worksheet,
    staff: StaffPerformanceItem[],
    options: {
        title?: string
        subtitle?: string
        startDate?: string
        endDate?: string
        generatedAt?: string
    }
): void {
    try {
        worksheet.properties.tabColor = { argb: COLORS.kpiPositive }
    } catch (error) {
        console.error('Failed to set worksheet tab color:', error)
    }

    let currentRow = 1

    worksheet.mergeCells(1, 1, 1, 5)
    const titleCell = worksheet.getCell(1, 1)
    titleCell.value = options.title || 'Staff Performance'
    titleCell.font = FONTS.title
    titleCell.alignment = ALIGNMENTS.center
    worksheet.getRow(1).height = 24
    currentRow = 3

    if (options.startDate && options.endDate) {
        worksheet.mergeCells(currentRow, 1, currentRow, 5)
        const dateRangeCell = worksheet.getCell(currentRow, 1)
        dateRangeCell.value = `Period: ${options.startDate} - ${options.endDate}`
        dateRangeCell.font = FONTS.body
        dateRangeCell.alignment = ALIGNMENTS.center
        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    const timestamp = options.generatedAt || new Date().toISOString()
    worksheet.mergeCells(currentRow, 1, currentRow, 5)
    const timestampCell = worksheet.getCell(currentRow, 1)
    timestampCell.value = `Generated: ${timestamp}`
    timestampCell.font = { ...FONTS.body, size: 9 }
    timestampCell.alignment = ALIGNMENTS.center
    worksheet.getRow(currentRow).height = 16
    currentRow += 2

    const staffColumns = [
        { key: 'staffName', header: 'Staff', width: 25, format: 'text' as const, align: 'left' as const },
        { key: 'revenue', header: 'Revenue', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'appointments', header: 'Appointments', width: 14, format: 'number' as const, align: 'center' as const },
        { key: 'averageTicket', header: 'Avg. Ticket', width: 14, format: 'currency' as const, align: 'right' as const },
        { key: 'completionRate', header: 'Completion', width: 12, format: 'percent' as const, align: 'right' as const },
    ]

    addHeaderRow(worksheet, staffColumns, currentRow, true)
    currentRow++

    const sortedStaff = [...staff].sort((a, b) => b.revenue - a.revenue)

    let totalRevenue = 0
    let totalAppointments = 0

    for (let i = 0; i < sortedStaff.length; i++) {
        const person = sortedStaff[i]
        const fill = i % 2 === 0 ? FILLS.altRow1 : FILLS.altRow2

        totalRevenue += person.revenue
        totalAppointments += person.appointments

        worksheet.getCell(currentRow, 1).value = person.staffName
        worksheet.getCell(currentRow, 1).font = FONTS.body
        worksheet.getCell(currentRow, 1).fill = fill
        worksheet.getCell(currentRow, 1).border = b.body
        worksheet.getCell(currentRow, 1).alignment = ALIGNMENTS.left

        worksheet.getCell(currentRow, 2).value = person.revenue
        worksheet.getCell(currentRow, 2).numFmt = NUMBER_FORMATS.currency
        worksheet.getCell(currentRow, 2).font = FONTS.body
        worksheet.getCell(currentRow, 2).fill = fill
        worksheet.getCell(currentRow, 2).border = b.body
        worksheet.getCell(currentRow, 2).alignment = ALIGNMENTS.right

        worksheet.getCell(currentRow, 3).value = person.appointments
        worksheet.getCell(currentRow, 3).numFmt = NUMBER_FORMATS.integer
        worksheet.getCell(currentRow, 3).font = FONTS.body
        worksheet.getCell(currentRow, 3).fill = fill
        worksheet.getCell(currentRow, 3).border = b.body
        worksheet.getCell(currentRow, 3).alignment = ALIGNMENTS.center

        worksheet.getCell(currentRow, 4).value = person.averageTicket
        worksheet.getCell(currentRow, 4).numFmt = NUMBER_FORMATS.currency
        worksheet.getCell(currentRow, 4).font = FONTS.body
        worksheet.getCell(currentRow, 4).fill = fill
        worksheet.getCell(currentRow, 4).border = b.body
        worksheet.getCell(currentRow, 4).alignment = ALIGNMENTS.right

        worksheet.getCell(currentRow, 5).value = person.completionRate
        worksheet.getCell(currentRow, 5).numFmt = NUMBER_FORMATS.percent
        worksheet.getCell(currentRow, 5).font = FONTS.body
        worksheet.getCell(currentRow, 5).fill = fill
        worksheet.getCell(currentRow, 5).border = b.body
        worksheet.getCell(currentRow, 5).alignment = ALIGNMENTS.right

        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    if (staff.length > 0) {
        currentRow++
        const totalsRow = worksheet.getRow(currentRow)
        totalsRow.getCell(1).value = 'Total'
        totalsRow.getCell(1).font = FONTS.subtotal
        totalsRow.getCell(1).fill = FILLS.subtotal
        totalsRow.getCell(1).border = b.subtotal
        totalsRow.getCell(1).alignment = ALIGNMENTS.left

        totalsRow.getCell(2).value = totalRevenue
        totalsRow.getCell(2).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(2).font = FONTS.subtotal
        totalsRow.getCell(2).fill = FILLS.subtotal
        totalsRow.getCell(2).border = b.subtotal
        totalsRow.getCell(2).alignment = ALIGNMENTS.right

        totalsRow.getCell(3).value = totalAppointments
        totalsRow.getCell(3).numFmt = NUMBER_FORMATS.integer
        totalsRow.getCell(3).font = FONTS.subtotal
        totalsRow.getCell(3).fill = FILLS.subtotal
        totalsRow.getCell(3).border = b.subtotal
        totalsRow.getCell(3).alignment = ALIGNMENTS.center

        worksheet.getRow(currentRow).height = 22
    }
}

export function buildInventorySheet(
    worksheet: ExcelJS.Worksheet,
    items: InventoryMetricItem[],
    options: {
        title?: string
        subtitle?: string
        startDate?: string
        endDate?: string
        generatedAt?: string
    }
): void {
    try {
        worksheet.properties.tabColor = { argb: COLORS.kpiNeutral }
    } catch (error) {
        console.error('Failed to set worksheet tab color:', error)
    }

    let currentRow = 1

    worksheet.mergeCells(1, 1, 1, 4)
    const titleCell = worksheet.getCell(1, 1)
    titleCell.value = options.title || 'Inventory Metrics'
    titleCell.font = FONTS.title
    titleCell.alignment = ALIGNMENTS.center
    worksheet.getRow(1).height = 24
    currentRow = 3

    if (options.startDate && options.endDate) {
        worksheet.mergeCells(currentRow, 1, currentRow, 4)
        const dateRangeCell = worksheet.getCell(currentRow, 1)
        dateRangeCell.value = `Period: ${options.startDate} - ${options.endDate}`
        dateRangeCell.font = FONTS.body
        dateRangeCell.alignment = ALIGNMENTS.center
        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    const timestamp = options.generatedAt || new Date().toISOString()
    worksheet.mergeCells(currentRow, 1, currentRow, 4)
    const timestampCell = worksheet.getCell(currentRow, 1)
    timestampCell.value = `Generated: ${timestamp}`
    timestampCell.font = { ...FONTS.body, size: 9 }
    timestampCell.alignment = ALIGNMENTS.center
    worksheet.getRow(currentRow).height = 16
    currentRow += 2

    const invColumns = [
        { key: 'itemName', header: 'Item', width: 30, format: 'text' as const, align: 'left' as const },
        { key: 'quantity', header: 'Qty Sold', width: 12, format: 'number' as const, align: 'center' as const },
        { key: 'revenue', header: 'Revenue', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'stockLevel', header: 'Stock', width: 12, format: 'number' as const, align: 'center' as const },
    ]

    addHeaderRow(worksheet, invColumns, currentRow, true)
    currentRow++

    const sortedItems = [...items].sort((a, b) => b.revenue - a.revenue)
    const topSellers = sortedItems.slice(0, 5)

    let totalQuantity = 0
    let totalRevenue = 0

    for (let i = 0; i < sortedItems.length; i++) {
        const item = sortedItems[i]
        const fill = i % 2 === 0 ? FILLS.altRow1 : FILLS.altRow2

        totalQuantity += item.quantity
        totalRevenue += item.revenue

        worksheet.getCell(currentRow, 1).value = item.itemName
        worksheet.getCell(currentRow, 1).font = FONTS.body
        worksheet.getCell(currentRow, 1).fill = fill
        worksheet.getCell(currentRow, 1).border = b.body
        worksheet.getCell(currentRow, 1).alignment = ALIGNMENTS.left

        worksheet.getCell(currentRow, 2).value = item.quantity
        worksheet.getCell(currentRow, 2).numFmt = NUMBER_FORMATS.integer
        worksheet.getCell(currentRow, 2).font = FONTS.body
        worksheet.getCell(currentRow, 2).fill = fill
        worksheet.getCell(currentRow, 2).border = b.body
        worksheet.getCell(currentRow, 2).alignment = ALIGNMENTS.center

        worksheet.getCell(currentRow, 3).value = item.revenue
        worksheet.getCell(currentRow, 3).numFmt = NUMBER_FORMATS.currency
        worksheet.getCell(currentRow, 3).font = FONTS.body
        worksheet.getCell(currentRow, 3).fill = fill
        worksheet.getCell(currentRow, 3).border = b.body
        worksheet.getCell(currentRow, 3).alignment = ALIGNMENTS.right

        const stockCell = worksheet.getCell(currentRow, 4)
        stockCell.value = item.stockLevel
        stockCell.numFmt = NUMBER_FORMATS.integer
        stockCell.font = FONTS.body
        stockCell.fill = fill
        stockCell.border = b.body
        stockCell.alignment = ALIGNMENTS.center

        if (item.stockLevel < 10) {
            stockCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.kpiNegativeBg } }
        } else if (item.stockLevel < 25) {
            stockCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.kpiNeutralBg } }
        }

        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    if (items.length > 0) {
        currentRow++
        const totalsRow = worksheet.getRow(currentRow)
        totalsRow.getCell(1).value = 'Total'
        totalsRow.getCell(1).font = FONTS.subtotal
        totalsRow.getCell(1).fill = FILLS.subtotal
        totalsRow.getCell(1).border = b.subtotal
        totalsRow.getCell(1).alignment = ALIGNMENTS.left

        totalsRow.getCell(2).value = totalQuantity
        totalsRow.getCell(2).numFmt = NUMBER_FORMATS.integer
        totalsRow.getCell(2).font = FONTS.subtotal
        totalsRow.getCell(2).fill = FILLS.subtotal
        totalsRow.getCell(2).border = b.subtotal
        totalsRow.getCell(2).alignment = ALIGNMENTS.center

        totalsRow.getCell(3).value = totalRevenue
        totalsRow.getCell(3).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(3).font = FONTS.subtotal
        totalsRow.getCell(3).fill = FILLS.subtotal
        totalsRow.getCell(3).border = b.subtotal
        totalsRow.getCell(3).alignment = ALIGNMENTS.right

        totalsRow.getCell(4).value = ''
        totalsRow.getCell(4).fill = FILLS.subtotal
        totalsRow.getCell(4).border = b.subtotal

        totalsRow.height = 22
        currentRow += 2

        if (topSellers.length > 0) {
            addSectionHeader(worksheet, 'Top Sellers', currentRow, 3)
            currentRow++

            const topColumns = [
                { key: 'rank', header: '#', width: 5, format: 'number' as const, align: 'center' as const },
                { key: 'itemName', header: 'Item', width: 30, format: 'text' as const, align: 'left' as const },
                { key: 'revenue', header: 'Revenue', width: 16, format: 'currency' as const, align: 'right' as const },
            ]

            addHeaderRow(worksheet, topColumns, currentRow, false)
            currentRow++

            for (let i = 0; i < topSellers.length; i++) {
                const item = topSellers[i]
                const fill = i % 2 === 0 ? FILLS.altRow1 : FILLS.altRow2

                worksheet.getCell(currentRow, 1).value = i + 1
                worksheet.getCell(currentRow, 1).font = FONTS.body
                worksheet.getCell(currentRow, 1).fill = fill
                worksheet.getCell(currentRow, 1).border = b.body
                worksheet.getCell(currentRow, 1).alignment = ALIGNMENTS.center

                worksheet.getCell(currentRow, 2).value = item.itemName
                worksheet.getCell(currentRow, 2).font = FONTS.body
                worksheet.getCell(currentRow, 2).fill = fill
                worksheet.getCell(currentRow, 2).border = b.body
                worksheet.getCell(currentRow, 2).alignment = ALIGNMENTS.left

                worksheet.getCell(currentRow, 3).value = item.revenue
                worksheet.getCell(currentRow, 3).numFmt = NUMBER_FORMATS.currency
                worksheet.getCell(currentRow, 3).font = FONTS.body
                worksheet.getCell(currentRow, 3).fill = fill
                worksheet.getCell(currentRow, 3).border = b.body
                worksheet.getCell(currentRow, 3).alignment = ALIGNMENTS.right

                worksheet.getRow(currentRow).height = 18
                currentRow++
            }
        }
    }
}
