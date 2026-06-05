import ExcelJS, { Borders } from 'exceljs'
import {
    COLORS as _COLORS,
    FONTS,
    FILLS,
    BORDERS,
    ALIGNMENTS,
    NUMBER_FORMATS,
    getKpiColor,
    getKpiFill,
} from './styling'

type BorderStyle = Partial<Borders>

const b = BORDERS as Record<keyof typeof BORDERS, BorderStyle>
import {
    ColumnDef,
    GroupedEntryGroup,
    LedgerExportRow as _LedgerExportRow,
    MetricsExportRow as _MetricsExportRow,
    SummaryKPI,
    GroupTotals,
    BranchInfo,
} from './types'

export interface WorksheetBuilderOptions {
    title?: string
    subtitle?: string
    startDate?: string
    endDate?: string
    generatedAt?: string
}

export function addTitleSection(
    worksheet: ExcelJS.Worksheet,
    options: WorksheetBuilderOptions
): void {
    const { title, subtitle, startDate, endDate, generatedAt } = options

    worksheet.mergeCells('A1:I1')
    const titleCell = worksheet.getCell('A1')
    titleCell.value = title || 'Financial Report'
    titleCell.font = FONTS.title
    titleCell.alignment = ALIGNMENTS.center

    worksheet.mergeCells('A2:I2')
    const subtitleCell = worksheet.getCell('A2')
    subtitleCell.value = subtitle || 'Amor Beauty Lounge'
    subtitleCell.font = FONTS.subtitle
    subtitleCell.alignment = ALIGNMENTS.center

    if (startDate && endDate) {
        worksheet.mergeCells('A3:I3')
        const dateRangeCell = worksheet.getCell('A3')
        dateRangeCell.value = `Period: ${startDate} - ${endDate}`
        dateRangeCell.font = FONTS.body
        dateRangeCell.alignment = ALIGNMENTS.center
    }

    const timestamp = generatedAt || new Date().toISOString()
    worksheet.mergeCells('A4:I4')
    const timestampCell = worksheet.getCell('A4')
    timestampCell.value = `Generated: ${timestamp}`
    timestampCell.font = { ...FONTS.body, size: 9 }
    timestampCell.alignment = ALIGNMENTS.center

    for (let row = 1; row <= 4; row++) {
        worksheet.getRow(row).height = 20
    }
}

export function addKPISection(
    worksheet: ExcelJS.Worksheet,
    kpis: SummaryKPI[],
    startRow: number = 6
): number {
    if (kpis.length === 0) return startRow

    const kpiRow = startRow
    const kpiCount = kpis.length
    const kpiWidth = Math.floor(12 / kpiCount)

    for (let i = 0; i < kpiCount; i++) {
        const kpi = kpis[i]
        const col = i * kpiWidth + 1
        const _colLetter = getColumnLetter(col)

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

export function addHeaderRow(
    worksheet: ExcelJS.Worksheet,
    columns: ColumnDef[],
    row: number = 1,
    autoFilter: boolean = true
): void {
    const headerRow = worksheet.getRow(row)

    for (let i = 0; i < columns.length; i++) {
        const col = i + 1
        const column = columns[i]
        const cell = headerRow.getCell(col)

        cell.value = column.header
        cell.font = FONTS.header
        cell.fill = FILLS.header
        cell.border = b.header
        cell.alignment = getAlignment(column.align, 'header')

        const _colLetter = getColumnLetter(col)
        worksheet.getColumn(col).width = column.width
    }

    headerRow.height = 24

    if (autoFilter) {
        const endColLetter = getColumnLetter(columns.length)
        worksheet.autoFilter = {
            from: `${getColumnLetter(1)}${row}`,
            to: `${endColLetter}${row}`
        }
    }
}

export function addDataRows<T extends Record<string, unknown>>(
    worksheet: ExcelJS.Worksheet,
    rows: T[],
    columns: ColumnDef[],
    startRow: number,
    _keyField: string = 'id'
): number {
    let currentRow = startRow

    for (let i = 0; i < rows.length; i++) {
        const rowData = rows[i]
        const fill = i % 2 === 0 ? FILLS.altRow1 : FILLS.altRow2

        for (let j = 0; j < columns.length; j++) {
            const col = j + 1
            const column = columns[j]
            const cell = worksheet.getCell(currentRow, col)

            const value = rowData[column.key]

            if (column.format === 'currency' && typeof value === 'number') {
                cell.value = value
                cell.numFmt = NUMBER_FORMATS.currency
            } else if (column.format === 'date' && typeof value === 'string') {
                cell.value = formatDate(value)
                cell.numFmt = NUMBER_FORMATS.date
            } else if (column.format === 'number' && typeof value === 'number') {
                cell.value = value
                cell.numFmt = NUMBER_FORMATS.integer
            } else if (column.format === 'percent' && typeof value === 'number') {
                cell.value = value / 100
                cell.numFmt = NUMBER_FORMATS.percent
            } else {
                cell.value = value as string | number | boolean
            }

            cell.font = FONTS.body
            cell.fill = fill
            cell.border = b.body
            cell.alignment = getAlignment(column.align, 'body')
        }

        worksheet.getRow(currentRow).height = 18
        currentRow++
    }

    return currentRow
}

export function addSubtotalRow(
    worksheet: ExcelJS.Worksheet,
    columns: ColumnDef[],
    totals: GroupTotals,
    label: string,
    row: number
): void {
    const subtotalRow = worksheet.getRow(row)

    subtotalRow.getCell(1).value = label
    subtotalRow.getCell(1).font = FONTS.subtotal
    subtotalRow.getCell(1).fill = FILLS.subtotal
    subtotalRow.getCell(1).border = b.subtotal
    subtotalRow.getCell(1).alignment = ALIGNMENTS.left

    for (let i = 1; i < columns.length; i++) {
        const col = i + 1
        const column = columns[i]
        const cell = subtotalRow.getCell(col)

        if (column.key === 'debit') {
            cell.value = totals.totalDebit
            cell.numFmt = NUMBER_FORMATS.currency
        } else if (column.key === 'credit') {
            cell.value = totals.totalCredit
            cell.numFmt = NUMBER_FORMATS.currency
        } else if (column.key === 'netAmount' || column.key === 'balance') {
            cell.value = totals.netAmount
            cell.numFmt = NUMBER_FORMATS.currency
        } else if (column.key === 'transactionCount' || column.key === 'count' || column.key === 'entryCount') {
            cell.value = totals.entryCount
            cell.numFmt = NUMBER_FORMATS.integer
        } else if (column.key === 'revenue') {
            cell.value = totals.totalCredit
            cell.numFmt = NUMBER_FORMATS.currency
        } else if (column.key === 'expenses') {
            cell.value = totals.totalDebit
            cell.numFmt = NUMBER_FORMATS.currency
        } else if (column.key === 'netIncome') {
            cell.value = totals.netAmount
            cell.numFmt = NUMBER_FORMATS.currency
        } else {
            cell.value = undefined
        }

        cell.font = FONTS.subtotal
        cell.fill = FILLS.subtotal
        cell.border = b.subtotal
        cell.alignment = getAlignment(column.align, 'body')
    }

    subtotalRow.height = 22
}

export function addSectionHeader(
    worksheet: ExcelJS.Worksheet,
    label: string,
    row: number,
    spanColumns: number = 9
): void {
    worksheet.mergeCells(row, 1, row, spanColumns)

    const cell = worksheet.getCell(row, 1)
    cell.value = label
    cell.font = FONTS.sectionTitle
    cell.fill = FILLS.section
    cell.border = b.section
    cell.alignment = { ...ALIGNMENTS.left, horizontal: 'left' }

    worksheet.getRow(row).height = 24
}

export function addGroupedData(
    worksheet: ExcelJS.Worksheet,
    groups: GroupedEntryGroup[],
    columns: ColumnDef[],
    columnsWithoutBalance: ColumnDef[],
    startRow: number = 1,
    showSubtotals: boolean = true
): number {
    let currentRow = startRow

    for (const group of groups) {
        addSectionHeader(worksheet, group.label, currentRow, columns.length)
        currentRow++

        addHeaderRow(worksheet, columnsWithoutBalance, currentRow, false)
        currentRow++

        currentRow = addDataRows(
            worksheet,
            group.entries as unknown as Record<string, unknown>[],
            columnsWithoutBalance,
            currentRow,
            'id'
        )

        if (showSubtotals && group.entries.length > 0) {
            currentRow++
            addSubtotalRow(worksheet, columnsWithoutBalance, group.totals, 'Subtotal', currentRow)
            currentRow++
        }

        if (group.subGroups && group.subGroups.length > 0) {
            currentRow = addGroupedData(
                worksheet,
                group.subGroups,
                columns,
                columnsWithoutBalance,
                currentRow,
                showSubtotals
            )
        }
    }

    return currentRow
}

export function addBranchComparisonTable(
    worksheet: ExcelJS.Worksheet,
    branches: BranchInfo[],
    branchData: Map<string, GroupTotals>,
    startRow: number = 1
): number {
    let currentRow = startRow

    worksheet.mergeCells(currentRow, 1, currentRow, 4)
    const titleCell = worksheet.getCell(currentRow, 1)
    titleCell.value = 'Branch Comparison'
    titleCell.font = FONTS.title
    titleCell.alignment = ALIGNMENTS.left
    currentRow += 2

    const branchColumns: ColumnDef[] = [
        { key: 'branch', header: 'Branch', width: 25 },
        { key: 'revenue', header: 'Revenue', width: 16, format: 'currency', align: 'right' },
        { key: 'expenses', header: 'Expenses', width: 16, format: 'currency', align: 'right' },
        { key: 'netIncome', header: 'Net Income', width: 16, format: 'currency', align: 'right' },
    ]

    addHeaderRow(worksheet, branchColumns, currentRow, false)
    currentRow++

    for (let i = 0; i < branches.length; i++) {
        const branch = branches[i]
        const data = branchData.get(branch.id || 'shared') || {
            totalDebit: 0,
            totalCredit: 0,
            netAmount: 0,
            entryCount: 0,
        }

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

    const grandTotals: GroupTotals = {
        totalDebit: 0,
        totalCredit: 0,
        netAmount: 0,
        entryCount: 0,
    }

    branchData.forEach(data => {
        grandTotals.totalDebit += data.totalDebit
        grandTotals.totalCredit += data.totalCredit
        grandTotals.netAmount += data.netAmount
        grandTotals.entryCount += data.entryCount
    })

    currentRow++
    addSubtotalRow(worksheet, branchColumns, grandTotals, 'Grand Total', currentRow)
    currentRow++

    return currentRow
}

export function addPaymentMethodBreakdown(
    worksheet: ExcelJS.Worksheet,
    paymentData: Map<string, GroupTotals>,
    startRow: number = 1
): number {
    let currentRow = startRow

    worksheet.mergeCells(currentRow, 1, currentRow, 4)
    const titleCell = worksheet.getCell(currentRow, 1)
    titleCell.value = 'Payment Method Breakdown'
    titleCell.font = FONTS.title
    titleCell.alignment = ALIGNMENTS.left
    currentRow += 2

    const paymentColumns: ColumnDef[] = [
        { key: 'paymentMethod', header: 'Payment Method', width: 25 },
        { key: 'transactions', header: 'Transactions', width: 14, format: 'number', align: 'center' },
        { key: 'amount', header: 'Amount', width: 16, format: 'currency', align: 'right' },
        { key: 'percentage', header: '% of Total', width: 12, format: 'percent', align: 'right' },
    ]

    addHeaderRow(worksheet, paymentColumns, currentRow, false)
    currentRow++

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

    currentRow += 2

    return currentRow
}

export function addCategoryBreakdown(
    worksheet: ExcelJS.Worksheet,
    categoryData: Map<string, GroupTotals>,
    startRow: number = 1
): number {
    let currentRow = startRow

    worksheet.mergeCells(currentRow, 1, currentRow, 4)
    const titleCell = worksheet.getCell(currentRow, 1)
    titleCell.value = 'Category Breakdown'
    titleCell.font = FONTS.title
    titleCell.alignment = ALIGNMENTS.left
    currentRow += 2

    const categoryColumns: ColumnDef[] = [
        { key: 'category', header: 'Category', width: 30 },
        { key: 'revenue', header: 'Revenue', width: 16, format: 'currency', align: 'right' },
        { key: 'expenses', header: 'Expenses', width: 16, format: 'currency', align: 'right' },
        { key: 'netAmount', header: 'Net', width: 16, format: 'currency', align: 'right' },
    ]

    addHeaderRow(worksheet, categoryColumns, currentRow, false)
    currentRow++

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

    currentRow += 2

    return currentRow
}

export function addGrandTotals(
    worksheet: ExcelJS.Worksheet,
    columns: ColumnDef[],
    totals: GroupTotals,
    row: number
): void {
    const grandTotalsRow = worksheet.getRow(row)

    worksheet.mergeCells(row, 1, row, 2)
    const labelCell = grandTotalsRow.getCell(1)
    labelCell.value = 'GRAND TOTAL'
    labelCell.font = { ...FONTS.subtotal, size: 12 }
    labelCell.fill = FILLS.header
    labelCell.border = b.subtotal
    labelCell.alignment = ALIGNMENTS.left

    for (let i = 2; i < columns.length; i++) {
        const col = i + 1
        const column = columns[i]
        const cell = grandTotalsRow.getCell(col)

        if (column.key === 'debit') {
            cell.value = totals.totalDebit
            cell.numFmt = NUMBER_FORMATS.currency
        } else if (column.key === 'credit') {
            cell.value = totals.totalCredit
            cell.numFmt = NUMBER_FORMATS.currency
        } else if (column.key === 'netAmount' || column.key === 'balance') {
            cell.value = totals.netAmount
            cell.numFmt = NUMBER_FORMATS.currency
        } else if (column.key === 'transactionCount' || column.key === 'count' || column.key === 'entryCount') {
            cell.value = totals.entryCount
            cell.numFmt = NUMBER_FORMATS.integer
        } else if (column.key === 'revenue') {
            cell.value = totals.totalCredit
            cell.numFmt = NUMBER_FORMATS.currency
        } else if (column.key === 'expenses') {
            cell.value = totals.totalDebit
            cell.numFmt = NUMBER_FORMATS.currency
        } else if (column.key === 'netIncome') {
            cell.value = totals.netAmount
            cell.numFmt = NUMBER_FORMATS.currency
        } else {
            cell.value = undefined
        }

        cell.font = { ...FONTS.subtotal, size: 12 }
        cell.fill = FILLS.header
        cell.border = b.subtotal
        cell.alignment = getAlignment(column.align, 'body')
    }

    grandTotalsRow.height = 28
}

function getAlignment(
    align?: 'left' | 'center' | 'right',
    type: 'header' | 'body' = 'body'
): Partial<ExcelJS.Alignment> {
    switch (align) {
        case 'left':
            return type === 'header' ? ALIGNMENTS.headerLeft : ALIGNMENTS.left
        case 'right':
            return type === 'header' ? ALIGNMENTS.headerRight : ALIGNMENTS.right
        case 'center':
            return type === 'header' ? ALIGNMENTS.headerCenter : ALIGNMENTS.center
        default:
            return type === 'header' ? ALIGNMENTS.headerLeft : ALIGNMENTS.left
    }
}

function getColumnLetter(col: number): string {
    let letter = ''
    while (col > 0) {
        const remainder = (col - 1) % 26
        letter = String.fromCharCode(65 + remainder) + letter
        col = Math.floor((col - 1) / 26)
    }
    return letter
}

function formatDate(dateStr: string): string {
    try {
        const date = new Date(dateStr)
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const year = date.getFullYear()
        return `${month}/${day}/${year}`
    } catch {
        return dateStr
    }
}
