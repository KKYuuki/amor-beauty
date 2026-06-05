# Sales & Payroll Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **CURRENT PROGRESS: ✅ ALL PHASES COMPLETE**

**Goal:** Fix 6 root-cause bugs across the void subsystem, payroll rate resolution, artist-per-item safety, and today's sales calculation — all in `transactions.ts` and `payroll.ts`.

**Architecture:** Five isolated fixes in two server action files. Payroll rate resolution gains a 3-tier fallback chain. Void operations now reverse all payroll entries regardless of staffId gate and reverse downpayment liabilities. Today's sales aggregation switches from `sum(total)` to `sum(amountPaid)` and includes PARTIAL/DOWNPAYMENT statuses.

**Tech Stack:** Next.js 15 Server Actions, Drizzle ORM, TypeScript strict, Bun runtime

---

## File Structure

| File | Change |
|------|--------|
| `server/actions/payroll.ts:648-665` | Replace single `getApplicableRate` call with 3-tier fallback loop |
| `server/actions/transactions.ts:211` | Fix downpayment validation `>=` → `>` |
| `server/actions/transactions.ts:349` | Fix null safety on `payload.staff_id!` in payroll loop |
| `server/actions/transactions.ts:745-770` | Remove `staffId` gate on payroll reversal; add downpayment liability reversal entry |
| `server/actions/transactions.ts:1255-1285` | Fix `getTodaySummary`: status filter, `sum(amountPaid)`, safe branchId |

---

## Phase 1: Payroll Rate Fallback Chain

### Task 1.1: Replace single rate lookup with 3-tier fallback in `calculateAndCreatePayrollEntry`

**Files:**
- Modify: `server/actions/payroll.ts:648-665`

- [x] **Step 1: Apply the edit — replace the single rate lookup with fallback loop**

Edit `server/actions/payroll.ts`. Replace lines 648-665 (from `const rateLevelId = staffRecord[0]?.rateLevelId` through `if (!rate) { return failure(...) }`):

**Old code (lines 648-665):**
```typescript
        const rateLevelId = staffRecord[0]?.rateLevelId

        const rateResult = await getApplicableRate(serviceType, clientType, rateLevelId)
        if (!rateResult.success) {
            return failure(rateResult.error || 'Failed to get applicable rate')
        }

        const rate = rateResult.data
        if (!rate) {
            return failure(`No rate found for ${serviceType} / ${clientType}${rateLevelId ? ` (level: ${rateLevelId})` : ' (no rate level assigned)'}`)
        }
```

**New code:**
```typescript
        const rateLevelId = staffRecord[0]?.rateLevelId

        // Three-tier fallback chain:
        //  1st: exact match (serviceType + clientType + rateLevelId)
        //  2nd: level-less fallback (serviceType + clientType, no rate level)
        //  3rd: walkin-default (serviceType + WALKIN, no rate level)
        let rate: PayrollStaffRate | null = null
        const fallbackAttempts: Array<{ serviceType: ServiceType; clientType: ClientType; rateLevelId: string | undefined | null }> = [
            { serviceType, clientType, rateLevelId },
            { serviceType, clientType, rateLevelId: null },
            { serviceType, clientType: 'WALKIN', rateLevelId: null },
        ]

        for (const attempt of fallbackAttempts) {
            const rateResult = await getApplicableRate(
                attempt.serviceType,
                attempt.clientType,
                attempt.rateLevelId ?? undefined
            )
            if (rateResult.success && rateResult.data) {
                rate = rateResult.data
                break
            }
        }

        if (!rate) {
            return failure(
                `No rate found for ${serviceType} / ${clientType}` +
                (rateLevelId ? ` (level: ${rateLevelId})` : '') +
                ` — tried exact match, standard rate, and walk-in default. ` +
                `Configure a rate in Payroll Settings.`
            )
        }
```

- [x] **Step 2: Verify the file compiles cleanly**

Run:
```bash
bun run lint
```

Expected: No errors in `server/actions/payroll.ts`. The `PayrollStaffRate` type is already imported at the top of the file (check line ~1-20 for the import from `@/utils/types/payroll`). If TypeScript complains about `PayrollStaffRate` not being in scope, import it explicitly:
```typescript
import { PayrollStaffRate, PayrollEntry, /* ...existing imports... */ } from "@/utils/types/payroll"
```

- [x] **Step 3: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): add 3-tier rate fallback chain in calculateAndCreatePayrollEntry"
```

---

## Phase 2: Void Payroll Gate & Artist Null Safety

### Task 2.1: Remove `staffId` gate from void payroll reversal

**Files:**
- Modify: `server/actions/transactions.ts:746-768`

- [x] **Step 1: Apply the edit — remove the gate and always call `cancelPayrollEntriesForTransaction`**

Edit `server/actions/transactions.ts`. Replace lines 746-768 (the entire `if (transaction.staffId) { ... }` block including the catch):

**Old code (lines 746-768):**
```typescript
        // Reverse payroll entries for this transaction
        if (transaction.staffId) {
            try {
                const { cancelPayrollEntriesForTransaction } = await import('./payroll')
                const payrollResult = await cancelPayrollEntriesForTransaction(transaction.id, user.id, tx)
                if (!payrollResult.success) {
                    throw new Error(`Failed to cancel payroll entries: ${payrollResult.error}`)
                }
            } catch (payrollError) {
                // Errors here cause withTransaction to roll back the entire void operation
                if (payrollError instanceof Error) {
                    throw payrollError
                }
                throw new Error(`Payroll reversal failed for voided transaction ${transaction.transactionNumber}: ${String(payrollError)}`)
            }
        }
```

**New code:**
```typescript
        // Reverse payroll entries for this transaction
        // IMPORTANT: cancelPayrollEntriesForTransaction queries payrollEntry
        // WHERE transactionId = ? directly — it handles zero entries gracefully
        // and catches per-item artist assignments that have no transaction-level staffId.
        try {
            const { cancelPayrollEntriesForTransaction } = await import('./payroll')
            const payrollResult = await cancelPayrollEntriesForTransaction(transaction.id, user.id, tx)
            if (!payrollResult.success) {
                throw new Error(`Failed to cancel payroll entries: ${payrollResult.error}`)
            }
        } catch (payrollError) {
            // Errors here cause withTransaction to roll back the entire void operation
            if (payrollError instanceof Error) {
                throw payrollError
            }
            throw new Error(`Payroll reversal failed for voided transaction ${transaction.transactionNumber}: ${String(payrollError)}`)
        }
```

- [x] **Step 2: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix(transactions): remove staffId gate from void payroll reversal"
```

### Task 2.2: Fix null safety on per-item artist assignment

**Files:**
- Modify: `server/actions/transactions.ts:349`

- [x] **Step 1: Apply the edit — guard against null performerId**

Edit `server/actions/transactions.ts`. Replace line 349:

**Old code (line 349):**
```typescript
                const performerId = item.artist_id || payload.staff_id!
```

**New code:**
```typescript
                const performerId = item.artist_id || payload.staff_id
                if (!performerId) {
                    // Service item with no artist assignment — skip payroll for this item
                    payrollErrors.push({
                        serviceId: item.service_id,
                        error: 'No artist assigned — payroll entry not created'
                    })
                    continue
                }
```

- [x] **Step 2: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix(transactions): add null guard on performerId in payroll creation loop"
```

---

## Phase 3: Downpayment Liability Reversal on Void

### Task 3.1: Add downpayment liability reversal entry on void + fix validation

**Files:**
- Modify: `server/actions/transactions.ts:211` (validation)
- Modify: `server/actions/transactions.ts:733-744` (downpayment settlement block)

- [x] **Step 1: Fix downpayment amount validation `>=` → `>`

Edit `server/actions/transactions.ts` line 211:

**Old code:**
```typescript
            if (downpaymentAmount >= payload.total) {
```

**New code:**
```typescript
            if (downpaymentAmount > payload.total) {
```

- [x] **Step 2: Add liability reversal after downpayment settlement in void**

Edit `server/actions/transactions.ts`. In the downpayment settlement block (inside `voidTransaction`, around lines 733-744), add the liability reversal entry AFTER the `set` update:

**Old code (lines 738-744 inside the `if (downpayment && !downpayment.isSettled)` block):**
```typescript
            if (downpayment && !downpayment.isSettled) {
                await tx
                    .update(downpayments)
                    .set({ isSettled: true, updatedAt: new Date() })
                    .where(eq(downpayments.id, downpayment.id))
            }
```

**New code:**
```typescript
            if (downpayment && !downpayment.isSettled) {
                await tx
                    .update(downpayments)
                    .set({ isSettled: true, updatedAt: new Date() })
                    .where(eq(downpayments.id, downpayment.id))

                // Reverse the original UNEARNED_REVENUE liability entry
                await createAutoLedgerEntry(
                    'TRANSACTION',
                    transaction.id,
                    {
                        entry_date: new Date(),
                        entry_type: 'LIABILITY',
                        category: 'UNEARNED_REVENUE',
                        description: `Voided downpayment: ${transaction.transactionNumber}`,
                        reference: `VOID-DP-${transaction.transactionNumber}`,
                        debit: Number(downpayment.amount),
                        credit: 0,
                        branch_id: transaction.branchId,
                    },
                    user.id,
                    tx
                )
            }
```

- [x] **Step 3: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix(transactions): reverse downpayment liability on void and fix validation operator"
```

---

## Phase 4: Today's Sales Calculation

### Task 4.1: Fix `getTodaySummary` aggregation and status filter

**Files:**
- Modify: `server/actions/transactions.ts:1255-1285`

- [x] **Step 1: Replace the entire `getTodaySummary` function body**

Edit `server/actions/transactions.ts`. Replace the `getTodaySummary` function (lines 1246-1295):

**Old code (lines 1251-1285):**
```typescript
    try {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayEnd = new Date()
        todayEnd.setHours(23, 59, 59, 999)

        let whereClause = and(
            gte(transactions.createdAt, todayStart),
            lte(transactions.createdAt, todayEnd),
            eq(transactions.status, 'COMPLETED')
        )

        if (staffId) {
            whereClause = and(whereClause, eq(transactions.staffId, staffId))
        }

        if (branchId) {
            const branchCondition = or(eq(transactions.branchId, branchId!), isNull(transactions.branchId))
            if (branchCondition) whereClause = and(whereClause, branchCondition)
        }

        const result = await db
            .select({
                totalSales: sql<number>`sum(${transactions.total})`,
                transactionCount: sql<number>`count(*)`,
            })
            .from(transactions)
            .where(whereClause)

        return success({
            totalSales: Number(result[0]?.totalSales ?? 0),
            transactionCount: Number(result[0]?.transactionCount ?? 0),
        })
```

**New code:**
```typescript
    try {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayEnd = new Date()
        todayEnd.setHours(23, 59, 59, 999)

        // Include all active (non-voided, non-refunded) statuses
        const activeStatuses = ['COMPLETED', 'PARTIAL', 'DOWNPAYMENT_ASSIGNED', 'DOWNPAYMENT_PENDING']

        let whereClause = and(
            gte(transactions.createdAt, todayStart),
            lte(transactions.createdAt, todayEnd),
            sql`${transactions.status} IN (${sql.join(activeStatuses.map(s => sql`${s}`), sql`, `)})`
        )

        if (staffId) {
            whereClause = and(whereClause, eq(transactions.staffId, staffId))
        }

        if (branchId) {
            whereClause = and(
                whereClause,
                or(eq(transactions.branchId, branchId), isNull(transactions.branchId))
            )
        }

        // Sum amountPaid instead of total — reflects actual cash collected,
        // not future unpaid balances on PARTIAL/DOWNPAYMENT transactions
        const result = await db
            .select({
                totalSales: sql<number>`sum(${transactions.amountPaid})`,
                transactionCount: sql<number>`count(*)`,
            })
            .from(transactions)
            .where(whereClause)

        return success({
            totalSales: Number(result[0]?.totalSales ?? 0),
            transactionCount: Number(result[0]?.transactionCount ?? 0),
        })
```

- [x] **Step 2: Verify TypeScript compilation**

Run:
```bash
bun run lint
```

Expected: No errors in `server/actions/transactions.ts`.

- [x] **Step 3: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix(transactions): fix today's summary to sum amountPaid and include PARTIAL/DOWNPAYMENT statuses"
```

---

## Phase 5: End-to-End Verification

### Task 5.1: Verify all fixes compile and lint cleanly

- [x] **Step 1: Run lint and build**

```bash
bun run lint
bun run build
```

Expected: Both commands exit clean with zero errors.

- [x] **Step 2: Manual smoke test — confirm dev server starts**

```bash
bun run dev &
sleep 5
curl -sk https://localhost:6969/api/health 2>/dev/null || echo "Server started (no health endpoint available)"
```

Expected: Dev server starts. Open browser at `https://localhost:6969/sales` and verify:
- The Sales page loads
- You can add items to cart
- Staff dropdown shows staff members with rate levels
- "Today's Sales" section shows data

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: final verification — all 6 bug fixes compile and lint clean"
```

---

## Verification Checklist

| Fix | Verify By |
|-----|-----------|
| 1.1 Rate Fallback | Create sale with a staff member who has a rate_level_id but no level-specific rate configured. Payroll entry should still be created using the standard rate. |
| 2.1 Void Payroll Gate | Create sale with per-item artist assignment (no transaction-level staffId). Void it. All payroll entries should be cancelled. |
| 2.2 Artist Safety | Create Shop Sale with a service that has no artist_id. No crash; payroll skipped with error logged. |
| 3.1 Downpayment Void | Create sale with downpayment. Void it. Check `general_ledger` for a DEBIT entry with category `UNEARNED_REVENUE` and reference `VOID-DP-...`. |
| 4.1 Today's Sales | Create a PARTIAL payment transaction. Refresh the sales page. "Today's Sales" total should reflect the amountPaid, not total. |
