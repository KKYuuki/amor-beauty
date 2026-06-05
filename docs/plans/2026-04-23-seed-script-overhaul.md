# Seed Script Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate 4 fragmented seed scripts into one unified, FK-correct seed script that seeds all required tables in dependency order, and fix all build/lint errors.

**Architecture:** Replace the scattered seed-database.ts + 3 standalone scripts with a single authoritative `scripts/seed-database.ts` that seeds in FK-safe order: rate_levels → branches → settings → accounting_categories → payroll_staff_rates → services → inventory. Deprecate old standalone scripts by making them re-export from the unified script. Fix broken payroll-schemas imports and lint issues as the final phase.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, Bun runtime, Next.js 15

---

## Task 1: Write the unified seed data constants

**Files:**
- Modify: `scripts/seed-database.ts` (complete rewrite)

**Step 1: Replace DEFAULT_PAYROLL_RATES with rateLevelId-aware constants**

The old rates use "Normal Artist"/"Head Artist"/"Owner" naming but lack `rateLevelId`. Replace with level-slug-based templates that resolve FK at seed time.

```typescript
const RATE_LEVELS = [
    { name: 'Standard', slug: 'standard', sortOrder: 0, isActive: true },
    { name: 'Senior', slug: 'senior', sortOrder: 1, isActive: true },
    { name: 'Owner', slug: 'owner', sortOrder: 2, isActive: true },
]

const DEFAULT_BRANCHES = [
    { name: 'Main Studio', code: 'MAIN', city: 'Cebu City', address: '123 Main Street', phone: '+63 32 123 4567', isActive: true },
]

const DEFAULT_PAYROLL_RATE_TEMPLATES = [
    { rateName: 'Tattoo - Walk-in - Standard', serviceType: 'TATTOO', clientType: 'WALKIN', levelSlug: 'standard', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Tattoo - Walk-in - Senior', serviceType: 'TATTOO', clientType: 'WALKIN', levelSlug: 'senior', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Tattoo - Walk-in - Owner', serviceType: 'TATTOO', clientType: 'WALKIN', levelSlug: 'owner', shopPercentage: '30.00', staffPercentage: '70.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Tattoo - Personal - Standard', serviceType: 'TATTOO', clientType: 'PERSONAL', levelSlug: 'standard', shopPercentage: '60.00', staffPercentage: '40.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Tattoo - Personal - Senior', serviceType: 'TATTOO', clientType: 'PERSONAL', levelSlug: 'senior', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Tattoo - Personal - Owner', serviceType: 'TATTOO', clientType: 'PERSONAL', levelSlug: 'owner', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Piercing - Walk-in - Standard', serviceType: 'PIERCING', clientType: 'WALKIN', levelSlug: 'standard', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Piercing - Walk-in - Senior', serviceType: 'PIERCING', clientType: 'WALKIN', levelSlug: 'senior', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Piercing - Walk-in - Owner', serviceType: 'PIERCING', clientType: 'WALKIN', levelSlug: 'owner', shopPercentage: '30.00', staffPercentage: '70.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Piercing - Personal - Standard', serviceType: 'PIERCING', clientType: 'PERSONAL', levelSlug: 'standard', shopPercentage: '60.00', staffPercentage: '40.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Piercing - Personal - Senior', serviceType: 'PIERCING', clientType: 'PERSONAL', levelSlug: 'senior', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Piercing - Personal - Owner', serviceType: 'PIERCING', clientType: 'PERSONAL', levelSlug: 'owner', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Shoe - Walk-in - Standard', serviceType: 'SHOE', clientType: 'WALKIN', levelSlug: 'standard', shopPercentage: '60.00', staffPercentage: '40.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Shoe - Walk-in - Senior', serviceType: 'SHOE', clientType: 'WALKIN', levelSlug: 'senior', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Shoe - Walk-in - Owner', serviceType: 'SHOE', clientType: 'WALKIN', levelSlug: 'owner', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Shoe - Personal - Standard', serviceType: 'SHOE', clientType: 'PERSONAL', levelSlug: 'standard', shopPercentage: '60.00', staffPercentage: '40.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Shoe - Personal - Senior', serviceType: 'SHOE', clientType: 'PERSONAL', levelSlug: 'senior', shopPercentage: '50.00', staffPercentage: '50.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
    { rateName: 'Shoe - Personal - Owner', serviceType: 'SHOE', clientType: 'PERSONAL', levelSlug: 'owner', shopPercentage: '40.00', staffPercentage: '60.00', paymentMode: 'PERCENTAGE', fixedAmount: '0.00', isActive: true },
]

const DEFAULT_ACCOUNTING_CATEGORIES = [
    { name: 'Tattoo Services', type: 'REVENUE', isActive: true },
    { name: 'Piercing Services', type: 'REVENUE', isActive: true },
    { name: 'Shoe Services', type: 'REVENUE', isActive: true },
    { name: 'Product Sales', type: 'REVENUE', isActive: true },
    { name: 'Gift Cards', type: 'REVENUE', isActive: true },
    { name: 'Tips', type: 'REVENUE', isActive: true },
    { name: 'Inventory Purchase', type: 'EXPENSE', isActive: true },
    { name: 'Rent', type: 'EXPENSE', isActive: true },
    { name: 'Utilities', type: 'EXPENSE', isActive: true },
    { name: 'Marketing', type: 'EXPENSE', isActive: true },
    { name: 'Equipment', type: 'EXPENSE', isActive: true },
    { name: 'Supplies', type: 'EXPENSE', isActive: true },
    { name: 'Staff Payroll', type: 'EXPENSE', isActive: true },
    { name: 'Maintenance', type: 'EXPENSE', isActive: true },
    { name: 'Insurance', type: 'EXPENSE', isActive: true },
    { name: 'Refunds', type: 'EXPENSE', isActive: true },
    { name: 'Voided Sales', type: 'EXPENSE', isActive: true },
    { name: 'Taxes', type: 'EXPENSE', isActive: true },
    { name: 'Equipment', type: 'ASSET', isActive: true },
    { name: 'Inventory', type: 'ASSET', isActive: true },
    { name: 'Cash', type: 'ASSET', isActive: true },
    { name: 'Bank', type: 'ASSET', isActive: true },
    { name: 'Accounts Receivable', type: 'ASSET', isActive: true },
    { name: 'Accounts Payable', type: 'LIABILITY', isActive: true },
    { name: 'Gift Card Liability', type: 'LIABILITY', isActive: true },
    { name: 'Tax Payable', type: 'LIABILITY', isActive: true },
    { name: 'Loans', type: 'LIABILITY', isActive: true },
    { name: 'Owner Equity', type: 'EQUITY', isActive: true },
    { name: 'Retained Earnings', type: 'EQUITY', isActive: true },
]

const DEFAULT_SERVICES = [
    { title: 'Tattoo', price: '0', pricingType: 'HOURLY', hourlyRate: '0', serviceType: 'TATTOO', isActive: true, isShared: true },
    { title: 'Piercing', price: '0', pricingType: 'FIXED', hourlyRate: null, serviceType: 'PIERCING', isActive: true, isShared: true },
    { title: 'Shoe Cleaning', price: '0', pricingType: 'FIXED', hourlyRate: null, serviceType: 'SHOE', isActive: true, isShared: true },
    { title: 'Other', price: '0', pricingType: 'FIXED', hourlyRate: null, serviceType: 'OTHER', isActive: true, isShared: true },
]
```

**Step 2: Verify constants compile**

Run: `bun run typecheck 2>&1 | head -20`
Expected: No type errors related to seed data constants (other existing errors may still appear)

**Step 3: Commit**

```bash
git add scripts/seed-database.ts
git commit -m "refactor(seeds): replace outdated payroll rate constants with rateLevelId-aware templates"
```

---

## Task 2: Write the unified seed functions with FK-safe ordering

**Files:**
- Modify: `scripts/seed-database.ts`

**Step 1: Rewrite seed functions in dependency order**

Add imports for all required schema tables and implement seed functions:

```typescript
import { db } from '../server/db/index'
import { eq, and } from 'drizzle-orm'
import { rateLevels } from '../server/db/schema/rate-levels'
import { branches } from '../server/db/schema/branches'
import { systemSettings } from '../server/db/schema/settings'
import { accountingCategory } from '../server/db/schema/accounting'
import { payrollStaffRate } from '../server/db/schema/payroll'
import { services } from '../server/db/schema/services'
import { DEFAULT_SETTINGS, type SettingKey, type SettingCategory } from '../utils/types/settings'
import { config } from 'dotenv'

config({ path: '.env.local' })

// ... constants from Task 1 ...

export interface SeedResult {
    success: boolean
    error?: string
    stats?: { seeded: number; skipped: number }
}

async function seedRateLevels() {
    let seeded = 0, skipped = 0
    for (const level of RATE_LEVELS) {
        const existing = await db.select().from(rateLevels).where(eq(rateLevels.slug, level.slug))
        if (existing.length > 0) { skipped++; continue }
        await db.insert(rateLevels).values(level).onConflictDoNothing()
        seeded++
    }
    return { seeded, skipped }
}

async function seedBranches() {
    let seeded = 0, skipped = 0
    const existing = await db.select().from(branches)
    if (existing.length > 0) return { seeded: 0, skipped: DEFAULT_BRANCHES.length }
    for (const branch of DEFAULT_BRANCHES) {
        await db.insert(branches).values(branch).onConflictDoNothing()
        seeded++
    }
    return { seeded, skipped }
}

async function seedSettings() {
    let seeded = 0, skipped = 0
    for (const [key, setting] of Object.entries(DEFAULT_SETTINGS)) {
        const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key as SettingKey))
        if (existing.length > 0) { skipped++; continue }
        await db.insert(systemSettings).values({
            key: key as SettingKey,
            value: setting.value,
            category: setting.category as SettingCategory,
            label: setting.label,
            description: setting.description,
        })
        seeded++
    }
    return { seeded, skipped }
}

async function seedAccountingCategories() {
    let seeded = 0, skipped = 0
    const existing = await db.select().from(accountingCategory)
    if (existing.length > 0) return { seeded: 0, skipped: DEFAULT_ACCOUNTING_CATEGORIES.length }
    for (const cat of DEFAULT_ACCOUNTING_CATEGORIES) {
        await db.insert(accountingCategory).values(cat).onConflictDoNothing()
        seeded++
    }
    return { seeded, skipped }
}

async function seedPayrollRates() {
    let seeded = 0, skipped = 0
    const levels = await db.select().from(rateLevels)
    const levelMap = new Map(levels.map(l => [l.slug, l.id]))

    for (const template of DEFAULT_PAYROLL_RATE_TEMPLATES) {
        const rateLevelId = levelMap.get(template.levelSlug)
        if (!rateLevelId) { skipped++; continue }

        const existing = await db.select().from(payrollStaffRate).where(
            and(
                eq(payrollStaffRate.serviceType, template.serviceType),
                eq(payrollStaffRate.clientType, template.clientType),
                eq(payrollStaffRate.rateLevelId, rateLevelId),
            )
        ).limit(1)

        if (existing.length > 0) { skipped++; continue }

        await db.insert(payrollStaffRate).values({
            rateName: template.rateName,
            serviceType: template.serviceType,
            clientType: template.clientType,
            rateLevelId,
            shopPercentage: template.shopPercentage,
            staffPercentage: template.staffPercentage,
            paymentMode: template.paymentMode,
            fixedAmount: template.fixedAmount,
            isActive: template.isActive,
        }).onConflictDoNothing()
        seeded++
    }
    return { seeded, skipped }
}

async function seedServices() {
    let seeded = 0, skipped = 0
    const existing = await db.select().from(services)
    if (existing.length > 0) return { seeded: 0, skipped: DEFAULT_SERVICES.length }
    for (const svc of DEFAULT_SERVICES) {
        await db.insert(services).values(svc).onConflictDoNothing()
        seeded++
    }
    return { seeded, skipped }
}
```

**Step 2: Write the main seed orchestration function**

```typescript
export async function seedDatabase(): Promise<SeedResult> {
    try {
        const results: Record<string, { seeded: number; skipped: number }> = {}

        results.rateLevels = await seedRateLevels()
        results.branches = await seedBranches()
        results.settings = await seedSettings()
        results.accountingCategories = await seedAccountingCategories()
        results.payrollRates = await seedPayrollRates()
        results.services = await seedServices()

        const totalSeeded = Object.values(results).reduce((sum, r) => sum + r.seeded, 0)
        const totalSkipped = Object.values(results).reduce((sum, r) => sum + r.skipped, 0)

        return { success: true, stats: { seeded: totalSeeded, skipped: totalSkipped } }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unexpected error occurred',
        }
    }
}
```

**Step 3: Write the CLI main function with formatted output**

```typescript
async function main() {
    console.log('\n🌱 InkSight Database Seed Script\n')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const steps: { name: string; icon: string; fn: () => Promise<{ seeded: number; skipped: number }> }[] = [
        { name: 'Rate Levels', icon: '📊', fn: seedRateLevels },
        { name: 'Branches', icon: '🏢', fn: seedBranches },
        { name: 'Settings', icon: '⚙️', fn: seedSettings },
        { name: 'Accounting Categories', icon: '📒', fn: seedAccountingCategories },
        { name: 'Payroll Rates', icon: '💰', fn: seedPayrollRates },
        { name: 'Services', icon: '💈', fn: seedServices },
    ]

    let totalSeeded = 0, totalSkipped = 0

    for (const step of steps) {
        console.log(`${step.icon}  Seeding ${step.name}...`)
        const result = await step.fn()
        totalSeeded += result.seeded
        totalSkipped += result.skipped
        if (result.seeded > 0) {
            console.log(`   ✅ ${result.seeded} seeded`)
        }
        if (result.skipped > 0) {
            console.log(`   ⏭️  ${result.skipped} already exist, skipped`)
        }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`✨ Seeding complete! ${totalSeeded} seeded, ${totalSkipped} skipped`)
    console.log('\nYou can now:')
    console.log('   • Access /config for system settings')
    console.log('   • View payroll rates in /payroll')
    console.log('   • Use accounting categories in /accounting')
    console.log('   • Create transactions and appointments')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

if (import.meta.main) {
    main().catch((error) => {
        console.error('\n❌ Error seeding database:\n')
        console.error(`   ${error instanceof Error ? error.message : 'An unexpected error occurred'}`)
        process.exit(1)
    }).finally(async () => {
        await db.$client.end()
    })
}
```

**Step 4: Verify the script compiles**

Run: `bun run typecheck 2>&1 | grep -i "seed-database" || echo "No seed-related type errors"`
Expected: No errors specific to seed-database.ts

**Step 5: Commit**

```bash
git add scripts/seed-database.ts
git commit -m "feat(seeds): unified seed script with FK-safe ordering and rateLevelId support"
```

---

## Task 3: Deprecate standalone seed scripts

**Files:**
- Modify: `scripts/seed-rate-levels.ts`
- Modify: `scripts/seed-shoe-rates.ts`
- Modify: `scripts/seed-accounting-categories.ts`

**Step 1: Replace seed-rate-levels.ts with deprecation notice**

```typescript
#!/usr/bin/env bun
console.warn('⚠️  This script is deprecated. Use `bun run db:seed` instead.')
console.warn('   Rate levels are now seeded by the unified seed script.\n')

import { seedDatabase } from './seed-database'
import { config } from 'dotenv'
config({ path: '.env.local' })

seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Seeding failed:', error)
        process.exit(1)
    })
```

**Step 2: Replace seed-shoe-rates.ts with deprecation notice**

```typescript
#!/usr/bin/env bun
console.warn('⚠️  This script is deprecated. Use `bun run db:seed` instead.')
console.warn('   Shoe rates are now seeded by the unified seed script.\n')

import { seedDatabase } from './seed-database'
import { config } from 'dotenv'
config({ path: '.env.local' })

seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Seeding failed:', error)
        process.exit(1)
    })
```

**Step 3: Replace seed-accounting-categories.ts with deprecation notice**

```typescript
#!/usr/bin/env bun
console.warn('⚠️  This script is deprecated. Use `bun run db:seed` instead.')
console.warn('   Accounting categories are now seeded by the unified seed script.\n')

import { seedDatabase } from './seed-database'
import { config } from 'dotenv'
config({ path: '.env.local' })

seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Seeding failed:', error)
        process.exit(1)
    })
```

**Step 4: Verify scripts still execute without errors**

Run: `bun run scripts/seed-rate-levels.ts 2>&1 | head -5`
Expected: Shows deprecation warning, then runs unified seed

**Step 5: Commit**

```bash
git add scripts/seed-rate-levels.ts scripts/seed-shoe-rates.ts scripts/seed-accounting-categories.ts
git commit -m "chore(seeds): deprecate standalone seed scripts in favor of unified db:seed"
```

---

## Task 4: Update setup-database.ts to use unified seed

**Files:**
- Modify: `scripts/setup-database.ts`

**Step 1: Update setup-database.ts seed step**

The `seedData()` function currently calls `seedDatabase()` which is correct, but add progress logging:

```typescript
async function seedData(): Promise<boolean> {
    console.log('\n🌱 Seeding database...\n')

    const result = await seedDatabase()

    if (result.success) {
        const stats = result.stats
        if (stats) {
            console.log(`\n✅ Database seeded: ${stats.seeded} new, ${stats.skipped} existing`)
        } else {
            console.log('\n✅ Database seeded successfully')
        }
        return true
    } else {
        console.error('\n❌ Failed to seed database:', result.error)
        return false
    }
}
```

**Step 2: Verify setup script still compiles**

Run: `bun run typecheck 2>&1 | grep -i "setup-database" || echo "No setup-related type errors"`
Expected: No errors

**Step 3: Commit**

```bash
git add scripts/setup-database.ts
git commit -m "fix(setup): update setup-database to use unified seed with stats logging"
```

---

## Task 5: Fix missing payroll-schemas exports (build-breaking)

**Files:**
- Modify: `server/actions/payroll-schemas.ts`
- Modify: `server/actions/payroll.ts`

**Step 1: Add missing schemas to payroll-schemas.ts**

The `payroll.ts` imports `CreatePayrollEntryInputSchema` and `CreateScheduledPaymentSchema` which don't exist. Add them:

At the end of `payroll-schemas.ts`, before the type exports, add:

```typescript
export const CreatePayrollEntryInputSchema = ManualPayrollEntrySchema

export const CreateAdvanceSchema = z.object({
    user_id: z.string().min(1, 'User ID is required'),
    type: z.enum(['ADVANCE']),
    amount: z.number().positive('Amount must be positive'),
    reason: z.string().min(1, 'Reason is required'),
    disbursement_type: z.enum(['FULL', 'STAGGERED']).default('FULL'),
    scheduled_amount: z.number().positive().optional(),
    recurrence_rule: z.object({
        frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']),
        interval: z.number().int().min(1).default(1),
        startDate: z.string(),
        endDate: z.string().optional(),
    }).optional(),
})

export const CreateDeductionSchema = z.object({
    user_id: z.string().min(1, 'User ID is required'),
    type: z.enum(['DEDUCTION', 'ADJUSTMENT']),
    amount: z.number().positive('Amount must be positive'),
    reason: z.string().min(1, 'Reason is required'),
})

export const CreateScheduledPaymentSchema = StaggeredPaymentSchema
```

And add the type exports:

```typescript
export type CreateAdvanceInput = z.infer<typeof CreateAdvanceSchema>
export type CreateDeductionInput = z.infer<typeof CreateDeductionSchema>
export type CreateScheduledPaymentInput = z.infer<typeof CreateScheduledPaymentSchema>
```

**Step 2: Verify build succeeds**

Run: `bun run build 2>&1 | tail -5`
Expected: Build completes successfully (exit code 0)

**Step 3: Commit**

```bash
git add server/actions/payroll-schemas.ts
git commit -m "fix(schemas): add missing CreatePayrollEntryInputSchema, CreateAdvanceSchema, CreateDeductionSchema, CreateScheduledPaymentSchema"
```

---

## Task 6: Fix payroll.ts unused imports and type issues

**Files:**
- Modify: `server/actions/payroll.ts`

**Step 1: Remove unused import `CreateDeductionSchema`**

In `server/actions/payroll.ts` line 42, `CreateDeductionSchema` is imported but never used. If it's actually used somewhere in the file body, verify. If not, remove from import.

Check: Search for `CreateDeductionSchema` usage in the file body (not just the import).
If unused, remove from the import block at lines 31-44.

**Step 2: Verify build still succeeds**

Run: `bun run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add server/actions/payroll.ts
git commit -m "fix(payroll): remove unused CreateDeductionSchema import"
```

---

## Task 7: Add worktree directories to .eslintignore

**Files:**
- Modify: `.eslintignore` (create if doesn't exist) or modify `eslint.config` if using flat config

**Step 1: Check current ESLint configuration**

Run: `ls .eslintignore eslint.config.* 2>/dev/null`

**Step 2: Add worktree and build artifact ignores**

If `.eslintignore` exists, append:
```
.worktrees/
.next/
drizzle/
```

If using flat config (`eslint.config.mjs` or similar), add ignore patterns:
```javascript
ignores: ['.worktrees/**', '.next/**', 'drizzle/**']
```

**Step 3: Verify lint no longer scans worktree files**

Run: `bun run lint 2>&1 | grep -c ".worktrees" || echo "0"`
Expected: 0 (no worktree files in lint output)

**Step 4: Commit**

```bash
git add .eslintignore eslint.config.*
git commit -m "chore(lint): ignore .worktrees, .next, and drizzle directories"
```

---

## Task 8: Fix @ts-ignore → @ts-expect-error and no-explicit-any violations

**Files:**
- Multiple files across the codebase (find via lint output)

**Step 1: Find all @ts-ignore occurrences**

Run: `rg "@ts-ignore" --type ts --type tsx -l | grep -v node_modules | grep -v .worktrees | grep -v .next`

**Step 2: Replace all @ts-ignore with @ts-expect-error**

For each file found, replace `@ts-ignore` with `@ts-expect-error`. The difference is that `@ts-expect-error` will error if the next line has no type error (catching stale suppressions).

**Step 3: Find and fix no-explicit-any violations**

Run: `bun run lint 2>&1 | grep "no-explicit-any" | head -20`

For each violation, replace `any` with the correct type. Common patterns:
- `any` → `unknown` when type is truly unknown
- `any` → specific interface when shape is known
- `any` → `Record<string, unknown>` for generic objects

**Step 4: Verify lint count dropped significantly**

Run: `bun run lint 2>&1 | tail -3`
Expected: Substantially fewer errors/warnings than the original 51412

**Step 5: Commit**

```bash
git add -A
git commit -m "fix(lint): replace @ts-ignore with @ts-expect-error and fix no-explicit-any violations"
```

---

## Task 9: Final verification - build and lint clean

**Step 1: Run full build**

Run: `bun run build`
Expected: Build completes with exit code 0

**Step 2: Run full lint**

Run: `bun run lint`
Expected: Zero errors, minimal warnings (only acceptable ones like `@typescript-eslint/no-unused-vars` for handler patterns if applicable)

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: Zero type errors

**Step 4: If any errors remain, fix them and re-verify**

Common remaining issues:
- Unused handler variables: Prefix with `_` (e.g., `_handler`)
- Missing return types on server actions: Add explicit return types
- Import order violations: Reorder per AGENTS.md conventions

**Step 5: Final commit**

```bash
git add -A
git commit -m "fix: resolve remaining lint, build, and typecheck errors"
```

---

## Summary of All Changes

| Task | What Changes | Key Fix |
|------|-------------|---------|
| 1 | `scripts/seed-database.ts` constants | Replace payroll rates without rateLevelId with slug-based templates |
| 2 | `scripts/seed-database.ts` functions | Unified seed in FK-safe order, add branches + services seeding |
| 3 | `scripts/seed-{rate-levels,shoe-rates,accounting-categories}.ts` | Deprecate standalone scripts |
| 4 | `scripts/setup-database.ts` | Use unified seed with stats |
| 5 | `server/actions/payroll-schemas.ts` | Add missing exports (CreatePayrollEntryInputSchema, CreateAdvanceSchema, etc.) |
| 6 | `server/actions/payroll.ts` | Remove unused import |
| 7 | `.eslintignore` or `eslint.config.*` | Ignore .worktrees, .next, drizzle |
| 8 | Multiple files | @ts-ignore → @ts-expect-error, fix no-explicit-any |
| 9 | Final verification | Ensure build + lint + typecheck all pass |
