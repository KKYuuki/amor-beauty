# Fix Build and Lint Issues Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all unused imports, variables, and functions to eliminate 10 ESLint warnings and ensure clean builds.

**Architecture:** Simple code cleanup - remove unused imports by either deleting them or prefixing with `_`, remove unused variables and functions. TypeScript passes with no errors.

**TechStack:** Next.js 15, React 19, TypeScript, ESLint, Bun

---

## Summary of Issues

| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|
| 1 | `app/layout.tsx` | 9 | `MaintenanceModeValue` unused import | Remove import |
| 2 | `app/payroll/payrollPage.tsx` | 48 | `CurrencyTaxValue` unused import | Remove import |
| 3 | `app/transactions/transactionsPage.tsx` | 22 | `CurrencyTaxValue` unused import | Remove import |
| 4 | `components/metrics/ExecutiveAccounting.tsx` | 40,118 | `CurrencyTaxValue` + `groupBy` unused | Remove import + prefix variable |
| 5 | `server/actions/profile.ts` | 14 | `logInfo` unused import | Remove import |
| 6 | `server/actions/services.ts` | 9 | `logInfo` unused import | Remove import |
| 7 | `server/actions/settings.ts` | 13 | `createLogs` unused import | Remove import |
| 8 | `server/actions/time-clock.ts` | 8 | `logInfo` unused import | Remove import |
| 9 | `server/actions/transactions.ts` | 190 | `generateTransactionNumber` unused function | Remove function |
| 10 | Multiple files | N/A | SSL errors during build | Expected - no fix needed |

---

### Task 1: Fix unused imports in app/layout.tsx

**Files:**
- Modify: `app/layout.tsx:9`

**Current state:** Line 9 imports `MaintenanceModeValue` which is never used in the file. The type is only needed in `components/sidebar.tsx` where it's received as a prop.

**Step 1: Remove the unused import**

Edit line 9 to remove `MaintenanceModeValue` from the import statement.

```typescript
// Before:
import { MaintenanceModeValue } from "@/utils/types/settings"

// After:
// (remove this import entirely - it's not needed)
```

**Step 2: Verify the fix**

Run: `bun run lint -- --max-warnings 0 app/layout.tsx` or check that the warning is gone.

Expected: No warning for this file.

**Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "fix: remove unused MaintenanceModeValue import from layout"
```

---

### Task 2: Fix unused import in app/payroll/payrollPage.tsx

**Files:**
- Modify: `app/payroll/payrollPage.tsx:48`

**Current state:** Line 48 imports `CurrencyTaxValue` but it's never used in the component.

**Step 1: Remove the unused import**

Find line 48 and remove the `CurrencyTaxValue` import.

```typescript
// Before:
import { getSetting } from "@/server/actions/settings"
import { CurrencyTaxValue } from "@/utils/types/settings"

// After:
import { getSetting } from "@/server/actions/settings"
```

**Step 2: Verify the fix**

Run: `bun run lint` and confirm no warning for this file.

Expected: Warning removed for payrollPage.tsx.

**Step 3: Commit**

```bash
git add app/payroll/payrollPage.tsx
git commit -m "fix: remove unused CurrencyTaxValue import from payroll page"
```

---

### Task 3: Fix unused import in app/transactions/transactionsPage.tsx

**Files:**
- Modify: `app/transactions/transactionsPage.tsx:22`

**Current state:** Line 22 imports `CurrencyTaxValue` but it's never used.

**Step 1: Remove the unused import**

Find line 22 and remove the import.

```typescript
// Before:
import { CurrencyTaxValue } from "@/utils/types/settings"

// After:
// (remove this line entirely)
```

**Step 2: Verify the fix**

Run: `bun run lint` and confirm no warning for this file.

Expected: Warning removed for transactionsPage.tsx.

**Step 3: Commit**

```bash
git add app/transactions/transactionsPage.tsx
git commit -m "fix: remove unused CurrencyTaxValue import from transactions page"
```

---

### Task 4: Fix unused import and variable in components/metrics/ExecutiveAccounting.tsx

**Files:**
- Modify: `components/metrics/ExecutiveAccounting.tsx:40,118`

**Current state:** 
- Line 40 imports `CurrencyTaxValue` which is never used
- Line118 assigns `groupBy` variable which is never used

**Step 1: Remove the unused import**

Find line 40 and remove `CurrencyTaxValue` from the imports.

```typescript
// Before:
import { CurrencyTaxValue } from "@/utils/types/settings"

// After:
// (remove this line entirely)
```

**Step 2: Fix the unused variable**

The `groupBy` variable on line 118 is calculated but never passed to any function. According to ESLint rules, unused variables should be prefixed with `_`.

```typescript
// Before:
const groupBy = daysDiff > 90 ? "month" : daysDiff > 30 ? "week" : "day"

// After:
const _groupBy = daysDiff > 90 ? "month" : daysDiff > 30 ? "week" : "day"
```

Alternatively, if `groupBy` was intended for future use (for aggregating trend data), consider whether it should be used. For now, prefixing with `_` is the safe fix.

**Step 3: Verify the fix**

Run: `bun run lint` and confirm no warnings for this file.

Expected: Both warnings removed for ExecutiveAccounting.tsx.

**Step 4: Commit**

```bash
git add components/metrics/ExecutiveAccounting.tsx
git commit -m "fix: remove unused CurrencyTaxValue import and prefix unused groupBy variable"
```

---

### Task 5: Fix unused import in server/actions/profile.ts

**Files:**
- Modify: `server/actions/profile.ts:14`

**Current state:** Line 14 imports `logInfo` from `./logs` but it's never called in the file.

**Step 1: Remove the unused import**

Find line 14 and remove `logInfo` from the import.

```typescript
// Before:
import { createLogs, logError, logInfo } from "./logs"

// After:
import { createLogs, logError } from "./logs"
```

**Step 2: Verify the fix**

Run: `bun run lint` and confirm no warning for this file.

Expected: Warning removed for profile.ts.

**Step 3: Commit**

```bash
git add server/actions/profile.ts
git commit -m "fix: remove unused logInfo import from profile actions"
```

---

### Task 6: Fix unused import in server/actions/services.ts

**Files:**
- Modify: `server/actions/services.ts:9`

**Current state:** Line 9 imports `logInfo` from `./logs` but it's never called.

**Step 1: Remove the unused import**

Find line 9 and remove `logInfo` from the import.

```typescript
// Before:
import { createLogs, logError, logInfo } from "./logs"

// After:
import { createLogs, logError } from "./logs"
```

**Step 2: Verify the fix**

Run: `bun run lint` and confirm no warning for this file.

Expected: Warning removed for services.ts.

**Step 3: Commit**

```bash
git add server/actions/services.ts
git commit -m "fix: remove unused logInfo import from services actions"
```

---

### Task 7: Fix unused import in server/actions/settings.ts

**Files:**
- Modify: `server/actions/settings.ts:13`

**Current state:** Line 13 imports `createLogs` from `./logs` but it's never called.

**Step 1: Remove the unused import**

Find line 13 and remove `createLogs` from the import.

```typescript
// Before:
import { createLogs, logError } from "./logs"

// After:
import { logError } from "./logs"
```

**Step 2: Verify the fix**

Run: `bun run lint` and confirm no warning for this file.

Expected: Warning removed for settings.ts.

**Step 3: Commit**

```bash
git add server/actions/settings.ts
git commit -m "fix: remove unused createLogs import from settings actions"
```

---

### Task 8: Fix unused import in server/actions/time-clock.ts

**Files:**
- Modify: `server/actions/time-clock.ts:8`

**Current state:** Line 8 imports `logInfo` from `./logs` but it's never called.

**Step 1: Remove the unused import**

Find line 8 and remove `logInfo` from the import.

```typescript
// Before:
import { createLogs, logError, logInfo } from "./logs"

// After:
import { createLogs, logError } from "./logs"
```

**Step 2: Verify the fix**

Run: `bun run lint` and confirm no warning for this file.

Expected: Warning removed for time-clock.ts.

**Step 3: Commit**

```bash
git add server/actions/time-clock.ts
git commit -m "fix: remove unused logInfo import from time-clock actions"
```

---

### Task 9: Remove unused function in server/actions/transactions.ts

**Files:**
- Modify: `server/actions/transactions.ts:190-230`

**Current state:** The function `generateTransactionNumber` (lines 190-230 approx) is defined but never called. There's a similar function `generateTransactionNumberWithTx` that IS used (called on line 100). The non-transaction version appears to be legacy code that was replaced by the transaction variant.

**Step 1: Locate the function**

Find the function `generateTransactionNumber` starting at line 190. It should end before `generateTransactionNumberWithTx` starts.

**Step 2: Remove the unused function**

Delete the entire `generateTransactionNumber` function. Keep `generateTransactionNumberWithTx` intact.

```typescript
// REMOVE this entire function (approximately lines 190-230):
async function generateTransactionNumber(branchId?: string | null): Promise<string> {
    const date = new Date()
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
    
    // Get branch code if available
    let branchCode = 'TXN'
    if (branchId) {
        const [branch] = await db
            .select()
            .from(branches)
            .where(eq(branches.id, branchId))
            .limit(1)
        if (branch) {
            branchCode = branch.code
        }
    }

    // Count transactions for today with this branch code
    const todayStart = new Date(date)
    todayStart.setHours(0, 0, 0, 0)
    // ... rest of function
}

// KEEP this function (starts around line 226):
async function generateTransactionNumberWithTx(tx: TransactionClient, branchId?: string | null): Promise<string> {
    // ... this one is used
}
```

**Step 3: Verify the fix**

Run: `bun run lint` and confirm no warning for this file.

Expected: Warning removed for transactions.ts.

**Step 4: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "fix: remove unused generateTransactionNumber function"
```

---

## Final Verification

After completing all tasks:

### Step 1: Run full lint check

```bash
bun run lint
```

Expected: **0 warnings, 0 errors**

### Step 2: Run TypeScript check

```bash
npx tsc --noEmit
```

Expected: **No errors**

### Step 3: Run production build

```bash
bun run build
```

Expected: **Build succeeds** (SSL errors during static generation are expected - database not available at build time)

### Step 4: Review changes

```bash
git log --oneline -10
```

Expected: 9 commits, one for each fix.

---

## Notes

### SSL Errors During Build

The errors like `CRITICAL: Failed to persist logs to database: Error: The server does not support SSL connections` during `bun run build` are **expected and not a problem**. These occur because:

1. The build process tries to pre-render static pages
2. Static page generation calls server actions that attempt database connections
3. The development/local database may not have SSL enabled or may not be accessible during build

These are runtime warnings, not build errors. The build still succeeds. To fully resolve them (if desired for production builds), you would need to:

- Ensure SSL is enabled on the Supabase database
- Or configure the build to skip database calls during static generation
- Or use environment variables to conditionally skip database calls during build

### Alternative Approach: ESLint Disable

If any import is intentionally kept for future use, use ESLint disable comment instead:

```typescript
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CurrencyTaxValue } from "@/utils/types/settings"
```

However, removing unused code is preferred.

---

## Summary

| Task | File | Fix |
|------|------|-----|
| 1 | `app/layout.tsx` | Remove `MaintenanceModeValue` import |
| 2 | `app/payroll/payrollPage.tsx` | Remove `CurrencyTaxValue` import |
| 3 | `app/transactions/transactionsPage.tsx` | Remove `CurrencyTaxValue` import |
| 4 | `components/metrics/ExecutiveAccounting.tsx` | Remove import, prefix `_groupBy` |
| 5 | `server/actions/profile.ts` | Remove `logInfo` import |
| 6 | `server/actions/services.ts` | Remove `logInfo` import |
| 7 | `server/actions/settings.ts` | Remove `createLogs` import |
| 8 | `server/actions/time-clock.ts` | Remove `logInfo` import |
| 9 | `server/actions/transactions.ts` | Remove `generateTransactionNumber` function |