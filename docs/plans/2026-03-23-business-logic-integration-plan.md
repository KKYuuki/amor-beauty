# Business Logic Integration - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address all remaining business logic gaps to achieve production-ready status across 8 phases.

**Architecture:** 
- Phase 1: Critical integrations (Transaction→Accounting, Transaction→Payroll, Balance validation)
- Phase 2: Appointment validation (Double-booking, Staff availability, Stock reservation)
- Phase 3: Data integrity (Rate versioning, Password, Activity audit)
- Phase 4: Branch & Settings (Assignment, Period lock, Working hours)
- Phase 5: Missing tables (Ratings, Reviews, Notifications)
- Phase 6-8: Enhancements and polish

**Tech Stack:** Next.js 15, React 19, TypeScript, Bun, Drizzle ORM, PostgreSQL

---

## Phase 1: Critical Integrations

### Task 1: Transaction→Accounting Integration

**Files:**
- Modify: `server/actions/transactions.ts`
- Modify: `server/actions/accounting.ts` (if needed for export)

**Step 1: Add import for accounting function**

At the top of `server/actions/transactions.ts`, add:
```typescript
import { createAutoLedgerEntry } from './accounting'
```

**Step 2: Call accounting after successful transaction**

In the `createTransaction` function, after the transaction is created successfully (inside the `withTransaction` callback, after creating items and updating inventory, before the `createLogs` call), add:

```typescript
// Create accounting entry for the sale
try {
    await createAutoLedgerEntry({
        type: 'REVENUE',
        category: 'SALES',
        description: `Sale: ${transactionNumber}`,
        reference: newTransaction.id,
        debit: payload.total,
        credit: 0,
        sourceType: 'TRANSACTION',
        sourceId: newTransaction.id,
        branchId: payload.branch_id || null,
    }, tx)
} catch (accountingError) {
    // Log but don't fail the transaction
    await logError({
        type: 'ACCOUNTING',
        message: `Failed to create accounting entry for transaction ${transactionNumber}: ${accountingError instanceof Error ? accountingError.message : String(accountingError)}`
    })
}
```

**Step 3: Verify createAutoLedgerEntry accepts TransactionClient**

Check `server/actions/accounting.ts` to ensure `createAutoLedgerEntry` can accept an optional transaction client parameter. If not, add it:

```typescript
export async function createAutoLedgerEntry(
    entry: AutoLedgerEntryInput,
    tx?: TransactionClient
): Promise<ActionResponse<{ id: string }>> {
    const dbClient = tx || db
    // ... use dbClient instead of db for queries
}
```

**Step 4: Run lint and build**

```bash
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/actions/transactions.ts server/actions/accounting.ts
git commit -m "feat: integrate accounting with transactions for automatic ledger entries"
```

---

### Task 2: Transaction→Payroll Integration

**Files:**
- Modify: `server/actions/transactions.ts`
- Modify: `server/actions/payroll.ts` (may need to accept TransactionClient)

**Step 1: Import payroll function**

At the top of `server/actions/transactions.ts`, add:
```typescript
import { calculateAndCreatePayrollEntry } from './payroll'
```

**Step 2: Add payroll entry creation after transaction**

In the `createTransaction` function, inside the `withTransaction` callback, after inventory updates, add:

```typescript
// Create payroll entries for services
if (payload.staff_id) {
    for (const item of payload.items) {
        if (item.service_id) {
            try {
                await calculateAndCreatePayrollEntry({
                    transactionId: newTransaction.id,
                    serviceId: item.service_id,
                    artistId: payload.staff_id!,
                    amount: item.quantity * item.unit_price,
                    quantity: item.quantity,
                }, tx)
            } catch (payrollError) {
                // Log but don't fail the transaction
                await logError({
                    type: 'PAYROLL',
                    message: `Failed to create payroll entry for transaction ${transactionNumber}: ${payrollError instanceof Error ? payrollError.message : String(payrollError)}`
                })
            }
        }
    }
}
```

**Step 3: Verify calculateAndCreatePayrollEntry accepts TransactionClient**

Check `server/actions/payroll.ts` and update the function signature if needed:

```typescript
export async function calculateAndCreatePayrollEntry(
    input: PayrollEntryInput,
    tx?: TransactionClient
): Promise<ActionResponse<{ entryId: string }>> {
    const dbClient = tx || db
    // ... use dbClient
}
```

**Step 4: Run lint and build**

```bash
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/actions/transactions.ts server/actions/payroll.ts
git commit -m "feat: integrate payroll with transactions for service-based pay"
```

---

### Task 3: Accounting Balance Validation

**Files:**
- Modify: `server/actions/accounting.ts`

**Step 1: Add balance validation helper**

Add a new function near the top of the accounting file:

```typescript
/**
 * Validates that a single entry has at least one non-zero value
 */
function validateSingleEntry(debit: number, credit: number): { valid: boolean; error?: string } {
    if (debit === 0 && credit === 0) {
        return { valid: false, error: 'Entry must have non-zero debit or credit' }
    }
    if (debit < 0 || credit < 0) {
        return { valid: false, error: 'Debit and credit must be non-negative' }
    }
    return { valid: true }
}

/**
 * Validates that a batch of entries balances (total debits = total credits)
 */
function validateBalancedEntries(entries: { debit: number; credit: number }[]): { valid: boolean; error?: string } {
    const totalDebits = entries.reduce((sum, e) => sum + e.debit, 0)
    const totalCredits = entries.reduce((sum, e) => sum + e.credit, 0)
    
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
        return { 
            valid: false, 
            error: `Entries must balance: total debits (${totalDebits}) must equal total credits (${totalCredits})` 
        }
    }
    return { valid: true }
}
```

**Step 2: Use validation in createLedgerEntry**

In the `createLedgerEntry` function, after parsing the payload, add:

```typescript
// Validate single entry
const validation = validateSingleEntry(parsed.debit, parsed.credit)
if (!validation.valid) {
    return failure(validation.error!)
}
```

**Step 3: Add batch entry validation (for double-entry mode)**

Add a new function for creating balanced journal entries:

```typescript
export interface JournalEntryLine {
    accountId?: string
    category: string
    description: string
    debit: number
    credit: number
}

export async function createJournalEntry(
    lines: JournalEntryLine[],
    options: {
        description: string
        branchId?: string
        proofFile?: File
    }
): Promise<ActionResponse<{ entryIds: string[] }>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    // Validate balance
    const validation = validateBalancedEntries(lines)
    if (!validation.valid) {
        return failure(validation.error!)
    }

    // Validate each line
    for (const line of lines) {
        const lineValidation = validateSingleEntry(line.debit, line.credit)
        if (!lineValidation.valid) {
            return failure(lineValidation.error!)
        }
    }

    // Create entries within transaction
    return await withTransaction(async (tx) => {
        const entryIds: string[] = []

        for (const line of lines) {
            const [entry] = await tx
                .insert(generalLedger)
                .values({
                    entryType: 'JOURNAL',
                    category: line.category,
                    description: `${options.description} - ${line.description}`,
                    debit: line.debit.toString(),
                    credit: line.credit.toString(),
                    branchId: options.branchId || null,
                    createdBy: user.id,
                })
                .returning({ id: generalLedger.id })
            
            entryIds.push(entry.id)
        }

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'ACCOUNTING',
                message: `Journal entry created with ${lines.length} lines`,
            }]
        })

        return success({ entryIds })
    }, { action: 'ACCOUNTING', userId: user.id })
}
```

**Step 4: Run lint and build**

```bash
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "feat: add accounting balance validation for ledger entries"
```

---

## Phase 2: Appointment Validation

### Task 4: Double-Booking Prevention

**Files:**
- Modify: `server/actions/appointments.ts`

**Step 1: Add overlap detection function**

Add after the imports:

```typescript
/**
 * Checks if a new appointment would overlap with existing appointments for a staff member
 */
async function checkAppointmentOverlap(
    staffId: string,
    startTime: Date,
    endTime: Date,
    excludeId?: string
): Promise<{ hasOverlap: boolean; conflictingAppointment?: typeof appointments.$inferSelect }> {
    const conditions = [
        eq(appointments.staffId, staffId),
        ne(appointments.status, 'CANCELLED'),
        lte(appointments.startTime, endTime),
        gte(appointments.endTime, startTime),
    ]

    if (excludeId) {
        conditions.push(ne(appointments.id, excludeId))
    }

    const overlapping = await db
        .select()
        .from(appointments)
        .where(and(...conditions))
        .limit(1)

    if (overlapping.length > 0) {
        return { hasOverlap: true, conflictingAppointment: overlapping[0] }
    }

    return { hasOverlap: false }
}
```

**Step 2: Use in createAppointment**

In the `createAppointment` function, before creating the appointment, add:

```typescript
// Check for overlapping appointments
if (payload.staff_id) {
    const overlapCheck = await checkAppointmentOverlap(
        payload.staff_id,
        new Date(payload.start_time),
        new Date(payload.end_time)
    )

    if (overlapCheck.hasOverlap) {
        const conflicting = overlapCheck.conflictingAppointment!
        return failure(
            `Staff member already has an appointment from ${conflicting.startTime.toLocaleString()} to ${conflicting.endTime.toLocaleString()}`
        )
    }
}
```

**Step 3: Use in updateAppointment**

In the `updateAppointment` function, if updating time or staff:

```typescript
// Check for overlap if time or staff is being changed
if (updates.startTime || updates.endTime || updates.staffId) {
    const staffIdToCheck = updates.staffId || existingAppointment.staffId
    const startToCheck = updates.startTime || existingAppointment.startTime
    const endToCheck = updates.endTime || existingAppointment.endTime

    if (staffIdToCheck && startToCheck && endToCheck) {
        const overlapCheck = await checkAppointmentOverlap(
            staffIdToCheck,
            new Date(startToCheck),
            new Date(endToCheck),
            id // Exclude current appointment
        )

        if (overlapCheck.hasOverlap) {
            return failure('Would create overlapping appointment')
        }
    }
}
```

**Step 4: Run lint and build**

```bash
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "feat: add double-booking prevention for appointments"
```

---

### Task 5: Staff Availability Check

**Files:**
- Modify: `server/actions/appointments.ts`
- Modify: `server/actions/settings.ts` (to add business hours)
- Create: `server/db/schema/schedules.ts` (if not exists)

**Step 1: Check if schedules table exists**

Check if `staffSchedules` or similar table exists. If not, create:

```typescript
// server/db/schema/schedules.ts
import { pgTable, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const staffSchedules = pgTable('staff_schedules', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    staffId: text('staff_id').notNull().references(() => user.id),
    dayOfWeek: integer('day_of_week').notNull(), // 0 = Sunday, 6 = Saturday
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time').notNull(),
    isActive: integer('is_active').default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

**Step 2: Add schedule export to schema index**

In `server/db/schema/index.ts`:
```typescript
export * from './schedules'
```

**Step 3: Add availability check function**

```typescript
/**
 * Checks if staff member is available for the given time slot
 */
async function checkStaffAvailability(
    staffId: string,
    startTime: Date,
    endTime: Date
): Promise<{ isAvailable: boolean; reason?: string }> {
    const dayOfWeek = startTime.getDay()
    
    // Get staff schedule for this day
    const schedule = await db
        .select()
        .from(staffSchedules)
        .where(and(
            eq(staffSchedules.staffId, staffId),
            eq(staffSchedules.dayOfWeek, dayOfWeek),
            eq(staffSchedules.isActive, 1)
        ))
        .limit(1)

    if (schedule.length === 0) {
        return { isAvailable: false, reason: 'Staff member is not scheduled for this day' }
    }

    const scheduleStart = schedule[0].startTime
    const scheduleEnd = schedule[0].endTime

    // Check if appointment is within working hours
    const appointmentStartMinutes = startTime.getHours() * 60 + startTime.getMinutes()
    const appointmentEndMinutes = endTime.getHours() * 60 + endTime.getMinutes()
    const scheduleStartMinutes = scheduleStart.getHours() * 60 + scheduleStart.getMinutes()
    const scheduleEndMinutes = scheduleEnd.getHours() * 60 + scheduleEnd.getMinutes()

    if (appointmentStartMinutes < scheduleStartMinutes || appointmentEndMinutes > scheduleEndMinutes) {
        return { 
            isAvailable: false, 
            reason: `Appointment is outside working hours (${scheduleStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${scheduleEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})` 
        }
    }

    return { isAvailable: true }
}
```

**Step 4: Use in createAppointment**

```typescript
// Check staff availability
if (payload.staff_id) {
    const availability = await checkStaffAvailability(
        payload.staff_id,
        new Date(payload.start_time),
        new Date(payload.end_time)
    )

    if (!availability.isAvailable) {
        return failure(availability.reason!)
    }
}
```

**Step 5: Run migration and build**

```bash
bun run db:generate
bun run db:migrate
bun run lint
bun run build
```

**Step 6: Commit**

```bash
git add server/db/schema/schedules.ts server/db/schema/index.ts server/actions/appointments.ts
git commit -m "feat: add staff availability check for appointments"
```

---

### Task 6: Stock Reservation System

**Files:**
- Create: `server/db/schema/reservations.ts`
- Modify: `server/db/schema/index.ts`
- Modify: `server/actions/appointments.ts`
- Create: `server/actions/reservations.ts`

**Step 1: Create reservations schema**

```typescript
// server/db/schema/reservations.ts
import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core'
import { inventory } from './inventory'
import { appointments } from './appointments'

export const stockReservations = pgTable('stock_reservations', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    inventoryId: text('inventory_id').notNull().references(() => inventory.id),
    appointmentId: text('appointment_id').notNull().references(() => appointments.id),
    quantity: integer('quantity').notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING, CONFIRMED, RELEASED, CONVERTED
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'), // Auto-release if not confirmed
    confirmedAt: timestamp('confirmed_at'),
    releasedAt: timestamp('released_at'),
})
```

**Step 2: Add to schema index**

```typescript
export * from './reservations'
```

**Step 3: Create reservations actions**

```typescript
// server/actions/reservations.ts
'use server'

import { db } from '@/server/db'
import { stockReservations } from '@/server/db/schema/reservations'
import { inventory } from '@/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { getCurrentUser } from '@/utils/auth/permissions'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import { createLogs, logError } from './logs'

export async function reserveStock(
    inventoryId: string,
    appointmentId: string,
    quantity: number,
    expiresAt?: Date
): Promise<ActionResponse<{ reservationId: string }>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    // Check available stock
    const [item] = await db
        .select()
        .from(inventory)
        .where(eq(inventory.id, inventoryId))
        .limit(1)

    if (!item) {
        return failure('Inventory item not found')
    }

    const currentStock = Number(item.currentStock)
    const existingReservations = await db
        .select({ total: sum(stockReservations.quantity) })
        .from(stockReservations)
        .where(and(
            eq(stockReservations.inventoryId, inventoryId),
            eq(stockReservations.status, 'PENDING')
        ))

    const reservedQuantity = existingReservations[0]?.total || 0
    const availableStock = currentStock - Number(reservedQuantity)

    if (availableStock < quantity) {
        return failure(`Insufficient stock. Available: ${availableStock}, Requested: ${quantity}`)
    }

    const [reservation] = await db
        .insert(stockReservations)
        .values({
            inventoryId,
            appointmentId,
            quantity,
            status: 'PENDING',
            expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours default
        })
        .returning({ id: stockReservations.id })

    await createLogs({
        logs: [{
            level: 'INFO',
            type: 'STORAGE',
            message: `Stock reserved: ${quantity} ${item.name} for appointment ${appointmentId}`,
        }]
    })

    return success({ reservationId: reservation.id })
}

export async function confirmReservation(reservationId: string): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const [reservation] = await db
        .update(stockReservations)
        .set({ status: 'CONFIRMED', confirmedAt: new Date() })
        .where(eq(stockReservations.id, reservationId))
        .returning({ id: stockReservations.id })

    if (!reservation) {
        return failure('Reservation not found')
    }

    return success(undefined)
}

export async function releaseReservation(reservationId: string): Promise<ActionResponse<void>> {
    const [reservation] = await db
        .update(stockReservations)
        .set({ status: 'RELEASED', releasedAt: new Date() })
        .where(eq(stockReservations.id, reservationId))
        .returning({ id: stockReservations.id, inventoryId: stockReservations.inventoryId })

    if (!reservation) {
        return failure('Reservation not found')
    }

    await createLogs({
        logs: [{
            level: 'INFO',
            type: 'STORAGE',
            message: `Reservation released: ${reservationId}`,
        }]
    })

    return success(undefined)
}

export async function getReservationsForAppointment(appointmentId: string) {
    return db
        .select({
            reservation: stockReservations,
            item: inventory,
        })
        .from(stockReservations)
        .innerJoin(inventory, eq(stockReservations.inventoryId, inventory.id))
        .where(eq(stockReservations.appointmentId, appointmentId))
}
```

**Step 4: Use in appointment creation**

In `createAppointment` in `server/actions/appointments.ts`:

```typescript
// Reserve inventory for items if provided
if (payload.items && payload.items.length > 0) {
    for (const item of payload.items) {
        if (item.inventory_id) {
            const reservationResult = await reserveStock(
                item.inventory_id,
                newAppointment.id,
                item.quantity
            )
            if (!reservationResult.success) {
                // Log warning but don't fail - reservation is optional
                await logError({
                    type: 'APPOINTMENT',
                    message: `Failed to reserve stock for item ${item.inventory_id}: ${reservationResult.error}`
                })
            }
        }
    }
}
```

**Step 5: Run migration and build**

```bash
bun run db:generate
bun run db:migrate
bun run lint
bun run build
```

**Step 6: Commit**

```bash
git add server/db/schema/reservations.ts server/db/schema/index.ts server/actions/reservations.ts server/actions/appointments.ts
git commit -m "feat: add stock reservation system for appointments"
```

---

## Phase 3: Data Integrity

### Task 7: Rate Versioning for Payroll

**Files:**
- Modify: `server/db/schema/payroll.ts`
- Modify: `server/actions/payroll.ts`

**Step 1: Add rate snapshot to payroll entries schema**

```typescript
// In server/db/schema/payroll.ts, add to payrollEntries table:
artistRateSnapshot: jsonb('artist_rate_snapshot').$type<{
    percentage: number
    fixedAmount?: number
    serviceType?: string
}>(),
shopRateSnapshot: jsonb('shop_rate_snapshot').$type<{
    percentage: number
    fixedAmount?: number
}>(),
rateVersion: integer('rate_version').default(1),
```

**Step 2: Store rate snapshot when creating payroll entry**

In `calculateAndCreatePayrollEntry`:

```typescript
// After calculating the rate, store it with the entry
const payrollEntry = await tx
    .insert(payrollEntries)
    .values({
        // ... existing fields
        artistRateSnapshot: {
            percentage: applicableRate.artistPercentage,
            fixedAmount: applicableRate.artistFixedAmount,
            serviceType: applicableRate.serviceType,
        },
        shopRateSnapshot: {
            percentage: applicableRate.shopPercentage,
            fixedAmount: applicableRate.shopFixedAmount,
        },
        rateVersion: 1,
    })
```

**Step 3: Use snapshot for historical calculations**

When displaying historical payroll, use the snapshot:

```typescript
// Instead of recalculating with current rates
const artistAmount = entry.artistRateSnapshot?.percentage 
    ? entry.lineTotal * (entry.artistRateSnapshot.percentage / 100)
    : entry.artistAmount
```

**Step 4: Run migration and build**

```bash
bun run db:generate
bun run db:migrate
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/db/schema/payroll.ts server/actions/payroll.ts
git commit -m "feat: add rate versioning to payroll entries"
```

---

### Task 8: Password Strength Validation

**Files:**
- Modify: `server/actions/profile.ts`

**Step 1: Add password strength schema**

At the top of the file with other schemas:

```typescript
const PasswordStrengthSchema = z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
```

**Step 2: Use in createUser**

In the `createUser` function, add validation:

```typescript
// Validate password strength
const passwordValidation = PasswordStrengthSchema.safeParse(password)
if (!passwordValidation.success) {
    return { 
        success: false, 
        message: `Password does not meet security requirements: ${passwordValidation.error.errors.map(e => e.message).join(', ')}`
    }
}
```

**Step 3: Add password reset validation**

If there's a password change function, add the same validation.

**Step 4: Run lint and build**

```bash
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/actions/profile.ts
git commit -m "feat: add password strength validation"
```

---

### Task 9: User Activity Audit

**Files:**
- Modify: `server/db/schema/auth.ts`
- Modify: `server/actions/profile.ts`
- Create: `server/actions/audit.ts`

**Step 1: Add tracking fields to user schema**

```typescript
// In server/db/schema/auth.ts, add to user table:
lastLoginAt: timestamp('last_login_at'),
loginCount: integer('login_count').default(0),
failedLoginAttempts: integer('failed_login_attempts').default(0),
lastFailedLoginAt: timestamp('last_failed_login_at'),
```

**Step 2: Create audit action**

```typescript
// server/actions/audit.ts
'use server'

import { db } from '@/server/db'
import { user } from '@/server/db/schema/auth'
import { eq } from 'drizzle-orm'
import { createLogs } from './logs'

export async function recordSuccessfulLogin(userId: string): Promise<void> {
    await db
        .update(user)
        .set({
            lastLoginAt: new Date(),
            loginCount: sql`${user.loginCount} + 1`,
            failedLoginAttempts: 0,
        })
        .where(eq(user.id, userId))

    await createLogs({
        logs: [{
            level: 'INFO',
            type: 'AUTH',
            message: `User logged in: ${userId}`,
        }]
    })
}

export async function recordFailedLogin(userId: string): Promise<void> {
    await db
        .update(user)
        .set({
            failedLoginAttempts: sql`${user.failedLoginAttempts} + 1`,
            lastFailedLoginAt: new Date(),
        })
        .where(eq(user.id, userId))

    await createLogs({
        logs: [{
            level: 'WARN',
            type: 'AUTH',
            message: `Failed login attempt for user: ${userId}`,
        }]
    })
}

export async function getLoginHistory(userId: string, limit: number = 50) {
    // Query systemLogs for login events
    return db
        .select()
        .from(systemLogs)
        .where(and(
            eq(systemLogs.type, 'AUTH'),
            sql`message LIKE '%${userId}%'`
        ))
        .orderBy(desc(systemLogs.createdAt))
        .limit(limit)
}
```

**Step 3: Integrate with auth flow**

Hook into Better Auth callbacks to call `recordSuccessfulLogin` after successful authentication.

**Step 4: Run migration and build**

```bash
bun run db:generate
bun run db:migrate
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/db/schema/auth.ts server/actions/profile.ts server/actions/audit.ts
git commit -m "feat: add user activity audit for login tracking"
```

---

## Phase 4: Branch & Settings

### Task 10: Branch-User Assignment

**Files:**
- Modify: `server/db/schema/auth.ts`
- Modify: `server/actions/profile.ts`
- Modify: `server/actions/branches.ts`

**Step 1: Add branchIds to user schema**

```typescript
// In server/db/schema/auth.ts:
branchIds: jsonb('branch_ids').$type<string[]>().default([]),
```

**Step 2: Create assignment functions**

```typescript
// In server/actions/branches.ts:
export async function assignUserToBranch(
    userId: string,
    branchId: string
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user || !(await isAdmin(user))) {
        return failure('Unauthorized: Admin access required')
    }

    const [targetUser] = await db
        .select()
        .from(user)
        .where(eq(user.id, userId))
        .limit(1)

    if (!targetUser) {
        return failure('User not found')
    }

    const currentBranchIds = targetUser.branchIds || []
    if (currentBranchIds.includes(branchId)) {
        return success(undefined, 'User already assigned to this branch')
    }

    await db
        .update(user)
        .set({ branchIds: [...currentBranchIds, branchId] })
        .where(eq(user.id, userId))

    await createLogs({
        logs: [{
            level: 'INFO',
            type: 'AUTH',
            message: `User ${userId} assigned to branch ${branchId}`,
        }]
    })

    return success(undefined, 'Branch assignment successful')
}

export async function unassignUserFromBranch(
    userId: string,
    branchId: string
): Promise<ActionResponse<void>> {
    // Similar implementation
}
```

**Step 3: Filter data by user's branches**

Update data queries to filter by user's assigned branches where applicable.

**Step 4: Run migration and build**

```bash
bun run db:generate
bun run db:migrate
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/db/schema/auth.ts server/actions/profile.ts server/actions/branches.ts
git commit -m "feat: add branch-user assignment"
```

---

### Task 11: Period Locking for Accounting

**Files:**
- Modify: `server/actions/settings.ts`
- Modify: `server/actions/accounting.ts`

**Step 1: Add period lock settings**

```typescript
// In server/actions/settings.ts:
export const PERIOD_LOCK_SETTINGS = {
    accounting_locked_until: null as string | null,
    locked_by: null as string | null,
}
```

**Step 2: Create lock management functions**

```typescript
export async function lockAccountingPeriod(
    untilDate: Date
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user || !(await isAdmin(user))) {
        return failure('Unauthorized: Admin access required')
    }

    await updateSetting('accounting_locked_until', untilDate.toISOString())
    await updateSetting('locked_by', user.id)

    return success(undefined)
}

export async function unlockAccountingPeriod(): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user || !(await isAdmin(user))) {
        return failure('Unauthorized: Admin access required')
    }

    await updateSetting('accounting_locked_until', null)
    await updateSetting('locked_by', null)

    return success(undefined)
}
```

**Step 3: Check lock before editing**

In `updateLedgerEntry` and `voidLedgerEntry`:

```typescript
// Check if period is locked
const lockedUntil = await getSetting('accounting_locked_until')
if (lockedUntil && new Date(entry.entry_date) <= new Date(lockedUntil)) {
    return failure('This accounting period is locked and cannot be modified')
}
```

**Step 4: Run lint and build**

```bash
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/actions/settings.ts server/actions/accounting.ts
git commit -m "feat: add period locking for accounting"
```

---

### Task 12: Working Hours Validation

**Files:**
- Modify: `server/actions/settings.ts`
- Modify: `server/actions/appointments.ts`

**Step 1: Add business hours to settings**

```typescript
// Default business hours structure
export const DEFAULT_BUSINESS_HOURS = {
    0: null, // Sunday - closed
    1: { open: '09:00', close: '18:00' }, // Monday
    2: { open: '09:00', close: '18:00' }, // Tuesday
    3: { open: '09:00', close: '18:00' }, // Wednesday
    4: { open: '09:00', close: '18:00' }, // Thursday
    5: { open: '09:00', close: '18:00' }, // Friday
    6: { open: '10:00', close: '16:00' }, // Saturday
}
```

**Step 2: Add validation function**

```typescript
async function isWithinBusinessHours(
    startTime: Date,
    endTime: Date
): Promise<{ valid: boolean; reason?: string }> {
    const businessHoursSetting = await getSetting('business_hours')
    const businessHours = businessHoursSetting || DEFAULT_BUSINESS_HOURS
    
    const dayOfWeek = startTime.getDay()
    const dayHours = businessHours[dayOfWeek]
    
    if (!dayHours) {
        return { valid: false, reason: 'Business is closed on this day' }
    }
    
    const [openHour, openMin] = dayHours.open.split(':').map(Number)
    const [closeHour, closeMin] = dayHours.close.split(':').map(Number)
    
    const openMinutes = openHour * 60 + openMin
    const closeMinutes = closeHour * 60 + closeMin
    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes()
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes()
    
    if (startMinutes < openMinutes) {
        return { valid: false, reason: `Business opens at ${dayHours.open}` }
    }
    
    if (endMinutes > closeMinutes) {
        return { valid: false, reason: `Business closes at ${dayHours.close}` }
    }
    
    return { valid: true }
}
```

**Step 3: Use in createAppointment**

```typescript
// Check business hours
const hoursCheck = await isWithinBusinessHours(
    new Date(payload.start_time),
    new Date(payload.end_time)
)

if (!hoursCheck.valid) {
    return failure(hoursCheck.reason!)
}
```

**Step 4: Run lint and build**

```bash
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/actions/settings.ts server/actions/appointments.ts
git commit -m "feat: add working hours validation for appointments"
```

---

## Phase 5: Missing Tables & Stubs

### Task 13: Create Ratings Table

**Files:**
- Create: `server/db/schema/ratings.ts`
- Modify: `server/db/schema/index.ts`
- Modify: `server/actions/metrics.ts`

**Step 1: Create ratings schema**

```typescript
// server/db/schema/ratings.ts
import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { appointments } from './appointments'

export const ratings = pgTable('ratings', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    appointmentId: text('appointment_id').references(() => appointments.id),
    customerId: text('customer_id'),
    staffId: text('staff_id').notNull().references(() => user.id),
    rating: integer('rating').notNull(), // 1-5
    comment: text('comment'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

**Step 2: Export from schema index**

```typescript
export * from './ratings'
```

**Step 3: Implement getRatingMetrics**

```typescript
// In server/actions/metrics.ts:
import { ratings } from '@/server/db/schema/ratings'

export async function getRatingMetrics(): Promise<ActionResponse<RatingMetrics>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure('Not authenticated')
        }

        const allRatings = await db
            .select()
            .from(ratings)

        if (allRatings.length === 0) {
            return success({
                averageRating: 0,
                totalRatings: 0,
                distribution: [],
            })
        }

        const totalRatings = allRatings.length
        const averageRating = allRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings

        // Calculate distribution
        const distribution = [1, 2, 3, 4, 5].map(star => ({
            star,
            count: allRatings.filter(r => r.rating === star).length,
        }))

        return success({
            averageRating: Math.round(averageRating * 10) / 10,
            totalRatings,
            distribution,
        })
    } catch (error) {
        await logError({
            type: 'METRICS',
            message: `Failed to get rating metrics: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to get rating metrics')
    }
}
```

**Step 4: Run migration**

```bash
bun run db:generate
bun run db:migrate
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/db/schema/ratings.ts server/db/schema/index.ts server/actions/metrics.ts
git commit -m "feat: add ratings table and implement getRatingMetrics"
```

---

### Task 14: Create Reviews Table

**Files:**
- Create: `server/db/schema/reviews.ts`
- Modify: `server/db/schema/index.ts`
- Modify: `server/actions/metrics.ts`

**Step 1: Create reviews schema**

```typescript
// server/db/schema/reviews.ts
import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { appointments } from './appointments'

export const reviews = pgTable('reviews', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    appointmentId: text('appointment_id').references(() => appointments.id),
    authorId: text('author_id').notNull().references(() => user.id),
    type: text('type').notNull(), // ARTIST, SHOP, SERVICE
    title: text('title'),
    content: text('content').notNull(),
    isPublic: boolean('is_public').default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
```

**Step 2: Export from schema index**

```typescript
export * from './reviews'
```

**Step 3: Implement getAppointmentReviews**

```typescript
// In server/actions/metrics.ts:
import { reviews } from '@/server/db/schema/reviews'

export async function getAppointmentReviews(
    appointmentId: string,
    options?: { page?: number; pageSize?: number }
): Promise<ActionResponse<{ data: AppointmentReview[]; hasMore: boolean; total: number }>> {
    try {
        const { page = 1, pageSize = 10 } = options || {}
        const offset = (page - 1) * pageSize

        const allReviews = await db
            .select()
            .from(reviews)
            .where(eq(reviews.appointmentId, appointmentId))
            .orderBy(desc(reviews.createdAt))

        const total = allReviews.length
        const paginatedReviews = allReviews.slice(offset, offset + pageSize)

        return success({
            data: paginatedReviews.map(r => ({
                id: r.id,
                appointment_id: r.appointmentId || undefined,
                author_id: r.authorId,
                type: r.type as 'ARTIST' | 'SHOP' | 'SERVICE',
                title: r.title || undefined,
                content: r.content,
                is_public: r.isPublic ?? true,
                created_at: r.createdAt.toISOString(),
            })),
            hasMore: total > offset + pageSize,
            total,
        })
    } catch (error) {
        await logError({
            type: 'METRICS',
            message: `Failed to get appointment reviews: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to get reviews')
    }
}
```

**Step 4: Run migration**

```bash
bun run db:generate
bun run db:migrate
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/db/schema/reviews.ts server/db/schema/index.ts server/actions/metrics.ts
git commit -m "feat: add reviews table and implement getAppointmentReviews"
```

---

### Task 15: Implement Notification System

**Files:**
- Create: `server/db/schema/notifications.ts`
- Modify: `server/db/schema/index.ts`
- Modify: `server/actions/profile.ts`

**Step 1: Create notifications schema**

```typescript
// server/db/schema/notifications.ts
import { pgTable, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core'
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
```

**Step 2: Export from schema index**

```typescript
export * from './notifications'
```

**Step 3: Implement notification functions**

```typescript
// In server/actions/profile.ts:

export async function sendUserNotification(
    userId: string,
    notification: Omit<NotificationItem, 'id'>
): Promise<{ success: boolean; message: string }> {
    try {
        await db.insert(notifications).values({
            userId,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data || null,
        })

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `Notification sent to user ${userId}: ${notification.title}`,
            }]
        })

        return { success: true, message: 'Notification sent' }
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to send notification: ${error instanceof Error ? error.message : String(error)}`
        })
        return { success: false, message: 'Failed to send notification' }
    }
}

export async function sendBulkAppNotification(
    userIds: string[],
    notification: Omit<NotificationItem, 'id'>
): Promise<{ successful: number; failed: number; total: number }> {
    let successful = 0
    let failed = 0

    for (const userId of userIds) {
        try {
            await db.insert(notifications).values({
                userId,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                data: notification.data || null,
            })
            successful++
        } catch {
            failed++
        }
    }

    return { successful, failed, total: userIds.length }
}

export async function getUserNotifications(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number }
): Promise<ActionResponse<NotificationItem[]>> {
    try {
        const { unreadOnly = false, limit = 50 } = options || {}

        const conditions = [eq(notifications.userId, userId)]
        if (unreadOnly) {
            conditions.push(isNull(notifications.readAt))
        }

        const results = await db
            .select()
            .from(notifications)
            .where(and(...conditions))
            .orderBy(desc(notifications.createdAt))
            .limit(limit)

        return success(results.map(n => ({
            id: n.id,
            type: n.type as NotificationType,
            title: n.title,
            message: n.message,
            data: n.data as Record<string, unknown> | undefined,
            readAt: n.readAt?.toISOString(),
            createdAt: n.createdAt.toISOString(),
        })))
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to get notifications: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to get notifications')
    }
}

export async function markNotificationRead(notificationId: string): Promise<ActionResponse<void>> {
    try {
        await db
            .update(notifications)
            .set({ readAt: new Date() })
            .where(eq(notifications.id, notificationId))

        return success(undefined)
    } catch (error) {
        return failure('Failed to mark notification as read')
    }
}
```

**Step 4: Run migration**

```bash
bun run db:generate
bun run db:migrate
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/db/schema/notifications.ts server/db/schema/index.ts server/actions/profile.ts
git commit -m "feat: implement notification system"
```

---

## Phase 6: Enhancements

### Task 16: Appointment Items Integration

**Files:**
- Modify: `server/actions/appointments.ts`
- Modify: `server/actions/inventory.ts` (if needed)

**Step 1: Implement appointment inventory functions**

```typescript
// In server/actions/appointments.ts - replace stubs:

export async function getAppointmentItems(appointmentId: string) {
    try {
        const items = await db
            .select({
                item: appointmentItems,
                inventory: inventory,
            })
            .from(appointmentItems)
            .leftJoin(inventory, eq(appointmentItems.inventoryId, inventory.id))
            .where(eq(appointmentItems.appointmentId, appointmentId))

        return items.map(i => ({
            id: i.item.id,
            appointment_id: i.item.appointmentId,
            inventory_id: i.item.inventoryId || undefined,
            name: i.inventory?.name || i.item.customName || 'Unknown',
            quantity: Number(i.item.quantity),
            price: Number(i.item.price),
        }))
    } catch (error) {
        await logError({
            type: 'APPOINTMENT',
            message: `Failed to get appointment items: ${error instanceof Error ? error.message : String(error)}`
        })
        return []
    }
}

export async function addAppointmentItem(
    appointmentId: string,
    itemId: string,
    quantity: number
): Promise<boolean> {
    try {
        // Get inventory item
        const [invItem] = await db
            .select()
            .from(inventory)
            .where(eq(inventory.id, itemId))
            .limit(1)

        if (!invItem) {
            await logError({
                type: 'APPOINTMENT',
                message: `Inventory item not found: ${itemId}`
            })
            return false
        }

        await db.insert(appointmentItems).values({
            appointmentId,
            inventoryId: itemId,
            quantity: String(quantity),
            price: invItem.sellingPrice,
        })

        return true
    } catch (error) {
        await logError({
            type: 'APPOINTMENT',
            message: `Failed to add appointment item: ${error instanceof Error ? error.message : String(error)}`
        })
        return false
    }
}

export async function updateAppointmentItem(
    appointmentItemId: string,
    quantity: number
): Promise<boolean> {
    try {
        await db
            .update(appointmentItems)
            .set({ quantity: String(quantity) })
            .where(eq(appointmentItems.id, appointmentItemId))

        return true
    } catch (error) {
        await logError({
            type: 'APPOINTMENT',
            message: `Failed to update appointment item: ${error instanceof Error ? error.message : String(error)}`
        })
        return false
    }
}

export async function deleteAppointmentItem(appointmentItemId: string): Promise<boolean> {
    try {
        await db.delete(appointmentItems).where(eq(appointmentItems.id, appointmentItemId))
        return true
    } catch (error) {
        await logError({
            type: 'APPOINTMENT',
            message: `Failed to delete appointment item: ${error instanceof Error ? error.message : String(error)}`
        })
        return false
    }
}
```

**Step 2: Run lint and build**

```bash
bun run lint
bun run build
```

**Step 3: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "feat: implement appointment inventory items integration"
```

---

### Task 17: Reorder Point Automation

**Files:**
- Modify: `server/actions/inventory.ts`
- Modify: `server/actions/settings.ts`

**Step 1: Add low stock notification function**

```typescript
// In server/actions/inventory.ts:

export async function checkLowStock(): Promise<ActionResponse<{ lowStock: typeof inventory.$inferSelect[] }>> {
    const lowStockItems = await db
        .select()
        .from(inventory)
        .where(sql`${inventory.currentStock} <= ${inventory.reorderPoint}`)

    return success({ lowStock: lowStockItems })
}

export async function notifyLowStock(): Promise<ActionResponse<void>> {
    const { data } = await checkLowStock()
    if (!data) return failure('Failed to check low stock')

    for (const item of data.lowStock) {
        await sendUserNotification('SYSTEM', {
            type: 'INVENTORY',
            title: 'Low Stock Alert',
            message: `${item.name} is below reorder point (${item.currentStock} / ${item.reorderPoint})`,
            data: { itemId: item.id, currentStock: item.currentStock, reorderPoint: item.reorderPoint },
        })
    }

    return success(undefined)
}
```

**Step 2: Run lint and build**

```bash
bun run lint
bun run build
```

**Step 3: Commit**

```bash
git add server/actions/inventory.ts
git commit -m "feat: add low stock notification automation"
```

---

### Task 18: Receipt Generation

**Files:**
- Create: `utils/receipt-pdf.ts`
- Modify: `server/actions/transactions.ts`

**Step 1: Create receipt PDF generator**

```typescript
// utils/receipt-pdf.ts
import { PDFDocument, StandardFonts } from 'pdf-lib'

export interface ReceiptData {
    transactionNumber: string
    date: string
    items: Array<{
        name: string
        quantity: number
        unitPrice: number
        lineTotal: number
    }>
    subtotal: number
    tax: number
    discount: number
    total: number
    amountPaid: number
    changeGiven?: number
    paymentMethod: string
    branchName?: string
    staffName?: string
}

export async function generateReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([300, 600])
    const font = await pdfDoc.embedFont(StandardFonts.Courier)
    
    let y = 580
    
    // Header
    page.drawText(data.branchName || 'INKSIGHT STUDIO', { x: 20, y, size: 14, font })
    y -= 20
    page.drawText('================================', { x: 20, y, size: 10, font })
    y -= 15
    
    // Transaction info
    page.drawText(`TXN: ${data.transactionNumber}`, { x: 20, y, size: 10, font })
    y -= 12
    page.drawText(`Date: ${data.date}`, { x: 20, y, size: 10, font })
    if (data.staffName) {
        y -= 12
        page.drawText(`Staff: ${data.staffName}`, { x: 20, y, size: 10, font })
    }
    y -= 15
    
    // Items
    page.drawText('--------------------------------', { x: 20, y, size: 10, font })
    y -= 12
    
    for (const item of data.items) {
        page.drawText(`${item.name.slice(0, 20).padEnd(20)}`, { x: 20, y, size: 9, font })
        y -= 12
        page.drawText(`  ${item.quantity} x ${item.unitPrice.toFixed(2)} = ${item.lineTotal.toFixed(2)}`, { x: 20, y, size: 9, font })
        y -= 12
    }
    
    // Totals
    y -= 5
    page.drawText('--------------------------------', { x: 20, y, size: 10, font })
    y -= 12
    page.drawText(`Subtotal: ${data.subtotal.toFixed(2)}`, { x: 20, y, size: 10, font })
    y -= 12
    if (data.discount > 0) {
        page.drawText(`Discount: -${data.discount.toFixed(2)}`, { x: 20, y, size: 10, font })
        y -= 12
    }
    page.drawText(`Tax: ${data.tax.toFixed(2)}`, { x: 20, y, size: 10, font })
    y -= 12
    page.drawText(`TOTAL: ${data.total.toFixed(2)}`, { x: 20, y, size: 12, font })
    y -= 15
    page.drawText(`Paid: ${data.amountPaid.toFixed(2)} (${data.paymentMethod})`, { x: 20, y, size: 10, font })
    if (data.changeGiven) {
        y -= 12
        page.drawText(`Change: ${data.changeGiven.toFixed(2)}`, { x: 20, y, size: 10, font })
    }
    
    // Footer
    y -= 20
    page.drawText('================================', { x: 20, y, size: 10, font })
    y -= 12
    page.drawText('Thank you!', { x: 80, y, size: 10, font })
    
    return pdfDoc.save()
}
```

**Step 2: Add receipt generation to transactions**

```typescript
// In server/actions/transactions.ts:
import { generateReceiptPdf } from '@/utils/receipt-pdf'

export async function generateReceipt(transactionId: string): Promise<ActionResponse<{ pdf: Uint8Array; filename: string }>> {
    const txnResult = await getTransactionById(transactionId)
    if (!txnResult.success || !txnResult.data) {
        return failure('Transaction not found')
    }

    const { transaction, items } = txnResult.data

    const pdf = await generateReceiptPdf({
        transactionNumber: transaction.transaction_number,
        date: transaction.created_at,
        items: items.map(i => ({
            name: i.itemName || 'Unknown',
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            lineTotal: Number(i.lineTotal),
        })),
        subtotal: transaction.subtotal,
        tax: transaction.tax_amount,
        discount: transaction.discount_amount,
        total: transaction.total,
        amountPaid: transaction.amount_paid,
        changeGiven: transaction.change_given,
        paymentMethod: transaction.payment_method,
    })

    return success({
        pdf,
        filename: `receipt-${transaction.transaction_number}.pdf`,
    })
}
```

**Step 3: Run lint and build**

```bash
bun add pdf-lib
bun run lint
bun run build
```

**Step 4: Commit**

```bash
git add utils/receipt-pdf.ts server/actions/transactions.ts package.json
git commit -m "feat: add receipt PDF generation"
```

---

## Phase 7: Advanced Features

### Task 19: Refund Processing

**Files:**
- Modify: `server/actions/transactions.ts`
- Modify: `server/actions/accounting.ts`

**Step 1: Add refund function**

```typescript
// In server/actions/transactions.ts:

export async function refundTransaction(
    transactionId: string,
    reason: string,
    options?: { partialAmount?: number }
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const adminCheck = await canAccessAccounting(user)
    if (!adminCheck) {
        return failure('Only admins can process refunds')
    }

    return await withTransaction(async (tx) => {
        // Get original transaction
        const [originalTxn] = await tx
            .select()
            .from(transactions)
            .where(eq(transactions.id, transactionId))
            .limit(1)

        if (!originalTxn) {
            return failure('Transaction not found')
        }

        if (originalTxn.status === 'VOIDED' || originalTxn.status === 'REFUNDED') {
            return failure('Transaction already voided or refunded')
        }

        const refundAmount = options?.partialAmount || Number(originalTxn.total)

        // Create refund transaction
        const [refundTxn] = await tx
            .insert(transactions)
            .values({
                transactionNumber: `REFUND-${originalTxn.transactionNumber}`,
                staffId: user.id,
                branchId: originalTxn.branchId,
                subtotal: String(-refundAmount),
                taxAmount: '0',
                discountAmount: '0',
                total: String(-refundAmount),
                amountPaid: String(-refundAmount),
                paymentMethod: originalTxn.paymentMethod,
                status: 'REFUNDED',
                notes: `Refund for ${originalTxn.transactionNumber}: ${reason}`,
                createdBy: user.id,
            })
            .returning()

        // Void original transaction
        await tx
            .update(transactions)
            .set({ status: 'REFUNDED', voidedAt: new Date(), voidedBy: user.id, voidReason: reason })
            .where(eq(transactions.id, transactionId))

        // Create accounting entry for refund
        await createAutoLedgerEntry({
            type: 'REFUND',
            category: 'REFUNDS',
            description: `Refund: ${originalTxn.transactionNumber}`,
            reference: refundTxn.id,
            debit: 0,
            credit: refundAmount,
            sourceType: 'TRANSACTION',
            sourceId: transactionId,
            branchId: originalTxn.branchId,
        }, tx)

        return success(undefined)
    }, { action: 'ACCOUNTING', userId: user.id })
}
```

**Step 2: Run lint and build**

```bash
bun run lint
bun run build
```

**Step 3: Commit**

```bash
git add server/actions/transactions.ts server/actions/accounting.ts
git commit -m "feat: add refund processing with accounting integration"
```

---

### Task 20: Tax Withholding in Payroll

**Files:**
- Modify: `server/db/schema/payroll.ts`
- Modify: `server/actions/payroll.ts`

**Step 1: Add tax fields to payroll entries schema**

```typescript
// In payroll.ts schema:
taxRate: integer('tax_rate'), // Percentage
taxAmount: integer('tax_amount'), // Calculated tax
netAmount: integer('net_amount'), // After tax deduction
taxBracket: text('tax_bracket'), // Tax bracket name
```

**Step 2: Implement tax calculation**

```typescript
// In server/actions/payroll.ts:

interface TaxBracket {
    min: number
    max: number
    rate: number
    name: string
}

const TAX_BRACKETS: TaxBracket[] = [
    { min: 0, max: 10000, rate: 0, name: 'Zero' },
    { min: 10001, max: 30000, rate: 5, name: 'Basic' },
    { min: 30001, max: 50000, rate: 10, name: 'Standard' },
    { min: 50001, max: Infinity, rate: 15, name: 'Higher' },
]

function calculateTax(grossAmount: number): { rate: number; amount: number; bracket: string } {
    const bracket = TAX_BRACKETS.find(b => grossAmount >= b.min && grossAmount <= b.max)
        || TAX_BRACKETS[TAX_BRACKETS.length - 1]
    
    return {
        rate: bracket.rate,
        amount: Math.round(grossAmount * bracket.rate / 100),
        bracket: bracket.name,
    }
}
```

**Step 3: Update payroll entry creation**

```typescript
// In calculateAndCreatePayrollEntry:
const taxInfo = calculateTax(artistAmount)

const [entry] = await tx
    .insert(payrollEntries)
    .values({
        // ... existing fields
        artistAmount: artistAmount.toString(),
        taxRate: taxInfo.rate,
        taxAmount: taxInfo.amount.toString(),
        netAmount: (artistAmount - taxInfo.amount).toString(),
        taxBracket: taxInfo.bracket,
    })
    .returning()
```

**Step 4: Run migration and build**

```bash
bun run db:generate
bun run db:migrate
bun run lint
bun run build
```

**Step 5: Commit**

```bash
git add server/db/schema/payroll.ts server/actions/payroll.ts
git commit -m "feat: add tax withholding calculation to payroll"
```

---

### Task 21: Metrics Caching

**Files:**
- Create: `utils/cache.ts`
- Modify: `server/actions/metrics.ts`

**Step 1: Create simple in-memory cache utility**

```typescript
// utils/cache.ts
interface CacheEntry<T> {
    data: T
    timestamp: number
    ttl: number
}

class MemoryCache {
    private cache = new Map<string, CacheEntry<unknown>>()

    get<T>(key: string): T | null {
        const entry = this.cache.get(key)
        if (!entry) return null

        if (Date.now() > entry.timestamp + entry.ttl) {
            this.cache.delete(key)
            return null
        }

        return entry.data as T
    }

    set<T>(key: string, data: T, ttlMs: number): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttlMs,
        })
    }

    invalidate(pattern: string): void {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key)
            }
        }
    }
}

export const cache = new MemoryCache()
```

**Step 2: Apply caching to expensive metrics**

```typescript
// In server/actions/metrics.ts:
import { cache } from '@/utils/cache'

const METRICS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function getFinancialMetrics(): Promise<ActionResponse<FinancialMetrics>> {
    try {
        // Check cache first
        const cacheKey = 'financial_metrics'
        const cached = cache.get<FinancialMetrics>(cacheKey)
        if (cached) {
            return success(cached)
        }

        // ... existing calculation logic ...

        // Cache the result
        cache.set(cacheKey, metrics, METRICS_CACHE_TTL)

        return success(metrics)
    } catch (error) {
        // ... error handling
    }
}
```

**Step 3: Run lint and build**

```bash
bun run lint
bun run build
```

**Step 4: Commit**

```bash
git add utils/cache.ts server/actions/metrics.ts
git commit -m "feat: add in-memory caching for metrics"
```

---

## Phase 8: Polish

### Task 22: Setting Validation

**Files:**
- Modify: `server/actions/settings.ts`

**Step 1: Add setting validation schemas**

```typescript
// In server/actions/settings.ts:

const SETTING_VALIDATORS: Record<string, z.ZodSchema> = {
    'company.name': z.string().min(1).max(100),
    'company.email': z.string().email(),
    'company.phone': z.string().regex(/^[\d\s\-\+\(\)]+$/),
    'company.tax_rate': z.number().min(0).max(100),
    'business_hours': z.record(z.object({
        open: z.string().regex(/^\d{2}:\d{2}$/),
        close: z.string().regex(/^\d{2}:\d{2}$/),
    })),
}

export async function updateSetting(
    key: string,
    value: unknown
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    // Validate if validator exists
    const validator = SETTING_VALIDATORS[key]
    if (validator) {
        const result = validator.safeParse(value)
        if (!result.success) {
            return failure(`Invalid value for ${key}: ${result.error.errors.map(e => e.message).join(', ')}`)
        }
    }

    // ... existing update logic
}
```

**Step 2: Run lint and build**

```bash
bun run lint
bun run build
```

**Step 3: Commit**

```bash
git add server/actions/settings.ts
git commit -m "feat: add setting validation"
```

---

### Task 23: Deduction/Advance Tracking

**Files:**
- Modify: `server/db/schema/payroll.ts`
- Modify: `server/actions/payroll.ts`

**Step 1: Add deductions table**

```typescript
// In server/db/schema/payroll.ts:
export const payrollDeductions = pgTable('payroll_deductions', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: text('user_id').notNull().references(() => user.id),
    type: text('type').notNull(), // ADVANCE, DEDUCTION, ADJUSTMENT
    amount: integer('amount').notNull(),
    reason: text('reason'),
    status: text('status').notNull().default('PENDING'), // PENDING, DEDUCTED, CANCELLED
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deductedAt: timestamp('deducted_at'),
})
```

**Step 2: Add deduction functions**

```typescript
// In server/actions/payroll.ts:

export async function createAdvance(
    userId: string,
    amount: number,
    reason: string
): Promise<ActionResponse<void>> {
    // Create advance record
    // Schedule deduction from future payroll
}

export async function applyDeductions(
    userId: string,
    payrollAmount: number
): Promise<{ netAmount: number; deductions: Deduction[] }> {
    // Calculate and apply pending deductions
}
```

**Step 3: Run migration and build**

```bash
bun run db:generate
bun run db:migrate
bun run lint
bun run build
```

**Step 4: Commit**

```bash
git add server/db/schema/payroll.ts server/actions/payroll.ts
git commit -m "feat: add deduction/advance tracking for payroll"
```

---

### Task 24: Final Verification

**Files:**
- None (verification only)

**Step 1: Run all tests**

```bash
bun run lint
bun run build
bun run typecheck
```

**Step 2: Run database migrations**

```bash
bun run db:migrate
```

**Step 3: Create summary commit**

```bash
git add -A
git commit -m "chore: final verification for business logic integration

- Transaction→Accounting integration
- Transaction→Payroll integration  
- Accounting balance validation
- Appointment double-booking prevention
- Staff availability checking
- Stock reservation system
- Rate versioning for payroll
- Password strength validation
- User activity audit
- Branch-user assignment
- Period locking for accounting
- Working hours validation
- Ratings table
- Reviews table
- Notification system
- Appointment items integration
- Reorder point automation
- Receipt generation
- Refund processing
- Tax withholding
- Metrics caching
- Setting validation
- Deduction tracking"
```

---

## Summary

This plan addresses all 23+ identified business logic gaps across 8 phases:

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-3 | Critical integrations |
| 2 | 4-6 | Appointment validation |
| 3 | 7-9 | Data integrity |
| 4 | 10-12 | Branch & settings |
| 5 | 13-15 | Missing tables |
| 6 | 16-18 | Enhancements |
| 7 | 19-21 | Advanced features |
| 8 | 22-24 | Polish & verification |

**Execution:** Use `superpowers:executing-plans` skill to implement task-by-task. Each task has detailed steps, code samples, and verification steps.