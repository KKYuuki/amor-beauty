# [Accounting] Sort by Date Added — Architectural Spec

> **Status:** Draft — awaiting user review
> **Date:** 2026-05-07
> **Feature:** Addability to sort general ledger by `created_at` (date added) and display the column when this sort is active.

---

## 1. Source of Truth

### 1.1 Database Column

| Column | Table | Type | Nullable | Default | Index |
|--------|-------|------|----------|---------|-------|
| `created_at` | `general_ledger` | `timestamp` | `NOT NULL` | `now()` | `idx_gl_created_at` (btree) |

- **Schema file:** `server/db/schema/accounting.ts` — field `createdAt`
- **Type mapping:** `LedgerEntry.created_at: Date` in `utils/types/ledger.ts`
- **Current ORDER BY:** `entry_date DESC, created_at DESC` (hardcoded in `server/actions/accounting.ts:235`)

### 1.2 Permissions Boundary

- All entry queries already pass through `getCurrentUser()` → `canAccessAccounting()` in the server action
- No permission changes needed — a user who can see the ledger can see `created_at`
- `created_at` is metadata (not PII, not financial data) — no additional masking or RBAC required

### 1.3 Security Constraints

- **Sort parameter injection:** Drizzle ORM uses parameterized queries — the sort key must be validated server-side against a closed allowlist (`'entry_date' | 'created_at'`). Never pass a raw string directly to `.orderBy()`.
- **No client-driven ORDER BY:** The client sends a discrete enum value; the server maps it to the appropriate Drizzle column reference. The client never controls which column object or expression is used.
- **Pagination consistency:** Changing sort order MUST reset `page` to 1 on the client. The server does not enforce this — it's a client-side responsibility (existing pattern already resets page on filter changes).

---

## 2. Architectural Boundaries

### 2.1 What Changes

| Layer | File | Change |
|-------|------|--------|
| **Server Action** | `server/actions/accounting.ts` | Add `sortBy?: 'entry_date' \| 'created_at'` to `GetLedgerEntriesOptions`. Dynamically build `.orderBy()` based on the sort parameter. Default (`undefined`/`'entry_date'`) preserves existing behavior. |
| **Client Page** | `app/accounting/accountingPage.tsx` | Add `sortBy` state (default `'entry_date'`). Add `<select>` dropdown in `FilterBar`. When `sortBy === 'created_at'`, add a "Date Added" column to the header and body of the ledger table. Reset `page` to 1 on sort change. |

### 2.2 What Does NOT Change

- `LedgerEntry` type — `created_at` already present
- `LedgerFilters` type — sort is a separate concern from filtering
- `getLedgerSummary`, `getLedgerDetailBreakdown`, `getTrialBalance` — aggregates are unaffected by sort
- Export functions — export has its own ordering logic (business-rule-driven, not user-sort-driven)
- Trash tab — trashed entries are always ordered by void date; user sort is a ledger-only concern
- `EntryModal`, `ExportGroupingModal`, `CSVImportModal` — no changes

### 2.3 Column Placement

When `sortBy === 'created_at'`, the "Date Added" column is inserted **after the existing "Date" column** (position 2 in the column order). This groups the two temporal columns together for logical scanning.

```
| Date | Date Added | Type | Payment Type | Category | Debit | Credit | Description | Reference | Branch | Proof | Staff Cut | Shop Cut | Actions |
```

### 2.4 Column Visibility Rule

- **`sortBy === 'entry_date'` (default):** "Date Added" column is **hidden**. Table has 10 base columns (12 for admin).
- **`sortBy === 'created_at'`:** "Date Added" column is **visible**. Table has 11 base columns (13 for admin). The `colSpan` values for loading/empty states must reflect the incremented count.

Column count constant update:

```typescript
const PAGE_COLUMNS = { base: 12, admin: 13 }  // was { base: 12, admin: 13 }
// When sortBy === 'created_at', increment by 1:
// base: 13, admin: 14
```

The column count becomes dynamic: `isAdmin ? PAGE_COLUMNS.admin + extraCols : PAGE_COLUMNS.base + extraCols` where `extraCols = sortBy === 'created_at' ? 1 : 0`.

---

## 3. Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ CLIENT (accountingPage.tsx)                              │
│                                                          │
│  sortBy state: 'entry_date' | 'created_at'               │
│       │                                                  │
│       ├─ onChange → setSortBy(value)                     │
│       │             setPage(1)   ← always reset          │
│       │                                                  │
│       └─ triggers useEffect → fetchData()                │
│                                                          │
│  render logic:                                           │
│    sortBy === 'created_at'                               │
│      → show <th> + <td> for Date Added                   │
│      → colSpan += 1                                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ SERVER ACTION (accounting.ts)                            │
│                                                          │
│  getLedgerEntries({ ..., sortBy })                       │
│       │                                                  │
│       ├─ sortBy === 'created_at'                         │
│       │    .orderBy(desc(generalLedger.createdAt),       │
│       │             desc(generalLedger.entryDate))        │
│       │                                                  │
│       └─ default / 'entry_date'                          │
│            .orderBy(desc(generalLedger.entryDate),        │
│                     desc(generalLedger.createdAt))        │
│                                                          │
│  Returns: { data: LedgerEntry[], total: number }         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Sort Allowlist (Server-Side Validation)

```typescript
const ALLOWED_SORT_FIELDS = ['entry_date', 'created_at'] as const
type SortField = typeof ALLOWED_SORT_FIELDS[number]

function buildOrderBy(sortBy: SortField | undefined) {
    if (sortBy === 'created_at') {
        return [desc(generalLedger.createdAt), desc(generalLedger.entryDate)]
    }
    // Default: entry_date
    return [desc(generalLedger.entryDate), desc(generalLedger.createdAt)]
}
```

If an unknown sort value is received, fall back silently to the default (`entry_date`). Do not throw — this degrades gracefully.

---

## 5. Edge Cases & Nullability

| Scenario | Behavior |
|----------|----------|
| `created_at` is null (should never happen due to `NOT NULL DEFAULT now()`) | NULLs sort last in `DESC` order (PostgreSQL default). No special handling needed. |
| User switches from custom date range to preset | Page resets to 1 (existing behavior). Sort is independent — it must NOT reset when date range changes. |
| User changes sort while on page > 1 | Page resets to 1. |
| User changes sort, then refreshes page | Sort state is lost (client-only state). Reverts to default `entry_date`. Acceptable — sort preference is transient, not persisted. |
| Concurrent filter + sort changes | De-bounced search + request ID pattern handles this. No race condition. |
| Admin vs non-admin | Sort applies identically. The "Date Added" column visibility is the same for both roles. The dynamic colSpan handles admin's extra Actions column. |

---

## 6. Non-Goals (Explicitly Out of Scope)

- **Persisting sort preference** — sort resets on page reload
- **Multi-column sort** — only one sort field at a time
- **Ascending/descending toggle** — always descending (newest first), consistent with the current hardcoded DESC behavior
- **Sort in trash tab** — trash always ordered by void date descending
- **Sort in reports tab** — reports use their own aggregate ordering
- **URL search param for sort** — client-only React state; no URL encoding

---

## 7. Testing Boundaries

Manual integration testing via `/app/test/` (project has no automated test runner):

1. **Default behavior unchanged:** Ledger loads sorted by entry_date DESC
2. **Switch to Date Added sort:** Select "Date Added" — list reorders by created_at DESC; "Date Added" column appears with formatted timestamps
3. **Switch back to Date sort:** Select "Date (entry)" — list reverts to entry_date DESC; "Date Added" column disappears
4. **Sort with filters active:** Apply a type filter, then change sort — filtered results reorder; "Date Added" column still shows
5. **Sort + pagination:** Navigate to page 2, change sort — page resets to 1
6. **Sort + search:** Type a search query, wait for debounce, then change sort — results respect both search and sort
7. **Empty state:** With filters that yield zero results, the "Date Added" column still renders in the header (only hidden when sortBy !== 'created_at'); the colSpan on the empty row must be correct
8. **Admin vs non-admin:** Both see the same sort behavior and Date Added column
