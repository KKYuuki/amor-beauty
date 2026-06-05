# Settings Seed & Config Page Audit — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the seed script to align with the `system_settings` Drizzle schema, and audit/fix the Settings page and all settings consumers to work correctly with the canonical schema.

**Architecture:** Replace all raw SQL in the seed script with Drizzle ORM queries against `systemSettings`. Fix the public `/api/public/hours` route that references a non-existent setting key. Add missing setting keys (`appointment_notifications`, `accounting_period_lock`) to the config page's state hydration. Implement the stubbed `getSettingsByCategory` server action. Clean up the Drizzle migration snapshot to remove the phantom `settings` table.

**Tech Stack:** Next.js 15, Drizzle ORM, PostgreSQL, TypeScript, React 19

---

## Problem Summary

| # | Severity | Location | Bug |
|---|----------|----------|-----|
| 1 | CRITICAL | `scripts/seed-database.ts` | Uses raw SQL to `CREATE TABLE IF NOT EXISTS "settings"` (old name) instead of Drizzle's `system_settings`. This creates a phantom table that breaks `drizzle-kit push` with a "column id is in a primary key" error. |
| 2 | CRITICAL | `scripts/seed-database.ts` | Raw SQL `INSERT INTO settings` writes to the wrong table. App reads from `system_settings`. |
| 3 | CRITICAL | `scripts/seed-database.ts` | Seed `DEFAULT_SETTINGS` has `booking_constraints` but this key is NOT in the type `SettingKey`. It also lacks `accounting_period_lock` which IS in `SettingKey`. |
| 4 | CRITICAL | `scripts/seed-database.ts` | `DEFAULT_SETTINGS` uses `₱` for currency but types file uses `$`. |
| 5 | HIGH | `app/api/public/hours/route.ts` | Searches for key `'operating_hours'` but the actual key is `'business_hours'`. API always returns `{}`. |
| 6 | MEDIUM | `app/config/configPage.tsx` | `fetchSettings` switch statement doesn't handle `appointment_notifications` or `accounting_period_lock`. These settings load from DB but never populate local state. |
| 7 | MEDIUM | `server/actions/settings.ts` | `getSettingsByCategory()` is a stub returning `success(null)`. |
| 8 | LOW | `app/config/configPage.tsx:230` | Uses `console.error` instead of `createLogs()` per project guidelines. |
| 9 | LOW | `drizzle/meta/0000_snapshot.json` | Contains stale `settings` table definition (old schema) alongside `system_settings` (new schema). |

---

## Task 1: Rewrite Seed Script to Use Drizzle ORM

**Files:**
- Modify: `scripts/seed-database.ts`

**Step 1: Replace the entire file with Drizzle ORM version**

Replace the file content with a version that:
- Removes `createSettingsTable()` entirely (no raw SQL `CREATE TABLE`)
- Removes `seedSettings()` raw SQL function
- Imports `eq` from `drizzle-orm` and `systemSettings` from `../server/db/schema/settings`
- Uses Drizzle's `db.select().from(systemSettings).where(eq(systemSettings.key, key))` for upsert checks
- Uses `db.insert(systemSettings).values(...)` for inserts
- Synchronizes `DEFAULT_SETTINGS` with `utils/types/settings.ts` (adds `accounting_period_lock`, removes `booking_constraints`)
- Aligns currency default to `$` (matching types file)
- Removes the duplicate inline `DEFAULT_SETTINGS` in `main()` — use the single `DEFAULT_SETTINGS` array for both `main()` and `seedDatabase()` paths

The updated `DEFAULT_SETTINGS` should match `utils/types/settings.ts` exactly:

```typescript
const DEFAULT_SETTINGS: { key: SettingKey; value: unknown; category: SettingCategory; label: string; description: string }[] = [
    { key: 'restock_recipients', value: { user_ids: [] }, category: 'Notifications', label: 'Restock Alert Recipients', description: 'Users who will receive emails when inventory is low.' },
    { key: 'appointment_notifications', value: { mode: 'all_admins' }, category: 'Notifications', label: 'Appointment Notification Recipients', description: 'Who gets notified for new appointment bookings.' },
    { key: 'daily_summary', value: { enabled: false, recipients: [] }, category: 'Notifications', label: 'Daily Summary Email', description: 'Send a daily email with today\'s appointments and low stock items.' },
    { key: 'business_hours', value: { monday: { open: '09:00', close: '18:00', closed: false }, tuesday: { open: '09:00', close: '18:00', closed: false }, wednesday: { open: '09:00', close: '18:00', closed: false }, thursday: { open: '09:00', close: '18:00', closed: false }, friday: { open: '09:00', close: '18:00', closed: false }, saturday: { open: '10:00', close: '16:00', closed: false }, sunday: { open: '10:00', close: '16:00', closed: true } }, category: 'Business', label: 'Operating Hours', description: 'Set the studio\'s operating hours for each day of the week.' },
    { key: 'currency_tax', value: { currency_symbol: '$', tax_rate: 0.12, tax_enabled: true, tax_inclusive: true }, category: 'Business', label: 'Currency & Tax', description: 'Default currency and tax rate for transactions.' },
    { key: 'maintenance_mode', value: { enabled: false, message: 'System is under maintenance. Please check back later.' }, category: 'System', label: 'Maintenance Mode', description: 'Prevent non-admin users from accessing the system.' },
    { key: 'log_retention', value: { days: 90 }, category: 'System', label: 'Log Retention Period', description: 'Number of days to keep system logs before auto-deletion.' },
    { key: 'accounting_period_lock', value: { locked_until: null, locked_by: null }, category: 'System', label: 'Accounting Period Lock', description: 'Lock accounting entries up to a specific date to prevent modifications.' },
]
```

The `seedSettings` function becomes:

```typescript
async function seedSettings() {
    for (const setting of DEFAULT_SETTINGS) {
        const existing = await db
            .select({ key: systemSettings.key })
            .from(systemSettings)
            .where(eq(systemSettings.key, setting.key))
            .limit(1)

        if (existing.length > 0) {
            console.log(`   ⏭️  ${setting.key} already exists, skipping`)
            continue
        }

        await db.insert(systemSettings).values({
            key: setting.key,
            value: setting.value,
            category: setting.category,
            label: setting.label,
            description: setting.description,
        })

        console.log(`   ✅ ${setting.label}`)
    }
}
```

The `seedDatabase()` export also removes `createSettingsTable()` call and just calls `seedSettings()`:

```typescript
export async function seedDatabase(): Promise<SeedResult> {
    try {
        await seedSettings()
        await seedPayrollRates()
        await seedAccountingCategories()
        return { success: true }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unexpected error occurred',
        }
    }
}
```

**Step 2: Verify lint passes**

Run: `bun run lint`
Expected: No errors in `scripts/seed-database.ts`

**Step 3: Commit**

```bash
git add scripts/seed-database.ts
git commit -m "fix(seed): replace raw SQL with Drizzle ORM, remove phantom settings table"
```

---

## Task 2: Fix Public Hours API Route

**Files:**
- Modify: `app/api/public/hours/route.ts`

**Step 1: Fix the setting key from `operating_hours` to `business_hours`**

On line 27, change:

```typescript
const hoursSetting = result.data.settings.find((s: { key: string }) => s.key === 'operating_hours')
```

to:

```typescript
const hoursSetting = result.data.settings.find((s: { key: string }) => s.key === 'business_hours')
```

**Step 2: Simplify — use `getSetting` instead of fetching all settings**

Replace the entire `GET` handler body with a more efficient version that uses the already-existing `getSetting('business_hours')` action:

```typescript
import { NextResponse } from 'next/server'
import { getSetting } from '@/server/actions/settings'
import { rateLimit } from '@/utils/rate-limit'

export async function GET() {
    const rateLimitResult = await rateLimit({
        windowMs: 60 * 1000,
        maxRequests: 100,
        key: 'public-hours',
    })

    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: 'Too Many Requests' },
            { status: 429, headers: { 'X-RateLimit-Remaining': '0' } },
        )
    }

    try {
        const result = await getSetting('business_hours')
        if (!result.success) {
            return NextResponse.json(
                { error: 'Failed to fetch hours settings' },
                { status: 500 },
            )
        }
        return NextResponse.json(
            { hours: result.data || {} },
            { headers: { 'X-RateLimit-Remaining': String(rateLimitResult.remaining) } },
        )
    } catch (_error) {
        return NextResponse.json(
            { error: 'Failed to fetch hours settings' },
            { status: 500 },
        )
    }
}
```

**Step 3: Verify lint passes**

Run: `bun run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add app/api/public/hours/route.ts
git commit -m "fix(api): correct business_hours key in public hours endpoint"
```

---

## Task 3: Add Missing Setting Keys to Config Page

**Files:**
- Modify: `app/config/configPage.tsx`

**Step 1: Add state variables for missing settings**

After the existing `logRetention` state (around line 161), add:

```typescript
const [appointmentNotifications, setAppointmentNotifications] =
    useState<AppointmentNotificationsValue>({ mode: 'all_admins' })
```

Add the import for `AppointmentNotificationsValue` at the top (it's already in the import block from `@/utils/types/settings` — verify it's imported, and add if missing).

**Step 2: Add `appointment_notifications` case to both switch statements**

In the `fetchSettings` callback, add a case in both the main settings `forEach` (line ~172) and the initialization `forEach` (line ~204):

```typescript
case "appointment_notifications":
    setAppointmentNotifications(setting.value as AppointmentNotificationsValue)
    break
```

**Step 3: Verify lint passes**

Run: `bun run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add app/config/configPage.tsx
git commit -m "fix(config): add appointment_notifications to settings state hydration"
```

---

## Task 4: Implement `getSettingsByCategory` Server Action

**Files:**
- Modify: `server/actions/settings.ts`

**Step 1: Replace the stub with a real implementation**

Replace lines 194-196:

```typescript
export async function getSettingsByCategory(_category: string): Promise<ActionResponse<null>> {
    return success(null)
}
```

With:

```typescript
export async function getSettingsByCategory(category: SettingCategory): Promise<ActionResponse<GetSettingsResult>> {
    try {
        const settings = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.category, category))
            .orderBy(asc(systemSettings.key))

        const mappedSettings: SystemSetting[] = settings.map(setting => ({
            key: setting.key,
            value: setting.value,
            category: setting.category as SystemSetting['category'],
            label: setting.label,
            description: setting.description,
            updated_at: setting.updatedAt.toISOString(),
            updated_by: setting.updatedBy || '',
        }))

        return success({ settings: mappedSettings })
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to fetch settings by category: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch settings by category')
    }
}
```

**Step 2: Verify lint passes**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add server/actions/settings.ts
git commit -m "feat(settings): implement getSettingsByCategory server action"
```

---

## Task 5: Replace `console.error` with `createLogs` in Config Page

**Files:**
- Modify: `app/config/configPage.tsx`

**Step 1: Replace `console.error` with proper logging**

On line 230, change:

```typescript
console.error("Error fetching settings:", error)
```

to:

```typescript
// Error is already handled by adding notification below
```

The `addNotification("Failed to load settings", "ERROR")` on the next line already handles user feedback. The `console.error` is redundant and violates project guidelines. Simply remove the `console.error` line.

**Step 2: Verify lint passes**

Run: `bun run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add app/config/configPage.tsx
git commit -m "fix(config): remove console.error in favor of notification-based error handling"
```

---

## Task 6: Regenerate Drizzle Migration Snapshot

**Files:**
- Delete: `drizzle/` directory (contains stale `settings` table reference)
- Regenerate via: `bun drizzle-kit generate`

**Step 1: Delete stale migration files**

```bash
rm -rf drizzle/
```

**Step 2: Regenerate migration from current schema**

```bash
bun drizzle-kit generate
```

Expected: A new migration SQL file and snapshot JSON that contain only `system_settings` (no `settings` table).

**Step 3: Verify the new snapshot**

Open `drizzle/meta/0000_snapshot.json` and confirm:
- No `public.settings` table exists
- `public.system_settings` table exists with columns: `id`, `created_at`, `updated_at`, `key`, `value`, `category`, `label`, `description`, `updated_by`

**Step 4: Push to clean database**

First, drop any phantom `settings` table from the database (if it exists), then push:

```bash
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS settings CASCADE;" 2>/dev/null || true
bun db:push
```

Or, if resetting the DB entirely is acceptable:

```bash
# Reset the public schema and push fresh
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
bun db:push
```

Then run the seed:

```bash
bun run seed
```

**Step 5: Verify**

Run `bun db:push` again. Expected: no "data-loss statements" warning, no `settings` table mention, clean push.

**Step 6: Commit**

```bash
git add drizzle/
git commit -m "chore(drizzle): regenerate migration snapshot without phantom settings table"
```

---

## Task 7: Verify End-to-End Settings Flow

**Files:** No file changes — verification only.

**Step 1: Run the dev server**

```bash
bun run dev
```

**Step 2: Verify settings page loads**

- Navigate to `/config`
- Confirm all settings categories render (Notifications, Business, System)
- Confirm `appointment_notifications` setting is visible with its default value (`all_admins`)
- Confirm `business_hours` shows operating hours
- Confirm `currency_tax` shows currency symbol

**Step 3: Verify public hours API**

```bash
curl http://localhost:3000/api/public/hours
```

Expected: Returns JSON with `hours` object containing `monday`, `tuesday`, etc. — not an empty `{}`.

**Step 4: Verify seed script is idempotent**

```bash
bun run seed
```

Run it twice. Expected: Second run shows "already exists, skipping" for each setting, no errors, no `settings` table created.

**Step 5: Verify `drizzle-kit push` is clean**

```bash
bun db:push
```

Expected: No data-loss warnings, no `settings` table mentioned, clean push.

---

## Summary of Changes

| Task | File | Change |
|------|------|--------|
| 1 | `scripts/seed-database.ts` | Full rewrite: remove raw SQL, use Drizzle ORM, sync DEFAULT_SETTINGS with types, remove `createSettingsTable()` |
| 2 | `app/api/public/hours/route.ts` | Fix `'operating_hours'` → `'business_hours'`, simplify with `getSetting()` |
| 3 | `app/config/configPage.tsx` | Add `appointment_notifications` state + switch case |
| 4 | `server/actions/settings.ts` | Implement `getSettingsByCategory()` |
| 5 | `app/config/configPage.tsx` | Remove `console.error`, keep notification |
| 6 | `drizzle/` | Regenerate snapshot without `settings` table |
| 7 | — | End-to-end verification |