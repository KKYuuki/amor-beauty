# Architectural Spec: Accounting & Metrics Robustness Overhaul

**Date:** 2026-05-06
**Status:** Draft — Awaiting User Review
**Scope:** Accounting server actions, Metrics server actions, Accounting page UI, Caching layer

---

## 1. Source of Truth & Constraints

### 1.1 Domain Constraints

- **Business-critical financial data**: Accounting entries are legal/financial records. Data must never appear stale, lost, or silently dropped.
- **Multi-tenant via branches**: All queries scope by `branchId` or show shared (`branch_id IS NULL`) records.
- **Soft-delete model**: Entries are voided (`isVoided = true`), never hard-deleted. Void requires admin role + minimum 5-character reason.
- **Accounting period lock**: Entries in locked periods cannot be created, edited, or voided.
- **Auto-entry chain**: Sales, transactions, payroll, payroll-disbursements, and inventory all call `createAutoLedgerEntry()` — if this fails silently, financials become inconsistent.

### 1.2 Security Constraints

- **Authentication**: Every server action calls `getCurrentUser()` first.
- **Authorization**: `canAccessAccounting(user)` gates all accounting read actions. Admin role gates mutations (`createLedgerEntry`, `voidLedgerEntry`).
- **Input sanitization**: Descriptions are sanitized with `sanitizeText()`, references with `sanitizeMinimal()`. SQL LIKE wildcards are escaped via `escapeLike()`.
- **No injection vectors**: Drizzle ORM parameterizes all queries.

### 1.3 Architecture Constraints

- **Client-side data fetching**: All server actions are imported directly into `"use client"` components. No RSC data fetching on accounting/metrics pages.
- **Custom in-memory cache**: `utils/cache.ts` (`MemoryCache` class) — not Next.js `unstable_cache`, not `React.cache()`, not `fetch()` caching.
- **No existing AbortController or request cancellation**: Filter changes trigger new fetches but never cancel in-flight requests.
- **No existing retry or queue**: If `db.insert()` fails, the error is returned to the client with no automated retry.
- **Revalidation timing issue**: `revalidatePath()` and `cache.invalidate()` are called inside `withTransaction()` callback, meaning they execute before the DB transaction commits (they won't see the new data yet, and if the transaction rolls back, they've already invalidated/revalidated incorrectly).

---

## 2. Architectural Audit Findings

### 2.1 Issue A: Cached/Stale Data in Metrics

**Root cause:** All metrics queries (`getFinancialMetrics`, `getPLMetrics`, `getRevenueTrend`, etc.) read from the `MemoryCache` with a 5-minute TTL. On mutation, 9 cache keys are invalidated by substring match. The cache is per-process, meaning:

- If the app has multiple instances (serverless scaling), each instance has its own cache — one instance invalidates but the other still serves stale data.
- The 5-minute TTL is arbitrary; there is no user-facing "force refresh" mechanism.
- Some accounting queries (`getLedgerSummary`, `getLedgerDetailBreakdown`, `getTrialBalance`) do NOT use the cache, but metrics do. This asymmetry means accounting page data is "more fresh" than metrics page data.

**Severity:** High — financial decisions could be made on stale P&L, revenue trend, or expense breakdown data.

### 2.2 Issue B: Failed `createLedgerEntry` Creates but Reports Failure

**Root cause:** `createLedgerEntry()` has a try/catch that wraps both the db.insert and the post-insert log/revalidate/cache-invalidate calls:

1. `db.insert().returning()` succeeds — entry is persisted.
2. `createLogs()` throws (e.g., write contention, rate limit).
3. Catch fires → `logError()` + `failure('Failed to create ledger entry')` returned.
4. **The entry exists in the database**, but the user sees "Failed" and may retry, creating a duplicate.

Same pattern exists in `updateLedgerEntry()` and `createAutoLedgerEntry()`.

**Severity:** Critical — duplicate entries corrupt the general ledger. Silent data inconsistency.

### 2.3 Issue C: Filter Race Condition

**Root cause:** In `accountingPage.tsx`:

```typescript
const fetchData = useCallback(async () => {
    setLoading(true)
    // ... Promise.all([6 server actions]) ...
    setLoading(false)
}, [typeFilter, categoryFilter, searchQuery, paymentMethodFilter, datePreset, ...])

useEffect(() => { fetchData() }, [fetchData])
```

When the user changes `paymentMethodFilter` then immediately changes `datePreset`:

1. Fetch A fires (paymentMethod=X, datePreset=Y)
2. Fetch B fires (paymentMethod=X, datePreset=Z) before Fetch A resolves
3. Fetch A resolves → calls `setEntries(fetchA_data)`, `setLoading(false)` → **stale data displayed**
4. Fetch B resolves → correct data displayed, but user already saw wrong data

The `loading` spinner disappears on the first resolution, not the last. No request versioning or abort mechanism exists.

**Severity:** High — UX bug that undermines trust in financial data accuracy.

### 2.4 Issue D: No Trashed Entries Management

**Current state:** Voided entries are hidden by default (`eq(isVoided, false)` in all queries). They can be included via `include_voided: true` in filters, but:
- No UI to view/manage trashed entries
- No ability to restore a voided entry
- No filterable/sortable trash view
- No pagination for trashed entries

**Severity:** Medium — operational limitation for accountants who need to audit voided entries.

### 2.5 Issue E: UI Overcrowding

**Current state:** The accounting page stacks all sections vertically: Summary Cards → Account Type Breakdown → Payment Method Drilldown → Trial Balance → Payroll Breakdown → Ledger Table. This creates excessive scroll depth and makes it hard to focus on the ledger (the primary interaction surface).

**Severity:** Low-Medium — UX degradation, not a data integrity issue.

### 2.6 Additional Findings (Defensive Audit)

| # | Finding | Severity |
|---|---|---|
| F1 | `revalidatePath()` inside `withTransaction()` callback — fires before transaction commits. If transaction rolls back, invalidation was a no-op that cleared Next.js cache for already-stale data. | Medium |
| F2 | `createAutoLedgerEntry` doesn't invalidate the same 9 cache keys that `createLedgerEntry` does — auto-entries only call `revalidatePath`. Metrics still serve cached data after an auto-entry for up to 5 minutes. | High |
| F3 | `importAccountingEntries`: batch inserts 100 at a time. If batch 2/5 fails, batch 1 already committed. No rollback, partial import. Errors are collected but the partial success is misleading. | Medium |
| F4 | No database-level uniqueness constraint on `(sourceType, sourceId)` for auto-entries. A retry or duplicate call from the caller could create duplicate auto-entries. | Medium |
| F5 | `getLedgerSummary` performs 3 separate queries sequentially (totals → byType → byMethod). Under load, data can shift between queries, producing internally inconsistent results. | Low |
| F6 | Payroll breakdown on accounting page uses `pageSize: 100` with no pagination UI — silently truncates if more than 100 entries exist. | Medium |

---

## 3. Design Decisions by Concern

### 3.1 Concern: Data Freshness (Issues A, F2)

**Decision: Disable the MemoryCache for all accounting-related metrics queries.**

**Rationale:**
- Business-critical financial data must always reflect the current database state.
- The in-process cache is incompatible with multi-instance/serverless deployments (each instance caches independently).
- 5-minute TTL is arbitrary — no SLA exists that makes 5-minute staleness acceptable.
- **Alternative considered**: Reduce TTL to 30 seconds + add `forceRefresh` parameter. Rejected: still has multi-instance staleness window; complexity of adding force-refresh plumbing outweighs the DB load savings (these are simple indexed aggregate queries, not expensive computations).

**Implementation approach:**
1. Remove all `cache.get()` calls and cache-check blocks from `server/actions/metrics.ts`.
2. Remove all `cache.set()` calls from metrics read functions.
3. Retain `cache.invalidate()` calls in mutation functions (accounting.ts) as a no-harm safety net — they'll still clear any residual cache entries if the cache is re-enabled later.
4. Add a `forceRefresh: boolean` parameter to all metrics server action signatures (default `false`). When `true`, skip any future caching layer. This parameter serves as API-level documentation that recalculation is always possible even if a cache is reintroduced later.

**Performance note:** The metrics queries use indexed columns (`entryDate`, `branchId`, `paymentMethod`, `isVoided`) with SUM aggregations on decimal columns. PostgreSQL handles these efficiently. The 5-minute cache existed as premature optimization; DB load increase is negligible.

### 3.2 Concern: Failed Add Handling (Issues B, F3, F4)

**Decision: Two-phase transaction pattern with idempotency guard.**

**Rationale:**
- `createLedgerEntry` must either fully succeed (entry exists AND notification fires AND cache invalidates) or fully fail (nothing persisted). A partial success is unacceptable.
- Auto-entries from external domains (sales, transactions, payroll) must never produce duplicates.

**Implementation approach:**

**Phase 1: Widen try/catch boundaries in `createLedgerEntry` and `updateLedgerEntry`.**
- The `db.insert()` must be the ONLY thing in the try block that can fail and roll back.
- After a successful insert, if `createLogs()` or `cache.invalidate()` fails, log the secondary failure but still return `success` — the entry is persisted, which is the primary contract.
- Move `revalidatePath()` and `cache.invalidate()` into a `finally`-style helper that wraps them in individual try/catch blocks so no single post-insert failure masks success.

**Phase 2: Add idempotency key to `createAutoLedgerEntry`.**
- Add a database partial unique index: `CREATE UNIQUE INDEX ON general_ledger (source_type, source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL AND is_voided = false`
- This prevents duplicate auto-entries at the database level, independent of application retry logic.
- `createAutoLedgerEntry` should catch the unique violation and return the existing entry's ID instead of failing — this makes the operation idempotent.

**Phase 3: Make `importAccountingEntries` transactional.**
- Wrap the entire import (all batches) in a single transaction via `withTransaction()`.
- If any batch fails, nothing is committed. The user sees a clean failure and can fix the CSV and retry.
- Trade-off: Imports with many rows hold a transaction for longer. Mitigated by the fact that imports are admin-only, infrequent operations.

**Phase 4: Client-side retry with exponential backoff.**
- Add a lightweight retry wrapper around `createLedgerEntry` calls in the EntryModal. If the server action returns a network error (not a validation error), retry up to 2 times with 1s/2s backoff.
- Never retry on validation errors (409/422 semantics) — those require user correction.
- The idempotency guard (Phase 2) ensures retries don't create duplicates.

### 3.3 Concern: Filter Race Condition (Issue C)

**Decision: Request versioning via monotonic counter + stale-result discard.**

**Rationale:**
- AbortController + `fetch` signal would require refactoring all server actions to accept an AbortSignal, which only works with `fetch()`-based calls, not direct function imports (server actions use RPC, not HTTP fetch in the client bundle). In Next.js server actions, there's no built-in abort mechanism.
- Next.js `useTransition` could track pending state but doesn't cancel in-flight server actions.

**Implementation approach:**
1. Add a `requestIdRef = useRef(0)` to the component.
2. At the start of `fetchData`, increment `requestIdRef.current`, capture the value as `thisRequestId`.
3. After `Promise.all` resolves, check `if (requestIdRef.current !== thisRequestId) return;` — discard stale results.
4. `setLoading(false)` only fires if the request is the most recent.
5. This is a purely client-side pattern, requires zero server changes.

### 3.4 Concern: Trashed Entries Management (Issue D)

**Decision: Add a dedicated "Trash" tab within the accounting page.**

**Rationale:**
- Trashed entries have different UX needs: they need restore actions, void metadata display (voided-by, voided-at, void-reason), and different default sorting (by `voidedAt` DESC instead of `entryDate` DESC).
- Mixing active and trashed entries in the same table via a filter toggle creates visual noise and ambiguity ("Is this 50%-opacity row trashed or just styled that way?").
- A separate tab provides clear mental model: Active vs. Trashed are different states of being, not just a filter.
- This integrates naturally with the tab restructure from Concern 3.5.

**Implementation approach:**
1. Add a "Trash" tab (admin-only) alongside "Ledger" and "Reports" (see Section 3.5).
2. The Trash tab's data fetch calls `getLedgerEntries({ filters: { include_voided: true }, ... })` with an additional server-side filter: `eq(generalLedger.isVoided, true)`. Only voided entries are returned.
3. The Trash tab's table columns differ from the Ledger tab: it adds `voidedAt`, `voidedBy` (username), `voidReason` columns, and replaces Edit/Delete actions with a single Restore button.
4. Add a `restoreLedgerEntry(id)` server action: sets `isVoided = false`, clears `voidedAt`, `voidedBy`, `voidReason`. Admin-only. Must check accounting period lock before restoring.
5. Restore triggers invalidation of the same 9 cache keys + revalidate `/accounting`.
6. The Trash tab supports filtering by date range and search, but NOT by entry_type/category/payment_method (voided entries are rarely numerous enough to need fine-grained filtering).
7. Voided entries in the Ledger tab's "view entries by category" drilldown links should NOT be clickable (no linking to voided entries from active views).

### 3.5 Concern: UI Restructure (Issue E)

**Decision: Two-tab layout: "Ledger" (default) + "Reports".**

**Rationale:**
- The existing metrics page already uses a 2-tab pattern (Insights | Accounting) — following established UI conventions.
- "Ledger" tab: FilterBar → Summary Cards → Account Type Breakdown → PaymentMethodDrilldown → Ledger Table → Pagination. This is the primary operational view.
- "Reports" tab: Trial Balance → Payroll Breakdown. These are analytical views used less frequently.
- This avoids the "overstuffed single page" problem while keeping navigation within the same route.

**Implementation approach:**
1. Add tab bar below PageHeader: "Ledger" | "Reports" | "Trash" (if admin).
2. Ledger tab: current main content minus TrialBalance and PayrollBreakdown.
3. Reports tab: TrialBalance + PayrollBreakdown in a 2-column or stacked layout.
4. Trash tab: FilterBar (simplified) → voided entries table with restore actions.
5. Tabs manage their own `loading` state — switching tabs doesn't re-fetch the ledger tab's data.

### 3.6 Concern: Revalidation Timing (Issue F1)

**Decision: Move revalidation outside the transaction.**

**Rationale:**
- `revalidatePath()` and `cache.invalidate()` are side effects that should fire after the transaction has committed, not during.
- If the transaction rolls back, we must NOT revalidate — it would clear caches for data that hasn't changed.

**Implementation approach:**
1. `withTransaction()` should accept an optional `onCommit` callback.
2. Move `revalidatePath()` and `cache.invalidate()` calls into the `onCommit` callback.
3. The transaction helper calls `onCommit` only after `db.transaction()` succeeds.
4. Update `createJournalEntry` to use this pattern.

---

## 4. Data Flow (Post-Refactor)

```
[USER CHANGES FILTER]
    |
    v
[Client: requestIdRef++]  →  fetchData(thisRequestId)
    |
    v
[Server Actions — NO CACHE]
    |-- getLedgerEntries(filters)     → DB query (no cache check, no cache set)
    |-- getLedgerSummary(filters)     → DB query (no cache check, no cache set)
    |-- getLedgerDetailBreakdown()    → DB query (no cache check, no cache set)
    |-- getTrialBalance()             → DB query (no cache check, no cache set)
    |
    v
[Client: if requestIdRef !== thisRequestId → DISCARD]
[Client: setEntries(), setSummary(), setLoading(false)]


[USER CREATES ENTRY]
    |
    v
[Client: retry wrapper (2 attempts, 1s/2s backoff on network errors)]
    |
    v
[Server: createLedgerEntry]
    |-- validate → failure (validation error, no retry)
    |-- db.insert → success
    |-- logInfo() [wrapped in try/catch, failure suppressed]
    |-- revalidatePath() / cache.invalidate() [wrapped in try/catch]
    |-- return success(entry)


[AUTO-ENTRY from Transaction/Sale/Payroll/Inventory]
    |
    v
[Server: createAutoLedgerEntry]
    |-- db.insert → unique violation? → select existing → return existing id
    |-- revalidatePath()
    |-- return success({ id })
```

---

## 5. Affected Files

| File | Change Summary |
|---|---|
| `server/actions/metrics.ts` | Remove all `cache.get()`/`cache.set()` calls; add `forceRefresh` param to all action signatures |
| `server/actions/accounting.ts` | Fix try/catch boundary in `createLedgerEntry`/`updateLedgerEntry`; add `restoreLedgerEntry()`; add `onCommit` to journal entry flow; add cache invalidation to `createAutoLedgerEntry`; add idempotency unique index migration |
| `server/db/transactions.ts` | Add optional `onCommit` callback parameter to `withTransaction()` |
| `app/accounting/accountingPage.tsx` | Add request versioning (`requestIdRef`); add 3-tab layout (Ledger / Reports / Trash [admin]); add Trash tab with voided entries table + restore actions; move TrialBalance/PayrollBreakdown to Reports tab
| `components/accounting/EntryModal.tsx` | Add client-side retry wrapper with exponential backoff |
| `server/actions/accounting-import.ts` | Wrap entire import in `withTransaction()` |
| `utils/cache.ts` | No changes (retained for future use, metrics will stop calling it) |
| `utils/types/responses.ts` | No changes required — the existing `ActionResponse` discriminates via `.success` boolean; network errors manifest as thrown exceptions in the client component, which the retry wrapper will catch by wrapping the server action call in try/catch. Validation errors are returned as `{ success: false, error: "..." }` and should never be retried.
| `drizzle/` | New migration: partial unique index on `(source_type, source_id)` for non-null, non-voided entries |

---

## 6. Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Removing cache increases DB load | Low | Low | Queries are indexed SUM aggregations; cache was premature optimization. Monitor DB CPU post-deploy. |
| Unique constraint blocks legitimate auto-entries | Low | High | Partial index only applies where both source_type and source_id are non-null AND isVoided=false. Edge case: a voided auto-entry is later re-created from the same source — handled by voiding the old one first. |
| Request versioning adds render cycles | Low | Low | Discarding stale results is a no-op (no state update). `requestIdRef` is a ref, not state, so no re-renders. |
| Transactional import holds locks too long | Low | Medium | Imports are admin-only, infrequent. If an import has >1000 rows, we split into chunked transactions with savepoints. |
| Restoring voided entries bypasses period lock | Medium | Medium | `restoreLedgerEntry` must check period lock before restoring. |

---

## 7. Acceptance Criteria

### AC-1: Data Freshness
- When an accounting entry is created, it appears in both the accounting page and metrics page on the next manual or automatic refresh.
- The metrics page never shows data more than a few seconds stale (bounded by network latency, not a TTL).
- `forceRefresh` parameter is accepted by all metrics actions and defaults to `false`.

### AC-2: Failed Add Resilience
- A `createLedgerEntry` call that successfully persists to the database always returns `success`, even if logging or cache invalidation fails.
- Auto-entries never produce duplicates — the unique constraint prevents it at the DB level.
- Client-side retry on network errors recovers from transient failures without duplicate creation.

### AC-3: Filter Race Condition
- Rapidly changing filters displays ONLY results from the most recent filter combination.
- The loading spinner stays visible until the most recent request completes.
- No intermediate stale results are ever displayed.

### AC-4: Trashed Entries
- Admin users can toggle a "Trashed" view that shows voided entries.
- Each voided entry shows: void date, voided by (username), void reason.
- Admin users can restore a voided entry via a single button click, with period lock check.
- Restoring an entry makes it visible in the active ledger again.

### AC-5: UI Restructure
- The accounting page has tabs: "Ledger" | "Reports" | "Trash" (admin-only).
- The Ledger tab contains: FilterBar → Summary Cards → Account Type Breakdown → PaymentMethodDrilldown → Ledger Table → Pagination.
- The Reports tab contains: Trial Balance → Payroll Breakdown.
- The Trash tab contains: simplified FilterBar → voided entries table (with restore actions) → pagination.
- Tab state persists in URL search params so deep-linking works.

---

## 8. Out of Scope

- Real-time subscriptions (WebSocket/Supabase Realtime) for live ledger updates
- Full audit log table (current `logs` table is sufficient for MVP)
- Automated reconciliation between auto-entries and source transactions
- Bulk restore of multiple voided entries
- Export of trashed entries as a separate report
