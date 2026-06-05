# Sales & Payroll Architecture: Bug Fixes & Integrity Design

**Date:** 2026-05-22
**Status:** Draft for review
**Scope:** Void subsystem, Payroll rate resolution, Today's Sales calculation, Artist per-item safety, Accounting integrity

---

## 1. Scope & Constraints

### 1.1 Source-of-Truth Rules

| # | Rule | Rationale |
|---|------|-----------|
| R1 | A **sale** and its **payroll entries** are *logically coupled but transactionally independent*. The sale must succeed even if payroll entry creation fails. | Sale revenue is the atomic event; payroll is derived. Payroll failures must not block revenue recording. |
| R2 | **Voiding** a transaction MUST reverse ALL derived state: inventory, payroll entries, accounting ledger entries, and downpayment liability. | A void must leave the system in the same state as if the transaction never occurred. |
| R3 | **Payroll rate resolution** MUST follow a three-tier fallback chain: exact (service + client + level) → level-less (service + client) → walkin-default (service + WALKIN). | Staff with any rate level must always resolve to a valid split; never silently fail. |
| R4 | **Today's Sales** represents economic activity today: sum of `amountPaid` (not `total`) across COMPLETED + PARTIAL + DOWNPAYMENT statuses. | `total` includes future unpaid balances; amountPaid reflects real cash/revenue movement. |
| R5 | **Per-item artist assignments** are independent of the transaction-level `staffId`. Void and payroll reversal logic must handle both dimensions. | A Shop Sale (staffId=null) can still have services assigned to individual artists. |

### 1.2 Security Constraints

- All server actions check authentication (`getCurrentUser()`) and authorization (`canAccessTransactions`, `canManagePayroll`) at entry.
- Payroll entry creation is an internal function (`calculateAndCreatePayrollEntry`) never exposed to client invocation.
- Accounting entries are created via `createAutoLedgerEntry` which enforces source typing and user attribution.
- Input sanitization via `sanitizeText` / `sanitizeMinimal` applies to all user-authored descriptions and labels.
- Rate-level IDs are resolved from the user record (trusted server-side lookup), not from client-supplied keys.

---

## 2. Current Problem Map

### 2.1 Void Subsystem (transactions.ts)

```
voidTransaction(payload)
├── 1. [OK]   Fetch transaction, guard VOIDED
├── 2. [OK]   Restore inventory stock
├── 3. [OK]   Update status → VOIDED
├── 4. [OK]   Create reversing accounting entries (VOIDED_SALES, debit = amountPaid)
├── 5. [BUG]  Downpayment liability NOT reversed (missing debit entry for LIABILITY/UNEARNED_REVENUE)
│              Only isSettled=toggle; accounting ledger still shows the credit as live.
├── 6. [BUG]  Payroll reversal gated on `transaction.staffId`
│              → MISSES entries created for per-item artist_id assignments
│              → Also doesn't handle transaction with staffId=null but artist_id on items
└── 7. [BUG]  Downpayment amount validation uses `>=` instead of `>` (blocks full downpayments)
```

### 2.2 Payroll Rate Resolution (payroll.ts)

```
calculateAndCreatePayrollEntry(input)
├── 1. [OK]   Fetch staff record for rateLevelId
├── 2. [BUG]  getApplicableRate(serviceType, clientType, rateLevelId) → returns null
│              if no exact combo found. No fallback.
│              → Failure: "No rate found for TATTOO / WALKIN (level: …)"
│              → Entry not created; payrollErrors[] populated but not retried
└── 3. [OK]   If rate found, calculate split, create entry with snapshots
```

### 2.3 Per-Item Artist Safety (transactions.ts → payroll.ts)

```
createTransaction → payroll loop (line 347+)
├── [BUG]  const performerId = item.artist_id || payload.staff_id!
│           staff_id may be null (Shop Sale) and artist_id may be undefined
│           → passes null to calculateAndCreatePayrollEntry → DB error
└── [Note] hasStaffAssignment check is correct: staff_id || items.some(artist_id)
```

### 2.4 Today's Sales (transactions.ts)

```
getTodaySummary()
├── [BUG]  sum(transactions.total) → includes future unpaid amounts for PARTIAL/DOWNPAYMENT
│           Should sum amountPaid for cash-collected view
├── [BUG]  Filter: only COMPLETED status → misses PARTIAL, DOWNPAYMENT_ASSIGNED
│           Should include active statuses that represent real economic activity
└── [BUG]  Branch filter uses unsafe `branchId!` non-null assertion
```

---

## 3. Architectural Boundaries

### 3.1 Data Flow Diagram

```
┌──────────────────┐     withTransaction() block     ┌───────────────────┐
│  SalesContext    │ ──► createTransaction(payload)   │  transactions DB  │
│  (Client-side)   │     ├── Validate inventory stock  │  (table)          │
└──────────────────┘     ├── Insert transaction       └────────┬──────────┘
         │               ├── Insert items                      │
         │               ├── Decrement inventory                │
         │               ├── Insert payments                   │
         │               ├── Insert downpayment record         │
         │               ├── Create auto-ledger-entry (REV)    │
         │               └── RETURN newTransaction             │
         │                                                     │
         │           ─ ─ ─ OUTSIDE TRANSACTION ─ ─ ─           │
         │                                                     │
         ├──────────────────► for each service item:           │
         │                    calculateAndCreatePayrollEntry() │
         │                    ├── getApplicableRate()          │
         │                    ├── insert payroll_entry         │
         │                    └── return │ success/failure     │
         │                               │                     │
         ▼                               ▼                     │
   Return { transaction,         payrollErrors[]               │
     payrollErrors? }                  │                       │
                                       ▼                       │
                                Payroll DB (table) ────────────┘
                                                           ▲
┌──────────────────┐     withTransaction() block          │
│  voidTransaction │ ──► 1. Restore inventory             │
│  (Server Action) │     2. Update status → VOIDED        │
└──────────────────┘     3. Create reversing ledger entry │
                         4. Settle downpayment (missing    │
                            liability reversal)           │
                         5. Cancel payroll entries ───────┘
                            (BUG: gated on staffId,
                             misses per-item artists)
```

### 3.2 Module Boundaries

| Module | Responsibility | Depends On |
|--------|---------------|------------|
| `transactions.ts` | Create, void, refund, pay, query transactions | `inventory.ts`, `accounting.ts`, `payroll.ts`, `downpayments.ts` |
| `payroll.ts` | Calculate commissions, create/fetch/complete payroll entries | `settings.ts`, `accounting.ts` |
| `accounting.ts` | `createAutoLedgerEntry` — dual-ledger entry creation | `generalLedger` schema |
| `SalesContext.tsx` | Client-side state, cart, checkout orchestration | Server actions above |

### 3.3 Transaction Boundaries (Critical)

- **WRITE operations** (create, void, refund, add payment) all use `withTransaction()` from `server/db/transactions.ts`
- `withTransaction({ action: 'ACCOUNTING' | 'PAYROLL' })` wraps operations in a Postgres transaction
- Payroll entry creation is intentionally **outside** the sale transaction to prevent sale rollback on payroll failure
- **CONSEQUENCE:** Sale commits → payroll fails → manual reconciliation needed (mitigated by `payrollErrors` in response)

---

## 4. Fix Specifications

### 4.1 Fix: Void Payroll Reversal — Remove staffId Gate

**File:** `server/actions/transactions.ts` — `voidTransaction()`

**Current (bug):**
```typescript
if (transaction.staffId) {  // ← only catches transaction-level staff
    const { cancelPayrollEntriesForTransaction } = await import('./payroll')
    const payrollResult = await cancelPayrollEntriesForTransaction(transaction.id, user.id, tx)
    if (!payrollResult.success) {
        throw new Error(...)
    }
}
```

**Required:**
```typescript
// REMOVE the staffId gate entirely.
// cancelPayrollEntriesForTransaction queries payroll_entry table directly
// by transactionId — it handles zero entries gracefully.
const { cancelPayrollEntriesForTransaction } = await import('./payroll')
const payrollResult = await cancelPayrollEntriesForTransaction(transaction.id, user.id, tx)
if (!payrollResult.success) {
    throw new Error(`Payroll reversal failed for voided transaction ${transaction.transactionNumber}: ${payrollResult.error}`)
}
```

**Rationale:** `cancelPayrollEntriesForTransaction` already queries `payrollEntry WHERE transactionId = ?` and handles the zero-entries case. The `staffId` gate was a redundant optimization that introduced a correctness bug for per-item artist assignments.

### 4.2 Fix: Downpayment Liability Reversal on Void

**File:** `server/actions/transactions.ts` — `voidTransaction()`

**Current:** Downpayment is settled (`isSettled = true`) but no accounting entry reverses the original `UNEARNED_REVENUE` credit.

**Required:** After settling the downpayment, add a DEBIT entry to reverse the liability:

```typescript
// After downpayment settlement — reverse the original liability
if (downpayment) {
    // 1. Settle the downpayment record
    await tx.update(downpayments).set({ isSettled: true, updatedAt: new Date() })
        .where(eq(downpayments.id, downpayment.id))

    // 2. Reverse the liability — debit the same UNEARNED_REVENUE category
    await createAutoLedgerEntry(
        'TRANSACTION',
        transaction.id,
        {
            entry_date: new Date(),
            entry_type: 'LIABILITY',
            category: 'UNEARNED_REVENUE',
            description: `Voided downpayment: ${transaction.transactionNumber}`,
            reference: `VOID-DP-${transaction.transactionNumber}`,
            debit: Number(downpayment.amount),   // ← reversal debit
            credit: 0,
            branch_id: transaction.branchId,
        },
        user.id,
        tx
    )
}
```

**Downpayment Amount Validation** — Change from `>=` to `>` at line 669:
```typescript
if (downpaymentAmount > payload.total) {  // was >=
    throw new Error('Downpayment amount must be less than the transaction total')
}
```

### 4.3 Fix: Payroll Rate Fallback Chain

**File:** `server/actions/payroll.ts` — `calculateAndCreatePayrollEntry()`

**Current:** Single attempt → failure if no exact match.

**Required:** Three-tier fallback:

```
getApplicableRate(serviceType, clientType, rateLevelId)
├── 1st attempt:  (serviceType, clientType, rateLevelId)     // exact match
├── 2nd attempt:  (serviceType, clientType, null)            // level-less fallback
└── 3rd attempt:  (serviceType, 'WALKIN', null)              // walkin-default fallback
    → If all three fail, return proper error message listing what was tried
```

**Implementation:** Modify the rate lookup block (lines 840-870):

```typescript
const rateLevelId = staffRecord[0]?.rateLevelId

// Three-tier fallback
let rate = null
const fallbackAttempts = [
    { serviceType, clientType, rateLevelId },
    { serviceType, clientType, rateLevelId: null },
    { serviceType, clientType: 'WALKIN', rateLevelId: null },
]

for (const attempt of fallbackAttempts) {
    const result = await getApplicableRate(
        attempt.serviceType as ServiceType,
        attempt.clientType as ClientType,
        attempt.rateLevelId || undefined
    )
    if (result.success && result.data) {
        rate = result.data
        break
    }
}

if (!rate) {
    return failure(
        `No rate found for ${serviceType} / ${clientType}` +
        (rateLevelId ? ` (level: ${rateLevelId})` : '') +
        ` — tried exact match, standard rate, and walk-in default. ` +
        `Configure a rate in Payroll Settings.`
    )
}
```

### 4.4 Fix: Per-Item Artist Null Safety

**File:** `server/actions/transactions.ts` — `createTransaction()` payroll loop

**Current (line 349):**
```typescript
const performerId = item.artist_id || payload.staff_id!
```

**Required:**
```typescript
const performerId = item.artist_id || payload.staff_id
if (!performerId) {
    // Item has service_id but no artist assignment — skip payroll for this item
    // This can happen with Shop Sale (staff_id=null) and no per-item artist
    payrollErrors.push({
        serviceId: item.service_id,
        error: 'No artist assigned — payroll entry not created'
    })
    continue
}
```

### 4.5 Fix: Today's Sales Aggregation

**File:** `server/actions/transactions.ts` — `getTodaySummary()`

**Current:**
```typescript
whereClause = and(
    gte(transactions.createdAt, todayStart),
    lte(transactions.createdAt, todayEnd),
    eq(transactions.status, 'COMPLETED')
)
// ...
totalSales: sum(transactions.total)
```

**Required:**
```typescript
// Include all active (non-voided/non-refunded) statuses
const activeStatuses = ['COMPLETED', 'PARTIAL', 'DOWNPAYMENT_ASSIGNED', 'DOWNPAYMENT_PENDING']

whereClause = and(
    gte(transactions.createdAt, todayStart),
    lte(transactions.createdAt, todayEnd),
    sql`${transactions.status} IN (${sql.join(activeStatuses.map(s => sql`${s}`), sql`, `)})`
)
// ...treat 'PAID' as synonym for COMPLETED in your enum

// Sum amountPaid for real cash collected today
totalSales: sum(transactions.amountPaid)
```

**Branch filter — safe conditional:**
```typescript
if (branchId) {
    whereClause = and(
        whereClause,
        or(eq(transactions.branchId, branchId), isNull(transactions.branchId))
    )
}
```
Remove the `branchId!` non-null assertion. The `if (branchId)` guard already ensures it's defined. If the assertion was added for TypeScript narrowing, use a proper type guard or early return.

### 4.6 Fix: Accounting Entry Consistency on Void

**File:** `server/actions/transactions.ts` — `voidTransaction()`

**Current:** Split-payment reversing logic creates one entry per payment method (line 708+). Single-entry logic (line 723+) debits `amountPaid`.

**Required (no structural change — already correct, just audit):**

The current logic for reversing the sale revenue is correct:
- Split payments → one debit entry per payment method, each debiting the payment amount
- Single payment → one debit entry for `amountPaid`

**Audit check needed:** Ensure the combined debit total equals `amountPaid` from the original transaction. The `accounting.ts` `createAutoLedgerEntry` function should enforce this at write time. If not, add an assertion:

```typescript
const totalReversalDebit = originalPayments.reduce((sum, p) => sum + Number(p.amount), 0)
if (Math.abs(totalReversalDebit - Number(transaction.amountPaid)) > 0.01) {
    // Log warning but don't fail — accounting team can reconcile
    await logError({
        type: 'ACCOUNTING',
        message: `Void reversal amount mismatch for ${transaction.transactionNumber}: ` +
            `reversal=${totalReversalDebit}, amountPaid=${Number(transaction.amountPaid)}`
    })
}
```

---

## 5. Error Handling & Edge Cases

| Scenario | Expected Behavior | Fallback |
|----------|------------------|----------|
| Payroll rate not found after 3-tier fallback | Entry not created, `payrollErrors` populated | Admin configures rate; no data loss |
| Void of transaction with ALREADY PAID payroll entries | Void still succeeds; payroll reversal only affects PENDING/REQUESTED/CONFIRMED | Paid entries require manual adjustment by admin |
| Void of downpayment transaction | Downpayment liability reversed; downpayment record settled | Accounting entries fully balance |
| Multiple payment methods on void | One reversal entry per method | Total debit equals original credit |
| Shop Sale (staffId=null, no artist_ids) | No payroll entries attempted | Transaction void succeeds |
| Today's Sales after voided transactions | Voided transactions removed from aggregation (status filter) | Void reversal entries in ledger |

---

## 6. Dependency Map

```
Fix 4.1 (Void Payroll Gate) → depends on: cancelPayrollEntriesForTransaction already existing
Fix 4.2 (Downpayment Liability) → depends on: createAutoLedgerEntry already existing
Fix 4.3 (Rate Fallback) → depends on: getApplicableRate accepts undefined rateLevelId (already does)
Fix 4.4 (Artist Safety) → isolated change
Fix 4.5 (Today's Sales) → isolated change
Fix 4.6 (Accounting Audit) → isolated addition
```

**Implementation Order:** Any order is safe. All fixes are isolated to their respective functions with no cascading dependencies. Recommended order:
1. Fix 4.3 (Rate Fallback) — highest user impact, unlocks payroll for all staff with rate levels
2. Fix 4.1 (Void Payroll Gate) — fixes void for per-item artists
3. Fix 4.2 (Downpayment Liability) — accounting integrity
4. Fix 4.4 (Artist Safety) — prevents null crash
5. Fix 4.5 (Today's Sales) — dashboard accuracy
6. Fix 4.6 (Accounting Audit) — safety net

---

## 7. Test Vectors

| # | Test Case | Expected Outcome | Domain |
|---|-----------|-----------------|--------|
| T1 | Create sale with per-item artist assignments, then void | All payroll entries cancelled; inventory restored; ledger balanced | Void |
| T2 | Create sale with downpayment (staff has rate level), void | Downpayment liability reversed; payroll entries cancelled | Void + Accounting |
| T3 | Staff with rateLevelId, no rate configured for that level | Falls back to standard rate; payroll entry created | Payroll |
| T4 | Staff with rateLevelId, no rate for that level OR standard | Falls back to WALKIN default; entry created with warning | Payroll |
| T5 | Shop Sale with service item (no artist_id) | Payroll skipped; no crash | Safety |
| T6 | Create partial payment transaction, check Today's Sales | Shows amountPaid not total | Dashboard |
| T7 | Create sale, mark as DOWNPAYMENT_ASSIGNED, check Today's Sales | Included in count and sum | Dashboard |

---

## 8. Out of Scope

- **Refunding vs Voiding:** The existing `refundTransaction` function has similar issues (payroll reversal gated on staffId). However, its logic is structurally different and warrants its own audit scope.
- **Payroll entry PAID → reversal:** Already-paid payroll entries cannot be reversed by void/refund. The system handles this correctly by only cancelling PENDING/REQUESTED/CONFIRMED entries.
- **Multi-branch aggregation for Today's Sales:** The current per-branch filter with `isNull(branchId)` fallback is acceptable. Full cross-branch rollup is a future feature.
- **Performance optimization of getApplicableRate:** The current query pattern is fine for single-entry lookups. No indexing changes needed.
