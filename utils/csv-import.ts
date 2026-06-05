export interface CSVImportResult<T> {
    success: boolean
    data?: T[]
    errors?: CSVRowError[]
    skippedRows?: number
}

export interface CSVRowError {
    row: number
    field: string
    message: string
}

export interface CSVColumn {
    key: string
    label: string
    required: boolean
    type: 'string' | 'number' | 'date' | 'boolean' | 'enum'
    enumValues?: string[]
    transform?: (value: string) => unknown
}

export function parseCSV<T extends Record<string, unknown>>(
    content: string,
    columns: CSVColumn[]
): CSVImportResult<T> {
    const lines = content.trim().split('\n')

    if (lines.length < 2) {
        return {
            success: false,
            errors: [{ row: 0, field: 'file', message: 'CSV file must have header and at least one data row' }]
        }
    }

    const headerLine = lines[0]
    const dataLines = lines.slice(1)

    // Parse header
    const headers = parseCSVLine(headerLine).map(h => h.trim().toLowerCase())

    // Validate required columns
    const missingColumns: string[] = []
    for (const col of columns) {
        if (col.required && !headers.includes(col.label.toLowerCase())) {
            missingColumns.push(col.label)
        }
    }

    if (missingColumns.length > 0) {
        return {
            success: false,
            errors: [{
                row: 0,
                field: 'header',
                message: `Missing required columns: ${missingColumns.join(', ')}`
            }]
        }
    }

    // Map column indices
    const columnIndices: Record<string, number> = {}
    for (const col of columns) {
        const index = headers.findIndex(h => h === col.label.toLowerCase())
        if (index !== -1) {
            columnIndices[col.key] = index
        }
    }

    const data: T[] = []
    const errors: CSVRowError[] = []
    let skippedRows = 0

    for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i]
        if (!line.trim()) {
            skippedRows++
            continue
        }

        const values = parseCSVLine(line)
        const row: Record<string, unknown> = {}
        let hasError = false

        for (const col of columns) {
            const index = columnIndices[col.key]
            if (index === undefined && col.required) {
                errors.push({
                    row: i + 2,
                    field: col.key,
                    message: `Missing required field: ${col.label}`
                })
                hasError = true
                continue
            }

            if (index === undefined) continue

            const rawValue = values[index]?.trim() ?? ''

            // Skip empty optional fields
            if (!rawValue && !col.required) {
                continue
            }

            // Validate required
            if (col.required && !rawValue) {
                errors.push({
                    row: i + 2,
                    field: col.key,
                    message: `${col.label} is required`
                })
                hasError = true
                continue
            }

            // Transform value
            try {
                row[col.key] = validateAndTransform(rawValue, col)
            } catch (err) {
                errors.push({
                    row: i + 2,
                    field: col.key,
                    message: `Invalid ${col.label}: ${err instanceof Error ? err.message : 'Unknown error'}`
                })
                hasError = true
            }
        }

        if (!hasError) {
            data.push(row as T)
        }
    }

    return {
        success: errors.length === 0,
        data,
        errors: errors.length > 0 ? errors : undefined,
        skippedRows
    }
}

function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
        const char = line[i]

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"'
                i++
            } else {
                inQuotes = !inQuotes
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current)
            current = ''
        } else {
            current += char
        }
    }

    result.push(current)
    return result
}

function validateAndTransform(value: string, column: CSVColumn): unknown {
    switch (column.type) {
        case 'string':
            return column.transform ? column.transform(value) : value

        case 'number': {
            const num = parseFloat(value)
            if (isNaN(num)) throw new Error('Must be a number')
            return column.transform ? column.transform(value) : num
        }

        case 'date': {
            const date = new Date(value)
            if (isNaN(date.getTime())) throw new Error('Invalid date format')
            return column.transform ? column.transform(value) : date
        }

        case 'boolean': {
            const lower = value.toLowerCase()
            if (['true', 'yes', '1'].includes(lower)) return true
            if (['false', 'no', '0'].includes(lower)) return false
            throw new Error('Must be true/false, yes/no, or 1/0')
        }

        case 'enum': {
            if (!column.enumValues?.includes(value)) {
                throw new Error(`Must be one of: ${column.enumValues?.join(', ')}`)
            }
            return value
        }

        default:
            return value
    }
}

export function generateCSVTemplate(columns: CSVColumn[]): string {
    const header = columns.map(c => c.label).join(',')
    return header
}
