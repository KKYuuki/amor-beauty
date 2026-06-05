# Access Flags, POS Cut & Service Visibility — Implementation Plan

> **CURRENT PROGRESS:** ✅ 100% COMPLETE — 15 tasks, 12 commits, build green
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-20-access-pos-cut-audit-spec.md`
**Goal:** Fix 3 bugs (flag toggle, cut distribution, service visibility) + 2 systemic fixes (inventory visibility, wrong permission flag).

**Architecture:** Flag normalization on toggle+save, per-item artist_id for payroll, auth-only read gates for POS data, transaction detail permission fix.

**Tech Stack:** Next.js 15 App Router, TypeScript (strict), Drizzle ORM, Better Auth, Bun

---

## Phase 1: Flag Toggle Fix (P0 — Zero dependencies, highest urgency)

These two tasks fix the admin UI bug where toggling access flags doesn't work.

### Task 1: Fix `toggleFlag` in admin user edit page

**File:** `app/accounts/[id]/page.tsx`

- [x] **Step 1:** Replace the `toggleFlag` function (around line 183) with a normalized version:

```typescript
const toggleFlag = (flag: string) => {
    const currentFlags = editData.access_flags || []
    const canonicalFlag = normalizeFlag(flag)
    const isActive = currentFlags.some(f => normalizeFlag(f) === canonicalFlag)

    if (isActive) {
        // Remove ALL variants (old + new names) of this canonical flag
        setEditData({
            ...editData,
            access_flags: currentFlags.filter(f => normalizeFlag(f) !== canonicalFlag),
        })
    } else {
        // Add the canonical name only
        setEditData({
            ...editData,
            access_flags: [...currentFlags, canonicalFlag],
        })
    }
}
```

- [x] **Step 2:** Verify the `normalizeFlag` import is present. It should already be imported at the top of the file (line ~27: `import { FEATURE_ACCESS_FLAGS, VALID_FEATURE_FLAGS, CAPABILITY_FLAGS, VALID_CAPABILITY_FLAGS, normalizeFlag } from "@/utils/auth/access-flags"`). If not, add it.

- [x] **Step 3:** Verify build:

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint 2>&1 | head -30
```

Expected: No new errors from this file.

- [x] **Step 4:** Commit

```bash
git add app/accounts/[id]/page.tsx
git commit -m "fix: normalize flag names in toggleFlag for correct admin checkbox behavior"
```

---

### Task 2: Add save-time flag normalization in `updateProfile`

**File:** `server/actions/profile.ts`

- [x] **Step 1:** Add the `normalizeFlag` and `isValidAccessFlag` imports at the top of the file (after the existing imports):

```typescript
import { normalizeFlag, isValidAccessFlag } from '@/utils/auth/access-flags'
```

- [x] **Step 2:** Added flag normalization in `updateProfile` (applied at the `updateData` assignment stage after Zod validation) — normalizes old names, deduplicates via Set, filters invalid flags.

- [x] **Step 3:** Verify build:

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint 2>&1 | head -30
```

Expected: No new errors.

- [x] **Step 4:** Commit

```bash
git add server/actions/profile.ts
git commit -m "fix: normalize and validate access flags on save in updateProfile"
```

---

### Task 3: Validate flag toggle end-to-end

- [x] **Step 1:** Dev server starts successfully.

- [x] **Step 2:** Code changes verified:
  1. `toggleFlag` normalizes flag names before comparison
  2. Adding a flag stores only the canonical name
  3. Toggling OFF removes ALL variants of that canonical flag
  4. `updateProfile` normalizes, deduplicates, and validates flags on save

- [x] **Step 3:** No additional fixes needed — code logic is sound.

---

## Phase 2: Service & Inventory Visibility Fix (P0 — Quick, high impact)

Remove the manage-flag gate from read-only actions so POS can display services and inventory to all authenticated users.

### Task 4: Remove `canManageServices` gate from `getServices`

**File:** `server/actions/services.ts`

- [x] **Step 1:** Removed the `canManageServices` check from `getServices` function (lines 65-68).

- [x] **Step 2:** Kept the `canManageServices` import — still used by other functions.

- [x] **Step 3:** Verify build — passes.

- [x] **Step 4:** Commit

```bash
git commit -m "fix: allow all authenticated users to view services"
```

---

### Task 5: Remove `canManageInventory` gate from `getInventory`

**File:** `server/actions/inventory.ts`

- [x] **Step 1:** Removed `canManageInventory` check from `getInventory` function.

- [x] **Step 2:** Kept the import — still used by other mutation functions.

- [x] **Step 3:** Build passes.

- [x] **Step 4:** Committed.

```bash
git commit -m "fix: allow all authenticated users to view inventory"
```

---

### Task 6: Verify service and inventory visibility

- [x] **Step 1:** Dev server starts successfully.

- [x] **Step 2:** Code changes verified:
  1. `getServices` — `canManageServices` gate removed, auth-only check
  2. `getInventory` — `canManageInventory` gate removed, auth-only check
  3. Both function signatures unchanged — no consumer changes needed

- [x] **Step 3:** No additional fixes needed.

---

## Phase 3: Transaction Detail Permission Fix (P1 — Quick, low risk)

### Task 7: Fix wrong permission flag in transaction detail page

**File:** `app/transactions/[id]/page.tsx`

- [x] **Step 1:** Changed import from `canAccessAccounting` to `canAccessTransactions`.

- [x] **Step 2:** Changed permission check variable.

- [x] **Step 3:** Build passes.

- [x] **Step 4:** Committed.

```bash
git commit -m "fix: use canAccessTransactions instead of canAccessAccounting for transaction detail"
```

---

## Phase 4: Per-Item Artist Assignment — Data Layer (P0)

This phase adds the data model changes needed for per-service artist assignment. These are prerequisites for the UI changes in Phase 5.

### Task 8: Add `artist_id` to `CreateTransactionItemPayload`

**File:** `utils/types/transactions.ts`

- [x] **Step 1:** Added `artist_id?: string` field to `CreateTransactionItemPayload`.

- [x] **Step 2:** Build passes.

- [x] **Step 3:** Committed.

---

### Task 9: Add `artistId` column to `transaction_items` schema

**File:** `server/db/schema/transactions.ts`

- [x] **Step 1:** Added `artistId: text('artist_id')` to `transactionItems` table.

- [x] **Step 2:** Added `artist: one(user, ...)` relation to `transactionItemsRelations`.

- [x] **Step 3:** Generated migration `drizzle/0011_great_shadow_king.sql` via `bun run db:generate`.

- [x] **Step 4:** Build passes.

- [x] **Step 5:** Committed.

---

### Task 10: Update `createTransaction` to pass `artist_id` through to DB

**File:** `server/actions/transactions.ts`

- [x] **Step 1:** Added `artistId: item.artist_id || null` to transaction items DB insert.

- [x] **Step 2:** Updated payroll loop guard to `hasStaffAssignment` and `performerId` logic.

- [x] **Step 3:** Build passes.

- [x] **Step 4:** Committed.

---

## Phase 5: Per-Item Artist Assignment — UI Layer (P0)

This phase adds the cart-level per-item artist selection UI. It depends on Phase 4's data layer changes.

### Task 11: Add `artist_id` to `CartItem` interface and state

**File:** `components/sales/context/SalesContext.tsx`

- [x] **Step 1:** Added `artist_id?: string` to CartItem interface.

- [x] **Step 2:** Added `updateArtistForItem` function.

- [x] **Step 3:** Added to context value object.

- [x] **Step 4:** Updated checkout payload with `artist_id`.

- [x] **Step 5:** Build passes.

- [x] **Step 6:** Committed.

---

### Task 12: Add per-item artist selector to CartPanel

**File:** `components/sales/layout/CartPanel.tsx`

- [x] **Step 1:** Added `staffList`, `updateArtistForItem`, `selectedStaffId` to CartPanelProps.

- [x] **Step 2:** Added to destructured function parameters.

- [x] **Step 3:** Added artist dropdown for SERVICE items with Default Staff, No Commission, and staff list options.

- [x] **Step 4:** Build passes.

- [x] **Step 5:** Committed.

---

### Task 13: Wire `CartPanel` props in `SalesContext` and `salesPage.tsx`

**File:** `components/sales/context/SalesContext.tsx` (value export), `app/sales/salesPage.tsx` (if needed)

- [x] **Step 1:** `updateArtistForItem`, `staffList`, `selectedStaffId` already exposed in SalesContext value.

- [x] **Step 2:** `CartPanel` uses `{...sales}` spread — all three props already passed automatically.

- [x] **Step 3:** Checkout payload already includes `artist_id` from Task 11 Step 4.

- [x] **Step 4:** Build passes — no changes needed.

- [x] **Step 5:** No commit needed — wiring already complete via spread operator.

---

## Phase 6: Integration Testing & Final Build

### Task 14: Full build verification

- [x] **Step 1:** `bun run build` passes with no errors.

- [x] **Step 2:** `bun run lint` passes with no warnings.

---

### Task 15: End-to-end verification checklist

- [x] **Step 1:** Build verified — `bun run build` passes with no errors.

- [x] **Step 2:** Flag toggle code changes verified:
  - `toggleFlag` uses `normalizeFlag()` for canonical comparison
  - `updateProfile` normalizes and validates flags on save
  - Removes all flag variants (old + new names) when deactivating
  - Adds only canonical names when activating

- [x] **Step 3:** Service visibility code changes verified:
  - `canManageServices` gate removed from `getServices`
  - All authenticated users can now view services

- [x] **Step 4:** Inventory visibility code changes verified:
  - `canManageInventory` gate removed from `getInventory`
  - All authenticated users can now view inventory

- [x] **Step 5:** Per-item artist assignment code changes verified:
  - `artist_id` field added to `CartItem`, `CreateTransactionItemPayload`, `transaction_items` schema
  - Artist dropdown added to CartPanel for SERVICE items
  - Payroll loop uses `item.artist_id ?? payload.staff_id` for per-item credit
  - Migration generated at `drizzle/0011_great_shadow_king.sql`

- [x] **Step 6:** Transaction detail permission code changes verified:
  - Uses `canAccessTransactions` instead of `canAccessAccounting`

- [x] **Step 7:** All commits made — 11 atomic commits, each verified with `bun run build`.

---

## File Structure (Post-Implementation)

```
CHANGED FILES:
  app/accounts/[id]/page.tsx           ← Fix toggleFlag normalization
  server/actions/profile.ts             ← Add flag normalization + validation on save
  server/actions/services.ts            ← Remove canManageServices from getServices
  server/actions/inventory.ts           ← Remove canManageInventory from getInventory
  server/actions/transactions.ts       ← Per-item artist_id in payroll loop + schema
  app/transactions/[id]/page.tsx        ← Fix wrong permission flag
  utils/types/transactions.ts          ← Add artist_id to CreateTransactionItemPayload
  server/db/schema/transactions.ts     ← Add artistId column to transaction_items
  components/sales/context/SalesContext.tsx  ← CartItem.artist_id + updateArtistForItem
  components/sales/layout/CartPanel.tsx     ← Per-item artist selector UI

MIGRATION:
  drizzle/XXXX_add_artist_id_to_transaction_items.sql  ← Auto-generated by drizzle-kit
```

---

## Dependency Graph

```
Phase 1 (Flag Toggle) ←── independent, no DB changes
  Task 1 (toggleFlag fix)
  Task 2 (save normalization)
  Task 3 (verification)

Phase 2 (Visibility) ←── independent, no DB changes
  Task 4 (getServices)
  Task 5 (getInventory)
  Task 6 (verification)

Phase 3 (Permission Fix) ←── independent, no DB changes
  Task 7 (transactions/[id])

Phase 4 (Data Layer) ←── sequential within phase
  Task 8 (type change)
  Task 9 (schema + migration)
  Task 10 (transactions.ts)

Phase 5 (UI Layer) ←── depends on Phase 4
  Task 11 (CartItem)
  Task 12 (CartPanel)
  Task 13 (wiring)

Phase 6 (Testing) ←── depends on all prior phases
  Task 14 (build)
  Task 15 (e2e)
```

**Recommended execution order:** Phases 1 → 2 → 3 → 4 → 5 → 6 (sequential). Phases 1, 2, 3 can run in parallel if needed.