import { pgTable, uuid, timestamp, text, boolean, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'

// ============================================================================
// BRANCHES SCHEMA
// ============================================================================

export const branches = pgTable('branches', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    
    // Branch Info
    name: text('name').notNull(),
    code: text('code').notNull().unique(), // Short code like 'CEB-CR', 'CEB-LL'
    city: text('city').notNull(),
    address: text('address'),
    phone: text('phone'),
    
    // Status
    isActive: boolean('is_active').default(true).notNull(),
    
    // Audit
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
}, (table) => ({
    codeIdx: index('idx_branches_code').on(table.code),
    cityIdx: index('idx_branches_city').on(table.city),
    isActiveIdx: index('idx_branches_is_active').on(table.isActive),
}))

export const branchesRelations = relations(branches, ({ one }) => ({
    creator: one(user, {
        fields: [branches.createdBy],
        references: [user.id],
    }),
    updater: one(user, {
        fields: [branches.updatedBy],
        references: [user.id],
    }),
}))

// ============================================================================
// TYPES
// ============================================================================

export type Branch = typeof branches.$inferSelect
export type NewBranch = typeof branches.$inferInsert

