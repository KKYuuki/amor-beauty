/**
 * @deprecated Use `generateGroupedLedgerExport` from `@/utils/export-engine` instead.
 * This module will be removed in a future version.
 *
 * The new export engine provides:
 * - ExcelJS-based workbook generation with proper styling
 * - Grouped exports with subtotals and charts
 * - Summary sheets with KPIs
 * - Branch comparison and payment method breakdowns
 */

export type { LedgerExportRow, ExportFormat, ExportResult } from '@/utils/export-engine/types'
