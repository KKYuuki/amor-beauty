import { Alignment, Border, Fill, Font } from 'exceljs'

export const COLORS = {
    headerBg: '1F2937',
    headerFont: 'FFFFFF',
    sectionBg: '3B82F6',
    sectionFont: 'FFFFFF',
    subtotalBg: 'E5E7EB',
    subtotalFont: '111827',
    kpiPositive: '10B981',
    kpiPositiveBg: 'D1FAE5',
    kpiNegative: 'EF4444',
    kpiNegativeBg: 'FEE2E2',
    kpiNeutral: '6366F1',
    kpiNeutralBg: 'E0E7FF',
    altRow1: 'F9FAFB',
    altRow2: 'FFFFFF',
    borderLight: 'D1D5DB',
    borderMedium: '9CA3AF',
    borderHeavy: '374151',
    branchTabBlue: '3B82F6',
    summaryTabGreen: '10B981',
    bodyFont: '374151',
    titleFont: '111827',
} as const

export const FONTS = {
    header: { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerFont } } as Partial<Font>,
    sectionTitle: { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.sectionFont } } as Partial<Font>,
    body: { name: 'Calibri', size: 10, color: { argb: COLORS.bodyFont } } as Partial<Font>,
    subtotal: { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.subtotalFont } } as Partial<Font>,
    title: { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.titleFont } } as Partial<Font>,
    subtitle: { name: 'Calibri', size: 12, color: { argb: COLORS.bodyFont } } as Partial<Font>,
    kpiValue: { name: 'Calibri', size: 14, bold: true } as Partial<Font>,
    kpiLabel: { name: 'Calibri', size: 9, color: { argb: '6B7280' } } as Partial<Font>,
} as const

export const FILLS = {
    header: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } } as Fill,
    section: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sectionBg } } as Fill,
    subtotal: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtotalBg } } as Fill,
    altRow1: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.altRow1 } } as Fill,
    altRow2: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.altRow2 } } as Fill,
    kpiPositive: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.kpiPositiveBg } } as Fill,
    kpiNegative: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.kpiNegativeBg } } as Fill,
    kpiNeutral: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.kpiNeutralBg } } as Fill,
} as const

export const BORDERS = {
    header: {
        top: { style: 'thin', color: { argb: COLORS.borderHeavy } },
        bottom: { style: 'medium', color: { argb: COLORS.sectionBg } },
        left: { style: 'thin', color: { argb: COLORS.borderMedium } },
        right: { style: 'thin', color: { argb: COLORS.borderMedium } },
    } as Partial<Border>,
    body: {
        top: { style: 'hair', color: { argb: COLORS.borderLight } },
        bottom: { style: 'hair', color: { argb: COLORS.borderLight } },
        left: { style: 'hair', color: { argb: COLORS.borderLight } },
        right: { style: 'hair', color: { argb: COLORS.borderLight } },
    } as Partial<Border>,
    subtotal: {
        top: { style: 'medium', color: { argb: COLORS.borderHeavy } },
        bottom: { style: 'double', color: { argb: COLORS.borderHeavy } },
        left: { style: 'thin', color: { argb: COLORS.borderMedium } },
        right: { style: 'thin', color: { argb: COLORS.borderMedium } },
    } as Partial<Border>,
    section: {
        top: { style: 'medium', color: { argb: COLORS.sectionBg } },
        bottom: { style: 'medium', color: { argb: COLORS.sectionBg } },
        left: { style: 'medium', color: { argb: COLORS.sectionBg } },
        right: { style: 'medium', color: { argb: COLORS.sectionBg } },
    } as Partial<Border>,
} as const

export const ALIGNMENTS = {
    left: { horizontal: 'left', vertical: 'middle', wrapText: true } as Partial<Alignment>,
    center: { horizontal: 'center', vertical: 'middle' } as Partial<Alignment>,
    right: { horizontal: 'right', vertical: 'middle' } as Partial<Alignment>,
    headerLeft: { horizontal: 'left', vertical: 'middle' } as Partial<Alignment>,
    headerCenter: { horizontal: 'center', vertical: 'middle' } as Partial<Alignment>,
    headerRight: { horizontal: 'right', vertical: 'middle' } as Partial<Alignment>,
} as const

export const NUMBER_FORMATS = {
    currency: '₱#,##0.00;[Red]₱#,##0.00',
    currencyPositive: '₱#,##0.00',
    number: '#,##0',
    percent: '0.0%',
    date: 'MM/DD/YYYY',
    integer: '#,##0',
} as const

export const LEDGER_COLUMNS: import('./types').ColumnDef[] = [
    { key: 'date', header: 'Date', width: 12, format: 'date', align: 'center' },
    { key: 'type', header: 'Type', width: 12, format: 'text' },
    { key: 'payment_method', header: 'Payment', width: 16, format: 'text' },
    { key: 'category', header: 'Category', width: 20, format: 'text' },
    { key: 'description', header: 'Description', width: 40, format: 'text' },
    { key: 'reference', header: 'Reference', width: 18, format: 'text' },
    { key: 'debit', header: 'Debit', width: 14, format: 'currency', align: 'right' },
    { key: 'credit', header: 'Credit', width: 14, format: 'currency', align: 'right' },
    { key: 'balance', header: 'Balance', width: 14, format: 'currency', align: 'right' },
]

export const METRICS_LEDGER_COLUMNS: import('./types').ColumnDef[] = [
    { key: 'date', header: 'Date', width: 12, format: 'date', align: 'center' },
    { key: 'revenue', header: 'Revenue', width: 16, format: 'currency', align: 'right' },
    { key: 'expenses', header: 'Expenses', width: 16, format: 'currency', align: 'right' },
    { key: 'netIncome', header: 'Net Income', width: 16, format: 'currency', align: 'right' },
    { key: 'transactionCount', header: 'Transactions', width: 14, format: 'number', align: 'center' },
    { key: 'averageTicket', header: 'Avg. Ticket', width: 14, format: 'currency', align: 'right' },
]

export function getKpiColor(value: number): string {
    if (value > 0) return COLORS.kpiPositive
    if (value < 0) return COLORS.kpiNegative
    return COLORS.kpiNeutral
}

export function getKpiFill(value: number): Fill {
    if (value > 0) return FILLS.kpiPositive
    if (value < 0) return FILLS.kpiNegative
    return FILLS.kpiNeutral
}
