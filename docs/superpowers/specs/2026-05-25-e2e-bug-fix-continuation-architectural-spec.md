# Architectural Specification: Bug Fix & E2E Testing Continuation

## 1. Executive Summary

This specification defines the architectural approach for fixing two verified defects discovered during the first 4 sessions of E2E testing on the InkSight RDMD application — a HIGH-severity artist dashboard crash (Issue #001) and a MEDIUM-severity staff appointment access denial (Issue #002) — and completing the remaining 10 browser test sessions (5–14). The fixes address architectural flattening in the dashboard's role-handling and gaps in the multi-layer permission gating system. The testing continuation follows the existing 14-session structure established in the original E2E testing architectural spec, incorporating learnings from the first 4 sessions to improve execution efficiency and data isolation.

## 2. Constraints & Non-Negotiables

### Fix Constraints
- **Bug #001 fix MUST NOT** degrade dashboard performance for other roles (admin, manager, staff)
- **Bug #002 fix MUST** maintain strict separation between `appointments_view` and `appointments_manage` — users with view-only permissions must never be able to create, edit, or delete appointments
- **All fixes MUST** follow existing patterns: same permission utility functions (`userHasFlag`, `normalizeFlag`), same `routeConfig` structure, same server/component architecture
- **Fixes MUST NOT** require database migrations — only configuration and code changes
- **Fixes MUST NOT** introduce new dependencies

### Testing Continuation Constraints
- **Must use** `agent_browser` with `sessionMode=fresh` for all sessions (same as sessions 1–4)
- **Must capture** screenshots at all verification points and log any new defects in the issue log
- **Must** clean up test data between sessions to prevent cross-session contamination
- **Must** verify preconditions before each session (DB state, test accounts active, dev server running)
- **Must** use the existing `[E2E]` prefix convention for all test data to enable clear identification
- **Must** start each session with a fresh login via the 4 test accounts — no session reuse across sessions

### Security
- **Never commit** test credentials or `.env.local` changes
- Test accounts are set to `is_active = false` after cleanup (Session 14) — never deleted
- All `[E2E]` test data must be clearly marked so it can be identified and excluded from production reporting

### Performance Budgets
- Bug fixes must not add >50ms to dashboard page load (p95)
- Bug fixes must not add >50ms to appointments page load (p95)
- Permission checks in middleware must remain synchronous and DB-free

## 3. System Boundaries

### IN Scope

| # | Component | Scope |
|---|-----------|-------|
| 1 | **Dashboard page** (`/app/page.tsx` + `dashboardClient.tsx`) | Fix artist dashboard crash — add role-specific data fetching, React ErrorBoundary |
| 2 | **Appointments route** (`middleware.ts` → `routeConfig` → page component) | Fix staff `appointments_view` access denial across all 3 gating layers |
| 3 | **Sidebar** (`components/sidebar.tsx`) | Update route filtering to show Appointments link for `appointments_view` users |
| 4 | **Route config** (`utils/routes-config.ts`) | Add multi-perm support for routes that accept `view` or `manage` flags |
| 5 | **Middleware** (`middleware.ts`) | Update permission check for multi-perm routes — user needs ANY of the listed perms |
| 6 | **Appointment actions** (`server/actions/appointments.ts`) | Verify all mutation actions still guard with `canManageAppointments` — no regression |
| 7 | **Test sessions 1–4** (already executed) | Documented issues analyzed; no re-execution needed |
| 8 | **Test sessions 5–14** | Execute all remaining sessions with improved precondition verification and data isolation |
| 9 | **Issue log** (`docs/superpowers/issues/2026-05-25-issues-log.md`) | Update with any new defects found during sessions 5–14 |
| 10 | **Coverage report** (`docs/superpowers/issues/2026-05-25-coverage-report.md`) | Update coverage matrix to 14/14 sessions after completion |

### OUT OF Scope (explicitly)
- **New features** — no business logic changes beyond the 2 bug fixes
- **Database migrations** — no schema changes required
- **Performance/load testing** — single-user flows only (same as original spec)
- **Email sending / Resend integration** — not tested (same as original spec)
- **File storage / S3** — photo upload testing is UI-only (same as original spec)
- **Security / Turnstile** — Cloudflare Turnstile not tested (same as original spec)
- **Mobile responsive layout** — desktop viewport only (same as original spec)
- **API routes** — `/api/` endpoints not tested directly (same as original spec)
- **All other subsystems already tested in sessions 1–4** — auth, services, inventory, payroll rates are already verified

### Integration Surfaces Touched

```
Bug #001 (Dashboard)
  └── /app/page.tsx          ───→ getCurrentUser() ───→ getUserAppointments()
  └── /app/dashboardClient.tsx ──→ StaffDashboard ───→ TimeClockWidget
                                └── AppointmentContainer

Bug #002 (Appointments Access)  
  └── /middleware.ts          ───→ routeConfig ───→ normalizeFlag()
  └── /utils/routes-config.ts ───→ perms field
  └── /components/sidebar.tsx ───→ RouteGroup filter logic
  └── /app/appointments/page.tsx ──→ canManageAppointments()
  └── /app/appointments/appointmentsPage.tsx ──→ client-side rendering

Sessions 5-14
  └── All existing integration surfaces from the original spec remain in scope
  └── Sessions are executed sequentially due to data dependencies
```

## 4. Component Architecture

### 4.1 Bug #001 — Dashboard Role Safeguarding

The current architecture flattens all non-admin users into a single `StaffDashboard` component. This must be replaced with a role-aware dispatch pattern.

**Current (broken) architecture:**
```
Dashboard (server) ──→ DashboardClient ──→ userInfo.role !== "admin" → StaffDashboard
```

**Target architecture:**
```
Dashboard (server) ──→ DashboardClient
                           ├── userInfo.role === "admin"   → AdminDashboard
                           ├── userInfo.role === "manager" → ManagerDashboard
                           ├── userInfo.role === "artist"  → ArtistDashboard
                           └── userInfo.role === "staff"   → StaffDashboard
```

**Key design decisions:**
- The server component (`page.tsx`) maintains a single fetch-all approach — it fetches all data types (inventory, appointments, metrics) in parallel regardless of role, and the client decides what to render. This avoids adding per-role server-side branches that would complicate the server component.
- Each role-specific dashboard component (`ArtistDashboard`, `ManagerDashboard`) is a focused subset of the current `AdminDashboard`/`StaffDashboard`. They only render content relevant to that role's access flags.
- A top-level `ErrorBoundary` wraps the entire dashboard content area, so a render error in any one section does not crash the entire page.

**Component ownership:**

| Component | Responsibility | Data Dependencies |
|-----------|---------------|-------------------|
| `ArtistDashboard` (new) | Upcoming appointments assigned to this artist, time-clock widget, walk-in creation button | `appointments` (filtered by staff_id), `userInfo` |
| `ManagerDashboard` (new) | Same as AdminDashboard but with management-only metrics | Full data set, but no system-config sections |
| `StaffDashboard` (existing, refactored) | Time-clock widget, inventory alerts (if `inventory_manage` flag present) | Limited to `getUserAppointments` |
| `AdminDashboard` (existing, unchanged) | Full dashboards with all metrics, inventory, financial stats | Full data set |

### 4.2 Bug #002 — Multi-Perm Route Architecture

The current single-perm `routeConfig` entry must be extended to support fallback permissions. This requires changes in 4 layers:

**Layer 1 — Route Configuration (`utils/routes-config.ts`):**

Current structure: `perms: "appointments_manage"` (single string)

Target structure — the `RouteConfig` interface gains an optional `fallbackPerms` array:
```typescript
{
    title: "Appointments",
    href: "/appointments",
    perms: "appointments_manage",          // primary — grants full access
    fallbackPerms: ["appointments_view"],  // fallback — grants view-only access
    iconName: "ClipboardListIcon",
    group: "core"
}
```

**Design rationale:** The `perms` field remains the primary "can do everything" flag. `fallbackPerms` is an additive array — users with ANY of these flags can access the route, but the client component detects which flag granted access and renders the appropriate UI mode (full CRUD vs. view-only).

**Layer 2 — Middleware (`middleware.ts`):**

Current logic:
```typescript
const hasRequiredFlag = flags.some(f => normalizeFlag(f) === normalizeFlag(requiredPerms))
```

Target logic:
```typescript
const hasPrimaryFlag = flags.some(f => normalizeFlag(f) === normalizeFlag(route.perms))
const hasFallbackFlag = route.fallbackPerms?.some(fp =>
    flags.some(f => normalizeFlag(f) === normalizeFlag(fp))
) ?? false
const hasAccess = hasPrimaryFlag || hasFallbackFlag

if (!hasAccess) {
    return NextResponse.redirect(new URL('/unauthorized', request.url))
}

// Access level determination is delegated to the page server component
// which independently calls getCurrentUser() + canManageAppointments() / canViewAppointments()
// The middleware only performs the gateway redirect — it does not communicate mode to pages
return response
```

**Layer 3 — Page Server Component (`/app/appointments/page.tsx`):**

Current: redirects if `!canManageAppointments(user)`

Target: allows through if `canViewAppointments(user)`, passes an `isReadOnly` prop:
```typescript
if (!user) redirect("/auth")
const canManage = await canManageAppointments(user)
const canView = await canViewAppointments(user)
if (!canManage && !canView) redirect("/unauthorized")

return <AppointmentsPageClient isReadOnly={!canManage} />
```

**Layer 4 — Page Client Component (`/app/appointments/appointmentsPage.tsx`):**

When `isReadOnly === true`:
- Hide "New Appointment" button
- Hide "Walk-in" button
- Hide inline edit/delete controls on appointment rows/ detail pages
- Show all existing data in read-only mode

**Layer 5 — Sidebar (`components/sidebar.tsx`):**

Current: `normalizeFlag(f) === normalizeFlag(route.perms)`

Target: `normalizeFlag(f) === normalizeFlag(route.perms) || route.fallbackPerms?.some(fp => normalizeFlag(f) === normalizeFlag(fp))`

### 4.3 Testing Continuation — Session Execution Architecture

The remaining 10 sessions follow the same per-session pattern established in sessions 1–4, with two key improvements:

**Improvement 1 — Precondition Script:**

Before each session, run a verification script (`scripts/e2e-check-state.ts`) that confirms:
1. Dev server is running (HTTP 200 at `/`)
2. All 4 test accounts are active in the database
3. Required seed data exists (branches, services, inventory, rate levels)
4. Database is not in a dirty state from a previous session

**Improvement 2 — Data Isolation:**

Each session that creates data marks it with `[E2E]` prefix. Sessions 5–14 are also designed to clean up their own test data where possible (e.g., deleting test rates, voiding test transactions). Final cleanup (Session 14) deactivates test accounts.

**Session execution order (fixed, using script numbering):**

```
Scripts 05-07 (Appointment Types) → Must run first — creates appointments used by Script 08
Script 08 (Sales Deep Dive)       → Must run after 05-07 — uses completed appointments
Script 09 (Payroll Processing)    → Must run after 08 — uses completed transactions
Script 10 (Accounting)            → Must run after 09 — uses payroll entries + transactions
Script 11 (Time-Clock)            → Independent — can run after 10
Script 12 (Metrics & Config)      → Independent — can run after 11
Script 13 (Cleanup)               → Must run last — deactivates accounts
```

## 5. Data Flow

### 5.1 Bug #001 — Dashboard Data Flow (Fixed)

```
HTTP GET /
  └── Dashboard (server) — fetch ALL data in parallel, regardless of role
        ├── getCurrentUser() — auth check
        ├── getInventory() — inventory list (consumed by all roles)
        ├── getMonthlyAppointments() — monthly appts (consumed by admin/manager)
        ├── getUserAppointments(currentUser.id) — user's appts (consumed by artist/staff)
        ├── getTodaySummary() — daily sales (consumed by admin/manager)
        └── getFinancialMetrics() — metrics (consumed by admin only)
  
  └── DashboardClient (client) — dispatch by role
        ├── userInfo.role === "admin"  → AdminDashboard
        │     └── Render: inventory alerts, daily sales, metrics, upcoming appts
        ├── userInfo.role === "manager" → ManagerDashboard  
        │     └── Render: inventory alerts, daily sales, upcoming appts (no financialMetrics)
        ├── userInfo.role === "artist" → ArtistDashboard
        │     └── Render: time-clock widget, MY upcoming appts, walk-in button
        └── userInfo.role === "staff" → StaffDashboard
              └── Render: time-clock widget, walk-in button, inventory alerts (if flag)
        
  └── React ErrorBoundary wraps ALL dashboard content
        └── On crash: show "Dashboard temporarily unavailable" with reload button
              └── Log error to createLogs() for diagnostics
```

**State ownership:**
- The server component fetches data once on initial page load
- `DashboardClient` re-fetches data on client side if `initialData` is empty (loading fallback)
- Branch context changes trigger re-fetch via `useEffect` dependency on `currentBranch`
- Error state: if ANY data fetch fails, the server component catches the error, logs via `createLogs()`, and passes empty data. The client component renders with empty data — never crashes.

### 5.2 Bug #002 — Appointments Access Flow (Fixed)

```
HTTP GET /appointments (user: staff with appointments_view only)
  └── middleware.ts — gateway only, no mode propagation
        ├── routeConfig.perms = "appointments_manage"
        ├── routeConfig.fallbackPerms = ["appointments_view"]
        ├── Has either perm → passes through
        └── Has neither → redirect /unauthorized
  
  └── Page server component (/app/appointments/page.tsx)
        ├── Independently calls getCurrentUser() → canManageAppointments(user) → false
        ├── Independently calls canViewAppointments(user) → true
        └── Passes isReadOnly={true} to AppointmentsPageClient
  
  └── AppointmentsPageClient
        ├── isReadOnly === true
        ├── Hides "New Appointment" button
        ├── Hides "Walk-in" button
        ├── Renders appointment list (read-only)
        ├── Appointment rows link to detail page (read-only)
        └── Row-level edit/delete controls hidden
  
  └── Detail page (/app/appointments/[id])
        ├── Checks isReadOnly via same prop chain
        └── Action bar disabled for view-only users
```

### 5.3 Session Data Lifecycle — Testing Continuation

```
Session Start
  ├── Verify preconditions (dev server, accounts active, seed data)
  ├── Login via agent_browser
  ├── Execute test steps
  │     └── Each mutation → snapshot → verify → screenshot
  ├── Log any issues found
  ├── Clean up test data created in this session (where safe)
  └── Close browser session

Dependency chain (using script numbering):
  Script 05 (Piercing/Shoe/Other Appts) → creates COMPLETED appointments
  Script 06 (Walk-in + Downpayment)     → creates DEPOSIT_PAID → PAID_IN_FULL
  Script 07 (Reschedule/Cancel)         → exercises status transitions
  Script 08 (Sales Deep Dive)           → uses existing COMPLETED appointments
  Script 09 (Payroll)                   → uses transactions from Script 08
  Script 10 (Accounting)                → uses ledger entries from Scripts 08-09
  Script 11 (Time-Clock)                → independent
  Script 12 (Metrics/Config)            → independent
  Script 13 (Cleanup)                   → deactivates test accounts, verifies cleanup
```

### 5.4 Caching Strategy

- `revalidatePath()` and `revalidateTag()` are called by server actions — after every mutation test step, navigate away and back to verify persistence
- The `cache.ts` utility may cache server action results — when testing CRUD, always refresh the page after create/update/delete, then verify
- For appointments page: status transitions should immediately reflect after mutation — test this by comparing pre/post-action snapshots
- No new caching introduced by these fixes

## 6. Security & Error Handling

### 6.1 Authentication/Authorization Model

**For Bug #001 (Dashboard):**
- The dashboard server component already calls `getCurrentUser()` and redirects unauthenticated users to `/auth` — no change needed
- The client component receives `userProfile` from the server and also reads `userInfo` from `SideBarContext` — both sources are verified
- No elevation of privilege: the fix restricts what each role sees, it doesn't expand access

**For Bug #002 (Appointments Access):**
- The `appointments_view` flag is defined in the canonical access flags registry (`utils/auth/access-flags.ts`) as `{ label: 'Appointments View', description: 'View appointments calendar' }` — it is a documented, intended permission
- The fix enables an existing permission that was defined but not wired to the route/page layer
- Server actions (`createAppointment`, `updateAppointment`, `setAppointmentStatus`) all call `getCurrentUser()` + `canManageAppointments()` internally — these checks remain unchanged and enforce write protection
- The `appointments_view` flag grants read-only access at middleware, page, and UI layers — write operations are blocked by the server action layer

**Key test scenarios for Bug #002:**
1. Staff with `appointments_view` can access `/appointments` and see all appointments ✅
2. Staff with `appointments_view` CANNOT see "New Appointment" button ✅ (client-side gating)
3. Staff with `appointments_view` clicking "Start Session" on an appointment returns 403/redirect ✅ (server action gating)
4. Manager with `appointments_manage` still sees full CRUD UI ✅ (no regression)
5. Staff WITHOUT either flag redirected to `/unauthorized` ✅ (no regression)

### 6.2 Input Validation Strategy

No changes to existing Zod validation schemas. All server action inputs are validated server-side. The fixes only affect which server actions are reachable based on permission flags.

### 6.3 Error Handling

**Dashboard ErrorBoundary:**
- New `DashboardErrorBoundary` component wraps all dashboard content in `dashboardClient.tsx`
- On crash: renders a recoverable UI showing "Dashboard temporarily unavailable" with a reload button
- Logs the error via `createLogs()` for diagnostics
- Does not crash the entire application — sidebar and navigation remain functional
- Does not hide the error from developers — the issue log will track occurrence

**Middleware permission-check errors:**
- Middleware is synchronous and DB-free — no async error paths
- If `user.access_flags` is null/undefined, the `?? []` fallback ensures safe iteration
- If an unknown flag is encountered, `normalizeFlag()` passes it through unchanged

**Testing session failures:**
- Each test session is independently executable — if one session fails, the remaining sessions can still run
- If a precondition check fails (e.g., seed data missing), the session reports the missing precondition and skips execution
- Sessions that create data dependencies (5→8→9→10) are ordered; if a dependency session failed, the dependent session reports the missing preconditions

### 6.4 Logging & Monitoring

- Dashboard crashes are logged via `createLogs()` with `level: 'ERROR', type: 'SYSTEM'`
- Access denials are logged by middleware redirects (standard Next.js redirect logging)
- No additional logging introduced
- Testing session results are documented in the issue log manually

## 7. Testing Strategy

### 7.1 Bug Verification Tests

| Bug | Verification Method | Pass Criteria |
|-----|-------------------|---------------|
| #001 — Artist dashboard crash | Login as `e2e-artist`, navigate to `/` | Dashboard loads without error overlay, shows artist-appropriate content |
| #001 — No regression for manager | Login as `e2e-manager`, navigate to `/` | Dashboard loads with management metrics |
| #001 — No regression for admin | Login as `e2e-admin`, navigate to `/` | Dashboard loads with full admin view |
| #002 — Staff appointments access | Login as `e2e-staff`, navigate to `/appointments` | Page loads with appointment list, no `/unauthorized` redirect |
| #002 — View-only gating | Staff with `appointments_view` only | No "New Appointment" button, no edit controls visible |
| #002 — Write still blocked | Staff tries to create appointment via direct API call | Server action returns 403/error |
| #002 — No regression for manager | Manager logs in, navigates to `/appointments` | Full CRUD UI still visible |

### 7.2 Session Execution Plan (Sessions 5–14)

**Note on numbering:** The original E2E spec defines 14 sessions. Sessions 12 and 13 in the original (Metrics + Config) are consolidated into a single script file. The chart below uses the script file numbering (5–13), which map to original sessions 5–14 as follows:

| Script # | Script File | Original Sessions | Description |
|----------|------------|-------------------|-------------|
| 05 | `session-05-appt-other-types.md` | 5 | Other appointment types (PIERCING, SHOE, OTHER) |
| 06 | `session-06-walkin-downpayment.md` | 6 | Walk-in with downpayment |
| 07 | `session-07-reschedule-cancel.md` | 7 | Reschedule and cancel |
| 08 | `session-08-sales-deep.md` | 8 | Sales deep dive (all payment methods) |
| 09 | `session-09-payroll-processing.md` | 9 | Payroll processing |
| 10 | `session-10-accounting.md` | 10 | Accounting verification |
| 11 | `session-11-timeclock.md` | 11 | Time-clock |
| 12 | `session-12-metrics-config.md` | 12–13 | Metrics + Configuration |
| 13 | `session-13-cleanup.md` | 14 | Cleanup |

Key risks and mitigations for each session:

| Script # | Key Risk | Mitigation |
|----------|----------|------------|
| 05 | PIERCING/SHOE type-specific fields may not render | Verify modal fields exist before filling |
| 06 | Downpayment modal may have changed | Check snapshot for Collect Downpayment toggle |
| 07 | CANCELLED→CONFIRMED recovery may have new gating | Verify button text before clicking |
| 08 | Split payment UI may differ per payment method | Use snapshot to detect split field layout |
| 09 | Auto-created payroll entries require staff assignments | Verify artist assigned to test appointments |
| 10 | Ledger entries may not exist if payroll wasn't processed | Skip ledger verification if prerequisite data missing |
| 11 | QR generation may fail without HTTPS hostname | Verify QR code renders as canvas/image |
| 12 | Date-range filter may return empty for test data | Accept empty states as valid |
| 13 | Deactivating accounts may cascade to related records | Only set `is_active = false` — no deletes |

### 7.3 Issue Logging Protocol

Each new defect found during sessions 5–14 must be added to the existing issue log with:
- Sequential issue number (continuing from #003)
- Subsystem name
- Severity: HIGH / MEDIUM / LOW
- Status: OPEN
- Description, Steps to Reproduce, Expected vs Actual
- Screenshot path
- Session number reference

## 8. Migration & Rollback

### 8.1 Code Changes

| File | Change Description | Rollback |
|------|-------------------|----------|
| `/app/dashboardClient.tsx` | Add `ArtistDashboard`, `ManagerDashboard` components; add `ErrorBoundary` | `git checkout HEAD~1 -- app/dashboardClient.tsx` |
| `/app/page.tsx` | Update data fetching to handle all roles | `git checkout HEAD~1 -- app/page.tsx` |
| `/utils/routes-config.ts` | Add `fallbackPerms` to RouteConfig interface and appointments entry | `git checkout HEAD~1 -- utils/routes-config.ts` |
| `/middleware.ts` | Update permission check logic for fallback perms | `git checkout HEAD~1 -- middleware.ts` |
| `/app/appointments/page.tsx` | Update access check to allow `canViewAppointments` | `git checkout HEAD~1 -- app/appointments/page.tsx` |
| `/app/appointments/appointmentsPage.tsx` | Add `isReadOnly` mode rendering | `git checkout HEAD~1 -- app/appointments/appointmentsPage.tsx` |
| `/components/sidebar.tsx` | Update route filter for fallback perms | `git checkout HEAD~1 -- components/sidebar.tsx` |

### 8.2 No Database Changes

No database migrations are required. The fixes are entirely in application code and configuration.

### 8.3 Backward Compatibility

- The `fallbackPerms` field in `RouteConfig` is optional — all existing route entries without it continue to work exactly as before
- The middleware handles routes without `fallbackPerms` identically to the current behavior
- No API response shape changes
- No database schema changes

### 8.4 Testing Rollback Strategy

If a test session corrupts data:
1. Void/refund transactions through the UI (Script 08)
2. Cancel payroll requests through the UI (Script 09)
3. Void ledger entries through the UI (Script 10)
4. Cancel appointments through the UI (Scripts 05-07)
5. For irreversible corruption: restore from database backup (last known good state)
6. Re-run `bun run db:seed` to re-establish baseline seed data

## 9. Open Questions

| # | Question | Resolution Path |
|---|----------|----------------|
| 1 | What specifically causes the artist dashboard crash — is it in `TimeClockWidget`, `AppointmentContainer`, or a missing hook dependency? | Reproduce locally with `e2e-artist` login, check Next.js error overlay stack trace, then determine which component needs fixing |
| 2 | Should the sidebar show the Appointments link for staff with `appointments_view` even though they can only view? | Yes — the sidebar must reflect the route's actual accessibility. If the route is accessible (even view-only), the link should appear |
| 3 | Does the `/appointments/[id]` detail page also need view-only treatment? | Yes — detail page access follows the same gating. Verify and apply `isReadOnly` prop to the detail page component |
| 4 | Should the `ArtistDashboard` and `ManagerDashboard` be separate files or co-located in `dashboardClient.tsx`? | Co-located is fine initially (follows current pattern). Extract to separate files only if they grow beyond 100 lines each |
| 5 | Scripts 05-07 UI testing: do the PIERCING and SHOE detail modals exist and are they wired in the appointments form? | Check `components/appointments/` for type-specific modal components before executing scripts 05-07 |
| 6 | Are there rate-limits that will block rapid login/logout across 10 test sessions? | Check `utils/rate-limit.ts` for auth endpoint rate limits; add delay between login attempts if needed |
