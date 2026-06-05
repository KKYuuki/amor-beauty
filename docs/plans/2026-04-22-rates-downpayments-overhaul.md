# Rates, Rate Levels & Downpayments Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generalize "Artist Rates" to "Rates" with dynamic rate levels, add flexible downpayments with deferred staff assignment, and reflect staff/shop cuts in accounting.

**Architecture:** DB-native overhaul. New `rate_levels` and `downpayments` tables. Rename `artist_*` → `staff_*` across types, DB columns, and UI. Downpayments support FLAT_FEE/PERCENTAGE/CUSTOM types with deferred assignment and PER_PAYMENT/ON_COMPLETION split modes. Accounting gets inline cut display + payroll breakdown report.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Supabase (PostgreSQL + Drizzle ORM), Tailwind CSS 4

**Design Spec:** `docs/superpowers/specs/2026-04-22-rates-downpayments-overhaul-design.md`

---

## Phase 1: Database Schema & Types

### Task 1: Create `rate_levels` DB Table

**Files:**
- Modify: `server/db/schema/payroll.ts`

**Step 1: Add rate_levels table definition**

In `server/db/schema/payroll.ts`, add before the `payrollStaffRate` table definition (before line 9):

```ts
export const rateLevels = pgTable('rate_levels', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 50 }).notNull(),
    slug: varchar('slug', { length: 50 }).notNull().unique(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => authUser.id),
})
```

**Step 2: Add rate_levels relations**

After the table definition, add:

```ts
export const rateLevelsRelations = relations(rateLevels, ({ one }) => ({
    createdByUser: one(authUser, {
        fields: [rateLevels.createdBy],
        references: [authUser.id],
    }),
}))
```

**Step 3: Update payrollStaffRate table**

Replace the `artistLevel` column (line 20) with:

```ts
rateLevelId: uuid('rate_level_id').references(() => rateLevels.id),
```

Remove the comment on line 21.

**Step 4: Update the unique index**

Replace lines 41-44 (the compound unique index) with:

```ts
rateLevelServiceClientIdx: index('idx_payroll_rate_level_service_client').on(
    table.serviceType,
    table.clientType,
    table.rateLevelId,
),
```

**Step 5: Update payrollStaffRate relations**

In the `payrollStaffRateRelations` (around line 192), add a relation to rateLevels:

```ts
rateLevel: one(rateLevels, {
    fields: [payrollStaffRate.rateLevelId],
    references: [rateLevels.id],
}),
```

**Step 6: Rename artistLevel references in payrollEntry**

In `payrollEntry` table, rename `artistCut` column to `staffCut` and `artistRateSnapshot` to `staffRateSnapshot`:

```ts
staffCut: numeric('staff_cut', { precision: 10, scale: 2 }).notNull(),
// ... (after shopRateSnapshot)
staffRateSnapshot: jsonb('staff_rate_snapshot').$type<{
    percentage: number
    fixedAmount?: number
    serviceType?: string
    clientType?: string
    rateLevelId?: string
}>(),
```

Add `clientType` and `rateLevelId` to the snapshot type.

**Step 7: Commit**

```bash
git add server/db/schema/payroll.ts
git commit -m "feat(db): add rate_levels table, rename artist columns to staff"
```

---

### Task 2: Create `downpayments` DB Table & Transaction Status Updates

**Files:**
- Modify: `server/db/schema/payroll.ts`
- Modify: `server/db/schema/transactions.ts`

**Step 1: Add downpayments table in payroll.ts**

After the `rateLevels` table definition, add:

```ts
export const downpayments = pgTable('downpayments', {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id').notNull().references(() => transactions.id),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    downpaymentType: varchar('downpayment_type', { length: 20 }).notNull(),
    percentageRate: numeric('percentage_rate', { precision: 5, scale: 2 }),
    estimatedTotal: numeric('estimated_total', { precision: 10, scale: 2 }),
    isSettled: boolean('is_settled').notNull().default(false),
    staffId: uuid('staff_id').references(() => authUser.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    payrollSplitMode: varchar('payroll_split_mode', { length: 20 }).notNull().default('PER_PAYMENT'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => authUser.id),
})
```

**Step 2: Add downpayments relations**

```ts
export const downpaymentsRelations = relations(downpayments, ({ one }) => ({
    transaction: one(transactions, {
        fields: [downpayments.transactionId],
        references: [transactions.id],
    }),
    staff: one(authUser, {
        fields: [downpayments.staffId],
        references: [authUser.id],
    }),
    createdByUser: one(authUser, {
        fields: [downpayments.createdBy],
        references: [authUser.id],
    }),
}))
```

**Step 3: Update transaction status type in transactions.ts**

Add new statuses to the transaction schema (around line 8 in `utils/types/transactions.ts`):

Change:
```ts
TransactionStatus = 'COMPLETED' | 'PENDING' | 'PARTIAL' | 'VOIDED' | 'REFUNDED'
```

To:
```ts
TransactionStatus = 'COMPLETED' | 'PENDING' | 'PARTIAL' | 'VOIDED' | 'REFUNDED' | 'DOWNPAYMENT_PENDING' | 'DOWNPAYMENT_ASSIGNED'
```

**Step 4: Commit**

```bash
git add server/db/schema/payroll.ts server/db/schema/transactions.ts utils/types/transactions.ts
git commit -m "feat(db): add downpayments table and new transaction statuses"
```

---

### Task 3: Update TypeScript Types — Rename Artist → Staff & Add New Types

**Files:**
- Modify: `utils/types/payroll.ts`
- Modify: `utils/types/auth.ts`
- Modify: `utils/types/transactions.ts`

**Step 1: Update `utils/types/payroll.ts`**

Replace the `ArtistLevel` type (line 16):
```ts
// OLD: export type ArtistLevel = 'NORMAL' | 'HEAD_ARTIST' | 'OWNER'
// NEW:
export type RateLevel = string // Will be a UUID referencing rate_levels table
export type RateLevelName = string // Display name from rate_levels
export type DownpaymentType = 'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM'
export type PayrollSplitMode = 'PER_PAYMENT' | 'ON_COMPLETION'
```

Update `PayrollStaffRate` interface (lines 27-41):
```ts
export interface PayrollStaffRate {
    id: string
    created_at: Date
    rate_name: string
    service_type: ServiceType
    client_type: ClientType
    rate_level_id: string      // was: artist_level: ArtistLevel
    rate_level_name?: string   // display name from rate_levels
    shop_percentage: number
    staff_percentage: number   // was: artist_percentage
    payment_mode: 'PERCENTAGE' | 'FIXED'
    fixed_amount: number
    is_active: boolean
    updated_at?: Date
    updated_by?: string
}
```

Rename `ArtistRateSnapshot` to `StaffRateSnapshot` and add fields:
```ts
export interface StaffRateSnapshot {
    percentage: number
    fixedAmount?: number
    serviceType?: string
    clientType?: string      // NEW
    rateLevelId?: string     // NEW
    rateLevelName?: string   // NEW
}
```

Update `PayrollEntry` interface — rename `artist_cut` to `staff_cut`, update `staff` field:
```ts
// In PayrollEntry:
staff_cut: number           // was: artist_cut
staff_rate_snapshot?: StaffRateSnapshot  // was: artist_rate_snapshot
// In staff sub-object:
rate_level_id?: string      // was: artist_level
rate_level_name?: string    // NEW
```

Rename `ArtistEarningsSummary` to `StaffEarningsSummary` and update:
```ts
export interface StaffEarningsSummary {
    staff_id: string
    staff_name: string
    rate_level_id?: string    // was: artist_level
    rate_level_name?: string  // NEW
    total_earnings: number
    total_pending: number
    total_paid: number
    entry_count: number
}
```

Add downpayment types:
```ts
export interface Downpayment {
    id: string
    transaction_id: string
    amount: number
    downpayment_type: DownpaymentType
    percentage_rate?: number
    estimated_total?: number
    is_settled: boolean
    staff_id?: string
    assigned_at?: Date
    payroll_split_mode: PayrollSplitMode
    notes?: string
    created_at: Date
    updated_at?: Date
    created_by?: string
}

export interface CreateDownpaymentPayload {
    transaction_id: string
    amount: number
    downpayment_type: DownpaymentType
    percentage_rate?: number
    estimated_total?: number
    staff_id?: string
    payroll_split_mode: PayrollSplitMode
    notes?: string
}

export interface AssignStaffToDownpaymentPayload {
    downpayment_id: string
    staff_id: string
    payroll_split_mode: PayrollSplitMode
}
```

Add `RateLevel` CRUD interface:
```ts
export interface RateLevelItem {
    id: string
    name: string
    slug: string
    is_active: boolean
    sort_order: number
    created_at: Date
    updated_at?: Date
    created_by?: string
}

export interface CreateRateLevelPayload {
    name: string
    sort_order?: number
}

export interface UpdateRateLevelPayload {
    id: string
    name?: string
    is_active?: boolean
    sort_order?: number
}
```

**Step 2: Update `utils/types/auth.ts`**

Remove `ArtistLevelType` (line 2). Update `UserProfile`:

```ts
// Remove: export type ArtistLevelType = "NORMAL" | "HEAD_ARTIST" | "OWNER"
// Add:
export { type RateLevel as RateLevelId } from './payroll'

// In UserProfile, replace:
// artist_level?: ArtistLevelType
// With:
rate_level_id?: string      // UUID reference to rate_levels
rate_level_name?: string     // Display name for UI
```

**Step 3: Update `utils/types/transactions.ts`**

Add downpayment status types (as noted in Task 2).

Add to `Transaction` interface:
```ts
downpayment_id?: string   // Reference to downpayments table if this is a downpayment transaction
payroll_split_mode?: 'PER_PAYMENT' | 'ON_COMPLETION'
```

Update `CreateTransactionPayload`:
```ts
downpayment_type?: 'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM'
downpayment_percentage_rate?: number
downpayment_estimated_total?: number
payroll_split_mode?: 'PER_PAYMENT' | 'ON_COMPLETION'
```

Change the comment on `client_type` from "For calculating artist commission rates" to "For calculating staff rates".

**Step 4: Commit**

```bash
git add utils/types/payroll.ts utils/types/auth.ts utils/types/transactions.ts
git commit -m "feat(types): rename ArtistLevel to RateLevel, add downpayment types"
```

---

### Task 4: Update Auth DB Schema — Rename artistLevel → rateLevelId

**Files:**
- Modify: `server/db/schema/auth.ts`

**Step 1: Update user table in auth.ts**

Replace line 48:
```ts
// OLD: artistLevel: varchar('artist_level', { length: 50 }),
// NEW:
rateLevelId: uuid('rate_level_id').references(() => rateLevels.id),
```

Remove line 49 (`payoutPeriod` column stays).

Update the index on line 56:
```ts
// OLD: artistLevelIdx: index('idx_user_artist_level').on(table.artistLevel),
// NEW:
rateLevelIdx: index('idx_user_rate_level').on(table.rateLevelId),
```

**Step 2: Commit**

```bash
git add server/db/schema/auth.ts
git commit -m "feat(db): rename user.artistLevel to user.rateLevelId"
```

---

## Phase 2: Server Actions

### Task 5: Rate Levels CRUD Server Actions

**Files:**
- Create: `server/actions/rate-levels.ts`

**Step 1: Create rate-levels.ts with full CRUD**

```ts
'use server'

import { db } from '@/server/db'
import { rateLevels } from '@/server/db/schema/payroll'
import { eq, asc, isNull } from 'drizzle-orm'
import { createLogs } from '@/utils/logger'
import type {
    RateLevelItem,
    CreateRateLevelPayload,
    UpdateRateLevelPayload,
} from '@/utils/types/payroll'

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

export async function getRateLevels(activeOnly = false): Promise<RateLevelItem[]> {
    try {
        const query = activeOnly
            ? db.select().from(rateLevels).where(eq(rateLevels.isActive, true)).orderBy(asc(rateLevels.sortOrder))
            : db.select().from(rateLevels).orderBy(asc(rateLevels.sortOrder))
        const levels = await query
        return levels.map((level) => ({
            id: level.id,
            name: level.name,
            slug: level.slug,
            is_active: level.isActive,
            sort_order: level.sortOrder,
            created_at: level.createdAt,
            updated_at: level.updatedAt ?? undefined,
            created_by: level.createdBy ?? undefined,
        }))
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', message: `Failed to fetch rate levels: ${error}` }] })
        throw new Error('Failed to fetch rate levels')
    }
}

export async function createRateLevel(payload: CreateRateLevelPayload): Promise<RateLevelItem> {
    const slug = slugify(payload.name)
    try {
        const [newLevel] = await db.insert(rateLevels).values({
            name: payload.name,
            slug,
            sortOrder: payload.sort_order ?? 0,
        }).returning()
        return {
            id: newLevel.id,
            name: newLevel.name,
            slug: newLevel.slug,
            is_active: newLevel.isActive,
            sort_order: newLevel.sortOrder,
            created_at: newLevel.createdAt,
        }
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', message: `Failed to create rate level: ${error}` }] })
        throw new Error('Failed to create rate level')
    }
}

export async function updateRateLevel(payload: UpdateRateLevelPayload): Promise<RateLevelItem> {
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (payload.name !== undefined) {
        updates.name = payload.name
        updates.slug = slugify(payload.name)
    }
    if (payload.is_active !== undefined) updates.isActive = payload.is_active
    if (payload.sort_order !== undefined) updates.sortOrder = payload.sort_order

    try {
        const [updated] = await db.update(rateLevels).set(updates).where(eq(rateLevels.id, payload.id)).returning()
        if (!updated) throw new Error('Rate level not found')
        return {
            id: updated.id,
            name: updated.name,
            slug: updated.slug,
            is_active: updated.isActive,
            sort_order: updated.sortOrder,
            created_at: updated.createdAt,
            updated_at: updated.updatedAt ?? undefined,
        }
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', message: `Failed to update rate level: ${error}` }] })
        throw new Error('Failed to update rate level')
    }
}

export async function deactivateRateLevel(id: string): Promise<void> {
    try {
        await db.update(rateLevels).set({ isActive: false, updatedAt: new Date() }).where(eq(rateLevels.id, id))
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', message: `Failed to deactivate rate level: ${error}` }] })
        throw new Error('Failed to deactivate rate level')
    }
}

export async function deleteRateLevel(id: string): Promise<void> {
    // Only delete if no references exist
    // Check payroll_staff_rate and users tables
    const [rateRefs, userRefs] = await Promise.all([
        db.select({ id: payrollStaffRate.id }).from(payrollStaffRate).where(eq(payrollStaffRate.rateLevelId, id)).limit(1),
        db.select({ id: authUser.id }).from(authUser).where(eq(authUser.rateLevelId, id)).limit(1),
    ])
    if (rateRefs.length > 0 || userRefs.length > 0) {
        throw new Error('Cannot delete rate level: it is still referenced by rates or staff members')
    }
    try {
        await db.delete(rateLevels).where(eq(rateLevels.id, id))
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', message: `Failed to delete rate level: ${error}` }] })
        throw new Error('Failed to delete rate level')
    }
}
```

Note: This file needs proper imports for `payrollStaffRate` and `authUser` from the schema.

**Step 2: Commit**

```bash
git add server/actions/rate-levels.ts
git commit -m "feat(actions): add rate levels CRUD server actions"
```

---

### Task 6: Update Payroll Server Actions — Rate Lookup & Terminology

**Files:**
- Modify: `server/actions/payroll.ts` (2401 lines)

This is the largest file change. Key updates:

**Step 1: Update imports**

Replace `ArtistLevel` import with `RateLevel, RateLevelName` and `StaffRateSnapshot`.

**Step 2: Update `getApplicableRate()`**

Change function signature from `(serviceType, clientType, artistLevel)` to `(serviceType, clientType, rateLevelId)`.

Update the query to join with `rateLevels` table instead of matching on `artistLevel` string:

```ts
export async function getApplicableRate(
    serviceType: ServiceType,
    clientType: ClientType,
    rateLevelId: string
): Promise<PayrollStaffRate | null> {
    // Query payrollStaffRate with rateLevelId FK
    const rates = await db
        .select({
            // ... all payrollStaffRate fields
            rateLevelName: rateLevels.name,
        })
        .from(payrollStaffRate)
        .innerJoin(rateLevels, eq(payrollStaffRate.rateLevelId, rateLevels.id))
        .where(
            and(
                eq(payrollStaffRate.serviceType, serviceType),
                eq(payrollStaffRate.clientType, clientType),
                eq(payrollStaffRate.rateLevelId, rateLevelId),
                eq(payrollStaffRate.isActive, true),
            )
        )
        .limit(1)
    // ... return mapped result
}
```

**Step 3: Update `calculateAndCreatePayrollEntry()`**

Lines 630-636: Replace artist level lookup with rate level lookup:

```ts
// OLD:
const artistRecord = await dbClient
    .select({ artistLevel: user.artistLevel })
    .from(user)
    .where(eq(user.id, artistId))
    .limit(1)
const artistLevel: ArtistLevel = (artistRecord[0]?.artistLevel || 'NORMAL') as ArtistLevel

// NEW:
const staffRecord = await dbClient
    .select({ rateLevelId: user.rateLevelId })
    .from(user)
    .where(eq(user.id, artistId))
    .limit(1)
// If no rate level assigned, look up the default rate level (first active level, or "standard" slug)
let rateLevelId = staffRecord[0]?.rateLevelId
if (!rateLevelId) {
    const defaultLevels = await dbClient
        .select({ id: rateLevels.id })
        .from(rateLevels)
        .where(and(eq(rateLevels.isActive, true), eq(rateLevels.slug, 'standard')))
        .limit(1)
    rateLevelId = defaultLevels[0]?.id
    if (!rateLevelId) {
        return { success: false, error: 'No rate level assigned to staff member and no default found' }
    }
}
```

Line 638: Update rate lookup call:
```ts
const rateResult = await getApplicableRate(serviceType, clientType, rateLevelId)
```

In the payroll entry creation, update `staffRateSnapshot` to include new fields:
```ts
staffRateSnapshot: {
    percentage: rate.artist_percentage,  // will become staff_percentage
    fixedAmount: rate.fixed_amount,
    serviceType: rate.service_type,
    clientType: clientType,
    rateLevelId: rateLevelId,
    rateLevelName: rate.rate_level_name,
},
```

Rename `artistCut` to `staffCut` in the entry creation.

**Step 4: Update `createManualPayrollEntry()`**

Lines 745-751: Same pattern — replace `artistLevel` lookup with `rateLevelId`.

**Step 5: Update `getStaffRates()`**

Lines 80-112: Return `rate_level_name` alongside rate data by joining with `rateLevels`.

**Step 6: Update `getStaffPayrollSummary()`**

Lines 1628-1684: Join with `rateLevels` to get the level name instead of using `user.artistLevel`.

**Step 7: Update `createStaffRate()` and `updateStaffRate()`**

Lines 235-333: Change `artist_level` parameter to `rate_level_id`. Update validation to check `rateLevelId` uniqueness with `(serviceType, clientType, rateLevelId)`.

**Step 8: Update all remaining references**

Search for `artist` (case-insensitive) throughout the file and rename:
- `artistLevel` → `rateLevelId`
- `artist_cut` → `staff_cut`
- `artist_percentage` → `staff_percentage`
- `ArtistLevel` type → `string` (UUID)
- `ArtistEarningsSummary` → `StaffEarningsSummary`

**Step 9: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "feat(actions): update payroll rate lookup to use rate_level_id, rename artist references"
```

---

### Task 7: Downpayments Server Actions

**Files:**
- Create: `server/actions/downpayments.ts`

**Step 1: Create downpayments.ts with full CRUD**

```ts
'use server'

import { db } from '@/server/db'
import { downpayments, transactions } from '@/server/db/schema/payroll'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { createLogs } from '@/utils/logger'
import type {
    Downpayment,
    CreateDownpaymentPayload,
    AssignStaffToDownpaymentPayload,
} from '@/utils/types/payroll'
import { calculateAndCreatePayrollEntry } from './payroll'

export async function getDownpayments(filters?: {
    isSettled?: boolean
    unassignedOnly?: boolean
    staffId?: string
}): Promise<Downpayment[]> {
    try {
        let query = db.select().from(downpayments)

        if (filters?.unassignedOnly) {
            query = query.where(isNull(downpayments.staffId))
        }
        if (filters?.staffId) {
            query = query.where(eq(downpayments.staffId, filters.staffId))
        }
        if (filters?.isSettled !== undefined) {
            query = query.where(eq(downpayments.isSettled, filters.isSettled))
        }

        const results = await query.orderBy(desc(downpayments.createdAt))
        return results.map(mapDownpayment)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', message: `Failed to fetch downpayments: ${error}` }] })
        throw new Error('Failed to fetch downpayments')
    }
}

export async function createDownpayment(payload: CreateDownpaymentPayload): Promise<Downpayment> {
    // Validate amount based on type
    if (payload.downpayment_type === 'PERCENTAGE' && !payload.percentage_rate) {
        throw new Error('Percentage rate is required for PERCENTAGE downpayments')
    }

    let amount = payload.amount
    if (payload.downpayment_type === 'PERCENTAGE' && payload.estimated_total && payload.percentage_rate) {
        amount = Number(payload.estimated_total) * Number(payload.percentage_rate) / 100
    }

    try {
        const [newDownpayment] = await db.insert(downpayments).values({
            transactionId: payload.transaction_id,
            amount: String(amount),
            downpaymentType: payload.downpayment_type,
            percentageRate: payload.percentage_rate ? String(payload.percentage_rate) : null,
            estimatedTotal: payload.estimated_total ? String(payload.estimated_total) : null,
            staffId: payload.staff_id ?? null,
            payrollSplitMode: payload.payroll_split_mode,
            notes: payload.notes ?? null,
        }).returning()

        // If staff is assigned and split mode is PER_PAYMENT, create payroll entry immediately
        if (payload.staff_id && payload.payroll_split_mode === 'PER_PAYMENT') {
            await createPayrollForDownpayment(newDownpayment.id, payload)
        }

        return mapDownpayment(newDownpayment)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', message: `Failed to create downpayment: ${error}` }] })
        throw new Error('Failed to create downpayment')
    }
}

export async function assignStaffToDownpayment(payload: AssignStaffToDownpaymentPayload): Promise<Downpayment> {
    try {
        const [updated] = await db
            .update(downpayments)
            .set({
                staffId: payload.staff_id,
                assignedAt: new Date(),
                payrollSplitMode: payload.payroll_split_mode,
                updatedAt: new Date(),
            })
            .where(eq(downpayments.id, payload.downpayment_id))
            .returning()

        if (!updated) throw new Error('Downpayment not found')

        // Update transaction status from DOWNPAYMENT_PENDING to DOWNPAYMENT_ASSIGNED
        await db
            .update(transactions)
            .set({ status: 'DOWNPAYMENT_ASSIGNED' })
            .where(eq(transactions.id, updated.transactionId))

        // If PER_PAYMENT mode, create payroll entry for this downpayment
        if (payload.payroll_split_mode === 'PER_PAYMENT') {
            await createPayrollForDownpayment(updated.id, mapDownpayment(updated))
        }

        return mapDownpayment(updated)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', message: `Failed to assign staff to downpayment: ${error}` }] })
        throw new Error('Failed to assign staff')
    }
}

export async function settleDownpayment(downpaymentId: string): Promise<void> {
    try {
        await db
            .update(downpayments)
            .set({ isSettled: true, updatedAt: new Date() })
            .where(eq(downpayments.id, downpaymentId))
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', message: `Failed to settle downpayment: ${error}` }] })
        throw new Error('Failed to settle downpayment')
    }
}

async function createPayrollForDownpayment(downpaymentId: string, downpayment: Downpayment | { staff_id?: string }) {
    // Implementation depends on transaction details
    // Will create payroll entry using calculateAndCreatePayrollEntry
}

function mapDownpayment(row: Record<string, unknown>): Downpayment {
    return {
        id: row.id as string,
        transaction_id: row.transactionId as string,
        amount: Number(row.amount),
        downpayment_type: row.downpaymentType as Downpayment['downpayment_type'],
        percentage_rate: row.percentageRate ? Number(row.percentageRate) : undefined,
        estimated_total: row.estimatedTotal ? Number(row.estimatedTotal) : undefined,
        is_settled: row.isSettled as boolean,
        staff_id: row.staffId as string | undefined,
        assigned_at: row.assignedAt as Date | undefined,
        payroll_split_mode: row.payrollSplitMode as Downpayment['payroll_split_mode'],
        notes: row.notes as string | undefined,
        created_at: row.createdAt as Date,
        updated_at: row.updatedAt as Date | undefined,
        created_by: row.createdBy as string | undefined,
    }
}
```

**Step 2: Commit**

```bash
git add server/actions/downpayments.ts
git commit -m "feat(actions): add downpayments CRUD server actions"
```

---

### Task 8: Update Zod Schemas

**Files:**
- Modify: `server/actions/payroll-schemas.ts`

**Step 1: Replace ArtistLevelSchema with RateLevelSchema**

```ts
// Remove: const ArtistLevelSchema = z.enum(['NORMAL', 'HEAD_ARTIST', 'OWNER'])
// Add:
const RateLevelIdSchema = z.string().uuid('Invalid rate level ID')
const DownpaymentTypeSchema = z.enum(['FLAT_FEE', 'PERCENTAGE', 'CUSTOM'])
const PayrollSplitModeSchema = z.enum(['PER_PAYMENT', 'ON_COMPLETION'])
```

**Step 2: Update CreateStaffRateSchema**

Replace `artist_level: ArtistLevelSchema` with `rate_level_id: RateLevelIdSchema`.

**Step 3: Update CalculatePayrollSchema**

Replace `artist_level: ArtistLevelSchema` with `rate_level_id: RateLevelIdSchema`.

**Step 4: Add DownpaymentSchemas**

```ts
const CreateDownpaymentSchema = z.object({
    transaction_id: z.string().uuid(),
    amount: z.number().positive(),
    downpayment_type: DownpaymentTypeSchema,
    percentage_rate: z.number().min(0).max(100).optional(),
    estimated_total: z.number().positive().optional(),
    staff_id: z.string().uuid().optional(),
    payroll_split_mode: PayrollSplitModeSchema,
    notes: z.string().optional(),
})

const AssignStaffToDownpaymentSchema = z.object({
    downpayment_id: z.string().uuid(),
    staff_id: z.string().uuid(),
    payroll_split_mode: PayrollSplitModeSchema,
})
```

**Step 5: Commit**

```bash
git add server/actions/payroll-schemas.ts
git commit -m "feat(schemas): replace ArtistLevel with RateLevel schemas, add downpayment schemas"
```

---

### Task 9: Update Transaction Actions — Downpayment Integration

**Files:**
- Modify: `server/actions/transactions.ts`

**Step 1: Update transaction creation for downpayment support**

When `payload.downpayment_type` is provided:
- Create the downpayment record after transaction creation
- Set transaction status to `DOWNPAYMENT_PENDING` (if no staff assigned) or `DOWNPAYMENT_ASSIGNED` (if staff assigned)

**Step 2: Update `addTransactionPayment()`**

When a partial payment settles a downpayment transaction:
- If `payroll_split_mode === 'ON_COMPLETION'`: Create a single payroll entry for the full amount
- Mark the downpayment as `is_settled = true`

**Step 3: Update comment references**

Change "For calculating artist commission rates" to "For calculating staff rates".

**Step 4: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "feat(actions): add downpayment support to transaction creation and payments"
```

---

### Task 10: Update Profile Actions

**Files:**
- Modify: `server/actions/profile.ts`

**Step 1: Replace artist_level with rate_level_id**

Line 45: Replace `artist_level: z.enum(['NORMAL', 'HEAD_ARTIST', 'OWNER']).optional()` with:
```ts
rate_level_id: z.string().uuid().optional()
```

Line 70: Replace `artist_level: dbUser.artistLevel as ArtistLevelType | undefined` with:
```ts
rate_level_id: dbUser.rateLevelId ?? undefined,
// Look up the rate level name separately if needed
```

Lines 347, 373: Replace `artist_level` → `rate_level_id`, `artistLevel` → `rateLevelId`.

Lines 773-776: Replace default artist level assignment:
```ts
// OLD: if (role === "artist") { updateData.artistLevel = "NORMAL" }
// NEW:
if (role === "artist" && !updateData.rateLevelId) {
    // Assign default rate level (slug: "standard")
    const defaultLevel = await db
        .select({ id: rateLevels.id })
        .from(rateLevels)
        .where(and(eq(rateLevels.isActive, true), eq(rateLevels.slug, 'standard')))
        .limit(1)
    if (defaultLevel[0]) {
        updateData.rateLevelId = defaultLevel[0].id
    }
}
```

Lines 192-199: Update role switch to use `rate_level_id` instead of `artist_level`.

**Step 2: Commit**

```bash
git add server/actions/profile.ts
git commit -m "feat(actions): update profile to use rate_level_id instead of artist_level"
```

---

### Task 11: Update Metrics Actions

**Files:**
- Modify: `server/actions/metrics.ts`

**Step 1: Update `getArtistLeaderboard()`**

Lines 735-826: 
- Rename `ArtistLeaderboardEntry` type to `StaffLeaderboardEntry`
- Replace `artist_level?: ArtistLevel` with `rate_level_id?: string, rate_level_name?: string`
- Lines 792-806: Join with `rateLevels` instead of using `user.artistLevel`
- Line 812: Use `entry.rateLevelName` for display

**Step 2: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "feat(actions): update metrics to use rate_level_id and StaffEarningsSummary"
```

---

### Task 12: Update Payroll Disbursements Actions

**Files:**
- Modify: `server/actions/payroll-disbursements.ts`

**Step 1: Update any `artistCut`/`artistRateSnapshot` references**

Search for and replace all `artist` references in the context of rates/levels:
- `artist_cut` → `staff_cut`
- `artist_rate_snapshot` → `staff_rate_snapshot`
- `artist_percentage` → `staff_percentage`

**Step 2: Commit**

```bash
git add server/actions/payroll-disbursements.ts
git commit -m "feat(actions): rename artist references to staff in payroll disbursements"
```

---

## Phase 3: UI Components

### Task 13: Payroll Page — Rate Levels Tab & Terminology Updates

**Files:**
- Modify: `app/payroll/payrollPage.tsx` (1640 lines)

**Step 1: Replace `ARTIST_LEVEL_LABELS` with dynamic rate levels**

Remove lines 80-84 (hardcoded `ARTIST_LEVEL_LABELS`). Add state for rate levels:
```tsx
const [rateLevels, setRateLevels] = useState<RateLevelItem[]>([])
```

Fetch rate levels on mount:
```tsx
useEffect(() => {
    getRateLevels(true).then(setRateLevels).catch(console.error)
}, [])
```

**Step 2: Update RateTable subcomponent**

In the `RateTable` (lines 1279-1340), replace the "Artist Level" column header with "Rate Level". Replace the display logic to use `rate_level_name` from the joined data instead of `ARTIST_LEVEL_LABELS[rate.artist_level]`.

**Step 3: Update handleCreateRate()**

Lines 304-331: Replace `artist_level` with `rate_level_id` in the create rate call.

**Step 4: Update dashboard tab**

Lines 928-933: Replace `staff.artist_level` display with `staff.rate_level_name`. Remove the `ARTIST_LEVEL_LABELS` mapping.

**Step 5: Update tab labels**

Change "Artist Rates" label in the Rates tab to just "Rates".

**Step 6: Update column headers throughout**

- "Artist Level" → "Rate Level"
- "Artist %" → "Staff %"
- "Artist Cut" → "Staff Cut"

**Step 7: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "feat(ui): update payroll page with dynamic rate levels and terminology"
```

---

### Task 14: Create & Edit Rate Modals

**Files:**
- Modify: `app/payroll/modals/CreateRateModal.tsx` (184 lines)
- Modify: `app/payroll/modals/EditRateModal.tsx` (183 lines)

**Step 1: Update CreateRateModal.tsx**

Replace the hardcoded Artist Level dropdown (lines 101-112):
```tsx
// OLD:
<select value={artistLevel} onChange={(e) => setArtistLevel(e.target.value)}>
    <option value='NORMAL'>Normal Artist</option>
    <option value='HEAD_ARTIST'>Head Artist</option>
    <option value='OWNER'>Owner</option>
</select>

// NEW:
<select value={rateLevelId} onChange={(e) => setRateLevelId(e.target.value)}>
    {rateLevels.map((level) => (
        <option key={level.id} value={level.id}>{level.name}</option>
    ))}
</select>
```

Add `rateLevels` as a prop and update state:
- Replace `artistLevel` state with `rateLevelId` state
- Update `handleSave()` to use `rate_level_id` instead of `artist_level`
- Replace `rateName` generation to use the selected rate level's name

**Step 2: Update EditRateModal.tsx**

- Replace "Artist %" label with "Staff %"
- The rate level is not editable in this modal (unchanged behavior)
- Update any `artist_percentage` display labels to `staff_percentage`

**Step 3: Commit**

```bash
git add app/payroll/modals/CreateRateModal.tsx app/payroll/modals/EditRateModal.tsx
git commit -m "feat(ui): update rate modals with dynamic rate levels and terminology"
```

---

### Task 15: Payroll Page — Downpayments Tab

**Files:**
- Modify: `app/payroll/payrollPage.tsx`
- Create: `app/payroll/modals/CreateDownpaymentModal.tsx`
- Create: `app/payroll/modals/AssignStaffModal.tsx`

**Step 1: Add "downpayments" to TabType**

```ts
type TabType = "dashboard" | "requests" | "rates" | "deductions" | "scheduled" | "downpayments"
```

**Step 2: Add DownpaymentsTab component**

Create a new tab section that shows:
- Summary cards: Total Downpayments, Unassigned, Settled
- Table of downpayments with columns: Transaction, Amount, Type, Staff, Split Mode, Status, Actions
- Filter by: status (unassigned, assigned, settled), date range, staff member
- "Assign Staff" button for unassigned downpayments

**Step 3: Create CreateDownpaymentModal.tsx**

Modal with:
- Transaction selector (link to existing transaction)
- Downpayment type selector (FLAT_FEE, PERCENTAGE, CUSTOM)
- Amount input (for FLAT_FEE and CUSTOM)
- Percentage rate input (for PERCENTAGE, auto-calculates amount from estimated total)
- Estimated total input (for PERCENTAGE)
- Staff selector (optional, can be deferred)
- Payroll split mode selector (PER_PAYMENT, ON_COMPLETION)
- Notes textarea

**Step 4: Create AssignStaffModal.tsx**

Modal to assign staff to an unassigned downpayment:
- Staff member dropdown
- Payroll split mode selector
- Confirm button

**Step 5: Commit**

```bash
git add app/payroll/payrollPage.tsx app/payroll/modals/CreateDownpaymentModal.tsx app/payroll/modals/AssignStaffModal.tsx
git commit -m "feat(ui): add downpayments tab and modals to payroll page"
```

---

### Task 16: Accounting Page — Inline Cuts & Payroll Breakdown Report

**Files:**
- Modify: `app/accounting/accountingPage.tsx` (1011 lines)

**Step 1: Add Staff Cut and Shop Cut columns to ledger table**

After the existing columns (around line 678-691), add:
- `Staff Cut`: Shows staff_cut from linked payroll_entry (or "—" if no payroll entry)
- `Shop Cut`: Shows shop_cut from linked payroll_entry (or "—" if no payroll entry)
- `Net Amount`: Calculated as gross - adjustments

Update `PAGE_COLUMNS` constant accordingly.

**Step 2: Add Payroll Breakdown section**

Add a collapsible section below the main ledger table that shows a payroll breakdown report:

- Date range filter
- Staff member filter
- Rate level filter
- Service type filter
- Table with: Transaction ID, Service Type, Staff Member, Rate Level, Gross Amount, Staff Cut, Shop Cut, Split Mode, Payment Status
- Export buttons (CSV, XLSX, PDF) using the existing export engine

Fetch payroll entries joined with rate_levels for this section.

**Step 3: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "feat(ui): add staff/shop cut columns and payroll breakdown report to accounting"
```

---

### Task 17: Sales Context & Checkout — Downpayment Integration

**Files:**
- Modify: `components/sales/context/SalesContext.tsx` (1267 lines)
- Modify: `components/sales/modals/CheckoutModal.tsx` (325 lines)

**Step 1: Add downpayment state to SalesContext**

```tsx
const [downpaymentType, setDownpaymentType] = useState<'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM' | null>(null)
const [downpaymentAmount, setDownpaymentAmount] = useState<number>(0)
const [downpaymentPercentageRate, setDownpaymentPercentageRate] = useState<number>(0)
const [downpaymentEstimatedTotal, setDownpaymentEstimatedTotal] = useState<number>(0)
const [payrollSplitMode, setPayrollSplitMode] = useState<'PER_PAYMENT' | 'ON_COMPLETION'>('PER_PAYMENT')
```

**Step 2: Pass downpayment fields in CreateTransactionPayload**

Update `handleCheckout()` to include:
```ts
downpayment_type: downpaymentType ?? undefined,
downpayment_percentage_rate: downpaymentPercentageRate || undefined,
downpayment_estimated_total: downpaymentEstimatedTotal || undefined,
payroll_split_mode: payrollSplitMode,
```

**Step 3: Update CheckoutModal with Downpayment section**

Add below the Client Type selector (after line 215):
- "Add Downpayment" toggle
- When enabled: type selector (FLAT_FEE, PERCENTAGE, CUSTOM), amount input, percentage input, estimated total input
- Payroll split mode selector (PER_PAYMENT, ON_COMPLETION)
- Show estimated staff/shop cut preview

**Step 4: Update client_type comment**

Change "For calculating artist commission rates" to "For calculating staff rates".

**Step 5: Commit**

```bash
git add components/sales/context/SalesContext.tsx components/sales/modals/CheckoutModal.tsx
git commit -m "feat(ui): add downpayment support to sales checkout flow"
```

---

### Task 18: Edit User Modal — Rate Level Dropdown

**Files:**
- Modify: `components/accounts/EditUserModal.tsx` (494 lines)

**Step 1: Replace Artist Level dropdown with Rate Level**

Lines 429-452: Replace the hardcoded dropdown:
```tsx
// OLD:
<select value={localUser.artist_level || "NORMAL"}
        onChange={(e) => setLocalUser({ ...localUser, artist_level: e.target.value as ArtistLevelType })}>
    <option value='NORMAL'>Normal Artist</option>
    <option value='HEAD_ARTIST'>Head Artist</option>
    <option value='OWNER'>Owner</option>
</select>

// NEW:
<select value={localUser.rate_level_id || ""}
        onChange={(e) => setLocalUser({ ...localUser, rate_level_id: e.target.value })}>
    <option value=''>Select Rate Level</option>
    {rateLevels.map((level) => (
        <option key={level.id} value={level.id}>{level.name}</option>
    ))}
</select>
```

Add `rateLevels` prop or fetch it in the modal.

**Step 2: Update the label**

Change "Artist Level" label to "Rate Level".

**Step 3: Update role switch logic**

Lines 192-199: Replace artist_level with rate_level_id:
```ts
// OLD:
if (newRole === "artist" && !localUser.artist_level) {
    updates.artist_level = "NORMAL"
}
if (newRole !== "artist" && localUser.artist_level) {
    updates.artist_level = undefined
}

// NEW:
if (newRole === "artist" && !localUser.rate_level_id) {
    const defaultLevel = rateLevels.find(l => l.slug === 'standard')
    if (defaultLevel) updates.rate_level_id = defaultLevel.id
}
if (newRole !== "artist" && localUser.rate_level_id) {
    updates.rate_level_id = undefined
}
```

**Step 4: Commit**

```bash
git add components/accounts/EditUserModal.tsx
git commit -m "feat(ui): update user modal with dynamic rate level dropdown"
```

---

### Task 19: My Payroll Page — Terminology Updates

**Files:**
- Modify: `app/my-payroll/myPayrollPage.tsx` (844 lines)

**Step 1: Update rate snapshot references**

Replace `entry.artist_rate_snapshot` with `entry.staff_rate_snapshot` throughout.

**Step 2: Update filter and badge logic**

Lines 205-223: Update service type filter to use `staff_rate_snapshot.serviceType`.
Lines 464-468: Update service type badge display.

**Step 3: Commit**

```bash
git add app/my-payroll/myPayrollPage.tsx
git commit -m "fix(ui): rename artist_rate_snapshot to staff_rate_snapshot in my-payroll"
```

---

## Phase 4: Export Engine Updates

### Task 20: Update Export Engine for New Grouping Dimensions

**Files:**
- Modify: `utils/export-engine/types.ts`
- Modify: `utils/export-engine/grouping.ts`

**Step 1: Add Rate Level and Staff Cut dimensions**

In `types.ts`, update `GroupingDimension`:
```ts
export type GroupingDimension = 'branch' | 'entryType' | 'paymentMethod' | 'category' | 'rateLevel' | 'staffCut'
```

**Step 2: Update grouping.ts**

In `getGroupKey()`, add:
```ts
case 'rateLevel':
    return entry.rate_level_name || 'Unknown'
case 'staffCut':
    return entry.staff_cut > 0 ? 'Staff' : 'Shop'
```

In `getGroupLabel()`, add:
```ts
case 'rateLevel':
    return key
case 'staffCut':
    return key === 'Staff' ? 'Staff Cut Entries' : 'Shop Cut Entries'
```

**Step 3: Commit**

```bash
git add utils/export-engine/types.ts utils/export-engine/grouping.ts
git commit -m "feat(export): add rateLevel and staffCut grouping dimensions"
```

---

## Phase 5: Seed & Database Migration

### Task 21: Create Seed Script for Rate Levels

**Files:**
- Create: `scripts/seed-rate-levels.ts`

**Step 1: Create seed script**

```ts
import { db } from '@/server/db'
import { rateLevels } from '@/server/db/schema/payroll'

async function seedRateLevels() {
    console.log('Seeding rate levels...')

    const levels = [
        { name: 'Standard', slug: 'standard', sortOrder: 0, isActive: true },
        { name: 'Senior', slug: 'senior', sortOrder: 1, isActive: true },
        { name: 'Owner', slug: 'owner', sortOrder: 2, isActive: true },
    ]

    for (const level of levels) {
        await db.insert(rateLevels).values(level).onConflictDoNothing()
    }

    console.log('Rate levels seeded successfully')
}

seedRateLevels().catch(console.error)
```

**Step 2: Create migration script**

Create `scripts/migrate-artist-levels.ts` that:
1. Creates the 3 default rate levels in `rate_levels` table
2. Updates `payroll_staff_rate.artist_level` to `rate_level_id` by mapping:
   - `NORMAL` → standard level's UUID
   - `HEAD_ARTIST` → senior level's UUID
   - `OWNER` → owner level's UUID
3. Updates `users.artist_level` to `rate_level_id` by mapping:
   - `NORMAL` → standard level's UUID
   - `HEAD_ARTIST` → senior level's UUID
   - `OWNER` → owner level's UUID
4. Renames `payroll_entry.artist_cut` to `payroll_entry.staff_cut`
5. Renames `payroll_staff_rate.artist_percentage` to `payroll_staff_rate.staff_percentage`
6. Updates `payroll_entry.artist_rate_snapshot` JSONB to `staff_rate_snapshot`

**Step 3: Commit**

```bash
git add scripts/seed-rate-levels.ts scripts/migrate-artist-levels.ts
git commit -m "feat(scripts): add rate levels seed and migration scripts"
```

---

### Task 22: Update Existing Seed Script

**Files:**
- Modify: `scripts/seed-shoe-rates.ts`

**Step 1: Update seed script to use rate_level_id**

Replace `artistLevel: 'NORMAL'` / `artistLevel: 'HEAD_ARTIST'` / `artistLevel: 'OWNER'` with:
```ts
rateLevelId: standardLevelId  // Look up from rate_levels table
rateLevelId: seniorLevelId    // Look up from rate_levels table
rateLevelId: ownerLevelId     // Look up from rate_levels table
```

Also rename `artistPercentage` to `staffPercentage`.

**Step 2: Commit**

```bash
git add scripts/seed-shoe-rates.ts
git commit -m "fix(scripts): update seed-shoe-rates to use rate_level_id"
```

---

## Phase 6: Final Cleanup

### Task 23: Global Search & Replace — Remaining Artist References

**Step 1: Search for remaining `ArtistLevel` / `ArtistLevelType` references**

Search all `.ts` and `.tsx` files for:
- `ArtistLevel` → should all be replaced with appropriate types
- `ArtistLevelType` → should be removed (consolidated into `RateLevel`)
- `artist_level` → should be `rate_level_id` or `rate_level_name`
- `artistLevel` → should be `rateLevelId` or `rateLevelName`
- `Artist Rates` → `Rates`
- `Artist Rate` → `Rate`
- `artist_percentage` → `staff_percentage`
- `artistPercentage` → `staffPercentage`
- `ArtistEarningsSummary` → `StaffEarningsSummary`
- `ArtistRateSnapshot` → `StaffRateSnapshot`

Note: Keep `artist` when it refers to the user role (e.g., `role: 'artist'`, `artistId` for staff member IDs) — we're only renaming rate/level-specific terminology.

**Step 2: Fix each file individually based on search results**

**Step 3: Verify with build**

```bash
bun run build
```

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: complete artist-to-staff terminology rename for rates/levels"
```

---

### Task 24: Fix All Lint and Build Errors

**Step 1: Run lint**

```bash
bun run lint
```

**Step 2: Fix all lint errors**

Address every lint error and warning. Common expected changes:
- Unused imports (ArtistLevel, ArtistLevelType removed but still imported)
- Type mismatches (string vs UUID for rate_level_id)
- Missing props in components (rateLevels not passed as prop)
- Any `any` types introduced during migration

**Step 3: Run build**

```bash
bun run build
```

**Step 4: Fix all build errors**

Address every TypeScript error. Common expected changes:
- Property name changes (artist_level → rate_level_id)
- Type mismatches
- Missing function exports
- Import path fixes

**Step 5: Run lint again to verify clean**

```bash
bun run lint
```

**Step 6: Final build verification**

```bash
bun run build
```

Expected: Both lint and build pass with zero errors and zero warnings.

**Step 7: Commit**

```bash
git add -A
git commit -m "fix: resolve all lint and build errors after rates/downpayments overhaul"
```

---

## Task Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create `rate_levels` DB table | `server/db/schema/payroll.ts` |
| 2 | Create `downpayments` DB table & transaction statuses | `server/db/schema/payroll.ts`, `server/db/schema/transactions.ts`, `utils/types/transactions.ts` |
| 3 | Update TypeScript types | `utils/types/payroll.ts`, `utils/types/auth.ts`, `utils/types/transactions.ts` |
| 4 | Update auth DB schema | `server/db/schema/auth.ts` |
| 5 | Rate Levels CRUD server actions | `server/actions/rate-levels.ts` (new) |
| 6 | Update payroll server actions | `server/actions/payroll.ts` |
| 7 | Downpayments server actions | `server/actions/downpayments.ts` (new) |
| 8 | Update Zod schemas | `server/actions/payroll-schemas.ts` |
| 9 | Update transaction actions | `server/actions/transactions.ts` |
| 10 | Update profile actions | `server/actions/profile.ts` |
| 11 | Update metrics actions | `server/actions/metrics.ts` |
| 12 | Update payroll disbursements | `server/actions/payroll-disbursements.ts` |
| 13 | Payroll page UI updates | `app/payroll/payrollPage.tsx` |
| 14 | Rate modals UI | `app/payroll/modals/CreateRateModal.tsx`, `EditRateModal.tsx` |
| 15 | Downpayments tab & modals | `app/payroll/payrollPage.tsx`, new modal files |
| 16 | Accounting page updates | `app/accounting/accountingPage.tsx` |
| 17 | Sales checkout updates | `components/sales/context/SalesContext.tsx`, `CheckoutModal.tsx` |
| 18 | Edit user modal | `components/accounts/EditUserModal.tsx` |
| 19 | My Payroll page updates | `app/my-payroll/myPayrollPage.tsx` |
| 20 | Export engine updates | `utils/export-engine/types.ts`, `grouping.ts` |
| 21 | Seed script for rate levels | `scripts/seed-rate-levels.ts` (new), `scripts/migrate-artist-levels.ts` (new) |
| 22 | Update existing seed script | `scripts/seed-shoe-rates.ts` |
| 23 | Global search & replace cleanup | All files with remaining artist references |
| 24 | Fix all lint and build errors | As needed |