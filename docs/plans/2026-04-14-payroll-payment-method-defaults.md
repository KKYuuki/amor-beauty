# Payroll Payment Method Defaults & Accounting Integrity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce that payroll disbursement payment methods default to the sales transaction's payment type, with a smart UI that warns on alternative selection. Ensure accounting auto-entries use correct payment methods per disbursement.

**Architecture:** Add a `payment_method` column to `payrollEntry` to track the original transaction's payment method. When completing payroll, derive the "expected" payment method from entries. Redesign the `CompletePaymentModal` and `StaggeredPaymentModal` to show the expected method prominently at the top with alternatives below a warning divider. Fix accounting entries for staggered payments to track per-disbursement methods.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict), Drizzle ORM, Supabase/PostgreSQL, Tailwind CSS 4

---

## Audit Issues Found

1. **`payrollEntry` missing `payment_method` column** — When a sale triggers `calculateAndCreatePayrollEntry`, the transaction's payment method is not stored on the payroll entry. Without this, there's no way to know how the customer originally paid, so we can't suggest the correct disbursement method.

2. **`CompletePaymentModal` shows flat list** — All payment methods are shown equally with no indication of the "expected" method based on the original sale's payment type.

3. **Staggered payments default to CASH** — New disbursement lines default to 'CASH' regardless of original transaction type.

4. **`completePayrollRequest` creates single accounting entry** — When staggered payments use different methods, only one EXPENSE entry is created with the request-level method, not per-disbursement entries.

5. **SPLIT payment gap** — `mapTransactionToAccountingPaymentMethod('SPLIT')` returns `undefined`, meaning split-payment sales generate payroll entries with no payment method link.

6. **`normalizePayrollPaymentMethod` only used on read** — The function maps `BANK` → `BANK_TRANSFER` but `BANK` still appears in `PaymentMethodSchema` and `PayrollPaymentMethod` type. New records should use `BANK_TRANSFER`.

7. **`payroll-schemas.ts` `PaymentMethodSchema` includes legacy `BANK`** — Should be `BANK_TRANSFER` for new records, with backward-compat handling for reads.

---

## Task Dependency Graph

```
Task 1 (Schema + Types)
  └──> Task 2 (Backend: Propagate Payment Method on Sale)
        └──> Task 3 (Backend: Derive Expected Method for Payroll Completion)
              ├──> Task 4 (UI: Smart Payment Method Selection in CompletePaymentModal)
              ├──> Task 5 (UI: Smart Payment Method Selection in StaggeredPaymentModal)
              └──> Task 6 (Backend: Per-Disbursement Accounting Entries)
                    └──> Task 7 (Fix SPLIT payment + Normalize BANK)
                          └──> Task 8 (Lint & Build)
```

---

## Phase 1: Schema & Type Changes (Task 1)

### Task 1: Add `payment_method` Column to `payrollEntry` & Update Types

**Files:**
- Modify: `server/db/schema/payroll.ts`
- Modify: `utils/types/payroll.ts`
- Modify: `server/actions/payroll-schemas.ts`

**Context:** The `payrollEntry` table (lines 48-101) has no `payment_method` column. We need to store the original transaction's payment method on each payroll entry so we can derive the expected disbursement method when completing payroll. The `PayrollPaymentMethod` type includes legacy `'BANK'`; new code should use `'BANK_TRANSFER'`.

**Step 1: Add `paymentMethod` column to `payrollEntry` table**

In `server/db/schema/payroll.ts`, after `rateVersion: integer('rate_version').default(1)` at line 93, add:

```typescript
    // Original transaction payment method (used to suggest disbursement method)
    paymentMethod: varchar('payment_method', { length: 50 }),
    // Method: 'CASH', 'CARD', 'GCASH', 'BANK_TRANSFER', 'SPLIT'
```

Add an index in the table constructor (after line 99):

```typescript
    paymentMethodIdx: index('idx_payroll_entry_payment_method').on(table.paymentMethod),
```

**Step 2: Update `PayrollEntry` interface in `utils/types/payroll.ts`**

Add after `rate_version` (line 84):

```typescript
    payment_method?: string
    // Original transaction payment method: 'CASH', 'CARD', 'GCASH', 'BANK_TRANSFER', 'SPLIT'
```

**Step 3: Update `PayrollEntryInput` interface in `server/actions/payroll.ts`**

In `PayrollEntryInput` (around line 67-75), add:

```typescript
    paymentMethod?: string
    // Original transaction payment method
```

**Step 4: Update `PaymentMethodSchema` in `server/actions/payroll-schemas.ts`**

Change line 13 from:
```typescript
export const PaymentMethodSchema = z.enum(['CASH', 'GCASH', 'MAYA', 'BANK', 'CARD', 'CRYPTO'])
```

To:
```typescript
export const PaymentMethodSchema = z.enum(['CASH', 'GCASH', 'MAYA', 'BANK_TRANSFER', 'CARD', 'CRYPTO'])
```

Note: `'BANK'` is removed from the schema. Existing DB rows with `'BANK'` are handled by `normalizePayrollPaymentMethod()` on reads. New writes always use `'BANK_TRANSFER'`.

**Step 5: Update `PAYROLL_PAYMENT_METHODS` in `utils/types/payment.ts`**

Change the `PAYROLL_PAYMENT_METHODS` array — remove the legacy `'BANK'` entry:

```typescript
export const PAYROLL_PAYMENT_METHODS: { key: PayrollPaymentMethod; label: string }[] = [
    { key: 'CASH', label: 'Cash' },
    { key: 'GCASH', label: 'GCash' },
    { key: 'MAYA', label: 'Maya' },
    { key: 'BANK_TRANSFER', label: 'Bank Transfer / QR' },
    { key: 'CARD', label: 'Card (Debit/Credit)' },
    { key: 'CRYPTO', label: 'Crypto' },
]
```

**Step 6: Update `PAYMENT_METHODS` in `app/payroll/payrollPage.tsx`**

Change the local `PAYMENT_METHODS` constant (lines 63-69) to use `BANK_TRANSFER` instead of `BANK`:

```typescript
const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
    { key: "CASH", label: "Cash" },
    { key: "GCASH", label: "GCash" },
    { key: "MAYA", label: "Maya" },
    { key: "BANK_TRANSFER", label: "Bank Transfer / QR" },
    { key: "CARD", label: "Card (Debit/Credit)" },
    { key: "CRYPTO", label: "Crypto" },
]
```

**Step 7: Generate and run the migration**

```bash
bun run db:generate
bun run db:migrate
```

Verify the migration adds `payroll_entry.payment_method` (varchar 50, nullable).

**Step 8: Commit**

```bash
git add server/db/schema/payroll.ts utils/types/payroll.ts utils/types/payment.ts server/actions/payroll-schemas.ts app/payroll/payrollPage.tsx drizzle/
git commit -m "feat: add payment_method column to payroll_entry, normalize BANK to BANK_TRANSFER"
```

---

## Phase 2: Backend — Payment Method Propagation (Task 2)

### Task 2: Propagate Transaction Payment Method to Payroll Entries

**Files:**
- Modify: `server/actions/sales.ts`
- Modify: `server/actions/payroll.ts`

**Context:** When `createTransactionFromAppointment` (sales.ts) or `createTransaction` (transactions.ts) calls `calculateAndCreatePayrollEntry`, the transaction's payment method is not passed. We need to store the transaction's payment method on each payroll entry created from a sale.

**Step 1: Update `calculateAndCreatePayrollEntry` to accept and store `paymentMethod`**

In `server/actions/payroll.ts`, update the `PayrollEntryInput` interface (around line 67-75) to include:

```typescript
export interface PayrollEntryInput {
    transactionId: string
    serviceId: string
    artistId: string
    amount: number
    quantity: number
    serviceType?: ServiceType
    clientType?: ClientType
    paymentMethod?: string
    // Original transaction payment method
}
```

In the `calculateAndCreatePayrollEntry` function (around line 650), add `paymentMethod: input.paymentMethod || null` to the insert values:

```typescript
const [entry] = await dbClient
    .insert(payrollEntry)
    .values({
        staffId: artistId,
        transactionId: transactionId,
        serviceDate: new Date(),
        clientType: clientType,
        serviceType: serviceType,
        grossAmount: String(amount),
        shopCut: String(shopCut),
        artistCut: String(artistCut),
        rateId: rate.id,
        paymentStatus: 'PENDING',
        paymentMethod: input.paymentMethod || null,
        // ... existing fields
    })
    .returning()
```

In the `getPayrollEntries` function (around line 400-430), add `payment_method` to the mapping:

```typescript
payment_method: entry.paymentMethod || undefined,
```

Also in `getPendingEntries` (around line 467-492) and `getPayrollEntriesByRequest` (around line 1708-1733), add the same mapping line.

**Step 2: Update `createTransactionFromAppointment` in `server/actions/sales.ts`**

In the payroll entry creation loop (around lines 196-214), pass the transaction's payment method:

```typescript
await calculateAndCreatePayrollEntry({
    transactionId: newTransaction.id,
    serviceId: service.serviceId,
    artistId: appointment.staffId,
    amount: price,
    quantity: 1,
    serviceType: appointmentServiceType,
    paymentMethod: newTransaction.paymentMethod,
})
```

**Step 3: Update `createTransaction` in `server/actions/transactions.ts`**

Find where `calculateAndCreatePayrollEntry` is called (around line 192) and ensure the transaction payment method is passed:

```typescript
await calculateAndCreatePayrollEntry({
    transactionId: newTransaction.id,
    serviceId: item.serviceId!,
    artistId: transaction.staffId!,
    amount: Number(item.lineTotal),
    quantity: Number(item.quantity),
    serviceType: serviceType,
    clientType: (transaction.clientType as ClientType) || 'WALKIN',
    paymentMethod: transaction.paymentMethod,
})
```

**Step 4: Handle SPLIT payments**

For SPLIT transactions, the "primary" payment method should be derived from the largest payment in the split. In `server/actions/transactions.ts`, after creating payments for a SPLIT transaction, find the largest payment:

In the SPLIT payment block (around lines 174-185), after inserting payments, add a helper:

```typescript
// Derive primary payment method from the largest split payment
const primaryPaymentMethod = payload.payments
    ? payload.payments.reduce((prev, curr) => curr.amount > prev.amount ? curr : prev, payload.payments[0])?.payment_method
    : payload.payment_method
```

Then pass `primaryPaymentMethod` to `calculateAndCreatePayrollEntry`.

**Step 5: Handle `createManualPayrollEntry` — no transaction payment method**

Manual payroll entries have no transaction, so `paymentMethod` will be `null`. This is correct behavior — the admin creating a manual entry can specify the disbursement method directly.

**Step 6: Commit**

```bash
git add server/actions/payroll.ts server/actions/sales.ts server/actions/transactions.ts
git commit -m "feat: propagate transaction payment method to payroll entries"
```

---

## Phase 3: Backend — Derive Expected Method for Payroll Completion (Task 3)

### Task 3: Add Server Action to Get Expected Payment Method for a Payroll Request

**Files:**
- Modify: `server/actions/payroll.ts`

**Context:** When completing a payroll request, we want to suggest the "expected" payment method. This should be the most common payment method among the request's payroll entries. If entries have mixed methods (e.g., from split payments), we pick the dominant one.

**Step 1: Add `getExpectedPaymentMethod` function**

In `server/actions/payroll.ts`, add a new function:

```typescript
export async function getExpectedPaymentMethod(
    requestId: string
): Promise<ActionResponse<{ method: string | null; breakdown: { method: string; count: number; total: number }[] }>> {
    try {
        const entries = await db
            .select({
                paymentMethod: payrollEntry.paymentMethod,
                artistCut: payrollEntry.artistCut,
            })
            .from(payrollEntry)
            .where(eq(payrollEntry.payrollRequestId, requestId))

        if (entries.length === 0) {
            return success({ method: null, breakdown: [] })
        }

        // Count occurrences and total amounts per payment method
        const methodCounts: Record<string, { count: number; total: number }> = {}
        for (const entry of entries) {
            const method = entry.paymentMethod || 'UNKNOWN'
            if (!methodCounts[method]) {
                methodCounts[method] = { count: 0, total: 0 }
            }
            methodCounts[method].count++
            methodCounts[method].total += Number(entry.artistCut)
        }

        const breakdown = Object.entries(methodCounts).map(([method, data]) => ({
            method,
            count: data.count,
            total: data.total,
        }))

        // Sort by total amount (descending) to pick the dominant method
        breakdown.sort((a, b) => b.total - a.total)

        // Pick the dominant method, normalize legacy 'BANK' to 'BANK_TRANSFER'
        let dominantMethod = breakdown[0]?.method || null
        if (dominantMethod === 'BANK') dominantMethod = 'BANK_TRANSFER'
        if (dominantMethod === 'UNKNOWN') dominantMethod = null

        return success({ method: dominantMethod, breakdown })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error getting expected payment method: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to get expected payment method')
    }
}
```

**Step 2: Export the function**

Make sure `getExpectedPaymentMethod` is exported (it is by default since it's not inside another function).

**Step 3: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "feat: add getExpectedPaymentMethod to derive suggested payment method from payroll entries"
```

---

## Phase 4: UI — Smart Payment Method Selection (Tasks 4-5)

### Task 4: Redesign `CompletePaymentModal` with Smart Payment Method Selection

**Files:**
- Modify: `app/payroll/payrollPage.tsx`

**Context:** The current `CompletePaymentModal` (around line 1707-1833) shows all payment methods as a flat grid. We need to:
1. Fetch the expected payment method from entries
2. Show it prominently at the top with a checkmark
3. Show alternative methods below a divider with a warning
4. Warn the user if they select a different method

**Step 1: Import the new function and add state**

At the top of `payrollPage.tsx`, add `getExpectedPaymentMethod` to the import from `@/server/actions/payroll`.

Also import the `PAYROLL_PAYMENT_METHOD_COLORS` from `@/utils/types/payment`:

```typescript
import { PAYROLL_PAYMENT_METHOD_COLORS, getPayrollPaymentMethodLabel } from '@/utils/types/payment'
```

**Step 2: Modify `CompletePaymentModal` to accept and use expected method**

Replace the current `CompletePaymentModal` component (starting at line ~1707) with:

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
    const [expectedMethod, setExpectedMethod] = useState<string | null>(null)
    const [methodBreakdown, setMethodBreakdown] = useState<{ method: string; count: number; total: number }[]>([])
    const [showWarning, setShowWarning] = useState(false)
    const [confirmedAlternative, setConfirmedAlternative] = useState(false)

    useEffect(() => {
        const fetchExpected = async () => {
            const result = await getExpectedPaymentMethod(request.id)
            if (result.success && result.data) {
                setExpectedMethod(result.data.method)
                setMethodBreakdown(result.data.breakdown)
                if (result.data.method) {
                    const normalized = normalizePayrollMethod(result.data.method)
                    setSelectedMethod(normalized as PaymentMethod)
                }
            }
        }
        fetchExpected()
    }, [request.id])

    const normalizePayrollMethod = (method: string): string => {
        if (method === 'BANK') return 'BANK_TRANSFER'
        if (method === 'SPLIT') return 'CASH'
        if (method === 'UNKNOWN') return 'CASH'
        return method
    }

    const handleMethodSelect = (method: PaymentMethod) => {
        setSelectedMethod(method)
        if (expectedMethod && method !== normalizePayrollMethod(expectedMethod)) {
            setShowWarning(true)
            setConfirmedAlternative(false)
        } else {
            setShowWarning(false)
            setConfirmedAlternative(false)
        }
    }

    const handleConfirm = async () => {
        if (!selectedMethod) return
        if (showWarning && !confirmedAlternative) {
            setConfirmedAlternative(true)
            return
        }
        setLoading(true)
        await onComplete(selectedMethod, referenceNumber || undefined, proofFile)
        setLoading(false)
    }

    const primaryMethod = expectedMethod ? normalizePayrollMethod(expectedMethod) as PaymentMethod : null
    const alternativeMethods = PAYMENT_METHODS.filter(
        m => !primaryMethod || m.key !== primaryMethod
    )

    // ... rest of the component renders below
```

**Step 3: Redesign the payment method selection UI in Step 2 of the modal**

Replace the current payment method grid in the `'pay'` step with a smart layout:

```tsx
) : (
    <div className='space-y-4'>
        {/* Primary/Expected Method */}
        {primaryMethod && (
            <div>
                <p className='text-sm font-medium mb-2 text-green-400'>
                    Suggested payment method (based on sales)
                </p>
                <button
                    onClick={() => handleMethodSelect(primaryMethod)}
                    className={`w-full p-4 rounded-lg transition-colors text-center border-2 ${
                        selectedMethod === primaryMethod
                            ? 'bg-green-500/20 border-green-500/50 text-green-300'
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                >
                    <div className='flex items-center justify-center gap-3'>
                        <span className='text-lg font-bold'>
                            {PAYMENT_METHODS.find(m => m.key === primaryMethod)?.label || primaryMethod}
                        </span>
                        {selectedMethod === primaryMethod && (
                            <CheckIcon className='w-5 h-5 text-green-400' />
                        )}
                    </div>
                    {methodBreakdown.length > 0 && (
                        <p className='text-xs text-white/50 mt-1'>
                            {methodBreakdown.find(b => normalizePayrollMethod(b.method) === primaryMethod)?.count || 0} service(s) • {currencySymbol}{(methodBreakdown.find(b => normalizePayrollMethod(b.method) === primaryMethod)?.total || 0).toFixed(2)}
                        </p>
                    )}
                </button>
            </div>
        )}

        {/* Divider */}
        {primaryMethod && (
            <div className='relative'>
                <div className='absolute inset-0 flex items-center'>
                    <div className='w-full border-t border-white/10' />
                </div>
                <div className='relative flex justify-center text-xs'>
                    <span className='px-2 bg-zinc-900 text-red-400'>
                        Select Alternative Method
                    </span>
                </div>
            </div>
        )}

        {/* Warning when selecting alternative */}
        {showWarning && selectedMethod && selectedMethod !== primaryMethod && (
            <div className='bg-red-500/10 border border-red-500/30 rounded-lg p-3'>
                <p className='text-sm text-red-300'>
                    ⚠️ The original sale was paid via <strong>{PAYROLL_METHODS.find(m => m.key === primaryMethod)?.label}</strong>.
                    Disbursing via <strong>{PAYMENT_METHODS.find(m => m.key === selectedMethod)?.label}</strong> may cause accounting discrepancies.
                </p>
                {!confirmedAlternative && (
                    <button
                        onClick={() => setConfirmedAlternative(true)}
                        className='mt-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs font-medium'
                    >
                        I understand, proceed with {PAYMENT_METHODS.find(m => m.key === selectedMethod)?.label}
                    </button>
                )}
                {confirmedAlternative && (
                    <p className='text-xs text-red-400 mt-1'>Alternative method confirmed.</p>
                )}
            </div>
        )}

        {/* Alternative Methods */}
        {primaryMethod ? (
            <div className='grid grid-cols-2 gap-2'>
                {alternativeMethods.map((method) => (
                    <button
                        key={method.key}
                        onClick={() => handleMethodSelect(method.key)}
                        className={`p-2 rounded-lg transition-colors text-center text-xs border ${
                            selectedMethod === method.key
                                ? 'bg-white/10 border-white/30 text-white'
                                : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/60'
                        }`}
                    >
                        {method.label}
                    </button>
                ))}
            </div>
        ) : (
            <div>
                <p className='text-sm font-medium mb-2'>Select payment method:</p>
                <div className='grid grid-cols-2 gap-2'>
                    {PAYMENT_METHODS.map((method) => (
                        <button
                            key={method.key}
                            onClick={() => setSelectedMethod(method.key)}
                            className={`p-3 rounded-lg transition-colors text-center text-sm border ${
                                selectedMethod === method.key
                                    ? 'bg-green-500/20 border-green-500/40 text-green-300'
                                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                            }`}
                        >
                            {method.label}
                        </button>
                    ))}
                </div>
            </div>
        )}

        {/* Reference & Proof (unchanged) */}
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
                disabled={loading || !selectedMethod || (showWarning && !confirmedAlternative)}
                className='flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-md transition-colors font-medium text-sm'
            >
                {loading ? 'Processing...' : 'Complete Payment'}
            </button>
        </div>
    </div>
)
```

**Step 4: Commit**

```bash
git add app/payroll/payrollPage.tsx server/actions/payroll.ts
git commit -m "feat(payroll): smart payment method selection with expected method and alternative warning"
```

### Task 5: Update Staggered Payment Modal with Smart Defaults

**Files:**
- Modify: `app/payroll/payrollPage.tsx`

**Context:** The `StaggeredPaymentModal` (around line 1839-2092) defaults new lines to `'CASH'`. We should default to the expected payment method instead. Each line should also show the warning if alternative to expected.

**Step 1: Add `expectedMethod` prop to `StaggeredPaymentModal`**

Update the component signature (line ~1839) to accept:

```typescript
function StaggeredPaymentModal({
    request,
    currencySymbol,
    existingDisbursements,
    expectedMethod,
    onClose,
    onComplete,
}: {
    request: PayrollRequest
    currencySymbol: string
    existingDisbursements: import("@/utils/types/payroll").PayrollDisbursement[]
    expectedMethod: string | null
    onClose: () => void
    onComplete: () => void
})
```

**Step 2: Default new lines to expected method instead of CASH**

Change the `addLine` function (around line 1862):

```typescript
const addLine = () => {
    const defaultMethod = expectedMethod
        ? (expectedMethod === 'BANK' ? 'BANK_TRANSFER' : expectedMethod === 'SPLIT' ? 'CASH' : expectedMethod)
        : 'CASH'
    setLines([...lines, { amount: 0, method: defaultMethod as PaymentMethod, ref: '', notes: '' }])
}
```

**Step 3: Update `handleOpenStaggeredPayment` to pass expected method**

Find where `handleOpenStaggeredPayment` is called (around line 508) and update to fetch expected method:

```typescript
const handleOpenStaggeredPayment = async (request: PayrollRequest) => {
    setStaggeredPaymentRequest(request)
    const result = await getExpectedPaymentMethod(request.id)
    const expected = result.success ? result.data?.method : null
    setStaggeredExpectedMethod(expected)
    // Also fetch existing disbursements
    const { getDisbursements } = await import('@/server/actions/payroll-disbursements')
    const disbResult = await getDisbursements(request.id)
    if (disbResult.success) {
        setRequestDisbursements(disbResult.data)
    }
}
```

Add state for expected method:

```typescript
const [staggeredExpectedMethod, setStaggeredExpectedMethod] = useState<string | null>(null)
```

**Step 4: Pass expected method to StaggeredPaymentModal**

In the modal render (around line 760-776), pass `expectedMethod={staggeredExpectedMethod}`:

```tsx
<StaggeredPaymentModal
    request={staggeredPaymentRequest}
    currencySymbol={currencySymbol}
    existingDisbursements={requestDisbursements}
    expectedMethod={staggeredExpectedMethod}
    onClose={() => {
        setStaggeredPaymentRequest(null)
        setRequestDisbursements([])
        setStaggeredExpectedMethod(null)
    }}
    onComplete={() => {
        setStaggeredPaymentRequest(null)
        setRequestDisbursements([])
        setStaggeredExpectedMethod(null)
        fetchData()
    }}
/>
```

**Step 5: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "feat(payroll): smart defaults in staggered payment modal based on expected method"
```

---

## Phase 5: Accounting Auto-Entry Fixes (Task 6)

### Task 6: Per-Disbursement Accounting Entries & Fix `completePayrollRequest`

**Files:**
- Modify: `server/actions/payroll.ts`
- Modify: `server/actions/payroll-disbursements.ts`

**Context:** Currently, `completePayrollRequest` creates a single accounting entry using the request-level `payment_method`. For staggered payments with multiple methods, each disbursement should create its own accounting entry. Also, the single-flow `completePayrollRequest` should derive its payment method from the expected method if available.

**Step 1: Update `completePayrollRequest` in `server/actions/payroll.ts`**

The accounting entry section (around line 1274-1297) needs to be updated to support the expected method. Additionally, the single-payment flow should still create one entry, but using the provided method:

The current code creates an EXPENSE entry with `payment_method: mapPayrollToAccountingPaymentMethod(payload.payment_method)`. This is correct for single-payment flows. No change needed here.

**Step 2: Update `createDisbursement` in `server/actions/payroll-disbursements.ts`**

After a disbursement is created and the request may be marked COMPLETED (around line 89-117), add per-disbursement accounting entry creation:

After the existing `createLogs` block (line 119), add:

```typescript
// Create accounting entry for this disbursement
if (newDisbursed >= totalArtistCut) {
    // Request is now fully completed - the single accounting entry
    // from completePayrollRequest already handles this case
} else {
    // Partial disbursement - create accounting entry for this portion
    try {
        const { createAutoLedgerEntry } = await import('./accounting')
        const { mapPayrollToAccountingPaymentMethod } = await import('@/utils/types/payment')
        
        // Get staff name for the ledger entry
        const [staffUser] = await db
            .select({ fullName: user.fullName })
            .from(user)
            .where(eq(user.id, request.staffId))
            .limit(1)
        const staffName = staffUser?.fullName || 'Unknown Staff'

        // Get branch_id from the first payroll entry's transaction
        const [payrollEntryWithBranch] = await db
            .select({ branchId: transactions.branchId })
            .from(payrollEntry)
            .innerJoin(transactions, eq(payrollEntry.transactionId, transactions.id))
            .where(eq(payrollEntry.payrollRequestId, payload.request_id))
            .limit(1)

        await createAutoLedgerEntry('PAYROLL', disbursement.id, {
            entry_date: new Date(),
            entry_type: 'EXPENSE',
            category: 'PAYROLL',
            description: `Payroll partial disbursement - Staff: ${staffName} - ${payload.payment_method}`,
            reference: `PAYROLL-DISB-${disbursement.id.slice(0, 8)}`,
            debit: payload.amount,
            credit: 0,
            branch_id: payrollEntryWithBranch?.branchId || null,
            payment_method: mapPayrollToAccountingPaymentMethod(payload.payment_method),
        }, currentUser.id)
    } catch (accountingError) {
        await logError({
            type: 'ACCOUNTING',
            message: `Failed to create accounting entry for disbursement ${disbursement.id}: ${accountingError instanceof Error ? accountingError.message : String(accountingError)}`
        })
        // Don't fail the disbursement - accounting is best-effort
    }
}
```

Add missing imports at the top of the file:

```typescript
import { transactions } from '@/server/db/schema/transactions'
```

And update the import from payroll schema:

```typescript
import { payrollDisbursement, payrollRequest, payrollEntry, user, transactions } from '@/server/db/schema'
```

Note: We also need to ensure the `transactions` import works. Check the current schema exports to confirm.

**Step 3: Commit**

```bash
git add server/actions/payroll.ts server/actions/payroll-disbursements.ts
git commit -m "feat: add per-disbursement accounting entries for staggered payments"
```

---

## Phase 6: Fix SPLIT Payment & Normalize BANK (Task 7)

### Task 7: Handle SPLIT Payment Method & Normalize Legacy BANK Values

**Files:**
- Modify: `server/actions/payroll.ts`
- Modify: `utils/types/payment.ts`

**Context:** When a transaction uses SPLIT payment, `mapTransactionToAccountingPaymentMethod` returns `undefined`. We need to handle this in payroll by deriving the primary method from split payments. Also, legacy `BANK` values in the DB should be normalized to `BANK_TRANSFER` on reads.

**Step 1: Add SPLIT payment handling in `utils/types/payment.ts`**

Update `mapTransactionToAccountingPaymentMethod` to return a sensible default for SPLIT:

```typescript
export function mapTransactionToAccountingPaymentMethod(method: string | null | undefined): AccountingPaymentMethod | undefined {
    if (!method) return undefined
    switch (method) {
        case 'CASH': return 'CASH'
        case 'CARD': return 'CARD'
        case 'GCASH': return 'GCASH'
        case 'BANK_TRANSFER': return 'BANK_TRANSFER'
        case 'SPLIT': return undefined // SPLIT payments need per-payment resolution
        default: return undefined
    }
}

/**
 * Derive the primary payment method from a SPLIT transaction's payments.
 * Returns the method of the largest payment amount.
 */
export function derivePrimaryPaymentMethod(
    payments: { payment_method: string; amount: number }[]
): string {
    if (!payments || payments.length === 0) return 'CASH'
    const largest = payments.reduce((prev, curr) =>
        curr.amount > prev.amount ? curr : prev, payments[0])
    return largest.payment_method
}
```

**Step 2: Normalize `BANK` → `BANK_TRANSFER` consistently**

The `normalizePayrollPaymentMethod` function in `payroll.ts` is already correct (line 51-53). Make sure all read paths use it. Check `getPayrollRequests` mapping (around line 883) — it already uses this function:

```typescript
payment_method: (normalizePayrollPaymentMethod(request.paymentMethod || '') as PaymentMethod) || undefined,
```

This is correct. For `payrollEntry.paymentMethod`, add normalization in the mapping functions too. In `getPayrollEntries`, `getPendingEntries`, and `getPayrollEntriesByRequest`, replace:

```typescript
payment_method: entry.paymentMethod || undefined,
```

With:

```typescript
payment_method: (entry.paymentMethod ? normalizePayrollPaymentMethod(entry.paymentMethod) : undefined) as string | undefined,
```

**Step 3: Handle BANK values in the migration (data migration)**

Add a comment in the migration file (or create a small utility) to update existing `BANK` values:

```sql
-- Normalize legacy BANK values to BANK_TRANSFER
UPDATE payroll_request SET payment_method = 'BANK_TRANSFER' WHERE payment_method = 'BANK';
UPDATE payroll_disbursement SET payment_method = 'BANK_TRANSFER' WHERE payment_method = 'BANK';
-- payroll_entry.payment_method is new (nullable), no migration needed
```

This can be run as a one-time migration. Include it in the migration file generated in Task 1.

**Step 4: Commit**

```bash
git add utils/types/payment.ts server/actions/payroll.ts
git commit -m "feat: add SPLIT payment derivation and normalize legacy BANK values"
```

---

## Phase 7: Lint & Build Fix (Task 8)

### Task 8: Fix All Lint and Build Errors

**Files:**
- Any files with lint errors

**Step 1: Run ESLint**

```bash
bun run lint
```

**Step 2: Fix all lint errors and warnings**

Common issues to check:
- Unused imports (especially after refactoring)
- Type mismatches (especially `PaymentMethod` vs `PayrollPaymentMethod` vs `TransactionPaymentMethod`)
- Missing `normalizePayrollPaymentMethod` import in files that need it
- Any `BANK` references that should be `BANK_TRANSFER`

**Step 3: Run TypeScript type check**

```bash
bun run build 2>&1 | head -100
```

**Step 4: Fix any type errors**

Key areas to check:
- `PayrollEntry` type now includes `payment_method?: string`
- `completePayrollRequest` signature changes
- `CompletePaymentModal` and `StaggeredPaymentModal` prop changes
- Import paths for new functions

**Step 5: Verify the app starts**

```bash
bun run dev &
sleep 10
curl -s http://localhost:3000 | head -20
kill %1 2>/dev/null
```

**Step 6: Commit**

```bash
git add -A
git commit -m "fix: resolve lint and build errors from payroll payment method changes"
```

---

## Summary of Recommendations

1. **Always default to the sale's payment method** — The user's request is clear: if a customer paid in cash, the staff should be paid in cash unless there's a good reason to do otherwise. This is now implemented via the expected method derivation.

2. **Warn but don't block** — When the user selects an alternative method, we show a warning but allow it after confirmation. This is a reasonable UX: guide without blocking.

3. **Accounting integrity** — Each disbursement method gets its own accounting entry with the correct payment method. This ensures the books balance per method.

4. **SPLIT payment handling** — For split payments, we derive the primary (largest) method. This is a heuristic; the admin can always override in the UI.

5. **Legacy BANK → BANK_TRANSFER** — The migration normalizes existing `BANK` values. New code always writes `BANK_TRANSFER`. Reads normalize via `normalizePayrollPaymentMethod`.

6. **Future improvement**: Consider allowing staff to set preferred payment methods per transaction type. This would allow configuration like "staff prefers GCash for tattoo payments even when customer pays cash". This is beyond the current scope but worth noting.