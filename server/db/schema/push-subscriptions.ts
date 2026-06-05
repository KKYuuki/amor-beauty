import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { randomUUID } from 'crypto'
import { user } from './auth'

export const pushSubscriptions = pgTable('push_subscriptions', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dhKey: text('p256dh_key').notNull(),
    authKey: text('auth_key').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
})

export type PushSubscription = typeof pushSubscriptions.$inferSelect
export type PushSubscriptionInsert = typeof pushSubscriptions.$inferInsert