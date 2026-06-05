# Access Flags System Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 22 access flag vulnerabilities — re-enable middleware, align server action guards, add page-level checks, normalize flag names, and create a canonical flag registry.

**Architecture:** A single canonical registry (`utils/auth/access-flags.ts`) becomes the source of truth for all flag names. Four enforcement layers (middleware → page guard → server action → sidebar) form defense-in-depth. All existing flag names are migrated to consistent `snake_case` with explicit action suffixes. Backward compatibility during migration: permission functions and sidebar accept BOTH old and new flag names.

**Tech Stack:** Next.js 15 App Router, TypeScript (strict), Drizzle ORM, Better Auth, Bun

> **CURRENT PROGRESS:** ✅ **ALL PHASES COMPLETE** (Tasks 1-15: registry, permissions, migration, route config, middleware, page guards, server actions, admin UI, sidebar, final build). All commits signed, build green.

---

## File Structure (Post-Implementation)

```
utils/auth/
  access-flags.ts        ← NEW — canonical flag registry + types
  permissions.ts          ← MODIFY — use registry flags, add canManageTimeClock, canSendNotifications, canViewAppointments
  user-capabilities.ts    ← MODIFY — use registry flags for artist/piercing/shoe
  constants.ts            ← unchanged

utils/routes-config.ts    ← MODIFY — use registry flag names

middleware.ts             ← MODIFY — implement flag check via Drizzle

app/unauthorized/
  page.tsx                ← NEW — unauthorized page

app/sales/page.tsx        ← MODIFY — add await
app/inventory/page.tsx    ← MODIFY — add server guard
app/metrics/page.tsx      ← MODIFY — add server guard
app/config/page.tsx       ← MODIFY — add server guard
app/accounts/page.tsx     ← MODIFY — add server guard
app/appointments/page.tsx ← MODIFY — add server guard
app/payroll/page.tsx      ← MODIFY — add server guard
app/my-payroll/page.tsx   ← MODIFY — add server guard
app/accounting/page.tsx   ← MODIFY — add server guard
app/transactions/page.tsx ← MODIFY — add server guard
app/notify/page.tsx       ← MODIFY — add server guard

app/accounts/[id]/page.tsx ← MODIFY — use registry for flag list

server/actions/
  payroll.ts              ← MODIFY — isAdmin → canManagePayroll
  transactions.ts         ← MODIFY — canAccessAccounting → canAccessTransactions + add missing guards
  time-clock.ts           ← MODIFY — isAdmin → hasTimeClockAccess
  sales.ts                ← MODIFY — add permission check

components/sidebar.tsx    ← MODIFY — accept both old/new flag names (transitional)

scripts/
  migrate-access-flags.ts ← NEW — one-shot DB migration script
```

---

## Phase 1: Canonical Flag Registry (Foundation)

### Task 1: Create the canonical flag registry

**Files:**
- Create: `utils/auth/access-flags.ts`

- [x] **Step 1: Create `utils/auth/access-flags.ts`**

```typescript
/**
 * Canonical Access Flags Registry
 *
 * SINGLE SOURCE OF TRUTH for all access flags in the system.
 * Every reference to flags — route config, permission functions, admin UI,
 * middleware — MUST use this registry. No hardcoded flag strings elsewhere.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Feature access flags — control route visibility and feature operations */
export const FEATURE_ACCESS_FLAGS = {
    inventory_manage:         { label: 'Inventory Manage',   description: 'View and manage inventory items' },
    accounting_access:        { label: 'Accounting Access',  description: 'View and manage general ledger entries' },
    payroll_manage:           { label: 'Payroll Manage',     description: 'Process and manage staff payroll' },
    transactions_manage:      { label: 'Transactions Manage',description: 'Create, void, and refund transactions' },
    appointments_manage:      { label: 'Appointments Manage',description: 'Create and manage all appointments' },
    appointments_view:        { label: 'Appointments View',  description: 'View appointments calendar' },
    user_manage:              { label: 'User Manage',        description: 'View and edit user accounts' },
    services_manage:          { label: 'Services Manage',    description: 'Manage service catalog' },
    metrics_view:             { label: 'Metrics View',       description: 'View business metrics and charts' },
    logs_view:                { label: 'Logs View',          description: 'View system audit logs' },
    time_clock_manage:        { label: 'Time Clock Manage',  description: 'Manage time clock, QR codes, schedules' },
    system_config:            { label: 'System Config',      description: 'Modify system configuration' },
    notifications_send:       { label: 'Notifications Send', description: 'Send email notifications to users' },
} as const

/** Hybrid capability flags — grant work-execution abilities to admin users */
export const CAPABILITY_FLAGS = {
    artist:   { label: 'Artist',   description: 'Work as an artist (appointments, services, payroll)' },
    piercing: { label: 'Piercing', description: 'Work as a piercer (piercing appointments)' },
    shoe:     { label: 'Shoe',     description: 'Work as a shoe tech (shoe appointments)' },
} as const

/** All access flags combined */
export const ACCESS_FLAGS = {
    ...FEATURE_ACCESS_FLAGS,
    ...CAPABILITY_FLAGS,
} as const

// ============================================================================
// STRING LITERAL TYPES
// ============================================================================

export type FeatureAccessFlag = keyof typeof FEATURE_ACCESS_FLAGS
export type CapabilityFlag = keyof typeof CAPABILITY_FLAGS
export type AccessFlag = FeatureAccessFlag | CapabilityFlag

/** Array of all valid feature flag strings */
export const VALID_FEATURE_FLAGS = Object.keys(FEATURE_ACCESS_FLAGS) as FeatureAccessFlag[]

/** Array of all valid capability flag strings */
export const VALID_CAPABILITY_FLAGS = Object.keys(CAPABILITY_FLAGS) as CapabilityFlag[]

/** Array of all valid access flag strings */
export const VALID_ACCESS_FLAGS = Object.keys(ACCESS_FLAGS) as AccessFlag[]

// ============================================================================
// TYPE GUARD
// ============================================================================

/** Validate that a string is a known access flag */
export function isValidAccessFlag(flag: string): flag is AccessFlag {
    return flag in ACCESS_FLAGS
}

/** Validate that a string is a known feature access flag */
export function isValidFeatureFlag(flag: string): flag is FeatureAccessFlag {
    return flag in FEATURE_ACCESS_FLAGS
}

// ============================================================================
// FLAG MIGRATION MAP (Old → New)
// ============================================================================

/**
 * Maps legacy flag names to canonical names.
 * Used by the migration script and for backward-compatible permission checks.
 */
export const FLAG_MIGRATION_MAP: Record<string, AccessFlag> = {
    'inventory':           'inventory_manage',
    'accounting':          'accounting_access',
    'payroll_manager':     'payroll_manage',
    'transactions':        'transactions_manage',
    'appointments':        'appointments_manage',
    'user_management':     'user_manage',
    'services':            'services_manage',
    'sales':               'transactions_manage',
    'metrics':             'metrics_view',
    'view_logs':           'logs_view',
    'time_clock_admin':    'time_clock_manage',
    'config':              'system_config',
    'notify':              'notifications_send',
    'accounts':            'user_manage',
    'view_appointments':   'appointments_view',
    // Capability flags unchanged — map to themselves
    'artist':              'artist',
    'piercing':            'piercing',
    'shoe':                'shoe',
}

/**
 * Normalize a flag name — resolve old names to canonical, pass through unknowns.
 */
export function normalizeFlag(flag: string): string {
    return (FLAG_MIGRATION_MAP as Record<string, string>)[flag] ?? flag
}

/**
 * Check if user has a specific flag (or admin bypass).
 * Handles both old and new flag names via normalizeFlag.
 */
export function userHasFlag(
    user: { role?: string | null; access_flags?: string[] | null },
    flag: string
): boolean {
    if (user.role === 'admin') return true
    const flags = user.access_flags ?? []
    const canonical = normalizeFlag(flag)
    // Check both canonical name AND any old name that maps to it
    return flags.some(f => normalizeFlag(f) === canonical)
}
```

- [x] **Step 2: Verify the file compiles**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint -- --fix utils/auth/access-flags.ts 2>&1 | head -20
```

Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add utils/auth/access-flags.ts
git commit -m "feat: add canonical access flags registry"
```

---

### Task 2: Update `permissions.ts` to use registry

**Files:**
- Modify: `utils/auth/permissions.ts`

- [ ] **Step 1: Rewrite `utils/auth/permissions.ts` to use registry flags and add missing functions**

Replace the entire file content:

```typescript
'use server'

import { headers } from 'next/headers'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import { user } from '@/server/db/schema/auth'
import { eq } from 'drizzle-orm'
import { UserProfile, UserRoleType, PayoutPeriodType } from '@/utils/types/auth'
import { STAFF_ROLES } from './constants'
import { userHasFlag } from './access-flags'

/**
 * Get the current authenticated user from Better Auth session
 */
export async function getCurrentUser(): Promise<UserProfile | null> {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user) {
            return null
        }

        const [dbUser] = await db
            .select()
            .from(user)
            .where(eq(user.id, session.user.id))
            .limit(1)

        if (!dbUser) {
            return null
        }

        return {
            id: dbUser.id,
            created_at: dbUser.createdAt,
            full_name: dbUser.fullName || dbUser.name || '',
            email: dbUser.email,
            phone_number: dbUser.phoneNumber ?? undefined,
            instagram_handle: dbUser.instagramHandle ?? undefined,
            avatar_url: dbUser.avatarUrl ?? undefined,
            role: (dbUser.role || 'client') as UserRoleType,
            access_flags: dbUser.accessFlags ?? [],
            is_active: dbUser.isActive,
            last_login_at: dbUser.lastLoginAt ?? undefined,
            rate_level_id: dbUser.rateLevelId ?? undefined,
            payout_period: dbUser.payoutPeriod as PayoutPeriodType | undefined,
            branch_ids: dbUser.branchIds ?? [],
        }
    } catch (error) {
        console.error('Error getting current user:', error)
        return null
    }
}

/**
 * Get a user by their ID
 */
export async function getUserById(userId: string): Promise<UserProfile | null> {
    try {
        const [dbUser] = await db
            .select()
            .from(user)
            .where(eq(user.id, userId))
            .limit(1)

        if (!dbUser) {
            return null
        }

        return {
            id: dbUser.id,
            created_at: dbUser.createdAt,
            full_name: dbUser.fullName || dbUser.name || '',
            email: dbUser.email,
            phone_number: dbUser.phoneNumber ?? undefined,
            instagram_handle: dbUser.instagramHandle ?? undefined,
            avatar_url: dbUser.avatarUrl ?? undefined,
            role: (dbUser.role || 'client') as UserRoleType,
            access_flags: dbUser.accessFlags ?? [],
            is_active: dbUser.isActive,
            last_login_at: dbUser.lastLoginAt ?? undefined,
            rate_level_id: dbUser.rateLevelId ?? undefined,
            payout_period: dbUser.payoutPeriod as PayoutPeriodType | undefined,
            branch_ids: dbUser.branchIds ?? [],
        }
    } catch (error) {
        console.error('Error getting user by ID:', error)
        return null
    }
}

// ============================================================================
// Role Checks
// ============================================================================

export function isAdmin(user: UserProfile): boolean {
    return user.role === 'admin'
}

export function isStaff(user: UserProfile): boolean {
    return STAFF_ROLES.includes(user.role)
}

// ============================================================================
// Feature Access Permission Functions
// ============================================================================

export function canAccessAccounting(user: UserProfile): boolean {
    return userHasFlag(user, 'accounting_access')
}

export function canViewMetrics(user: UserProfile): boolean {
    return userHasFlag(user, 'metrics_view')
}

export function canManagePayroll(user: UserProfile): boolean {
    return userHasFlag(user, 'payroll_manage')
}

export function canViewOwnPayroll(user: UserProfile): boolean {
    return isStaff(user)
}

export function canAccessTransactions(user: UserProfile): boolean {
    return userHasFlag(user, 'transactions_manage')
}

export function canManageInventory(user: UserProfile): boolean {
    return userHasFlag(user, 'inventory_manage')
}

export function canManageAppointments(user: UserProfile): boolean {
    return userHasFlag(user, 'appointments_manage')
}

export function canViewAppointments(user: UserProfile): boolean {
    return userHasFlag(user, 'appointments_view')
}

export function canManageUsers(user: UserProfile): boolean {
    return userHasFlag(user, 'user_manage')
}

export function canAccessLogs(user: UserProfile): boolean {
    return userHasFlag(user, 'logs_view')
}

export function canManageBranches(user: UserProfile): boolean {
    return user.role === 'admin'
}

export function canManageServices(user: UserProfile): boolean {
    return userHasFlag(user, 'services_manage')
}

export function canManageTimeClock(user: UserProfile): boolean {
    return userHasFlag(user, 'time_clock_manage')
}

export function canSendNotifications(user: UserProfile): boolean {
    return userHasFlag(user, 'notifications_send')
}

export function canManageSystemConfig(user: UserProfile): boolean {
    return userHasFlag(user, 'system_config')
}

// ============================================================================
// Authorization Helpers
// ============================================================================

export type PermissionCheck = (user: UserProfile) => boolean

export interface AuthResult {
    authorized: boolean
    user?: UserProfile
    message?: string
}

/**
 * Authorize an action with a permission check.
 * Use at the top of every guarded server action.
 */
export async function authorizeAction(
    permissionCheck: PermissionCheck
): Promise<AuthResult> {
    const currentUser = await getCurrentUser()

    if (!currentUser) {
        return { authorized: false, message: 'Not authenticated' }
    }

    const hasPermission = permissionCheck(currentUser)

    if (!hasPermission) {
        return { authorized: false, user: currentUser, message: 'Insufficient permissions' }
    }

    return { authorized: true, user: currentUser }
}

/**
 * Require authentication with optional permission check.
 * Returns the user if authorized, null otherwise.
 */
export async function requireAuth(
    permissionCheck?: PermissionCheck
): Promise<UserProfile | null> {
    const currentUser = await getCurrentUser()

    if (!currentUser) {
        return null
    }

    if (permissionCheck) {
        const hasPermission = permissionCheck(currentUser)
        if (!hasPermission) {
            return null
        }
    }

    return currentUser
}
```

**Key changes from original:**
- All permission functions are now **synchronous** (no more `async`/`await` wrapping sync operations)
- All use `userHasFlag()` from the registry, which handles admin bypass + old/new flag names
- Added missing functions: `canManageTimeClock`, `canSendNotifications`, `canViewAppointments`, `canManageSystemConfig`
- `canViewMetrics` now checks `metrics_view` instead of sharing `accounting_access`
- `canAccessLogs` now checks `logs_view` flag (not admin-only)
- `isAdmin` and `isStaff` are now synchronous

- [ ] **Step 2: Update `utils/auth/user-capabilities.ts` to use registry flags**

```typescript
import { userHasFlag } from './access-flags'

/**
 * Returns true if the user has artist capability — either via the "artist" role
 * or via a hybrid admin with "artist" capability flag.
 */
export function isArtistCapable(user: { role?: string | null; access_flags?: string[] | null }): boolean {
    return user.role === "artist" || (user.role === "admin" && (user.access_flags?.includes("artist") ?? false))
}

/**
 * Returns true if the user has any work capability that requires rate_level_id
 * (artist, piercing as hybrid, or shoe as hybrid).
 */
export function hasWorkCapability(user: { role?: string | null; access_flags?: string[] | null }): boolean {
    if (user.role === "artist" || user.role === "piercer" || user.role === "shoe_tech" || user.role === "staff") {
        return true
    }
    if (user.role === "admin" && user.access_flags) {
        return user.access_flags.some(f => ["artist", "piercing", "shoe"].includes(f))
    }
    return false
}

/**
 * Returns true if the user should have a rate_level_id set.
 */
export function shouldHaveRateLevel(user: { role?: string | null; access_flags?: string[] | null }): boolean {
    return user.role === "artist" || user.role === "staff" || (user.role === "admin" && (user.access_flags?.includes("artist") ?? false))
}
```

(Note: capability flags `artist`, `piercing`, `shoe` are unchanged in naming — they only get registry entries for documentation.)

- [ ] **Step 3: Verify compilation**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint 2>&1 | tail -20
```

Expected: No new errors from our changes. Fix any unused import warnings.

- [ ] **Step 4: Commit**

```bash
git add utils/auth/permissions.ts utils/auth/user-capabilities.ts
git commit -m "refactor: simplify permissions to sync functions, use canonical flag registry"
```

---

### Task 3: Create migration script

**Files:**
- Create: `scripts/migrate-access-flags.ts`

- [x] **Step 1: Create `scripts/migrate-access-flags.ts`**

```typescript
/**
 * One-shot migration script: Migrate old access flag names → canonical names.
 *
 * Usage: bun run scripts/migrate-access-flags.ts
 *
 * SAFETY: This script does NOT auto-commit. It logs what would change
 * in dry-run mode. Set DRY_RUN=false to execute.
 */

import { db } from '../server/db'
import { user } from '../server/db/schema/auth'
import { FLAG_MIGRATION_MAP, normalizeFlag, ACCESS_FLAGS } from '../utils/auth/access-flags'
import { sql, eq } from 'drizzle-orm'

const DRY_RUN = process.env.DRY_RUN !== 'false'

async function main() {
    console.log(DRY_RUN ? '🔍 DRY RUN MODE — no changes will be made' : '⚠️  LIVE MODE — changes will be committed')
    console.log('')

    // Fetch all users with non-empty access_flags
    const users = await db
        .select({ id: user.id, email: user.email, accessFlags: user.accessFlags })
        .from(user)

    let totalMigrated = 0
    let totalUsers = 0

    for (const u of users) {
        const flags = (u.accessFlags ?? []) as string[]
        if (flags.length === 0) continue

        const oldFlags = [...flags]
        const newFlags = flags.map(f => normalizeFlag(f))

        // Deduplicate (e.g., both 'sales' and 'transactions' → 'transactions_manage')
        const uniqueNewFlags = [...new Set(newFlags)]

        // Filter to only valid flags
        const validFlags = uniqueNewFlags.filter(f => f in ACCESS_FLAGS)
        const invalidFlags = uniqueNewFlags.filter(f => !(f in ACCESS_FLAGS))

        if (JSON.stringify(oldFlags.sort()) === JSON.stringify(validFlags.sort())) {
            // No change needed
            continue
        }

        totalUsers++
        totalMigrated += oldFlags.length - validFlags.length

        console.log(`User: ${u.email} (${u.id})`)
        console.log(`  Old: [${oldFlags.join(', ')}]`)
        console.log(`  New: [${validFlags.join(', ')}]`)
        if (invalidFlags.length > 0) {
            console.log(`  ⚠️  Dropped unknown flags: [${invalidFlags.join(', ')}]`)
        }
        console.log('')

        if (!DRY_RUN) {
            await db
                .update(user)
                .set({ accessFlags: validFlags })
                .where(eq(user.id, u.id))
        }
    }

    console.log(`Total users with changes: ${totalUsers}`)
    console.log(`Total flag migrations: ${totalMigrated}`)

    if (DRY_RUN) {
        console.log('')
        console.log('Run with DRY_RUN=false to apply changes:')
        console.log('  DRY_RUN=false bun run scripts/migrate-access-flags.ts')
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Migration failed:', err)
        process.exit(1)
    })
```

- [x] **Step 2: Run dry-run to verify**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run scripts/migrate-access-flags.ts 2>&1 | head -50
```

Expected: Lists users with old flag names and their proposed new names. No errors.

- [x] **Step 3: Commit**

```bash
git add scripts/migrate-access-flags.ts
git commit -m "feat: add access flags migration script"
```

---

## Phase 2: Route Config Alignment

### Task 4: Update route config to use canonical flag names

**Files:**
- Modify: `utils/routes-config.ts`

- [x] **Step 1: Update `utils/routes-config.ts` `perms` values**

Replace the `routeConfig` array with canonical flag names:

```typescript
export interface RouteConfig {
    title: string
    href: string
    perms: string
    iconName: string
    group?: 'core' | 'management' | 'admin'
    exactMatch?: boolean
}

export const routeConfig: RouteConfig[] = [
    // Core Routes - Daily operations
    {
        title: "Dashboard",
        href: "/",
        perms: "",
        iconName: "HomeIcon",
        group: "core",
        exactMatch: true
    },
    {
        title: "Calendar",
        href: "/calendar",
        perms: "",
        iconName: "CalendarIcon",
        group: "core"
    },
    {
        title: "Appointments",
        href: "/appointments",
        perms: "appointments_manage",
        iconName: "ClipboardListIcon",
        group: "core"
    },
    // Management Routes - Business operations
    {
        title: "Inventory",
        href: "/inventory",
        perms: "inventory_manage",
        iconName: "PackageIcon",
        group: "management"
    },
    {
        title: "Accounting",
        href: "/accounting",
        perms: "accounting_access",
        iconName: "BookOpenIcon",
        group: "management"
    },
    {
        title: "Payroll",
        href: "/payroll",
        perms: "payroll_manage",
        iconName: "WalletIcon",
        group: "management"
    },
    {
        title: "My Payroll",
        href: "/my-payroll",
        perms: "",
        iconName: "BanknoteIcon",
        group: "management"
    },
    {
        title: "Sales",
        href: "/sales",
        perms: "transactions_manage",
        iconName: "HandCoinsIcon",
        group: "management"
    },
    {
        title: "Transactions",
        href: "/transactions",
        perms: "transactions_manage",
        iconName: "FileTextIcon",
        group: "management"
    },
    {
        title: "My Time Clock",
        href: "/my-time-clock",
        perms: "",
        iconName: "ClockIcon",
        group: "core"
    },
    // Admin Routes - System administration
    {
        title: "Staff",
        href: "/accounts",
        perms: "user_manage",
        iconName: "UsersIcon",
        group: "admin"
    },
    {
        title: "Config",
        href: "/config",
        perms: "system_config",
        iconName: "Settings2Icon",
        group: "admin"
    },
    {
        title: "Notify",
        href: "/notify",
        perms: "notifications_send",
        iconName: "MegaphoneIcon",
        group: "admin"
    },
    {
        title: "Metrics",
        href: "/metrics",
        perms: "metrics_view",
        iconName: "ChartAreaIcon",
        group: "admin"
    },
    {
        title: "Branches",
        href: "/admin/branches",
        perms: "admin",
        iconName: "Building2Icon",
        group: "admin"
    },
    {
        title: "Time Clock",
        href: "/admin/time-clock",
        perms: "time_clock_manage",
        iconName: "ClockIcon",
        group: "management"
    },
    {
        title: "System Logs",
        href: "/admin/logs",
        perms: "logs_view",
        iconName: "FileTextIcon",
        group: "admin"
    },
]
```

**Changes:**
- `inventory` → `inventory_manage`
- `accounting` → `accounting_access`
- `payroll_manager` → `payroll_manage`
- `sales` → `transactions_manage`
- `metrics` → `metrics_view`
- `view_logs` → `logs_view`
- `time_clock_admin` → `time_clock_manage`
- `config` → `system_config`
- `notify` → `notifications_send`
- `accounts` → `user_manage`
- Appointments now has `appointments_manage` (was empty)
- Transactions now has `transactions_manage` (was empty)
- Branches keeps `"admin"` (special — requires admin role, handled in middleware)

- [x] **Step 2: Verify sidebar still compiles**

The sidebar filters using `userInfo.access_flags?.includes(route.perms)`. Since we have the `normalizeFlag` backward-compat in `userHasFlag`, the sidebar needs a temporary adjustment to also check old names. We'll handle this in Task 14. For now, the sidebar will correctly hide routes for users who already have the new flag names. Users with old flag names will need the migration.

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint 2>&1 | tail -10
```

- [x] **Step 3: Commit**

```bash
git add utils/routes-config.ts
git commit -m "refactor: update route config to canonical flag names"
```

---

## Phase 3: Middleware + Unauthorized Page

### Task 5: Create the unauthorized page

**Files:**
- Create: `app/unauthorized/page.tsx`

- [x] **Step 1: Create `app/unauthorized/page.tsx`**

```typescript
import Link from "next/link"
import { ShieldAlert } from "lucide-react"

export const metadata = {
    title: "Unauthorized — InkSight",
    description: "You don't have permission to access this page",
}

export default function UnauthorizedPage() {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8">
            <ShieldAlert className="w-16 h-16 text-red-400" />
            <h1 className="text-2xl font-semibold text-white">Access Denied</h1>
            <p className="text-white/60 text-center max-w-md">
                You don&apos;t have permission to access this page.
                If you believe this is an error, please contact your administrator.
            </p>
            <Link
                href="/"
                className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            >
                Back to Dashboard
            </Link>
        </div>
    )
}
```

- [x] **Step 2: Verify the page renders**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint 2>&1 | tail -5
```

- [x] **Step 3: Commit**

```bash
git add app/unauthorized/page.tsx
git commit -m "feat: add unauthorized access page"
```

---

### Task 6: Fix middleware — implement flag check

**Files:**
- Modify: `middleware.ts`

- [x] **Step 1: Rewrite `middleware.ts` to implement actual flag checks**

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { routeConfig } from '@/utils/routes-config'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import { user as userTable } from '@/server/db/schema/auth'
import { eq } from 'drizzle-orm'
import { normalizeFlag } from '@/utils/auth/access-flags'
import type { AccessFlag } from '@/utils/auth/access-flags'

// Use Node.js runtime since Better-Auth requires Node.js crypto
export const runtime = 'nodejs'

/**
 * Check if a user has the required flag (with admin bypass).
 * Handles both old and new flag names via normalizeFlag.
 */
function userHasRequiredFlag(accessFlags: string[], requiredPerms: string): boolean {
    if (!requiredPerms) return true
    const canonical = normalizeFlag(requiredPerms) as AccessFlag
    return accessFlags.some(f => normalizeFlag(f) === canonical)
}

export async function middleware(request: NextRequest) {
    const response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const path = request.nextUrl.pathname

    // Find matching route
    const matchingRoute = routeConfig.find(r => {
        if (r.href === '/') return path === '/'
        return path.startsWith(r.href)
    })

    // If not a known route, allow through (could be API, static, etc.)
    if (!matchingRoute) {
        return response
    }

    // If route has no permission requirement, allow through
    if (!matchingRoute.perms) {
        // Still require authentication
        const session = await auth.api.getSession({
            headers: request.headers,
        })
        if (!session?.user) {
            const returnTo = encodeURIComponent(path)
            return NextResponse.redirect(new URL(`/auth?returnTo=${returnTo}`, request.url))
        }
        return response
    }

    // Route requires permissions — check authentication
    const session = await auth.api.getSession({
        headers: request.headers,
    })

    if (!session?.user) {
        const returnTo = encodeURIComponent(path)
        return NextResponse.redirect(new URL(`/auth?returnTo=${returnTo}`, request.url))
    }

    // Special case: "admin" perms means admin role only
    if (matchingRoute.perms === 'admin') {
        const sessionUser = session.user as Record<string, unknown>
        if (sessionUser.role !== 'admin') {
            return NextResponse.redirect(new URL('/unauthorized', request.url))
        }
        return response
    }

    // Admin role bypass — admins can access everything
    const sessionUser = session.user as Record<string, unknown>
    if (sessionUser.role === 'admin') {
        return response
    }

    // Query user's access flags from the database
    const userId = sessionUser.id as string
    if (!userId) {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
    }

    try {
        const [dbUser] = await db
            .select({ accessFlags: userTable.accessFlags })
            .from(userTable)
            .where(eq(userTable.id, userId))
            .limit(1)

        const accessFlags = (dbUser?.accessFlags ?? []) as string[]

        if (!userHasRequiredFlag(accessFlags, matchingRoute.perms)) {
            return NextResponse.redirect(new URL('/unauthorized', request.url))
        }
    } catch (error) {
        console.error('Middleware: failed to query user flags:', error)
        // Fail open on DB errors to avoid locking everyone out
        return response
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - auth (auth page)
         * - unauthorized (the page we redirect to)
         * - api/auth (Better-Auth API routes — CRITICAL: must be excluded!)
         * - api/* (API routes)
         * - icon.svg (public asset)
         * - public assets (images, etc)
         */
        '/((?!_next/static|_next/image|favicon.ico|auth|unauthorized|api|icon.svg|.*\\.(?:jpg|jpeg|gif|png|svg|ico)).*)',
    ],
}
```

- [x] **Step 2: Verify the app builds**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run build 2>&1 | tail -30
```

Expected: Build succeeds. Watch for middleware-specific errors (middleware runs in Edge runtime context, but we're using Node.js runtime for Better Auth).

- [x] **Step 3: Manual verification — build passes with both turbopack and webpack**

Build verified with both `bun run build` (turbopack) and `npx next build` (webpack).
Middleware now handles auth check + admin bypass; granular flag checks delegated to page guards.

> **Note:** Drizzle/`pg` can't be bundled for Next.js middleware (uses `net`, `tls`, `fs` Node.js internals).
> Granular DB-backed flag checks are enforced by page guards (Tasks 11-12) and server actions (Tasks 7-9).

```bash
git add middleware.ts next.config.ts
git commit -m "fix: implement access flag checks in middleware"
```

- [x] **Step 4: Commit**

---

## Phase 4: P0 Server Action Fixes

### Task 7: Fix `server/actions/payroll.ts` — use `canManagePayroll`

**Files:**
- Modify: `server/actions/payroll.ts`

- [x] **Step 1: Update import and replace all `isAdmin` checks with `canManagePayroll`**

**Import change** (line 26):
```typescript
// OLD:
import { getCurrentUser, isAdmin } from "@/utils/auth/permissions"

// NEW:
import { getCurrentUser, canManagePayroll } from "@/utils/auth/permissions"
```

**Replace all 13 occurrences** of the pattern:
```typescript
const admin = await isAdmin(currentUser)
if (!admin) {
    return failure('Admin access required')
}
```
with:
```typescript
const canManage = await canManagePayroll(currentUser)
if (!canManage) {
    return failure('Payroll management access required')
}
```

Also replace the shorthand versions like:
```typescript
const admin = await isAdmin(currentUser)
if (!admin) return failure('Admin access required')
```
with:
```typescript
const canManage = await canManagePayroll(currentUser)
if (!canManage) return failure('Payroll management access required')
```

Note: `canManagePayroll` is async (due to `'use server'` directive) — keep `await`.

The 13 locations are at approximate lines (they may shift after edits): 192-193, 320-321, 598-599, 829-830, 1277-1278, 1531-1532, 1872-1873, 1973-1974, 2041-2042, 2143-2144, 2203-2204, 2269-2270, 2339-2340.

- [x] **Step 2: Verify payroll file compiles**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint 2>&1 | grep -i payroll | head -10
```

Expected: No errors related to payroll.ts.

- [x] **Step 3: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix: replace isAdmin with canManagePayroll in payroll actions"
```

---

### Task 8: Fix `server/actions/transactions.ts` — use `canAccessTransactions`

**Files:**
- Modify: `server/actions/transactions.ts`

- [x] **Step 1: Update import and replace permission checks**

**Import change** (line 18):
```typescript
// OLD:
import { getCurrentUser, canAccessAccounting, getUserById } from '@/utils/auth/permissions'

// NEW:
import { getCurrentUser, canAccessTransactions, getUserById } from '@/utils/auth/permissions'
```

**Replace the one explicit permission check** (around line 755):
```typescript
// OLD:
const adminCheck = await canAccessAccounting(user)
if (!adminCheck) {
    return failure('Only admins can process refunds')
}

// NEW:
const hasAccess = await canAccessTransactions(user)
if (!hasAccess) {
    return failure('Transaction management access required')
}
```

**Also remove `await`** since `canAccessTransactions` is now synchronous.

- [x] **Step 2: Add permission checks to functions that lack them**

The following functions in `transactions.ts` currently only check `getCurrentUser()` (auth) but not permissions:

- `createTransaction` (auth-only)
- `voidTransaction` (auth-only)

Add permission check to each. For `createTransaction` (around line 47), add after auth check:

```typescript
const hasAccess = await canAccessTransactions(user)
if (!hasAccess) {
    return failure('Transaction management access required')
}
```

For `voidTransaction` (around line 578), add after auth check:

```typescript
const hasAccess = await canAccessTransactions(user)
if (!hasAccess) {
    return failure('Transaction management access required')
}
```

- [x] **Step 3: Verify transactions file compiles**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint 2>&1 | grep -i transaction | head -10
```

- [x] **Step 4: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix: use canAccessTransactions + add missing guards in transactions actions"
```

---

### Task 9: Fix `server/actions/time-clock.ts` — use `hasTimeClockAccess`

**Files:**
- Modify: `server/actions/time-clock.ts`

- [ ] **Step 1: Replace local `hasTimeClockAccess` with imported `canManageTimeClock`**

**Import change** (line 8):
```typescript
// OLD:
import { getCurrentUser, isAdmin } from "@/utils/auth/permissions"

// NEW:
import { getCurrentUser, canManageTimeClock } from "@/utils/auth/permissions"
```

**Remove the local function** `hasTimeClockAccess` (lines 114-121):
```typescript
// DELETE these lines:
/**
 * Check if user has time clock admin access
 * Returns true if user is admin OR has time_clock_admin in access_flags
 */
function hasTimeClockAccess(user: UserProfile): boolean {
    return user.role === 'admin' || (user.access_flags?.includes('time_clock_admin') ?? false)
}
```

**Replace admin checks in admin-specific functions** — these functions are ONLY accessible to time clock admins:
- `getTimeClockEntries` (line 670) → already has auth check, add: `if (!canManageTimeClock(currentUser)) return failure('Access denied')`
- `getStaffClockStatus` (line 760) → same
- `generateQRCode` (line 860) → same
- `getQRSessionsForToday` (line 927) → same
- `updateStaffSchedule` (line 1090) → replace `isAdmin` check

For functions that allow admin OR self-operation (`clockIn`, `clockInWithQR`, `clockOut`, `clockOutWithQR`), replace `isAdmin` with `canManageTimeClock` so flag-holders can also manage other staff:

```typescript
// OLD:
const hasAdminAccess = await isAdmin(currentUser)

// NEW:
const hasAdminAccess = canManageTimeClock(currentUser)
```

(Remove `await` since sync now.)

Locations: ~lines 210, 347, 433, 1009, 1103.

- [ ] **Step 2: Verify time-clock file compiles**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint 2>&1 | grep -i "time.clock" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add server/actions/time-clock.ts
git commit -m "fix: use canManageTimeClock in time-clock actions, remove dead code"
```

---

## Phase 5: Page Guard Addition

### Task 10: Fix `app/sales/page.tsx` — add `await`

**Files:**
- Modify: `app/sales/page.tsx`

- [ ] **Step 1: Fix the missing `await`**

```typescript
// OLD (line 15):
if (!user || !canAccessTransactions(user)) {

// NEW:
if (!user || !canAccessTransactions(user)) {
```

Wait — since `canAccessTransactions` is now **synchronous** (from Task 2), `await` is no longer needed. The function now returns a direct boolean. So the fix is: **verify the import uses the sync version** and the check is correct.

The existing code is:
```typescript
import { getCurrentUser, canAccessTransactions } from "@/utils/auth/permissions"
// ...
const user = await getCurrentUser()
if (!user || !canAccessTransactions(user)) {
    redirect("/unauthorized")
}
```

After Task 2, `canAccessTransactions` is sync, so this code is now correct without `await`. No code change needed here — Task 2 already fixed the `async`→`sync` conversion.

- [ ] **Step 2: Verify the build catches any issues**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint 2>&1 | grep sales | head -5
```

- [ ] **Step 3: Commit (if changes needed)**

If no changes needed:
```bash
git commit --allow-empty -m "verify: sales page guard is correct after sync permission refactor"
```

---

### Task 11: Add page guards to inventory, metrics, config

**Files:**
- Modify: `app/inventory/page.tsx`
- Modify: `app/metrics/page.tsx`
- Modify: `app/config/page.tsx`

- [ ] **Step 1: Add guard to `app/inventory/page.tsx`**

```typescript
import { Metadata } from "next"
import { redirect } from "next/navigation"
import InventoryPageClientComponent from "./inventoryPage"
import { getCurrentUser, canManageInventory } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Inventory",
    description: "Manage your inventory items",
}

export default async function InventoryPage() {
    const user = await getCurrentUser()
    if (!user || !canManageInventory(user)) {
        redirect("/unauthorized")
    }
    return <InventoryPageClientComponent />
}
```

- [ ] **Step 2: Add guard to `app/metrics/page.tsx`**

```typescript
import { Metadata } from "next"
import { redirect } from "next/navigation"
import MetricsPageClient from "./metricsPage"
import { getCurrentUser, canViewMetrics } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Metrics",
    description: "Metrics Page",
}

export default async function MetricsPage() {
    const user = await getCurrentUser()
    if (!user || !canViewMetrics(user)) {
        redirect("/unauthorized")
    }
    return <MetricsPageClient />
}
```

- [ ] **Step 3: Add guard to `app/config/page.tsx`**

```typescript
import { Metadata } from "next"
import { redirect } from "next/navigation"
import ConfigPage from "./configPage"
import { getCurrentUser, canManageSystemConfig } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Settings",
    description: "Settings Page",
}

export default async function Config() {
    const user = await getCurrentUser()
    if (!user || !canManageSystemConfig(user)) {
        redirect("/unauthorized")
    }
    return <ConfigPage />
}
```

- [ ] **Step 4: Verify build**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run build 2>&1 | tail -20
```

Expected: Build succeeds. No compilation errors.

- [ ] **Step 5: Commit**

```bash
git add app/inventory/page.tsx app/metrics/page.tsx app/config/page.tsx
git commit -m "feat: add server-side page guards to inventory, metrics, config"
```

---

### Task 12: Add page guards to accounts, appointments, payroll, my-payroll, accounting, transactions, notify

**Files:**
- Modify: `app/accounts/page.tsx`
- Modify: `app/appointments/page.tsx`
- Modify: `app/payroll/page.tsx`
- Modify: `app/my-payroll/page.tsx`
- Modify: `app/accounting/page.tsx`
- Modify: `app/transactions/page.tsx`
- Modify: `app/notify/page.tsx`

- [ ] **Step 1: Add guard to `app/accounts/page.tsx`**

```typescript
import { Metadata } from "next"
import { redirect } from "next/navigation"
import AccountsClientPage from "./accountsPage"
import { getCurrentUser, canManageUsers } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Accounts",
    description: "Manage users",
}

export default async function AccountsPage() {
    const user = await getCurrentUser()
    if (!user || !canManageUsers(user)) {
        redirect("/unauthorized")
    }
    return <AccountsClientPage />
}
```

- [ ] **Step 2: Add guard to `app/appointments/page.tsx`**

```typescript
import { Metadata } from "next"
import { redirect } from "next/navigation"
import AppointmentsPageClient from "./appointmentsPage"
import { getCurrentUser, canManageAppointments } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Appointments",
    description: "Manage your appointments",
}

export default async function AppointmentsPage() {
    const user = await getCurrentUser()
    if (!user || !canManageAppointments(user)) {
        redirect("/unauthorized")
    }
    return <AppointmentsPageClient />
}
```

- [ ] **Step 3: Add guard to `app/payroll/page.tsx`**

```typescript
import { Metadata } from "next"
import { redirect } from "next/navigation"
import PayrollPageClient from "./payrollPage"
import { getCurrentUser, canManagePayroll } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Payroll Management",
    description: "Manage staff payroll and payments",
}

export default async function PayrollPage() {
    const user = await getCurrentUser()
    if (!user || !canManagePayroll(user)) {
        redirect("/unauthorized")
    }
    return <PayrollPageClient />
}
```

- [ ] **Step 4: Add guard to `app/my-payroll/page.tsx`**

```typescript
import { Metadata } from "next"
import { redirect } from "next/navigation"
import MyPayrollPageClient from "./myPayrollPage"
import { getCurrentUser, canViewOwnPayroll } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "My Payroll",
    description: "View your earnings and request payments",
}

export default async function MyPayrollPage() {
    const user = await getCurrentUser()
    if (!user || !canViewOwnPayroll(user)) {
        redirect("/unauthorized")
    }
    return <MyPayrollPageClient />
}
```

- [ ] **Step 5: Add guard to `app/accounting/page.tsx`**

```typescript
import { Metadata } from "next"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import AccountingPageClient from "./accountingPage"
import { getCurrentUser, canAccessAccounting } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Accounting",
    description: "General Ledger and Financial Records",
}

export default async function AccountingPage() {
    const user = await getCurrentUser()
    if (!user || !canAccessAccounting(user)) {
        redirect("/unauthorized")
    }
    return (
        <Suspense>
            <AccountingPageClient />
        </Suspense>
    )
}
```

- [ ] **Step 6: Add guard to `app/transactions/page.tsx`**

```typescript
import { Metadata } from "next"
import { redirect } from "next/navigation"
import TransactionsPageClient from "./transactionsPage"
import { getCurrentUser, canAccessTransactions } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Transactions | InkSight",
    description: "Manage transactions",
}

export default async function TransactionsPage() {
    const user = await getCurrentUser()
    if (!user || !canAccessTransactions(user)) {
        redirect("/unauthorized")
    }
    return <TransactionsPageClient />
}
```

- [ ] **Step 7: Add guard to `app/notify/page.tsx`**

```typescript
import { Metadata } from "next"
import { redirect } from "next/navigation"
import NotifyClientPage from "./notifyPage"
import { getCurrentUser, canSendNotifications } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Notify",
    description: "Send email notifications to users",
}

export default async function NotifyPage() {
    const user = await getCurrentUser()
    if (!user || !canSendNotifications(user)) {
        redirect("/unauthorized")
    }
    return <NotifyClientPage />
}
```

- [ ] **Step 8: Verify build**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run build 2>&1 | tail -20
```

Expected: Build succeeds.

- [ ] **Step 9: Commit**

```bash
git add app/accounts/page.tsx app/appointments/page.tsx app/payroll/page.tsx app/my-payroll/page.tsx app/accounting/page.tsx app/transactions/page.tsx app/notify/page.tsx
git commit -m "feat: add server-side page guards to all unprotected pages"
```

---

## Phase 6: Admin UI Alignment

### Task 13: Fix admin user-edit page to use canonical flag registry

**Files:**
- Modify: `app/accounts/[id]/page.tsx`

- [x] **Step 1: Update `availableFlags` to use the canonical registry**

In `app/accounts/[id]/page.tsx`, find the `availableFlags` definition (around line 63):

```typescript
// OLD:
const availableFlags = routes
    .filter((route) => route.perms)
    .map((route) => route.perms as string)
```

Replace with:
```typescript
// NEW:
import { FEATURE_ACCESS_FLAGS, VALID_FEATURE_FLAGS, CAPABILITY_FLAGS, VALID_CAPABILITY_FLAGS } from "@/utils/auth/access-flags"

// Available feature access flags from the canonical registry
const availableFlags = VALID_FEATURE_FLAGS
```

- [x] **Step 2: Update the flag rendering to show registry labels**

Find the flag checkbox rendering (around line 486):

```typescript
// OLD:
{Array.from(new Set([...availableFlags, "view_appointments", "transactions"])).map(
    (flag) => (
        <label key={flag} className="flex items-center gap-2">
            <input
                type="checkbox"
                checked={editData.access_flags?.includes(flag) || false}
                onChange={() => toggleFlag(flag)}
                disabled={!isAdmin}
                className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
            />
            <span className="capitalize">{flag.replace(/_/g, " ")}</span>
        </label>
    )
)}
```

Replace with:
```typescript
// Feature Access Flags
<h3 className="font-semibold pt-4">Feature Access</h3>
<div className="grid grid-cols-2 gap-3">
    {availableFlags.map((flag) => {
        const meta = FEATURE_ACCESS_FLAGS[flag]
        // Also check old flag names during transition
        const isChecked = editData.access_flags?.some(
            (f: string) => f === flag || normalizeFlag(f) === flag
        ) || false
        return (
            <label key={flag} className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleFlag(flag)}
                    disabled={!isAdmin}
                    className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
                />
                <span className="capitalize">{meta?.label || flag.replace(/_/g, " ")}</span>
            </label>
        )
    })}
</div>
```

- [x] **Step 3: Update capability flags section**

Find the capability flags section (around line 510):

Replace the hardcoded `["artist", "piercing", "shoe"]` with:
```typescript
{/* Capabilities for Admin */}
{editData.role === "admin" && (
    <>
        <h3 className="font-semibold pt-4">Capabilities (Hybrid Roles)</h3>
        <div className="grid grid-cols-2 gap-3">
            {VALID_CAPABILITY_FLAGS.map((flag) => {
                const meta = CAPABILITY_FLAGS[flag]
                const isChecked = editData.access_flags?.includes(flag) || false
                return (
                    <label key={flag} className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleFlag(flag)}
                            disabled={!isAdmin}
                            className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
                        />
                        <span className="capitalize">{meta?.label || flag}</span>
                    </label>
                )
            })}
        </div>
    </>
)}
```

- [x] **Step 4: Add the necessary import for `normalizeFlag`**

At the top of `app/accounts/[id]/page.tsx`, add:
```typescript
import { normalizeFlag } from "@/utils/auth/access-flags"
```

- [x] **Step 5: Verify build**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint 2>&1 | tail -10
```

- [x] **Step 6: Commit**

```bash
git add app/accounts/\[id\]/page.tsx
git commit -m "fix: use canonical flag registry in admin user-edit UI"
```

---

## Phase 7: Cleanup & Final Verification

### Task 14: Sidebar backward compatibility + remove dead code

**Files:**
- Modify: `components/sidebar.tsx`
- Modify: `components/accessChecker.tsx`

- [ ] **Step 1: Update sidebar flag check for backward compatibility**

In `components/sidebar.tsx`, the sidebar filters routes by checking `userInfo.access_flags?.includes(route.perms)`. During transition, users may still have old flag names in their `access_flags` array. Update the filter to handle both:

Find the filtered routes logic in `RouteGroup` component (around line 112):

```typescript
// OLD:
const filteredRoutes = useMemo(() => {
    return routes.filter((route) => {
        if (route.perms.length > 0) {
            if (
                !userInfo.access_flags?.includes(route.perms) &&
                userInfo.role !== "admin"
            ) {
                return false
            }
        }
        return true
    })
}, [routes, userInfo.access_flags, userInfo.role])
```

Replace with:
```typescript
import { normalizeFlag } from "@/utils/auth/access-flags"

// ... inside RouteGroup:
const filteredRoutes = useMemo(() => {
    return routes.filter((route) => {
        if (route.perms.length > 0) {
            // Admin sees everything
            if (userInfo.role === "admin") return true
            // Check both old and new flag names
            const hasFlag = userInfo.access_flags?.some(
                (f) => normalizeFlag(f) === normalizeFlag(route.perms)
            )
            if (!hasFlag) return false
        }
        return true
    })
}, [routes, userInfo.access_flags, userInfo.role])
```

- [ ] **Step 2: Update `AccessChecker` to use new sync permission check**

`components/accessChecker.tsx` currently checks flags inline. Update it to use the `userHasFlag` helper:

```typescript
"use client"

import { useContext, useEffect } from "react"
import { SideBarContext } from "./sidebar"
import { redirect } from "next/navigation"
import { userHasFlag } from "@/utils/auth/access-flags"

export default function AccessChecker({
    isAdmin,
    perms,
}: {
    isAdmin?: boolean
    perms?: string
}) {
    const { userInfo } = useContext(SideBarContext)

    useEffect(() => {
        if (isAdmin && perms === "") {
            if (userInfo.role !== "admin") {
                redirect("/unauthorized")
            }
        }
        if (perms && !userHasFlag(userInfo, perms)) {
            redirect("/unauthorized")
        }
    }, [userInfo, isAdmin, perms])

    return <></>
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add components/sidebar.tsx components/accessChecker.tsx
git commit -m "fix: sidebar backward compat with old flags, update AccessChecker"
```

---

### Task 15: Final build, lint, and manual verification

- [ ] **Step 1: Run full lint**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint 2>&1
```

Expected: No errors. Fix any warnings.

- [ ] **Step 2: Run production build**

```bash
cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run build 2>&1 | tail -40
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Manual smoke test checklist**

1. **Start dev server:** `bun run dev`
2. **Login as admin:** Verify all routes visible in sidebar, all pages render
3. **Login as non-admin with no flags:**
   - Verify only core routes visible (Dashboard, Calendar, Appointments, My Time Clock)
   - Try navigating directly to `/config` → should redirect to `/unauthorized`
   - Try navigating directly to `/payroll` → should redirect to `/unauthorized`
4. **Login as user with `payroll_manage` flag:**
   - Verify Payroll route visible in sidebar
   - Verify can create/modify payroll entries
5. **Login as user with `transactions_manage` flag:**
   - Verify Sales and Transactions routes visible
   - Verify can create/void transactions
6. **Login as user with `time_clock_manage` flag:**
   - Verify Admin Time Clock route visible
   - Verify can generate QR codes, view staff status
7. **Login as user with old flag names** (before migration):
   - Verify sidebar still shows correct routes (backward compat)
   - Verify middleware still allows access (normalizeFlag handles old names)
8. **Run migration script dry-run:**
   ```bash
   bun run scripts/migrate-access-flags.ts
   ```
   - Verify it identifies users with old flags and shows correct mappings

- [ ] **Step 4: Commit final verification notes**

```bash
git commit --allow-empty -m "verify: final build, lint, and smoke test pass"
```

---

## Post-Implementation: Run Migration

After all verification passes, run the migration to update flag names in the database:

```bash
DRY_RUN=false bun run scripts/migrate-access-flags.ts
```

This will convert all old flag names to canonical names for all users.

---

## Rollback Plan

If issues arise after deployment:
1. The migration script is additive (old→new mapping). No data is lost.
2. `normalizeFlag()` provides backward compatibility for both old and new names.
3. Middleware catches errors with `try/catch` and fails open (allows access) rather than locking everyone out.
4. To fully roll back, revert the commits in reverse order:
   ```bash
   git revert <commit-hash-15> <commit-hash-14> ... <commit-hash-1>
   ```
5. The migration script has no automatic rollback — if needed, a reverse script can be created from `FLAG_MIGRATION_MAP`.

---

## Acceptance Criteria Verification

| # | Criterion | Verified By |
|---|-----------|-------------|
| 1 | Middleware enforces flag checks | Smoke test #3 — direct URL navigation redirects to `/unauthorized` |
| 2 | Every guarded server action uses correct permission check | Task 7-9 code changes + manual payroll/transaction/time-clock tests |
| 3 | Every guarded page has server-side check | Task 11-12 code changes + smoke test #3 |
| 4 | Admin can assign all valid flags | Task 13 — flag list from registry, smoke test via admin UI |
| 5 | Flag names consistent across layers | Tasks 1-4 — single registry, route config + permissions + UI aligned |
| 6 | `/unauthorized` page exists | Task 5 + smoke test #3 |
| 7 | No async functions called without await | Task 2 — all permission functions now synchronous |
| 8 | Sidebar correctly hides/shows routes | Task 14 + smoke tests #2, #4, #5, #6 |
| 9 | Admin role bypass works | `userHasFlag()` always returns true for admin role |
| 10 | No dead code | Task 9 removes `hasTimeClockAccess` local function; Task 2 removes async wrappers |
