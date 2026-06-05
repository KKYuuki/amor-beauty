# Full Logic Audit — Comprehensive Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perform a comprehensive audit and fix of all business logic issues across Accounting, Sales, Metrics, Payroll, Appointments, Branches, and Rate Levels modules, ensuring cross-module integration correctness and resolving all lint/build errors.

**Architecture:** Fix critical and high-severity issues first (race conditions, auth gaps, data integrity), then medium issues (type safety, validation), then low issues (naming, edge cases). Each task is self-contained and testable. Cross-module integration fixes come after individual module fixes.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Drizzle ORM, PostgreSQL, Supabase, Bun

---

## Chunk 1: Accounting Module — Critical Fixes

### Task 1: Add period lock check to `createAutoLedgerEntry`

**Files:**
- Modify: `server/actions/accounting.ts:581-662`

**Issue:** `createAutoLedgerEntry` bypasses the accounting period lock check that `createLedgerEntry` and `updateLedgerEntry` enforce. This allows transactions from payroll/sales to write into locked accounting periods, violating financial controls.

- [ ] **Step 1: Add `getAccountingPeriodLock` import and call**

In `createAutoLedgerEntry`, add a period lock check before the insert, matching the pattern in `createLedgerEntry` (lines 365-371):

```typescript
import { getAccountingPeriodLock } from './settings'

// Inside createAutoLedgerEntry, after entryData construction and before db.insert:
const periodLock = await getAccountingPeriodLock(entryData.entry_date)
if (periodLock && periodLock.is_locked) {
    return failure('Accounting period is locked for this date')
}
```

- [ ] **Step 2: Accept a `dbClient` parameter for transaction context**

Change `createAutoLedgerEntry` signature to accept an optional `dbClient` parameter (matching the `withTransaction` pattern), so callers inside a transaction can pass the transaction client:

```typescript
export async function createAutoLedgerEntry(
    entry: Omit<AutoLedgerEntry, 'id' | 'createdBy' | 'updatedBy'>,
    userId: string,
    dbClient?: TransactionClient
): Promise<ActionResponse<{ id: string }>>
```

Use `dbClient ?? db` for all DB operations within the function. This fixes the issue where `createAutoLedgerEntry` currently always uses the global `db`, breaking transaction atomicity when called from `sales.ts` and `payroll.ts`.

- [ ] **Step 3: Update all callers to optionally pass `dbClient`**

Update callers in:
- `server/actions/sales.ts` — pass `tx` from `withTransaction` block
- `server/actions/payroll.ts` — pass `tx` from `withTransaction` block
- `server/actions/payroll-disbursements.ts` — pass `tx` from withTransaction or the dynamic import context
- `server/actions/transactions.ts` — pass `tx` if inside a transaction
- `server/actions/inventory.ts` — pass `tx` if inside a transaction

- [ ] **Step 4: Verify with `bun run build`**

Run: `bun run build`
Expected: Build succeeds with no type errors

- [ ] **Step 5: Commit**

```bash
git add server/actions/accounting.ts server/actions/sales.ts server/actions/payroll.ts server/actions/payroll-disbursements.ts server/actions/transactions.ts server/actions/inventory.ts
git commit -m "fix(accounting): add period lock check and transaction context to createAutoLedgerEntry"
```

---

### Task 2: Fix running balance calculation in exports

**Files:**
- Modify: `server/actions/accounting.ts:1320-1412` (exportLedger)
- Modify: `server/actions/accounting.ts:1480-1573` (exportGroupedLedger)

**Issue:** Running balance is computed in `desc` order (newest first), producing a meaningless "reverse running balance." Running balance should be computed oldest-to-newest for accounting correctness.

- [ ] **Step 1: Fix `exportLedger` running balance**

In the `exportLedger` function, after fetching entries (currently ordered by `desc(generalLedger.entryDate)`), reverse them to compute running balance, then optionally reverse back for display:

```typescript
// Compute running balance oldest-to-newest
const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.entry_date!).getTime() - new Date(b.entry_date!).getTime()
)
let runningBalance = 0
for (const entry of sortedEntries) {
    const debit = Number(entry.debit) || 0
    const credit = Number(entry.credit) || 0
    runningBalance += credit - debit
    entry.running_balance = runningBalance
}
// Re-sort back to descending for display if needed
```

- [ ] **Step 2: Fix `exportGroupedLedger` running balance**

Apply the same fix in `exportGroupedLedger` where running balance is computed within each group:

```typescript
// Within each group, sort entries ascending by date for running balance
const groupEntries = [...group.entries].sort(
    (a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
)
let groupRunningBalance = 0
for (const entry of groupEntries) {
    const debit = Number(entry.debit) || 0
    const credit = Number(entry.credit) || 0
    groupRunningBalance += credit - debit
    entry.running_balance = groupRunningBalance
}
```

- [ ] **Step 3: Verify with `bun run build`**

Run: `bun run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): correct running balance calculation order in exports"
```

---

### Task 3: Validate debit/credit XOR constraint in `updateLedgerEntry`

**Files:**
- Modify: `server/actions/accounting.ts:664-824`

**Issue:** `updateLedgerEntry` allows partial updates that can result in entries with both debit and credit set to non-zero values, violating the accounting rule that only one side should have a value.

- [ ] **Step 1: Add validation function**

Add a helper function after `validateSingleEntry`:

```typescript
function validateDebitCreditXor(debit: number | null, credit: number | null): boolean {
    const d = Number(debit) || 0
    const c = Number(credit) || 0
    if (d !== 0 && c !== 0) return false
    if (d === 0 && c === 0) return false
    return true
}
```

- [ ] **Step 2: Apply validation in `updateLedgerEntry`**

After constructing `updateData` and before the `db.update()` call, validate the final state:

```typescript
const finalDebit = updateData.debit !== undefined ? Number(updateData.debit) : Number(current.debit) || 0
const finalCredit = updateData.credit !== undefined ? Number(updateData.credit) : Number(current.credit) || 0
if (!validateDebitCreditXor(finalDebit, finalCredit)) {
    return failure('A ledger entry must have either a debit or credit value, not both, and not neither')
}
```

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): enforce debit/credit XOR constraint on update"
```

---

### Task 4: Fix duplicate `isVoided = false` condition in `exportGroupedLedger`

**Files:**
- Modify: `server/actions/accounting.ts:1450-1470`

**Issue:** The query adds `eq(generalLedger.isVoided, false)` unconditionally at line 1453, then conditionally adds it again at lines 1467-1469 when `include_voided !== true`, resulting in a redundant WHERE clause.

- [ ] **Step 1: Remove the conditional duplicate**

Remove the existing unconditional `isVoided = false` at line 1453 and ensure only the conditional block handles this filter:

```typescript
const conditions = [eq(generalLedger.entryType, entryType)]
if (filters?.include_voided !== true) {
    conditions.push(eq(generalLedger.isVoided, false))
}
```

Apply this pattern consistently across all export type branches.

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): remove duplicate isVoided filter in grouped ledger export"
```

---

### Task 5: Fix category auto-creation race condition

**Files:**
- Modify: `server/actions/accounting.ts:376-409, 603-623, 744-773`

**Issue:** Category auto-creation uses a check-then-insert pattern that can fail under concurrent requests with a unique constraint violation from the `LOWER(name)` unique index.

- [ ] **Step 1: Wrap category auto-creation in try/catch with unique constraint detection**

Replace the check-then-insert pattern with a try/catch that handles the unique constraint violation gracefully. For example in `createLedgerEntry`:

```typescript
let categoryId = payload.category_id
if (!categoryId && payload.category) {
    try {
        const normalized = payload.category.trim().toLowerCase()
        const [existing] = await db
            .select({ id: accountingCategory.id })
            .from(accountingCategory)
            .where(eq(sql`LOWER(${accountingCategory.name})`, normalized))
            .limit(1)
        if (existing) {
            categoryId = existing.id
        } else {
            const [created] = await db.insert(accountingCategory).values({
                name: payload.category,
                type: payload.entry_type as any,
                isActive: true,
                createdBy: user.id,
                updatedBy: user.id,
            }).returning({ id: accountingCategory.id })
            categoryId = created.id
        }
    } catch (error: any) {
        // Handle unique constraint violation from concurrent insert
        if (error?.code === '23505') {
            const [existing] = await db
                .select({ id: accountingCategory.id })
                .from(accountingCategory)
                .where(eq(sql`LOWER(${accountingCategory.name})`, payload.category.trim().toLowerCase()))
                .limit(1)
            categoryId = existing?.id
        } else {
            throw error
        }
    }
}
```

Apply the same pattern to `createAutoLedgerEntry` (lines 603-623) and `updateLedgerEntry` (lines 744-773).

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): handle race condition in category auto-creation"
```

---

### Task 6: Add `categoryId` support to `createJournalEntry`

**Files:**
- Modify: `server/actions/accounting.ts:498-579`

**Issue:** `createJournalEntry` accepts `category` as a string but never resolves or sets `categoryId`, meaning journal entries lack proper FK references to the category table.

- [ ] **Step 1: Add category resolution inside the transaction**

For each `JournalEntryLine` that has a `category` string, resolve it to a `categoryId`:

```typescript
for (const line of lines) {
    let lineCategoryId = line.accountId || null
    if (!lineCategoryId && line.category) {
        const [existing] = await tx
            .select({ id: accountingCategory.id })
            .from(accountingCategory)
            .where(eq(sql`LOWER(${accountingCategory.name})`, line.category.trim().toLowerCase()))
            .limit(1)
        lineCategoryId = existing?.id || null
    }
    // ... insert with categoryId: lineCategoryId
}
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): resolve categoryId in journal entries"
```

---

### Task 7: Move `revalidatePath` and `cache.invalidate` outside transaction callbacks

**Files:**
- Modify: `server/actions/accounting.ts:564-575` (createJournalEntry)
- Modify: `server/actions/accounting.ts:651-652` (createAutoLedgerEntry)

**Issue:** `revalidatePath` and `cache.invalidate` are called inside `withTransaction` callbacks, which means they fire before the transaction commits. If the transaction later fails, the cache is already invalidated with stale data.

- [ ] **Step 1: Refactor `createJournalEntry` to move side effects after transaction**

```typescript
const result = await withTransaction(async (tx) => {
    // ... all DB operations ...
    return { entryIds }
})

if (result.success) {
    revalidatePath('/accounting')
    cache.invalidate(...)
}

return result
```

- [ ] **Step 2: Refactor `createAutoLedgerEntry` similarly**

If `dbClient` is passed (transaction context), skip `revalidatePath`/`cache.invalidate` inside the function — let the caller handle it after the outer transaction commits. If using global `db`, call side effects after the insert succeeds.

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): move cache invalidation outside transaction callbacks"
```

---

## Chunk 2: Sales Module — Critical Fixes

### Task 8: Fix race condition in duplicate transaction check

**Files:**
- Modify: `server/actions/sales.ts:57-69`
- Modify: `server/db/schema/transactions.ts` (add unique constraint)

**Issue:** The duplicate-transaction check for `createTransactionFromAppointment` is performed outside the `withTransaction` block. Two concurrent calls can both pass the check and create duplicate transactions.

- [ ] **Step 1: Add unique constraint on `appointments.id → transactions.appointmentId`**

In `server/db/schema/transactions.ts`, add a unique index on `appointmentId`:

```typescript
// In the transactions table definition, add:
appointmentId: text('appointment_id').references(() => appointments.id, { onDelete: 'set null' }),
// Then add a unique index:
// uniqueIndex('transactions_appointment_id_unique').on(table.appointmentId),
```

Generate a migration with `bun run drizzle-kit generate`.

- [ ] **Step 2: Move duplicate check inside the transaction**

In `createTransactionFromAppointment`, move the `getTransactionByAppointmentId` check inside the `withTransaction` callback:

```typescript
const result = await withTransaction(async (tx) => {
    // Inside transaction with row lock
    const existing = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.appointmentId, appointmentId))
        .limit(1)
    if (existing.length > 0) {
        return failure('Transaction already exists for this appointment')
    }
    // ... rest of transaction creation
})
```

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/sales.ts server/db/schema/transactions.ts drizzle/
git commit -m "fix(sales): prevent duplicate transactions with unique constraint and transaction-scoped check"
```

---

### Task 9: Move transaction items insert inside DB transaction

**Files:**
- Modify: `server/actions/sales.ts:145-240`

**Issue:** Transaction items, payroll entries, and accounting entries are created outside the `withTransaction` block. If any of these fail, the transaction record exists but is incomplete.

- [ ] **Step 1: Refactor `createTransactionFromAppointment` to do all inserts within transaction**

Move `db.insert(transactionItems)`, `calculateAndCreatePayrollEntry` calls, and `createAutoLedgerEntry` call inside the `withTransaction` callback. This requires passing `tx` as the db client to `createAutoLedgerEntry` (from Task 1) and handling payroll inside the transaction.

```typescript
const result = await withTransaction(async (tx) => {
    // 1. Check for duplicate (from Task 8)
    // 2. Create transaction header
    // 3. Create transaction items
    // 4. Create payroll entries (pass tx)
    // 5. Create accounting entry if applicable (pass tx)
    return { transactionId, transactionNumber }
})
```

- [ ] **Step 2: Handle partial payroll failures gracefully**

If a payroll entry creation fails for one service but succeeds for others, log the error and continue. The transaction should still succeed; payroll can be reconciled later:

```typescript
for (const service of appointmentServicesData) {
    try {
        await calculateAndCreatePayrollEntry({ ... }, tx)
    } catch (err) {
        await logError('Payroll creation failed for service', { serviceId: service.id, error: String(err) })
        // Continue — payroll can be fixed later
    }
}
```

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/sales.ts
git commit -m "fix(sales): move all inserts inside transaction for atomicity"
```

---

### Task 10: Fix client type inconsistency in payroll entry creation

**Files:**
- Modify: `server/actions/sales.ts:139, 201`

**Issue:** For transactions, `clientType` is set to `'WALKIN'` or `'PERSONAL'`, but for payroll entries it's `'WALKIN'` or `undefined`. The `undefined` path causes payroll to default to `'WALKIN'`, which is incorrect for personal (scheduled) appointments.

- [ ] **Step 1: Fix the `clientType` mapping**

In `createTransactionFromAppointment`, change line 201:

```typescript
// Before:
clientType: (appointment.isWalkin ? 'WALKIN' : undefined) as ClientType | undefined

// After:
clientType: appointment.isWalkin ? 'WALKIN' : 'PERSONAL'
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/sales.ts
git commit -m "fix(sales): pass PERSONAL clientType for scheduled appointments to payroll"
```

---

### Task 11: Add zero-amount transaction validation

**Files:**
- Modify: `server/actions/sales.ts:98-113`

**Issue:** If both services and items arrays are empty, a transaction with $0.00 total is created.

- [ ] **Step 1: Add validation at the start of `createTransactionFromAppointment`**

After assembling `appointmentServicesData` and `appointmentItemsData`, add:

```typescript
if (appointmentServicesData.length === 0 && appointmentItemsData.length === 0) {
    return failure('Cannot create a transaction with no services or items')
}
```

- [ ] **Step 2: Validate individual service/item prices**

After computing prices, add:

```typescript
const subtotal = transactionItemsData.reduce((sum, item) => sum + item.unit_price, 0)
if (subtotal <= 0) {
    return failure('Transaction total must be greater than zero')
}
```

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/sales.ts
git commit -m "fix(sales): validate non-zero transaction total before creation"
```

---

### Task 12: Fix stale prices in `createTransactionFromAppointment`

**Files:**
- Modify: `server/actions/sales.ts:98-108, 157-182`

**Issue:** The function uses live `servicePrice` from the services table instead of snapshot prices from the appointment. If a price changes between booking and checkout, the transaction uses the wrong amount.

- [ ] **Step 1: Use appointment-linked prices when available**

Modify the price resolution to prefer `appointmentServices.price` (if the appointment_services table stores a price snapshot) or fall back to `service.servicePrice`:

```typescript
const price = Number(appointmentService.price ?? service.servicePrice) || 0
```

Note: Check if `appointmentServices` table has a `price` column. If not, this requires a schema change to add one. Document this as a schema improvement needed for full price snapshot support.

- [ ] **Step 2: Add a TODO comment for the schema change if the price column doesn't exist**

If the `appointment_services` table lacks a price column, add:

```typescript
// TODO: Add price snapshot column to appointment_services table so that
// the transaction uses the price at booking time, not the current live price.
// Currently falls back to live service price.
const price = Number(service.servicePrice) || 0
```

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/sales.ts
git commit -m "fix(sales): document price snapshot requirement for appointment services"
```

---

## Chunk 3: Metrics Module — Critical Fixes

### Task 13: Fix `averageTicket` to count only revenue entries

**Files:**
- Modify: `server/actions/metrics.ts:1957-1975`

**Issue:** `exportMetrics` counts ALL entry types (EXPENSE, ASSET, LIABILITY, EQUITY) in `transactionCount`, making `averageTicket` misleading. Only REVENUE entries should be counted.

- [ ] **Step 1: Filter entry types for transaction count**

In the `forEach` loop around line 1962, change the counting:

```typescript
let revenueEntryCount = 0
entries.forEach((entry) => {
    // ... existing accumulation logic ...
    if (entry.entryType === 'REVENUE') {
        revenueEntryCount++
    }
})
// Then compute:
averageTicket: totalRevenue > 0 && revenueEntryCount > 0
    ? totalRevenue / revenueEntryCount
    : 0,
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): count only revenue entries for averageTicket calculation"
```

---

### Task 14: Filter voided and cancelled entries from staff leaderboard

**Files:**
- Modify: `server/actions/metrics.ts:774-811`

**Issue:** `getStaffLeaderboard` includes PENDING, CANCELLED, and PAID payroll entries equally. Cancelled entries should be excluded.

- [ ] **Step 1: Add payment status filter**

Add `eq(payrollEntry.paymentStatus, 'PAID')` to the conditions:

```typescript
const conditions = [
    gte(payrollEntry.createdAt, startDate),
    lte(payrollEntry.createdAt, endDate),
    eq(payrollEntry.paymentStatus, 'PAID'),
]
if (branchId) {
    conditions.push(/* existing branch filter */)
}
```

- [ ] **Step 2: Also add `paymentStatus` filter to other metrics functions that query payroll**

Review all places where `payrollEntry` is queried and add status filters where appropriate.

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): exclude cancelled payroll entries from leaderboard"
```

---

### Task 15: Fix cache key to include user context

**Files:**
- Modify: `server/actions/metrics.ts` (all cache key constructions)

**Issue:** Cache keys don't differentiate by user permissions. Two users with different branch access requesting "all branches" metrics get the same cached result, potentially leaking cross-branch data.

- [ ] **Step 1: Add user ID to cache keys**

Modify all cache key constructions to include the user's ID or role:

```typescript
const cacheKey = `financial_metrics:${userId}:${startDate}:${endDate}:${branchId || 'all'}`
```

Apply this pattern to all functions that use the `cache`.

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): include user context in cache keys to prevent cross-branch data leaks"
```

---

### Task 16: Fix asset/liability/equity total calculations in P&L

**Files:**
- Modify: `server/actions/metrics.ts:1515-1524`

**Issue:** Asset totals use only `totalDebit` without subtracting `totalCredit` (contra-asset entries like accumulated depreciation are ignored). Same for liabilities and equity.

- [ ] **Step 1: Calculate net totals for A/L/E**

```typescript
const assetTotal = plTotals
    .filter(t => t.entryType === 'ASSET')
    .reduce((sum, t) => sum + (Number(t.totalDebit) || 0) - (Number(t.totalCredit) || 0), 0)
const liabilityTotal = plTotals
    .filter(t => t.entryType === 'LIABILITY')
    .reduce((sum, t) => sum + (Number(t.totalCredit) || 0) - (Number(t.totalDebit) || 0), 0)
const equityTotal = plTotals
    .filter(t => t.entryType === 'EQUITY')
    .reduce((sum, t) => sum + (Number(t.totalCredit) || 0) - (Number(t.totalDebit) || 0), 0)
```

This correctly computes net asset value (debit - credit for assets) and net liability/equity (credit - debit).

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): compute net A/L/E totals using debit-credit difference"
```

---

### Task 17: Fix date validation in metrics functions

**Files:**
- Modify: `server/actions/metrics.ts` (all functions accepting date parameters)

**Issue:** All functions accept `startDate`/`endDate` as strings and pass them to `new Date()` without validation. Invalid date strings produce `Invalid Date`, leading to empty or incorrect results.

- [ ] **Step 1: Add date validation helper**

```typescript
function validateDateRange(startDate?: string, endDate?: string): { start: Date; end: Date } | ActionResponse<never> {
    const start = startDate ? new Date(startDate) : undefined
    const end = endDate ? new Date(endDate) : undefined
    
    if ((start && isNaN(start.getTime())) || (end && isNaN(end.getTime()))) {
        return failure('Invalid date format. Use ISO 8601 format (YYYY-MM-DD)')
    }
    if (start && end && start > end) {
        return failure('Start date must be before or equal to end date')
    }
    
    return { start: start || defaultStart, end: end || defaultEnd }
}
```

- [ ] **Step 2: Apply validation in `getBusinessInsightsMetrics`, `getExecutiveAccountingMetrics`, `exportMetrics`, and `exportGroupedMetrics`**

Use the helper at the beginning of each function, returning the failure early if validation fails.

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): validate date range inputs"
```

---

### Task 18: Add branch filter to unbounded metrics queries

**Files:**
- Modify: `server/actions/metrics.ts:387-471` (getRatingMetrics)
- Modify: `server/actions/metrics.ts:851-933` (getAppointmentReviews)

**Issue:** When no `branchId` is provided, `getRatingMetrics` and `getAppointmentReviews` query ALL records with no constraint, which can return millions of rows in production.

- [ ] **Step 1: Add default date range constraints**

In `getRatingMetrics`, when `branchId` is not provided, add a default date range (e.g., last 12 months):

```typescript
const defaultStart = new Date()
defaultStart.setFullYear(defaultStart.getFullYear() - 1)
const startDate = start || defaultStart
```

- [ ] **Step 2: Same for `getAppointmentReviews`**

Add a default limit and date range when no filters are provided.

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): add default date ranges to unbounded queries"
```

---

## Chunk 4: Payroll Module — Critical Fixes

### Task 19: Fix tax bracket gaps

**Files:**
- Modify: `server/actions/payroll.ts:48-69`

**Issue:** `TAX_BRACKETS` has gaps between `max: 10000` and `min: 10001` (and 30000/30001, 50000/50001). Amounts like `10000.50` fall through all brackets.

- [ ] **Step 1: Fix bracket boundaries to be continuous**

```typescript
const TAX_BRACKETS = [
    { min: 0, max: 10000, rate: 0, label: 'Zero' },
    { min: 10000.01, max: 30000, rate: 0.05, label: 'Basic' },
    { min: 30000.01, max: 50000, rate: 0.10, label: 'Mid' },
    { min: 50000.01, max: Infinity, rate: 0.15, label: 'High' },
]
```

- [ ] **Step 2: Update `calculateTax` comparison to use `>=` and `<=`**

Ensure `grossAmount >= bracket.min && grossAmount <= bracket.max` works with the new boundaries.

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): close tax bracket gaps for floating-point amounts"
```

---

### Task 20: Fix `netAmount || staffCut` fallback in payroll totals

**Files:**
- Modify: `server/actions/payroll.ts:1029, 2360`

**Issue:** `Number(entry.netAmount || entry.staffCut)` treats `netAmount = "0"` (falsy) as missing, falling back to `staffCut` (gross). This overstates totals when tax brings net to zero.

- [ ] **Step 1: Replace `||` with nullish coalescing**

```typescript
// Before:
Number(entry.netAmount || entry.staffCut)

// After:
Number(entry.netAmount ?? entry.staffCut)
```

Apply at both locations (lines 1029 and 2360).

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): use nullish coalescing for netAmount fallback"
```

---

### Task 21: Wrap `confirmPayrollRequest` in a transaction

**Files:**
- Modify: `server/actions/payroll.ts:1142-1154`

**Issue:** `confirmPayrollRequest` updates `payrollRequest` status and then `payrollEntry` status in separate queries. If the second fails, the request is CONFIRMED but entries stay REQUESTED.

- [ ] **Step 1: Wrap both updates in `withTransaction`**

```typescript
export async function confirmPayrollRequest(requestId: string, notes?: string) {
    // ... auth check ...
    
    const result = await withTransaction(async (tx) => {
        await tx.update(payrollRequest)
            .set({ status: 'CONFIRMED', updatedAt: new Date() })
            .where(eq(payrollRequest.id, requestId))
        
        await tx.update(payrollEntry)
            .set({ paymentStatus: 'CONFIRMED', updatedAt: new Date() })
            .where(and(
                eq(payrollEntry.payrollRequestId, requestId),
                eq(payrollEntry.paymentStatus, 'REQUESTED')
            ))
        
        return success(undefined, 'Payroll request confirmed')
    })
    
    // ... invalidate cache after transaction ...
    return result
}
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): wrap confirmPayrollRequest in transaction for atomicity"
```

---

### Task 22: Fix `rateLevelId` null handling in rate lookup

**Files:**
- Modify: `server/actions/payroll.ts:287, 649`

**Issue:** `rateLevelId || ''` treats `null` rate levels as empty strings, which won't match any DB row. Rate lookups fail for staff without rate levels.

- [ ] **Step 1: Handle null rate levels correctly**

```typescript
// Before:
eq(payrollStaffRate.rateLevelId, payload.rate_level_id || '')

// After:
payload.rate_level_id
    ? eq(payrollStaffRate.rateLevelId, payload.rate_level_id)
    : isNull(payrollStaffRate.rateLevelId)
```

Apply at both locations (lines 287 and 649).

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): handle null rate level IDs in rate lookup queries"
```

---

### Task 23: Fix staggered disbursement completion skipping accounting

**Files:**
- Modify: `server/actions/payroll-disbursements.ts:97-116`

**Issue:** When disbursements total >= `totalStaffCut`, `createDisbursement` marks the request as COMPLETED and entries as PAID, but skips all accounting entries and deduction processing that `completePayrollRequest` would do.

- [ ] **Step 1: Call `completePayrollRequest` logic when disbursements complete**

Instead of duplicating the status updates, route through `completePayrollRequest`:

```typescript
// In createDisbursement, after checking that remaining after disbursement <= 0:
if (newDisbursed >= totalStaffCut) {
    // Delegate to completePayrollRequest which handles:
    // - Deductions
    // - Accounting entries
    // - Tax withholding ledger entries
    // - Status updates
    const completeResult = await completePayrollRequest(
        requestId,
        { payment_method: disbursement.payment_method, reference_number: disbursement.reference_number },
        userId
    )
    if (!completeResult.success) {
        await logError('Failed to complete payroll after final disbursement', { requestId, error: completeResult.error })
    }
}
```

- [ ] **Step 2: Add auth check to `createDisbursement`**

The function currently has no authentication check. Add `getCurrentUser()` and role check at the top.

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/payroll-disbursements.ts
git commit -m "fix(payroll): route disbursement completion through completePayrollRequest for proper accounting"
```

---

### Task 24: Wrap `createDisbursement` updates in a transaction

**Files:**
- Modify: `server/actions/payroll-disbursements.ts:81-115`

**Issue:** The disbursement INSERT, request UPDATE, and entries UPDATE are three separate queries. Any partial failure leaves inconsistent data.

- [ ] **Step 1: Wrap all three operations in `withTransaction`**

```typescript
const result = await withTransaction(async (tx) => {
    // 1. Insert disbursement
    const [newDisbursement] = await tx.insert(payrollDisbursement).values({...}).returning()
    
    // 2. If completion threshold reached, update request
    if (completed) {
        await tx.update(payrollRequest).set({ status: 'COMPLETED' }).where(eq(payrollRequest.id, requestId))
        await tx.update(payrollEntry).set({ paymentStatus: 'PAID' }).where(eq(payrollEntry.payrollRequestId, requestId))
    }
    
    return newDisbursement
})
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/payroll-disbursements.ts
git commit -m "fix(payroll): wrap disbursement creation in transaction for atomicity"
```

---

### Task 25: Add auth checks to `createPayrollEntry` and `calculateAndCreatePayrollEntry`

**Files:**
- Modify: `server/actions/payroll.ts:530, 611`

**Issue:** Both functions are exported server actions with no authentication check. Any client can call them.

- [ ] **Step 1: Add auth check to `createPayrollEntry`**

```typescript
export async function createPayrollEntry(payload: CreatePayrollEntryPayload) {
    const user = await getCurrentUser()
    if (!user) return failure('Authentication required')
    if (!isAdmin(user)) return failure('Admin access required')
    // ... rest of function
}
```

- [ ] **Step 2: Add internal-only marker to `calculateAndCreatePayrollEntry`**

Since this is called internally by `sales.ts`, add a comment marking it as internal-only and add `'use server'` exclusion or make it a non-exported function within the module. Alternatively, add auth but allow the caller to pass a system user ID:

```typescript
/**
 * INTERNAL USE ONLY — called from sales.ts transaction creation.
 * Not intended for direct client invocation.
 */
export async function calculateAndCreatePayrollEntry(
    input: PayrollEntryInput,
    dbClient?: TransactionClient
) {
    // Internal function — auth check happens at the calling action level
}
```

Move this function to a separate internal utility file (`server/actions/_internal/payroll-internal.ts`) if possible, or add a clear warning comment.

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): add auth checks to payroll entry creation functions"
```

---

### Task 26: Add rounding to `calculateAndCreatePayrollEntry`

**Files:**
- Modify: `server/actions/payroll.ts:670-673`

**Issue:** `shopCut` and `staffCut` are computed with floating-point division but never rounded, causing 0.01 cent drift that compounds.

- [ ] **Step 1: Round cuts to 2 decimal places**

```typescript
const shopCut = Math.round(amount * (shopPercentage / 100) * 100) / 100
const staffCut = Math.round(amount * (staffPercentage / 100) * 100) / 100
const taxAmount = Math.round(calculateTax(staffCut) * 100) / 100
const netAmount = Math.round((staffCut - taxAmount) * 100) / 100
```

Apply the same rounding pattern used in `calculatePayroll` (lines 1744-1745).

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): round split calculations to prevent floating-point drift"
```

---

### Task 27: Fix deductions not rolled back on payroll cancellation

**Files:**
- Modify: `server/actions/payroll.ts:1433-1513`

**Issue:** When a payroll request is cancelled, entries are set back to PENDING but deductions that were marked DEDUCTED during `completePayrollRequest` are not rolled back.

- [ ] **Step 1: Add deduction rollback in `cancelPayrollRequest`**

After setting entries back to PENDING, also revert any DEDUCTED deductions:

```typescript
// Revert deductions that were applied during completion
await tx.update(payrollDeduction)
    .set({ status: 'PENDING', updatedAt: new Date() })
    .where(and(
        eq(payrollDeduction.payrollRequestId, requestId),
        eq(payrollDeduction.status, 'DEDUCTED')
    ))
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): rollback deduction status on payroll cancellation"
```

---

### Task 28: Validate Zod schemas for all payroll mutation functions

**Files:**
- Modify: `server/actions/payroll.ts:259-346` (createStaffRate)
- Modify: `server/actions/payroll.ts:530-609` (createPayrollEntry)
- Modify: `server/actions/payroll.ts:1874-1934` (createAdvance)
- Modify: `server/actions/payroll.ts:1936-1997` (createDeduction)
- Modify: `server/actions/payroll.ts:2164-2214` (createScheduledPayment)

**Issue:** These functions have no Zod validation despite `payroll-schemas.ts` defining schemas for some of them. Other functions have no schemas at all.

- [ ] **Step 1: Apply `CreateStaffRateSchema` to `createStaffRate`**

```typescript
import { CreateStaffRateSchema } from './payroll-schemas'

export async function createStaffRate(payload: unknown) {
    const validation = CreateStaffRateSchema.safeParse(payload)
    if (!validation.success) {
        return failure(validation.error.issues.map(i => i.message).join(', '))
    }
    const data = validation.data
    // ... rest of function using validated data
}
```

- [ ] **Step 2: Create and apply Zod schemas for `createPayrollEntry`, `createAdvance`, `createDeduction`, `createScheduledPayment`**

Add new schemas to `payroll-schemas.ts`:

```typescript
export const CreatePayrollEntryInputSchema = z.object({
    staff_id: z.string().uuid(),
    gross_amount: z.number().positive(),
    service_type: ServiceTypeSchema,
    client_type: ClientTypeSchema,
    transaction_id: z.string().uuid().optional(),
    description: z.string().max(500).optional(),
    quantity: z.number().int().positive().default(1),
})

export const CreateAdvanceSchema = z.object({
    userId: z.string().uuid(),
    amount: z.number().positive(),
    reason: z.string().min(1).max(500),
    dueDate: z.string().optional(),
})

export const CreateDeductionSchema = z.object({
    userId: z.string().uuid(),
    amount: z.number().positive(),
    reason: z.string().min(1).max(500),
    type: z.enum(['ADVANCE', 'DEDUCTION', 'ADJUSTMENT']),
})

export const CreateScheduledPaymentSchema = z.object({
    userId: z.string().uuid(),
    amount: z.number().positive(),
    frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']),
    startDate: z.string(),
    endDate: z.string().optional(),
    reason: z.string().min(1).max(500),
})
```

- [ ] **Step 3: Apply `CreateDisbursementSchema` to `createDisbursement`**

The schema exists in `payroll-schemas.ts` but is never used. Apply it:

```typescript
import { CreateDisbursementSchema } from './payroll-schemas'

export async function createDisbursement(input: unknown) {
    const validation = CreateDisbursementSchema.safeParse(input)
    if (!validation.success) {
        return failure(validation.error.issues.map(i => i.message).join(', '))
    }
    // ...
}
```

- [ ] **Step 4: Verify with `bun run build`**

- [ ] **Step 5: Commit**

```bash
git add server/actions/payroll.ts server/actions/payroll-schemas.ts server/actions/payroll-disbursements.ts
git commit -m "fix(payroll): add Zod validation to all payroll mutation functions"
```

---

## Chunk 5: Appointments Module — Critical Fixes

### Task 29: Fix race condition in `updateAppointment`

**Files:**
- Modify: `server/actions/appointments.ts:834-1018`

**Issue:** The overlap check in `updateAppointment` is performed outside a transaction, creating a TOCTOU race condition.

- [ ] **Step 1: Wrap overlap check and update in `withTransaction`**

```typescript
export async function updateAppointment(id: string, payload: unknown) {
    // ... auth and validation ...
    
    const result = await withTransaction(async (tx) => {
        // Overlap and availability checks inside transaction
        if (needsOverlapCheck) {
            const overlapping = await tx.select(...)
                .from(appointments)
                .where(...)
            if (overlapping.length > 0) {
                return failure('Time slot overlaps with existing appointment')
            }
        }
        
        // Update inside transaction
        const [updated] = await tx.update(appointments)
            .set(updateData)
            .where(eq(appointments.id, id))
            .returning(...)
        
        return success(transformAppointment(updated))
    })
    
    // ... cache invalidation outside transaction ...
    return result
}
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "fix(appointments): wrap overlap check and update in transaction"
```

---

### Task 30: Fix `CANCELLED → PENDING/CONFIRMED` status transition

**Files:**
- Modify: `server/actions/appointments.ts:242-247`

**Issue:** The status transition validator allows `CANCELLED → CONFIRMED` and `CANCELLED → PENDING`, which could re-activate an appointment without checking time slot availability, inventory re-reservation, or linked transactions.

- [ ] **Step 1: Remove invalid transitions from CANCELLED**

Change the transition map:

```typescript
const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['COMPLETED', 'CANCELLED'],
    COMPLETED: ['CANCELLED'],   // Only allow cancellation, not re-activation
    CANCELLED: [],               // No transitions from CANCELLED — create a new appointment instead
}
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "fix(appointments): disallow re-activation of cancelled appointments"
```

---

### Task 31: Fix `getUnpaidAppointments` to actually filter unpaid

**Files:**
- Modify: `server/actions/appointments.ts:1770-1797`

**Issue:** The function name implies it returns unpaid appointments, but it returns all COMPLETED active appointments regardless of payment status.

- [ ] **Step 1: Add a LEFT JOIN to transactions and filter for unpaid**

```typescript
export async function getUnpaidAppointments(branchId?: string) {
    // ... auth check ...
    
    const appointments = await db
        .select({
            // ... appointment fields ...
        })
        .from(appointments)
        .leftJoin(transactions, eq(appointments.id, transactions.appointmentId))
        .where(and(
            eq(appointments.isActive, true),
            eq(appointments.status, 'COMPLETED'),
            isNull(transactions.id)  // No transaction exists
        ))
    
    return success(appointments)
}
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "fix(appointments): filter unpaid appointments by checking for linked transactions"
```

---

### Task 32: Add inventory reservation release on cancellation/deletion

**Files:**
- Modify: `server/actions/appointments.ts:1027-1059` (deleteAppointment)
- Modify: `server/actions/appointments.ts:834-1018` (updateAppointment — status transition)

**Issue:** When an appointment is cancelled or deleted, inventory reservations created during booking are never released.

- [ ] **Step 1: Add reservation release in `updateAppointment` when status changes to CANCELLED**

```typescript
// Inside the status transition handler:
if (newStatus === 'CANCELLED') {
    // Release reserved inventory
    const items = await db.select()
        .from(appointmentItems)
        .where(eq(appointmentItems.appointmentId, id))
    
    for (const item of items) {
        await db.update(inventory)
            .set({ currentStock: sql`${inventory.currentStock} + ${item.quantity}` })
            .where(eq(inventory.id, item.inventoryId))
    }
    
    // Delete reservation records
    await db.delete(stockReservations)
        .where(eq(stockReservations.appointmentId, id))
}
```

- [ ] **Step 2: Add same logic in `deleteAppointment`**

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "fix(appointments): release inventory reservations on cancellation/deletion"
```

---

### Task 33: Fix inconsistent return types for appointment actions

**Files:**
- Modify: `server/actions/appointments.ts:686-832` (createAppointment)
- Modify: `server/actions/appointments.ts:1636-1764` (createWalkinAppointment)
- Modify: `server/actions/appointments.ts:1134-1199` (createAppointmentDetails)

**Issue:** Different functions return different response shapes, making error handling inconsistent for clients.

- [ ] **Step 1: Make `createAppointment` return `ActionResponse<Appointment>`**

Replace the mixed return type:

```typescript
// Before: { success: false, validationErrors, error } or { success: true, data }
// After: consistent ActionResponse

if (!validation.success) {
    return failure(validation.error.issues.map(i => i.message).join(', '))
}
// ... always return success(data) or failure(message)
```

- [ ] **Step 2: Make `createWalkinAppointment` return `ActionResponse<Appointment>`**

Change the custom `{ success: boolean; appointment?; message? }` shape to `ActionResponse<Appointment>`.

- [ ] **Step 3: Make `createAppointmentDetails` return `ActionResponse<{ id: string }>`

- [ ] **Step 4: Verify with `bun run build`**

Note: This may require updates to callers in the frontend components. Check all components that call these functions and update them to handle the new response format.

- [ ] **Step 5: Commit**

```bash
git add server/actions/appointments.ts components/appointments/
git commit -m "fix(appointments): normalize return types to ActionResponse<T>"
```

---

## Chunk 6: Branches & Rate Levels — Critical Fixes

### Task 34: Add authentication to rate-levels actions

**Files:**
- Modify: `server/actions/rate-levels.ts:23-117`

**Issue:** Zero auth checks on any rate-levels function. Any client can create, update, deactivate, or delete rate levels.

- [ ] **Step 1: Add auth check to all write operations**

```typescript
import { getCurrentUser, isAdmin } from '@/utils/auth/permissions'

export async function createRateLevel(payload: { name: string; sort_order?: number }) {
    const user = await getCurrentUser()
    if (!user) return failure('Authentication required')
    if (!isAdmin(user)) return failure('Admin access required')
    // ... rest
}

export async function updateRateLevel(payload: Record<string, unknown>) {
    const user = await getCurrentUser()
    if (!user) return failure('Authentication required')
    if (!isAdmin(user)) return failure('Admin access required')
    // ... rest
}

export async function deactivateRateLevel(id: string) {
    const user = await getCurrentUser()
    if (!user) return failure('Authentication required')
    if (!isAdmin(user)) return failure('Admin access required')
    // ... rest
}

export async function deleteRateLevel(id: string) {
    const user = await getCurrentUser()
    if (!user) return failure('Authentication required')
    if (!isAdmin(user)) return failure('Admin access required')
    // ... rest
}
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/rate-levels.ts
git commit -m "fix(rate-levels): add authentication and admin authorization to all write operations"
```

---

### Task 35: Fix rate-level deletion race condition and missing checks

**Files:**
- Modify: `server/actions/rate-levels.ts:104-117`

**Issue:** `deleteRateLevel` has a check-then-delete race condition, doesn't check `payrollEntry.staffRateSnapshot.rateLevelId` (JSONB), and doesn't wrap in a transaction.

- [ ] **Step 1: Wrap check-then-delete in `withTransaction`**

```typescript
export async function deleteRateLevel(id: string) {
    const user = await getCurrentUser()
    if (!user) return failure('Authentication required')
    if (!isAdmin(user)) return failure('Admin access required')
    
    const result = await withTransaction(async (tx) => {
        // Check for active payroll staff rate references
        const staffRateRefs = await tx.select({ id: payrollStaffRate.id })
            .from(payrollStaffRate)
            .where(eq(payrollStaffRate.rateLevelId, id))
            .limit(1)
        
        if (staffRateRefs.length > 0) {
            return failure('Cannot delete rate level: it is referenced by active payroll staff rates')
        }
        
        // Check for user references
        const userRefs = await tx.select({ id: user.id })
            .from(user)
            .where(eq(user.rateLevelId, id))
            .limit(1)
        
        if (userRefs.length > 0) {
            return failure('Cannot delete rate level: it is assigned to users')
        }
        
        await tx.delete(rateLevels).where(eq(rateLevels.id, id))
        return success(undefined, 'Rate level deleted')
    })
    
    return result
}
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/rate-levels.ts
git commit -m "fix(rate-levels): wrap deletion in transaction with proper reference checks"
```

---

### Task 36: Add input sanitization to rate-levels

**Files:**
- Modify: `server/actions/rate-levels.ts:45-66`

**Issue:** `createRateLevel` inserts `name` without sanitization, and `slugify` can produce empty strings.

- [ ] **Step 1: Import and use sanitization**

```typescript
import { sanitizeText, sanitizeMinimal } from '@/utils/sanitize'

export async function createRateLevel(payload: { name: string; sort_order?: number }) {
    // ... auth check ...
    
    const sanitizedName = sanitizeText(payload.name)
    if (!sanitizedName || sanitizedName.trim().length < 2) {
        return failure('Rate level name must be at least 2 characters')
    }
    
    const slug = slugify(sanitizedName)
    if (!slug) {
        return failure('Rate level name must contain alphanumeric characters')
    }
    
    // ... insert with sanitizedName ...
}
```

- [ ] **Step 2: Add sanitization to `updateRateLevel` as well**

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/rate-levels.ts
git commit -m "fix(rate-levels): add input sanitization and name validation"
```

---

### Task 37: Fix `archiveBranch` to check downstream dependencies

**Files:**
- Modify: `server/actions/branches.ts:352-403`

**Issue:** Archiving a branch doesn't check for active appointments, pending transactions, or open ledger entries.

- [ ] **Step 1: Add dependency checks before archiving**

```typescript
export async function archiveBranch(id: string) {
    // ... auth check ...
    
    // Check for active appointments
    const activeAppointments = await db.select({ id: appointments.id })
        .from(appointments)
        .where(and(eq(appointments.branchId, id), eq(appointments.isActive, true)))
        .limit(1)
    
    if (activeAppointments.length > 0) {
        return failure('Cannot archive branch: it has active appointments. Reassign or cancel them first.')
    }
    
    // Check for pending transactions
    const pendingTransactions = await db.select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.branchId, id), eq(transactions.status, 'PENDING')))
        .limit(1)
    
    if (pendingTransactions.length > 0) {
        return failure('Cannot archive branch: it has pending transactions.')
    }
    
    // ... proceed with archive ...
}
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/branches.ts
git commit -m "fix(branches): check downstream dependencies before archiving"
```

---

### Task 38: Validate branch existence in `assignUserToBranch`

**Files:**
- Modify: `server/actions/branches.ts:466-519`

**Issue:** No validation that `branchId` exists or is active before assigning a user to it.

- [ ] **Step 1: Add branch validation**

```typescript
export async function assignUserToBranch(userId: string, branchId: string) {
    // ... auth check ...
    
    // Validate branch exists and is active
    const [branch] = await db.select({ id: branches.id, isActive: branches.isActive })
        .from(branches)
        .where(eq(branches.id, branchId))
        .limit(1)
    
    if (!branch) {
        return failure('Branch not found')
    }
    if (!branch.isActive) {
        return failure('Cannot assign user to an archived branch')
    }
    
    // ... rest of function ...
}
```

- [ ] **Step 2: Same for `unassignUserFromBranch`** — validate the user exists at minimum.

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/branches.ts
git commit -m "fix(branches): validate branch existence before user assignment"
```

---

### Task 39: Clean up `user.branch_ids` on branch archive

**Files:**
- Modify: `server/actions/branches.ts:352-403`

**Issue:** When a branch is archived, the `user.branch_ids` JSON array still references the branch UUID. No cleanup occurs.

- [ ] **Step 1: After archiving, remove the branch UUID from all users' `branch_ids` arrays**

```typescript
// After successful archive:
const allUsers = await db.select({ id: user.id, branchIds: user.branchIds })
    .from(user)

for (const u of allUsers) {
    if (u.branchIds && Array.isArray(u.branchIds) && u.branchIds.includes(id)) {
        const updatedBranchIds = u.branchIds.filter((bid: string) => bid !== id)
        await db.update(user)
            .set({ branchIds: updatedBranchIds })
            .where(eq(user.id, u.id))
    }
}
```

Note: This could be slow for large user counts. Consider a batch approach or SQL `jsonb_set` operation.

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/branches.ts
git commit -m "fix(branches): clean up user.branch_ids when archiving a branch"
```

---

## Chunk 7: Cross-Module Integration Fixes

### Task 40: Create appointment-completion hook for sales integration

**Files:**
- Create: `server/actions/_internal/on-appointment-complete.ts`
- Modify: `server/actions/appointments.ts` (call the hook)

**Issue:** Completing an appointment creates no transaction, no payroll entry, and no accounting entry. The UI must manually trigger `createTransactionFromAppointment`.

- [ ] **Step 1: Create an internal hook module**

```typescript
// server/actions/_internal/on-appointment-complete.ts
'use server'

import { createTransactionFromAppointment } from '../sales'

export async function onAppointmentCompleted(appointmentId: string) {
    try {
        const result = await createTransactionFromAppointment(appointmentId)
        if (!result.success) {
            console.error(`Failed to create transaction for appointment ${appointmentId}:`, result.error)
            // Don't fail the appointment status change — transaction can be created manually
        }
    } catch (error) {
        console.error(`Error creating transaction for appointment ${appointmentId}:`, error)
    }
}
```

- [ ] **Step 2: Call the hook from `updateAppointment` when status changes to COMPLETED**

```typescript
// Inside updateAppointment, after status update:
if (validated.data.status === 'COMPLETED') {
    // Fire and forget — don't block the status update
    onAppointmentCompleted(id).catch(err => {
        console.error('Failed to auto-create transaction:', err)
    })
}
```

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/_internal/ server/actions/appointments.ts
git commit -m "feat(appointments): add auto-transaction creation on appointment completion"
```

---

### Task 41: Fix `voidLedgerEntry` to handle source references

**Files:**
- Modify: `server/actions/accounting.ts:826-912`

**Issue:** Voiding a ledger entry created from a transaction (source_type = 'TRANSACTION') doesn't notify or update the source. This causes discrepancies between transaction amounts and ledger totals.

- [ ] **Step 1: Add source notification/reversal logic**

```typescript
// After voiding the ledger entry:
if (entry.sourceType === 'TRANSACTION' && entry.sourceId) {
    // Log that the associated transaction now lacks its ledger entry
    await createLogs({
        logs: [{
            level: 'WARNING',
            message: `Ledger entry for transaction ${entry.sourceId} has been voided. Manual reconciliation may be needed.`,
            userId: user.id,
        }]
    })
    // Optionally: mark the transaction as needing reconciliation
}
```

For now, add a warning log. A full reversal system (voiding the transaction when the ledger entry is voided) would require more design work.

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): add source notification when voiding ledger entries"
```

---

### Task 42: Fix `exportLedger` to join with branches table

**Files:**
- Modify: `server/actions/accounting.ts:1322-1412`

**Issue:** The non-grouped `exportLedger` hardcodes `branch: 'Shared'` and `branchCode: ''` regardless of the entry's actual branch. Only `exportGroupedLedger` properly joins the branches table.

- [ ] **Step 1: Add LEFT JOIN to branches in `exportLedger`**

```typescript
// In the query builder for exportLedger:
const entries = await db
    .select({
        // ... existing fields ...
        branchName: branches.name,
        branchCode: branches.code,
    })
    .from(generalLedger)
    .leftJoin(branches, eq(generalLedger.branchId, branches.id))
    .where(and(...conditions))
    .orderBy(desc(generalLedger.entryDate))
```

- [ ] **Step 2: Update the mapping to use actual branch data**

```typescript
branch: entry.branchName || 'Shared',
branchCode: entry.branchCode || '',
```

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): join with branches table in ledger export for correct branch names"
```

---

### Task 43: Normalize `payment_method` in `getDisbursements`

**Files:**
- Modify: `server/actions/payroll-disbursements.ts:187-219`

**Issue:** `getDisbursements` returns raw `paymentMethod` values without applying `normalizePayrollPaymentMethod`, so `BANK` values pass through unnormalized (should become `BANK_TRANSFER`).

- [ ] **Step 1: Apply normalization in the mapping**

```typescript
import { normalizePayrollPaymentMethod } from '@/utils/types/payment'

// In the mapping:
paymentMethod: normalizePayrollPaymentMethod(r.paymentMethod as string) as PayrollPaymentMethod,
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/payroll-disbursements.ts
git commit -m "fix(payroll): normalize payment method in getDisbursements"
```

---

### Task 44: Fix `revalidatePath` called after partial failures in `createTransactionFromAppointment`

**Files:**
- Modify: `server/actions/sales.ts:253-254`

**Issue:** `revalidatePath` is called unconditionally even if payroll or accounting creation failed.

- [ ] **Step 1: Only revalidate on full success**

```typescript
if (result.success) {
    revalidatePath('/sales')
    revalidatePath('/appointments')
}
return result
```

- [ ] **Step 2: Await `createLogs` call**

```typescript
// Line 243: Change createLogs to awaited
await createLogs({ logs: [...] })
```

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/sales.ts
git commit -m "fix(sales): only revalidate cache on full success and await createLogs"
```

---

## Chunk 8: Type Safety & Validation Improvements

### Task 45: Add branch filter validation for metrics

**Files:**
- Modify: `server/actions/metrics.ts`

**Issue:** The `paymentMethod` parameter in `fetchGeneralLedgerAggregates` is not validated against the allowed enum values.

- [ ] **Step 1: Add validation**

```typescript
const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'GCASE', 'CRYPTO'] as const

function validatePaymentMethod(method: string | undefined): AccountingPaymentMethod | undefined {
    if (!method) return undefined
    if (!VALID_PAYMENT_METHODS.includes(method as any)) {
        throw new Error(`Invalid payment method: ${method}`)
    }
    return method as AccountingPaymentMethod
}
```

Use this in `fetchGeneralLedgerAggregates` and any other function accepting `paymentMethod` as a parameter.

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): validate payment method parameter"
```

---

### Task 46: Remove unsafe `as` type casts throughout modules

**Files:**
- Modify: `server/actions/accounting.ts` (lines 223, 229, 240, etc.)
- Modify: `server/actions/payroll.ts` (lines 99, 427, 496, 568, etc.)
- Modify: `server/actions/appointments.ts` (lines 170, 172, 203, etc.)
- Modify: `server/actions/metrics.ts` (lines 920, etc.)

**Issue:** Many locations cast DB string fields to TypeScript union types without runtime validation.

- [ ] **Step 1: Create a validation helper module**

```typescript
// utils/validate-enums.ts
import { LedgerEntryType, LedgerSourceType, AccountingPaymentMethod } from '@/utils/types/payment'
import { AppointmentStatus, AppointmentType } from '@/utils/types/general'
import { ClientType, PaymentMethod as PayrollPaymentMethod } from '@/utils/types/payroll'

const LEDGER_ENTRY_TYPES = new Set<string>(['EXPENSE', 'REVENUE', 'ASSET', 'LIABILITY', 'EQUITY'])
const LEDGER_SOURCE_TYPES = new Set<string>(['MANUAL', 'TRANSACTION', 'PAYROLL', 'INVENTORY', 'IMPORT'])
const ACCOUNTING_PAYMENT_METHODS = new Set<string>(['CASH', 'CARD', 'BANK_TRANSFER', 'GCASE', 'CRYPTO'])
const APPOINTMENT_STATUSES = new Set<string>(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'])
const APPOINTMENT_TYPES = new Set<string>(['TATTOO', 'PIERCING', 'SHOE', 'WALKIN'])
const CLIENT_TYPES = new Set<string>(['PERSONAL', 'WALKIN'])

export function parseLedgerEntryType(val: string | null): LedgerEntryType {
    if (val && LEDGER_ENTRY_TYPES.has(val)) return val as LedgerEntryType
    return 'REVENUE' // safe default
}

export function parseLedgerSourceType(val: string | null): LedgerSourceType | undefined {
    if (val && LEDGER_SOURCE_TYPES.has(val)) return val as LedgerSourceType
    return undefined
}

export function parseAccountingPaymentMethod(val: string | null): AccountingPaymentMethod | undefined {
    if (val && ACCOUNTING_PAYMENT_METHODS.has(val)) return val as AccountingPaymentMethod
    return undefined
}

export function parseAppointmentStatus(val: string): AppointmentStatus {
    if (APPOINTMENT_STATUSES.has(val)) return val as AppointmentStatus
    return 'PENDING'
}

export function parseAppointmentType(val: string | null): AppointmentType {
    if (val && APPOINTMENT_TYPES.has(val)) return val as AppointmentType
    return 'TATTOO'
}

export function parseClientType(val: string | null | undefined): ClientType {
    if (val && CLIENT_TYPES.has(val)) return val as ClientType
    return 'WALKIN'
}
```

- [ ] **Step 2: Replace `as` casts with parse functions**

Systematically replace all unsafe casts in the audited files. This is a large task — focus on the most impactful locations first:
- Accounting: entryType, sourceType, paymentMethod casts
- Payroll: clientType, paymentMode, status casts
- Appointments: status, type casts
- Metrics: type, review type casts

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add utils/validate-enums.ts server/actions/accounting.ts server/actions/payroll.ts server/actions/appointments.ts server/actions/metrics.ts
git commit -m "refactor: replace unsafe type casts with runtime-validated parse functions"
```

---

### Task 47: Fix `null` vs `undefined` inconsistency in accounting

**Files:**
- Modify: `server/actions/accounting.ts` (multiple lines)

**Issue:** DB fields that return `null` are coerced to `undefined` with `||`, which also converts `''` and `'0'` to `undefined`.

- [ ] **Step 1: Replace `|| undefined` with `?? undefined`**

Search and replace throughout `accounting.ts`:

```typescript
// Before:
entry.category || undefined
entry.sourceType || undefined

// After:
entry.category ?? undefined
entry.sourceType ?? undefined
```

This ensures that empty strings and `'0'` are not incorrectly converted to `undefined`.

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): use nullish coalescing instead of logical OR for null handling"
```

---

### Task 48: Add `emptyJournalLines` validation to `createJournalEntry`

**Files:**
- Modify: `server/actions/accounting.ts:498-579`

**Issue:** An empty `lines` array passes validation, creating a journal entry with zero entries.

- [ ] **Step 1: Add validation**

```typescript
if (!lines || lines.length === 0) {
    return failure('Journal entry must have at least one line')
}
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): reject empty journal entry lines"
```

---

### Task 49: Add pagination parameters validation to `getLedgerEntries`

**Files:**
- Modify: `server/actions/accounting.ts:114-259`

**Issue:** `page = 0` produces negative offset, and `pageSize = 0` returns no results. No validation exists.

- [ ] **Step 1: Add validation**

```typescript
const page = Math.max(1, Number(params.page) || 1)
const pageSize = Math.max(1, Math.min(100, Number(params.pageSize) || 50))
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): validate pagination parameters"
```

---

## Chunk 9: Medium & Low Priority Fixes

### Task 50: Normalize return types for rate-levels to use `ActionResponse`

**Files:**
- Modify: `server/actions/rate-levels.ts:23-43`

**Issue:** `getRateLevels` returns `RateLevelItem[]` directly instead of `ActionResponse<RateLevelItem[]>`, inconsistent with other modules.

- [ ] **Step 1: Wrap return values in `ActionResponse`**

```typescript
export async function getRateLevels(activeOnly = true): Promise<ActionResponse<RateLevelItem[]>> {
    try {
        const levels = await db.select(...).from(rateLevels)...
        return success(levels)
    } catch (error) {
        return failure('Failed to fetch rate levels')
    }
}
```

Apply to all functions: `getRateLevels`, `createRateLevel`, `updateRateLevel`, `deactivateRateLevel`, `deleteRateLevel`.

- [ ] **Step 2: Update callers in frontend components**

Search for `getRateLevels`, `createRateLevel`, etc. in the Payroll page components and update them to handle the `ActionResponse` wrapper.

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add server/actions/rate-levels.ts app/payroll/
git commit -m "refactor(rate-levels): normalize return types to ActionResponse"
```

---

### Task 51: Fix `updateBranch` silently ignoring `is_active`

**Files:**
- Modify: `server/actions/branches.ts:266-350`
- Modify: `utils/types/branch.ts:35`

**Issue:** `UpdateBranchPayload` includes `is_active?: boolean` but `updateBranch` never sets it. The type is misleading.

- [ ] **Step 1: Remove `is_active` from `UpdateBranchPayload`**

In `utils/types/branch.ts`:

```typescript
export interface UpdateBranchPayload {
    name?: string
    code?: string
    city?: string
    address?: string
    phone?: string
    // Remove is_active — use archiveBranch/restoreBranch instead
}
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add utils/types/branch.ts server/actions/branches.ts
git commit -m "fix(branches): remove misleading is_active from UpdateBranchPayload"
```

---

### Task 52: Add `createdBy` audit trail to `createRateLevel`

**Files:**
- Modify: `server/actions/rate-levels.ts:45-66`

**Issue:** The `rate_levels` schema has a `created_by` column but `createRateLevel` never sets it.

- [ ] **Step 1: Set `createdBy` on creation**

```typescript
const [newLevel] = await db.insert(rateLevels).values({
    name: sanitizedName,
    slug: slug,
    isActive: true,
    sortOrder: payload.sort_order ?? 0,
    createdBy: user.id,
}).returning(...)
```

Add `getCurrentUser()` call at the start of the function (from Task 34).

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/rate-levels.ts
git commit -m "fix(rate-levels): set createdBy on rate level creation"
```

---

### Task 53: Fix `slugify` to handle edge cases in rate-levels

**Files:**
- Modify: `server/actions/rate-levels.ts:16-21`

**Issue:** `slugify` can produce empty strings for names with only special characters (e.g., `"@@@"` → `""`), causing DB constraint violations.

- [ ] **Step 1: Add fallback and validation**

```typescript
function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
}

// In createRateLevel, after slugification:
const slug = slugify(sanitizedName)
if (!slug || slug.length < 2) {
    return failure('Rate level name must contain at least 2 alphanumeric characters')
}
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/rate-levels.ts
git commit -m "fix(rate-levels): validate slug generation for edge cases"
```

---

### Task 54: Fix `deactivateRateLevel` to warn about active payroll rates

**Files:**
- Modify: `server/actions/rate-levels.ts:95-102`

**Issue:** Deactivating a rate level doesn't warn about or cascade to active payroll staff rates that reference it.

- [ ] **Step 1: Check for active staff rates before deactivation**

```typescript
export async function deactivateRateLevel(id: string) {
    const user = await getCurrentUser()
    if (!user) return failure('Authentication required')
    if (!isAdmin(user)) return failure('Admin access required')
    
    // Check for active payroll staff rates using this level
    const activeRates = await db.select({ id: payrollStaffRate.id })
        .from(payrollStaffRate)
        .where(and(
            eq(payrollStaffRate.rateLevelId, id),
            eq(payrollStaffRate.isActive, true)
        ))
        .limit(1)
    
    if (activeRates.length > 0) {
        return failure('Cannot deactivate rate level: it is referenced by active payroll staff rates. Deactivate the staff rates first.')
    }
    
    // ... proceed with deactivation ...
}
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/rate-levels.ts
git commit -m "fix(rate-levels): warn about active staff rates on deactivation"
```

---

### Task 55: Fix timezone handling in date comparisons across modules

**Files:**
- Modify: `server/actions/metrics.ts` (multiple date functions)
- Modify: `server/actions/accounting.ts` (date filter functions)
- Modify: `server/actions/payroll.ts:1530-1532`

**Issue:** Date comparisons use `new Date(string)` which interprets dates in the server's local timezone, causing off-by-one errors near midnight.

- [ ] **Step 1: Create a date utility that ensures consistent timezone handling**

```typescript
// utils/date-utils.ts — add this function
export function toUTCDate(dateString: string): Date {
    const d = new Date(dateString)
    if (isNaN(d.getTime())) throw new Error(`Invalid date: ${dateString}`)
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

export function startOfDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0))
}

export function endOfDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999))
}
```

- [ ] **Step 2: Use `toUTCDate`/`startOfDay`/`endOfDay` in metrics.ts, accounting.ts, and payroll.ts date comparisons**

This is a widespread change — focus on the most impactful locations (dashboard queries, date range filters).

- [ ] **Step 3: Verify with `bun run build`**

- [ ] **Step 4: Commit**

```bash
git add utils/date-utils.ts server/actions/metrics.ts server/actions/accounting.ts server/actions/payroll.ts
git commit -m "fix: consistent UTC date handling in date comparisons"
```

---

### Task 56: Fix `payrollEntry.paymentMethod` normalization inconsistency

**Files:**
- Modify: `server/actions/payroll.ts` (multiple locations)

**Issue:** `normalizePayrollPaymentMethod` only handles `'BANK' → 'BANK_TRANSFER'` but other values like `'CRYPTO'` pass through unchallenged.

- [ ] **Step 1: Expand `normalizePayrollPaymentMethod`**

```typescript
function normalizePayrollPaymentMethod(method: string): PayrollPaymentMethod {
    const upper = method?.toUpperCase()
    const mapping: Record<string, PayrollPaymentMethod> = {
        'BANK': 'BANK_TRANSFER',
        'GCASH': 'GCASE',
        'MAYA': 'MAYA',
        'CASH': 'CASH',
        'CARD': 'CARD',
        'CRYPTO': 'CRYPTO',
    }
    return mapping[upper] || 'CASH'
}
```

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): expand payment method normalization mapping"
```

---

### Task 57: Fix metrics cache invalidation on data mutations

**Files:**
- Modify: `server/actions/metrics.ts`
- Modify: `server/actions/accounting.ts` (after mutations)
- Modify: `server/actions/payroll.ts` (after mutations)
- Modify: `server/actions/appointments.ts` (after mutations)

**Issue:** Cached metrics become stale for up to 5 minutes after data mutations. No cache invalidation is triggered by accounting/payroll/appointment changes.

- [ ] **Step 1: Import the metrics cache and add invalidation in mutation actions**

```typescript
import { cache as metricsCache } from '@/utils/cache'

// In createLedgerEntry, after success:
metricsCache.invalidate(/^financial_metrics/)
metricsCache.invalidate(/^revenue_trend/)
metricsCache.invalidate(/^operational_metrics/)

// In completePayrollRequest, after success:
metricsCache.invalidate(/^staff_leaderboard/)
metricsCache.invalidate(/^payroll_dashboard/)
```

Alternatively, use a more targeted pattern where each mutation only invalidates relevant cache keys.

- [ ] **Step 2: Verify with `bun run build`**

- [ ] **Step 3: Commit**

```bash
git add server/actions/metrics.ts server/actions/accounting.ts server/actions/payroll.ts server/actions/appointments.ts utils/cache.ts
git commit -m "fix: invalidate metrics cache on data mutations"
```

---

## Chunk 10: Lint & Build Error Resolution

### Task 58: Run ESLint and fix all warnings/errors

- [ ] **Step 1: Run `bun run lint` and capture all warnings/errors**

```bash
bun run lint 2>&1 > /tmp/lint-output.txt
cat /tmp/lint-output.txt
```

- [ ] **Step 2: Categorize and fix all lint issues**

Address each lint warning/error:
- Unused variables and imports
- Missing return types
- `any` type usage
- Missing dependencies in React hooks
- Console.log statements (should use `createLogs`)
- Other ESLint rules

- [ ] **Step 3: Run `bun run lint` again to confirm zero errors**

```bash
bun run lint
```

Expected: Clean output with no errors or warnings

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: resolve all ESLint warnings and errors"
```

---

### Task 59: Run TypeScript typecheck and fix all type errors

- [ ] **Step 1: Run TypeScript type checking**

```bash
npx tsc --noEmit 2>&1 > /tmp/tsc-output.txt
cat /tmp/tsc-output.txt
```

- [ ] **Step 2: Fix all type errors**

Address each TypeScript error:
- Implicit `any` types
- Missing type annotations
- Type mismatches between server action return types and client expectations
- Null/undefined handling
- Drizzle schema type inference issues

- [ ] **Step 3: Run `npx tsc --noEmit` again to confirm zero errors**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: resolve all TypeScript type errors"
```

---

### Task 60: Run production build and fix any issues

- [ ] **Step 1: Run `bun run build` and check for errors**

```bash
bun run build 2>&1 > /tmp/build-output.txt
cat /tmp/build-output.txt
```

- [ ] **Step 2: Fix any build errors** (type errors caught by Next.js that `tsc` misses, import issues, missing exports)

- [ ] **Step 3: Run `bun run build` again to confirm success**

Expect: Build completes with no errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve all production build errors"
```

---

### Task 61: Verify all modules work together end-to-end

- [ ] **Step 1: Start the dev server and manually test key flows**

```bash
bun run dev
```

Test these cross-module flows:
1. Create an appointment → mark as completed → verify transaction auto-creation
2. Create a ledger entry → verify metrics dashboard updates
3. Create a payroll entry → complete payroll request → verify accounting entries
4. Create a disbursement → verify completion flow creates accounting entries
5. Archive a branch → verify user cleanup and warning for active appointments
6. Deactivate a rate level → verify warning for active staff rates
7. Export grouped ledger → verify branch names appear correctly
8. Export metrics → verify average ticket counts only revenue entries

- [ ] **Step 2: Fix any runtime issues discovered**

- [ ] **Step 3: Final verification**

```bash
bun run lint && bun run build
```

Expected: Both pass cleanly

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: address runtime issues from end-to-end verification"
```

---

## Summary of All Issues by Severity

| Severity | Count | Key Areas |
|----------|-------|-----------|
| **Critical** | 15 | Race conditions (5), Auth gaps (3), Data integrity (4), Accounting bypass (2), Disbursement accounting skip (1) |
| **High** | 12 | Transaction atomicity (3), Price staleness (1), Missing side effects (3), Voided/cancelled filtering (2), Branch deps (2), Client type mismatch (1) |
| **Medium** | 20 | Type safety (5), Validation gaps (5), Inconsistent returns (3), Cache issues (2), Date handling (2), Naming (2), Null handling (1) |
| **Low** | 15+ | Edge cases, naming, documentation, pagination, minor UX issues |

**Total tasks: 61** | **Estimated effort: ~3-4 weeks** (1-2 tasks/day per developer)