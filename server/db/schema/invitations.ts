import { pgTable, timestamp, varchar, text, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'

// ============================================================================
// INVITATIONS SCHEMA
// ============================================================================
// Invite-only registration system for staff and admin users
// Using text IDs to match Better Auth native format
// ============================================================================

export const invitations = pgTable('invitations', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),

    // Invitation Details
    email: varchar('email', { length: 255 }).notNull().unique(),
    role: varchar('role', { length: 50 }).notNull().default('staff'),
    // Role: 'admin', 'manager', 'staff', 'artist', 'piercer', 'shoe_tech'

    // Token for invitation link
    token: varchar('token', { length: 255 }).notNull().unique(),

    // Expiration
    expiresAt: timestamp('expires_at').notNull(),

    // Creator reference
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
}, (table) => ({
    emailIdx: index('idx_invitations_email').on(table.email),
    tokenIdx: index('idx_invitations_token').on(table.token),
    expiresAtIdx: index('idx_invitations_expires_at').on(table.expiresAt),
}))

// ============================================================================
// RELATIONS
// ============================================================================

export const invitationsRelations = relations(invitations, ({ one }) => ({
    creator: one(user, {
        fields: [invitations.createdBy],
        references: [user.id],
    }),
}))

// ============================================================================
// TYPES
// ============================================================================

export type Invitation = typeof invitations.$inferSelect
export type NewInvitation = typeof invitations.$inferInsert
