import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'

import {
    ExportResult,
    ExportFormat,
    GroupedExportOptions,
    LedgerExportRow,
    MetricsExportRow,
    GroupedEntryGroup,
    GroupTotals,
    BranchInfo,
    ColumnDef,
    SummaryKPI,
} from './types'
import { groupEntries } from './grouping'
import { buildSummarySheet } from './summary-builder'
import {
    addTitleSection,
    addHeaderRow,
    addDataRows,
    addSubtotalRow,
    addGroupedData,
    addGrandTotals,
    addKPISection,
} from './worksheet-builder'
import {
    addPaymentMethodDistributionChart,
} from './chart-builder'
import {
    LEDGER_COLUMNS,
    METRICS_LEDGER_COLUMNS,
    COLORS,
} from './styling'

function getLedgerColumnsWithoutBalance(): ColumnDef[] {
    return LEDGER_COLUMNS.filter(col => col.key !== 'balance')
}

function collectBranchData(
    groups: GroupedEntryGroup[]
): Map<string | null, GroupTotals> {
    const branchData = new Map<string | null, GroupTotals>()

    for (const group of groups) {
        const branchKey = group.key
        const existing = branchData.get(branchKey) || {
            totalDebit: 0,
            totalCredit: 0,
            netAmount: 0,
            entryCount: 0,
        }

        branchData.set(branchKey, {
            totalDebit: existing.totalDebit + group.totals.totalDebit,
            totalCredit: existing.totalCredit + group.totals.totalCredit,
            netAmount: existing.netAmount + group.totals.netAmount,
            entryCount: existing.entryCount + group.totals.entryCount,
        })

        if (group.subGroups) {
            const subData = collectBranchData(group.subGroups)
            subData.forEach((value, key) => {
                const existing = branchData.get(key) || {
                    totalDebit: 0,
                    totalCredit: 0,
                    netAmount: 0,
                    entryCount: 0,
                }
                branchData.set(key, {
                    totalDebit: existing.totalDebit + value.totalDebit,
                    totalCredit: existing.totalCredit + value.totalCredit,
                    netAmount: existing.netAmount + value.netAmount,
                    entryCount: existing.entryCount + value.entryCount,
                })
            })
        }
    }

    return branchData
}

function collectPaymentData(
    groups: GroupedEntryGroup[]
): Map<string, GroupTotals> {
    const paymentData = new Map<string, GroupTotals>()

    function processGroup(group: GroupedEntryGroup) {
        for (const entry of group.entries) {
            const method = entry.payment_method || 'Unspecified'
            const existing = paymentData.get(method) || {
                totalDebit: 0,
                totalCredit: 0,
                netAmount: 0,
                entryCount: 0,
            }

            paymentData.set(method, {
                totalDebit: existing.totalDebit + entry.debit,
                totalCredit: existing.totalCredit + entry.credit,
                netAmount: existing.netAmount + (entry.credit - entry.debit),
                entryCount: existing.entryCount + 1,
            })
        }

        if (group.subGroups) {
            for (const subGroup of group.subGroups) {
                processGroup(subGroup)
            }
        }
    }

    for (const group of groups) {
        processGroup(group)
    }

    return paymentData
}

function collectCategoryData(
    groups: GroupedEntryGroup[]
): Map<string, GroupTotals> {
    const categoryData = new Map<string, GroupTotals>()

    function processGroup(group: GroupedEntryGroup) {
        for (const entry of group.entries) {
            const category = entry.category || 'Uncategorized'
            const existing = categoryData.get(category) || {
                totalDebit: 0,
                totalCredit: 0,
                netAmount: 0,
                entryCount: 0,
            }

            categoryData.set(category, {
                totalDebit: existing.totalDebit + entry.debit,
                totalCredit: existing.totalCredit + entry.credit,
                netAmount: existing.netAmount + (entry.credit - entry.debit),
                entryCount: existing.entryCount + 1,
            })
        }

        if (group.subGroups) {
            for (const subGroup of group.subGroups) {
                processGroup(subGroup)
            }
        }
    }

    for (const group of groups) {
        processGroup(group)
    }

    return categoryData
}

async function workbookToBase64(workbook: ExcelJS.Workbook): Promise<string> {
    const arrayBuffer = await workbook.xlsx.writeBuffer()
    const buffer = Buffer.from(arrayBuffer)
    return buffer.toString('base64')
}

function generateFilename(
    prefix: string,
    format: ExportFormat,
    dateStr?: string
): string {
    const timestamp = dateStr || new Date().toISOString().split('T')[0]
    const ext = format === 'xlsx' ? 'xlsx' : format === 'csv' ? 'csv' : 'pdf'
    return `${prefix}_${timestamp}.${ext}`
}

function generatePDFFromLedgerData(
    entries: LedgerExportRow[],
    title: string,
    generatedAt: string
): string {
    const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
    })

    pdf.setFontSize(18)
    pdf.setTextColor(17, 24, 39)
    pdf.text(title, 14, 22)

    pdf.setFontSize(10)
    pdf.setTextColor(107, 114, 128)
    pdf.text(`Generated: ${generatedAt}`, 14, 30)

    const headers = ['Date', 'Type', 'Payment Method', 'Category', 'Description', 'Debit', 'Credit', 'Balance', 'Branch']
    const colWidths = [25, 20, 30, 30, 50, 25, 25, 25, 35]
    const startY = 40
    let y = startY

    pdf.setFontSize(9)
    pdf.setTextColor(17, 24, 39)
    let x = 14
    headers.forEach((header, i) => {
        pdf.text(header, x, y)
        x += colWidths[i]
    })

    y += 6
    pdf.setDrawColor(200, 200, 200)
    pdf.line(14, y - 2, 277, y - 2)

    pdf.setTextColor(55, 65, 81)
    for (const entry of entries) {
        if (y > 180) {
            pdf.addPage()
            y = 20
        }
        x = 14
        pdf.text(String(entry.date), x, y)
        x += colWidths[0]
        pdf.text(String(entry.type || ''), x, y)
        x += colWidths[1]
        pdf.text(String(entry.payment_method || ''), x, y)
        x += colWidths[2]
        pdf.text(String(entry.category || ''), x, y)
        x += colWidths[3]
        const desc = String(entry.description || '').substring(0, 30)
        pdf.text(desc, x, y)
        x += colWidths[4]
        pdf.text(entry.debit.toFixed(2), x, y)
        x += colWidths[5]
        pdf.text(entry.credit.toFixed(2), x, y)
        x += colWidths[6]
        pdf.text(entry.balance.toFixed(2), x, y)
        x += colWidths[7]
        pdf.text(String(entry.branch || ''), x, y)
        y += 6
    }

    return pdf.output('datauristring')
}

function generatePDFFromMetricsData(
    metrics: MetricsExportRow[],
    title: string,
    generatedAt: string
): string {
    const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
    })

    pdf.setFontSize(18)
    pdf.setTextColor(17, 24, 39)
    pdf.text(title, 14, 22)

    pdf.setFontSize(10)
    pdf.setTextColor(107, 114, 128)
    pdf.text(`Generated: ${generatedAt}`, 14, 30)

    const headers = ['Date', 'Revenue', 'Expenses', 'Net Income', 'Transactions', 'Avg Ticket']
    const colWidths = [30, 35, 35, 35, 35, 35]
    const startY = 40
    let y = startY

    pdf.setFontSize(9)
    pdf.setTextColor(17, 24, 39)
    let x = 14
    headers.forEach((header, i) => {
        pdf.text(header, x, y)
        x += colWidths[i]
    })

    y += 6
    pdf.setDrawColor(200, 200, 200)
    pdf.line(14, y - 2, 277, y - 2)

    pdf.setTextColor(55, 65, 81)
    for (const m of metrics) {
        if (y > 180) {
            pdf.addPage()
            y = 20
        }
        x = 14
        pdf.text(String(m.date), x, y)
        x += colWidths[0]
        pdf.text(m.revenue.toFixed(2), x, y)
        x += colWidths[1]
        pdf.text(m.expenses.toFixed(2), x, y)
        x += colWidths[2]
        pdf.text(m.netIncome.toFixed(2), x, y)
        x += colWidths[3]
        pdf.text(String(m.transactionCount), x, y)
        x += colWidths[4]
        pdf.text(m.averageTicket.toFixed(2), x, y)
        y += 6
    }

    if (metrics.length > 0) {
        y += 4
        pdf.setDrawColor(150, 150, 150)
        pdf.line(14, y - 2, 277, y - 2)
        y += 4

        const totalRevenue = metrics.reduce((sum, m) => sum + m.revenue, 0)
        const totalExpenses = metrics.reduce((sum, m) => sum + m.expenses, 0)
        const totalNetIncome = metrics.reduce((sum, m) => sum + m.netIncome, 0)
        const totalTransactions = metrics.reduce((sum, m) => sum + m.transactionCount, 0)

        pdf.setFontSize(9)
        pdf.setTextColor(17, 24, 39)
        pdf.text('Grand Total', 14, y)
        pdf.text(totalRevenue.toFixed(2), 14 + colWidths[0], y)
        pdf.text(totalExpenses.toFixed(2), 14 + colWidths[0] + colWidths[1], y)
        pdf.text(totalNetIncome.toFixed(2), 14 + colWidths[0] + colWidths[1] + colWidths[2], y)
        pdf.text(String(totalTransactions), 14 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], y)
    }

    return pdf.output('datauristring')
}

function escapeCSVField(field: string | number): string {
    const str = String(field)
    if (str.match(/^[=+\-@\t\r]/)) {
        return `'"${str}"`
    }
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

function createWorkbook(): ExcelJS.Workbook {
    return new ExcelJS.Workbook()
}

function addGroupedSheets(
    workbook: ExcelJS.Workbook,
    groups: GroupedEntryGroup[],
    primaryDimension: string | undefined,
    options: GroupedExportOptions
): void {
    const columnsWithoutBalance = getLedgerColumnsWithoutBalance()
    const existingSheetNames = new Set<string>()

    for (const group of groups) {
        const sheetName = `${primaryDimension || 'Group'}: ${group.label}`.substring(0, 31)
        let uniqueName = sheetName
        let counter = 1

        while (existingSheetNames.has(uniqueName)) {
            const suffix = ` (${counter})`
            uniqueName = sheetName.substring(0, 31 - suffix.length) + suffix
            counter++
        }

        existingSheetNames.add(uniqueName)

        const worksheet = workbook.addWorksheet(uniqueName)

        try {
            worksheet.properties.tabColor = { argb: COLORS.branchTabBlue }
        } catch (error) {
            console.error('Failed to set worksheet tab color:', error)
        }

        addTitleSection(worksheet, {
            title: group.label,
            subtitle: options.subtitle,
            startDate: options.scope?.startDate,
            endDate: options.scope?.endDate,
            generatedAt: options.generatedAt,
        })

        let currentRow = 6

        if (options.grouping.includeCharts) {
            const paymentData = collectPaymentData([group])
            if (paymentData.size > 0) {
                const paymentMethods = Array.from(paymentData.entries()).map(
                    ([method, data]) => ({
                        method,
                        label: method,
                        total: data.netAmount,
                    })
                )
                addPaymentMethodDistributionChart(worksheet, paymentMethods, currentRow, 1)
            }
            currentRow += 12
        }

        currentRow = addGroupedData(
            worksheet,
            [group],
            LEDGER_COLUMNS,
            columnsWithoutBalance,
            currentRow,
            true
        )

        currentRow++
        addGrandTotals(worksheet, columnsWithoutBalance, group.totals, currentRow)
    }
}

export async function generateGroupedLedgerExport(
    entries: LedgerExportRow[],
    options: GroupedExportOptions,
    branches?: BranchInfo[]
): Promise<ExportResult> {
    const workbook = createWorkbook()
    const generatedAt = options.generatedAt || new Date().toISOString()

    const groups = groupEntries(entries, options.grouping, branches)
    const primaryDimension = options.grouping.dimensions[0]
    const branchData = collectBranchData(groups)
    const paymentData = collectPaymentData(groups)
    const categoryData = collectCategoryData(groups)

    if (options.grouping.includeSummary) {
        buildSummarySheet(workbook, {
            title: options.title || 'Financial Summary Report',
            subtitle: options.subtitle,
            startDate: options.scope?.startDate,
            endDate: options.scope?.endDate,
            generatedAt,
            scope: options.scope,
            branches,
            branchData,
            paymentData,
            categoryData,
        })
    }

    if (groups.length > 0 && groups[0].entries.length > 0) {
        addGroupedSheets(workbook, groups, primaryDimension, options)
    }

    if (options.format === 'pdf') {
        const pdfContent = generatePDFFromLedgerData(
            entries,
            options.title || 'Financial Report',
            generatedAt
        )
        return {
            content: pdfContent,
            filename: generateFilename('ledger_export', 'pdf'),
            mimeType: 'application/pdf',
        }
    }

    if (options.format === 'csv') {
        const csvContent = generateGroupedCSV(entries, groups, options, branchData)
        return {
            content: Buffer.from(csvContent).toString('base64'),
            filename: generateFilename('ledger_export', 'csv'),
            mimeType: 'text/csv',
        }
    }

    const xlsxContent = await workbookToBase64(workbook)
    return {
        content: xlsxContent,
        filename: generateFilename('ledger_export', 'xlsx'),
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
}

export async function generateGroupedMetricsExport(
    metrics: MetricsExportRow[],
    options: GroupedExportOptions
): Promise<ExportResult> {
    const workbook = createWorkbook()
    const generatedAt = options.generatedAt || new Date().toISOString()

    const worksheet = workbook.addWorksheet('Metrics')

    try {
        worksheet.properties.tabColor = { argb: COLORS.summaryTabGreen }
    } catch (error) {
        console.error('Failed to set worksheet tab color:', error)
    }

    addTitleSection(worksheet, {
        title: options.title || 'Metrics Report',
        subtitle: options.subtitle,
        startDate: options.scope?.startDate,
        endDate: options.scope?.endDate,
        generatedAt,
    })

    const kpis: SummaryKPI[] = []

    if (metrics.length > 0) {
        const totalRevenue = metrics.reduce((sum, m) => sum + m.revenue, 0)
        const totalExpenses = metrics.reduce((sum, m) => sum + m.expenses, 0)
        const totalNetIncome = metrics.reduce((sum, m) => sum + m.netIncome, 0)
        const totalTransactions = metrics.reduce((sum, m) => sum + m.transactionCount, 0)

        kpis.push(
            { label: 'Total Revenue', value: totalRevenue, format: 'currency' as const, color: COLORS.kpiPositive },
            { label: 'Total Expenses', value: totalExpenses, format: 'currency' as const, color: COLORS.kpiNegative },
            { label: 'Net Income', value: totalNetIncome, format: 'currency' as const, color: totalNetIncome >= 0 ? COLORS.kpiPositive : COLORS.kpiNegative },
            { label: 'Total Transactions', value: totalTransactions, format: 'number' as const, color: COLORS.kpiNeutral }
        )
    }

    let currentRow = 6
    if (kpis.length > 0) {
        currentRow = addKPISection(worksheet, kpis, 6)
        currentRow++
    }

    addHeaderRow(worksheet, METRICS_LEDGER_COLUMNS, currentRow, true)
    currentRow++

    currentRow = addDataRows(
        worksheet,
        metrics as unknown as Record<string, unknown>[],
        METRICS_LEDGER_COLUMNS,
        currentRow,
        'date'
    )

    if (metrics.length > 0) {
        currentRow++
        const totals: GroupTotals = {
            totalDebit: metrics.reduce((sum, m) => sum + m.expenses, 0),
            totalCredit: metrics.reduce((sum, m) => sum + m.revenue, 0),
            netAmount: metrics.reduce((sum, m) => sum + m.netIncome, 0),
            entryCount: metrics.reduce((sum, m) => sum + m.transactionCount, 0),
        }

        addSubtotalRow(worksheet, METRICS_LEDGER_COLUMNS, totals, 'Grand Total', currentRow)
    }

    if (options.format === 'pdf') {
        const pdfContent = generatePDFFromMetricsData(
            metrics,
            options.title || 'Metrics Report',
            generatedAt
        )
        return {
            content: pdfContent,
            filename: generateFilename('metrics_export', 'pdf'),
            mimeType: 'application/pdf',
        }
    }

    if (options.format === 'csv') {
        const csvContent = generateMetricsCSV(metrics)
        return {
            content: Buffer.from(csvContent).toString('base64'),
            filename: generateFilename('metrics_export', 'csv'),
            mimeType: 'text/csv',
        }
    }

    const xlsxContent = await workbookToBase64(workbook)
    return {
        content: xlsxContent,
        filename: generateFilename('metrics_export', 'xlsx'),
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
}

export function generateFlatCSVExport(entries: LedgerExportRow[]): ExportResult {
    const csvContent = generateFlatCSV(entries)
    return {
        content: Buffer.from(csvContent).toString('base64'),
        filename: generateFilename('ledger_export', 'csv'),
        mimeType: 'text/csv',
    }
}

function generateFlatCSV(entries: LedgerExportRow[]): string {
    const headers = [
        'Date',
        'Type',
        'Payment Method',
        'Category',
        'Description',
        'Reference',
        'Debit',
        'Credit',
        'Balance',
        'Source',
        'Branch',
        'Branch Code',
    ]

    const rows = entries.map(entry => [
        escapeCSVField(entry.date),
        escapeCSVField(entry.type),
        escapeCSVField(entry.payment_method),
        escapeCSVField(entry.category),
        escapeCSVField(entry.description || ''),
        escapeCSVField(entry.reference),
        escapeCSVField(entry.debit),
        escapeCSVField(entry.credit),
        escapeCSVField(entry.balance),
        escapeCSVField(entry.source),
        escapeCSVField(entry.branch || ''),
        escapeCSVField(entry.branchCode),
    ])

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
}

function generateGroupedCSV(
    entries: LedgerExportRow[],
    groups: GroupedEntryGroup[],
    options: GroupedExportOptions,
    branchData: Map<string | null, GroupTotals>
): string {
    const lines: string[] = []

    lines.push('=== FINANCIAL SUMMARY ===')
    lines.push('')

    if (branchData.size > 0) {
        lines.push('--- KPIs ---')
        let totalRevenue = 0
        let totalExpenses = 0
        let totalEntries = 0

        branchData.forEach((data) => {
            totalRevenue += data.totalCredit
            totalExpenses += data.totalDebit
            totalEntries += data.entryCount
        })

        const netIncome = totalRevenue - totalExpenses

        lines.push(`Total Revenue,${totalRevenue.toFixed(2)}`)
        lines.push(`Total Expenses,${totalExpenses.toFixed(2)}`)
        lines.push(`Net Income,${netIncome.toFixed(2)}`)
        lines.push(`Total Entries,${totalEntries}`)
        lines.push('')
    }

    lines.push('=== DETAILS ===')
    lines.push('')

    const headers = [
        'Date',
        'Type',
        'Payment Method',
        'Category',
        'Description',
        'Reference',
        'Debit',
        'Credit',
        'Balance',
        'Source',
        'Branch',
        'Branch Code',
    ]
    lines.push(headers.join(','))

    function addGroup(group: GroupedEntryGroup, depth: number = 0): void {
        lines.push(`=== ${options.grouping.dimensions[0] || 'Group'}: ${group.label} ===`)

        for (const entry of group.entries) {
            const row = [
                escapeCSVField(entry.date),
                escapeCSVField(entry.type),
                escapeCSVField(entry.payment_method),
                escapeCSVField(entry.category),
                escapeCSVField(entry.description || ''),
                escapeCSVField(entry.reference),
                escapeCSVField(entry.debit),
                escapeCSVField(entry.credit),
                escapeCSVField(entry.balance),
                escapeCSVField(entry.source),
                escapeCSVField(entry.branch || ''),
                escapeCSVField(entry.branchCode),
            ]
            lines.push(row.join(','))
        }

        lines.push(`--- Subtotal: ${group.label} ---`)
        lines.push(`,,,,,,,${group.totals.totalDebit.toFixed(2)},${group.totals.totalCredit.toFixed(2)},,`)
        lines.push('')

        if (group.subGroups) {
            for (const subGroup of group.subGroups) {
                addGroup(subGroup, depth + 1)
            }
        }
    }

    for (const group of groups) {
        addGroup(group)
    }

    lines.push('=== GRAND TOTAL ===')
    let grandDebit = 0
    let grandCredit = 0
    let grandCount = 0

    for (const group of groups) {
        grandDebit += group.totals.totalDebit
        grandCredit += group.totals.totalCredit
        grandCount += group.totals.entryCount
    }

    lines.push(`Total Entries,${grandCount}`)
    lines.push(`Total Debit,${grandDebit.toFixed(2)}`)
    lines.push(`Total Credit,${grandCredit.toFixed(2)}`)
    lines.push(`Net Amount,${(grandCredit - grandDebit).toFixed(2)}`)

    return lines.join('\n')
}

function generateMetricsCSV(metrics: MetricsExportRow[]): string {
    const headers = [
        'Date',
        'Revenue',
        'Expenses',
        'Net Income',
        'Transaction Count',
        'Average Ticket',
    ]

    const rows = metrics.map(m => [
        m.date,
        m.revenue.toFixed(2),
        m.expenses.toFixed(2),
        m.netIncome.toFixed(2),
        m.transactionCount.toString(),
        m.averageTicket.toFixed(2),
    ])

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
}

export {
    groupEntries,
} from './grouping'

export {
    buildSummarySheet,
} from './summary-builder'

export {
    addTitleSection,
    addHeaderRow,
    addDataRows,
    addSubtotalRow,
    addGroupedData,
    addGrandTotals,
    addBranchComparisonTable,
    addPaymentMethodBreakdown,
    addCategoryBreakdown,
    addKPISection,
} from './worksheet-builder'

export {
    addPaymentMethodDistributionChart,
    addCategoryBreakdownChart,
    addRevenueExpenseTrendChart,
} from './chart-builder'

export {
    COLORS,
    FONTS,
    FILLS,
    BORDERS,
    ALIGNMENTS,
    NUMBER_FORMATS,
    LEDGER_COLUMNS,
    METRICS_LEDGER_COLUMNS,
    getKpiColor,
    getKpiFill,
} from './styling'

export {
    buildMetricsSummarySheet,
    buildRevenueTrendSheet,
    buildOperationalMetricsSheet,
    buildCategoryBreakdownSheet,
    buildPaymentMethodBreakdownSheet,
    buildBranchComparisonSheet,
    buildStaffPerformanceSheet,
    buildInventorySheet,
} from './metrics-sheet-builder'

export type {
    ExportResult,
    ExportFormat,
    GroupedExportOptions,
    GroupingConfig,
    LedgerExportRow,
    MetricsExportRow,
    GroupedEntryGroup,
    GroupTotals,
    BranchInfo,
    ColumnDef,
    SummaryKPI,
    ExportScope,
    ExportFilters,
    LedgerExportScope,
    GroupingDimension,
} from './types'
