# Accounting, Sales & Payroll Comprehensive Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix accounting calculation errors, split payment accounting integration, total override in checkout, and payroll dependencies on accounting/sales — ensuring all financial data flows correctly across modules.

**Architecture:** Cross-module fix spanning server actions (accounting, transactions, payroll, metrics), UI components (CartPanel, CheckoutModal, SplitPaymentBuilder, accountingPage), and shared types (payment, ledger, payroll). Each phase targets a specific subsystem. The plan is sequenced so accounting fixes land first (since payroll depends on accounting), then sales fixes (since payroll depends on sales data), then payroll fixes, then cross-cutting improvements, and finally lint/build.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Tailwind CSS 4, Drizzle ORM, Supabase/PostgreSQL

**Task Dependency Graph:**
```
Phase 1 (Accounting) ──> Phase 4 (Payroll)
Phase 2 (Split Payments) ──> Phase 4 (Payroll)
Phase 3 (Total Override) ──> Phase 4 (Payroll)
Phase 1-4 ──> Phase 5 (Improvements)
Phase 1-5 ──> Phase 6 (Lint/Build)
```

Phases 1, 2, 3 can run in parallel. Phase 4 depends on 1-3. Phase 5 and 6 are sequential after all prior phases.

---

## Phase 1: Accounting — Sign Convention & Calculation Fixes

### Problem Analysis

The accounting sign convention (`balance = debit - credit`) is **correct per standard accounting**. The statement "Revenue should be - and debit is +" is accurate: revenue entries populate the CREDIT column (subtracted in balance formula), and debit entries are added. However, there are real calculation bugs:

1. **Void/refund transactions use wrong entry type** — `VOIDED_SALES` and `REFUNDS` are recorded as `EXPENSE`/debit entries instead of `REVENUE`/debit (reduction) entries. This inflates expense totals and skews P&L.
2. **P&L metrics miss contra-entries** — Revenue only sums the credit column; debit-side reductions on REVENUE entries (refunds, voids) are ignored.
3. **Balance display semantics** — Business users see `Balance (CR) -10,000` in green, which is technically correct but confusing. The accounting page breakdown also uses raw `debit - credit` for ALL types, which can show misleading net figures for REVENUE (should display `credit - debit` for natural credit accounts).

### Task 1.1: Fix void/refund entry types to use REVENUE/debit (reduction)

**Files:**
- Modify: `server/actions/transactions.ts:522-547` (void)
- Modify: `server/actions/transactions.ts:629-646` (refund)

**Current behavior (WRONG):**
```typescript
// Void - currently creates EXPENSE entry
await createAutoLedgerEntry('TRANSACTION', transaction.id, {
    entry_type: 'EXPENSE',       // ← WRONG: should be REVENUE
    category: 'VOIDED_SALES',
    debit: originalTotal,        // ← This is actually a revenue reduction
    credit: 0,
}, ...)
```

**Step 1: Change void entry to REVENUE type with debit (reduction)**

In `server/actions/transactions.ts`, update the void ledger entry (~line 530):

```typescript
await createAutoLedgerEntry(
    'TRANSACTION',
    transaction.id,
    {
        entry_date: new Date(),
        entry_type: 'REVENUE',
        category: 'VOIDED_SALES',
        description: `Voided: ${transaction.transactionNumber}`,
        reference: `VOID-${transaction.transactionNumber}`,
        debit: originalTotal,
        credit: 0,
        branch_id: transaction.branchId,
        payment_method: mapTransactionToAccountingPaymentMethod(transaction.paymentMethod),
    },
    user.id,
    tx
)
```

**Step 2: Change refund entry to REVENUE type with debit (reduction)**

In `server/actions/transactions.ts`, update the refund ledger entry (~line 639):

```typescript
await createAutoLedgerEntry(
    'TRANSACTION',
    refundTxn.id,
    {
        entry_date: new Date(),
        entry_type: 'REVENUE',
        category: 'REFUNDS',
        description: `Refund: ${originalTxn.transactionNumber}`,
        reference: `REFUND-${originalTxn.transactionNumber}`,
        debit: refundAmount,
        credit: 0,
        branch_id: originalTxn.branchId,
        payment_method: mapTransactionToAccountingPaymentMethod(originalTxn.paymentMethod),
    },
    user.id,
    tx
)
```

**Step 3: Verify with manual test**

- Create a sale → verify REVENUE/credit entry appears
- Void the sale → verify REVENUE/debit (reduction) entry appears (NOT EXPENSE)
- Check P&L: Net revenue should = total credits - total debits for REVENUE entries

### Task 1.2: Fix P&L metrics to account for revenue reductions (contra-entries)

**Files:**
- Modify: `server/actions/metrics.ts:644-655` (getNetIncomeMetrics)
- Modify: `server/actions/metrics.ts:992-1019` (getPLMetrics)
- Modify: `server/actions/metrics.ts:1049-1057` (previous period)

**Current behavior (WRONG):** Revenue only sums the credit column of REVENUE entries, ignoring debit-side reductions (voids, refunds).

**Step 1: Fix revenue calculation in getNetIncomeMetrics**

In `server/actions/metrics.ts`, update ~lines 647-655:

```typescript
entries.forEach((entry) => {
    const debit = Number(entry.debit) || 0
    const credit = Number(entry.credit) || 0
    if (entry.entryType === 'REVENUE') {
        revenue += credit - debit
    } else if (entry.entryType === 'EXPENSE') {
        expenses += debit - credit
    }
})

const netIncome = revenue - expenses
```

**Step 2: Fix revenue and expense calculations in getPLMetrics**

In `server/actions/metrics.ts`, update ~lines 1000-1019:

```typescript
entries.forEach((entry) => {
    const debit = Number(entry.debit) || 0
    const credit = Number(entry.credit) || 0
    totalDebits += debit
    totalCredits += credit

    if (entry.entryType === 'REVENUE') {
        revenue += credit - debit
    } else if (entry.entryType === 'EXPENSE') {
        expenses += debit - credit
    } else if (entry.entryType === 'ASSET') {
        assetTotal += debit - credit
    } else if (entry.entryType === 'LIABILITY') {
        liabilityTotal += credit - debit
    } else if (entry.entryType === 'EQUITY') {
        equityTotal += credit - debit
    }
})

const netProfit = revenue - expenses
```

**Step 3: Fix previous period calculation similarly**

In `server/actions/metrics.ts`, update ~lines 1052-1057:

```typescript
prevEntries.forEach((entry) => {
    const debit = Number(entry.debit) || 0
    const credit = Number(entry.credit) || 0
    if (entry.entryType === 'REVENUE') prevRevenue += credit - debit
    else if (entry.entryType === 'EXPENSE') prevExpenses += debit - credit
})
```

**Step 4: Verify calculation correctness**

- Revenue = Sum of (credit - debit) for all REVENUE entries
- Expenses = Sum of (debit - credit) for all EXPENSE entries
- Net Income = Revenue - Expenses
- A voided sale should REDUCE revenue (not inflate expenses)

### Task 1.3: Fix accounting page breakdown display for natural credit accounts

**Files:**
- Modify: `app/accounting/accountingPage.tsx:614-629`

**Current behavior:** The breakdown by account type uses `net = bt.debit - bt.credit` for ALL types, showing REVENUE as a negative number with a red indicator (because credits > debits for revenue). This is semantically wrong for natural credit accounts.

**Step 1: Add natural balance direction helper**

In `app/accounting/accountingPage.tsx`, add a helper function near the top of the component:

```typescript
const NATURAL_BALANCE: Record<string, 'debit' | 'credit'> = {
    EXPENSE: 'debit',
    REVENUE: 'credit',
    ASSET: 'debit',
    LIABILITY: 'credit',
    EQUITY: 'credit',
}
```

**Step 2: Update the breakdown display**

Replace the net calculation at ~line 615:

```typescript
const naturalSide = NATURAL_BALANCE[bt.type] || 'debit'
const net = naturalSide === 'credit'
    ? bt.credit - bt.debit
    : bt.debit - bt.credit
const isPositive = net >= 0
```

Update the color logic:

```typescript
<p className={`text-lg font-bold mt-2 ${isPositive ? 'text-green-300' : 'text-red-300'}`}>
    {currencySymbol}{Math.abs(net).toLocaleString(undefined, { minimumFractionDigits: 2 })}
</p>
```

### Task 1.4: Update EntryModal labels to clarify sign convention

**Files:**
- Modify: `components/accounting/EntryModal.tsx:97-112`

**Step 1: Add clearer labels that include sign indication**

```typescript
const getDebitCreditLabels = (entryType: LedgerEntryType) => {
    switch (entryType) {
        case "EXPENSE":    return { debitLabel: "Expense Amount (+)", creditLabel: "Reduction (−)" }
        case "REVENUE":    return { debitLabel: "Reduction / Refund (−)", creditLabel: "Income Amount (+)" }
        case "ASSET":       return { debitLabel: "Increase (+)", creditLabel: "Decrease (−)" }
        case "LIABILITY":   return { debitLabel: "Decrease (−)", creditLabel: "Increase (+)" }
        case "EQUITY":      return { debitLabel: "Decrease (−)", creditLabel: "Increase (+)" }
    }
}
```

### Task 1.5: Commit Phase 1

```bash
git add server/actions/transactions.ts server/actions/metrics.ts app/accounting/accountingPage.tsx components/accounting/EntryModal.tsx
git commit -m "fix(accounting): correct void/refund entry types and contra-entry calculations"
```

---

## Phase 2: Split Payments → Accounting Integration

### Problem Analysis

When a transaction uses `payment_method: 'SPLIT'`, the auto-ledger entry is created with `payment_method: null` because `mapTransactionToAccountingPaymentMethod('SPLIT')` returns `undefined`. Individual split payments are stored in `transaction_payments` but have NO corresponding ledger entries. This means:
- Payment method drilldown in accounting shows "Unspecified" for all split transactions
- Financial reports cannot filter by payment method for split transactions
- The accounting module is blind to how split payments are distributed

### Task 2.1: Create per-payment ledger entries for split transactions

**Files:**
- Modify: `server/actions/transactions.ts:219-244`

**Current behavior:** One REVENUE entry with `payment_method: null` for entire split transaction.

**New behavior:** One REVENUE entry per split payment method, each with the correct payment method and proportional amount.

**Step 1: Replace the single ledger entry with per-split entries**

In `server/actions/transactions.ts`, update the accounting entry section (~lines 219-244):

```typescript
// Create accounting entries for the sale
try {
    if (payload.payment_method === 'SPLIT' && payload.payments && payload.payments.length > 0) {
        // Create a separate ledger entry per split payment method
        for (const payment of payload.payments) {
            await createAutoLedgerEntry(
                'TRANSACTION',
                newTransaction.id,
                {
                    entry_date: new Date(),
                    entry_type: 'REVENUE',
                    category: 'SALES',
                    description: `Sale: ${transactionNumber} (${getTransactionPaymentMethodLabel(payment.payment_method)})`,
                    reference: `${transactionNumber}-${payment.payment_method}`,
                    debit: 0,
                    credit: payment.amount,
                    branch_id: payload.branch_id,
                    payment_method: mapTransactionToAccountingPaymentMethod(payment.payment_method),
                },
                user.id,
                tx
            )
        }
    } else {
        // Single payment method — one entry as before
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
                payment_method: mapTransactionToAccountingPaymentMethod(payload.payment_method),
            },
            user.id,
            tx
        )
    }
} catch (accountingError) {
    await logError({
        type: 'ACCOUNTING',
        message: `Failed to create accounting entry for transaction ${transactionNumber}: ${accountingError instanceof Error ? accountingError.message : String(accountingError)}`
    })
}
```

**Step 2: Add the helper import for payment method label**

At the top of `server/actions/transactions.ts`, ensure the import exists:

```typescript
import { mapTransactionToAccountingPaymentMethod, getTransactionPaymentMethodLabel } from '@/utils/types/payment'
```

Add the helper in `utils/types/payment.ts` if not already present:

```typescript
export function getTransactionPaymentMethodLabel(method: string): string {
    const found = TRANSACTION_PAYMENT_METHODS.find(m => m.key === method)
    return found?.label || method
}
```

**Step 3: Fix SplitPayment type to use correct method keys**

The `SplitPayment.payment_method` type should match the individual methods (not include SPLIT). Verify in `utils/types/transactions.ts`:

```typescript
export interface SplitPayment {
    id: string
    payment_method: 'CASH' | 'CARD' | 'GCASH' | 'BANK_TRANSFER'
    amount: number
    reference_number?: string
}
```

### Task 2.2: Fix split payment void/refund to create reversing entries per payment method

**Files:**
- Modify: `server/actions/transactions.ts:522-547` (void)
- Modify: `server/actions/transactions.ts:629-646` (refund)

**Step 1: For voids, check if original transaction was SPLIT and reverse per payment**

In the void handler, after Task 1.1 changes (which already changed entry_type to REVENUE), add split-aware reversal logic:

```typescript
// Get the original transaction's payments if it was a SPLIT payment
if (transaction.paymentMethod === 'SPLIT') {
    const originalPayments = await tx
        .select()
        .from(transactionPayments)
        .where(eq(transactionPayments.transactionId, transaction.id))

    if (originalPayments.length > 0) {
        for (const payment of originalPayments) {
            await createAutoLedgerEntry(
                'TRANSACTION',
                transaction.id,
                {
                    entry_date: new Date(),
                    entry_type: 'REVENUE',
                    category: 'VOIDED_SALES',
                    description: `Voided: ${transaction.transactionNumber} (${getTransactionPaymentMethodLabel(payment.paymentMethod)})`,
                    reference: `VOID-${transaction.transactionNumber}-${payment.paymentMethod}`,
                    debit: Number(payment.amount),
                    credit: 0,
                    branch_id: transaction.branchId,
                    payment_method: mapTransactionToAccountingPaymentMethod(payment.paymentMethod),
                },
                user.id,
                tx
            )
        }
    } else {
        // Fallback: single reversing entry
        await createAutoLedgerEntry('TRANSACTION', transaction.id, {
            entry_date: new Date(),
            entry_type: 'REVENUE',
            category: 'VOIDED_SALES',
            description: `Voided: ${transaction.transactionNumber}`,
            reference: `VOID-${transaction.transactionNumber}`,
            debit: originalTotal,
            credit: 0,
            branch_id: transaction.branchId,
            payment_method: mapTransactionToAccountingPaymentMethod(transaction.paymentMethod),
        }, user.id, tx)
    }
} else {
    // Non-split void — single reversing entry (from Task 1.1)
    await createAutoLedgerEntry('TRANSACTION', transaction.id, {
        entry_date: new Date(),
        entry_type: 'REVENUE',
        category: 'VOIDED_SALES',
        description: `Voided: ${transaction.transactionNumber}`,
        reference: `VOID-${transaction.transactionNumber}`,
        debit: originalTotal,
        credit: 0,
        branch_id: transaction.branchId,
        payment_method: mapTransactionToAccountingPaymentMethod(transaction.paymentMethod),
    }, user.id, tx)
}
```

Apply the same pattern for refunds (~line 629).

### Task 2.3: Fix addTransactionPayment to create accounting entry for additional payments

**Files:**
- Modify: `server/actions/transactions.ts:674-744`

**Current behavior:** Adding a payment to a partial transaction updates the transaction and creates a payment record, but does NOT create any accounting entry. The additional revenue is never reflected in the ledger.

**Step 1: Add ledger entry creation after payment is added**

In `addTransactionPayment`, after the transaction update (~line 716), add:

```typescript
// Create accounting entry for the additional payment
try {
    await createAutoLedgerEntry(
        'TRANSACTION',
        payload.transaction_id,
        {
            entry_date: new Date(),
            entry_type: 'REVENUE',
            category: 'SALES',
            description: `Additional payment: ${transaction.transactionNumber} (${getTransactionPaymentMethodLabel(payload.payment_method)})`,
            reference: `${transaction.transactionNumber}-ADDL`,
            debit: 0,
            credit: payload.amount,
            branch_id: transaction.branchId,
            payment_method: mapTransactionToAccountingPaymentMethod(payload.payment_method),
        },
        user.id,
        tx
    )
} catch (accountingError) {
    await logError({
        type: 'ACCOUNTING',
        message: `Failed to create accounting entry for additional payment on ${transaction.transactionNumber}: ${accountingError instanceof Error ? accountingError.message : String(accountingError)}`
    })
}
```

### Task 2.4: Update `mapTransactionToAccountingPaymentMethod` to handle SPLIT's sub-methods

**Files:**
- Modify: `utils/types/payment.ts:72-82`

The function already handles individual methods correctly (CASH→CASH, CARD→CARD, etc.). The SPLIT case returns `undefined` which is now handled by creating per-payment entries. But add a comment for clarity:

```typescript
export function mapTransactionToAccountingPaymentMethod(method: string | null | undefined): AccountingPaymentMethod | undefined {
    if (!method) return undefined
    switch (method) {
        case 'CASH': return 'CASH'
        case 'CARD': return 'CARD'
        case 'GCASH': return 'GCASH'
        case 'BANK_TRANSFER': return 'BANK_TRANSFER'
        case 'SPLIT': return undefined // SPLIT is resolved into per-payment ledger entries at the action level
        default: return undefined
    }
}
```

### Task 2.5: Commit Phase 2

```bash
git add server/actions/transactions.ts utils/types/payment.ts utils/types/transactions.ts
git commit -m "fix(sales): create per-payment ledger entries for split transactions and additional payments"
```

---

## Phase 3: Total Override Fix in Sales/Checkout

### Problem Analysis

The user reports: "When changing the Total manually before checking out, it is not recorded and stays the same, ex if Total is 0, changing to 100 then clicking on Checkout still shows its 0."

**Root causes identified:**
1. **React controlled input race condition**: The total input uses `value` (controlled) but `type='number'` can cause value synchronization issues when the parsed number matches the stale `calculatedTotal`.
2. **`amountToPay` stale closure**: The `amountToPay` useEffect depends on `isCheckoutModalOpen` and `total`, but the checkout modal may render with stale state if `totalOverride` hasn't been committed yet.
3. **Inconsistent payload**: When `totalOverride` differs from `calculatedTotal`, the payload sends `subtotal: netSubtotal` and `tax_amount: taxAmount` (based on calculated values), but `total: totalOverride`. This creates a mathematically inconsistent record in the DB where `subtotal + tax - discount !== total`.
4. **Line total uses `defaultValue`**: The per-item line total input in CartPanel uses `defaultValue` instead of `value`, so it doesn't reflect programmatic updates.

### Task 3.1: Fix total override state flow and checkout amount propagation

**Files:**
- Modify: `components/sales/context/SalesContext.tsx`
- Modify: `components/sales/layout/CartPanel.tsx`

**Step 1: Fix the total input to use proper state management**

In `components/sales/layout/CartPanel.tsx`, update the total input (~lines 275-291):

```tsx
<input
    type='number'
    value={totalOverride !== null ? totalOverride : calculatedTotal}
    onChange={(e) => {
        const raw = e.target.value
        if (raw === '' || raw === '-') return
        const val = parseFloat(raw)
        if (!isNaN(val) && val >= 0) {
            setTotalOverride(val !== calculatedTotal ? val : null)
        }
    }}
    onBlur={() => {
        if (totalOverride !== null && totalOverride === calculatedTotal) {
            setTotalOverride(null)
        }
    }}
    className='w-28 bg-white/5 border border-white/10 rounded px-2 py-1 text-xl font-bold text-right'
    min='0'
    step='0.01'
/>
```

**Step 2: Add `adjustment_amount` to the payload for consistency tracking**

In `components/sales/context/SalesContext.tsx`, update the `handleCheckout` function (~line 829):

Add an `adjustment_amount` field to track the difference between the overridden total and the calculated total:

```typescript
const adjustmentAmount = totalOverride !== null ? totalOverride - calculatedTotal : 0

const payload: CreateTransactionPayload = {
    // ... existing fields
    subtotal: netSubtotal,
    tax_amount: taxAmount,
    discount_amount: discountAmount,
    total,
    adjustment_amount: adjustmentAmount,
    // ... rest of payload
}
```

**Step 3: Add `adjustment_amount` to the CreateTransactionPayload type**

In `utils/types/transactions.ts`, add to the `CreateTransactionPayload` interface:

```typescript
adjustment_amount?: number
```

**Step 4: Store adjustment amount in the transaction record**

In `server/actions/transactions.ts`, update the transaction creation (~line 112):

```typescript
adjustmentAmount: (payload.adjustment_amount ?? 0).toString(),
```

**Step 5: Add `adjustmentAmount` column to the transactions DB schema**

In `server/db/schema/transactions.ts`, add the column:

```typescript
adjustmentAmount: decimal('adjustment_amount', { precision: 12, scale: 2 }).default('0'),
```

And add to the TypeScript type exported from the schema.

### Task 3.2: Fix line total input to use controlled value

**Files:**
- Modify: `components/sales/layout/CartPanel.tsx:155-163`

**Step 1: Change `defaultValue` to `value` with proper update handler**

Replace the line total input:

```tsx
<input
    type='number'
    value={item.unit_price * item.quantity}
    onChange={(e) => {
        const val = parseFloat(e.target.value)
        if (!isNaN(val) && val >= 0) {
            updateLineTotal(item.id, val)
        }
    }}
    className='w-20 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-right'
    min='0'
    step='0.01'
/>
```

Remove the `key` prop that was used for `defaultValue` reset, and remove the `onBlur` handler since we now use `onChange`.

### Task 3.3: Ensure checkout modal correctly reflects overridden total

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:762-783`

**Step 1: Fix the amountToPay useEffect to handle total override**

The existing useEffect should already work, but add a safety check:

```typescript
useEffect(() => {
    if (isCheckoutModalOpen) {
        const effectiveTotal = totalOverride !== null ? totalOverride : calculatedTotal
        setAmountToPay(effectiveTotal.toFixed(2))
    }
}, [isCheckoutModalOpen, totalOverride, calculatedTotal])
```

Similarly for the second useEffect:

```typescript
useEffect(() => {
    if (!isPartialPayment) {
        const effectiveTotal = totalOverride !== null ? totalOverride : calculatedTotal
        setAmountToPay(effectiveTotal.toFixed(2))
    }
}, [isPartialPayment, totalOverride, calculatedTotal])
```

This removes the dependency on the computed `total` (which may be stale in the closure) and directly uses the source values.

### Task 3.4: Add total override indicator in CheckoutModal summary

**Files:**
- Modify: `components/sales/modals/CheckoutModal.tsx:268-285`

**Step 1: Show adjustment amount when total is overridden**

Update the total display section:

```tsx
{totalOverride !== null && (
    <div className='flex justify-between text-sm text-amber-500'>
        <span>Price Adjustment:</span>
        <span>
            {totalOverride > calculatedTotal ? '+' : ''}{taxSettings.currency_symbol} {(totalOverride - calculatedTotal).toFixed(2)}
        </span>
    </div>
)}
<div className='border-t border-zinc-300 dark:border-zinc-600 pt-2 mt-2'>
    {totalOverride !== null && (
        <div className='flex justify-between text-sm text-zinc-400'>
            <span>Calculated Total:</span>
            <span className='line-through'>
                {taxSettings.currency_symbol} {calculatedTotal.toFixed(2)}
            </span>
        </div>
    )}
    <div className='flex justify-between font-bold text-lg'>
        <span className='text-zinc-900 dark:text-zinc-100'>
            {totalOverride !== null ? 'Adjusted Total:' : 'Total'}
        </span>
        <span className='text-blue-600 dark:text-blue-400'>
            {taxSettings.currency_symbol} {total.toFixed(2)}
        </span>
    </div>
</div>
```

### Task 3.5: Commit Phase 3

```bash
git add components/sales/context/SalesContext.tsx components/sales/layout/CartPanel.tsx components/sales/modals/CheckoutModal.tsx utils/types/transactions.ts server/actions/transactions.ts server/db/schema/transactions.ts
git commit -m "fix(sales): fix total override not persisting to checkout and add adjustment tracking"
```

---

## Phase 4: Payroll Fixes — Accounting & Sales Dependencies

### Problem Analysis

Payroll is broken due to cascading issues from accounting and sales, plus its own bugs:

1. **`client_type` not properly flowing** — `calculateAndCreatePayrollEntry` defaults to `'WALKIN'` when `clientType` is not provided, but the transaction may not have `client_type` stored properly.
2. **Tax withholding calculated but not applied to payouts** — `netAmount = artistCut - taxAmount` is stored but `totalArtistCut` on payroll requests uses the gross `artistCut`, not `netAmount`. Artists may be overpaid.
3. **Accounting double-counting** — `completePayrollRequest` creates a single EXPENSE entry for the full `totalArtistCut`. `createDisbursement` also creates per-disbursement EXPENSE entries for partial payments. If both paths are used, the total debited exceeds the actual payout.
4. **Manual entries bypass rate lookup** — `createManualPayrollEntry` sets `shopCut: 0`, `artistCut: amount` with no rate enforcement.
5. **`BANK` vs `BANK_TRANSFER` inconsistency** — Old DB rows have `'BANK'`, new code uses `'BANK_TRANSFER'`. Zod schema doesn't include `'BANK'`.
6. **`netAmount`/`taxRate`/`taxBracket` missing from TypeScript type** — DB stores these but the `PayrollEntry` type doesn't expose them to the frontend.
7. **Artist level validation mismatch** — Profile update validates `APPRENTICE/JUNIOR/SENIOR/MASTER` instead of `NORMAL/HEAD_ARTIST/OWNER`.
8. **Payout period validation mismatch** — Profile validates `BIWEEKLY` instead of `BIMONTHLY`.
9. **`serviceType` defaults to `'TATTOO'`** — Existing services created before the column was added default to TATTOO, causing incorrect rate lookups for piercing/shoe services.

### Task 4.1: Fix client_type flow from transaction to payroll

**Files:**
- Modify: `server/actions/transactions.ts:198-207`
- Modify: `server/actions/sales.ts:194-202`
- Modify: `server/db/schema/transactions.ts`

**Step 1: Ensure client_type is stored on transactions**

Check if `clientType` column exists in the transactions schema. If not, add it:

```typescript
clientType: varchar('client_type', { length: 20 }),
```

**Step 2: Pass client_type from transaction to payroll entry creation**

In `server/actions/transactions.ts` (~line 198), the `clientType` is already passed:
```typescript
clientType: payload.client_type as ClientType | undefined,
```

But `payload.client_type` might be undefined for non-checkout flows. Add fallback to `clientType` field on the transaction:

```typescript
clientType: (payload.client_type || clientType) as ClientType | undefined,
```

Where `clientType` is derived from the `clientType` state in SalesContext (already passed as part of the payload at ~line 873).

**Step 3: In sales.ts, ensure clientType is passed**

In `server/actions/sales.ts` (~line 194), verify `clientType` is included in the payroll input:

```typescript
await calculateAndCreatePayrollEntry({
    transactionId: newTransaction.id,
    serviceId: item.service_id,
    artistId: payload.staff_id!,
    amount: item.quantity * item.unit_price,
    quantity: item.quantity,
    clientType: payload.client_type as ClientType | undefined,
    serviceType: item.service_type,
    paymentMethod: primaryPaymentMethod,
}, tx)
```

### Task 4.2: Fix tax withholding integration with payroll payouts

**Files:**
- Modify: `server/actions/payroll.ts:918-1051` (createPayrollRequest)
- Modify: `server/actions/payroll.ts:1120-1330` (completePayrollRequest)
- Modify: `server/db/schema/payroll.ts`

**Current behavior:** `totalArtistCut` on the payroll request sums gross `artistCut` values without subtracting tax. The `netAmount` field exists on individual entries but is not aggregated.

**Step 1: Add `totalNetAmount` and `totalTaxAmount` to payroll request schema**

In `server/db/schema/payroll.ts`, add columns:

```typescript
totalNetAmount: decimal('total_net_amount', { precision: 12, scale: 2 }).default('0'),
totalTaxAmount: decimal('total_tax_amount', { precision: 12, scale: 2 }).default('0'),
```

**Step 2: Calculate net and tax totals in createPayrollRequest**

In `server/actions/payroll.ts`, update `createPayrollRequest` (~line 918). When summing entries, also compute tax totals:

```typescript
let totalGrossAmount = 0
let totalShopCut = 0
let totalArtistCut = 0
let totalNetAmount = 0
let totalTaxAmount = 0

for (const entry of entries) {
    totalGrossAmount += Number(entry.grossAmount)
    totalShopCut += Number(entry.shopCut)
    totalArtistCut += Number(entry.artistCut)
    totalNetAmount += Number(entry.netAmount || entry.artistCut)
    totalTaxAmount += Number(entry.taxAmount || 0)
}
```

Store these in the request:

```typescript
totalNetAmount: String(totalNetAmount),
totalTaxAmount: String(totalTaxAmount),
```

**Step 3: Use netAmount for payout calculations**

In `completePayrollRequest`, when creating the accounting entry (~line 1282), use `totalNetAmount` for the EXPENSE entry (the actual cash outflow):

```typescript
await createAutoLedgerEntry(
    'PAYROLL',
    firstPayrollEntry?.id || request.id,
    {
        entry_date: new Date(),
        entry_type: 'EXPENSE',
        category: 'PAYROLL',
        description: `Payroll payment (net) - Staff: ${staffName}`,
        reference: `PAYROLL-${requestId.slice(0, 8)}`,
        debit: Number(request.totalNetAmount),  // ← Changed from totalArtistCut
        credit: 0,
        branch_id: firstPayrollEntry?.branchId || null,
        payment_method: mapPayrollToAccountingPaymentMethod(payload.payment_method),
    },
    currentUser.id
)
```

And create a separate LIABILITY entry for the tax withholding:

```typescript
// Create liability entry for tax withholding
if (Number(request.totalTaxAmount) > 0) {
    await createAutoLedgerEntry(
        'PAYROLL',
        firstPayrollEntry?.id || request.id,
        {
            entry_date: new Date(),
            entry_type: 'LIABILITY',
            category: 'TAX_WITHHOLDING',
            description: `Tax withholding - Staff: ${staffName}`,
            reference: `TAX-${requestId.slice(0, 8)}`,
            debit: 0,
            credit: Number(request.totalTaxAmount),
            branch_id: firstPayrollEntry?.branchId || null,
        },
        currentUser.id
    )
}
```

**Step 4: Update the PayrollRequest TypeScript type**

In `utils/types/payroll.ts`, add the new fields:

```typescript
export interface PayrollRequest {
    // ... existing fields
    total_net_amount: number
    total_tax_amount: number
}
```

### Task 4.3: Fix accounting double-counting in disbursements

**Files:**
- Modify: `server/actions/payroll-disbursements.ts:130-173`

**Current behavior:** When `completePayrollRequest` is called, it creates a single full EXPENSE entry. When `createDisbursement` is used for staggered payments, it creates additional partial EXPENSE entries. Both paths can be used, leading to double-counting.

**Fix:** The `completePayrollRequest` should NOT create an accounting entry if the request will be disbursed via staggered payments. Instead, each disbursement creates its own accounting entry.

**Step 1: Remove accounting entry from completePayrollRequest when staggered**

Add a parameter to `completePayrollRequest` to indicate whether to create the accounting entry:

```typescript
export interface CompletePayrollRequestPayload {
    request_id: string
    payment_method: PayrollPaymentMethod
    reference_number?: string
    notes?: string
    proof_file?: File
    skip_accounting_entry?: boolean  // ← NEW: Set true when using staggered disbursements
}
```

In the accounting entry section (~line 1281), add a guard:

```typescript
if (!payload.skip_accounting_entry) {
    try {
        await createAutoLedgerEntry(...)
    } catch (accountingError) { ... }
}
```

**Step 2: Ensure disbursements always create accounting entries**

In `server/actions/payroll-disbursements.ts`, the current logic skips the accounting entry when `newDisbursed >= totalArtistCut` (line 130-133). This is wrong because the final disbursement still needs an accounting entry.

Fix the logic:

```typescript
// Always create an accounting entry for this disbursement
try {
    const { createAutoLedgerEntry } = await import('./accounting')
    const { mapPayrollToAccountingPaymentMethod } = await import('@/utils/types/payment')

    const [staffUser] = await db
        .select({ fullName: user.fullName })
        .from(user)
        .where(eq(user.id, request.staffId))
        .limit(1)
    const staffName = staffUser?.fullName || 'Unknown Staff'

    const [firstPayrollEntry] = await db
        .select({
            id: payrollEntry.id,
            branchId: transactions.branchId,
        })
        .from(payrollEntry)
        .innerJoin(transactions, eq(payrollEntry.transactionId, transactions.id))
        .where(eq(payrollEntry.payrollRequestId, payload.request_id))
        .limit(1)

    await createAutoLedgerEntry('PAYROLL', firstPayrollEntry?.id || disbursement.id, {
        entry_date: new Date(),
        entry_type: 'EXPENSE',
        category: 'PAYROLL',
        description: `Payroll disbursement - Staff: ${staffName} - ${payload.payment_method}`,
        reference: `PAYROLL-DISB-${disbursement.id.slice(0, 8)}`,
        debit: payload.amount,
        credit: 0,
        branch_id: firstPayrollEntry?.branchId || null,
        payment_method: mapPayrollToAccountingPaymentMethod(payload.payment_method),
    }, currentUser.id)
} catch (accountingError) {
    await logError({
        type: 'ACCOUNTING',
        message: `Failed to create accounting entry for disbursement ${disbursement.id}: ${accountingError instanceof Error ? accountingError.message : String(accountingError)}`
    })
}
```

Remove the `if (newDisbursed >= totalArtistCut) { ... } else { ... }` conditional that currently only creates entries for partial disbursements.

### Task 4.4: Fix manual payroll entry to enforce rate lookup

**Files:**
- Modify: `server/actions/payroll.ts:712-795`

**Current behavior:** `createManualPayrollEntry` sets `shopCut: '0'` and `artistCut: String(amount)`, bypassing all rate logic.

**Step 1: Add rate lookup for manual entries**

```typescript
export async function createManualPayrollEntry(
    payload: CreateManualPayrollEntryPayload
): Promise<ActionResponse<{ entryId: string }>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) return failure('Unauthorized')

    const admin = await isAdmin(currentUser)
    if (!admin) return failure('Admin access required')

    try {
        const serviceType = (payload.service_type || 'MANUAL') as ServiceType

        // Get artist level for rate lookup
        const [artistRecord] = await db
            .select({ artistLevel: user.artistLevel })
            .from(user)
            .where(eq(user.id, payload.staff_id))
            .limit(1)

        const artistLevel: ArtistLevel = (artistRecord?.artistLevel || 'NORMAL') as ArtistLevel

        // Try to get applicable rate, fall back to 100% artist / 0% shop for MANUAL type
        let shopCut: number
        let artistCut: number

        if (serviceType === 'MANUAL') {
            // Manual entries have no rate — full amount goes to artist
            shopCut = 0
            artistCut = payload.amount
        } else {
            const rateResult = await getApplicableRate(serviceType, 'WALKIN', artistLevel)
            if (rateResult.success && rateResult.data) {
                const rate = rateResult.data
                if (rate.payment_mode === 'FIXED') {
                    artistCut = Math.min(rate.fixed_amount, payload.amount)
                    shopCut = payload.amount - artistCut
                } else {
                    shopCut = (payload.amount * rate.shop_percentage) / 100
                    artistCut = (payload.amount * rate.artist_percentage) / 100
                }
            } else {
                // No rate found — full amount to artist
                shopCut = 0
                artistCut = payload.amount
            }
        }

        const taxInfo = calculateTax(artistCut)

        const [entry] = await db
            .insert(payrollEntry)
            .values({
                staffId: payload.staff_id,
                serviceDate: payload.service_date,
                clientType: 'WALKIN',
                serviceType: serviceType === 'MANUAL' ? 'TATTOO' : serviceType,
                grossAmount: String(payload.amount),
                shopCut: String(shopCut),
                artistCut: String(artistCut),
                paymentStatus: 'PENDING',
                taxRate: taxInfo.rate,
                taxAmount: String(taxInfo.amount),
                netAmount: String(artistCut - taxInfo.amount),
                taxBracket: taxInfo.bracket,
                description: payload.description || null,
                notes: payload.notes || null,
            })
            .returning()

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Manual payroll entry created: ${entry.id} for staff ${payload.staff_id}`,
            }],
        })

        return success({ entryId: entry.id })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error creating manual payroll entry: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to create manual payroll entry')
    }
}
```

### Task 4.5: Add missing PayrollEntry type fields and fix BANK inconsistency

**Files:**
- Modify: `utils/types/payroll.ts:65-94`
- Modify: `server/actions/payroll-schemas.ts:13`

**Step 1: Add missing fields to PayrollEntry type**

```typescript
export interface PayrollEntry {
    // ... existing fields
    tax_rate: number
    tax_amount: number
    net_amount: number
    tax_bracket: string
    payment_method?: string
}
```

**Step 2: Fix Zod schema to include BANK**

In `server/actions/payroll-schemas.ts`, update line 13:

```typescript
paymentMethod: z.enum(['CASH', 'GCASH', 'MAYA', 'BANK', 'BANK_TRANSFER', 'CARD', 'CRYPTO']),
```

### Task 4.6: Fix artist_level and payout_period validation mismatches

**Files:**
- Modify: `server/actions/profile.ts` (or wherever the validation is)

Find the profile update action that validates `artist_level` and `payout_period`. The current validation uses:
- `APPRENTICE | JUNIOR | SENIOR | MASTER` → should be `NORMAL | HEAD_ARTIST | OWNER`
- `BIWEEKLY` → should be `BIMONTHLY`

**Step 1: Search for the validation code**

Run: `grep -rn "APPRENTICE" server/actions/` to find the file.

**Step 2: Fix the enum values**

Replace the artist_level validation:

```typescript
artist_level: z.enum(['NORMAL', 'HEAD_ARTIST', 'OWNER']).optional(),
```

Replace the payout_period validation:

```typescript
payout_period: z.enum(['DAILY', 'WEEKLY', 'BIMONTHLY', 'MONTHLY']).optional(),
```

### Task 4.7: Fix serviceType default for existing services

**Files:**
- Modify: `server/db/schema/services.ts:32`

**Step 1: Make serviceType required (no default)**

```typescript
serviceType: varchar('service_type', { length: 20 }).notNull(),
```

Remove the `.default('TATTOO')` so that new services must explicitly set the type.

**Step 2: Write a data migration for existing services**

This is a DB migration. Add to any existing migration script, or create a one-time script:

```sql
-- Migrate existing services based on their name/category
UPDATE services
SET service_type = 'PIERCING'
WHERE service_type = 'TATTOO'
  AND (LOWER(name) LIKE '%pierc%' OR LOWER(name) LIKE '%ear%');

UPDATE services
SET service_type = 'SHOE'
WHERE service_type = 'TATTOO'
  AND (LOWER(name) LIKE '%shoe%' OR LOWER(name) LIKE '%sneaker%' OR LOWER(name) LIKE '%foot%');

-- Remaining services stay as TATTOO (the existing default)
```

### Task 4.8: Commit Phase 4

```bash
git add server/actions/transactions.ts server/actions/sales.ts server/actions/payroll.ts server/actions/payroll-disbursements.ts server/actions/payroll-schemas.ts utils/types/payroll.ts utils/types/transactions.ts server/db/schema/transactions.ts server/db/schema/payroll.ts server/db/schema/services.ts
git commit -m "fix(payroll): fix client_type flow, tax withholding integration, disbursement double-counting, rate enforcement, and type consistency"
```

---

## Phase 5: Additional Improvements & Suggestions

### 5A: Add database-level constraint for debit/credit mutual exclusivity

**Files:**
- Modify: `server/db/schema/accounting.ts`

**Problem:** The rule "only one of debit/credit should be non-zero" is enforced only at the application layer. Direct DB inserts could violate it.

**Step 1: Add a CHECK constraint**

In `server/db/schema/accounting.ts`, add to the `generalLedger` table definition:

```typescript
// Add at the end of the table definition:
// CHECK constraint: at least one of debit/credit must be non-zero, and both must be non-negative
```

Since Drizzle doesn't natively support CHECK constraints, use raw SQL in a migration:

```sql
ALTER TABLE general_ledger
ADD CONSTRAINT check_debit_credit_valid
CHECK (
    CAST(debit AS NUMERIC) >= 0
    AND CAST(credit AS NUMERIC) >= 0
    AND (CAST(debit AS NUMERIC) > 0 OR CAST(credit AS NUMERIC) > 0)
);
```

### 5B: Fix payroll deduction accounting to create liability entries per deduction type

**Files:**
- Modify: `server/actions/payroll.ts:1253-1271`

**Current behavior:** Each deduction creates a LIABILITY/credit entry individually. This is correct but the `category` is always `'PAYROLL_DEDUCTIONS'`, making it hard to distinguish between advances, general deductions, and adjustments.

**Step 1: Use deduction type as the category**

```typescript
for (const deduction of pendingDeductions) {
    const deductionCategory = deduction.type === 'ADVANCE'
        ? 'SALARY_ADVANCES'
        : deduction.type === 'ADJUSTMENT'
        ? 'PAYROLL_ADJUSTMENTS'
        : 'PAYROLL_DEDUCTIONS'

    try {
        await createAutoLedgerEntry('PAYROLL', firstPayrollEntry?.id || request.id, {
            entry_date: new Date(),
            entry_type: 'LIABILITY',
            category: deductionCategory,
            description: `${deduction.type || 'Deduction'} - ${deduction.reason || 'No reason'} - Staff: ${staffName}`,
            reference: `PAYROLL-DEDUCT-${requestId.slice(0, 8)}`,
            debit: 0,
            credit: Number(deduction.amount),
            branch_id: firstPayrollEntry?.branchId || null,
        }, currentUser.id)
    } catch (ledgerError) {
        await logError({
            type: 'ACCOUNTING',
            message: `Failed to create accounting entry for deduction ${deduction.id}: ${ledgerError instanceof Error ? ledgerError.message : String(ledgerError)}`
        })
    }
}
```

### 5C: Add `deduction_type` column to payrollDeductions schema

**Files:**
- Modify: `server/db/schema/payroll.ts`
- Modify: `utils/types/payroll.ts`

**Step 1: Add the column**

```typescript
type: varchar('type', { length: 20 }).default('DEDUCTION'), // ADVANCE | DEDUCTION | ADJUSTMENT
```

**Step 2: Expose in TypeScript type**

```typescript
export interface PayrollDeduction {
    // ... existing fields
    type: 'ADVANCE' | 'DEDUCTION' | 'ADJUSTMENT'
}
```

### 5D: Normalize existing BANK values to BANK_TRANSFER in payroll

**Step 1: Write a data migration**

```sql
UPDATE payroll_request
SET payment_method = 'BANK_TRANSFER'
WHERE payment_method = 'BANK';

UPDATE payroll_disbursement
SET payment_method = 'BANK_TRANSFER'
WHERE payment_method = 'BANK';

UPDATE payroll_entry
SET payment_method = 'BANK_TRANSFER'
WHERE payment_method = 'BANK';
```

After migration, remove `'BANK'` from `PayrollPaymentMethod` type.

### 5E: Add payroll entry for voided/refunded transactions

**Files:**
- Modify: `server/actions/transactions.ts`

**Current behavior:** Voiding/refunding a transaction creates a reversing ledger entry but does NOT reverse the payroll entry. The artist keeps their commission for a voided sale.

**Step 1: Add payroll entry reversal on void**

In the void handler, after creating the reversing ledger entry, add:

```typescript
// Reverse payroll entries for this transaction
if (transaction.staffId) {
    try {
        const { cancelPayrollEntriesForTransaction } = await import('./payroll')
        await cancelPayrollEntriesForTransaction(transaction.id, user.id, tx)
    } catch (payrollError) {
        await logError({
            type: 'PAYROLL',
            message: `Failed to reverse payroll for voided transaction ${transaction.transactionNumber}: ${payrollError instanceof Error ? payrollError.message : String(payrollError)}`
        })
    }
}
```

**Step 2: Create the `cancelPayrollEntriesForTransaction` function**

In `server/actions/payroll.ts`, add:

```typescript
export async function cancelPayrollEntriesForTransaction(
    transactionId: string,
    userId: string,
    tx?: TransactionClient
): Promise<ActionResponse<void>> {
    const dbClient = tx || db

    // Find all PENDING payroll entries for this transaction
    const entries = await dbClient
        .select({ id: payrollEntry.id, payrollRequestId: payrollEntry.payrollRequestId })
        .from(payrollEntry)
        .where(
            and(
                eq(payrollEntry.transactionId, transactionId),
                eq(payrollEntry.paymentStatus, 'PENDING')
            )
        )

    if (entries.length === 0) {
        return success(undefined)
    }

    // Mark entries as cancelled
    for (const entry of entries) {
        await dbClient
            .update(payrollEntry)
            .set({
                paymentStatus: 'CANCELLED',
                notes: `Reversed due to transaction void/refund by ${userId}`,
            })
            .where(eq(payrollEntry.id, entry.id))
    }

    // Recalculate request totals if any entries belong to a request
    const requestIds = [...new Set(entries.map(e => e.payrollRequestId).filter(Boolean))]
    for (const requestId of requestIds) {
        if (requestId) {
            await recalculatePayrollRequestTotals(requestId, dbClient)
        }
    }

    return success(undefined)
}
```

**Step 3: Add `CANCELLED` to `PaymentStatus` type**

In `utils/types/payroll.ts`:

```typescript
export type PaymentStatus = 'PENDING' | 'REQUESTED' | 'CONFIRMED' | 'PAID' | 'CANCELLED'
```

### 5F: Add SplitPaymentBuilder reference number validation

**Files:**
- Modify: `components/sales/checkout/SplitPaymentBuilder.tsx`

**Problem:** For non-CASH split payments, reference numbers are optional but should be required for audit trails.

**Step 1: Add visual validation indicator**

In the reference number input (~line 114-123), add a required indicator:

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

**Step 2: Add validation in CheckoutModal**

In `components/sales/modals/CheckoutModal.tsx`, update `isValid`:

```typescript
const hasRequiredReferences = paymentMethod !== 'SPLIT' || splitPayments.every(
    p => p.payment_method === 'CASH' || (p.reference_number?.trim() ?? '') !== ''
)

const isValid =
    cart.length > 0 &&
    (customerMode === 'WALKIN' ? walkinName.trim() !== '' : true) &&
    selectedStaffId !== '' &&
    isSufficientPayment &&
    hasRequiredReferences &&
    (paymentMethod !== 'CASH' && paymentMethod !== 'SPLIT' ? referenceNumber.trim() !== '' : true)
```

### 5G: Improve accounting page summary card labels for business users

**Files:**
- Modify: `app/accounting/accountingPage.tsx:584-604`

**Current labels:** "Total Credits", "Total Debits", "Balance (DR)/(CR)" — these are accounting jargon.

**Suggested improvement:** Add business-friendly labels:

```tsx
<StatCard
    label='Total Income (Credits)'
    value={`${currencySymbol}${summary.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
    color='success'
/>
<StatCard
    label='Total Expenses (Debits)'
    value={`${currencySymbol}${summary.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
    color='danger'
/>
<StatCard
    label={summary.balance >= 0 ? 'Net (Expenses > Income)' : 'Net (Income > Expenses)'}
    value={`${summary.balance >= 0 ? '+' : '-'}${currencySymbol}${Math.abs(summary.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
    color={summary.balance >= 0 ? 'danger' : 'success'}
/>
```

### 5H: Commit Phase 5

```bash
git add server/db/schema/accounting.ts server/actions/payroll.ts server/actions/transactions.ts utils/types/payroll.ts components/sales/checkout/SplitPaymentBuilder.tsx components/sales/modals/CheckoutModal.tsx app/accounting/accountingPage.tsx
git commit -m "improve: add DB constraints, deduction categories, payroll reversal on void, split reference validation, and user-friendly accounting labels"
```

---

## Phase 6: Lint & Build Fix

### Task 6.1: Run lint and fix all errors

**Step 1: Run ESLint**

```bash
bun run lint
```

**Step 2: Fix all lint errors and warnings**

Common issues to expect after the changes:
- Unused imports (removed code that imported types)
- Missing type annotations on new function parameters
- `@typescript-eslint/no-unused-vars` for new variables
- Any `any` types introduced

Fix each error systematically. For unused variables from destructured props that are still needed by the interface, use the existing `// eslint-disable-next-line @typescript-eslint/no-unused-vars` pattern already used in the codebase.

### Task 6.2: Run build and fix all errors

**Step 1: Run production build**

```bash
bun run build
```

**Step 2: Fix any TypeScript compilation errors**

Common issues to expect:
- New fields on types not matching actual DB returns
- Missing import paths
- Type mismatches from changed function signatures
- Unused variables in server actions

### Task 6.3: Verify no regressions in key flows

**Step 1: Start dev server**

```bash
bun run dev
```

**Step 2: Manually verify key flows**

1. **Accounting**: Create a manual REVENUE entry → verify credit column is populated → check P&L shows correct revenue
2. **Sales**: Create a sale with SPLIT payment → verify individual ledger entries appear with correct payment methods
3. **Sales**: Change total override → open checkout → verify overridden total is shown → complete transaction → verify DB has correct total and adjustment_amount
4. **Payroll**: Complete a payroll request → verify net/tax accounting entries are created
5. **Void/Refund**: Void a sale → verify REVENUE/debit (reduction) entry is created, NOT EXPENSE → verify payroll entries are cancelled

### Task 6.4: Commit Phase 6

```bash
git add -A
git commit -m "chore: fix lint and build errors from accounting-sales-payroll comprehensive fix"
```

---

## Summary of All Changes

| Phase | Module | Key Fix | Files Affected |
|-------|--------|---------|---------------|
| 1 | Accounting | Void/refund entry types (EXPENSE→REVENUE) | transactions.ts, metrics.ts, accountingPage.tsx, EntryModal.tsx |
| 1 | Accounting | Contra-entry revenue calculation | metrics.ts |
| 1 | Accounting | Breakdown display for natural credit accounts | accountingPage.tsx |
| 2 | Sales | Per-payment ledger entries for SPLIT | transactions.ts, payment.ts |
| 2 | Sales | Split-aware void/refund reversal | transactions.ts |
| 2 | Sales | Accounting entry for addTransactionPayment | transactions.ts |
| 3 | Sales | Total override state flow fix | SalesContext.tsx, CartPanel.tsx |
| 3 | Sales | Adjustment amount tracking | transactions.ts, schema/transactions.ts |
| 3 | Sales | Line total controlled input | CartPanel.tsx |
| 4 | Payroll | client_type flow fix | transactions.ts, sales.ts |
| 4 | Payroll | Tax withholding → net payout | payroll.ts, schema/payroll.ts |
| 4 | Payroll | Disbursement double-counting fix | payroll-disbursements.ts |
| 4 | Payroll | Manual entry rate enforcement | payroll.ts |
| 4 | Payroll | Type/schema consistency | payroll-schemas.ts, types/payroll.ts |
| 4 | Payroll | Artist level/period validation fix | profile actions |
| 4 | Payroll | serviceType default fix | schema/services.ts |
| 5 | Cross | DB constraint for debit/credit | schema/accounting.ts |
| 5 | Cross | Deduction category differentiation | payroll.ts |
| 5 | Cross | BANK→BANK_TRANSFER migration | payroll types |
| 5 | Cross | Payroll reversal on void | payroll.ts, transactions.ts |
| 5 | Cross | Split reference validation | SplitPaymentBuilder.tsx, CheckoutModal.tsx |
| 5 | Cross | Business-friendly accounting labels | accountingPage.tsx |
| 6 | All | Lint & build fixes | All changed files |

## Estimated Scope

- **Total files to modify:** ~25
- **Estimated tasks:** 24
- **Estimated implementation time:** 3-4 hours with subagent-driven development
