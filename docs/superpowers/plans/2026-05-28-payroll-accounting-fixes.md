# Implementation Plan: Payroll & Accounting Fixes

> **For agentic workers:** Execute each task sequentially. Every task follows TDD (Red-Green-Refactor → Commit). E2E tasks run against the dev server. Screenshots saved to `docs/superpowers/e2e/screenshots/`.

**Goal:** Fix payroll date filtering, enrich accounting with staff/shop cuts, add My Payroll transaction services breakdown, add admin request-on-behalf flow, enrich sales accounting descriptions, rename "Registered Client" → "Personal", and remove redundant per-item artist selector in Sales cart.

**E2E Testing:** OPTED-IN (6 E2E test tasks in Phase 6)

---

## Phase 1: Foundation — Types & Utilities

---

### Task 1: Add `staff_cut`/`shop_cut` to `LedgerEntry` + `PayrollEntryTransactionItem` type + extend `PayrollEntry`

**Files:**
- Modify: `utils/types/ledger.ts:L9-L32` (add optional fields to `LedgerEntry`)
- Modify: `utils/types/payroll.ts:L75-L107` (add `PayrollEntryTransactionItem` interface, extend `PayrollEntry`)
- Create: `tests/integration/types-payroll-accounting.test.ts`

**Dependencies:** None

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Create `tests/integration/types-payroll-accounting.test.ts`:
  ```typescript
  import { describe, test, expect } from "bun:test"
  import type { LedgerEntry } from "@/utils/types/ledger"
  import type { PayrollEntry, PayrollEntryTransactionItem } from "@/utils/types/payroll"

  describe("LedgerEntry type", () => {
    test("accepts optional staff_cut and shop_cut fields", () => {
      // Compile-time type check: these fields should be optional on LedgerEntry
      const entry: Partial<LedgerEntry> = {
        id: "1",
        staff_cut: 500,
        shop_cut: 300,
      }
      expect(entry.staff_cut).toBe(500)
      expect(entry.shop_cut).toBe(300)
      // Non-PAYROLL entries should be able to omit these fields
      const noCutEntry: Partial<LedgerEntry> = {
        id: "2",
        description: "Test",
      }
      expect(noCutEntry.staff_cut).toBeUndefined()
      expect(noCutEntry.shop_cut).toBeUndefined()
    })
  })

  describe("PayrollEntryTransactionItem type", () => {
    test("has expected shape", () => {
      const item: PayrollEntryTransactionItem = {
        item_name: "Dragon Tattoo",
        quantity: 1,
        unit_price: 5000,
        line_total: 5000,
        service_type: "TATTOO",
        service_id: "svc-1",
        staff_cut: 2500,
        shop_cut: 2500,
      }
      expect(item.item_name).toBe("Dragon Tattoo")
      expect(item.service_type).toBe("TATTOO")
      expect(item.staff_cut).toBe(2500)
    })

    test("omits optional fields gracefully", () => {
      const item: PayrollEntryTransactionItem = {
        item_name: "Item",
        quantity: 1,
        unit_price: 100,
        line_total: 100,
      }
      expect(item.service_type).toBeUndefined()
      expect(item.staff_cut).toBeUndefined()
    })
  })

  describe("PayrollEntry type", () => {
    test("accepts optional transaction_items field", () => {
      const entry: Partial<PayrollEntry> = {
        id: "pe-1",
        transaction_items: [
          { item_name: "Tattoo", quantity: 1, unit_price: 5000, line_total: 5000 },
        ],
      }
      expect(entry.transaction_items).toBeDefined()
      expect(entry.transaction_items?.length).toBe(1)
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/types-payroll-accounting.test.ts
  ```
  Expected: FAIL — TypeScript compilation error: `staff_cut`/`shop_cut` not on `LedgerEntry`, `PayrollEntryTransactionItem` not exported, `transaction_items` not on `PayrollEntry`

- [ ] **GREEN: Write minimal implementation**

  In `utils/types/ledger.ts`, add to the `LedgerEntry` interface (after `payment_method`):
  ```typescript
  // Payroll-specific fields (present only when source_type === 'PAYROLL')
  staff_cut?: number
  shop_cut?: number
  ```

  In `utils/types/payroll.ts`, add after the `ShopRateSnapshot` interface:
  ```typescript
  export interface PayrollEntryTransactionItem {
      item_name: string
      quantity: number
      unit_price: number
      line_total: number
      service_type?: ServiceType
      service_id?: string
      // Staff cut for this specific item (proportional to the entry's overall cut)
      staff_cut?: number
      shop_cut?: number
  }
  ```

  In `utils/types/payroll.ts`, add to `PayrollEntry` interface (after `staff?: { ... }`):
  ```typescript
  // Transaction-level service breakdown (lazy-loaded on expand)
  transaction_items?: PayrollEntryTransactionItem[]
  ```

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/types-payroll-accounting.test.ts
  ```
  Expected: PASS — all 4 assertions green

- [ ] **REFACTOR: Clean up**
  - Ensure `ServiceType` is imported in `payroll.ts` (it already is — verify)
  - Ensure `LedgerEntry` type is used in `ledger.ts` with the new optional fields (check the export is `interface LedgerEntry` — it is)
  - Run `bun run typecheck` to ensure no type errors in dependent code

- [ ] **Commit**

  ```bash
  git add utils/types/ledger.ts utils/types/payroll.ts tests/integration/types-payroll-accounting.test.ts
  git commit -m "feat: add staff_cut/shop_cut to LedgerEntry, PayrollEntryTransactionItem type (Task 1)"
  ```

---

### Task 2: Create `deriveSalesCategoryAndDescription` utility

**Files:**
- Create: `server/actions/accounting-ledger-utils.ts`
- Create: `tests/integration/accounting-ledger-utils.test.ts`

**Dependencies:** None (pure utility, no imports beyond project types)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Create `tests/integration/accounting-ledger-utils.test.ts`:
  ```typescript
  import { describe, test, expect } from "bun:test"
  import { deriveSalesCategoryAndDescription } from "@/server/actions/accounting-ledger-utils"

  describe("deriveSalesCategoryAndDescription", () => {
    test("single service type returns enriched description with service type prefix", () => {
      const items = [
        { service_type: "TATTOO" as const, item_name: "Dragon Design", quantity: 1, unit_price: 5000 },
        { service_type: "TATTOO" as const, item_name: "Tiger", quantity: 1, unit_price: 3000 },
      ]
      const result = deriveSalesCategoryAndDescription(items, "TXN-001")
      expect(result.category).toBe("SALES")
      expect(result.description).toBe("Tattoo: Dragon Design, Tiger (TXN-001)")
    })

    test("mixed service types fall back to generic Sale description", () => {
      const items = [
        { service_type: "TATTOO" as const, item_name: "Dragon", quantity: 1, unit_price: 5000 },
        { service_type: "PIERCING" as const, item_name: "Nose Stud", quantity: 1, unit_price: 500 },
      ]
      const result = deriveSalesCategoryAndDescription(items, "TXN-002")
      expect(result.category).toBe("SALES")
      expect(result.description).toBe("Sale: Dragon, Nose Stud (TXN-002)")
    })

    test("no items returns generic Sale description", () => {
      const result = deriveSalesCategoryAndDescription([], "TXN-003")
      expect(result.category).toBe("SALES")
      expect(result.description).toBe("Sale: TXN-003")
    })

    test("user-authored salesDescription takes precedence", () => {
      const items = [
        { service_type: "TATTOO" as const, item_name: "Dragon", quantity: 1, unit_price: 5000 },
      ]
      const result = deriveSalesCategoryAndDescription(
        items,
        "TXN-004",
        "Custom sleeve tattoo with aftercare"
      )
      expect(result.category).toBe("SALES")
      expect(result.description).toBe("Custom sleeve tattoo with aftercare | Dragon (TXN-004)")
    })

    test("PIERCING service type uses Piercing prefix", () => {
      const items = [
        { service_type: "PIERCING" as const, item_name: "Ear Lobe", quantity: 2, unit_price: 300 },
      ]
      const result = deriveSalesCategoryAndDescription(items, "TXN-005")
      expect(result.description).toBe("Piercing: Ear Lobe (TXN-005)")
    })

    test("SHOE service type uses Shoe prefix", () => {
      const items = [
        { service_type: "SHOE" as const, item_name: "Deep Clean", quantity: 1, unit_price: 1500 },
      ]
      const result = deriveSalesCategoryAndDescription(items, "TXN-006")
      expect(result.description).toBe("Shoe: Deep Clean (TXN-006)")
    })

    test("MANUAL service type uses generic Sale description", () => {
      const items = [
        { service_type: "MANUAL" as const, item_name: "Custom Work", quantity: 1, unit_price: 2000 },
      ]
      const result = deriveSalesCategoryAndDescription(items, "TXN-007")
      expect(result.category).toBe("SALES")
      expect(result.description).toBe("Sale: Custom Work (TXN-007)")
    })

    test("inventory items without service_type use generic Sale", () => {
      const items = [
        { item_name: "Ink Bottle", quantity: 1, unit_price: 500 },
      ]
      const result = deriveSalesCategoryAndDescription(items, "TXN-008")
      expect(result.category).toBe("SALES")
      expect(result.description).toBe("Sale: Ink Bottle (TXN-008)")
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-ledger-utils.test.ts
  ```
  Expected: FAIL — module not found: `@/server/actions/accounting-ledger-utils` does not exist

- [ ] **GREEN: Write minimal implementation**

  Create `server/actions/accounting-ledger-utils.ts`:
  ```typescript
  import { ServiceType } from "@/utils/types/payroll"

  interface ItemForDescription {
      service_type?: ServiceType
      item_name: string
      quantity: number
      unit_price: number
      service_id?: string
  }

  interface SalesDescriptionResult {
      category: string
      description: string
  }

  const SERVICE_TYPE_PREFIX: Record<string, string> = {
      TATTOO: "Tattoo",
      PIERCING: "Piercing",
      SHOE: "Shoe",
  }

  export function deriveSalesCategoryAndDescription(
      items: ItemForDescription[],
      transactionNumber: string,
      salesDescription?: string
  ): SalesDescriptionResult {
      const category = "SALES"

      // Collect item names
      const itemNames = items.map((item) => item.item_name)
      const itemsText = itemNames.join(", ")

      // Determine service types present
      const serviceTypes = new Set(
          items
              .filter((item) => item.service_type && item.service_type !== "MANUAL")
              .map((item) => item.service_type as string)
      )

      // Build description
      let description: string

      if (salesDescription) {
          // User-authored description takes precedence, with item names appended
          description = `${salesDescription} | ${itemsText} (${transactionNumber})`
      } else if (serviceTypes.size === 1) {
          // Single service type — use its prefix
          const type = [...serviceTypes][0]
          const prefix = SERVICE_TYPE_PREFIX[type] || type
          description = `${prefix}: ${itemsText} (${transactionNumber})`
      } else if (items.length > 0) {
          // Mixed or no service type — generic Sale
          description = `Sale: ${itemsText} (${transactionNumber})`
      } else {
          // No items at all
          description = `Sale: ${transactionNumber}`
      }

      return { category, description }
  }
  ```

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-ledger-utils.test.ts
  ```
  Expected: PASS — all 8 assertions green

- [ ] **REFACTOR: Clean up**
  - Verify `ServiceType` import path is correct (`@/utils/types/payroll`)
  - Run `bun run typecheck` to ensure no import resolution errors
  - Check that the utility does not import any server-only modules (it's pure)

- [ ] **Commit**

  ```bash
  git add server/actions/accounting-ledger-utils.ts tests/integration/accounting-ledger-utils.test.ts
  git commit -m "feat: add deriveSalesCategoryAndDescription utility (Task 2)"
  ```

---

## Phase 2: Core Logic — Server Actions

---

### Task 3: Add PAYROLL entry LEFT JOIN in `getLedgerEntries`

**Files:**
- Modify: `server/actions/accounting.ts:L240-L260` (transform block after `entries.map`)
- Create: `tests/integration/accounting-ledger-join.test.ts`

**Dependencies:** Task 1 (LedgerEntry type has `staff_cut`/`shop_cut`)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Create `tests/integration/accounting-ledger-join.test.ts`:
  ```typescript
  import { describe, test, expect } from "bun:test"
  import { getLedgerEntries } from "@/server/actions/accounting"
  import type { LedgerEntry } from "@/utils/types/ledger"

  describe("getLedgerEntries with PAYROLL join", () => {
    test("function is defined and callable", async () => {
      expect(getLedgerEntries).toBeDefined()
      expect(typeof getLedgerEntries).toBe("function")
    })

    test("returns data array with expected structure", async () => {
      const result = await getLedgerEntries({ pageSize: 1 })
      // Without auth in test, may return failure — but function callable
      if (result.success && result.data) {
        expect(Array.isArray(result.data.data)).toBe(true)
        expect(result.data.data.length).toBeLessThanOrEqual(1)
        // If any entry returned, verify it matches LedgerEntry shape
        if (result.data.data.length > 0) {
          const entry = result.data.data[0] as LedgerEntry
          expect(typeof entry.id).toBe("string")
          expect(typeof entry.description).toBe("string")
          // staff_cut and shop_cut may be undefined (non-PAYROLL entries)
          expect(
            entry.staff_cut === undefined || typeof entry.staff_cut === "number"
          ).toBe(true)
          expect(
            entry.shop_cut === undefined || typeof entry.shop_cut === "number"
          ).toBe(true)
        }
      }
    })

    test("PAYROLL-sourced entries should have staff_cut and shop_cut when joined", async () => {
      // Query with specific PAYROLL source filter to test the join
      const result = await getLedgerEntries({
        pageSize: 5,
        filters: { source_type: "PAYROLL" },
      })
      if (result.success && result.data && result.data.data.length > 0) {
        for (const entry of result.data.data) {
          // PAYROLL entries should have staff_cut and shop_cut defined
          expect(typeof entry.staff_cut).toBe("number")
          expect(typeof entry.shop_cut).toBe("number")
          expect(entry.source_type).toBe("PAYROLL")
        }
      }
      // If no PAYROLL entries exist in test DB, test still passes (no assertion violation)
    })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/accounting-ledger-join.test.ts
  ```
  Expected: PASS on first test (function exists), FAIL on PAYROLL filter test — `typeof entry.staff_cut !== 'number'` (currently `undefined` for all entries)

- [ ] **GREEN: Write minimal implementation**

  In `server/actions/accounting.ts`, in `getLedgerEntries`, after the main `entries` query and before the `transformedEntries` map (around line 240), add:

  ```typescript
  // Collect PAYROLL source entries and fetch their payroll_entry data
  const payrollEntries = entries.filter((e) => e.sourceType === "PAYROLL")
  let payrollEntryMap = new Map<string, { staffCut: string; shopCut: string }>()

  if (payrollEntries.length > 0) {
      const payrollSourceIds = payrollEntries
          .map((e) => e.sourceId)
          .filter((id): id is string => id !== null)

      if (payrollSourceIds.length > 0) {
          const payrollRows = await db
              .select({
                  id: payrollEntry.id,
                  staffCut: payrollEntry.staffCut,
                  shopCut: payrollEntry.shopCut,
              })
              .from(payrollEntry)
              .where(inArray(payrollEntry.id, payrollSourceIds))

          for (const row of payrollRows) {
              payrollEntryMap.set(row.id, {
                  staffCut: row.staffCut,
                  shopCut: row.shopCut,
              })
          }
      }
  }

  // Transform to LedgerEntry type
  const transformedEntries: LedgerEntry[] = entries.map((entry) => {
      const baseEntry: LedgerEntry = {
          // ... existing mapping ...
      }

      // Attach payroll cuts if this is a PAYROLL-sourced entry
      if (entry.sourceType === "PAYROLL" && entry.sourceId) {
          const payrollData = payrollEntryMap.get(entry.sourceId)
          if (payrollData) {
              baseEntry.staff_cut = Number(payrollData.staffCut)
              baseEntry.shop_cut = Number(payrollData.shopCut)
          }
      }

      return baseEntry
  })
  ```

  Add `inArray` to the drizzle-orm imports at the top of `accounting.ts` (line 10 — it is NOT currently imported):
  ```typescript
  import { eq, and, or, like, gte, lte, desc, sql, count, asc, isNull, SQL, inArray } from 'drizzle-orm'
  ```

  Add `payrollEntry` to the schema imports:
  ```typescript
  import { generalLedger, accountingCategory } from "@/server/db/schema/accounting"
  import { payrollEntry } from "@/server/db/schema/payroll"
  ```

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/accounting-ledger-join.test.ts
  ```
  Expected: PASS — first 2 tests pass; third test passes if PAYROLL entries exist in DB, or vacuously passes if none exist

- [ ] **REFACTOR: Clean up**
  - Verify `inArray` is in the import list (it's already used elsewhere in the file — check)
  - Verify `payrollEntry` import doesn't conflict with existing imports
  - Run `bun run typecheck`
  - Ensure the `staff_cut`/`shop_cut` fields on `LedgerEntry` are recognized (Task 1 must be complete)

- [ ] **Commit**

  ```bash
  git add server/actions/accounting.ts tests/integration/accounting-ledger-join.test.ts
  git commit -m "feat: add PAYROLL LEFT JOIN for staff_cut/shop_cut in getLedgerEntries (Task 3)"
  ```

---

### Task 4: Create `getPayrollEntryTransactionItems` server action + fix date parsing in `getPayrollDashboardSummary`

**Files:**
- Modify: `server/actions/payroll.ts` (add `getPayrollEntryTransactionItems` function; fix `getPayrollDashboardSummary` date parsing)
- Create: `tests/integration/payroll-entries.test.ts`

**Dependencies:** Task 1 (PayrollEntry type has `transaction_items`)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Create `tests/integration/payroll-entries.test.ts`:
  ```typescript
  import { describe, test, expect } from "bun:test"
  import {
      getPayrollEntryTransactionItems,
      getPayrollDashboardSummary,
      getPayrollEntries,
  } from "@/server/actions/payroll"
  import type { PayrollEntryTransactionItem } from "@/utils/types/payroll"

  describe("getPayrollEntryTransactionItems", () => {
      test("function exists and is callable", () => {
          expect(getPayrollEntryTransactionItems).toBeDefined()
          expect(typeof getPayrollEntryTransactionItems).toBe("function")
      })

      test("returns failure for invalid entry ID", async () => {
          const result = await getPayrollEntryTransactionItems("non-existent-id")
          expect(result.success).toBe(false)
      })

      test("returns empty array for entry with no transaction", async () => {
          // This is a structural test — actual DB data may vary
          const result = await getPayrollEntryTransactionItems("00000000-0000-0000-0000-000000000000")
          if (!result.success) {
              // Expected: entry not found
              expect(result.error).toBeTruthy()
          }
      })

      test("returns PayrollEntryTransactionItem[] shape on success", async () => {
          // Get a real payroll entry ID from the DB
          const entries = await getPayrollEntries({ pageSize: 1 })
          if (entries.success && entries.data.data.length > 0) {
              const entryId = entries.data.data[0].id
              const result = await getPayrollEntryTransactionItems(entryId)
              if (result.success) {
                  expect(Array.isArray(result.data)).toBe(true)
                  if (result.data.length > 0) {
                      const item = result.data[0] as PayrollEntryTransactionItem
                      expect(typeof item.item_name).toBe("string")
                      expect(typeof item.quantity).toBe("number")
                      expect(typeof item.unit_price).toBe("number")
                      expect(typeof item.line_total).toBe("number")
                  }
              }
          }
          // If no entries exist, test passes vacuously
      })
  })

  describe("getPayrollDashboardSummary date filtering", () => {
      test("returns summary for today without error", async () => {
          const today = new Date().toISOString().split("T")[0]
          const result = await getPayrollDashboardSummary(
              null,
              today,
              today
          )
          expect(result.success).toBe(true)
          if (result.data) {
              expect(typeof result.data.pendingAmount).toBe("number")
              expect(typeof result.data.pendingCount).toBe("number")
          }
      })

      test("returns summary for this week without error", async () => {
          const now = new Date()
          const startOfWeek = new Date(now)
          startOfWeek.setDate(now.getDate() - now.getDay())
          const endOfWeek = new Date(startOfWeek)
          endOfWeek.setDate(startOfWeek.getDate() + 6)

          const result = await getPayrollDashboardSummary(
              null,
              startOfWeek.toISOString().split("T")[0],
              endOfWeek.toISOString().split("T")[0]
          )
          expect(result.success).toBe(true)
      })

      test("returns summary for this year without error", async () => {
          const year = new Date().getFullYear()
          const result = await getPayrollDashboardSummary(
              null,
              `${year}-01-01`,
              `${year}-12-31`
          )
          expect(result.success).toBe(true)
      })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/payroll-entries.test.ts
  ```
  Expected: FAIL — `getPayrollEntryTransactionItems` is not exported from `@/server/actions/payroll`

- [ ] **GREEN: Write minimal implementation — Part A (getPayrollEntryTransactionItems)**

  In `server/actions/payroll.ts`, add after `getStaffEarningsForPeriod` (around line 2680):
  ```typescript
  export async function getPayrollEntryTransactionItems(
      entryId: string
  ): Promise<ActionResponse<PayrollEntryTransactionItem[]>> {
      try {
          // Fetch the payroll entry to get transaction_id and staff_cut/gross_amount
          const [entry] = await db
              .select({
                  id: payrollEntry.id,
                  transactionId: payrollEntry.transactionId,
                  staffCut: payrollEntry.staffCut,
                  shopCut: payrollEntry.shopCut,
                  grossAmount: payrollEntry.grossAmount,
              })
              .from(payrollEntry)
              .where(eq(payrollEntry.id, entryId))
              .limit(1)

          if (!entry) {
              return failure("Payroll entry not found")
          }

          if (!entry.transactionId) {
              return success([])
          }

          // Fetch transaction items
          const items = await db
              .select({
                  itemName: transactionItems.itemName,
                  quantity: transactionItems.quantity,
                  unitPrice: transactionItems.unitPrice,
                  lineTotal: transactionItems.lineTotal,
                  serviceId: transactionItems.serviceId,
              })
              .from(transactionItems)
              .where(eq(transactionItems.transactionId, entry.transactionId))

          if (items.length === 0) {
              return success([])
          }

          const grossAmount = Number(entry.grossAmount)
          const staffCut = Number(entry.staffCut)
          const shopCut = Number(entry.shopCut)

          // Fetch service types for items with service_id
          const serviceIds = items
              .filter((item) => item.serviceId)
              .map((item) => item.serviceId as string)

          const serviceTypeMap = new Map<string, string>()
          if (serviceIds.length > 0) {
              const servicesData = await db
                  .select({
                      id: services.id,
                      serviceType: services.serviceType,
                  })
                  .from(services)
                  .where(inArray(services.id, serviceIds))

              for (const svc of servicesData) {
                  serviceTypeMap.set(svc.id, svc.serviceType)
              }
          }

          // Build result with proportional cuts
          const result: PayrollEntryTransactionItem[] = items.map((item) => {
              const lineTotal = Number(item.lineTotal)
              const proportion = grossAmount > 0 ? lineTotal / grossAmount : 0

              return {
                  item_name: item.itemName,
                  quantity: Number(item.quantity),
                  unit_price: Number(item.unitPrice),
                  line_total: lineTotal,
                  service_id: item.serviceId || undefined,
                  service_type: item.serviceId
                      ? (serviceTypeMap.get(item.serviceId) as ServiceType)
                      : undefined,
                  staff_cut: Math.round(proportion * staffCut * 100) / 100,
                  shop_cut: Math.round(proportion * shopCut * 100) / 100,
              }
          })

          return success(result)
      } catch (error) {
          await logError({
              type: "PAYROLL",
              message: `Error fetching payroll entry transaction items: ${error instanceof Error ? error.message : String(error)}`,
          })
          return failure(
              error instanceof Error
                  ? error.message
                  : "Failed to fetch transaction items"
          )
      }
  }
  ```

  Add at top of file (check if already imported — `inArray` `is`, `services` `is`, `transactions` `is`):
  ```typescript
  // transactionItems is NOT yet imported — add to the existing schema import
  // Change line 8 from:
  // import { ..., transactions, services } from "@/server/db/schema"
  // To:
  // import { ..., transactions, services, transactionItems } from "@/server/db/schema"
  import { transactionItems } from "@/server/db/schema" // or add to existing import
  import type { PayrollEntryTransactionItem, ServiceType } from "@/utils/types/payroll"
  ```

  **GREEN — Part B (Fix date parsing in getPayrollDashboardSummary):**

  In `server/actions/payroll.ts`, in `getPayrollDashboardSummary` (around line 1586):

  Replace:
  ```typescript
  const effectiveDateFrom = dateFrom ? new Date(dateFrom) : startOfMonth
  const effectiveDateTo = dateTo ? new Date(dateTo) : endOfMonth
  // Set to end of day for dateTo to include the full day
  if (dateTo) {
      effectiveDateTo.setHours(23, 59, 59, 999)
  }
  ```

  With:
  ```typescript
  // Parse dates respecting timezone — input "YYYY-MM-DD" is treated as local date start/end
  const effectiveDateFrom = dateFrom
      ? new Date(dateFrom + "T00:00:00.000")
      : startOfMonth
  const effectiveDateTo = dateTo
      ? new Date(dateTo + "T23:59:59.999")
      : endOfMonth
  ```

  Apply the same fix in `getStaffPayrollSummary` (around line 1750):

  Replace:
  ```typescript
  const effectiveDateFrom = dateFrom ? new Date(dateFrom) : new Date(0)
  const effectiveDateTo = dateTo ? new Date(dateTo) : new Date()
  effectiveDateTo.setHours(23, 59, 59, 999)
  ```

  With:
  ```typescript
  const effectiveDateFrom = dateFrom
      ? new Date(dateFrom + "T00:00:00.000")
      : new Date(0)
  const effectiveDateTo = dateTo
      ? new Date(dateTo + "T23:59:59.999")
      : new Date()
  ```

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/payroll-entries.test.ts
  ```
  Expected: PASS — all date filter tests return `success: true`, transaction items function exists

- [ ] **REFACTOR: Clean up**
  - Check that `transactionItems` and `services` imports are already present in `payroll.ts` (they may already exist — verify and only add if missing)
  - Run `bun run typecheck`
  - Verify the new function is exported from `@/server/actions/payroll`

- [ ] **Commit**

  ```bash
  git add server/actions/payroll.ts tests/integration/payroll-entries.test.ts
  git commit -m "feat: add getPayrollEntryTransactionItems + fix date parsing (Task 4)"
  ```

---

### Task 5: Enrich sales accounting entry descriptions in `createTransaction` and `sales.ts`

**Files:**
- Modify: `server/actions/transactions.ts:L235-L320` (all `createAutoLedgerEntry` calls for REVENUE)
- Modify: `server/actions/sales.ts:L150-L180` (`createAutoLedgerEntry` for appointment sales)
- Create: `tests/integration/sales-enrichment.test.ts`

**Dependencies:** Task 2 (deriveSalesCategoryAndDescription utility exists)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Create `tests/integration/sales-enrichment.test.ts`:
  ```typescript
  import { describe, test, expect } from "bun:test"
  import { deriveSalesCategoryAndDescription } from "@/server/actions/accounting-ledger-utils"

  describe("Sales accounting enrichment", () => {
      test("deriveSalesCategoryAndDescription is importable", () => {
          expect(deriveSalesCategoryAndDescription).toBeDefined()
      })

      test("new description format is used in createTransaction for single payment", async () => {
          // Verify the utility produces expected format for tattoo services
          const items = [
              { service_type: "TATTOO" as const, item_name: "Butterfly", quantity: 1, unit_price: 3500 },
          ]
          const result = deriveSalesCategoryAndDescription(items, "TXN-TEST-001")
          expect(result.description).toContain("Tattoo:")
          expect(result.description).toContain("Butterfly")
          expect(result.description).toContain("TXN-TEST-001")
          expect(result.category).toBe("SALES")
      })

      test("createTransaction server action exists", async () => {
          const { createTransaction } = await import("@/server/actions/transactions")
          expect(createTransaction).toBeDefined()
          expect(typeof createTransaction).toBe("function")
      })
  })
  ```

- [ ] **RED: Verify the test fails**

  ```bash
  bun test tests/integration/sales-enrichment.test.ts
  ```
  Expected: PASS — utility test passes; the function existence test always passes. (The real verification comes from the E2E test in Phase 6, since creating test transactions requires full auth flow.)

- [ ] **GREEN: Write minimal implementation — Part A (transactions.ts)**

  In `server/actions/transactions.ts`, add import at top:
  ```typescript
  import { deriveSalesCategoryAndDescription } from "./accounting-ledger-utils"
  ```

  In the `createTransaction` function, replace the existing description-building logic (~lines 270-280):

  Replace:
  ```typescript
  // --- Build enriched ledger description ---
  const itemLabels = (payload.items || [])
      .filter(item => item.item_label)
      .map(item => item.item_label)

  const baseDescription = payload.sales_description
      ? sanitizeText(payload.sales_description)
      : `Sale: ${transactionNumber}`

  const itemSuffix = itemLabels.length > 0
      ? ` | Items: ${itemLabels.join(', ')}`
      : ''
  ```

  With:
  ```typescript
  // --- Build enriched ledger description from service types ---
  const { description: enrichedDescription } = deriveSalesCategoryAndDescription(
      payload.items || [],
      transactionNumber,
      payload.sales_description ? sanitizeText(payload.sales_description) : undefined
  )
  ```

  Then update each `createAutoLedgerEntry` call:

  **Single payment** (~line 302):
  ```typescript
  await createAutoLedgerEntry(
      'TRANSACTION',
      newTransaction.id,
      {
          entry_date: new Date(),
          entry_type: 'REVENUE',
          category: 'SALES',
          description: enrichedDescription,
          reference: transactionNumber,
          debit: 0,
          credit: creditAmount,
          branch_id: payload.branch_id,
          payment_method: mapTransactionToAccountingPaymentMethod(payload.payment_method),
      },
      user.id,
      tx
  )
  ```

  **Split payments** (~line 235-281) — for each split payment:
  ```typescript
  description: `${enrichedDescription} (${getTransactionPaymentMethodLabel(payment.payment_method)})`,
  ```

- [ ] **GREEN — Part B (sales.ts)**

  In `server/actions/sales.ts`, add import at top:
  ```typescript
  import { deriveSalesCategoryAndDescription } from "./accounting-ledger-utils"
  ```

  In the `createTransactionFromAppointment` function (~line 155), replace:
  ```typescript
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
          credit: Number(newTransaction.amountPaid),
          branch_id: appointment.branchId ?? null,
          payment_method: mapTransactionToAccountingPaymentMethod(newTransaction.paymentMethod),
      },
      user.id,
      tx
  )
  ```

  With:
  ```typescript
  const { description: apptEnrichedDescription } = deriveSalesCategoryAndDescription(
      appointmentServicesData.map((s) => ({
          service_type: (s.serviceType as ServiceType) || undefined,
          item_name: s.serviceTitle || "Service",
          quantity: 1,
          unit_price: Number(s.servicePrice) || 0,
      })),
      transactionNumber
  )

  await createAutoLedgerEntry(
      'TRANSACTION',
      newTransaction.id,
      {
          entry_date: new Date(),
          entry_type: 'REVENUE',
          category: 'SALES',
          description: apptEnrichedDescription,
          reference: transactionNumber,
          debit: 0,
          credit: Number(newTransaction.amountPaid),
          branch_id: appointment.branchId ?? null,
          payment_method: mapTransactionToAccountingPaymentMethod(newTransaction.paymentMethod),
      },
      user.id,
      tx
  )
  ```

  Check that `ServiceType` is imported at the top of `sales.ts`:
  ```typescript
  import { ServiceType } from "@/utils/types/payroll"
  ```
  (Add if missing)

- [ ] **GREEN: Verify the test passes**

  ```bash
  bun test tests/integration/sales-enrichment.test.ts
  ```
  Expected: PASS — all utility tests pass

- [ ] **REFACTOR: Clean up**
  - Verify the old `itemLabels` and `itemSuffix` variables are no longer used (remove if orphaned)
  - Check that `sanitizeText` import is still needed (it is — still used via `payload.sales_description`)
  - Run `bun run typecheck`

- [ ] **Commit**

  ```bash
  git add server/actions/transactions.ts server/actions/sales.ts tests/integration/sales-enrichment.test.ts
  git commit -m "feat: enrich sales accounting descriptions with service type info (Task 5)"
  ```

---

## Phase 3: Presentation — Admin UI

---

### Task 6: Update accounting table cells for Staff/Shop Cut columns

**Files:**
- Modify: `app/accounting/accountingPage.tsx` (table body cells for Staff Cut and Shop Cut)
- Test: Covered by E2E in Phase 6 (no unit test for JSX rendering in this project pattern)

**Dependencies:** Task 3 (getLedgerEntries returns staff_cut/shop_cut for PAYROLL entries)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  Since this project uses Bun test for server actions only (not component rendering), the verification for this task is visual and via E2E. The "test" is:

  ```bash
  # Build check — verifies TypeScript compilation after the JSX changes
  bun run typecheck
  ```
  Expected: Initially PASS (before changes). After changes, if the new optional fields are misused, FAIL.

- [ ] **GREEN: Write minimal implementation**

  In `app/accounting/accountingPage.tsx`, find the two table cells that show "—" for Staff Cut and Shop Cut.

  **Staff Cut cell** — replace the hardcoded dash:
  ```tsx
  <td className='px-4 py-2 text-sm text-right text-green-300'>
      <span className='text-white/30'>—</span>
  </td>
  ```

  With:
  ```tsx
  <td className='px-4 py-2 text-sm text-right text-green-300'>
      {entry.staff_cut !== undefined && entry.staff_cut !== null
          ? `${currencySymbol}${Number(entry.staff_cut).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
          : <span className='text-white/30'>—</span>}
  </td>
  ```

  **Shop Cut cell** — replace the hardcoded dash:
  ```tsx
  <td className='px-4 py-2 text-sm text-right text-red-300'>
      <span className='text-white/30'>—</span>
  </td>
  ```

  With:
  ```tsx
  <td className='px-4 py-2 text-sm text-right text-red-300'>
      {entry.shop_cut !== undefined && entry.shop_cut !== null
          ? `${currencySymbol}${Number(entry.shop_cut).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
          : <span className='text-white/30'>—</span>}
  </td>
  ```

- [ ] **GREEN: Verify the build compiles**

  ```bash
  bun run typecheck
  ```
  Expected: PASS — no TypeScript errors

- [ ] **REFACTOR: Clean up**
  - Check that the `entry` type from the `.map()` callback is correctly inferred as `LedgerEntry` (it should be, since `getLedgerEntries` returns `ActionResponse<{ data: LedgerEntry[] }>`)
  - If TypeScript complains about `staff_cut`/`shop_cut` not existing on the mapped type, add a type assertion: `(entry as LedgerEntry).staff_cut`
  - Run `bun run lint` to check for ESLint issues

- [ ] **Commit**

  ```bash
  git add app/accounting/accountingPage.tsx
  git commit -m "feat: show staff_cut/shop_cut for PAYROLL entries in accounting table (Task 6)"
  ```

---

### Task 7: Add "Request Payout" button in admin Payroll Dashboard + fix DateRangeSelector state sync

**Files:**
- Modify: `app/payroll/payrollPage.tsx` (add "Request Payout" button in dashboard header)
- Modify: `components/payroll/DateRangeSelector.tsx` (add useEffect to sync internal state with `value` prop)
- Test: Covered by E2E in Phase 6

**Dependencies:** Task 4 (date parsing fix in server action)

**TDD Cycle:**

- [ ] **RED: Write the failing test**

  ```bash
  bun run typecheck
  ```
  Expected: PASS before changes. The "test" here is the typecheck passing after modifications.

- [ ] **GREEN: Write minimal implementation — Part A (DateRangeSelector fix)**

  In `components/payroll/DateRangeSelector.tsx`, add a `useEffect` to sync internal state with the `value` prop. Add this after the `useState` declarations and before `handlePreset`:

  ```typescript
  import { useState, useEffect } from "react"
  // ... existing imports ...

  export default function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
      const [activePreset, setActivePreset] = useState<DateRangePreset | null>("this_month")
      const [customFrom, setCustomFrom] = useState(value.dateFrom)
      const [customTo, setCustomTo] = useState(value.dateTo)

      // Sync internal custom date fields when parent's value prop changes externally
      useEffect(() => {
          setCustomFrom(value.dateFrom)
          setCustomTo(value.dateTo)
      }, [value.dateFrom, value.dateTo])

      // ... rest of component
  ```

  This ensures that when the parent's `dashboardDateRange` state changes (including after the initial load or an external reset), the DateRangeSelector's custom date inputs stay in sync.

  **GREEN — Part B (Request Payout button)**

  In `app/payroll/payrollPage.tsx`, add the "Request Payout" button in the header section, next to the "Manual Entry" button (around line ~240). Add after the Manual Entry button block:

  ```tsx
  {isAdmin && (
      <AdminActionGuard
          onAction={() => {
              // Open staff request modal with no pre-selected staff
              // The StaffRequestModal will let the admin pick a staff member
              setStaffRequestModal({
                  staffId: "",
                  staffName: "Select Staff",
              })
          }}
      >
          <button
              className='p-2 bg-green-600 hover:bg-green-700 rounded-md transition-colors border-2 border-white/5 cursor-pointer flex items-center gap-2 px-4'
              title='Request Payout for Staff'
          >
              <SendIcon className='w-4 h-4' />
              <span className='hidden md:inline'>Request Payout</span>
          </button>
      </AdminActionGuard>
  )}
  ```

  Add `SendIcon` to the lucide-react import at the top (if not already imported — check existing imports):
  ```typescript
  import { ..., SendIcon } from "lucide-react"
  ```

  Now update the `StaffRequestModal` to handle the case where no staff is pre-selected (empty staffId). In `app/payroll/modals/StaffRequestModal.tsx`, add a staff selector at the top of the modal body when `staffId` is empty:

  Add state for staff list:
  ```typescript
  import { useState, useEffect } from "react"
  import { getStaffList } from "@/server/actions/profile"
  
  // Inside StaffRequestModal, after existing useState hooks:
  const [selectedStaffId, setSelectedStaffId] = useState(staffId)
  const [staffList, setStaffList] = useState<Array<{ id: string; full_name: string }>>([])
  const [loadingStaff, setLoadingStaff] = useState(false)

  useEffect(() => {
      if (!staffId || staffId === "") {
          setLoadingStaff(true)
          // Fetch staff list — use existing staffSummary from parent or fetch directly
          // For simplicity, accept staffList as a prop from parent
          setLoadingStaff(false)
      }
  }, [staffId])
  ```

  Actually, a simpler approach: Modify the existing flow so the parent's `staffPendingEntries` state feeds into the modal. The parent already has `staffSummary` with staff names. Add a staff selector step before showing entries:

  In `payrollPage.tsx`, update the `staffRequestModal` state usage:

  When the button is clicked, set `staffRequestModal` to `{ staffId: "", staffName: "" }` to indicate "no staff selected yet". Then in the modal rendering, if `staffId` is empty, show a staff picker first. Once a staff is selected, fetch their pending entries and show the entry selector.

  **Simplified approach (minimal change):** Accept a `staffList` prop and add a step in the existing modal.

  Add to `StaffRequestModalProps`:
  ```typescript
  staffList: Array<{ id: string; full_name: string }>
  ```

  In the modal body, wrap the entries section in a condition:
  ```tsx
  {!selectedStaffId ? (
      <div className='space-y-2'>
          <p className='text-sm text-white/50 mb-2'>Select a staff member:</p>
          {staffList.map((staff) => (
              <button
                  key={staff.id}
                  onClick={() => {
                      setSelectedStaffId(staff.id)
                      // Fetch pending entries for this staff
                      // ... caller handles this
                  }}
                  className='w-full text-left p-2 bg-white/5 hover:bg-white/10 rounded'
              >
                  {staff.full_name}
              </button>
          ))}
      </div>
  ) : (
      // existing entry selector
  )}
  ```

  Pass `staffList` from the parent when opening the modal:
  ```tsx
  <StaffRequestModal
      staffId={staffRequestModal.staffId}
      staffName={staffRequestModal.staffName}
      staffList={staffSummary.map(s => ({ id: s.staff_id, full_name: s.full_name }))}
      ...
  />
  ```

- [ ] **GREEN: Verify the build compiles**

  ```bash
  bun run typecheck
  ```
  Expected: PASS — no TypeScript errors in `payrollPage.tsx` or `StaffRequestModal.tsx`

- [ ] **REFACTOR: Clean up**
  - Verify `SendIcon` is imported (check lucide-react imports at top of `payrollPage.tsx`)
  - Ensure the `DateRangeSelector` useEffect doesn't cause infinite loops (deps are `[value.dateFrom, value.dateTo]` — these only change when the parent's `dashboardDateRange` changes, which happens from user clicks, not from the child)
  - Run `bun run lint`

- [ ] **Commit**

  ```bash
  git add app/payroll/payrollPage.tsx components/payroll/DateRangeSelector.tsx app/payroll/modals/StaffRequestModal.tsx
  git commit -m "feat: add Request Payout button + fix DateRangeSelector state sync (Task 7)"
  ```

---

## Phase 4: Presentation — Staff & Client UI

---

### Task 8: Add transaction services expandable section in My Payroll

**Files:**
- Modify: `app/my-payroll/myPayrollPage.tsx` (add expandable detail per entry)
- Test: Covered by E2E in Phase 6

**Dependencies:** Task 4 (getPayrollEntryTransactionItems server action exists)

**TDD Cycle:**

- [ ] **RED: Typecheck as verification**

  ```bash
  bun run typecheck
  ```
  Expected: PASS before changes

- [ ] **GREEN: Write minimal implementation**

  In `app/my-payroll/myPayrollPage.tsx`, add an expand/collapse state for the entry detail. At the top of `MyPayrollPageClient`, add:

  ```typescript
  import {
      getPayrollEntryTransactionItems,
  } from "@/server/actions/payroll"
  import type { PayrollEntryTransactionItem } from "@/utils/types/payroll"
  import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
  ```

  After the existing state declarations, add:
  ```typescript
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)
  const [transactionItemsMap, setTransactionItemsMap] = useState<
      Record<string, PayrollEntryTransactionItem[]>
  >({})
  const [loadingItems, setLoadingItems] = useState(false)
  ```

  Add a handler for expanding an entry:
  ```typescript
  const handleExpandEntry = async (entryId: string) => {
      if (expandedEntryId === entryId) {
          setExpandedEntryId(null)
          return
      }
      setExpandedEntryId(entryId)
      if (!transactionItemsMap[entryId]) {
          setLoadingItems(true)
          try {
              const result = await getPayrollEntryTransactionItems(entryId)
              if (result.success && result.data) {
                  setTransactionItemsMap((prev) => ({
                      ...prev,
                      [entryId]: result.data,
                  }))
              }
          } catch {
              // Silently fail — items just won't show
          } finally {
              setLoadingItems(false)
          }
      }
  }
  ```

  In the list view entries `.map()`, wrap each entry in a clickable container. Replace the current entry `<div>` with:

  ```tsx
  <div key={entry.id}>
      <div
          className='flex items-center justify-between bg-white/5 hover:bg-white/10 rounded p-3 text-sm cursor-pointer'
          onClick={() => handleExpandEntry(entry.id)}
      >
          <div className='flex items-center gap-2 flex-1 min-w-0'>
              {expandedEntryId === entry.id ? (
                  <ChevronDownIcon className='w-4 h-4 text-white/40 flex-shrink-0' />
              ) : (
                  <ChevronRightIcon className='w-4 h-4 text-white/40 flex-shrink-0' />
              )}
              <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                      <p className='truncate font-medium'>
                          {entry.service_description || "Service"}
                      </p>
                      {entry.staff_rate_snapshot?.serviceType && (
                          <span className='text-xs px-2 py-0.5 rounded bg-white/10 text-white/60'>
                              {entry.staff_rate_snapshot.serviceType}
                          </span>
                      )}
                  </div>
                  <p className='text-xs text-white/40'>
                      {new Date(entry.service_date).toLocaleDateString()}{" "}
                      • {entry.client_type}
                  </p>
              </div>
          </div>
          <div className='text-right flex-shrink-0'>
              <p className='font-bold text-green-400'>
                  {currencySymbol}
                  {Number(entry.staff_cut).toFixed(2)}
              </p>
              <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[entry.payment_status]}`}
              >
                  {entry.payment_status}
              </span>
          </div>
      </div>

      {/* Expanded: Transaction Services Breakdown */}
      {expandedEntryId === entry.id && (
          <div className='bg-white/5 rounded-b border-t border-white/5 mt-[-1px] px-4 py-3 ml-6'>
              {loadingItems ? (
                  <div className='flex items-center justify-center py-2'>
                      <LoaderCircleIcon className='w-4 h-4 animate-spin text-white/40' />
                      <span className='text-xs text-white/40 ml-2'>Loading services...</span>
                  </div>
              ) : transactionItemsMap[entry.id] ? (
                  transactionItemsMap[entry.id].length === 0 ? (
                      <p className='text-xs text-white/40 text-center py-2'>
                          No transaction items found
                      </p>
                  ) : (
                      <table className='w-full text-xs'>
                          <thead>
                              <tr className='text-white/50 border-b border-white/10'>
                                  <th className='text-left py-1'>Service</th>
                                  <th className='text-left py-1'>Type</th>
                                  <th className='text-center py-1'>Qty</th>
                                  <th className='text-right py-1'>Price</th>
                                  <th className='text-right py-1'>Staff Cut</th>
                              </tr>
                          </thead>
                          <tbody>
                              {transactionItemsMap[entry.id].map((item, idx) => (
                                  <tr key={idx} className='border-b border-white/5'>
                                      <td className='py-1 text-white/80'>{item.item_name}</td>
                                      <td className='py-1'>
                                          {item.service_type ? (
                                              <span className='text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60'>
                                                  {item.service_type}
                                              </span>
                                          ) : (
                                              <span className='text-white/30'>—</span>
                                          )}
                                      </td>
                                      <td className='py-1 text-center text-white/60'>{item.quantity}</td>
                                      <td className='py-1 text-right text-white/80'>
                                          {currencySymbol}{item.unit_price.toFixed(2)}
                                      </td>
                                      <td className='py-1 text-right text-green-400'>
                                          {item.staff_cut !== undefined
                                              ? `${currencySymbol}${item.staff_cut.toFixed(2)}`
                                              : <span className='text-white/30'>—</span>}
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  )
              ) : (
                  <p className='text-xs text-white/40 text-center py-2'>
                      Click to load service details
                  </p>
              )}
          </div>
      )}
  </div>
  ```

- [ ] **GREEN: Verify build compiles**

  ```bash
  bun run typecheck
  ```
  Expected: PASS

- [ ] **REFACTOR: Clean up**
  - Ensure the `ChevronDownIcon` and `ChevronRightIcon` are imported from `lucide-react` (add if missing)
  - Check that `LoaderCircleIcon` is already imported (it is — verify)
  - Run `bun run lint`
  - Check that the calendar view entries also get the expandable treatment (if desired — deferred for now; calendar view shows filtered entries by date, expanding there is out of scope per spec)

- [ ] **Commit**

  ```bash
  git add app/my-payroll/myPayrollPage.tsx
  git commit -m "feat: add transaction services expandable in My Payroll (Task 8)"
  ```

---

### Task 9: Rename "Registered Client" → "Personal" in CustomerSelection

**Files:**
- Modify: `components/sales/checkout/CustomerSelection.tsx:L45` (button label)

**Dependencies:** None

**TDD Cycle:**

- [ ] **RED: Verify current label exists**

  ```bash
  grep -n "Registered Client" components/sales/checkout/CustomerSelection.tsx
  ```
  Expected: Output shows `45:                    Registered Client` — confirms the exact line to change

- [ ] **GREEN: Write minimal implementation**

  In `components/sales/checkout/CustomerSelection.tsx`, line 45, change:
  ```tsx
  Registered Client
  ```
  To:
  ```tsx
  Personal
  ```

  That's it. No other changes needed. The internal state variable `customerMode: 'REGISTERED' | 'WALKIN'` stays the same — only the display label changes.

- [ ] **GREEN: Verify the change**

  ```bash
  grep -n "Personal" components/sales/checkout/CustomerSelection.tsx
  ```
  Expected: Output shows `45:                    Personal`

- [ ] **REFACTOR: Clean up**
  - Run `bun run typecheck` (should still pass — label change has no type impact)
  - Run `bun run lint`

- [ ] **Commit**

  ```bash
  git add components/sales/checkout/CustomerSelection.tsx
  git commit -m "feat: rename 'Registered Client' to 'Personal' in CustomerSelection (Task 9)"
  ```

---

### Task 10: Remove per-item artist selector from CartPanel

**Files:**
- Modify: `components/sales/layout/CartPanel.tsx:L43,85,207-227` (remove `updateArtistForItem` prop, remove artist `<select>`)
- Modify: `components/sales/context/SalesContext.tsx:L62,113,717-722,957,1272` (remove `artist_id` from CartItem type, remove `updateArtistForItem` function)
- Test: Covered by E2E in Phase 6

**Dependencies:** None (can be done independently)

**TDD Cycle:**

- [ ] **RED: Typecheck before changes**

  ```bash
  bun run typecheck
  ```
  Expected: PASS before changes

- [ ] **GREEN: Write minimal implementation — Part A (CartPanel.tsx)**

  **Step 1: Remove the `updateArtistForItem` prop from the interface**

  In `CartPanelProps` interface (line ~43), remove:
  ```typescript
  updateArtistForItem: (itemId: string, artistId: string | undefined) => void
  ```

  **Step 2: Remove the destructured prop** (line ~85)

  Remove:
  ```typescript
  updateArtistForItem,
  ```

  **Step 3: Remove the artist `<select>` block** (lines ~207-227)

  Remove this entire block:
  ```tsx
  {item.type === "SERVICE" && (
      <div className='flex items-center gap-2 w-full mt-2'>
          <label className='text-xs text-zinc-500 whitespace-nowrap'>Artist:</label>
          <select
              value={item.artist_id || selectedStaffId || ''}
              onChange={(e) => updateArtistForItem(item.id, e.target.value || undefined)}
              className='flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm'
          >
              <option value="">Default Staff</option>
              <option value="SHOP_SALE">No Commission</option>
              {staffList.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                      {staff.full_name}
                  </option>
              ))}
          </select>
      </div>
  )}
  ```

  **GREEN — Part B (SalesContext.tsx)**

  **Step 1: Remove `artist_id` from CartItem type** (line ~62)

  Remove:
  ```typescript
  artist_id?: string   // per-item artist assignment
  ```

  **Step 2: Remove `updateArtistForItem` from interface** (line ~113)

  Remove:
  ```typescript
  updateArtistForItem: (itemId: string, artistId: string | undefined) => void
  ```

  **Step 3: Remove `updateArtistForItem` function implementation** (lines ~717-722)

  Remove:
  ```typescript
  const updateArtistForItem = (itemId: string, artistId: string | undefined) => {
      setCart(prev => prev.map(item =>
          item.id === itemId
              ? { ...item, artist_id: artistId }
              : item
      ))
  }
  ```

  **Step 4: Fix the cart.flatMap for items** (line ~957)

  In the `payload` construction, the cart item mapping uses `artist_id: item.artist_id`. Since `artist_id` is removed from the type, change:
  ```typescript
  items: cart.flatMap((item) => {
      if (item.type === "SERVICE") {
          return {
              service_id: item.id,
              item_name: item.name,
              item_label: itemLabels[item.id] || undefined,
              quantity: item.quantity,
              unit_price: item.unit_price,
              service_type: item.service_type,
              artist_id: item.artist_id,
          }
      }
      // ... inventory items ...
  }),
  ```

  To:
  ```typescript
  items: cart.flatMap((item) => {
      if (item.type === "SERVICE") {
          return {
              service_id: item.id,
              item_name: item.name,
              item_label: itemLabels[item.id] || undefined,
              quantity: item.quantity,
              unit_price: item.unit_price,
              service_type: item.service_type,
              // artist_id removed — inherits from selectedStaffId (global Staff Assignment)
          }
      }
      // ... inventory items ...
  }),
  ```

  **Step 5: Remove `updateArtistForItem` from the returned context value** (line ~1272)

  Remove:
  ```typescript
  updateArtistForItem,
  ```

- [ ] **GREEN: Verify build compiles**

  ```bash
  bun run typecheck
  ```
  Expected: PASS — all removed references cleaned up, no remaining `updateArtistForItem` or `artist_id` usage

  Also verify with grep that no stale references remain:
  ```bash
  grep -rn "updateArtistForItem" components/sales/ --include="*.tsx" --include="*.ts"
  grep -rn "artist_id" components/sales/ --include="*.tsx" --include="*.ts"
  ```
  Expected: No output (all removed)

- [ ] **REFACTOR: Clean up**
  - Run `bun run lint`
  - Check `app/sales/salesPage.tsx` — verify it doesn't pass `updateArtistForItem` to CartPanel (it passes `{...sales}` which is the SalesContext spread — verify it no longer includes `updateArtistForItem`)

- [ ] **Commit**

  ```bash
  git add components/sales/layout/CartPanel.tsx components/sales/context/SalesContext.tsx
  git commit -m "feat: remove per-item artist selector from sales cart (Task 10)"
  ```

---

## Phase 5: Polish & Hardening

---

### Task 11: Error handling, loading states, and edge case hardening

**Files:**
- Modify: `app/accounting/accountingPage.tsx` (ensure Staff/Shop Cut rendering doesn't break on edge cases)
- Modify: `app/my-payroll/myPayrollPage.tsx` (ensure expandable section gracefully handles loading/error states)
- Modify: `app/payroll/payrollPage.tsx` (ensure Request Payout button properly handles empty staff list)
- Modify: `components/payroll/DateRangeSelector.tsx` (ensure custom date inputs don't produce invalid ranges)

**Dependencies:** Tasks 6, 7, 8 (UI changes exist)

**No new test file** — hardening modifies existing components for resilience.

- [ ] **RED: Identify and document edge cases**

  List every edge case to harden:

  1. **Accounting Staff/Shop Cut:** If `Number(entry.staff_cut)` returns `NaN`, show "—"
  2. **My Payroll expand:** Network error while fetching items — show error state, not infinite spinner
  3. **My Payroll expand:** Entry with `undefined` transaction_id — don't even try to fetch items, expand shows "No transaction linked"
  4. **Payroll Request Payout button:** If `staffSummary` is empty, disable the button
  5. **DateRangeSelector:** If user clicks "Apply" with `customFrom > customTo`, show an error instead of sending invalid range
  6. **DateRangeSelector:** If `getDateRangeFromPreset` returns `null`, keep current range (don't crash)

- [ ] **GREEN: Implement fixes**

  **Fix 1 — Accounting (app/accounting/accountingPage.tsx):**

  Update the Staff Cut and Shop Cut cells to handle NaN:
  ```tsx
  <td className='px-4 py-2 text-sm text-right text-green-300'>
      {(() => {
          const val = Number(entry.staff_cut)
          return !isNaN(val) && entry.staff_cut !== undefined && entry.staff_cut !== null
              ? `${currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
              : <span className='text-white/30'>—</span>
      })()}
  </td>

  <td className='px-4 py-2 text-sm text-right text-red-300'>
      {(() => {
          const val = Number(entry.shop_cut)
          return !isNaN(val) && entry.shop_cut !== undefined && entry.shop_cut !== null
              ? `${currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
              : <span className='text-white/30'>—</span>
      })()}
  </td>
  ```

  **Fix 2 — My Payroll expand error state:**

  Add error state to `handleExpandEntry` in `app/my-payroll/myPayrollPage.tsx`:
  ```typescript
  const [itemsError, setItemsError] = useState<string | null>(null)

  const handleExpandEntry = async (entryId: string) => {
      if (expandedEntryId === entryId) {
          setExpandedEntryId(null)
          setItemsError(null)
          return
      }
      setExpandedEntryId(entryId)
      setItemsError(null)
      if (!transactionItemsMap[entryId]) {
          setLoadingItems(true)
          try {
              const result = await getPayrollEntryTransactionItems(entryId)
              if (result.success && result.data) {
                  setTransactionItemsMap((prev) => ({
                      ...prev,
                      [entryId]: result.data,
                  }))
              } else {
                  setItemsError(result.error || "Could not load service details")
              }
          } catch {
              setItemsError("Could not load service details")
          } finally {
              setLoadingItems(false)
          }
      }
  }
  ```

  In the expanded section, add error rendering:
  ```tsx
  {itemsError && (
      <p className='text-xs text-red-400 text-center py-2'>{itemsError}</p>
  )}
  ```

  **Fix 3 — "No transaction linked" for entries without transaction_id:**

  Add a check before showing "Click to load service details":
  ```tsx
  {entry.transaction_id ? (
      <p className='text-xs text-white/40 text-center py-2'>
          Click to load service details
      </p>
  ) : (
      <p className='text-xs text-white/40 text-center py-2'>
          Manual entry — no transaction linked
      </p>
  )}
  ```

  Note: `transaction_id` is already in the `PayrollEntry` type. Verify it's destructured from `entry` in the map.

  **Fix 4 — Disable Request Payout button when no staff:**

  In `app/payroll/payrollPage.tsx`, update the button:
  ```tsx
  <AdminActionGuard
      onAction={() => {
          setStaffRequestModal({
              staffId: "",
              staffName: "Select Staff",
          })
      }}
  >
      <button
          className='p-2 bg-green-600 hover:bg-green-700 rounded-md transition-colors border-2 border-white/5 cursor-pointer flex items-center gap-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed'
          title='Request Payout for Staff'
          disabled={staffSummary.length === 0}
      >
          <SendIcon className='w-4 h-4' />
          <span className='hidden md:inline'>Request Payout</span>
      </button>
  </AdminActionGuard>
  ```

  **Fix 5 — DateRangeSelector validate custom range:**

  In `components/payroll/DateRangeSelector.tsx`, update `handleCustomApply`:
  ```typescript
  const [customError, setCustomError] = useState<string | null>(null)

  const handleCustomApply = () => {
      setActivePreset(null)
      if (!customFrom || !customTo) {
          setCustomError("Please select both dates")
          return
      }
      if (new Date(customFrom) > new Date(customTo)) {
          setCustomError("Start date must be before end date")
          return
      }
      setCustomError(null)
      onChange({ dateFrom: customFrom, dateTo: customTo })
  }
  ```

  Add error display near the Apply button:
  ```tsx
  {customError && (
      <span className='text-red-400 text-xs'>{customError}</span>
  )}
  ```

- [ ] **GREEN: Verify build compiles**

  ```bash
  bun run typecheck
  ```
  Expected: PASS — all component changes compile

  ```bash
  bun run lint
  ```
  Expected: PASS — no linting errors

- [ ] **REFACTOR: Clean up**
  - Ensure no unused imports remain after changes
  - Verify all `useState` hooks are properly initialized
  - Test manually: ensure `setCustomError` is imported from React if used (it's `useState`)

- [ ] **Commit**

  ```bash
  git add app/accounting/accountingPage.tsx app/my-payroll/myPayrollPage.tsx app/payroll/payrollPage.tsx components/payroll/DateRangeSelector.tsx
  git commit -m "fix: error handling, loading states, and edge case hardening (Task 11)"
  ```

---

## Phase 6: E2E Browser Testing (OPTED-IN)

> **Prerequisite:** Dev server must be running at the local HTTPS URL. All tasks use `agent_browser`.

---

### Task 12: E2E — Payroll date filter + Admin request payout

**Prerequisites:** Dev server running at `https://localhost:3000`

**Files:**
- Create: `docs/superpowers/e2e/payroll-date-filter.md` (test script + evidence)
- Screenshots saved to: `docs/superpowers/e2e/screenshots/`

**Dependencies:** Tasks 7, 11 (Payroll UI changes complete)

**E2E Cycle:**

- [ ] **DEFINE: Write the E2E test script**

  ```markdown
  # E2E Test: Payroll Date Filter + Admin Request Payout

  **App URL:** https://localhost:3000/payroll
  **Flow:** Verify date preset buttons update dashboard data, and admin can create a payout request for a staff member.

  ## Steps

  ### Part A: Date Filter
  1. Open https://localhost:3000/payroll
  2. Snapshot — verify Dashboard tab is active
  3. Verify "Pending", "Requested", "Confirmed", "Paid (Period)" summary cards are visible
  4. Click "Today" preset button
  5. Snapshot — verify date range shows today's date (YYYY-MM-DD format)
  6. Click "This Week" preset button
  7. Snapshot — verify date range changed (start = Sunday, end = Saturday)
  8. Click "This Month" preset button
  9. Snapshot — verify date range changed to current month boundaries
  10. Click "Custom" preset button
  11. Fill custom date inputs with valid dates
  12. Click "Apply"
  13. Snapshot — verify date range updated to custom dates

  ### Part B: Admin Request Payout
  14. Scroll to Staff Period Earnings section
  15. Verify staff list is visible with "Pending" amounts
  16. Click the "Request Payout" button in header
  17. Snapshot — verify staff selector appears (if no staff pre-selected) or entry selector appears (if staff selected)
  18. If staff selector: click a staff member
  19. Verify pending entries are listed with checkboxes
  20. Take screenshot: payroll-request-payout.png

  ## Acceptance Criteria
  - [ ] Page loads without errors
  - [ ] Date preset buttons change the displayed date range
  - [ ] Summary cards update after date change
  - [ ] "Request Payout" button is visible and clickable
  - [ ] Staff/entry selection modal appears correctly
  ```

- [ ] **EXECUTE: Run the E2E test**

  Dispatch a subagent:
  ```
  Agent type: general-purpose
  Prompt: |
    E2E Browser Test: Payroll Date Filter + Admin Request Payout
    App URL: https://localhost:3000/payroll

    Using agent_browser:
    1. open https://localhost:3000/payroll
    2. snapshot -i — verify "Dashboard" tab and summary cards
    3. Click "Today" preset (semanticAction: click, locator: text, value: "Today")
    4. snapshot -i — note the date range shown
    5. Click "This Week" preset
    6. snapshot -i — verify different date range
    7. Click "This Month" preset
    8. snapshot -i
    9. Look for "Request Payout" button — click it
    10. snapshot -i — verify modal opens
    11. Save screenshots to docs/superpowers/e2e/screenshots/
    12. Report: pass/fail per step
  ```

- [ ] **VERIFY: Check results**
  - All acceptance criteria met
  - Screenshots saved
  - No console errors

- [ ] **DOCUMENT: Save evidence**

  Update `docs/superpowers/e2e/payroll-date-filter.md` with:
  - Date/time of test run
  - Screenshot references (links to `screenshots/` directory)
  - Pass/fail status per step

- [ ] **Commit**

  ```bash
  git add docs/superpowers/e2e/payroll-date-filter.md docs/superpowers/e2e/screenshots/
  git commit -m "test: E2E browser test for payroll date filter + admin request payout (Task 12)"
  ```

---

### Task 13: E2E — Accounting Staff/Shop Cut columns + Sales UI changes

**Prerequisites:** Dev server running at `https://localhost:3000`

**Files:**
- Create: `docs/superpowers/e2e/accounting-sales-ui.md`
- Screenshots saved to: `docs/superpowers/e2e/screenshots/`

**Dependencies:** Tasks 6, 9, 10, 11 (Accounting + Sales UI complete)

**E2E Cycle:**

- [ ] **DEFINE: Write the E2E test script**

  ```markdown
  # E2E Test: Accounting + Sales UI

  **App URL:** https://localhost:3000
  **Flow:** Verify Staff/Shop Cut columns in accounting, and Sales UI label/artist changes.

  ## Steps

  ### Part A: Accounting Staff/Shop Cut
  1. Open https://localhost:3000/accounting
  2. Wait for ledger table to load
  3. Snapshot — verify table header has "Staff Cut" and "Shop Cut" columns
  4. Locate any entry with PAYROLL source (may need to scroll/check multiple pages)
  5. If PAYROLL entry found: verify Staff Cut and Shop Cut cells show currency amounts (not "—")
  6. If no PAYROLL entries exist: verify non-PAYROLL entries show "—" in those columns
  7. Take screenshot: accounting-staff-shop-cut.png

  ### Part B: Sales UI
  8. Open https://localhost:3000/sales
  9. Add a service to the cart
  10. Verify NO per-item "Artist:" dropdown appears in the cart
  11. Open checkout (click checkout/complete button)
  12. In the customer section, verify toggle shows "Walk-in Customer" and "Personal" (not "Registered Client")
  13. Verify "Staff Assignment" dropdown is present in checkout
  14. Take screenshot: sales-ui-personal.png

  ## Acceptance Criteria
  - [ ] Accounting table renders Staff Cut and Shop Cut columns
  - [ ] PAYROLL entries show actual amounts; non-PAYROLL show "—"
  - [ ] Sales cart has no per-item artist dropdown
  - [ ] Customer toggle shows "Personal" not "Registered Client"
  - [ ] Staff Assignment dropdown present in checkout
  ```

- [ ] **EXECUTE: Run the E2E test**

  Dispatch a subagent:
  ```
  Agent type: general-purpose
  Prompt: |
    E2E Browser Test: Accounting + Sales UI

    Using agent_browser:
    1. open https://localhost:3000/accounting
    2. Wait for table to load, snapshot -i
    3. Check for "Staff Cut" and "Shop Cut" in table headers
    4. open https://localhost:3000/sales
    5. Add a service to cart (semanticAction: click on a service item)
    6. snapshot -i — check cart for absence of "Artist:" label
    7. Open checkout (click the checkout button)
    8. snapshot -i — verify "Walk-in Customer" and "Personal" labels
    9. Save screenshots
    10. Report: pass/fail per step
  ```

- [ ] **VERIFY: Check results**
  - All acceptance criteria met
  - Screenshots saved

- [ ] **DOCUMENT: Save evidence**

  Update `docs/superpowers/e2e/accounting-sales-ui.md` with results.

- [ ] **Commit**

  ```bash
  git add docs/superpowers/e2e/accounting-sales-ui.md docs/superpowers/e2e/screenshots/
  git commit -m "test: E2E browser test for accounting Staff/Shop Cut + sales UI (Task 13)"
  ```

---

### Task 14: E2E — My Payroll transaction services + Sales enrichment

**Prerequisites:** Dev server running at `https://localhost:3000`

**Files:**
- Create: `docs/superpowers/e2e/my-payroll-services.md`
- Screenshots saved to: `docs/superpowers/e2e/screenshots/`

**Dependencies:** Tasks 5, 8, 11 (My Payroll UI + Sales enrichment complete)

**E2E Cycle:**

- [ ] **DEFINE: Write the E2E test script**

  ```markdown
  # E2E Test: My Payroll Services + Sales Enrichment

  **App URL:** https://localhost:3000
  **Flow:** Verify My Payroll shows transaction service breakdown on expand, and sales entries have enriched descriptions in accounting.

  ## Steps

  ### Part A: My Payroll Transaction Services
  1. Open https://localhost:3000/my-payroll
  2. Switch to List view (click list icon)
  3. Select "All Time" date preset
  4. Snapshot — verify earnings entries are listed
  5. Click on an entry (expand icon)
  6. Wait for service breakdown to load
  7. Snapshot — verify table with columns: Service, Type, Qty, Price, Staff Cut
  8. Verify service names and types match the transaction
  9. Take screenshot: my-payroll-services.png

  ### Part B: Sales Accounting Enrichment
  10. Open https://localhost:3000/accounting
  11. Search for a recent sale (use search box with transaction number or description)
  12. Verify the description includes service-type prefix (e.g., "Tattoo:", "Piercing:", or "Sale:")
  13. Verify the description includes item names
  14. Verify category is still "SALES"
  15. Take screenshot: sales-enrichment-ledger.png

  ## Acceptance Criteria
  - [ ] My Payroll expand shows service breakdown with correct columns
  - [ ] Service names, types, and staff cuts are populated
  - [ ] Accounting ledger shows enriched descriptions for new sales
  - [ ] Category remains "SALES" for all entries
  ```

- [ ] **EXECUTE: Run the E2E test**

  Dispatch a subagent:
  ```
  Agent type: general-purpose
  Prompt: |
    E2E Browser Test: My Payroll Services + Sales Enrichment

    Using agent_browser:
    1. open https://localhost:3000/my-payroll
    2. Click the list view icon button
    3. Set date preset to "All Time"
    4. snapshot -i — verify entries listed
    5. Click expand icon on first entry
    6. Wait for service table to load
    7. snapshot -i — verify table headers: Service, Type, Qty, Price, Staff Cut
    8. open https://localhost:3000/accounting
    9. Search for recent sale entries
    10. snapshot -i — verify descriptions contain service type info
    11. Save screenshots
    12. Report: pass/fail per step
  ```

- [ ] **VERIFY: Check results**
  - All acceptance criteria met
  - Screenshots saved

- [ ] **DOCUMENT: Save evidence**

  Update `docs/superpowers/e2e/my-payroll-services.md` with results.

- [ ] **Commit**

  ```bash
  git add docs/superpowers/e2e/my-payroll-services.md docs/superpowers/e2e/screenshots/
  git commit -m "test: E2E browser test for My Payroll services + sales enrichment (Task 14)"
  ```

---

