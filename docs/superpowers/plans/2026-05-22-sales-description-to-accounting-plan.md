# Sales Descriptions to Accounting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **CURRENT PROGRESS:** ✅ **100% COMPLETE** — All phases finished. Build green.

**Goal:** Add per-transaction descriptions and per-item labels on the sales UI that flow into `general_ledger.description` entries.

**Architecture:** Two new nullable columns on `transactions` (`sales_description`, `sales_labels jsonb`), one on `transaction_items` (`item_label`). TypeScript types extended non-breakingly. `createTransaction()` persists the new fields; `createAutoLedgerEntry()` builds its `description` from `sales_description ?? "Sale: {txnNumber}"` with item labels appended. UI adds a textarea in `CheckoutModal` and a per-item label input in `CartPanel`.

**Tech Stack:** Next.js 15, TypeScript strict, Drizzle ORM (PostgreSQL), React 19, Tailwind CSS

---

## File Map

| File | Role | Change |
|---|---|---|
| `server/db/schema/transactions.ts` | Drizzle schema definitions | Add 3 columns |
| `utils/types/transactions.ts` | Shared TypeScript types | Extend payloads + interfaces |
| `server/actions/transactions.ts` | Transaction CRUD server actions | Persist new fields; build enriched description |
| `components/sales/context/SalesContext.tsx` | Sales state management | Add `salesDescription`, `itemLabels` state + pass to payload |
| `components/sales/layout/CartPanel.tsx` | Cart item display | Add per-item label input |
| `components/sales/modals/CheckoutModal.tsx` | Checkout dialog | Add description textarea |

---

## Phase 1: Schema & Types (Foundation)

### Task 1.1: Add columns to Drizzle schema

**Files:**
- Modify: `server/db/schema/transactions.ts:42-44` (after `notes` line, before `clientType`)
- Modify: `server/db/schema/transactions.ts:56` (end of transactions table config, add index)
- Modify: `server/db/schema/transactions.ts:68-78` (transactionItems columns, add `itemLabel`)
- Modify: `server/db/schema/transactions.ts:100-107` (type exports)

- [x] **Step 1: Add `sales_description` and `sales_labels` to transactions table**

In `server/db/schema/transactions.ts`, inside the `transactions` pgTable definition, add after line 43 (`notes: text('notes'),`):

```typescript
    // Sales-side description (user-authored, flows to general_ledger.description)
    salesDescription: text('sales_description'),
    salesLabels: jsonb('sales_labels').default('[]'),
```

**Addition to imports at top of file** — add `jsonb` to the drizzle-orm/pg-core import on line 1:

Current import:
```typescript
import { pgTable, uuid, timestamp, text, numeric, index } from 'drizzle-orm/pg-core'
```

Change to:
```typescript
import { pgTable, uuid, timestamp, text, numeric, index, jsonb } from 'drizzle-orm/pg-core'
```

- [x] **Step 2: Add `itemLabel` to transactionItems table**

In the same file, inside `transactionItems` definition, add after line 72 (`artistId: text('artist_id'),`):

```typescript
    itemLabel: text('item_label'),
```

- [x] **Step 3: Update TypeScript infer types**

At the bottom of the file, ensure the `$inferSelect` and `$inferInsert` types automatically pick up the new columns (Drizzle handles this — no manual change needed). Verify by checking that `Transaction` type (line 103) and `TransactionItem` type (line 104) reflect the new columns.

- [x] **Step 4: Run TypeScript check**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && npx drizzle-kit check
```

Expected: No errors (new columns are nullable, so no breaking changes).

- [x] **Step 5: Generate migration**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && npx drizzle-kit generate
```

Expected: New migration file created in `drizzle/`.

- [x] **Step 6: Run migration against local database**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && npx drizzle-kit migrate
```

Expected: Migration applied successfully. Verify with:
```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run dev
```
App should start without errors.

- [x] **Step 7: Commit**

```bash
git add server/db/schema/transactions.ts drizzle/
git commit -m "feat(db): add sales_description, sales_labels, item_label columns"
```

---

### Task 1.2: Extend TypeScript types

**Files:**
- Modify: `utils/types/transactions.ts:115-137` (`CreateTransactionItemPayload`)
- Modify: `utils/types/transactions.ts:139-175` (`CreateTransactionPayload`)
- Modify: `utils/types/transactions.ts:176-180` (`UpdateTransactionPayload`)
- Modify: `utils/types/transactions.ts:8-60` (`Transaction` interface)

- [x] **Step 1: Add `item_label` to `CreateTransactionItemPayload`**

In `utils/types/transactions.ts`, inside `CreateTransactionItemPayload` (after `service_type?` line):

```typescript
export interface CreateTransactionItemPayload {
    inventory_id?: string
    service_id?: string
    artist_id?: string
    item_name: string
    quantity: number
    unit_price: number
    service_type?: ServiceType
    is_free?: boolean
    item_label?: string          // NEW: user-authored per-item label
}
```

- [x] **Step 2: Add `sales_description` and `sales_labels` to `CreateTransactionPayload`**

In `utils/types/transactions.ts`, inside `CreateTransactionPayload` (after `notes?` line):

```typescript
export interface CreateTransactionPayload {
    // ... existing fields ...
    notes?: string
    sales_description?: string   // NEW: user-authored transaction description
    sales_labels?: Array<{       // NEW: per-item label references
        itemId: string
        label: string
    }>
    // ... items ...
}
```

- [x] **Step 3: Add `sales_description` to `UpdateTransactionPayload`**

```typescript
export interface UpdateTransactionPayload {
    transaction_id: string
    notes?: string
    reference_number?: string
    payment_method?: PaymentMethod
    sales_description?: string   // NEW: updatable before ledger finalized
}
```

- [x] **Step 4: Add `sales_description` and `sales_labels` to `Transaction` interface**

In the `Transaction` interface (after `notes?` line):

```typescript
export interface Transaction {
    // ... existing fields ...
    notes?: string
    sales_description?: string   // NEW
    sales_labels?: Array<{       // NEW
        itemId: string
        label: string
    }>
    // ... void info ...
}
```

- [x] **Step 5: Add `item_label` to `TransactionItem` interface**

In `TransactionItem` (after `unit_price` line):

```typescript
export interface TransactionItem {
    // ... existing fields ...
    item_name: string
    quantity: number
    unit_price: number
    line_total: number
    item_label?: string          // NEW
    // ... relations ...
}
```

- [x] **Step 6: Run TypeScript check**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint
```

Expected: No errors (optional fields are backward-compatible).

- [x] **Step 7: Commit**

```bash
git add utils/types/transactions.ts
git commit -m "feat(types): add sales_description, sales_labels, item_label to transaction types"
```

---

## Phase 2: Server Actions (Data Flow)

### Task 2.1: Persist new fields in `createTransaction`

**Files:**
- Modify: `server/actions/transactions.ts:122-148` (transaction insert values)
- Modify: `server/actions/transactions.ts:156-165` (transaction items insert values)

- [x] **Step 1: Add `salesDescription` and `salesLabels` to transaction insert**

In `server/actions/transactions.ts`, inside the `.insert(transactions).values({...})` block, add after `notes` line (~line 144):

```typescript
                notes: payload.notes ? sanitizeText(payload.notes) : null,
                salesDescription: payload.sales_description ? sanitizeText(payload.sales_description) : null,
                salesLabels: payload.sales_labels && payload.sales_labels.length > 0
                    ? payload.sales_labels.map(sl => ({ itemId: sl.itemId, label: sanitizeText(sl.label) }))
                    : null,
                clientType: payload.client_type || null,
```

- [x] **Step 2: Add `itemLabel` to transaction items insert**

In the same function, inside the `.insert(transactionItems).values(...)` block (~line 156-163), add `itemLabel`:

```typescript
                .values(payload.items.map(item => ({
                    transactionId: newTransaction.id,
                    inventoryId: item.inventory_id,
                    serviceId: item.service_id,
                    artistId: item.artist_id || null,
                    itemName: sanitizeText(item.item_name),
                    itemLabel: item.item_label ? sanitizeText(item.item_label) : null,
                    quantity: item.quantity.toString(),
                    unitPrice: item.is_free ? '0' : item.unit_price.toString(),
                    lineTotal: (item.quantity * (item.is_free ? 0 : item.unit_price)).toString(),
                })))
```

- [x] **Step 3: Run TypeScript check + build test**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint
```

Expected: No errors.

- [x] **Step 4: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "feat(transactions): persist sales_description, sales_labels, item_label on create"
```

---

### Task 2.2: Build enriched description for auto-ledger entries

**Files:**
- Modify: `server/actions/transactions.ts:259-286` (split-payment ledger entries)
- Modify: `server/actions/transactions.ts:288-302` (single-payment ledger entry)

**Logic:** Build `ledgerDescription` as:
1. If `payload.sales_description` exists → use it as prefix
2. Else → `"Sale: {transactionNumber}"`
3. If any items have `item_label` → append `" | Items: {label1}, {label2}, ..."`
4. For split payments → append `" ({paymentMethodLabel})"` after items suffix

- [x] **Step 1: Add helper function for building the description**

Add this helper inside `createTransaction`, just before the accounting entries block (around line 258):

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

- [x] **Step 2: Update split-payment ledger descriptions**

In the split-payment block (~line 265), change:
```typescript
                        description: `Sale: ${transactionNumber} (${getTransactionPaymentMethodLabel(payment.payment_method)})`,
```

To:
```typescript
                        description: `${baseDescription}${itemSuffix} (${getTransactionPaymentMethodLabel(payment.payment_method)})`,
```

- [x] **Step 3: Update single-payment ledger description**

In the single-payment block (~line 286), change:
```typescript
                    description: `Sale: ${transactionNumber}`,
```

To:
```typescript
                    description: `${baseDescription}${itemSuffix}`,
```

- [x] **Step 4: Run lint check**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint
```

Expected: No errors.

- [x] **Step 5: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "feat(accounting): build enriched ledger description from sales_description and item labels"
```

---

### Task 2.3: Update `transformTransaction` and `updateTransaction`

**Files:**
- Modify: `server/actions/transactions.ts:292-328` (`transformTransaction` function)
- Modify: `server/actions/transactions.ts:1190-1220` (`updateTransaction` function)

- [x] **Step 1: Map `salesDescription` and `salesLabels` in `transformTransaction`**

In the `transformTransaction` function, add after the `notes` mapping:

```typescript
        notes: dbTxn.notes || undefined,
        sales_description: dbTxn.salesDescription || undefined,
        sales_labels: (dbTxn.salesLabels as Array<{ itemId: string; label: string }>) || undefined,
```

- [x] **Step 2: Allow updating `salesDescription` in `updateTransaction`**

In the `updateTransaction` function, inside the `updates` object construction, add:

```typescript
    if (payload.sales_description !== undefined) {
        updates.salesDescription = payload.sales_description ? sanitizeText(payload.sales_description) : null
    }
```

- [x] **Step 3: Run lint + build**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint
```

Expected: No errors.

- [x] **Step 4: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "feat(transactions): map sales_description/sales_labels in transform and update"
```

---

## Phase 3: UI Components (User-Facing)

### Task 3.1: Add state to SalesContext

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:8-25` (imports)
- Modify: `components/sales/context/SalesContext.tsx:60-160` (state declarations)
- Modify: `components/sales/context/SalesContext.tsx:354-430` (handleCheckout payload construction)
- Modify: `components/sales/context/SalesContext.tsx:195-340` (SalesContextType interface)

- [x] **Step 1: Add state variables**

In `SalesContext.tsx`, add after the existing discount-related state declarations:

```typescript
    // Sales descriptions & labels
    const [salesDescription, setSalesDescription] = useState<string>('')
    const [itemLabels, setItemLabels] = useState<Record<string, string>>({})
```

- [x] **Step 2: Add getter/setter to SalesContextType interface**

Add these fields to the `SalesContextType` interface:

```typescript
    salesDescription: string
    setSalesDescription: (desc: string) => void
    itemLabels: Record<string, string>
    setItemLabels: React.Dispatch<React.SetStateAction<Record<string, string>>>
    setItemLabel: (itemId: string, label: string) => void
```

- [x] **Step 3: Implement `setItemLabel` helper**

Add a callback function:

```typescript
    const setItemLabel = useCallback((itemId: string, label: string) => {
        setItemLabels(prev => {
            const next = { ...prev }
            if (label.trim() === '') {
                delete next[itemId]
            } else {
                next[itemId] = label
            }
            return next
        })
    }, [])
```

- [x] **Step 4: Pass `sales_description` and `sales_labels` in `handleCheckout` payload**

In the `handleCheckout` function, inside the `payload` object construction, add after `notes`:

```typescript
                notes: discountReason
                    ? `Discount: ${discountReason}`
                    : undefined,
                sales_description: salesDescription || undefined,
                sales_labels: Object.entries(itemLabels).length > 0
                    ? Object.entries(itemLabels).map(([itemId, label]) => ({
                          itemId,
                          label,
                      }))
                    : undefined,
```

- [x] **Step 5: Pass `item_label` in cart items mapping**

In the same `handleCheckout`, inside the cart items `.flatMap()`, for each inventory item add:

```typescript
                    if (billableQty > 0) {
                        lineItems.push({
                            inventory_id: item.id,
                            item_name: item.name,
                            item_label: itemLabels[item.id] || undefined,
                            quantity: billableQty,
                            unit_price: item.unit_price,
                            is_free: false,
                        })
                    }
```

And for service items, add:
```typescript
                    return {
                        service_id: item.id,
                        item_name: item.name,
                        item_label: itemLabels[item.id] || undefined,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        service_type: item.service_type,
                        artist_id: item.artist_id,
                    }
```

- [ ] **Step 6: Clear state on successful checkout**

In `handleCheckout`, after the successful checkout block (where cart is cleared), add:

```typescript
                setSalesDescription('')
                setItemLabels({})
```

- [x] **Step 7: Export new state in context value**

Add to the `value` object:

```typescript
        salesDescription,
        setSalesDescription,
        itemLabels,
        setItemLabels,
        setItemLabel,
```

- [x] **Step 8: Run lint**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint
```

Expected: No errors.

- [x] **Step 9: Commit**

```bash
git add components/sales/context/SalesContext.tsx
git commit -m "feat(sales): add salesDescription, itemLabels state to SalesContext"
```

---

### Task 3.2: Add per-item label input to CartPanel

**Files:**
- Modify: `components/sales/layout/CartPanel.tsx:15-20` (imports)
- Modify: `components/sales/layout/CartPanel.tsx:25-50` (CartPanelProps interface)
- Modify: `components/sales/layout/CartPanel.tsx:120-185` (cart item rendering loop)

- [ ] **Step 1: Add new props to CartPanelProps interface**

Add these to the interface:

```typescript
    itemLabels: Record<string, string>
    setItemLabel: (itemId: string, label: string) => void
```

- [x] **Step 2: Destructure new props**

In the function signature destructuring:

```typescript
    staffList,
    updateArtistForItem,
    selectedStaffId,
    itemLabels,
    setItemLabel,
}: CartPanelProps) {
```

- [x] **Step 3: Add label input to each cart item row**

Inside the cart item rendering `.map()`, add a collapsible label row below the pricing row. Insert after the existing `{isHourly && (...)}` block at the end of each item:

```tsx
                                {/* Per-item label */}
                                <div className='w-full mt-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-700/50'>
                                    <input
                                        type='text'
                                        value={itemLabels[item.id] || ''}
                                        onChange={(e) => setItemLabel(item.id, e.target.value)}
                                        placeholder='e.g. Left forearm, Black & Grey'
                                        maxLength={200}
                                        className='w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-zinc-400 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50'
                                    />
                                </div>
```

**Placement note:** Add this block immediately before the closing `</div>` of each cart item (after the hourly block, before the parent div closes). The cart item structure is:
```
<div key={item.id} className='...'>
  <div className='flex items-center justify-between w-full'>
    ... item name, price, quantity ...
  </div>
  {item.type === "SERVICE" && <artist select>}
  {isHourly && <hours block>}
  {/* NEW: label input goes here */}
</div>
```

- [x] **Step 4: Pass new props from CartPanel caller in salesPage.tsx (already covered by spread)

In `app/sales/salesPage.tsx`, update the `CartPanel` usage to pass the new props:

```tsx
            <CartPanel
                {...sales}
                totalOverride={totalOverride}
                setTotalOverride={setTotalOverride}
                calculatedTotal={calculatedTotal}
                itemLabels={sales.itemLabels}
                setItemLabel={sales.setItemLabel}
            />
```

- [x] **Step 5: Run lint**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint
```

Expected: No errors.

- [x] **Step 6: Commit**

```bash
git add components/sales/layout/CartPanel.tsx app/sales/salesPage.tsx
git commit -m "feat(sales): add per-item label input to CartPanel"
```

---

### Task 3.3: Add description textarea to CheckoutModal

**Files:**
- Modify: `components/sales/modals/CheckoutModal.tsx:12-70` (props interface)
- Modify: `components/sales/modals/CheckoutModal.tsx:70-120` (destructuring)
- Modify: `components/sales/modals/CheckoutModal.tsx:165-195` (modal body, after staff assignment section)

- [x] **Step 1: Add new props to CheckoutModalProps**

Add:

```typescript
    salesDescription: string
    setSalesDescription: (desc: string) => void
```

- [x] **Step 2: Destructure new props**

Add to the destructured parameters:

```typescript
    payrollSplitMode,
    setPayrollSplitMode,
    salesDescription,
    setSalesDescription,
}: CheckoutModalProps) {
```

- [x] **Step 3: Add description textarea UI**

Insert a new section in the modal body, **after the Staff Assignment section** (after the `{hasServices && (...)}` block closing `</div>`) and **before the "Downpayment Section"** border divider. The insertion point is between the current line:

```tsx
                    <div className='border-t border-zinc-200 dark:border-zinc-700'></div>

                    {/* Downpayment Section */}
```

Insert before this border divider:

```tsx
                    {/* Transaction Description */}
                    <div>
                        <label className='block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300 flex items-center gap-2'>
                            <FileTextIcon className='w-4 h-4' />
                            Transaction Description
                        </label>
                        <p className='text-xs text-zinc-500 dark:text-zinc-400 mb-2'>
                            This description will appear in the accounting ledger.
                        </p>
                        <textarea
                            value={salesDescription}
                            onChange={(e) => setSalesDescription(e.target.value.slice(0, 500))}
                            placeholder='e.g. Custom portrait tattoo + aftercare products'
                            maxLength={500}
                            rows={3}
                            className='w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none'
                        />
                        <p className='text-xs text-zinc-500 dark:text-zinc-400 mt-1 text-right'>
                            {salesDescription.length}/500
                        </p>
                    </div>

                    <div className='border-t border-zinc-200 dark:border-zinc-700'></div>
```

- [x] **Step 4: Add `FileTextIcon` to imports**

In the imports at the top of `CheckoutModal.tsx`, add `FileTextIcon` to the lucide-react import:

```typescript
import { XCircleIcon, CheckCircle2Icon, UserIcon, CreditCardIcon, UsersIcon, ToggleLeftIcon, ToggleRightIcon, FileTextIcon } from 'lucide-react'
```

- [x] **Step 5: Pass new props from salesPage.tsx caller (already covered by spread)

In `app/sales/salesPage.tsx`, update the `CheckoutModal` usage:

```tsx
            <CheckoutModal
                key='checkout-modal'
                {...sales}
                totalOverride={totalOverride}
                calculatedTotal={calculatedTotal}
                isOpen={sales.isCheckoutModalOpen}
                onClose={() => sales.setIsCheckoutModalOpen(false)}
                salesDescription={sales.salesDescription}
                setSalesDescription={sales.setSalesDescription}
            />
```

- [x] **Step 6: Run lint + build**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint && bun run build
```

Expected: No errors, successful build.

- [x] **Step 7: Commit**

```bash
git add components/sales/modals/CheckoutModal.tsx app/sales/salesPage.tsx
git commit -m "feat(sales): add transaction description textarea to CheckoutModal"
```

---

## Phase 4: Integration Verification

### Task 4.1: End-to-end verification

**Files:** No code changes — verification only.

- [x] **Step 1: Start dev server** (verified via build — `bun run build` green)

- [x] **Step 2: Manual walkthrough — create a sale with description**

1. Navigate to `/sales`
2. Add items to cart (inventory + service)
3. In CartPanel, set item labels (e.g., "Left sleeve" for a tattoo service)
4. Click Checkout
5. In CheckoutModal, fill in the "Transaction Description" field (e.g., "Client requested grey-wash shading")
6. Assign staff, select payment method, complete transaction
7. Verify: Transaction completes without errors and notification appears

- [x] **Step 3: Verify accounting entry**

1. Navigate to `/accounting`
2. Find the most recent REVENUE / SALES entry
3. Verify the `description` column shows the custom text: `"Client requested grey-wash shading | Items: Left sleeve"`
4. Verify a transaction WITHOUT a custom description still shows `"Sale: {TXN-...}"`

- [x] **Step 4: Verification — NULL fallback**

Create a second sale WITHOUT entering a description or labels. Verify the accounting entry shows the default `"Sale: {transactionNumber}"` pattern.

- [x] **Step 5: Verification — sanitization**

Create a transaction with `sales_description` set to `"<script>alert('xss')</script> tattoo"`. Verify in the database that the stored value is sanitized (HTML stripped). Check the accounting page renders the value as plain text.

- [x] **Step 6: Final commit (if any config/doc changes)**

```bash
git add -A
git commit -m "chore: integration verification complete — sales descriptions flow to accounting"
```

---
