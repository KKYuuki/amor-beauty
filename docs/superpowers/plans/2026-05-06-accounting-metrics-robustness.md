# Accounting & Metrics Robustness Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make accounting & metrics data always fresh, entries never lost or duplicated, filters race-free, and the UI organized into Ledger/Reports/Trash tabs.

**Architecture:** Server-side: disable the in-memory cache for metrics, restructure try/catch boundaries so persisted entries always report success, add DB-level idempotency for auto-entries, add `restoreLedgerEntry` action, wrap imports in transactions, move revalidation post-commit via `onCommit` callback. Client-side: request versioning to eliminate filter race condition, retry wrapper for transient network errors, 3-tab UI layout.

**Tech Stack:** Next.js 15 (App Router), React 19, Drizzle ORM (PostgreSQL), Server Actions, Tailwind CSS, Framer Motion

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `server/db/transactions.ts` | `withTransaction()` helper — add `onCommit` callback | Modify |
| `server/actions/metrics.ts` | Remove all cache reads/writes; add `forceRefresh` param | Modify |
| `server/actions/accounting.ts` | Fix try/catch in create/update/void; add `restoreLedgerEntry`; fix journal entry revalidation; fix auto-entry idempotency + cache invalidation | Modify |
| `server/actions/accounting-import.ts` | Wrap import in `withTransaction()` | Modify |
| `drizzle/0010_*.sql` | DB migration: partial unique index on `(source_type, source_id)` | Create |
| `utils/retry.ts` | Lightweight retry wrapper for server action calls | Create |
| `components/accounting/EntryModal.tsx` | Wrap create/update calls with retry | Modify |
| `app/accounting/accountingPage.tsx` | Add request versioning; refactor into 3-tab layout (Ledger/Reports/Trash); add Trash tab with restore | Modify |

---

## Phase 1: Server Foundation — Transaction Helper & Cache Removal

No UI changes. These are pure backend changes that are safe to deploy independently.

---

### Task 1: Add `onCommit` Callback to `withTransaction()`

**Files:**
- Modify: `server/db/transactions.ts`

**Why first:** Task 6 (`createJournalEntry` revalidation fix) depends on this.

- [ ] **Step 1: Add `onCommit` parameter to `withTransaction`**

Replace the entire content of `server/db/transactions.ts` with:

```typescript
import { db } from './index'
import { createLogs } from '@/server/actions/logs'
import { ActionResponse } from '@/utils/types/responses'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import { ExtractTablesWithRelations } from 'drizzle-orm'

// Extract the actual transaction type from Drizzle
export type TransactionClient = PgTransaction<
    NodePgQueryResultHKT,
    Record<string, never>,
    ExtractTablesWithRelations<Record<string, never>>
>

export interface TransactionContext {
    action: 'APPOINTMENT' | 'INVENTORY' | 'SYSTEM' | 'AUTH' | 'ACCOUNTING' | 'PAYROLL' | 'OTHER'
    userId?: string
}

export async function withTransaction<T>(
    operations: (tx: TransactionClient) => Promise<T>,
    context: TransactionContext,
    onCommit?: () => void | Promise<void>
): Promise<ActionResponse<T>> {
    try {
        const result = await db.transaction(async (tx) => {
            return await operations(tx as TransactionClient)
        })

        // Fire onCommit only after transaction has successfully committed
        if (onCommit) {
            try {
                await onCommit()
            } catch (postCommitError) {
                // Log but don't fail — the data is already committed
                await createLogs({
                    logs: [{
                        level: 'WARN',
                        type: context.action,
                        message: `Post-commit callback error: ${postCommitError instanceof Error ? postCommitError.message : String(postCommitError)}`,
                        user_id: context.userId
                    }]
                })
            }
        }

        return { success: true, data: result }
    } catch (error) {
        await createLogs({
            logs: [{
                level: 'ERROR',
                type: context.action,
                message: `Transaction failed: ${error instanceof Error ? error.message : String(error)}`,
                user_id: context.userId
            }]
        })
        return { success: false, error: `Operation failed: ${error instanceof Error ? error.message : String(error)}` }
    }
}
```

- [ ] **Step 2: Verify no compile errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No errors referencing `withTransaction` signature mismatch (the new `onCommit` param is optional, so existing call sites are compatible).

- [ ] **Step 3: Commit**

```bash
git add server/db/transactions.ts
git commit -m "feat(db): add onCommit callback to withTransaction for post-commit side effects"
```

---

### Task 2: Disable Cache in Metrics Server Actions

**Files:**
- Modify: `server/actions/metrics.ts`

**Why:** This is the largest mechanical change — remove 28 `cache.get()`/`cache.set()` call pairs across ~16 functions. Do this early so all subsequent testing uses fresh data.

- [ ] **Step 1: Remove all `cache.get()` check blocks and `cache.set()` calls**

For every function in `server/actions/metrics.ts` that has a `cache.get()` call:
1. Delete the `cacheKey` variable declaration
2. Delete the `const cached = cache.get<...>(cacheKey)` line and the `if (cached) { return success(cached) }` block
3. Delete the `cache.set(cacheKey, ..., METRICS_CACHE_TTL)` line

The functions to edit (in file order):
- `getScopedFinancialMetrics` (lines ~100-144)
- `getRevenueTrend` (lines ~182-235)
- `getOperationalMetrics` (lines ~260-302)
- `getInventoryMetrics` (lines ~327-378)
- `getRatingMetrics` (lines ~399-465)
- `getStaffPerformance` (lines ~489-589)
- `getNetIncomeMetrics` (lines ~620-666)
- `getClientTypeMetrics` (lines ~696-728)
- `getStaffLeaderboard` (lines ~765-825)
- `getPLMetrics` (lines ~973-1090)
- `getExpenseBreakdown` (lines ~1122-1171)
- `getRevenueBreakdown` (lines ~1198-1242)
- `getRevenueExpenseTrend` (lines ~1272-1336)
- `getExecutiveAccountingMetrics` (lines ~1373-1610)
- `getBusinessInsightsMetrics` (lines ~1870-1896)

For each, the pattern to remove is:

**Before (example):**
```typescript
const cacheKey = `financial_metrics:${startDate}:${endDate}:${branchId || 'all'}:${paymentMethod || 'all'}`
const cached = cache.get<FinancialMetrics>(cacheKey)
if (cached) {
    return success(cached)
}
```
And at the end:
```typescript
cache.set(cacheKey, metrics, METRICS_CACHE_TTL)
```

**After:** Just delete both blocks. The DB query runs every time.

- [ ] **Step 2: Remove the `METRICS_CACHE_TTL` constant and the `cache` import**

At the top of `server/actions/metrics.ts`, delete:
```typescript
const METRICS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
```
And remove `cache` from the import line (or remove the entire import if `cache` is the only import from that module).

- [ ] **Step 3: Add `forceRefresh` parameter to all public metrics action signatures**

For each exported function that was cached, add `forceRefresh?: boolean` as the last parameter. This is an API documentation marker — currently a no-op since caching is disabled, but signals that recalculation is always available. Example:

```typescript
export async function getScopedFinancialMetrics(
    startDate: string,
    endDate: string,
    branchId?: string,
    paymentMethod?: string,
    forceRefresh?: boolean  // <-- add this
): Promise<ActionResponse<FinancialMetrics>> {
```

Apply this to all 15 public functions listed in Step 1.

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No errors. The `forceRefresh` parameter is optional with no default. Unused parameters in TypeScript generate warnings at most, not errors.

- [ ] **Step 5: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "feat(metrics): disable in-memory cache, add forceRefresh param to all actions"
```

**Validation:** Run `npm run build` and verify no type errors. Open the metrics page in the browser — data should load identically to before (just slower by ~50-200ms per call since cache is bypassed).

---

## Phase 2: Server Foundation — Entry Mutation Robustness

These tasks fix the critical data integrity issues in accounting server actions.

---

### Task 3: Fix try/catch Boundaries in `createLedgerEntry` and `updateLedgerEntry`

**Files:**
- Modify: `server/actions/accounting.ts`

**Why:** Currently, if `db.insert()` succeeds but `createLogs()` throws, the function returns `failure` even though the entry was persisted. This causes duplicate entries on user retry.

- [ ] **Step 1: Extract a post-persist side-effect helper**

Add this helper function at the top of `accounting.ts` (after the imports, before any exported function):

```typescript
/**
 * Fires post-persist side effects (revalidation, cache invalidation, logging).
 * Each side effect is individually wrapped in try/catch so that failure of one
 * does not prevent the others from running, nor mask the success of the DB write.
 */
async function firePostPersistSideEffects(actions: (() => void | Promise<void>)[]): Promise<void> {
    for (const action of actions) {
        try {
            await action()
        } catch (err) {
            // Suppress — the primary DB write succeeded. Log for observability.
            await logError({
                type: 'ACCOUNTING',
                message: `Post-persist side effect failed: ${err instanceof Error ? err.message : String(err)}`
            })
        }
    }
}
```

- [ ] **Step 2: Refactor `createLedgerEntry` — split try/catch into primary + side effects**

Inside `createLedgerEntry`, restructure the try/catch block:

1. The `try` block should contain ONLY: validation + `db.insert()` + build `transformedEntry`.
2. After `db.insert()` succeeds and before the catch, call `firePostPersistSideEffects()`.
3. Return `success(transformedEntry)` AFTER side effects (even if side effects had suppressed errors).

Replace the entire try/catch body of `createLedgerEntry` with:

```typescript
    try {
        // --- VALIDATION (unchanged) ---
        const sanitizedDescription = sanitizeText(payload.description)
        if (!sanitizedDescription) {
            return failure('Description is required')
        }

        const validation = validateSingleEntry(payload.debit, payload.credit)
        if (!validation.valid) {
            return failure(validation.error!)
        }

        if (payload.debit > 0 && payload.credit > 0) {
            return failure('Only one of debit or credit should be entered')
        }

        const entryDate = new Date(payload.entry_date)
        const now = new Date()
        const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
        const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate())

        if (entryDate > oneYearFromNow) {
            return failure('Entry date cannot be more than 1 year in the future')
        }

        if (entryDate < tenYearsAgo) {
            return failure('Entry date cannot be more than 10 years in the past')
        }

        const periodLocked = await getAccountingPeriodLock()
        if (periodLocked.success && periodLocked.data) {
            const { locked_until } = periodLocked.data
            if (locked_until && entryDate <= new Date(locked_until)) {
                return failure('Cannot create entries for locked accounting periods')
            }
        }

        // --- CATEGORY VALIDATION (unchanged) ---
        let categoryId: string | undefined
        if (payload.category) {
            const categoryCheck = await db
                .select()
                .from(accountingCategory)
                .where(eq(accountingCategory.name, sanitizeText(payload.category)))
                .limit(1)

            if (categoryCheck.length === 0) {
                const sanitizedName = sanitizeText(payload.category)
                const [newCategory] = await db
                    .insert(accountingCategory)
                    .values({
                        name: sanitizedName,
                        type: payload.entry_type,
                        isActive: true,
                    })
                    .returning()

                categoryId = newCategory.id

                createLogs({
                    logs: [{
                        level: 'INFO',
                        type: 'ACCOUNTING',
                        message: `Auto-created accounting category: ${sanitizedName} (${newCategory.id}) type: ${payload.entry_type}`,
                    }],
                })
            } else if (!categoryCheck[0].isActive) {
                return failure('Category is archived and cannot be used')
            } else {
                if (categoryCheck[0].type !== payload.entry_type) {
                    return failure(`Category type (${categoryCheck[0].type}) does not match entry type (${payload.entry_type})`)
                }
                categoryId = categoryCheck[0].id
            }
        }

        // --- PROOF UPLOAD (unchanged) ---
        let proofUrl: string | undefined
        if (payload.proof_file) {
            const buffer = Buffer.from(await payload.proof_file.arrayBuffer())
            const extension = payload.proof_file.name.split('.').pop() || 'jpg'
            const key = `accounting-proofs/${Date.now()}.${extension}`
            const uploadResult = await uploadFile(buffer, key, payload.proof_file.type)
            proofUrl = uploadResult.url
        }

        // --- PRIMARY DB WRITE ---
        const [entry] = await db
            .insert(generalLedger)
            .values({
                entryDate: payload.entry_date,
                entryType: payload.entry_type,
                category: payload.category,
                categoryId: categoryId,
                description: sanitizedDescription,
                reference: payload.reference ? sanitizeMinimal(payload.reference) : null,
                debit: String(payload.debit),
                credit: String(payload.credit),
                sourceType: payload.source_type,
                sourceId: payload.source_id,
                createdBy: user.id,
                proofUrl: proofUrl,
                branchId: payload.branch_id,
                paymentMethod: payload.payment_method || null,
            })
            .returning()

        const transformedEntry: LedgerEntry = {
            id: entry.id,
            created_at: entry.createdAt,
            entry_date: entry.entryDate,
            entry_type: entry.entryType as LedgerEntryType,
            category: entry.category || undefined,
            description: entry.description,
            reference: entry.reference || undefined,
            debit: Number(entry.debit),
            credit: Number(entry.credit),
            source_type: (entry.sourceType as LedgerSourceType) || undefined,
            source_id: entry.sourceId || undefined,
            created_by: entry.createdBy,
            updated_at: entry.updatedAt || undefined,
            updated_by: entry.updatedBy || undefined,
            proof_url: entry.proofUrl || undefined,
            is_voided: entry.isVoided,
            voided_at: entry.voidedAt || undefined,
            voided_by: entry.voidedBy || undefined,
            void_reason: entry.voidReason || undefined,
            branch_id: entry.branchId,
            payment_method: (entry.paymentMethod as AccountingPaymentMethod) || undefined,
        }

        // --- POST-PERSIST SIDE EFFECTS (failures suppressed) ---
        await firePostPersistSideEffects([
            () => createLogs({
                logs: [{
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Ledger entry created: ${entry.id} by ${user.id}`,
                }],
            }),
            () => revalidatePath('/accounting'),
            () => cache.invalidate('financial_metrics'),
            () => cache.invalidate('net_income'),
            () => cache.invalidate('ledger_summary'),
            () => cache.invalidate('revenue_trend'),
            () => cache.invalidate('pl_metrics'),
            () => cache.invalidate('expense_breakdown'),
            () => cache.invalidate('revenue_expense_trend'),
            () => cache.invalidate('business_insights'),
            () => cache.invalidate('exec_accounting'),
        ])

        // Entry is persisted. Return success regardless of side-effect outcomes.
        return success(transformedEntry)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error creating ledger entry: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to create ledger entry')
    }
```

- [ ] **Step 3: Apply same pattern to `updateLedgerEntry`**

Inside `updateLedgerEntry`, after the `db.update()` call, replace the direct `createLogs()` + `revalidatePath()` + `cache.invalidate()` block with:

```typescript
        // --- POST-PERSIST SIDE EFFECTS (failures suppressed) ---
        await firePostPersistSideEffects([
            () => createLogs({
                logs: [{
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Ledger entry updated: ${id} by ${user.id}`,
                }],
            }),
            () => revalidatePath('/accounting'),
            () => cache.invalidate('financial_metrics'),
            () => cache.invalidate('net_income'),
            () => cache.invalidate('ledger_summary'),
            () => cache.invalidate('revenue_trend'),
            () => cache.invalidate('pl_metrics'),
            () => cache.invalidate('expense_breakdown'),
            () => cache.invalidate('revenue_expense_trend'),
            () => cache.invalidate('business_insights'),
            () => cache.invalidate('exec_accounting'),
        ])

        return success(undefined)
```

Remove the old direct calls to `createLogs`, `revalidatePath`, and the 9 `cache.invalidate()` calls.

- [ ] **Step 4: Apply same pattern to `voidLedgerEntry`**

Inside `voidLedgerEntry`, after the `db.update()` call, replace the direct cache-invalidation block with `firePostPersistSideEffects()` using the same 11-item array (log + revalidate + 9 cache invalidations).

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): restructure try/catch so persisted entries always return success"
```

---

### Task 4: Fix `createJournalEntry` Revalidation Timing + Auto-Entry Cache Invalidation

**Files:**
- Modify: `server/actions/accounting.ts`

**Why:** Currently `createJournalEntry` calls `revalidatePath` and `cache.invalidate` INSIDE the `withTransaction` callback (before commit). Also, `createAutoLedgerEntry` doesn't invalidate the 9 metrics cache keys, only calls `revalidatePath`.

- [ ] **Step 1: Move `createJournalEntry` side effects to `onCommit`**

Find the `createJournalEntry` function. Currently the `cache.invalidate()` and `revalidatePath()` calls are inside the `operations` callback passed to `withTransaction`. Move them to the new `onCommit` parameter:

**Before (approximate):**
```typescript
return await withTransaction(async (tx) => {
    // ... insert entries ...
    
    cache.invalidate('financial_metrics')
    // ... 8 more cache.invalidate calls ...
    
    revalidatePath('/accounting')
    revalidatePath('/metrics')
    
    return { entryIds }
}, { action: 'ACCOUNTING', userId: user.id })
```

**After:**
```typescript
return await withTransaction(async (tx) => {
    // ... insert entries (unchanged) ...
    
    return { entryIds }
}, { action: 'ACCOUNTING', userId: user.id }, async () => {
    // onCommit — fires only after transaction commits
    await firePostPersistSideEffects([
        () => revalidatePath('/accounting'),
        () => revalidatePath('/metrics'),
        () => cache.invalidate('financial_metrics'),
        () => cache.invalidate('net_income'),
        () => cache.invalidate('ledger_summary'),
        () => cache.invalidate('revenue_trend'),
        () => cache.invalidate('pl_metrics'),
        () => cache.invalidate('expense_breakdown'),
        () => cache.invalidate('revenue_expense_trend'),
        () => cache.invalidate('business_insights'),
        () => cache.invalidate('exec_accounting'),
    ])
})
```

- [ ] **Step 2: Add cache invalidation to `createAutoLedgerEntry`**

Currently `createAutoLedgerEntry` only calls:
```typescript
revalidatePath('/accounting')
revalidatePath('/metrics')
```

Add the 9 `cache.invalidate()` calls, wrapped in `firePostPersistSideEffects`:

Replace:
```typescript
        revalidatePath('/accounting')
        revalidatePath('/metrics')

        return success({ id: entry.id })
```

With:
```typescript
        await firePostPersistSideEffects([
            () => revalidatePath('/accounting'),
            () => revalidatePath('/metrics'),
            () => cache.invalidate('financial_metrics'),
            () => cache.invalidate('net_income'),
            () => cache.invalidate('ledger_summary'),
            () => cache.invalidate('revenue_trend'),
            () => cache.invalidate('pl_metrics'),
            () => cache.invalidate('expense_breakdown'),
            () => cache.invalidate('revenue_expense_trend'),
            () => cache.invalidate('business_insights'),
            () => cache.invalidate('exec_accounting'),
        ])

        return success({ id: entry.id })
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix(accounting): move revalidation post-commit via onCommit; add cache invalidation to auto-entries"
```

---

### Task 5: Add Idempotency Guard for Auto-Entries (DB Migration)

**Files:**
- Create: `drizzle/0010_auto_entry_idempotency.sql`

**Why:** No database-level constraint prevents duplicate `(source_type, source_id)` auto-entries. A retry from sales/payroll creates duplicates.

- [ ] **Step 1: Generate migration file**

Run: `npx drizzle-kit generate` — this generates the next migration SQL. However, since we need a raw SQL migration (Drizzle ORM doesn't natively support partial unique indexes), we need to write it manually.

Create the file `drizzle/0010_auto_entry_idempotency.sql`:

```sql
-- Partial unique index to prevent duplicate auto-entries.
-- Only applies when source_type AND source_id are both non-null AND entry is not voided.
-- A voided entry frees the (source_type, source_id) slot for re-creation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_auto_ledger_entry_source
    ON general_ledger (source_type, source_id)
    WHERE source_type IS NOT NULL
      AND source_id IS NOT NULL
      AND is_voided = false;
```

- [ ] **Step 2: Register migration in Drizzle journal**

Append to `drizzle/meta/_journal.json` entries array:

```json
{
    "idx": 10,
    "version": "7",
    "when": 1777000000000,
    "tag": "0010_auto_entry_idempotency",
    "breakpoints": true
}
```

Use the current Unix timestamp in milliseconds for `when`.

- [ ] **Step 3: Apply migration locally**

Run: `npx drizzle-kit migrate`
Expected: Migration applied successfully, no errors about duplicate index.

- [ ] **Step 4: Update `createAutoLedgerEntry` to handle unique violation gracefully**

In `server/actions/accounting.ts`, inside `createAutoLedgerEntry`, wrap the `dbClient.insert()` in a try/catch that catches the unique violation and falls back to selecting the existing entry:

Replace:
```typescript
        const [entry] = await dbClient.insert(generalLedger).values({
            // ... values ...
        }).returning({ id: generalLedger.id })
```

With:
```typescript
        let entryId: string

        try {
            const [inserted] = await dbClient.insert(generalLedger).values({
                entryDate: entryData.entry_date,
                entryType: entryData.entry_type,
                category: categoryName,
                categoryId: categoryId,
                description: sanitizeText(entryData.description),
                reference: entryData.reference ? sanitizeMinimal(entryData.reference) : null,
                debit: String(entryData.debit),
                credit: String(entryData.credit),
                sourceType: source,
                sourceId: sourceId,
                createdBy: userId,
                branchId: entryData.branch_id || null,
                paymentMethod: entryData.payment_method || null,
            }).returning({ id: generalLedger.id })

            entryId = inserted.id
        } catch (insertError: any) {
            // Handle unique violation: if entry already exists for this source, return it
            if (insertError?.code === '23505' && insertError?.constraint?.includes('uq_auto_ledger_entry_source')) {
                const [existing] = await dbClient
                    .select({ id: generalLedger.id })
                    .from(generalLedger)
                    .where(and(
                        eq(generalLedger.sourceType, source),
                        eq(generalLedger.sourceId, sourceId),
                        eq(generalLedger.isVoided, false)
                    ))
                    .limit(1)

                if (existing) {
                    createLogs({
                        logs: [{
                            level: 'INFO',
                            type: 'ACCOUNTING',
                            message: `Auto ledger entry already exists for ${source}:${sourceId}, returning existing id ${existing.id}`,
                        }],
                    })
                    return success({ id: existing.id })
                }
            }
            throw insertError
        }
```

Then update the log and return at the end to use `entryId`:

```typescript
        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Auto ledger entry created from ${source}: ${sourceId}`,
                },
            ],
        })

        await firePostPersistSideEffects([
            () => revalidatePath('/accounting'),
            () => revalidatePath('/metrics'),
            () => cache.invalidate('financial_metrics'),
            () => cache.invalidate('net_income'),
            () => cache.invalidate('ledger_summary'),
            () => cache.invalidate('revenue_trend'),
            () => cache.invalidate('pl_metrics'),
            () => cache.invalidate('expense_breakdown'),
            () => cache.invalidate('revenue_expense_trend'),
            () => cache.invalidate('business_insights'),
            () => cache.invalidate('exec_accounting'),
        ])

        return success({ id: entryId })
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add drizzle/ server/actions/accounting.ts
git commit -m "feat(accounting): add partial unique index for auto-entry idempotency + graceful duplicate handling"
```

---

### Task 6: Make `importAccountingEntries` Transactional

**Files:**
- Modify: `server/actions/accounting-import.ts`

**Why:** Currently the import inserts in batches of 100. If batch 3/5 fails, batches 1-2 are already committed — partial import with no rollback.

- [ ] **Step 1: Rewrite the insert loop inside `withTransaction()`**

Replace the try/catch block at the bottom of `importAccountingEntries` (the `try { // Insert entries in batches ... }` block) with:

```typescript
    const result = await withTransaction(async (tx) => {
        // Insert entries in batches within the transaction
        const BATCH_SIZE = 100
        let created = 0

        for (let i = 0; i < entriesToInsert.length; i += BATCH_SIZE) {
            const batch = entriesToInsert.slice(i, i + BATCH_SIZE)
            await tx.insert(generalLedger).values(batch)
            created += batch.length
        }

        return created
    }, { action: 'ACCOUNTING', userId })

    if (result.success) {
        createLogs({
            logs: [{
                level: 'INFO',
                type: 'ACCOUNTING',
                message: `Imported ${result.data} accounting entries via CSV`,
                user_id: userId,
                branch_id: branchId ?? undefined,
            }]
        })
        revalidatePath('/accounting')

        return {
            success: true,
            created: result.data,
            errors: []
        }
    } else {
        await logError({
            type: 'ACCOUNTING',
            message: `Failed to import accounting entries: ${result.error}`
        })
        return {
            success: false,
            created: 0,
            errors: [result.error || 'Failed to import entries']
        }
    }
```

Note: Remove the old `try/catch` that wrapped the batch loop. The `withTransaction` handles the error case.

Also add the required import at the top of the file:
```typescript
import { withTransaction } from '@/server/db/transactions'
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add server/actions/accounting-import.ts
git commit -m "fix(accounting): wrap CSV import in transaction for atomic rollback on failure"
```

---

### Task 7: Add `restoreLedgerEntry` Server Action + Add `voided_only` Filter to `getLedgerEntries`

**Files:**
- Modify: `server/actions/accounting.ts`

**Why:** The Trash tab needs a `restoreLedgerEntry` action and the ability to fetch only voided entries.

- [ ] **Step 1: Add `voided_only` filter to `getLedgerEntries`**

In the `GetLedgerEntriesOptions` interface, add to `filters`:

In `utils/types/ledger.ts`, find the `LedgerFilters` interface and add:

```typescript
export interface LedgerFilters {
    entry_type?: LedgerEntryType
    category?: string
    source_type?: LedgerSourceType
    search?: string
    include_voided?: boolean
    voided_only?: boolean      // <-- ADD THIS
    payment_method?: AccountingPaymentMethod
}
```

Then in `getLedgerEntries` in `server/actions/accounting.ts`, after the `include_voided` condition block, add:

```typescript
        if (filters?.voided_only) {
            conditions.push(eq(generalLedger.isVoided, true))
        }
```

- [ ] **Step 2: Implement `restoreLedgerEntry`**

Add this new exported function after `voidLedgerEntry` in `server/actions/accounting.ts`:

```typescript
export async function restoreLedgerEntry(
    id: string
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user || user.role !== 'admin') {
        return failure('Unauthorized: admin access required')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        // Check if entry exists and is voided
        const existing = await db
            .select()
            .from(generalLedger)
            .where(eq(generalLedger.id, id))
            .limit(1)

        if (existing.length === 0) {
            return failure('Entry not found')
        }

        if (!existing[0].isVoided) {
            return failure('Entry is not voided — nothing to restore')
        }

        // Check if period is locked for the original entry date
        const lockResult = await getAccountingPeriodLock()
        if (lockResult.success && lockResult.data) {
            const { locked_until } = lockResult.data
            if (locked_until && new Date(existing[0].entryDate) <= new Date(locked_until)) {
                return failure('Cannot restore entry: this accounting period is locked')
            }
        }

        // Check for idempotency conflict: if this was an auto-entry, is there already
        // a non-voided entry for the same source?
        if (existing[0].sourceType && existing[0].sourceId) {
            const conflictCheck = await db
                .select({ id: generalLedger.id })
                .from(generalLedger)
                .where(and(
                    eq(generalLedger.sourceType, existing[0].sourceType),
                    eq(generalLedger.sourceId, existing[0].sourceId),
                    eq(generalLedger.isVoided, false)
                ))
                .limit(1)

            if (conflictCheck.length > 0) {
                return failure('Cannot restore: a non-voided entry already exists for this source. Void the current entry first, then restore this one.')
            }
        }

        await db
            .update(generalLedger)
            .set({
                isVoided: false,
                voidedAt: null,
                voidedBy: null,
                voidReason: null,
                updatedAt: new Date(),
                updatedBy: user.id,
            })
            .where(eq(generalLedger.id, id))

        await firePostPersistSideEffects([
            () => createLogs({
                logs: [{
                    level: 'INFO',
                    type: 'ACCOUNTING',
                    message: `Ledger entry restored: ${id} by ${user.id}`,
                }],
            }),
            () => revalidatePath('/accounting'),
            () => cache.invalidate('financial_metrics'),
            () => cache.invalidate('net_income'),
            () => cache.invalidate('ledger_summary'),
            () => cache.invalidate('revenue_trend'),
            () => cache.invalidate('pl_metrics'),
            () => cache.invalidate('expense_breakdown'),
            () => cache.invalidate('revenue_expense_trend'),
            () => cache.invalidate('business_insights'),
            () => cache.invalidate('exec_accounting'),
        ])

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error restoring ledger entry: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to restore ledger entry')
    }
}
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add server/actions/accounting.ts utils/types/ledger.ts
git commit -m "feat(accounting): add restoreLedgerEntry action + voided_only filter"
```

---

## Phase 3: Client-Side Data Layer — Race Condition Fix & Retry

---

### Task 8: Add Request Versioning to Accounting Page

**Files:**
- Modify: `app/accounting/accountingPage.tsx`

**Why:** Currently, rapidly changing filters causes stale results from an earlier request to overwrite the correct results from a later request, and the loading spinner disappears too early.

- [ ] **Step 1: Add `requestIdRef` and modify `fetchData`**

At the top of the `AccountingPageClient` function, after the existing refs:

```typescript
const requestIdRef = useRef(0)
```

Replace the entire `fetchData` useCallback with:

```typescript
const fetchData = useCallback(async () => {
    const thisRequestId = ++requestIdRef.current
    setLoading(true)
    try {
        const [entriesResult, summaryResult, categoriesResult, taxData, breakdownResult, trialResult] =
            await Promise.all([
                getLedgerEntries({
                    filters: {
                        entry_type: typeFilter || undefined,
                        category: categoryFilter || undefined,
                        search: searchQuery || undefined,
                        payment_method: paymentMethodFilter || undefined,
                    },
                    branchId: currentBranch?.id,
                    datePreset,
                    startDate:
                        datePreset === "custom"
                            ? customStartDate
                            : undefined,
                    endDate:
                        datePreset === "custom" ? customEndDate : undefined,
                    page,
                    pageSize: PAGE_SIZE,
                }),
                getLedgerSummary(
                    datePreset,
                    customStartDate,
                    customEndDate,
                    currentBranch?.id,
                    {
                        entry_type: typeFilter || undefined,
                        category: categoryFilter || undefined,
                        payment_method: paymentMethodFilter || undefined,
                    }
                ),
                getAccountingCategories(false),
                getSetting("currency_tax"),
                getLedgerDetailBreakdown(
                    datePreset,
                    customStartDate,
                    customEndDate,
                    currentBranch?.id,
                    {
                        entry_type: typeFilter || undefined,
                        category: categoryFilter || undefined,
                        payment_method: paymentMethodFilter || undefined,
                    }
                ),
                getTrialBalance(datePreset, customStartDate, customEndDate, currentBranch?.id),
            ])

        // Discard stale results if a newer request was fired
        if (requestIdRef.current !== thisRequestId) return

        if (entriesResult.success) {
            setEntries(entriesResult.data.data)
            setTotal(entriesResult.data.total)
        } else {
            addNotification(
                entriesResult.error || "Failed to load entries",
                "ERROR",
            )
        }

        if (summaryResult.success && summaryResult.data) {
            setSummary(summaryResult.data)
        }

        if (breakdownResult.success && breakdownResult.data) {
            setDetailBreakdown(breakdownResult.data)
        }

        if (trialResult.success && trialResult.data) {
            setTrialBalanceData(trialResult.data)
        }

        if (categoriesResult.success) {
            setCategories(categoriesResult.data)
        } else {
            addNotification(
                categoriesResult.error || "Failed to load categories",
                "ERROR",
            )
        }

        if (taxData && taxData.success && taxData.data) {
            const settings = taxData.data as CurrencyTaxValue
            setCurrencySymbol(settings.currency_symbol)
        }
    } catch (error) {
        // Still check version before showing error
        if (requestIdRef.current !== thisRequestId) return

        await logError({
            type: "ACCOUNTING",
            message: `Error fetching accounting data: ${error instanceof Error ? error.message : String(error)}`,
        })
        addNotification("Failed to load accounting data", "ERROR")
    } finally {
        // Only clear loading if this is the most recent request
        if (requestIdRef.current === thisRequestId) {
            setLoading(false)
        }
    }
}, [
    addNotification,
    typeFilter,
    categoryFilter,
    searchQuery,
    currentBranch?.id,
    datePreset,
    customStartDate,
    customEndDate,
    page,
    paymentMethodFilter,
])
```

Key differences from the original:
1. `const thisRequestId = ++requestIdRef.current` at the top
2. After `Promise.all` resolves, check `if (requestIdRef.current !== thisRequestId) return`
3. In both catch and finally blocks, version-check before updating state
4. `setLoading(false)` only fires in `finally` if the request is still the latest

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "fix(accounting): add request versioning to eliminate filter race condition"
```

**Validation:** Open the accounting page. Change a filter rapidly (e.g., switch payment method, then immediately switch date range). The loading spinner should stay visible until the LATEST filter combination's results return. No intermediate stale data should flash.

---

### Task 9: Create Retry Utility + Apply to EntryModal

**Files:**
- Create: `utils/retry.ts`
- Modify: `components/accounting/EntryModal.tsx`

**Why:** Network errors on `createLedgerEntry` calls fail without retry. The user re-submits and creates duplicates (or the entry was created but the response was lost).

- [ ] **Step 1: Create the retry utility**

Create `utils/retry.ts`:

```typescript
/**
 * Lightweight retry wrapper for server action calls.
 * Only retries on thrown errors (network/transport failures).
 * Never retries on ActionResponse failures (validation/logic errors).
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: {
        maxAttempts?: number
        baseDelayMs?: number
    } = {}
): Promise<T> {
    const { maxAttempts = 3, baseDelayMs = 1000 } = options
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error
            if (attempt < maxAttempts) {
                const delay = baseDelayMs * Math.pow(2, attempt - 1)
                await new Promise(resolve => setTimeout(resolve, delay))
            }
        }
    }

    throw lastError
}
```

- [ ] **Step 2: Apply retry wrapper in EntryModal**

In `components/accounting/EntryModal.tsx`:

1. Add the import:
```typescript
import { withRetry } from "@/utils/retry"
```

2. In `handleSubmit`, wrap the server action calls:

Replace:
```typescript
        setLoading(true)
        try {
            if (entry && isAdmin) {
                const result = await updateLedgerEntry(entry.id, {
                    // ... fields ...
                })
                if (result.success) {
                    onSuccess()
                } else {
                    setError(result.error || "Failed to update entry")
                }
            } else {
                const payload = {
                    // ... fields ...
                }
                const result = await createLedgerEntry(payload)
                if (result.success) {
                    onSuccess()
                } else {
                    setError(result.error || "Failed to create entry")
                }
            }
        } catch (error) {
            console.error("Error saving entry:", error)
            setError("An unexpected error occurred")
        } finally {
            setLoading(false)
        }
```

With:
```typescript
        setLoading(true)
        try {
            if (entry && isAdmin) {
                const result = await withRetry(() => updateLedgerEntry(entry.id, {
                    entry_date: formData.entry_date,
                    entry_type: formData.entry_type,
                    category: formData.category,
                    description: formData.description,
                    reference: formData.reference,
                    debit: formData.debit,
                    credit: formData.credit,
                    branch_id: selectedBranchId,
                    payment_method: selectedPaymentMethod || undefined,
                }))
                if (result.success) {
                    onSuccess()
                } else {
                    setError(result.error || "Failed to update entry")
                }
            } else {
                const payload = {
                    ...formData,
                    proof_file: proofFile,
                    branch_id: selectedBranchId,
                    payment_method: selectedPaymentMethod || undefined,
                }
                const result = await withRetry(() => createLedgerEntry(payload))
                if (result.success) {
                    onSuccess()
                } else {
                    setError(result.error || "Failed to create entry")
                }
            }
        } catch (error) {
            console.error("Error saving entry:", error)
            setError("An unexpected error occurred. Please check the ledger for duplicate entries before retrying.")
        } finally {
            setLoading(false)
        }
```

Key: `withRetry` catches the *thrown* error (network failure) and retries. A returned `{ success: false, error: "Description is required" }` is not a throw — so validation errors pass through immediately without retry.

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add utils/retry.ts components/accounting/EntryModal.tsx
git commit -m "feat(accounting): add retry wrapper for entry create/update with exponential backoff"
```

**Validation:** Create a new accounting entry. It should succeed on the first try (no retry needed). Check the browser DevTools network tab — only 1 server action call should be made.

---

## Phase 4: UI Restructure — 3-Tab Layout

This is the largest task. It restructures the 1225-line `accountingPage.tsx` into a tabbed interface.

---

### Task 10: Refactor Accounting Page into 3-Tab Layout (Ledger / Reports / Trash)

**Files:**
- Modify: `app/accounting/accountingPage.tsx`

This task:
1. Adds a tab state (synchronized with URL search params)
2. Wraps existing content in conditional renders per tab
3. Moves TrialBalance + PayrollBreakdown to the Reports tab
4. Adds the Trash tab with voided entries + restore button
5. Adds the `restoreLedgerEntry` import

- [ ] **Step 1: Add imports and tab state**

At the top, add imports:
```typescript
import { useSearchParams, useRouter } from "next/navigation"
import { ArchiveRestoreIcon, FileTextIcon, Trash2Icon } from "lucide-react"
import { restoreLedgerEntry } from "@/server/actions/accounting"
```

Inside the component, after the existing `const isAdmin = userInfo?.role === "admin"` line, add:

```typescript
const searchParams = useSearchParams()
const router = useRouter()
const activeTab = (searchParams.get("tab") as "ledger" | "reports" | "trash") || "ledger"

const setActiveTab = (tab: "ledger" | "reports" | "trash") => {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === "ledger") {
        params.delete("tab")
    } else {
        params.set("tab", tab)
    }
    router.replace(`/accounting?${params.toString()}`, { scroll: false })
}
```

Also add Trash tab state:
```typescript
const [trashEntries, setTrashEntries] = useState<LedgerEntry[]>([])
const [trashTotal, setTrashTotal] = useState(0)
const [trashPage, setTrashPage] = useState(1)
const [trashLoading, setTrashLoading] = useState(false)
const [trashSearch, setTrashSearch] = useState("")
const [trashDatePreset, setTrashDatePreset] = useState<DateRangePreset>("all")
const [trashCustomStartDate, setTrashCustomStartDate] = useState("")
const [trashCustomEndDate, setTrashCustomEndDate] = useState("")
const [trashRequestIdRef, setTrashRequestIdRef] = useState(0)
const trashRequestIdRefActual = useRef(0)
```

- [ ] **Step 2: Add `fetchTrashData` callback**

```typescript
const fetchTrashData = useCallback(async () => {
    const thisRequestId = ++trashRequestIdRefActual.current
    setTrashLoading(true)
    try {
        const result = await getLedgerEntries({
            filters: {
                voided_only: true,
                search: trashSearch || undefined,
            },
            datePreset: trashDatePreset,
            startDate: trashDatePreset === "custom" ? trashCustomStartDate : undefined,
            endDate: trashDatePreset === "custom" ? trashCustomEndDate : undefined,
            branchId: currentBranch?.id,
            page: trashPage,
            pageSize: PAGE_SIZE,
        })

        if (trashRequestIdRefActual.current !== thisRequestId) return

        if (result.success) {
            setTrashEntries(result.data.data)
            setTrashTotal(result.data.total)
        }
    } catch (error) {
        if (trashRequestIdRefActual.current !== thisRequestId) return
        await logError({
            type: "ACCOUNTING",
            message: `Error fetching trashed entries: ${error instanceof Error ? error.message : String(error)}`,
        })
        addNotification("Failed to load trashed entries", "ERROR")
    } finally {
        if (trashRequestIdRefActual.current === thisRequestId) {
            setTrashLoading(false)
        }
    }
}, [trashSearch, trashDatePreset, trashCustomStartDate, trashCustomEndDate, currentBranch?.id, trashPage, addNotification])
```

Add a useEffect to fetch trash data when the Trash tab is active:
```typescript
useEffect(() => {
    if (activeTab === "trash" && isAdmin) {
        fetchTrashData()
    }
}, [activeTab, isAdmin, fetchTrashData])
```

- [ ] **Step 3: Add tab bar JSX**

After the `<PageHeader>` and before the `<div className='mb-4 mt-4 space-y-4'>`, add:

```jsx
{/* Tab Bar */}
<div className='flex flex-row items-center gap-2 border-b-2 border-white/10 pb-2 mb-4'>
    <button
        onClick={() => setActiveTab("ledger")}
        className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
            activeTab === "ledger"
                ? "bg-white/10 text-white"
                : "text-white/60 hover:bg-white/5 hover:text-white"
        }`}
    >
        <BookOpenIcon className='w-4 h-4' />
        Ledger
    </button>
    <button
        onClick={() => setActiveTab("reports")}
        className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
            activeTab === "reports"
                ? "bg-white/10 text-white"
                : "text-white/60 hover:bg-white/5 hover:text-white"
        }`}
    >
        <FileTextIcon className='w-4 h-4' />
        Reports
    </button>
    {isAdmin && (
        <button
            onClick={() => setActiveTab("trash")}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
                activeTab === "trash"
                    ? "bg-red-500/20 text-red-300 border border-red-500/30"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
        >
            <Trash2Icon className='w-4 h-4' />
            Trash
        </button>
    )}
</div>
```

- [ ] **Step 4: Wrap content in tab conditionals — Ledger Tab**

Wrap the existing filter bar + summary cards + account type breakdown + payment method drilldown + ledger table in:

```jsx
{activeTab === "ledger" && (
    <>
        {/* existing content: FilterBar, Summary Cards, Account Type Breakdown, PaymentMethodDrilldown */}
        {/* ... */}
    </>
)}
```

**Important:** Remove the `<TrialBalance>` component and the Payroll Breakdown section from this block. They move to the Reports tab.

- [ ] **Step 5: Add Reports tab**

After the Ledger tab block, add:

```jsx
{activeTab === "reports" && (
    <div className='space-y-4 mb-4 mt-4'>
        {/* Trial Balance */}
        {trialBalanceData.length > 0 ? (
            <TrialBalance data={trialBalanceData} currencySymbol={currencySymbol} />
        ) : (
            <div className='bg-white/5 border border-white/10 rounded-lg p-4 text-center'>
                <p className='text-sm text-white/40'>No trial balance data for selected period</p>
            </div>
        )}

        {/* Payroll Breakdown - moved from main page */}
        <div className='mb-4'>
            <button
                onClick={() => {
                    if (!showPayrollBreakdown) {
                        fetchPayrollBreakdown()
                    }
                    setShowPayrollBreakdown(!showPayrollBreakdown)
                }}
                className='flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-sm font-medium'
            >
                <span>{showPayrollBreakdown ? '▼' : '▶'}</span>
                Payroll Breakdown
            </button>
            {showPayrollBreakdown && (
                <div className='mt-2 bg-white/5 border border-white/10 rounded-lg p-4 space-y-4'>
                    {/* Payroll filters + table — same as current code, unchanged */}
                    {/* ... copy the existing payroll breakdown JSX here ... */}
                </div>
            )}
        </div>
    </div>
)}
```

Copy the entire existing Payroll Breakdown JSX (the staff filter, service type filter, CSV export button, and table) verbatim into this section.

- [ ] **Step 6: Add Trash tab**

After the Reports tab block, add:

```jsx
{activeTab === "trash" && isAdmin && (
    <div className='space-y-4 mb-4 mt-4'>
        {/* Trash Filters */}
        <FilterBar>
            <div className='relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-xs'>
                <SearchIcon className='absolute left-3 top-1/2 -translate-y-1/2 text-white/40 w-4 h-4' />
                <input
                    type='text'
                    placeholder='Search trashed entries...'
                    className='w-full pl-9 pr-4 py-2 bg-white/10 rounded-md border-2 border-white/5 focus:border-white/20 outline-none transition-all text-white placeholder:text-white/40 text-sm'
                    value={trashSearch}
                    onChange={(e) => setTrashSearch(e.target.value)}
                />
            </div>
            <div className='flex items-center gap-2'>
                <CalendarIcon className='w-4 h-4 text-white/60' />
                <select
                    value={trashDatePreset}
                    onChange={(e) => setTrashDatePreset(e.target.value as DateRangePreset)}
                    className='bg-white/10 hover:bg-white/20 transition-colors px-3 py-2 rounded-md text-sm cursor-pointer border-2 border-white/5'
                >
                    {[
                        { key: "all", label: "All Time" },
                        { key: "today", label: "Today" },
                        { key: "this_week", label: "This Week" },
                        { key: "this_month", label: "This Month" },
                        { key: "this_year", label: "This Year" },
                        { key: "custom", label: "Custom Range" },
                    ].map((preset) => (
                        <option key={preset.key} value={preset.key}>
                            {preset.label}
                        </option>
                    ))}
                </select>
            </div>
            {trashDatePreset === "custom" && (
                <div className='flex items-center gap-2 flex-wrap'>
                    <input
                        type='date'
                        value={trashCustomStartDate}
                        onChange={(e) => setTrashCustomStartDate(e.target.value)}
                        className='px-2 py-1 bg-white/10 border-2 border-white/5 rounded-md text-sm focus:border-white/20 outline-none'
                    />
                    <span className='text-white/40'>to</span>
                    <input
                        type='date'
                        value={trashCustomEndDate}
                        onChange={(e) => setTrashCustomEndDate(e.target.value)}
                        className='px-2 py-1 bg-white/10 border-2 border-white/5 rounded-md text-sm focus:border-white/20 outline-none'
                    />
                </div>
            )}
        </FilterBar>

        {/* Trash Info */}
        <div className='bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-300'>
            {trashTotal} voided {trashTotal === 1 ? 'entry' : 'entries'}. Restoring an entry makes it active again in the ledger.
        </div>

        {/* Trash Table */}
        <div className='min-h-full overflow-auto'>
            <table className='min-w-max w-full table-auto border-collapse relative'>
                <thead className='sticky top-0 bg-black/80 z-10'>
                    <tr className='text-nowrap select-none'>
                        <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Date</th>
                        <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Type</th>
                        <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Category</th>
                        <th className='text-right px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Debit</th>
                        <th className='text-right px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Credit</th>
                        <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Description</th>
                        <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Voided By</th>
                        <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Void Reason</th>
                        <th className='text-center px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {trashLoading ? (
                        <tr>
                            <td colSpan={9} className='px-4 py-12 text-center text-white/60'>
                                <LoaderCircleIcon className='w-8 h-8 animate-spin mx-auto' />
                                <p className='mt-2'>Loading trashed entries...</p>
                            </td>
                        </tr>
                    ) : trashEntries.length === 0 ? (
                        <tr>
                            <td colSpan={9} className='px-4 py-12 text-center text-white/60'>
                                <Trash2Icon className='w-8 h-8 opacity-20 mx-auto' />
                                <p className='mt-2'>No voided entries</p>
                            </td>
                        </tr>
                    ) : (
                        trashEntries.map((entry) => (
                            <tr key={entry.id} className='border-b border-white/5 opacity-60 hover:opacity-80 transition-opacity'>
                                <td className='px-4 py-2 text-sm text-white/80'>
                                    {safeFormatDate(entry.entry_date)}
                                </td>
                                <td className='px-4 py-2 text-sm'>
                                    <span className={`text-xs px-2 py-0.5 rounded border ${ENTRY_TYPE_COLORS[entry.entry_type]}`}>
                                        {entry.entry_type}
                                    </span>
                                </td>
                                <td className='px-4 py-2 text-sm text-white/80'>
                                    {entry.category || <span className='text-white/30'>-</span>}
                                </td>
                                <td className='px-4 py-2 text-sm text-right text-red-300'>
                                    {Number(entry.debit) > 0 ? `${currencySymbol}${Number(entry.debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                </td>
                                <td className='px-4 py-2 text-sm text-right text-green-300'>
                                    {Number(entry.credit) > 0 ? `${currencySymbol}${Number(entry.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                </td>
                                <td className='px-4 py-2 text-sm text-white/60 line-through max-w-xs truncate'>
                                    {entry.description}
                                </td>
                                <td className='px-4 py-2 text-sm text-red-300'>
                                    {entry.voided_at ? safeFormatDate(entry.voided_at) : '-'}
                                </td>
                                <td className='px-4 py-2 text-sm text-white/60 max-w-xs truncate'>
                                    {entry.void_reason || '-'}
                                </td>
                                <td className='px-4 py-2 text-sm text-center'>
                                    <button
                                        onClick={async () => {
                                            const result = await restoreLedgerEntry(entry.id)
                                            if (result.success) {
                                                addNotification("Entry restored successfully", "SUCCESS")
                                                fetchTrashData()
                                                fetchData()
                                            } else {
                                                addNotification(result.error || "Failed to restore entry", "ERROR")
                                            }
                                        }}
                                        className='text-yellow-400 hover:text-yellow-300 transition-colors'
                                        title='Restore entry'
                                    >
                                        <ArchiveRestoreIcon className='w-4 h-4' />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>

        {/* Trash Pagination */}
        {Math.ceil(trashTotal / PAGE_SIZE) > 1 && (
            <div className='flex items-center justify-between py-4 border-t border-white/10'>
                <p className='text-sm text-white/60'>
                    Showing {(trashPage - 1) * PAGE_SIZE + 1} - {Math.min(trashPage * PAGE_SIZE, trashTotal)} of {trashTotal}
                </p>
                <div className='flex items-center gap-2'>
                    <button
                        onClick={() => setTrashPage((p) => Math.max(1, p - 1))}
                        disabled={trashPage === 1}
                        className='px-3 py-1 bg-white/10 hover:bg-white/20 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                    >
                        Previous
                    </button>
                    <span className='text-sm text-white/60'>
                        Page {trashPage} of {Math.ceil(trashTotal / PAGE_SIZE)}
                    </span>
                    <button
                        onClick={() => setTrashPage((p) => Math.min(Math.ceil(trashTotal / PAGE_SIZE), p + 1))}
                        disabled={trashPage === Math.ceil(trashTotal / PAGE_SIZE)}
                        className='px-3 py-1 bg-white/10 hover:bg-white/20 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                    >
                        Next
                    </button>
                </div>
            </div>
        )}
    </div>
)}
```

- [ ] **Step 7: Update the accounting page wrapper to support `useSearchParams`**

The accounting page file is a client component. For `useSearchParams` to work, the nearest `Suspense` boundary must exist. The `app/accounting/page.tsx` server component likely wraps the client component.

Update `app/accounting/page.tsx` to wrap the client component in `<Suspense>`:

```typescript
import { Suspense } from 'react'
import AccountingPageClient from './accountingPage'

export default function AccountingPage() {
    return (
        <Suspense>
            <AccountingPageClient />
        </Suspense>
    )
}
```

- [ ] **Step 8: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add app/accounting/accountingPage.tsx app/accounting/page.tsx
git commit -m "feat(accounting): restructure into 3-tab layout (Ledger/Reports/Trash) with trash restore"
```

**Validation:**
1. Open `/accounting` — should show the Ledger tab by default
2. Click "Reports" tab — Trial Balance and Payroll Breakdown should appear
3. Click "Trash" tab (admin only) — should show voided entries with restore button
4. Verify URL updates: `/accounting?tab=reports` / `/accounting?tab=trash`
5. Verify Ledger tab still works: filters, summary cards, table, pagination
6. Verify request versioning: rapidly change filters, confirm no stale data flashes

---

### Task 11: Add Debounce to Search Input

**Files:**
- Modify: `app/accounting/accountingPage.tsx`

**Why:** Every keystroke in the search box fires `fetchData` (since `searchQuery` is in the useCallback deps). This triggers 6 parallel server actions per keystroke.

- [ ] **Step 1: Add debounce for search query**

Inside the component, add a debounced search state:

```typescript
const [searchQueryDebounced, setSearchQueryDebounced] = useState("")
const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>()
```

Add a useEffect for debouncing:
```typescript
useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
        setSearchQueryDebounced(searchQuery)
    }, 300)
    return () => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
}, [searchQuery])
```

Replace `searchQuery` in the `fetchData` useCallback dependency array and inside the `getLedgerEntries` call with `searchQueryDebounced`:

In `fetchData`, change:
```typescript
search: searchQuery || undefined,
```
to:
```typescript
search: searchQueryDebounced || undefined,
```

And in the dependency array, change `searchQuery` to `searchQueryDebounced`.

Keep the `searchQuery` state unchanged — it's still bound to the input's `onChange`. Only the *effect trigger* uses the debounced version.

Also update the pagination-reset useEffect to use `searchQueryDebounced` instead of `searchQuery`.

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit --pretty 2>&1 | head -40`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "perf(accounting): debounce search input to reduce unnecessary server action calls"
```

**Validation:** Type "rent" rapidly in the search box. Server action calls should fire only once (after 300ms of inactivity), not 4 times.

---

### Task 12: Final Integration Verification

**Files:** None new — verification only.

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -30`
Expected: No errors.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Manual smoke test checklist**

Open the browser and verify:

| # | Check | Pass? |
|---|---|---|
| 1 | Accounting page loads with Ledger tab default | |
| 2 | Changing filters triggers loading spinner that persists until latest result returns | |
| 3 | Rapidly changing filters shows NO stale intermediate data | |
| 4 | Search input debounces (no 6-call burst per keystroke) | |
| 5 | Creating a new entry succeeds; entry immediately appears in table | |
| 6 | Voiding an entry works; entry disappears from Ledger tab | |
| 7 | Reports tab shows Trial Balance + Payroll Breakdown | |
| 8 | Trash tab (admin only) shows voided entries with void metadata | |
| 9 | Restore button on Trash tab restores entry to active ledger | |
| 10 | Restoring a locked-period entry shows error | |
| 11 | Metrics page loads and shows current data (no 5-min cache delay) | |
| 12 | CSV import rolls back entirely on any row failure | |

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: accounting & metrics robustness overhaul — complete"
```

---

## Dependency Graph

```
Task 1 (withTransaction onCommit)
  └─→ Task 4 (createJournalEntry revalidation)
       └─→ Task 3 (firePostPersistSideEffects — shares the helper)

Task 2 (disable metrics cache) ── independent

Task 5 (idempotency migration + auto-entry) ── independent
  └─→ Task 7 (restoreLedgerEntry) depends on firePostPersistSideEffects from Task 3

Task 6 (transactional import) ── depends on Task 1 (withTransaction)

Task 7 (restoreLedgerEntry + voided_only filter) ── depends on Task 3

Task 8 (request versioning) ── independent

Task 9 (retry wrapper) ── independent

Task 10 (3-tab UI) ── depends on Task 7 (restoreLedgerEntry) + Task 8 (request versioning)

Task 11 (search debounce) ── depends on Task 8 (needs the debounced state wired into fetchData)

Task 12 (integration verification) ── depends on all
```

**Parallelizable groups:**
- Group A (server-only, no conflicts): Tasks 1, 2, 5, 6
- Group B (accounting.ts changes, sequential): Tasks 3, 4, 7
- Group C (client-only, no conflicts): Tasks 8, 9
- Group D (UI, sequential): Tasks 10, 11
- Task 12 runs last

---

## Rollback Strategy

Each task is a single commit. If a task introduces a regression:
1. `git revert <commit-hash>` to undo that specific task
2. The dependency graph shows which downstream tasks are affected
3. Tasks 1-7 are server-only; reverting any does not break the UI (it just re-enables old behavior like caching)
4. Tasks 8-11 are client-only; reverting any just re-introduces the race condition or removes the tab layout