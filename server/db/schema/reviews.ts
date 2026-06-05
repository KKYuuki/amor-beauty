import { pgTable, text, timestamp, boolean, uuid } from 'drizzle-orm/pg-core'
import { randomUUID } from 'crypto'
import { user } from './auth'
import { appointments } from './appointments'

export const reviews = pgTable('reviews', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    appointmentId: uuid('appointment_id').references(() => appointments.id),
    authorId: text('author_id').notNull().references(() => user.id),
    type: text('type').notNull(), // ARTIST, SHOP, SERVICE
    title: text('title'),
    content: text('content').notNull(),
    isPublic: boolean('is_public').default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
