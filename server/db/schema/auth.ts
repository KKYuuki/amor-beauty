import { pgTable, timestamp, varchar, text, boolean, integer, jsonb, index, uuid } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { rateLevels } from './rate-levels'

// ============================================================================
// BETTER-AUTH CORE TABLES
// Using text IDs (Better Auth native format)
// ============================================================================

export const user = pgTable('user', {
    id: text('id').primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at'),
    
    // Authentication (Better Auth core fields)
    email: varchar('email', { length: 255 }).notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    name: varchar('name', { length: 255 }),
    image: text('image'),
    
    // Better-Auth admin plugin fields
    role: varchar('role', { length: 50 }),
    banned: boolean('banned').default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires'),
    
    // Better-Auth 2FA plugin field
    twoFactorEnabled: boolean('two_factor_enabled').default(false),
    
    // Custom Amor Beauty fields
    fullName: varchar('full_name', { length: 255 }),
    phoneNumber: varchar('phone_number', { length: 50 }),
    instagramHandle: varchar('instagram_handle', { length: 100 }),
    avatarUrl: text('avatar_url'),

    // Role & Access - Using Better-Auth native 'role' field only
    // Valid roles: 'admin', 'manager', 'staff', 'artist'
    accessFlags: jsonb('access_flags').$type<string[]>().default([]),
    isActive: boolean('is_active').default(true).notNull(),

    // User Activity Audit fields
    lastLoginAt: timestamp('last_login_at'),
    lastLoginMethod: varchar('last_login_method', { length: 50 }),
    loginCount: integer('login_count').default(0),
    failedLoginAttempts: integer('failed_login_attempts').default(0),
    lastFailedLoginAt: timestamp('last_failed_login_at'),

    // Payroll fields
    rateLevelId: uuid('rate_level_id').references(() => rateLevels.id),
    payoutPeriod: varchar('payout_period', { length: 50 }).default('WEEKLY'),

    // Branch assignments - users can belong to multiple branches
    branchIds: jsonb('branch_ids').$type<string[]>().default([]),
}, (table) => ({
    emailIdx: index('idx_user_email').on(table.email),
    roleIdx: index('idx_user_role').on(table.role),
    rateLevelIdx: index('idx_user_rate_level').on(table.rateLevelId),
}))

export const session = pgTable('session', {
    id: text('id').primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at'),
    
    // Session data
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    
    // User reference
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    
    // Session metadata
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    
    // Better-Auth admin plugin extension
    impersonatedBy: text('impersonated_by').references(() => user.id, { onDelete: 'set null' }),
}, (table) => ({
    userIdIdx: index('idx_session_user_id').on(table.userId),
    tokenIdx: index('idx_session_token').on(table.token),
    expiresAtIdx: index('idx_session_expires_at').on(table.expiresAt),
}))

export const account = pgTable('account', {
    id: text('id').primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at'),
    
    // User reference
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    
    // Provider info
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    
    // OAuth tokens
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    
    // Metadata
    idToken: text('id_token'),
}, (table) => ({
    userIdIdx: index('idx_account_user_id').on(table.userId),
    providerIdx: index('idx_account_provider').on(table.providerId, table.accountId),
}))

export const verification = pgTable('verification', {
    id: text('id').primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at'),
    
    // Verification data
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
    identifierIdx: index('idx_verification_identifier').on(table.identifier),
    expiresAtIdx: index('idx_verification_expires_at').on(table.expiresAt),
}))

// ============================================================================
// TWO-FACTOR AUTHENTICATION TABLES
// ============================================================================

export const twoFactor = pgTable('two_factor', {
    id: text('id').primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    
    // User reference
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    
    // 2FA data
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
}, (table) => ({
    userIdIdx: index('idx_two_factor_user_id').on(table.userId),
}))

export const passkey = pgTable('passkey', {
    id: text('id').primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    
    // Passkey data
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').default(0),
    deviceType: text('device_type'),
    backedUp: boolean('backed_up').default(false),
    transports: text('transports'),
    aaguid: text('aaguid'),
}, (table) => ({
    userIdIdx: index('idx_passkey_user_id').on(table.userId),
    credentialIdIdx: index('idx_passkey_credential_id').on(table.credentialID),
}))

// ============================================================================
// RELATIONS
// ============================================================================

export const userRelations = relations(user, ({ many }) => ({
    sessions: many(session),
    accounts: many(account),
    twoFactor: many(twoFactor),
    passkeys: many(passkey),
}))

export const sessionRelations = relations(session, ({ one }) => ({
    user: one(user, {
        fields: [session.userId],
        references: [user.id],
    }),
}))

export const accountRelations = relations(account, ({ one }) => ({
    user: one(user, {
        fields: [account.userId],
        references: [user.id],
    }),
}))

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
    user: one(user, {
        fields: [twoFactor.userId],
        references: [user.id],
    }),
}))

export const passkeyRelations = relations(passkey, ({ one }) => ({
    user: one(user, {
        fields: [passkey.userId],
        references: [user.id],
    }),
}))

export const rateLevelsRelations = relations(rateLevels, ({ one }) => ({
    createdByUser: one(user, {
        fields: [rateLevels.createdBy],
        references: [user.id],
    }),
}))
