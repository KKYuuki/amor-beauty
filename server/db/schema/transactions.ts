import { pgTable, uuid, timestamp, text, numeric, index, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'
import { branches } from './branches'

// ============================================================================
// TRANSACTIONS SCHEMA
// ============================================================================

export const transactions = pgTable('transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    
    // Customer & Staff
    buyerId: uuid('buyer_id'),
    buyerName: text('buyer_name'),
    customerPhone: text('customer_phone'),
    customerEmail: text('customer_email'),
    staffId: text('staff_id').references(() => user.id, { onDelete: 'set null' }),
    
    // Branch
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    
    // Financial
    subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
    taxAmount: numeric('tax_amount', { precision: 10, scale: 2 }).notNull(),
    discountAmount: numeric('discount_amount', { precision: 10, scale: 2 }).notNull(),
    total: numeric('total', { precision: 10, scale: 2 }).notNull(),
    adjustmentAmount: numeric('adjustment_amount', { precision: 10, scale: 2 }).default('0'),
    amountPaid: numeric('amount_paid', { precision: 10, scale: 2 }).notNull(),
    balanceDue: numeric('balance_due', { precision: 10, scale: 2 }).notNull(),
    
    // Payment
    paymentMethod: text('payment_method').notNull(),
    cashReceived: numeric('cash_received', { precision: 10, scale: 2 }),
    changeGiven: numeric('change_given', { precision: 10, scale: 2 }),
    referenceNumber: text('reference_number'),
    
    // Status & Metadata
    transactionNumber: text('transaction_number').notNull().unique(),
    status: text('status').notNull().default('COMPLETED'),

    notes: text('notes'),
    // Sales-side description (user-authored, flows to general_ledger.description)
    salesDescription: text('sales_description'),
    salesLabels: jsonb('sales_labels').default('[]'),
    
    // Client type for payroll rate calculation
    clientType: text('client_type'),
    // Type: 'WALKIN', 'PERSONAL'
    
    // Void Info
    voidedAt: timestamp('voided_at'),
    voidedBy: text('voided_by').references(() => user.id, { onDelete: 'set null' }),
    voidReason: text('void_reason'),
    
    // Audit
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
}, (table) => ({
    transactionNumberIdx: index('idx_transactions_number').on(table.transactionNumber),
    staffIdIdx: index('idx_transactions_staff').on(table.staffId),
    createdAtIdx: index('idx_transactions_created_at').on(table.createdAt),
    statusIdx: index('idx_transactions_status').on(table.status),
    branchIdIdx: index('idx_transactions_branch_id').on(table.branchId),

}))

export const transactionItems = pgTable('transaction_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    
    transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    inventoryId: uuid('inventory_id'),
    serviceId: uuid('service_id'),
    artistId: text('artist_id'),    // who performed this service
    itemLabel: text('item_label'),   // user-authored per-item label
    itemName: text('item_name').notNull(),
    quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
    lineTotal: numeric('line_total', { precision: 10, scale: 2 }).notNull(),
})

export const transactionPayments = pgTable('transaction_payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    
    transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    paymentMethod: text('payment_method').notNull(),
    referenceNumber: text('reference_number'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
})

// ============================================================================
// RELATIONS
// ============================================================================

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
    branch: one(branches, {
        fields: [transactions.branchId],
        references: [branches.id],
    }),
    staff: one(user, {
        fields: [transactions.staffId],
        references: [user.id],
    }),
    items: many(transactionItems),
    payments: many(transactionPayments),
}))

export const transactionItemsRelations = relations(transactionItems, ({ one }) => ({
    transaction: one(transactions, {
        fields: [transactionItems.transactionId],
        references: [transactions.id],
    }),
    artist: one(user, {
        fields: [transactionItems.artistId],
        references: [user.id],
    }),
}))

export const transactionPaymentsRelations = relations(transactionPayments, ({ one }) => ({
    transaction: one(transactions, {
        fields: [transactionPayments.transactionId],
        references: [transactions.id],
    }),
}))

// ============================================================================
// TYPES
// ============================================================================

export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type TransactionItem = typeof transactionItems.$inferSelect
export type NewTransactionItem = typeof transactionItems.$inferInsert
export type TransactionPayment = typeof transactionPayments.$inferSelect
export type NewTransactionPayment = typeof transactionPayments.$inferInsert
