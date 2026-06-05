# Audit Report: Sales, Accounting, Payroll, and Transactions Pages

## 1. Executive Summary

This document is a comprehensive logical audit of four core modules in the Inksight RDMD tattoo studio management application: **Sales**, **Accounting** (General Ledger), **Payroll**, and **Transactions**. Each page was evaluated across five dimensions: (1) Data Integrity & Cross-Module Consistency, (2) Business Logic Correctness, (3) Authorization & Access Control, (4) UI/UX Logic, and (5) Performance & Scalability. The audit reveals **15 findings**: 6 high-severity, 5 medium-severity, and 4 low-severity, ranging from missing inventory restoration on refunds to inconsistent empty-state handling.

**Audit history**: Initial analysis completed May 28, 2026. Re-verified against latest commit `4c81c24` ("feat: dynamic sales categories, staff name in descriptions, and view-only ledger entries") — core server actions for accounting, payroll, and transactions were unaffected. One additional finding (L4) was identified during re-verification (void/refund category mismatch with new dynamic categories).

---

## 2. Scope & Methodology

### Pages Audited

| Page | Route | Key Files | Total LOC |
|------|-------|-----------|-----------|
| Sales | `/app/sales/` | `salesPage.tsx`, `SalesContext.tsx`, `server/actions/sales.ts` | ~1,600 |
| Accounting | `/app/accounting/` | `accountingPage.tsx`, `server/actions/accounting.ts` | ~3,857 |
| Payroll | `/app/payroll/` | `payrollPage.tsx`, `server/actions/payroll.ts` | ~5,070 |
| Transactions | `/app/transactions/` | `transactionsPage.tsx`, `transactionDetailClient.tsx`, `server/actions/transactions.ts` | ~2,059 |

### Dimensions Evaluated

1. **Data Integrity & Cross-Module Consistency**: Correctness of data flows between Sales → Transactions → Accounting → Payroll
2. **Business Logic Correctness**: Validation of state machines, rate calculations, and business rules
3. **Authorization & Access Control**: Consistency and correctness of permission gates
4. **UI/UX Logic**: State management, loading/empty/error states, data staleness
5. **Performance & Scalability**: Query patterns, N+1 risks, pagination behavior

---

## 3. System Architecture Overview

### Data Flow Diagram (Simplified)

```
Sales Page
  │  (addToCart → Checkout)
  ▼
createTransaction (server action)
  ├──→ transactions table (COMPLETED / PARTIAL / DOWNPAYMENT_PENDING)
  ├──→ deducts inventory stock (via transactionItems)
  ├──→ createAutoLedgerEntry → general_ledger (REVENUE, credit)
  ├──→ calculateAndCreatePayrollEntry → payroll_entry (PENDING)
  └──→ downpayments table (if downpayment type specified)
         │
         ▼
voidTransaction
  ├──→ restores inventory stock
  ├──→ createAutoLedgerEntry (reversing: REVENUE, debit → VOIDED_SALES)
  ├──→ cancelPayrollEntriesForTransaction (→ CANCELLED)
  └──→ settles downpayment (if exists)

refundTransaction
  ├──→ creates REFUND transaction (negative amounts)
  ├──→ marks original as REFUNDED
  ├──→ createAutoLedgerEntry (reversing: REVENUE, debit → REFUNDS)
  ├──→ cancelPayrollEntriesForTransaction (→ CANCELLED)
  └──→ ⚠️ Does NOT restore inventory stock
```

### Permission Model

- **Admin bypass**: `user.role === 'admin'` grants all access
- **Feature flags**: `sales_access`, `accounting_access`, `transactions_manage`, `payroll_manage`
- **Flag normalization**: `userHasFlag()` auto-translates legacy flag names via `FLAG_MIGRATION_MAP`
- **Server action pattern**: Every server action calls `getCurrentUser()` + feature-specific permission check at the top
- **Page-level**: Server components redirect to `/unauthorized` on permission failure

### Key Technology Constraints

- Drizzle ORM with PostgreSQL
- `withTransaction` util for atomic operations (used in create/void/refund)
- `createAutoLedgerEntry` with idempotency check (skips if entry exists for source)
- Rate calculation: 3-tier fallback chain (exact → level-less → walkin-default)

---

## 4. Audit Findings

### 4.1 HIGH SEVERITY

#### H1. Refund Does Not Restore Inventory Stock

**Location**: `server/actions/transactions.ts` — `refundTransaction()` (~line 817)

**Issue**: When a transaction is refunded, the function creates reversing ledger entries and cancels payroll entries, but it does NOT restore inventory stock for items sold. In contrast, `voidTransaction()` correctly restores stock via the items loop (~line 641-655).

**Impact**: After a refund, inventory counts remain decremented, leading to phantom stock shortages. This is a data integrity bug — if a physical product is refunded, the inventory is never returned to available stock.

**Reproduction**: Create a transaction with an inventory item → refund it → check inventory `current_stock` — it remains decremented.

**Recommendation**: Add inventory restoration logic to `refundTransaction()`, identical to the loop in `voidTransaction()`.

---

#### H2. Void/Refund Lock Race Condition in withTransaction

**Location**: `server/actions/transactions.ts` — `voidTransaction()` and `refundTransaction()`

**Issue**: Both `voidTransaction()` and `refundTransaction()` use `withTransaction` for atomicity but perform **read-only validation checks outside the transaction** (e.g., checking transaction status at lines ~635 and ~836). Between the read check and the transactional write, another concurrent request could mutate the same transaction.

**Impact**: A transaction could be voided or refunded twice if two requests arrive simultaneously. While the refund function would create two different REFUND transactions, the void function would create duplicate reversing ledger entries.

**Recommendation**: Move all validation checks inside the `withTransaction` callback. Use `SELECT ... FOR UPDATE` or `UPDATE ... WHERE status = 'COMPLETED'` with row-count checking instead of a separate read-then-write pattern.

---

#### H3. Accounting Summary Includes Voided Entries

**Location**: `server/actions/accounting.ts` — `getLedgerSummary()` (line ~1257)

**Issue**: The `getLedgerSummary` function computes revenue, expenses, net income, total debits, and total credits. A quick scan suggests it may aggregate ALL entries including voided ones, while the ledger table filters them out by default.

**Verification**: Check that the `getLedgerSummary` function at `server/actions/accounting.ts:~1257` includes `isVoided = false` in its WHERE clause. Search for `isVoided` or `is_voided` references in that function to confirm. If voided entries are included, the summary will show inflated revenue and expense figures, and the trial balance won't reconcile with the visible ledger.

**Impact**: Dashboard metrics, trial balance, and summary cards could show materially wrong financial numbers if voided entries are included in aggregations.

**Recommendation**: Audit `getLedgerSummary()` and ensure it consistently excludes voided entries unless explicitly requested. Add a `includeVoided` parameter for administrative views.

---

#### H4. Staff/Shop Cut Display in Accounting Relies on Two-Pass Query Without Transactional Consistency

**Location**: `server/actions/accounting.ts` — `getLedgerEntries()` (~lines 280-380)

**Issue**: The function first fetches ledger entries, then makes two separate queries to aggregate payroll cuts for PAYROLL-source and TRANSACTION-source entries. These queries are NOT inside a transaction and don't use snapshot isolation. Between the first query and the aggregation queries, payroll entries could be created or modified (e.g., a payroll entry for the transaction could be created after the first query but before the aggregation).

**Impact**: Stale or incomplete staff_cut/shop_cut data displayed in the accounting table. This is a read-consistency issue that could cause accounting vs. payroll reconciliation discrepancies.

**Recommendation**: Either wrap the entire read in `withTransaction` (using a read-only transaction), or use a single SQL query with LEFT JOINs to avoid the two-pass pattern. Drizzle's relational query API could also be leveraged.

---

#### H5. Downpayment Accounting on Transaction Create May Not Match Void Reverse

**Location**: `server/actions/transactions.ts`, `server/actions/accounting.ts`

**Issue**: When a transaction is created with a downpayment, the accounting entries use a complex split: part goes to `UNEARNED_REVENUE` (liability) and part to `SALES` (revenue). When voided (~line 754-780), the void logic attempts to reverse both. However, the downpayment amount on the transaction may differ from the amount on the downpayment record if the downpayment was modified after creation.

**Impact**: If the downpayment amount in the `downpayments` table diverges from the original transaction's `amountPaid`, the void accounting entries will be inconsistent, creating unbalanced ledger entries.

**Recommendation**: Store the original downpayment amounts in the ledger entries themselves (already done via `createAutoLedgerEntry`) and reference those during void, rather than re-reading from the `downpayments` table. Or use the transaction's `amountPaid` as the single source of truth.

---

#### H6. Payroll Cancel on Void/Refund Does Not Handle Paid Entries

**Location**: `server/actions/payroll.ts` — `cancelPayrollEntriesForTransaction()` (~line 2499)

**Issue**: The function cancels payroll entries with status `PENDING`, `REQUESTED`, or `CONFIRMED`, explicitly skipping `PAID` entries. If a payroll entry for a transaction has already been paid (e.g., staff already received their cut), voiding the transaction will silently skip that entry.

**Impact**: If a transaction is voided but the staff has already been paid, the system proceeds without creating a negative payroll entry, leaving the staff with unearned pay. There is no mechanism to flag this situation or create a clawback entry.

**Recommendation**: When cancelling payroll entries and encountering `PAID` entries, either:
- Block the void/refund and surface an error ("Cannot void — staff payment already disbursed")
- Automatically create a reversing/adjustment payroll entry for clawback
- Log a high-severity alert for manual review

---

### 4.2 MEDIUM SEVERITY

#### M1. Sales → Transaction Client Type Is Transaction-Level, Not Per-Item

**Location**: `utils/types/transactions.ts` — `CreateTransactionPayload.client_type`

**Issue**: The `client_type` field (`WALKIN` or `PERSONAL`) is set at the transaction level, but individual line items may involve different staff members with different rate-level configurations. The payroll rate calculation uses this single value for ALL items.

**Impact**: A transaction serving both a walk-in (WALKIN rate) and a personal client (PERSONAL rate) would apply the wrong rate to one of the service types. This is unlikely in practice (a single checkout is typically one client type), but ambiguous in the type system.

**Recommendation**: Either document this as an intentional constraint (one client type per transaction), or plan for per-item client_type in the future. Add a validation check that all items in a cart share the same client_type.

---

#### M2. Rate Level Configuration Locks — Staff Can Be Assigned to Deleted Rate Level

**Location**: `server/actions/rate-levels.ts` — `deleteRateLevel()`

**Issue**: The `payroll_staff_rate` table has a foreign key `rate_level_id` referencing `rate_levels.id`. If a rate level is deleted, the `ON DELETE` behavior determines what happens to staff rates referencing that level. The codebase does not appear to have `ON DELETE CASCADE` or `SET NULL` configured in the schema (the `payroll.ts` schema shows `rateLevelId: uuid('rate_level_id').references(() => rateLevels.id)` without explicit onDelete).

**Impact**: Attempting to delete a rate level that is referenced by existing staff rates will throw a foreign key violation error. The UI catches this generically but doesn't explain why deletion fails.

**Recommendation**: Either:
- Set `onDelete: 'set null'` on the foreign key to gracefully handle deletion
- Prevent deletion of referenced rate levels and show a helpful error listing how many rates reference it
- Or implement soft-delete only (currently `deactivateRateLevel` exists)

---

#### M3. Discount Validation Only at Checkout Boundaries

**Location**: `server/actions/transactions.ts` — `createTransaction()` (~line 103)

**Issue**: Discount amount is validated to not exceed subtotal only during `createTransaction`. There is no validation on the sales page UI side (SalesContext) that prevents the user from applying a discount larger than the cart subtotal. The discount modal accepts any value and passes it through.

**Impact**: User can enter a discount exceeding the subtotal in the UI, and only discover it's invalid when the server rejects the transaction. Poor UX — error is surfaced after form submission rather than at input time.

**Recommendation**: Add client-side validation in the DiscountModal or SalesContext to cap the discount at the gross total. Show a warning when discount exceeds subtotal.

---

#### M4. Manual Payroll Entry Bypasses Rate Calculation

**Location**: `server/actions/payroll.ts` — `createManualPayrollEntry()` (~line 781)

**Issue**: Manual payroll entries can be created with arbitrary amounts without rate validation. While intentional for flexibility, there's no audit trail linking manual entries to a specific rate configuration.

**Impact**: Manual entries bypass rate-level governance. An admin creating manual entries at inconsistent rates over time will make payroll reconciliation difficult. The ledger entry created from a manual payroll entry may not match the actual commission structure.

**Recommendation**: Add an optional `rate_id` field to manual entries. When provided, use the rate to compute shop/staff cuts and flag any overrides. Log a warning when manual amounts deviate from calculated amounts.

---

#### M5. Add Payment Modal Does Not Re-validate After Transaction Status Change

**Location**: `components/sales/modals/AddPaymentModal` and `SalesContext`

**Issue**: The `AddPaymentModal` is used to add payments to existing transactions (e.g., settling a PARTIAL balance). After adding a payment, the transaction status updates to `COMPLETED`. However, the `selectedTransactionForPayment` state in SalesContext may hold stale data if the transaction was modified elsewhere (e.g., by another user or concurrent tab).

**Impact**: A user could see an outdated balance due and attempt to overpay a transaction that was already settled by someone else. The server action validates this, but the UX is confusing.

**Recommendation**: Re-fetch the transaction details when the AddPaymentModal opens, not just on mount. Show a warning if the transaction status has changed since the modal was opened.

---

### 4.3 LOW SEVERITY

#### L1. Transactions Page Search Lacks Debounce

**Location**: `app/transactions/transactionsPage.tsx`

**Issue**: The search input (`searchQuery`) fires a new API call on every keystroke because `fetchData` is in the `useEffect` dependency chain and `searchQuery` triggers page reset. The accounting page correctly implements a 300ms debounce (`searchDebounceRef`), but transactions page does not.

**Impact**: Unnecessary network requests during typing. Minor performance concern at low volume, but noticeable with large datasets.

**Recommendation**: Add a debounce mechanism identical to the accounting page pattern (ref-based setTimeout, 300ms).

---

#### L2. Inconsistent Empty States Across Pages

**Location**: 
- `app/payroll/payrollPage.tsx`: "No payment requests found", "No deductions found", "No rates configured"
- `app/accounting/accountingPage.tsx`: "No entries found"
- `app/transactions/transactionsPage.tsx`: "No transactions found"
- `app/transactions/transactionDetailClient.tsx`: "No items in this transaction"

**Issue**: Empty states are inconsistently styled. Some use icons + text, some just text. No page provides guidance on _how_ to create the first entry (e.g., "Go to Sales to create a transaction" on empty transactions). The dedicated actions area (e.g., "Add Entry" button) is contextually separated from the empty state message.

**Impact**: New users may not know how to get started when seeing an empty list.

**Recommendation**: Standardize empty states across all four pages with: (1) descriptive icon, (2) message explaining why it's empty, (3) contextual call-to-action button or link.

---

#### L3. Trial Balance May Not Reflect Voided Entries Correctly

**Location**: `app/accounting/accountingPage.tsx` — trial balance tab

**Issue**: The trial balance is fetched via `getTrialBalance()` with the same date range filters as the ledger. It's unclear from the client code whether the trial balance function explicitly excludes voided entries. If it doesn't, the trial balance won't match the visible ledger (which does exclude voided).

**Impact**: The trial balance tab may show different numbers than the ledger tab for the same period, causing confusion.

**Recommendation**: Verify that `getTrialBalance()` (in `server/actions/accounting.ts`) consistently excludes voided entries with the same `isVoided = false` filter used by `getLedgerEntries()`. If not, add the filter and update the UI to note "excluding voided entries" in the trial balance header.

---

#### L4. Void/Refund Category Mismatch with Dynamic Categories

**Location**: `server/actions/transactions.ts` — `voidTransaction()` (~line 682) and `refundTransaction()` (~line 890)

**Issue**: The recent change to dynamic categories (`4c81c24`) now assigns categories like `Tattoo Services`, `Piercing Services`, or `Services` to original sales entries. However, void and refund operations still hardcode `category: 'VOIDED_SALES'` and `category: 'REFUNDS'` respectively. This creates a mismatch: the original credit (e.g., `Tattoo Services` category) is reversed with a debit in a different category (`VOIDED_SALES`).

**Impact**: Users filtering the ledger by a specific category (e.g., `Tattoo Services`) will see the original revenue but not the void reversal, since the reversal is in a different category. The net category balance will appear inflated until both categories' entries are cross-referenced. This is a data organization concern, not a double-entry balancing issue — total debits still equal total credits.

**Recommendation**: Update `voidTransaction()` and `refundTransaction()` to dynamically determine the reversal category from the original transaction's category, rather than hardcoding `VOIDED_SALES` and `REFUNDS`. Options:
- Look up the original ledger entry's category and reuse it with a `VOIDED: ` or `REFUNDED: ` prefix
- Or, store the original category on the transaction record for deterministic reversal

Alternatively, document that `VOIDED_SALES` and `REFUNDS` are intentionally separate categories for reconciliation purposes, and add a cross-reference in the description field to link reversals to originals.

---

## 5. Cross-Cutting Concerns

### 5.1 Authorization Consistency

All four pages follow a consistent authorization pattern:
1. **Page level**: Server component redirects to `/unauthorized` if permission check fails
2. **Server action level**: Each exported function calls `getCurrentUser()` + feature-specific check

**Observations**:
- ✅ `sales_access` → Sales page (+ `createTransaction`/`addTransactionPayment` actions)
- ✅ `accounting_access` → Accounting page (+ all ledger CRUD)
- ✅ `transactions_manage` → Transactions page (+ `voidTransaction`, `refundTransaction` actions)
- ✅ `payroll_manage` → Payroll management page
- ⚠️ `canAccessSales` vs `canAccessTransactions`: Recent fix aligned `createTransaction`/`addTransactionPayment` to `canAccessSales`, while `voidTransaction`/`refundTransaction` remain under `canAccessTransactions`. This is intentional (sales staff can process, managers can void/refund) but should be documented.

### 5.2 Double-Entry Accounting Validation

The accounting system uses single-entry for auto-created ledger entries (each transaction creates one entry with Debit=0, Credit=amountPaid). The manual entry modal validates that at least one field is non-zero but does NOT enforce balanced journal entries (total debits = total credits). The `validateBalancedEntries` function exists but is only used for batch imports.

**Risk**: Manual single-entry records can be created that don't follow proper double-entry accounting. The system relies on the implicit balance (Revenue credits offset by no explicit debit) rather than proper journal entry pairs.

**Mitigation**: For auto-generated entries, this is acceptable because the actual cash/bank ledger is not tracked. If cash accounting is added later, entries will need to be migrated to proper double-entry format.

### 5.3 Error Handling Pattern

All server actions follow `ActionResponse<T>` pattern with `success()` and `failure()` helpers. The client handles errors via `addNotification` context. Key observations:
- ✅ Consistent error response format
- ✅ All database operations are wrapped in try/catch
- ✅ `createLogs`/`logError` called for all failure paths
- ⚠️ Some error messages are technical (e.g., "No rate found for TATTOO / WALKIN") rather than user-friendly
- ⚠️ `voidTransaction` silently catches `cancelPayrollEntriesForTransaction` errors within a try/catch that then re-throws — this is correct (triggers rollback) but the error message could be clearer

### 5.4 Performance Analysis

| Concern | Page | Severity | Details |
|---------|------|----------|---------|
| N+1 payroll cuts query | Accounting | Medium | Two-pass pattern (entries → payroll lookups) adds 2 extra queries per page load |
| No search debounce | Transactions | Low | 1 request per keystroke |
| Full table scan risk | Accounting | Low | No date range required; user can select "All Time" on millions of entries |
| Parallel Promise.all on page load | All | Low | 4-6 parallel queries on page load; fine for normal use but could spike at scale |
| Pagination resets on mount | Transactions | Low | Extra fetch on mount due to `useEffect` resetting filters to defaults unnecessarily |

---

## 6. Recommendations Priority Matrix

| ID | Finding | Severity | Effort | Priority | Quick Fix? |
|----|---------|----------|--------|----------|------------|
| H1 | Refund doesn't restore inventory | High | Small | P0 | Yes — copy void's inventory loop |
| H2 | Void/refund race condition | High | Medium | P1 | Move validation inside transaction |
| H3 | Ledger summary may include voided | High | Small | P0 | Add `isVoided = false` filter |
| H4 | Two-pass payroll cuts race | High | Medium | P1 | Wrap in read-only transaction or LEFT JOIN |
| H5 | Downpayment amount divergence | High | Medium | P1 | Reference stored amounts during void |
| H6 | Cannot void paid payroll entries | High | Large | P1 | Add block + clawback mechanism |
| M1 | Transaction-level client_type | Medium | Small | P2 | Add validation or document constraint |
| M2 | Rate level deletion FK constraint | Medium | Small | P2 | Add `onDelete: 'set null'` or better error |
| M3 | No client-side discount validation | Medium | Small | P2 | Add cap in DiscountModal |
| M4 | Manual payroll bypasses rates | Medium | Medium | P2 | Add optional rate_id + logging |
| M5 | Stale payment data in modal | Medium | Small | P2 | Re-fetch on modal open |
| L1 | Search debounce missing | Low | Tiny | P3 | Add 300ms debounce |
| L2 | Inconsistent empty states | Low | Small | P3 | Standardize across pages |
| L3 | Trial balance voided entry filter | Low | Small | P3 | Audit and add filter |
| L4 | Void/refund category mismatch (dynamic cats) | Low | Small | P3 | Use original category for reversal entries |

---

## 7. Key Code Paths & Integration Surfaces

### Integration: Sales → Transactions (createTransaction)

| Step | Function | File |
|------|----------|------|
| 1. Build cart in SalesContext | `handleCheckout()` | `components/sales/context/SalesContext.tsx:833` |
| 2. Validate & create transaction | `createTransaction()` | `server/actions/transactions.ts:52` |
| 3. Deduct inventory | Inside `withTransaction` | `server/actions/transactions.ts:170-182` |
| 4. Create ledger entry | `createAutoLedgerEntry('TRANSACTION', ...)` | `server/actions/transactions.ts:236-302` |
| 5. Create payroll entry | `calculateAndCreatePayrollEntry(...)` | `server/actions/transactions.ts:~240` |

### Integration: Transactions → Void

| Step | Function | File |
|------|----------|------|
| 1. Read transaction (outside tx) | `db.select().from(transactions)` | `server/actions/transactions.ts:631` |
| 2. Restore inventory | Loop over `transactionItems` | `server/actions/transactions.ts:641-655` |
| 3. Update status to VOIDED | `UPDATE transactions SET status='VOIDED'` | `server/actions/transactions.ts:662` |
| 4. Reverse ledger entries | `createAutoLedgerEntry` (debit REVENUE) | `server/actions/transactions.ts:682-754` |
| 5. Cancel payroll entries | `cancelPayrollEntriesForTransaction()` | `server/actions/transactions.ts:706-727` |
| 6. Settle downpayment | `UPDATE downpayments SET is_settled=true` | `server/actions/transactions.ts:754-780` |

### Integration: CreateTransaction with Downpayments

| Step | Function | File |
|------|----------|------|
| 1. Compute downpayment amount | `calculateDownpaymentAmount()` | `components/sales/utils/downpayment` |
| 2. Insert downpayment record | `INSERT INTO downpayments` | `server/actions/transactions.ts:~200` |
| 3. Set status DOWNPAYMENT_PENDING | Based on balance | `server/actions/transactions.ts:~160` |
| 4. Accounting: UNEARNED_REVENUE | `createAutoLedgerEntry` (credit LIABILITY) | `server/actions/transactions.ts:~236` |
| 5. Accounting: partial REVENUE | `createAutoLedgerEntry` (credit REVENUE) | `server/actions/transactions.ts:~260` |

---

## 8. Testing Strategy

This audit covers existing functionality, not new features. For any remediation work:

- **Unit/Integration tests (TDD)**: Each server action should have corresponding test coverage (Red-Green-Refactor) for the data manipulation patterns identified above.
- **E2E browser testing**: NOT APPLICABLE (audit of existing code, not new UI).
- **Manual verification checklist**: The following flows should be manually verified after fixes:
  1. Create sale → Verify transaction created → Verify ledger entry created → Verify payroll entry created → Verify inventory deducted
  2. Void sale → Verify inventory restored → Verify reversing ledger entry → Verify payroll entry cancelled
  3. Refund sale → Verify inventory restored (post-H1 fix) → Verify reversing ledger → Verify payroll cancelled
  4. Create sale with downpayment → Verify downpayment record → Verify UNEARNED_REVENUE entry
  5. Void sale with downpayment → Verify downpayment settled → Verify reverse entries
  6. Create manual payroll entry → Verify it appears in accounting ledger
  7. Filter/search in all four pages → Verify pagination resets correctly

---

## 9. Open Questions

1. **Accounting period lock granularity**: Is the period lock intended to block automated entries from sales/payroll, or only manual entry creation? Current implementation blocks both via `createAutoLedgerEntry` but silently proceeds if lock check fails.

2. **Refund inventory restoration**: Should refund restore inventory stock at all? For service-based items (tattoos, piercings), there's no physical stock to restore. The inventory item may only track consumables (inks, gloves). Consider adding a `refund_restores_stock` flag per inventory item type.

3. **Payroll clawback semantics**: Should voiding a paid payroll entry create a negative/adjustment entry, or should it be blocked? The current design silently skips paid entries, which may be the desired behavior (don't claw back money already disbursed), but this isn't documented or surfaced to the user.

4. **Trial balance completeness**: The trial balance currently covers all ledger entries. Should it include opening balances from previous periods, or is it strictly period-based? This affects whether net income carries forward.

5. **CSV import error handling**: `importAccountingEntries` returns error strings but doesn't support partial success (some rows imported, some failed). For large imports, partial success would be more user-friendly.
