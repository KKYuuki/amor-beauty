# Accounting UX Improvements — Architectural Spec

**Date:** 2026-05-07
**Scope:** `app/accounting/`, `server/actions/accounting.ts`, `components/accounting/`
**Objectives:** Trash fixes, Payroll removal, Entry notification enrichment

---

## 1. Objective A: Trash — Fix Voided Entries Display + Add Hard Delete

### 1.1 Root Cause: Contradictory Query Filters

The `getLedgerEntries` function in `server/actions/accounting.ts` has a logic flaw when `voided_only: true` is passed. Two mutually exclusive conditions are appended to the query, producing zero results every time.

**Current code (lines ~174–181):**
```sql
-- When voided_only=true is passed, BOTH conditions activate:
WHERE isVoided = false   -- from `!include_voided` guard (include_voided is undefined, so truthy branch fires)
  AND isVoided = true    -- from `voided_only` guard
-- Result: empty set — no rows can satisfy both
```

**Fix:** The `voided_only` guard must supersede the default exclusionary guard. When requesting only voided entries, the default `isVoided = false` filter MUST NOT be appended.

### 1.2 Architectural Constraint: Query Filter Resolution Order

Modify `server/actions/accounting.ts` → `getLedgerEntries()`:

```
IF filters.voided_only:
    → append WHERE isVoided = true
    → SKIP the default !include_voided exclusion
ELSE IF !filters.include_voided:
    → append WHERE isVoided = false
```

No changes to the client-side call in `accountingPage.tsx` — it already passes `voided_only: true` correctly. Only the server-side filter assembly logic changes.

### 1.3 Hard Delete: Permanent Removal of Voided Entries

**Current state:** Only soft-delete (`voidLedgerEntry`) and restore (`restoreLedgerEntry`) exist. No permanent deletion.

**New server action:** `hardDeleteLedgerEntry(id: string): Promise<ActionResponse<void>>`

**Authorization gates (in order):**
1. User authenticated → `getCurrentUser()`
2. Role === `"admin"` → reject with `"Unauthorized: admin access required"`
3. `canAccessAccounting(user)` → reject with `"Access denied"`
4. Entry exists → select by `id`, reject `"Entry not found"`
5. Entry MUST be voided → reject `"Entry must be voided before permanent deletion"`
6. Accounting period lock → reject `"Cannot permanently delete: this accounting period is locked"`

**Post-persist side effects (same pattern as `voidLedgerEntry`):**
- Log the permanent deletion (level INFO, type ACCOUNTING)
- `revalidatePath('/accounting')`
- Invalidate all 9 cache keys: `financial_metrics`, `net_income`, `ledger_summary`, `revenue_trend`, `pl_metrics`, `expense_breakdown`, `revenue_expense_trend`, `business_insights`, `exec_accounting`

**Database operation:** `db.delete(generalLedger).where(eq(generalLedger.id, id))`

**Client-side (Trash tab):** Add a red "Delete Permanently" button next to the existing restore button. Requires a dedicated confirmation modal distinct from the void modal — it must clearly state the action is irreversible and show the entry description/date/amount for final verification.

### 1.4 Security Constraints — Hard Delete

| Constraint | Enforcement |
|---|---|
| Admin-only | Server-side role check; client-side `isAdmin` guard |
| Only voided entries | Server-side precondition check |
| Period lock respected | Server-side lock check before deletion |
| Irreversible action | Separate confirmation modal with explicit "Delete Permanently" CTA |
| Audit trail | Log entry created before deletion |
| No cascade | Hard delete removes only the ledger row; related source types (TRANSACTION, PAYROLL, INVENTORY) are unaffected |

---

## 2. Objective B: Remove Payroll Breakdown from Accounting Page

### 2.1 Rationale

Payroll Breakdown is now in its dedicated page (`/app/payroll/`). Displaying it again inside the Accounting → Reports tab is redundant and increases page complexity.

### 2.2 Removal Inventory

**State variables to delete (from `accountingPage.tsx`):**
- `showPayrollBreakdown`
- `payrollEntries`
- `payrollLoading`
- `payrollStaffFilter`
- `payrollServiceTypeFilter`
- The `fetchPayrollBreakdown` callback

**Imports to remove:**
- `import { getPayrollEntries } from "@/server/actions/payroll"`
- `import { PayrollEntry } from "@/utils/types/payroll"`

**JSX to remove:**
- The entire `Payroll Breakdown` collapsible section within the `activeTab === "reports"` block (~120 lines: the button, the filter bar, the table, the CSV export button)

### 2.3 Architectural Constraint

No database or server-side changes. Pure client-side cleanup. The `getPayrollEntries` action remains in the codebase (still used by the dedicated payroll page). Only remove the import and usage from the accounting page.

---

## 3. Objective C: Entry Notification — Show Date in Confirmation

### 3.1 Current Flow

After creating or editing an entry via `EntryModal`, the parent `accountingPage.tsx` fires:
```typescript
addNotification("Entry created successfully", "SUCCESS")
```
The message contains no identifying information about the entry.

### 3.2 Target Behavior

```
"Entry created — [description] on [formatted_date]"
"Entry updated — [description] on [formatted_date]"
```

### 3.3 Data Flow Change

**Interface change:** `EntryModal`'s `onSuccess` callback signature must carry entry details.

```
Current:  onSuccess: () => void
New:      onSuccess: (details: EntryNotificationDetails) => void
```

**New type (`components/accounting/EntryModal.tsx`):**
```typescript
interface EntryNotificationDetails {
    description: string
    date: Date
    isUpdate: boolean
}
```

**In `EntryModal.handleSubmit`:**
- For CREATE path: after `createLedgerEntry` succeeds, call `onSuccess({ description: formData.description, date: formData.entry_date, isUpdate: false })`
- For UPDATE path: after `updateLedgerEntry` succeeds, call `onSuccess({ description: formData.description, date: formData.entry_date, isUpdate: true })`

**In `accountingPage.tsx` — `onSuccess` handler:**
```typescript
addNotification(
    `${details.isUpdate ? "Entry updated" : "Entry created"} — ${details.description} on ${safeFormatDate(details.date)}`,
    "SUCCESS"
)
```

### 3.4 Edge Case: Long Descriptions

The notification component displays toast messages. Descriptions may be long. The notification payload should NOT truncate the description — the notification system handles display overflow. No architectural action needed.

### 3.5 Architectural Constraint

No server-side changes. The notification payload is assembled entirely from form state already available in the client at submission time. No additional API call is needed.

---

## 4. System Mapping Summary

| Component | File | Change Type | Risk |
|---|---|---|---|
| `getLedgerEntries` filter logic | `server/actions/accounting.ts` | Bug fix (1 condition) | Low — fixes a broken feature |
| `hardDeleteLedgerEntry` | `server/actions/accounting.ts` | New server action | Medium — destructive operation, requires careful auth gating |
| Hard delete button + modal | `app/accounting/accountingPage.tsx` | New UI | Low — follows existing modal pattern |
| Payroll removal | `app/accounting/accountingPage.tsx` | Deletion | None — removal of redundant code |
| `EntryModal` callback | `components/accounting/EntryModal.tsx` | Signature change | Low — single consumer, compile-time verification |
| Notification enrichment | `app/accounting/accountingPage.tsx` | String change | None — cosmetic |

## 5. Security Review

| Threat | Mitigation |
|---|---|
| Non-admin triggers hard delete | Server-side role gate + client-side `isAdmin` guard |
| Hard delete on non-voided entry | Server-side precondition: entry must be voided |
| Hard delete on locked period | Server-side period lock check |
| Hard delete of referenced entry | No cascade to source tables — only ledger row removed |
| Description injection in notification | Description is plain text rendered by the notification component; no HTML or markdown interpretation |

## 6. Testing Considerations

- **Trash display:** After fix, verify voided entries appear with correct date/void metadata
- **Hard delete:** Create entry → void → hard delete → verify entry gone + cache invalidated
- **Hard delete guard:** Attempt hard delete on non-voided entry → confirm rejection
- **Hard delete guard:** Attempt hard delete as non-admin → confirm 401
- **Payroll removal:** Verify Reports tab renders correctly without Payroll Breakdown section
- **Notification:** Create entry → verify toast shows description + formatted date
- **Notification:** Edit entry → verify toast says "updated" and shows description + date

## 7. Out of Scope

- Adding hard delete to inventory, payroll, or transaction sources
- Cascade deletion of related source records
- Bulk hard delete on Trash tab
- Adding entry_type or amount to the notification (date + description is sufficient for double-confirmation)
- Changing the notification system's display behavior