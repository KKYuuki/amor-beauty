# Payroll Disbursement & Request Flow Revamp Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Revamp the payroll disbursement flow to auto-set payment methods based on original sales transactions, fix the admin request flow logic so "Complete" only shows for confirmed requests, improve modal organization, and align staff My Payroll page with the same logic.

**Architecture:** The disbursement modal currently uses a generic "Select Payment Method" grid. We redesign it to auto-select and prominently display the dominant payment method from the original sales, with alternatives grouped below. The admin RequestsTab is refactored to only show contextually appropriate actions per status. Modals are extracted into a dedicated directory for better organization. The staff My Payroll page is updated with disbursement details, status-aware UI, and consistent request/badge logic.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Drizzle ORM, Supabase

---

## Task 1: Update Disbursement Modal — Auto-Set Payment Method Based on Original Sale

**Files:**
- Modify: `app/payroll/payrollPage.tsx` (CompletePaymentModal, ~lines 1720-1982)
- Modify: `utils/types/payment.ts` (add helper function for grouped method display)

**Current Problem:** The CompletePaymentModal displays all 6 payment methods in a flat grid with the "suggested" method shown above a "Select Alternative Method" divider. Alternatives are listed in a flat 2-column grid with no logical grouping.

**Target Behavior:**
- The dominant payment method (derived from `getExpectedPaymentMethod()`) is auto-selected and shown as the **Default** option with a prominent "Default" badge
- Alternative methods are grouped into logical categories:
  - **Digital Wallets**: GCash, Maya
  - **Bank/Card**: Bank Transfer / QR, Card
  - **Other**: Crypto
  - Cash alternatives shown only if the default is not Cash
- When the original sale was paid via Cash, the modal shows "Cash (Default)" prominently, then "--- Select Alternative Method ---" divider, then grouped alternatives (GCash | Bank Transfer/QR in one row, Card | Crypto in another)
- When the original sale was paid via Card, the modal shows "Card (Default)" prominently, then alternatives grouped (Cash | GCash, Bank Transfer/QR | Crypto)
- The warning about accounting discrepancies remains but is refined

**Step 1: Add payment method grouping utility to `utils/types/payment.ts`**

Add a new helper function and group definitions after the existing `mapPayrollToAccountingPaymentMethod` function:

```typescript
export const PAYMENT_METHOD_GROUPS: { label: string; methods: PaymentMethod[] }[] = [
    { label: 'Digital Wallets', methods: ['GCASH', 'MAYA'] },
    { label: 'Bank & Card', methods: ['BANK_TRANSFER', 'CARD'] },
    { label: 'Other', methods: ['CRYPTO'] },
]

export function getAlternativeMethodGroups(
    defaultMethod: PaymentMethod
): { label: string; methods: { key: PaymentMethod; label: string }[] }[] {
    const allMethods = PAYMENT_PAYMENT_METHODS.filter(m => m.key !== defaultMethod)
    const groups: { label: string; methods: { key: PaymentMethod; label: string }[] }[] = []

    // Cash is always a standalone alternative if not default
    if (defaultMethod !== 'CASH') {
        groups.push({
            label: 'Cash',
            methods: [{ key: 'CASH', label: 'Cash' }],
        })
    }

    // Digital wallets
    const wallets = allMethods.filter(m =>
        m.key === 'GCASH' || m.key === 'MAYA'
    )
    if (wallets.length > 0) {
        groups.push({
            label: 'Digital Wallets',
            methods: wallets.map(m => ({ key: m.key, label: m.label })),
        })
    }

    // Bank & Card
    const bankCard = allMethods.filter(m =>
        m.key === 'BANK_TRANSFER' || m.key === 'CARD'
    )
    if (bankCard.length > 0) {
        groups.push({
            label: 'Bank & Card',
            methods: bankCard.map(m => ({ key: m.key, label: m.label })),
        })
    }

    // Crypto
    const crypto = allMethods.filter(m => m.key === 'CRYPTO')
    if (crypto.length > 0) {
        groups.push({
            label: 'Other',
            methods: crypto.map(m => ({ key: m.key, label: m.label })),
        })
    }

    return groups
}
```

**Step 2: Import the new helper in `app/payroll/payrollPage.tsx`**

Add to the imports from `@/utils/types/payment`:

```typescript
import { getAlternativeMethodGroups, PAYMENT_PAYMENT_METHODS } from "@/utils/types/payment"
```

Remove the local `PAYMENT_METHODS` constant (lines 64-71) since we'll use `PAYROLL_PAYMENT_METHODS` from the shared types.

**Step 3: Redesign the CompletePaymentModal UI**

Replace the alternative methods section (lines ~1836-1938) with the new grouped layout. The key changes:

1. Default method shown prominently with a "Default" badge and checkmark indicator
2. "--- Select Alternative Method ---" divider with a warning icon (⚠️) in amber/orange instead of red
3. Grouped alternatives with section headers
4. Selected alternative shown with green highlight matching current styling
5. Accounting discrepancy warning only shows when an alternative different from the original is selected and confirmed

The redesigned "pay" step JSX (replacing lines ~1836-1976):

```tsx
<div className='space-y-4'>
    {/* Default Method */}
    {primaryMethod && (
        <div>
            <p className='text-xs font-semibold mb-2 uppercase tracking-wider text-green-400'>
                Payment Method
            </p>
            <button
                onClick={() => handleMethodSelect(primaryMethod)}
                className={`w-full p-4 rounded-lg transition-colors text-left border-2 ${
                    selectedMethod === primaryMethod
                        ? 'bg-green-500/20 border-green-500/50 text-green-300'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
            >
                <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-3'>
                        <div className='w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center'>
                            {PAYMENT_PAYMENT_METHODS.find(m => m.key === primaryMethod)?.icon
                                ? (() => {
                                    const IconComp = PAYMENT_PAYMENT_METHODS.find(m => m.key === primaryMethod)!.icon
                                    return <IconComp className='w-4 h-4 text-green-400' />
                                })()
                                : <BanknoteIcon className='w-4 h-4 text-green-400' />
                            }
                        </div>
                        <span className='text-lg font-bold'>
                            {PAYMENT_PAYMENT_METHODS.find(m => m.key === primaryMethod)?.label || primaryMethod}
                        </span>
                    </div>
                    <div className='flex items-center gap-2'>
                        <span className='text-xs px-2 py-0.5 rounded bg-green-500/30 text-green-300 font-medium'>
                            Default
                        </span>
                        {selectedMethod === primaryMethod && (
                            <CheckIcon className='w-5 h-5 text-green-400' />
                        )}
                    </div>
                </div>
                {methodBreakdown.length > 0 && (
                    <p className='text-xs text-white/50 mt-2 ml-11'>
                        {methodBreakdown.find(b => normalizePayrollMethod(b.method) === primaryMethod)?.count || 0} service(s)
                        &nbsp;·&nbsp;
                        {currencySymbol}{(methodBreakdown.find(b => normalizePayrollMethod(b.method) === primaryMethod)?.total || 0).toFixed(2)}
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
                <span className='px-2 bg-zinc-900 text-amber-400 flex items-center gap-1'>
                    <span>⚠</span> Select Alternative Method
                </span>
            </div>
        </div>
    )}

    {/* Warning when selecting alternative */}
    {showWarning && selectedMethod && selectedMethod !== primaryMethod && (
        <div className='bg-amber-500/10 border border-amber-500/30 rounded-lg p-3'>
            <p className='text-sm text-amber-300'>
                The original sale was paid via <strong>{PAYMENT_PAYMENT_METHODS.find(m => m.key === primaryMethod)?.label}</strong>.
                Disbursing via <strong>{PAYMENT_PAYMENT_METHODS.find(m => m.key === selectedMethod)?.label}</strong> may cause accounting discrepancies.
            </p>
            {!confirmedAlternative && (
                <button
                    onClick={() => setConfirmedAlternative(true)}
                    className='mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 rounded text-xs font-medium'
                >
                    I understand, proceed with {PAYMENT_PAYMENT_METHODS.find(m => m.key === selectedMethod)?.label}
                </button>
            )}
            {confirmedAlternative && (
                <p className='text-xs text-amber-400 mt-1'>Alternative method confirmed.</p>
            )}
        </div>
    )}

    {/* Alternative Methods — Grouped */}
    {primaryMethod ? (
        <div className='space-y-3'>
            {getAlternativeMethodGroups(primaryMethod).map(group => (
                <div key={group.label}>
                    <p className='text-xs text-white/40 mb-1 uppercase tracking-wider'>
                        {group.label}
                    </p>
                    <div className={`grid ${
                        group.methods.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                    } gap-2`}>
                        {group.methods.map((method) => (
                            <button
                                key={method.key}
                                onClick={() => handleMethodSelect(method.key)}
                                className={`p-3 rounded-lg transition-colors text-center text-sm border ${
                                    selectedMethod === method.key
                                        ? 'bg-green-500/20 border-green-500/40 text-green-300'
                                        : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/60'
                                }`}
                            >
                                {method.label}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    ) : (
        <div>
            <p className='text-sm font-medium mb-2'>Select payment method:</p>
            <div className='grid grid-cols-2 gap-2'>
                {PAYMENT_PAYMENT_METHODS.map((method) => (
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

    {/* Reference & Proof — unchanged from current */}
    ...
</div>
```

**Step 4: Update `normalizePayrollMethod` to be importable**

Currently the function is inside the component. Move it to `utils/types/payment.ts` as an exported function so both payrollPage and myPayrollPage can use it:

```typescript
export function normalizePayrollMethod(method: string): string {
    if (method === 'BANK') return 'BANK_TRANSFER'
    if (method === 'SPLIT') return 'CASH'
    if (method === 'UNKNOWN') return 'CASH'
    return method
}
```

**Step 5: Update imports in CompletePaymentModal**

Replace the local `PAYMENT_METHODS` constant with imports from `@/utils/types/payment`:

```typescript
import {
    normalizePayrollMethod,
    getAlternativeMethodGroups,
    PAYMENT_PAYMENT_METHODS,
} from "@/utils/types/payment"
```

And update all references from `PAYMENT_METHODS` to `PAYROLL_PAYMENT_METHODS` in the modal.

**Step 6: Verify no other code uses the local `PAYMENT_METHODS` constant**

Search the file for any remaining `PAYMENT_METHODS` references and update them. This constant is only used in the CompletePaymentModal and StaggeredPaymentModal, so updating both is sufficient.

**Step 7: Also update StaggeredPaymentModal's addLine default method logic**

In `StaggeredPaymentModal` (line ~2014), the `addLine` function currently normalizes `expectedMethod` inline. Update it to use `normalizePayrollMethod`:

```typescript
const addLine = () => {
    const defaultMethod = normalizePayrollMethod(expectedMethod || 'CASH') as PaymentMethod
    setLines([...lines, { amount: 0, method: defaultMethod, ref: '', notes: '' }])
}
```

**Step 8: Run lint check**

Run: `bun run lint`
Expected: No new errors

---

## Task 2: Fix Admin RequestsTab — Context-Aware Action Buttons

**Files:**
- Modify: `app/payroll/payrollPage.tsx` (RequestsTab component, ~lines 1361-1599)

**Current Problem:** The RequestsTab shows a "Complete" button for both REQUESTED and CONFIRMED statuses. A REQUESTED request hasn't been confirmed yet, so showing "Complete" is illogical — the admin should first confirm, then disburse. Currently, the flow shows:
- REQUESTED: "Confirm & Pay" + "Complete" + "Cancel" (Complete makes no sense here)
- CONFIRMED: "Complete" + "Cancel" + "Staggered Pay"

**Target Behavior:**

For **REQUESTED** status requests:
- "Confirm & Pay" (existing, stepped flow: confirm → disburse)
- "Confirm Only" (new — just confirm, no immediate disbursement)
- "Cancel"

For **CONFIRMED** status requests:
- "Disburse" (renamed from "Complete" — more accurate terminology)
- "Staggered Pay" (existing)
- "Cancel"

For **COMPLETED** status requests:
- Show payment details (existing)
- Show disbursement history if staggered payments exist

**Step 1: Update RequestsTab to show context-aware actions**

Replace the actions section (~lines 1514-1568) in the request card:

```tsx
{(request.status === "REQUESTED" || request.status === "CONFIRMED") && (
    <div className='flex flex-wrap gap-2 mt-2 pt-2 border-t border-white/10'>
        {request.status === "REQUESTED" && (
            <>
                <AdminActionGuard
                    onAction={() => onConfirmAndDisburse(request)}
                >
                    <button className='flex items-center gap-1 px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded transition-colors text-xs'>
                        <CheckIcon className='w-3 h-3' />
                        Confirm & Pay
                    </button>
                </AdminActionGuard>
                <AdminActionGuard
                    onAction={() => _onConfirm(request)}
                >
                    <button className='flex items-center gap-1 px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded transition-colors text-xs border border-blue-500/20'>
                        <CheckIcon className='w-3 h-3' />
                        Confirm Only
                    </button>
                </AdminActionGuard>
                <AdminActionGuard
                    onAction={() => onCancel(request)}
                >
                    <button className='flex items-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors text-xs'>
                        <XCircleIcon className='w-3 h-3' />
                        Cancel
                    </button>
                </AdminActionGuard>
            </>
        )}
        {request.status === "CONFIRMED" && (
            <>
                <AdminActionGuard
                    onAction={() => onComplete(request)}
                >
                    <button className='flex items-center gap-1 px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded transition-colors text-xs'>
                        <BanknoteIcon className='w-3 h-3' />
                        Disburse
                    </button>
                </AdminActionGuard>
                <AdminActionGuard
                    onAction={() => onStaggeredPayment(request)}
                >
                    <button className='flex items-center gap-1 px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded transition-colors text-xs'>
                        <BanknoteIcon className='w-3 h-3' />
                        Staggered Pay
                    </button>
                </AdminActionGuard>
                <AdminActionGuard
                    onAction={() => onCancel(request)}
                >
                    <button className='flex items-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors text-xs'>
                        <XCircleIcon className='w-3 h-3' />
                        Cancel
                    </button>
                </AdminActionGuard>
            </>
        )}
    </div>
)}
```

**Step 2: Wire up `_onConfirm` prop to `handleConfirmRequest`**

The `RequestsTab` already receives `onConfirm` as a prop (named `_onConfirm` in the component signature). Verify that `onConfirm` is passed through from the parent `PayrollPageClient` component. In the parent, `handleConfirmRequest` already exists and calls `confirmPayrollRequest`. Wire it up:

In the `<RequestsTab>` JSX (~line 704), ensure `onConfirm` is passed:

```tsx
<RequestsTab
    requests={requests}
    filter={requestFilter}
    onFilterChange={setRequestFilter}
    currencySymbol={currencySymbol}
    onConfirm={handleConfirmRequest}
    onConfirmAndDisburse={async (request) => {
        setConfirmAndDisburseRequest(request)
        setConfirmStep('confirm')
    }}
    onComplete={setProcessingRequest}
    onCancel={setCancellingRequest}
    onStaggeredPayment={handleOpenStaggeredPayment}
/>
```

This is already correct in the current code. No change needed for the prop wiring.

**Step 3: Run lint check**

Run: `bun run lint`
Expected: No new errors

---

## Task 3: Add Disbursement History to Completed Requests

**Files:**
- Modify: `app/payroll/payrollPage.tsx` (RequestsTab, the COMPLETED status section)

**Current Problem:** Completed requests show a simple "Paid via METHOD on DATE" line. If the request was paid through staggered disbursements, there's no visibility into the individual payments.

**Target Behavior:** For COMPLETED requests, show:
- Payment method badge with color
- Completion date
- Reference number (if any)
- Proof link (if any)
- If disbursements exist, show a collapsible "View Disbursements" section with a table of individual payments

**Step 1: Add disbursements fetching to the PayrollPageClient state**

Add state to track fetched disbursements per request:

```typescript
const [requestDisbursementsMap, setRequestDisbursementsMap] = useState<Record<string, PayrollDisbursement[]>>({})
const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null)
```

**Step 2: Add a function to fetch disbursements for a request**

```typescript
const handleViewDisbursements = async (requestId: string) => {
    if (expandedRequestId === requestId) {
        setExpandedRequestId(null)
        return
    }
    const { getDisbursements } = await import('@/server/actions/payroll-disbursements')
    const result = await getDisbursements(requestId)
    if (result.success) {
        setRequestDisbursementsMap(prev => ({ ...prev, [requestId]: result.data }))
    }
    setExpandedRequestId(requestId)
}
```

**Step 3: Update the COMPLETED status section in RequestsTab**

Add a new prop `onViewDisbursements` and `expandedRequestId` and `requestDisbursementsMap` to the RequestsTab. In the COMPLETED section of the request card, replace the simple "Paid via..." with:

```tsx
{request.status === "COMPLETED" && request.payment_method && (
    <div className='mt-2 pt-2 border-t border-white/10'>
        <div className='flex items-center gap-2'>
            <span className={`text-xs px-2 py-0.5 rounded border ${PAYROLL_PAYMENT_METHOD_COLORS[request.payment_method] || 'bg-white/10 text-white/60 border-white/10'}`}>
                {getPayrollPaymentMethodLabel(request.payment_method)}
            </span>
            <span className='text-xs text-white/50'>
                Completed {request.completed_at ? new Date(request.completed_at).toLocaleDateString() : ''}
            </span>
            {request.reference_number && (
                <span className='text-xs font-mono text-white/70'>
                    Ref: {request.reference_number}
                </span>
            )}
            {request.proof_url && (
                <a
                    href={request.proof_url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300'
                >
                    <PaperclipIcon className='w-3 h-3' />
                    Proof
                </a>
            )}
        </div>
        <button
            onClick={() => onViewDisbursements(request.id)}
            className='mt-1 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1'
        >
            {expandedRequestId === request.id ? 'Hide' : 'View'} Disbursements
        </button>
        {expandedRequestId === request.id && requestDisbursementsMap[request.id] && (
            <div className='mt-2 space-y-1'>
                {requestDisbursementsMap[request.id].map(d => (
                    <div key={d.id} className='flex items-center justify-between text-xs bg-white/5 rounded p-2'>
                        <div className='flex items-center gap-2'>
                            <span className={`px-1.5 py-0.5 rounded ${PAYROLL_PAYMENT_METHOD_COLORS[d.payment_method] || 'bg-white/10 text-white/60'}`}>
                                {getPayrollPaymentMethodLabel(d.payment_method)}
                            </span>
                            <span className='text-white/70'>
                                {currencySymbol}{Number(d.amount).toFixed(2)}
                            </span>
                        </div>
                        <div className='text-white/50'>
                            {d.reference_number && <span className='font-mono mr-2'>Ref: {d.reference_number}</span>}
                            {new Date(d.completed_at!).toLocaleDateString()}
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
)}
```

**Step 4: Add required imports**

Add to the imports at the top of `payrollPage.tsx`:

```typescript
import { getPayrollPaymentMethodLabel, PAYROLL_PAYMENT_METHOD_COLORS } from "@/utils/types/payment"
```

**Step 5: Run lint check**

Run: `bun run lint`
Expected: No new errors

---

## Task 4: Extract Modals to Separate Component Files

**Files:**
- Create: `app/payroll/modals/CompletePaymentModal.tsx`
- Create: `app/payroll/modals/StaggeredPaymentModal.tsx`
- Create: `app/payroll/modals/ConfirmRequestModal.tsx`
- Create: `app/payroll/modals/CancelRequestModal.tsx`
- Create: `app/payroll/modals/ManualPayrollEntryModal.tsx`
- Create: `app/payroll/modals/EditRateModal.tsx`
- Create: `app/payroll/modals/CreateRateModal.tsx`
- Create: `app/payroll/modals/CreateDeductionModal.tsx`
- Create: `app/payroll/modals/CancelDeductionModal.tsx`
- Create: `app/payroll/modals/CreateScheduledPaymentModal.tsx`
- Create: `app/payroll/modals/CancelScheduledModal.tsx`
- Create: `app/payroll/modals/StaffRequestModal.tsx`
- Modify: `app/payroll/payrollPage.tsx` (import extracted modals, remove inline definitions)

**Current Problem:** The `payrollPage.tsx` file is ~3,447 lines long because all 13+ modals are defined inline. This makes the file very hard to navigate and maintain.

**Target Behavior:** Each modal is extracted into its own file in `app/payroll/modals/`. The main page component imports them and remains focused on layout and state management.

**Step 1: Create the modals directory**

```bash
mkdir -p app/payroll/modals
```

**Step 2: Extract CompletePaymentModal**

Move the `CompletePaymentModal` function (lines ~1720-1982) into `app/payroll/modals/CompletePaymentModal.tsx`. The component needs these props:

```typescript
interface CompletePaymentModalProps {
    request: PayrollRequest
    currencySymbol: string
    onClose: () => void
    onComplete: (method: PaymentMethod, referenceNumber?: string, proofFile?: File | null) => void
}
```

Add all necessary imports at the top of the new file.

**Step 3: Extract StaggeredPaymentModal**

Move the `StaggeredPaymentModal` function (lines ~1988-2246) into `app/payroll/modals/StaggeredPaymentModal.tsx`.

**Step 4: Extract remaining modals**

Extract each of the remaining modals:
- `ConfirmRequestModal` → `app/payroll/modals/ConfirmRequestModal.tsx`
- `CancelRequestModal` → `app/payroll/modals/CancelRequestModal.tsx`
- `ManualPayrollEntryModal` → `app/payroll/modals/ManualPayrollEntryModal.tsx`
- `EditRateModal` → `app/payroll/modals/EditRateModal.tsx`
- `CreateRateModal` → `app/payroll/modals/CreateRateModal.tsx`
- `CreateDeductionModal` → `app/payroll/modals/CreateDeductionModal.tsx`
- `CancelDeductionModal` → `app/payroll/modals/CancelDeductionModal.tsx`
- `CreateScheduledPaymentModal` → `app/payroll/modals/CreateScheduledPaymentModal.tsx`
- `CancelScheduledModal` → `app/payroll/modals/CancelScheduledModal.tsx`
- The inline `StaffRequestModal` (Manager payout request) → `app/payroll/modals/StaffRequestModal.tsx`

**Step 5: Update payrollPage.tsx imports**

Replace all inline modal definitions with imports:

```typescript
import { CompletePaymentModal } from './modals/CompletePaymentModal'
import { StaggeredPaymentModal } from './modals/StaggeredPaymentModal'
import { ConfirmRequestModal } from './modals/ConfirmRequestModal'
import { CancelRequestModal } from './modals/CancelRequestModal'
import { ManualPayrollEntryModal } from './modals/ManualPayrollEntryModal'
import { EditRateModal } from './modals/EditRateModal'
import { CreateRateModal } from './modals/CreateRateModal'
import { CreateDeductionModal } from './modals/CreateDeductionModal'
import { CancelDeductionModal } from './modals/CancelDeductionModal'
import { CreateScheduledPaymentModal } from './modals/CreateScheduledPaymentModal'
import { CancelScheduledModal } from './modals/CancelScheduledModal'
import { StaffRequestModal } from './modals/StaffRequestModal'
```

Remove the inline function definitions from `payrollPage.tsx`. This should reduce the file from ~3,447 lines to ~1,200 lines.

**Step 6: Verify build**

Run: `bun run build`
Expected: Build succeeds with no type errors

**Step 7: Commit**

```bash
git add app/payroll/modals/ app/payroll/payrollPage.tsx
git commit -m "refactor: extract payroll modals into separate component files"
```

---

## Task 5: Improve Staff My Payroll — Status-Aware UI and Disbursement Details

**Files:**
- Modify: `app/my-payroll/myPayrollPage.tsx`

**Current Problems:**
1. Staff "My Payroll" shows "Confirm Receipt" for REQUESTED status, which implies the staff confirms payment — but request confirmation should be an admin action. The staff "confirm" action calls `confirmPayrollRequest`, which is actually an admin-only action in the server (`isAdmin` check). This is a logic error.
2. No visibility into disbursement details for completed requests.
3. No payment method display on requests.
4. The request cards lack detail (no breakdown of entries, no payment method info).
5. Status badges differ between admin and staff views (admin uses `STATUS_COLORS`, staff uses `REQUEST_STATUS_COLORS` with different color mappings).

**Target Behavior:**
1. **Staff should NOT confirm requests** — that's an admin action. The staff "Confirm Receipt" button should be removed. Instead, staff should see the correct status flow that matches reality.
2. Add a `PayrollRequestStatus` display that aligns with the admin page:
   - `REQUESTED` → "Awaiting admin confirmation" (amber/yellow)
   - `CONFIRMED` → "Admin confirmed, awaiting disbursement" (blue)
   - `COMPLETED` → "Paid" (green) — with payment method and date
   - `CANCELLED` → "Cancelled" (red)
3. Show disbursement details for COMPLETED requests.
4. Add entry count and breakdown to request cards.

**Step 1: Remove the "Confirm Receipt" button for REQUESTED status**

The staff should see status but not be able to confirm. Remove the `handleConfirmRequest` function and the `confirmingId` state, and the button in the request card:

Remove:
```typescript
const [confirmingId, setConfirmingId] = useState<string | null>(null)
```

Remove the `handleConfirmRequest` function.

Remove `confirmPayrollRequest` from imports.

Remove the button in the request card (~lines 637-660):
```tsx
{request.status === "REQUESTED" && (
    <button ...>Confirm Receipt</button>
)}
```

**Step 2: Update status descriptions in the request card**

Replace status badges with descriptive text that explains what each status means from the staff's perspective:

```tsx
{request.status === "REQUESTED" && (
    <p className='text-xs text-amber-400 mt-1'>
        Awaiting admin confirmation
    </p>
)}
{request.status === "CONFIRMED" && (
    <p className='text-xs text-blue-400 mt-1'>
        Confirmed — awaiting disbursement
    </p>
)}
{request.status === "COMPLETED" && (
    <div className='mt-1 text-xs text-white/50 space-y-1'>
        <p>Paid on {new Date(request.completed_at!).toLocaleDateString()}</p>
        {request.payment_method && (
            <span className={`px-1.5 py-0.5 rounded text-xs ${REQUEST_STATUS_COLORS[request.status]}`}>
                {getPayrollPaymentMethodLabel(request.payment_method)}
            </span>
        )}
        {request.reference_number && (
            <p>Ref: <span className='font-mono text-white/70'>{request.reference_number}</span></p>
        )}
    </div>
)}
{request.status === "CANCELLED" && (
    <p className='text-xs text-red-400 mt-1'>
        Cancelled{request.cancel_reason ? `: ${request.cancel_reason}` : ''}
    </p>
)}
```

**Step 3: Add entry count to request cards**

In the request card, add the count of entries if available:

```tsx
<p className='text-xs text-white/40'>
    {request.entries?.length || '?'} service(s) · Requested {new Date(request.requested_at).toLocaleDateString()}
</p>
```

**Step 4: Add import for `getPayrollPaymentMethodLabel`**

```typescript
import { getPayrollPaymentMethodLabel } from "@/utils/types/payment"
```

**Step 5: Update requests fetch to include entries**

The current `getPayrollRequests` call doesn't include entries. Update the fetch to pass an option that includes entries (if the server action supports it), or add a separate fetch for entry details per request. Check if `getPayrollRequests` supports including entries — if not, we can skip the entry count for now and just show the period type and dates.

**Step 6: Run lint check**

Run: `bun run lint`
Expected: No new errors

---

## Task 6: Align Staff My Payroll Page Logic with Admin Payroll

**Files:**
- Modify: `app/my-payroll/myPayrollPage.tsx`

**Current Problem:** The staff My Payroll page doesn't follow the same patterns as the admin Payroll page. Specific discrepancies:

1. **Status mapping inconsistency**: Admin uses `STATUS_COLORS` for REQUESTED/CONFIRMED/COMPLETED/CANCELLED while My Payroll uses both `STATUS_COLORS` (for entries) and `REQUEST_STATUS_COLORS` (for requests) with different color mappings.
2. **The admin Confirm action is incorrectly exposed to staff** (addressed in Task 5).
3. **No disbursement visibility** for staff on completed requests.
4. **Stats grid** doesn't include a "Confirmed" stat (showing money confirmed but not yet paid).
5. **Request modal** doesn't show the total breakdown (gross, shop cut, artist cut).

**Target Behavior:**

1. Use shared `STATUS_COLORS` and `REQUEST_STATUS_COLORS` from a common location (or at least ensure they match).
2. Remove staff ability to confirm requests (already addressed in Task 5).
3. Add disbursement visibility for completed requests.
4. Add "Confirmed" stat to the stats grid.

**Step 1: Add "Confirmed" stat to the stats grid**

The staff page currently shows: Total Earned, Pending, Paid, Active Requests. Add "Confirmed" (confirmed but not yet paid):

```tsx
<StatCard
    label="Confirmed"
    value={`${currencySymbol}${(entries || [])
        .filter(e => e.payment_status === 'CONFIRMED')
        .reduce((s, e) => s + Number(e.artist_cut), 0)
        .toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
    color="info"
/>
```

Update `StatsGrid` to support 5 columns on desktop, or switch to a 3-column layout.

**Step 2: Add disbursement details for completed requests**

After fetching requests, if any are COMPLETED, fetch their disbursements:

```typescript
const [disbursementsMap, setDisbursementsMap] = useState<Record<string, import('@/utils/types/payroll').PayrollDisbursement[]>>({})
```

After fetching requests, add:

```typescript
const completedRequestIds = result.data.data
    .filter(r => r.status === 'COMPLETED')
    .map(r => r.id)

if (completedRequestIds.length > 0) {
    const { getDisbursements } = await import('@/server/actions/payroll-disbursements')
    const disbursementResults = await Promise.all(
        completedRequestIds.map(id => getDisbursements(id))
    )
    const newMap: Record<string, import('@/utils/types/payroll').PayrollDisbursement[]> = {}
    completedRequestIds.forEach((id, i) => {
        if (disbursementResults[i].success) {
            newMap[id] = disbursementResults[i].data
        }
    })
    setDisbursementsMap(newMap)
}
```

Then in the request card for COMPLETED requests, show disbursement details.

**Step 3: Run lint check**

Run: `bun run lint`
Expected: No new errors

---

## Task 7: Improve Modal Layout and Organization

**Files:**
- Modify: `app/payroll/modals/CompletePaymentModal.tsx` (or inline if Task 4 not yet done)
- Modify: `app/payroll/modals/StaggeredPaymentModal.tsx`
- Modify: `app/payroll/modals/ConfirmRequestModal.tsx`
- Modify: `app/payroll/modals/CancelRequestModal.tsx`

**Current Problem:** Modals have inconsistent styling, widths, and padding. Some use `max-w-md`, others `max-w-lg`. Some have scroll areas, others don't. The confirm/disburse flow uses two separate modal states that close and reopen.

**Target Behavior:**
- All modals use consistent width (`max-w-md` for simple confirm dialogs, `max-w-lg` for complex forms)
- Consistent padding (`p-6` for header/body, `p-4` for footer)
- Consistent title styling (`text-xl font-bold`)
- All modals handle overflow properly with `max-h-[80vh]` and overflow-auto
- The confirm/disburse stepped flow stays in the same modal instance instead of mounting/unmounting

**Step 1: Standardize modal wrapper pattern**

Create a shared modal wrapper pattern. Each modal should follow:

```tsx
<div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
    <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10'
    >
        {/* Header */}
        <div className='p-6 border-b border-white/10 flex justify-between items-center'>
            <h3 className='text-xl font-bold'>{title}</h3>
            <button onClick={onClose} className='text-white/60 hover:text-white'>
                <XIcon className='w-5 h-5' />
            </button>
        </div>
        {/* Body */}
        <div className='p-6 overflow-auto max-h-[60vh]'>
            {children}
        </div>
        {/* Footer (if needed) */}
        <div className='p-4 border-t border-white/10 bg-white/5'>
            {actions}
        </div>
    </motion.div>
</div>
```

**Step 2: Fix the Confirm & Disburse flow to stay in same modal**

Currently the confirm-and-disburse flow uses two separate modal renders (`confirmStep === 'confirm'` and `confirmStep === 'disburse'`). This is already handled well in the parent component. But the ConfirmRequestModal should transition smoothly. Ensure the modal doesn't close/reopen — keep the same modal instance and just swap the content.

Update the confirm-and-disburse flow in `payrollPage.tsx`:

```tsx
<AnimatePresence>
    {confirmAndDisburseRequest && (
        <motion.div
            key='confirm-disburse'
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'
        >
            {confirmStep === 'confirm' ? (
                <ConfirmRequestModalContent ... />
            ) : (
                <CompletePaymentModalContent ... />
            )}
        </motion.div>
    )}
</AnimatePresence>
```

This keeps the overlay and animation consistent through both steps.

**Step 3: Run lint check**

Run: `bun run lint`
Expected: No new errors

---

## Task 8: Fix All Lint and Build Errors

**Files:**
- All files modified in Tasks 1-7
- Any other files that have existing warnings/errors

**Step 1: Run full lint check**

```bash
bun run lint 2>&1 | head -100
```

Review and fix all lint errors. Common fixes:
- Remove unused imports
- Fix TypeScript type issues
- Replace `console.log` with `createLogs` or remove
- Fix any implicit `any` types

**Step 2: Run TypeScript type check**

```bash
npx tsc --noEmit 2>&1 | head -100
```

Fix all type errors, especially:
- New imports that might not resolve
- Props interface changes
- Missing types from extracted modal components

**Step 3: Run production build**

```bash
bun run build 2>&1 | tail -50
```

Fix any build errors. The build should succeed with no errors.

**Step 4: Commit all fixes**

```bash
git add -A
git commit -m "fix: resolve lint and build errors from payroll disbursement revamp"
```

---

## Summary of Changes

| Task | Scope | Key Changes |
|------|-------|-------------|
| 1 | Disbursement Modal | Auto-set payment method from original sale, grouped alternatives, "Default" badge, refined warning |
| 2 | Admin Request Flow | Context-aware action buttons per status, "Confirm Only" option, rename "Complete" to "Disburse" |
| 3 | Disbursement History | Show disbursement details on completed requests, collapsible sections |
| 4 | Modal Extraction | Move 13 modal components into `app/payroll/modals/` directory |
| 5 | Staff My Payroll | Remove "Confirm Receipt" from staff, add status descriptions, add payment method badges |
| 6 | Staff Logic Alignment | Add "Confirmed" stat, add disbursement visibility, shared status colors |
| 7 | Modal Layout | Standardize modal structure, consistent widths, smooth step transitions |
| 8 | Lint/Build Fixes | Resolve all lint warnings, TypeScript errors, and build errors |