import { pgTable, uuid, timestamp, text, boolean, integer, index } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { user } from './auth'
import { branches } from './branches'

// ============================================================================
// QR SESSIONS SCHEMA
// ============================================================================

export const qrSessions = pgTable('qr_sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => sql`now()`),

    // Branch reference
    branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),

    // Valid date for this QR code
    validDate: timestamp('valid_date').notNull(),

    // QR code string
    qrCode: text('qr_code').notNull().unique(),

    // Active status
    isActive: boolean('is_active').default(true).notNull(),

    // Single-use QR support
    isSingleUse: boolean('is_single_use').default(false).notNull(),
    timesUsed: integer('times_used').default(0).notNull(),

    // User who generated this QR code
    generatedBy: text('generated_by').references(() => user.id, { onDelete: 'set null' }),
}, (table) => ({
    branchDateIdx: index('idx_qr_sessions_branch_date').on(table.branchId, table.validDate),
    qrCodeIdx: index('idx_qr_sessions_qr_code').on(table.qrCode),
}))

// ============================================================================
// TIME CLOCK SCHEMA
// ============================================================================

export const timeClockEntries = pgTable('time_clock_entries', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    
    // Staff reference
    staffId: text('staff_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    
    // Clock in/out times
    clockIn: timestamp('clock_in').notNull(),
    clockOut: timestamp('clock_out'),
    
    // Notes
    notes: text('notes'),
    
    // Branch reference (nullable, set null on delete)
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),

    // QR session reference for clock-in verification
    qrSessionId: uuid('qr_session_id').references(() => qrSessions.id, { onDelete: 'set null' }),

    // Device info
    clockInDevice: text('clock_in_device'),
    clockOutDevice: text('clock_out_device'),
}, (table) => ({
    staffIdIdx: index('idx_time_clock_staff_id').on(table.staffId),
    clockInIdx: index('idx_time_clock_clock_in').on(table.clockIn),
}))

export const staffSchedules = pgTable('staff_schedules', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => sql`now()`),

    // Staff reference
    staffId: text('staff_id').notNull().references(() => user.id, { onDelete: 'cascade' }),

    // Schedule details
    dayOfWeek: text('day_of_week').notNull(), // 'MONDAY', 'TUESDAY', etc.
    startTime: text('start_time').notNull(), // '09:00'
    endTime: text('end_time').notNull(), // '17:00'

    // Status
    isActive: boolean('is_active').default(true).notNull(),
}, (table) => ({
    staffIdIdx: index('idx_staff_schedules_staff_id').on(table.staffId),
}))

// ============================================================================
// RELATIONS
// ============================================================================

export const qrSessionsRelations = relations(qrSessions, ({ one }) => ({
    branch: one(branches, {
        fields: [qrSessions.branchId],
        references: [branches.id],
    }),
    generator: one(user, {
        fields: [qrSessions.generatedBy],
        references: [user.id],
    }),
}))

export const timeClockEntriesRelations = relations(timeClockEntries, ({ one }) => ({
    staff: one(user, {
        fields: [timeClockEntries.staffId],
        references: [user.id],
    }),
    branch: one(branches, {
        fields: [timeClockEntries.branchId],
        references: [branches.id],
    }),
    qrSession: one(qrSessions, {
        fields: [timeClockEntries.qrSessionId],
        references: [qrSessions.id],
    }),
}))

export const staffSchedulesRelations = relations(staffSchedules, ({ one }) => ({
    staff: one(user, {
        fields: [staffSchedules.staffId],
        references: [user.id],
    }),
}))

// ============================================================================
// TYPES
// ============================================================================

export type QRSession = typeof qrSessions.$inferSelect
export type NewQRSession = typeof qrSessions.$inferInsert

export type TimeClockEntry = typeof timeClockEntries.$inferSelect
export type NewTimeClockEntry = typeof timeClockEntries.$inferInsert

export type StaffSchedule = typeof staffSchedules.$inferSelect
export type NewStaffSchedule = typeof staffSchedules.$inferInsert
