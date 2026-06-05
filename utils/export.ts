/**
 * Export utilities for generating CSV and JSON exports
 */

export interface ExportColumn {
    key: string
    header: string
    formatter?: (value: unknown) => string
}

export interface ExportOptions {
    filename: string
    format: 'csv' | 'json'
    columns: ExportColumn[]
}

/**
 * Formats a value for CSV output
 */
function formatCsvValue(value: unknown): string {
    if (value === null || value === undefined) {
        return ''
    }
    const str = String(value)
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

/**
 * Converts array of objects to CSV string
 */
export function arrayToCsv<T extends Record<string, unknown>>(
    data: T[],
    columns: ExportColumn[]
): string {
    const headers = columns.map(col => col.header)
    const rows = data.map(item =>
        columns.map(col => {
            const value = item[col.key]
            const formatted = col.formatter ? col.formatter(value) : value
            return formatCsvValue(formatted)
        }).join(',')
    )
    return [headers.join(','), ...rows].join('\n')
}

/**
 * Converts array of objects to pretty-printed JSON string
 */
export function arrayToJson<T extends Record<string, unknown>>(
    data: T[],
    columns: ExportColumn[]
): string {
    const filteredData = data.map(item => {
        const result: Record<string, unknown> = {}
        for (const col of columns) {
            const value = item[col.key]
            result[col.key] = col.formatter ? col.formatter(value) : value
        }
        return result
    })
    return JSON.stringify(filteredData, null, 2)
}

/**
 * Generates a filename with timestamp
 */
export function generateFilename(baseName: string, format: 'csv' | 'json'): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    return `${baseName}_${timestamp}.${format}`
}

/**
 * Creates a download response for export
 */
export function createExportResponse<T extends Record<string, unknown>>(
    data: T[],
    options: ExportOptions
): { content: string; contentType: string; filename: string } {
    const content = options.format === 'csv'
        ? arrayToCsv(data, options.columns)
        : arrayToJson(data, options.columns)
    
    const contentType = options.format === 'csv'
        ? 'text/csv'
        : 'application/json'
    
    const filename = generateFilename(options.filename, options.format)
    
    return { content, contentType, filename }
}
