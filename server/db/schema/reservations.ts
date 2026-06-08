import { pgTable, uuid, timestamp, integer, text, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { inventory } from './inventory'


// ============================================================================
// STOCK RESERVATIONS SCHEMA
// ============================================================================
// Tracks inventory items reserved for appointments
// Status flow: PENDING -> CONFIRMED/RELEASED/CONVERTED
// ============================================================================

export const stockReservations = pgTable('stock_reservations', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    
    // References
    inventoryId: uuid('inventory_id').notNull().references(() => inventory.id, { onDelete: 'cascade' }),

    
    // Reservation Details
    quantity: integer('quantity').notNull(),
    status: text('status', {
        enum: ['PENDING', 'CONFIRMED', 'RELEASED', 'CONVERTED']
    }).notNull().default('PENDING'),
    
    // Timestamps
    expiresAt: timestamp('expires_at'), // Auto-release if not confirmed
    confirmedAt: timestamp('confirmed_at'),
    releasedAt: timestamp('released_at'),
    convertedAt: timestamp('converted_at'),
}, (table) => ({
    inventoryIdx: index('idx_stock_reservations_inventory_id').on(table.inventoryId),

    statusIdx: index('idx_stock_reservations_status').on(table.status),
    createdAtIdx: index('idx_stock_reservations_created_at').on(table.createdAt),
    expiresAtIdx: index('idx_stock_reservations_expires_at').on(table.expiresAt),
}))

// ============================================================================
// RELATIONS
// ============================================================================

export const stockReservationsRelations = relations(stockReservations, ({ one }) => ({
    inventory: one(inventory, {
        fields: [stockReservations.inventoryId],
        references: [inventory.id],
    }),

}))
