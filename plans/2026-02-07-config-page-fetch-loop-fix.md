# Config Page Fetch Loop Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the infinite fetch loop on the /config page caused by unimplemented settings server actions and recursive function calls.

**Architecture:** The settings server actions (`getSettings`, `initializeSettings`) are stub functions returning null/false. The `fetchSettings()` function recursively calls itself when settings are empty, creating an infinite loop. We need to implement the actual database operations and add proper loop guards.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase (PostgreSQL), Drizzle ORM

---

## Root Cause Analysis

### Critical Issue: Infinite Recursive Loop

**Location:** `app/config/configPage.tsx:133-176`

```typescript
const fetchSettings = useCallback(async () => {
    setLoading(true)
    const data = await getSettings()
    if (data && data.length > 0) {
        // ... populate settings
    } else {
        // Initialize settings if empty
        await initializeSettings(userInfo.id)
        await fetchSettings()  // <-- RECURSIVE CALL CAUSING INFINITE LOOP!
    }
    setLoading(false)
}, [userInfo.id])
```

**Why it loops:**
1. `getSettings()` returns `null` (stub function at `app/api/actions/settings.ts:16-18`)
2. Condition `data && data.length > 0` fails
3. `initializeSettings()` returns `false` (stub function at `app/api/actions/settings.ts:34-36`)
4. `fetchSettings()` calls itself recursively with no exit condition
5. Repeat infinitely

---

## Task 1: Implement `getSettings` Server Action

**Files:**
- Modify: `app/api/actions/settings.ts:16-18`
- Reference: `utils/types/settings.ts` (for types)
- Reference: Database schema for `system_settings` table

**Step 1: Check if settings table exists in schema**

Run: `bunx drizzle-kit introspect`
Or check: `drizzle/schema.ts` for existing table definitions

**Step 2: Create settings table if needed**

If the table doesn't exist, create a migration. The table should have:
- `id` (uuid, primary key)
- `key` (text, unique) - setting key like "business_hours"
- `value` (jsonb) - the setting value as JSON
- `category` (text) - "Notifications", "Business", "System"
- `created_at` (timestamp)
- `updated_at` (timestamp)
- `updated_by` (uuid, references users)

**Step 3: Implement getSettings function**

Replace the stub with actual database query:

```typescript
export async function getSettings(): Promise<SystemSetting[] | null> {
    const db = createDrizzleClient()
    
    try {
        const settings = await db
            .select()
            .from(systemSettings)
            .orderBy(systemSettings.key)
        
        return settings.length > 0 ? settings : null
    } catch (error) {
        console.error("Error fetching settings:", error)
        return null
    }
}
```

**Step 4: Run build to verify no TypeScript errors**

Run: `bun run build`
Expected: No errors related to settings.ts

**Step 5: Commit**

```bash
git add app/api/actions/settings.ts
git commit -m "feat(settings): implement getSettings server action"
```

---

## Task 2: Implement `initializeSettings` Server Action

**Files:**
- Modify: `app/api/actions/settings.ts:34-36`
- Reference: `utils/types/settings.ts` for `DEFAULT_SETTINGS`

**Step 1: Review DEFAULT_SETTINGS structure**

Check `utils/types/settings.ts` for the default values that should be inserted.

**Step 2: Implement initializeSettings function**

```typescript
export async function initializeSettings(user_id: string): Promise<boolean> {
    const db = createDrizzleClient()
    
    try {
        // Check if settings already exist
        const existing = await db.select().from(systemSettings).limit(1)
        if (existing.length > 0) {
            return true // Already initialized
        }
        
        // Insert default settings
        const settingsToInsert = DEFAULT_SETTINGS.map(setting => ({
            id: crypto.randomUUID(),
            key: setting.key,
            value: setting.default_value,
            category: setting.category,
            created_at: new Date(),
            updated_at: new Date(),
            updated_by: user_id,
        }))
        
        await db.insert(systemSettings).values(settingsToInsert)
        return true
    } catch (error) {
        console.error("Error initializing settings:", error)
        return false
    }
}
```

**Step 3: Run build to verify**

Run: `bun run build`
Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add app/api/actions/settings.ts
git commit -m "feat(settings): implement initializeSettings server action"
```

---

## Task 3: Implement `updateSetting` Server Action

**Files:**
- Modify: `app/api/actions/settings.ts:26-32`

**Step 1: Implement updateSetting function**

```typescript
export async function updateSetting<K extends SettingKey>(
    key: K,
    value: SettingValueMap[K],
    user_id: string
): Promise<boolean> {
    const db = createDrizzleClient()
    
    try {
        const result = await db
            .update(systemSettings)
            .set({
                value: value,
                updated_at: new Date(),
                updated_by: user_id,
            })
            .where(eq(systemSettings.key, key))
        
        return result.rowCount > 0
    } catch (error) {
        console.error("Error updating setting:", error)
        return false
    }
}
```

**Step 2: Run build to verify**

Run: `bun run build`
Expected: No TypeScript errors

**Step 3: Commit**

```bash
git add app/api/actions/settings.ts
git commit -m "feat(settings): implement updateSetting server action"
```

---

## Task 4: Fix Recursive Loop in `fetchSettings`

**Files:**
- Modify: `app/config/configPage.tsx:170-174`

**Step 1: Remove recursive call and add proper error handling**

Replace lines 170-174:

```typescript
// BEFORE (problematic code):
} else {
    // Initialize settings if empty
    await initializeSettings(userInfo.id)
    await fetchSettings()
}

// AFTER (fixed code):
} else {
    // Initialize settings if empty
    const initialized = await initializeSettings(userInfo.id)
    if (initialized) {
        // Fetch the newly initialized settings (non-recursive)
        const newData = await getSettings()
        if (newData && newData.length > 0) {
            newData.forEach((setting) => {
                switch (setting.key) {
                    case "restock_recipients":
                        setRestockRecipients(setting.value as RestockRecipientsValue)
                        break
                    case "daily_summary":
                        setDailySummary(setting.value as DailySummaryValue)
                        break
                    case "business_hours":
                        setBusinessHours(setting.value as BusinessHoursValue)
                        break
                    case "booking_constraints":
                        setBookingConstraints(setting.value as BookingConstraintsValue)
                        break
                    case "currency_tax":
                        setCurrencyTax(setting.value as CurrencyTaxValue)
                        break
                    case "maintenance_mode":
                        setMaintenanceMode(setting.value as MaintenanceModeValue)
                        break
                    case "log_retention":
                        setLogRetention(setting.value as LogRetentionValue)
                        break
                }
            })
        }
    }
}
```

**Step 2: Run build to verify**

Run: `bun run build`
Expected: No TypeScript errors

**Step 3: Test manually**

Run: `bun run dev`
Navigate to `/config` and verify:
- No infinite network requests
- Loading state resolves
- Settings display correctly (or show defaults)

**Step 4: Commit**

```bash
git add app/config/configPage.tsx
git commit -m "fix(config): remove recursive fetchSettings call to prevent infinite loop"
```

---

## Task 5: Refactor to DRY Pattern (Optional Improvement)

**Files:**
- Modify: `app/config/configPage.tsx`

**Step 1: Extract settings population into helper function**

Create a helper function to avoid code duplication:

```typescript
const populateSettingsFromData = useCallback((data: SystemSetting[]) => {
    data.forEach((setting) => {
        switch (setting.key) {
            case "restock_recipients":
                setRestockRecipients(setting.value as RestockRecipientsValue)
                break
            case "daily_summary":
                setDailySummary(setting.value as DailySummaryValue)
                break
            case "business_hours":
                setBusinessHours(setting.value as BusinessHoursValue)
                break
            case "booking_constraints":
                setBookingConstraints(setting.value as BookingConstraintsValue)
                break
            case "currency_tax":
                setCurrencyTax(setting.value as CurrencyTaxValue)
                break
            case "maintenance_mode":
                setMaintenanceMode(setting.value as MaintenanceModeValue)
                break
            case "log_retention":
                setLogRetention(setting.value as LogRetentionValue)
                break
        }
    })
}, [])
```

**Step 2: Use helper in fetchSettings**

```typescript
const fetchSettings = useCallback(async () => {
    setLoading(true)
    const data = await getSettings()
    if (data && data.length > 0) {
        populateSettingsFromData(data)
    } else {
        const initialized = await initializeSettings(userInfo.id)
        if (initialized) {
            const newData = await getSettings()
            if (newData && newData.length > 0) {
                populateSettingsFromData(newData)
            }
        }
    }
    setLoading(false)
}, [userInfo.id, populateSettingsFromData])
```

**Step 3: Run build to verify**

Run: `bun run build`
Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add app/config/configPage.tsx
git commit -m "refactor(config): extract settings population to helper function"
```

---

## Task 6: Implement `getSetting` and `getSettingsByCategory` (Complete API)

**Files:**
- Modify: `app/api/actions/settings.ts:20-40`

**Step 1: Implement getSetting**

```typescript
export async function getSetting<K extends SettingKey>(
    key: K
): Promise<SettingValueMap[K] | null> {
    const db = createDrizzleClient()
    
    try {
        const [setting] = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.key, key))
            .limit(1)
        
        return setting ? (setting.value as SettingValueMap[K]) : null
    } catch (error) {
        console.error("Error fetching setting:", error)
        return null
    }
}
```

**Step 2: Implement getSettingsByCategory**

```typescript
export async function getSettingsByCategory(category: string) {
    const db = createDrizzleClient()
    
    try {
        const settings = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.category, category))
        
        return settings.length > 0 ? settings : null
    } catch (error) {
        console.error("Error fetching settings by category:", error)
        return null
    }
}
```

**Step 3: Run build to verify**

Run: `bun run build`
Expected: No TypeScript errors

**Step 4: Commit**

```bash
git add app/api/actions/settings.ts
git commit -m "feat(settings): implement getSetting and getSettingsByCategory"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `bun run build` completes without errors
- [ ] `bun run lint` passes
- [ ] `/config` page loads without infinite loops
- [ ] Network tab shows single fetch request (not rapid repeated calls)
- [ ] Settings are persisted to database
- [ ] Settings are retrieved on page load
- [ ] Saving settings works correctly

---

## Summary of Files Changed

| File | Changes |
|------|---------|
| `app/api/actions/settings.ts` | Implement all stub functions with real database operations |
| `app/config/configPage.tsx` | Remove recursive call, add proper error handling |
| `drizzle/schema.ts` | Add system_settings table (if not exists) |
| `drizzle/migrations/*` | New migration for settings table (if needed) |

---

## Notes

- The `// TODO: Migrate to Drizzle in Task 7` comment in settings.ts suggests this was planned but not completed
- Check if there's an existing Supabase `system_settings` table that needs to be accessed differently
- The fix in Task 4 is the immediate solution; Tasks 1-3 and 5-6 complete the full implementation
