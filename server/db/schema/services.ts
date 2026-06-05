import { pgTable, uuid, timestamp, varchar, decimal, boolean, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { inventory } from './inventory'
import { branches } from './branches'

// ============================================================================
// SERVICES SCHEMA
// ============================================================================

export const services = pgTable('services', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),

    // Basic Info
    title: varchar('title', { length: 255 }).notNull(),

    // Pricing
    price: decimal('price', { precision: 12, scale: 2 }).notNull().default('0'),
    pricingType: varchar('pricing_type', { length: 50 }).notNull().default('FIXED'),
    // Type: 'FIXED', 'HOURLY'
    hourlyRate: decimal('hourly_rate', { precision: 12, scale: 2 }).default('0'),

    // Status
    isActive: boolean('is_active').default(true).notNull(),

    // Branch assignment (null for shared services)
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    isShared: boolean('is_shared').default(false).notNull(),

    // Service type for payroll rate mapping
    serviceType: varchar('service_type', { length: 20 }).notNull(),
    // Type: 'HAIR', 'NAILS', 'FACIAL', 'BODY_MASSAGE', 'WAXING', 'LASH_BROW', 'MAKEUP', 'OTHER'
}, (table) => ({
    isActiveIdx: index('idx_services_is_active').on(table.isActive),
    serviceTypeIdx: index('idx_services_service_type').on(table.serviceType),
    pricingTypeIdx: index('idx_services_pricing_type').on(table.pricingType),
    branchIdIdx: index('idx_services_branch_id').on(table.branchId),
    isSharedIdx: index('idx_services_is_shared').on(table.isShared),
}))

export const serviceItems = pgTable('service_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),

    // Relations
    serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
    inventoryId: uuid('inventory_id').notNull().references(() => inventory.id, { onDelete: 'cascade' }),

    // Usage
    quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
    fluidQuantity: decimal('fluid_quantity', { precision: 10, scale: 2 }),
}, (table) => ({
    serviceIdIdx: index('idx_service_items_service_id').on(table.serviceId),
    inventoryIdIdx: index('idx_service_items_inventory_id').on(table.inventoryId),
}))

// ============================================================================
// RELATIONS
// ============================================================================

export const servicesRelations = relations(services, ({ one, many }) => ({
    branch: one(branches, {
        fields: [services.branchId],
        references: [branches.id],
    }),
    items: many(serviceItems),
}))

export const serviceItemsRelations = relations(serviceItems, ({ one }) => ({
    service: one(services, {
        fields: [serviceItems.serviceId],
        references: [services.id],
    }),
    inventory: one(inventory, {
        fields: [serviceItems.inventoryId],
        references: [inventory.id],
    }),
}))
