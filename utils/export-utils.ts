/**
 * Transaction Export Utilities
 * Handles conversion of transaction data to CSV, Excel, and PDF formats
 */

import { Transaction } from './types/transactions'
import { InventoryItem } from './types/inventory'
import { formatManilaTime } from './timezone'

// --- Types ---

export interface ExportRow {
    transaction_number: string
    date: string
    time: string
    staff: string
    customer: string
    items_count: number
    items_detail: string
    subtotal: number
    tax: number
    discount: number
    total: number
    payment_method: string
    reference_number: string
    status: string
    notes: string
}

export interface InventoryExportRow {
    name: string
    code: string
    category: string
    type: string
    stock: number
    warning_threshold: number
    is_low_stock: string
    unit_price: number
    selling_price: number
    valuation: number
    last_restocked: string
    status: string
}

export type ExportFormat = 'csv' | 'excel' | 'pdf'

// --- Formatters ---

/**
 * Format transactions into a flat array of export rows
 */
export function formatTransactionsForExport(transactions: Transaction[]): ExportRow[] {
    return transactions.map((txn) => {
        const itemsDetail = txn.items?.map(item =>
            `${item.item_name} x${item.quantity}`
        ).join('; ') || ''

        return {
            transaction_number: txn.transaction_number,
            date: formatManilaTime(txn.created_at, 'date'),
            time: formatManilaTime(txn.created_at, 'time'),
            staff: txn.staff?.full_name || 'Unknown',
            customer: txn.buyer?.full_name || txn.buyer_name || 'Walk-in',
            items_count: txn.items?.length || 0,
            items_detail: itemsDetail,
            subtotal: txn.subtotal,
            tax: txn.tax_amount,
            discount: txn.discount_amount,
            total: txn.total,
            payment_method: txn.payment_method,
            reference_number: txn.reference_number || '',
            status: txn.status,
            notes: txn.notes || '',
        }
    })
}

/**
 * Format inventory items into a flat array of export rows
 */
export function formatInventoryForExport(items: InventoryItem[]): InventoryExportRow[] {
    return items.map((item) => {
        const lastRestocked = item.last_restocked
            ? new Date(item.last_restocked).toLocaleDateString('en-PH', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric'
            })
            : 'N/A'

        const isLowStock = item.current_stock <= (item.stock_warning_threshold || 0) ? 'Yes' : 'No'
        const valuation = (item.unit_price || 0) * item.current_stock

        return {
            name: item.name,
            code: item.item_code || 'N/A',
            category: item.item_category,
            type: item.item_type,
            stock: item.current_stock,
            warning_threshold: item.stock_warning_threshold || 0,
            is_low_stock: isLowStock,
            unit_price: item.unit_price || 0,
            selling_price: item.selling_price || 0,
            valuation: valuation,
            last_restocked: lastRestocked,
            status: 'Active' // Or deleted if we process that
        }
    })
}

// --- CSV Export ---

const CSV_HEADERS = [
    'Transaction #',
    'Date',
    'Time',
    'Staff',
    'Customer',
    'Items Count',
    'Items Detail',
    'Subtotal',
    'Tax',
    'Discount',
    'Total',
    'Payment Method',
    'Reference #',
    'Status',
    'Notes',
]

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

/**
 * Generate CSV string from export rows
 */
export function generateCSV(rows: ExportRow[]): string {
    const headerLine = CSV_HEADERS.join(',')

    const dataLines = rows.map(row => [
        row.transaction_number,
        row.date,
        row.time,
        row.staff,
        row.customer,
        row.items_count,
        row.items_detail,
        row.subtotal.toFixed(2),
        row.tax.toFixed(2),
        row.discount.toFixed(2),
        row.total.toFixed(2),
        row.payment_method,
        row.reference_number,
        row.status,
        row.notes,
    ].map(escapeCSVField).join(','))

    return [headerLine, ...dataLines].join('\n')
}

// --- Inventory CSV Export ---

const INVENTORY_CSV_HEADERS = [
    'Item Name',
    'Code',
    'Category',
    'Type',
    'Stock',
    'Warning Threshold',
    'Low Stock',
    'Cost Price',
    'Selling Price',
    'Valuation',
    'Last Restocked',
    'Status'
]

export function generateInventoryCSV(rows: InventoryExportRow[]): string {
    const headerLine = INVENTORY_CSV_HEADERS.join(',')

    const dataLines = rows.map(row => [
        row.name,
        row.code,
        row.category,
        row.type,
        row.stock,
        row.warning_threshold,
        row.is_low_stock,
        row.unit_price.toFixed(2),
        row.selling_price.toFixed(2),
        row.valuation.toFixed(2),
        row.last_restocked,
        row.status
    ].map(escapeCSVField).join(','))

    return [headerLine, ...dataLines].join('\n')
}

// --- Excel Export ---

/**
 * Apply cell styling for Excel exports (requires xlsx-style or writing raw styles)
 * Note: Basic xlsx library has limited styling - we apply formatting through number formats
 */
function applyCurrencyFormat(ws: Record<string, unknown>, cols: number[], startRow: number, endRow: number) {
    const XLSX_TYPE = { t: 'n', z: '₱#,##0.00' }
    for (let row = startRow; row <= endRow; row++) {
        for (const col of cols) {
            const cellRef = String.fromCharCode(65 + col) + (row + 1)
            const cell = ws[cellRef] as { t?: string; z?: string; v?: number } | undefined
            if (cell && typeof cell.v === 'number') {
                cell.t = 'n'
                cell.z = XLSX_TYPE.z
            }
        }
    }
}

/**
 * Generate Excel workbook buffer from export rows
 * Returns a base64 encoded string with enhanced formatting
 */
export async function generateExcel(rows: ExportRow[]): Promise<string> {
    // Dynamic import to avoid SSR issues
    const XLSX = await import('xlsx')

    // Create worksheet data with headers
    const wsData = [
        CSV_HEADERS,
        ...rows.map(row => [
            row.transaction_number,
            row.date,
            row.time,
            row.staff,
            row.customer,
            row.items_count,
            row.items_detail,
            row.subtotal,
            row.tax,
            row.discount,
            row.total,
            row.payment_method,
            row.reference_number,
            row.status,
            row.notes,
        ])
    ]

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Set column widths for better readability
    ws['!cols'] = [
        { wch: 20 }, // Transaction #
        { wch: 12 }, // Date
        { wch: 10 }, // Time
        { wch: 18 }, // Staff
        { wch: 18 }, // Customer
        { wch: 10 }, // Items Count
        { wch: 45 }, // Items Detail (wider for readability)
        { wch: 14 }, // Subtotal (wider for currency)
        { wch: 12 }, // Tax
        { wch: 12 }, // Discount
        { wch: 14 }, // Total (wider for currency)
        { wch: 16 }, // Payment Method
        { wch: 18 }, // Reference #
        { wch: 12 }, // Status
        { wch: 30 }, // Notes
    ]

    // Apply currency formatting to monetary columns (Subtotal=7, Tax=8, Discount=9, Total=10)
    // Column indices: H=7, I=8, J=9, K=10 (0-indexed)
    applyCurrencyFormat(ws, [7, 8, 9, 10], 1, rows.length)

    // Freeze the header row for easier scrolling
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }

    XLSX.utils.book_append_sheet(wb, ws, 'Transactions')

    // Generate buffer and convert to base64
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return Buffer.from(buffer).toString('base64')
}

/**
 * Generate Excel workbook buffer from inventory rows
 * Returns a base64 encoded string with enhanced formatting
 */
export async function generateInventoryExcel(rows: InventoryExportRow[]): Promise<string> {
    const XLSX = await import('xlsx')

    const wsData = [
        INVENTORY_CSV_HEADERS,
        ...rows.map(row => [
            row.name,
            row.code,
            row.category,
            row.type,
            row.stock,
            row.warning_threshold,
            row.is_low_stock,
            row.unit_price,
            row.selling_price,
            row.valuation,
            row.last_restocked,
            row.status
        ])
    ]

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Set column widths for better readability
    ws['!cols'] = [
        { wch: 35 }, // Name (wider for long item names)
        { wch: 15 }, // Code
        { wch: 18 }, // Category
        { wch: 12 }, // Type
        { wch: 10 }, // Stock
        { wch: 15 }, // Warning
        { wch: 12 }, // Low Stock
        { wch: 14 }, // Cost Price (wider for currency)
        { wch: 14 }, // Selling Price (wider for currency)
        { wch: 16 }, // Valuation (wider for currency)
        { wch: 15 }, // Last Restocked
        { wch: 10 }, // Status
    ]

    // Apply currency formatting to monetary columns (Unit Price=7, Selling Price=8, Valuation=9)
    // Column indices: H=7, I=8, J=9 (0-indexed)
    applyCurrencyFormat(ws, [7, 8, 9], 1, rows.length)

    // Freeze the header row for easier scrolling
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }

    XLSX.utils.book_append_sheet(wb, ws, 'Inventory')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return Buffer.from(buffer).toString('base64')
}

// Note: PDF generation functions moved to pdf-export-server.ts
// They require Node.js fs module and can only run on the server

/**
 * Generate export file name with date
 */
export function generateExportFilename(format: ExportFormat, type: 'transactions' | 'inventory' = 'transactions'): string {
    const date = new Date().toISOString().split('T')[0]
    const extensions: Record<ExportFormat, string> = {
        csv: 'csv',
        excel: 'xlsx',
        pdf: 'pdf',
    }
    return `${type}-${date}.${extensions[format]}`
}
