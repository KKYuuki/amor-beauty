# Payroll System Integrity Fix Specification

**Date:** 2026-05-22
**Author:** Autonomous Architect (AI)
**Status:** Draft for review

---

## 1. Objective

Fix all identified logic, schema, data-integrity, cache-consistency, and lifecycle issues in the payroll system without changing the overall architecture or introducing new features. Each fix must be scoped to its single responsibility, preserving all existing contracts.

---

## 2. Source of Truth Constraints

### 2.1 Schema Constraints (Immutable — DB schema must not change)

| Constraint | Boundary | Rationale |
|---|---|---|
| `payroll_entry` has **no** `branchId` column | Branch awareness must route through `transactions.branchId` | Schema change requires migration; out of scope |
| `PaymentStatus` type includes `CANCELLED` | The DB column accepts `'CANCELLED'` and the code sets it | Zod schema must match the runtime type |
| `payroll_request.status` is `REQUESTED → CONFIRMED → COMPLETED | CANCELLED` | Flow is final — no reversing past COMPLETED |
| `payroll_disbursement` cascades delete on `request_id` | Deleting a request deletes its disbursements | Must be considered in any cancel/void logic |
| `payroll_entry.rateId` references `payroll_staff_rate.id` | Cannot delete a rate that has entries | Already enforced in `deleteStaffRate` |
| `payroll_entry.payrollRequestId` is nullable | A pending entry has no request; cancelling a request nullifies this | Must be preserved |

### 2.2 Workflow State Machine

```
                    +---> CANCELLED
                    |
PENDING ──► REQUESTED ──► CONFIRMED ──► PAID
   ↑                                          |
   +------ cancelRequest (nullifies requestId)-+
                      
PENDING/REQUESTED/CONFIRMS ──► CANCELLED  (via void/refund)
```

**Invariant:** An entry in `PAID` status must never change status.
**Invariant:** An entry in `CANCELLED` status must never change status.
**Invariant:** A `payroll_request` in `COMPLETED` status must never change status.
**Invariant:** All entries belonging to a request must share the same status progression (when request goes CONFIRMED, all entries go CONFIRMED; when COMPLETED, all go PAID; when CANCELLED, all go PENDING).

### 2.3 Accounting Entry Invariants

| Invariant | Enforcement |
|---|---|
| Every completed payroll creates exactly one `EXPENSE` entry for net amount | `completePayrollRequest` |
| Every completed payroll with tax > 0 creates exactly one `LIABILITY` entry for tax | `completePayrollRequest` |
| Partial disbursements create per-disbursement `EXPENSE` entries | `createDisbursement` |
| The last disbursement must NOT create a duplicate expense entry (delegated to `completePayrollRequest`) | Conditional guard in `createDisbursement` |
| Deduction application creates one `LIABILITY` entry per deduction type | Best-effort inside `completePayrollRequest` |

### 2.4 Cache Invalidation Patterns

Every mutation that changes payroll data must invalidate ALL of:

- `payroll_dashboard`
- `staff_payroll`
- `payroll_rates` (only when rates change)
- `business_insights`
- `exec_accounting`
- `financial_metrics` (when accounting entries are created)

**Exception:** Read-only queries and idempotent status checks (e.g., `getExpectedPaymentMethod`) must NOT invalidate.

---

## 3. System Boundaries & Layer Responsibilities

### 3.1 Server Action Layer (`server/actions/payroll.ts`)

**Owns:** Payroll CRUD, request workflow, rate management, deduction lifecycle.

**Must ensure:**
- All `INSERT`/`UPDATE`/`DELETE` on payroll tables go through this layer
- All mutations call the cache invalidation contract (Section 2.4)
- Zod schemas match runtime types exactly
- Dead functions are removed if unreachable
- Void/refund entry cancellation handles all active statuses, not just `PENDING`

### 3.2 Disbursement Layer (`server/actions/payroll-disbursements.ts`)

**Owns:** Staggered payment creation, per-disbursement accounting entries.

**Must ensure:**
- No double-counting when last disbursement triggers `completePayrollRequest`
- Per-disbursement accounting entry only fires when `newDisbursed < totalStaffCut`
- Branch ID is threaded through to accounting entries

### 3.3 Schema/Validation Layer (`server/actions/payroll-schemas.ts`)

**Owns:** All Zod schemas for payroll input validation.

**Must ensure:**
- `PaymentStatusSchema` includes `'CANCELLED'`
- `CreatePayrollEntryInputSchema` is correctly typed for its actual payload (or removed if dead code)
- No schema alias produces a type mismatch

### 3.4 Integration Layer — Sales & Transactions

**Owns:** Automatic payroll entry creation on sale, downpayment settlement, and void/refund reversal.

**Must ensure:**
- `calculateAndCreatePayrollEntry` called with empty `serviceId` does not silently apply wrong service type
- `cancelPayrollEntriesForTransaction` receives the transaction client (`tx`) for atomicity
- Void/refund does not miss REQUESTED or CONFIRMED entries

### 3.5 Metrics Layer (`server/actions/metrics.ts`)

**Owns:** Payroll leaderboard and staff earning reports.

**Must ensure:**
- Branch filtering via EXISTS subquery is documented as excluding manual entries
- Rate-level aggregation joins are correct

---

## 4. Specific Fix Specifications (What, Not How)

### FIX-A: Zod Schema Gap — `PaymentStatusSchema` missing `CANCELLED`

**File:** `server/actions/payroll-schemas.ts`
**Type:** Schema mismatch (critical — blocks filtering)

**Contract:**
- `PaymentStatusSchema` must include `'CANCELLED'`
- `PayrollFilterSchema` uses `PaymentStatusSchema` and must accept `'CANCELLED'` as a valid filter value
- No caller passes `CANCELLED` to filtering today, but the gap must be closed

**Boundary:** Only `PaymentStatusSchema` changes. The `PaymentStatus` type in `utils/types/payroll.ts` already includes `CANCELLED` — no type change needed.

### FIX-B: Dead code — `createPayrollEntry` unused + schema alias mismatch

**File:** `server/actions/payroll.ts`, `server/actions/payroll-schemas.ts`
**Type:** Dead code + latent bug

**Contract:**
- The function `createPayrollEntry()` is never imported anywhere — remove it
- The alias `CreatePayrollEntryInputSchema = ManualPayrollEntrySchema` is the root cause of the mismatch — remove it
- All manual entry creation goes through `createManualPayrollEntry`, which is correctly wired

**Boundary:** No external callers depend on `createPayrollEntry`. Removing it does not break any import.

### FIX-C: Void/refund entry cancellation misses non-PENDING entries

**File:** `server/actions/payroll.ts` — `cancelPayrollEntriesForTransaction`
**Type:** Data integrity (medium — orphaned entries on void)

**Contract:**
- When a transaction is voided or refunded, all associated payroll entries must be moved to `CANCELLED`, regardless of their current status (`PENDING`, `REQUESTED`, `CONFIRMED`)
- Entries that are already `PAID` must NOT be touched (invariant from Section 2.2)
- If any cancelled entry was attached to a `payroll_request`, the request totals must be recalculated
- If any cancelled entry was the last active entry in a request, the request should remain (not auto-cancel) — admin handles that

**Boundary:** This affects `voidTransaction` and `refundTransaction` flows in `server/actions/transactions.ts`. The `cancelPayrollEntriesForTransaction` function is called from both paths with a `TransactionClient` — the fix is internal to this function.

### FIX-D: Empty `serviceId` in downpayment-triggered payroll entry

**File:** `server/actions/transactions.ts` — downpayment settlement block, `server/actions/payroll.ts` — `calculateAndCreatePayrollEntry`
**Type:** Logic bug (medium — wrong rate for non-tattoo downpayments)

**Contract:**
- When `calculateAndCreatePayrollEntry` receives an empty or missing `serviceId`, it must not silently fall back to `'TATTOO'` for service type lookup
- The caller (downpayment settlement) must pass the correct service type information
- The `serviceType` field on `PayrollEntryInput` MUST be passed by all callers who have it
- If no service context is available (e.g., downpayment without a specific service), the entry should record `MANUAL` as its service type, not guess `TATTOO`

**Boundary:** The `calculateAndCreatePayrollEntry` interface `PayrollEntryInput` already has an optional `serviceType` field. The callers in `transactions.ts` line 1013-1020 and `downpayments.ts` line 110-116 pass empty `serviceId` — they must now pass `serviceType` explicitly. The `calculateAndCreatePayrollEntry` fallback when both `serviceId` and `serviceType` are absent should use `'MANUAL'` instead of `'TATTOO'`.

### FIX-E: Cache invalidation gaps

**Files:** `server/actions/payroll.ts`, `server/actions/payroll-disbursements.ts`
**Type:** Consistency (medium — stale metrics)

**Contract:**
Every mutation function must invalidate the following cache tags:

| Function | Must Invalidate |
|---|---|
| `createScheduledPayment` | Add `business_insights`, `exec_accounting` |
| `createDisbursement` | Add `business_insights`, `exec_accounting` |
| `deactivateStaffRate` | Add `payroll_dashboard`, `staff_payroll`, `business_insights`, `exec_accounting` |
| `deleteStaffRate` | Add `payroll_dashboard`, `staff_payroll`, `business_insights`, `exec_accounting` |
| `cancelPayrollEntriesForTransaction` | Add ALL payroll-affected tags |
| `recalculatePayrollRequestTotals` | Add ALL payroll-affected tags |

**Boundary:** No other functions need changes. The `recalculatePayrollRequestTotals` is internal (called from `cancelPayrollEntriesForTransaction`), so its cache invalidation should propagate through the caller, not the internal function itself.

### FIX-F: Disbursement accounting entry — fragile boundary between partial and full

**File:** `server/actions/payroll-disbursements.ts` — lines 131-168
**Type:** Fragile logic (medium — potential double-counting)

**Contract:**
- The boundary between "partial disbursement" and "last disbursement completing the request" must be explicit
- When `newDisbursed >= totalStaffCut`, `completePayrollRequest` is called — it must receive `skip_accounting_entry: false` (or omit the flag, defaulting to creating the entry)
- When `newDisbursed < totalStaffCut`, a per-disbursement accounting entry is created

**Hardening:**
- Add an explicit sentinel: if the newly created disbursement causes `newDisbursed >= totalStaffCut`, `completePayrollRequest` should be called with `skip_accounting_entry: false` explicitly, not by omission
- The partial-disbursement path should have an explicit `newDisbursed < totalStaffCut` guard, not rely on an `if/else` structure where the else is never reached when the condition is false

**Boundary:** The `CreateDisbursementInput` type and the `createDisbursement` function signature remain unchanged. Only the internal branching logic is hardened.

### FIX-G: `CRYPTO` mapping gap in `mapPayrollToAccountingPaymentMethod`

**File:** `utils/types/payment.ts` — lines 104-117
**Type:** Incomplete mapping (low — edge case)

**Contract:**
- `mapPayrollToAccountingPaymentMethod` must map `'CRYPTO'` to `'CRYPTO'` (the `AccountingPaymentMethod` type already includes `'CRYPTO'`)
- The current switch falls through to `default: return undefined` for `CRYPTO`

**Boundary:** Only the switch statement in this function changes. No other files.

### FIX-H: `getAllDeductions` branch filter — potentially incorrect query

**File:** `server/actions/payroll.ts` — `getAllDeductions` where clause
**Type:** Query correctness (medium — incorrect branch filtering)

**Contract:**
- The branch filter for deductions should filter by the staff member's assigned branches, not by passing a raw string into a JSONB `ANY` comparison
- The current `sql`${branchId} = ANY(${user.branchIds})``` binds `branchId` as a parameter but compares it against a `jsonb` column. This may work or may silently produce incorrect results depending on the driver's parameter binding
- Replace with a safe approach: cast `branchId` to text and use PostgreSQL's `jsonb` containment operator `@>` or `?` operator for JSONB
- Alternatively, filter by `EXISTS (SELECT 1 FROM transactions ... WHERE branch_id = ${branchId})` if the deduction is transaction-linked, but deductions are user-level, not transaction-level
- Simplest correct approach: use the user's `branchIds` array via `sql`${branchId}::text = ANY(ARRAY(SELECT jsonb_array_elements_text(${user.branchIds})))``

**Boundary:** Only the `getAllDeductions` function's `whereClause` construction changes.

---

## 5. Security Requirements

| Requirement | Enforcement Layer |
|---|---|
| `canManagePayroll` check on all payroll mutations | Server action entry point |
| `isAdmin` check on disbursement creation | `createDisbursement` entry point |
| `getCurrentUser` check on all server actions | Server action entry point |
| Deduction amounts must not exceed remaining staff cut implicitly (enforced by `remaining` check in disbursement) | `createDisbursement` |
| Rate percentage must sum to 100 for PERCENTAGE mode | `createStaffRate`, `updateStaffRate` |
| Proof file uploads must not block payroll completion | `completePayrollRequest`, `createDisbursement` — logged, non-blocking |
| Accounting entry failures must not block payroll completion | `completePayrollRequest` — logged, non-blocking |

---

## 6. Non-Goals (Explicitly Out of Scope)

- Adding a `branchId` column to `payroll_entry` (schema migration)
- Refactoring `completePayrollRequest` into smaller functions
- Adding retry logic for deduction application
- Adding UI alerts for proof upload failures
- Changing the `TaxBracket` definitions
- Adding automated tests
- Currency/rounding precision overhaul

---

## 7. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Removing `createPayrollEntry` breaks a currently-unused import | Low | Low | grep for imports confirms zero callers |
| Fixing `cancelPayrollEntriesForTransaction` to handle non-PENDING entries accidentally touches PAID entries | Low | High | Explicit `paymentStatus !== 'PAID'` guard |
| Cache invalidation adds latency to mutation endpoints | Medium | Low | Cache invalidation is async (fire-and-forget) |
| Deduction branch filter fix changes query behavior | Low | Medium | Verify with production-like data |
| CRYPTO payment method mapping fix changes existing accounting entries | None | None | Mapping only applies to *new* entries |

---

## 8. Verification Gates

1. `bun run lint` — must pass with no new warnings
2. `bun run build` — must pass with no type errors
3. Zod `PaymentStatusSchema` — must accept `'CANCELLED'` in a unit test equivalent
4. `grep -r "createPayrollEntry"` — must show zero imports after fix
5. Cache invalidation — grep for each function's invalidate calls, confirm all tags present

---

## 9. File Change Summary (No Code)

| File | Change |
|---|---|
| `server/actions/payroll-schemas.ts` | Add `'CANCELLED'` to `PaymentStatusSchema`; remove `CreatePayrollEntryInputSchema` alias |
| `server/actions/payroll.ts` | Remove `createPayrollEntry` function body (and its import of `CreatePayrollEntryInputSchema`); fix `cancelPayrollEntriesForTransaction` to handle all non-PAID statuses; fix `getAllDeductions` branch filter; add cache invalidation to `createScheduledPayment`, `deactivateStaffRate`, `deleteStaffRate`; fix `calculateAndCreatePayrollEntry` fallback for empty `serviceId`/`serviceType` |
| `server/actions/payroll-disbursements.ts` | Add explicit sentinel for partial-vs-full accounting entry boundary; add cache invalidation for `business_insights`, `exec_accounting` |
| `server/actions/transactions.ts` | Pass `serviceType` when calling `calculateAndCreatePayrollEntry` from downpayment settlement |
| `utils/types/payment.ts` | Add `'CRYPTO'` case to `mapPayrollToAccountingPaymentMethod` |
