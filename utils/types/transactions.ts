import { InventoryItem } from "./inventory"
import { Service } from "./general"
import { UserProfile } from "./auth"
import { Branch } from "./branch"
import { ServiceType } from "./payroll"

export type PaymentMethod = 'CASH' | 'CARD' | 'GCASH' | 'BANK_TRANSFER' | 'PAYMAYA' | 'SPLIT'
export type TransactionStatus = 'COMPLETED' | 'PENDING' | 'PARTIAL' | 'VOIDED' | 'REFUNDED' | 'DOWNPAYMENT_PENDING' | 'DOWNPAYMENT_ASSIGNED'

export interface Transaction {
    id: string
    created_at: string
    transaction_number: string // e.g., "TXN-20241121-001"

    // Customer & Staff
    buyer_id?: string | null // Optional - null for walk-in customers
    buyer_name?: string // For walk-ins without account
    customer_phone?: string // Phone for walk-ins
    customer_email?: string // Email for walk-ins
    staff_id?: string | null // Optional - null for Shop Sales (no commission)
    staff?: UserProfile
    buyer?: UserProfile

    // Branch
    branch_id?: string | null
    branch?: Branch

    // Financial
    subtotal: number
    tax_amount: number
    discount_amount: number
    total: number
    adjustment_amount?: number
    amount_paid: number
    balance_due: number

    // Payment
    payment_method: PaymentMethod
    cash_received?: number // For cash transactions
    change_given?: number
    reference_number?: string // For non-cash transactions

    // Status & Metadata
    status: TransactionStatus
    appointment_id?: string // Link to appointment if applicable
    notes?: string
    sales_description?: string   // user-authored transaction description
    sales_labels?: Array<{       // per-item label references
        itemId: string
        label: string
    }>
    client_type?: 'WALKIN' | 'PERSONAL' // For calculating staff rates
    downpayment_id?: string   // Reference to downpayments table if this is a downpayment transaction
    payroll_split_mode?: 'PER_PAYMENT' | 'ON_COMPLETION'

    // Void Info
    voided_at?: string
    voided_by?: string
    void_reason?: string

    // Downpayment
    downpayment?: {
        id: string
        amount: number
        downpayment_type: 'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM'
        percentage_rate: number | null
        estimated_total: number | null
        payroll_split_mode: 'PER_PAYMENT' | 'ON_COMPLETION'
        staff_id: string | null
        is_settled: boolean
        assigned_at: string | null
        settled_at: string | null
    }

    // Relations
    items?: TransactionItem[]
    payments?: TransactionPayment[]
}

// Line items for a transaction
export interface TransactionItem {
    id: string
    transaction_id: string
    inventory_id?: string
    service_id?: string
    item_name: string // Denormalized for receipt display
    quantity: number
    unit_price: number
    line_total: number
    item_label?: string          // user-authored per-item label

    // Relations
    inventory?: InventoryItem
    service?: Service
}

// Individual payment record for a transaction
export interface TransactionPayment {
    id: string
    transaction_id: string
    amount: number
    payment_method: string
    reference_number?: string
    created_at: string
    created_by?: string
}

export interface CashDrawer {
    id: string
    opened_at: string
    closed_at?: string
    opened_by: string
    closed_by?: string
    starting_cash: number
    expected_cash?: number
    actual_cash?: number
    cash_difference?: number
    notes?: string
}

// Split payment interface
export interface SplitPayment {
    id: string
    payment_method: 'CASH' | 'CARD' | 'GCASH' | 'BANK_TRANSFER' | 'PAYMAYA'
    amount: number
    reference_number?: string
}

// Payloads

export interface CreateTransactionItemPayload {
    inventory_id?: string
    service_id?: string
    artist_id?: string      // Who performed this service (falls back to staff_id)
    item_name: string
    quantity: number
    unit_price: number
    service_type?: ServiceType
    is_free?: boolean
    item_label?: string          // user-authored per-item label
}

export interface CreateTransactionPayload {
    buyer_id?: string | null // Optional - null for walk-in customers
    buyer_name?: string // Required for walk-ins
    customer_phone?: string // Phone for walk-ins
    customer_email?: string // Email for walk-ins
    staff_id?: string | null // Optional - null for Shop Sales
    branch_id?: string | null
    
    subtotal: number
    tax_amount: number
    discount_amount: number
    total: number
    adjustment_amount?: number
    amount_paid?: number
    balance_due?: number

    payment_method: PaymentMethod
    cash_received?: number
    change_given?: number
    reference_number?: string // For non-cash transactions (GCash, Card, Bank Transfer)

    // Split payments array (used when payment_method === 'SPLIT')
    payments?: SplitPayment[]

    appointment_id?: string
    notes?: string
    sales_description?: string   // NEW: user-authored transaction description
    sales_labels?: Array<{       // NEW: per-item label references
        itemId: string
        label: string
    }>

    // Payroll integration
    client_type?: 'WALKIN' | 'PERSONAL' // For calculating staff rates

    downpayment_type?: 'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM'
    downpayment_amount?: number // explicit downpayment amount for FLAT_FEE/CUSTOM
    downpayment_percentage_rate?: number
    downpayment_estimated_total?: number
    payroll_split_mode?: 'PER_PAYMENT' | 'ON_COMPLETION'

    items: CreateTransactionItemPayload[]
}

export interface VoidTransactionPayload {
    transaction_id: string
    void_reason: string
    voided_by: string
}

export interface AddTransactionPaymentPayload {
    transaction_id: string
    amount: number
    payment_method: PaymentMethod
    reference_number?: string
}

export interface UpdateTransactionPayload {
    transaction_id: string
    notes?: string
    reference_number?: string
    payment_method?: PaymentMethod
    sales_description?: string   // NEW: updatable before ledger finalized
}

export interface PayrollError {
    serviceId: string
    error: string
}
