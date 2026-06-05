# Artist Level Comprehensive Audit & Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all Artist Level visibility, initialization, and logic issues across the entire application — ensuring artist level only appears for artist-capable users, new artists get a default level, and a shared utility replaces scattered checks.

**Architecture:** The system uses two mechanisms to identify artists: (1) `role === "artist"` for dedicated artists, and (2) `access_flags` containing `"artist"` for hybrid admin artists. The `artist_level` field (`NORMAL | HEAD_ARTIST | OWNER`) on the `user` table determines payroll rates and ranking. Current bugs stem from: display logic checking `artist_level` truthiness before role eligibility, missing auto-initialization in create/invite flows, and duplicated capability-check patterns across 10+ files.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zod, Drizzle ORM, Tailwind CSS 4, Better Auth

---

## Task 1: Create Shared Utility for Artist Capability Checks

**Problem:** The pattern for checking if a user "is an artist" (either by role or hybrid access_flag) is duplicated across `UserRow.tsx`, `accounts/[id]/page.tsx`, `EditUserModal.tsx`, `WalkinAppointmentModal.tsx`, `editAppointment.tsx`, `profilePage.tsx`, and more. This leads to inconsistency and bugs when one location is updated but others are not.

**Why first:** Every subsequent task depends on this helper. Establishing the single source of truth prevents further drift.

**Files:**
- Modify: `utils/auth/permissions.ts:101-155`

**Step 1: Add `isArtistCapable` helper function**

Add after the existing permission functions (after line 155):

```typescript
/**
 * Returns true if the user has artist capability — either via the "artist" role
 * or via a hybrid admin with "artist" in access_flags.
 */
export function isArtistCapable(user: { role?: string | null; access_flags?: string[] | null }): boolean {
    return user.role === "artist" || (user.role === "admin" && (user.access_flags?.includes("artist") ?? false))
}

/**
 * Returns true if the user has any work capability that requires artist_level
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
 * Returns true if the user should have an artist_level set.
 * Covers artist role, staff role, and hybrid admin with work capabilities.
 */
export function shouldHaveArtistLevel(user: { role?: string | null; access_flags?: string[] | null }): boolean {
    return user.role === "artist" || user.role === "staff" || (user.role === "admin" && (user.access_flags?.includes("artist") ?? false))
}
```

**Step 2: Export from permissions index**

Verify these are exported from `utils/auth/permissions.ts` (they will be since they're in the file directly).

**Step 3: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add utils/auth/permissions.ts
git commit -m "feat(auth): add shared helpers for artist capability checks"
```

---

## Task 2: Fix UserRow Artist Level Display Logic

**Problem:** In `components/accounts/UserRow.tsx:139-157`, the artist level badge renders whenever `user.artist_level` is truthy, regardless of role. A user who was formerly an artist (and has `artist_level: "NORMAL"` in the DB) but is now a `manager` will still see the green "NORMAL" badge. The column should only show meaningful data for artist-capable users.

**Files:**
- Modify: `components/accounts/UserRow.tsx:1-3` (add import)
- Modify: `components/accounts/UserRow.tsx:139-157`

**Step 1: Import the shared helper**

Add to imports at line 3:
```typescript
import { hasWorkCapability } from "@/utils/auth/permissions"
```

**Step 2: Replace the Artist Level display conditional**

Replace lines 139-157:
```tsx
{user.artist_level ? (
    <span
        className={`px-2 py-0.5 rounded text-xs font-semibold ${
            user.artist_level === "OWNER"
                ? "bg-purple-500/30 text-purple-300"
                : user.artist_level === "HEAD_ARTIST"
                  ? "bg-blue-500/30 text-blue-300"
                  : "bg-green-500/30 text-green-300"
        }`}
    >
        {user.artist_level.replace("_", " ")}
    </span>
) : user.role === "staff" || (user.role === "admin" && (user.access_flags?.includes("artist") || user.access_flags?.includes("piercing") || user.access_flags?.includes("shoe"))) ? (
    <span className='px-2 py-0.5 rounded text-xs font-semibold bg-gray-500/30 text-gray-400'>
        NONE
    </span>
) : (
    <span className='text-white/30'>—</span>
)}
```

With:
```tsx
{hasWorkCapability(user) ? (
    user.artist_level ? (
        <span
            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                user.artist_level === "OWNER"
                    ? "bg-purple-500/30 text-purple-300"
                    : user.artist_level === "HEAD_ARTIST"
                      ? "bg-blue-500/30 text-blue-300"
                      : "bg-green-500/30 text-green-300"
            }`}
        >
            {user.artist_level.replace("_", " ")}
        </span>
    ) : (
        <span className='px-2 py-0.5 rounded text-xs font-semibold bg-gray-500/30 text-gray-400'>
            NONE
        </span>
    )
) : (
    <span className='text-white/30'>—</span>
)}
```

Logic: If user has work capability → show level badge or "NONE". If not → show "—". This replaces the brittle role-check chain with the shared helper.

**Step 3: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 4: Verify manually**

- Navigate to `/accounts`
- A manager/staff/non-artist user with stale `artist_level` → shows "—"
- An artist without `artist_level` → shows "NONE"
- An artist with `artist_level: "HEAD_ARTIST"` → shows blue "HEAD ARTIST" badge
- A hybrid admin with `access_flags: ["artist"]` and no `artist_level` → shows "NONE"
- A hybrid admin with `access_flags: ["artist"]` and `artist_level: "OWNER"` → shows purple "OWNER" badge
- A regular admin (no hybrid flags) → shows "—"

**Step 5: Commit**

```bash
git add components/accounts/UserRow.tsx
git commit -m "fix(accounts): only show artist level badge for artist-capable users"
```

---

## Task 3: Conditionally Show Artist Level Dropdown in Access & Work Tab

**Problem:** In `app/accounts/[id]/page.tsx:500-518`, the Artist Level dropdown is always visible under "Payroll Settings" regardless of the user's role. A `manager` or `admin` without hybrid capability sees a dropdown labeled "Artist Level" which is confusing and can store meaningless data. The dropdown should only render when the user has work capability.

**Files:**
- Modify: `app/accounts/[id]/page.tsx:19` (add import)
- Modify: `app/accounts/[id]/page.tsx:496-541`

**Step 1: Import the shared helper**

Add `hasWorkCapability` to the import from `@/utils/auth/permissions`. Check existing imports — if `permissions` is not imported yet, add:
```typescript
import { hasWorkCapability } from "@/utils/auth/permissions"
```

**Step 2: Wrap Artist Level dropdown in conditional**

Replace lines 496-541 (the Payroll Settings section):
```tsx
{/* Payroll Settings */}
<div className="pt-6 border-t border-white/10 space-y-4">
        <h3 className="font-semibold">Payroll Settings</h3>

        <div className="grid grid-cols-2 gap-4">
            <label className="block">
                <span className="text-sm font-medium text-white/60">Artist Level</span>
                <select
                    value={editData.artist_level || "NORMAL"}
                    onChange={(e) =>
                        setEditData({
                            ...editData,
                            artist_level: e.target.value as ArtistLevelType,
                        })
                    }
                    disabled={!isAdmin}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
                >
                    <option value="NORMAL">Normal Artist</option>
                    <option value="HEAD_ARTIST">Head Artist</option>
                    <option value="OWNER">Owner</option>
                </select>
            </label>

            <label className="block">
                <span className="text-sm font-medium text-white/60">Payout Period</span>
                ...
            </label>
        </div>
    </div>
```

With:
```tsx
{/* Payroll Settings */}
<div className="pt-6 border-t border-white/10 space-y-4">
        <h3 className="font-semibold">Payroll Settings</h3>

        <div className={`grid gap-4 ${hasWorkCapability(editData) ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {hasWorkCapability(editData) && (
                <label className="block">
                    <span className="text-sm font-medium text-white/60">Artist Level</span>
                    <select
                        value={editData.artist_level || "NORMAL"}
                        onChange={(e) =>
                            setEditData({
                                ...editData,
                                artist_level: e.target.value as ArtistLevelType,
                            })
                        }
                        disabled={!isAdmin}
                        className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
                    >
                        <option value="NORMAL">Normal Artist</option>
                        <option value="HEAD_ARTIST">Head Artist</option>
                        <option value="OWNER">Owner</option>
                    </select>
                </label>
            )}

            <label className="block">
                <span className="text-sm font-medium text-white/60">Payout Period</span>
                <select
                    value={editData.payout_period || "DAILY"}
                    onChange={(e) =>
                        setEditData({
                            ...editData,
                            payout_period: e.target.value as PayoutPeriodType,
                        })
                    }
                    disabled={!isAdmin}
                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
                >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="BIMONTHLY">Bi-monthly</option>
                    <option value="MONTHLY">Monthly</option>
                </select>
            </label>
        </div>
    </div>
```

Note: `editData` is `Partial<UserProfile>` which matches the helper's expected type since `UserProfile` has `role` and `access_flags`.

**Step 3: Handle role change — clear artist_level when role changes away from artist**

In the role change handler (lines 428-440), add logic to clear `artist_level` when the role changes to a non-artist role:

Replace lines 428-440:
```tsx
onChange={(e) => {
    const newRole = e.target.value as UserRoleType
    // Prevent downgrading self
    if (isOwnProfile && newRole !== "admin") {
        addNotification("You cannot downgrade your own role", "ERROR")
        return
    }
    // Prevent non-admins from setting admin
    if (!isAdmin && newRole === "admin") {
        addNotification("Only admins can set admin role", "ERROR")
        return
    }
    setEditData({ ...editData, role: newRole })
}}
```

With:
```tsx
onChange={(e) => {
    const newRole = e.target.value as UserRoleType
    // Prevent downgrading self
    if (isOwnProfile && newRole !== "admin") {
        addNotification("You cannot downgrade your own role", "ERROR")
        return
    }
    // Prevent non-admins from setting admin
    if (!isAdmin && newRole === "admin") {
        addNotification("Only admins can set admin role", "ERROR")
        return
    }

    const updates: Partial<UserProfile> = { ...editData, role: newRole }

    // Auto-set artist_level when changing to artist role
    if (newRole === "artist" && !editData.artist_level) {
        updates.artist_level = "NORMAL"
    }

    // Clear artist_level when changing away from artist-capable roles
    const tempUser = { ...editData, role: newRole }
    if (!hasWorkCapability(tempUser) && editData.artist_level) {
        updates.artist_level = undefined
    }

    setEditData(updates)
}}
```

**Step 4: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 5: Verify manually**

- Navigate to `/accounts/[id]` for a `manager` → Artist Level dropdown should NOT be visible
- Change role to `artist` → Artist Level dropdown should appear with "Normal Artist" pre-selected
- Change role back to `manager` → Artist Level dropdown disappears
- Navigate to a hybrid admin with `access_flags: ["artist"]` → Artist Level dropdown should be visible
- Navigate to a regular `artist` → Artist Level dropdown visible
- Payout Period dropdown always visible for all roles

**Step 6: Commit**

```bash
git add app/accounts/\[id\]/page.tsx
git commit -m "fix(accounts): conditionally show artist level dropdown based on role capability"
```

---

## Task 4: Conditionally Show Artist Level Dropdown in EditUserModal

**Problem:** `components/accounts/EditUserModal.tsx:420-442` shows the Artist Level dropdown unconditionally. Same issue as the Access & Work tab — a `manager` user being edited sees the Artist Level field which is irrelevant. Additionally, the role change handler (lines 168-192) doesn't react to role changes for artist_level management.

**Files:**
- Modify: `components/accounts/EditUserModal.tsx:1-9` (add import)
- Modify: `components/accounts/EditUserModal.tsx:168-192` (role change handler)
- Modify: `components/accounts/EditUserModal.tsx:418-442` (artist level dropdown)

**Step 1: Import the shared helper**

Add to imports:
```typescript
import { hasWorkCapability } from "@/utils/auth/permissions"
```

**Step 2: Update the role change handler to manage artist_level**

Replace lines 189-192:
```tsx
setLocalUser({
    ...localUser,
    role: e.target.value as UserRoleType,
})
```

With:
```tsx
const newRole = e.target.value as UserRoleType
const updates = { ...localUser, role: newRole }

// Auto-set artist_level when changing to artist role
if (newRole === "artist" && !localUser.artist_level) {
    updates.artist_level = "NORMAL"
}

// Clear artist_level when changing away from artist-capable roles
if (!hasWorkCapability({ ...localUser, role: newRole }) && localUser.artist_level) {
    updates.artist_level = undefined
}

setLocalUser(updates)
```

**Step 3: Wrap Artist Level dropdown in conditional**

Replace lines 418-442:
```tsx
{/* Payroll Settings */}
<div className='w-full flex flex-col @[25rem]:flex-row gap-4 mt-4 pt-4 border-t border-white/10'>
    <label className='flex flex-col gap-1 font-semibold text-sm text-white/40 flex-1'>
        Artist Level
        <select
            value={localUser.artist_level || "NORMAL"}
            onChange={(e) => {
                setLocalUser({
                    ...localUser,
                    artist_level: e.target.value as ArtistLevelType,
                })
            }}
            className='bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1 text-white font-normal cursor-pointer transition-colors hover:bg-white/10'
        >
            <option value='NORMAL'>Normal Artist</option>
            <option value='HEAD_ARTIST'>Head Artist</option>
            <option value='OWNER'>Owner</option>
        </select>
    </label>
    <label ...>Payout Period...</label>
</div>
```

With:
```tsx
{/* Payroll Settings */}
<div className='w-full flex flex-col @[25rem]:flex-row gap-4 mt-4 pt-4 border-t border-white/10'>
    {hasWorkCapability(localUser) && (
        <label className='flex flex-col gap-1 font-semibold text-sm text-white/40 flex-1'>
            Artist Level
            <select
                value={localUser.artist_level || "NORMAL"}
                onChange={(e) => {
                    setLocalUser({
                        ...localUser,
                        artist_level: e.target.value as ArtistLevelType,
                    })
                }}
                className='bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1 text-white font-normal cursor-pointer transition-colors hover:bg-white/10'
            >
                <option value='NORMAL'>Normal Artist</option>
                <option value='HEAD_ARTIST'>Head Artist</option>
                <option value='OWNER'>Owner</option>
            </select>
        </label>
    )}
    <label className='flex flex-col gap-1 font-semibold text-sm text-white/40 flex-1'>
        Payout Period
        <select
            value={localUser.payout_period || "DAILY"}
            onChange={(e) => {
                setLocalUser({
                    ...localUser,
                    payout_period: e.target.value as PayoutPeriodType,
                })
            }}
            className='bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1 text-white font-normal cursor-pointer transition-colors hover:bg-white/10'
        >
            <option value='DAILY'>Daily</option>
            <option value='WEEKLY'>Weekly</option>
            <option value='BIMONTHLY'>Bi-monthly</option>
            <option value='MONTHLY'>Monthly</option>
        </select>
    </label>
</div>
```

**Step 4: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 5: Verify manually**

- Open Edit User modal for a `manager` → no Artist Level field
- Open for an `artist` → Artist Level field visible
- Change role from `artist` to `staff` → Artist Level field stays (staff has work capability)
- Change role from `artist` to `manager` → Artist Level field disappears
- Open for a hybrid admin with `access_flags: ["artist"]` → Artist Level field visible

**Step 6: Commit**

```bash
git add components/accounts/EditUserModal.tsx
git commit -m "fix(accounts): conditionally show artist level in edit modal based on role"
```

---

## Task 5: Auto-Set artist_level When Creating Users as Artist

**Problem:** `server/actions/profile.ts:738-742` — the `createUser` function only sets `fullName` and `role` after user creation. When role is `"artist"`, the `artist_level` column remains `NULL`. This means: (1) the UserRow shows "NONE" instead of "NORMAL", (2) payroll rate lookups may fail since `artist_level` is used in rate matching, and (3) the artist leaderboard queries may miss the user.

**Files:**
- Modify: `server/actions/profile.ts:738-742`

**Step 1: Add artist_level to the createUser update**

Replace lines 738-742:
```typescript
// Update additional profile fields including role
await db.update(user)
    .set({
        fullName: full_name,
        role: role.toLowerCase(),
    })
    .where(eq(user.email, normalizedEmail))
```

With:
```typescript
// Update additional profile fields including role
const updateData: Partial<typeof user.$inferInsert> = {
    fullName: full_name,
    role: role.toLowerCase(),
}

// Set default artist_level for artist role
if (role === "artist") {
    updateData.artistLevel = "NORMAL"
}

await db.update(user)
    .set(updateData)
    .where(eq(user.email, normalizedEmail))
```

**Step 2: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 3: Verify manually**

- Navigate to `/accounts` → click "Create User"
- Set role to "Artist", fill in name/email/password, submit
- Navigate to the new user's detail page → Artist Level should show "Normal Artist"
- The user table should show green "NORMAL" badge instead of "NONE"

**Step 4: Commit**

```bash
git add server/actions/profile.ts
git commit -m "fix(profile): auto-set artist_level to NORMAL when creating artist users"
```

---

## Task 6: Handle Invitation Acceptance — Set artist_level for Invited Artists

**Problem:** When a user is invited with role `"artist"` and they accept the invitation, their `artist_level` is never set. The invitation flow (`inviteUser`) stores the role in the `invitations` table, but the account creation hook that processes the invitation doesn't set `artist_level`.

**Files:**
- Investigate: `server/actions/profile.ts` for invitation acceptance handler
- Or: `server/auth/` for Better Auth hooks that process invitations

**Step 1: Find the invitation acceptance handler**

Search for where invitation tokens are validated and the user record is updated after accepting an invite. Look for patterns like `invitationCode`, `invitation`, or `hooks` in the auth setup.

Run: `grep -rn "invitationCode\|invitation.*hook\|acceptInvite\|processInvitation" server/`

**Step 2: Update the handler to set artist_level**

Wherever the user's role is set from the invitation record, also set `artist_level`:

```typescript
// When processing invitation acceptance, set artist_level for artist role
const userUpdate: Record<string, unknown> = { role: invitation.role }
if (invitation.role === "artist") {
    userUpdate.artistLevel = "NORMAL"
}
await db.update(user).set(userUpdate).where(eq(user.id, userId))
```

**Step 3: Run lint**

Run: `bun run lint`
Expected: No errors

**Step 4: Verify manually**

- Invite a user with role "Artist"
- Accept the invitation
- Navigate to the new user in `/accounts` → Artist Level should show "NORMAL"

**Step 5: Commit**

```bash
git add server/actions/profile.ts  # or wherever the handler is
git commit -m "fix(profile): auto-set artist_level when artist invitation is accepted"
```

---

## Task 7: Audit Payroll Artist Level Usage

**Problem:** The payroll system heavily uses `artist_level` for rate lookups and earnings summaries. Need to verify that all payroll queries handle NULL `artist_level` gracefully and that the rate matching logic is correct.

**Files to audit:**
- `server/actions/payroll.ts:75-83` — `getStaffRates` filter by artist_level
- `server/actions/payroll.ts:106-116` — `getApplicableRate` exact match on artist_level
- `server/actions/payroll.ts:276` — `getPayrollEntries` join uses artist_level
- `server/actions/payroll.ts:1266-1353` — `calculatePayroll` groups by artist_level
- `scripts/seed-database.ts:17-105` — seed data covers all combinations of NORMAL/HEAD_ARTIST/OWNER
- `server/db/schema/payroll.ts:20` — `artistLevel` is NOT NULL on `payroll_staff_rate`

**Step 1: Verify seed data completeness**

Read `scripts/seed-database.ts` and confirm all three artist levels (NORMAL, HEAD_ARTIST, OWNER) have rates for every service_type × client_type combination.

**Step 2: Verify rate lookup handles missing artist_level**

In `server/actions/payroll.ts`, the `getApplicableRate` function at line 106 does an exact match on `artist_level`. If a user has `artist_level: null`, this will return no matching rate. Verify that:
- The `calculateAndCreatePayrollEntry` function at line 342 fetches the user's `artist_level` before calling `getApplicableRate`
- If `artist_level` is null, the function returns a clear error rather than silently failing

**Step 3: Verify earnings summary grouping**

In `server/actions/metrics.ts`, `getArtistLeaderboard` groups by `user.artistLevel`. Verify NULL values don't break the grouping (they'll appear as a separate group). Consider filtering out NULLs or treating them as "NORMAL".

**Step 4: Document findings**

If any issues are found, add them as sub-tasks. If all is correct, note: "Payroll system correctly requires artist_level for rate matching. The auto-initialization in Tasks 5-6 ensures new artists always have a value."

**Step 5: Commit (if fixes needed)**

```bash
git add <changed files>
git commit -m "fix(payroll): handle NULL artist_level in rate lookups and earnings"
```

---

## Task 8: Audit Metrics/Leaderboard Artist Level Usage

**Problem:** `server/actions/metrics.ts:719-776` has `getArtistLeaderboard` and `fetchLeaderboardData` which query and group by `user.artistLevel`. Need to verify this works correctly with the artist level fixes.

**Files to audit:**
- `server/actions/metrics.ts:719` — `ArtistLeaderboardEntry` type
- `server/actions/metrics.ts:761` — `getArtistLeaderboard` query
- `server/actions/metrics.ts:1541-1556` — `fetchLeaderboardData` query

**Step 1: Verify leaderboard query**

Read `server/actions/metrics.ts:761-776` and confirm:
- The query filters to only users who should have artist_level (artist role or hybrid)
- The GROUP BY on `user.artistLevel` doesn't produce unexpected groups from stale NULL values
- The labels for each level match the UI display (`ARTIST_LEVEL_LABELS`)

**Step 2: Verify type alignment**

Confirm `ArtistLeaderboardEntry.artist_level` uses the same type as `ArtistLevelType` from `utils/types/auth.ts`.

**Step 3: Document findings**

If correct, note: "Leaderboard correctly groups by artist_level. The conditional display fixes ensure only artist-capable users appear in leaderboard queries."

---

## Verification: Full Lint Check

After all tasks are complete, run:

```bash
bun run lint
```

Expected: No errors or warnings. Fix any issues before final commit.

---

## Verification: End-to-End Scenario Testing

Test these complete scenarios after all changes:

### Scenario 1: Create New Artist
1. Go to `/accounts` → "Create User"
2. Set name, email, password, role = "Artist"
3. Submit → user created
4. View in table → Artist Level shows green "NORMAL" badge
5. Click "Manage" → "Access & Work" tab → Artist Level dropdown visible, set to "Normal Artist"
6. Change to "Head Artist" → save → table shows blue "HEAD ARTIST" badge

### Scenario 2: Invite Artist
1. Go to `/accounts` → "Invite User"
2. Set email, role = "Artist"
3. Send invitation
4. Accept invitation (via email link)
5. View in table → Artist Level shows green "NORMAL" badge

### Scenario 3: Role Change Away From Artist
1. Edit a user who is currently an "artist" with `artist_level: "HEAD_ARTIST"`
2. Change role to "manager"
3. Artist Level dropdown disappears from Access & Work tab
4. Save → `artist_level` is cleared in the database
5. View in table → Artist Level shows "—" (em dash)

### Scenario 4: Hybrid Admin
1. Edit a user with role "admin"
2. Check "artist" in Capabilities (Hybrid Roles)
3. Artist Level dropdown appears
4. Set to "Owner" → save
5. View in table → purple "OWNER" badge
6. Uncheck "artist" capability → Artist Level dropdown disappears
7. Save → `artist_level` is cleared

### Scenario 5: Non-Artist User
1. View a "manager" or "admin" (no hybrid) in the table
2. Artist Level column shows "—" (em dash)
3. Click "Manage" → "Access & Work" → no Artist Level dropdown
4. Only Payout Period dropdown visible under Payroll Settings

---

## Summary of Changes

| Task | File | Change |
|------|------|--------|
| 1 | `utils/auth/permissions.ts` | Add `isArtistCapable`, `hasWorkCapability`, `shouldHaveArtistLevel` helpers |
| 2 | `components/accounts/UserRow.tsx` | Use `hasWorkCapability` to conditionally show artist level badge |
| 3 | `app/accounts/[id]/page.tsx` | Conditionally render Artist Level dropdown; auto-set/clear on role change |
| 4 | `components/accounts/EditUserModal.tsx` | Conditionally render Artist Level dropdown; auto-set/clear on role change |
| 5 | `server/actions/profile.ts` | Auto-set `artist_level: "NORMAL"` in `createUser` for artist role |
| 6 | `server/actions/profile.ts` | Auto-set `artist_level: "NORMAL"` in invitation acceptance for artist role |
| 7 | `server/actions/payroll.ts` | Audit: verify rate lookups handle artist_level correctly |
| 8 | `server/actions/metrics.ts` | Audit: verify leaderboard groups by artist_level correctly |

## Additional Improvements Identified

1. **Clear stale artist_level on save** — In `updateProfile` server action (`server/actions/profile.ts:335`), add server-side logic to clear `artist_level` if the user's role is not artist-capable. This is a defense-in-depth measure beyond the client-side clearing.

2. **Type consolidation** — `ArtistLevelType` is defined in both `utils/types/auth.ts:2` and `utils/types/payroll.ts:7`. Consolidate to a single definition and import from one source.

3. **Schedule tab for hybrid admins** — The existing plan `docs/plans/2026-04-13-hybrid-roles-artist-level.md` Task 3 addresses showing the Schedule tab for hybrid admins. Verify if this was already implemented (line 555 already includes the check).

4. **WalkinAppointmentModal hybrid filtering** — The existing plan Task 4 addresses this. Verify if `components/appointments/WalkinAppointmentModal.tsx:127-138` already includes hybrid admin filtering.

5. **editAppointment hybrid fields** — The existing plan Task 5 addresses this. Verify if `components/appointments/editAppointment.tsx:1184,1837,2264` already includes hybrid checks.

6. **Profile page artist check** — `app/profile/page.tsx:34` checks `userProfile.access_flags?.includes("artist")`. Verify this correctly shows artist-specific UI for hybrid admins.

7. **Middleware access_flags TODO** — `middleware.ts:46` has a TODO for access_flags checking. This is a separate concern but worth noting for future work.


