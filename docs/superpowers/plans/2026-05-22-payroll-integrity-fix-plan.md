# Payroll System Integrity Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **CURRENT PROGRESS:** ✅ **ALL TASKS COMPLETE.** Final build green, all 7 verification checks pass.

**Goal:** Fix 9 identified issues across the payroll system—schema gaps, dead code, tax-enabled gating, data integrity on void/refund, service type fallback, branch filtering, disbursement boundary, and cache invalidation.

**Architecture:** Six atomic phases, each targeting 1–3 tasks that modify a single concern. Every phase ends with `bun run lint && bun run build` verification. Files are never shared across concurrent phases—phases are strictly sequential. No DB migrations, no UI changes.

**Tech Stack:** TypeScript, Zod validation, Drizzle ORM, PostgreSQL, Next.js server actions.

---

## Phase 1: Schema Cleanup & Dead Code Removal

### Task 1: Add `CANCELLED` to PaymentStatusSchema + remove dead schema alias

**Files:**
- Modify: `server/actions/payroll-schemas.ts:7`
- Modify: `server/actions/payroll-schemas.ts:121`

- [x] **Step 1: Add `'CANCELLED'` to `PaymentStatusSchema`**

Edit `server/actions/payroll-schemas.ts`, line 7. Replace:

```typescript
export const PaymentStatusSchema = z.enum(['PENDING', 'REQUESTED', 'CONFIRMED', 'PAID'])
```

With:

```typescript
export const PaymentStatusSchema = z.enum(['PENDING', 'REQUESTED', 'CONFIRMED', 'PAID', 'CANCELLED'])
```

- [x] **Step 2: Remove `CreatePayrollEntryInputSchema` alias**

Edit `server/actions/payroll-schemas.ts`, at line 121. Delete this line entirely:

```typescript
export const CreatePayrollEntryInputSchema = ManualPayrollEntrySchema
```

Also delete the corresponding type alias on line 152:

```typescript
export type CreatePayrollEntryInput = z.infer<typeof CreatePayrollEntryInputSchema>
```

If line 152 does not exist (the type is not exported), skip.

- [x] **Step 3: Verify with lint and build**

```bash
bun run lint && bun run build
```

Expected: Both pass with zero errors.

- [x] **Step 4: Commit**

```bash
git add server/actions/payroll-schemas.ts
git commit -m "fix(payroll): add CANCELLED to PaymentStatusSchema, remove dead CreatePayrollEntryInputSchema alias"
```

### Task 2: Remove dead `createPayrollEntry` function

**Files:**
- Modify: `server/actions/payroll.ts:596-690`

- [x] **Step 1: Confirm zero callers**

```bash
grep -r "createPayrollEntry" --include="*.ts" --include="*.tsx" server/ app/ components/ utils/
```

Expected: Only matches inside `server/actions/payroll.ts` itself (the function definition). If any import is found elsewhere, STOP and report.

- [x] **Step 2: Remove the function body**

In `server/actions/payroll.ts`, delete lines 596 through 689 (the entire `createPayrollEntry` function, from its JSDoc comment through the closing brace). The function starts at:

```typescript
export async function createPayrollEntry(
```

Find the matching closing `}` of this function (it ends with `return failure(...)` in the catch block), and delete everything between (and including) the function signature and its final `}`.

Also remove the import of `CreatePayrollEntryInputSchema` at line 40:

```typescript
    CreatePayrollEntryInputSchema,
```

Delete this line from the import block.

- [x] **Step 3: Verify with lint and build**

```bash
bun run lint && bun run build
```

Expected: Both pass with zero errors.

- [x] **Step 4: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): remove dead createPayrollEntry function and its schema import"
```

---

## Phase 2: Payment Mapping Fix & Tax-Enabled Gating

### Task 3: Add `CRYPTO` to `mapPayrollToAccountingPaymentMethod` + add `tax_enabled` gating to ALL payroll entry creation paths

**Files:**
- Modify: `utils/types/payment.ts:106-116`
- Modify: `server/actions/payroll.ts` — imports, `calculateAndCreatePayrollEntry`, `createManualPayrollEntry`, `completePayrollRequest`

- [x] **Step 1: Add `CRYPTO` case to `mapPayrollToAccountingPaymentMethod`**

In `utils/types/payment.ts`, between the `MAYA` and `BANK` cases (line 112), add:

```typescript
        case 'CRYPTO': return 'CRYPTO'
```

The full function should look like:

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
        case 'CRYPTO': return 'CRYPTO'
        default: return undefined
    }
}
```

- [x] **Step 2: Import `getSetting` in `server/actions/payroll.ts`**

Add to the import block (near line 30, alongside other `./` imports):

```typescript
import { getSetting } from "./settings"
```

- [x] **Step 3: Add helper function `isPayrollTaxEnabled` to payroll.ts**

After the `TAX_BRACKETS` constant (around line 58), before the first `export async function`, add:

```typescript
async function isPayrollTaxEnabled(): Promise<boolean> {
    try {
        const result = await getSetting('currency_tax')
        if (result.success && result.data) {
            return result.data.tax_enabled
        }
        return false
    } catch {
        return false
    }
}
```

- [x] **Step 4: Gate tax calculation in `calculateAndCreatePayrollEntry`**

In `server/actions/payroll.ts`, find the block at lines 760-763:

```typescript
        // Calculate tax withholding
        const taxInfo = calculateTax(staffCut)
        const taxAmount = Math.round(taxInfo.amount * 100) / 100
        const netAmount = Math.round((staffCut - taxAmount) * 100) / 100
```

Replace with:

```typescript
        // Calculate tax withholding (only if tax is enabled in settings)
        const taxEnabled = await isPayrollTaxEnabled()
        const taxInfo = taxEnabled
            ? calculateTax(staffCut)
            : { rate: 0, amount: 0, bracket: 'Zero' }
        const taxAmount = Math.round(taxInfo.amount * 100) / 100
        const netAmount = taxEnabled
            ? Math.round((staffCut - taxAmount) * 100) / 100
            : staffCut
```

- [x] **Step 5: Gate tax calculation in `createManualPayrollEntry`**

In `server/actions/payroll.ts`, find the block at lines 886-901:

```typescript
        const taxInfo = calculateTax(staffCut)
        const netAmount = staffCut - taxInfo.amount
        if (netAmount < 0) {
            return failure('Tax amount exceeds staff cut')
        }
```

Replace with:

```typescript
        const taxEnabled = await isPayrollTaxEnabled()
        const taxInfo = taxEnabled
            ? calculateTax(staffCut)
            : { rate: 0, amount: 0, bracket: 'Zero' }
        const netAmount = taxEnabled
            ? staffCut - taxInfo.amount
            : staffCut
        if (netAmount < 0) {
            return failure('Tax amount exceeds staff cut')
        }
```

- [x] **Step 6: Gate TAX_WITHHOLDING accounting entry in `completePayrollRequest`**

In `server/actions/payroll.ts`, find the block at lines 1475-1493:

```typescript
                // Create liability entry for tax withholding (always, since disbursements don't handle this)
                if (Number(request.totalTaxAmount) > 0) {
```

Replace the comment and guard with:

```typescript
                // Create liability entry for tax withholding if tax is enabled
                const taxEnabledForRequest = await isPayrollTaxEnabled()
                if (taxEnabledForRequest && Number(request.totalTaxAmount) > 0) {
```

- [x] **Step 7: Verify with lint and build**

```bash
bun run lint && bun run build
```

Expected: Both pass with zero errors.

- [x] **Step 8: Commit**

```bash
git add utils/types/payment.ts server/actions/payroll.ts
git commit -m "fix(payroll): add CRYPTO mapping, gate tax calculation on currency_tax.tax_enabled setting"
```

---

## Phase 3: Empty ServiceId Fallback & Caller Fixes

### Task 4: Fix empty `serviceId`/`serviceType` fallback + pass `serviceType` from callers

**Files:**
- Modify: `server/actions/payroll.ts:706-718` — `calculateAndCreatePayrollEntry`
- Modify: `server/actions/transactions.ts:1013-1020` — downpayment settlement
- Modify: `server/actions/downpayments.ts:110-116` — assign staff to downpayment

- [x] **Step 1: Guard against empty `serviceId` in `calculateAndCreatePayrollEntry`**

In `server/actions/payroll.ts`, find lines 706-718:

```typescript
        if (input.serviceType) {
            serviceType = input.serviceType
        } else {
            const serviceRecord = await dbClient
                .select({ serviceType: services.serviceType })
                .from(services)
                .where(eq(services.id, input.serviceId))
                .limit(1)

            serviceType = (serviceRecord[0]?.serviceType as ServiceType) || 'TATTOO'
        }
```

Replace with:

```typescript
        if (input.serviceType) {
            serviceType = input.serviceType
        } else if (input.serviceId && input.serviceId.length > 0) {
            const serviceRecord = await dbClient
                .select({ serviceType: services.serviceType })
                .from(services)
                .where(eq(services.id, input.serviceId))
                .limit(1)

            serviceType = (serviceRecord[0]?.serviceType as ServiceType) || 'MANUAL'
        } else {
            // No service context available — record as MANUAL, not TATTOO
            serviceType = 'MANUAL'
        }
```

- [x] **Step 2: Add `serviceType` to downpayment settlement call in `transactions.ts`**

In `server/actions/transactions.ts`, find lines 1014-1020:

```typescript
                        await calculateAndCreatePayrollEntry({
                            transactionId: transaction.id,
                            serviceId: '', // Downpayment doesn't have a specific service
                            staffId: transaction.staffId,
                            amount: Number(transaction.total),
                            quantity: 1,
                            clientType: (transaction.clientType as ClientType) || undefined,
                            paymentMethod: payload.payment_method,
                        }, tx)
```

Add `serviceType: 'MANUAL'` below `serviceId` (keep `serviceId: ''` since the interface requires it):

```typescript
                        await calculateAndCreatePayrollEntry({
                            transactionId: transaction.id,
                            serviceId: '', // Downpayment doesn't have a specific service
                            serviceType: 'MANUAL',
                            staffId: transaction.staffId,
                            amount: Number(transaction.total),
                            quantity: 1,
                            clientType: (transaction.clientType as ClientType) || undefined,
                            paymentMethod: payload.payment_method,
                        }, tx)
```

- [x] **Step 3: Add `serviceType` to downpayment assignment call in `downpayments.ts`**

In `server/actions/downpayments.ts`, find lines 110-116:

```typescript
                    const result = await calculateAndCreatePayrollEntry({
                        transactionId: transaction.id,
                        serviceId: '',
                        staffId: payload.staff_id,
                        amount: Number(updated.amount),
                        quantity: 1,
                        clientType: (transaction.clientType as ClientType) || undefined,
                        paymentMethod: transaction.paymentMethod || undefined,
                    }, tx)
```

Add `serviceType: 'MANUAL'` below `serviceId` (keep `serviceId: ''` since the interface requires it):

```typescript
                    const result = await calculateAndCreatePayrollEntry({
                        transactionId: transaction.id,
                        serviceId: '',
                        serviceType: 'MANUAL',
                        staffId: payload.staff_id,
                        amount: Number(updated.amount),
                        quantity: 1,
                        clientType: (transaction.clientType as ClientType) || undefined,
                        paymentMethod: transaction.paymentMethod || undefined,
                    }, tx)
```

- [x] **Step 4: Verify with lint and build**

```bash
bun run lint && bun run build
```

Expected: Both pass with zero errors.

- [x] **Step 5: Commit**

```bash
git add server/actions/payroll.ts server/actions/transactions.ts server/actions/downpayments.ts
git commit -m "fix(payroll): use MANUAL serviceType for downpayment-triggered entries, guard empty serviceId"
```

---

## Phase 4: Void/Refund Entry Cancellation

### Task 5: Fix `cancelPayrollEntriesForTransaction` to handle REQUESTED and CONFIRMED entries

**Files:**
- Modify: `server/actions/payroll.ts:2491-2533`

- [x] **Step 1: Expand status filter from PENDING-only to all non-terminal statuses**

In `server/actions/payroll.ts`, find lines 2496-2506:

```typescript
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
```

Replace the `where` clause and comment:

```typescript
    const dbClient = tx || db

    // Find all active payroll entries for this transaction
    // (PENDING, REQUESTED, CONFIRMED — but NOT PAID or already CANCELLED)
    const entries = await dbClient
        .select({ id: payrollEntry.id, payrollRequestId: payrollEntry.payrollRequestId })
        .from(payrollEntry)
        .where(
            and(
                eq(payrollEntry.transactionId, transactionId),
                sql`${payrollEntry.paymentStatus} IN ('PENDING', 'REQUESTED', 'CONFIRMED')`
            )
        )
```

- [x] **Step 2: When cancelling REQUESTED/CONFIRMED entries, also detach from their payroll request**

After the `for (const entry of entries)` block that sets `paymentStatus: 'CANCELLED'`, add logic to nullify `payrollRequestId` for entries that were attached to a request. The existing loop at lines 2516-2522 should be updated.

Find:

```typescript
    // Mark entries as cancelled
    for (const entry of entries) {
        await dbClient
            .update(payrollEntry)
            .set({
                paymentStatus: 'CANCELLED',
            })
            .where(eq(payrollEntry.id, entry.id))
    }
```

Replace with:

```typescript
    // Mark entries as cancelled
    for (const entry of entries) {
        await dbClient
            .update(payrollEntry)
            .set({
                paymentStatus: 'CANCELLED',
                // Detach from any payroll request so the request total can be
                // recalculated without counting this voided work
                payrollRequestId: null,
            })
            .where(eq(payrollEntry.id, entry.id))
    }
```

- [x] **Step 3: Verify with lint and build**

```bash
bun run lint && bun run build
```

Expected: Both pass with zero errors.

- [x] **Step 4: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): cancelPayrollEntriesForTransaction handles REQUESTED/CONFIRMED entries, detaches from request"
```

---

## Phase 5: Branch Filter & Disbursement Boundary Hardening

### Task 6: Fix `getAllDeductions` branch filter

**Files:**
- Modify: `server/actions/payroll.ts:2153-2156`

- [x] **Step 1: Replace unsafe JSONB comparison**

In `server/actions/payroll.ts`, find line 2153-2155:

```typescript
        const whereClause = branchId
            ? sql`${branchId} = ANY(${user.branchIds})`
            : undefined
```

Replace with:

```typescript
        const whereClause = branchId
            ? sql`${user.branchIds}::jsonb ? ${branchId}::text`
            : undefined
```

This uses PostgreSQL's JSONB `?` operator (key existence), which correctly checks if the `branchIds` JSONB array contains the `branchId` string.

- [x] **Step 2: Apply same fix to `getScheduledPayments`**

The same pattern exists around line 2358 in `getScheduledPayments`:

```typescript
        const whereClause = branchId
            ? and(
                eq(payrollDeductions.disbursementType, 'STAGGERED'),
                sql`${branchId} = ANY(${user.branchIds})`
            )
```

Replace the `sql` part with:

```typescript
        const whereClause = branchId
            ? and(
                eq(payrollDeductions.disbursementType, 'STAGGERED'),
                sql`${user.branchIds}::jsonb ? ${branchId}::text`
            )
```

- [x] **Step 3: Verify with lint and build**

```bash
bun run lint && bun run build
```

Expected: Both pass with zero errors.

- [x] **Step 4: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): use JSONB ? operator for branch filter in getAllDeductions and getScheduledPayments"
```

### Task 7: Harden disbursement boundary in `createDisbursement`

**Files:**
- Modify: `server/actions/payroll-disbursements.ts:98-117`

- [x] **Step 1: Make boundary explicit with sentinel variable**

In `server/actions/payroll-disbursements.ts`, find lines 98-117:

```typescript
            // Auto-complete when fully disbursed
            const newDisbursed = alreadyDisbursed + payload.amount
            if (newDisbursed >= totalStaffCut) {
                const completeResult = await completePayrollRequest(payload.request_id, {
                    payment_method: payload.payment_method,
                    reference_number: payload.reference_number,
                    skip_disbursement_check: true,
                })
                if (!completeResult.success) {
                    throw new Error(completeResult.error || 'Failed to complete payroll request')
                }
            }

            return disbursement
```

Replace with:

```typescript
            // Auto-complete when fully disbursed
            const newDisbursed = alreadyDisbursed + payload.amount
            const isFullyDisbursed = newDisbursed >= totalStaffCut
            if (isFullyDisbursed) {
                const completeResult = await completePayrollRequest(payload.request_id, {
                    payment_method: payload.payment_method,
                    reference_number: payload.reference_number,
                    skip_disbursement_check: true,
                    // Accounting entry is created by completePayrollRequest (not here)
                    // to prevent double-counting
                    skip_accounting_entry: false,
                })
                if (!completeResult.success) {
                    throw new Error(completeResult.error || 'Failed to complete payroll request')
                }
            }

            return { disbursement, isFullyDisbursed }
```

Then update the destructure below at line 119. Find:

```typescript
        if (!txResult.success) {
            return failure(txResult.error || 'Failed to create disbursement')
        }

        const disbursement = txResult.data
        const newDisbursed = alreadyDisbursed + payload.amount
```

Replace with:

```typescript
        if (!txResult.success) {
            return failure(txResult.error || 'Failed to create disbursement')
        }

        const { disbursement, isFullyDisbursed } = txResult.data
        const newDisbursed = alreadyDisbursed + payload.amount
```

And below (around line 137), the partial accounting entry guard already reads:

```typescript
        if (newDisbursed < totalStaffCut) {
```

Replace this with the explicit sentinel:

```typescript
        // Create accounting entry only for partial disbursements;
        // full completion's accounting is handled by completePayrollRequest
        if (!isFullyDisbursed) {
```

- [x] **Step 2: Verify with lint and build**

```bash
bun run lint && bun run build
```

Expected: Both pass with zero errors.

- [x] **Step 3: Commit**

```bash
git add server/actions/payroll-disbursements.ts
git commit -m "fix(payroll-disbursements): harden partial-vs-full boundary with explicit sentinel"
```

---

## Phase 6: Cache Invalidation Fixes

### Task 8: Fix all cache invalidation gaps

**Files:**
- Modify: `server/actions/payroll.ts` — `createScheduledPayment`, `deactivateStaffRate`, `deleteStaffRate`
- Modify: `server/actions/payroll-disbursements.ts` — `createDisbursement`

- [x] **Step 1: Fix `createScheduledPayment` — add missing cache tags**

In `server/actions/payroll.ts`, find `createScheduledPayment` (around line 2317). Replace:

```typescript
        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
```

With:

```typescript
        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')
```

- [x] **Step 2: Fix `deactivateStaffRate` — add dashboard/insights cache tags**

In `server/actions/payroll.ts`, find `deactivateStaffRate` (around line 2573). Replace:

```typescript
        cache.invalidate('payroll_rates')
```

With:

```typescript
        cache.invalidate('payroll_rates')
        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')
```

- [x] **Step 3: Fix `deleteStaffRate` — add dashboard/insights cache tags**

In `server/actions/payroll.ts`, find `deleteStaffRate` (around line 2629). Replace:

```typescript
        cache.invalidate('payroll_rates')
```

With:

```typescript
        cache.invalidate('payroll_rates')
        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')
```

- [x] **Step 4: Fix `createDisbursement` — add missing cache tags**

In `server/actions/payroll-disbursements.ts`, find the cache invalidation block (around line 174). Replace:

```typescript
        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
```

With:

```typescript
        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')
```

- [x] **Step 5: Verify with lint and build**

```bash
bun run lint && bun run build
```

Expected: Both pass with zero errors.

- [x] **Step 6: Final commit**

```bash
git add server/actions/payroll.ts server/actions/payroll-disbursements.ts
git commit -m "fix(payroll): fill cache invalidation gaps in createScheduledPayment, deactivateStaffRate, deleteStaffRate, createDisbursement"
```

---

## Verification Checklist

After all 8 tasks are complete, run these validations:

```bash
# 1. Full lint and build
bun run lint && bun run build

# 2. Confirm no imports of dead function
grep -r "createPayrollEntry" --include="*.ts" --include="*.tsx" server/ app/ components/ utils/
# Expected: zero matches (or only in .git history)

# 3. Confirm no imports of dead schema alias
grep -r "CreatePayrollEntryInputSchema\|CreatePayrollEntryInput" --include="*.ts" --include="*.tsx" server/ app/ components/ utils/
# Expected: zero matches

# 4. Confirm PaymentStatusSchema includes CANCELLED
grep "PaymentStatusSchema" server/actions/payroll-schemas.ts
# Expected: shows 'CANCELLED' in the enum

# 5. Confirm tax_enabled gating exists in calculateAndCreatePayrollEntry
grep -n "isPayrollTaxEnabled" server/actions/payroll.ts
# Expected: matches in calculateAndCreatePayrollEntry, createManualPayrollEntry, completePayrollRequest

# 6. Confirm CRYPTO is in the payment mapping
grep -A 15 "mapPayrollToAccountingPaymentMethod" utils/types/payment.ts | grep CRYPTO
# Expected: shows "case 'CRYPTO': return 'CRYPTO'"

# 7. Confirm cache invalidation is complete
grep -n "cache.invalidate" server/actions/payroll.ts | grep -E "deactivateStaffRate|deleteStaffRate|createScheduledPayment" -A 5
grep -n "cache.invalidate" server/actions/payroll-disbursements.ts
# Expected: each mutated function shows all 4 tags (payroll_dashboard, staff_payroll, business_insights, exec_accounting)
```
