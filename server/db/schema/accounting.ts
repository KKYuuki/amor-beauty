import { pgTable, uuid, timestamp, varchar, text, decimal, boolean, index, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { user } from './auth'
import { branches } from './branches'

// ============================================================================
// ACCOUNTING SCHEMA
// ============================================================================

export const accountingCategory = pgTable('accounting_category', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at'),
    
    // Category info
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    // Type: 'EXPENSE', 'REVENUE', 'ASSET', 'LIABILITY', 'EQUITY'
    
    // Status
    isActive: boolean('is_active').default(true).notNull(),
}, (table) => ({
    typeIdx: index('idx_accounting_category_type').on(table.type),
    isActiveIdx: index('idx_accounting_category_is_active').on(table.isActive),
    nameUnique: uniqueIndex('accounting_category_name_unique').on(sql`LOWER(${table.name})`),
}))

export const generalLedger = pgTable('general_ledger', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    
    // Entry Details
    entryDate: timestamp('entry_date').notNull(),
    entryType: varchar('entry_type', { length: 50 }).notNull(),
    // Type: 'EXPENSE', 'REVENUE', 'ASSET', 'LIABILITY', 'EQUITY'
    
    category: varchar('category', { length: 255 }),
    description: text('description').notNull(),
    reference: varchar('reference', { length: 255 }),
    
    // Amounts (Double-entry accounting)
    debit: decimal('debit', { precision: 12, scale: 2 }).notNull().default('0'),
    credit: decimal('credit', { precision: 12, scale: 2 }).notNull().default('0'),
    
    // Category reference (foreign key)
    categoryId: uuid('category_id').references(() => accountingCategory.id),
    
    // Metadata for automated entries
    sourceType: varchar('source_type', { length: 50 }),
    // Type: 'MANUAL', 'TRANSACTION', 'PAYROLL', 'INVENTORY'
    sourceId: uuid('source_id'),
    
    // Audit Trail
    createdBy: text('created_by').notNull().references(() => user.id),
    updatedAt: timestamp('updated_at'),
    updatedBy: text('updated_by').references(() => user.id),
    
    // Proof/Attachment
    proofUrl: varchar('proof_url', { length: 512 }),
    
    // Soft Delete / Void
    isVoided: boolean('is_voided').default(false).notNull(),
    voidedAt: timestamp('voided_at'),
    voidedBy: text('voided_by').references(() => user.id),
    voidReason: text('void_reason'),

    // Branch
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),

    // Payment Method (added for payment method tracking)
    paymentMethod: varchar('payment_method', { length: 50 }),
    // Method: 'CASH', 'CARD', 'BANK_TRANSFER', 'GCASH', 'CRYPTO'
}, (table) => ({
    debitCreditCheck: check('check_debit_credit_valid', sql`CAST(debit AS NUMERIC) >= 0 AND CAST(credit AS NUMERIC) >= 0 AND (CAST(debit AS NUMERIC) > 0 OR CAST(credit AS NUMERIC) > 0)`),
    entryDateIdx: index('idx_gl_entry_date').on(table.entryDate),
    entryTypeIdx: index('idx_gl_entry_type').on(table.entryType),
    categoryIdx: index('idx_gl_category').on(table.category),
    sourceIdx: index('idx_gl_source').on(table.sourceType, table.sourceId),
    createdAtIdx: index('idx_gl_created_at').on(table.createdAt),
    isVoidedIdx: index('idx_gl_is_voided').on(table.isVoided),
    branchIdIdx: index('idx_gl_branch_id').on(table.branchId),
    paymentMethodIdx: index('idx_gl_payment_method').on(table.paymentMethod),
}))

// ============================================================================
// RELATIONS
// ============================================================================

export const accountingCategoryRelations = relations(accountingCategory, ({ many }) => ({
    ledgerEntries: many(generalLedger),
}))

export const generalLedgerRelations = relations(generalLedger, ({ one }) => ({
    creator: one(user, {
        fields: [generalLedger.createdBy],
        references: [user.id],
        relationName: 'ledgerCreator',
    }),
    updater: one(user, {
        fields: [generalLedger.updatedBy],
        references: [user.id],
        relationName: 'ledgerUpdater',
    }),
    voider: one(user, {
        fields: [generalLedger.voidedBy],
        references: [user.id],
        relationName: 'ledgerVoider',
    }),
    category: one(accountingCategory, {
        fields: [generalLedger.categoryId],
        references: [accountingCategory.id],
    }),
    branch: one(branches, {
        fields: [generalLedger.branchId],
        references: [branches.id],
    }),
}))
