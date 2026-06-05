import { pgTable, uuid, timestamp, varchar, text, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'
import { branches } from './branches'

// ============================================================================
// SYSTEM LOGS SCHEMA
// ============================================================================

export const systemLogs = pgTable('system_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),

    // Log Level: INFO, WARN, ERROR, DEBUG, FATAL
    level: varchar('level', { length: 20 }).notNull(),

    // Log Type: APPOINTMENT, INVENTORY, SYSTEM, AUTH, ACCOUNTING, PAYROLL, OTHER
    type: varchar('type', { length: 50 }).notNull(),

    // User reference (nullable)
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),

    // Branch reference (nullable)
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),

    // Log message
    message: text('message'),
}, (table) => ({
    levelIdx: index('idx_system_logs_level').on(table.level),
    typeIdx: index('idx_system_logs_type').on(table.type),
    createdAtIdx: index('idx_system_logs_created_at').on(table.createdAt),
    userIdIdx: index('idx_system_logs_user_id').on(table.userId),
    branchIdIdx: index('idx_system_logs_branch_id').on(table.branchId),
}))

// ============================================================================
// RELATIONS
// ============================================================================

export const systemLogsRelations = relations(systemLogs, ({ one }) => ({
    user: one(user, {
        fields: [systemLogs.userId],
        references: [user.id],
    }),
    branch: one(branches, {
        fields: [systemLogs.branchId],
        references: [branches.id],
    }),
}))
