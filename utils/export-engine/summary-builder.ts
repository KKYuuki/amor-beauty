import ExcelJS from 'exceljs'
import {
    addSectionHeader,
} from './worksheet-builder'
import {
    SummaryKPI,
    GroupTotals,
    BranchInfo,
    ExportScope,
} from './types'
import {
    COLORS,
    FONTS,
    FILLS,
    BORDERS,
    ALIGNMENTS,
    NUMBER_FORMATS,
    getKpiColor,
    getKpiFill,
} from './styling'

type BorderStyle = Partial<ExcelJS.Borders>
const b = BORDERS as Record<keyof typeof BORDERS, BorderStyle>

export interface SummaryBuilderOptions {
    title?: string
    subtitle?: string
    startDate?: string
    endDate?: string
    generatedAt?: string
    scope?: ExportScope
    branches?: BranchInfo[]
    branchData?: Map<string | null, GroupTotals>
    paymentData?: Map<string, GroupTotals>
    categoryData?: Map<string, GroupTotals>
}

export function buildSummarySheet(
    workbook: ExcelJS.Workbook,
    options: SummaryBuilderOptions
): ExcelJS.Worksheet {
    const worksheet = workbook.addWorksheet('Summary')

    try {
        worksheet.properties.tabColor = { argb: COLORS.summaryTabGreen }
    } catch (error) {
        console.error('Failed to set worksheet tab color:', error)
    }

    let currentRow = 1

    try {
        currentRow = addGeneralInfoSection(worksheet, options, currentRow)
        currentRow++
    } catch (error) {
        console.error('Failed to add general info section:', error)
        currentRow++
    }

    try {
        const kpis = calculateKPIs(options)
        currentRow = addKPISection(worksheet, kpis, currentRow)
        currentRow++
    } catch (error) {
        console.error('Failed to add KPI section:', error)
        currentRow++
    }

    try {
        currentRow = addBranchComparisonSection(
            worksheet,
            options.branches || [],
            options.branchData || new Map(),
            currentRow
        )
        currentRow++
    } catch (error) {
        console.error('Failed to add branch comparison section:', error)
        currentRow++
    }

    try {
        currentRow = addPaymentMethodSummary(
            worksheet,
            options.paymentData || new Map(),
            currentRow
        )
        currentRow++
    } catch (error) {
        console.error('Failed to add payment method summary:', error)
        currentRow++
    }

    try {
        addCategorySummary(
            worksheet,
            options.categoryData || new Map(),
            currentRow
        )
    } catch (error) {
        console.error('Failed to add category summary:', error)
    }

    return worksheet
}

export function addKPISection(
    worksheet: ExcelJS.Worksheet,
    kpis: SummaryKPI[],
    startRow: number = 6
): number {
    if (kpis.length === 0) return startRow

    const kpiRow = startRow
    const kpiCount = kpis.length
    const kpiWidth = Math.max(1, Math.floor(12 / kpiCount))

    for (let i = 0; i < kpiCount; i++) {
        const kpi = kpis[i]
        const col = i * kpiWidth + 1

        worksheet.mergeCells(kpiRow, col, kpiRow, col + kpiWidth - 1)

        const cell = worksheet.getCell(kpiRow, col)
        cell.value = kpi.label
        cell.font = FONTS.kpiLabel
        cell.alignment = ALIGNMENTS.center
        cell.fill = getKpiFill(kpi.value)

        const valueRow = kpiRow + 1
        worksheet.mergeCells(valueRow, col, valueRow, col + kpiWidth - 1)

        const valueCell = worksheet.getCell(valueRow, col)

        if (kpi.format === 'currency') {
            valueCell.value = kpi.value
            valueCell.numFmt = NUMBER_FORMATS.currency
        } else if (kpi.format === 'percent') {
            valueCell.value = kpi.value
            valueCell.numFmt = NUMBER_FORMATS.percent
        } else {
            valueCell.value = kpi.value
            valueCell.numFmt = NUMBER_FORMATS.integer
        }

        valueCell.font = { ...FONTS.kpiValue, color: { argb: getKpiColor(kpi.value) } }
        valueCell.alignment = ALIGNMENTS.center
        valueCell.fill = getKpiFill(kpi.value)

        if (kpi.trend) {
            const trendRow = kpiRow + 2
            worksheet.mergeCells(trendRow, col, trendRow, col + kpiWidth - 1)

            const trendCell = worksheet.getCell(trendRow, col)
            const trendIcon = kpi.trend.direction === 'up' ? '↑' : kpi.trend.direction === 'down' ? '↓' : '→'
            trendCell.value = `${trendIcon} ${kpi.trend.percentChange.toFixed(1)}%`
            trendCell.font = { ...FONTS.body, size: 9 }
            trendCell.alignment = ALIGNMENTS.center
            trendCell.fill = getKpiFill(kpi.value)
        }
    }

    const endRow = kpiRow + (kpis.some(k => k.trend) ? 2 : 1)
    for (let row = kpiRow; row <= endRow; row++) {
        worksheet.getRow(row).height = 22
    }

    return endRow + 1
}

export function addBranchComparisonSection(
    worksheet: ExcelJS.Worksheet,
    branches: BranchInfo[],
    branchData: Map<string | null, GroupTotals>,
    startRow: number
): number {
    addSectionHeader(worksheet, 'Branch Comparison', startRow, 4)
    const headerRow = startRow + 1

    const branchColumns = [
        { key: 'branch', header: 'Branch', width: 25 },
        { key: 'revenue', header: 'Revenue', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'expenses', header: 'Expenses', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'netIncome', header: 'Net Income', width: 16, format: 'currency' as const, align: 'right' as const },
    ]

    const headerRowObj = worksheet.getRow(headerRow)
    for (let i = 0; i < branchColumns.length; i++) {
        const cell = headerRowObj.getCell(i + 1)
        cell.value = branchColumns[i].header
        cell.font = FONTS.header
        cell.fill = FILLS.header
        cell.border = b.header
        cell.alignment = ALIGNMENTS.headerRight
        worksheet.getColumn(i + 1).width = branchColumns[i].width
    }
    headerRowObj.height = 24

    let currentRow = headerRow + 1

    if (branches.length === 0) {
        worksheet.mergeCells(currentRow, 1, currentRow, 4)
        const noDataCell = worksheet.getCell(currentRow, 1)
        noDataCell.value = 'No branch data available'
        noDataCell.font = FONTS.body
        noDataCell.alignment = ALIGNMENTS.center
        currentRow++
    } else {
        const grandTotals: GroupTotals = { totalDebit: 0, totalCredit: 0, netAmount: 0, entryCount: 0 }

        for (let i = 0; i < branches.length; i++) {
            const branch = branches[i]
            const data = branchData.get(branch.id) || { totalDebit: 0, totalCredit: 0, netAmount: 0, entryCount: 0 }
            grandTotals.totalDebit += data.totalDebit
            grandTotals.totalCredit += data.totalCredit
            grandTotals.netAmount += data.netAmount
            grandTotals.entryCount += data.entryCount

            const fill = i % 2 === 0 ? FILLS.altRow1 : FILLS.altRow2

            worksheet.getCell(currentRow, 1).value = `${branch.code} - ${branch.name}`
            worksheet.getCell(currentRow, 2).value = data.totalCredit
            worksheet.getCell(currentRow, 2).numFmt = NUMBER_FORMATS.currency
            worksheet.getCell(currentRow, 3).value = data.totalDebit
            worksheet.getCell(currentRow, 3).numFmt = NUMBER_FORMATS.currency
            worksheet.getCell(currentRow, 4).value = data.netAmount
            worksheet.getCell(currentRow, 4).numFmt = NUMBER_FORMATS.currency

            for (let col = 1; col <= 4; col++) {
                const cell = worksheet.getCell(currentRow, col)
                cell.font = FONTS.body
                cell.fill = fill
                cell.border = b.body
                cell.alignment = col === 1 ? ALIGNMENTS.left : ALIGNMENTS.right
            }

            currentRow++
        }

        currentRow++
        const totalsRow = worksheet.getRow(currentRow)
        totalsRow.getCell(1).value = 'Grand Total'
        totalsRow.getCell(1).font = FONTS.subtotal
        totalsRow.getCell(1).fill = FILLS.subtotal
        totalsRow.getCell(1).border = b.subtotal
        totalsRow.getCell(1).alignment = ALIGNMENTS.left

        totalsRow.getCell(2).value = grandTotals.totalCredit
        totalsRow.getCell(2).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(2).font = FONTS.subtotal
        totalsRow.getCell(2).fill = FILLS.subtotal
        totalsRow.getCell(2).border = b.subtotal
        totalsRow.getCell(2).alignment = ALIGNMENTS.right

        totalsRow.getCell(3).value = grandTotals.totalDebit
        totalsRow.getCell(3).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(3).font = FONTS.subtotal
        totalsRow.getCell(3).fill = FILLS.subtotal
        totalsRow.getCell(3).border = b.subtotal
        totalsRow.getCell(3).alignment = ALIGNMENTS.right

        totalsRow.getCell(4).value = grandTotals.netAmount
        totalsRow.getCell(4).numFmt = NUMBER_FORMATS.currency
        totalsRow.getCell(4).font = FONTS.subtotal
        totalsRow.getCell(4).fill = FILLS.subtotal
        totalsRow.getCell(4).border = b.subtotal
        totalsRow.getCell(4).alignment = ALIGNMENTS.right

        currentRow++
    }

    return currentRow + 1
}

export function addPaymentMethodSummary(
    worksheet: ExcelJS.Worksheet,
    paymentData: Map<string, GroupTotals>,
    startRow: number
): number {
    addSectionHeader(worksheet, 'Payment Method Distribution', startRow, 4)
    const headerRow = startRow + 1

    const paymentColumns = [
        { key: 'paymentMethod', header: 'Payment Method', width: 25 },
        { key: 'transactions', header: 'Transactions', width: 14, format: 'number' as const, align: 'center' as const },
        { key: 'amount', header: 'Amount', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'percentage', header: '% of Total', width: 12, format: 'percent' as const, align: 'right' as const },
    ]

    const headerRowObj = worksheet.getRow(headerRow)
    for (let i = 0; i < paymentColumns.length; i++) {
        const cell = headerRowObj.getCell(i + 1)
        cell.value = paymentColumns[i].header
        cell.font = FONTS.header
        cell.fill = FILLS.header
        cell.border = b.header
        cell.alignment = paymentColumns[i].align === 'center' ? ALIGNMENTS.headerCenter : ALIGNMENTS.headerRight
        worksheet.getColumn(i + 1).width = paymentColumns[i].width
    }
    headerRowObj.height = 24

    let currentRow = headerRow + 1

    if (paymentData.size === 0) {
        worksheet.mergeCells(currentRow, 1, currentRow, 4)
        const noDataCell = worksheet.getCell(currentRow, 1)
        noDataCell.value = 'No payment method data available'
        noDataCell.font = FONTS.body
        noDataCell.alignment = ALIGNMENTS.center
        currentRow++
    } else {
        let totalAmount = 0
        let totalTransactions = 0
        paymentData.forEach(data => {
            totalAmount += data.netAmount
            totalTransactions += data.entryCount
        })

        const sortedMethods = Array.from(paymentData.keys()).sort()
        let index = 0

        for (const method of sortedMethods) {
            const data = paymentData.get(method)!
            const fill = index % 2 === 0 ? FILLS.altRow1 : FILLS.altRow2

            worksheet.getCell(currentRow, 1).value = method
            worksheet.getCell(currentRow, 2).value = data.entryCount
            worksheet.getCell(currentRow, 2).numFmt = NUMBER_FORMATS.integer
            worksheet.getCell(currentRow, 3).value = data.netAmount
            worksheet.getCell(currentRow, 3).numFmt = NUMBER_FORMATS.currency
            worksheet.getCell(currentRow, 4).value = totalAmount > 0 ? (data.netAmount / totalAmount) * 100 : 0
            worksheet.getCell(currentRow, 4).numFmt = NUMBER_FORMATS.percent

            for (let col = 1; col <= 4; col++) {
                const cell = worksheet.getCell(currentRow, col)
                cell.font = FONTS.body
                cell.fill = fill
                cell.border = b.body
                if (col === 1) {
                    cell.alignment = ALIGNMENTS.left
                } else if (col === 2) {
                    cell.alignment = ALIGNMENTS.center
                } else {
                    cell.alignment = ALIGNMENTS.right
                }
            }

            currentRow++
            index++
        }

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

        currentRow++
    }

    return currentRow + 1
}

export function addCategorySummary(
    worksheet: ExcelJS.Worksheet,
    categoryData: Map<string, GroupTotals>,
    startRow: number
): number {
    addSectionHeader(worksheet, 'Category Breakdown', startRow, 4)
    const headerRow = startRow + 1

    const categoryColumns = [
        { key: 'category', header: 'Category', width: 30 },
        { key: 'revenue', header: 'Revenue', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'expenses', header: 'Expenses', width: 16, format: 'currency' as const, align: 'right' as const },
        { key: 'netAmount', header: 'Net', width: 16, format: 'currency' as const, align: 'right' as const },
    ]

    const headerRowObj = worksheet.getRow(headerRow)
    for (let i = 0; i < categoryColumns.length; i++) {
        const cell = headerRowObj.getCell(i + 1)
        cell.value = categoryColumns[i].header
        cell.font = FONTS.header
        cell.fill = FILLS.header
        cell.border = b.header
        cell.alignment = ALIGNMENTS.headerRight
        worksheet.getColumn(i + 1).width = categoryColumns[i].width
    }
    headerRowObj.height = 24

    let currentRow = headerRow + 1

    if (categoryData.size === 0) {
        worksheet.mergeCells(currentRow, 1, currentRow, 4)
        const noDataCell = worksheet.getCell(currentRow, 1)
        noDataCell.value = 'No category data available'
        noDataCell.font = FONTS.body
        noDataCell.alignment = ALIGNMENTS.center
        currentRow++
    } else {
        let totalRevenue = 0
        let totalExpenses = 0
        let totalNet = 0
        categoryData.forEach(data => {
            totalRevenue += data.totalCredit
            totalExpenses += data.totalDebit
            totalNet += data.netAmount
        })

        const sortedCategories = Array.from(categoryData.keys()).sort()
        let index = 0

        for (const category of sortedCategories) {
            const data = categoryData.get(category)!
            const fill = index % 2 === 0 ? FILLS.altRow1 : FILLS.altRow2

            worksheet.getCell(currentRow, 1).value = category
            worksheet.getCell(currentRow, 2).value = data.totalCredit
            worksheet.getCell(currentRow, 2).numFmt = NUMBER_FORMATS.currency
            worksheet.getCell(currentRow, 3).value = data.totalDebit
            worksheet.getCell(currentRow, 3).numFmt = NUMBER_FORMATS.currency
            worksheet.getCell(currentRow, 4).value = data.netAmount
            worksheet.getCell(currentRow, 4).numFmt = NUMBER_FORMATS.currency

            for (let col = 1; col <= 4; col++) {
                const cell = worksheet.getCell(currentRow, col)
                cell.font = FONTS.body
                cell.fill = fill
                cell.border = b.body
                cell.alignment = col === 1 ? ALIGNMENTS.left : ALIGNMENTS.right
            }

            currentRow++
            index++
        }

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

        currentRow++
    }

    return currentRow + 1
}

export function addGeneralInfoSection(
    worksheet: ExcelJS.Worksheet,
    options: SummaryBuilderOptions,
    startRow: number = 1
): number {
    let currentRow = startRow

    worksheet.mergeCells(currentRow, 1, currentRow, 4)
    const titleCell = worksheet.getCell(currentRow, 1)
    titleCell.value = options.title || 'Financial Summary Report'
    titleCell.font = FONTS.title
    titleCell.alignment = ALIGNMENTS.center
    worksheet.getRow(currentRow).height = 24
    currentRow++

    if (options.subtitle) {
        worksheet.mergeCells(currentRow, 1, currentRow, 4)
        const subtitleCell = worksheet.getCell(currentRow, 1)
        subtitleCell.value = options.subtitle
        subtitleCell.font = FONTS.subtitle
        subtitleCell.alignment = ALIGNMENTS.center
        worksheet.getRow(currentRow).height = 20
        currentRow++
    }

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
    currentRow++

    if (options.scope) {
        worksheet.mergeCells(currentRow, 1, currentRow, 4)
        const scopeCell = worksheet.getCell(currentRow, 1)
        const scopeDesc = getScopeDescription(options.scope)
        scopeCell.value = `Scope: ${scopeDesc}`
        scopeCell.font = { ...FONTS.body, size: 9, italic: true }
        scopeCell.alignment = ALIGNMENTS.center
        worksheet.getRow(currentRow).height = 16
        currentRow++
    }

    return currentRow
}

function calculateKPIs(_options: SummaryBuilderOptions): SummaryKPI[] {
    return [
        {
            label: 'Total Revenue',
            value: 0,
            format: 'currency',
            color: COLORS.kpiPositive,
        },
        {
            label: 'Total Expenses',
            value: 0,
            format: 'currency',
            color: COLORS.kpiNegative,
        },
        {
            label: 'Net Income',
            value: 0,
            format: 'currency',
            color: COLORS.kpiNeutral,
        },
        {
            label: 'Entry Count',
            value: 0,
            format: 'number',
            color: COLORS.kpiNeutral,
        },
    ]
}

function getScopeDescription(scope: ExportScope): string {
    const scopeLabels: Record<string, string> = {
        GENERAL_LEDGER: 'General Ledger',
        CASH_RECEIPTS: 'Cash Receipts',
        CASH_DISBURSEMENTS: 'Cash Disbursements',
        SALES: 'Sales',
        PURCHASES: 'Purchases',
        CUSTOM: 'Custom',
    }

    let desc = scopeLabels[scope.type] || scope.type

    if (scope.branchId) {
        desc += ' (Branch Filter)'
    }

    return desc
}