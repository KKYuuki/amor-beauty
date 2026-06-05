import { pgTable, uuid, timestamp, text, boolean, numeric, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { branches } from './branches'

// ============================================================================
// Appointments Schema
// ============================================================================
// Core appointment management tables for Amor Beauty Lounge
//
// Tables:
//   - appointments: Main appointments table (walk-in and scheduled)
//   - tattoo_details: Tattoo-specific appointment details
//   - shoe_details: Shoe cleaning-specific appointment details
//   - piercing_details: Piercing-specific appointment details
//   - appointment_services: Many-to-many link between appointments and services
//   - appointment_items: Many-to-many link between appointments and inventory
// ============================================================================

export const appointments = pgTable('appointments', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    title: text('title').notNull(),
    
    // Client references (null for walk-in without account)
    // Using text for user IDs to match Better Auth native format
    clientId: text('client_id'),
    staffId: text('staff_id'),
    
    // Appointment times
    timeStart: timestamp('time_start').notNull(),
    timeEnd: timestamp('time_end').notNull(),
    actualTimeStart: timestamp('actual_time_start'),
    actualTimeEnd: timestamp('actual_time_end'),
    
    // Status and type
    status: text('status', {
        enum: ['PENDING', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED']
    }).notNull().default('PENDING'),
    type: text('type', {
        enum: ['TATTOO', 'SHOE', 'PIERCING', 'OTHER']
    }),
    
    // Notes and metadata
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    isWalkin: boolean('is_walkin').notNull().default(false),
    
    // Walk-in client details (when no client_id)
    clientName: text('client_name'),
    clientPhone: text('client_phone'),
    clientEmail: text('client_email'),
    
    // Audit fields
    createdBy: text('created_by'),
    updatedAt: timestamp('updated_at'),
    updatedBy: text('updated_by'),
    
    // Payment tracking
    downpaymentId: text('downpayment_id'),
    downpaymentAmount: numeric('downpayment_amount', { precision: 12, scale: 2 }),
    downpaymentCollectedAt: timestamp('downpayment_collected_at'),
    paymentStatus: text('payment_status', { enum: ['UNPAID', 'DEPOSIT_PAID', 'PAID_IN_FULL', 'REFUNDED'] }).default('UNPAID'),
    
    // Branch location
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
}, (table) => ({
    statusIdx: index('idx_appointments_status').on(table.status),
    typeIdx: index('idx_appointments_type').on(table.type),
    isActiveIdx: index('idx_appointments_is_active').on(table.isActive),
    isWalkinIdx: index('idx_appointments_is_walkin').on(table.isWalkin),
    timeStartIdx: index('idx_appointments_time_start').on(table.timeStart),
    clientIdIdx: index('idx_appointments_client_id').on(table.clientId),
    staffIdIdx: index('idx_appointments_staff_id').on(table.staffId),
    branchIdIdx: index('idx_appointments_branch_id').on(table.branchId),
    createdAtIdx: index('idx_appointments_created_at').on(table.createdAt),
}))

export const tattooDetails = pgTable('tattoo_details', {
    id: uuid('id').primaryKey().references(() => appointments.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    designConcept: text('design_concept').notNull(),
    bodyPlacement: text('body_placement').notNull(),
    sizeEstimate: numeric('size_estimate'),
    isColor: boolean('is_color').notNull().default(false),
    artistPrepTime: numeric('artist_prep_time').notNull().default('0'),
    referenceImageId: uuid('reference_image_id'),
    finalImageId: uuid('final_image_id'),
})

export const shoeDetails = pgTable('shoe_details', {
    id: uuid('id').primaryKey().references(() => appointments.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    shoeName: text('shoe_name').notNull(),
    quantity: numeric('quantity').notNull(),
    dropOffDate: timestamp('drop_off_date'),
    pickUpDate: timestamp('pick_up_date'),
    cleaningService: text('cleaning_service', {
        enum: ['STANDARD', 'DEEP', 'FULL']
    }).notNull().default('STANDARD'),
    addOnRush: boolean('add_on_rush').notNull().default(false),
    addOnReplacement: boolean('add_on_replacement').notNull().default(false),
    addOnWaterRepellent: boolean('add_on_water_repellent').notNull().default(false),
    soleWhitening: text('sole_whitening', {
        enum: ['NONE', 'MINIMAL', 'MEDIUM', 'FULL']
    }).notNull().default('NONE'),
    reglueService: text('reglue_service', {
        enum: ['NONE', 'MINIMAL', 'MAJOR', 'FULL']
    }).notNull().default('NONE'),
    totalCost: numeric('total_cost').notNull().default('0'),
})

export const piercingDetails = pgTable('piercing_details', {
    id: uuid('id').primaryKey().references(() => appointments.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    piercingLocation: text('piercing_location').notNull(),
    jewelryMaterial: text('jewelry_material').notNull(),
    jewelryStyle: text('jewelry_style', {
        enum: ['STUD', 'RING', 'BARBELL']
    }).notNull().default('STUD'),
    previousPiercingIssues: boolean('previous_piercing_issues').notNull().default(false),
    aftercareInstructions: text('aftercare_instructions'),
})

export const appointmentServices = pgTable('appointment_services', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    appointmentId: uuid('appointment_id').notNull().references(() => appointments.id),
    serviceId: uuid('service_id').notNull(),
    price: numeric('price'),
}, (table) => ({
    appointmentIdx: index('idx_appointment_services_appointment_id').on(table.appointmentId),
    serviceIdx: index('idx_appointment_services_service_id').on(table.serviceId),
}))

export const appointmentItems = pgTable('appointment_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    appointmentId: uuid('appointment_id').notNull().references(() => appointments.id),
    inventoryId: uuid('inventory_id').notNull(),
    quantity: numeric('quantity').notNull(),
    fluidQuantity: numeric('fluid_quantity'),
}, (table) => ({
    appointmentIdx: index('idx_appointment_items_appointment_id').on(table.appointmentId),
    inventoryIdx: index('idx_appointment_items_inventory_id').on(table.inventoryId),
}))

// ============================================================================
// Relations
// ============================================================================

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
    branch: one(branches, {
        fields: [appointments.branchId],
        references: [branches.id],
    }),
    services: many(appointmentServices),
    items: many(appointmentItems),
}))

export const appointmentServicesRelations = relations(appointmentServices, ({ one }) => ({
    appointment: one(appointments, {
        fields: [appointmentServices.appointmentId],
        references: [appointments.id],
    }),
}))