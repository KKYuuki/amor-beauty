# Grouped Export Templates - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a comprehensive, professionally-formatted export system for accounting and metrics data with grouping by Branch, Payment Type, Accounting Type, and Categories — with auto-calculated metrics, charts, and presentation-ready formatting.

**Architecture:** ExcelJS-based export engine in `utils/export-engine/` with modular files for types, styling, grouping, worksheet building, charts, and summary generation. Fixed grouping hierarchy (Branch → Accounting Type → Payment Method → Category) applied consistently. Server actions fetch data and delegate to engine for workbook generation.

**Tech Stack:** ExcelJS (replacing xlsx for XLSX exports), jsPDF + jspdf-autotable (for PDFs, enhanced), existing jsPDF for PDFs, TypeScript, Next.js Server Actions

---

## Phase 1: Foundation - Types, Styling & Dependencies

### Task 1: Install ExcelJS dependency

**Files:**
- Modify: `package.json`

**Step 1: Install exceljs package**

```bash
bun add exceljs
```

**Step 2: Verify installation**

```bash
bun list exceljs
```

Expected: exceljs listed with version

**Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add exceljs dependency for professional export engine"
```

---

### Task 2: Create export engine types

**Files:**
- Create: `utils/export-engine/types.ts`

**Step 1: Create the types file**

```typescript
import { LedgerEntryType } from '@/utils/types/ledger'
import { AccountingPaymentMethod } from '@/utils/types/payment'

export type ExportFormat = 'csv' | 'xlsx' | 'pdf'

export type GroupingDimension = 'branch' | 'entryType' | 'paymentMethod' | 'category'

export interface GroupingConfig {
    dimensions: GroupingDimension[]
    includeSummary: boolean
    includeCharts: boolean
}

export interface ExportScope {
    type: LedgerExportScope
    datePreset?: string
    startDate?: string
    endDate?: string
    branchId?: string | null
    filters?: ExportFilters
}

export type LedgerExportScope =
    | 'GENERAL_LEDGER'
    | 'CASH_RECEIPTS'
    | 'CASH_DISBURSEMENTS'
    | 'SALES'
    | 'PURCHASES'
    | 'CUSTOM'

export interface ExportFilters {
    entry_type?: LedgerEntryType
    category?: string
    payment_method?: AccountingPaymentMethod
    search?: string
    include_voided?: boolean
}

export interface BranchInfo {
    id: string | null
    name: string
    code: string
}

export interface GroupedEntryGroup {
    key: string
    label: string
    entries: LedgerExportRow[]
    subGroups?: GroupedEntryGroup[]
    totals: GroupTotals
}

export interface GroupTotals {
    totalDebit: number
    totalCredit: number
    netAmount: number
    entryCount: number
}

export interface LedgerExportRow {
    id: string
    date: string
    type: string
    payment_method: string
    category: string
    description: string
    reference: string
    debit: number
    credit: number
    balance: number
    source: string
    branch: string
    branchCode: string
}

export interface MetricsExportRow {
    date: string
    revenue: number
    expenses: number
    netIncome: number
    transactionCount: number
    averageTicket: number
}

export interface SummaryKPI {
    label: string
    value: number
    format: 'currency' | 'number' | 'percent'
    trend?: {
        direction: 'up' | 'down' | 'flat'
        percentChange: number
    }
    color?: string
}

export interface ColumnDef {
    key: string
    header: string
    width: number
    format?: 'currency' | 'number' | 'percent' | 'date' | 'text'
    align?: 'left' | 'center' | 'right'
}

export interface ExportResult {
    content: string
    filename: string
    mimeType: string
}

export interface GroupedExportOptions {
    format: ExportFormat
    grouping: GroupingConfig
    scope: ExportScope
    title?: string
    subtitle?: string
    generatedAt?: string
}
```

**Step 2: Verify types compile**

```bash
bun run build 2>&1 | head -20
```

Expected: Build succeeds (types not imported yet, so no errors from unused types)

**Step 3: Commit**

```bash
git add utils/export-engine/types.ts
git commit -m "feat(export): add grouped export engine type definitions"
```

---

### Task 3: Create export engine styling constants

**Files:**
- Create: `utils/export-engine/styling.ts`

**Step 1: Create the styling file**

```typescript
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
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit utils/export-engine/styling.ts 2>&1 | head -20
```

Expected: No errors (or only import resolution warnings that will resolve when engine is complete)

**Step 3: Commit**

```bash
git add utils/export-engine/styling.ts
git commit -m "feat(export): add export engine styling constants and column definitions"
```

---

## Phase 2: Data Grouping Logic

### Task 4: Create grouping module

**Files:**
- Create: `utils/export-engine/grouping.ts`

**Step 1: Create the grouping module**

```typescript
import {
    GroupingDimension,
    GroupingConfig,
    LedgerExportRow,
    GroupedEntryGroup,
    GroupTotals,
    BranchInfo,
} from './types'
import { getAccountingPaymentMethodLabel } from '@/utils/types/payment'

const DIMENSION_LABELS: Record<GroupingDimension, string> = {
    branch: 'Branch',
    entryType: 'Accounting Type',
    paymentMethod: 'Payment Method',
    category: 'Category',
}

export function getGroupKey(
    entry: LedgerExportRow,
    dimension: GroupingDimension
): string {
    switch (dimension) {
        case 'branch':
            return entry.branch || 'Shared'
        case 'entryType':
            return entry.type
        case 'paymentMethod':
            return entry.payment_method || 'Unspecified'
        case 'category':
            return entry.category || 'Uncategorized'
    }
}

export function getGroupLabel(
    key: string,
    dimension: GroupingDimension,
    branches?: BranchInfo[]
): string {
    switch (dimension) {
        case 'branch': {
            const branch = branches?.find(b =>
                b.name === key || b.code === key
            )
            return branch ? `${branch.code} - ${branch.name}` : key
        }
        case 'entryType':
            return formatEntryType(key)
        case 'paymentMethod':
            return getAccountingPaymentMethodLabel(key)
        case 'category':
            return key
    }
}

function formatEntryType(type: string): string {
    const labels: Record<string, string> = {
        EXPENSE: 'Expenses',
        REVENUE: 'Revenue',
        ASSET: 'Assets',
        LIABILITY: 'Liabilities',
        EQUITY: 'Equity',
    }
    return labels[type] || type
}

export function computeGroupTotals(entries: LedgerExportRow[]): GroupTotals {
    let totalDebit = 0
    let totalCredit = 0

    for (const entry of entries) {
        totalDebit += entry.debit
        totalCredit += entry.credit
    }

    return {
        totalDebit,
        totalCredit,
        netAmount: totalDebit - totalCredit,
        entryCount: entries.length,
    }
}

export function groupEntries(
    entries: LedgerExportRow[],
    config: GroupingConfig,
    branches?: BranchInfo[]
): GroupedEntryGroup[] {
    if (config.dimensions.length === 0) {
        return [{
            key: 'all',
            label: 'All Entries',
            entries,
            totals: computeGroupTotals(entries),
        }]
    }

    const primaryDimension = config.dimensions[0]
    return groupByDimension(entries, primaryDimension, branches, config.dimensions.slice(1))
}

function groupByDimension(
    entries: LedgerExportRow[],
    dimension: GroupingDimension,
    branches: BranchInfo[] | undefined,
    remainingDimensions: GroupingDimension[]
): GroupedEntryGroup[] {
    const groups = new Map<string, LedgerExportRow[]>()

    for (const entry of entries) {
        const key = getGroupKey(entry, dimension)
        if (!groups.has(key)) {
            groups.set(key, [])
        }
        groups.get(key)!.push(entry)
    }

    const sortedKeys = sortGroupKeys(Array.from(groups.keys()), dimension)

    return sortedKeys.map(key => {
        const groupEntries = groups.get(key)!
        const label = getGroupLabel(key, dimension, branches)
        const totals = computeGroupTotals(groupEntries)

        const subGroups = remainingDimensions.length > 0
            ? groupByDimension(groupEntries, remainingDimensions[0], branches, remainingDimensions.slice(1))
            : undefined

        return {
            key,
            label,
            entries: groupEntries,
            subGroups,
            totals,
        }
    })
}

function sortGroupKeys(keys: string[], dimension: GroupingDimension): string[] {
    const typeOrder = ['REVENUE', 'EXPENSE', 'ASSET', 'LIABILITY', 'EQUITY']

    switch (dimension) {
        case 'entryType':
            return keys.sort((a, b) => {
                const ai = typeOrder.indexOf(a)
                const bi = typeOrder.indexOf(b)
                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
            })
        case 'branch':
            return keys.sort((a, b) => {
                if (a === 'Shared') return 1
                if (b === 'Shared') return -1
                return a.localeCompare(b)
            })
        case 'paymentMethod':
        case 'category':
        default:
            return keys.sort()
    }
}

export function getSheetName(
    group: GroupedEntryGroup,
    dimension: GroupingDimension | undefined,
    existingNames: Set<string>
): string {
    const baseName = dimension
        ? `${DIMENSION_LABELS[dimension]}: ${group.label}`
        : group.label

    let sheetName = baseName.substring(0, 31)

    let counter = 1
    while (existingNames.has(sheetName)) {
        const suffix = ` (${counter})`
        sheetName = baseName.substring(0, 31 - suffix.length) + suffix
        counter++
    }

    existingNames.add(sheetName)
    return sheetName
}

export function flattenGroups(
    groups: GroupedEntryGroup[],
    depth: number = 0
): { group: GroupedEntryGroup; depth: number }[] {
    const result: { group: GroupedEntryGroup; depth: number }[] = []

    for (const group of groups) {
        result.push({ group, depth })
        if (group.subGroups) {
            result.push(...flattenGroups(group.subGroups, depth + 1))
        }
    }

    return result
}
```

**Step 2: Run type check**

```bash
npx tsc --noEmit 2>&1 | grep "export-engine" | head -20
```

Expected: No errors in export-engine files

**Step 3: Commit**

```bash
git add utils/export-engine/grouping.ts
git commit -m "feat(export): add data grouping logic for multi-dimension exports"
```

---

## Phase 3: Worksheet & Chart Builders

### Task 5: Create worksheet builder

**Files:**
- Create: `utils/export-engine/worksheet-builder.ts`

**Step 1: Create the worksheet builder**

This is a large file. Create it with the following functionality:
- `addTitleSection()` - adds report title, subtitle, date range, generation timestamp
- `addKPISection()` - adds KPI cards (Total Revenue, Expenses, Net Income, Count)
- `addHeaderRow()` - adds styled column headers with filters
- `addDataRows()` - adds styled data rows with alternating fills
- `addSubtotalRow()` - adds a subtotal row with totals and borders
- `addSectionHeader()` - adds a colored section separator row
- `addGroupedData()` - orchestrates the full grouped data rendering
- `addBranchComparisonTable()` - adds comparison table to summary sheet
- `addPaymentMethodBreakdown()` - adds payment method distribution table
- `addCategoryBreakdown()` - adds category breakdown table
- `addGrandTotals()` - adds grand totals row at bottom

Each function takes a worksheet and the relevant data, applying professional formatting from `styling.ts`.

All currency cells use NUMBER_FORMATS.currency, dates use MM/DD/YYYY, headers use FONTS.header + FILLS.header, etc.

**Step 2: Verify compilation**

```bash
npx tsc --noEmit 2>&1 | grep -c "error"
```

Expected: 0 errors

**Step 3: Commit**

```bash
git add utils/export-engine/worksheet-builder.ts
git commit -m "feat(export): add worksheet builder with professional formatting"
```

---

### Task 6: Create chart builder

**Files:**
- Create: `utils/export-engine/chart-builder.ts`

**Step 1: Create the chart builder**

```typescript
import ExcelJS from 'exceljs'

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
    try {
        const chart = worksheet.addChart(data.type === 'bar' ? 'bar' : data.type === 'pie' ? 'pie' : 'line')
        chart.title = data.title
        chart.style = 2

        const series = chart.addSeries({
            name: data.seriesName,
            values: data.values,
            categories: data.labels,
        })

        if (data.type === 'bar') {
            series.fill = { color: { argb: '3B82F6' } }
        }

        chart.setPosition(startRow, startCol)
        chart.setSize(width, height)
    } catch {
        // ExcelJS charts may not be supported in all environments
        // Gracefully degrade - the data tables are still present
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
        const chart = worksheet.addChart('line')
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
    } catch {
        // Gracefully degrade
    }
}
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit 2>&1 | grep -c "error"
```

**Step 3: Commit**

```bash
git add utils/export-engine/chart-builder.ts
git commit -m "feat(export): add chart builder for ExcelJS bar, pie, and line charts"
```

---

### Task 7: Create summary builder

**Files:**
- Create: `utils/export-engine/summary-builder.ts`

**Step 1: Create the summary builder**

This file provides functions for building the summary/dashboard worksheet:
- `buildSummarySheet()` - Creates the first sheet with KPIs, branch comparison, payment method distribution, category breakdown
- `addKPISection()` - Adds formatted KPI cards (Total Revenue, Expenses, Net Income, Entry Count)
- `addBranchComparisonSection()` - Adds a table comparing metrics across branches
- `addPaymentMethodSummary()` - Adds payment method distribution summary with totals
- `addCategorySummary()` - Adds category breakdown summary with totals
- `addGeneralInfoSection()` - Adds report title, date range, generation timestamp, scope description

Each section uses the styling constants from `styling.ts` for consistent professional appearance.

**Step 2: Verify compilation**

```bash
npx tsc --noEmit 2>&1 | grep -c "error"
```

**Step 3: Commit**

```bash
git add utils/export-engine/summary-builder.ts
git commit -m "feat(export): add summary sheet builder with KPI cards and charts"
```

---

## Phase 4: Main Engine & Server Actions

### Task 8: Create main export engine index

**Files:**
- Create: `utils/export-engine/index.ts`

**Step 1: Create the main entry point**

This file orchestrates the full export generation:
- `generateGroupedLedgerExport()` - Main function for accounting exports
- `generateGroupedMetricsExport()` - Main function for metrics exports
- `generateFlatCSVExport()` - Fallback CSV generation (no grouping, plain text)
- Each function creates an ExcelJS workbook, adds summary sheet, then iterates through grouped data creating sheets with professional formatting
- Functions also support PDF output via enhanced jsPDF generation
- Returns `ExportResult` with base64 content, filename, and mimeType

The index file imports and coordinates:
- `groupEntries()` from grouping.ts
- `buildSummarySheet()` from summary-builder.ts
- Worksheet building functions from worksheet-builder.ts
- Chart building functions from chart-builder.ts
- Styling from styling.ts
- Types from types.ts

**Step 2: Verify full module compilation**

```bash
npx tsc --noEmit 2>&1 | grep -c "error"
```

**Step 3: Commit**

```bash
git add utils/export-engine/index.ts
git commit -m "feat(export): add main export engine entry point"
```

---

### Task 9: Create grouped ledger export server action

**Files:**
- Modify: `server/actions/accounting.ts`

**Step 1: Add the `exportGroupedLedger` server action**

Add a new server action that:
1. Validates auth and permissions (same as existing export)
2. Fetches all ledger entries with branch info (one query joining `generalLedger` + `branches`)
3. Transforms to `LedgerExportRow[]` with branch names resolved
4. Calls `generateGroupedLedgerExport()` with the user's grouping config
5. Returns `ActionResponse<ExportResult>`

The action also handles date range and filter logic (same as existing `exportLedger`).

**Step 2: Add the `exportGroupedMetrics` server action**

In `server/actions/metrics.ts`, add a similar action that:
1. Fetches business insights metrics for all branches
2. Transforms to metrics export rows
3. Calls `generateGroupedMetricsExport()`
4. Returns `ActionResponse<ExportResult>`

**Step 3: Test compilation**

```bash
bun run build 2>&1 | tail -20
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add server/actions/accounting.ts server/actions/metrics.ts
git commit -m "feat(export): add grouped export server actions for ledger and metrics"
```

---

## Phase 5: UI Components

### Task 10: Create ExportGroupingModal component

**Files:**
- Create: `components/accounting/ExportGroupingModal.tsx`

**Step 1: Create the modal component**

A full-screen or large modal with:
1. **Format radio buttons**: XLSX | CSV | PDF (XLSX default)
2. **Grouping checkboxes**: Branch | Accounting Type | Payment Method | Category (with info tooltips explaining hierarchy)
3. **Export scope dropdown**: General Ledger | Cash Receipts | Cash Disbursements | Sales | Purchases | Custom
4. **Date range section**: Preset dropdown (This Month, Last Month, This Quarter, This Year, Custom) + date pickers
5. **Options toggles**: Include Summary Sheet (default: on) | Include Charts (default: on, hidden for CSV)
6. **Export button** with loading state

Uses the existing component patterns from the codebase (motion for animations, dark theme styling, consistent button/input styles).

**Step 2: Create the component and test**

```bash
bun run build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add components/accounting/ExportGroupingModal.tsx
git commit -m "feat(export): add export grouping modal with format, grouping, and scope options"
```

---

### Task 11: Integrate ExportGroupingModal into accounting page

**Files:**
- Modify: `app/accounting/accountingPage.tsx`

**Step 1: Add export modal state and handler**

Replace the existing export dropdown with a button that opens `ExportGroupingModal`. Add state for `showExportModal` and handle the export flow through the new grouped export action.

**Step 2: Test the integration**

```bash
bun run build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "feat(export): integrate grouped export modal into accounting page"
```

---

### Task 12: Add export UI to metrics page

**Files:**
- Modify: `app/metrics/metricsPage.tsx`
- Create: `components/metrics/MetricsExportModal.tsx` (if needed)

**Step 1: Create metrics export modal**

Similar to accounting export modal but with metrics-specific options:
- Format: XLSX | CSV | PDF
- Grouping: Branch (only relevant grouping for metrics)
- Scope: Business Insights | Executive Accounting
- Date range section (reuse date utilities)
- Options: Include Summary Sheet | Include Charts

**Step 2: Integrate into metrics page**

Add an export button to the metrics page header that opens the modal.

**Step 3: Test**

```bash
bun run build 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add app/metrics/ components/metrics/
git commit -m "feat(export): add grouped metrics export modal to metrics page"
```

---

## Phase 6: Metrics Export Enhancement

### Task 13: Enhance metrics export with grouping and professional formatting

**Files:**
- Modify: `utils/export-engine/index.ts` (add metrics-specific functions)

**Step 1: Implement metrics export functions**

In the export engine, add:
- `buildMetricsSummarySheet()` - KPI cards for revenue, expenses, net income, growth rates
- `buildRevenueTrendSheet()` - Revenue trend data with line chart
- `buildOperationalMetricsSheet()` - Appointments, completion rate, cancellation rate
- `buildCategoryBreakdownSheet()` - Revenue/expenses by accounting category with pie chart
- `buildPaymentMethodBreakdownSheet()` - Revenue by payment method with bar chart
- `buildBranchComparisonSheet()` - Side-by-side branch metrics (if multi-branch)
- `buildStaffPerformanceSheet()` - Artist leaderboard with metrics
- `buildInventorySheet()` - Inventory metrics with top sellers

Each sheet uses professional formatting from `styling.ts`.

**Step 2: Test compilation**

```bash
npx tsc --noEmit 2>&1 | grep -c "error"
```

**Step 3: Commit**

```bash
git add utils/export-engine/
git commit -m "feat(export): add professional metrics export sheets with formatting"
```

---

## Phase 7: Consolidation & Cleanup

### Task 14: Replace old export utilities

**Files:**
- Modify: `server/actions/accounting.ts` - Update `exportLedger()` to call new engine
- Modify: `server/actions/metrics.ts` - Update `exportMetrics()` to call new engine
- Remove: `utils/ledger-export-utils.ts` flag as deprecated
- Remove: `utils/metrics-export-utils.ts` flag as deprecated

**Step 1: Update ledger export server action**

Make `exportLedger()` use the new `generateGroupedLedgerExport()` with empty grouping config for backward compatibility. The old flat export types (GENERAL_LEDGER, CASH_RECEIPTS, etc.) continue to work via the new engine with no grouping dimensions.

**Step 2: Update metrics export server action**

Make `exportMetrics()` (currently CSV-only) use the new `generateGroupedMetricsExport()` for XLSX/PDF and fall back to CSV with the new engine.

**Step 3: Add deprecation notices to old files**

Add `@deprecated` JSDoc comments to old utility files pointing to `utils/export-engine/`.

**Step 4: Test full flow**

```bash
bun run build 2>&1 | tail -10
```

**Step 5: Commit**

```bash
git add server/actions/ utils/ledger-export-utils.ts utils/metrics-export-utils.ts
git commit -m "refactor(export): migrate server actions to new export engine, deprecate old utilities"
```

---

### Task 15: Enhance PDF export with grouping support

**Files:**
- Modify: `utils/pdf-export-server.ts`

**Step 1: Add grouped PDF generation**

Enhance the PDF export to support grouping:
- Section headers with colored backgrounds (via jsPDF rect fills)
- Subtotal rows with bold formatting
- Summary section at top with KPIs
- Branch headings if grouped by branch
- Professional header with logo, title, date range

Keep using `jsPDF` + `jspdf-autotable` (same as current) but add section separators and subtotal rows based on grouping config.

**Step 2: Test**

```bash
bun run build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add utils/pdf-export-server.ts
git commit -m "feat(export): add grouped PDF export with section headers and subtotals"
```

---

### Task 16: Add CSV grouped export support

**Files:**
- Modify: `utils/export-engine/index.ts`

**Step 1: Implement grouped CSV export**

For CSV format (which doesn't support sheets):
- Add section separator rows (e.g., `=== Branch: CEBU-CR ===`)
- Add subtotal rows with `--- Subtotal: ... ---` pattern
- Add grand total row at bottom
- Include summary section at top with KPIs
- Group data under section headers

This maintains human readability while keeping CSV parseable (section headers can be ignored by scripts).

**Step 2: Test**

```bash
npx tsc --noEmit 2>&1 | grep -c "error"
```

**Step 3: Commit**

```bash
git add utils/export-engine/index.ts
git commit -m "feat(export): add grouped CSV export with section headers and subtotals"
```

---

### Task 17: Remove old export dependencies

**Files:**
- Modify: `utils/ledger-export-utils.ts` - Remove or hollow out, keeping only type re-exports for backward compat
- Modify: `utils/metrics-export-utils.ts` - Same
- Modify: `utils/export.ts` - Keep as-is (generic CSV/JSON utility)

**Step 1: Clean up old export files**

- Remove Excel generation from `ledger-export-utils.ts` (now in export-engine)
- Remove Excel/PDF generation from `metrics-export-utils.ts` (now in export-engine)
- Keep type re-exports so any imports don't break
- Move `MetricsExportData` type and related types to `utils/export-engine/types.ts`

**Step 2: Verify no broken imports**

```bash
bun run build 2>&1 | tail -10
```

**Step 3: Commit**

```bash
git add utils/
git commit -m "refactor(export): clean up old export utilities, consolidate into export engine"
```

---

## Phase 8: Final Polish & Error Fixing

### Task 18: Fix all lint and build errors

**Step 1: Run lint**

```bash
bun run lint
```

Fix all lint warnings and errors.

**Step 2: Run build**

```bash
bun run build
```

Fix all build errors.

**Step 3: Run type check**

```bash
npx tsc --noEmit
```

Fix all TypeScript errors.

**Step 4: Commit**

```bash
git add -A
git commit -m "fix(export): resolve all lint, build, and type errors"
```

---

### Task 19: Manual testing checklist

**Step 1: Test accounting export with each format**
- [ ] XLSX export with no grouping (flat)
- [ ] XLSX export grouped by Branch only
- [ ] XLSX export grouped by Accounting Type only
- [ ] XLSX export grouped by Payment Method only
- [ ] XLSX export grouped by Branch + Accounting Type
- [ ] XLSX export grouped by all dimensions
- [ ] CSV export with grouping (section headers)
- [ ] PDF export with grouping (section headers)

**Step 2: Test metrics export**
- [ ] XLSX metrics export with summary sheet
- [ ] XLSX metrics export grouped by Branch
- [ ] CSV metrics export
- [ ] PDF metrics export

**Step 3: Test edge cases**
- [ ] Empty data set (no entries in date range)
- [ ] Single branch (no grouping)
- [ ] All branches (grouping by branch creates multiple tabs)
- [ ] Entries without payment method (should show "Unspecified")
- [ ] Entries without category (should show "Uncategorized")
- [ ] Very large dataset (1000+ entries)

---

### Task 20: Final documentation and cleanup

**Files:**
- Modify: `AGENTS.md` - Add export engine documentation

**Step 1: Update AGENTS.md**

Add section about export engine:
- How to use the export engine
- Adding new groupings
- Adding new export formats
- Styling conventions

**Step 2: Final build verification**

```bash
bun run lint && bun run build
```

Expected: Both pass cleanly

**Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs(export): add export engine documentation to AGENTS.md"
```