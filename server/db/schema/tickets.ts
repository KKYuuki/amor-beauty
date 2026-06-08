import { pgTable, uuid, timestamp, varchar, decimal, index, integer, pgEnum, serial } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { services } from './services'

// ============================================================================
// TICKETS SCHEMA
// ============================================================================

export const ticketStatusEnum = pgEnum('ticket_status', [
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'CANCELLED'
])

export const tickets = pgTable('tickets', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),

    queueNumber: serial('queue_number').notNull(),
    status: ticketStatusEnum('status').default('PENDING').notNull(),
    customerName: varchar('customer_name', { length: 255 }),
    totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull().default('0'),
}, (table) => ({
    statusIdx: index('idx_tickets_status').on(table.status),
    createdAtIdx: index('idx_tickets_created_at').on(table.createdAt),
}))

export const ticketServices = pgTable('ticket_services', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),

    ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
    
    price: decimal('price', { precision: 12, scale: 2 }).notNull(),
    quantity: integer('quantity').notNull().default(1),
}, (table) => ({
    ticketIdIdx: index('idx_ticket_services_ticket_id').on(table.ticketId),
    serviceIdIdx: index('idx_ticket_services_service_id').on(table.serviceId),
}))

// ============================================================================
// RELATIONS
// ============================================================================

export const ticketsRelations = relations(tickets, ({ many }) => ({
    services: many(ticketServices),
}))

export const ticketServicesRelations = relations(ticketServices, ({ one }) => ({
    ticket: one(tickets, {
        fields: [ticketServices.ticketId],
        references: [tickets.id],
    }),
    service: one(services, {
        fields: [ticketServices.serviceId],
        references: [services.id],
    }),
}))
