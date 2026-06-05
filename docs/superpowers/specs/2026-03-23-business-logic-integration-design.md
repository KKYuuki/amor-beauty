# Business Logic Integration - Design Document

> **Goal:** Address all remaining business logic gaps to achieve production-ready status

> **Date:** 2026-03-23

---

## Executive Summary

This design addresses 23 identified business logic gaps across 9 feature areas. The gaps are organized into 5 phases based on priority and dependencies.

---

## Current State Analysis

### Already Working

| Feature | Location | Status |
|---------|----------|--------|
| Inventory Stock Deduction | `transactions.ts:146-161` | ✅ Implemented |
| Transaction Atomicity | `transactions.ts` with `withTransaction()` | ✅ Implemented |
| Soft Delete Pattern | All actions | ✅ Implemented |
| Audit Logging | `createLogs()` calls | ✅ Implemented |
| Permission Checking | `getCurrentUser()`, `isAdmin()` | ✅ Implemented |

### Critical Gaps (Must Fix)

| Gap | Location | Impact | Effort |
|-----|----------|--------|--------|
| Transaction→Accounting | `transactions.ts` | Sales don't create ledger entries | Medium |
| Transaction→Payroll | `transactions.ts` | Services don't create payroll entries | Medium |
| Accounting Balance | `accounting.ts` | Debits ≠ Credits not validated | Low |
| Double-Booking | `appointments.ts` | Overlapping appointments allowed | Medium |
| Staff Availability | `appointments.ts` | No working hours validation | Medium |

### Medium Priority (Should Fix)

| Gap | Location | Impact | Effort |
|-----|----------|--------|--------|
| Stock Reservation | `appointments.ts` | Inventory not held for appointments | Medium |
| Rate Versioning | `payroll.ts` | Historical calculations affected | Medium |
| Password Strength | `profile.ts` | Weak passwords allowed | Low |
| User Activity Audit | `profile.ts` | No login tracking | Medium |
| Branch-User Assignment | Schema + actions | Users not assigned to branches | Medium |
| Period Locking | `accounting.ts` | Past periods editable | Low |
| Working Hours | `appointments.ts` | No business hours check | Low |

### Low Priority (Nice to Have)

| Gap | Location | Impact | Effort |
|-----|----------|--------|--------|
| Notification System | `profile.ts` | No in-app notifications | High |
| Reorder Automation | `inventory.ts` | No auto-reorder | Medium |
| Refund Processing | `transactions.ts` | No refund logic | High |
| Receipt Generation | `transactions.ts` | No receipts | Medium |
| Tax Withholding | `payroll.ts` | No tax calc | Medium |
| Deduction Tracking | `payroll.ts` | No advances | Medium |
| Setting Validation | `settings.ts` | No format check | Low |
| Timezone/Branch | Multiple | Single timezone | Medium |
| Metrics Caching | `metrics.ts` | Expensive queries | Medium |
| Custom Dashboards | `metrics.ts` | Fixed views | High |

---

## Phase 1: Critical Integrations (Tasks 1-3)

### Architecture Overview

```
Transaction Created
       ↓
┌──────────────────────────────────────────────────────────────┐
│ withTransaction()                                              │
│   ├─ Create transaction record                                │
│   ├─ Create transaction items                                 │
│   ├─ Create transaction payments (if split)                  │
│   ├─ Deduct inventory stock ✅ (already implemented)         │
│   ├─ Create accounting entries ───→ generalLedger           │
│   │   └─ createAutoLedgerEntry()                              │
│   └─ Create payroll entries ──────→ payrollEntries          │
│       └─ calculateAndCreatePayrollEntry()                     │
└──────────────────────────────────────────────────────────────┘
```

### Task 1: Transaction→Accounting Integration

**Current State:** `createAutoLedgerEntry()` exists in `accounting.ts` but is never called from transactions.

**Required Changes:**
1. Import `createAutoLedgerEntry` in `transactions.ts`
2. After successful transaction creation, call:
```typescript
await createAutoLedgerEntry({
    type: 'REVENUE',
    category: 'SALES',
    description: `Sale: ${transactionNumber}`,
    reference: newTransaction.id,
    debit: payload.total,  // Revenue increases
    credit: 0,
    sourceType: 'TRANSACTION',
    sourceId: newTransaction.id,
    branchId: payload.branch_id,
}, tx)
```

**Error Handling:** On failure, transaction should still succeed but log error (non-blocking).

### Task 2: Transaction→Payroll Integration

**Current State:** `calculateAndCreatePayrollEntry()` exists but never called from transactions.

**Required Changes:**
1. Import function in `transactions.ts`
2. After transaction creation, iterate items:
```typescript
for (const item of payload.items) {
    if (item.service_id) {
        await calculateAndCreatePayrollEntry({
            transactionId: newTransaction.id,
            serviceId: item.service_id,
            artistId: payload.staff_id,
            amount: item.line_total,
        }, tx)
    }
}
```

**Logic:**
- Only create payroll for SERVICES (not products/inventory)
- Use rate configuration to calculate shop/artist split
- Create PENDING payroll entry for later payout

### Task 3: Accounting Balance Validation

**Current State:** No validation that debits equal credits in ledger entries.

**Required Changes:**
1. Add validation in `createLedgerEntry()`:
```typescript
// Single entry must have at least one non-zero
if (debit === 0 && credit === 0) {
    return failure('Entry must have non-zero debit or credit')
}

// For balanced entries, track running balance
// This requires storing entries in a batch or tracking
```

**Implementation Approach:**
- Option A: Single-entry validation (debit OR credit non-zero)
- Option B: Double-entry validation (require offsetting entry)
- **Recommendation:** Option A for now, Option B as enhancement

---

## Phase 2: Appointment Validation (Tasks 4-6)

### Task 4: Double-Booking Prevention

**Add overlap detection:**
```typescript
async function checkAppointmentOverlap(
    staffId: string,
    startTime: Date,
    endTime: Date,
    excludeId?: string
): Promise<boolean> {
    const overlapping = await db
        .select()
        .from(appointments)
        .where(and(
            eq(appointments.staffId, staffId),
            ne(appointments.status, 'CANCELLED'),
            or(
                and(
                    lte(appointments.startTime, startTime),
                    gte(appointments.endTime, startTime)
                ),
                and(
                    lte(appointments.startTime, endTime),
                    gte(appointments.endTime, endTime)
                )
            ),
            excludeId ? ne(appointments.id, excludeId) : undefined
        ))
        .limit(1)
    
    return overlapping.length === 0
}
```

### Task 5: Staff Availability Check

**Check against schedule:**
1. Add `staffSchedules` table if not exists
2. Query schedule for staff member + day of week
3. Validate appointment time falls within working hours

### Task 6: Stock Reservation System

**New table needed:**
```typescript
// schema/inventory.ts
export const stockReservations = pgTable('stock_reservations', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    inventoryId: text('inventory_id').notNull().references(() => inventory.id),
    appointmentId: text('appointment_id').notNull().references(() => appointments.id),
    quantity: integer('quantity').notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING, CONFIRMED, RELEASED
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'), // Auto-release if not confirmed
})
```

---

## Phase 3: Data Integrity (Tasks 7-9)

### Task 7: Rate Versioning

**Problem:** Rate changes affect historical payroll calculations.

**Solution:** Store rate snapshot WITH payroll entry:
```typescript
// payroll.ts - payrollEntries table
artistRateSnapshot: jsonb('artist_rate_snapshot'), // Store full rate config
shopRateSnapshot: jsonb('shop_rate_snapshot'),
rateVersion: integer('rate_version'),
```

### Task 8: Password Strength Validation

**Add Zod schema:**
```typescript
const PasswordSchema = z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[a-z]/, 'Password must contain lowercase letter')
    .regex(/[0-9]/, 'Password must contain number')
```

### Task 9: User Activity Audit

**Create login tracking:**
```typescript
// schema/auth.ts - add to user table
lastLoginAt: timestamp('last_login_at'),
loginCount: integer('login_count').default(0),
failedLoginAttempts: integer('failed_login_attempts').default(0),

// Create audit log on login
await createLogs({
    logs: [{ level: 'INFO', type: 'AUTH', message: `User logged in: ${userId}` }]
})
```

---

## Phase 4: Branch & Settings (Tasks 10-12)

### Task 10: Branch-User Assignment

**Add to schema:**
```typescript
// auth.ts - add to user table
branchIds: jsonb('branch_ids').$type<string[]>(), // Array of branch IDs

// Create assignment function
async function assignUserToBranch(userId: string, branchId: string)
```

### Task 11: Period Locking

**Add to accounting:**
```typescript
// settings.ts - add system setting
await updateSetting('accounting_period_locked', JSON.stringify({
    locked: false,
    lockedUntil: null,
    lockedBy: null
}))

// accounting.ts - check before edit
if (await isPeriodLocked(entryDate)) {
    return failure('This accounting period is locked')
}
```

### Task 12: Working Hours Validation

**Add business hours check:**
```typescript
// settings.ts - store business hours
businessHours: jsonb('business_hours').$type<{
    [day: number]: { open: string; close: string }
}>(),

// appointments.ts - validate
const businessHours = await getSetting('business_hours')
if (!isWithinBusinessHours(startTime, endTime, businessHours)) {
    return failure('Appointment outside business hours')
}
```

---

## Phase 5: Missing Tables & Stubs (Tasks 13-15)

### Task 13: Ratings Table

**Create schema:**
```typescript
export const ratings = pgTable('ratings', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    appointmentId: text('appointment_id').references(() => appointments.id),
    customerId: text('customer_id'),
    staffId: text('staff_id').notNull(),
    rating: integer('rating').notNull(), // 1-5
    comment: text('comment'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

### Task 14: Reviews Table

**Create schema:**
```typescript
export const reviews = pgTable('reviews', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    appointmentId: text('appointment_id').references(() => appointments.id),
    authorId: text('author_id').notNull(),
    type: text('type').notNull(), // ARTIST, SHOP, SERVICE
    content: text('content').notNull(),
    isPublic: boolean('is_public').default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
})
```

### Task 15: Notification System

**Create schema and actions:**
```typescript
export const notifications = pgTable('notifications', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: text('user_id').notNull().references(() => user.id),
    type: text('type').notNull(), // SYSTEM, APPOINTMENT, PAYROLL, etc.
    title: text('title').notNull(),
    message: text('message').notNull(),
    data: jsonb('data'), // Additional context
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Implement:
// - sendUserNotification()
// - sendBulkAppNotification()
// - getUserNotifications()
// - markNotificationRead()
```

---

## Phase 6: Enhancements (Tasks 16-18)

### Task 16: Appointment Items Integration

Connect appointments to inventory for stock reservation when appointment is booked.

### Task 17: Reorder Point Automation

Add low stock notifications when inventory falls below threshold.

### Task 18: Receipt Generation

Create PDF receipt generation for transactions.

---

## Phase 7: Advanced Features (Tasks 19-21)

### Task 19: Refund Processing

Add refund logic to transactions with accounting reversal.

### Task 20: Tax Withholding

Add tax calculation to payroll entries.

### Task 21: Metrics Caching

Add Redis/memory cache for expensive metric queries.

---

## Phase 8: Polish (Tasks 22-24)

### Task 22: Setting Validation

Add format validation to settings.

### Task 23: Deduction/Advance Tracking

Add payroll deductions/advances table and logic.

### Task 24: Custom Dashboards

Create user-configurable dashboard views.

---

## Implementation Order Rationale

1. **Critical First**: Integration gaps that affect daily operations
2. **Validation Second**: Business rules that prevent errors
3. **Data Integrity Third**: Historical accuracy and audit
4. **Infrastructure Fourth**: Missing tables and systems
5. **Enhancements Fifth**: Quality of life improvements
6. **Advanced Features Sixth**: Non-essential but valuable
7. **Polish Last**: Nice-to-have improvements

---

## Testing Strategy

Each task should include:
1. Unit tests for new functions
2. Integration tests for cross-feature interactions
3. Manual testing checklist
4. Regression test for existing functionality

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data migration issues | Medium | High | Backup before migration |
| Performance regression | Low | Medium | Add indexes, monitor queries |
| Breaking existing functionality | Medium | High | Comprehensive test coverage |
| Scope creep | High | Medium | Strict task boundaries |