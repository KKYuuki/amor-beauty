# Accounting & Downpayment Comprehensive Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix accounting net value calculation, validate tester comments, complete downpayment feature integration, and resolve all lint/build issues.

**Architecture:** This plan addresses two interconnected areas: (1) the Accounting summary page uses a misleading `total_debit - total_credit` formula across all entry types instead of proper `revenue - expenses` net income, and (2) the Downpayment feature is substantially implemented but has gaps in UI integration, payroll flow, and edge cases. Both areas share the general_ledger and transactions tables.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Supabase, Tailwind CSS 4

---

## Phase 1: Accounting — Validate & Fix Tester Comments

### Background: What the testers reported

**Comment 1: "Voided sales goes to expense"**

After thorough code review, this is **INVALID at the code level** but **understandable from the UI perspective**:

- **Code reality:** Voided sales are recorded as `entry_type: 'REVENUE'`, `category: 'VOIDED_SALES'` with `debit: amount, credit: 0`. They stay within the REVENUE type — they do NOT go to EXPENSE.
- **Why testers think this:** The accounting summary page (`accountingPage.tsx:637`) shows `balance = total_debit - total_credit` across ALL entry types. Since voided sales add to `total_debit`, they inflate the "expenses" side of the aggregate balance. The UI label "Net (Expenses > Income)" when balance >= 0 makes it look like voided sales are counted as expenses.
- **P&L metrics are correct:** `metrics.ts:655-662` correctly computes `revenue += credit - debit` for REVENUE entries and `netIncome = revenue - expenses`.

**Comment 2: "should be net = income - expense (net value should be - not +)"**

This is **VALID** for the accounting summary page:

- **Current formula:** `balance = total_debit - total_credit` (line 1037 of `accounting.ts`) sums debits and credits across ALL entry types (REVENUE, EXPENSE, ASSET, LIABILITY, EQUITY). This is NOT a meaningful net income figure.
- **Correct formula:** `net = revenue - expenses` where `revenue = Σ(credit - debit) for REVENUE entries` and `expenses = Σ(debit - credit) for EXPENSE entries`.
- **The P&L metrics already use the correct formula** — the accounting summary page needs to match.

---

### Task 1: Fix the LedgerSummary to include proper net income calculation

**Files:**
- Modify: `server/actions/accounting.ts:932-1060` (getLedgerSummary function)
- Modify: `app/accounting/accountingPage.tsx:624-646` (summary cards display)

**Step 1: Update the LedgerSummary type to include revenue, expenses, and netIncome fields**

In `server/actions/accounting.ts`, find the `LedgerSummary` interface (around line 870-930) and add:

```typescript
export interface LedgerSummary {
    total_debit: number
    total_credit: number
    balance: number // Keep for backward compat (raw debit - credit)
    revenue: number // NEW: total revenue (credit - debit for REVENUE entries)
    expenses: number // NEW: total expenses (debit - credit for EXPENSE entries)
    net_income: number // NEW: revenue - expenses
    by_type: {
        type: LedgerEntryType
        debit: number
        credit: number
    }[]
    by_payment_method: {
        method: string | null
        method_label: string
        debit: number
        credit: number
        count: number
    }[]
}
```

**Step 2: Calculate revenue and expenses in getLedgerSummary**

In the `getLedgerSummary` function (around line 1034), after computing `totalDebit` and `totalCredit`, add:

```typescript
// Compute revenue and expenses from by_type breakdown
let revenue = 0
let expenses = 0
byTypeResult.forEach((row) => {
    const debit = Number(row.debit || 0)
    const credit = Number(row.credit || 0)
    if (row.type === 'REVENUE') {
        revenue += credit - debit
    } else if (row.type === 'EXPENSE') {
        expenses += debit - credit
    }
})

const summary: LedgerSummary = {
    total_debit: totalDebit,
    total_credit: totalCredit,
    balance: totalDebit - totalCredit,
    revenue,
    expenses,
    net_income: revenue - expenses,
    by_type: byTypeResult.map((row) => ({
        type: row.type as LedgerEntryType,
        debit: Number(row.debit || 0),
        credit: Number(row.credit || 0),
    })),
    by_payment_method: byMethodResult.map((row) => ({
        method: row.method || null,
        method_label: getAccountingPaymentMethodLabel(row.method),
        debit: Number(row.debit || 0),
        credit: Number(row.credit || 0),
        count: Number(row.count || 0),
    })),
}
```

**Step 3: Update the accounting page summary cards**

In `app/accounting/accountingPage.tsx`, replace the summary cards section (lines 624-646) with:

```tsx
{summary && (
    <StatsGrid columns={{ mobile: 2, tablet: 2, desktop: 4 }}>
        <StatCard
            label='Total Revenue'
            value={`${currencySymbol}${summary.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            color='success'
        />
        <StatCard
            label='Total Expenses'
            value={`${currencySymbol}${summary.expenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            color='danger'
        />
        <StatCard
            label={summary.net_income >= 0 ? 'Net Income' : 'Net Loss'}
            value={`${summary.net_income >= 0 ? '+' : '-'}${currencySymbol}${Math.abs(summary.net_income).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            color={summary.net_income >= 0 ? 'success' : 'danger'}
        />
        <StatCard
            label='Total Entries'
            value={total}
        />
    </StatsGrid>
)}
```

**Step 4: Verify the fix**

Run: `bun run build`
Expected: Build succeeds with no type errors

---

### Task 2: Fix the detail breakdown net calculation consistency

**Files:**
- Modify: `server/actions/accounting.ts:1139-1158` (getLedgerDetailBreakdown)

**Step 1: The detail breakdown uses raw `debit - credit` for net**

The `getLedgerDetailBreakdown` function at line 1148 computes `net += rowDebit - rowCredit` per payment method. This mixes all entry types. The net per payment method should reflect the natural balance direction based on entry type.

However, since payment method breakdown is for informational purposes and includes mixed types, keep the raw debit-credit but add a note in the UI. No code change needed here — the payment method breakdown is intentionally raw.

**Skip this task — no change needed.**

---

### Task 3: Clean up the misleading "Total Income (Credits)" / "Total Expenses (Debits)" labels

**Files:**
- Modify: `app/accounting/accountingPage.tsx:626-634` (total credit/debit cards)

**Step 1: The "Total Income (Credits)" label is misleading because total_credit includes all credit entries (REVENUE credits + LIABILITY credits + EQUITY credits)**

The per-type breakdown already shows the correct picture. The total credit/debit cards are useful for trial balance verification but should not be labeled as "Income" / "Expenses".

Update labels:

```tsx
<StatCard
    label='Total Credits'
    value={`${currencySymbol}${summary.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
    color='success'
/>
<StatCard
    label='Total Debits'
    value={`${currencySymbol}${summary.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
    color='danger'
/>
```

**Step 2: Verify**

Run: `bun run build`
Expected: Build succeeds

---

## Phase 2: Downpayment Feature — Current State & Gap Analysis

### Current Implementation Status

The downpayment system is **substantially implemented** end-to-end:
- Database schema (`server/db/schema/payroll.ts:11-41`) with `downpayments` table
- Server actions (`server/actions/downpayments.ts`) with full CRUD
- Transaction integration (`server/actions/transactions.ts:192-218`) for creation
- Settlement logic (`server/actions/transactions.ts:935-968`) on balance completion
- Checkout UI (`components/sales/modals/CheckoutModal.tsx:249-361`) with type selector
- Payroll page downpayments tab (`app/payroll/payrollPage.tsx:1963-2096`)
- Create/Assign modals (`app/payroll/modals/`)

### Identified Gaps

| # | Gap | Severity | Location |
|---|-----|----------|----------|
| 1 | `downpaymentAmount` state not passed to payload for FLAT_FEE/CUSTOM types | HIGH | `SalesContext.tsx:965-968` |
| 2 | RecentTransactions missing DOWNPAYMENT_* status badges and action buttons | HIGH | `RecentTransactions.tsx:229-277` |
| 3 | Transaction detail page missing downpayment info card | MEDIUM | `transactionDetailClient.tsx` |
| 4 | No automatic partial payment toggle when downpayment is enabled | MEDIUM | `CheckoutModal.tsx`, `SalesContext.tsx` |
| 5 | `assignStaffToDownpayment` doesn't create PER_PAYMENT payroll entry | HIGH | `downpayments.ts:79-104` |
| 6 | Downpayment status not considered in receipt generation | LOW | `receipt-pdf.ts` |
| 7 | Voiding a DOWNPAYMENT_* transaction doesn't clean up downpayment record | MEDIUM | `transactions.ts:603-654` |
| 8 | No validation that downpayment amount < transaction total | MEDIUM | `transactions.ts:192-218` |

---

### Task 4: Pass downpaymentAmount to the transaction payload (Gap #1 — HIGH)

**Problem:** When a user sets a FLAT_FEE or CUSTOM downpayment amount, the `downpaymentAmount` state is tracked in SalesContext but never passed to `CreateTransactionPayload`. The system relies on `amount_paid` from the partial payment flow, which may not match.

**Files:**
- Modify: `utils/types/transactions.ts:121-157` (CreateTransactionPayload)
- Modify: `components/sales/context/SalesContext.tsx:965-968` (payload construction)

**Step 1: Add `downpayment_amount` field to CreateTransactionPayload**

In `utils/types/transactions.ts`, add to the payload interface:

```typescript
downpayment_type?: 'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM'
downpayment_amount?: number // NEW: explicit downpayment amount for FLAT_FEE/CUSTOM
downpayment_percentage_rate?: number
downpayment_estimated_total?: number
payroll_split_mode?: 'PER_PAYMENT' | 'ON_COMPLETION'
```

**Step 2: Pass downpaymentAmount from SalesContext to payload**

In `components/sales/context/SalesContext.tsx`, update the payload construction (around line 965):

```typescript
downpayment_type: downpaymentType || undefined,
downpayment_amount: downpaymentType && downpaymentType !== 'PERCENTAGE' ? downpaymentAmount : undefined,
downpayment_percentage_rate: downpaymentType === 'PERCENTAGE' ? downpaymentPercentageRate : undefined,
downpayment_estimated_total: downpaymentType === 'PERCENTAGE' ? downpaymentEstimatedTotal : undefined,
payroll_split_mode: downpaymentType ? payrollSplitMode : undefined,
```

**Step 3: Use downpayment_amount in transaction creation**

In `server/actions/transactions.ts`, update the downpayment creation block (around line 198):

```typescript
await createDownpayment({
    transaction_id: newTransaction.id,
    amount: payload.downpayment_amount ?? payload.amount_paid ?? payload.total,
    downpayment_type: payload.downpayment_type,
    percentage_rate: payload.downpayment_percentage_rate,
    estimated_total: payload.downpayment_estimated_total,
    staff_id: payload.staff_id ?? undefined,
    payroll_split_mode: payload.payroll_split_mode || 'PER_PAYMENT',
}, tx)
```

**Step 2: Verify**

Run: `bun run build`
Expected: Build succeeds

---

### Task 5: Add DOWNPAYMENT_* status badges and action buttons to RecentTransactions (Gap #2 — HIGH)

**Problem:** The RecentTransactions table only handles COMPLETED, PARTIAL, VOIDED statuses with colors. DOWNPAYMENT_PENDING and DOWNPAYMENT_ASSIGNED fall through to the default white badge. The "Add Payment" button only shows for PARTIAL status, not for DOWNPAYMENT_* statuses.

**Files:**
- Modify: `components/sales/layout/RecentTransactions.tsx:229-277`

**Step 1: Add DOWNPAYMENT_* status badge colors**

Update the status badge section (around line 229):

```tsx
<span
    className={`px-2 py-0.5 rounded-sm text-xs font-semibold border-2 border-white/5 ${
        txn.status === "COMPLETED"
            ? "bg-green-400/20 text-green-300"
            : txn.status === "PARTIAL"
              ? "bg-amber-400/20 text-amber-300"
              : txn.status === "VOIDED"
                ? "bg-red-400/20 text-red-300"
                : txn.status === "DOWNPAYMENT_PENDING"
                  ? "bg-purple-400/20 text-purple-300"
                  : txn.status === "DOWNPAYMENT_ASSIGNED"
                    ? "bg-indigo-400/20 text-indigo-300"
                    : txn.status === "REFUNDED"
                      ? "bg-orange-400/20 text-orange-300"
                      : "bg-white/10 text-white/80"
    }`}
>
    {txn.status}
</span>
```

**Step 2: Show "Add Payment" button for DOWNPAYMENT_* statuses**

Update the actions column (around line 267):

```tsx
{(txn.status === "PARTIAL" || txn.status === "DOWNPAYMENT_PENDING" || txn.status === "DOWNPAYMENT_ASSIGNED") && (
    <button
        onClick={() => {
            setSelectedTransactionForPayment(txn)
            setIsAddPaymentModalOpen(true)
        }}
        className='px-2 py-0.5 bg-blue-400/20 hover:bg-blue-400/40 text-blue-300 text-xs font-semibold rounded-sm border-2 border-white/5 transition-colors cursor-pointer'
    >
        Add Payment
    </button>
)}
```

**Step 3: Verify**

Run: `bun run build`
Expected: Build succeeds

---

### Task 6: Add downpayment info card to transaction detail page (Gap #3 — MEDIUM)

**Problem:** The transaction detail page shows status badges for DOWNPAYMENT_PENDING/ASSIGNED but does NOT display a dedicated downpayment info card (type, amount, percentage, assignment status).

**Files:**
- Modify: `app/transactions/transactionDetailClient.tsx` (add downpayment section)
- Modify: `server/actions/transactions.ts` (fetch downpayment data with transaction)

**Step 1: Fetch downpayment data when loading transaction details**

In the transaction detail page, the transaction data is loaded from a server action. We need to also fetch the associated downpayment record. Check how the transaction is fetched:

The transaction detail page receives `transaction` as a prop from the server component. We need to join the downpayment data.

In `server/actions/transactions.ts`, find the `getTransaction` or similar function that loads a single transaction. Add a join or separate query for the downpayment.

**Step 2: Add downpayment info card to the detail page**

After the balance due section (around line 435), add:

```tsx
{/* Downpayment Info */}
{(transaction.status === 'DOWNPAYMENT_PENDING' || transaction.status === 'DOWNPAYMENT_ASSIGNED') && transaction.downpayment && (
    <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/30">
        <h3 className="text-lg font-semibold text-purple-300 mb-4 flex items-center gap-2">
            <WalletIcon className="w-5 h-5" />
            Downpayment Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <p className="text-sm text-white/60">Type</p>
                <p className="text-white">{transaction.downpayment.downpayment_type}</p>
            </div>
            <div>
                <p className="text-sm text-white/60">Amount</p>
                <p className="text-white">{currencySymbol}{transaction.downpayment.amount.toFixed(2)}</p>
            </div>
            <div>
                <p className="text-sm text-white/60">Split Mode</p>
                <p className="text-white">{transaction.downpayment.payroll_split_mode}</p>
            </div>
            {transaction.downpayment.percentage_rate && (
                <div>
                    <p className="text-sm text-white/60">Percentage Rate</p>
                    <p className="text-white">{transaction.downpayment.percentage_rate}%</p>
                </div>
            )}
            {transaction.downpayment.estimated_total && (
                <div>
                    <p className="text-sm text-white/60">Estimated Total</p>
                    <p className="text-white">{currencySymbol}{transaction.downpayment.estimated_total.toFixed(2)}</p>
                </div>
            )}
            <div>
                <p className="text-sm text-white/60">Staff Assigned</p>
                <p className="text-white">{transaction.downpayment.staff_id ? 'Yes' : 'Pending'}</p>
            </div>
            <div>
                <p className="text-sm text-white/60">Status</p>
                <p className={transaction.downpayment.is_settled ? 'text-green-400' : 'text-amber-400'}>
                    {transaction.downpayment.is_settled ? 'Settled' : 'Outstanding'}
                </p>
            </div>
        </div>
    </div>
)}
```

**Step 3: Update the Transaction type to include downpayment data**

In `utils/types/transactions.ts`, add an optional `downpayment` field to the Transaction interface.

**Step 4: Verify**

Run: `bun run build`
Expected: Build succeeds

---

### Task 7: Auto-enable partial payment when downpayment is configured (Gap #4 — MEDIUM)

**Problem:** When a user configures a downpayment (FLAT_FEE/CUSTOM with an amount), they still need to separately enable "Partial Payment" and manually enter the amount. The downpayment amount should automatically set the `amount_paid`.

**Files:**
- Modify: `components/sales/context/SalesContext.tsx` (checkout handler)
- Modify: `components/sales/modals/CheckoutModal.tsx` (UI feedback)

**Step 1: In the checkout handler, when downpayment is configured, auto-set amount_paid**

In `SalesContext.tsx`, in the `checkout` function (around line 900-970), before building the payload:

```typescript
// Auto-set amount_paid for downpayment transactions
let effectiveAmountPaid = amount_paid
if (downpaymentType && !isPartialPayment) {
    if (downpaymentType === 'PERCENTAGE' && downpaymentPercentageRate > 0 && downpaymentEstimatedTotal > 0) {
        effectiveAmountPaid = downpaymentEstimatedTotal * downpaymentPercentageRate / 100
    } else if (downpaymentAmount > 0) {
        effectiveAmountPaid = downpaymentAmount
    }
}
```

Then use `effectiveAmountPaid` in the payload:
```typescript
amount_paid: effectiveAmountPaid,
balance_due: total - effectiveAmountPaid,
```

**Step 2: Show calculated amount in the checkout modal when downpayment is active**

In `CheckoutModal.tsx`, when downpayment is configured, show the calculated downpayment amount as the default payment amount.

**Step 3: Verify**

Run: `bun run build`
Expected: Build succeeds

---

### Task 8: Create PER_PAYMENT payroll entry when assigning staff (Gap #5 — HIGH)

**Problem:** When staff is assigned to an existing downpayment via `assignStaffToDownpayment()`, no payroll entry is created for the PER_PAYMENT split mode. The design spec says: "If PER_PAYMENT: A payroll entry is created for the downpayment amount."

**Files:**
- Modify: `server/actions/downpayments.ts:79-104` (assignStaffToDownpayment)

**Step 1: Add payroll entry creation for PER_PAYMENT mode**

In `assignStaffToDownpayment`, after updating the downpayment and transaction status:

```typescript
export async function assignStaffToDownpayment(payload: AssignStaffToDownpaymentPayload): Promise<Downpayment> {
    try {
        const [updated] = await db
            .update(downpayments)
            .set({
                staffId: payload.staff_id,
                assignedAt: new Date(),
                payrollSplitMode: payload.payroll_split_mode,
                updatedAt: new Date(),
            })
            .where(eq(downpayments.id, payload.downpayment_id))
            .returning()

        if (!updated) throw new Error('Downpayment not found')

        await db
            .update(transactions)
            .set({ status: 'DOWNPAYMENT_ASSIGNED' })
            .where(eq(transactions.id, updated.transactionId))

        // Create payroll entry for PER_PAYMENT mode
        if (payload.payroll_split_mode === 'PER_PAYMENT') {
            const [transaction] = await db
                .select()
                .from(transactions)
                .where(eq(transactions.id, updated.transactionId))
                .limit(1)

            if (transaction) {
                const { calculateAndCreatePayrollEntry } = await import('./payroll')
                await calculateAndCreatePayrollEntry({
                    transactionId: transaction.id,
                    serviceId: '',
                    staffId: payload.staff_id,
                    amount: Number(updated.amount),
                    quantity: 1,
                    clientType: (transaction.clientType as ClientType) || undefined,
                    paymentMethod: transaction.paymentMethod || undefined,
                })
            }
        }

        return mapDownpayment(updated)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Failed to assign staff to downpayment: ${error}` }] })
        throw new Error('Failed to assign staff')
    }
}
```

**Step 2: Verify**

Run: `bun run build`
Expected: Build succeeds

---

### Task 9: Add downpayment amount validation (Gap #8 — MEDIUM)

**Problem:** No validation that the downpayment amount is less than the transaction total, or that it's positive.

**Files:**
- Modify: `server/actions/transactions.ts:192-218` (downpayment creation in createTransaction)

**Step 1: Add validation before creating the downpayment**

```typescript
if (payload.downpayment_type) {
    const downpaymentAmount = payload.downpayment_amount ?? payload.amount_paid ?? payload.total

    // Validate downpayment amount
    if (downpaymentAmount <= 0) {
        throw new Error('Downpayment amount must be greater than zero')
    }
    if (downpaymentAmount >= payload.total) {
        throw new Error('Downpayment amount must be less than the transaction total')
    }

    try {
        const { createDownpayment } = await import('./downpayments')
        // ... rest of creation logic
    }
}
```

**Step 2: Verify**

Run: `bun run build`
Expected: Build succeeds

---

### Task 10: Clean up downpayment record on void (Gap #7 — MEDIUM)

**Problem:** When a DOWNPAYMENT_* transaction is voided, the downpayment record is not updated. It should be marked as settled or cancelled.

**Files:**
- Modify: `server/actions/transactions.ts:603-654` (voidTransaction)

**Step 1: After voiding, settle the associated downpayment**

After the void accounting entry creation (around line 654), add:

```typescript
// Settle associated downpayment if exists
try {
    const [downpayment] = await tx
        .select()
        .from(downpayments)
        .where(eq(downpayments.transactionId, transaction.id))
        .limit(1)

    if (downpayment && !downpayment.isSettled) {
        await tx
            .update(downpayments)
            .set({ isSettled: true, updatedAt: new Date() })
            .where(eq(downpayments.id, downpayment.id))
    }
} catch (dpError) {
    await logError({
        type: 'PAYROLL',
        message: `Failed to settle downpayment on void for transaction ${transaction.transactionNumber}: ${dpError instanceof Error ? dpError.message : String(dpError)}`
    })
}
```

**Step 2: Verify**

Run: `bun run build`
Expected: Build succeeds

---

## Phase 3: Additional Improvements & Suggestions

### Task 11: Allow editing Service Type, Client Type, and Rate Level in EditRateModal

**Problem:** The `EditRateModal` only allows editing `payment_mode`, `shop_percentage`, `staff_percentage`, and `fixed_amount`. Users cannot change `service_type`, `client_type`, or `rate_level_id` — if they need to reassign a rate to a different service/client/level combination, they must delete and recreate it. The `CreateRateModal` already has all 7 fields editable. The `UpdateStaffRatePayload` type and `updateStaffRate` server action also lack these fields.

**Constraint:** There is a unique index `idx_payroll_rate_level_service_client` on `(service_type, client_type, rate_level_id)`. Changing these fields must check for conflicts with existing rates.

**Files:**
- Modify: `app/payroll/modals/EditRateModal.tsx` (add 3 new editable fields)
- Modify: `utils/types/payroll.ts:47-54` (UpdateStaffRatePayload — add service_type, client_type, rate_level_id)
- Modify: `server/actions/payroll.ts:183-252` (updateStaffRate — handle new fields + uniqueness check)

**Step 1: Extend UpdateStaffRatePayload type**

In `utils/types/payroll.ts`, update the interface:

```typescript
export interface UpdateStaffRatePayload {
    rate_name?: string
    service_type?: string       // NEW
    client_type?: string        // NEW
    rate_level_id?: string      // NEW
    shop_percentage?: number
    staff_percentage?: number
    payment_mode?: 'PERCENTAGE' | 'FIXED'
    fixed_amount?: number
    is_active?: boolean
}
```

**Step 2: Update the server action to handle new fields**

In `server/actions/payroll.ts`, in `updateStaffRate` (around line 183-252):

1. Add the new fields to the update payload builder:
```typescript
if (updates.service_type) updateData.serviceType = updates.service_type
if (updates.client_type) updateData.clientType = updates.client_type
if (updates.rate_level_id !== undefined) updateData.rateLevelId = updates.rate_level_id || null
```

2. Add uniqueness check before updating:
```typescript
// Check for unique constraint conflict if changing service/client/level
if (updates.service_type || updates.client_type || updates.rate_level_id !== undefined) {
    const newServiceType = updates.service_type || existing.serviceType
    const newClientType = updates.client_type || existing.clientType
    const newRateLevelId = updates.rate_level_id !== undefined ? updates.rate_level_id : existing.rateLevelId

    const conflictConditions = [
        eq(payrollStaffRate.serviceType, newServiceType),
        eq(payrollStaffRate.clientType, newClientType),
        ne(payrollStaffRate.id, id),
    ]
    if (newRateLevelId) {
        conflictConditions.push(eq(payrollStaffRate.rateLevelId, newRateLevelId))
    } else {
        conflictConditions.push(isNull(payrollStaffRate.rateLevelId))
    }

    const [conflict] = await db
        .select({ id: payrollStaffRate.id })
        .from(payrollStaffRate)
        .where(and(...conflictConditions))
        .limit(1)

    if (conflict) {
        return failure('A rate with this service type, client type, and rate level already exists')
    }
}
```

3. Auto-regenerate `rate_name` if service_type, client_type, or rate_level_id changed:
```typescript
if (updates.service_type || updates.client_type || updates.rate_level_id !== undefined) {
    const svc = updates.service_type || existing.serviceType
    const cli = updates.client_type || existing.clientType
    const lvlId = updates.rate_level_id !== undefined ? updates.rate_level_id : existing.rateLevelId

    let levelName = 'Standard'
    if (lvlId) {
        const [level] = await db.select().from(rateLevels).where(eq(rateLevels.id, lvlId)).limit(1)
        if (level) levelName = level.name
    }
    updateData.rateName = `${svc} - ${cli} - ${levelName}`
}
```

4. Add cache invalidation (currently missing):
```typescript
cache.invalidate('payroll_rates')
```

**Step 3: Update the EditRateModal UI to include the 3 new fields**

In `app/payroll/modals/EditRateModal.tsx`:

1. Add new state variables:
```typescript
const [serviceType, setServiceType] = useState(rate.service_type || 'TATTOO')
const [clientType, setClientType] = useState(rate.client_type || 'WALKIN')
const [rateLevelId, setRateLevelId] = useState(rate.rate_level_id || '')
```

2. Add service type select (same as CreateRateModal):
```tsx
<div>
    <label className='block text-xs font-medium mb-1 text-zinc-600 dark:text-zinc-400'>Service Type</label>
    <select
        value={serviceType}
        onChange={(e) => setServiceType(e.target.value)}
        className='w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm'
    >
        <option value='TATTOO'>Tattoo</option>
        <option value='PIERCING'>Piercing</option>
        <option value='SHOE'>Shoe</option>
    </select>
</div>
```

3. Add client type select:
```tsx
<div>
    <label className='block text-xs font-medium mb-1 text-zinc-600 dark:text-zinc-400'>Client Type</label>
    <select
        value={clientType}
        onChange={(e) => setClientType(e.target.value)}
        className='w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm'
    >
        <option value='WALKIN'>Walk-in</option>
        <option value='PERSONAL'>Personal</option>
    </select>
</div>
```

4. Add rate level select (fetch rate levels via `getRateLevels`):
```tsx
<div>
    <label className='block text-xs font-medium mb-1 text-zinc-600 dark:text-zinc-400'>Rate Level</label>
    <select
        value={rateLevelId}
        onChange={(e) => setRateLevelId(e.target.value)}
        className='w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm'
    >
        <option value=''>Standard (No Level)</option>
        {rateLevels.map((level) => (
            <option key={level.id} value={level.id}>{level.name}</option>
        ))}
    </select>
</div>
```

5. Update the `onSave` callback signature to include the new fields:
```typescript
onSave: (
    shopPct: number,
    staffPct: number,
    paymentMode: 'PERCENTAGE' | 'FIXED',
    fixedAmount: number | undefined,
    serviceType: string,
    clientType: string,
    rateLevelId: string
) => Promise<void>
```

6. Update the auto-complement logic for rate_name display:
```tsx
const rateName = `${serviceType} - ${clientType} - ${rateLevels.find(l => l.id === rateLevelId)?.name || 'Standard'}`
```

**Step 4: Update the parent component (payrollPage.tsx) that calls onSave**

In `app/payroll/payrollPage.tsx`, find the `EditRateModal` usage and update the `onSave` handler to pass the new fields to `updateStaffRate`:

```typescript
onSave={async (shopPct, staffPct, paymentMode, fixedAmount, serviceType, clientType, rateLevelId) => {
    const result = await updateStaffRate(editingRate.id, {
        shop_percentage: shopPct,
        staff_percentage: staffPct,
        payment_mode: paymentMode,
        fixed_amount: fixedAmount,
        service_type: serviceType,
        client_type: clientType,
        rate_level_id: rateLevelId,
    })
    // ... handle result
}}
```

**Step 5: Verify**

Run: `bun run build`
Expected: Build succeeds

---

### Task 12: Void button should be available for DOWNPAYMENT_* transactions

**Problem:** In RecentTransactions, the Void button only shows for COMPLETED and PARTIAL statuses. DOWNPAYMENT_* transactions should also be voidable.

**Files:**
- Modify: `components/sales/layout/RecentTransactions.tsx:259-266`

**Step 1: Extend the void button condition**

```tsx
{(txn.status === "COMPLETED" || txn.status === "PARTIAL" || txn.status === "DOWNPAYMENT_PENDING" || txn.status === "DOWNPAYMENT_ASSIGNED") && (
    <button
        onClick={() => handleVoid(txn.id)}
        className='px-2 py-0.5 bg-red-400/20 hover:bg-red-400/40 text-red-300 text-xs font-semibold rounded-sm border-2 border-white/5 transition-colors cursor-pointer'
    >
        Void
    </button>
)}
```

**Step 2: Verify**

Run: `bun run build`
Expected: Build succeeds

---

### Task 13: Receipt button should work for DOWNPAYMENT_* transactions

**Problem:** The receipt download button only shows for COMPLETED and PARTIAL statuses. DOWNPAYMENT_* transactions should also be able to generate receipts.

**Files:**
- Modify: `components/sales/layout/RecentTransactions.tsx:244-258`

**Step 1: Extend the receipt button condition**

```tsx
{(txn.status === "COMPLETED" || txn.status === "PARTIAL" || txn.status === "DOWNPAYMENT_PENDING" || txn.status === "DOWNPAYMENT_ASSIGNED") && (
    <button
        onClick={() => handleDownloadReceipt(txn.id)}
        disabled={generatingReceipts.has(txn.id)}
        className='flex items-center gap-1 px-2 py-0.5 bg-amber-400/20 hover:bg-amber-400/40 text-amber-300 text-xs font-semibold rounded-sm border-2 border-white/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
        title='Download Receipt'
    >
        {generatingReceipts.has(txn.id) ? (
            <LoaderCircleIcon className='w-3 h-3 animate-spin' />
        ) : (
            <ReceiptIcon className='w-3 h-3' />
        )}
        <span>Receipt</span>
    </button>
)}
```

**Step 2: Verify**

Run: `bun run build`
Expected: Build succeeds

---

### Task 14: Add "Downpayment" label to the checkout summary when active

**Problem:** When a downpayment is configured in the checkout modal, there's no clear summary showing "Downpayment: ₱X / Balance due: ₱Y" before confirming.

**Files:**
- Modify: `components/sales/modals/CheckoutModal.tsx` (add summary section)

**Step 1: Add a downpayment summary line above the confirm button**

When `downpaymentType` is set, show:

```tsx
{downpaymentType && (
    <div className='p-3 bg-purple-500/10 rounded-lg border border-purple-500/30'>
        <p className='text-sm font-medium text-purple-300'>Downpayment Summary</p>
        <p className='text-xs text-white/60 mt-1'>
            Paying now: {taxSettings.currency_symbol}{downpaymentType === 'PERCENTAGE'
                ? (downpaymentEstimatedTotal * downpaymentPercentageRate / 100).toFixed(2)
                : downpaymentAmount.toFixed(2)}
        </p>
        <p className='text-xs text-white/60'>
            Balance due: {taxSettings.currency_symbol}{(total - (downpaymentType === 'PERCENTAGE'
                ? downpaymentEstimatedTotal * downpaymentPercentageRate / 100
                : downpaymentAmount)).toFixed(2)}
        </p>
    </div>
)}
```

**Step 2: Verify**

Run: `bun run build`
Expected: Build succeeds

---

## Phase 4: Fix All Lint & Build Errors

### Task 15: Run lint and fix any issues introduced by changes

**Step 1: Run lint**

```bash
bun run lint
```

**Step 2: Fix any lint errors**

Common issues to watch for:
- Unused imports (e.g., `WalletIcon` if not imported in transactionDetailClient)
- Missing type annotations
- Unused variables

**Step 3: Verify lint passes**

```bash
bun run lint
```
Expected: No errors

---

### Task 16: Run build and fix any type errors

**Step 1: Run build**

```bash
bun run build
```

**Step 2: Fix any TypeScript errors**

Common issues:
- Missing properties on Transaction type (downpayment field)
- Type mismatches between server action return types and UI expectations
- Missing imports

**Step 3: Verify build passes**

```bash
bun run build
```
Expected: Build succeeds with no errors

---

### Task 17: Final verification — end-to-end check

**Step 1: Run both lint and build together**

```bash
bun run lint && bun run build
```

**Step 2: Verify all changes are consistent**

Check that:
- The LedgerSummary interface changes are reflected in all consumers
- The Transaction type changes don't break existing code
- The downpayment payload changes are backward compatible (all new fields are optional)
- The UpdateStaffRatePayload changes are backward compatible
- The unique constraint on `(service_type, client_type, rate_level_id)` is respected

**Step 3: Commit**

```bash
git add -A
git commit -m "fix: accounting net calculation, downpayment completion, and rate editing

- Fix accounting summary to use revenue-expenses formula instead of raw debit-credit
- Add proper net income/loss display on accounting page
- Pass downpayment amount explicitly in transaction payload
- Add DOWNPAYMENT_* status badges and actions in RecentTransactions
- Add downpayment info card to transaction detail page
- Auto-set amount_paid when downpayment is configured
- Create PER_PAYMENT payroll entry when assigning staff to downpayment
- Add downpayment amount validation
- Clean up downpayment record on void
- Extend void/receipt buttons for downpayment statuses
- Add downpayment summary to checkout modal
- Allow editing service_type, client_type, rate_level_id in EditRateModal
- Add uniqueness check when changing rate dimensions
- Fix all lint and build errors"
```

---

## Execution Order

Execute tasks in this order for minimal conflicts:

1. **Task 1** — LedgerSummary type + calculation (accounting.ts)
2. **Task 3** — UI label fixes (accountingPage.tsx)
3. **Task 4** — downpayment_amount in payload (transactions.ts, SalesContext.tsx, types)
4. **Task 9** — Downpayment validation (transactions.ts)
5. **Task 10** — Void cleanup (transactions.ts)
6. **Task 5** — RecentTransactions status badges (RecentTransactions.tsx)
7. **Task 12** — Void button for downpayment statuses (RecentTransactions.tsx)
8. **Task 13** — Receipt button for downpayment statuses (RecentTransactions.tsx)
9. **Task 7** — Auto partial payment (SalesContext.tsx, CheckoutModal.tsx)
10. **Task 14** — Checkout summary (CheckoutModal.tsx)
11. **Task 8** — PER_PAYMENT payroll on assign (downpayments.ts)
12. **Task 6** — Transaction detail downpayment card (transactionDetailClient.tsx)
13. **Task 11** — EditRateModal: service_type, client_type, rate_level_id editing (EditRateModal.tsx, payroll.ts, types)
14. **Task 15** — Lint fix pass
15. **Task 16** — Build fix pass
16. **Task 17** — Final verification + commit
