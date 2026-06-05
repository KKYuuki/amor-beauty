// General Ledger Types

import { AccountingPaymentMethod } from '@/utils/types/payment'

export type LedgerEntryType = 'EXPENSE' | 'REVENUE' | 'ASSET' | 'LIABILITY' | 'EQUITY'

export type LedgerSourceType = 'MANUAL' | 'TRANSACTION' | 'PAYROLL' | 'INVENTORY'

export interface LedgerEntry {
    id: string
    created_at: Date
    entry_date: Date
    entry_type: LedgerEntryType
    category?: string
    description: string
    reference?: string
    debit: number
    credit: number
    source_type?: LedgerSourceType
    source_id?: string
    created_by: string
    updated_at?: Date
    updated_by?: string
    proof_url?: string
    is_voided: boolean
    voided_at?: Date
    voided_by?: string
    void_reason?: string
    branch_id?: string | null
    payment_method?: AccountingPaymentMethod
    // Payroll-specific fields (present only when source_type === 'PAYROLL')
    staff_cut?: number
    shop_cut?: number
}

export interface CreateLedgerEntryPayload {
    entry_date: Date
    entry_type: LedgerEntryType
    category?: string
    description: string
    reference?: string
    debit: number
    credit: number
    source_type?: LedgerSourceType
    source_id?: string
    branch_id?: string | null
    payment_method?: AccountingPaymentMethod
}

export interface UpdateLedgerEntryPayload {
    entry_date?: Date
    entry_type?: LedgerEntryType
    category?: string
    description?: string
    reference?: string
    debit?: number
    credit?: number
    branch_id?: string | null
    payment_method?: AccountingPaymentMethod
}

export interface LedgerFilters {
    entry_type?: LedgerEntryType
    category?: string
    source_type?: LedgerSourceType
    date_from?: Date
    date_to?: Date
    search?: string
    include_voided?: boolean
    voided_only?: boolean
    payment_method?: AccountingPaymentMethod
}

export type LedgerExportType =
    | 'GENERAL_LEDGER'      // All entries
    | 'CASH_RECEIPTS'       // Revenue entries
    | 'CASH_DISBURSEMENTS'  // Expense entries
    | 'SALES'               // source_type = 'TRANSACTION'
    | 'PURCHASES'           // source_type = 'INVENTORY'
    | 'BY_PAYMENT_METHOD'   // Grouped by payment method with subtotals

export interface PaymentMethodCategoryBreakdown {
    method: string
    method_label: string
    total_debit: number
    total_credit: number
    net: number
    count: number
    categories: {
        category: string
        entry_type: LedgerEntryType
        total_debit: number
        total_credit: number
        net: number
        count: number
    }[]
}

export interface LedgerDetailBreakdown {
    by_payment_method: PaymentMethodCategoryBreakdown[]
}
