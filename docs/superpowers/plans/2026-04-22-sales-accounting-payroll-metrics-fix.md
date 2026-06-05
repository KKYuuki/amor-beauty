# Sales, Accounting, Payroll & Metrics Comprehensive Fix Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all reported issues across Sales (partial/split payments, discount+override), Accounting (voided transaction sign convention, metrics overstating revenue), Payroll (branch selector, disbursement logic), and Metrics (voided transactions not excluded from calculations), plus resolve all lint/build warnings.

**Architecture:** Cross-module fix spanning server actions (accounting, transactions, payroll, metrics), UI components (payroll page, sales context, checkout modals, accounting page), and shared types. Phases are sequenced so foundational accounting fixes land first (since payroll and metrics depend on accounting), then sales fixes, then payroll fixes, then metrics, and finally lint/build.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Tailwind CSS 4, Drizzle ORM, Supabase/PostgreSQL

**Task Dependency Graph:**
```
Phase 1 (Accounting) ──> Phase 4 (Metrics)
Phase 2 (Sales)        ──> Phase 5 (Payroll)
Phase 1 + 2 + 4 + 5 ──> Phase 6 (Improvements)
All prior ───────────────> Phase 7 (Lint/Build)
```

Phases 1 and 2 can run in parallel. Phase 4 depends on Phase 1. Phase 5 depends on Phase 2.

---

## Chunk 1: Accounting — Sign Convention & Calculation Fixes

### Problem Analysis

The accounting sign convention (`balance = debit - credit`) is correct per standard double-entry accounting. However, there are real calculation bugs:

1. **Metrics functions overstate revenue** — 9 functions only sum the `credit` column for REVENUE entries, ignoring debit-side reductions from voided sales and refunds. When a ₱1,000 sale is voided, the original `credit=1000` entry AND the reversing `debit=1000` entry both have `isVoided=false` and are included in queries. Summing only credits gives ₱1,000 instead of ₱0.
2. **Executive accounting metrics** — Same issue in `getExecutiveAccountingMetrics`: `revenue = totalCredit` and `prevRevenue += credit`, which ignores contra-entries.
3. **Revenue breakdown** — `getRevenueBreakdown` only sums `credit` grouped by category, so `VOIDED_SALES` shows as ₱0 (credit=0) while `SALES` shows full gross amount.
4. **Transaction count** — `getScopedFinancialMetrics` uses `entries.length` (ledger entries) as transaction count, inflating count for split payments and voids.
5. **Revenue expense trend** — `getRevenueExpenseTrend` only adds `credit` for revenue and `debit` for expenses, missing contra-entries.

### Task 1.1: Fix `getScopedFinancialMetrics` to use net revenue

**Files:**
- Modify: `server/actions/metrics.ts:80-148`

**Current behavior (WRONG):** Only selects `credit` column for REVENUE entries, sums only credits as revenue, uses `entries.length` as transaction count.

- [ ] **Step 1: Fix the query to select both debit and credit**

In `server/actions/metrics.ts`, update `getScopedFinancialMetrics` (~lines 119-133):

```typescript
const entries = await db
    .select({
        debit: generalLedger.debit,
        credit: generalLedger.credit,
    })
    .from(generalLedger)
    .where(and(...conditions))

let revenue = 0
let transactionCount = new Set<string>()

entries.forEach((entry) => {
    const debit = Number(entry.debit) || 0
    const credit = Number(entry.credit) || 0
    revenue += credit - debit
})

const averageTicket = revenue > 0 ? revenue / entries.length : 0
```

Note: We cannot get distinct transaction count from the ledger alone without joining. The `entries.length` will still be entry count, but revenue is now net. For true transaction count, we'd need a separate query. Keep `entries.length` as a fallback until we add a `source_type` filter, but rename to avoid confusion.

- [ ] **Step 2: Update the return value field name**

Change `transactions` to `entryCount` to avoid confusion, or add a separate transaction count query. For now, keep `transactions` but document its meaning:

```typescript
const metrics: FinancialMetrics = {
    revenue,
    transactions: entries.length,
    averageTicket: entries.length > 0 ? revenue / entries.length : 0,
}
```

- [ ] **Step 3: Run lint to verify no errors**

Run: `bun run lint`
Expected: PASS (no new errors)

- [ ] **Step 4: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): correct revenue calculation in getScopedFinancialMetrics to account for contra-entries"
```

### Task 1.2: Fix `getRevenueTrend` to use net revenue

**Files:**
- Modify: `server/actions/metrics.ts:163-237`

**Current behavior:** Only sums `credit` for REVENUE entries grouped by date.

- [ ] **Step 1: Update the query and aggregation**

In `server/actions/metrics.ts`, update `getRevenueTrend` (~lines 201-224):

```typescript
const entries = await db
    .select({
        entryDate: generalLedger.entryDate,
        debit: generalLedger.debit,
        credit: generalLedger.credit,
    })
    .from(generalLedger)
    .where(and(...conditions))
    .orderBy(desc(generalLedger.entryDate))

const grouped = new Map<string, number>()

entries.forEach((entry) => {
    const date = new Date(entry.entryDate)
    let key: string

    if (groupBy === 'month') {
        key = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
    } else {
        key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    const current = grouped.get(key) || 0
    const debit = Number(entry.debit) || 0
    const credit = Number(entry.credit) || 0
    grouped.set(key, current + (credit - debit))
})
```

- [ ] **Step 2: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): correct revenue trend to subtract contra-entries"
```

### Task 1.3: Fix `getRevenueBreakdown` to show net amounts per category

**Files:**
- Modify: `server/actions/metrics.ts:1168-1222`

**Current behavior:** Only sums `credit` grouped by category. `VOIDED_SALES` shows as ₱0, while `SALES` shows full gross.

- [ ] **Step 1: Update the query to select both debit and credit**

In `server/actions/metrics.ts`, update `getRevenueBreakdown` (~lines 1199-1214):

```typescript
const entries = await db
    .select({
        category: generalLedger.category,
        debit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
        credit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
    })
    .from(generalLedger)
    .where(and(...conditions))
    .groupBy(generalLedger.category)

const totalRevenue = entries.reduce((sum, entry) => {
    const net = (Number(entry.credit) || 0) - (Number(entry.debit) || 0)
    return sum + net
}, 0)

const breakdown: RevenueBreakdownItem[] = entries.map((entry) => {
    const net = (Number(entry.credit) || 0) - (Number(entry.debit) || 0)
    return {
        category: entry.category || 'Uncategorized',
        amount: net,
        percentage: totalRevenue > 0 ? (net / totalRevenue) * 100 : 0,
    }
}).filter(item => item.amount !== 0)
    .sort((a, b) => b.amount - a.amount)
```

- [ ] **Step 2: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): correct revenue breakdown to show net amounts per category"
```

### Task 1.4: Fix `getRevenueExpenseTrend` to use net revenue and net expenses

**Files:**
- Modify: `server/actions/metrics.ts:1231-1317`

- [ ] **Step 1: Update the aggregation logic**

In `server/actions/metrics.ts`, update `getRevenueExpenseTrend` (~lines 1282-1301):

```typescript
entries.forEach((entry) => {
    const date = new Date(entry.entryDate)
    const key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    if (!grouped.has(key)) {
        grouped.set(key, { revenue: 0, expenses: 0 })
    }

    const current = grouped.get(key)
    if (current) {
        const debit = Number(entry.debit) || 0
        const credit = Number(entry.credit) || 0

        if (entry.entryType === 'REVENUE') {
            current.revenue += credit - debit
        } else if (entry.entryType === 'EXPENSE') {
            current.expenses += debit - credit
        }
    }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): correct revenue/expense trend to use net values (credit-debit for revenue)"
```

### Task 1.5: Fix `getExecutiveAccountingMetrics` to use net revenue/expenses

**Files:**
- Modify: `server/actions/metrics.ts:1331-1567`

**Current behavior:** P&L totals only look at `totalCredit` for revenue and `totalDebit` for expenses. Previous period only sums `credit` for revenue and `debit` for expenses.

- [ ] **Step 1: Fix P&L totals calculation**

In `server/actions/metrics.ts`, update the P&L totals loop (~lines 1433-1439):

```typescript
for (const row of plTotals) {
    if (row.entryType === 'REVENUE') {
        revenue = (Number(row.totalCredit) || 0) - (Number(row.totalDebit) || 0)
    } else if (row.entryType === 'EXPENSE') {
        expenses = (Number(row.totalDebit) || 0) - (Number(row.totalCredit) || 0)
    }
}
```

- [ ] **Step 2: Fix previous period calculation**

Update ~lines 1474-1479:

```typescript
prevEntries.forEach((entry) => {
    const debit = Number(entry.debit) || 0
    const credit = Number(entry.credit) || 0
    if (entry.entryType === 'REVENUE') prevRevenue += credit - debit
    else if (entry.entryType === 'EXPENSE') prevExpenses += debit - credit
})
```

- [ ] **Step 3: Fix expense breakdown to use net**

Update the expense breakdown query result processing (~lines 1402-1408). The query already groups by category and selects `SUM(debit)`, but should also subtract credits:

```typescript
const expenseRows = await db
    .select({
        category: generalLedger.category,
        debit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
        credit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
    })
    .from(generalLedger)
    .where(and(...expenseConditions))
    .groupBy(generalLedger.category)
```

Then for the breakdown:

```typescript
const totalExpenses = expenseRows.reduce((sum, row) => {
    return sum + ((Number(row.debit) || 0) - (Number(row.credit) || 0))
}, 0)

const expenseBreakdown: ExpenseBreakdownItem[] = expenseRows
    .map((row) => {
        const net = (Number(row.debit) || 0) - (Number(row.credit) || 0)
        return {
            category: row.category || 'Uncategorized',
            amount: net,
            percentage: totalExpenses > 0 ? Math.abs(net / totalExpenses) * 100 : 0,
        }
    })
    .filter(item => item.amount !== 0)
    .sort((a, b) => b.amount - a.amount)
```

- [ ] **Step 4: Fix revenue breakdown in executive metrics similarly**

Update the revenue rows query to include both debit and credit:

```typescript
const revenueRows = await db
    .select({
        category: generalLedger.category,
        debit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
        credit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
    })
    .from(generalLedger)
    .where(and(...revenueConditions))
    .groupBy(generalLedger.category)
```

Then:

```typescript
const totalRevenue = revenueRows.reduce((sum, row) => {
    return sum + ((Number(row.credit) || 0) - (Number(row.debit) || 0))
}, 0)

const revenueBreakdown: RevenueBreakdownItem[] = revenueRows
    .map((row) => {
        const net = (Number(row.credit) || 0) - (Number(row.debit) || 0)
        return {
            category: row.category || 'Uncategorized',
            amount: net,
            percentage: totalRevenue > 0 ? (net / totalRevenue) * 100 : 0,
        }
    })
    .filter(item => item.amount !== 0)
    .sort((a, b) => b.amount - a.amount)
```

- [ ] **Step 5: Fix trend rows to use net revenue/expenses**

Update trend row processing (~lines 1539-1543):

```typescript
for (const row of trendRows) {
    const key = row.dateKey
    if (!trendMap.has(key)) {
        trendMap.set(key, { revenue: 0, expenses: 0 })
    }
    const current = trendMap.get(key)!
    if (row.entryType === 'REVENUE') {
        current.revenue += (Number(row.totalCredit) || 0) - (Number(row.totalDebit) || 0)
    } else if (row.entryType === 'EXPENSE') {
        current.expenses += (Number(row.totalDebit) || 0) - (Number(row.totalCredit) || 0)
    }
}
```

- [ ] **Step 6: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): correct executive accounting metrics to use net revenue/expenses"
```

### Task 1.6: Fix `fetchGeneralLedgerAggregates` and export functions

**Files:**
- Modify: `server/actions/metrics.ts:1607-1650`
- Modify: `server/actions/metrics.ts:1839-2077`

- [ ] **Step 1: Fix `fetchGeneralLedgerAggregates`**

Read the function at ~line 1607 and fix `revenue = totalCredit` to `revenue = totalCredit - totalDebit` for REVENUE entries, and `expenses = totalDebit - totalCredit` for EXPENSE entries.

- [ ] **Step 2: Fix `exportMetrics`**

Find the export function (~line 1868) and update revenue calculation from `credit` only to `credit - debit` for REVENUE entries.

- [ ] **Step 3: Fix `exportGroupedMetrics`**

Find the grouped export function (~line 1982) and update revenue calculation similarly.

- [ ] **Step 4: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): correct ledger aggregates and export functions to use net revenue"
```

### Task 1.7: Fix accounting page breakdown display for natural credit accounts

**Files:**
- Modify: `app/accounting/accountingPage.tsx`

**Current behavior:** The breakdown uses `net = bt.debit - bt.credit` for ALL account types. This shows REVENUE as a negative number (since credits > debits for revenue accounts).

- [ ] **Step 1: Add natural balance direction helper**

Near the top of the component function in `app/accounting/accountingPage.tsx`:

```typescript
const NATURAL_BALANCE: Record<string, 'debit' | 'credit'> = {
    EXPENSE: 'debit',
    REVENUE: 'credit',
    ASSET: 'debit',
    LIABILITY: 'credit',
    EQUITY: 'credit',
}
```

- [ ] **Step 2: Update the breakdown display**

Find where `net` is calculated per type and update:

```typescript
const naturalSide = NATURAL_BALANCE[bt.type] || 'debit'
const net = naturalSide === 'credit'
    ? bt.credit - bt.debit
    : bt.debit - bt.credit
const isPositive = net >= 0
```

- [ ] **Step 3: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "fix(accounting): display net amounts using natural balance direction for each account type"
```

### Task 1.8: Fix `getNetIncomeMetrics` and `getPLMetrics` (verify they're already correct)

**Files:**
- Verify: `server/actions/metrics.ts` (getNetIncomeMetrics, getPLMetrics)

- [ ] **Step 1: Verify these functions already use `credit - debit` for revenue**

Read the functions and confirm they're already correct. If they are, skip. If not, fix same as above pattern.

Based on the exploration, `getNetIncomeMetrics` and `getPLMetrics` already compute `revenue += credit - debit` for REVENUE entries, so no changes needed here.

---

## Chunk 2: Sales — Partial Payment & Discount Fixes

### Problem Analysis

1. **Partial payment accounting double-counts revenue** — When a PARTIAL transaction is created, the ledger entry credits the FULL `total` (not `amount_paid`). When additional payments are added via `addTransactionPayment`, another entry credits the additional amount. This means a ₱1,000 partial payment with ₱500 down gets ₱1,000 in revenue credits, then another ₱500 when completed = ₱1,500 total credits instead of ₱1,000.

2. **Partial transactions can't be voided** — The UI only shows the void button for `COMPLETED` transactions, not `PARTIAL`.

3. **AddPaymentModal shows incorrect balance** — Uses `selectedTransaction.total - selectedTransaction.amount_paid` but these are strings from API, potential type mismatch.

### Task 2.1: Fix partial payment accounting — credit only `amount_paid`, not full `total`

**Files:**
- Modify: `server/actions/transactions.ts:219-262`

**Current behavior:** For non-SPLIT transactions, the ledger entry credits `payload.total` regardless of whether it's a partial payment.

- [ ] **Step 1: Change single-payment entry to credit `amount_paid` instead of `total`**

In `server/actions/transactions.ts`, update the accounting entry section (~lines 244-261):

```typescript
} else {
    // Single payment method — credit the amount actually paid
    const creditAmount = payload.amount_paid ?? payload.total
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
            credit: creditAmount,
            branch_id: payload.branch_id,
            payment_method: mapTransactionToAccountingPaymentMethod(payload.payment_method),
        },
        user.id,
        tx
    )
}
```

For SPLIT payments, each split entry already uses `payment.amount` which is correct — no change needed.

- [ ] **Step 2: Verify addTransactionPayment credits only the additional amount**

The existing `addTransactionPayment` code (~line 856-872) already credits `payload.amount` (the additional payment), which is correct. No change needed.

- [ ] **Step 3: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix(sales): credit only amount_paid for partial payment transactions, not full total"
```

### Task 2.2: Allow voiding PARTIAL transactions

**Files:**
- Modify: `components/sales/layout/RecentTransactions.tsx`
- Modify: `app/transactions/transactionsPage.tsx`
- Modify: `app/transactions/transactionDetailClient.tsx`

**Current behavior:** Void button only renders when `txn.status === "COMPLETED"`. PARTIAL transactions cannot be voided.

- [ ] **Step 1: Update RecentTransactions to allow voiding PARTIAL transactions**

Find the void button condition (~line 234) and change from `txn.status === "COMPLETED"` to `txn.status === "COMPLETED" || txn.status === "PARTIAL"`:

```tsx
{(txn.status === "COMPLETED" || txn.status === "PARTIAL") && (
    // void button
)}
```

- [ ] **Step 2: Update transactionsPage.tsx similarly**

Find the same pattern and update.

- [ ] **Step 3: Update transactionDetailClient.tsx to handle partial void status display**

Ensure the detail page shows appropriate status for partial void.

- [ ] **Step 4: Verify backend already supports voiding partial transactions**

The `voidTransaction` function checks for `status === 'VOIDED'` to prevent double-void, but does NOT restrict to COMPLETED — it allows any non-VOIDED status. No change needed on backend.

- [ ] **Step 5: Commit**

```bash
git add components/sales/layout/RecentTransactions.tsx app/transactions/transactionsPage.tsx app/transactions/transactionDetailClient.tsx
git commit -m "fix(sales): allow voiding PARTIAL transactions in addition to COMPLETED"
```

### Task 2.3: Fix AddPaymentModal balance display

**Files:**
- Modify: `components/sales/modals/AddPaymentModal.tsx:76`

**Current behavior:** Balance is calculated as `selectedTransaction.total - selectedTransaction.amount_paid` but these may be string types.

- [ ] **Step 1: Use parseFloat for safe balance calculation**

In `components/sales/modals/AddPaymentModal.tsx` ~line 76:

```tsx
<span className='font-bold text-amber-600 dark:text-amber-400'>
    {taxSettings.currency_symbol} {(parseFloat(String(selectedTransaction.total)) - parseFloat(String(selectedTransaction.amount_paid))).toFixed(2)}
</span>
```

Also show the total and amount paid contextually:

```tsx
<div className='flex justify-between text-sm'>
    <span className='text-zinc-600 dark:text-zinc-400'>Total:</span>
    <span className='font-medium'>{taxSettings.currency_symbol} {parseFloat(String(selectedTransaction.total)).toFixed(2)}</span>
</div>
<div className='flex justify-between text-sm'>
    <span className='text-zinc-600 dark:text-zinc-400'>Already Paid:</span>
    <span className='font-medium text-green-600'>{taxSettings.currency_symbol} {parseFloat(String(selectedTransaction.amount_paid)).toFixed(2)}</span>
</div>
<div className='flex justify-between text-sm font-medium'>
    <span className='text-zinc-600 dark:text-zinc-400'>Balance Due:</span>
    <span className='text-amber-600 dark:text-amber-400'>
        {taxSettings.currency_symbol} {(parseFloat(String(selectedTransaction.total)) - parseFloat(String(selectedTransaction.amount_paid))).toFixed(2)}
    </span>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add components/sales/modals/AddPaymentModal.tsx
git commit -m "fix(sales): improve AddPaymentModal balance display with safe number parsing"
```

### Task 2.4: Fix partial payment ledger entry for `createTransactionFromAppointment`

**Files:**
- Modify: `server/actions/sales.ts`

- [ ] **Step 1: Find the appointment flow and fix accounting entries**

In `server/actions/sales.ts`, find where the accounting entry is created for appointment-sourced transactions. Change the credit from full `total` to `amount_paid` (which is 0 for PENDING appointments):

```typescript
// For PENDING appointments, don't create a revenue entry until payment is actually received
if (Number(newTransaction.amountPaid) > 0) {
    await createAutoLedgerEntry('TRANSACTION', newTransaction.id, {
        entry_date: new Date(),
        entry_type: 'REVENUE',
        category: 'SALES',
        description: `Sale: ${transactionNumber}`,
        reference: transactionNumber,
        debit: 0,
        credit: Number(newTransaction.amountPaid),
        branch_id: newTransaction.branchId,
        payment_method: mapTransactionToAccountingPaymentMethod(newTransaction.paymentMethod),
    }, user.id, tx)
}
```

For PENDING transactions with `amountPaid = 0`, no revenue should be recorded until payment is actually made.

- [ ] **Step 2: Commit**

```bash
git add server/actions/sales.ts
git commit -m "fix(sales): only create revenue entry for appointment transactions when amount is paid"
```

---

## Chunk 3: Payroll Fixes

### Problem Analysis

1. **Branch selector onChange is a no-op** — The `BranchSelectorInline` in payroll has `onChange={(_branchId) => {}}`, meaning the branch context never updates, so all payroll data always shows for the same branch.

2. **Deductions and scheduled payments not branch-filtered** — `getAllDeductions()` and `getScheduledPayments()` accept no branchId.

3. **Manual payroll entries bypass rate lookup** — `shopCut: '0'`, `artistCut: amount` with no rate enforcement.

4. **`BANK` vs `BANK_TRANSFER` inconsistency** — Old DB rows may have `BANK`, normalization exists but Zod schema doesn't include it.

5. **Disbursement accounting double-counting** — Both `completePayrollRequest` and `createDisbursement` can create accounting entries.

### Task 3.1: Fix payroll branch selector

**Files:**
- Modify: `app/payroll/payrollPage.tsx:99,429-436`

**Current behavior:** `onChange` callback does nothing. The branch context is never updated.

- [ ] **Step 1: Destructure `branches` and `setCurrentBranch` from `useBranchContext()`**

In `app/payroll/payrollPage.tsx` ~line 99:

```typescript
const { currentBranch, branches, setCurrentBranch } = useBranchContext()
```

- [ ] **Step 2: Fix the onChange handler**

~Lines 429-436:

```tsx
<BranchSelectorInline
    value={currentBranch?.id}
    onChange={(branchId, _isShared) => {
        if (branchId === null) {
            setCurrentBranch(null)
        } else {
            const branch = branches.find(b => b.id === branchId)
            if (branch) setCurrentBranch(branch)
        }
    }}
    showSharedOption={true}
    className="w-48"
/>
```

- [ ] **Step 3: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "fix(payroll): make branch selector actually update branch context"
```

### Task 3.2: Audit and fix disbursement double-counting

**Files:**
- Modify: `server/actions/payroll-disbursements.ts`
- Modify: `server/actions/payroll.ts`

**Current behavior:** When `completePayrollRequest` is called, it creates a single full EXPENSE entry. If `createDisbursement` is then used for the same request, each disbursement also creates an EXPENSE entry. This leads to double-counting.

The `completePayrollRequest` flow and disbursement flow are separate:
- `completePayrollRequest` → single payment, creates one full EXPENSE entry
- Staggered flow → confirm first, then `createDisbursement` for each payment, each creating a partial EXPENSE entry

The bug occurs if `completePayrollRequest` is called AND disbursements are also created.

- [ ] **Step 1: Read the current payroll disbursement code**

Read `server/actions/payroll-disbursements.ts` fully to understand current accounting entry logic.

- [ ] **Step 2: Ensure `createDisbursement` always creates an accounting entry**

In `server/actions/payroll-disbursements.ts`, the `createDisbursement` function should always create an accounting entry for each disbursement. Verify this is the case. If there's a conditional that skips accounting entry creation when `newDisbursed >= totalArtistCut`, remove that condition.

- [ ] **Step 3: Add `skip_accounting_entry` flag to `completePayrollRequest`**

If `completePayrollRequest` is used for a single full payment, the accounting entry is correct. But if staggered disbursements are used (the `confirmAndDisburse` flow), `completePayrollRequest` should not create its own accounting entry. Add an optional parameter:

In the `completePayrollRequest` action, find where the accounting entry is created and check for a bypass flag or verify the flow doesn't double-create. Read the confirm-and-disburse flow in `payrollPage.tsx` to understand the call sequence.

- [ ] **Step 4: Commit**

```bash
git add server/actions/payroll-disbursements.ts server/actions/payroll.ts
git commit -m "fix(payroll): prevent disbursement accounting double-counting"
```

### Task 3.3: Fix manual payroll entry rate lookup

**Files:**
- Modify: `server/actions/payroll.ts`

**Current behavior:** `createManualPayrollEntry` sets `shopCut: '0'`, `artistCut: String(amount)` with no rate enforcement.

- [ ] **Step 1: Add rate lookup for manual entries**

Find `createManualPayrollEntry` in `server/actions/payroll.ts` and update to look up the applicable rate based on `serviceType` and `artistLevel`. Use the same `getApplicableRate` function. If no rate is found or service is `MANUAL`, fall back to 100% artist / 0% shop.

- [ ] **Step 2: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): enforce rate lookup for manual payroll entries"
```

### Task 3.4: Fix BANK vs BANK_TRANSFER and Zod schema

**Files:**
- Modify: `server/actions/payroll-schemas.ts:13`
- Modify: `utils/types/payment.ts`

**Current behavior:** Zod schema doesn't include `BANK` as a valid payment method, but old DB rows may have it.

- [ ] **Step 1: Add BANK to Zod schema**

In `server/actions/payroll-schemas.ts`:

```typescript
paymentMethod: z.enum(['CASH', 'GCASH', 'MAYA', 'BANK', 'BANK_TRANSFER', 'CARD', 'CRYPTO']),
```

- [ ] **Step 2: Ensure `normalizePayrollPaymentMethod` is applied everywhere**

Verify that all payroll actions normalize `BANK` → `BANK_TRANSFER` before DB writes. Check `completePayrollRequest` and `createDisbursement` for this normalization.

- [ ] **Step 3: Commit**

```bash
git add server/actions/payroll-schemas.ts utils/types/payment.ts
git commit -m "fix(payroll): add BANK to Zod schema and verify normalization"
```

---

## Chunk 4: Additional Improvements

### Task 4.1: Add SplitPayment ID uniqueness guarantee

**Files:**
- Modify: `components/sales/checkout/SplitPaymentBuilder.tsx`

**Current behavior:** Uses `Date.now().toString()` for split payment IDs, which can collide on fast interactions.

- [ ] **Step 1: Replace Date.now() with crypto.randomUUID()**

In `SplitPaymentBuilder.tsx`, find the `addPayment` handler and change:

```typescript
id: crypto.randomUUID()
```

Or use a counter:

```typescript
id: `split-${Date.now()}-${Math.random().toString(36).slice(2)}`
```

- [ ] **Step 2: Commit**

```bash
git add components/sales/checkout/SplitPaymentBuilder.tsx
git commit -m "fix(sales): improve split payment ID uniqueness with crypto.randomUUID"
```

### Task 4.2: Reset splitPayments state when switching away from SPLIT

**Files:**
- Modify: `components/sales/context/SalesContext.tsx`

**Current behavior:** When the user switches payment method away from SPLIT, the `splitPayments` state persists with stale data.

- [ ] **Step 1: Reset splitPayments when payment method changes away from SPLIT**

Find where `paymentMethod` is set and add:

```typescript
// In the payment method setter callback or in a useEffect:
useEffect(() => {
    if (paymentMethod !== 'SPLIT') {
        setSplitPayments([])
    }
}, [paymentMethod])
```

- [ ] **Step 2: Commit**

```bash
git add components/sales/context/SalesContext.tsx
git commit -m "fix(sales): reset split payments when switching away from SPLIT payment method"
```

### Task 4.3: Add reference number validation for non-CASH split payments

**Files:**
- Modify: `components/sales/checkout/SplitPaymentBuilder.tsx`
- Modify: `components/sales/modals/CheckoutModal.tsx`

- [ ] **Step 1: Add visual required indicator for reference numbers on non-CASH methods**

In `SplitPaymentBuilder.tsx`, update the reference number input for non-CASH methods to show a required indicator:

```tsx
{payment.payment_method !== 'CASH' && (
    <div className='relative'>
        <input
            type='text'
            value={payment.reference_number || ''}
            onChange={(e) =>
                updatePayment(payment.id, 'reference_number', e.target.value)
            }
            placeholder='Ref # (required)'
            className={`w-24 px-3 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-blue-500 ${
                payment.payment_method !== 'CASH' && !payment.reference_number?.trim()
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800'
            }`}
        />
        {payment.payment_method !== 'CASH' && !payment.reference_number?.trim() && (
            <span className='text-amber-500 text-xs absolute -bottom-4 left-0'>Required</span>
        )}
    </div>
)}
```

- [ ] **Step 2: Add validation in CheckoutModal**

In `CheckoutModal.tsx`, add validation:

```typescript
const hasRequiredReferences = paymentMethod !== 'SPLIT' || splitPayments.every(
    p => p.payment_method === 'CASH' || (p.reference_number?.trim() ?? '') !== ''
)
```

Add `hasRequiredReferences` to the `isValid` check.

- [ ] **Step 3: Commit**

```bash
git add components/sales/checkout/SplitPaymentBuilder.tsx components/sales/modals/CheckoutModal.tsx
git commit -m "fix(sales): add reference number validation for non-CASH split payments"
```

### Task 4.4: Filter deductions and scheduled payments by branch

**Files:**
- Modify: `server/actions/payroll.ts` (getAllDeductions, getScheduledPayments)
- Modify: `app/payroll/payrollPage.tsx` (pass branchId)

- [ ] **Step 1: Add branchId parameter to `getAllDeductions`**

Update the server action to accept an optional `branchId` parameter and filter results accordingly. This may require joining with `transactions` or `payroll_entries` to get the branch.

- [ ] **Step 2: Add branchId parameter to `getScheduledPayments`**

Same pattern — add optional branchId, filter accordingly.

- [ ] **Step 3: Pass branchId from payrollPage.tsx**

Update the calls to pass `currentBranch?.id ?? null`.

- [ ] **Step 4: Commit**

```bash
git add server/actions/payroll.ts app/payroll/payrollPage.tsx
git commit -m "fix(payroll): filter deductions and scheduled payments by branch"
```

---

## Chunk 5: Lint & Build Verification

### Task 5.1: Run lint and fix all errors

- [ ] **Step 1: Run ESLint**

```bash
bun run lint
```

- [ ] **Step 2: Fix all lint errors and warnings**

Address any unused imports, missing type annotations, or `@typescript-eslint/no-unused-vars` issues introduced by the changes.

### Task 5.2: Run build and fix all errors

- [ ] **Step 1: Run production build**

```bash
bun run build
```

- [ ] **Step 2: Fix any TypeScript compilation errors**

Common issues to expect:
- New fields on types not matching actual DB returns
- Missing import paths
- Type mismatches from changed function signatures
- Unused variables in server actions

### Task 5.3: Commit lint and build fixes

```bash
git add -A
git commit -m "chore: fix lint and build errors from comprehensive sales-accounting-payroll-metrics fix"
```

---

## Summary of All Changes

| Phase | Module | Key Fix | Files Affected |
|-------|--------|---------|---------------|
| 1 | Accounting/Metrics | `getScopedFinancialMetrics` net revenue | metrics.ts |
| 1 | Accounting/Metrics | `getRevenueTrend` net revenue | metrics.ts |
| 1 | Accounting/Metrics | `getRevenueBreakdown` net amounts per category | metrics.ts |
| 1 | Accounting/Metrics | `getRevenueExpenseTrend` net revenue/expenses | metrics.ts |
| 1 | Accounting/Metrics | `getExecutiveAccountingMetrics` net P&L | metrics.ts |
| 1 | Accounting/Metrics | `fetchGeneralLedgerAggregates` and exports net revenue | metrics.ts |
| 1 | Accounting | Breakdown display for natural credit accounts | accountingPage.tsx |
| 2 | Sales | Partial payment: credit `amount_paid` not `total` | transactions.ts |
| 2 | Sales | Allow voiding PARTIAL transactions | RecentTransactions.tsx, transactionsPage.tsx |
| 2 | Sales | AddPaymentModal balance display fix | AddPaymentModal.tsx |
| 2 | Sales | Appointment flow: no revenue until paid | sales.ts |
| 3 | Payroll | Branch selector onChange fix | payrollPage.tsx |
| 3 | Payroll | Disbursement double-counting audit | payroll-disbursements.ts, payroll.ts |
| 3 | Payroll | Manual entry rate lookup | payroll.ts |
| 3 | Payroll | BANK in Zod schema | payroll-schemas.ts |
| 4 | Sales | SplitPayment ID uniqueness | SplitPaymentBuilder.tsx |
| 4 | Sales | Reset splitPayments on method switch | SalesContext.tsx |
| 4 | Sales | Reference number validation for split | SplitPaymentBuilder.tsx, CheckoutModal.tsx |
| 4 | Payroll | Filter deductions by branch | payroll.ts, payrollPage.tsx |
| 5 | All | Lint & build fixes | Various |

## Estimated Scope

- **Total files to modify:** ~20
- **Estimated tasks:** 22
- **Estimated implementation time:** 3-4 hours with subagent-driven development