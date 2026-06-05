import { pgTable, uuid, timestamp, text, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'

// ============================================================================
// SYSTEM SETTINGS SCHEMA
// ============================================================================
// Stores application-wide configuration settings
// ============================================================================

export const systemSettings = pgTable('system_settings', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    
    // Setting Identification
    key: text('key').notNull().unique(),
    
    // Setting Value (stored as JSON)
    value: jsonb('value').notNull(),
    
    // Setting Metadata
    category: text('category').notNull(),
    // Categories: 'Notifications', 'Business', 'System'
    
    label: text('label').notNull(),
    description: text('description').notNull(),
    
    // Audit
    updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
}, (table) => ({
    keyIdx: uniqueIndex('idx_system_settings_key').on(table.key),
    categoryIdx: index('idx_system_settings_category').on(table.category),
}))

// ============================================================================
// RELATIONS
// ============================================================================

export const systemSettingsRelations = relations(systemSettings, ({ one }) => ({
    updater: one(user, {
        fields: [systemSettings.updatedBy],
        references: [user.id],
    }),
}))
