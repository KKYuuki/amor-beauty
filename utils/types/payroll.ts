// Payroll Types

export type ServiceType = 'HAIR' | 'NAILS' | 'FACIAL' | 'BODY_MASSAGE' | 'WAXING' | 'LASH_BROW' | 'MAKEUP' | 'MANUAL'

export function mapAppointmentTypeToServiceType(type: string | null): ServiceType {
    switch (type) {
        case 'HAIR': return 'HAIR'
        case 'NAILS': return 'NAILS'
        case 'FACIAL': return 'FACIAL'
        case 'BODY_MASSAGE': return 'BODY_MASSAGE'
        case 'WAXING': return 'WAXING'
        case 'LASH_BROW': return 'LASH_BROW'
        case 'MAKEUP': return 'MAKEUP'
        default: return 'HAIR'
    }
}

export type ClientType = 'WALKIN' | 'PERSONAL'

export type RateLevel = string // Will be a UUID referencing rate_levels table
export type RateLevelName = string // Display name from rate_levels
export type DownpaymentType = 'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM'
export type PayrollSplitMode = 'PER_PAYMENT' | 'ON_COMPLETION'

export type PayoutPeriod = 'DAILY' | 'WEEKLY' | 'BIMONTHLY' | 'MONTHLY'

export type PaymentStatus = 'PENDING' | 'REQUESTED' | 'CONFIRMED' | 'PAID' | 'CANCELLED'

export type PayrollRequestStatus = 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'

export type PaymentMethod = 'CASH' | 'GCASH' | 'MAYA' | 'BANK' | 'BANK_TRANSFER' | 'CARD' | 'CRYPTO'

// Staff Rate Configuration
export interface PayrollStaffRate {
    id: string
    created_at: Date
    rate_name: string
    service_type: ServiceType
    client_type: ClientType
    rate_level_id?: string
    rate_level_name?: string   // display name from rate_levels
    shop_percentage: number
    staff_percentage: number   // was: artist_percentage
    payment_mode: 'PERCENTAGE' | 'FIXED'
    fixed_amount: number
    is_active: boolean
    updated_at?: Date
    updated_by?: string
}

export interface UpdateStaffRatePayload {
    rate_name?: string
    service_type?: string
    client_type?: string
    rate_level_id?: string
    shop_percentage?: number
    staff_percentage?: number
    payment_mode?: 'PERCENTAGE' | 'FIXED'
    fixed_amount?: number
    is_active?: boolean
}

// Rate Snapshot Types
export interface StaffRateSnapshot {
    percentage: number
    fixedAmount?: number
    serviceType?: string
    clientType?: string      // NEW
    rateLevelId?: string     // NEW
    rateLevelName?: string   // NEW
}

export interface ShopRateSnapshot {
    percentage: number
    fixedAmount?: number
}

export interface PayrollEntryTransactionItem {
    item_name: string
    quantity: number
    unit_price: number
    line_total: number
    service_type?: ServiceType
    service_id?: string
    // Staff cut for this specific item (proportional to the entry's overall cut)
    staff_cut?: number
    shop_cut?: number
}

// Individual Earnings per Transaction
export interface PayrollEntry {
    id: string
    created_at: Date
    staff_id: string
    transaction_id?: string
    appointment_id?: string
    service_date: Date
    service_description?: string
    client_type?: ClientType
    gross_amount: number
    shop_cut: number
    staff_cut: number           // was: artist_cut
    rate_id?: string
    payment_status: PaymentStatus
    payroll_request_id?: string
    paid_at?: Date
    // Tax withholding
    tax_rate?: number | null
    tax_amount?: number | null
    net_amount?: number | null
    tax_bracket?: string | null
    // Rate versioning snapshots
    staff_rate_snapshot?: StaffRateSnapshot  // was: artist_rate_snapshot
    shop_rate_snapshot?: ShopRateSnapshot
    rate_version?: number
    payment_method?: string | null
    // Original transaction payment method: 'CASH', 'CARD', 'GCASH', 'BANK_TRANSFER', 'CRYPTO'
    // Joined data
    staff?: {
        id: string
        full_name: string
        avatar_url?: string
        rate_level_id?: string
        rate_level_name?: string    // NEW
    }
    // Transaction-level service breakdown (lazy-loaded on expand)
    transaction_items?: PayrollEntryTransactionItem[]
}

export interface CreatePayrollEntryPayload {
    staff_id: string
    transaction_id?: string
    appointment_id?: string
    service_date: Date
    service_description?: string
    client_type?: ClientType
    gross_amount: number
    shop_cut: number
    staff_cut: number
    rate_id?: string
}

// Payment Request (Batch of earnings)
export interface PayrollRequest {
    id: string
    created_at: Date
    staff_id: string
    period_type: PayoutPeriod
    period_start: Date
    period_end: Date
    total_gross: number
    total_shop_cut: number
    total_staff_cut: number
    total_net_amount: number
    total_tax_amount: number
    status: PayrollRequestStatus
    requested_by: string
    requested_at: Date
    confirmed_by?: string
    confirmed_at?: Date
    payment_method?: PaymentMethod
    completed_by?: string
    completed_at?: Date
    cancelled_by?: string
    cancelled_at?: Date
    cancel_reason?: string
    notes?: string
    reference_number?: string
    proof_url?: string
    // Joined data
    staff?: {
        id: string
        full_name: string
        avatar_url?: string
    }
    requester?: {
        id: string
        full_name: string
    }
    entries?: PayrollEntry[]
    disbursements?: PayrollDisbursement[]
}

export interface CreatePayrollRequestPayload {
    staff_id: string
    period_type: PayoutPeriod
    period_start: Date
    period_end: Date
    entry_ids: string[] // Payroll entry IDs to include
    notes?: string
}

export interface CompletePayrollRequestPayload {
    payment_method: PaymentMethod
    notes?: string
    reference_number?: string
    proof_file?: File | null
    skip_accounting_entry?: boolean
    skip_disbursement_check?: boolean
}

// User Payment Method (from payment_method table)
export interface UserPaymentMethod {
    id: string
    created_at: Date
    updated_at?: Date
    user_id: string
    type: 'CASH' | 'GCASH' | 'MAYA' | 'BANK_TRANSFER'
    provider?: string
    account_name?: string
    account_number?: string
    is_default: boolean
    is_active: boolean
}

export interface CreatePaymentMethodPayload {
    user_id: string
    type: 'CASH' | 'GCASH' | 'MAYA' | 'PAYMAYA' | 'BANK_TRANSFER'
    provider?: string
    account_name?: string
    account_number?: string
    is_default?: boolean
}

export interface UpdatePaymentMethodPayload {
    type?: 'CASH' | 'GCASH' | 'MAYA' | 'PAYMAYA' | 'BANK_TRANSFER'
    provider?: string
    account_name?: string
    account_number?: string
    is_default?: boolean
    is_active?: boolean
}

export type DisbursementStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED'

export interface PayrollDisbursement {
    id: string
    created_at: Date
    request_id: string
    amount: number
    payment_method: PaymentMethod
    reference_number?: string
    proof_url?: string
    status: DisbursementStatus
    completed_at?: Date
    completed_by?: string
    notes?: string
}

export interface CreateDisbursementPayload {
    request_id: string
    amount: number
    payment_method: PaymentMethod
    reference_number?: string
    notes?: string
}

export interface PayrollDeduction {
    id: string
    user_id: string
    type: 'ADVANCE' | 'DEDUCTION' | 'ADJUSTMENT'
    amount: number
    reason?: string
    status: 'PENDING' | 'DEDUCTED' | 'CANCELLED'
    created_at: Date
    deducted_at?: Date
}

// Payroll Summary for Dashboard/Metrics
export interface PayrollSummary {
    total_pending: number
    total_requested: number
    total_paid_this_period: number
    pending_count: number
    requested_count: number
}

export interface StaffEarningsSummary {
    staff_id: string
    staff_name: string
    rate_level_id?: string
    rate_level_name?: string  // NEW
    total_earnings: number
    total_pending: number
    total_paid: number
    entry_count: number
}

export interface Downpayment {
    id: string
    transaction_id: string
    amount: number
    downpayment_type: DownpaymentType
    percentage_rate?: number
    estimated_total?: number
    is_settled: boolean
    staff_id?: string
    assigned_at?: Date
    payroll_split_mode: PayrollSplitMode
    notes?: string
    created_at: Date
    updated_at?: Date
    created_by?: string
}

export interface CreateDownpaymentPayload {
    transaction_id: string
    amount: number
    downpayment_type: DownpaymentType
    percentage_rate?: number
    estimated_total?: number
    staff_id?: string
    payroll_split_mode: PayrollSplitMode
    notes?: string
}

export interface AssignStaffToDownpaymentPayload {
    downpayment_id: string
    staff_id: string
    payroll_split_mode: PayrollSplitMode
}

export interface RateLevelItem {
    id: string
    name: string
    slug: string
    is_active: boolean
    sort_order: number
    created_at: Date
    updated_at?: Date
    created_by?: string
}

export interface CreateRateLevelPayload {
    name: string
    sort_order?: number
}

export interface UpdateRateLevelPayload {
    id: string
    name?: string
    is_active?: boolean
    sort_order?: number
}
