import { pgTable, uuid, timestamp, varchar, boolean, integer, text } from 'drizzle-orm/pg-core'

export const rateLevels = pgTable('rate_levels', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 50 }).notNull(),
    slug: varchar('slug', { length: 50 }).notNull().unique(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    createdBy: text('created_by'),
})
