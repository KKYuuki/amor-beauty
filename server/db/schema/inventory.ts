import { pgTable, uuid, timestamp, varchar, text, decimal, boolean, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'
import { branches } from './branches'

// ============================================================================
// INVENTORY SCHEMA
// ============================================================================

export const inventory = pgTable('inventory', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    
    // Basic Info
    name: varchar('name', { length: 255 }).notNull(),
    itemCode: varchar('item_code', { length: 100 }),
    description: text('description'),
    externalLink: text('external_link'),
    
    // Classification
    itemType: varchar('item_type', { length: 50 }).notNull(),
    // Type: 'ITEM', 'FLUID'
    itemCategory: varchar('item_category', { length: 50 }).notNull(),
    // Category: 'TATTOO', 'PIERCING', 'EQUIPMENT', 'FOOD', 'OTHER'
    
    // Stock Management
    currentStock: decimal('current_stock', { precision: 10, scale: 2 }).notNull().default('0'),
    stockWarningThreshold: decimal('stock_warning_threshold', { precision: 10, scale: 2 }),
    lastRestocked: timestamp('last_restocked'),
    
    // Pricing
    unitPrice: decimal('unit_price', { precision: 12, scale: 2 }),
    sellingPrice: decimal('selling_price', { precision: 12, scale: 2 }),
    
    // Fluid Tracking
    fluidUnitSize: decimal('fluid_unit_size', { precision: 10, scale: 2 }),
    fluidRemaining: decimal('fluid_remaining', { precision: 10, scale: 2 }),
    fluidUnitOfMeasure: varchar('fluid_unit_of_measure', { length: 50 }),
    
    // Perishable Tracking
    isPerishable: boolean('is_perishable').default(false).notNull(),
    expirationDate: timestamp('expiration_date'),
    
    // Status
    isActive: boolean('is_active').default(true).notNull(),
    
    // Sales Visibility
    showInSales: boolean('show_in_sales').default(true).notNull(),

    // Branch assignment (null for shared items)
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    isShared: boolean('is_shared').default(false).notNull(),
}, (table) => ({
    itemTypeIdx: index('idx_inventory_item_type').on(table.itemType),
    itemCategoryIdx: index('idx_inventory_item_category').on(table.itemCategory),
    isActiveIdx: index('idx_inventory_is_active').on(table.isActive),
    nameIdx: index('idx_inventory_name').on(table.name),
    branchIdIdx: index('idx_inventory_branch_id').on(table.branchId),
    itemCodeIdx: index('idx_inventory_item_code').on(table.itemCode),
    isSharedIdx: index('idx_inventory_is_shared').on(table.isShared),
}))

export const restockLog = pgTable('restock_log', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    
    // Inventory Item Reference
    itemId: uuid('item_id').notNull().references(() => inventory.id, { onDelete: 'cascade' }),
    
    // Restock Details
    quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
    cost: decimal('cost', { precision: 12, scale: 2 }),
    invoiceNo: varchar('invoice_no', { length: 255 }),
    proofLink: text('proof_link'),
    
    // NEW: Allow custom restock date
    restockedAt: timestamp('restocked_at'), // User-specified restock date
    
    // Supplier Info
    supplierName: varchar('supplier_name', { length: 255 }),
    orderReference: varchar('order_reference', { length: 255 }),
    
    // Audit
    createdBy: text('created_by').references(() => user.id),
}, (table) => ({
    itemIdIdx: index('idx_restock_log_item_id').on(table.itemId),
    createdAtIdx: index('idx_restock_log_created_at').on(table.createdAt),
    invoiceNoIdx: index('idx_restock_log_invoice_no').on(table.invoiceNo),
    restockedAtIdx: index('idx_restock_log_restocked_at').on(table.restockedAt), // NEW
}))

// ============================================================================
// RELATIONS
// ============================================================================

export const inventoryRelations = relations(inventory, ({ one, many }) => ({
    branch: one(branches, {
        fields: [inventory.branchId],
        references: [branches.id],
    }),
    restockLogs: many(restockLog),
}))

export const restockLogRelations = relations(restockLog, ({ one }) => ({
    item: one(inventory, {
        fields: [restockLog.itemId],
        references: [inventory.id],
    }),
    creator: one(user, {
        fields: [restockLog.createdBy],
        references: [user.id],
    }),
}))
