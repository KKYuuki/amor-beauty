# Access Flags System — Architectural Audit & Design Spec

**Date:** 2026-05-15
**Status:** Source of Truth — post-audit architectural spec
**Scope:** Access flags lifecycle — definition, storage, administration, route visibility, business logic enforcement

---

## 1. Current Architecture (As-Is)

### 1.1 Storage Layer

Access flags are stored as a JSONB array of strings in the `user.access_flags` column (Drizzle schema field: `accessFlags`). The default is an empty array `[]`. There is no separate table, enum, or constraint enforcing valid flag values at the database level. RLS is disabled on all tables (`isRLSEnabled: false`).

### 1.2 Permission Model

Three overlapping permission systems coexist:

| Layer | Mechanism | File(s) |
|-------|-----------|---------|
| **Role** | `user.role` — `admin`, `manager`, `staff`, `artist`, `piercer`, `shoe_tech` | `server/db/schema/auth.ts`, `utils/types/auth.ts` |
| **Access Flags** | `user.access_flags[]` — arbitrary strings representing feature permissions | Same schema + `utils/auth/permissions.ts` |
| **Hybrid Capabilities** | Special flags (`artist`, `piercing`, `shoe`) that grant admin users work-capability features | `utils/auth/user-capabilities.ts` |

The `admin` role is a universal bypass: every permission function grants access if `role === 'admin'`, regardless of flags.

### 1.3 Enforcement Points (Current State)

| Enforcement Layer | Status | Details |
|-------------------|--------|---------|
| **Middleware** (`middleware.ts`) | **BROKEN** — all flag checks commented out as TODO | Any authenticated user passes through to any route |
| **Sidebar** (`components/sidebar.tsx`) | **WORKING** — filters routes by `userInfo.access_flags` | Hides links but does not prevent direct URL access |
| **Page-level guards** (server component `page.tsx`) | **INCONSISTENT** — only `sales/page.tsx` and `admin/logs/page.tsx` check permissions; most pages lack guards | See §2.3 |
| **Client-side guards** (`AccessChecker` component) | **UNDERUSED** — only used in `notify/notifyPage.tsx` | Easy to add but not adopted |
| **Server Actions** (`server/actions/*.ts`) | **INCONSISTENT** — some use flag-aware checks, some only check `isAdmin`, some have no checks | See §2.2 |
| **Database RLS** | **DISABLED** — all tables have `isRLSEnabled: false` | No row-level security |

---

## 2. Audit Findings — Critical Gaps

### 2.1 CRITICAL: Middleware Is Fully Bypassed

```typescript
// middleware.ts lines 48-57 — ALL commented out
// TODO: Query user_profiles table for access_flags
// if (!profile?.access_flags?.includes(matchingRoute.perms)) {
//     return NextResponse.redirect(new URL('/', request.url))
// }
```

**Impact:** Any authenticated user can navigate to any route by typing the URL, regardless of access flags. Sidebar hiding is cosmetic only. The `/unauthorized` page referenced by `sales/page.tsx` does not exist.

**Required fix:** Uncomment and complete the middleware check. Query the user table for `accessFlags` using Drizzle, compare against `matchingRoute.perms`, redirect to `/` or a proper unauthorized page.

### 2.2 CRITICAL: Server Action Flag Mismatches

| Server Action File | Checks Used | Should Check | Gap |
|-------------------|-------------|--------------|-----|
| `payroll.ts` | `isAdmin(user)` only | `canManagePayroll(user)` | User with `payroll_manager` flag but not admin **cannot** execute payroll actions despite seeing the route |
| `transactions.ts` | `canAccessAccounting(user)` | `canAccessTransactions(user)` | Wrong flag checked — `accounting` flag gates transactions, `transactions` flag is never enforced |
| `time-clock.ts` | `isAdmin(user)` only | `hasTimeClockAccess(user)` | Function `hasTimeClockAccess` is defined but **never called** — dead code |
| `sales.ts` | `getCurrentUser()` (auth only) | `canAccessTransactions(user)` | No permission check beyond authentication |
| `settings.ts` | `isAdmin(user)` only | No flag-based alternative | Config page is admin-only regardless of flags |
| `branches.ts` | Mixed — some check `canManageBranches`, some `isAdmin` | Should be consistent `canManageBranches` | Inconsistency between action functions within same file |

### 2.3 CRITICAL: `canAccessTransactions` Called Without `await`

```typescript
// app/sales/page.tsx line 15
if (!user || !canAccessTransactions(user)) {  // ← Missing await!
    redirect("/unauthorized")
}
```

Since `canAccessTransactions` is `async`, it returns a `Promise<boolean>`. A Promise is always truthy, so `!Promise` is always `false`. The flag check is **silently bypassed**. Only `!user` (null check) ever triggers the redirect.

### 2.4 HIGH: Flag Name Mismatches Between Route Config and Permission Functions

| Route Config `perms` | Permission Function Checks For | Mismatch |
|----------------------|-------------------------------|----------|
| `"accounts"` | `"user_management"` (in `canManageUsers`) | Different flag names — admin sees/assigns `accounts` but logic checks `user_management` |
| `"metrics"` | `"accounting"` (in `canViewMetrics`) | Metrics and accounting share a flag — no way to grant metrics-only access |
| `"sales"` | `"transactions"` (in `canAccessTransactions`) | Route uses `sales` flag, business logic uses `transactions` flag |
| `"view_logs"` | Admin-only — no flag support | Route config uses `view_logs` flag but `canAccessLogs` ignores flags entirely |
| `"time_clock_admin"` | Inline check (no function) | Flag exists in routes but no reusable permission function |
| `"config"` | No permission function exists | Only admin-role check in `settings.ts` |
| `"notify"` | Inline check only | No reusable permission function |

### 2.5 HIGH: Pages Missing Access Guards

These pages have **no server-side or client-side access check** — they render for any authenticated user who navigates directly:

| Page | Route Config Flag | Should Check |
|------|-------------------|-------------|
| `app/inventory/` | `inventory` | `canManageInventory` |
| `app/metrics/` | `metrics` | `canViewMetrics` |
| `app/config/` | `config` | `isAdmin` (config is admin-only) |
| `app/accounts/` | `accounts` | `canManageUsers` |
| `app/appointments/` | (none — empty perms) | `canManageAppointments` |
| `app/payroll/` | `payroll_manager` | `canManagePayroll` or `canViewOwnPayroll` |
| `app/my-payroll/` | (none — empty perms) | `canViewOwnPayroll` |
| `app/time-clock/` | (none — empty perms) | Auth-only (valid for all staff) |
| `app/accounting/` | `accounting` | `canAccessAccounting` |

### 2.6 MEDIUM: Hybrid Capability Flags Not in Admin UI

The flags `appointments` and `services` exist in permission functions (`canManageAppointments`, `canManageServices`) but are **not** exposed in the admin user-edit UI (`app/accounts/[id]/page.tsx`). The `availableFlags` array is derived from `routes` only, missing these flags.

### 2.7 MEDIUM: Admin UI Flag List Incomplete

The admin edit-user page (`accounts/[id]`) shows flags from `routes.filter(r => r.perms)` plus hardcoded `["view_appointments", "transactions"]`. This means:
- `appointments` flag (checked by `canManageAppointments`) is NOT shown
- `services` flag (checked by `canManageServices`) is NOT shown
- `payroll_manager` flag IS shown (from routes) but is not in the hardcoded list
- `user_management` flag is NEVER shown (the route uses `accounts` instead)

Admins cannot assign flags that the UI doesn't expose.

---

## 3. Flag Inventory — Complete Registry

### 3.1 Feature Access Flags

These control access to application features and routes:

| Flag | Route(s) Gated | Permission Function | Status |
|------|---------------|---------------------|--------|
| `inventory` | `/inventory` | `canManageInventory` | Working (server actions) |
| `accounting` | `/accounting`, `/metrics` | `canAccessAccounting`, `canViewMetrics` | Working (server actions) |
| `payroll_manager` | `/payroll` | `canManagePayroll` | **Defined but never called** |
| `transactions` | _(none directly)_ | `canAccessTransactions` | **Defined but called without await / wrong file** |
| `appointments` | _(none — route has empty perms)_ | `canManageAppointments` | Working (server actions) |
| `user_management` | _(none — route uses "accounts")_ | `canManageUsers` | **Defined but never called** |
| `services` | _(none — route missing)_ | `canManageServices` | Working (server actions) |
| `sales` | `/sales` | _(should be `canAccessTransactions`)_ | **Mismatch with `transactions`** |
| `metrics` | `/metrics` | `canViewMetrics` (checks `accounting`) | **Shares flag with accounting** |
| `view_logs` | `/admin/logs` | `canAccessLogs` (admin-only) | **Flag ignored — admin-only** |
| `time_clock_admin` | `/admin/time-clock` | Inline check only | **No reusable function** |
| `config` | `/config` | _(no function)_ | **Admin-only in practice** |
| `notify` | `/notify` | Inline check only | **No reusable function** |
| `accounts` | `/accounts` | _(should be `canManageUsers`)_ | **Mismatch with `user_management`** |
| `view_appointments` | _(none in route config)_ | Inline check in calendar | **Ad-hoc, no permission function** |

### 3.2 Hybrid Capability Flags

These grant admin users work-execution capabilities (not route access):

| Flag | Purpose | Checked In |
|------|---------|------------|
| `artist` | Grants artist work capability (appointments, payroll) | `user-capabilities.ts`, profile page, calendar |
| `piercing` | Grants piercing work capability | `user-capabilities.ts`, appointment editor |
| `shoe` | Grants shoe work capability | `user-capabilities.ts`, appointment editor |

---

## 4. Architectural Requirements (Target State)

### 4.1 Source of Truth — Single Flag Registry

There MUST be a single, canonical source of truth for all access flags:

```
utils/auth/access-flags.ts   ← NEW — single registry
```

This file exports:
- `ACCESS_FLAGS` — a const object mapping flag names to metadata (label, description, category)
- `FeatureAccessFlag` — string literal union type of all valid feature flags
- `CapabilityFlag` — string literal union type of hybrid capability flags
- `AccessFlag` — union of both
- `isValidAccessFlag(flag: string): flag is AccessFlag` — type guard

The route config, permission functions, admin UI, and middleware MUST all reference this single registry. No hardcoded string literals for flag names outside this file.

### 4.2 Flag Naming Convention

All flags MUST follow `snake_case` and be semantically named:

- Feature access: `<feature>_access` or `<feature>_manage` — e.g., `inventory_manage`, `accounting_access`
- Hybrid capabilities: descriptive nouns — e.g., `artist`, `piercing`, `shoe` (existing convention, keep)

**Migration map for existing flags:**

| Current Flag | Proposed Flag | Rationale |
|-------------|---------------|-----------|
| `inventory` | `inventory_manage` | Explicit action |
| `accounting` | `accounting_access` | Explicit action |
| `payroll_manager` | `payroll_manage` | Consistent naming |
| `transactions` | `transactions_manage` | Explicit action |
| `appointments` | `appointments_manage` | Explicit action |
| `user_management` | `user_manage` | Concise |
| `services` | `services_manage` | Explicit action |
| `sales` | → merged with `transactions_manage` | Deduplicate |
| `metrics` | `metrics_view` | Separate from accounting |
| `view_logs` | `logs_view` | Concise |
| `time_clock_admin` | `time_clock_manage` | Consistent naming |
| `config` | `system_config` | Clear scope |
| `notify` | `notifications_send` | Explicit action |
| `accounts` | → merged with `user_manage` | Deduplicate |
| `view_appointments` | `appointments_view` | Separate from manage |

### 4.3 Defense-in-Depth Enforcement

Every access-controlled operation MUST be protected at ALL of these layers:

```
┌─────────────────────────────────────────────┐
│ LAYER 1: Middleware (Route Access)           │
│ → Checks user.accessFlags against route      │
│   config perms before page renders           │
├─────────────────────────────────────────────┤
│ LAYER 2: Page Guard (Server Component)       │
│ → Server-side permission check before        │
│   returning JSX (prevents SSR leak)          │
├─────────────────────────────────────────────┤
│ LAYER 3: Server Action (Business Logic)      │
│ → Permission check at the start of every     │
│   mutation/query action                      │
├─────────────────────────────────────────────┤
│ LAYER 4: Sidebar (UI Visibility)             │
│ → Cosmetic only — hides links but MUST NOT   │
│   be relied upon for security                │
└─────────────────────────────────────────────┘
```

**Non-negotiable rule:** Layers 1-3 must ALL pass for an operation to succeed. Layer 4 is UX only.

### 4.4 Middleware Implementation Requirements

The middleware MUST:
1. Extract the session via Better Auth `auth.api.getSession()`
2. Query `user.accessFlags` from the database (Drizzle)
3. Match the current path against `routeConfig`
4. If `matchingRoute.perms` is non-empty, verify the flag is in `user.accessFlags`
5. If check fails, redirect to `/unauthorized` (which MUST exist)
6. Admin role bypass: if `user.role === 'admin'`, skip flag check
7. Cache the user's flags in the session to avoid repeated DB queries

### 4.5 Server Action Guard Pattern

Every server action MUST follow this pattern:

```typescript
export async function someAction(payload: SomePayload): Promise<ActionResponse<Result>> {
    // ALWAYS first — authentication + authorization
    const auth = await authorizeAction(canManageSomeFeature)
    if (!auth.authorized) {
        return failure(auth.message || 'Unauthorized')
    }
    // ... business logic
}
```

The `authorizeAction` helper already exists in `permissions.ts` and handles both auth and permission checking. It should be the standard entry point for all guarded actions.

### 4.6 Admin UI Requirements

The user management page (`accounts/[id]`) MUST:
1. Show ALL feature access flags from the canonical registry (§4.1), grouped by category
2. Show ALL hybrid capability flags for admin-role users
3. Use the canonical flag names (not route-derived names)
4. Validate flags against the registry when saving
5. Only allow admins (role check) to modify flags
6. Log all flag changes to the audit log

### 4.7 Unauthorized Page

An `/unauthorized` page MUST exist at `app/unauthorized/page.tsx` with:
- Clear message: "You don't have permission to access this page"
- Link back to dashboard
- Option to request access (if messaging/notification system supports it)

---

## 5. Security Requirements

### 5.1 No Client-Side Only Guards

Access flags checked ONLY on the client (sidebar hiding, `AccessChecker` component, inline `access_flags.includes()`) are **not security boundaries**. Every guarded resource MUST have a server-side check.

### 5.2 Admin Role Hardening

The `admin` role is a universal bypass. The following operations MUST remain admin-only regardless of flags:
- Creating/deleting users
- Changing user roles
- Modifying access flags
- Accessing system logs
- Modifying system configuration
- Managing branches
- Viewing audit logs

### 5.3 Flag Validation on Write

When assigning flags (via admin UI or API), validate that every flag string exists in the canonical registry. Reject unknown flags. Never store arbitrary strings in `access_flags`.

### 5.4 No Flag Escalation

A user MUST NOT be able to:
- Modify their own access flags
- Modify another user's access flags unless they are admin
- Escalate their role via any action

### 5.5 Database Integrity

While RLS is disabled, the application layer MUST be the sole gatekeeper. Consider adding a CHECK constraint or trigger in the future once flag names stabilize via the canonical registry.

---

## 6. Implementation Boundaries

### 6.1 In Scope (This Spec)
- Canonical flag registry creation
- Flag name normalization and migration
- Middleware re-enablement
- Page guard addition to all unprotected pages
- Server action guard alignment (correct flags, consistent pattern)
- Admin UI flag list correction
- Unauthorized page creation

### 6.2 Out of Scope (Separate Specs)
- Database RLS implementation
- Role-based access control redesign (RBAC model)
- Audit logging overhaul
- Flag-based branch scoping (branch-level access control)
- Temporary/expiring access flags
- Access request workflow

### 6.3 Migration Strategy

Existing flag names stored in `user.access_flags` MUST be migrated to the new canonical names. This requires:
1. A migration script that maps old flag names → new flag names
2. A database migration to update all user rows
3. Backward compatibility: the new system must recognize old flag names during a transition period OR the migration must be atomic

---

## 7. Flag ↔ Feature Mapping (Post-Migration Target)

| Feature | Route | Required Flag | Permission Function |
|---------|-------|---------------|---------------------|
| Dashboard | `/` | _(none — all authenticated)_ | Auth only |
| Calendar | `/calendar` | _(none — all authenticated)_ | Auth only |
| Appointments (view) | `/appointments` | `appointments_view` | `canViewAppointments` |
| Appointments (manage) | `/appointments` | `appointments_manage` | `canManageAppointments` |
| Inventory | `/inventory` | `inventory_manage` | `canManageInventory` |
| Accounting | `/accounting` | `accounting_access` | `canAccessAccounting` |
| Metrics | `/metrics` | `metrics_view` | `canViewMetrics` |
| Payroll (manage) | `/payroll` | `payroll_manage` | `canManagePayroll` |
| My Payroll | `/my-payroll` | _(none — all staff)_ | `canViewOwnPayroll` |
| Transactions | `/transactions` | `transactions_manage` | `canAccessTransactions` |
| Sales | `/sales` | `transactions_manage` | `canAccessTransactions` |
| Services | _(TBD)_ | `services_manage` | `canManageServices` |
| Staff Management | `/accounts` | `user_manage` | `canManageUsers` |
| System Config | `/config` | `system_config` | Admin-only |
| Notifications | `/notify` | `notifications_send` | `canSendNotifications` |
| Branches | `/admin/branches` | _(admin-only)_ | `canManageBranches` |
| Time Clock Admin | `/admin/time-clock` | `time_clock_manage` | `canManageTimeClock` |
| System Logs | `/admin/logs` | `logs_view` | `canAccessLogs` |
| Time Clock (own) | `/my-time-clock` | _(none — all staff)_ | Auth only |
| Profile | `/profile` | _(none — all authenticated)_ | Auth only |

---

## 8. Acceptance Criteria

1. **Middleware enforces flag checks** — navigating to a flagged route without the flag redirects to `/unauthorized`
2. **Every guarded server action** uses `authorizeAction()` with the correct permission check
3. **Every guarded page** has a server-side permission check before rendering
4. **Admin can assign all valid flags** from the user edit UI
5. **Flag names are consistent** between route config, permission functions, admin UI, and actual DB values
6. **`/unauthorized` page exists** and is reachable
7. **No async permission functions called without `await`**
8. **Sidebar correctly hides/shows routes** based on user flags (UX layer only)
9. **Admin role bypass works correctly** at all layers
10. **No dead code** — all defined permission functions are actually used

---

## Appendix A: Flag Migration Map

```typescript
const FLAG_MIGRATION_MAP: Record<string, string> = {
    // Old → New
    'inventory': 'inventory_manage',
    'accounting': 'accounting_access',
    'payroll_manager': 'payroll_manage',
    'transactions': 'transactions_manage',
    'appointments': 'appointments_manage',
    'user_management': 'user_manage',
    'services': 'services_manage',
    'sales': 'transactions_manage',       // merged
    'metrics': 'metrics_view',
    'view_logs': 'logs_view',
    'time_clock_admin': 'time_clock_manage',
    'config': 'system_config',
    'notify': 'notifications_send',
    'accounts': 'user_manage',            // merged
    'view_appointments': 'appointments_view',
    // Capability flags — unchanged
    'artist': 'artist',
    'piercing': 'piercing',
    'shoe': 'shoe',
}
```

## Appendix B: Files Requiring Changes

| File | Change Type | Priority |
|------|-------------|----------|
| `middleware.ts` | Uncomment + implement flag check | P0 |
| `utils/auth/permissions.ts` | Add missing functions, fix flag names | P0 |
| `utils/auth/access-flags.ts` | **NEW** — canonical flag registry | P0 |
| `server/actions/payroll.ts` | Replace `isAdmin` with `canManagePayroll` | P0 |
| `server/actions/transactions.ts` | Replace `canAccessAccounting` with `canAccessTransactions` | P0 |
| `server/actions/time-clock.ts` | Use `hasTimeClockAccess` function | P0 |
| `server/actions/sales.ts` | Add permission check | P0 |
| `app/sales/page.tsx` | Add `await` to `canAccessTransactions` call | P0 |
| `app/unauthorized/page.tsx` | **NEW** — unauthorized page | P0 |
| `app/inventory/page.tsx` | Add page guard | P1 |
| `app/metrics/page.tsx` | Add page guard | P1 |
| `app/config/page.tsx` | Add page guard | P1 |
| `app/accounts/page.tsx` | Add page guard | P1 |
| `app/appointments/page.tsx` | Add page guard | P1 |
| `app/payroll/page.tsx` | Add page guard | P1 |
| `app/my-payroll/page.tsx` | Add page guard | P1 |
| `app/accounting/page.tsx` | Add page guard | P1 |
| `utils/routes-config.ts` | Update `perms` to use canonical flag names | P1 |
| `app/accounts/[id]/page.tsx` | Fix available flags list, use canonical registry | P1 |
| `components/sidebar.tsx` | Verify flag-based filtering works with new names | P2 |
| `components/accessChecker.tsx` | Consider expanding usage or deprecating | P2 |
| Database migration script | Migrate old flag names → new names | P1 |
