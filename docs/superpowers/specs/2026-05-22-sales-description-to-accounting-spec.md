# Architectural Spec: Sales-Led Descriptions for General Ledger

## 1. Objective

Enable sales-side operators to set **per-transaction descriptions and labels** that propagate into the `general_ledger.description` field, replacing the current auto-generated `"Sale: TXN-..."` text with human-readable, context-rich descriptions.

## 2. Source-of-Truth Constraints

### 2.1 Data Model Invariants

| Constraint | Rule |
|---|---|
| **Transaction-level description** | Each `transactions` row MUST accept an optional `sales_description` text column (max 500 chars). This is the canonical user-authored description. |
| **Per-item label** | Each `transaction_items` row MUST accept an optional `item_label` text column (max 200 chars). This is an alias/display label for the line item that CAN override `item_name` in ledgers. |
| **Default behavior** | If `sales_description` is NULL, the auto-generated `"Sale: {transactionNumber}"` MUST be used. This ensures zero migration cost for existing records. |
| **Immutability after finalization** | Once a `general_ledger` entry is created for a COMPLETED transaction, the description becomes immutable (audit trail). Edits to `sales_description` before completion MUST propagate; edits after completion MUST create a correcting entry, not an in-place update. |
| **Character limit** | `sales_description` truncated to 500 chars on write; `item_label` to 200 chars. Both sanitized via `sanitizeText`. |

### 2.2 Schema Changes

```sql
-- NEW columns (transactions)
ALTER TABLE transactions
  ADD COLUMN sales_description text,
  ADD COLUMN sales_labels jsonb DEFAULT '[]'::jsonb;
-- sales_labels shape: [{ itemId: uuid, label: string }]

-- NEW column (transaction_items)
ALTER TABLE transaction_items
  ADD COLUMN item_label text;
```

- `sales_labels` is a JSONB array of `{ itemId, label }` pairs, allowing labels to be set on a per-item basis without duplicating the label text into `transaction_items` for every item. The primary reference is `transaction_items.item_label`; `sales_labels` is a convenience snapshot.

### 2.3 TypeScript Types (Non-Breaking Extension)

```typescript
// transactions.ts — extended payloads
interface CreateTransactionPayload {
  // ... existing fields
  sales_description?: string        // NEW, optional
  sales_labels?: Array<{            // NEW, optional
    itemId: string
    label: string
  }>
}

interface Transaction {
  // ... existing fields
  sales_description?: string        // NEW
  sales_labels?: Array<{            // NEW
    itemId: string
    label: string
  }>
}
```

## 3. Architecture Boundaries

### 3.1 Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  SALES UI (CartPanel → CheckoutModal)                      │
│  - Per-item label input (inline in cart row)               │
│  - Per-transaction description textarea (checkout modal)   │
│  - sales_description + sales_labels in payload             │
└──────────┬──────────────────────────────────────────────────┘
           │ CreateTransactionPayload.sales_description
           │ CreateTransactionPayload.sales_labels
           ▼
┌─────────────────────────────────────────────────────────────┐
│  createTransaction()  (server/actions/transactions.ts)     │
│  - Writes sales_description to transactions table          │
│  - Writes item_label to each transaction_items row         │
│  - Writes sales_labels JSONB to transactions table         │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  createAutoLedgerEntry()  (server/actions/accounting.ts)   │
│  - description = sales_description ?? "Sale: {txnNumber}"  │
│  - Appends item labels as structured suffix when present:  │
│    "Custom desc | Items: Tattoo, Piercing, Aftercare"      │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  general_ledger table  (description column)                │
│  - Visible in accounting page, exports, PDF receipts       │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 UI Boundary

| Component | Change |
|---|---|
| `CartPanel.tsx` | Add per-item label input (collapsible, shows below item name). Not editable once committed (see 3.3). |
| `CheckoutModal.tsx` | Add "Transaction Description" textarea section (below staff assignment, above downpayment). Placeholder: `"e.g. Custom portrait tattoo + aftercare products"` |
| `SalesContext.tsx` | Add `salesDescription`, `setSalesDescription`, `itemLabels: Map<string, string>` state. |

### 3.3 Editability Boundary

- **Before checkout** (cart state): labels and description are fully editable.
- **After checkout** (transaction created): labels and description are locked. Editing requires `updateTransaction()` which ONLY updates non-accounting metadata. Changes to `sales_description` after `createAutoLedgerEntry` has run MUST NOT retroactively edit the ledger — they require a new correcting entry.
- **Voided transactions**: labels and description preserved for audit but rendered with strikethrough in UI.

## 4. Security Requirements

### 4.1 Input Sanitization

| Field | Sanitizer | Reason |
|---|---|---|
| `sales_description` | `sanitizeText` (strip HTML/script tags) | User-supplied free text entering database and displayed in ledger |
| `item_label` | `sanitizeText` (strip HTML/script tags) | Same as above |
| `sales_labels[*].label` | `sanitizeText` (strip HTML/script tags) | Same as above |

- `sanitizeMinimal` is **NOT** sufficient because labels are rendered as visible text in accounting reports.
- Maximum field lengths enforced at application layer (500 / 200 chars) AND at DB layer via `CHECK` constraint.

### 4.2 Authorization

- **Write access**: Only users with existing `canAccessTransactions()` permission can set `sales_description` / `item_label`. No new permission gates.
- **Read access**: Any user who can view a transaction (i.e., `canAccessTransactions()`) or view the general ledger can see descriptions. No new restrictions.
- **Server action** `updateTransaction()`: Already gates on authentication + `canAccessTransactions`. Adding `sales_description` to the updatable fields does NOT change the security boundary.

### 4.3 Injection Vectors

- Labels and descriptions enter the `general_ledger.description` column, which is rendered in the accounting UI and exported to XLSX/CSV/PDF. Existing `sanitizeText` handling in `export-engine` must be verified to protect against formula injection in CSV exports (leading `=`, `+`, `-`, `@` characters). This is already handled for other description fields; test coverage includes this new path.

## 5. Edge Cases

### 5.1 Existing Transactions

- All existing transactions have `sales_description = NULL` and `item_label = NULL`.
- The accounting entries they created already have static descriptions (`"Sale: TXN-..."`).
- **Decision**: No backfill. Existing entries are immutable. Users who want to add context to old entries must use the existing manual ledger entry edit feature in the accounting module.

### 5.2 Bulk/Batch Operations

- Transaction creation via `createTransactionFromAppointment()` (server/actions/sales.ts) currently sets `notes: "Created from appointment: {title}"`. This path WILL be extended to accept `sales_description` and `item_label` when called from the appointment-to-sales flow, but the default (NULL) gracefully falls back to the auto-generated description.

### 5.3 Voided and Refunded Transactions

- Void entries (`VOIDED_SALES` category) currently use description `"Voided: {transactionNumber}"`. This MUST remain unchanged — describing why a transaction was voided belongs in `void_reason`, not in the void's accounting description.
- Refund entries (`REFUNDS` category) similarly stay as `"Refund: {transactionNumber}"`.

### 5.4 Split Payments

- When `payment_method === 'SPLIT'`, multiple `createAutoLedgerEntry` calls are made — one per payment method. The `sales_description` is appended with `" ({paymentMethodLabel})"` for each split leg, consistent with the current behavior that adds `"(GCASH)"` suffixes.

### 5.5 Downpayment Transactions

- Downpayment entries use `"Downpayment received: {transactionNumber}"` and downpayment-settlement entries use `"Downpayment settled: {transactionNumber}"`. These SHOULD remain unchanged — downpayment accounting descriptions are structural, not configurable.
- When a downpayment transaction ALSO has a `sales_description`, the main `SALES` credit entry description uses it; the downpayment `LIABILITY` entry does NOT.

### 5.6 Internationalization / Multi-Byte

- `sanitizeText` uses `text` type columns in PostgreSQL, which support UTF-8 natively. No special handling needed.

### 5.7 Performance Impact

- No new indexes needed. `general_ledger.description` is not indexed and is not used as a filter.
- `sales_description` and `item_label` are text columns with a `CHECK` length constraint — negligible storage overhead.
- `sales_labels` JSONB column: indexed via GIN only if search-by-label is required later. Not indexing now.

## 6. Migration Strategy

### 6.1 Schema Migration

```sql
-- Phase 1: Add columns (non-breaking, nullable)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS sales_description text,
  ADD COLUMN IF NOT EXISTS sales_labels jsonb DEFAULT '[]'::jsonb;

ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS item_label text;

-- Phase 2: Add CHECK constraints after data verified
ALTER TABLE transactions
  ADD CONSTRAINT chk_sales_description_length
  CHECK (sales_description IS NULL OR length(sales_description) <= 500);
```

### 6.2 Rollback

- All columns are `NULLABLE` with defaults. Rollback = stop populating them. Existing data remains in the database but is inert. Columns can be dropped in a later cleanup migration.

## 7. Verification Criteria

1. **Sales → Accounting propagation**: A transaction created with a `sales_description` results in a `general_ledger` entry where `description` matches the user-authored text.
2. **NULL fallback**: A transaction created without a `sales_description` produces `"Sale: {transactionNumber}"` — identical to current behavior.
3. **Per-item labels appear in ledger description**: When items have `item_label` set, the ledger description includes the concatenated labels (or the primary label if only one).
4. **Sanitization**: Input containing `<script>` tags is safely rendered as text.
5. **Immutability**: Completed transaction descriptions do not change even if the server is restarted.
6. **Voided/refunded paths**: Void entries keep the `"Voided:"` prefix regardless of the original `sales_description`.
7. **No regressions**: Existing transactions without descriptions render exactly as before.

## 8. Non-Goals (Explicitly Out of Scope)

- Editing descriptions AFTER checkout (requires correcting entry flow — separate feature).
- Search/filter by description or label in the accounting page (no GIN index on JSONB).
- Labels on inventory items or services themselves (this is transaction-instance data only).
- Backfill of existing transaction descriptions.
- Multi-language / i18n support.
- Per-description color coding or categorization beyond what the label text provides.
