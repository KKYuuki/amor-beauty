# Payroll Tab Reorganization & Full Rates CRUD Overhaul

**Goal:** Improve payroll tab layout for logical grouping, add full CRUD (including deactivate/delete) for Rates and Rate Levels, and fix collision detection bugs.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, PostgreSQL, Tailwind CSS 4

---

## 1. Tab Reorganization

### 1.1 New Tab Order

| # | Tab Name | Icon | Notes |
|---|----------|------|-------|
| 1 | Dashboard | `UsersIcon` | Unchanged |
| 2 | Requests | `ClockIcon` | Unchanged |
| 3 | **Rate Configuration** | `SettingsIcon` | Merges former "Rates" and "Rate Levels" tabs |
| 4 | Deductions | `MinusCircleIcon` | Unchanged |
| 5 | Scheduled | `CalendarIcon` | Unchanged |
| 6 | Downpayments | `BanknoteIcon` | Unchanged |

### 1.2 Affected Code

- `app/payroll/payrollPage.tsx` — TabType enum drops `"rates"` and `"rateLevels"`, adds `"rateConfiguration"`
- Tab definition array changes from 7 entries to 6, with merged tab
- `fetchData` function updated: `activeTab === "rateConfiguration"` fetches both rates + rate levels in parallel
- State `rates`, `rateLevels`, `allRateLevels` and their CRUD handlers stay; they just live under one tab switch

---

## 2. Rate Configuration Tab — Internal Structure

### 2.1 Two-View Toggle

```
┌─────────────────────────────────────────────┐
│  [  Staff Rates  |  Rate Levels  ]           │
│─────────────────────────────────────────────│
│  (content based on selected view)            │
└─────────────────────────────────────────────┘
```

- Default view: `Staff Rates`
- Simple `useState<"staffRates" | "rateLevels">` toggle
- Both views reuse existing `RatesTab` and `RateLevelsTab` component code with enhancements

### 2.2 Staff Rates View

Current `RatesTab` component with additions:
- **Actions column:** [Edit] [Deactivate] [Delete]
- "Create Rate" button (admin only, unchanged)
- **Toggle for showing inactive rates:** optional filter checkbox "Show inactive" (default off)

### 2.3 Rate Levels View

Current `RateLevelsTab` component with additions:
- **Actions column additions:** [Delete] button added alongside existing [Edit] and [Deactivate]
- Delete button disabled/greyed with tooltip when level has references
- Create button unchanged

---

## 3. Rates CRUD

### 3.1 Current State

| Operation | Status | Details |
|-----------|--------|---------|
| Create | ✅ | Modal: service_type, client_type, rate_level_id, payment_mode, percentages/fixed_amount. Collision check only against active rates. |
| Read | ✅ | Table grouped by service type (Tattoo/Piercing/Shoe). Columns: Client Type, Rate Level, Shop %, Staff %, Mode, Actions |
| Update | ✅ | Modal: all fields editable. Collision check against all rates (correct). Auto-regenerates rate_name. |
| Delete/Deactivate | ❌ | No UI exists. `is_active` column in DB is never toggled from UI. |

### 3.2 Edit Rate Modal Changes (`EditRateModal.tsx`)

Add to the bottom of the modal:
- **Status toggle:** Active/Inactive buttons (same pattern as `EditRateLevelModal`)
- **Delete button:** Secondary danger button below the Save/Cancel row
  - Only enabled when `rateEntryCount === 0` (no payroll entries reference this rate)
  - Shows confirmation modal: "Delete this rate permanently? This cannot be undone."
  - Disabled state shows tooltip: "Cannot delete: rate is referenced by {n} payroll entries. Deactivate instead."

### 3.3 Deactivate Flow (from table)

New standalone deactivate button in each rate row:
- Click → confirmation dialog (reuse pattern from `DeactivateRateLevelModal`)
- Sets `isActive = false`, `updatedAt`, `updatedBy`
- Rate disappears from default active-only view
- Historical payroll entries preserve their snapshot — no cascade

### 3.4 Server Action Changes

**New server action — `deactivateStaffRate(id: string)`**
- Admin check
- Sets `isActive = false`, `updatedAt = new Date()`, `updatedBy = currentUser.id`
- Logs the action

**New server action — `deleteStaffRate(id: string)`**
- Admin check
- Checks `payroll_entry` count referencing this rate
- If count > 0: return failure with message "Cannot delete: referenced by N entries"
- If count === 0: `db.delete(payrollStaffRate).where(eq(payrollStaffRate.id, id))`
- Logs the action

**Modified — `createStaffRate` collision check**
- Remove `eq(payrollStaffRate.isActive, true)` from the duplicate check query
- Check against ALL rates (active or inactive)
- If match found (inactive): return failure "A rate already exists for this combination (currently inactive). Edit and reactivate it instead."
- If match found (active, should not happen due to unique index but add defensive check): return failure "A rate already exists for this combination."

---

## 4. Rate Levels CRUD

### 4.1 Current State

| Operation | Status | Details |
|-----------|--------|---------|
| Create | ✅ | Modal: name + sort_order. Slug auto-generated. DB unique constraint on slug. |
| Read | ✅ | Table: Name, Slug, Status, Sort Order |
| Update | ✅ | Modal: name, sort_order, is_active toggle |
| Deactivate | ✅ | Separate confirmation modal. Checks complete. |
| Delete | ❌ Missing UI | Server action `deleteRateLevel()` exists. Checks `payrollStaffRate` + `user` references. No UI button wired. |

### 4.2 Delete Button (new)

Add to Rate Levels table action column (alongside Edit, Deactivate):
- **Always visible** for admin, but disabled when references exist
- Enabled only when `rateRefs === 0 AND userRefs === 0`
- Disabled tooltip: "Cannot delete: still referenced by {n} rates or {n} staff members. Deactivate instead."
- Click → confirmation modal listing what references it (if any edge case slips through)

### 4.3 Rate Level Name Collision Detection

- Add proactive check in `createRateLevel`: query for existing levels with the same name (case-insensitive)
- If match found but different slug: return warning "A rate level with a similar name already exists: '{name}'"
- Slug collision is already handled by DB unique constraint (caught in try/catch)

---

## 5. Collision Detection Rules

### 5.1 Rate Combination Uniqueness

The unique key `(service_type, client_type, rate_level_id)` must be enforced across ALL rows regardless of `isActive`.

| Scenario | Detection | Action |
|----------|-----------|--------|
| Create: same combo exists (active) | App check + DB unique index | Block: "A rate already exists for this combination" |
| Create: same combo exists (inactive) | App check (after fix) | Block: "A rate already exists for this combination (currently inactive). Edit and reactivate it instead." |
| Update: changing to existing combo | App check (already correct) | Block: "A rate with this service type, client type, and rate level already exists" |
| Update: not changing combo | No check needed | Allow |

### 5.2 Rate Level Name/Slug Uniqueness

| Scenario | Detection | Action |
|----------|-----------|--------|
| Create: slug exists | DB unique constraint | Caught, return failure |
| Create: name exists (different slug) | Proactive query | Warning dialog: confirm user wants duplicate name |
| Update: changing name/slug | Proactive query + DB constraint | Block if slug taken |
| Delete: level has references | Proactive query | Block: "Cannot delete: referenced by N rates or M staff members" |

### 5.3 Delete Safety Guarantees

**Rate deletion** will never orphan payroll entries:
- App-level check ensures `payroll_entry.rate_id` count is zero
- If count > 0, user is directed to deactivate instead

**Rate level deletion** will never orphan rates or user assignments:
- `deleteRateLevel()` already checks `payrollStaffRate` + `user` references
- Delete UI button is disabled when refs exist
- If somehow bypassed, the server action returns an error

---

## 6. Files Affected

### New/Modified Server Actions
- `server/actions/payroll.ts` — Add `deactivateStaffRate()`, `deleteStaffRate()`; fix `createStaffRate()` collision check
- `server/actions/rate-levels.ts` — Add name collision check in `createRateLevel()`

### Modified UI
- `app/payroll/payrollPage.tsx` — Merge tabs, add `rateConfiguration` tab, wire new actions
- `app/payroll/modals/EditRateModal.tsx` — Add active/inactive toggle, delete button
- `app/payroll/modals/index.ts` — Export new modals if needed

### New UI Files (if standalone deactivate modal for rates differs from level pattern)
- Potentially `app/payroll/modals/DeactivateRateModal.tsx` — reuse `DeactivateRateLevelModal` pattern
- Potentially `app/payroll/modals/DeleteRateModal.tsx` — confirmation with reference check display
- Potentially `app/payroll/modals/DeleteRateLevelModal.tsx` — confirmation with reference summary

### Types
- `utils/types/payroll.ts` — May need `DeleteRateResponse` or similar, but return types likely already sufficient via `ActionResponse`

---

## 7. Implementation Order

1. **Collision detection fix** (`createStaffRate` — remove `isActive` filter from duplicate check)
2. **Server actions** — `deactivateStaffRate()`, `deleteStaffRate()`
3. **Rate Level name collision detection** in `createRateLevel()`
4. **UI: Edit Rate Modal** — add active/inactive toggle, delete button with reference check
5. **UI: Deactivate Rate Modal** — standalone deactivate from table row
6. **UI: Delete Rate Modal** — confirmation with reference info
7. **UI: Delete Rate Level Modal** — wire existing `deleteRateLevel` to a button
8. **Tab reorganization** — merge Rates + Rate Levels into Rate Configuration tab
