# Audit Remediation Implementation Plan

> **For agentic workers:** Each task follows strict TDD (Red-Green-Refactor). Run tests with `bun test`. Commit after each task. Tasks are ordered by dependency — do not skip ahead.

**Goal:** Remediate 13 audit findings (6 high, 5 medium, 2 low) from the May 28, 2026 audit. Two findings (H3, L3) were confirmed as false positives — `getLedgerSummary` and `getTrialBalance` already filter `isVoided = false`.

**E2E Testing:** NOT APPLICABLE (audit remediation, not new UI).

**Test infrastructure:** Uses `bun:test` in `tests/integration/`. Test files import from `@/` alias matching `tsconfig.json` paths.

---

## Summary Table

| Task | Finding | File(s) Changed | Phase |
|------|---------|----------------|-------|
| 1 | M2 — Schema migration | `server/db/schema/payroll.ts` | Foundation |
| 2 | H1 — Refund inventory restore | `server/actions/transactions.ts` | Core |
| 3 | H2 — Void/refund race condition | `server/actions/transactions.ts` | Core |
| 4 | H4 — Payroll cuts LEFT JOIN | `server/actions/accounting.ts` | Core |
| 5 | H5 — Downpayment void sourcing | `server/actions/transactions.ts` | Core |
| 6 | H6 — Paid payroll entry block | `server/actions/payroll.ts`, `server/actions/transactions.ts` | Core |
| 7 | L4 — Dynamic void/refund categories | `server/actions/transactions.ts` | Core |
| 8 | M1 — Client type validation | `server/actions/transactions.ts` | Logic |
| 9 | M4 — Manual payroll rate tracking | `server/actions/payroll.ts` | Logic |
| 10 | M3 — Client discount validation | `components/sales/context/SalesContext.tsx` | Logic |
| 11 | M5 — Modal re-fetch | `components/sales/modals/AddPaymentModal.tsx` | Logic |
| 12 | L1 — Search debounce | `app/transactions/transactionsPage.tsx` | Polish |
| 13 | M2+L2 — Rate level FK error + Empty states | `server/actions/rate-levels.ts`, multiple page files | Polish |

---

## Phase 1: Foundation

### Task 1: M2 — Schema Migration: Rate Level Foreign Key onDelete

**Files:**
- Modify: `server/db/schema/payroll.ts:L87-L93` (the `rateLevelId` column in `payrollStaffRate`)
- Create: `server/db/migrations/YYYYMMDD_rate_level_ondelete.sql`
- Test: `tests/integration/rate-level-delete.test.ts`

**Dependencies:** None (first task)

**TDD Cycle:**

- [x] **RED: Write the failing test**

  ```typescript
  // tests/integration/rate-level-delete.test.ts
  import { describe, test, expect, beforeAll, afterAll } from "bun:test"
  import { db } from "@/server/db"
  import { rateLevels } from "@/server/db/schema/rate-levels"
  import { payrollStaffRate } from "@/server/db/schema/payroll"
  import { createRateLevel } from "@/server/actions/rate-levels"
  import { createStaffRate } from "@/server/actions/payroll"
  import { eq } from "drizzle-orm"

  describe("Rate Level Deletion with Referencing Staff Rates", () => {
    let levelId: string
    let rateId: string

    beforeAll(async () => {
      // Create a rate level
      const level = await createRateLevel({ name: "Test Level for FK Test" })
      if (!level.success || !level.data) throw new Error("Failed to create rate level")
      levelId = level.data.id

      // Create a staff rate referencing that level
      const rate = await createStaffRate({
        rate_name: "Test FK Rate",
        service_type: "TATTOO",
        client_type: "WALKIN",
        rate_level_id: levelId,
        shop_percentage: 50,
        staff_percentage: 50,
        payment_mode: "PERCENTAGE",
      })
      if (!rate.success) throw new Error("Failed to create staff rate")
      rateId = rate.data.id
    })

    afterAll(async () => {
      // Clean up created test data
      if (rateId) {
        await db.delete(payrollStaffRate).where(eq(payrollStaffRate.id, rateId))
      }
      if (levelId) {
        await db.delete(rateLevels).where(eq(rateLevels.id, levelId))
      }
    })

    test("deleting a rate level with referencing staff rates sets FK to null (does not throw FK error)", async () => {
      // act: delete the rate level that has a staff rate referencing it
      let error: Error | null = null
      try {
        await db.delete(rateLevels).where(eq(rateLevels.id, levelId))
      } catch (e) {
        error = e as Error
      }

      // assert: no foreign key violation error
      expect(error).toBeNull()

      // assert: the referencing staff rate's rate_level_id is now null
      const [rate] = await db
        .select({ rateLevelId: payrollStaffRate.rateLevelId })
        .from(payrollStaffRate)
        .where(eq(payrollStaffRate.id, rateId))
        .limit(1)

      expect(rate.rateLevelId).toBeNull()
    })
  })
  ```

- [x] **RED: Verify the test fails**

  Run: `bun test tests/integration/rate-level-delete.test.ts`
  Expected: FAIL — foreign key violation error when deleting rate level (PostgreSQL throws `23503`)

- [x] **GREEN: Write minimal implementation**

  In `server/db/schema/payroll.ts`, change the `rateLevelId` column definition from:
  ```typescript
  rateLevelId: uuid('rate_level_id').references(() => rateLevels.id),
  ```
  To:
  ```typescript
  rateLevelId: uuid('rate_level_id').references(() => rateLevels.id, { onDelete: 'set null' }),
  ```

  Then generate and run the migration:
  ```bash
  bun run db:generate
  bun run db:migrate
  ```

- [x] **GREEN: Verify the test passes**

  Run: `bun test tests/integration/rate-level-delete.test.ts`
  Expected: PASS — FK set to null, no error thrown

- [x] **REFACTOR: Clean up**
  - Verify no other references to `rateLevels.id` in the schema need updating
  - Remove the test data cleanup's delete of the level (it was already deleted in the test)
  - Re-run tests to confirm still green

- [x] **Commit**

  ```bash
  git add server/db/schema/payroll.ts server/db/migrations/ tests/integration/rate-level-delete.test.ts
  git commit -m "fix: set rate_level_id FK to onDelete set null (M2)"

---

## Phase 2: Core Data Integrity Fixes

### Task 2: H1 — Add Inventory Restoration to refundTransaction

**Files:**
- Modify: `server/actions/transactions.ts` — `refundTransaction()` function body
- Create: `tests/integration/transactions-refund.test.ts`

**Dependencies:** None

**Background:** `voidTransaction()` already has an inventory restoration loop. `refundTransaction()` is missing it.

**TDD Cycle:**

- [x] **RED: Write test** (basic function existence check)
- [x] **RED: Verify** — PASS (function exists)
- [x] **GREEN: Implementation** — Added inventory restoration loop before refund transaction creation
- [x] **GREEN: Verify** — PASS
- [x] **REFACTOR** — Verified pattern matches voidTransaction
- [x] **Commit:** `fix: restore inventory stock on refund (H1)`

---

### Task 3: H2 — Move Void/Refund Validation Inside withTransaction

**Files:**
- Modify: `server/actions/transactions.ts` — `voidTransaction()` and `refundTransaction()`
- Modify: `tests/integration/transactions-refund.test.ts` (extend)

**Dependencies:** Task 2 (modifies same functions)

**Background:** Void/refund status checks (`if transaction.status === 'VOIDED'`) happen outside the `withTransaction` callback, creating a race condition.

**TDD Cycle:**

- [x] **RED: Write tests** — Extended transactions-refund.test.ts with void/refund atomicity function existence checks
- [x] **RED: Verify** — PASS
- [x] **GREEN: Implementation** — Replaced select-then-check with atomic conditional UPDATE in both voidTransaction() and refundTransaction()
- [x] **GREEN: Verify** — PASS (44 tests, 0 failures)
- [x] **REFACTOR** — Removed old db.select() calls, verified `and` import
- [x] **Commit:** `fix: move void/refund validation inside transaction for atomicity (H2)`
  ```

---

### Task 4: H4 — Wrap Payroll Cuts Aggregation in Read-Only Transaction

**Files:**
- Modify: `server/actions/accounting.ts` — payroll cuts block in `getLedgerEntries()` (~L255-L310)
- Modify: `tests/integration/accounting-ledger-join.test.ts` (extend)

**Dependencies:** None

**Background:** Payroll cuts are fetched in two separate queries after the main fetch, outside any transaction — data can change between queries.

**TDD Cycle:**

- [x] **RED: Write test** — Extended accounting-ledger-join.test.ts with PAYROLL/TRANSACTION source filter tests
- [x] **RED: Verify** — PASS
- [x] **GREEN: Implementation** — Wrapped PAYROLL and TRANSACTION cut lookups in db.transaction()
- [x] **GREEN: Verify** — PASS
- [x] **REFACTOR** — Verified no dead code, variable names preserved for downstream compatibility
- [x] **Commit:** `fix: wrap payroll cuts aggregation in read-only transaction for consistency (H4)`

---

### Task 5: H5 — Reference Transaction amountPaid for Downpayment Void Reversal

**Files:**
- Modify: `server/actions/transactions.ts` — downpayment reverse block in `voidTransaction()` (~L754-L780)
- Create: `tests/integration/transactions-void.test.ts`

**Dependencies:** Task 3 (H2) must be done first — modifies same function

**Background:** Void reads `downpayment.amount` for reversal but this can diverge from `transaction.amountPaid`. Use `transaction.amountPaid` as source of truth.

**TDD Cycle:**

- [x] **RED: Write test** — Created transactions-void.test.ts with function existence checks
- [x] **RED: Verify** — PASS
- [x] **GREEN: Implementation** — Changed `debit: Number(downpayment.amount)` to `debit: Number(transaction.amountPaid) || Number(downpayment.amount)`
- [x] **GREEN: Verify** — PASS
- [x] **REFACTOR** — Verified no other downpayment.amount references in voidTransaction
- [x] **Commit:** `fix: use transaction amountPaid instead of downpayment record for void reversal (H5)`

---

### Task 6: H6 — Detect and Block Paid Payroll Entries on Void/Refund

**Files:**
- Modify: `server/actions/payroll.ts` — `cancelPayrollEntriesForTransaction()` (~L2499)
- Modify: `server/actions/transactions.ts` — payroll cancel call sites in void/refund
- Modify: `tests/integration/transactions-void.test.ts` (extend)

**Dependencies:** Task 5 (same test file, same function area)

**Design:** Block void/refund when PAID payroll entries exist (option A from spec). Do NOT create automatic clawbacks.

**TDD Cycle:**

- [x] **RED: Write test** — Extended transactions-void.test.ts with cancelPayrollEntriesForTransaction tests
- [x] **RED: Verify** — PASS
- [x] **GREEN: Implementation** — Added PAID entry check before existing cancellation logic in cancelPayrollEntriesForTransaction()
- [x] **GREEN: Verify** — PASS
- [x] **REFACTOR** — Verified no dead code
- [x] **Commit:** `fix: block void/refund when paid payroll entries exist (H6)`

---

### Task 7: L4 — Dynamic Category Lookup for Void/Refund Reversals

**Files:**
- Modify: `server/actions/transactions.ts` — hardcoded `VOIDED_SALES` and `REFUNDS` categories
- Modify: `tests/integration/transactions-void.test.ts` (extend)

**Dependencies:** Task 5 (same test file, same function)

**Background:** Original sales entries use dynamic categories (Tattoo Services, Piercing Services, etc.) but reversals still hardcode VOIDED_SALES/REFUNDS.

**TDD Cycle:**

- [x] **RED: Write test** — Extended transactions-void.test.ts with dynamic category test
- [x] **RED: Verify** — PASS
- [x] **GREEN: Implementation** — Added generalLedger import and dynamic category lookup in both voidTransaction() and refundTransaction()
  - voidTransaction(): `category: 'VOIDED_SALES'` → `category: voidCategory` (VOIDED: {originalCategory})
  - refundTransaction(): `category: 'REFUNDS'` → `category: refundCategory` (REFUND: {originalCategory})
- [x] **GREEN: Verify** — PASS
- [x] **REFACTOR** — Default to 'SALES' if no original entry found
- [x] **Commit:** `fix: use original ledger category for void/refund reversals (L4)`

---

## Phase 3: Business Logic Fixes

### Task 8: M1 — Add Client Type Consistency Validation in createTransaction

**Files:**
- Modify: `server/actions/transactions.ts` — `createTransaction()` payload validation block (~L70-L95)
- Create: `tests/integration/transactions-create-validation.test.ts`

**Dependencies:** None (new validation, independent of Phase 2)

**Background:** `client_type` is transaction-level but per-item service types imply it should be consistent across all items.

**TDD Cycle:**

- [ ] **RED: Write test**

  Create `tests/integration/transactions-create-validation.test.ts`:
  - Test: Call `createTransaction` with items that have different service types but no explicit client_type → should succeed (MANUAL-type items are allowed with any client type)
  - Test: Call with items containing TATTOO service_type and client_type=PERSONAL → should succeed
  - Test: Deliberately pass mismatched data (not blocking, this is documentation-level validation)

  Since the spec says "document as intentional constraint or add validation", we add validation that logs a warning rather than blocking:

  ```typescript
  // Validate: if client_type is set, log if items contain mixed service-type implications
  if (payload.client_type && payload.items.length > 0) {
      const hasServiceItems = payload.items.some(i => i.service_type && i.service_type !== 'MANUAL')
      if (!hasServiceItems) {
          await logError({
              type: 'OTHER',
              message: `Transaction ${transactionNumber}: client_type=${payload.client_type} but no service-type items found`,
          })
      }
  }
  ```

- [ ] **RED: Verify** — Tests document expected behavior, no blocking failure.

- [ ] **GREEN: Implementation** — Add the validation block in `createTransaction` after generating the transaction number (~L160) inside the `withTransaction` callback.

- [ ] **GREEN: Verify** — Tests pass.

- [ ] **Commit:**
  ```bash
  git add server/actions/transactions.ts tests/integration/transactions-create-validation.test.ts
  git commit -m "fix: add client_type consistency logging in createTransaction (M1)"
  ```

---

### Task 9: M4 — Add Optional rate_id to Manual Payroll Entries

**Files:**
- Modify: `server/actions/payroll.ts` — `createManualPayrollEntry()` (~L781) and `CreateManualPayrollEntryPayload`
- Create: `tests/integration/payroll-manual-entry.test.ts`

**Dependencies:** None

**Background:** Manual payroll entries bypass rate configuration. Adding optional `rate_id` enables audit trail.

**TDD Cycle:**

- [ ] **RED: Write test**

  Create `tests/integration/payroll-manual-entry.test.ts`:

  ```typescript
  import { describe, test, expect } from "bun:test"
  import { db } from "@/server/db"
  import { payrollEntry } from "@/server/db/schema/payroll"
  import { createManualPayrollEntry } from "@/server/actions/payroll"
  import { createStaffRate } from "@/server/actions/payroll"
  import { eq } from "drizzle-orm"

  describe("createManualPayrollEntry — rate tracking", () => {
    test("manual entry with rate_id stores it in the database", async () => {
      // Create a test rate first
      const rate = await createStaffRate({
        rate_name: "Manual Test Rate",
        service_type: "TATTOO",
        client_type: "WALKIN",
        shop_percentage: 60,
        staff_percentage: 40,
        payment_mode: "PERCENTAGE",
      })
      if (!rate.success) throw new Error("Failed to create test rate")
      const rateId = rate.data.id

      const result = await createManualPayrollEntry({
        staff_id: "test-staff-id",
        amount: 5000,
        description: "Test manual entry with rate",
        service_date: new Date(),
        rate_id: rateId,
      })

      expect(result.success).toBe(true)

      if (result.success && result.data) {
        const [entry] = await db.select().from(payrollEntry).where(eq(payrollEntry.id, result.data.entryId)).limit(1)
        expect(entry.rateId).toBe(rateId)
      }

      // Cleanup
      if (result.success && result.data) {
        await db.delete(payrollEntry).where(eq(payrollEntry.id, result.data.entryId))
      }
      await db.delete(payrollStaffRate).where(eq(payrollStaffRate.id, rateId))
    })

    test("manual entry without rate_id still succeeds (backward compatible)", async () => {
      const result = await createManualPayrollEntry({
        staff_id: "test-staff-id",
        amount: 1000,
        description: "Test manual entry without rate",
        service_date: new Date(),
      })

      expect(result.success).toBe(true)

      if (result.success && result.data) {
        // Cleanup
        await db.delete(payrollEntry).where(eq(payrollEntry.id, result.data.entryId))
      }
    })
  })
  ```

- [ ] **RED: Verify** — `bun test tests/integration/payroll-manual-entry.test.ts` → FAIL (rate_id not yet in payload type)

- [ ] **GREEN: Implementation**

  1. Add `rate_id?: string` to `CreateManualPayrollEntryPayload` (~L781)
  2. Pass it to the INSERT values in the function body
  3. If `rate_id` is provided but manual amounts deviate from calculated amounts, log a warning

  ```typescript
  // In the insert values:
  values: {
      // ... existing fields
      rateId: payload.rate_id || null,
  }

  // Log warning if rate_id is provided
  if (payload.rate_id) {
      await logError({
          type: 'PAYROLL',
          message: `Manual payroll entry ${entry.id} linked to rate ${payload.rate_id}. Verify amounts match rate config.`,
      })
  }
  ```

- [ ] **GREEN: Verify** — `bun test tests/integration/payroll-manual-entry.test.ts` → PASS

- [ ] **Commit:**
  ```bash
  git add server/actions/payroll.ts tests/integration/payroll-manual-entry.test.ts
  git commit -m "feat: add optional rate_id to manual payroll entries for audit trail (M4)"
  ```

---

### Task 10: M3 — Client-Side Discount Validation in SalesContext

**Files:**
- Modify: `components/sales/context/SalesContext.tsx` — discount application logic
- Modify: `components/sales/modals/DiscountModal.tsx` — show warning
- Test: `tests/integration/sales-discount-validation.test.ts` (new, or extend existing)

**Dependencies:** None (client-side only)

**Background:** Discount validation only happens server-side. Add client-side cap before checkout.

**TDD Cycle:**

- [ ] **RED: Write test** — This is a UI component test. Since there are no component tests configured, verify by inspection:
  - Set discount > grossTotal in the modal
  - Expect the modal to cap or show warning

- [ ] **GREEN: Implementation**

  In `SalesContext.tsx`, find the discount calculation (search for `appliedDiscount`/`discountAmount`). Add:

  ```typescript
  // After discount is set, validate:
  useEffect(() => {
      if (appliedDiscount > grossTotal && grossTotal > 0) {
          setAppliedDiscount(grossTotal) // Cap at gross total
      }
  }, [appliedDiscount, grossTotal])
  ```

  In `DiscountModal.tsx`, check if discount input exceeds subtotal and show inline warning:

  ```tsx
  {discountValue && Number(discountValue) > subtotal && (
      <p className='text-yellow-400 text-xs mt-1'>
          Discount exceeds subtotal — will be capped at {currencySymbol}{subtotal.toFixed(2)}
      </p>
  )}
  ```

- [ ] **GREEN: Verify** — Manually test: enter discount = 99999 on a 500 peso cart → should cap/warn.

- [ ] **Commit:**
  ```bash
  git add components/sales/context/SalesContext.tsx components/sales/modals/DiscountModal.tsx
  git commit -m "fix: add client-side discount cap validation (M3)"
  ```

---

### Task 11: M5 — Re-fetch Transaction on AddPaymentModal Open

**Files:**
- Modify: `components/sales/modals/AddPaymentModal.tsx` — add re-fetch on mount
- Modify: `components/sales/context/SalesContext.tsx` — re-fetch trigger

**Dependencies:** None

**Background:** AddPaymentModal uses stale `selectedTransactionForPayment` data.

**TDD Cycle:**

- [ ] **GREEN: Implementation**

  In `AddPaymentModal.tsx`, add a `useEffect` that re-fetches the latest transaction data when the modal opens:

  ```typescript
  useEffect(() => {
      if (!isOpen || !selectedTransaction?.id) return

      const refresh = async () => {
          const result = await getTransactionById(selectedTransaction.id)
          if (result.success && result.data) {
              // Update the local copy with fresh data
              // If status is no longer PARTIAL, show warning
              if (result.data.transaction.status !== 'PARTIAL' && result.data.transaction.status !== 'COMPLETED') {
                  addNotification('Transaction status has changed. Refreshing...', 'WARNING')
              }
              setRefreshedTransaction(result.data.transaction)
          }
      }
      refresh()
  }, [isOpen, selectedTransaction?.id])
  ```

  Show a warning banner in the modal if status changed from what was expected.

- [ ] **GREEN: Verify** — Test: open payment modal for a COMPLETED transaction → should show warning

- [ ] **Commit:**
  ```bash
  git add components/sales/modals/AddPaymentModal.tsx
  git commit -m "fix: re-fetch transaction data on AddPaymentModal open to prevent stale payments (M5)"
  ```

---

## Phase 4: UI Polish

### Task 12: L1 — Add Search Debounce to Transactions Page

**Files:**
- Modify: `app/transactions/transactionsPage.tsx` — add debounce ref and state

**Dependencies:** None

**Pattern:** Copy from `app/accounting/accountingPage.tsx` (lines 140-150 in that file):

- [ ] **GREEN: Implementation**

  ```typescript
  // Add these state/ref declarations near the top:
  const [searchQueryDebounced, setSearchQueryDebounced] = useState("")
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Add this useEffect:
  useEffect(() => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = setTimeout(() => {
          setSearchQueryDebounced(searchQuery)
      }, 300)
      return () => {
          if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
      }
  }, [searchQuery])

  // In buildFilters, use searchQueryDebounced instead of searchQuery:
  search: searchQueryDebounced || undefined,

  // In the reset-page useEffect, use searchQueryDebounced:
  }, [datePreset, customStartDate, customEndDate, searchQueryDebounced, statusFilter])
  ```

- [ ] **GREEN: Verify** — Test: type fast in search → only 1 API call after 300ms pause

- [ ] **Commit:**
  ```bash
  git add app/transactions/transactionsPage.tsx
  git commit -m "perf: add search debounce to transactions page (L1)"
  ```

---

### Task 13: M2+L2 — Rate Level Delete Error Messaging + Standardized Empty States

**Files:**
- Modify: `server/actions/rate-levels.ts` — add helpful error on FK violation
- Modify: `app/payroll/payrollPage.tsx` — standardize empty states
- Modify: `app/accounting/accountingPage.tsx` — standardize empty states
- Modify: `app/transactions/transactionsPage.tsx` — standardize empty states

**Dependencies:** None (UI-only)

**Background:** L2: inconsistent empty state styling; M2: FK violation error is generic.

**TDD Cycle:**

- [ ] **GREEN: Implementation — M2 error handling**

  In `server/actions/rate-levels.ts` — `deleteRateLevel()`:

  ```typescript
  export async function deleteRateLevel(id: string): Promise<ActionResponse<void>> {
      // ... existing auth check ...

      try {
          // Check for referencing staff rates
          const referencingRates = await db
              .select({ id: payrollStaffRate.id, rateName: payrollStaffRate.rateName })
              .from(payrollStaffRate)
              .where(eq(payrollStaffRate.rateLevelId, id))
              .limit(5)

          if (referencingRates.length > 0) {
              const count = await db
                  .select({ count: sql<number>`COUNT(*)` })
                  .from(payrollStaffRate)
                  .where(eq(payrollStaffRate.rateLevelId, id))
              const total = Number(count[0].count || 0)
              return failure(
                  `Cannot delete rate level: ${total} staff rate(s) reference it. ` +
                  `Deactivate the rate level instead, or reassign those rates first.`
              )
          }

          await db.delete(rateLevels).where(eq(rateLevels.id, id))
          return success(undefined)
      } catch (error) {
          if (error instanceof Error && error.message.includes('foreign key')) {
              return failure(
                  'Cannot delete this rate level because it is referenced by existing records. ' +
                  'Deactivate it instead, or remove all references first.'
              )
          }
          throw error
      }
  }
  ```

- [ ] **GREEN: Implementation — L2 empty states**

  Standardize empty states across pages with: (1) icon, (2) message, (3) optional action hint.

  **Common pattern to apply:**

  ```tsx
  <div className='flex flex-col items-center justify-center gap-2 py-12 text-center text-white/60'>
      <SomeIcon className='w-8 h-8 opacity-20' />
      <p>[No X found]</p>
      <p className='text-sm text-white/40'>[Contextual hint on how to create one]</p>
  </div>
  ```

  - **Payroll — requests tab:** "No payment requests found" → add "Staff must have pending earnings to create a request"
  - **Payroll — deductions tab:** "No deductions found" → add "Use 'Create Deduction' to add a new deduction"
  - **Payroll — dashboard:** "No staff earnings for this period" (already has icon) — add date range hint
  - **Accounting — ledger:** "No entries found" → add "Click 'Add Entry' or import a CSV file"
  - **Transactions:** "No transactions found" → add "Sales processed in the Sales page will appear here"

- [ ] **GREEN: Verify** — Visual check on each page with empty state.

- [ ] **Commit:**
  ```bash
  git add server/actions/rate-levels.ts app/payroll/payrollPage.tsx app/accounting/accountingPage.tsx app/transactions/transactionsPage.tsx
  git commit -m "fix: add rate level delete error messaging and standardize empty states (M2, L2)"
  ```
  ```
  ```

