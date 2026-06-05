import { WalletIcon, CreditCardIcon, SmartphoneIcon, LandmarkIcon, CircleDollarSignIcon } from 'lucide-react'

// Transaction payment methods (sales transactions)
export type TransactionPaymentMethod = 'CASH' | 'CARD' | 'GCASH' | 'BANK_TRANSFER' | 'PAYMAYA' | 'SPLIT'

export const TRANSACTION_PAYMENT_METHODS: { key: TransactionPaymentMethod; label: string; icon: typeof WalletIcon; description: string }[] = [
    { key: 'CASH', label: 'Cash', icon: WalletIcon, description: 'Physical cash payment' },
    { key: 'CARD', label: 'Card', icon: CreditCardIcon, description: 'Debit or credit card' },
    { key: 'GCASH', label: 'GCash', icon: SmartphoneIcon, description: 'GCash mobile payment' },
    { key: 'PAYMAYA', label: 'Paymaya', icon: SmartphoneIcon, description: 'Paymaya mobile payment' },
    { key: 'BANK_TRANSFER', label: 'Bank Transfer / QR', icon: LandmarkIcon, description: 'Bank transfer or QR code payment' },
    { key: 'SPLIT', label: 'Split', icon: CircleDollarSignIcon, description: 'Split payment across multiple methods' },
]
// These are the canonical payment methods used across the app.

// Accounting & general ledger entries
export type AccountingPaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'GCASH' | 'PAYMAYA' | 'CRYPTO'

export const ACCOUNTING_PAYMENT_METHODS: { key: AccountingPaymentMethod; label: string; description: string }[] = [
    { key: 'CASH', label: 'Cash', description: 'Physical cash payment' },
    { key: 'CARD', label: 'Card', description: 'Debit or credit card' },
    { key: 'BANK_TRANSFER', label: 'Bank Transfer / QR', description: 'Bank transfer or QR code payment' },
    { key: 'GCASH', label: 'GCash', description: 'GCash mobile payment' },
    { key: 'PAYMAYA', label: 'Paymaya', description: 'Paymaya mobile payment' },
    { key: 'CRYPTO', label: 'Crypto', description: 'Cryptocurrency payment' },
]

export const ACCOUNTING_PAYMENT_METHOD_COLORS: Record<AccountingPaymentMethod, string> = {
    CASH: 'bg-green-400/20 text-green-300 border-green-400/30',
    CARD: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
    BANK_TRANSFER: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
    GCASH: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/30',
    PAYMAYA: 'bg-pink-400/20 text-pink-300 border-pink-400/30',
    CRYPTO: 'bg-orange-400/20 text-orange-300 border-orange-400/30',
}

// Payroll disbursement payment methods (must include existing DB values + new ones)
// NOTE: 'BANK' is kept for backward compat with existing DB rows. UI labels it as "Bank Transfer".
// After migration, 'BANK' will no longer appear in new records — use 'BANK_TRANSFER' instead.
export type PayrollPaymentMethod = 'CASH' | 'GCASH' | 'MAYA' | 'PAYMAYA' | 'BANK' | 'BANK_TRANSFER' | 'CARD' | 'CRYPTO'

export const PAYROLL_PAYMENT_METHODS: { key: PayrollPaymentMethod; label: string }[] = [
    { key: 'CASH', label: 'Cash' },
    { key: 'GCASH', label: 'GCash' },
    { key: 'MAYA', label: 'Maya' },
    { key: 'PAYMAYA', label: 'Paymaya' },
    { key: 'BANK_TRANSFER', label: 'Bank Transfer / QR' },
    { key: 'CARD', label: 'Card (Debit/Credit)' },
    { key: 'CRYPTO', label: 'Crypto' },
]

export const PAYROLL_PAYMENT_METHOD_COLORS: Record<PayrollPaymentMethod, string> = {
    CASH: 'bg-green-400/20 text-green-300 border-green-400/30',
    GCASH: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/30',
    MAYA: 'bg-pink-400/20 text-pink-300 border-pink-400/30',
    PAYMAYA: 'bg-cyan-400/20 text-cyan-300 border-cyan-400/30',
    BANK: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
    BANK_TRANSFER: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
    CARD: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
    CRYPTO: 'bg-orange-400/20 text-orange-300 border-orange-400/30',
}

// Helper: map any payment method string to its display label
export function getAccountingPaymentMethodLabel(method: string | null | undefined): string {
    if (!method) return 'Unspecified'
    const found = ACCOUNTING_PAYMENT_METHODS.find(m => m.key === method)
    return found?.label || method
}

export function getPayrollPaymentMethodLabel(method: string | null | undefined): string {
    if (!method) return 'Unspecified'
    const found = PAYROLL_PAYMENT_METHODS.find(m => m.key === method)
    return found?.label || method
}

export function getTransactionPaymentMethodLabel(method: string | null | undefined): string {
    if (!method) return 'Unknown'
    const found = TRANSACTION_PAYMENT_METHODS.find(m => m.key === method)
    return found?.label || method
}

// Map transaction payment method to accounting payment method (for auto-populating ledger)
export function mapTransactionToAccountingPaymentMethod(method: string | null | undefined): AccountingPaymentMethod | undefined {
    if (!method) return undefined
    switch (method) {
        case 'CASH': return 'CASH'
        case 'CARD': return 'CARD'
        case 'GCASH': return 'GCASH'
        case 'PAYMAYA': return 'PAYMAYA'
        case 'BANK_TRANSFER': return 'BANK_TRANSFER'
        case 'SPLIT': return undefined // SPLIT is resolved into per-payment ledger entries at the action level
        default: return undefined
    }
}

/**
 * Derive the primary payment method from a SPLIT transaction's payments.
 * Returns the method of the largest payment amount.
 */
export function derivePrimaryPaymentMethod(
    payments: { payment_method: string; amount: number }[]
): string {
    if (!payments || payments.length === 0) return 'CASH'
    const largest = payments.reduce((prev, curr) =>
        curr.amount > prev.amount ? curr : prev, payments[0])
    return largest.payment_method
}

// Map payroll payment method to accounting payment method
/**
 * Canonical payment method normalization used across ALL domains.
 * - Normalizes legacy 'BANK' to 'BANK_TRANSFER'
 * - Normalizes 'SPLIT' to 'CASH' (a split payment's items are individually normalized)
 * - Normalizes 'UNKNOWN' / null / undefined to 'CASH'
 * - Normalizes 'MAYA' to 'CARD' for accounting purposes
 *
 * This is the SINGLE source of truth for payment method normalization.
 * Do NOT add domain-specific normalizers -- extend this function instead.
 */
export function normalizePaymentMethod(
    method: string | null | undefined,
    context: 'PAYROLL' | 'ACCOUNTING' | 'TRANSACTION' = 'PAYROLL'
): string {
    if (!method) return 'CASH'

    // Normalize legacy 'BANK' to 'BANK_TRANSFER' across all domains
    let normalized = method === 'BANK' ? 'BANK_TRANSFER' : method

    // Normalize UNKNOWN to CASH across all domains
    if (normalized === 'UNKNOWN') normalized = 'CASH'

    // Domain-specific finalization
    switch (context) {
        case 'PAYROLL':
            // Payroll uses BANK_TRANSFER natively; SPLIT --> CASH
            if (normalized === 'SPLIT') normalized = 'CASH'
            break
        case 'ACCOUNTING':
            // MAYA maps to CARD in accounting (legacy); PAYMAYA stays as-is
            if (normalized === 'MAYA') normalized = 'CARD'
            if (normalized === 'SPLIT') normalized = 'CASH'
            break
        case 'TRANSACTION':
            // Transactions keep their native method
            if (normalized === 'SPLIT') normalized = 'CASH'
            break
    }

    return normalized
}

/**
 * Convenience: normalize and return the accounting payment method enum value.
 * Returns 'CASH' if the method cannot be mapped to accounting.
 */
export function normalizeToAccountingPaymentMethod(
    method: string | null | undefined
): AccountingPaymentMethod {
    const normalized = normalizePaymentMethod(method, 'ACCOUNTING')
    switch (normalized) {
        case 'CASH': return 'CASH'
        case 'CARD': return 'CARD'
        case 'GCASH': return 'GCASH'
        case 'PAYMAYA': return 'PAYMAYA'
        case 'BANK_TRANSFER': return 'BANK_TRANSFER'
        case 'CRYPTO': return 'CRYPTO'
        default: return 'CASH'
    }
}

// Map payroll payment method to accounting payment method
export function mapPayrollToAccountingPaymentMethod(method: string | null | undefined): AccountingPaymentMethod | undefined {
    return normalizeToAccountingPaymentMethod(method) as AccountingPaymentMethod | undefined
}

// Payroll payment method groups for UI display
export const PAYMENT_METHOD_GROUPS: { label: string; methods: PayrollPaymentMethod[] }[] = [
    { label: 'Digital Wallets', methods: ['GCASH', 'MAYA', 'PAYMAYA'] },
    { label: 'Bank & Card', methods: ['BANK_TRANSFER', 'CARD'] },
    { label: 'Other', methods: ['CRYPTO'] },
]

// Normalize payroll payment method for comparison (delegates to canonical normalizer)
export function normalizePayrollMethod(method: string): string {
    return normalizePaymentMethod(method, 'PAYROLL')
}

// Get alternative payment methods grouped by category
export function getAlternativeMethodGroups(
    defaultMethod: PayrollPaymentMethod
): { label: string; methods: { key: PayrollPaymentMethod; label: string }[] }[] {
    const allMethods = PAYROLL_PAYMENT_METHODS.filter(m => m.key !== defaultMethod)
    const groups: { label: string; methods: { key: PayrollPaymentMethod; label: string }[] }[] = []

    // Cash is always a standalone alternative if not default
    if (defaultMethod !== 'CASH') {
        groups.push({
            label: 'Cash',
            methods: [{ key: 'CASH', label: 'Cash' }],
        })
    }

    // Digital wallets
    const wallets = allMethods.filter(m =>
        m.key === 'GCASH' || m.key === 'MAYA' || m.key === 'PAYMAYA'
    )
    if (wallets.length > 0) {
        groups.push({
            label: 'Digital Wallets',
            methods: wallets.map(m => ({ key: m.key, label: m.label })),
        })
    }

    // Bank & Card
    const bankCard = allMethods.filter(m =>
        m.key === 'BANK_TRANSFER' || m.key === 'CARD'
    )
    if (bankCard.length > 0) {
        groups.push({
            label: 'Bank & Card',
            methods: bankCard.map(m => ({ key: m.key, label: m.label })),
        })
    }

    // Crypto
    const crypto = allMethods.filter(m => m.key === 'CRYPTO')
    if (crypto.length > 0) {
        groups.push({
            label: 'Other',
            methods: crypto.map(m => ({ key: m.key, label: m.label })),
        })
    }

    return groups
}