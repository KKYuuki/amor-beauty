// ============================================================================
// DRIZZLE SCHEMA - Main Export File
// ============================================================================
// This file exports all database schemas for the Amor Beauty Lounge application.
// Schema is organized by domain for maintainability.
//
// Structure:
//   - auth.ts: Better-Auth tables (user, session, account, verification, 2FA, passkey)
//   - accounting.ts: General ledger and accounting categories
//   - inventory.ts: Inventory items and restock logs
//   - payroll.ts: Staff rates, payroll entries, requests, and payment methods
//   - logs.ts: System logs for persistent logging
//
// See: https://orm.drizzle.team/docs/sql-schema-declaration
// ============================================================================

// Auth Schema
export {
    user,
    session,
    account,
    verification,
    twoFactor,
    passkey,
    userRelations,
    sessionRelations,
    accountRelations,
    twoFactorRelations,
    passkeyRelations,
} from './schema/auth'

// Accounting Schema
export {
    accountingCategory,
    generalLedger,
    accountingCategoryRelations,
    generalLedgerRelations,
} from './schema/accounting'

// Inventory Schema
export {
    inventory,
    restockLog,
    inventoryRelations,
    restockLogRelations,
} from './schema/inventory'

// Rate Levels Schema
export {
    rateLevels,
} from './schema/rate-levels'
export {
    rateLevelsRelations,
} from './schema/auth'

// Payroll Schema
export {
    payrollStaffRate,
    payrollEntry,
    payrollRequest,
    paymentMethod,
    payrollDeductions,
    payrollDisbursement,
    downpayments,
    downpaymentsRelations,
    payrollStaffRateRelations,
    payrollEntryRelations,
    payrollRequestRelations,
    paymentMethodRelations,
    payrollDeductionsRelations,
    payrollDisbursementRelations,
} from './schema/payroll'

// Invitations Schema
export {
    invitations,
    invitationsRelations,
} from './schema/invitations'

// Settings Schema
export {
    systemSettings,
    systemSettingsRelations,
} from './schema/settings'

// Branches Schema
export {
    branches,
    branchesRelations,
} from './schema/branches'

// Transactions Schema
export {
    transactions,
    transactionItems,
    transactionPayments,
    transactionsRelations,
    transactionItemsRelations,
    transactionPaymentsRelations,
} from './schema/transactions'



// Services Schema
export {
    services,
    serviceItems,
    servicesRelations,
    serviceItemsRelations,
} from './schema/services'

// System Logs Schema
export {
    systemLogs,
    systemLogsRelations,
} from './schema/logs'

// Storage Schema
export {
    storageFiles,
    storageFilesRelations,
} from './schema/storage'

// Stock Reservations Schema
export {
    stockReservations,
    stockReservationsRelations,
} from './schema/reservations'

// Ratings Schema
export {
    ratings,
} from './schema/ratings'

// Reviews Schema
export {
    reviews,
} from './schema/reviews'

// Notifications Schema
export {
    notifications,
} from './schema/notifications'



