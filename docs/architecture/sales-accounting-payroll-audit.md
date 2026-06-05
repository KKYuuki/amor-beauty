# Sales → Accounting → Payroll: System Architecture Audit & Source of Truth

> **Audit Date:** 2026-05-22  
> **Scope:** Full deep system and logical audit of Sales, Accounting, and Payroll integration  
> **Status:** Source of Truth — Architectural Boundaries and Constraints

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Core Data Flow](#2-core-data-flow)
3. [Integration Contracts](#3-integration-contracts)
4. [Security & Authorization Boundaries](#4-security--authorization-boundaries)
5. [Validation Rules & Constraints](#5-validation-rules--constraints)
6. [Critical Edge Cases & Identified Issues](#6-critical-edge-cases--identified-issues)
7. [Cache & Revalidation Strategy](#7-cache--revalidation-strategy)
8. [Audit & Logging Requirements](#8-audit--logging-requirements)
9. [Architectural Boundaries (Do Not Cross)](#9-architectural-boundaries-do-not-cross)

---

## 1. System Overview

### 1.1 Domain Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                      SALES DOMAIN                                │
│  transactions, transactionItems, transactionPayments             │
│  downpayments                                                    │
│  Creates: Revenue (GL), Payroll Entries                          │
├─────────────────────────────────────────────────────────────────┤
│                    ACCOUNTING DOMAIN                              │
│  generalLedger, accountingCategory                               │
│  Import/export from: SALES, PAYROLL, INVENTORY, MANUAL entries   │
│  Provides: Trial Balance, Financial Metrics, Ledger Reports      │
├─────────────────────────────────────────────────────────────────┤
│                     PAYROLL DOMAIN                                │
│  payrollEntry, payrollRequest, payrollStaffRate, rateLevels      │
│  payrollDeductions, payrollDisbursement, downpayments            │
│  paymentMethod (user-level)                                      │
│  Consumes: Transaction data (Sales)                              │
│  Creates: Expense & Liability (Accounting/GL)                    │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Tables

| Table | Domain | Purpose |
|-------|--------|---------|
| `transactions` | Sales | Customer sales records |
| `transaction_items` | Sales | Line items (services + inventory) |
| `transaction_payments` | Sales | Split payment records |
| `general_ledger` | Accounting | Double-entry bookkeeping |
| `accounting_category` | Accounting | Categorization for GL entries |
| `payroll_staff_rate` | Payroll | Commission rate configuration |
| `payroll_entry` | Payroll | Per-service earnings record |
| `payroll_request` | Payroll | Batch payout request (PENDING→REQUESTED→CONFIRMED→COMPLETED) |
| `payroll_deductions` | Payroll | Advances/deductions/adjustments |
| `payroll_disbursement` | Payroll | Staggered payout splits |
| `downpayments` | Payroll | Downpayment tracking |
| `rate_levels` | Payroll | Staff rate level definitions |

---

## 2. Core Data Flow

### 2.1 Happy Path: Sale → Ledger → Payroll

```
Appointment (COMPLETED)
       │
       ▼
createTransactionFromAppointment()
  OR
createTransaction()  ◄── Direct sale
       │
       ├──► INSERT transaction + transactionItems
       │       └──► Decrement inventory stock
       │
       ├──► createAutoLedgerEntry('TRANSACTION', ...)
       │       └──► REVENUE = CREDIT, $0 debit
       │       └──► Category: 'SALES'
       │       └──► One entry per split payment (if SPLIT)
       │
       └──► calculateAndCreatePayrollEntry()
               └──► Lookup rate by (serviceType, clientType, rateLevelId)
               └──► Calculate shop% / staff% split
               └──► INSERT payrollEntry (status=PENDING)
               └──► Tax withholding (if enabled in settings)
```

### 2.2 Payroll Payout Flow

```
payrollEntry (PENDING)
       │
       ▼ (Staff or Admin selects entries)
createPayrollRequest()
       ├──► Validate entries are PENDING + not already in another request
       ├──► INSERT payrollRequest (status=REQUESTED)
       └──► UPDATE payrollEntry → status=REQUESTED, attach payrollRequestId
       
confirmPayrollRequest()
       └──► UPDATE payrollRequest → status=CONFIRMED
       └──► UPDATE payrollEntry → status=CONFIRMED

completePayrollRequest()
       ├──► UPDATE payrollRequest → status=COMPLETED, paymentMethod, proof
       ├──► UPDATE payrollEntry → status=PAID, paidAt
       ├──► Apply pending deductions (best-effort)
       │       └──► Create LIABILITY entry per deduction
       ├──► createAutoLedgerEntry('PAYROLL', ...)
       │       └──► EXPENSE = DEBIT (net amount)
       │       └──► Category: 'PAYROLL'
       └──► (If tax enabled) createAutoLedgerEntry('PAYROLL', ...)
               └──► LIABILITY = CREDIT (tax amount)
               └──► Category: 'TAX_WITHHOLDING'
```

### 2.3 Void/Refund Flow

```
voidTransaction()
       ├──► Restore inventory stock
       ├──► UPDATE transaction → status=VOIDED
       ├──► createAutoLedgerEntry('TRANSACTION', ...)
       │       └──► REVENUE = DEBIT (reversal), $0 credit
       │       └──► Category: 'VOIDED_SALES'
       ├──► Settle associated downpayment
       └──► cancelPayrollEntriesForTransaction()
               └──► UPDATE payrollEntry → status=CANCELLED, detach from request
               └──► Recalculate payrollRequest totals

refundTransaction()
       ├──► INSERT new refund transaction (negative amounts)
       ├──► UPDATE original → status=REFUNDED
       ├──► createAutoLedgerEntry('TRANSACTION', ...)
       │       └──► REVENUE = DEBIT (refund amount)
       │       └──► Category: 'REFUNDS'
       └──► cancelPayrollEntriesForTransaction()
```

### 2.4 Downpayment Flow

```
createTransaction() with downpayment_type
       ├──► INSERT transaction (status=DOWNPAYMENT_PENDING or DOWNPAYMENT_ASSIGNED)
       ├──► createDownpayment() (inserts downpayment record)
       └──► createAutoLedgerEntry() for payment received

addTransactionPayment() when status → COMPLETED
       └──► Settle downpayment (isSettled=true)
       └──► If payroll_split_mode=ON_COMPLETION:
               └──► calculateAndCreatePayrollEntry()
```

---

## 3. Integration Contracts

### 3.1 Sales → Accounting Contract

| Source | Condition | GL Effect |
|--------|-----------|-----------|
| Transaction created (single payment) | `amountPaid > 0` | REVENUE credit(amountPaid), debit(0) — category: SALES |
| Transaction created (SPLIT) | `payments[] length > 0` | One REVENUE entry per split payment |
| Transaction created (downpayment only) | `downpayment_type` set | REVENUE credit(amountPaid) |
| Additional payment added | `addTransactionPayment` called | REVENUE credit(amount) — category: SALES |
| Transaction voided | `voidTransaction` succeeds | REVENUE debit(amountPaid) — category: VOIDED_SALES |
| Transaction refunded | `refundTransaction` succeeds | REVENUE debit(refundAmount) — category: REFUNDS |

**CONSTRAINT:** Accounting entries are **best-effort**. Failure is logged but does not prevent the transaction from succeeding.

### 3.2 Sales → Payroll Contract

| Source | Condition | Payroll Effect |
|--------|-----------|----------------|
| Transaction created | item has `service_id` (or `appointment.staffId` set) | `calculateAndCreatePayrollEntry()` called per service item |
| Transaction created | `staff_id` is null AND no items with `artist_id` | No payroll entry created |
| Transaction voided | Original had `staffId` | `cancelPayrollEntriesForTransaction()` — entries set to CANCELLED |
| Transaction refunded | Original had `staffId` | `cancelPayrollEntriesForTransaction()` — entries set to CANCELLED |
| Downpayment settled | `payroll_split_mode = ON_COMPLETION` | `calculateAndCreatePayrollEntry()` called |

**CONSTRAINT:** Payroll entries are **best-effort**. Errors are collected into `payrollErrors[]` and returned to the client but transaction still succeeds. In `createTransactionFromAppointment`, errors are silently logged only.

### 3.3 Payroll → Accounting Contract

| Source | Condition | GL Effect |
|--------|-----------|-----------|
| Payroll completed | `completePayrollRequest` succeeds | EXPENSE debit(netAmount), credit(0) — category: PAYROLL, payment_method mapped |
| Tax withholding | Tax enabled AND `totalTaxAmount > 0` | LIABILITY credit(taxAmount), debit(0) — category: TAX_WITHHOLDING |
| Deduction applied | PENDING deductions exist at completion | LIABILITY credit(amount) per deduction — category determined by deduction type |

**CONSTRAINT:** Accounting entries for payroll are wrapped in try/catch. Failure is logged but does not prevent the payout from completing (controlled by `skip_accounting_entry` flag).

### 3.4 Rate Resolution Contract

Rate lookup follows this priority:

1. Exact match: `(serviceType, clientType, rateLevelId)` — all three match
2. Fallback: `(serviceType, clientType, NULL rateLevelId)` — if a rate exists without a level assignment
3. No rate found → `failure()` returned

**Rate matching is strict:** If a staff member has `rateLevelId=xyz` and no rate exists for `(TATTOO, WALKIN, xyz)`, the system returns `failure("No rate found")` — even if a generic `(TATTOO, WALKIN, NULL)` rate exists.

---

## 4. Security & Authorization Boundaries

### 4.1 Access Checks

| Action | Required Role/Check |
|--------|-------------------|
| Create transaction | `canAccessTransactions(user)` |
| Void/refund transaction | `canAccessTransactions(user)` |
| View accounting entries | `canAccessAccounting(user)` |
| Create/edit/void GL entries | Admin + `canAccessAccounting(user)` |
| Manage payroll rates | `canManagePayroll(user)` |
| Create payroll request | Authenticated user |
| Confirm payroll request | Authenticated user |
| Complete/cancel payroll request | `canManagePayroll(user)` |
| Manage deductions/advances | `canManagePayroll(user)` |
| Manage accounting categories | Admin |
| View accounting categories | `canAccessAccounting(user)` |

**CONSTRAINT:** `canManagePayroll` and `canAccessAccounting` are distinct permission checks. A user could have accounting access without payroll management access and vice versa.

### 4.2 Data Isolation

- **Branch isolation:** When a `branchId` filter is applied:
  - Accounting: Directly on `generalLedger.branchId` (includes `NULL`/shared entries)
  - Payroll: Via `payrollEntry → transactions.branchId` (indirect join)
  - Transactions: Directly on `transactions.branchId` (includes `NULL`/shared entries)

**IDENTIFIED ISSUE:** Payroll requests `getPayrollRequests` filters by branch via subquery through `payrollEntry → transactions`, but `getAllDeductions` filters by `user.branchIds` (a JSONB column). Two different filtering strategies for the same conceptual scope.

### 4.3 Period Lock Enforcement

The accounting period lock is checked on:
- `createLedgerEntry` (manual entry)
- `updateLedgerEntry`
- `voidLedgerEntry`
- `restoreLedgerEntry`
- `hardDeleteLedgerEntry`

It is **NOT** checked on:
- Auto-created entries from sales (`createAutoLedgerEntry`)
- Auto-created entries from payroll (`createAutoLedgerEntry` in `completePayrollRequest`)
- Transaction creation or voiding

**IDENTIFIED ISSUE:** Auto-created accounting entries bypass the period lock check. A sale could create a ledger entry in a locked period.

---

## 5. Validation Rules & Constraints

### 5.1 Transaction Validation

| Rule | Enforcement |
|------|-------------|
| Branch must exist | Checked at creation |
| At least one item required | `items.length === 0` → failure |
| Sufficient inventory stock | Checked per non-free item |
| Discount ≤ subtotal | Checked |
| Amount paid ≤ total | Checked (unless balance_due is explicitly set) |
| Split payment total = total | Checked (unless balance_due) |
| Downpayment amount > 0 and < total | Checked in withTransaction |
| Free items don't decrement stock | `item.is_free` check |
| Void reason ≥ 5 characters | Checked |

### 5.2 Accounting Validation

| Rule | Enforcement |
|------|-------------|
| Non-negative debit and credit | Checked |
| At least one of debit/credit > 0 | Checked |
| Only one of debit/credit should be positive (single entries) | Checked |
| Journal entries must balance (Σdebits = Σcredits ± 0.01) | Checked for `createJournalEntry` |
| Entry date ≤ 1 year in future | Checked |
| Entry date ≥ 10 years in past | Checked |
| Category type must match entry type | Checked |
| Void reason ≥ 5 characters | Checked |
| Must be voided before hard-delete | Checked |
| Period lock enforced | Checked (for manual operations) |
| Unique (sourceType, sourceId, !isVoided) | Unique constraint in DB |

### 5.3 Payroll Validation

| Rule | Enforcement |
|------|-------------|
| Percentage rates must sum to 100 | Checked for PERCENTAGE mode |
| Fixed amount ≤ gross amount | Checked |
| At least one entry ID required for request | Checked |
| Entries must belong to staff_id | Checked in request creation |
| Entries must be PENDING | Checked |
| Entries must not be in another active request | Checked |
| Status transition validity | Checked per operation |
| Disbursement amount ≤ remaining (confirmed total - disbursed) | Checked |
| Rate combination uniqueness (serviceType, clientType, rateLevelId) | DB unique index |

---

## 6. Critical Edge Cases & Identified Issues

### 🔴 ISSUE 1: Best-Effort Accounting Creates Silent Data Drift

**Severity: HIGH**

Accounting entries are wrapped in try/catch at every integration point. A sale succeeds, inventory is decremented, and a payroll entry is created — but if the `createAutoLedgerEntry` call fails, there is **no compensating action**. The GL will be missing revenue entries, causing:

- Underreported revenue in metrics (which query `generalLedger`)
- Trial balance that doesn't match total sales
- No alert or retry mechanism

**Affected paths:**
- `createTransaction()` — line 200s: caught and logged
- `createTransactionFromAppointment()` — line 200s: caught and logged
- `voidTransaction()` — line 260s: caught and logged
- `refundTransaction()` — caught and logged
- `completePayrollRequest()` — caught and logged with `skip_accounting_entry` bypass available

**Recommendation:** Retry mechanism with exponential backoff, or make accounting entry creation part of the `withTransaction` block so the entire operation fails atomically. At minimum, add a reconciliation report that compares `SUM(transactions.total)` vs `SUM(generalLedger.credit WHERE source_type='TRANSACTION')`.

### 🔴 ISSUE 2: Payroll Entry Failure Is Silently Swallowed in Appointment Flow

**Severity: HIGH**

In `createTransactionFromAppointment()`, if `calculateAndCreatePayrollEntry()` throws:
- The error is caught 
- Logged via `logError`
- The transaction still succeeds and returns `success()`
- **No error is surfaced to the client**

Compare with `createTransaction()` which returns `payrollErrors[]` in the response. The appointment path loses this.

**Recommendation:** Return payroll errors through the response type, or roll back the transaction if payroll entry creation is essential.

### 🔴 ISSUE 3: Accounting Period Lock Bypassed by Automated Entries

**Severity: MEDIUM-HIGH**

The `createAutoLedgerEntry` function does not check `getAccountingPeriodLock()`. A sale or payroll completion that auto-creates a ledger entry with a past date (e.g., backdated entry) will succeed even if that accounting period is locked.

**Recommendation:** Add period lock check to `createAutoLedgerEntry` — or at minimum, validate that the entry_date is not in a locked period.

### 🟡 ISSUE 4: Downpayment Has No Accounting Representation

**Severity: MEDIUM**

When a downpayment is created:
- The transaction gets `amountPaid` and a `status` of `DOWNPAYMENT_PENDING` or `DOWNPAYMENT_ASSIGNED`
- The `createAutoLedgerEntry` credits REVENUE for the downpayment amount
- **No LIABILITY entry is created** for the obligation to deliver services

In a strict accounting model, a downpayment is a liability (unearned revenue) until services are rendered and the transaction is completed. Current implementation treats it as earned revenue immediately.

**Recommendation:** Create a LIABILITY entry for downpayments and convert it to REVENUE upon completion. Alternatively, document this as an intentional simplification (cash basis vs. accrual basis).

### 🟡 ISSUE 5: Inconsistent Payment Method Normalization

**Severity: MEDIUM**

Three different normalization functions exist:
- `normalizePayrollPaymentMethod()` — maps 'BANK' → 'BANK_TRANSFER'
- `mapPayrollToAccountingPaymentMethod()` — maps 'MAYA' → 'CARD', 'BANK' → 'BANK_TRANSFER'
- `normalizePayrollMethod()` (in payment.ts) — maps 'BANK' → 'BANK_TRANSFER', 'SPLIT' → 'CASH', 'UNKNOWN' → 'CASH'

These inconsistencies could cause mismatches when comparing payment method breakdowns across domains.

**Recommendation:** Consolidate into a single normalization function used everywhere. The OLD 'BANK' value should be normalized at read time across the board.

### 🟡 ISSUE 6: Void/Refund Payroll Reversal Is Best-Effort

**Severity: MEDIUM**

`cancelPayrollEntriesForTransaction` is called inside a try/catch in both `voidTransaction` and `refundTransaction`. If it fails, the transaction is voided/refunded but payroll entries remain (and may get paid later).

**Recommendation:** If a transaction had payroll entries and they cannot be cancelled, the void/refund should either fail or flag the transaction for manual review.

### 🟡 ISSUE 7: Manual Payroll Entry Accounting Gap

**Severity: MEDIUM**

When a manual payroll entry is created (`createManualPayrollEntry`), no accounting entry is created. The payroll expense is only recorded when `completePayrollRequest` is called. If a manual entry is created and never paid, the work was done but no expense is ever recorded.

**Recommendation:** Create an EXPENSE entry at manual payroll entry creation time, or at minimum flag unpaid manual entries in a periodic review.

### 🟡 ISSUE 8: Duplicate Ledger Entry Protection Is Fragile

**Severity: LOW-MEDIUM**

`createAutoLedgerEntry` catches `23505` (unique violation) on the `uq_auto_ledger_entry_source` constraint. However:
- The constraint comment in schema says: "NOTE: Add CHECK constraint via migration" — this suggests DB-level integrity may be incomplete
- The function returns the existing entry ID if a duplicate is found, but only checks for non-voided entries
- `restoreLedgerEntry` has its own conflict check logic

**Recommendation:** Verify the migration has been applied. Add more robust conflict detection that doesn't depend on error code parsing.

### 🟢 ISSUE 9: Cache Invalidation Has No Ordering Guarantee

**Severity: LOW**

Cache invalidation in `firePostPersistSideEffects` fires multiple invalidations in sequence. If one fails (throws), subsequent ones will not execute. However, since invalidations are fire-and-forget (best-effort), this is low severity.

### 🟢 ISSUE 10: No Overnight Reconciliation Job

**Severity: LOW**

The existing CRON (`/api/cron/daily`) handles QR codes and has placeholders for log/session cleanup. There is no reconciliation job that:

- Compares `transactions.total` vs `generalLedger.credit` for REVENUE entries with `source_type='TRANSACTION'`
- Flags transactions missing ledger entries
- Identifies payroll entries not linked to a transaction
- Validates that all non-cancelled payroll entries belong to exactly one payroll request (or are PENDING)

**Recommendation:** Add reconciliation data checks to the daily CRON.

---

## 7. Cache & Revalidation Strategy

### 7.1 Cache Keys

The following cache keys are invalidated on any accounting/general ledger mutation:

| Cache Key | Invalidated By |
|-----------|----------------|
| `financial_metrics` | Any GL mutation |
| `net_income` | Any GL mutation |
| `ledger_summary` | Any GL mutation |
| `revenue_trend` | Any GL mutation |
| `pl_metrics` | Any GL mutation |
| `expense_breakdown` | Any GL mutation |
| `revenue_expense_trend` | Any GL mutation |
| `business_insights` | Any GL/payroll mutation |
| `exec_accounting` | Any GL/payroll mutation |
| `payroll_rates` | Rate creation/update/deletion |
| `payroll_dashboard` | Payroll request/entry changes |
| `staff_payroll` | Payroll entry changes |

### 7.2 Revalidation Tags

Payroll operations use Next.js `revalidateTag()` with tags:
- `payroll_dashboard`
- `staff_payroll`
- `business_insights`
- `exec_accounting`

### 7.3 CONSTRAINT

Cache keys are **string-based with no versioning**. If the cache key format changes, stale data may be served until the next mutation triggers invalidation or the cache TTL expires.

---

## 8. Audit & Logging Requirements

### 8.1 Mandatory Audit Events

| Event | Log Level | Log Type | Data Captured |
|-------|-----------|----------|---------------|
| Transaction created | INFO | OTHER | transactionNumber, createdBy |
| Transaction voided | INFO | OTHER | transactionId, voidedBy, voidReason |
| Transaction refunded | INFO | ACCOUNTING | originalTxNumber, refundAmount, userId |
| Payment added | INFO | OTHER | transactionId |
| Ledger entry created | INFO | ACCOUNTING | entryId, createdBy |
| Ledger entry updated | INFO | ACCOUNTING | entryId, updatedBy |
| Ledger entry voided | INFO | ACCOUNTING | entryId, reason, voidedBy |
| Ledger entry restored | INFO | ACCOUNTING | entryId, restoredBy |
| Ledger entry hard deleted | WARN | ACCOUNTING | entryId, description, deletedBy |
| Category auto-created | INFO | ACCOUNTING | categoryName, type |
| Category CRUD | INFO | ACCOUNTING | categoryId, userId |
| Payroll entry created | INFO | PAYROLL | entryId, staffId |
| Payroll request created | INFO | PAYROLL | requestId, staffId, requestedBy |
| Payroll request confirmed | INFO | PAYROLL | requestId, confirmedBy |
| Payroll request completed | INFO | PAYROLL | requestId, completedBy, paymentMethod |
| Payroll request cancelled | INFO | PAYROLL | requestId, cancelledBy, reason |
| Staff rate created | INFO | PAYROLL | rateId, rate details |
| Staff rate updated | INFO | PAYROLL | rateId, old/new percentages |
| Staff rate deactivated | INFO | PAYROLL | rateId, rateName |
| Staff rate deleted | INFO | PAYROLL | rateId, rateName |
| Advance/deduction created | INFO | PAYROLL | deductionId, userId, amount |
| Deduction cancelled | INFO | PAYROLL | deductionId |
| Scheduled payment created | INFO | PAYROLL | deductionId, staffId, amount |

### 8.2 Error Logging

| Error Type | Context |
|------------|---------|
| ACCOUNTING | Failed to create auto ledger entry, failed to update ledger entry, etc. |
| PAYROLL | Failed to create payroll entry, failed to apply deductions, etc. |
| OTHER | General transaction failures |

### 8.3 CONSTRAINT

All `createLogs` and `logError` calls are fire-and-forget. They do not block the calling operation. Logging failures are not propagated.

---

## 9. Architectural Boundaries (Do Not Cross)

### 9.1 Inviolable Rules

1. **A transaction MUST always link to a corresponding ledger entry (REVENUE).** If the ledger entry fails, the transaction must either be rolled back or flagged for manual reconciliation. Best-effort is unacceptable for financial data integrity.

2. **A payroll entry MUST always be derived from a transaction's service item.** Manual payroll entries are the only exception and must be clearly labeled.

3. **Rate snapshots MUST be taken at entry creation time.** If a rate changes after a payroll entry is created, the entry retains the original rate via `staffRateSnapshot`/`shopRateSnapshot`.

4. **Voided entries MUST NOT be hard-deleted without a prior soft void.** The `hardDeleteLedgerEntry` function enforces this.

5. **Accounting period locks MUST apply to ALL entry creation, not just manual entries.** Auto-created entries from sales/payroll are currently exempt — this is a hole.

6. **Payment method normalization MUST be consistent across all domains.** One function, one truth.

### 9.2 Prohibited Patterns

| Pattern | Why |
|---------|-----|
| Direct mutation of `generalLedger` outside of `accounting.ts` actions | Bypasses validation, period lock, and cache invalidation |
| Creating a transaction without calling `createAutoLedgerEntry` | Revenue goes unrecorded in GL |
| Skipping payroll entry creation because "rate not found" for a transaction with staff | Staff work is uncompensated and unrecorded |
| Manually editing `payrollEntry.paymentStatus` | Bypasses request workflow state machine |
| Using `skip_accounting_entry = true` in production | Purpose-built field for migration/testing — may cause permanent data drift |

### 9.3 State Machines

**Transaction Status Machine:**
```
PENDING ───► COMPLETED
     │             │
     ├──► PARTIAL ─┤
     │             │
     ├──► DOWNPAYMENT_PENDING
     │         │
     │         └──► DOWNPAYMENT_ASSIGNED ───► COMPLETED
     │
     ├──► VOIDED (from any status except VOIDED/REFUNDED)
     └──► REFUNDED (from COMPLETED/PARTIAL only)
```

**Payroll Entry Status Machine:**
```
PENDING ──► REQUESTED ──► CONFIRMED ──► PAID
    │                         │
    └─────► CANCELLED ◄──────┘
```

**Payroll Request Status Machine:**
```
REQUESTED ──► CONFIRMED ──► COMPLETED
    │              │
    └──► CANCELLED ◄┘
```

### 9.4 Data Type Constraints

| Field | Type | Constraint |
|-------|------|------------|
| `generalLedger.debit` | decimal(12,2) | ≥ 0 |
| `generalLedger.credit` | decimal(12,2) | ≥ 0 |
| `generalLedger.entryType` | varchar(50) | One of: EXPENSE, REVENUE, ASSET, LIABILITY, EQUITY |
| `generalLedger.sourceType` | varchar(50) | One of: MANUAL, TRANSACTION, PAYROLL, INVENTORY |
| `payrollStaffRate.shopPercentage + staffPercentage` | — | Must equal 100 (PERCENTAGE mode) |
| `payrollEntry.paymentStatus` | varchar(50) | One of: PENDING, REQUESTED, CONFIRMED, PAID, CANCELLED |
| `payrollRequest.status` | varchar(50) | One of: REQUESTED, CONFIRMED, COMPLETED, CANCELLED |
| `transaction.status` | text | One of: COMPLETED, PENDING, PARTIAL, VOIDED, REFUNDED, DOWNPAYMENT_PENDING, DOWNPAYMENT_ASSIGNED |

---

## Appendix: Metrics & Financial Queries

### Revenue Calculation

```
revenue = Σ(generalLedger.credit - generalLedger.debit)
          WHERE entryType = 'REVENUE'
          AND isVoided = false
          AND entryDate BETWEEN start AND end
```

This is queried **directly from `generalLedger`**, NOT from `transactions`. This means:
- Revenue is what was recorded in the GL, not what was sold
- If a GL entry was missed (best-effort failure), revenue is underreported
- No cross-validation against transactions table

### Net Income Calculation

```
net_income = (revenue - expenses)
WHERE:
  revenue = Σ(credit - debit) for REVENUE entries
  expenses = Σ(debit - credit) for EXPENSE entries
```

### Payroll Dashboard Summary

Queries directly from `payrollEntry` (pending amounts) and `payrollRequest` (requested/confirmed/paid amounts). Branch filtering for payroll goes through `transactions.branchId`.

---

> **Architectural Spec finalized. Ready for tactical planning.**
