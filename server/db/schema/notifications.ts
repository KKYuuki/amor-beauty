import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { randomUUID } from 'crypto'
import { user } from './auth'

export const notifications = pgTable('notifications', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: text('user_id').notNull().references(() => user.id),
    type: text('type').notNull(), // SYSTEM, APPOINTMENT, PAYROLL, INVENTORY, TRANSACTION
    title: text('title').notNull(),
    message: text('message').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>(),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type Notification = typeof notifications.$inferSelect
