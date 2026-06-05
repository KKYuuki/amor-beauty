# System-Wide Audit & Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit and fix logic, flows, UI flow, branch integration, and accounting integration across Profile, Dashboard, Calendar, Config, System Logs, and Branches pages; resolve all lint/build warnings.

**Architecture:** Multi-phase approach — first fix critical cross-cutting issues (dual notification systems, dual branch state, duplicate branch selectors), then audit and fix each page individually, then resolve remaining build/lint issues.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, Supabase, Motion (Framer Motion successor)

---

## Phase 1: Cross-Cutting Fixes (Critical Infrastructure)

These issues affect multiple pages and must be resolved before page-level audits.

### Task 1: Unify Dual Notification Systems

**Files:**
- Modify: `components/notifications.tsx`
- Delete: `components/notification-provider.tsx`
- Modify: `app/layout.tsx`

**Step 1: Audit all imports of notification-provider**

```bash
rg "notification-provider" --type ts --type tsx -l
rg "from.*notification-provider" --type ts -l
```

Check if `notification-provider.tsx` is imported anywhere. If not, it's dead code.

**Step 2: Merge pause/resume features from notification-provider into notifications.tsx**

Add hover-to-pause behavior and `clearAll()` method to the existing `NotificationContextType` in `components/notifications.tsx`, using the dark-theme UI that matches the app.

Update the `NotificationContextType` in `utils/types/notifications.ts` to add:
```typescript
clearAll: () => void
```

**Step 3: Delete notification-provider.tsx**

Remove `components/notification-provider.tsx`.

**Step 4: Verify build**

Run: `bun run build`
Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add -A
git commit -m "fix: unify dual notification systems into single dark-theme provider"
```

---

### Task 2: Unify Dual Branch State Management

**Files:**
- Modify: `components/sidebar.tsx`
- Modify: `components/branch-context.tsx`
- Modify: `app/layout.tsx`

**Problem:** `SideBarContext` in `sidebar.tsx` has `currentBranch`/`setCurrentBranch` that is never populated (always null). The real branch state lives in `BranchProvider` (branch-context.tsx). These two are disconnected — changing branch in one doesn't affect the other.

**Step 1: Remove branch state from SideBarContext**

In `sidebar.tsx`, remove `currentBranch` and `setCurrentBranch` from `SideBarContextType`. Remove the `useState<string | null>(null)` for `currentBranch`.

**Step 2: Replace sidebar's branch state with BranchProvider context**

Wherever `currentBranch` was used from `SideBarContext` in sidebar.tsx, import `useBranchContext` from `branch-context.tsx` and use that instead.

**Step 3: Ensure BranchProvider wraps the sidebar in layout.tsx**

Verify `BranchProvider` is in the provider tree before `Sidebar` so the sidebar can access branch context.

**Step 4: Search for any remaining references to sidebar's currentBranch**

```bash
rg "currentBranch.*SideBarContext" --type tsx -l
rg "SideBarContext.*currentBranch" --type tsx -l
```

Replace all with `useBranchContext()` calls.

**Step 5: Verify build**

Run: `bun run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add -A
git commit -m "fix: unify branch state management - remove duplicate from sidebar context"
```

---

### Task 3: Consolidate Duplicate BranchSelector Components

**Files:**
- Delete: `components/BranchSelector.tsx` (root-level, the less complete version)
- Modify: All files importing from `@/components/BranchSelector` → `@/components/branch-selector`

**Step 1: Find all imports of root BranchSelector**

```bash
rg "from.*@/components/BranchSelector" --type tsx -l
rg "from.*components/BranchSelector" --type tsx -l
```

**Step 2: Add missing features from root BranchSelector to ui/branch-selector.tsx**

The root `BranchSelector.tsx` has an `allowAll` prop that shows "All Branches". Add equivalent support to `components/branch-selector.tsx` (which already has `showAllOption`). Ensure the `showAllOption` prop handles the "all branches" case identically.

**Step 3: Update all imports**

Replace all `@/components/BranchSelector` imports with `@/components/branch-selector`.

**Step 4: Delete root BranchSelector.tsx**

Remove `components/BranchSelector.tsx`.

**Step 5: Verify build**

Run: `bun run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add -A
git commit -m "fix: consolidate duplicate BranchSelector components into single implementation"
```

---

### Task 4: Fix AdminActionGuard cloneElement Bug

**Files:**
- Modify: `components/admin/AdminActionGuard.tsx`

**Problem:** `React.cloneElement` replaces (not merges) the child's `onClick`. If the wrapped element has an existing `onClick` handler, it's lost after verification.

**Step 1: Change AdminActionGuard to use render props or wrapper pattern**

Instead of `cloneElement` with `onClick`, change the component to:
- Render a `<button>` or `<div>` wrapper that intercepts the click
- After verification, call the `onAction` callback
- Remove the `cloneElement` pattern entirely

New pattern:
```tsx
export default function AdminActionGuard({
  onAction,
  children,
}: {
  onAction: () => void | Promise<void>
  children: React.ReactNode
}) {
  // If not production or bypass is set, just call onAction directly
  // Otherwise, show passkey verification modal
  // Wrap children in a clickable container that triggers verification
}
```

Actually, looking at how it's used — it wraps `<Button>` elements. The simplest fix: instead of `cloneElement`, render a wrapper `<span onClick={handleInteraction}>` around children, and call `onAction` on verification success. Remove `cloneElement` entirely.

**Step 2: Verify all AdminActionGuard usages still work**

```bash
rg "AdminActionGuard" --type tsx -l
```

Check each usage site — they all use the pattern `<AdminActionGuard onAction={...}> <Button>...</Button> </AdminActionGuard>`. The wrapper pattern will still work since the click on the Button will bubble up to the span.

**Step 3: Add `e.stopPropagation()` to the wrapper click handler**

This prevents the click from also triggering parent handlers.

**Step 4: Verify build and test**

Run: `bun run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add -A
git commit -m "fix: replace cloneElement in AdminActionGuard with click wrapper pattern"
```

---

## Phase 2: Page-Level Audits & Fixes

### Task 5: Profile Page Audit & Fixes

**Files:**
- Modify: `app/profile/profilePage.tsx`
- Modify: `app/profile/page.tsx`
- Modify: `server/actions/profile.ts`

**Issues Found:**

1. **`getUserImages` stub returns empty array** (page.tsx:16-19) — The server component calls `getUserImages` which returns `[]`, but the client component calls `getUserImages()` from storage actions. The initial server-side fetch is wasted.

2. **Cache-busting avatar URL hack** (profilePage.tsx:44-48, 213-220) — Uses timestamps for cache busting, but the `getAvatarUrl` function is called during render (not in an effect), so it generates a new URL every render causing unnecessary re-renders.

3. **`fetchProfile` has stale closure issue** (profilePage.tsx:102-123) — The `useCallback` depends on `userInfo.id` and `userInfo.access_flags`, but after setting new user info, the callback still uses the old `userInfo` values until the next render cycle.

4. **Image URL creation on every render** (profilePage.tsx:170) — `URL.createObjectURL(imageFile)` is called inline and never revoked, causing memory leaks.

5. **Payment method type mismatch** (profilePage.tsx:89-98) — The form default type `'GCASH'` but the select option has `'BANK'` (line 374) vs the type definition `'BANK_TRANSFER'`. Mismatch between displayed value and stored value.

6. **Photo modal shows all images, not just user's** (profilePage.tsx:261) — While filtered by `!img.is_3d && !img.is_website`, there's no explicit user-scoping if `getUserImages` ever returns other users' images.

**Step 1: Remove the unused `getUserImages` stub from page.tsx**

Remove the `getUserImages` function and the `userImages` variable from `app/profile/page.tsx`. The client component already fetches images via the storage action when needed.

**Step 2: Fix payment method type mismatch**

In `profilePage.tsx`, change the `<option value='BANK'>Bank Transfer</option>` to `<option value='BANK_TRANSFER'>Bank Transfer</option>` to match the type definition.

**Step 3: Fix memory leak from URL.createObjectURL**

Extract the object URL creation into a `useMemo` or `useState` with cleanup:
```tsx
const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

useEffect(() => {
  if (imageFile) {
    const url = URL.createObjectURL(imageFile)
    setImagePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }
  setImagePreviewUrl(null)
}, [imageFile])
```

Replace `URL.createObjectURL(imageFile)` in the render with `imagePreviewUrl`.

**Step 4: Fix stale closure in fetchProfile**

Add `userInfo` to the dependency array of `useCallback` and use a `useRef` for `userInfo` to avoid stale closures:
```tsx
const userInfoRef = useRef(userInfo)
userInfoRef.current = userInfo

const fetchProfile = useCallback(async () => {
  const freshProfile = await getProfile(userInfoRef.current.id)
  // ...
}, [])
```

**Step 5: Remove avatar cache-busting hack**

Remove the timestamp-based cache busting in `getAvatarUrl`. Instead, rely on `unoptimized` prop on the Image component (already present) and use a state-based version key after uploads.

**Step 6: Verify build**

Run: `bun run build`

**Step 7: Commit**

```bash
git add -A
git commit -m "fix: profile page - memory leak, type mismatch, stale closure, unused stub"
```

---

### Task 6: Dashboard Page Audit & Fixes

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/dashboardClient.tsx`

**Issues Found:**

1. **Dashboard page uses stub data** (page.tsx:7-8) — `userProfile` is set to `null as unknown as UserProfile` and `initialData` is `{}`. No auth check redirects unauthenticated users. The dashboard shows completely empty data.

2. **No auth redirect on dashboard** — Unlike other pages (profile), the dashboard doesn't redirect unauthenticated users. Should redirect to `/auth` if no user session.

3. **Hardcoded currency locale** (dashboardClient.tsx:494-498) — Uses `"en-PH"` and `"PHP"` hardcoded. Should use the currency settings from `getSetting("currency_tax")`.

4. **`getValues` dependency array includes `initialData`** (dashboardClient.tsx:192) — If `initialData` is provided (from server component), `getValues` returns early, but `initialData` is part of the dependency array causing unnecessary re-renders when the object reference changes.

5. **Time display has inconsistent indentation** (dashboardClient.tsx:750-758) — Template literal with extra spaces causing inconsistent time display formatting.

6. **Staff dashboard doesn't show financial metrics** — Even though the staff dashboard fetches inventory, it doesn't show daily sales or financial metrics like the admin dashboard.

7. **No branch filtering on dashboard data** — The dashboard doesn't filter by branch. Inventory alerts, appointments, and financial metrics show data across all branches regardless of the branch selector.

**Step 1: Add auth redirect to dashboard page.tsx**

```tsx
import { getCurrentUser } from "@/utils/auth/permissions"
import { redirect } from "next/navigation"

export default async function Dashboard() {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    redirect("/auth")
  }
  // ... existing code, but use real data
}
```

**Step 2: Replace stub data with real data fetching**

Fetch dashboard data server-side using `getCurrentUser()` and pass real `DashboardData` to the client component.

**Step 3: Fix hardcoded currency**

Add a `useEffect` in `DashboardClient` that fetches `getSetting("currency_tax")` and uses `currency_symbol` and locale from settings. Fall back to `"en-PH"` and `"PHP"`.

**Step 4: Fix time display formatting**

Clean up the template literal in the `AppointmentContainer` component (lines 743-758) to remove extra whitespace.

**Step 5: Add branch filtering to dashboard**

Import `useBranchContext` in both `AdminDashboard` and `StaffDashboard`. Filter inventory, appointments, and financial metrics by `currentBranch?.id` when available.

**Step 6: Verify build**

Run: `bun run build`

**Step 7: Commit**

```bash
git add -A
git commit -m "fix: dashboard - auth redirect, real data, currency from settings, branch filtering"
```

---

### Task 7: Calendar Page Audit & Fixes

**Files:**
- Modify: `app/calendar/calendarPage.tsx`
- Modify: `server/actions/appointments.ts`

**Issues Found:**

1. **No branch filtering in `getAllAppointments`** (server action) — This returns all appointments across all branches. The calendar page filters client-side by `currentBranch`, but the server action sends all data.

2. **Profile names batch fetch can loop** (calendarPage.tsx:122-146) — The `useEffect` that batches profile name fetching includes `profileNames` in the dependency array. This means after setting profile names, the effect re-runs, but `idsToFetch` will be empty, so it exits early. Not a bug but an unnecessary re-render.

3. **`PENDING` and `CANCELLED` appointments are hidden** (calendarPage.tsx:83) — Filter skips `PENDING` and `CANCELLED` status from calendar dots. Users can't see pending appointments on the calendar, which is confusing when they receive appointment notifications but can't see them.

4. **Appointment link opens in new tab** (calendarPage.tsx:539) — `target='_blank'` on calendar appointment links causes them to open in new tabs instead of navigating within the app.

5. **Mobile appointments panel shows on initial load** (calendarPage.tsx:405) — `isMobile || opened` means on mobile, the appointments panel always shows. If there's limited screen space, this could be overwhelming.

**Step 1: Add `branchId` parameter to `getAllAppointments` and `getMonthlyAppointments`**

In `server/actions/appointments.ts`, add an optional `branchId` parameter:
```typescript
export async function getAllAppointments(branchId?: string | null) {
  // ... existing query, but add WHERE branch_id = branchId OR branch_id IS NULL if branchId is provided
}
```

**Step 2: Update calendar to pass branch filter to server actions**

In `calendarPage.tsx`, pass `currentBranch?.id` to the appointment fetching calls.

**Step 3: Show pending appointments with different styling**

Change the filter from `ap.status === "PENDING" || ap.status === "CANCELLED"` to only skip `CANCELLED`. Show `PENDING` appointments with a distinct visual style (e.g., dotted border, yellow dot).

**Step 4: Fix appointment links to navigate within the app**

Change `<motion.a>` to `<Link>` from Next.js or remove `target='_blank'`.

**Step 5: Remove `profileNames` from useEffect dependency array**

Use `useRef` for the fetched IDs tracking to prevent the effect from re-running when profileNames updates.

**Step 6: Verify build**

Run: `bun run build`

**Step 7: Commit**

```bash
git add -A
git commit -m "fix: calendar - branch filtering, show pending appointments, fix navigation links"
```

---

### Task 8: Config Page Audit & Fixes

**Files:**
- Modify: `app/config/configPage.tsx` (continues from offset 1025)
- Modify: `server/actions/settings.ts`

**Issues Found (from first 1024 lines):**

1. **Duplicate settings initialization logic** (configPage.tsx:170-243) — The `fetchSettings` function has a 30-line `switch` inside `try` and then repeats the same 30-line `switch` inside the `initializeSettings` fallback. This should be extracted into a helper function.

2. **No authorization guard on `updateSetting`** (server action) — Any authenticated user can update settings, not just admins. Should verify `role === "admin"` before allowing writes.

3. **Business hours are global, not per-branch** — Critical for multi-branch: each branch may have different operating hours. The `BusinessHoursValue` type and `business_hours` setting need to be branch-scoped.

4. **`handleSaveService` doesn't validate branch_id** — When creating a service, `branch_id: null` is valid but means "shared across all branches". There's no UI indication that leaving branch empty means "shared"

5. **Service form state uses `_serviceForm` (prefixed with underscore)** (line 97) — This TypeScript convention signals an unused variable, but the form state IS used (passed to ServiceModal). The underscore prefix should be removed.

**Step 1: Extract settings population into a helper function**

Create `populateSettingsFromResult(settings: SystemSetting[])` that maps over settings and calls the appropriate state setters. Use this in both the main fetch and the initialization fallback.

**Step 2: Add admin authorization check to `updateSetting` and `initializeSettings`**

In `server/actions/settings.ts`, add:
```typescript
const user = await getCurrentUser()
if (!user || user.role !== 'admin') {
  return { success: false, error: 'Unauthorized' }
}
```

**Step 3: Rename `_serviceForm` to `serviceForm`**

Remove the underscore prefix since it IS used (read by ServiceModal).

**Step 4: Read remaining config page code (offset 1025+) and check for issues**

```bash
rg "configPage" --type tsx -l
```

Read the rest of the file and check the business settings, system settings, and any other tabs.

**Step 5: Verify build**

Run: `bun run build`

**Step 6: Commit**

```bash
git add -A
git commit -m "fix: config - extract settings helper, add auth guard, fix variable naming"
```

---

### Task 9: System Logs Page Audit & Fixes

**Files:**
- Modify: `app/(app)/admin/logs/page.tsx`

**Issues Found:**

1. **Race condition in search debounce** — The `useEffect` that sets `page` to 1 on search change AND the `useEffect` that calls `fetchLogs` on dependency changes can cause double-fetching.

2. **CSV export only exports current page** — No mechanism to export all matching logs regardless of pagination.

3. **Wrong BranchSelector import** — Uses `@/components/ui/branch-selector` which has different behavior than `@/components/branch-selector`.

4. **Hardcoded page size** — `50` is used directly instead of a constant.

5. **No admin auth check** — The page should verify that the user has admin access before rendering. Currently it only uses `canAccessLogs` which checks access flags, but the route should be admin-only.

**Step 1: Fix race condition in search/fetch**

Debounce the search input and combine the page-reset and fetch into a single effect chain:
```tsx
const [debouncedSearch, setDebouncedSearch] = useState("")

useEffect(() => {
  const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
  return () => clearTimeout(timer)
}, [searchQuery])

useEffect(() => {
  setPage(1)
}, [debouncedSearch, levelFilter, typeFilter, branchId, startDate, endDate])

useEffect(() => {
  fetchLogs()
}, [page, debouncedSearch, levelFilter, typeFilter, branchId, startDate, endDate])
```

**Step 2: Fix BranchSelector import**

Change from `@/components/ui/branch-selector` to `@/components/branch-selector` (after Phase 1 consolidation).

**Step 3: Extract page size constant**

```typescript
const LOGS_PAGE_SIZE = 50
```

**Step 4: Add CSV export for all matching logs**

Add a "Export All" button that calls `getLogs` with `page: 1, pageSize: total` to get all matching results, then generates CSV from that.

**Step 5: Verify build**

Run: `bun run build`

**Step 6: Commit**

```bash
git add -A
git commit -m "fix: system logs - search debounce, branch selector import, full CSV export"
```

---

### Task 10: Branches Page & Branch Integration Audit

**Files:**
- Modify: `app/(app)/admin/logs/page.tsx` (branch selector fix)
- Modify: `components/branch-context.tsx`
- Modify: `utils/auth/permissions.ts`
- Modify: `utils/routes-config.ts`

**Issues Found:**

1. **Route visibility bug** — The branches route at `/admin/branches` uses `perms: "config"`, but `canManageBranches` requires `isITAdmin()`. Users with `config` access can see the route but get denied access.

2. **`canManageBranches` is too restrictive** — Only IT admins can manage branches. Regular admins should likely have access too.

3. **`getAllBranches` returns inactive branches** — Non-admin users should not see inactive branches. The root `BranchSelector` calls `getAllBranches` which returns everything.

4. **Branch API route returns raw DB rows** — No type validation or user-based filtering.

5. **No branch-scoped permissions** — Users can access data from any branch regardless of their branch assignment.

**Step 1: Fix route permission for branches**

In `utils/routes-config.ts`, change the branches route permissions to require `admin` role instead of `config` access flag. This ensures only admins see the link, and then `canManageBranches` gates actual mutations.

Alternatively, update `canManageBranches` to allow regular admins:
```typescript
export function canManageBranches(user: UserProfile): boolean {
  return user.role === 'admin'
}
```

**Step 2: Fix `getAllBranches` to filter inactive branches for non-admin users**

In `server/actions/branches.ts`, add a parameter to control whether inactive branches are returned:
```typescript
export async function getAllBranches(includeInactive = false): Promise<ActionResponse<Branch[]>>
```

**Step 3: Fix branch API route to validate user and filter**

In `app/api/branches/route.ts`, add authentication check and only return active branches for non-admin users.

**Step 4: Verify build**

Run: `bun run build`

**Step 5: Commit**

```bash
git add -A
git commit -m "fix: branch integration - route permissions, inactive branch filtering, API auth"
```

---

### Task 11: Accounting Page Audit & Fixes

**Files:**
- Modify: `app/accounting/accountingPage.tsx`
- Modify: `server/actions/accounting.ts`

**Issues Found:**

1. **Branch filter includes NULL branch entries** — The accounting server action uses `or(eq(branchId), isNull(branchId))` which means branch-specific queries always include "global" (no branch) entries. This may confuse users who expect to see only their branch's data.

2. **No authorization on `createLedgerEntry`** — Any authenticated user can create entries for any branch.

3. **Double error logging** — Some error paths call both `logError()` and `createLogs()` with ERROR level, creating duplicate log entries.

4. **SQL LIKE pattern injection** — Search filters using `%${filters.search}%` allow wildcards in search terms that could cause unexpected matches.

5. **Journal entries have no `branch_id`** — When creating a journal entry, no branch association is set, making it impossible to track which branch a journal entry belongs to.

6. **Category auto-creation is not branch-scoped** — Categories are global, but in a multi-branch system, each branch may need different categories.

**Step 1: Fix double error logging**

In `server/actions/accounting.ts`, find all instances where both `logError()` and `createLogs()` are called in the same error path. Remove one of them (prefer `createLogs` for consistency with the rest of the app).

**Step 2: Add admin authorization to `createLedgerEntry` and `voidLedgerEntry`**

```typescript
const user = await getCurrentUser()
if (!user || user.role !== 'admin') {
  return { success: false, error: 'Unauthorized' }
}
```

**Step 3: Escape LIKE wildcards in search filter**

Create a utility function:
```typescript
function escapeLike(input: string): string {
  return input.replace(/[%_]/g, '\\$&')
}
```

Use it in search filters: `like(entries.description, `%${escapeLike(filters.search)}%`)`

**Step 4: Add branch_id parameter to journal entry creation**

Add `branch_id` to the `createJournalEntry` function signature and pass it through to the database insert.

**Step 5: Verify build**

Run: `bun run build`

**Step 6: Commit**

```bash
git add -A
git commit -m "fix: accounting - auth guards, LIKE escaping, branch on journal entries, remove double logging"
```

---

## Phase 3: Server Action Critical Fixes

### Task 12: Fix Race Conditions & Data Integrity Issues

**Files:**
- Modify: `server/actions/appointments.ts`
- Modify: `server/actions/inventory.ts`
- Modify: `server/actions/profile.ts`
- Modify: `server/actions/branches.ts`

**Issues Found:**

1. **Appointment double-booking race condition** — The overlap check and insertion are not within a transaction.

2. **Inventory restock reads outside transaction** — Item stock is read before the transaction, risking stale data.

3. **Branch user assignment is non-atomic** — Read-modify-write on `branchIds` array can lose concurrent updates.

4. **Profile `updateProfile` normalizes empty strings to `undefined`** — Using `||` converts `""` to `undefined`, preventing intentional blank values.

5. **`console.warn` in deprecated profile functions** — Should use `createLogs` per project conventions.

**Step 1: Wrap appointment overlap check + insert in a transaction**

In `server/actions/appointments.ts`, wrap the overlap check AND the insertion in a single SQL transaction:
```typescript
await db.transaction(async (tx) => {
  const overlapping = await tx.select()...
  if (overlapping.length > 0) throw error
  await tx.insert(appointments)...
})
```

**Step 2: Move inventory read inside the transaction**

In `server/actions/inventory.ts`, move the `getInventoryItem` call inside the transaction for `restockInventoryItemWithAccounting`.

**Step 3: Use atomic array operations for branch assignments**

Replace the read-modify-write pattern with SQL array append/remove operations:
```sql
UPDATE users SET branch_ids = array_append(branch_ids, $1) WHERE id = $2
```

**Step 4: Fix `updateProfile` normalization**

Replace `||` with nullish coalescing `??` for fields that should allow empty strings:
```typescript
phone_number: data.phone_number ?? undefined,
```

**Step 5: Replace `console.warn` with `createLogs`**

In `server/actions/profile.ts`, replace the four `console.warn` calls in deprecated functions with `createLogs`.

**Step 6: Verify build**

Run: `bun run build`

**Step 7: Commit**

```bash
git add -A
git commit -m "fix: server actions - transaction safety, atomicity, normalization fixes"
```

---

## Phase 4: Improvements & Recommendations

### Task 13: Add Branch-Aware Business Hours

**Files:**
- Modify: `utils/types/settings.ts`
- Modify: `server/actions/settings.ts`
- Modify: `app/config/configPage.tsx`
- Modify: `components/branch-selector.tsx`

**Problem:** Business hours are global. Each branch should be able to set its own operating hours.

**Step 1: Update BusinessHoursValue type**

Add a `branch_overrides` field:
```typescript
export type BusinessHoursValue = {
  [day in DayOfWeek]: DayHours
} & {
  branch_overrides?: Record<string, { [day in DayOfWeek]?: DayHours }>
}
```

**Step 2: Update the config page UI**

When a branch is selected in config, show the branch-specific override hours (or fall back to global). Add a toggle to "Use global hours" per branch.

**Step 3: Update `isWithinBusinessHours` to check branch-specific hours**

When a `branchId` is provided, first check for a branch override, then fall back to global hours.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add branch-aware business hours with overrides"
```

---

### Task 14: Add Branch Filtering to Dashboard Appointments

**Files:**
- Modify: `app/dashboardClient.tsx`

**Step 1: Import useBranchContext in both dashboard components**

```tsx
import { useBranchContext } from "@/components/branch-context"
```

**Step 2: Filter appointments by branch**

In both `StaffDashboard` and `AdminDashboard`, filter the appointments list:
```tsx
const filteredAppointments = useMemo(() => {
  if (!currentBranch) return appointments
  return appointments.filter(ap => !ap.branch_id || ap.branch_id === currentBranch.id)
}, [appointments, currentBranch])
```

**Step 3: Use filtered appointments in render**

Replace `appointments` references in the JSX with `filteredAppointments`.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: dashboard branch-aware appointment filtering"
```

---

### Task 15: Fix Route Visibility for Branches Page

**Files:**
- Modify: `utils/routes-config.ts`
- Modify: `utils/auth/permissions.ts`

**Step 1: Update permissions for branch management**

Change `canManageBranches` to allow all admins:
```typescript
export function canManageBranches(user: UserProfile): boolean {
  return user.role === 'admin'
}
```

**Step 2: Update route config for branches**

Change the branches route `perms` from `"config"` to `"admin"` or add a specific check.

**Step 3: Commit**

```bash
git add -A
git commit -m "fix: allow regular admins to access branch management"
```

---

## Phase 5: Build & Lint Verification

### Task 16: Fix All Lint Warnings & Build Errors

**Step 1: Run ESLint with strict flags**

```bash
bun run lint
```

Review any warnings and fix them.

**Step 2: Run TypeScript strict type-check**

```bash
bunx tsc --noEmit
```

Fix any type errors found.

**Step 3: Run full production build**

```bash
bun run build
```

Verify all pages compile successfully and no warnings remain.

**Step 4: Fix any remaining console.log/console.warn in server code**

```bash
rg "console\.(log|warn|error)" server/ --type ts -l
```

Replace all with `createLogs` per project conventions.

**Step 5: Fix any remaining unused variables**

```bash
rg "_serviceForm|_unused" --type tsx -l
```

Remove underscore prefixes from actually-used variables, or remove genuinely unused variables.

**Step 6: Fix any accessibility issues**

Check all `<select>` and `<input>` elements for proper labels, `aria-label`, or associated `<label>` elements. Add `aria-label` where missing.

**Step 7: Final build verification**

```bash
bun run lint && bun run build
```

Expected: Clean build with no errors or warnings.

**Step 8: Commit**

```bash
git add -A
git commit -m "chore: fix all lint warnings, type errors, and accessibility issues"
```

---

## Summary of All Issues Found

### Critical (Must Fix)
| # | Issue | Pages Affected | Phase |
|---|-------|----------------|-------|
| 1 | Dual notification systems | All | 1 |
| 2 | Dual branch state management | All | 1 |
| 3 | Duplicate BranchSelector components | All | 1 |
| 4 | AdminActionGuard cloneElement bug | Config, Accounting | 1 |
| 5 | Dashboard shows stub data / no auth | Dashboard | 2 |
| 6 | Appointment double-booking race condition | Calendar, Appointments | 3 |
| 7 | Route visibility mismatch for branches | Branches | 2 |

### High (Should Fix)
| # | Issue | Pages Affected | Phase |
|---|-------|----------------|-------|
| 8 | Profile image memory leak | Profile | 2 |
| 9 | Calendar shows no pending appointments | Calendar | 2 |
| 10 | No admin auth on settings updates | Config | 2 |
| 11 | No admin auth on accounting entry creation | Accounting | 2 |
| 12 | SQL LIKE pattern injection | Accounting | 2 |
| 13 | Inventory branch filtering inconsistency | Inventory | 3 |
| 14 | Business hours not branch-scoped | Config | 3 |

### Medium (Improvement)
| # | Issue | Pages Affected | Phase |
|---|-------|----------------|-------|
| 15 | Hardcoded currency locale | Dashboard | 2 |
| 16 | CSV export only current page | System Logs | 2 |
| 17 | Payment method type mismatch | Profile | 2 |
| 18 | No branch filtering in dashboard | Dashboard | 3 |
| 19 | Stale closure in profile fetchProfile | Profile | 2 |
| 20 | console.warn instead of createLogs | Profile (server) | 3 |