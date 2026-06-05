import { pgTable, uuid, timestamp, varchar, text, decimal, boolean, index, uniqueIndex, integer, jsonb, numeric } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'
import { transactions } from './transactions'
import { rateLevels } from './rate-levels'

// ============================================================================
// PAYROLL SCHEMA
// ============================================================================

export const downpayments = pgTable('downpayments', {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id').notNull().references(() => transactions.id),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    downpaymentType: varchar('downpayment_type', { length: 20 }).notNull(),
    percentageRate: numeric('percentage_rate', { precision: 5, scale: 2 }),
    estimatedTotal: numeric('estimated_total', { precision: 10, scale: 2 }),
    isSettled: boolean('is_settled').notNull().default(false),
    staffId: text('staff_id').references(() => user.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    payrollSplitMode: varchar('payroll_split_mode', { length: 20 }).notNull().default('PER_PAYMENT'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    createdBy: text('created_by').references(() => user.id),
})

export const downpaymentsRelations = relations(downpayments, ({ one }) => ({
    transaction: one(transactions, {
        fields: [downpayments.transactionId],
        references: [transactions.id],
    }),
    staff: one(user, {
        fields: [downpayments.staffId],
        references: [user.id],
    }),
    createdByUser: one(user, {
        fields: [downpayments.createdBy],
        references: [user.id],
    }),
}))

export const payrollStaffRate = pgTable('payroll_staff_rate', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at'),
    
    // Rate Configuration
    rateName: varchar('rate_name', { length: 255 }).notNull(),
    serviceType: varchar('service_type', { length: 50 }).notNull(),
    // Type: 'TATTOO', 'PIERCING', 'SHOE'
    clientType: varchar('client_type', { length: 50 }).notNull(),
    // Type: 'WALKIN', 'PERSONAL'
    rateLevelId: uuid('rate_level_id').references(() => rateLevels.id, { onDelete: 'set null' }),

    // Split Percentages (should sum to 100)
    shopPercentage: decimal('shop_percentage', { precision: 5, scale: 2 }).notNull(),
    staffPercentage: decimal('staff_percentage', { precision: 5, scale: 2 }).notNull(),
    
    // Payment Mode
    paymentMode: varchar('payment_mode', { length: 50 }).default('PERCENTAGE').notNull(),
    // Mode: 'PERCENTAGE', 'FIXED'
    fixedAmount: decimal('fixed_amount', { precision: 12, scale: 2 }).default('0'),
    
    // Status & Audit
    isActive: boolean('is_active').default(true).notNull(),
    updatedBy: text('updated_by').references(() => user.id),
}, (table) => ({
    serviceTypeIdx: index('idx_payroll_rate_service_type').on(table.serviceType),
    clientTypeIdx: index('idx_payroll_rate_client_type').on(table.clientType),
    rateLevelIdx: index('idx_payroll_rate_rate_level').on(table.rateLevelId),
    isActiveIdx: index('idx_payroll_rate_is_active').on(table.isActive),
    // Unique constraint for rate combination
    rateLevelServiceClientIdx: uniqueIndex('idx_payroll_rate_level_service_client').on(
        table.serviceType,
        table.clientType,
        table.rateLevelId
    ),
}))

export const payrollEntry = pgTable('payroll_entry', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    
    // Staff & Transaction Reference
    staffId: text('staff_id').notNull().references(() => user.id),
    transactionId: uuid('transaction_id'),
    appointmentId: uuid('appointment_id'),
    
    // Service Info (for record keeping)
    serviceDate: timestamp('service_date').notNull().defaultNow(),
    serviceDescription: text('service_description'),
    serviceType: varchar('service_type', { length: 50 }),
    // Type: 'TATTOO', 'PIERCING', 'SHOE', 'MANUAL'
    clientType: varchar('client_type', { length: 50 }),
    // Type: 'WALKIN', 'PERSONAL'
    
    // Earnings Calculation
    grossAmount: decimal('gross_amount', { precision: 12, scale: 2 }).notNull(),
    shopCut: decimal('shop_cut', { precision: 12, scale: 2 }).notNull(),
    staffCut: decimal('staff_cut', { precision: 12, scale: 2 }).notNull(),
    rateId: uuid('rate_id').references(() => payrollStaffRate.id),
    
    // Tax Withholding
    taxRate: integer('tax_rate'), // Percentage
    taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }), // Calculated tax
    netAmount: decimal('net_amount', { precision: 12, scale: 2 }), // After tax deduction
    taxBracket: text('tax_bracket'), // Tax bracket name
    
    // Payment Status
    paymentStatus: varchar('payment_status', { length: 50 }).default('PENDING').notNull(),
    // Status: 'PENDING', 'REQUESTED', 'CONFIRMED', 'PAID', 'CANCELLED'
    payrollRequestId: uuid('payroll_request_id'),
    paidAt: timestamp('paid_at'),
    
    // Rate Versioning (snapshots for historical accuracy)
    staffRateSnapshot: jsonb('staff_rate_snapshot').$type<{
        percentage: number
        fixedAmount?: number
        serviceType?: string
        clientType?: string
        rateLevelId?: string
        rateLevelName?: string
    }>(),
    shopRateSnapshot: jsonb('shop_rate_snapshot').$type<{
        percentage: number
        fixedAmount?: number
    }>(),
    rateVersion: integer('rate_version').default(1),
    // Original transaction payment method (used to suggest disbursement method)
    paymentMethod: varchar('payment_method', { length: 50 }),
    // Method: 'CASH', 'CARD', 'GCASH', 'BANK_TRANSFER', 'SPLIT'
}, (table) => ({
    staffIdIdx: index('idx_payroll_entry_staff_id').on(table.staffId),
    paymentMethodIdx: index('idx_payroll_entry_payment_method').on(table.paymentMethod),
    paymentStatusIdx: index('idx_payroll_entry_payment_status').on(table.paymentStatus),
    serviceDateIdx: index('idx_payroll_entry_service_date').on(table.serviceDate),
    payrollRequestIdIdx: index('idx_payroll_entry_request_id').on(table.payrollRequestId),
    transactionIdIdx: index('idx_payroll_entry_transaction_id').on(table.transactionId),
    serviceTypeIdx: index('idx_payroll_entry_service_type').on(table.serviceType),
}))

export const payrollRequest = pgTable('payroll_request', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    
    // Request Details
    staffId: text('staff_id').notNull().references(() => user.id),
    periodType: varchar('period_type', { length: 50 }).notNull(),
    // Type: 'DAILY', 'WEEKLY', 'BIMONTHLY', 'MONTHLY'
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    
    // Amounts
    totalGross: decimal('total_gross', { precision: 12, scale: 2 }).notNull(),
    totalShopCut: decimal('total_shop_cut', { precision: 12, scale: 2 }).notNull(),
    totalStaffCut: decimal('total_staff_cut', { precision: 12, scale: 2 }).notNull(),
    totalNetAmount: decimal('total_net_amount', { precision: 12, scale: 2 }).default('0'),
    totalTaxAmount: decimal('total_tax_amount', { precision: 12, scale: 2 }).default('0'),
    
    // Workflow Status
    status: varchar('status', { length: 50 }).default('REQUESTED').notNull(),
    // Status: 'REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'
    
    // Request Flow (Manager or Staff can request)
    requestedBy: text('requested_by').notNull().references(() => user.id),
    requestedAt: timestamp('requested_at').defaultNow().notNull(),
    
    // Confirmation Flow (Artist/Staff confirms they'll receive payment)
    confirmedBy: text('confirmed_by').references(() => user.id),
    confirmedAt: timestamp('confirmed_at'),
    
    // Completion Flow (Payment given)
    paymentMethod: varchar('payment_method', { length: 50 }),
    // Method: 'CASH', 'GCASH', 'MAYA', 'BANK_TRANSFER'
    completedBy: text('completed_by').references(() => user.id),
    completedAt: timestamp('completed_at'),
    
    // Cancellation
    cancelledBy: text('cancelled_by').references(() => user.id),
    cancelledAt: timestamp('cancelled_at'),
    cancelReason: text('cancel_reason'),
    
    notes: text('notes'),

    // Disbursement Reference & Proof
    referenceNumber: varchar('reference_number', { length: 255 }),
    proofUrl: varchar('proof_url', { length: 512 }),
}, (table) => ({
    staffIdIdx: index('idx_payroll_request_staff_id').on(table.staffId),
    statusIdx: index('idx_payroll_request_status').on(table.status),
    periodIdx: index('idx_payroll_request_period').on(table.periodStart, table.periodEnd),
    createdAtIdx: index('idx_payroll_request_created_at').on(table.createdAt),
    requestedByIdx: index('idx_payroll_request_requested_by').on(table.requestedBy),
}))

export const paymentMethod = pgTable('payment_method', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at'),
    
    // User Reference
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    
    // Payment Method Details
    type: varchar('type', { length: 50 }).notNull(),
    // Type: 'CASH', 'GCASH', 'MAYA', 'BANK'
    provider: varchar('provider', { length: 100 }),
    // Provider: bank name, e-wallet provider, etc.
    accountName: varchar('account_name', { length: 255 }),
    accountNumber: varchar('account_number', { length: 100 }),
    
    // Status
    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
}, (table) => ({
    userIdIdx: index('idx_payment_method_user_id').on(table.userId),
    typeIdx: index('idx_payment_method_type').on(table.type),
    isDefaultIdx: index('idx_payment_method_is_default').on(table.isDefault),
}))

// ============================================================================
// RELATIONS
// ============================================================================

export const payrollStaffRateRelations = relations(payrollStaffRate, ({ one, many }) => ({
    updater: one(user, {
        fields: [payrollStaffRate.updatedBy],
        references: [user.id],
    }),
    rateLevel: one(rateLevels, {
        fields: [payrollStaffRate.rateLevelId],
        references: [rateLevels.id],
    }),
    entries: many(payrollEntry),
}))

export const payrollEntryRelations = relations(payrollEntry, ({ one }) => ({
    staff: one(user, {
        fields: [payrollEntry.staffId],
        references: [user.id],
        relationName: 'payrollStaff',
    }),
    rate: one(payrollStaffRate, {
        fields: [payrollEntry.rateId],
        references: [payrollStaffRate.id],
    }),
    request: one(payrollRequest, {
        fields: [payrollEntry.payrollRequestId],
        references: [payrollRequest.id],
    }),
}))

export const payrollRequestRelations = relations(payrollRequest, ({ one, many }) => ({
    staff: one(user, {
        fields: [payrollRequest.staffId],
        references: [user.id],
        relationName: 'payrollRequestStaff',
    }),
    requester: one(user, {
        fields: [payrollRequest.requestedBy],
        references: [user.id],
        relationName: 'payrollRequester',
    }),
    confirmer: one(user, {
        fields: [payrollRequest.confirmedBy],
        references: [user.id],
        relationName: 'payrollConfirmer',
    }),
    completer: one(user, {
        fields: [payrollRequest.completedBy],
        references: [user.id],
        relationName: 'payrollCompleter',
    }),
    canceller: one(user, {
        fields: [payrollRequest.cancelledBy],
        references: [user.id],
        relationName: 'payrollCanceller',
    }),
    entries: many(payrollEntry),
    disbursements: many(payrollDisbursement),
}))

export const payrollDeductions = pgTable('payroll_deductions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => user.id),
    type: varchar('type', { length: 50 }).notNull(),
    // Type: 'ADVANCE', 'DEDUCTION', 'ADJUSTMENT'
    amount: integer('amount').notNull(),
    reason: text('reason'),
    status: varchar('status', { length: 50 }).notNull().default('PENDING'),
    // Status: 'PENDING', 'DEDUCTED', 'CANCELLED'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deductedAt: timestamp('deducted_at'),

    // Scheduled/Staggered payment support
    scheduledAmount: decimal('scheduled_amount', { precision: 12, scale: 2 }),
    disbursementType: varchar('disbursement_type', { length: 50 }).default('FULL'),
    // Type: 'FULL', 'STAGGERED'
    recurrenceRule: jsonb('recurrence_rule').$type<{ frequency: string; interval: number; startDate: string; endDate?: string } | null>(),
}, (table) => ({
    userIdIdx: index('idx_payroll_deductions_user_id').on(table.userId),
    statusIdx: index('idx_payroll_deductions_status').on(table.status),
    typeIdx: index('idx_payroll_deductions_type').on(table.type),
}))

export const payrollDeductionsRelations = relations(payrollDeductions, ({ one }) => ({
    user: one(user, {
        fields: [payrollDeductions.userId],
        references: [user.id],
    }),
}))

// ============================================================================
// PAYROLL DISBURSEMENTS (Staggered Payments)
// ============================================================================

export const payrollDisbursement = pgTable('payroll_disbursement', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    
    // Parent request
    requestId: uuid('request_id').notNull().references(() => payrollRequest.id, { onDelete: 'cascade' }),
    
    // Disbursement details
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paymentMethod: varchar('payment_method', { length: 50 }).notNull(),
    // Method: 'CASH', 'GCASH', 'MAYA', 'BANK_TRANSFER', 'CARD', 'CRYPTO'
    
    // Reference & proof (per-disbursement)
    referenceNumber: varchar('reference_number', { length: 255 }),
    proofUrl: varchar('proof_url', { length: 512 }),
    
    // Status tracking
    status: varchar('status', { length: 50 }).notNull().default('PENDING'),
    // Status: 'PENDING', 'COMPLETED', 'CANCELLED'
    
    completedAt: timestamp('completed_at'),
    completedBy: text('completed_by').references(() => user.id),
    notes: text('notes'),
}, (table) => ({
    requestIdIdx: index('idx_disbursement_request_id').on(table.requestId),
    statusIdx: index('idx_disbursement_status').on(table.status),
}))

// Add relations for payrollDisbursement
export const payrollDisbursementRelations = relations(payrollDisbursement, ({ one }) => ({
    request: one(payrollRequest, {
        fields: [payrollDisbursement.requestId],
        references: [payrollRequest.id],
    }),
    completer: one(user, {
        fields: [payrollDisbursement.completedBy],
        references: [user.id],
    }),
}))

export const paymentMethodRelations = relations(paymentMethod, ({ one }) => ({
    user: one(user, {
        fields: [paymentMethod.userId],
        references: [user.id],
    }),
}))
