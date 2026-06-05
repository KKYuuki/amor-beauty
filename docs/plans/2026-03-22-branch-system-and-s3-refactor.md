# Branch System & S3 Integration Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a database-backed branch system with IT-only modification rights, and refactor S3 integration to ensure compatibility with RustFS.

**Architecture:** 
- Branches stored in a `branches` table with CRUD operations restricted via access control flag `manage_branches`
- Branch ID foreign key added to transactions, appointments, and inventory items
- S3 integration reviewed and enhanced with better error handling and configuration validation

**Tech Stack:** Next.js 15, Drizzle ORM, PostgreSQL, AWS SDK v3, Better Auth

---

## Part 1: Branch System - Database Schema & Types

### Task 1: Create Branch Schema and Database Migration

**Files:**
- Create: `server/db/schema/branches.ts`
- Modify: `server/db/schema.ts`

**Step 1: Write the branch schema definition**

Create `server/db/schema/branches.ts`:

```typescript
import { pgTable, uuid, timestamp, text, boolean, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'

// ============================================================================
// BRANCHES SCHEMA
// ============================================================================

export const branches = pgTable('branches', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    
    // Branch Info
    name: text('name').notNull(),
    code: text('code').notNull().unique(), // Short code like 'CEB-CR', 'CEB-LL'
    city: text('city').notNull(),
    address: text('address'),
    phone: text('phone'),
    
    // Status
    isActive: boolean('is_active').default(true).notNull(),
    
    // Audit
    createdBy: text('created_by').references(() => user.id),
    updatedBy: text('updated_by').references(() => user.id),
}, (table) => ({
    codeIdx: index('idx_branches_code').on(table.code),
    cityIdx: index('idx_branches_city').on(table.city),
    isActiveIdx: index('idx_branches_is_active').on(table.isActive),
}))

export const branchesRelations = relations(branches, ({ one }) => ({
    creator: one(user, {
        fields: [branches.createdBy],
        references: [user.id],
    }),
    updater: one(user, {
        fields: [branches.updatedBy],
        references: [user.id],
    }),
}))

// Type exports
export type Branch = typeof branches.$inferSelect
export type NewBranch = typeof branches.$inferInsert
```

**Step 2: Export branch schema from main schema file**

Modify `server/db/schema.ts`, add after the settings export:

```typescript
// Branches Schema
export {
    branches,
    branchesRelations,
} from './schema/branches'
```

**Step 3: Generate and run migration**

```bash
bun run db:generate
bun run db:migrate
```

**Step 4: Commit**

```bash
git add server/db/schema/branches.ts server/db/schema.ts
git commit -m "feat(db): add branches schema for multi-location support"
```

---

### Task 2: Create Branch TypeScript Types

**Files:**
- Create: `utils/types/branch.ts`
- Modify: `utils/types/index.ts` (if exists) or create

**Step 1: Create branch types file**

Create `utils/types/branch.ts`:

```typescript
// Branch Types

export type BranchStatus = 'ACTIVE' | 'INACTIVE'

export interface Branch {
    id: string
    created_at: Date
    updated_at: Date
    name: string
    code: string // Unique short code (e.g., 'CEB-CR', 'CEB-LL')
    city: string
    address?: string | null
    phone?: string | null
    is_active: boolean
    created_by?: string | null
    updated_by?: string | null
}

export interface CreateBranchPayload {
    name: string
    code: string
    city: string
    address?: string
    phone?: string
}

export interface UpdateBranchPayload {
    id: string
    name?: string
    code?: string
    city?: string
    address?: string | null
    phone?: string | null
    is_active?: boolean
}

// IT Admin email configuration
// Can be set via environment variable (comma-separated) or hardcoded
export function getITAdminEmails(): string[] {
    const envEmails = process.env.IT_ADMIN_EMAILS
    if (envEmails) {
        return envEmails.split(',').map(email => email.trim().toLowerCase())
    }
    // Default IT admin email
    return ['adrianbonpin@gmail.com']
}

export function isITAdmin(email: string): boolean {
    const itAdmins = getITAdminEmails()
    return itAdmins.includes(email.toLowerCase())
}
```

**Step 2: Commit**

```bash
git add utils/types/branch.ts
git commit -m "feat(types): add branch types and IT admin helpers"
```

---

### Task 3: Add manage_branches Permission and Branch Server Actions

**Files:**
- Create: `server/actions/branches.ts`
- Modify: `utils/auth/permissions.ts`

**Step 1: Add canManageBranches permission function**

Add to `utils/auth/permissions.ts` after `canAccessLogs`:

```typescript
export async function canManageBranches(user: UserProfile): Promise<boolean> {
    // IT admins can always manage branches
    if (isITAdmin(user.email)) {
        return true
    }
    // Or users with manage_branches access flag
    return await isAdmin(user) || (user.access_flags?.includes('manage_branches') ?? false)
}
```

**Step 2: Import isITAdmin in permissions file**

Add at top of `utils/auth/permissions.ts`:

```typescript
import { isITAdmin } from '@/utils/types/branch'
```

**Step 3: Create branch server actions**

Create `server/actions/branches.ts`:

```typescript
'use server'

import { db } from '@/server/db'
import { branches } from '@/server/db/schema'
import { eq } from'drizzle-orm'
import { getCurrentUser, canManageBranches } from '@/utils/auth/permissions'
import { 
    Branch, 
    CreateBranchPayload, 
    UpdateBranchPayload,
    isITAdmin 
} from '@/utils/types/branch'
import { createLogs } from './logs'

// ============================================================================
// READ OPERATIONS (All authenticated users)
// ============================================================================

export async function getBranches(): Promise<{ data: Branch[]; error?: string }> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { data: [], error: 'Not authenticated' }
        }

        const data = await db
            .select()
            .from(branches)
            .where(eq(branches.isActive, true))
            .orderBy(branches.name)

        return { data }
    } catch (error) {
        console.error('Error fetching branches:', error)
        return { data: [], error: 'Failed to fetch branches' }
    }
}

export async function getAllBranches(): Promise<{ data: Branch[]; error?: string }> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { data: [], error: 'Not authenticated' }
        }

        const data = await db
            .select()
            .from(branches)
            .orderBy(branches.name)

        return { data }
    } catch (error) {
        console.error('Error fetching all branches:', error)
        return { data: [], error: 'Failed to fetch branches' }
    }
}

export async function getBranchById(id: string): Promise<{ data: Branch | null; error?: string }> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { data: null, error: 'Not authenticated' }
        }

        const [data] = await db
            .select()
            .from(branches)
            .where(eq(branches.id, id))
            .limit(1)

        return { data: data ?? null }
    } catch (error) {
        console.error('Error fetching branch:', error)
        return { data: null, error: 'Failed to fetch branch' }
    }
}

export async function getBranchByCode(code: string): Promise<{ data: Branch | null; error?: string }> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { data: null, error: 'Not authenticated' }
        }

        const [data] = await db
            .select()
            .from(branches)
            .where(eq(branches.code, code))
            .limit(1)

        return { data: data ?? null }
    } catch (error) {
        console.error('Error fetching branch by code:', error)
        return { data: null, error: 'Failed to fetch branch' }
    }
}

// ============================================================================
// WRITE OPERATIONS (IT admins and users with manage_branches)
// ============================================================================

export async function createBranch(payload: CreateBranchPayload): Promise<{ data: Branch | null; error?: string }> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { data: null, error: 'Not authenticated' }
        }

        const hasPermission = await canManageBranches(user)
        if (!hasPermission) {
            return { data: null, error: 'Insufficient permissions. Only IT admins can manage branches.' }
        }

        // Check if code already exists
        const existing = await db
            .select()
            .from(branches)
            .where(eq(branches.code, payload.code))
            .limit(1)

        if (existing.length > 0) {
            return { data: null, error: 'Branch code already exists' }
        }

        const [newBranch] = await db
            .insert(branches)
            .values({
                name: payload.name,
                code: payload.code,
                city: payload.city,
                address: payload.address ?? null,
                phone: payload.phone ?? null,
                createdBy: user.id,
                updatedBy: user.id,
            })
            .returning()

        await createLogs({
            logs: [{
                level: 'INFO',
                message: `Branch created: ${newBranch.name} (${newBranch.code})`,
            }]
        })

        return { data: newBranch }
    } catch (error) {
        console.error('Error creating branch:', error)
        return { data: null, error: 'Failed to create branch' }
    }
}

export async function updateBranch(payload: UpdateBranchPayload): Promise<{ data: Branch | null; error?: string }> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { data: null, error: 'Not authenticated' }
        }

        const hasPermission = await canManageBranches(user)
        if (!hasPermission) {
            return { data: null, error: 'Insufficient permissions. Only IT admins can manage branches.' }
        }

        // If code is being updated, check for duplicates
        if (payload.code) {
            const existing = await db
                .select()
                .from(branches)
                .where(eq(branches.code, payload.code))
                .limit(1)

            if (existing.length > 0 && existing[0].id !== payload.id) {
                return { data: null, error: 'Branch code already exists' }
            }
        }

        const updateData: Record<string, unknown> = {
            updatedAt: new Date(),
            updatedBy: user.id,
        }

        if (payload.name !== undefined) updateData.name = payload.name
        if (payload.code !== undefined) updateData.code = payload.code
        if (payload.city !== undefined) updateData.city = payload.city
        if (payload.address !== undefined) updateData.address = payload.address
        if (payload.phone !== undefined) updateData.phone = payload.phone
        if (payload.is_active !== undefined) updateData.isActive = payload.is_active

        const [updated] = await db
            .update(branches)
            .set(updateData)
            .where(eq(branches.id, payload.id))
            .returning()

        await createLogs({
            logs: [{
                level: 'INFO',
                message: `Branch updated: ${updated?.name} (${updated?.code})`,
            }]
        })

        return { data: updated ?? null }
    } catch (error) {
        console.error('Error updating branch:', error)
        return { data: null, error: 'Failed to update branch' }
    }
}

export async function deleteBranch(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { success: false, error: 'Not authenticated' }
        }

        const hasPermission = await canManageBranches(user)
        if (!hasPermission) {
            return { success: false, error: 'Insufficient permissions. Only IT admins can manage branches.' }
        }

        // Soft delete by setting is_active to false
        await db
            .update(branches)
            .set({
                isActive: false,
                updatedAt: new Date(),
                updatedBy: user.id,
            })
            .where(eq(branches.id, id))

        await createLogs({
            logs: [{
                level: 'INFO',
                message: `Branch deleted: ${id}`,
            }]
        })

        return { success: true }
    } catch (error) {
        console.error('Error deleting branch:', error)
        return { success: false, error: 'Failed to delete branch' }
    }
}
```

**Step 4: Commit**

```bash
git add server/actions/branches.ts utils/auth/permissions.ts
git commit -m "feat(actions): add branch CRUD operations with IT admin access control"
```

---

## Part 2: Branch References in Core Tables

### Task 4: Add branch_id to Transactions Table

**Files:**
- Create: `drizzle/<timestamp>_add_branch_to_transactions.sql`
- Modify: `server/db/schema/transactions.ts` (if exists) or create
- Modify: `utils/types/transactions.ts`

**Step 1: Create migration for transactions branch_id**

Create a new migration file in `drizzle/` with the next sequence number:

```sql
-- Add branch_id to transactions table
ALTER TABLE "transactions" ADD COLUMN "branch_id" uuid REFERENCES "branches"("id");--> statement-breakpoint
CREATE INDEX "idx_transactions_branch_id" ON "transactions" USING btree ("branch_id");
```

**Step 2: Update transactions schema if exists**

If `server/db/schema/transactions.ts` exists, add branch relationship. Otherwise, check `supabase/transactions.sql`.

**Step 3: Update Transaction TypeScript type**

Modify `utils/types/transactions.ts`, add to Transaction interface:

```typescript
export interface Transaction {
    // ... existing fields ...

    // Branch
    branch_id?: string | null
    branch?: Branch
}
```

Add import at top:

```typescript
import { Branch } from "./branch"
```

**Step 4: Update CreateTransactionPayload**

Add branch_id to `utils/types/transactions.ts`:

```typescript
export interface CreateTransactionPayload {
    // ... existing fields ...

    branch_id?: string | null
}
```

**Step 5: Commit**

```bash
git add drizzle/*.sql utils/types/transactions.ts
git commit -m "feat(db): add branch_id to transactions for multi-location tracking"
```

---

### Task 5: Add branch_id to Appointments Table

**Files:**
- Create: `drizzle/<timestamp>_add_branch_to_appointments.sql`
- Modify: `server/db/schema/appointments.ts`
- Modify: `utils/types/general.ts` or appointment types

**Step 1: Create migration for appointments branch_id**

```sql
-- Add branch_id to appointments table
ALTER TABLE "appointments" ADD COLUMN "branch_id" uuid REFERENCES "branches"("id");--> statement-breakpoint
CREATE INDEX "idx_appointments_branch_id" ON "appointments" USING btree ("branch_id");
```

**Step 2: Update appointments schema**

Modify `server/db/schema/appointments.ts`, add to the appointments table definition:

```typescript
export const appointments = pgTable('appointments', {
    // ... existing fields ...

    // Branch location
    branchId: uuid('branch_id').references(() => branches.id),
}, (table) => ({
    // ... existing indexes ...
    branchIdIdx: index('idx_appointments_branch_id').on(table.branchId),
}))
```

Add import for branches:

```typescript
import { branches } from './branches'
```

**Step 3: Update appointment types**

Check for appointment types file and add branch_id field.

**Step 4: Commit**

```bash
git add drizzle/*.sql server/db/schema/appointments.ts
git commit -m "feat(db): add branch_id to appointments for location-based booking"
```

---

### Task 6: Add branch_id to Inventory Table (Hybrid Support)

**Files:**
- Create: `drizzle/<timestamp>_add_branch_to_inventory.sql`
- Modify: `server/db/schema/inventory.ts`
- Modify: `utils/types/inventory.ts`

**Step 1: Create migration for inventory branch_id**

```sql
-- Add branch_id to inventory table (nullable for shared items)
ALTER TABLE "inventory" ADD COLUMN "branch_id" uuid REFERENCES "branches"("id");--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "is_shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_inventory_branch_id" ON "inventory" USING btree ("branch_id");
```

**Step 2: Update inventory schema**

Modify `server/db/schema/inventory.ts`:

```typescript
export const inventory = pgTable('inventory', {
    // ... existing fields ...

    // Branch assignment (null for shared items)
    branchId: uuid('branch_id').references(() => branches.id),
    isShared: boolean('is_shared').default(false).notNull(),
}, (table) => ({
    // ... existing indexes ...
    branchIdIdx: index('idx_inventory_branch_id').on(table.branchId),
}))
```

Add import:

```typescript
import { branches } from './branches'
```

**Step 3: Update inventory types**

Modify `utils/types/inventory.ts`:

```typescript
export interface InventoryItem {
    // ... existing fields ...

    branch_id?: string | null
    is_shared: boolean
    branch?: Branch
}
```

**Step 4: Commit**

```bash
git add drizzle/*.sql server/db/schema/inventory.ts utils/types/inventory.ts
git commit -m "feat(db): add branch_id and is_shared to inventory for hybrid stock tracking"
```

---

## Part 3: S3 Integration Refactoring

### Task 7: Add S3 Configuration Validation and Error Handling

**Files:**
- Modify: `utils/storage.ts`

**Step 1: Refactor storage.ts with better validation**

Replace entire content of `utils/storage.ts`:

```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// ============================================================================
// S3 CONFIGURATION
// ============================================================================

interface S3Config {
    endpoint: string
    bucket: string
    accessKey: string
    secretKey: string
    publicUrl: string
}

function getS3Config(): S3Config | null {
    const endpoint = process.env.S3_ENDPOINT
    const bucket = process.env.S3_BUCKET
    const accessKey = process.env.S3_ACCESS_KEY
    const secretKey = process.env.S3_SECRET_KEY
    const publicUrl = process.env.S3_PUBLIC_URL

    if (!endpoint || !bucket || !accessKey || !secretKey || !publicUrl) {
        console.warn('S3 configuration incomplete. Missing required environment variables.')
        return null
    }

    return { endpoint, bucket, accessKey, secretKey, publicUrl }
}

function createS3Client(config: S3Config): S3Client {
    return new S3Client({
        region: "auto",
        endpoint: config.endpoint,
        credentials: {
            accessKeyId: config.accessKey,
            secretAccessKey: config.secretKey,
        },
        forcePathStyle: true, // Required for RustFS and other S3-compatible services
    })
}

let s3ClientInstance: S3Client | null = null
let s3ConfigInstance: S3Config | null = null

function getS3ClientAndConfig(): { client: S3Client; config: S3Config } | null {
    if (!s3ConfigInstance) {
        s3ConfigInstance = getS3Config()
    }

    if (!s3ConfigInstance) {
        return null
    }

    if (!s3ClientInstance) {
        s3ClientInstance = createS3Client(s3ConfigInstance)
    }

    return { client: s3ClientInstance, config: s3ConfigInstance }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class StorageError extends Error {
    constructor(
        message: string,
        public readonly operation: string,
        public readonly cause?: Error
    ) {
        super(message)
        this.name = 'StorageError'
    }
}

// ============================================================================
// UPLOAD OPERATIONS
// ============================================================================

export interface UploadResult {
    url: string
    key: string
}

/**
 * Uploads a file buffer to S3-compatible storage (RustFS)
 * @param buffer - File content as Buffer
 * @param key - Unique file path/name (e.g., "avatars/user-123.png")
 * @param contentType - MIME type of the file
 * @returns Upload result with public URL and key
 */
export async function uploadFile(
    buffer: Buffer,
    key: string,
    contentType: string
): Promise<UploadResult> {
    const result = getS3ClientAndConfig()

    if (!result) {
        throw new StorageError(
            'S3 storage not configured. Check S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_PUBLIC_URL environment variables.',
            'upload'
        )
    }

    const { client, config } = result

    try {
        const command = new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            ACL: "public-read",
        })

        await client.send(command)

        const publicUrl = `${config.publicUrl}/${config.bucket}/${key}`

        return {
            url: publicUrl,
            key: key,
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('S3 Upload Error:', { key, contentType, error: message })
        throw new StorageError(
            `Failed to upload file to storage: ${message}`,
            'upload',
            error instanceof Error ? error : undefined
        )
    }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Deletes a file from S3-compatible storage
 * @param key - Unique file path/name
 */
export async function deleteFile(key: string): Promise<void> {
    const result = getS3ClientAndConfig()

    if (!result) {
        throw new StorageError(
            'S3 storage not configured.',
            'delete'
        )
    }

    const { client, config } = result

    try {
        const command = new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: key,
        })

        await client.send(command)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('S3 Delete Error:', { key, error: message })
        throw new StorageError(
            `Failed to delete file from storage: ${message}`,
            'delete',
            error instanceof Error ? error : undefined
        )
    }
}

// ============================================================================
// PRESIGNED URL OPERATIONS
// ============================================================================

/**
 * Generates a presigned URL for temporary file access
 * @param key - Unique file path/name
 * @param expiresIn - Expiration time in seconds (default 3600)
 * @returns Presigned URL for temporary access
 */
export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const result = getS3ClientAndConfig()

    if (!result) {
        throw new StorageError(
            'S3 storage not configured.',
            'presign'
        )
    }

    const { client, config } = result

    try {
        const command = new GetObjectCommand({
            Bucket: config.bucket,
            Key: key,
        })

        return await getSignedUrl(client, command, { expiresIn })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('S3 Presign Error:', { key, error: message })
        throw new StorageError(
            `Failed to generate presigned URL: ${message}`,
            'presign',
            error instanceof Error ? error : undefined
        )
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extracts the S3 key from a full public URL
 * @param url - Full public URL
 * @returns The object key, or null if invalid
 */
export function getKeyFromUrl(url: string): string | null {
    const config = getS3Config()

    if (!config) {
        return null
    }

    if (!url.startsWith(config.publicUrl)) {
        return null
    }

    const prefix = `${config.publicUrl}/${config.bucket}/`
    if (url.startsWith(prefix)) {
        return url.slice(prefix.length)
    }

    return null
}

/**
 * Check if S3 storage is properly configured
 * @returns true if all required environment variables are set
 */
export function isStorageConfigured(): boolean {
    return getS3Config() !== null
}

/**
 * Get the public URL base for constructing file URLs
 * @returns The public URL base or null if not configured
 */
export function getStoragePublicUrl(): string | null {
    const config = getS3Config()
    return config ? `${config.publicUrl}/${config.bucket}` : null
}
```

**Step 2: Add environment variable documentation**

Add to `.env.example`:

```bash
# -----------------------------------------------------------------------------
# S3 STORAGE (RustFS)
# -----------------------------------------------------------------------------
# S3-compatible storage endpoint (RustFS frontend)
S3_ENDPOINT="https://s3-frontend.ranlabs.space"

# Bucket name for file storage
S3_BUCKET="inksight-testing"

# Access credentials from RustFS
S3_ACCESS_KEY="your-access-key"
S3_SECRET_KEY="your-secret-key"

# Public URL for accessing stored files (RustFS public endpoint)
S3_PUBLIC_URL="https://s3.ranlabs.space"
```

**Step 3: Commit**

```bash
git add utils/storage.ts .env.example
git commit -m "refactor(storage): improve S3 integration with validation and error handling"
```

---

### Task 8: Add Storage Health Check Endpoint

**Files:**
- Create: `app/api/health/storage/route.ts`

**Step 1: Create health check endpoint**

Create `app/api/health/storage/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { isStorageConfigured, getS3ClientAndConfig } from '@/utils/storage'
import { ListBucketsCommand } from '@aws-sdk/client-s3'

export async function GET() {
    try {
        if (!isStorageConfigured()) {
            return NextResponse.json({
                status: 'error',
                message: 'S3 storage not configured',
                configured: false,
            }, { status: 503 })
        }

        const result = getS3ClientAndConfig()

        if (!result) {
            return NextResponse.json({
                status: 'error',
                message: 'S3 client initialization failed',
                configured: false,
            }, { status: 503 })
        }

        // Try to list buckets to verify connectivity
        const { client } = result
        await client.send(new ListBucketsCommand({}))

        return NextResponse.json({
            status: 'ok',
            message: 'S3 storage is accessible',
            configured: true,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'

        return NextResponse.json({
            status: 'error',
            message: `S3 storage check failed: ${message}`,
            configured: true,
        }, { status: 503 })
    }
}
```

**Step 2: Commit**

```bash
git add app/api/health/storage/route.ts
git commit -m "feat(api): add storage health check endpoint"
```

---

### Task 9: Update Transaction Actions to Use Branch

**Files:**
- Modify: `server/actions/transactions.ts`

**Step 1: Update createTransaction to accept branch_id**

Modify `server/actions/transactions.ts`:

```typescript
import { CreateTransactionPayload, Transaction, VoidTransactionPayload, AddTransactionPaymentPayload, TransactionPayment } from "@/utils/types/transactions"
import { DateRangePreset } from "@/utils/date-utils"
import { db } from '@/server/db'
import { transactions, transactionItems, transactionPayments } from '@/server/db/schema/transactions'
import { branches } from '@/server/db/schema/branches'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/utils/auth/permissions'
import { createLogs } from './logs'

// ... existing types ...

export async function createTransaction(payload: CreateTransactionPayload) {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return { success: false, message: 'Not authenticated' }
        }

        // Validate branch exists if provided
        if (payload.branch_id) {
            const [branch] = await db
                .select()
                .from(branches)
                .where(eq(branches.id, payload.branch_id))
                .limit(1)

            if (!branch) {
                return { success: false, message: 'Invalid branch ID' }
            }
        }

        // Generate transaction number
        const transactionNumber = await generateTransactionNumber(payload.branch_id)

        // Create transaction
        const [newTransaction] = await db
            .insert(transactions)
            .values({
                transactionNumber,
                buyerId: payload.buyer_id,
                buyerName: payload.buyer_name,
                customerPhone: payload.customer_phone,
                customerEmail: payload.customer_email,
                staffId: payload.staff_id,
                branchId: payload.branch_id,
                subtotal: payload.subtotal,
                taxAmount: payload.tax_amount,
                discountAmount: payload.discount_amount,
                total: payload.total,
                amountPaid: payload.amount_paid ?? payload.total,
                balanceDue: payload.balance_due ?? 0,
                paymentMethod: payload.payment_method,
                cashReceived: payload.cash_received,
                changeGiven: payload.change_given,
                referenceNumber: payload.reference_number,
                status: payload.balance_due && payload.balance_due > 0? 'PARTIAL' : 'COMPLETED',
                appointmentId: payload.appointment_id,
                notes: payload.notes,
                createdBy: user.id,
            })
            .returning()

        // Create transaction items
        if (payload.items && payload.items.length > 0) {
            await db
                .insert(transactionItems)
                .values(payload.items.map(item => ({
                    transactionId: newTransaction.id,
                    inventoryId: item.inventory_id,
                    serviceId: item.service_id,
                    itemName: item.item_name,
                    quantity: item.quantity,
                    unitPrice: item.unit_price,
                    lineTotal: item.line_total,
                })))
        }

        // Create split payments if applicable
        if (payload.payment_method === 'SPLIT' && payload.payments) {
            for (const payment of payload.payments) {
                await db
                    .insert(transactionPayments)
                    .values({
                        transactionId: newTransaction.id,
                        amount: payment.amount,
                        paymentMethod: payment.payment_method,
                        referenceNumber: payment.reference_number,
                    })
            }
        }

        await createLogs({
            logs: [{
                level: 'INFO',
                message: `Transaction created: ${transactionNumber}`,
            }]
        })

        return { success: true, data: newTransaction }
    } catch (error) {
        console.error('Error creating transaction:', error)
        return { success: false, message: 'Failed to create transaction' }
    }
}

async function generateTransactionNumber(branchId?: string | null): Promise<string> {
    const date = new Date()
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
    
    // Get branch code if available
    let branchCode = 'TXN'
    if (branchId) {
        const [branch] = await db
            .select()
            .from(branches)
            .where(eq(branches.id, branchId))
            .limit(1)
        if (branch) {
            branchCode = branch.code
        }
    }

    // Count transactions for today with this branch code
    const todayStart = new Date(date.setHours(0, 0, 0, 0))
    const todayEnd = new Date(date.setHours(23, 59, 59, 999))

    const todayTransactions = await db
        .select({ count: sql`count(*)` })
        .from(transactions)
        .where(sql`created_at >= ${todayStart} AND created_at <= ${todayEnd}`)

    const sequence = (todayTransactions[0]?.count ?? 0) + 1

    return `${branchCode}-${dateStr}-${sequence.toString().padStart(3, '0')}`
}
```

**Step 2: Import sql from drizzle-orm**

Add to imports:

```typescript
import { sql } from 'drizzle-orm'
```

**Step 3: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "feat(transactions): add branch support to transaction creation"
```

---

## Part 4: Branch UI Components

### Task 10: Create Branch Selector Component

**Files:**
- Create: `components/ui/branch-selector.tsx`

**Step 1: Create branch selector component**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { getBranches } from '@/server/actions/branches'
import { Branch } from '@/utils/types/branch'
import { Building2, ChevronDown } from 'lucide-react'

interface BranchSelectorProps {
    value?: string | null
    onChange: (branchId: string | null) => void
    placeholder?: string
    disabled?: boolean
    className?: string
}

export function BranchSelector({
    value,
    onChange,
    placeholder = 'Select branch',
    disabled = false,
    className = '',
}: BranchSelectorProps) {
    const [branches, setBranches] = useState<Branch[]>([])
    const [isOpen, setIsOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchBranches() {
            setLoading(true)
            const result = await getBranches()
            if (result.error) {
                setError(result.error)
            } else {
                setBranches(result.data)
            }
            setLoading(false)
        }
        fetchBranches()
    }, [])

    const selectedBranch = branches.find(b => b.id === value)

    if (loading) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg ${className}`}>
                <Building2 className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-500">Loading branches...</span>
            </div>
        )
    }

    if (error) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-red-900 rounded-lg ${className}`}>
                <Building2 className="w-4 h-4 text-red-500" />
                <span className="text-red-400">{error}</span>
            </div>
        )
    }

    return (
        <div className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className="flex items-center justify-between w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-zinc-400" />
                    <span className={selectedBranch ? 'text-white' : 'text-zinc-500'}>
                        {selectedBranch ? `${selectedBranch.name} (${selectedBranch.city})` : placeholder}
                    </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {branches.length === 0 ? (
                        <div className="px-3 py-2 text-zinc-500 text-sm">No branches available</div>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    onChange(null)
                                    setIsOpen(false)
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800 text-zinc-400"
                            >
                                No branch (Shop Sale)
                            </button>
                            {branches.map((branch) => (
                                <button
                                    key={branch.id}
                                    type="button"
                                    onClick={() => {
                                        onChange(branch.id)
                                        setIsOpen(false)
                                    }}
                                    className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-800 ${
                                        value === branch.id ? 'bg-zinc-800 text-white' : 'text-zinc-300'
                                    }`}
                                >
                                    <div className="font-medium">{branch.name}</div>
                                    <div className="text-zinc-500 text-xs">{branch.city} • {branch.code}</div>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
```

**Step 2: Commit**

```bash
git add components/ui/branch-selector.tsx
git commit -m "feat(ui): create branch selector component"
```

---

### Task11: Create Branch Admin Page

**Files:**
- Create: `app/(app)/admin/branches/page.tsx`
- Create: `app/(app)/admin/branches/branch-form.tsx`

**Step 1: Create branch admin page**

Create `app/(app)/admin/branches/page.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { getAllBranches, createBranch, updateBranch, deleteBranch } from '@/server/actions/branches'
import { Branch, CreateBranchPayload, UpdateBranchPayload } from '@/utils/types/branch'
import { getCurrentUser, canManageBranches } from '@/utils/auth/permissions'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Pencil, Trash2 } from 'lucide-react'
import { BranchForm } from './branch-form'

export default function BranchesAdminPage() {
    const [branches, setBranches] = useState<Branch[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [canManage, setCanManage] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
    const router = useRouter()

    useEffect(() => {
        async function checkAccess() {
            const user = await getCurrentUser()
            if (!user) {
                router.push('/auth/login')
                return
            }

            const manageAccess = await canManageBranches(user)
            setCanManage(manageAccess)

            const result = await getAllBranches()
            if (result.error) {
                setError(result.error)
            } else {
                setBranches(result.data)
            }
            setLoading(false)
        }
        checkAccess()
    }, [router])

    const handleCreate = async (payload: CreateBranchPayload) => {
        const result = await createBranch(payload)
        if (result.error) {
            setError(result.error)
            return false
        }
        if (result.data) {
            setBranches([...branches, result.data])
        }
        setShowForm(false)
        return true
    }

    const handleUpdate = async (payload: UpdateBranchPayload) => {
        const result = await updateBranch(payload)
        if (result.error) {
            setError(result.error)
            return false
        }
        if (result.data) {
            setBranches(branches.map(b => b.id === result.data!.id ? result.data! : b))
        }
        setEditingBranch(null)
        return true
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to deactivate this branch?')) return

        const result = await deleteBranch(id)
        if (result.error) {
            setError(result.error)
            return
        }
        setBranches(branches.map(b => b.id === id ? { ...b, is_active: false } : b))
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-zinc-400">Loading...</div>
            </div>
        )
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Building2 className="w-6 h-6 text-blue-500" />
                    <h1 className="text-2xl font-bold">Branch Management</h1>
                </div>
                {canManage && (
                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white"
                    >
                        <Plus className="w-4 h-4" />
                        Add Branch
                    </button>
                )}
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-900/50 border border-red-800 rounded-lg text-red-400">
                    {error}
                </div>
            )}

            {!canManage && (
                <div className="mb-4 p-4 bg-yellow-900/50 border border-yellow-800 rounded-lg text-yellow-400">
                    You have read-only access. Only IT administrators can manage branches.
                </div>
            )}

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full">
                    <thead className="bg-zinc-800">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">Name</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">Code</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">City</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">Status</th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-zinc-400">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                        {branches.map((branch) => (
                            <tr key={branch.id} className="hover:bg-zinc-800/50">
                                <td className="px-4 py-3">
                                    <div className="font-medium text-white">{branch.name}</div>
                                    {branch.address && (
                                        <div className="text-sm text-zinc-500">{branch.address}</div>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-zinc-300">{branch.code}</td>
                                <td className="px-4 py-3 text-zinc-300">{branch.city}</td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded text-xs ${
                                        branch.is_active
                                            ? 'bg-green-900/50 text-green-400'
                                            : 'bg-red-900/50 text-red-400'
                                    }`}>
                                        {branch.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {canManage && (
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setEditingBranch(branch)}
                                                className="p-2 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(branch.id)}
                                                className="p-2 hover:bg-red-900/50 rounded-lg text-zinc-400 hover:text-red-400"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showForm && (
                <BranchForm
                    onSubmit={handleCreate}
                    onClose={() => setShowForm(false)}
                />
            )}

            {editingBranch && (
                <BranchForm
                    branch={editingBranch}
                    onSubmit={(payload) => handleUpdate({ ...payload, id: editingBranch.id })}
                    onClose={() => setEditingBranch(null)}
                />
            )}
        </div>
    )
}
```

**Step 2: Create branch form component**

Create `app/(app)/admin/branches/branch-form.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Branch, CreateBranchPayload, UpdateBranchPayload } from '@/utils/types/branch'
import { X } from 'lucide-react'

interface BranchFormProps {
    branch?: Branch
    onSubmit: (payload: CreateBranchPayload | UpdateBranchPayload) => Promise<boolean>
    onClose: () => void
}

export function BranchForm({ branch, onSubmit, onClose }: BranchFormProps) {
    const [name, setName] = useState(branch?.name ?? '')
    const [code, setCode] = useState(branch?.code ?? '')
    const [city, setCity] = useState(branch?.city ?? '')
    const [address, setAddress] = useState(branch?.address ?? '')
    const [phone, setPhone] = useState(branch?.phone ?? '')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const payload = branch
            ? { name, code, city, address: address || null, phone: phone || null }
            : { name, code, city, address: address || undefined, phone: phone || undefined }

        const success = await onSubmit(payload as CreateBranchPayload)
        setLoading(false)

        if (success) {
            onClose()
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-md">
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                    <h2 className="text-lg font-semibold">
                        {branch ? 'Edit Branch' : 'Add New Branch'}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-900/50 border border-red-800 rounded text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">
                            Branch Name *
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., Crossroads Branch"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">
                            Branch Code *
                        </label>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., CEB-CR"
                            maxLength={10}
                            required
                        />
                        <p className="text-xs text-zinc-500 mt-1">Unique identifier (max 10 chars)</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">
                            City*
                        </label>
                        <input
                            type="text"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., Cebu"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">
                            Address
                        </label>
                        <textarea
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Full address"
                            rows={2}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">
                            Phone
                        </label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Contact number"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
```

**Step 3: Commit**

```bash
git add "app/(app)/admin/branches/page.tsx" "app/(app)/admin/branches/branch-form.tsx"
git commit -m "feat(ui): add branch admin management page"
```

---

### Task 12: Add Branch Filter to Transactions/Reports

**Files:**
- Modify: `server/actions/transactions.ts`
- Modify: Transaction listing/report components

**Step 1: Add branch filter to getTransactions**

Update `server/actions/transactions.ts` getTransactions function:

```typescript
export interface TransactionFilters {
    datePreset?: DateFilterPreset
    startDate?: string
    endDate?: string
    status?: 'COMPLETED' | 'PENDING' | 'PARTIAL' | 'VOIDED' | 'REFUNDED'
    branchId?: string // Add branch filter
}

export async function getTransactions(options?: {
    page?: number
    pageSize?: number
    filters?: TransactionFilters
}) {
    // ... implementation with branch filter support
}
```

**Step 2: Add branch info to transaction exports**

Update export utilities to include branch information.

**Step 3: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "feat(transactions): add branch filter to transaction queries"
```

---

## Part 5: Seeding, Documentation, and Verification

### Task 13: Create Branch Seeding Script

**Files:**
- Create: `scripts/seed-branches.ts`

**Step 1: Create branch seeding script**

Create `scripts/seed-branches.ts`:

```typescript
/**
 * Branch Seeding Script
 * 
 * Seeds initial branches for InkSight RDMD
 * Run with: bun run scripts/seed-branches.ts
 */

import { db } from '../server/db'
import { branches } from '../server/db/schema/branches'

async function seedBranches() {
    console.log('Seeding branches...')

    const initialBranches = [
        {
            name: 'Crossroads Branch',
            code: 'CEB-CR',
            city: 'Cebu',
            address: 'Crossroads Mall, Banilad, Cebu City',
            phone: '+63 32 123 4567',
        },
        {
            name: 'Lapu-Lapu Branch',
            code: 'CEB-LL',
            city: 'Lapu-Lapu',
            address: 'Mactan Arcade, Lapu-Lapu City',
            phone: '+63 32 234 5678',
        },
    ]

    for (const branch of initialBranches) {
        try {
            const [inserted] = await db
                .insert(branches)
                .values({
                    ...branch,
                    createdBy: 'system',
                    updatedBy: 'system',
                })
                .onConflictDoNothing()
                .returning()

            if (inserted) {
                console.log(`✓ Created branch: ${inserted.name} (${inserted.code})`)
            } else {
                console.log(`- Branchalready exists: ${branch.code}`)
            }
        } catch (error) {
            console.error(`✗ Error creating branch ${branch.code}:`, error)
        }
    }

    console.log('\nBranch seeding complete!')
}

seedBranches()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Seeding failed:', error)
        process.exit(1)
    })
```

**Step 2: Add script to package.json**

Add to `package.json` scripts:

```json
{
  "scripts": {
    "seed:branches": "bun run scripts/seed-branches.ts"
  }
}
```

**Step 3: Commit**

```bash
git add scripts/seed-branches.ts package.json
git commit -m "feat(scripts): add branch seeding script for initial data"
```

---

### Task 14: Update Environment Configuration

**Files:**
- Modify: `.env.example`

**Step 1: Add IT_ADMIN_EMAILS to environment config**

Update `.env.example`:

```bash
# -----------------------------------------------------------------------------
# IT ADMINISTRATION
# -----------------------------------------------------------------------------
# Comma-separated list of IT admin email addresses with full system access
# If not set, defaults to adrianbonpin@gmail.com only
IT_ADMIN_EMAILS="adrianbonpin@gmail.com"

# -----------------------------------------------------------------------------
# BRANCH CONFIGURATION
# -----------------------------------------------------------------------------
# Note: Branches are now managed via database (branches table)
# IT admins can add/edit/delete branches through the admin interface
# Initial branches can be seeded via: bun run seed:branches
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add IT_ADMIN_EMAILS and branch configuration to env example"
```

---

### Task 15: Add Integration Tests and Verification

**Files:**
- Create: `__tests__/branches.test.ts`
- Create: `__tests__/storage.test.ts`

**Step 1: Create branch tests**

Create `__tests__/branches.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { isITAdmin, getITAdminEmails } from '../utils/types/branch'

describe('Branch Utilities', () => {
    describe('getITAdminEmails', () => {
        it('returns default email when env not set', () => {
            const emails = getITAdminEmails()
            expect(emails).toContain('adrianbonpin@gmail.com')
        })
    })

    describe('isITAdmin', () => {
        it('returns true for IT admin email', () => {
            expect(isITAdmin('adrianbonpin@gmail.com')).toBe(true)
        })

        it('returns true for IT admin email (case insensitive)', () => {
            expect(isITAdmin('ADRIANBONPIN@GMAIL.COM')).toBe(true)
        })

        it('returns false for non-IT admin email', () => {
            expect(isITAdmin('user@example.com')).toBe(false)
        })
    })
})
```

**Step 2: Create storage tests**

Create `__tests__/storage.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'bun:test'
import { getKeyFromUrl, isStorageConfigured } from '../utils/storage'

describe('Storage Utilities', () => {
    describe('isStorageConfigured', () => {
        it('returns boolean based on environment', () => {
            const result = isStorageConfigured()
            expect(typeof result).toBe('boolean')
        })
    })

    describe('getKeyFromUrl', () => {
        it('returns null for invalid URL', () => {
            const result = getKeyFromUrl('https://example.com/file.png')
            expect(result).toBeNull()
        })

        it('returns null if storage not configured', () => {
            // If S3_PUBLIC_URL is not set
            const originalEnv = process.env.S3_PUBLIC_URL
            delete process.env.S3_PUBLIC_URL
            
            const result = getKeyFromUrl('https://s3.ranlabs.space/bucket/key')
            expect(result).toBeNull()
            
            if (originalEnv) {
                process.env.S3_PUBLIC_URL = originalEnv
            }
        })
    })
})
```

**Step 3: Run tests**

```bash
bun test
```

**Step 4: Commit**

```bash
git add __tests__/branches.test.ts __tests__/storage.test.ts
git commit -m "test: add branch and storage utility tests"
```

---

## Summary

This implementation plan covers:

1. **Branch System (Tasks 1-6)**
   - Database schema with `branches` table
   - TypeScript types and utilities
   - Access control with IT admin emails
   - Branch references in transactions, appointments, and inventory

2. **S3 Integration Refactoring (Tasks 7-9)**
   - Improved error handling and validation
   - StorageError custom error class
   - Health check endpoint
   - Better configuration management

3. **UI Components (Tasks 10-12)**
   - Branch selector component for forms
   - Admin page for branch management
   - Branch filtering in transactions/reports

4. **Setup & Testing (Tasks 13-15)**
   - Branch seeding script
   - Environment configuration
   - Integration tests

### Post-Implementation Checklist

- [ ] Run database migrations
- [ ] Seed initial branches
- [ ] Configure IT_ADMIN_EMAILS environment variable
- [ ] Test branch creation/editing with IT admin account
- [ ] Verify S3 uploads work with RustFS
- [ ] Check storage health endpoint: `/api/health/storage`
- [ ] Update any existing transaction/appointment forms to include branch selector
- [ ] Verify branch filtering works in reports