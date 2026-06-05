# Fix Sales Branch Assignment ("Shared" Bug) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the bug where sales created with "Branch A" still output "Shared" in the accounting ledger, and improve branch handling across the sales flow.

**Architecture:** The root cause is that `branch_id` is never passed to `createAutoLedgerEntry()` in three transaction server actions (create, void, refund), causing all accounting entries to default to `null` (displayed as "Shared"). Additionally, the `BranchSelector` on the sales page can leave `currentBranch` as `null` while visually showing a branch name, silently creating "Shared" transactions. The plan fixes both the server-side data propagation and the client-side UX to ensure branch identity is preserved end-to-end.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Supabase/PostgreSQL

---

## Phase 1: Fix Server-Side Branch Propagation (Critical Bug)

### Task 1.1: Pass `branch_id` to `createAutoLedgerEntry` in `createTransaction`

**Files:**
- Modify: `server/actions/transactions.ts:213-227`

**Step 1: Add `branch_id` to the accounting entry in `createTransaction`**

In `server/actions/transactions.ts`, locate the `createAutoLedgerEntry` call inside `createTransaction` (around line 213) and add `branch_id: payload.branch_id`:

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
        credit: payload.total,
        branch_id: payload.branch_id,
    },
    user.id,
    tx
)
```

**Step 2: Verify the fix compiles**

Run: `bun run build 2>&1 | head -30`
Expected: Build succeeds with no TypeScript errors related to `branch_id`

**Step 3: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix(sales): pass branch_id to accounting ledger entry on transaction creation"
```

---

### Task 1.2: Pass `branch_id` to `createAutoLedgerEntry` in `voidTransaction`

**Files:**
- Modify: `server/actions/transactions.ts:504-518`

**Step 1: Add `branch_id` to the void accounting entry**

In `server/actions/transactions.ts`, locate the `createAutoLedgerEntry` call inside `voidTransaction` (around line 504) and add `branch_id: transaction.branchId`:

```typescript
await createAutoLedgerEntry(
    'TRANSACTION',
    transaction.id,
    {
        entry_date: new Date(),
        entry_type: 'EXPENSE',
        category: 'VOIDED_SALES',
        description: `Voided: ${transaction.transactionNumber}`,
        reference: transaction.transactionNumber,
        debit: originalTotal,
        credit: 0,
        branch_id: transaction.branchId,
    },
    user.id,
    tx
)
```

**Step 2: Verify the fix compiles**

Run: `bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix(sales): pass branch_id to void accounting entry"
```

---

### Task 1.3: Pass `branch_id` to `createAutoLedgerEntry` in `refundTransaction`

**Files:**
- Modify: `server/actions/transactions.ts:607-621`

**Step 1: Add `branch_id` to the refund accounting entry**

In `server/actions/transactions.ts`, locate the `createAutoLedgerEntry` call inside `refundTransaction` (around line 607) and add `branch_id: originalTxn.branchId`:

```typescript
await createAutoLedgerEntry(
    'TRANSACTION',
    refundTxn.id,
    {
        entry_date: new Date(),
        entry_type: 'EXPENSE',
        category: 'REFUNDS',
        description: `Refund: ${originalTxn.transactionNumber}`,
        reference: refundTxn.transactionNumber,
        debit: refundAmount,
        credit: 0,
        branch_id: originalTxn.branchId,
    },
    user.id,
    tx
)
```

**Step 2: Verify the fix compiles**

Run: `bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix(sales): pass branch_id to refund accounting entry"
```

---

### Task 1.4: Fix `transformTransaction` null handling for `branch_id`

**Files:**
- Modify: `server/actions/transactions.ts:299`

**Step 1: Change `|| undefined` to `?? null` for `branch_id`**

In `server/actions/transactions.ts`, locate the `transformTransaction` function (around line 299) and change:

```typescript
// Before:
branch_id: dbTxn.branchId || undefined,

// After:
branch_id: dbTxn.branchId ?? null,
```

This preserves `null` as "Shared" instead of converting it to `undefined`, which is more consistent with the rest of the codebase where `null` means "shared/across all branches".

**Step 2: Also fix `staff_id` consistently**

In the same function, also fix `staff_id` (around line 298):

```typescript
// Before:
staff_id: dbTxn.staffId || undefined,

// After:
staff_id: dbTxn.staffId ?? null,
```

**Step 3: Verify the fix compiles**

Run: `bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix(sales): preserve null branch_id in transformTransaction instead of converting to undefined"
```

---

## Phase 2: Fix Client-Side Branch Selector UX

### Task 2.1: Force branch selection on the sales page

**Files:**
- Modify: `app/sales/salesPage.tsx`
- Modify: `components/branch-selector.tsx`

**Step 1: Add `forceSelect` prop to `BranchSelector`**

In `components/branch-selector.tsx`, add a `forceSelect` prop. When `true`, the dropdown does NOT show "All Branches" and auto-selects the first branch if `currentBranch` is null:

```typescript
interface BranchSelectorProps {
    showAllOption?: boolean
    forceSelect?: boolean
    onBranchChange?: (branch: string | null) => void
    className?: string
}

export default function BranchSelector({
    showAllOption = false,
    forceSelect = false,
    onBranchChange,
    className = "",
}: BranchSelectorProps) {
    const { branches, currentBranch, setCurrentBranch, isLoading } = useBranchContext()

    const handleBranchChange = (branchId: string) => {
        if (branchId === "all") {
            setCurrentBranch(null)
            onBranchChange?.(null)
        } else {
            const branch = branches.find((b) => b.id === branchId)
            if (branch) {
                setCurrentBranch(branch)
                onBranchChange?.(branch.id)
            }
        }
    }

    // When forceSelect is true and currentBranch is null, auto-select the first branch
    useEffect(() => {
        if (forceSelect && !currentBranch && branches.length > 0) {
            setCurrentBranch(branches[0])
            onBranchChange?.(branches[0].id)
        }
    }, [forceSelect, currentBranch, branches, setCurrentBranch, onBranchChange])

    if (isLoading) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-white/5 rounded-md ${className}`}>
                <Building2Icon size={16} className="text-white/40" />
                <span className="text-sm text-white/40">Loading branches...</span>
            </div>
        )
    }

    if (branches.length === 0) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-white/5 rounded-md ${className}`}>
                <Building2Icon size={16} className="text-white/40" />
                <span className="text-sm text-white/40">No branches</span>
            </div>
        )
    }

    if (branches.length === 1) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-white/5 rounded-md ${className}`}>
                <Building2Icon size={16} className="text-blue-400" />
                <span className="text-sm font-medium">{branches[0].name}</span>
            </div>
        )
    }

    return (
        <div className={`relative ${className}`}>
            <select
                value={currentBranch?.id ?? branches[0]?.id ?? "all"}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm font-medium cursor-pointer hover:bg-white/10 focus:outline-none focus:border-white/30 appearance-none pr-8 w-full"
            >
                {showAllOption && !forceSelect && (
                    <option value="all">All Branches</option>
                )}
                {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                    </option>
                ))}
            </select>
            <ChevronDownIcon
                size={16}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
            />
        </div>
    )
}
```

Note: Add `useEffect` to the import from "react" at the top of the file.

**Step 2: Update the sales page to use `forceSelect`**

In `app/sales/salesPage.tsx`, line 56, change:

```tsx
// Before:
<BranchSelector className='w-48' />

// After:
<BranchSelector className='w-48' forceSelect />
```

**Step 3: Verify the fix compiles**

Run: `bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add components/branch-selector.tsx app/sales/salesPage.tsx
git commit -m "fix(sales): force branch selection on sales page to prevent null/Shared transactions"
```

---

### Task 2.2: Fix `refreshTransactions` to handle null branch gracefully

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:406-413`

**Step 1: Allow `refreshTransactions` to work without a branch filter**

In `components/sales/context/SalesContext.tsx`, locate `refreshTransactions` (around line 406) and change:

```typescript
// Before:
const refreshTransactions = useCallback(async () => {
    if (!currentBranch?.id) return
    setTxnLoading(true)
    try {
        const result = await getTransactions({
            page: txnPage,
            pageSize: txnPageSize,
            filters: { branchId: currentBranch.id },
        })

// After:
const refreshTransactions = useCallback(async () => {
    setTxnLoading(true)
    try {
        const result = await getTransactions({
            page: txnPage,
            pageSize: txnPageSize,
            filters: currentBranch?.id ? { branchId: currentBranch.id } : undefined,
        })
```

**Step 2: Verify the fix compiles**

Run: `bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/sales/context/SalesContext.tsx
git commit -m "fix(sales): allow refreshTransactions without branch filter for All Branches mode"
```

---

## Phase 3: Display Branch in Recent Transactions Table

### Task 3.1: Add branch column to RecentTransactions

**Files:**
- Modify: `components/sales/layout/RecentTransactions.tsx`

**Step 1: Add `branches` as a prop and import**

Update the imports and the `RecentTransactionsProps` interface:

```typescript
import { Transaction } from "@/utils/types/transactions"
import { Branch } from "@/utils/types/branch"
```

Add `branches` and `currentBranch` to `RecentTransactionsProps`:

```typescript
interface RecentTransactionsProps {
    transactions: Transaction[]
    loading: boolean
    taxSettings: CurrencyTaxValue
    handleVoid: (txnId: string) => void
    setSelectedTransactionForPayment: (txn: Transaction | null) => void
    setIsAddPaymentModalOpen: (open: boolean) => void
    isTransactionsOpen: boolean
    setIsTransactionsOpen: (open: boolean) => void
    txnPage: number
    setTxnPage: (page: number) => void
    txnPageSize: number
    setTxnPageSize: (size: number) => void
    txnHasMore: boolean
    txnLoading: boolean
    refreshTransactions: () => Promise<void>
    branches: Branch[]
}
```

**Step 2: Add `branches` and `currentBranch` to the destructured props**

In the component function signature, destructure the new props:

```typescript
export default function RecentTransactions({
    transactions,
    loading,
    taxSettings,
    handleVoid,
    setSelectedTransactionForPayment,
    setIsAddPaymentModalOpen,
    isTransactionsOpen,
    setIsTransactionsOpen,
    txnPage,
    setTxnPage,
    txnPageSize,
    setTxnPageSize,
    txnHasMore,
    txnLoading,
    refreshTransactions,
    branches,
}: RecentTransactionsProps) {
```

**Step 3: Create a branch lookup map and add the Branch column**

Add a branch name lookup map at the beginning of the component body:

```typescript
const branchNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of branches) {
        map[b.id] = b.name
    }
    return map
}, [branches])
```

Add `useMemo` to the React import.

Add a new column header after "Transaction #" in the table header:

```tsx
<th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>
    Branch
</th>
```

Add a new `<td>` after the transaction number cell:

```tsx
<td className='px-3 py-1 text-sm font-medium w-max'>
    {txn.branch_id ? (
        <span className='text-xs px-1.5 py-0.5 bg-blue-400/20 text-blue-300 rounded'>
            {branchNameMap[txn.branch_id] || 'Unknown'}
        </span>
    ) : (
        <span className='text-xs px-1.5 py-0.5 bg-white/10 rounded'>
            Shared
        </span>
    )}
</td>
```

**Step 4: Pass `branches` prop from `SalesContent`**

In `app/sales/salesPage.tsx`, update the `RecentTransactions` component to pass `branches`:

```tsx
// First, import useBranchContext at the top (after existing imports)
import { useBranchContext } from "@/components/branch-context"
```

In the `SalesContent` function, add:

```typescript
const { branches } = useBranchContext()
```

And update the `RecentTransactions` component call:

```tsx
<RecentTransactions
    {...sales}
    refreshTransactions={sales.refreshTransactions}
    branches={branches}
/>
```

**Step 5: Verify the fix compiles**

Run: `bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add components/sales/layout/RecentTransactions.tsx app/sales/salesPage.tsx
git commit -m "feat(sales): add branch column to recent transactions table"
```

---

## Phase 4: Fix Appointment-to-Transaction Path

### Task 4.1: Add accounting ledger entry to `createTransactionFromAppointment`

**Files:**
- Modify: `server/actions/sales.ts`

**Step 1: Import `createAutoLedgerEntry` and `generateTransactionNumberWithTx`**

In `server/actions/sales.ts`, add these imports:

```typescript
import { createAutoLedgerEntry } from './accounting'
import { generateTransactionNumberWithTx } from './transactions'
```

**Step 2: Replace the simple transaction number generation with branch-aware format**

In `server/actions/sales.ts`, find the transaction number generation (around line 113-115) and replace:

```typescript
// Before:
const now = new Date()
const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
const randomStr = Math.random().toString(36).substring(2, 5).toUpperCase()
const transactionNumber = `TXN-${dateStr}-${randomStr}`
```

Note: This function does not use a database transaction wrapper, so we need a different approach. Since `generateTransactionNumberWithTx` requires a `TransactionClient`, we should wrap the appointment transaction creation in `withTransaction` similar to how `createTransaction` does it, or generate the number separately.

However, to keep the change minimal and avoid a large refactor, we'll generate the transaction number using the existing `generateTransactionNumberWithTx` by first creating a DB transaction context. This is a larger refactor that should be done carefully.

For now, we'll at minimum use the branch code prefix to maintain consistency:

```typescript
const now = new Date()
const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
let branchCode = 'TXN'
if (appointment.branchId) {
    const branchResult = await db.select({ code: branches.code }).from(branches).where(eq(branches.id, appointment.branchId)).limit(1)
    if (branchResult.length > 0) {
        branchCode = `${branchResult[0].code}-CR`
    }
}
const transactionNumber = `${branchCode}-${dateStr}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`
```

Also add the `branches` import:

```typescript
import { branches } from '@/server/db/schema/branches'
```

**Step 3: Add accounting ledger entry after transaction creation**

In `server/actions/sales.ts`, after the payroll entries loop (around line 198) and before the log creation, add:

```typescript
// Create accounting entry for the appointment sale
const appointmentTotal = Number(newTransaction.total)
try {
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
            credit: appointmentTotal,
            branch_id: appointment.branchId ?? null,
        },
        user.id
    )
} catch (accountingError) {
    await logError({
        type: 'ACCOUNTING',
        message: `Failed to create accounting entry for appointment transaction ${transactionNumber}: ${accountingError instanceof Error ? accountingError.message : String(accountingError)}`
    })
}
```

**Step 4: Verify the fix compiles**

Run: `bun run build 2>&1 | head -30`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add server/actions/sales.ts
git commit -m "fix(sales): add accounting ledger entry and branch-aware TXN number to appointment transactions"
```

---

## Phase 5: Lint and Build Verification

### Task 5.1: Run lint and fix all issues

**Step 1: Run ESLint**

Run: `bun run lint 2>&1`

**Step 2: Fix any lint errors or warnings**

Address each lint error found. Common fixes:
- Unused imports (remove them)
- Missing type annotations (add explicit types)
- Any `any` types (replace with proper types)

**Step 3: Re-run lint to confirm clean**

Run: `bun run lint 2>&1`
Expected: No errors or warnings

**Step 4: Commit lint fixes**

```bash
git add -A
git commit -m "chore: fix lint errors from sales branch fix"
```

---

### Task 5.2: Run build and fix all errors

**Step 1: Run production build**

Run: `bun run build 2>&1`

**Step 2: Fix any build errors**

Address each TypeScript or build error. Common fixes:
- Type mismatches from the new `forceSelect` prop
- Missing `useEffect` / `useMemo` imports
- Type errors in `branch_id` changes

**Step 3: Re-run build to confirm clean**

Run: `bun run build 2>&1`
Expected: Build succeeds with no errors

**Step 4: Commit build fixes**

```bash
git add -A
git commit -m "chore: fix build errors from sales branch fix"
```

---

## Summary of Changes

| # | Bug/Issue | File(s) | Severity |
|---|-----------|---------|----------|
| 1 | `branch_id` not passed to ledger in `createTransaction` | `server/actions/transactions.ts:213-227` | Critical |
| 2 | `branch_id` not passed to ledger in `voidTransaction` | `server/actions/transactions.ts:504-518` | Critical |
| 3 | `branch_id` not passed to ledger in `refundTransaction` | `server/actions/transactions.ts:607-621` | Critical |
| 4 | `transformTransaction` uses `\|\| undefined` instead of `?? null` | `server/actions/transactions.ts:299` | Medium |
| 5 | `BranchSelector` misleading when `currentBranch` is null | `components/branch-selector.tsx`, `app/sales/salesPage.tsx` | High |
| 6 | `refreshTransactions` exits silently for null branch | `components/sales/context/SalesContext.tsx:407` | Medium |
| 7 | No branch column in RecentTransactions table | `components/sales/layout/RecentTransactions.tsx` | Low |
| 8 | Appointment transactions missing accounting entry | `server/actions/sales.ts` | Medium |
| 9 | Appointment transactions use wrong TXN number format | `server/actions/sales.ts` | Low |