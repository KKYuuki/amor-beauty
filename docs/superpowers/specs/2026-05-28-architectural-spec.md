# Architectural Specification: Payroll & Accounting Fixes

## 1. Executive Summary

This spec addresses seven interconnected issues across the Payroll, Accounting and Sales modules of Inksight RDMD: (1) fixing the broken date/period filtering on the admin Payroll Dashboard, (2) enabling users to view transaction-level service breakdowns per earnings entry from My Payroll, (3) adding a dedicated entry point for admins to create payout requests on behalf of staff, (4) populating the Staff Cut and Shop Cut columns in the Accounting ledger with actual data for PAYROLL-sourced entries, (5) enriching Sales accounting entries to use service-type-specific descriptions, (6) renaming the "Registered Client" label to "Personal" in the sales checkout UI, and (7) removing the redundant per-item artist dropdown from the cart panel (artist assignment is already handled by the Staff Assignment section in checkout). Each change follows existing architectural patterns (server actions, client components, Drizzle ORM) and maintains backward compatibility with historical data.

## 2. Constraints & Non-Negotiables

### Security Requirements
- **Payroll management** requires `canManagePayroll` flag (server-side check on every server action)
- **Accounting access** requires `canAccessAccounting` flag
- **Payroll view** (My Payroll) is restricted to staff roles (`canViewOwnPayroll`)
- **Transaction-level data** in My Payroll must be filtered to the current user's entries only — no cross-staff data exposure
- **Admin request-on-behalf** must verify that selected entries belong to the target staff member (existing `createPayrollRequest` already does this via `eq(payrollEntry.staffId, staff_id)`)

### Performance Budgets
- Payroll dashboard summary queries (4 concurrent aggregate queries) must complete within 2 seconds for month-range queries
- Accounting ledger page load with PAYROLL entry join must not exceed 2x the current load time
- Transaction creation latency increase due to enriched accounting entries must be < 50ms

### Compliance Requirements
- All payroll entry and request records must maintain their audit trail (`created_by`, `created_at`, `updated_by`, `updated_at`)
- Accounting trial balance must remain verifiable — enriched descriptions and categories must not break existing report aggregations
- Historical accounting entries (with `category = 'SALES'`) must remain unchanged

### Technology Constraints
- Must use existing server action pattern (`'use server'` + `ActionResponse`)
- Must use Drizzle ORM for all database queries
- Must use existing permission system (`utils/auth/permissions.ts`)
- Must NOT modify the `general_ledger` database schema (no new columns)
- Must NOT modify `payroll_entry` or `transactions` schemas

## 3. System Boundaries

### IN Scope
| Scope | Description |
|-------|-------------|
| Payroll Dashboard date filter | Debug and fix the DateRangeSelector / fetchData chain on `/payroll` tab "Dashboard" |
| Accounting Staff/Shop Cut columns | Show `staff_cut`/`shop_cut` for entries where `source_type = 'PAYROLL'` using a LEFT JOIN to `payroll_entry` |
| My Payroll transaction-level details | Add expandable section in My Payroll earnings list showing transaction items with service name, type, price, and staff cut |
| Admin request-on-behalf entry point | Add a dedicated button or UI path in the admin Payroll page to open the existing `StaffRequestModal` for any staff member (not just from the expanded earnings row) |
| Sales accounting enrichment | Modify `createTransaction` to derive enriched descriptions (with service-type information and item names) for auto-created ledger entries |
| Sales UI: "Registered Client" → "Personal" | Rename the "Registered Client" button label to "Personal" in `components/sales/checkout/CustomerSelection.tsx` |
| Sales UI: Remove per-item artist selector | Remove the per-service-item artist `<select>` dropdown from `components/sales/layout/CartPanel.tsx`. All items inherit the artist from the "Staff Assignment" in the checkout modal |

### OUT OF Scope
- Modifying the `general_ledger` database schema (no new columns)
- Rewriting the accounting reports or trial balance logic
- Changing the My Payroll calendar view's date navigation
- Modifying the downpayment or scheduled payment modules
- Adding new export formats or fields
- Changing the permissions model or role definitions
- Changing the `client_type` field semantics in the database (only UI labels change)
- Refactoring the `getPayrollDashboardSummary` mixed-date queries (pending→serviceDate vs requestedAt/completedAt — documented but deferred)

### Integration Surfaces
| Surface | Direction | Affected By |
|---------|-----------|-------------|
| Payroll server actions (`server/actions/payroll.ts`) | Read/Write | Date filter fix, View entries, Request-on-behalf |
| Accounting server actions (`server/actions/accounting.ts`) | Read/Write | Staff/Shop Cut columns, Sales enrichment |
| Transactions server actions (`server/actions/transactions.ts`) | Write | Sales enrichment (description) |
| Sales server actions (`server/actions/sales.ts`) | Write | Sales enrichment (description for appointment-created sales) |
| General Ledger table (`general_ledger`) | Read | Staff/Shop Cut columns (join target) |
| Payroll Entry table (`payroll_entry`) | Read | Staff/Shop Cut columns (join source), View entries |
| Transaction Items table (`transaction_items`) | Read | View entries (service breakdown) |
| Services table (`services`) | Read | View entries (service type), Sales enrichment |
| Ledger Entry type (`utils/types/ledger.ts`) | Type definition | Added optional `staff_cut`/`shop_cut` fields |
| Payroll Entry type (`utils/types/payroll.ts`) | Type definition | Added `transaction_items` field |
| Sales CustomerSelection (`components/sales/checkout/CustomerSelection.tsx`) | UI | Rename "Registered Client" → "Personal" |
| Sales CartPanel (`components/sales/layout/CartPanel.tsx`) | UI | Remove per-item artist `<select>` dropdown |
| Sales Context (`components/sales/context/SalesContext.tsx`) | State | Remove `updateArtistForItem` (no longer needed) |

## 4. Component Architecture

### 4.1 Payroll Date Filtering — Investigation & Fix

**Root Cause Investigation Required:**
The data flow chain is:
```
DateRangeSelector (internal state)
  → onChange({dateFrom, dateTo})
  → Parent setDashboardDateRange
  → fetchData recreated (dep: dashboardDateRange)
  → useEffect fires fetchData()
  → getPayrollDashboardSummary(branchId, dateFrom, dateTo)
```

Expected: chain works. Actual: data doesn't update.

**Hypotheses to test in order:**
1. **Date string mismatch:** `getDateRangeFromPreset` returns dates in UTC via `toISOString()` but server uses local time parsing via `new Date(dateFrom)`. The `effectiveDateTo.setHours(23,59,59,999)` is done on the server side after parsing, but the parsed date already reflects UTC offset. Could cause entries near midnight to be excluded.
2. **Stale closure in useEffect:** `fetchData` is recreated on each `dashboardDateRange` change, but if `fetchData` is passed as a dependency and the component renders twice (React 19 strict mode), the second effect might use a stale reference.
3. **Missing dependency:** `dashboardDateRange` IS in the deps array of `fetchData`, but `refreshRateLevels` is also in the deps and might be unstable.
4. **DateRangeSelector internal state drift:** The `value` prop updates but internal `useState` doesn't re-sync, causing the visual preset highlight to be out of sync with actual data.

**Fix approach:**
- If hypothesis 1: Ensure server-side date parsing accounts for timezone by using UTC date methods consistently
- If hypothesis 2: Use a ref for the latest fetchData, or add a separate `useEffect` that watches `dashboardDateRange` directly
- If hypothesis 4: Add a `useEffect` in DateRangeSelector to sync internal state with `value` prop

**No new components needed.** Change limited to existing files.

### 4.2 Accounting Staff Cut / Shop Cut Columns

**New/Modified Components:**

**`LedgerEntry` type (`utils/types/ledger.ts`):**
- Add optional fields:
  ```typescript
  staff_cut?: number    // Present only when source_type === 'PAYROLL'
  shop_cut?: number     // Present only when source_type === 'PAYROLL'
  ```

**`getLedgerEntries` server action (`server/actions/accounting.ts`):**
- After fetching from `general_ledger`, filter entries with `source_type === 'PAYROLL'`
- LEFT JOIN to `payroll_entry` on `general_ledger.source_id = payroll_entry.id`
- Map `staff_cut` and `shop_cut` to the `LedgerEntry` objects
- If a payroll entry is not found (deleted), show `0` for both cuts

**`AccountingPageClient` (`app/accounting/accountingPage.tsx`):**
- Replace the hardcoded `" — "` cells with:
  ```tsx
  // Staff Cut
  {entry.staff_cut !== undefined
    ? `${currencySymbol}${entry.staff_cut.toFixed(2)}`
    : <span className='text-white/30'>—</span>}

  // Shop Cut
  {entry.shop_cut !== undefined
    ? `${currencySymbol}${entry.shop_cut.toFixed(2)}`
    : <span className='text-white/30'>—</span>}
  ```

**Communication pattern:** Synchronous read via server action. No new modals or client state.

### 4.3 My Payroll — Transaction Service Breakdown

**New Types (`utils/types/payroll.ts`):**
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

Extend `PayrollEntry` with optional field:
```typescript
transaction_items?: PayrollEntryTransactionItem[]
```

**New Server Action (`server/actions/payroll.ts`):**
```typescript
export async function getPayrollEntryTransactionItems(
    entryId: string
): Promise<ActionResponse<PayrollEntryTransactionItem[]>>
```

Logic:
1. Fetch `payroll_entry` by ID → get `transaction_id` and `staff_cut`/`shop_cut`/`gross_amount`
2. Fetch `transaction_items` for that `transaction_id`
3. For items with `service_id`, fetch `services` to get `service_type`
4. Calculate proportional cut per item: `item.staff_cut = (item.line_total / transaction.gross_amount) * entry.staff_cut`
5. Return enriched items

**UI in My Payroll (`app/my-payroll/myPayrollPage.tsx`):**
- Each earnings entry in list view gets an expandable chevron (like `StaffEarningsRow` in admin)
- On expand, calls `getPayrollEntryTransactionItems(entryId)` and shows a service breakdown table:
  - Service name | Type | Qty | Price | Staff Cut
- Calendar view entries also get expandable treatment

**Communication pattern:** Lazy-load on expand. Async server action call.

### 4.4 Admin Request-on-Behalf Entry Point

**New UI in admin Payroll Dashboard (`app/payroll/payrollPage.tsx`):**
- Add a "Request Payout" button to the dashboard tab header area (next to "Manual Entry")
- Button opens a staff selector modal → select staff → shows pending entries (same as `StaffRequestModal`)
- Reuses existing `StaffRequestModal` component

**No new server actions.** Reuses existing `getPendingEntries(staffId)` and `createPayrollRequest()`.

### 4.5 Sales Accounting Entry Enhancement

**Modified Transaction Creation (`server/actions/transactions.ts`):**

The three key `createAutoLedgerEntry` call sites in `createTransaction`:

1. **Single payment** (line ~302): Build description from items
2. **Split payments** (line ~235-281): Same, per payment method
3. **Appointment-created sales** (`server/actions/sales.ts` line ~155): Same treatment

**Category Derivation Logic (new utility function `deriveSalesCategoryAndDescription`):**

```typescript
function deriveSalesCategoryAndDescription(items: CreateTransactionItemPayload[], transactionNumber: string, salesDescription?: string, salesLabels?: {label: string}[]): { category: string; description: string }
```

Rules:
- Extract `service_type` from each item (present in `CreateTransactionItemPayload`)
- If ALL items have the same `service_type` (e.g., all `TATTOO`): category = `'SALES'` (unchanged)
- **BUT** if a single `service_type` is dominant AND it's not the generic `OTHER`: the description becomes `"{ServiceType}: {item_names} (TXN-{number})"`
- If MIXED types or NO service items: category = `'SALES'`, description = `"Sale: {item_name_1}, {item_name_2} (TXN-{number})"`
- If `sales_description` is provided by the user, use it with the item labels appended

**Critical Design Decision:** Keep `category = 'SALES'` for ALL accounting entries to maintain backward compatibility with reports. Use the `description` field to encode service-type information. This avoids breaking the ledger summary (`getLedgerSummary`) which groups by `category`. Adding sub-categories would require a coordinated update to the summary/report queries, which is out of scope.

**Alternative (if user prefers different):** Could use `source_type` differentiation or a new field. But per the constraints, no schema changes to `general_ledger`.

### 4.6 Sales UI: Label Rename & Artist Selector Removal

**Rename "Registered Client" → "Personal" (`components/sales/checkout/CustomerSelection.tsx`):**
- Change the button label from "Registered Client" to "Personal" at line 45
- The internal state variable name stays `customerMode: 'REGISTERED' | 'WALKIN'` since it controls the search/selection of registered user accounts. Only the display label changes.
- This makes the UI terminology consistent with the CheckoutModal's Client Type toggle, which already uses "Walk-in" / "Personal"

**Remove per-item artist selector (`components/sales/layout/CartPanel.tsx`):**
- Remove the `<select>` dropdown block at lines ~209-227 that shows "Artist:" per SERVICE-type cart item
- Remove the `updateArtistForItem` prop from `CartPanel` interface and its usage
- Remove `updateArtistForItem` from `SalesContext` — all items will inherit the `selectedStaffId` (global Staff Assignment)
- The transaction creation already handles this: `artist_id: item.artist_id` in the cart item mapping at line 907 of SalesContext.tsx will naturally fall through to `undefined`, and the `createTransaction` server action already uses the `staff_id` as the default artist when `artist_id` is not set

**Affected files:**
- `components/sales/checkout/CustomerSelection.tsx` — button label change only
- `components/sales/layout/CartPanel.tsx` — remove artist `<select>`, remove `updateArtistForItem` prop
- `components/sales/context/SalesContext.tsx` — remove `updateArtistForItem` function, remove `artist_id` from cart item type or leave it as optional (it will always be `undefined` after removal, and transaction creation falls back to `staff_id`)

## 5. Data Flow

### 5.1 Payroll Date Filter

```
[User clicks "Today"]
  → DateRangeSelector.handlePreset("today")
    → getDateRangeFromPreset("today")
      → returns { start: 2026-05-28 00:00:00, end: 2026-05-28 23:59:59 }
    → onChange({ dateFrom: "2026-05-28", dateTo: "2026-05-28" })
  → Parent: setDashboardDateRange({ dateFrom: "2026-05-28", dateTo: "2026-05-28" })
  → fetchData recreated (dashboardDateRange changed)
  → useEffect fires fetchData()
    → getPayrollDashboardSummary(branchId, "2026-05-28", "2026-05-28")
      → PENDING: WHERE serviceDate >= "2026-05-28 00:00:00" AND <= "2026-05-28 23:59:59"
      → REQUESTED: WHERE requestedAt >= ... (same range)
      → CONFIRMED: WHERE requestedAt >= ... (same range)
      → COMPLETED: WHERE completedAt >= ... (same range)
    → Returns 4 aggregate counts
  → setSummary(result), setStaffSummary(result)
  → UI re-renders with new data
```

### 5.2 Accounting Staff Cut (PAYROLL entries)

```
[User visits Accounting ledger]
  → getLedgerEntries({ filters, datePreset, page })
    → SELECT * FROM general_ledger WHERE is_voided = false ...
    → For each entry with source_type = 'PAYROLL':
      → LEFT JOIN payroll_entry ON general_ledger.source_id = payroll_entry.id
      → staff_cut = payroll_entry.staff_cut, shop_cut = payroll_entry.shop_cut
    → Return enriched entries
  → Table renders:
    → Staff Cut: shows value if defined, "—" otherwise
    → Shop Cut: shows value if defined, "—" otherwise
```

### 5.3 My Payroll Transaction Services

```
[User clicks expand on earnings entry]
  → getPayrollEntryTransactionItems(entryId)
    → Fetch payroll_entry (get transaction_id, staff_cut, gross_amount)
    → Fetch transaction_items WHERE transaction_id = ?
    → For items with service_id:
      → Fetch services (get service_type)
    → Compute proportional cut: (item.line_total / gross_amount) * staff_cut
    → Return transactions items
  → UI renders service breakdown table
```

### 5.4 Sales Accounting Entry

```
[User creates transaction with 2 tattoo services and 1 piercing service]
  → createTransaction({ items: [
      { service_type: 'TATTOO', item_name: 'Dragon' },
      { service_type: 'TATTOO', item_name: 'Tiger' },
      { service_type: 'PIERCING', item_name: 'Nose Stud' }
    ], ... })
  → deriveSalesCategoryAndDescription(items, txnNumber)
    → Types: TATTOO(2), PIERCING(1) → MIXED
    → category: 'SALES' (unchanged for mixed)
    → description: "Dragon, Tiger, Nose Stud (TXN-001)"
  → createAutoLedgerEntry('TRANSACTION', txnId, { category: 'SALES', description: '...' })
```

## 6. Security & Error Handling

### Authentication/Authorization Model

| Operation | Required Permission | Check Location |
|-----------|-------------------|----------------|
| View payroll dashboard | `canManagePayroll` | Route level + server action |
| View/request My Payroll | `canViewOwnPayroll` (staff role) | Route level |
| Create request on behalf | `canManagePayroll` | Server action |
| View accounting ledger | `canAccessAccounting` | Server action |
| Create transaction | `canAccessSales` | Server action |
| View transaction items in My Payroll | `canViewOwnPayroll` + owner check | Server action |

### Input Validation
- All date inputs: validated via `PayrollFilterSchema` (Zod)
- Transaction payloads: validated via `CreateTransactionPayload` schema
- Staff/Shop Cut data: read-only from `payroll_entry` (no user input)
- Request creation: `ProcessPayrollSchema` validates `entry_ids`, `staff_id`, dates

### Error Handling Philosophy
- **Server actions:** Return `ActionResponse<Success | Failure>` — never throw
- **Date filter errors:** If `getDateRangeFromPreset` returns null, silently fall back to "this month" (current behavior preserved)
- **Payroll entry not found for JOIN:** Show "—" instead of crashing
- **Transaction item fetch failure in My Payroll:** Show entry data without service breakdown (silent failure, log error)
- **Sales accounting entry creation failure:** Log error and continue — transaction is already created. Payroll entry creation is unaffected.

### Logging & Monitoring
- All failures logged via `createLogs()` or `logError()` with appropriate type (`PAYROLL`, `ACCOUNTING`)
- No new logging infrastructure needed

## 7. Migration & Rollback

### Database Migrations
- **No schema changes required** for any of the changes. All data needed already exists in the current schema.
- The `CreateTransactionItemPayload` already has `service_type` field — no migration needed
- The `payroll_entry` table already has `staff_cut`, `shop_cut`, `transaction_id` — no migration needed

### Backward Compatibility Guarantees
- **Sales accounting:** Historical entries remain with `category = 'SALES'`. New entries also use `category = 'SALES'`. The `description` field is the only thing that changes. No report breakage.
- **Accounting Staff/Shop Cut:** Historical entries show "—". New PAYROLL-sourced entries will show data. Non-PAYROLL entries continue to show "—".
- **Payroll date filter:** No backward compat issue — it's a bugfix, not a new feature.
- **My Payroll transaction services:** New expandable section — doesn't affect existing behavior.
- **Admin request-on-behalf:** New UI entry point — doesn't remove existing flow.

### Rollback Strategy
1. **Date filter fix:** Revert changes to any files identified in investigation. No data migration needed.
2. **Accounting columns:** Revert changes to `getLedgerEntries` and `accountingPage.tsx`. Columns revert to "—". No data loss.
3. **My Payroll services:** Revert changes to `myPayrollPage.tsx` and new server action. Expandable section disappears. No data loss.
4. **Sales enrichment:** Revert changes to `transactions.ts` and `sales.ts`. Future entries revert to `"Sale: TXN-001"` descriptions. Historical enriched entries remain unchanged — acceptable since they're still valid.
5. **Admin request-on-behalf:** Revert button/modal changes. Existing StaffRequestModal-based flow remains intact.

## 8. Testing Strategy

### Unit/Integration Tests
**TDD Mandatory** per project guidelines — every source file modified must have a corresponding test file with Red-Green-Refactor cycles.

| Component | Test Coverage |
|-----------|--------------|
| `getPayrollEntryTransactionItems` | Returns correct items; handles deleted transaction gracefully; returns empty for invalid entry ID; proportional cut calculation is correct |
| `deriveSalesCategoryAndDescription` | Single service type → proper description; mixed types → 'SALES' fallback; inventory-only → generic; user-authored salesDescription takes precedence |
| `getLedgerEntries` with PAYROLL join | PAYROLL entries return staff_cut/shop_cut; non-PAYROLL entries omit fields; missing payroll_entry shows "—" |
| `getPayrollDashboardSummary` date filter | Different date presets return correct filtered data; edge dates (midnight, month boundaries) handled correctly |
| `createPayrollRequest` (admin on behalf) | Admin creates request for staff — entries belong to staff; admin tries to claim other staff's entries — rejected |

### E2E Browser Testing (OPTED-IN)
Critical user flows to cover with E2E tests using `agent_browser`:

1. **Payroll Date Filter:**
   - Navigate to `/payroll`, Dashboard tab
   - Click "Today" — verify date range updates and summary cards reflect today's data
   - Click "This Week" — verify date range changes
   - Click "This Year" — verify date range changes
   - Click "Custom" — enter custom dates, click Apply — verify data updates

2. **Accounting Staff/Shop Cut Columns:**
   - Navigate to `/accounting`
   - Verify "Staff Cut" and "Shop Cut" columns exist in table header
   - Verify at least one PAYROLL-sourced entry shows amounts (not "—")
   - Verify non-PAYROLL entries show "—"

3. **My Payroll Transaction Services:**
   - Navigate to `/my-payroll`
   - Click expand on an entry
   - Verify service breakdown table appears with item names, types, cuts

4. **Admin Request Payout:**
   - Navigate to `/payroll`
   - Click "Request Payout" button
   - Select a staff member
   - Select entries and submit
   - Verify request appears in Requests tab

5. **Sales UI — Label + Artist Removal:**
   - Navigate to Sales page, open checkout
   - Verify the customer toggle shows "Walk-in Customer" and "Personal" (not "Registered Client")
   - Add a service to the cart
   - Verify NO per-item "Artist:" dropdown appears in the cart panel
   - Verify the "Staff Assignment" section in checkout modal still appears and works
   - Complete a transaction and verify the `artist_id` is set from `selectedStaffId`

6. **Sales Accounting Enrichment:**
   - Create a sale with known service types via `/sales`
   - Navigate to `/accounting`
   - Verify the new ledger entry has enriched description matching the service types
   - Verify category is still `SALES`

### Screenshots
E2E test scripts will save screenshots to `docs/superpowers/e2e/` for evidence.

## 9. Open Questions

### Deferred to Planning Phase
1. **Root cause of date filter bug** — The architectural analysis identified the theoretical data flow chain but couldn't reproduce the bug. The first task in the implementation plan must be a debugging step to identify root cause (hypotheses: timezone mismatch, stale closure, or DateRangeSelector state drift). The fix approach depends on the root cause.
2. **Proportional cut calculation** — For My Payroll transaction services, the proportional cut `(item.line_total / gross_amount) * entry.staff_cut` assumes even distribution based on price. If the actual calculation should be different (e.g., per-service rate application), this needs clarification during planning.
3. **Sales enrichment for appointment-created transactions** — The sales.ts `createTransactionFromAppointment` flow may construct items differently. Verify during planning that `service_type` propagates correctly through the appointment → transaction pipeline.
4. **Sales description for mixed-service transactions** — When a transaction has TATTOO, PIERCING, and SHOE items, the description should reflect all types. Exact format (comma-separated, type-grouped, etc.) to be decided in planning.
5. **E2E test environment setup** — Need to confirm test data seeding strategy for PAYROLL-sourced entries with actual `staff_cut`/`shop_cut` values to validate accounting columns.

### Intentionally Deferred (Out of Scope)
- Refactoring `getPayrollDashboardSummary` to use consistent date fields across all four metrics (pending→serviceDate vs. request dates)
- Adding service-type sub-categories to the accounting ledger summary/reports
- Redesigning the My Payroll calendar view's date navigation
- Adding export column changes for the new accounting data
