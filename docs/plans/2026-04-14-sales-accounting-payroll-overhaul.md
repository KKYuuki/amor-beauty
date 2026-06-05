# Sales, Accounting & Payroll Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix branch filtering, update payment methods, reorganize modals/tables, and ensure accounting schema consistency across Sales, Accounting, and Payroll modules.

**Architecture:** Cross-module changes spanning types, server actions, and UI components. Each module (Sales, Accounting, Payroll) is treated as an independent phase. A final phase fixes lint/build issues. All type changes are centralized in `utils/types/`; UI changes are in `components/` and `app/`; server action changes are in `server/actions/`.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Tailwind CSS 4, Drizzle ORM, Supabase/PostgreSQL

---

## Phase 1: Sales — Branch Filtering, Payment Methods & Checkout Modal

### Task 1.1: Rename PAYMAYA to BANK_TRANSFER in Transaction PaymentMethod type

**Files:**
- Modify: `utils/types/transactions.ts:6`
- Modify: `utils/types/transactions.ts:97-101` (SplitPayment)
- Modify: `utils/types/payment.ts:61-71` (mapper)
- Modify: `components/sales/checkout/PaymentMethodSelector.tsx:16-33`
- Modify: `components/sales/checkout/SplitPaymentBuilder.tsx` (if it references PAYMAYA)
- Modify: `components/sales/modals/AddPaymentModal.tsx` (if it references PAYMAYA)
- Modify: `components/sales/context/SalesContext.tsx` (state types referencing PaymentMethod)
- Modify: `server/actions/transactions.ts` (any PAYMAYA references)

**Step 1: Update the PaymentMethod type**

In `utils/types/transactions.ts`, change line 6:

```typescript
// Before:
export type PaymentMethod = 'CASH' | 'CARD' | 'GCASH' | 'PAYMAYA' | 'SPLIT'

// After:
export type PaymentMethod = 'CASH' | 'CARD' | 'GCASH' | 'BANK_TRANSFER' | 'SPLIT'
```

Also update the `SplitPayment` type on line 98:

```typescript
// Before:
payment_method: 'CASH' | 'CARD' | 'GCASH' | 'PAYMAYA'

// After:
payment_method: 'CASH' | 'CARD' | 'GCASH' | 'BANK_TRANSFER'
```

Update the comment on line 132:

```typescript
// Before:
reference_number?: string // For non-cash transactions (GCash, Card, PayMaya)

// After:
reference_number?: string // For non-cash transactions (GCash, Card, Bank Transfer)
```

**Step 2: Update the payment method mapper**

In `utils/types/payment.ts`, change line 67:

```typescript
// Before:
case 'PAYMAYA': return 'CARD' // Maya/PayMaya cards map to CARD

// After:
case 'BANK_TRANSFER': return 'BANK_TRANSFER' // Bank Transfer / QR

// Remove the old PAYMAYA case entirely
```

**Step 3: Update the PaymentMethodSelector UI**

In `components/sales/checkout/PaymentMethodSelector.tsx`, update the methods array (lines 27-33):

```typescript
// Before:
const methods = [
    { id: 'CASH' as const, icon: WalletIcon, label: 'Cash' },
    { id: 'CARD' as const, icon: CreditCardIcon, label: 'Card' },
    { id: 'GCASH' as const, icon: SmartphoneIcon, label: 'GCash' },
    { id: 'PAYMAYA' as const, icon: SmartphoneIcon, label: 'PayMaya' },
    { id: 'SPLIT' as const, icon: CircleDollarSignIcon, label: 'Split' },
]

// After:
import { LandmarkIcon } from 'lucide-react'

const methods = [
    { id: 'CASH' as const, icon: WalletIcon, label: 'Cash' },
    { id: 'CARD' as const, icon: CreditCardIcon, label: 'Card' },
    { id: 'GCASH' as const, icon: SmartphoneIcon, label: 'GCash' },
    { id: 'BANK_TRANSFER' as const, icon: LandmarkIcon, label: 'Bank Transfer / QR' },
    { id: 'SPLIT' as const, icon: CircleDollarSignIcon, label: 'Split' },
]
```

Update the component props type (line 16-17):

```typescript
// Before:
paymentMethod: 'CASH' | 'CARD' | 'GCASH' | 'PAYMAYA' | 'SPLIT'
setPaymentMethod: (method: 'CASH' | 'CARD' | 'GCASH' | 'PAYMAYA' | 'SPLIT') => void

// After:
paymentMethod: PaymentMethod
setPaymentMethod: (method: PaymentMethod) => void
```

Add import of `PaymentMethod` from `@/utils/types/transactions`.

**Step 4: Update SplitPaymentBuilder**

In `components/sales/checkout/SplitPaymentBuilder.tsx`, find all references to `'PAYMAYA'` and replace with `'BANK_TRANSFER'`. Update labels to "Bank Transfer / QR" and icons to `LandmarkIcon`.

**Step 5: Update CheckoutModal**

In `components/sales/modals/CheckoutModal.tsx`:
- Line 14: Change `'PAYMAYA'` to `'BANK_TRANSFER'` in `SplitPayment` type
- Line 40-41: Change prop types from string union to `PaymentMethod`
- Update all prop type references

**Step 6: Update SalesContext**

In `components/sales/context/SalesContext.tsx`, find any `PAYMAYA` string literals and replace with `'BANK_TRANSFER'`. The state type should now use `PaymentMethod` from `@/utils/types/transactions`.

**Step 7: Update AddPaymentModal**

In `components/sales/modals/AddPaymentModal.tsx`, find any `PAYMAYA` references and update to `BANK_TRANSFER` with label "Bank Transfer / QR".

**Step 8: Update server actions**

In `server/actions/transactions.ts`, search for any `'PAYMAYA'` string literals and replace with `'BANK_TRANSFER'`. Update any mapper calls from `mapTransactionToAccountingPaymentMethod` since we changed the mapper in Step 2.

**Step 9: Search for any remaining PAYMAYA references**

Run: `rg -i "paymaya" --type ts --type tsx` to find any remaining references across the codebase and update them.

**Step 10: Commit**

```bash
git add -A && git commit -m "feat(sales): rename PAYMAYA to BANK_TRANSFER across all sales types and UI"
```

---

### Task 1.2: Fix Branch Filtering for Services, Inventory, and Appointments

**Files:**
- Modify: `components/sales/context/SalesContext.tsx` (lines ~360-400)
- Modify: `server/actions/inventory.ts` (server-side filter, if redundant)
- Modify: `server/actions/transactions.ts` (ensure branch filter consistency)

**Step 1: Fix services branch filter in SalesContext**

In `components/sales/context/SalesContext.tsx`, find the services filter (around line 367-369) and add the `branch_id === null` check:

```typescript
// Before:
const branchServices = (servResult.data.services || []).filter(
    (service) => service.branch_id === currentBranch?.id || service.is_shared
)

// After:
const branchServices = (servResult.data.services || []).filter(
    (service) => service.branch_id === currentBranch?.id || service.is_shared || service.branch_id === null
)
```

**Step 2: Fix appointments branch filter in SalesContext**

Find the appointments filter (around line 383-384) and add the null check:

```typescript
// Before:
const branchAppointments = (appointmentsResult.data as UnpaidAppointment[]).filter(
    (apt) => apt.branch_id === currentBranch?.id
)

// After:
const branchAppointments = (appointmentsResult as UnpaidAppointment[]).filter(
    (apt) => apt.branch_id === currentBranch?.id || apt.branch_id === null
)
```

**Step 3: Remove redundant client-side inventory filter**

In `SalesContext.tsx`, find the inventory filter (around line 355-360). The server-side `getInventory()` already filters by branch. Keep the `show_in_sales` and `is_shared` checks but remove the redundant `item.branch_id === currentBranch?.id` check since it's already done server-side. Keep the `item.branch_id === null` override for shared/global items:

```typescript
// After (simplified):
const salesInv = (invData || []).filter(
    (item) => item.show_in_sales === true || item.is_shared === true || item.branch_id === null
)
```

**Step 4: Fix race condition in refreshTransactions**

Find `refreshTransactions` in `SalesContext.tsx` and ensure it handles null branch consistently with `fetchData`:

```typescript
const filters = currentBranch?.id ? { branchId: currentBranch.id } : undefined
```

**Step 5: Commit**

```bash
git add -A && git commit -m "fix(sales): branch filtering now correctly includes shared/null-branch items"
```

---

### Task 1.3: Reorganize Complete Transaction Modal for Better Flow

**Files:**
- Modify: `components/sales/modals/CheckoutModal.tsx`

**Step 1: Reorganize the modal layout**

The current flow is:
1. Customer Selection
2. Payment Method (or Split Payment Builder)
3. Staff Assignment
4. Client Type (conditional, if services in cart)
5. Order Summary
6. Complete Transaction button

The reorganized flow should follow a more natural checkout progression:

1. **Customer Section** (Walk-in / Registered toggle + name/phone/email)
2. **Staff & Client Type Section** (Staff Assignment + Client Type combined, since both relate to service delivery)
3. **Payment Section** (Payment Method or Split Payment Builder + reference number/cash received)
4. **Order Summary** (Subtotal, VAT, Discount, Total)
5. **Complete Transaction button**

This means moving Staff Assignment and Client Type BEFORE the payment section, and keeping Order Summary at the bottom.

**Step 2: Group Staff and Client Type into a combined section**

Create a combined section with a visual divider between them:

```tsx
{/* Staff & Client Type Section */}
<div className='space-y-4'>
    <div>
        <label className='block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300 flex items-center gap-2'>
            <UsersIcon className='w-4 h-4' />
            Staff Assignment
        </label>
        <select
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            className='w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
        >
            <option value=''>Select Staff Member</option>
            <option value='SHOP_SALE'>Shop Sale (No Commission)</option>
            {staffList.map((staff) => (
                <option key={staff.id} value={staff.id}>
                    {staff.full_name} ({staff.role || 'staff'})
                </option>
            ))}
        </select>
    </div>

    {hasServices && (
        <div>
            <label className='block text-sm font-medium mb-2 text-zinc-700 dark:text-zinc-300 flex items-center gap-2'>
                <UserIcon className='w-4 h-4' />
                Client Type
            </label>
            {/* ... existing client type toggle ... */}
        </div>
    )}
</div>
```

**Step 3: Add section dividers between major sections**

Add `<div className='border-t border-zinc-200 dark:border-zinc-700'></div>` dividers between:
- Customer Selection → Staff/Client Type
- Staff/Client Type → Payment Section
- Payment Section → Order Summary

**Step 4: Improve the Order Summary visual hierarchy**

Enhance the order summary box with better spacing and emphasis:

```tsx
<div className='bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 space-y-2 border border-zinc-200 dark:border-zinc-700'>
    {/* ... existing items ... */}
    <div className='border-t border-zinc-300 dark:border-zinc-600 pt-2 mt-2'>
        <div className='flex justify-between font-bold text-lg'>
            <span>Total</span>
            <span className='text-blue-600 dark:text-blue-400'>
                {taxSettings.currency_symbol} {total.toFixed(2)}
            </span>
        </div>
    </div>
</div>
```

**Step 5: Commit**

```bash
git add -A && git commit -m "refactor(sales): reorganize checkout modal for better UX flow"
```

---

### Task 1.4: Ensure Sales Utilizes Pre-Seeded Account Types Properly

**Files:**
- Modify: `server/actions/transactions.ts` (auto-ledger entry creation)
- Modify: `server/actions/sales.ts` (auto-ledger entry creation)
- Modify: `scripts/seed-accounting-categories.ts` (verify/update seeded categories)

**Step 1: Verify pre-seeded categories exist**

Check `scripts/seed-accounting-categories.ts` and ensure these categories are seeded:
- `SALES` (REVENUE)
- `VOIDED_SALES` (EXPENSE)
- `REFUNDS` (EXPENSE)
- `PAYROLL` (EXPENSE)

If they're not in the seed script, add them.

**Step 2: Ensure createAutoLedgerEntry uses seeded categories correctly**

In `server/actions/accounting.ts`, find `createAutoLedgerEntry`. The current logic auto-creates categories on-the-fly. Ensure that for transaction-related entries, it uses the pre-seeded `SALES` category name (not a lowercase version).

The current flow auto-creates with `sanitizeText(name).toLowerCase()` in the import path but `sanitizeText(payload.category)` in the auto-entry path. Verify that the auto-entry path preserves casing and matches the pre-seeded category names exactly.

**Step 3: Ensure transaction completion passes `payment_method` to auto-ledger entries**

In `server/actions/transactions.ts`, find where `createAutoLedgerEntry` is called for transaction completion. Verify that the `payment_method` field is being passed:

```typescript
await createAutoLedgerEntry('TRANSACTION', transaction.id, {
    entry_date: new Date(),
    entry_type: 'REVENUE',
    category: 'SALES',
    description: `Sales - ${transaction.transaction_number}`,
    reference: transaction.transaction_number,
    debit: 0,
    credit: Number(transaction.total),
    branch_id: transaction.branch_id,
    payment_method: mapTransactionToAccountingPaymentMethod(transaction.payment_method),
}, currentUser.id)
```

Ensure `payment_method` is included in the payload for all transaction-related auto-entries (completed, voided, refunded).

**Step 4: Commit**

```bash
git add -A && git commit -m "fix(sales): ensure auto-ledger entries use pre-seeded categories and include payment_method"
```

---

## Phase 2: Accounting — Table, Filters, Stat Cards, Modals & CSV Import

### Task 2.1: Rearrange Accounting Table Columns

**Files:**
- Modify: `app/accounting/accountingPage.tsx` (lines 670-701, headers; lines 770-930, body rows)

**Step 1: Update table header order**

Change the `<thead>` column order to:

```tsx
<tr className='text-nowrap select-none'>
    <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Date</th>
    <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Type</th>
    <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Payment Type</th>
    <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Category</th>
    <th className='text-right px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Debit</th>
    <th className='text-right px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Credit</th>
    <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Description</th>
    <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Reference</th>
    <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Branch</th>
    <th className='text-center px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Proof</th>
    {isAdmin && (
        <th className='text-center px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Actions</th>
    )}
</tr>
```

This gives the order: Date | Type | Payment Type | Category | Debit | Credit | Description | Reference | Branch | Proof | Actions

**Step 2: Update table body column order to match headers**

Reorganize the `<td>` elements in each row to match the new header order. For each entry row:

1. Date (formatted)
2. Type (colored badge)
3. Payment Type (method badge or "-")
4. Category (text)
5. Debit (right-aligned, red)
6. Credit (right-aligned, green)
7. Description (truncated)
8. Reference
9. Branch (branch name or "Shared")
10. Proof (link icon if present)
11. Actions (edit + void, admin only)

**Step 3: Update all colSpan values**

Since we now have 11 columns total (10 visible + 1 Actions for admin), update all `colSpan` values:
- Loading row: `colSpan={isAdmin ? 11 : 10}`
- Empty state row: `colSpan={isAdmin ? 11 : 10}`
- Separator row: `colSpan={isAdmin ? 11 : 10}`

**Step 4: Commit**

```bash
git add -A && git commit -m "refactor(accounting): rearrange table columns to Date|Type|PaymentType|Category|Debit|Credit|Description|Reference|Branch|Proof|Actions"
```

---

### Task 2.2: Add Payment Method Filter and Fix Stat Card Calculations

**Files:**
- Modify: `app/accounting/accountingPage.tsx` (lines 143, 508-610 for filters, lines 637-659 for stat cards)
- Modify: `server/actions/accounting.ts` (getLedgerSummary to accept payment_method filter)

**Step 1: Add payment method filter state setter**

On line 143, change from:

```typescript
const [paymentMethodFilter] = useState<AccountingPaymentMethod | "">("")
```

To:

```typescript
const [paymentMethodFilter, setPaymentMethodFilter] = useState<AccountingPaymentMethod | "">("")
```

**Step 2: Add payment method filter dropdown in FilterBar**

After the category filter `<select>` (around line 555), add a payment method filter:

```tsx
<select
    value={paymentMethodFilter}
    onChange={(e) => setPaymentMethodFilter(e.target.value as AccountingPaymentMethod | "")}
    className='bg-white/10 hover:bg-white/20 transition-colors px-3 py-2 rounded-md text-sm cursor-pointer border-2 border-white/5'
>
    <option value=''>All Payment Methods</option>
    {ACCOUNTING_PAYMENT_METHODS.map((method) => (
        <option key={method.key} value={method.key}>
            {method.label}
        </option>
    ))}
</select>
```

Import `ACCOUNTING_PAYMENT_METHODS` from `@/utils/types/payment`.

**Step 3: Ensure payment method filter is passed to fetchData**

The filter is already passed at line 179 (`payment_method: paymentMethodFilter || undefined`), so just make sure the setter from Step 1 is connected. The state will update, `fetchData` will re-run, and entries will be filtered server-side.

**Step 4: Make filters affect stat cards**

Currently, `getLedgerSummary` is called without payment_method or entry_type/category filters. Update the call (around line 193) to pass the same filters:

```typescript
const summaryResult = await getLedgerSummary(
    datePreset,
    customStartDate,
    customEndDate,
    currentBranch?.id,
    {
        entry_type: typeFilter || undefined,
        category: categoryFilter || undefined,
        payment_method: paymentMethodFilter || undefined,
    }
)
```

Update `getLedgerSummary` in `server/actions/accounting.ts` to accept an optional `filters` parameter and include those conditions in the WHERE clause alongside the date/branch conditions.

**Step 5: Fix stat card display for payment method breakdown**

Currently, payment method cards show `(pm.debit - pm.credit)` which can be confusing. For a more meaningful display:
- For EXPENSE-type entries: Debit is the outflow → show `pm.debit` (total spent via this method)
- For REVENUE-type entries: Credit is the inflow → show `pm.credit` (total received via this method)

Update the stat card to show both sides clearly:

```tsx
<StatCard
    key={pm.method}
    label={pm.method_label}
    value={`${currencySymbol}${(pm.debit - pm.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
    trend='neutral'
    trendValue={`DR ${pm.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })} | CR ${pm.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
    color='default'
/>
```

This is already what's displayed. The label is fine. Verify the net amount makes sense in context.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat(accounting): add payment method filter and apply filters to stat cards"
```

---

### Task 2.3: Reorganize Add Entry Modal Layout

**Files:**
- Modify: `components/accounting/EntryModal.tsx`

**Step 1: Reorganize modal fields in order**

Current order: Date | Type | Branch | Payment Method | Category | Description | Reference | Debit/Credit | Attachment

Reorganized order (better logical flow):

1. **Entry Type** (determines what categories and debit/credit labels are available)
2. **Category** (filtered by entry type)
3. **Payment Method** (associated with how money moved)
4. **Date** (when it occurred)
5. **Branch** (which branch)
6. **Description** (what happened)
7. **Reference** (document reference)
8. **Debit / Credit** (amounts, based on entry type)
9. **Attachment** (proof document)

**Step 2: Group related fields with section headers**

Use subtle section dividers:

```tsx
{/* Entry Information */}
<div className='space-y-4'>
    <h4 className='text-sm font-semibold text-zinc-400 uppercase tracking-wider'>Entry Details</h4>
    {/* Type + Category in 2-col grid */}
    {/* Payment Method */}
    {/* Date + Branch in 2-col grid */}
</div>

<div className='border-t border-zinc-200 dark:border-zinc-700' />

{/* Amount & Description */}
<div className='space-y-4'>
    <h4 className='text-sm font-semibold text-zinc-400 uppercase tracking-wider'>Amounts & Description</h4>
    {/* Description */}
    {/* Reference */}
    {/* Debit + Credit in 2-col grid */}
</div>

<div className='border-t border-zinc-200 dark:border-zinc-700' />

{/* Attachment */}
<div className='space-y-4'>
    <h4 className='text-sm font-semibold text-zinc-400 uppercase tracking-wider'>Proof / Attachment</h4>
    {/* File upload */}
</div>
```

**Step 3: Make Type + Category a 2-column row**

```tsx
<div className='grid grid-cols-2 gap-4'>
    <div>
        <label>Type *</label>
        {/* Type select */}
    </div>
    <div>
        <label>Category</label>
        {/* Category select + custom input */}
    </div>
</div>
```

**Step 4: Make Date + Branch a 2-column row**

```tsx
<div className='grid grid-cols-2 gap-4'>
    <div>
        <label>Date *</label>
        {/* Date input */}
    </div>
    <div>
        <label>Branch</label>
        <BranchSelectorInline ... />
    </div>
</div>
```

**Step 5: Make Debit + Credit a 2-column row with contextual labels**

```tsx
<div className='grid grid-cols-2 gap-4'>
    <div>
        <label>{debitLabel} ({currencySymbol})</label>
        <input type='number' ... />
    </div>
    <div>
        <label>{creditLabel} ({currencySymbol})</label>
        <input type='number' ... />
    </div>
</div>
```

**Step 6: Commit**

```bash
git add -A && git commit -m "refactor(accounting): reorganize add entry modal for better flow"
```

---

### Task 2.4: Update CSV Import with Payment Method and Branch Columns

**Files:**
- Modify: `app/accounting/accountingPage.tsx` (lines 95-114, CSV column definitions)
- Modify: `server/actions/accounting-import.ts` (AccountingImportRow interface, import logic)
- Modify: `utils/types/payment.ts` (ensure AccountingPaymentMethod export is available)

**Step 1: Add `payment_method` and `branch` columns to CSV schema**

In `app/accounting/accountingPage.tsx`, update `accountingCSVColumns`:

```typescript
const accountingCSVColumns: CSVColumn[] = [
    { key: "entry_date", label: "Date", required: true, type: "date" },
    { key: "entry_type", label: "Type", required: true, type: "enum", enumValues: ["EXPENSE", "REVENUE", "ASSET", "LIABILITY", "EQUITY"] },
    { key: "payment_method", label: "Payment Method", required: false, type: "enum", enumValues: ["CASH", "CARD", "BANK_TRANSFER", "GCASH", "CRYPTO"] },
    { key: "category", label: "Category", required: false, type: "string" },
    { key: "description", label: "Description", required: true, type: "string" },
    { key: "debit", label: "Debit", required: false, type: "number" },
    { key: "credit", label: "Credit", required: false, type: "number" },
    { key: "reference", label: "Reference", required: false, type: "string" },
    { key: "branch", label: "Branch", required: false, type: "string" },
]
```

**Step 2: Update AccountingImportRow interface**

In `server/actions/accounting-import.ts`:

```typescript
export interface AccountingImportRow extends Record<string, unknown> {
    entry_date: string
    entry_type: string
    payment_method?: string
    category?: string
    description: string
    debit?: number
    credit?: number
    reference?: string
    branch?: string
}
```

**Step 3: Add branch resolution logic to import**

Add a branch name-to-id lookup at the start of `importAccountingEntries`:

```typescript
import { branches } from '@/server/db/schema'
import { eq } from 'drizzle-orm'

// Inside function, after permission checks:
const allBranches = await db.select({ id: branches.id, name: branches.name, code: branches.code }).from(branches)
const branchNameMap = new Map(allBranches.map(b => [b.name.toLowerCase(), b.id]))
const branchCodeMap = new Map(allBranches.map(b => [b.code.toLowerCase(), b.id]))

// Helper to resolve branch:
function resolveBranchId(branchValue: string | undefined, defaultBranchId: string | null): string | null {
    if (!branchValue || branchValue.trim() === '') return defaultBranchId
    const lower = branchValue.trim().toLowerCase()
    return branchNameMap.get(lower) || branchCodeMap.get(lower) || defaultBranchId
}
```

**Step 4: Validate payment_method in import rows**

Add validation for `payment_method` in the validation loop:

```typescript
const validPaymentMethods: string[] = ['CASH', 'CARD', 'BANK_TRANSFER', 'GCASH', 'CRYPTO']

// In validation loop:
if (entry.payment_method && !validPaymentMethods.includes(entry.payment_method.toUpperCase())) {
    errors.push(`Row ${rowNum}: Invalid payment method "${entry.payment_method}". Must be one of: ${validPaymentMethods.join(', ')}`)
}
```

**Step 5: Include payment_method and branch_id in inserted entries**

In the entriesToInsert mapping:

```typescript
const entriesToInsert = entries.map(entry => {
    const entryDate = new Date(entry.entry_date)
    const categoryId = entry.category ? categoryMap.get(entry.category.toLowerCase())?.id : null
    const resolvedBranchId = resolveBranchId(entry.branch, branchId)

    // Map payment_method string to AccountingPaymentMethod or null
    const paymentMethod = entry.payment_method?.toUpperCase() as AccountingPaymentMethod | undefined
    if (paymentMethod && !validPaymentMethods.includes(paymentMethod)) {
        // Already validated above, but be safe
    }

    return {
        entryDate: entryDate,
        entryType: entry.entry_type.toUpperCase() as LedgerEntryType,
        category: entry.category || null,
        categoryId: categoryId ?? undefined,
        description: sanitizeText(entry.description),
        reference: entry.reference ? sanitizeMinimal(entry.reference) : null,
        debit: String(entry.debit || 0),
        credit: String(entry.credit || 0),
        branchId: resolvedBranchId,
        paymentMethod: (entry.payment_method?.toUpperCase() && validPaymentMethods.includes(entry.payment_method.toUpperCase()))
            ? entry.payment_method.toUpperCase() as AccountingPaymentMethod
            : null,
        createdBy: userId,
        isVoided: false,
        sourceType: 'MANUAL' as const,
        sourceId: null,
        proofUrl: null,
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
        updatedAt: null,
        updatedBy: null,
    }
})
```

**Step 6: Add branch selection UI before CSV import**

In the CSV import modal or the import flow, add a branch selector that pre-fills the default branch for the import. The user should be able to:
- Option A: Select a branch before importing (all entries without a "branch" column use this branch)
- Option B: Include a "branch" column in the CSV that overrides the default

Implement by adding a `BranchSelectorInline` component to the import modal and passing the selected branch as `defaultBranchId`.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat(accounting): add payment_method and branch columns to CSV import with branch resolution"
```

---

### Task 2.5: Fix Accounting Table Row Rendering Issues

**Files:**
- Modify: `app/accounting/accountingPage.tsx` (lines 730-1000+, table body rows)

**Step 1: Fix column misalignment in row rendering**

Currently, the "Category" header column renders `payment_method` as a badge, and the actual category text appears in an unlabeled column. Fix this by rendering each column in the correct order matching the new headers:

```tsx
entries.map((entry) => (
    <tr key={entry.id} className='border-b border-white/5 hover:bg-white/5'>
        {/* 1. Date */}
        <td className='px-4 py-2 text-sm text-white/80'>
            {new Date(entry.entry_date).toLocaleDateString()}
        </td>

        {/* 2. Type */}
        <td className='px-4 py-2 text-sm'>
            <span className={`text-xs px-2 py-0.5 rounded border ${ENTRY_TYPE_COLORS[entry.entry_type]}`}>
                {entry.entry_type}
            </span>
        </td>

        {/* 3. Payment Type */}
        <td className='px-4 py-2 text-sm'>
            {entry.payment_method ? (
                <span className={`text-xs px-1.5 py-0.5 rounded border ${ACCOUNTING_PAYMENT_METHOD_COLORS[entry.payment_method]}`}>
                    {getAccountingPaymentMethodLabel(entry.payment_method)}
                </span>
            ) : (
                <span className='text-white/30'>-</span>
            )}
        </td>

        {/* 4. Category */}
        <td className='px-4 py-2 text-sm text-white/80'>
            {entry.category || <span className='text-white/30'>-</span>}
        </td>

        {/* 5. Debit */}
        <td className='px-4 py-2 text-sm text-right text-red-300'>
            {Number(entry.debit) > 0 ? `${currencySymbol}${Number(entry.debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
        </td>

        {/* 6. Credit */}
        <td className='px-4 py-2 text-sm text-right text-green-300'>
            {Number(entry.credit) > 0 ? `${currencySymbol}${Number(entry.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
        </td>

        {/* 7. Description */}
        <td className='px-4 py-2 text-sm text-white/80 max-w-xs truncate'>
            {entry.description}
        </td>

        {/* 8. Reference */}
        <td className='px-4 py-2 text-sm text-white/60'>
            {entry.reference || <span className='text-white/30'>-</span>}
        </td>

        {/* 9. Branch */}
        <td className='px-4 py-2 text-sm text-white/60'>
            {entry.branch_id ? (branchNameMap[entry.branch_id] || 'Unknown') : 'Shared'}
        </td>

        {/* 10. Proof */}
        <td className='px-4 py-2 text-sm text-center'>
            {entry.proof_url ? (
                <a href={entry.proof_url} target='_blank' rel='noopener noreferrer' className='text-blue-400 hover:text-blue-300'>
                    <FileIcon className='w-4 h-4 inline' />
                </a>
            ) : (
                <span className='text-white/30'>-</span>
            )}
        </td>

        {/* 11. Actions (admin only) */}
        {isAdmin && (
            <td className='px-4 py-2 text-sm text-center'>
                <div className='flex items-center justify-center gap-2'>
                    <button onClick={() => handleEdit(entry)} className='text-blue-400 hover:text-blue-300'>
                        <EditIcon className='w-4 h-4' />
                    </button>
                    <button onClick={() => handleVoid(entry)} className='text-red-400 hover:text-red-300'>
                        <TrashIcon className='w-4 h-4' />
                    </button>
                </div>
            </td>
        )}
    </tr>
))
```

**Step 2: Remove the old payment_method separator rows**

The current code uses `showSeparator` logic based on `payment_method` grouping. Remove this cross-row separator logic since we now have a dedicated Payment Type column. Entries should render as flat rows.

**Step 3: Commit**

```bash
git add -A && git commit -m "fix(accounting): fix column misalignment and remove obsolete separator rows"
```

---

### Task 2.6: Audit Accounting Logic for Robustness

**Files:**
- Modify: `server/actions/accounting.ts` (getLedgerSummary, createLedgerEntry, createAutoLedgerEntry)
- Modify: `server/actions/accounting-import.ts`

**Step 1: Add category name casing consistency**

In `server/actions/accounting-import.ts`, change the auto-create categories to preserve original casing instead of forcing lowercase:

```typescript
// Before:
name: sanitizeText(name).toLowerCase(),

// After:
name: sanitizeText(name),
```

Also update the categoryMap lookup to be case-insensitive while preserving stored names:

```typescript
const categoryMap = new Map(dbCategories.map(c => [c.name.toLowerCase(), c]))
// Keep this as-is for lookup, but store the original-cased name in the new category insert
```

**Step 2: Fix createLedgerEntry return type to include payment_method**

In `server/actions/accounting.ts`, around line 426-446, ensure the return transformation includes `payment_method`:

Verify that `createLedgerEntry` returns the complete entry including `paymentMethod`.

**Step 3: Add db transaction wrapper for createJournalEntry**

If `createJournalEntry` performs multiple inserts (debit + credit), wrap them in a database transaction to ensure atomicity.

**Step 4: Commit**

```bash
git add -A && git commit -m "fix(accounting): improve casing consistency and payment_method in return types"
```

---

## Phase 3: Payroll — Accounting Schema Alignment & Audit

### Task 3.1: Align Payroll Payment Methods with Accounting Schema

**Files:**
- Modify: `utils/types/payroll.ts:24` (PaymentMethod type)
- Modify: `utils/types/payroll.ts:162-183` (UserPaymentMethod types)
- Modify: `server/actions/payroll.ts` (completePayrollRequest to include payment_method)
- Modify: `server/db/schema/payroll.ts` (if needed for Bank/Bank.Transfer migration)

**Step 1: Standardize PayrollPaymentMethod**

In `utils/types/payroll.ts`, update line 24:

```typescript
// Before:
export type PaymentMethod = 'CASH' | 'GCASH' | 'MAYA' | 'BANK' | 'CARD' | 'CRYPTO'

// After (aligned with AccountingPaymentMethod, adding MAYA for backward compat):
export type PaymentMethod = 'CASH' | 'GCASH' | 'MAYA' | 'BANK_TRANSFER' | 'CARD' | 'CRYPTO'
```

Note: We're replacing `'BANK'` with `'BANK_TRANSFER'` for consistency with accounting. The `PAYROLL_PAYMENT_METHODS` constant in `utils/types/payment.ts` already has `BANK_TRANSFER` with label "Bank Transfer / QR".

**Step 2: Update UserPaymentMethod types**

In `utils/types/payroll.ts`, update lines 168 and 186:

```typescript
// Before:
type: 'CASH' | 'GCASH' | 'MAYA' | 'BANK'

// After:
type: 'CASH' | 'GCASH' | 'MAYA' | 'BANK_TRANSFER'
```

And similarly for `CreatePaymentMethodPayload` and `UpdatePaymentMethodPayload`.

**Step 3: Update payroll server actions**

In `server/actions/payroll.ts`, search for all `'BANK'` string literals used as payment method values and replace with `'BANK_TRANSFER'`. Add backward compatibility mapping for existing DB rows that have `'BANK'`:

```typescript
function normalizePayrollPaymentMethod(method: string): string {
    if (method === 'BANK') return 'BANK_TRANSFER'
    return method
}
```

Apply this normalization when reading from DB, so existing `'BANK'` rows are treated as `'BANK_TRANSFER'` in the UI.

**Step 4: Pass payment_method to createAutoLedgerEntry in completePayrollRequest**

In `server/actions/payroll.ts`, find `completePayrollRequest` and update the `createAutoLedgerEntry` call to include `payment_method`:

```typescript
await createAutoLedgerEntry('PAYROLL', request.id, {
    entry_date: new Date(),
    entry_type: 'EXPENSE',
    category: 'PAYROLL',
    description: `Payroll payment - Staff: ${staffName}`,
    reference: `PAYROLL-${requestId.slice(0, 8)}`,
    debit: Number(request.totalArtistCut),
    credit: 0,
    branch_id: payrollEntryWithBranch?.branchId || null,
    payment_method: mapPayrollToAccountingPaymentMethod(request.payment_method),
}, currentUser.id)
```

Add a new mapper function in `utils/types/payment.ts`:

```typescript
export function mapPayrollToAccountingPaymentMethod(method: string | null | undefined): AccountingPaymentMethod | undefined {
    if (!method) return undefined
    switch (method) {
        case 'CASH': return 'CASH'
        case 'CARD': return 'CARD'
        case 'GCASH': return 'GCASH'
        case 'MAYA': return 'CARD'
        case 'BANK': return 'BANK_TRANSFER'
        case 'BANK_TRANSFER': return 'BANK_TRANSFER'
        default: return undefined
    }
}
```

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(payroll): align payment methods with accounting schema, pass payment_method to ledger entries"
```

---

### Task 3.2: Fix Payroll Deduction Integration with Accounting

**Files:**
- Modify: `server/actions/payroll.ts` (completePayrollRequest)

**Step 1: Create accounting entries for payroll deductions**

In `completePayrollRequest`, after applying deductions, create accounting entries for the deduction amounts:

```typescript
// After deduction amounts are calculated, for each deduction:
for (const deduction of appliedDeductions) {
    await createAutoLedgerEntry('PAYROLL', request.id, {
        entry_date: new Date(),
        entry_type: 'LIABILITY',  // or appropriate type for deductions
        category: 'PAYROLL_DEDUCTIONS',
        description: `Payroll deduction - ${deduction.description || 'Advance'} - Staff: ${staffName}`,
        reference: `PAYROLL-DEDUCT-${requestId.slice(0, 8)}`,
        debit: 0,
        credit: Number(deduction.amount),
        branch_id: payrollEntryWithBranch?.branchId || null,
    }, currentUser.id)
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat(payroll): create accounting entries for payroll deductions"
```

---

### Task 3.3: Fix Payroll Race Conditions and Data Integrity

**Files:**
- Modify: `server/actions/payroll.ts` (critical operations)
- Modify: `server/db/transactions.ts` (if wrapper needs enhancement)

**Step 1: Wrap createPayrollRequest in a database transaction**

Use the existing `withTransaction` utility from `server/db/transactions.ts` to wrap the request creation and entry updates:

```typescript
const result = await withTransaction(async (tx) => {
    // Check for duplicate entries
    // Insert request
    // Update entries with request ID
    // Return result
})
```

**Step 2: Wrap cancelPayrollRequest in a database transaction**

Similarly wrap the cancel operation:

```typescript
const result = await withTransaction(async (tx) => {
    // Update request status
    // Reset entries (remove request ID, set status back)
    // Return result
})
```

**Step 3: Fix requester JOIN in getPayrollRequests**

The current query at line 829-854 incorrectly shows `requester` as the same person as `staff`. Fix by adding a separate JOIN to the user table for the requester:

```typescript
// Add a second join to user table for requester
.leftJoin(user, eq(payrollRequest.requestedBy, user.id))
```

Or fetch requester info separately and map it correctly.

**Step 4: Fix percentage sum validation in updateStaffRate**

In `updateStaffRate`, validate that `shop_percentage + artist_percentage === 100` even if only one value is provided:

```typescript
// Fetch current rate first
const currentRate = await db.select().from(payrollStaffRate).where(eq(payrollStaffRate.id, rateId)).limit(1)
if (!currentRate.length) throw new Error('Rate not found')

const newShopPercentage = data.shop_percentage ?? currentRate[0].shopPercentage
const newArtistPercentage = data.artist_percentage ?? currentRate[0].artistPercentage

if (payment_mode === 'PERCENTAGE' && newShopPercentage + newArtistPercentage !== 100) {
    throw new Error('Shop and artist percentages must sum to 100')
}
```

**Step 5: Commit**

```bash
git add -A && git commit -m "fix(payroll): add transaction wrappers, fix requester JOIN, and validate percentage sums"
```

---

### Task 3.4: Remove Dead Code - applyDeductions Standalone Function

**Files:**
- Modify: `server/actions/payroll.ts` (remove `applyDeductions` function around line 1938)

**Step 1: Remove the unused applyDeductions function**

In `server/actions/payroll.ts`, find the standalone `applyDeductions` function (around line 1938) and remove it. It duplicates logic that's already inline in `completePayrollRequest`.

**Step 2: Commit**

```bash
git add -A && git commit -m "chore(payroll): remove unused standalone applyDeductions function"
```

---

## Phase 4: Cross-Module — Shared Payment Type Unification & Lint/Build Fix

### Task 4.1: Unify Payment Method Labels and Icons Across All Modules

**Files:**
- Modify: `utils/types/payment.ts` (add unified icon map)
- Modify: `components/sales/checkout/PaymentMethodSelector.tsx`
- Modify: `components/sales/checkout/SplitPaymentBuilder.tsx`
- Modify: `components/sales/modals/AddPaymentModal.tsx`

**Step 1: Add a unified payment method display map in payment.ts**

```typescript
import { WalletIcon, CreditCardIcon, SmartphoneIcon, LandmarkIcon, CircleDollarSignIcon, BitcoinIcon } from 'lucide-react'

export const TRANSACTION_PAYMENT_METHODS: { key: PaymentMethod; label: string; description: string }[] = [
    { key: 'CASH', label: 'Cash', description: 'Physical cash payment' },
    { key: 'CARD', label: 'Card', description: 'Debit or credit card' },
    { key: 'GCASH', label: 'GCash', description: 'GCash mobile payment' },
    { key: 'BANK_TRANSFER', label: 'Bank Transfer / QR', description: 'Bank transfer or QR code payment' },
    { key: 'SPLIT', label: 'Split', description: 'Split payment across multiple methods' },
]
```

**Step 2: Update all UI components to use the unified definitions**

Replace hardcoded method arrays in `PaymentMethodSelector.tsx`, `SplitPaymentBuilder.tsx`, and `AddPaymentModal.tsx` with imports from the centralized definitions.

**Step 3: Commit**

```bash
git add -A && git commit -m "refactor: unify payment method labels and icons across all modules"
```

---

### Task 4.2: Fix All Lint and Build Errors

**Files:**
- All files modified in previous tasks
- Any other files with existing lint errors

**Step 1: Run lint and check for errors**

```bash
bun run lint 2>&1 | head -100
```

**Step 2: Fix all lint errors**

Address each lint error reported. Common issues will likely include:
- Unused imports (remove them)
- Type mismatches from PAYMAYA → BANK_TRANSFER renaming (TypeScript strict mode errors)
- Missing exports/imports from refactored files

**Step 3: Run build and check for errors**

```bash
bun run build 2>&1 | head -200
```

**Step 4: Fix all build errors**

Common issues:
- Server component/client component boundary violations
- Type errors from the PaymentMethod union change
- Missing module references

**Step 5: Run lint again to confirm clean**

```bash
bun run lint
```

**Step 6: Run build again to confirm clean**

```bash
bun run build
```

**Step 7: Commit**

```bash
git add -A && git commit -m "fix: resolve all lint and build errors across modules"
```

---

## Summary of Changes

| Phase | Module | Change | Files Affected |
|-------|--------|--------|---------------|
| 1.1 | Sales | PAYMAYA → BANK_TRANSFER | `transactions.ts`, `payment.ts`, `PaymentMethodSelector.tsx`, `SplitPaymentBuilder.tsx`, `CheckoutModal.tsx`, `SalesContext.tsx`, `AddPaymentModal.tsx`, `transactions.ts` (server) |
| 1.2 | Sales | Fix branch filtering | `SalesContext.tsx`, `inventory.ts` (server) |
| 1.3 | Sales | Reorganize checkout modal | `CheckoutModal.tsx` |
| 1.4 | Sales | Pre-seeded account types | `transactions.ts` (server), `sales.ts` (server), `seed-accounting-categories.ts` |
| 2.1 | Accounting | Rearrange columns | `accountingPage.tsx` |
| 2.2 | Accounting | Payment method filter + stat cards | `accountingPage.tsx`, `accounting.ts` (server) |
| 2.3 | Accounting | Reorganize entry modal | `EntryModal.tsx` |
| 2.4 | Accounting | CSV import + branch | `accountingPage.tsx`, `accounting-import.ts` |
| 2.5 | Accounting | Fix table rendering | `accountingPage.tsx` |
| 2.6 | Accounting | Audit logic robustness | `accounting.ts`, `accounting-import.ts` |
| 3.1 | Payroll | Align payment methods | `payroll.ts` (types), `payment.ts`, `payroll.ts` (server) |
| 3.2 | Payroll | Deduction accounting entries | `payroll.ts` (server) |
| 3.3 | Payroll | Race condition fixes | `payroll.ts` (server) |
| 3.4 | Payroll | Remove dead code | `payroll.ts` (server) |
| 4.1 | Cross | Unify payment methods | `payment.ts`, multiple UI components |
| 4.2 | Cross | Lint/build fix | All modified files |