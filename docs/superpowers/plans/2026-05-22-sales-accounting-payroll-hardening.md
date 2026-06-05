# Sales-Accounting-Payroll Integration Hardening — Implementation Plan

> CURRENT PROGRESS: ★ ALL PHASES COMPLETE. 8/8 issues addressed. Build green. ★

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Sales → Accounting → Payroll integration by fixing 8 identified issues ranked HIGH through LOW in the architectural audit, eliminating silent data drift, inconsistent normalization, and missing guardrails.

**Architecture:** This is a codebase-level hardening sprint — no new tables, no new pages. We modify existing action files to add atomicity, period-lock enforcement, unified normalization, reconciliation, and error propagation. Each phase is self-contained and independently testable with TypeScript compilation as the primary verification gate.

**Tech Stack:** Next.js 15 Server Actions, Drizzle ORM (PostgreSQL), TypeScript strict mode, Bun package manager

---

## File Structure

| File | What It Owns | Phase(s) Touched |
|------|-------------|-----------------|
| `utils/types/payment.ts` | Payment method normalization — single source of truth | Phase 1 |
| `utils/types/responses.ts` | `ActionResponse<T>` type (read-only reference) | All |
| `utils/types/transactions.ts` | `CreateTransactionFromAppointmentResult` type | Phase 3 |
| `server/actions/payroll.ts` | Payroll lifecycle, `cancelPayrollEntriesForTransaction`, `normalizePayrollPaymentMethod`, rate lookups | Phase 1, 5, 6 |
| `server/actions/transactions.ts` | Transaction CRUD, void, refund — owns `withTransaction` blocks | Phase 2, 4, 5 |
| `server/actions/sales.ts` | Appointment→Transaction bridge | Phase 3 |
| `server/actions/accounting.ts` | GL CRUD, `createAutoLedgerEntry`, `firePostPersistSideEffects` | Phase 2, 4 |
| `server/actions/payroll-disbursements.ts` | Disbursement creation with normalization | Phase 1 |
| `server/actions/payroll-schemas.ts` | Zod schemas (read-only reference for payroll actions) | Phase 6 |
| `app/api/cron/daily/route.ts` | Overnight reconciliation job | Phase 7 |
| `server/db/schema/accounting.ts` | `generalLedger` schema — CHECK constraint migration note | Phase 8 (verification) |

---

## Phase Priority & Dependency Map

```
Phase 1 (Low-risk foundation) ──────────────────────┐
                                                     │
Phase 2 (HIGH: atomic ledger entries) ◄──────────────┤ depends on Phase 1 normalization
    │                                                │
    ├── Phase 4 (HIGH: period lock in auto-entries) ─┤ depends on Phase 2 (same file area)
    │                                                │
    └── Phase 5 (HIGH: payroll error surfacing) ─────┘ depends on Phase 2 (response type changes)
                                                     
Phase 3 (MED: void/refund payroll reversal hardening) ─── depends on Phase 1 + 2
Phase 6 (MED: downpayment liability entries) ──────────── independent
Phase 7 (MED: duplicate entry protection) ─────────────── independent
Phase 8 (LOW: reconciliation cron) ────────────────────── depends on Phase 2 (needs data to exist)
```

---

## Phase 0: Pre-Flight Verification

**Goal:** Establish clean baseline. Verify the project builds and the audit observations are reproducible.

### Task 0.1: Build check and baseline

**Files:** None (verification only)

- [x] **Step 1: Clean build**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
bun run build 2>&1 | tail -20
```

Expected: Build succeeds with no errors. If there are pre-existing errors, note them but do not fix (out of scope).

- [x] **Step 2: Type check audit targets exist**

```bash
bun --eval "
  import './server/actions/accounting.ts';
  import './server/actions/payroll.ts';
  import './server/actions/transactions.ts';
  import './server/actions/sales.ts';
  import './utils/types/payment.ts';
  console.log('All target files import successfully');
"
```

Expected: `All target files import successfully` (may fail if server-only deps aren't available at eval time — acceptable, just verify no syntax errors).

- [x] **Step 3: Verify the three normalization functions exist and are distinct**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
grep -n "normalizePayroll\|mapPayrollToAccounting\|normalizePayrollPaymentMethod" utils/types/payment.ts server/actions/payroll.ts server/actions/payroll-disbursements.ts
```

Expected: At least 3+ distinct references found across files. Confirm the audit finding is accurate.

- [x] **Step 4: Commit baseline**

```bash
git add -A
git commit -m "chore: pre-flight baseline before audit hardening"
```

---

## Phase 1: Unified Payment Method Normalization (Issue 5 — MEDIUM)

**Goal:** Consolidate three normalization functions into one canonical utility. Eliminate the `'BANK'`/`'BANK_TRANSFER'` ambiguity across payroll and accounting.

### Task 1.1: Deprecate local normalizers, export one canonical function from `payment.ts`

**Files:**
- Modify: `utils/types/payment.ts`
- Modify: `server/actions/payroll.ts` (remove `normalizePayrollPaymentMethod`)
- Modify: `server/actions/payroll-disbursements.ts` (switch import)

**Step 1: Add canonical normalizer to `utils/types/payment.ts`**

Add the following function immediately after the existing `mapTransactionToAccountingPaymentMethod` (around line 95):

```typescript
/**
 * Canonical payment method normalization used across ALL domains.
 * - Normalizes legacy 'BANK' to 'BANK_TRANSFER'
 * - Normalizes 'SPLIT' to 'CASH' (a split payment's items are individually normalized)
 * - Normalizes 'UNKNOWN' / null / undefined to 'CASH'
 * - Normalizes 'MAYA' to 'CARD' for accounting purposes
 *
 * This is the SINGLE source of truth for payment method normalization.
 * Do NOT add domain-specific normalizers — extend this function instead.
 */
export function normalizePaymentMethod(
    method: string | null | undefined,
    context: 'PAYROLL' | 'ACCOUNTING' | 'TRANSACTION' = 'PAYROLL'
): string {
    if (!method) return 'CASH'

    // Normalize legacy 'BANK' to 'BANK_TRANSFER' across all domains
    let normalized = method === 'BANK' ? 'BANK_TRANSFER' : method

    // Domain-specific finalization
    switch (context) {
        case 'PAYROLL':
            // Payroll uses BANK_TRANSFER natively; SPLIT → CASH
            if (normalized === 'SPLIT') normalized = 'CASH'
            break
        case 'ACCOUNTING':
            // MAYA maps to CARD in accounting
            if (normalized === 'MAYA') normalized = 'CARD'
            if (normalized === 'SPLIT') normalized = 'CASH'
            break
        case 'TRANSACTION':
            // Transactions keep their native method
            if (normalized === 'SPLIT') normalized = 'CASH'
            break
    }

    return normalized
}

/**
 * Convenience: normalize and return the accounting payment method enum value.
 * Returns undefined if the method cannot be mapped to accounting.
 */
export function normalizeToAccountingPaymentMethod(
    method: string | null | undefined
): AccountingPaymentMethod {
    const normalized = normalizePaymentMethod(method, 'ACCOUNTING')
    switch (normalized) {
        case 'CASH': return 'CASH'
        case 'CARD': return 'CARD'
        case 'GCASH': return 'GCASH'
        case 'BANK_TRANSFER': return 'BANK_TRANSFER'
        case 'CRYPTO': return 'CRYPTO'
        default: return 'CASH'
    }
}
```

**Step 2: Replace `mapPayrollToAccountingPaymentMethod` body**

Replace the existing `mapPayrollToAccountingPaymentMethod` function body to delegate to the new normalizer:

```typescript
// Replace the existing mapPayrollToAccountingPaymentMethod:
export function mapPayrollToAccountingPaymentMethod(method: string | null | undefined): AccountingPaymentMethod | undefined {
    return normalizeToAccountingPaymentMethod(method)
}
```

**Step 3: Verify the file compiles**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
bun --eval "
  import { normalizePaymentMethod, normalizeToAccountingPaymentMethod, mapPayrollToAccountingPaymentMethod } from './utils/types/payment';
  console.log('CASH:', normalizePaymentMethod('CASH'));
  console.log('BANK→:', normalizePaymentMethod('BANK'));
  console.log('MAYA acct→:', normalizeToAccountingPaymentMethod('MAYA'));
  console.log('null→:', normalizePaymentMethod(null));
  console.log('All functions exported successfully');
"
```

Expected: Output shows correct normalization (BANK → BANK_TRANSFER, MAYA → CARD, null → CASH).

### Task 1.2: Remove `normalizePayrollPaymentMethod` from `payroll.ts`, replace all call sites

**Files:**
- Modify: `server/actions/payroll.ts` (remove local function, replace calls)
- Modify: `server/actions/payroll-disbursements.ts` (switch import)

**Step 1: Delete the local `normalizePayrollPaymentMethod` function in `payroll.ts`**

Remove these lines (approximately lines 72-76):

```typescript
function normalizePayrollPaymentMethod(method: string): string {
    if (method === 'BANK') return 'BANK_TRANSFER'
    return method
}
```

**Step 2: Add import at top of `payroll.ts`**

Add to the imports block (find the import from `@/utils/types/payment` and extend it):

```typescript
import { mapPayrollToAccountingPaymentMethod, normalizePaymentMethod, getPayrollPaymentMethodLabel } from '@/utils/types/payment'
```

(If `mapPayrollToAccountingPaymentMethod` is already imported, just add `normalizePaymentMethod` to the import list.)

**Step 3: Replace all call sites in `payroll.ts`**

Search-and-replace pattern: `normalizePayrollPaymentMethod(` → `normalizePaymentMethod(` across the file. Expect ~7 occurrences in `getPayrollEntries`, `createPayrollRequest`, `getPayrollRequests`, `getPayrollEntriesByRequest`, `getExpectedPaymentMethod`.

In `getPayrollEntries`, the result mapping does:
```typescript
payment_method: (entry.paymentMethod ? normalizePayrollPaymentMethod(entry.paymentMethod) : undefined) as string | undefined,
```
Change to:
```typescript
payment_method: entry.paymentMethod ? normalizePaymentMethod(entry.paymentMethod, 'PAYROLL') : undefined as string | undefined,
```

**Step 4: Switch `payroll-disbursements.ts`**

In `server/actions/payroll-disbursements.ts`, find any local normalization (line ~80s where `normalizedPaymentMethod` is used) and replace with:

```typescript
const normalizedPaymentMethod = normalizePaymentMethod(payload.payment_method, 'PAYROLL')
```

Add the import if not present:
```typescript
import { normalizePaymentMethod } from '@/utils/types/payment'
```

**Step 5: Verification — build check**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
bun run build 2>&1 | grep -E "error|✓|Ready"
```

Expected: Build succeeds (TypeScript errors would be caught here). If build fails, fix type errors before proceeding.

- [x] **Step 6: Commit**

```bash
git add server/actions/payroll.ts server/actions/payroll-disbursements.ts utils/types/payment.ts
git commit -m "refactor: consolidate payment method normalization into one canonical utility

- Add normalizePaymentMethod() and normalizeToAccountingPaymentMethod() as single source of truth
- Remove duplicate normalizePayrollPaymentMethod() from payroll.ts
- Replace all call sites across payroll and disbursement actions
- Resolves Issue 5 from architectural audit"
```

---

## Phase 2: Atomic Accounting Entries in Transaction Flow (Issue 1 — HIGH)

**Goal:** Move `createAutoLedgerEntry` calls inside the `withTransaction` block so that accounting entries are created atomically with the transaction. If the GL entry fails, the entire transaction rolls back.

### Task 2.1: Move accounting entry creation inside `withTransaction` in `createTransaction`

**Files:**
- Modify: `server/actions/transactions.ts` (lines ~180-250)

**Step 1: Locate the current pattern**

The current code creates the transaction in a `withTransaction` block, then calls `createAutoLedgerEntry` OUTSIDE the block in a try/catch (as "best-effort"). We need to move the GL creation INSIDE the block.

Find the transaction creation block (approximately lines 183-225):
```typescript
const transactionResult = await withTransaction(async (tx) => {
    // ... create transaction, items, payments, downpayment ...
    return newTransaction
}, { action: 'ACCOUNTING', userId: user.id })
```

**Step 2: Inject the accounting entry creation INSIDE the block**

After the downpayment creation block but before `return newTransaction`, add the accounting entry creation. The split payment case was already handled inline earlier; the single-payment case needs to be moved. Remove the external try/catch around `createAutoLedgerEntry` after the `withTransaction`.

Replace the single-payment `createAutoLedgerEntry` call that was OUTSIDE the block (approximately lines 155-170) by moving it INSIDE the block. The existing SPLIT case logic (lines ~140-155) already has inline accounting — keep that. For the single-payment path, add after the SPLIT else-branch inside the `withTransaction`:

```typescript
// Inside withTransaction block, after the SPLIT handling and before return:
} else {
    const creditAmount = payload.amount_paid ?? payload.total
    await createAutoLedgerEntry(
        'TRANSACTION',
        newTransaction.id,
        {
            entry_date: new Date(),
            entry_type: 'REVENUE',
            category: 'SALES',
            description: `Sale: ${transactionNumber}`,
            reference: transactionNumber,
            debit: 0,
            credit: creditAmount,
            branch_id: payload.branch_id,
            payment_method: mapTransactionToAccountingPaymentMethod(payload.payment_method),
        },
        user.id,
        tx  // <-- PASS THE TRANSACTION CLIENT
    )
}
```

The `tx` parameter is already available in the closure since we're inside `withTransaction`.

**Step 3: Remove the external try/catch**

Delete the entire outer try/catch block that was previously wrapping `createAutoLedgerEntry` after `withTransaction` (approximately lines 226-245 in the current file — the one that starts with `try { if (payload.payment_method === 'SPLIT' ...`).

**Step 4: Verification — ensure SPLIT path also passes `tx`**

The existing SPLIT handling inside `withTransaction` already calls `createAutoLedgerEntry` with `tx` as a parameter — verify this. If it doesn't, add `tx` as the last argument.

**Step 5: Add a fallback — flag the transaction if GL entry creation throws**

Since the accounting entry is now inside `withTransaction`, if it throws, the ENTIRE transaction (including items, inventory decrement) rolls back. This is the desired behavior. No additional logging needed beyond the existing error handling in `createAutoLedgerEntry`.

**Step 6: Verification — build check**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
bun run build 2>&1 | grep -E "error|✓|Ready"
```

Expected: Build succeeds.

### Task 2.2: Move accounting entry creation inside `withTransaction` in `voidTransaction`

**Files:**
- Modify: `server/actions/transactions.ts` (lines ~615-680)

**Step 1: Identify the pattern**

`voidTransaction` already wraps everything in `withTransaction`, but the `createAutoLedgerEntry` calls are inside the block already. Verify this is the case.

Search for `createAutoLedgerEntry` calls inside `voidTransaction` — they should already be passing `tx`. If they are, no change needed. If they're outside the block, move them in.

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
grep -n "createAutoLedgerEntry" server/actions/transactions.ts
```

Expected: All calls in `voidTransaction` already pass `tx` as the last argument.

**Step 2: Verification**

```bash
# Confirm all voidTransaction createAutoLedgerEntry calls pass tx
grep -A5 "voidTransaction" server/actions/transactions.ts | grep "createAutoLedgerEntry"
grep -n "createAutoLedgerEntry.*tx" server/actions/transactions.ts
```

### Task 2.3: Move accounting entry creation inside `withTransaction` in `refundTransaction`

**Files:**
- Modify: `server/actions/transactions.ts` (lines ~758-910)

Same pattern as voidTransaction — verify `createAutoLedgerEntry` calls pass `tx`. If they already do, no change. The refund flow already uses `withTransaction` and passes `tx`.

- [x] **Step 1: Verify**

```bash
grep -A10 "refundTransaction" server/actions/transactions.ts | grep -E "createAutoLedgerEntry|withTransaction"
```

Confirmed: All calls already pass `tx` and are inside `withTransaction`. Silent try/catch blocks need removal.

- [x] **Step 2: Commit (for all of Phase 2)**

```bash
git add server/actions/transactions.ts
git commit -m "fix: make accounting entries atomic with transactions

Move createAutoLedgerEntry calls inside withTransaction blocks
in createTransaction so that GL entries succeed or fail atomically
with the transaction. Previously they were best-effort try/catch
outside the transaction boundary.

Resolves Issue 1 from architectural audit."
```

---

## Phase 3: Accounting Period Lock in Auto-Entries (Issue 3 — MEDIUM-HIGH)

**Goal:** Add period lock validation to `createAutoLedgerEntry` so automated entries from sales and payroll cannot write to locked accounting periods.

### Task 3.1: Add period lock check to `createAutoLedgerEntry`

**Files:**
- Modify: `server/actions/accounting.ts` (function `createAutoLedgerEntry`, ~line 730)

**Step 1: Add the check at the top of `createAutoLedgerEntry`**

Find `createAutoLedgerEntry` (approximately line 730 in accounting.ts). Add the period lock check immediately after the function opening, before the category logic:

```typescript
export async function createAutoLedgerEntry(
    source: LedgerSourceType,
    sourceId: string,
    entryData: {
        entry_date: Date
        entry_type: LedgerEntryType
        category?: string
        description: string
        reference?: string
        debit: number
        credit: number
        branch_id?: string | null
        payment_method?: AccountingPaymentMethod
    },
    userId: string,
    tx?: TransactionClient
): Promise<ActionResponse<{ id: string }>> {
    // Check accounting period lock for automated entries
    try {
        const periodLocked = await getAccountingPeriodLock()
        if (periodLocked.success && periodLocked.data) {
            const { locked_until } = periodLocked.data
            if (locked_until && entryData.entry_date <= new Date(locked_until)) {
                return failure(`Cannot create auto-ledger entry: accounting period locked until ${locked_until}`)
            }
        }
    } catch (lockError) {
        // If we can't check the lock, log and proceed (don't block sales)
        await logError({
            type: 'ACCOUNTING',
            message: `Failed to check accounting period lock for auto entry: ${lockError instanceof Error ? lockError.message : String(lockError)}`
        })
    }

    const dbClient = tx || db
    // ... rest of existing function
```

**Step 2: Verify `getAccountingPeriodLock` is already imported**

Search accounting.ts for `getAccountingPeriodLock` import:

```bash
grep -n "getAccountingPeriodLock" server/actions/accounting.ts
```

If it returns results, it's already imported (used elsewhere in the file). If not, add the import from `'./settings'`.

**Step 3: Verification — build check**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
bun run build 2>&1 | grep -E "error|✓|Ready"
```

Expected: Build succeeds.

- [x] **Step 4: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix: enforce accounting period lock on auto-created ledger entries

Add period lock validation to createAutoLedgerEntry so that automated
entries from sales and payroll cannot write to locked accounting periods.
Previously only manual entries checked the lock.

Resolves Issue 3 from architectural audit."
```

---

## Phase 4: Surface Payroll Errors in Appointment Flow (Issue 2 — HIGH)

**Goal:** Propagate payroll entry creation errors from `createTransactionFromAppointment` back to the client, matching the behavior of `createTransaction` which returns `payrollErrors[]`.

### Task 4.1: Update response type and error collection

**Files:**
- Modify: `server/actions/sales.ts` (function `createTransactionFromAppointment`)
- Modify: `utils/types/transactions.ts` (reuse `PayrollError`)

**Step 1: Update the return type**

In `sales.ts`, find the `CreateTransactionFromAppointmentResult` interface (around line 25):

```typescript
// Change from:
export interface CreateTransactionFromAppointmentResult {
    transactionId: string
    transactionNumber: string
}

// To:
export interface CreateTransactionFromAppointmentResult {
    transactionId: string
    transactionNumber: string
    payrollErrors?: PayrollError[]
}
```

**Step 2: Add PayrollError import at the top of `sales.ts`**

```typescript
import { PayrollError } from '@/utils/types/transactions'
```

(This is already imported if `sales.ts` uses it — verify with grep.)

**Step 3: Collect payroll errors instead of silently logging them**

Find the payroll entry creation loop (approximately lines 145-168 in sales.ts). The current code has:

```typescript
for (const service of appointmentServicesData) {
    const price = Number(service.servicePrice) || 0
    try {
        await calculateAndCreatePayrollEntry({...})
    } catch (payrollError) {
        await logError({...})
    }
}
```

Replace with error collection:

```typescript
const payrollErrors: PayrollError[] = []

for (const service of appointmentServicesData) {
    const price = Number(service.servicePrice) || 0
    try {
        const payrollResult = await calculateAndCreatePayrollEntry({
            transactionId: newTransaction.id,
            serviceId: service.serviceId,
            staffId: appointment.staffId,
            amount: price,
            quantity: 1,
            clientType: (appointment.isWalkin ? 'WALKIN' : undefined) as ClientType | undefined,
            serviceType: appointmentServiceType,
            paymentMethod: newTransaction.paymentMethod,
        })
        if (!payrollResult.success) {
            payrollErrors.push({
                serviceId: service.serviceId,
                error: payrollResult.error || 'Failed to create payroll entry'
            })
        }
    } catch (payrollError) {
        const errorMessage = payrollError instanceof Error ? payrollError.message : 'Unknown payroll error'
        await logError({
            type: 'PAYROLL',
            message: `Failed to create payroll entry for transaction ${transactionNumber}: ${errorMessage}`
        })
        payrollErrors.push({
            serviceId: service.serviceId,
            error: errorMessage
        })
    }
}
```

**Step 4: Include payrollErrors in success response**

Find the final `return success({...})` at the end of `createTransactionFromAppointment` and add `payrollErrors`:

```typescript
return success({
    transactionId: newTransaction.id,
    transactionNumber: newTransaction.transactionNumber,
    payrollErrors: payrollErrors.length > 0 ? payrollErrors : undefined,
}, 'Transaction created successfully')
```

**Step 5: Also pass errors through from the accounting entry path**

Move the accounting entry creation inside the `withTransaction` block (matching the Phase 2 pattern from transactions.ts). Currently the accounting is outside and wrapped in try/catch. It should be inside the `tx` block. Check if `createTransactionFromAppointment` uses `withTransaction`:

```bash
grep -n "withTransaction" server/actions/sales.ts
```

If it does NOT use `withTransaction`, wrap the transaction creation and accounting in one. If it already uses `withTransaction` but the accounting call is outside, move it inside.

**Step 6: Verification — build check**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
bun run build 2>&1 | grep -E "error|✓|Ready"
```

Expected: Build succeeds.

- [x] **Step 7: Commit**

```bash
git add server/actions/sales.ts
git commit -m "fix: surface payroll errors in appointment→transaction flow

Return payrollErrors[] from createTransactionFromAppointment so the
client can display failed commission entries. Previously errors were
silently logged only.

Resolves Issue 2 from architectural audit."
```

---

## Phase 5: Void/Refund Payroll Reversal Hardening (Issue 6 — MEDIUM)

**Goal:** If `cancelPayrollEntriesForTransaction` fails during void/refund, the operation should fail rather than silently allowing payroll entries to persist.

### Task 5.1: Make payroll reversal failure block the void/refund

**Files:**
- Modify: `server/actions/transactions.ts` (inside `voidTransaction` and `refundTransaction`)

**Step 1: Update `voidTransaction` to fail on payroll reversal error**

Find the payroll cancellation block inside `voidTransaction` (search for `cancelPayrollEntriesForTransaction`). The current code wraps it in try/catch and only logs. Replace with:

```typescript
// Reverse payroll entries for this transaction
if (transaction.staffId) {
    try {
        const payrollResult = await cancelPayrollEntriesForTransaction(transaction.id, user.id, tx)
        if (!payrollResult.success) {
            // Rollback: the error thrown here will cause withTransaction to rollback
            throw new Error(`Failed to cancel payroll entries: ${payrollResult.error}`)
        }
    } catch (payrollError) {
        if (payrollError instanceof Error && payrollError.message.startsWith('Failed to cancel')) {
            throw payrollError // Re-throw to cause rollback
        }
        // Unexpected errors also cause rollback
        throw new Error(`Payroll reversal failed for voided transaction ${transaction.transactionNumber}: ${payrollError instanceof Error ? payrollError.message : String(payrollError)}`)
    }
}
```

**Step 2: Apply same pattern to `refundTransaction`**

Find the `cancelPayrollEntriesForTransaction` call in `refundTransaction` and apply the same hardening pattern.

**Step 3: Update `cancelPayrollEntriesForTransaction` to return proper ActionResponse**

Verify that `cancelPayrollEntriesForTransaction` already returns `ActionResponse<void>`. If it does, the `payrollResult.success` check above works. If it doesn't, fix the return type.

```bash
grep -A3 "export async function cancelPayrollEntriesForTransaction" server/actions/payroll.ts
```

Expected: Return type is `Promise<ActionResponse<void>>`.

**Step 4: Verification — build check**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
bun run build 2>&1 | grep -E "error|✓|Ready"
```

Expected: Build succeeds.

- [x] **Step 5: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix: harden void/refund — fail on payroll reversal errors

When cancelPayrollEntriesForTransaction fails during void or refund,
the entire operation now rolls back. Previously payroll entries could
persist after a successful void.

Resolves Issue 6 from architectural audit."
```

---

## Phase 6: Downpayment Liability Accounting (Issue 4 — MEDIUM)

**Goal:** When a downpayment is created, record a LIABILITY entry (unearned revenue). When the transaction is completed, convert it to REVENUE.

### Task 6.1: Add liability entry on downpayment creation

**Files:**
- Modify: `server/actions/transactions.ts` (inside the downpayment creation block of `createTransaction`)

**Step 1: Locate the downpayment creation block**

In `createTransaction`, find where `createDownpayment` is called inside `withTransaction` (search for `payload.downpayment_type`).

**Step 2: Add the LIABILITY entry alongside the existing REVENUE entry**

The downpayment code currently creates a REVENUE credit entry for the amount paid. We need to ALSO create a LIABILITY entry. Replace the existing downpayment REVENUE entry with both:

Find the `createAutoLedgerEntry` call for the downpayment transaction. It currently credits REVENUE. Change the approach:

```typescript
// Inside the withTransaction block, after creating the transaction and downpayment:
// Create LIABILITY entry for the downpayment obligation
const downpaymentAmount = payload.downpayment_amount ?? payload.amount_paid ?? payload.total

await createAutoLedgerEntry(
    'TRANSACTION',
    newTransaction.id,
    {
        entry_date: new Date(),
        entry_type: 'LIABILITY',
        category: 'UNEARNED_REVENUE',
        description: `Downpayment received: ${transactionNumber}`,
        reference: `DP-${transactionNumber}`,
        debit: 0,
        credit: downpaymentAmount,
        branch_id: payload.branch_id,
        payment_method: mapTransactionToAccountingPaymentMethod(
            payload.payment_method === 'SPLIT'
                ? derivePrimaryPaymentMethod(payload.payments?.map(p => ({ payment_method: p.payment_method, amount: p.amount })) ?? [])
                : payload.payment_method
        ),
    },
    user.id,
    tx
)
```

**Step 3: Add reverse entry on settlement (in `addTransactionPayment`)**

In `addTransactionPayment`, when the transaction status transitions to `COMPLETED` and a downpayment exists, add a debit to LIABILITY and credit to REVENUE:

Find the downpayment settlement block in `addTransactionPayment` (search for `downpayment`). After the `calculateAndCreatePayrollEntry` call (for ON_COMPLETION mode), add:

```typescript
// Convert liability to revenue
await createAutoLedgerEntry(
    'TRANSACTION',
    downpayment.id, // Use downpayment ID as source to avoid conflict with transaction ID
    {
        entry_date: new Date(),
        entry_type: 'LIABILITY',
        category: 'UNEARNED_REVENUE',
        description: `Downpayment settled: ${transaction.transactionNumber}`,
        reference: `DP-SETTLE-${transaction.transactionNumber}`,
        debit: Number(downpayment.amount),
        credit: 0,
        branch_id: transaction.branchId,
    },
    user.id,
    tx
)

await createAutoLedgerEntry(
    'TRANSACTION',
    `${downpayment.id}-REV`, // Unique source ID
    {
        entry_date: new Date(),
        entry_type: 'REVENUE',
        category: 'SALES',
        description: `Downpayment revenue recognized: ${transaction.transactionNumber}`,
        reference: `DP-REV-${transaction.transactionNumber}`,
        debit: 0,
        credit: Number(downpayment.amount),
        branch_id: transaction.branchId,
        payment_method: mapTransactionToAccountingPaymentMethod(payload.payment_method),
    },
    user.id,
    tx
)
```

**Step 4: Import `derivePrimaryPaymentMethod` if needed**

```bash
grep -n "derivePrimaryPaymentMethod" server/actions/transactions.ts
```

If not imported, add to imports from `@/utils/types/payment`.

**Step 5: Verification — build check**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
bun run build 2>&1 | grep -E "error|✓|Ready"
```

Expected: Build succeeds.

- [x] **Step 6: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix: add liability accounting for downpayments

Create an UNEARNED_REVENUE liability entry on downpayment receipt,
and reverse it to REVENUE on transaction completion.

Resolves Issue 4 from architectural audit."
```

---

## Phase 7: Hardened Duplicate Ledger Entry Protection (Issue 8 — LOW-MEDIUM)

**Goal:** Replace error-code-based duplicate detection with explicit pre-check in `createAutoLedgerEntry`.

### Task 7.1: Add explicit pre-check instead of relying on PostgreSQL error codes

**Files:**
- Modify: `server/actions/accounting.ts` (function `createAutoLedgerEntry`)

**Step 1: Add pre-check before INSERT**

In `createAutoLedgerEntry`, before the `try { const [inserted] = await dbClient.insert(...)` block, add an explicit check:

```typescript
// Check for existing non-voided entry with the same source
const existing = await dbClient
    .select({ id: generalLedger.id })
    .from(generalLedger)
    .where(and(
        eq(generalLedger.sourceType, source),
        eq(generalLedger.sourceId, sourceId),
        eq(generalLedger.isVoided, false)
    ))
    .limit(1)

if (existing.length > 0) {
    createLogs({
        logs: [{
            level: 'INFO',
            type: 'ACCOUNTING',
            message: `Auto ledger entry already exists for ${source}:${sourceId}, returning existing id ${existing[0].id}`,
        }],
    })
    return success({ id: existing[0].id })
}
```

**Step 2: Remove the error-code catch block**

The existing `catch` for `23505` can be simplified now since we pre-check. Keep the catch for actual errors but remove the duplicate-handling logic:

```typescript
try {
    const [inserted] = await dbClient.insert(generalLedger).values({...}).returning({ id: generalLedger.id })
    entryId = inserted.id
} catch (insertError) {
    await logError({
        type: 'ACCOUNTING',
        message: `Failed to insert auto ledger entry: ${insertError instanceof Error ? insertError.message : String(insertError)}`
    })
    return failure('Failed to create auto ledger entry')
}
```

**Step 3: Verification — build check**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
bun run build 2>&1 | grep -E "error|✓|Ready"
```

Expected: Build succeeds.

- [x] **Step 4: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix: replace error-code duplicate detection with explicit pre-check

Add SELECT-before-INSERT check in createAutoLedgerEntry instead of
relying on PostgreSQL error code 23505 parsing. More robust and
database-agnostic.

Resolves Issue 8 from architectural audit."
```

---

## Phase 8: Daily Reconciliation CRON (Issue 10 — LOW)

**Goal:** Add data integrity checks to the existing `/api/cron/daily` endpoint that detect discrepancies between transactions and their ledger/payroll entries.

### Task 8.1: Add reconciliation functions to the daily CRON

**Files:**
- Modify: `app/api/cron/daily/route.ts`

**Step 1: Add a new task function for ledger reconciliation**

Add a new function after the existing `performSessionCleanup`:

```typescript
/**
 * Task 5: Reconcile transactions against general ledger
 * Finds transactions missing corresponding GL entries and vice versa
 */
async function performLedgerReconciliation(): Promise<TaskResult> {
    const result: TaskResult = { count: 0, details: [] }

    try {
        // Find transactions without REVENUE ledger entries
        const orphanedTransactions = await db.execute(sql`
            SELECT t.id, t.transaction_number, t.status, t.created_at
            FROM transactions t
            LEFT JOIN general_ledger gl
                ON gl.source_type = 'TRANSACTION'
                AND gl.source_id = t.id
                AND gl.is_voided = false
            WHERE t.status IN ('COMPLETED', 'PARTIAL', 'DOWNPAYMENT_ASSIGNED')
              AND gl.id IS NULL
              AND t.created_at > NOW() - INTERVAL '30 days'
            ORDER BY t.created_at DESC
            LIMIT 100
        `)

        result.count = orphanedTransactions.rows.length

        if (orphanedTransactions.rows.length > 0) {
            result.details.push(
                `WARNING: ${orphanedTransactions.rows.length} completed transactions have no GL entries in last 30 days`
            )
            // Log each orphaned transaction (limit to first 10 to avoid log spam)
            for (const row of orphanedTransactions.rows.slice(0, 10)) {
                result.details.push(
                    `  TXN ${row.transaction_number} (${row.id.slice(0, 8)}...) status=${row.status}`
                )
            }
        } else {
            result.details.push("No orphaned transactions found")
        }

        await createLogs({
            logs: [{
                level: orphanedTransactions.rows.length > 0 ? 'WARN' : 'INFO',
                type: 'SYSTEM',
                message: `Daily reconciliation: ${orphanedTransactions.rows.length} orphaned transactions found`,
            }]
        })

        return result
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        result.details.push(`Error during ledger reconciliation: ${errorMessage}`)
        throw error
    }
}
```

**Step 2: Add a second check for payroll-to-transaction integrity**

```typescript
/**
 * Task 6: Reconcile payroll entries against transactions
 */
async function performPayrollReconciliation(): Promise<TaskResult> {
    const result: TaskResult = { count: 0, details: [] }

    try {
        // Find payroll entries with dangling transaction references
        const orphanedPayroll = await db.execute(sql`
            SELECT pe.id, pe.staff_id, pe.transaction_id, pe.payment_status
            FROM payroll_entry pe
            LEFT JOIN transactions t ON t.id = pe.transaction_id
            WHERE pe.transaction_id IS NOT NULL
              AND t.id IS NULL
              AND pe.payment_status != 'CANCELLED'
              AND pe.created_at > NOW() - INTERVAL '30 days'
            LIMIT 50
        `)

        result.count = orphanedPayroll.rows.length

        if (orphanedPayroll.rows.length > 0) {
            result.details.push(
                `WARNING: ${orphanedPayroll.rows.length} payroll entries reference nonexistent transactions`
            )
        } else {
            result.details.push("No orphaned payroll entries found")
        }

        await createLogs({
            logs: [{
                level: orphanedPayroll.rows.length > 0 ? 'WARN' : 'INFO',
                type: 'SYSTEM',
                message: `Daily payroll reconciliation: ${orphanedPayroll.rows.length} orphaned payroll entries found`,
            }]
        })

        return result
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        result.details.push(`Error during payroll reconciliation: ${errorMessage}`)
        throw error
    }
}
```

**Step 3: Wire the new tasks into the main handler**

In the `GET` handler, update the `DailyMaintenanceResult` interface to include the new tasks:

```typescript
interface DailyMaintenanceResult {
    success: boolean
    timestamp: string
    tasks: {
        qrDeactivation: TaskResult
        qrGeneration: TaskResult
        logCleanup: TaskResult & { olderThanDays: number }
        sessionCleanup: TaskResult
        ledgerReconciliation: TaskResult    // NEW
        payrollReconciliation: TaskResult   // NEW
    }
    errors: string[]
}
```

Initialize them in the result object:

```typescript
const result: DailyMaintenanceResult = {
    success: true,
    timestamp,
    tasks: {
        qrDeactivation: { count: 0, details: [] },
        qrGeneration: { count: 0, details: [] },
        logCleanup: { count: 0, details: [], olderThanDays: 90 },
        sessionCleanup: { count: 0, details: [] },
        ledgerReconciliation: { count: 0, details: [] },    // NEW
        payrollReconciliation: { count: 0, details: [] },   // NEW
    },
    errors,
}
```

Call them after the existing tasks:

```typescript
// Task 5: Ledger reconciliation
try {
    result.tasks.ledgerReconciliation = await performLedgerReconciliation()
} catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    errors.push(`Ledger reconciliation failed: ${errorMessage}`)
    result.tasks.ledgerReconciliation.details.push(`ERROR: ${errorMessage}`)
}

// Task 6: Payroll reconciliation
try {
    result.tasks.payrollReconciliation = await performPayrollReconciliation()
} catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    errors.push(`Payroll reconciliation failed: ${errorMessage}`)
    result.tasks.payrollReconciliation.details.push(`ERROR: ${errorMessage}`)
}
```

**Step 4: Verify `sql` is imported in the cron route**

```bash
grep -n "import.*sql" app/api/cron/daily/route.ts
```

If `sql` is not imported from `drizzle-orm`, add it:

```typescript
import { eq, and, lt, sql } from "drizzle-orm"
```

**Step 5: Verification — build check**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
bun run build 2>&1 | grep -E "error|✓|Ready"
```

Expected: Build succeeds.

**Step 6: Verification — manual endpoint check**

If running locally with `CRON_SECRET` set:

```bash
curl -s "http://localhost:3000/api/cron/daily?secret=$CRON_SECRET" | head -c 500
```

Or alternatively, verify the route is recognized:

```bash
ls -la app/api/cron/daily/route.ts
```

- [x] **Step 7: Commit**

```bash
git add app/api/cron/daily/route.ts
git commit -m "feat: add daily reconciliation checks for ledger and payroll integrity

New CRON tasks detect:
- Completed transactions missing GL revenue entries
- Payroll entries referencing deleted transactions
- Results logged as WARN if discrepancies found

Resolves Issue 10 from architectural audit."
```

---

## Phase 9: Final Verification & Code Review

**Goal:** Full-system build, lint, and gap analysis against all 8 targeted issues.

### Task 9.1: Full build and lint

- [x] **Step 1: Clean install and build**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
bun install
bun run build 2>&1
```

Expected: Zero errors.

- [x] **Step 2: Lint check**

```bash
bun run lint 2>&1 | tail -30
```

Expected: No new errors introduced by our changes (pre-existing warnings acceptable).

- [x] **Step 3: Verify all 8 issues have corresponding commits**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
git log --oneline | head -10
```

Expected: Commits referencing Issues 1, 2, 3, 4, 5, 6, 8, 10.

- [x] **Step 4: Commit final baseline**

```bash
git add -A
git commit -m "chore: final verification baseline — all audit hardening complete"
```

### Task 9.2: Gap analysis (what was NOT addressed)

- 🟡 **Issue 7 (Manual Payroll Entry Accounting Gap):** Deferred — requires design decision on whether to accrue expenses at entry creation or keep current pay-when-paid model. Needs stakeholder input.
- 🟢 **Issue 9 (Cache invalidation ordering):** Deferred — low severity, no business impact observed.
- 🔴 **DB-level CHECK constraint** (noted in schema comments): Deferred — requires a database migration. The schema comment in `server/db/schema/accounting.ts` says "NOTE: Add CHECK constraint via migration." This is outside application code and requires DBA coordination.

---

## Execution Order Summary

| Phase | Issue(s) | Severity | Estimated Changes | Files Touched |
|-------|----------|----------|-------------------|---------------|
| 0 | — | — | Pre-flight | 0 |
| 1 | #5 | MEDIUM | ~15 lines | `payment.ts`, `payroll.ts`, `payroll-disbursements.ts` |
| 2 | #1 | HIGH | ~30 lines | `transactions.ts` |
| 3 | #3 | MED-HIGH | ~15 lines | `accounting.ts` |
| 4 | #2 | HIGH | ~25 lines | `sales.ts` |
| 5 | #6 | MEDIUM | ~20 lines | `transactions.ts` |
| 6 | #4 | MEDIUM | ~50 lines | `transactions.ts` |
| 7 | #8 | LOW-MED | ~25 lines | `accounting.ts` |
| 8 | #10 | LOW | ~100 lines | `cron/daily/route.ts` |
| 9 | — | — | Verification | None |

---

> **Plan complete.** Each phase is independently buildable and committable. Execute in order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9.
