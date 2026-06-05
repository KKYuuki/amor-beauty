# Payment Methods, Accounting & Payroll Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive payment method support across accounting, metrics, and payroll with branch auditing, staggered payments, duplicate prevention, and enhanced export/filtering.

**Architecture:** Extend existing Drizzle schema with new columns on `generalLedger`, `payrollRequest`, and `payrollDeductions`. Add a new `payrollDisbursement` table. Introduce a canonical `AccountingPaymentMethod` type to unify payment methods. Update TypeScript types, Zod schemas, server actions, and UI components across 3 pages (accounting, payroll, metrics).

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Supabase/PostgreSQL, Tailwind CSS 4, Motion

**Task Dependency Graph:**
```
Task 1 (Schema) ──┬──> Task 2 (Branch Audit)
                  ├──> Task 3 (Payment Method in Accounting)
                  ├──> Task 4 (Payment Method in Export)
                  ├──> Task 5 (Payroll Type + Duplicate Prevention)
                  ├──> Task 6 (Payroll Reference/Proof)
                  └──> Task 7 (Staggered Payments)
                        └──> Task 8 (Payroll Confirm Flow)
                              └──> Task 9 (Scheduled Payments)
                                    └──> Task 10 (Metrics)
                                          └──> Task 11 (Lint/Build)
```

Tasks 2-7 can run in parallel after Task 1 completes. Tasks 8-11 are sequential.

---

## Phase 1: Foundation — Schema & Types (Task 1)

### Task 1: Create Payment Method Types & Update DB Schema

**Files:**
- Create: `utils/types/payment.ts`
- Modify: `server/db/schema/accounting.ts`
- Modify: `server/db/schema/payroll.ts`

**Context:** The system currently has two separate `PaymentMethod` types:
- Transactions (`utils/types/transactions.ts` line 6): `'CASH' | 'CARD' | 'GCASH' | 'PAYMAYA' | 'SPLIT'`
- Payroll (`utils/types/payroll.ts` line 24): `'CASH' | 'GCASH' | 'MAYA' | 'BANK'`

The `generalLedger` table has NO `payment_method` column. The `payrollRequest` table has `paymentMethod` at line 132 but only for `'CASH' | 'GCASH' | 'MAYA | 'BANK'`. The user wants: Cash, Card, Bank Transfer/QR, GCash, Crypto.

**IMPORTANT — Backward Compatibility:** The DB column `payroll_request.payment_method` already stores values like `'BANK'`. We cannot rename this to `'BANK_TRANSFER'` without a data migration. The plan handles this by: keeping `'BANK'` in payroll types (for existing records) and adding `'BANK_TRANSFER'` as a new value alongside `'BANK'`. The UI shows "Bank Transfer / QR" for both. Alternatively, write a migration SQL to rename `'BANK'` → `'BANK_TRANSFER'` in existing rows. The cleanest approach: migrate the data. Include the migration SQL.

**Step 1: Create `utils/types/payment.ts`**

Create the file with exact content:

```typescript
// Unified Payment Method Types
// These are the canonical payment methods used across the app.

// Accounting & general ledger entries
export type AccountingPaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'GCASH' | 'CRYPTO'

export const ACCOUNTING_PAYMENT_METHODS: { key: AccountingPaymentMethod; label: string; description: string }[] = [
    { key: 'CASH', label: 'Cash', description: 'Physical cash payment' },
    { key: 'CARD', label: 'Card', description: 'Debit or credit card' },
    { key: 'BANK_TRANSFER', label: 'Bank Transfer / QR', description: 'Bank transfer or QR code payment' },
    { key: 'GCASH', label: 'GCash', description: 'GCash mobile payment' },
    { key: 'CRYPTO', label: 'Crypto', description: 'Cryptocurrency payment' },
]

export const ACCOUNTING_PAYMENT_METHOD_COLORS: Record<AccountingPaymentMethod, string> = {
    CASH: 'bg-green-400/20 text-green-300 border-green-400/30',
    CARD: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
    BANK_TRANSFER: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
    GCASH: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/30',
    CRYPTO: 'bg-orange-400/20 text-orange-300 border-orange-400/30',
}

// Payroll disbursement payment methods (must include existing DB values + new ones)
// NOTE: 'BANK' is kept for backward compat with existing DB rows. UI labels it as "Bank Transfer".
// After migration, 'BANK' will no longer appear in new records — use 'BANK_TRANSFER' instead.
export type PayrollPaymentMethod = 'CASH' | 'GCASH' | 'MAYA' | 'BANK' | 'BANK_TRANSFER' | 'CARD' | 'CRYPTO'

export const PAYROLL_PAYMENT_METHODS: { key: PayrollPaymentMethod; label: string }[] = [
    { key: 'CASH', label: 'Cash' },
    { key: 'GCASH', label: 'GCash' },
    { key: 'MAYA', label: 'Maya' },
    { key: 'BANK_TRANSFER', label: 'Bank Transfer / QR' },
    { key: 'CARD', label: 'Card (Debit/Credit)' },
    { key: 'CRYPTO', label: 'Crypto' },
]

export const PAYROLL_PAYMENT_METHOD_COLORS: Record<PayrollPaymentMethod, string> = {
    CASH: 'bg-green-400/20 text-green-300 border-green-400/30',
    GCASH: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/30',
    MAYA: 'bg-pink-400/20 text-pink-300 border-pink-400/30',
    BANK: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
    BANK_TRANSFER: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
    CARD: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
    CRYPTO: 'bg-orange-400/20 text-orange-300 border-orange-400/30',
}

// Helper: map any payment method string to its display label
export function getAccountingPaymentMethodLabel(method: string | null | undefined): string {
    if (!method) return 'Unspecified'
    const found = ACCOUNTING_PAYMENT_METHODS.find(m => m.key === method)
    return found?.label || method
}

export function getPayrollPaymentMethodLabel(method: string | null | undefined): string {
    if (!method) return 'Unspecified'
    const found = PAYROLL_PAYMENT_METHODS.find(m => m.key === method)
    return found?.label || method
}

// Map transaction payment method to accounting payment method (for auto-populating ledger)
export function mapTransactionToAccountingPaymentMethod(method: string | null | undefined): AccountingPaymentMethod | undefined {
    if (!method) return undefined
    switch (method) {
        case 'CASH': return 'CASH'
        case 'CARD': return 'CARD'
        case 'GCASH': return 'GCASH'
        case 'PAYMAYA': return 'CARD' // Maya/PayMaya cards map to CARD
        case 'BANK_TRANSFER': return 'BANK_TRANSFER'
        case 'SPLIT': return undefined // SPLIT payments don't map to a single method
        default: return undefined
    }
}
```

**Step 2: Add `payment_method` column to `generalLedger` table**

In `server/db/schema/accounting.ts`, after the `branchId` column at line 67, add:

```typescript
    // Payment Method (added for payment method tracking)
    paymentMethod: varchar('payment_method', { length: 50 }),
    // Method: 'CASH', 'CARD', 'BANK_TRANSFER', 'GCASH', 'CRYPTO'
```

In the indexes function (line 68-76), add:

```typescript
    paymentMethodIdx: index('idx_gl_payment_method').on(table.paymentMethod),
```

**Step 3: Add `referenceNumber` and `proofUrl` to `payrollRequest` table**

In `server/db/schema/payroll.ts`, after the `notes` column at line 142, add:

```typescript
    // Disbursement Reference & Proof
    referenceNumber: varchar('reference_number', { length: 255 }),
    proofUrl: varchar('proof_url', { length: 512 }),
```

**Step 4: Create `payrollDisbursement` table for staggered payments**

In `server/db/schema/payroll.ts`, after the `payrollDeductionsRelations` definition (line 255), add:

```typescript
// ============================================================================
// PAYROLL DISBURSEMENTS (Staggered Payments)
// ============================================================================

export const payrollDisbursement = pgTable('payroll_disbursement', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    
    // Parent request
    requestId: uuid('request_id').notNull().references(() => payrollRequest.id, { onDelete: 'cascade' }),
    
    // Disbursement details
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paymentMethod: varchar('payment_method', { length: 50 }).notNull(),
    // Method: 'CASH', 'GCASH', 'MAYA', 'BANK_TRANSFER', 'CARD', 'CRYPTO'
    
    // Reference & proof (per-disbursement)
    referenceNumber: varchar('reference_number', { length: 255 }),
    proofUrl: varchar('proof_url', { length: 512 }),
    
    // Status tracking
    status: varchar('status', { length: 50 }).notNull().default('PENDING'),
    // Status: 'PENDING', 'COMPLETED', 'CANCELLED'
    
    completedAt: timestamp('completed_at'),
    completedBy: text('completed_by').references(() => user.id),
    notes: text('notes'),
}, (table) => ({
    requestIdIdx: index('idx_disbursement_request_id').on(table.requestId),
    statusIdx: index('idx_disbursement_status').on(table.status),
}))

// Add relations for payrollDisbursement
export const payrollDisbursementRelations = relations(payrollDisbursement, ({ one }) => ({
    request: one(payrollRequest, {
        fields: [payrollDisbursement.requestId],
        references: [payrollRequest.id],
    }),
    completer: one(user, {
        fields: [payrollDisbursement.completedBy],
        references: [user.id],
    }),
}))
```

Also add the `disbursements` relation to the existing `payrollRequestRelations` at line 204-231. Change:

```typescript
    entries: many(payrollEntry),
```

To:

```typescript
    entries: many(payrollEntry),
    disbursements: many(payrollDisbursement),
```

**Step 5: Add recurrence/disbursement support to `payrollDeductions` table**

In `server/db/schema/payroll.ts`, after the `deductedAt` column at line 243, add:

```typescript
    // Scheduled/Staggered payment support
    scheduledAmount: decimal('scheduled_amount', { precision: 12, scale: 2 }),
    disbursementType: varchar('disbursement_type', { length: 50 }).default('FULL'),
    // Type: 'FULL', 'STAGGERED'
    recurrenceRule: jsonb('recurrence_rule').$type<{ frequency: string; interval: number; startDate: string; endDate?: string } | null>(),
```

**Step 6: Generate and run the migration**

```bash
# Verify drizzle config first
cat drizzle.config.ts
# Generate migration
bun run db:generate
# Review the generated migration in drizzle/ folder
# Run the migration
bun run db:migrate
```

Verify the migration adds the columns:
- `general_ledger.payment_method` (varchar 50, nullable)
- `payroll_request.reference_number` (varchar 255, nullable)
- `payroll_request.proof_url` (varchar 512, nullable)
- `payroll_disbursement` table (new)
- `payroll_deductions.scheduled_amount`, `disbursement_type`, `recurrence_rule` columns

**Step 7: Commit**

```bash
git add utils/types/payment.ts server/db/schema/accounting.ts server/db/schema/payroll.ts drizzle/
git commit -m "feat: add payment method types, accounting payment_method column, disbursement table, staggered payment schema"
```

---

## Phase 2: Accounting — Branch Audit & Payment Methods (Tasks 2-4)

### Task 2: Audit & Fix Branch Logic + Add Branch Column

**Files:**
- Modify: `server/actions/accounting.ts` (audit only — lines 150-152)
- Modify: `app/accounting/accountingPage.tsx` (add column + fetch branch names)
- Create: `server/actions/branches.ts` — verify `getBranches` exists or add lightweight `getBranchNameMap()`

**Context:** The branch filtering in `getLedgerEntries` at `server/actions/accounting.ts:150-152` uses:
```typescript
conditions.push(or(eq(generalLedger.branchId, options.branchId), isNull(generalLedger.branchId)))
```
This is correct: when a branch is selected, it shows entries for that branch AND entries with null branch (shared entries). When no branch filter is provided, all entries are shown. The **problem** is that the listing page (`accountingPage.tsx`) has no "Branch" column — users cannot tell which branch an entry belongs to.

**Step 1: Verify branch fetching capability**

Check if `server/actions/branches.ts` has a `getBranches()` function. Based on the `branch-context.tsx` component fetching from `/api/branches`, there should be one. If not, add a lightweight function:

```typescript
export async function getBranchNameMap(): Promise<Record<string, string>> {
    const branches = await db.select({ id: branches.id, name: branches.name }).from(branches)
    const map: Record<string, string> = {}
    for (const branch of branches) {
        map[branch.id] = branch.name
    }
    return map
}
```

But since the `branch-context` hook already has branches loaded, the simpler approach is to use the existing `useBranchContext()` hook in the accounting page.

**Step 2: Add branch column header and data to accounting table**

In `app/accounting/accountingPage.tsx`:

After line 28 (`import { useBranchContext } from "@/components/branch-context"`), the `currentBranch` is already available from the hook but only used for filtering. Add a branch name mapping:

```typescript
import { getBranches } from "@/server/actions/branches"
```

Then in `fetchData` callback (~line 132), after the existing `Promise.all`, also fetch branches (or use the branches already loaded from branch context):

```typescript
const { branches: allBranches } = useBranchContext()
// ... existing code ...
// Map branch_id to name for display
const branchMap: Record<string, string> = {}
if (allBranches) {
    for (const b of allBranches) {
        branchMap[b.id] = b.name
    }
}
```

Actually, `useBranchContext()` is already imported at line 28. We can use `useBranchContext` to get `branches` and build the map inside the component. However, since `useBranchContext` is called once and we need branches in the render, extract it:

```typescript
const { currentBranch, branches } = useBranchContext()
```

Then build the map:

```typescript
const branchNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of branches) {
        map[b.id] = b.name
    }
    return map
}, [branches])
```

**Step 3: Add "Branch" column to table header**

In `app/accounting/accountingPage.tsx`, after the "Type" `<th>` at line ~594, add:

```tsx
<th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>
    Branch
</th>
```

**Step 4: Add branch name to each row**

After the type badge `<td>` (~line 656-662), add:

```tsx
<td className='px-4 py-2 text-sm text-white/60'>
    {entry.branch_id ? (branchNameMap[entry.branch_id] || '-') : (
        <span className='text-xs px-1.5 py-0.5 bg-white/10 rounded'>Shared</span>
    )}
</td>
```

**Step 5: Update `colSpan` values**

Update all `colSpan` in loading/empty state rows from `isAdmin ? 9 : 8` to `isAdmin ? 10 : 9` (accounting for the new branch column).

**Step 6: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "feat(accounting): add branch column to ledger table showing branch name per entry"
```

### Task 3: Add Payment Method to Accounting (Create/Edit/List/Filter/Stats)

**Files:**
- Modify: `utils/types/ledger.ts`
- Modify: `server/actions/accounting.ts`
- Modify: `server/actions/accounting.ts` — `createAutoLedgerEntry` to propagate from transactions
- Modify: `components/accounting/EntryModal.tsx`
- Modify: `app/accounting/accountingPage.tsx`

**Context:** `utils/types/ledger.ts` defines `LedgerEntry` (line 7), `CreateLedgerEntryPayload` (line 30), `UpdateLedgerEntryPayload` (line 43), `LedgerFilters` (line 54). None have `payment_method`. The `generalLedger` schema now has the column from Task 1.

**Step 1: Update `utils/types/ledger.ts`**

Add import at top of file:

```typescript
import { AccountingPaymentMethod } from '@/utils/types/payment'
```

Add `payment_method` to `LedgerEntry` interface (after line 27 `branch_id`):

```typescript
    payment_method?: AccountingPaymentMethod
```

Add to `CreateLedgerEntryPayload` (after line 40 `branch_id`):

```typescript
    payment_method?: AccountingPaymentMethod
```

Add to `UpdateLedgerEntryPayload` (after line 51 `branch_id`):

```typescript
    payment_method?: AccountingPaymentMethod
```

Add to `LedgerFilters` (after line 61 `include_voided`):

```typescript
    payment_method?: AccountingPaymentMethod
```

**Step 2: Update `server/actions/accounting.ts` — `createLedgerEntry`**

In `createLedgerEntry` at line ~398-415, in the insert values block, add:

```typescript
paymentMethod: payload.payment_method || null,
```

**Step 3: Update `server/actions/accounting.ts` — `updateLedgerEntry`**

In `updateLedgerEntry` at line ~730-743, in the updateData block, add:

```typescript
if (updates.payment_method !== undefined) updateData.paymentMethod = updates.payment_method
```

**Step 4: Update `server/actions/accounting.ts` — `getLedgerEntries`**

In `getLedgerEntries` at line ~162, after the search filter block, add:

```typescript
if (filters?.payment_method) {
    conditions.push(eq(generalLedger.paymentMethod, filters.payment_method))
}
```

In the response mapping at line ~193-214, add to the transformed entry:

```typescript
payment_method: (entry.paymentMethod as AccountingPaymentMethod) || undefined,
```

**Step 5: Update `server/actions/accounting.ts` — `getLedgerEntry`**

In `getLedgerEntry` at line ~263-284, add to the transformed entry:

```typescript
payment_method: (entry.paymentMethod as AccountingPaymentMethod) || undefined,
```

**Step 6: Update `server/actions/accounting.ts` — `createAutoLedgerEntry`**

In `createAutoLedgerEntry` at line ~584-596, in the insert values, add:

```typescript
paymentMethod: entryData.payment_method || null,
```

And update the `entryData` parameter type at line ~551-561 to include:

```typescript
    payment_method?: AccountingPaymentMethod
```

Also in `createJournalEntry` at line ~510-524, in the insert values, add:

```typescript
paymentMethod: (line as Record<string, unknown>).payment_method as string | undefined,
```

**Step 7: Update `server/actions/accounting.ts` — `getLedgerSummary`**

Add `by_payment_method` to `LedgerSummary` interface at line ~867-876:

```typescript
by_payment_method: {
    method: string | null
    method_label: string
    debit: number
    credit: number
    count: number
}[]
```

In `getLedgerSummary`, after the `byTypeResult` query (~line 938-946), add:

```typescript
// Get breakdown by payment method
const byMethodResult = await db
    .select({
        method: generalLedger.paymentMethod,
        debit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
        credit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
        count: count(),
    })
    .from(generalLedger)
    .where(whereClause)
    .groupBy(generalLedger.paymentMethod)
```

Then in the summary object (~line 951), add:

```typescript
by_payment_method: byMethodResult.map((row) => ({
    method: row.method || null,
    method_label: getAccountingPaymentMethodLabel(row.method),
    debit: Number(row.debit || 0),
    credit: Number(row.credit || 0),
    count: Number(row.count || 0),
})),
```

Add import at top of file:

```typescript
import { getAccountingPaymentMethodLabel, AccountingPaymentMethod } from '@/utils/types/payment'
```

**Step 8: Update `components/accounting/EntryModal.tsx`**

At line ~53, the `useBranchContext` import already exists. After the existing imports (line 18), add:

```typescript
import { ACCOUNTING_PAYMENT_METHODS, ACCOUNTING_PAYMENT_METHOD_COLORS, AccountingPaymentMethod } from '@/utils/types/payment'
```

In the `EntryModal` component, after the `selectedBranchId` state (~line 56), add:

```typescript
const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<AccountingPaymentMethod | ''>(
    entry?.payment_method || ''
)
```

In the form `handleSubmit` (~line 193-241), when building the payload for create/update, include:

```typescript
payment_method: selectedPaymentMethod || undefined,
```

Add a Payment Method `<select>` field in the form, place it after the Branch selector (line ~328) and before the Category selector:

```tsx
{/* Payment Method */}
<div>
    <label className='block text-sm font-medium mb-1'>
        Payment Method
    </label>
    <select
        value={selectedPaymentMethod}
        onChange={(e) => setSelectedPaymentMethod(e.target.value as AccountingPaymentMethod | '')}
        className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none transition-colors'
    >
        <option value="">-- Unspecified --</option>
        {ACCOUNTING_PAYMENT_METHODS.map((method) => (
            <option key={method.key} value={method.key} className={method.key === 'CASH' ? 'text-green-400' : ''}>
                {method.label}
            </option>
        ))}
    </select>
    {selectedPaymentMethod && (
        <p className='text-xs text-white/40 mt-1'>
            {ACCOUNTING_PAYMENT_METHODS.find(m => m.key === selectedPaymentMethod)?.description}
        </p>
    )}
</div>
```

**Step 9: Update `app/accounting/accountingPage.tsx` — Payment Method filter**

Add import at top:

```typescript
import { ACCOUNTING_PAYMENT_METHODS, ACCOUNTING_PAYMENT_METHOD_COLORS, getAccountingPaymentMethodLabel } from '@/utils/types/payment'
```

After the `categoryFilter` state (~line 106), add:

```typescript
const [paymentMethodFilter, setPaymentMethodFilter] = useState<AccountingPaymentMethod | "">("")
```

In the `fetchData` call's filters object (~line 139-142), add:

```typescript
payment_method: paymentMethodFilter || undefined,
```

Add to the `fetchData` dependency array (~line 193-203):

```typescript
paymentMethodFilter,
```

Add to the `useEffect` that resets page on filter change (~line 211):

```typescript
paymentMethodFilter
```

**Step 10: Add Payment Method filter dropdown in FilterBar**

In the FilterBar section (~line 485-578), after the category `<select>` (~line 515-526), add:

```tsx
<div className='flex items-center gap-2'>
    <select
        value={paymentMethodFilter}
        onChange={(e) => setPaymentMethodFilter(e.target.value as AccountingPaymentMethod | "")}
        className='bg-white/10 hover:bg-white/20 transition-colors px-3 py-2 rounded-md text-sm cursor-pointer border-2 border-white/5'
    >
        <option value="">All Methods</option>
        {ACCOUNTING_PAYMENT_METHODS.map((method) => (
            <option key={method.key} value={method.key}>
                {method.label}
            </option>
        ))}
    </select>
</div>
```

**Step 11: Add Payment Method column to table**

In the table header after the "Branch" column (added in Task 2), add:

```tsx
<th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>
    Method
</th>
```

In each row, after the branch `<td>`, add:

```tsx
<td className='px-4 py-2 text-sm'>
    {entry.payment_method ? (
        <span className={`text-xs px-1.5 py-0.5 rounded border ${ACCOUNTING_PAYMENT_METHOD_COLORS[entry.payment_method]}`}>
            {getAccountingPaymentMethodLabel(entry.payment_method)}
        </span>
    ) : (
        <span className='text-white/30'>-</span>
    )}
</td>
```

**Step 12: Add payment method separator rows in listing**

To visually group entries by payment method, detect when `entry.payment_method` differs from the previous entry. Add a computed property in the render. After the `<tbody>` opening tag and before the `entries.map((entry) => (`, add a helper that checks for separators:

```tsx
{entries.map((entry, index) => {
    const prevEntry = entries[index - 1]
    const showSeparator = index === 0 || (prevEntry && prevEntry.payment_method !== entry.payment_method)
    return (
        <React.Fragment key={entry.id}>
            {showSeparator && entry.payment_method && (
                <tr className='bg-white/5'>
                    <td colSpan={isAdmin ? 12 : 11} className='px-4 py-1.5'>
                        <div className='flex items-center gap-2'>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${ACCOUNTING_PAYMENT_METHOD_COLORS[entry.payment_method]}`}>
                                {getAccountingPaymentMethodLabel(entry.payment_method)}
                            </span>
                            <span className='text-xs text-white/30'>
                                {entries.filter((e, i) => i >= index && e.payment_method === entry.payment_method).length} entries
                            </span>
                        </div>
                    </td>
                </tr>
            )}
            {!entry.payment_method && showSeparator && (
                <tr className='bg-white/5'>
                    <td colSpan={isAdmin ? 12 : 11} className='px-4 py-1.5'>
                        <span className='text-xs font-semibold px-2 py-0.5 rounded border border-white/10 bg-white/5 text-white/50'>
                            Unspecified
                        </span>
                    </td>
                </tr>
            )}
            <tr /* ... existing row code ... */ />
        </React.Fragment>
    )
})}
```

Update `colSpan` values from `isAdmin ? 10 : 9` to `isAdmin ? 12 : 11` for all loading/empty rows.

**Step 13: Add Payment Method stat cards**

After the existing `StatsGrid` summary section (~line 460-482), add a new section:

```tsx
{/* Payment Method Breakdown */}
{summary && summary.by_payment_method && summary.by_payment_method.some(m => m.method !== null) && (
    <StatsGrid columns={{ mobile: 2, tablet: 3, desktop: 5 }}>
        {summary.by_payment_method
            .filter(m => m.method !== null)
            .map((pm) => (
                <StatCard
                    key={pm.method}
                    label={pm.method_label}
                    value={`${currencySymbol}${(pm.debit - pm.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    subtitle={`DR ${pm.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })} | CR ${pm.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    color="default"
                />
            ))}
    </StatsGrid>
)}
```

**Step 14: Commit**

```bash
git add utils/types/ledger.ts server/actions/accounting.ts components/accounting/EntryModal.tsx app/accounting/accountingPage.tsx
git commit -m "feat(accounting): add payment method field, filter, column, separator rows, and stat cards"
```

### Task 4: Add Payment Method Grouping to Accounting Export

**Files:**
- Modify: `utils/types/ledger.ts` — add `'BY_PAYMENT_METHOD'` to `LedgerExportType`
- Modify: `utils/ledger-export-utils.ts`
- Modify: `server/actions/accounting.ts` — `exportLedger`
- Modify: `app/accounting/accountingPage.tsx` — export dropdown

**Context:** `utils/types/ledger.ts:64-69` defines `LedgerExportType` union. `utils/ledger-export-utils.ts` has `LedgerExportRow` (line 11), `formatLedgerForExport` (line 30), `generateLedgerExportFilename` (line 278), `generateLedgerExport` (line 298). The export dropdown is in `app/accounting/accountingPage.tsx` at line 62-68 (`EXPORT_TYPES`).

**Step 1: Add payment_method to LedgerExportRow**

In `utils/ledger-export-utils.ts`:

Add import at top:

```typescript
import { getAccountingPaymentMethodLabel } from '@/utils/types/payment'
```

Add `payment_method` field to `LedgerExportRow` interface (line 11-21):

```typescript
    payment_method: string
```

Update `formatLedgerForExport` (line 30-52) to include:

```typescript
    payment_method: getAccountingPaymentMethodLabel(entry.payment_method),
```

**Step 2: Update CSV headers and data**

In `LEDGER_CSV_HEADERS` (line 56-66), add:

```typescript
    'Payment Method',
```

In `generateLedgerCSV` data lines (line 84-96), add:

```typescript
    row.payment_method,
```

**Step 3: Update Excel columns**

In `generateLedgerExcel` (line 124), in the `wsData` headers array, add `'Payment Method'` after `'Source'`.

In the data rows, add `row.payment_method`.

Update `ws['!cols']` to include `{ wch: 16 }` for the new column.

Update `applyCurrencyFormat` to include the correct column index for debit/credit/balance (adjust indices if payment_method is before the amounts).

**Step 4: Update PDF headers**

In `generateLedgerPDF` (line 183), update `tableHeaders` at line 231:

```typescript
    const tableHeaders = ['Date', 'Type', 'Method', 'Category', 'Description', 'Reference', 'Debit', 'Credit']
```

And in `tableData` (line 234), add `row.payment_method` after `row.type`:

```typescript
    const tableData = rows.map((row) => [
        row.date,
        row.type,
        row.payment_method, // NEW
        row.category,
        row.description.length > 35 ? row.description.substring(0, 35) + '...' : row.description,
        row.reference,
        row.debit.toFixed(2),
        row.credit.toFixed(2),
    ])
```

**Step 5: Add `'BY_PAYMENT_METHOD'` export type**

In `utils/types/ledger.ts`, add to the `LedgerExportType` union at line 64-69:

```typescript
    | 'BY_PAYMENT_METHOD'   // Grouped by payment method with subtotals
```

In `utils/ledger-export-utils.ts`, in `generateLedgerExport` at line ~304-310, add to the titles record:

```typescript
    BY_PAYMENT_METHOD: 'By Payment Method Report',
```

**Step 6: Implement BY_PAYMENT_METHOD export logic**

In `server/actions/accounting.ts`, in the `exportLedger` function at line ~981-1084, after fetching entries (~line 1052-1057), add logic for BY_PAYMENT_METHOD:

```typescript
// For BY_PAYMENT_METHOD, sort by payment_method then date
if (options.exportType === 'BY_PAYMENT_METHOD') {
    entries.sort((a, b) => {
        const methodA = a.paymentMethod || ''
        const methodB = b.paymentMethod || ''
        if (methodA !== methodB) return methodA.localeCompare(methodB)
        return new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()
    })
}
```

**Step 7: Add export dropdown option**

In `app/accounting/accountingPage.tsx`, in the `EXPORT_TYPES` array at line 62-68, add:

```typescript
{ key: "BY_PAYMENT_METHOD", label: "By Payment Method" },
```

**Step 8: Update export filename to include payment method filter**

In `utils/ledger-export-utils.ts`, update `generateLedgerExportFilename` at line 278 to include payment method in filename when filter is active. The function currently takes `exportType` — add an optional `methodSuffix` parameter:

```typescript
export function generateLedgerExportFilename(format: ExportFormat, exportType: LedgerExportType, methodSuffix?: string): string {
    const date = new Date().toISOString().split('T')[0]
    const typePrefix = exportType.toLowerCase().replace('_', '-')
    const suffix = methodSuffix ? `-${methodSuffix.toLowerCase()}` : ''
    const extensions: Record<ExportFormat, string> = {
        csv: 'csv',
        excel: 'xlsx',
        pdf: 'pdf',
    }
    return `${typePrefix}${suffix}-${date}.${extensions[format]}`
}
```

**Step 9: Commit**

```bash
git add utils/types/ledger.ts utils/ledger-export-utils.ts server/actions/accounting.ts app/accounting/accountingPage.tsx
git commit -m "feat(accounting): add payment method column to exports, add BY_PAYMENT_METHOD export type"
```

---

## Phase 3: Payroll — Payment Method, Duplicate Prevention, Reference/Proof (Tasks 5-7)

### Task 5: Update Payroll Types, Schemas, and Prevent Duplicate Requests

**Files:**
- Modify: `utils/types/payroll.ts`
- Modify: `server/actions/payroll-schemas.ts`
- Modify: `server/actions/payroll.ts` — `createPayrollRequest`
- Modify: `app/payroll/payrollPage.tsx` — `PAYMENT_METHODS` constant

**Context:** `utils/types/payroll.ts` line 24 has `PaymentMethod = 'CASH' | 'GCASH' | 'MAYA' | 'BANK'`. The existing DB values use `'BANK'` (line 132 in schema). We need to add `'CARD'` and `'CRYPTO'` while keeping `'BANK'` for backward compat. The `createPayrollRequest` function at `server/actions/payroll.ts:899` already checks that entries are PENDING, but does NOT prevent re-inclusion of entries already in REQUESTED or CONFIRMED requests.

**Step 1: Update `utils/types/payroll.ts` — `PaymentMethod` type**

At line 24, change:

```typescript
export type PaymentMethod = 'CASH' | 'GCASH' | 'MAYA' | 'BANK' | 'CARD' | 'CRYPTO'
```

Note: `'BANK'` is kept (not renamed to `'BANK_TRANSFER'`) because existing DB rows contain `'BANK'`. The UI labels it as "Bank Transfer".

Also add these new interfaces after `UpdatePaymentMethodPayload` (~line 187):

```typescript
export type DisbursementStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED'

export interface PayrollDisbursement {
    id: string
    created_at: Date
    request_id: string
    amount: number
    payment_method: PaymentMethod
    reference_number?: string
    proof_url?: string
    status: DisbursementStatus
    completed_at?: Date
    completed_by?: string
    notes?: string
}

export interface CreateDisbursementPayload {
    request_id: string
    amount: number
    payment_method: PaymentMethod
    reference_number?: string
    notes?: string
}
```

Update `PayrollRequest` interface (~line 108) to add:

```typescript
    reference_number?: string
    proof_url?: string
    disbursements?: PayrollDisbursement[]
```

Update `CompletePayrollRequestPayload` (~line 152-155) to add:

```typescript
    reference_number?: string
    proof_file?: File | null
```

**Step 2: Update `server/actions/payroll-schemas.ts`**

Find `PaymentMethodSchema` (~line 13) and update:

```typescript
export const PaymentMethodSchema = z.enum(['CASH', 'GCASH', 'MAYA', 'BANK', 'CARD', 'CRYPTO'])
```

Find `CompletePayrollSchema` (~line 50) and add:

```typescript
    referenceNumber: z.string().max(255).optional(),
```

Add new schema:

```typescript
export const CreateDisbursementSchema = z.object({
    request_id: z.string().uuid(),
    amount: z.number().positive(),
    payment_method: PaymentMethodSchema,
    reference_number: z.string().max(255).optional(),
    notes: z.string().max(500).optional(),
})

export const StaggeredPaymentSchema = z.object({
    request_id: z.string().uuid(),
    disbursements: z.array(CreateDisbursementSchema).min(1),
})
```

**Step 3: Add duplicate entry prevention in `createPayrollRequest`**

In `server/actions/payroll.ts`, in `createPayrollRequest` at line ~915-932, after the existing check that `entries.length !== entry_ids.length` (line ~930), add:

```typescript
        // Check for duplicate entries in other active requests
        const duplicateEntries = await db
            .select({ id: payrollEntry.id })
            .from(payrollEntry)
            .where(
                and(
                    inArray(payrollEntry.id, entry_ids),
                    sql`${payrollEntry.paymentStatus} IN ('REQUESTED', 'CONFIRMED')`,
                    sql`${payrollEntry.payrollRequestId} IS NOT NULL`
                )
            )

        if (duplicateEntries.length > 0) {
            return failure(
                `${duplicateEntries.length} entry/entries are already in an active payroll request. ` +
                `Entry IDs already claimed: ${duplicateEntries.map(e => e.id.slice(0, 8)).join(', ')}`
            )
        }
```

Import `ne` from drizzle-orm at the top of `server/actions/payroll.ts` (line 6) if not already imported. Actually, we use `sql` template strings so no extra import needed.

**Step 4: Update `PAYMENT_METHODS` constant in payroll page**

In `app/payroll/payrollPage.tsx`, at line 58-63, update:

```typescript
const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
    { key: "CASH", label: "Cash" },
    { key: "GCASH", label: "GCash" },
    { key: "MAYA", label: "Maya" },
    { key: "BANK", label: "Bank Transfer / QR" },
    { key: "CARD", label: "Card (Debit/Credit)" },
    { key: "CRYPTO", label: "Crypto" },
]
```

**Step 5: Commit**

```bash
git add utils/types/payroll.ts server/actions/payroll-schemas.ts server/actions/payroll.ts app/payroll/payrollPage.tsx
git commit -m "feat(payroll): add CARD/CRYPTO payment methods, prevent duplicate entries in active requests"
```

### Task 6: Add Reference Number & Proof to Payroll Completion

**Files:**
- Modify: `server/actions/payroll.ts` — `completePayrollRequest`
- Modify: `app/payroll/payrollPage.tsx` — `CompletePaymentModal`

**Context:** `server/actions/payroll.ts:1079` defines `completePayrollRequest`. It updates `payrollRequest.status` to `'COMPLETED'` and sets `paymentMethod`. Currently there's no reference number or proof upload. The schema already has `referenceNumber` and `proofUrl` columns from Task 1.

**Step 1: Update `completePayrollRequest` in `server/actions/payroll.ts`**

Find the `CompletePayrollRequestPayload` import usage at line ~1079. The function signature:

```typescript
export async function completePayrollRequest(
    requestId: string,
    payload: CompletePayrollRequestPayload
): Promise<ActionResponse<void>>
```

After the admin check and before the validation, add proof upload logic. After the validation block at line ~1100, add:

```typescript
        // Upload proof file if provided
        let proofUrl: string | undefined
        if (payload.proof_file) {
            try {
                const { uploadFile } = await import('@/utils/storage')
                const buffer = Buffer.from(await payload.proof_file.arrayBuffer())
                const extension = payload.proof_file.name.split('.').pop() || 'jpg'
                const key = `payroll-proofs/${requestId}-${Date.now()}.${extension}`
                const uploadResult = await uploadFile(buffer, key, payload.proof_file.type)
                proofUrl = uploadResult.url
            } catch (uploadError) {
                await logError({
                    type: 'PAYROLL',
                    message: `Failed to upload payroll proof: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`
                })
                // Continue without proof - don't fail the payment
            }
        }
```

In the update block at line ~1117-1125, add to the set object:

```typescript
        const updateData: Record<string, unknown> = {
            status: 'COMPLETED',
            paymentMethod: payload.payment_method,
            completedBy: currentUser.id,
            completedAt: new Date(),
        }
        if (payload.reference_number) updateData.referenceNumber = payload.reference_number
        if (proofUrl) updateData.proofUrl = proofUrl

        await db
            .update(payrollRequest)
            .set(updateData)
            .where(eq(payrollRequest.id, requestId))
```

**Step 2: Update `CompletePaymentModal` in `app/payroll/payrollPage.tsx`**

The `CompletePaymentModal` is at line ~1520-1595. Refactor it to a two-step flow:

```typescript
function CompletePaymentModal({
    request,
    currencySymbol,
    onClose,
    onComplete,
}: {
    request: PayrollRequest
    currencySymbol: string
    onClose: () => void
    onComplete: (method: PaymentMethod, referenceNumber?: string, proofFile?: File | null) => void
}) {
    const [step, setStep] = useState<'confirm' | 'pay'>('confirm')
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null)
    const [referenceNumber, setReferenceNumber] = useState('')
    const [proofFile, setProofFile] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)

    const handleConfirm = async () => {
        if (!selectedMethod) return
        setLoading(true)
        await onComplete(selectedMethod, referenceNumber || undefined, proofFile)
        setLoading(false)
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10'
            >
                <div className='p-6 border-b border-white/10 flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>
                        {step === 'confirm' ? 'Confirm Payment' : 'Disbursement Details'}
                    </h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6'>
                    {/* Amount display — always visible */}
                    <div className='text-center mb-6'>
                        <p className='text-white/60 text-sm'>Amount to pay</p>
                        <p className='text-3xl font-bold text-green-300'>
                            {currencySymbol}{Number(request.total_artist_cut).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                        <p className='text-sm text-white/60 mt-1'>
                            to {(request.staff as { full_name?: string })?.full_name || 'Staff'}
                        </p>
                    </div>

                    {step === 'confirm' ? (
                        /* Step 1: Confirm details */
                        <div>
                            <div className='bg-white/5 rounded-lg p-3 mb-4 text-sm space-y-1'>
                                <p><span className='text-white/60'>Period:</span> {new Date(request.period_start).toLocaleDateString()} - {new Date(request.period_end).toLocaleDateString()}</p>
                                <p><span className='text-white/60'>Gross:</span> {currencySymbol}{Number(request.total_gross).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                <p><span className='text-white/60'>Shop Cut:</span> {currencySymbol}{Number(request.total_shop_cut).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                <p><span className='text-white/60'>Artist Cut:</span> {currencySymbol}{Number(request.total_artist_cut).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                            <button
                                onClick={() => setStep('pay')}
                                className='w-full px-4 py-3 bg-green-600 hover:bg-green-700 rounded-md transition-colors font-medium'
                            >
                                Proceed to Disburse
                            </button>
                        </div>
                    ) : (
                        /* Step 2: Payment method + reference + proof */
                        <div className='space-y-4'>
                            <div>
                                <p className='text-sm font-medium mb-2'>Select payment method:</p>
                                <div className='grid grid-cols-2 gap-2'>
                                    {PAYMENT_METHODS.map((method) => (
                                        <button
                                            key={method.key}
                                            onClick={() => setSelectedMethod(method.key)}
                                            className={`p-3 rounded-lg transition-colors text-center text-sm border ${selectedMethod === method.key ? 'bg-green-500/20 border-green-500/40 text-green-300' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                        >
                                            {method.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className='block text-sm font-medium mb-1'>Reference Number</label>
                                <input
                                    type='text'
                                    value={referenceNumber}
                                    onChange={(e) => setReferenceNumber(e.target.value)}
                                    placeholder='e.g. TRX-12345, OR #1234...'
                                    className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none text-sm'
                                />
                            </div>
                            <div>
                                <label className='block text-sm font-medium mb-1'>Proof / Receipt</label>
                                <input
                                    type='file'
                                    accept='image/*,application/pdf'
                                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                                    className='w-full text-sm text-white/60 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-white/10 file:text-white/80 hover:file:bg-white/20'
                                />
                            </div>
                            <div className='flex gap-2 pt-2'>
                                <button
                                    onClick={() => setStep('confirm')}
                                    className='flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors text-sm'
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    disabled={loading || !selectedMethod}
                                    className='flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-md transition-colors font-medium text-sm'
                                >
                                    {loading ? 'Processing...' : 'Complete Payment'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    )
}
```

**Step 3: Update the `handleCompleteRequest` function**

In `app/payroll/payrollPage.tsx` at line ~382, change the handler to accept the new parameters:

```typescript
    const handleCompleteRequest = async (method: PaymentMethod, referenceNumber?: string, proofFile?: File | null) => {
        if (!processingRequest) return
        const result = await completePayrollRequest(processingRequest.id, {
            payment_method: method,
            reference_number: referenceNumber,
            proof_file: proofFile,
        })
        // ... rest of existing handler
    }
```

**Step 4: Show reference & proof in RequestsTab**

In the `RequestsTab` component at line ~1384-1393, where COMPLETED requests show payment method, expand to:

```tsx
{request.status === "COMPLETED" && (
    <div className='mt-2 pt-2 border-t border-white/10 text-xs text-white/50 space-y-1'>
        <p>
            Paid via {request.payment_method} on{' '}
            {new Date(request.completed_at!).toLocaleString()}
        </p>
        {request.reference_number && (
            <p>Ref: <span className='font-mono text-white/70'>{request.reference_number}</span></p>
        )}
        {request.proof_url && (
            <a
                href={request.proof_url}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1 text-blue-400 hover:text-blue-300'
            >
                <PaperclipIcon className='w-3 h-3' />
                View Proof
            </a>
        )}
    </div>
)}
```

Add `PaperclipIcon` to the import at line ~18:

```typescript
    PaperclipIcon,
```

**Step 5: Commit**

```bash
git add server/actions/payroll.ts app/payroll/payrollPage.tsx
git commit -m "feat(payroll): add reference number and proof tracking to disbursements with two-step completion flow"
```

### Task 7: Add Staggered/Partial Payment Support

**Files:**
- Create: `server/actions/payroll-disbursements.ts`
- Modify: `app/payroll/payrollPage.tsx` — add disbursement UI
- Modify: `server/actions/payroll.ts` — update `completePayrollRequest` to work with disbursements

**Context:** The `payrollDisbursement` table was created in Task 1. Each payroll request can have multiple disbursements (partial payments), each with its own payment method, reference number, and proof. The request is marked COMPLETED when all disbursements sum to the total and are all COMPLETED.

**Step 1: Create `server/actions/payroll-disbursements.ts`**

Create the file with this exact content:

```typescript
'use server'

import { db } from "@/server/db"
import { payrollDisbursement, payrollRequest, payrollEntry, user } from "@/server/db/schema"
import { eq, and, sql, sum } from "drizzle-orm"
import { PaymentMethod } from "@/utils/types/payroll"
import { ActionResponse, success, failure } from "@/utils/types/responses"
import { createLogs, logError } from "./logs"
import { getCurrentUser, isAdmin } from "@/utils/auth/permissions"
import { uploadFile } from "@/utils/storage"
import { cache } from '@/utils/cache'

export interface CreateDisbursementInput {
    request_id: string
    amount: number
    payment_method: PaymentMethod
    reference_number?: string
    notes?: string
    proof_file?: File | null
}

export async function createDisbursement(
    payload: CreateDisbursementInput
): Promise<ActionResponse<{ disbursement_id: string }>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) return failure('Unauthorized')

    const admin = await isAdmin(currentUser)
    if (!admin) return failure('Admin access required')

    try {
        // Validate request exists and is CONFIRMED or partially disbursed
        const [request] = await db
            .select()
            .from(payrollRequest)
            .where(eq(payrollRequest.id, payload.request_id))
            .limit(1)

        if (!request) return failure('Payroll request not found')
        if (request.status !== 'CONFIRMED') {
            return failure('Only confirmed payrolls can be disbursed')
        }

        // Calculate already disbursed amount
        const existingDisbursements = await db
            .select({ total: sum(payrollDisbursement.amount) })
            .from(payrollDisbursement)
            .where(
                and(
                    eq(payrollDisbursement.requestId, payload.request_id),
                    eq(payrollDisbursement.status, 'COMPLETED')
                )
            )

        const alreadyDisbursed = Number(existingDisbursements[0]?.total || 0)
        const totalArtistCut = Number(request.totalArtistCut)
        const remaining = totalArtistCut - alreadyDisbursed

        if (payload.amount > remaining) {
            return failure(`Disbursement amount (${payload.amount}) exceeds remaining (${remaining})`)
        }

        // Upload proof file if provided
        let proofUrl: string | undefined
        if (payload.proof_file) {
            try {
                const buffer = Buffer.from(await payload.proof_file.arrayBuffer())
                const extension = payload.proof_file.name.split('.').pop() || 'jpg'
                const key = `payroll-proofs/${payload.request_id}-${Date.now()}.${extension}`
                const uploadResult = await uploadFile(buffer, key, payload.proof_file.type)
                proofUrl = uploadResult.url
            } catch {
                // Continue without proof
            }
        }

        const [disbursement] = await db
            .insert(payrollDisbursement)
            .values({
                requestId: payload.request_id,
                amount: String(payload.amount),
                paymentMethod: payload.payment_method,
                referenceNumber: payload.reference_number || null,
                proofUrl: proofUrl || null,
                status: 'COMPLETED',
                completedAt: new Date(),
                completedBy: currentUser.id,
                notes: payload.notes || null,
            })
            .returning()

        // Check if fully disbursed
        const newDisbursed = alreadyDisbursed + payload.amount
        if (newDisbursed >= totalArtistCut) {
            // Complete the request
            await db
                .update(payrollRequest)
                .set({
                    status: 'COMPLETED',
                    paymentMethod: payload.payment_method,
                    completedBy: currentUser.id,
                    completedAt: new Date(),
                    referenceNumber: payload.reference_number || null,
                })
                .where(eq(payrollRequest.id, payload.request_id))

            // Mark all entries as PAID
            await db
                .update(payrollEntry)
                .set({
                    paymentStatus: 'PAID',
                    paidAt: new Date(),
                })
                .where(eq(payrollEntry.payrollRequestId, payload.request_id))

            createLogs({
                logs: [{
                    level: 'INFO',
                    type: 'PAYROLL',
                    message: `Payroll request fully disbursed: ${payload.request_id} via ${payload.payment_method}`,
                }],
            })
        }

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Disbursement created: ${disbursement.id} for request ${payload.request_id} - ${payload.amount} via ${payload.payment_method}`,
            }],
        })

        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')

        return success({ disbursement_id: disbursement.id })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error creating disbursement: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to create disbursement')
    }
}

export async function getDisbursements(
    requestId: string
): Promise<ActionResponse<import("@/utils/types/payroll").PayrollDisbursement[]>> {
    try {
        const rows = await db
            .select()
            .from(payrollDisbursement)
            .where(eq(payrollDisbursement.requestId, requestId))
            .orderBy(payrollDisbursement.createdAt)

        const data = rows.map(r => ({
            id: r.id,
            created_at: r.createdAt,
            request_id: r.requestId,
            amount: Number(r.amount),
            payment_method: r.paymentMethod as PaymentMethod,
            reference_number: r.referenceNumber || undefined,
            proof_url: r.proofUrl || undefined,
            status: r.status as 'PENDING' | 'COMPLETED' | 'CANCELLED',
            completed_at: r.completedAt || undefined,
            completed_by: r.completedBy || undefined,
            notes: r.notes || undefined,
        }))

        return success(data)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching disbursements: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to fetch disbursements')
    }
}
```

**Step 2: Add StaggeredPaymentModal to PayrollPage**

In `app/payroll/payrollPage.tsx`, add a new component after `CompletePaymentModal` (around line ~1595). This component lets users split a payment across multiple methods:

```typescript
function StaggeredPaymentModal({
    request,
    currencySymbol,
    existingDisbursements,
    onClose,
    onComplete,
}: {
    request: PayrollRequest
    currencySymbol: string
    existingDisbursements: PayrollDisbursement[]
    onClose: () => void
    onComplete: () => void
}) {
    const { addNotification } = useContext(NotificationContext)
    const [lines, setLines] = useState<{ amount: number; method: PaymentMethod; ref: string; notes: string }[]>([])
    const [loading, setLoading] = useState(false)

    const totalDisbursed = existingDisbursements
        .filter(d => d.status === 'COMPLETED')
        .reduce((sum, d) => sum + Number(d.amount), 0)
    const remaining = Number(request.total_artist_cut) - totalDisbursed
    const lineTotal = lines.reduce((sum, l) => sum + l.amount, 0)

    const addLine = () => {
        setLines([...lines, { amount: 0, method: 'CASH', ref: '', notes: '' }])
    }

    const handleSubmit = async () => {
        if (lineTotal <= 0 || lineTotal > remaining) return
        setLoading(true)
        try {
            const { createDisbursement } = await import('@/server/actions/payroll-disbursements')
            for (const line of lines) {
                if (line.amount <= 0) continue
                const result = await createDisbursement({
                    request_id: request.id,
                    amount: line.amount,
                    payment_method: line.method,
                    reference_number: line.ref || undefined,
                    notes: line.notes || undefined,
                })
                if (!result.success) {
                    addNotification(result.error || 'Failed to create disbursement', 'ERROR')
                    setLoading(false)
                    return
                }
            }
            addNotification('Disbursements recorded', 'SUCCESS')
            onComplete()
        } catch (error) {
            addNotification('Failed to create disbursements', 'ERROR')
        } finally {
            setLoading(false)
        }
    }

    return (
        /* Modal with:
            - Request amount, already disbursed, remaining
            - List of existing disbursements with status
            - Add line button
            - Lines: amount, payment method select, reference, notes
            - Summary: line total vs remaining
            - Submit button (disabled when total > remaining)
        */
    )
}
```

**Step 3: Integrate disbursement display into RequestsTab**

In `RequestsTab` component, for CONFIRMED requests, show the "Disburse" button and remaining amount. For COMPLETED requests that have disbursements, show the breakdown.

Add after the existing actions block (~line 1341-1381):

```tsx
{request.status === "CONFIRMED" && (
    <div className='flex items-center gap-2 mt-2 pt-2 border-t border-white/10'>
        <AdminActionGuard onAction={() => onStaggeredPayment(request)}>
            <button className='flex items-center gap-1 px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded transition-colors text-xs'>
                <BanknoteIcon className='w-3 h-3' />
                Staggered Pay
            </button>
        </AdminActionGuard>
    </div>
)}
```

Pass `onStaggeredPayment` as a new prop to `RequestsTab`.

**Step 4: Add state and handler for staggered payments in PayrollPageClient**

After line ~299 (`cancellingRequest`), add:

```typescript
    const [staggeredPaymentRequest, setStaggeredPaymentRequest] = useState<PayrollRequest | null>(null)
    const [requestDisbursements, setRequestDisbursements] = useState<PayrollDisbursement[]>([])
```

Add handler:

```typescript
    const handleOpenStaggeredPayment = async (request: PayrollRequest) => {
        const { getDisbursements } = await import('@/server/actions/payroll-disbursements')
        const result = await getDisbursements(request.id)
        if (result.success) {
            setRequestDisbursements(result.data)
            setStaggeredPaymentRequest(request)
        }
    }
```

**Step 5: Commit**

```bash
git add server/actions/payroll-disbursements.ts app/payroll/payrollPage.tsx
git commit -m "feat(payroll): add staggered/partial payment disbursements with per-method tracking"
```

---

## Phase 4: Payroll — Confirm Flow Cleanup (Task 8)

### Task 8: Two-Step Confirm/Complete Flow

**Files:**
- Modify: `app/payroll/payrollPage.tsx` — refactor confirm → disburse flow

**Context:** Currently `RequestsTab` line ~1342-1356 shows a "Confirm" button for REQUESTED requests. Clicking it calls `handleConfirmRequest` which directly calls `confirmPayrollRequest` and then just shows a notification. The user then has to click "Complete" separately to open the `CompletePaymentModal`. This is jarring — the user should first see a confirmation dialog, then after confirming, immediately be taken to the disbursement flow.

**Step 1: Add state for stepped confirmation flow**

In `PayrollPageClient` component, after the existing `cancellingRequest` state (~line 299), add:

```typescript
    const [confirmAndDisburseRequest, setConfirmAndDisburseRequest] = useState<PayrollRequest | null>(null)
    const [confirmStep, setConfirmStep] = useState<'confirm' | 'disburse'>('confirm')
```

**Step 2: Create `ConfirmRequestModal` component**

Add a new modal component after `CancelRequestModal` (~line 1679):

```typescript
function ConfirmRequestModal({
    request,
    currencySymbol,
    onClose,
    onConfirm,
}: {
    request: PayrollRequest
    currencySymbol: string
    onClose: () => void
    onConfirm: () => Promise<void>
}) {
    const [loading, setLoading] = useState(false)

    const handleConfirm = async () => {
        setLoading(true)
        await onConfirm()
        setLoading(false)
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10'
            >
                <div className='p-6 border-b border-white/10'>
                    <h3 className='text-xl font-bold text-blue-400'>Confirm Payroll Request</h3>
                    <p className='text-sm text-white/60 mt-1'>
                        Review the request details before confirming
                    </p>
                </div>

                <div className='p-6 space-y-4'>
                    <div className='bg-white/5 rounded-lg p-3 text-sm space-y-1'>
                        <p><span className='text-white/60'>Staff:</span> {(request.staff as { full_name?: string })?.full_name || 'Staff'}</p>
                        <p><span className='text-white/60'>Period:</span> {new Date(request.period_start).toLocaleDateString()} - {new Date(request.period_end).toLocaleDateString()}</p>
                        <p><span className='text-white/60'>Gross:</span> {currencySymbol}{Number(request.total_gross).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        <p><span className='text-white/60'>Artist Cut:</span> {currencySymbol}{Number(request.total_artist_cut).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>

                    <div className='flex justify-end gap-3'>
                        <button onClick={onClose} className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'>
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading}
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                        >
                            {loading ? 'Confirming...' : 'Confirm'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
```

**Step 3: Update RequestsTab to use stepped flow**

Add a new prop `onConfirmAndDisburse` to `RequestsTab`:

```typescript
    onConfirmAndDisburse: (request: PayrollRequest) => void
```

Replace the "Confirm" button in `RequestsTab` (~line 1342-1356) to call `onConfirmAndDisburse` instead of `onConfirm`:

```tsx
{request.status === "REQUESTED" && (
    <AdminActionGuard
        onAction={() => onConfirmAndDisburse(request)}
    >
        <button className='flex items-center gap-1 px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded transition-colors text-xs'>
            <CheckIcon className='w-3 h-3' />
            Confirm & Pay
        </button>
    </AdminActionGuard>
)}
```

**Step 4: Wire up the handler in PayrollPageClient**

In the parent component where `RequestsTab` is rendered (~line 622-632), add:

```tsx
onConfirmAndDisburse={async (request) => {
    setConfirmAndDisburseRequest(request)
    setConfirmStep('confirm')
}}
```

**Step 5: Render ConfirmRequestModal and chain to CompletePaymentModal**

In the modals section of `PayrollPageClient`, add:

```tsx
{/* Confirm & Disburse Flow */}
<AnimatePresence>
    {confirmAndDisburseRequest && confirmStep === 'confirm' && (
        <ConfirmRequestModal
            request={confirmAndDisburseRequest}
            currencySymbol={currencySymbol}
            onClose={() => setConfirmAndDisburseRequest(null)}
            onConfirm={async () => {
                const result = await confirmPayrollRequest(confirmAndDisburseRequest.id)
                if (result.success) {
                    setConfirmStep('disburse')
                } else {
                    addNotification(result.error || 'Failed to confirm', 'ERROR')
                    setConfirmAndDisburseRequest(null)
                }
            }}
        />
    )}
    {confirmAndDisburseRequest && confirmStep === 'disburse' && (
        <CompletePaymentModal
            request={confirmAndDisburseRequest}
            currencySymbol={currencySymbol}
            onClose={() => {
                setConfirmAndDisburseRequest(null)
                fetchData()
            }}
            onComplete={async (method, ref, proof) => {
                await handleCompleteRequest(method, ref, proof)
                setConfirmAndDisburseRequest(null)
            }}
        />
    )}
</AnimatePresence>
```

**Step 6: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "feat(payroll): two-step confirm then disburse flow for cleaner UX"
```

---

## Phase 5: Metrics — Payment Method Stats & Improved Exports (Task 9)

### Task 9: Add Payment Method Stats, Filtering, and Export Improvements

**Files:**
- Modify: `components/metrics/ExecutiveAccounting.tsx`
- Modify: `components/metrics/businessInsights.tsx`
- Modify: `server/actions/accounting.ts` — already has `by_payment_method` from Task 3

**Context:** `components/metrics/ExecutiveAccounting.tsx` shows P&L summary cards, revenue vs expenses trend charts, and expense breakdown. It calls `getExecutiveAccountingMetrics()`. `components/metrics/businessInsights.tsx` has an export dropdown (lines ~81-281) with CSV enabled but XLSX/PDF disabled.

**Step 1: Fetch ledger summary with payment method breakdown in ExecutiveAccounting**

In `components/metrics/ExecutiveAccounting.tsx`, add `getLedgerSummary` to the data fetch. The component currently uses `getExecutiveAccountingMetrics` — add a second call for the payment method breakdown:

```typescript
import { getLedgerSummary } from '@/server/actions/accounting'
import { ACCOUNTING_PAYMENT_METHOD_COLORS, getAccountingPaymentMethodLabel } from '@/utils/types/payment'
```

In the data fetching useEffect, add:

```typescript
const summaryResult = await getLedgerSummary(datePreset, customStartDate, customEndDate, branchId)
if (summaryResult.success && summaryResult.data) {
    setPaymentMethodBreakdown(summaryResult.data.by_payment_method)
}
```

**Step 2: Add payment method stat cards in ExecutiveAccounting**

After the P&L summary cards section, add:

```tsx
{/* Payment Method Breakdown */}
{paymentMethodBreakdown.length > 0 && paymentMethodBreakdown.some(m => m.method !== null) && (
    <div>
        <h3 className='text-sm font-semibold text-white/60 uppercase mb-3'>By Payment Method</h3>
        <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3'>
            {paymentMethodBreakdown.filter(m => m.method !== null).map((pm) => (
                <div key={pm.method} className='bg-white/5 border border-white/10 rounded-lg p-3'>
                    <p className='text-xs text-white/50 mb-1'>{pm.method_label}</p>
                    <p className='text-lg font-bold'>
                        ₱{(pm.debit - pm.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className='text-xs text-white/40 mt-1'>{pm.count} entries</p>
                </div>
            ))}
        </div>
    </div>
)}
```

**Step 3: Add payment method filter dropdown in BusinessInsights**

In `components/metrics/businessInsights.tsx`, add:

```typescript
import { ACCOUNTING_PAYMENT_METHODS, AccountingPaymentMethod } from '@/utils/types/payment'
```

Add state:

```typescript
const [paymentMethodFilter, setPaymentMethodFilter] = useState<AccountingPaymentMethod | "">("")
```

In the filter area (after timeframe selector), add:

```tsx
<select
    value={paymentMethodFilter}
    onChange={(e) => setPaymentMethodFilter(e.target.value as AccountingPaymentMethod | "")}
    className='bg-white/10 px-3 py-1.5 rounded text-sm border border-white/10'
>
    <option value="">All Methods</option>
    {ACCOUNTING_PAYMENT_METHODS.map(m => (
        <option key={m.key} value={m.key}>{m.label}</option>
    ))}
</select>
```

Pass the filter to data fetching functions.

**Step 4: Enable XLSX and PDF exports in BusinessInsights**

In `components/metrics/businessInsights.tsx`, find the disabled XLSX and PDF buttons (~lines 250-270) and enable them. The `exportMetrics` server action likely supports all formats. Change:

```tsx
disabled={true} // REMOVE this
```

Replace with:

```tsx
disabled={!timeframe}
```

**Step 5: Commit**

```bash
git add components/metrics/ExecutiveAccounting.tsx components/metrics/businessInsights.tsx
git commit -m "feat(metrics): add payment method stats cards, filtering, and enable XLSX/PDF exports"
```

---

## Phase 6: Scheduled Payments (Task 10)

### Task 10: Add Scheduled/Custom Payment Disbursements

**Files:**
- Modify: `server/actions/payroll.ts` — add scheduled disbursement action
- Modify: `app/payroll/payrollPage.tsx` — add scheduled tab/UI

**Context:** The `payrollDeductions` table now has `scheduledAmount`, `disbursementType`, and `recurrenceRule` columns from Task 1. This enables creating recurring payment obligations like "pay staff X ₱40,000 every month".

**Step 1: Create `createScheduledDisbursement` server action**

Add to `server/actions/payroll.ts` or create in `server/actions/payroll-disbursements.ts`:

```typescript
export interface CreateScheduledPaymentPayload {
    staff_id: string
    amount: number
    reason: string
    frequency: 'MONTHLY' | 'BIMONTHLY' | 'WEEKLY' | 'CUSTOM'
    start_date: string // ISO date
    end_date?: string // ISO date, null for indefinite
}

export async function createScheduledPayment(
    payload: CreateScheduledPaymentPayload
): Promise<ActionResponse<{ id: string }>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) return failure('Unauthorized')
    const admin = await isAdmin(currentUser)
    if (!admin) return failure('Admin access required')

    try {
        const recurrenceRule = {
            frequency: payload.frequency,
            interval: 1,
            startDate: payload.start_date,
            endDate: payload.end_date || null,
        }

        const [deduction] = await db
            .insert(payrollDeductions)
            .values({
                userId: payload.staff_id,
                type: 'ADVANCE', // Reuse ADVANCE type for scheduled payments
                amount: payload.amount,
                reason: `Scheduled: ${payload.reason}`,
                status: 'PENDING',
                scheduledAmount: String(payload.amount),
                disbursementType: 'STAGGERED',
                recurrenceRule: recurrenceRule,
            })
            .returning()

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Scheduled payment created: ${deduction.id} for staff ${payload.staff_id} - ₱${payload.amount} ${payload.frequency}`,
            }],
        })

        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')

        return success({ id: deduction.id })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error creating scheduled payment: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to create scheduled payment')
    }
}
```

**Step 2: Add scheduled payment UI in PayrollPage**

Add a `ScheduledPaymentsTab` component after `DeductionsTab` (~line 2173). Or add it as a section within the `DeductionsTab`. The cleaner approach: add a fifth tab "Scheduled" after "Deductions":

```typescript
type TabType = "dashboard" | "requests" | "rates" | "deductions" | "scheduled"
```

In the tabs array (~line 547-571), add:

```typescript
{
    key: "scheduled",
    label: "Scheduled",
    shortLabel: "Scheduled",
    icon: CalendarIcon, // import from lucide-react
},
```

Create `ScheduledPaymentsTab` component showing:
- List of active scheduled payments (deductions with `disbursementType: 'STAGGERED'`)
- Each row shows: staff name, amount, frequency, start date, end date, status
- "Create" button (admin only) opens `CreateScheduledPaymentModal`

**Step 3: Create `CreateScheduledPaymentModal`**

Modal with form:
- Staff member dropdown
- Amount input
- Reason input
- Frequency select (Monthly, Bimonthly, Weekly, Custom)
- Start date picker
- End date picker (optional)

**Step 4: Commit**

```bash
git add server/actions/payroll-disbursements.ts app/payroll/payrollPage.tsx
git commit -m "feat(payroll): add scheduled/custom payment disbursements with recurrence rules"
```

---

## Phase 7: Verification & Cleanup (Task 11)

### Task 11: Lint, Build, Type Check, and Fix All Errors

**Step 1: Run linter**

```bash
bun run lint
```

Expected: No errors or warnings. If errors:
- Fix unused imports (common after adding new imports)
- Fix `any` types (strict TypeScript)
- Fix missing semicolons or formatting issues

**Step 2: Run production build**

```bash
bun run build
```

Expected: Build succeeds. Common issues to watch for:
- `Type 'undefined' is not assignable to type 'string'` — from nullable columns
- `Property 'payment_method' does not exist on type 'LedgerEntry'` — ensure all mapping functions include the new field
- `Cannot find module '@/utils/types/payment'` — verify file was created
- Drizzle schema changes that don't match migration

**Step 3: Run TypeScript type check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

**Step 4: Verify all new columns are in mapping functions**

Checklist of mapping locations that must include `payment_method`:
- `server/actions/accounting.ts` `getLedgerEntries` response mapping (~line 193)
- `server/actions/accounting.ts` `getLedgerEntry` response mapping (~line 263)
- `server/actions/accounting.ts` `exportLedger` transform (~line 1059)
- `utils/ledger-export-utils.ts` `formatLedgerForExport` (~line 30)

**Step 5: Verify all new `PayrollRequest` fields are mapped**

Checklist:
- `server/actions/payroll.ts` `getPayrollRequests` mapping (~line 856) — must include `reference_number`, `proof_url`
- `server/actions/payroll.ts` `completePayrollRequest` update (~line 1117) — must include `referenceNumber`, `proofUrl`

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: fix lint, type errors, and verify all mapping functions"
```

---

## Implementation Summary

### Files Modified (ordered by impact)

**New Files:**
- `utils/types/payment.ts` — Canonical payment method types and helpers
- `server/actions/payroll-disbursements.ts` — Disbursement server actions

**Schema Changes:**
- `server/db/schema/accounting.ts` — Added `paymentMethod` column + index
- `server/db/schema/payroll.ts` — Added `referenceNumber`, `proofUrl` to payrollRequest; new `payrollDisbursement` table; added `scheduledAmount`, `disbursementType`, `recurrenceRule` to payrollDeductions

**Type Changes:**
- `utils/types/ledger.ts` — Added `payment_method` to LedgerEntry, payloads, filters; added `BY_PAYMENT_METHOD` export type
- `utils/types/payroll.ts` — Added CARD/CRYPTO to PaymentMethod; added PayrollDisbursement types; added reference_number/proof to PayrollRequest

**Server Actions:**
- `server/actions/accounting.ts` — Persist/query/payment_method; extended LedgerSummary with by_payment_method
- `server/actions/payroll.ts` — Duplicate entry prevention; proof upload; reference number storage
- `server/actions/payroll-schemas.ts` — Updated PaymentMethodSchema; added Disbursement schemas

**UI Components:**
- `app/accounting/accountingPage.tsx` — Branch column, payment method column/filter/separators/stat cards
- `components/accounting/EntryModal.tsx` — Payment method selector
- `app/payroll/payrollPage.tsx` — Updated PAYMENT_METHODS; two-step confirm/disburse; staggered payment modal; reference/proof inputs; scheduled payments tab
- `components/metrics/ExecutiveAccounting.tsx` — Payment method breakdown cards
- `components/metrics/businessInsights.tsx` — Payment method filter; enabled XLSX/PDF exports
- `utils/ledger-export-utils.ts` — Payment method in all export formats; BY_PAYMENT_METHOD support

### Additional Suggestions

1. **Auto-populate accounting payment method from transactions**: When `createAutoLedgerEntry` is called from transaction processing (e.g., POS sales), pass the transaction's `payment_method` through. Use the `mapTransactionToAccountingPaymentMethod()` helper from `utils/types/payment.ts`.

2. **Payment method reconciliation dashboard**: Consider a future metrics view showing cash vs digital payment trends over time.

3. **Cash-first enforcement for staggered payments**: When a payroll request is for cash-only staff, the disbursement method should default to CASH and ideally be non-editable.

4. **Export filename includes method**: Already handled in Task 4 Step 8.

5. **Payroll dashboard payment method breakdown**: The `PayrollDashboardSummary` type could be extended with `by_payment_method` breakdown showing paid amounts per method this month.

6. **Null handling for legacy entries**: Old ledger entries will have `paymentMethod = null`. The UI handles this by showing "Unspecified". No data migration needed for old records.
