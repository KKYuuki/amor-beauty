# Accounting Overhaul, Hourly Services, and Bug Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all reported accounting/branch/metrics bugs, overhaul debit-credit to follow proper double-entry bookkeeping standards, add hourly service enhancements with custom pricing in sales, and audit the entire accounting flow for correctness.

**Architecture:** This plan is organized into 4 phases executed sequentially:
1. **Phase 1 - Critical Bug Fixes** (accounting, branch, auth, metrics)
2. **Phase 2 - Accounting Standards Overhaul** (proper double-entry debit/credit)
3. **Phase 3 - Hourly Services & Custom Pricing** (new features)
4. **Phase 4 - Audit & Hardening** (comprehensive testing, edge cases)

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, PostgreSQL, Better-Auth, Tailwind CSS 4, Bun

---

## Phase 1: Critical Bug Fixes

### Task 1: Fix Custom Category "Category does not exist" Error

**Problem:** `EntryModal.tsx` shows a free-text input for custom category names, but `createLedgerEntry` in `server/actions/accounting.ts:344` rejects any name not already in the `accounting_category` table. The UX implies custom categories work, but the server rejects them.

**Root Cause:** The server action does a strict name lookup. The UI allows typing any name. These are misaligned.

**Solution:** When a user types a custom category name that doesn't exist, auto-create it on the server side during entry creation. The category type will be inferred from the entry type.

**Files:**
- Modify: `server/actions/accounting.ts:336-356` -- Add auto-create logic for unknown categories

**Step 1: Update category validation in createLedgerEntry to auto-create unknown categories**

In `server/actions/accounting.ts`, replace lines 336-356 with:

```typescript
// Validate category if provided
if (payload.category) {
    let categoryCheck = await db
        .select()
        .from(accountingCategory)
        .where(eq(accountingCategory.name, payload.category))
        .limit(1)

    if (categoryCheck.length === 0) {
        // Auto-create the category with type matching the entry type
        const [newCategory] = await db
            .insert(accountingCategory)
            .values({
                name: sanitizeText(payload.category),
                type: payload.entry_type,
                isActive: true,
            })
            .returning()

        categoryCheck = [newCategory]

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'ACCOUNTING',
                message: `Auto-created category: ${payload.category} (${payload.entry_type})`,
            }]
        })
    }

    if (!categoryCheck[0].isActive) {
        return failure('Category is archived and cannot be used')
    }

    if (categoryCheck[0].type !== payload.entry_type) {
        return failure(`Category "${payload.category}" is a ${categoryCheck[0].type} category but this entry is ${payload.entry_type}`)
    }
}
```

**Step 2: Verify the same fix is needed in updateLedgerEntry**

Check `server/actions/accounting.ts` `updateLedgerEntry` function for similar category validation. Apply the same auto-create pattern if it validates categories on update.

**Step 3: Verify the same fix is needed in CSV import**

Check `server/actions/accounting-import.ts` for category validation. Apply auto-create for unknown categories during import as well.

**Step 4: Run lint**

```bash
bun run lint
```

**Step 5: Commit**

```bash
git add server/actions/accounting.ts server/actions/accounting-import.ts
git commit -m "fix(accounting): auto-create unknown categories instead of rejecting"
```

---

### Task 2: Fix Password Change Not Working

**Problem:** Admin password reset on user detail page fails. The `updatePassword` function in `server/actions/profile.ts:398` calls `auth.api.changePassword()` with `currentPassword: ""`, which Better-Auth rejects because it expects the user's actual current password.

**Root Cause:** `changePassword` is designed for users changing their own password. For admin resets, Better-Auth provides `admin.setUserPassword` through the admin plugin.

**Files:**
- Modify: `server/actions/profile.ts:398-425` -- Use admin API for password reset

**Step 1: Replace changePassword with admin setUserPassword**

In `server/actions/profile.ts`, replace the `updatePassword` function:

```typescript
export async function updatePassword({ _userId, _newPassword, _updatedBy }: { _userId: string, _newPassword: string, _updatedBy: string }): Promise<boolean> {
    try {
        // Validate password strength
        const passwordValidation = PasswordStrengthSchema.safeParse(_newPassword)
        if (!passwordValidation.success) {
            await logError({
                type: 'AUTH',
                message: `Password update failed: does not meet security requirements`
            })
            return false
        }

        // Use admin API to set password without requiring current password
        await auth.api.setUserPassword({
            body: {
                userId: _userId,
                newPassword: _newPassword,
            },
            headers: await headers()
        })

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'AUTH',
                message: `Password reset for user ${_userId} by ${_updatedBy}`,
            }]
        })

        return true
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error updating password: ${error instanceof Error ? error.message : String(error)}`
        })
        return false
    }
}
```

**Step 2: Verify Better-Auth admin plugin is configured**

Check `server/auth.ts` to confirm the `admin()` plugin is included and has the necessary permissions for `setUserPassword`.

**Step 3: Run lint**

```bash
bun run lint
```

**Step 4: Commit**

```bash
git add server/actions/profile.ts
git commit -m "fix(auth): use admin API for password reset instead of changePassword"
```

---

### Task 3: Fix getLedgerSummary Ignoring Branch Filter

**Problem:** The accounting page summary cards (Total Debits, Total Credits, Balance) always show totals across ALL branches, even when the ledger table is filtered to a specific branch. The `getLedgerSummary` function doesn't accept a `branchId` parameter.

**Files:**
- Modify: `server/actions/accounting.ts:764-850` -- Add branchId parameter
- Modify: `app/accounting/accountingPage.tsx:152-156` -- Pass currentBranch?.id
- Modify: `components/metrics/businessInsights.tsx:195` -- Pass branchId to getLedgerSummary

**Step 1: Add branchId to getLedgerSummary function signature**

In `server/actions/accounting.ts`, change the function signature:

```typescript
export async function getLedgerSummary(
    datePreset?: DateRangePreset,
    startDate?: string,
    endDate?: string,
    branchId?: string
): Promise<ActionResponse<LedgerSummary>> {
```

Then add branch filtering to the conditions array (after line 796):

```typescript
if (branchId) {
    conditions.push(eq(generalLedger.branchId, branchId))
}
```

**Step 2: Update accounting page to pass branchId**

In `app/accounting/accountingPage.tsx`, change the `getLedgerSummary` call at line 152:

```typescript
getLedgerSummary(
    datePreset,
    customStartDate,
    customEndDate,
    currentBranch?.id
),
```

**Step 3: Update businessInsights to pass branchId**

In `components/metrics/businessInsights.tsx`, change line 195:

```typescript
getLedgerSummary(timeframe, startDate, endDate, branchId),
```

**Step 4: Run lint**

```bash
bun run lint
```

**Step 5: Commit**

```bash
git add server/actions/accounting.ts app/accounting/accountingPage.tsx components/metrics/businessInsights.tsx
git commit -m "fix(accounting): add branch filtering to getLedgerSummary"
```

---

### Task 4: Fix Metrics Branch Selection Not Working

**Problem:** The `BranchSelectorInline` on the metrics page has an `onChange` handler that does nothing (`// Branch context handles the change internally`). The branch selector doesn't actually update the global branch context.

**Files:**
- Modify: `app/metrics/metricsPage.tsx:47-53` -- Wire onChange to update branch context

**Step 1: Fix the branch selector onChange handler**

In `app/metrics/metricsPage.tsx`, the `BranchSelectorInline` uses the `onChange` prop from `BranchSelectorInline` which returns `(value: string | null, isShared: boolean)`. But we need to update the global branch context. Replace lines 47-53:

```typescript
<div className='ml-auto'>
    <BranchSelectorInline
        value={currentBranch?.id}
        onChange={(branchId) => {
            if (branchId === null) {
                setCurrentBranch(null)
            } else {
                const branch = branches.find(b => b.id === branchId)
                if (branch) setCurrentBranch(branch)
            }
        }}
        showSharedOption={true}
    />
</div>
```

Also update the destructured context at line 16 to include `setCurrentBranch` and `branches`:

```typescript
const { currentBranch, setCurrentBranch, branches } = useBranchContext()
```

**Step 2: Run lint**

```bash
bun run lint
```

**Step 3: Commit**

```bash
git add app/metrics/metricsPage.tsx
git commit -m "fix(metrics): wire branch selector to actually update branch context"
```

---

### Task 5: Fix Auto Ledger Entries Missing branch_id

**Problem:** Auto ledger entries created from payroll (`server/actions/payroll.ts:994`) and inventory restock (`server/actions/inventory.ts:890`) do not pass `branch_id`. The `createAutoLedgerEntry` function signature doesn't even accept `branch_id`. This means these entries will never appear when filtering by branch.

**Files:**
- Modify: `server/actions/accounting.ts:495-508` -- Add branchId to createAutoLedgerEntry
- Modify: `server/actions/payroll.ts:~983-1005` -- Pass branchId
- Modify: `server/actions/inventory.ts:~880-909` -- Pass branchId

**Step 1: Add branchId to createAutoLedgerEntry**

In `server/actions/accounting.ts`, update the function signature and insert:

```typescript
export async function createAutoLedgerEntry(
    source: LedgerSourceType,
    sourceId: string,
    entryData: {
        entry_date: Date
        entry_type: LedgerEntryType
        category?: string
        description: string
        reference?: string
        debit: number
        credit: number
        branch_id?: string | null
    },
    userId: string,
    tx?: TransactionClient
): Promise<ActionResponse<void>> {
    const dbClient = tx || db
    try {
        await dbClient.insert(generalLedger).values({
            entryDate: entryData.entry_date,
            entryType: entryData.entry_type,
            category: entryData.category,
            description: sanitizeText(entryData.description),
            reference: entryData.reference ? sanitizeMinimal(entryData.reference) : null,
            debit: String(entryData.debit),
            credit: String(entryData.credit),
            branchId: entryData.branch_id || null,
            sourceType: source,
            sourceId: sourceId,
            createdBy: userId,
        })
        // ... rest unchanged
```

**Step 2: Pass branch_id from payroll auto-entry**

In `server/actions/payroll.ts`, find where `createAutoLedgerEntry` is called and add `branch_id` to the entryData. The branch should come from the payroll entry or the artist's branch.

**Step 3: Pass branch_id from inventory auto-entry**

In `server/actions/inventory.ts`, find where `createAutoLedgerEntry` is called and add `branch_id` to the entryData. The branch should come from the inventory item's branch_id.

**Step 4: Run lint**

```bash
bun run lint
```

**Step 5: Commit**

```bash
git add server/actions/accounting.ts server/actions/payroll.ts server/actions/inventory.ts
git commit -m "fix(accounting): add branch_id to auto ledger entries from payroll and inventory"
```

---

### Task 6: Fix Accounting Period Lock Not Enforced on Create

**Problem:** `createLedgerEntry` does not check the accounting period lock, but `updateLedgerEntry` and `voidLedgerEntry` do. Entries can be created for locked periods.

**Files:**
- Modify: `server/actions/accounting.ts:292-426` -- Add period lock check

**Step 1: Add period lock check to createLedgerEntry**

In `server/actions/accounting.ts`, add after the date validation (line 334), before category validation:

```typescript
// Check accounting period lock
const periodLocked = await getAccountingPeriodLock()
if (periodLocked) {
    const lockDate = new Date(periodLocked)
    if (entryDate <= lockDate) {
        return failure('Cannot create entries for locked accounting periods')
    }
}
```

Verify `getAccountingPeriodLock` is imported (it's defined in `server/actions/settings.ts`).

**Step 2: Run lint**

```bash
bun run lint
```

**Step 3: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): enforce period lock on entry creation"
```

---

### Task 7: Fix Case-Sensitive Category Name Uniqueness

**Problem:** Category creation uses case-sensitive uniqueness check (`eq(accountingCategory.name, name)`), allowing "Rent" and "rent" as separate categories. But CSV import normalizes to lowercase for comparison, causing import failures for case mismatches.

**Files:**
- Modify: `server/actions/accounting.ts:1109-1116` -- Use case-insensitive check
- Modify: `server/actions/accounting.ts:~1190-1200` -- Same for update

**Step 1: Use case-insensitive uniqueness check**

In `server/actions/accounting.ts`, find the duplicate name check in `createAccountingCategory` and change:

```typescript
// Before:
.where(eq(accountingCategory.name, sanitizedName))

// After:
.where(sql`LOWER(${accountingCategory.name}) = LOWER(${sanitizedName})`)
```

Apply the same change in `updateAccountingCategory` if it also checks for duplicate names.

**Step 2: Run lint**

```bash
bun run lint
```

**Step 3: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): use case-insensitive category name uniqueness check"
```

---

### Task 8: Fix getLedgerEntry Missing branchId in Response

**Problem:** `getLedgerEntry` (single entry) does not include `branchId` in its transformed response object, while `getLedgerEntries` (list) does. This causes the edit modal to lose branch info.

**Files:**
- Modify: `server/actions/accounting.ts:260-280` -- Add branchId to transformedEntry

**Step 1: Add branchId to the transformedEntry object**

In `server/actions/accounting.ts`, find the `getLedgerEntry` function and add `branchId` to the `transformedEntry` object:

```typescript
branchId: entry.branchId,
```

**Step 2: Run lint**

```bash
bun run lint
```

**Step 3: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): include branchId in getLedgerEntry response"
```

---

### Task 9: Fix createJournalEntry Hardcoded to ASSET Type

**Problem:** `createJournalEntry` hardcodes `entryType: 'ASSET'` for all lines (line 471), making it unusable for non-asset journal entries.

**Files:**
- Modify: `server/actions/accounting.ts:428-493` -- Accept entry type per line

**Step 1: Update createJournalEntry to accept entry type per line**

Modify the `JournalEntryLine` type to include `entry_type`:

```typescript
type JournalEntryLine = {
    description: string
    category?: string
    debit: number
    credit: number
    entry_type: LedgerEntryType
}
```

Then use `line.entry_type` instead of the hardcoded `'ASSET'` in the insert loop.

**Step 2: Run lint**

```bash
bun run lint
```

**Step 3: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): remove hardcoded ASSET type from journal entries"
```

---

## Phase 2: Accounting Standards Overhaul

### Task 10: Refactor Debit/Credit Semantics to Follow Double-Entry Standards

**Problem:** The current system uses "debit = money going out, credit = money coming in" which is incorrect per accounting standards. In proper double-entry bookkeeping:
- **Assets**: Debit = increase, Credit = decrease
- **Liabilities**: Credit = increase, Debit = decrease
- **Equity**: Credit = increase, Debit = decrease
- **Revenue**: Credit = increase, Debit = decrease
- **Expenses**: Debit = increase, Credit = decrease

The current system conflates entry type (EXPENSE/REVENUE) with debit/credit direction. A REVENUE entry with `credit: 5000` is correct, but the label "Money coming in" is a simplification that breaks when dealing with assets and liabilities.

**Approach:** Keep the current debit/credit fields (they're correct at the DB level for REVENUE and EXPENSE entries). Fix the UI labels, add proper accounting logic for ASSET/LIABILITY/EQUITY types, and ensure auto-entries follow correct debit/credit conventions.

**Files:**
- Modify: `components/accounting/EntryModal.tsx:404-454` -- Fix labels based on entry type
- Modify: `server/actions/accounting.ts` -- Update validation logic
- Modify: `server/actions/transactions.ts:208-230` -- Ensure correct debit/credit for sales
- Modify: `server/actions/transactions.ts:576-591` -- Ensure correct debit/credit for refunds

**Step 1: Update EntryModal labels to be context-aware**

In `components/accounting/EntryModal.tsx`, change the debit/credit labels to be dynamic based on selected entry type:

```typescript
// Helper to get appropriate labels based on entry type
const getDebitCreditLabels = (entryType: LedgerEntryType) => {
    switch (entryType) {
        case 'EXPENSE':
            return { debitLabel: 'Expense (Debit)', creditLabel: 'Reduction (Credit)' }
        case 'REVENUE':
            return { debitLabel: 'Reduction (Debit)', creditLabel: 'Income (Credit)' }
        case 'ASSET':
            return { debitLabel: 'Asset Increase (Debit)', creditLabel: 'Asset Decrease (Credit)' }
        case 'LIABILITY':
            return { debitLabel: 'Liability Decrease (Debit)', creditLabel: 'Liability Increase (Credit)' }
        case 'EQUITY':
            return { debitLabel: 'Equity Decrease (Debit)', creditLabel: 'Equity Increase (Credit)' }
        default:
            return { debitLabel: 'Debit', creditLabel: 'Credit' }
    }
}
```

**Step 2: Verify auto-entry debit/credit directions are correct**

Current auto-entries:
- Sale: `credit: total` with type REVENUE -- CORRECT (revenue increases with credit)
- Refund: `debit: refundAmount` with type EXPENSE -- CORRECT (expense increases with debit)
- Payroll: `debit: totalArtistCut` with type EXPENSE -- CORRECT
- Inventory restock: `debit: total_amount` with type EXPENSE -- CORRECT

All auto-entries follow correct conventions. No changes needed.

**Step 3: Run lint**

```bash
bun run lint
```

**Step 4: Commit**

```bash
git add components/accounting/EntryModal.tsx
git commit -m "fix(accounting): use proper double-entry debit/credit labels per entry type"
```

---

### Task 11: Add Standard Account Categories on First Setup

**Problem:** Auto-entries use hardcoded category names ("SALES", "REFUNDS", "PAYROLL", "INVENTORY_PURCHASE") that may not exist in the `accounting_category` table. If they don't exist, `createAutoLedgerEntry` inserts them without validation (it doesn't check), but if a user later tries to view or edit these entries, the category validation will fail.

**Solution:** Ensure standard categories exist via a seed/migration script, and add validation in `createAutoLedgerEntry`.

**Files:**
- Create: `scripts/seed-accounting-categories.ts` -- Seed standard categories
- Modify: `server/actions/accounting.ts:495-543` -- Add category validation to auto-entry

**Step 1: Create seed script for standard accounting categories**

Create `scripts/seed-accounting-categories.ts` with the following standard categories:

```typescript
// Standard categories following accounting conventions
const STANDARD_CATEGORIES = [
    // Revenue categories
    { name: 'SALES', type: 'REVENUE' },
    { name: 'SERVICE_INCOME', type: 'REVENUE' },
    { name: 'OTHER_INCOME', type: 'REVENUE' },

    // Expense categories
    { name: 'PAYROLL', type: 'EXPENSE' },
    { name: 'INVENTORY_PURCHASE', type: 'EXPENSE' },
    { name: 'REFUNDS', type: 'EXPENSE' },
    { name: 'RENT', type: 'EXPENSE' },
    { name: 'UTILITIES', type: 'EXPENSE' },
    { name: 'SUPPLIES', type: 'EXPENSE' },
    { name: 'MARKETING', type: 'EXPENSE' },
    { name: 'MAINTENANCE', type: 'EXPENSE' },
    { name: 'INSURANCE', type: 'EXPENSE' },
    { name: 'TAXES', type: 'EXPENSE' },
    { name: 'OTHER_EXPENSE', type: 'EXPENSE' },

    // Asset categories
    { name: 'CASH', type: 'ASSET' },
    { name: 'BANK', type: 'ASSET' },
    { name: 'ACCOUNTS_RECEIVABLE', type: 'ASSET' },
    { name: 'EQUIPMENT', type: 'ASSET' },

    // Liability categories
    { name: 'ACCOUNTS_PAYABLE', type: 'LIABILITY' },
    { name: 'LOANS', type: 'LIABILITY' },

    // Equity categories
    { name: 'OWNER_EQUITY', type: 'EQUITY' },
    { name: 'RETAINED_EARNINGS', type: 'EQUITY' },
]
```

Each category is inserted with `ON CONFLICT DO NOTHING` (or equivalent Drizzle upsert) to avoid duplicates.

**Step 2: Add category validation to createAutoLedgerEntry**

In `server/actions/accounting.ts`, update `createAutoLedgerEntry` to validate the category exists and auto-create if not:

```typescript
// After line 510, before the insert:
if (entryData.category) {
    let category = await dbClient
        .select()
        .from(accountingCategory)
        .where(eq(accountingCategory.name, entryData.category))
        .limit(1)

    if (category.length === 0) {
        // Auto-create standard category
        await dbClient
            .insert(accountingCategory)
            .values({
                name: entryData.category,
                type: entryData.entry_type,
                isActive: true,
            })
    }
}
```

**Step 3: Run lint**

```bash
bun run lint
```

**Step 4: Commit**

```bash
git add scripts/seed-accounting-categories.ts server/actions/accounting.ts
git commit -m "feat(accounting): add standard categories seed and auto-create in auto-entries"
```

---

## Phase 3: Hourly Services & Custom Pricing

### Task 12: Enhance Hourly Service Support in Service Management UI

**Problem:** The schema already supports `pricingType: 'HOURLY'` with `hourlyRate`, but the service creation/editing UI may not expose these fields properly. Need to verify and enhance the service management forms.

**Files:**
- Inspect: `app/inventory/` or wherever service management lives
- Inspect: `server/actions/services.ts:207-273` -- createService/updateService

**Step 1: Verify service creation form includes pricing type and hourly rate**

Search for the service creation/editing modal or form. Ensure it has:
- A dropdown/selector for `pricing_type` (FIXED / HOURLY)
- A `price` field labeled "Base Price"
- A conditional `hourly_rate` field shown when HOURLY is selected

If these fields are missing from the UI, add them.

**Step 2: Verify createService/updateService handle pricing_type and hourly_rate**

Check `server/actions/services.ts` to ensure the payload includes these fields and they're correctly inserted/updated.

**Step 3: Run lint**

```bash
bun run lint
```

**Step 4: Commit**

```bash
git add <modified files>
git commit -m "feat(services): enhance hourly service UI with base price and per-hour rate fields"
```

---

### Task 13: Add Custom Price Override in Sales Cart

**Problem:** Staff cannot override the price of a service or inventory item during a sale. The `CartItem.unit_price` is set once when added to cart and is immutable. Staff need the ability to set a custom price per item (e.g., a 2000 service can be sold for 1500 or 2500).

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:51-62` -- Add `custom_price` to CartItem
- Modify: `components/sales/layout/CartPanel.tsx` -- Add price edit UI per cart item
- Modify: `components/sales/context/SalesContext.tsx:583-598` -- Use custom_price in total calc

**Step 1: Add custom_price field to CartItem interface**

In `components/sales/context/SalesContext.tsx`, update CartItem:

```typescript
export interface CartItem {
    id: string
    type: "INVENTORY" | "SERVICE"
    name: string
    unit_price: number
    original_price: number  // NEW: stores the original price for reference
    custom_price?: number   // NEW: user-overridden price
    quantity: number
    max_quantity?: number
    pricing_type?: "FIXED" | "HOURLY"
    hourly_rate?: number
    start_time?: string
    end_time?: string
}
```

**Step 2: Set original_price when adding to cart**

In `addToCart`, set both `unit_price` and `original_price`:

```typescript
const newItem: CartItem = {
    // ... existing fields
    unit_price: type === "INVENTORY"
        ? (item as InventoryItem).selling_price || 0
        : (item as ServiceWithItems).price,
    original_price: type === "INVENTORY"
        ? (item as InventoryItem).selling_price || 0
        : (item as ServiceWithItems).price,
    // ... rest
}
```

**Step 3: Add updateCustomPrice function**

```typescript
const updateCustomPrice = (id: string, newPrice: number) => {
    setCart((prev) =>
        prev.map((item) => {
            if (item.id !== id) return item
            if (newPrice < 0) return item
            return {
                ...item,
                custom_price: newPrice,
                unit_price: newPrice,
            }
        }),
    )
}
```

**Step 4: Update grossTotal calculation to use unit_price (which reflects custom_price)**

The grossTotal already uses `item.unit_price`, so if `custom_price` updates `unit_price`, the calculation automatically works. No change needed in the total calculation.

**Step 5: Add price edit UI in CartPanel**

In `components/sales/layout/CartPanel.tsx`, add an editable price field per cart item. Show the original price as a strikethrough when custom_price differs:

```tsx
<div className='flex items-center gap-1'>
    {item.custom_price !== undefined && item.custom_price !== item.original_price && (
        <span className='text-white/40 line-through text-xs'>
            {currencySymbol}{item.original_price.toFixed(2)}
        </span>
    )}
    <input
        type='number'
        value={item.unit_price}
        onChange={(e) => updateCustomPrice(item.id, parseFloat(e.target.value) || 0)}
        className='w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right'
        min='0'
        step='0.01'
    />
</div>
```

**Step 6: Expose updateCustomPrice from SalesContext**

Add `updateCustomPrice` to the context value and the SalesContextType interface.

**Step 7: Run lint**

```bash
bun run lint
```

**Step 8: Commit**

```bash
git add components/sales/context/SalesContext.tsx components/sales/layout/CartPanel.tsx
git commit -m "feat(sales): add custom price override per cart item"
```

---

### Task 14: Ensure Custom Price Persists in Transaction Records

**Problem:** When a custom price is used, the transaction items must store the actual price paid (not the original service/inventory price). The payroll calculation must also use the actual amount.

**Files:**
- Verify: `server/actions/transactions.ts:136-148` -- Transaction items use `item.unit_price` from payload
- Verify: `server/actions/transactions.ts:184-205` -- Payroll uses `item.unit_price`

**Step 1: Verify transaction items use the correct price**

The `createTransaction` function already uses `item.unit_price` from the payload, which comes from the cart's `unit_price`. Since we update `unit_price` when a custom price is set, this should work correctly. No code change needed.

**Step 2: Verify payroll uses the correct amount**

The payroll calculation at line 193 uses `item.quantity * item.unit_price`. Since `unit_price` reflects the custom price, payroll will correctly calculate based on the actual sale amount. No code change needed.

**Step 3: Add custom_price metadata to transaction items**

For audit purposes, store the original price alongside the custom price. Update the transaction items insert to include a note or metadata field showing if a custom price was used.

**Step 4: Commit (if changes made)**

```bash
git add <modified files>
git commit -m "fix(sales): ensure custom prices persist correctly in transactions and payroll"
```

---

## Phase 4: Audit & Hardening

### Task 15: Audit Transaction Flow End-to-End

**Problem:** Reports of "transactions do not reflect." Need to trace the full flow from cart to ledger.

**Steps:**
1. Verify `createTransaction` in `server/actions/transactions.ts` properly creates all records
2. Verify the accounting auto-entry is created with correct source reference
3. Verify `getTransactions` properly filters and returns data
4. Verify the sales page's `RecentTransactions` properly displays results
5. Check that branch filtering in `getTransactions` works correctly

**Files to audit:**
- `server/actions/transactions.ts` -- Full file
- `components/sales/context/SalesContext.tsx` -- handleCheckout flow
- `app/sales/salesPage.tsx` -- RecentTransactions display

**Commit any fixes found.**

---

### Task 16: Audit Branch Filtering Across All Modules

**Problem:** Branch selection is inconsistent across the app. Some queries filter by branch, others don't.

**Steps:**
1. Audit `getLedgerEntries` -- verify branchId filter works (DONE in Task 3)
2. Audit `getLedgerSummary` -- verify branchId filter works (DONE in Task 3)
3. Audit `getTransactions` -- verify branchId filter works
4. Audit `getScopedFinancialMetrics` -- verify branchId filter works
5. Audit `getNetIncomeMetrics` -- verify branchId filter works
6. Audit `getArtistLeaderboard` -- verify branchId filter works
7. Audit `getOperationalMetrics` -- verify branchId filter works
8. Check the accounting page -- verify branch selector is visible and functional
9. Check if there's a way to change branch from accounting page

**Files to audit:**
- `server/actions/metrics.ts` -- All metric functions
- `server/actions/transactions.ts` -- getTransactions
- `app/accounting/accountingPage.tsx` -- Branch selector presence

**Commit any fixes found.**

---

### Task 17: Audit Accounting Entry Display and "No Entries Found" Issue

**Problem:** Existing credits tracked but showing "no entries found."

**Steps:**
1. Check `getLedgerEntries` pagination logic -- is `total` calculated correctly?
2. Check if voided entries are accidentally excluded when they shouldn't be
3. Check if the search filter is over-filtering results (server-side + client-side double search)
4. Check if the date range default ("this_month") might be excluding older entries
5. Verify the `branchId` filter isn't excluding entries with null branch_id

**Key issue:** If `currentBranch?.id` is set but entries have `branchId: null` (from auto-entries before the fix in Task 5), those entries will be excluded. This is the likely cause of "no entries found."

**Fix:** When filtering by branch, also include entries with `branchId: null` (shared/unassigned entries):

```typescript
if (options.branchId) {
    conditions.push(
        or(
            eq(generalLedger.branchId, options.branchId),
            isNull(generalLedger.branchId)
        )
    )
}
```

Import `or` and `isNull` from `drizzle-orm`.

**Commit any fixes found.**

---

### Task 18: Add Branch Selector to Accounting Page

**Problem:** "No way to change what branch for accounting" -- The accounting page uses `useBranchContext()` but may not have a visible branch selector UI.

**Files:**
- Verify: `app/accounting/accountingPage.tsx` -- Check for BranchSelector in the page header

**Step 1: Check if BranchSelector exists in accounting page**

If not present, add the `BranchSelector` component to the accounting page header, similar to how it's done in the sales page:

```tsx
<BranchSelector showAllOption={true} className='w-48' />
```

**Step 2: Commit if changes needed**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "feat(accounting): add branch selector to accounting page header"
```

---

### Task 19: Remove Double Search in Accounting Page

**Problem:** The accounting page performs server-side search (passing `search` to `getLedgerEntries`) AND then filters results again client-side with the same `searchQuery`. This is redundant and can cause inconsistencies.

**Files:**
- Modify: `app/accounting/accountingPage.tsx:317-327` -- Remove client-side search filter

**Step 1: Remove the client-side search filter**

Since the server already handles search, remove the redundant client-side filter. Keep only the server-side search.

**Step 2: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "fix(accounting): remove redundant client-side search filter"
```

---

### Task 20: Replace console.log with createLogs

**Problem:** `console.log` and `console.error` are used in production code, violating project guidelines.

**Files:**
- Modify: `app/accounting/accountingPage.tsx:182`
- Modify: `server/actions/accounting-import.ts:289`

**Step 1: Replace all console.log/console.error with createLogs**

```typescript
// Before:
console.error('Error:', error)

// After:
await logError({
    type: 'ACCOUNTING',
    message: `Error: ${error instanceof Error ? error.message : String(error)}`
})
```

**Step 2: Commit**

```bash
git add app/accounting/accountingPage.tsx server/actions/accounting-import.ts
git commit -m "fix: replace console.log with createLogs per project guidelines"
```

---

### Task 21: CSV Import Category Type Validation

**Problem:** CSV import (`accounting-import.ts`) validates category existence but does NOT validate that category type matches entry type, unlike `createLedgerEntry` which does.

**Files:**
- Modify: `server/actions/accounting-import.ts` -- Add category type validation

**Step 1: Add category type match validation during import**

After checking category exists, also check that `category.type === entry.entry_type`. If mismatched, add to errors array.

**Step 2: Commit**

```bash
git add server/actions/accounting-import.ts
git commit -m "fix(accounting): validate category type matches entry type during CSV import"
```

---

## Summary of All Files Modified

| File | Tasks |
|------|-------|
| `server/actions/accounting.ts` | 1, 3, 5, 6, 7, 8, 9, 11 |
| `server/actions/profile.ts` | 2 |
| `app/accounting/accountingPage.tsx` | 3, 17, 18, 19, 20 |
| `app/metrics/metricsPage.tsx` | 4 |
| `server/actions/payroll.ts` | 5 |
| `server/actions/inventory.ts` | 5 |
| `components/accounting/EntryModal.tsx` | 10 |
| `components/sales/context/SalesContext.tsx` | 13, 14 |
| `components/sales/layout/CartPanel.tsx` | 13 |
| `components/metrics/businessInsights.tsx` | 3 |
| `server/actions/accounting-import.ts` | 1, 20, 21 |
| `scripts/seed-accounting-categories.ts` | 11 (new) |

## Verification Checklist

After all tasks are complete:

1. `bun run lint` -- No errors
2. `bun run build` -- Successful production build
3. Manual testing:
   - Create a custom category via EntryModal -- should work without "Category does not exist" error
   - Change a user's password from admin panel -- should succeed
   - Filter accounting by branch -- summary cards should match filtered entries
   - Switch branch on metrics page -- all metrics should update
   - Create hourly service with base price and hourly rate -- should save correctly
   - Add service to cart, override price -- total should reflect custom price
   - Complete a sale with custom price -- transaction and accounting entries should use custom price
   - Check accounting entries for existing credits -- should display correctly
   - Verify branch selector is visible on accounting page
