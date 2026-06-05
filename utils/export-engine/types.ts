import { LedgerEntryType } from '@/utils/types/ledger'
import { AccountingPaymentMethod } from '@/utils/types/payment'

export type ExportFormat = 'csv' | 'xlsx' | 'pdf'

export type GroupingDimension = 'branch' | 'entryType' | 'paymentMethod' | 'category' | 'rateLevel' | 'staffCut'

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
    rate_level_name?: string
    staff_cut?: number
}

export interface MetricsExportRow {
    date: string
    revenue: number
    expenses: number
    netIncome: number
    transactionCount: number
    averageTicket: number
    appointments?: number
    clients?: number
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

export interface ArtistEarningsData {
    staff_id: string
    full_name: string
    avatar_url?: string
    pending_amount: number
    pending_count: number
}

export interface MetricsExportData {
    financials: {
        revenue: number
        transactions: number
        averageTicket: number
    }
    revenueTrend: { date: string; revenue: number }[]
    operations: {
        totalAppointments: number
        completedAppointments: number
        cancelledAppointments: number
        cancellationRate: number
    }
    inventory: {
        totalValue: number
        topSelling: { name: string; quantity: number; revenue: number }[]
    }
    ratings: {
        averageRating: number
        totalRatings: number
        distribution: { rating: number; count: number }[]
    }
    staffPerformance: {
        staff_name: string
        average_rating: number
        total_ratings: number
    }[]
    netIncome?: {
        revenue: number
        expenses: number
        netIncome: number
    }
    clientTypes?: {
        walkinCount: number
        personalCount: number
    }
    artistLeaderboard?: {
        full_name: string
        total_staff_cut: number
        total_gross: number
        appointment_count: number
    }[]
    accountingSummary?: {
        total_debit: number
        total_credit: number
        balance: number
        by_type: { type: string; debit: number; credit: number }[]
    }
    payrollSummary?: {
        pendingCount: number
        pendingAmount: number
        requestedCount: number
        requestedAmount: number
        confirmedCount: number
        confirmedAmount: number
        paidThisMonthCount: number
        paidThisMonth: number
    }
    artistEarnings?: ArtistEarningsData[]
    reviews?: {
        created_at: string
        title?: string
        content?: string
        type: string
        is_public: boolean
    }[]
    generatedAt: string
    dateRange?: { start: string; end: string }
}

export type MetricsExportFormat = 'csv' | 'excel' | 'pdf'
