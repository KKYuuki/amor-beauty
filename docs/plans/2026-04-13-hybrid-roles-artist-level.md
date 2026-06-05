# Hybrid Roles & Artist Level Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix artist level display for hybrid role users (admins with artist/piercer/shoe capabilities), fix a critical Zod validation mismatch, and ensure hybrid admins are included in scheduling and appointment filtering.

**Architecture:** The system already supports hybrid roles via `access_flags` on admin users (e.g., `["artist"]`). The fixes involve: (1) updating conditional display logic in the UserRow component, (2) correcting Zod schemas that use wrong enum values, (3) broadening role checks in schedule/appointment components to include admins with hybrid capabilities.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zod, Drizzle ORM, Tailwind CSS 4

---

## Task 1: Fix Artist Level Display for Hybrid Admins in User Table

**Problem:** In `components/accounts/UserRow.tsx:138-157`, the Artist Level column shows "—" for admin users even when they have hybrid capabilities (`access_flags` includes `artist`, `piercing`, or `shoe`). It should show "NONE" (like `staff` role does) when a user has artist capability but no `artist_level` set.

**Files:**
- Modify: `components/accounts/UserRow.tsx:138-157`

**Step 1: Update the conditional in UserRow to detect hybrid artist capability**

Current code at line 138-157:
```tsx
<td className='px-3 py-1 text-sm font-medium w-max'>
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
    ) : user.role === "staff" ? (
        <span className='px-2 py-0.5 rounded text-xs font-semibold bg-gray-500/30 text-gray-400'>
            NONE
        </span>
    ) : (
        <span className='text-white/30'>—</span>
    )}
</td>
```

Replace the `user.role === "staff"` check with a helper that also checks for hybrid artist capability:

```tsx
<td className='px-3 py-1 text-sm font-medium w-max'>
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
</td>
```

**Step 2: Run lint to verify**

Run: `bun run lint`
Expected: No errors

**Step 3: Verify manually**

- Navigate to `/accounts` page
- Find an admin user with `access_flags` containing `artist`, `piercing`, or `shoe`
- Verify the Artist Level column shows "NONE" (gray badge) instead of "—"
- Verify non-hybrid admins still show "—"
- Verify artists with `artist_level` set still show the colored badge
- Verify staff role still shows "NONE" when no `artist_level` is set

**Step 4: Commit**

```bash
git add components/accounts/UserRow.tsx
git commit -m "fix(accounts): show artist level badge for admin users with hybrid capabilities"
```

---

## Task 2: Fix Critical Zod Validation Mismatch for Artist Level and Payout Period

**Problem:** In `server/actions/profile.ts:45-46`, the `UpdateUserProfileSchema` validates `artist_level` against `['APPRENTICE', 'JUNIOR', 'SENIOR', 'MASTER']` and `payout_period` against `['WEEKLY', 'BIWEEKLY', 'MONTHLY']`. The actual values used everywhere else in the app are `['NORMAL', 'HEAD_ARTIST', 'OWNER']` and `['DAILY', 'WEEKLY', 'BIMONTHLY', 'MONTHLY']` respectively. This means **any profile update that includes artist_level or payout_period will fail Zod validation** and the update will be silently rejected or error out.

**Evidence of mismatch:**
- Type definition (`utils/types/auth.ts:2`): `ArtistLevelType = "NORMAL" | "HEAD_ARTIST" | "OWNER"`
- Payroll schema (`server/actions/payroll-schemas.ts:9`): `z.enum(['NORMAL', 'HEAD_ARTIST', 'OWNER'])`
- UI dropdowns (`app/accounts/[id]/page.tsx:514-516`): `NORMAL`, `HEAD_ARTIST`, `OWNER`
- UI dropdowns (`app/accounts/[id]/page.tsx:533-536`): `DAILY`, `WEEKLY`, `BIMONTHLY`, `MONTHLY`
- Seed data (`scripts/seed-database.ts`): uses `NORMAL`, `HEAD_ARTIST`, `OWNER`
- **Broken schema** (`server/actions/profile.ts:45`): `z.enum(['APPRENTICE', 'JUNIOR', 'SENIOR', 'MASTER'])`
- **Broken schema** (`server/actions/profile.ts:46`): `z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY'])`

**Files:**
- Modify: `server/actions/profile.ts:45-46`

**Step 1: Fix the artist_level Zod enum**

Replace line 45:
```typescript
artist_level: z.enum(['APPRENTICE', 'JUNIOR', 'SENIOR', 'MASTER']).optional().nullable(),
```
With:
```typescript
artist_level: z.enum(['NORMAL', 'HEAD_ARTIST', 'OWNER']).optional().nullable(),
```

**Step 2: Fix the payout_period Zod enum**

Replace line 46:
```typescript
payout_period: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional().nullable(),
```
With:
```typescript
payout_period: z.enum(['DAILY', 'WEEKLY', 'BIMONTHLY', 'MONTHLY']).optional().nullable(),
```

**Step 3: Run lint to verify**

Run: `bun run lint`
Expected: No errors

**Step 4: Verify the fix**

- Navigate to `/accounts/[id]` for any user
- Change the Artist Level dropdown and save
- Change the Payout Period dropdown and save
- Both should persist without errors (previously they would fail silently or throw a Zod validation error)

**Step 5: Commit**

```bash
git add server/actions/profile.ts
git commit -m "fix(profile): correct Zod validation enums for artist_level and payout_period"
```

---

## Task 3: Show Schedule Tab for Admins with Hybrid Artist/Piercer/Shoe Capabilities

**Problem:** In `app/accounts/[id]/page.tsx:551-554`, the Schedule tab only renders the `ScheduleEditor` for `staff | artist | piercer | shoe_tech` roles. Admins with hybrid capabilities (`access_flags` containing `artist`, `piercing`, or `shoe`) see "Scheduling is not available" despite needing to set their work schedules.

**Files:**
- Modify: `app/accounts/[id]/page.tsx:551-554`

**Step 1: Add a helper to check if a user has hybrid work capabilities**

Add this helper function near the top of the file (after the imports, before the component), or inline the check. The cleanest approach is a small inline check:

Replace lines 551-554:
```tsx
{user.role === "staff" ||
user.role === "artist" ||
user.role === "piercer" ||
user.role === "shoe_tech" ? (
```

With:
```tsx
{user.role === "staff" ||
user.role === "artist" ||
user.role === "piercer" ||
user.role === "shoe_tech" ||
(user.role === "admin" && user.access_flags?.some(f => ["artist", "piercing", "shoe"].includes(f))) ? (
```

**Step 2: Run lint to verify**

Run: `bun run lint`
Expected: No errors

**Step 3: Verify manually**

- Navigate to `/accounts/[id]` for an admin user with `access_flags` containing `artist`, `piercing`, or `shoe`
- Click the "Schedule" tab
- The `ScheduleEditor` component should render instead of "Scheduling is not available"
- Navigate to a regular admin (no hybrid flags) — should still show "Scheduling is not available"
- Navigate to an artist user — should still show `ScheduleEditor`

**Step 4: Commit**

```bash
git add app/accounts/\[id\]/page.tsx
git commit -m "fix(accounts): show schedule tab for admins with hybrid artist/piercer/shoe capabilities"
```

---

## Task 4: Include Hybrid Admins in WalkinAppointmentModal Staff Filtering

**Problem:** In `components/appointments/WalkinAppointmentModal.tsx:34-39` and `:128-131`, staff is filtered by `s.role` against a static `USER_TYPE_MAP`. An admin with `access_flags: ["artist"]` won't appear for TATTOO appointments because their `role` is `"admin"`, not `"artist"`. The same issue applies to `editAppointment.tsx` if it uses similar filtering.

**Files:**
- Modify: `components/appointments/WalkinAppointmentModal.tsx:34-39` (USER_TYPE_MAP)
- Modify: `components/appointments/WalkinAppointmentModal.tsx:128-131` (filter logic)

**Step 1: Update the filtering logic to also check access_flags for hybrid admins**

Replace lines 128-131:
```tsx
// Filter staff by appointment type
const filteredStaff = useMemo(() => {
    if (!type) return staff
    const allowedTypes = USER_TYPE_MAP[type]
    return staff.filter((s) => allowedTypes.includes(s.role))
}, [staff, type])
```

With:
```tsx
// Filter staff by appointment type (includes admins with hybrid capabilities)
const filteredStaff = useMemo(() => {
    if (!type) return staff
    const allowedTypes = USER_TYPE_MAP[type]
    return staff.filter((s) => {
        if (allowedTypes.includes(s.role)) return true
        // Include admins with hybrid capabilities matching the appointment type
        if (s.role === "admin" && s.access_flags) {
            if (type === "TATTOO" && s.access_flags.includes("artist")) return true
            if (type === "PIERCING" && s.access_flags.includes("piercing")) return true
            if (type === "SHOE" && s.access_flags.includes("shoe")) return true
        }
        return false
    })
}, [staff, type])
```

**Step 2: Run lint to verify**

Run: `bun run lint`
Expected: No errors

**Step 3: Verify manually**

- Open the Walk-in Appointment modal
- Select appointment type "TATTOO"
- Verify that admin users with `access_flags` containing `artist` now appear in the staff dropdown
- Select appointment type "PIERCING"
- Verify that admin users with `access_flags` containing `piercing` now appear
- Select appointment type "SHOE"
- Verify that admin users with `access_flags` containing `shoe` now appear
- Verify that regular admins (no hybrid flags) do NOT appear for any specific type
- Verify that artists/piercers/shoe_tech users still appear correctly

**Step 4: Commit**

```bash
git add components/appointments/WalkinAppointmentModal.tsx
git commit -m "fix(appointments): include admins with hybrid capabilities in walk-in staff filtering"
```

---

## Task 5: Show Appointment-Specific Fields for Hybrid Admins in editAppointment

**Problem:** In `components/appointments/editAppointment.tsx`, three fields are hidden from admin users via `userInfo.role !== "admin"` checks:
- Line 1184: Artist Prep-Time (for TATTOO appointments)
- Line 1837: Shoe Dates (for SHOE appointments)
- Line 2264: Piercing Aftercare (for PIERCING appointments)

Admins with hybrid capabilities (`access_flags` includes `artist`, `piercing`, or `shoe`) should see the relevant field for their capability.

**Files:**
- Modify: `components/appointments/editAppointment.tsx:1184`
- Modify: `components/appointments/editAppointment.tsx:1837`
- Modify: `components/appointments/editAppointment.tsx:2264`

**Step 1: Fix the Artist Prep-Time field (line 1184)**

Replace:
```tsx
{userInfo.role && userInfo.role !== "admin" && (
```

With:
```tsx
{userInfo.role && (userInfo.role !== "admin" || userInfo.access_flags?.includes("artist")) && (
```

**Step 2: Fix the Shoe Dates field (line 1837)**

Replace:
```tsx
{userInfo.role && userInfo.role !== "admin" && (
```

With:
```tsx
{userInfo.role && (userInfo.role !== "admin" || userInfo.access_flags?.includes("shoe")) && (
```

**Step 3: Fix the Piercing Aftercare field (line 2264)**

Replace:
```tsx
{userInfo.role && userInfo.role !== "admin" && (
```

With:
```tsx
{userInfo.role && (userInfo.role !== "admin" || userInfo.access_flags?.includes("piercing")) && (
```

**Step 4: Run lint to verify**

Run: `bun run lint`
Expected: No errors

**Step 5: Verify manually**

- Log in as an admin with `access_flags: ["artist"]`
- Create/edit a TATTOO appointment
- Verify the "Artist Prep-Time" field is visible
- Create/edit a PIERCING appointment
- Verify the "Piercing Aftercare" field is NOT visible (admin doesn't have `piercing` flag)
- Log in as a regular admin (no hybrid flags)
- Verify none of these extra fields appear
- Log in as an artist user
- Verify the Artist Prep-Time field still appears

**Step 6: Commit**

```bash
git add components/appointments/editAppointment.tsx
git commit -m "fix(appointments): show appointment-specific fields for admins with hybrid capabilities"
```

---

## Verification: Full Lint Check

After all tasks are complete, run the full lint check:

```bash
bun run lint
```

Expected: No errors or warnings. If any issues arise, fix them before the final commit.

---

## Summary of Changes

| Task | File | Change |
|------|------|--------|
| 1 | `components/accounts/UserRow.tsx:138-157` | Show "NONE" badge for hybrid admins without artist_level |
| 2 | `server/actions/profile.ts:45-46` | Fix Zod enum values for artist_level and payout_period |
| 3 | `app/accounts/[id]/page.tsx:551-554` | Show ScheduleEditor for hybrid admins |
| 4 | `components/appointments/WalkinAppointmentModal.tsx:128-131` | Include hybrid admins in staff filtering |
| 5 | `components/appointments/editAppointment.tsx:1184,1837,2264` | Show appointment fields for hybrid admins |

## Additional Suggestions (Out of Scope)

These were identified during analysis but are not part of this plan. Consider addressing separately:

1. **Shared helper for hybrid capability checks** — The pattern `access_flags?.includes("artist")` is repeated across multiple files. Extract a utility like `hasHybridCapability(user, capability)` in `utils/auth/permissions.ts` for consistency.

2. **Middleware access_flags support** — `middleware.ts:46` has a TODO comment noting that `access_flags` checking is not yet implemented. This means non-admin roles with special permissions may be blocked from accessing routes they should have access to.

3. **Sales staff assignment filtering** — Per the existing plan `docs/plans/2026-04-10-sales-roles-inventory-audit.md`, hybrid admin capabilities are not consulted when filtering staff for sales assignments. Same pattern as Tasks 4-5.

4. **Role type for hybrid capabilities** — Consider extending `UserRoleType` to include a `"hybrid"` or compound role, or adding a `capabilities` field separate from `access_flags` to make the hybrid concept more explicit in the type system.
