import { pgTable, uuid, timestamp, text, integer, boolean, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'

// ============================================================================
// STORAGE FILES TABLE
// ============================================================================
// Stores metadata about uploaded files (images, documents, etc.)
// Actual file content is stored in external storage (Supabase Storage, S3, etc.)
// ============================================================================

export const storageFiles = pgTable('storage_files', {
    id: uuid('id').defaultRandom().primaryKey(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    public_url: text('public_url'),
    size: integer('size'),
    mime_type: text('mime_type'),
    bucket: text('bucket'),
    key: text('key'),
    is_public: boolean('is_public').default(false),
    uploaded_by: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
}, (table) => ({
    uploadedByIdx: index('idx_storage_uploaded_by').on(table.uploaded_by),
    isPublicIdx: index('idx_storage_is_public').on(table.is_public),
}))

export const storageFilesRelations = relations(storageFiles, ({ one }) => ({
    uploader: one(user, {
        fields: [storageFiles.uploaded_by],
        references: [user.id],
    }),
}))
