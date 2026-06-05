import { pgTable, text, timestamp, integer, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'crypto'
import { user } from './auth'
import { appointments } from './appointments'

export const ratings = pgTable('ratings', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    appointmentId: uuid('appointment_id').references(() => appointments.id),
    customerId: text('customer_id'),
    staffId: text('staff_id').notNull().references(() => user.id),
    rating: integer('rating').notNull(), // 1-5
    comment: text('comment'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
