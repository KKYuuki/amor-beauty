# Comprehensive Codebase Audit & Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit and refactor all server actions, business logic, scripts, Drizzle ORM setup, and documentation to ensure robustness, maintainability, and proper functionality across the Inksight RDMD tattoo studio management application.

**Architecture:** This plan addresses five major areas: (1) Server Actions standardization and error handling, (2) Business Logic completeness and correctness, (3) Scripts and configuration validation, (4) Drizzle ORM schema and migration verification, and (5) Comprehensive documentation for deployment.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict mode), Drizzle ORM, PostgreSQL, Better Auth, Bun, Resend API, S3-compatible storage

---

## Part 1: Server Actions & Functions Audit

### Task 1: Audit and Document All Server Actions

**Files:**
- Read: `server/actions/*.ts` (all 16 action files)
- Read: `utils/types/responses.ts`
- Create: `docs/plans/actions-audit-report.md`

**Step 1: Inventory all server actions**

Run extensive grep to find all exported action functions:

```bash
grep -r "^export async function" server/actions/ --include="*.ts"
```

Expected: List of all exported action functions with their signatures

**Step 2: Analyze return type consistency**

Read each action file and document:
- Return type pattern (ActionResponse vs custom)
- Error handling approach (createLogs vs console.error)
- Validation method (Zod schema vs manual)
- Transaction usage (present/absent)

**Step 3: Document current patterns and issues**

Create audit report with:
- Complete list of actions with their signatures
- Inconsistencies found (5 categories)
- Missing functionality (payroll stubs, etc.)
- Risk assessment for each issue

**Step 4: Commit audit findings**

```bash
git add docs/plans/actions-audit-report.md
git commit -m "docs: add comprehensive server actions audit report"
```

---

### Task 2: Standardize Action Response Types

**Files:**
- Modify: `utils/types/responses.ts`
- Modify: `server/actions/*.ts` (all 16 files)
- Test: Manual testing of each action

**Step 1: Define strict response type union**

Update `utils/types/responses.ts`:

```typescript
// Standard action response with strict typing
export interface ActionSuccess<T = void> {
    success: true
    data: T
    message?: string
}

export interface ActionFailure {
    success: false
    error: string
    validationErrors?: Record<string, string[]>
}

export type ActionResponse<T = void> = ActionSuccess<T> | ActionFailure

// Helper functions for consistent responses
export function success<T>(data: T, message?: string): ActionSuccess<T> {
    return message ? { success: true, data, message } : { success: true, data }
}

export function failure(error: string, validationErrors?: Record<string, string[]>): ActionFailure {
    return validationErrors 
        ? { success: false, error, validationErrors }
        : { success: false, error }
}
```

**Step 2: Create helper script for migration detection**

Create `scripts/check-action-types.ts`:

```typescript
// Script to detect inconsistent return patterns
// Run: bun run scripts/check-action-types.ts
```

**Step 3: Update high-priority actions**

Start with actions having most inconsistencies:
- `server/actions/payroll.ts` - Complete stubs
- `server/actions/accounting.ts` - Standardize returns
- `server/actions/appointments.ts` - Fix mixed patterns

**Step 4: Run type check**

```bash
bunx tsc --noEmit
```

Expected: No type errors

**Step 5: Commit response type standardization**

```bash
git add utils/types/responses.ts server/actions/
git commit -m "refactor: standardize action response types across all server actions"
```

---

### Task 3: Implement Database Transaction Wrapper

**Files:**
- Create: `server/db/transactions.ts`
- Modify: `server/actions/*.ts` (multi-step operations)
- Test: `scripts/test-transactions.ts`

**Step 1: Create transaction utility**

Create `server/db/transactions.ts`:

```typescript
import { db } from './index'
import { createLogs } from '@/server/actions/logs'

export async function withTransaction<T>(
    operations: (tx: typeof db) => Promise<T>,
    context: { action: string; userId?: string }
): Promise<ActionResponse<T>> {
    try {
        const result = await db.transaction(async (tx) => {
            return await operations(tx)
        })
        return { success: true, data: result }
    } catch (error) {
        await createLogs({
            logs: [{
                level: 'ERROR',
                type: context.action,
                message: `Transaction failed: ${error}`,
                userId: context.userId
            }]
        })
        return { success: false, error: `Operation failed: ${error}` }
    }
}
```

**Step 2: Identify multi-step operations requiring transactions**

Actions needing transaction wrapping:
- `appointments.ts: createAppointmentWithDetails` - Creates appointment + details
- `transactions.ts: createTransaction` - Creates transaction + items + payments
- `inventory.ts: restockInventory` - Updates inventory + creates log
- `payroll.ts: processPayroll` - Multiple payroll entries

**Step 3: Refactor appointment creation with transaction**

Update `server/actions/appointments.ts` transaction handling.

**Step 4: Refactor transaction creation**

Update `server/actions/transactions.ts` transaction handling.

**Step 5: Run tests and type check**

```bash
bunx tsc --noEmit
bun run lint
```

**Step 6: Commit transaction wrapper**

```bash
git add server/db/transactions.ts server/actions/appointments.ts server/actions/transactions.ts
git commit -m "feat: add database transaction wrapper for multi-step operations"
```

---

### Task 4: Replace All console.error with createLogs

**Files:**- Modify: `server/actions/*.ts` (all files with console.error)
- Modify: `server/actions/logs.ts` (ensure proper logging)- Test: Manual verification of logs in database

**Step 1: Audit all console usage**

```bash
grep -rn "console\." server/actions/ --include="*.ts"
grep -rn "console\." app/ --include="*.ts" --include="*.tsx"
```

Expected: List of all console.log/error/warn calls

**Step 2: Create logging helper utilities**

Update `server/actions/logs.ts` to add typed logging helpers:

```typescript
export function logError(context: { type: string; message: string; userId?: string }) {
    return createLogs({
        logs: [{
            level: 'ERROR',
            type: context.type,
            message: context.message,
            userId: context.userId
        }]
    })
}

export function logInfo(context: { type: string; message: string; userId?: string }) {
    return createLogs({
        logs: [{
            level: 'INFO',
            type: context.type,
            message: context.message,
            userId: context.userId
        }]
    })
}
```

**Step 3: Replace console calls in each action file**

For each action file with console.error:
- Import logError
- Replace `console.error(...)` with `await logError(...)`- Ensure proper context is passed

**Step 4: Run lint and type check**

```bash
bun run lint
bunx tsc --noEmit
```

Expected: No console statements in server actions

**Step 5: Commit console cleanup**

```bash
git add server/actions/
git commit -m "refactor: replace console.error with structured logging in all server actions"
```

---

### Task 5: Complete Payroll Module Implementation

**Files:**
- Modify: `server/actions/payroll.ts`
- Modify: `app/payroll/` pages and components
- Modify: `app/my-payroll/` pages and components
- Test: Manual testing of payroll flows

**Step 1: Audit incomplete payroll functions**

Read `server/actions/payroll.ts` and identify:
- Functions returning "Not implemented"- Missing business logic
- Stub functions

**Step 2: Implement missing payroll functions**

Complete these functions:
- `processPayroll` - Process payroll for a period
- `getPayrollEntries` - Retrieve payroll entries
- `approvePayrollRequest` - Manager approval workflow
- `rejectPayrollRequest` - Manager rejection workflow
- `calculatePayroll` - Calculate totals including deductions

**Step 3: Add validation schemas**

Create Zod schemas for:
- `ProcessPayrollSchema` - Validate payroll processing input
- `PayrollFilterSchema` - Validate filter parameters
- `PayrollApprovalSchema` - Validate approval input

**Step 4: Update payroll components**

Fix any broken components in:
- `app/payroll/page.tsx`
- `app/my-payroll/page.tsx`
- Any related components in `components/payroll/`

**Step 5: Test payroll flows**

Test manually:
- Staff time clock integration
- Payroll request creation
- Manager approval workflow
- Payroll history viewing

**Step 6: Commit payroll implementation**

```bash
git add server/actions/payroll.ts app/payroll/ app/my-payroll/
git commit -m "feat: complete payroll module with approval workflow and calculations"
```

---

### Task 6: Fix Type Errors in Server Actions

**Files:**
- Modify: `server/actions/inventory.ts` (is_shared missing)
- Modify: `server/actions/profile.ts` (UploadResult type)
- Modify: `server/actions/accounting.ts` (UploadResult type)
- Modify: `server/db/schema/inventory.ts` (if schema issue)
- Modify: `utils/storage.ts` (UploadResult type)

**Step 1: Investigate InventoryItem type mismatch**

Read `server/db/schema/inventory.ts` and `utils/types/` to understand:
- Where `is_shared` property should be defined
- Why it's missing in query results

**Step 2: Fix inventory schema or type**

Option A - Add is_shared to schema:
```typescript
// In server/db/schema/inventory.ts
is_shared: boolean().default(false).notNull()
```

Option B - Update type definition:
```typescript
// Make is_shared optional if legitimately missing
is_shared?: boolean
```

**Step 3: Fix UploadResult type mismatches**

Read `utils/storage.ts` to understand UploadResult type:
- Ensure it returns string (URL) where expected
- Or update callers to handle UploadResult object

**Step 4: Update upload callers**

Fix these locations:
- `server/actions/inventory.ts:598`
- `server/actions/profile.ts:99`
- `server/actions/accounting.ts:274`

**Step 5: Run type check**

```bash
bunx tsc --noEmit
```

Expected: Zero type errors

**Step 6: Commit type fixes**

```bash
git add server/actions/inventory.ts server/actions/profile.ts server/actions/accounting.ts server/db/schema/inventory.ts
git commit -m "fix: resolve type mismatches in inventory, profile, and accounting actions"
```

---

### Task 7: Add Input Sanitization to All Server Actions

**Files:**- Modify: `server/actions/*.ts` (all actions)
- Create: `utils/sanitize.ts`- Test: Manual testing with malicious input

**Step 1: Create sanitization utility**

Create `utils/sanitize.ts`:

```typescript
import DOMPurify from 'isomorphic-dompurify'

export function sanitizeString(input: string): string {
    return DOMPurify.sanitize(input.trim())
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            sanitized[key] = sanitizeString(value)
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value as Record<string, unknown>)
        } else {
            sanitized[key] = value
        }
    }
    return sanitized as T
}
```

**Step 2: Install DOMPurify dependency**

```bash
bun add isomorphic-dompurify
bun add -d @types/dompurify
```

**Step 3: Apply sanitization to user inputs**

Add sanitization to:
- All string inputs from forms- File name inputs
- Search/query parameters
- User-provided description fields

**Step 4: Run type check and lint**

```bash
bun run lint
bunx tsc --noEmit
```

**Step 5: Commit sanitization implementation**

```bash
git add utils/sanitize.ts package.json server/actions/
git commit -m "feat: add input sanitization utility and apply to all server actions"
```

---

### Task 8: Add Rate Limiting to Public Endpoints

**Files:**
- Create: `utils/rate-limit.ts`
- Modify: `app/api/public/` routes
- Modify: `app/api/auth/[...all]/` route
- Modify: `app/api/alive/route.ts`
- Test: Rate limit testing script

**Step 1: Create rate limiter utility**

Create `utils/rate-limit.ts`:

```typescript
import { headers } from 'next/headers'
import { createLogs } from '@/server/actions/logs'

interface RateLimitConfig {
    windowMs: number
    maxRequests: number
    key?: string
}

const requestCounts = new Map<string, { count: number; resetTime: number }>()

export async function rateLimit(config: RateLimitConfig): Promise<{ success: boolean; remaining: number }> {
    const headersList = await headers()
    const ip = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? 'unknown'const key = `${config.key ?? 'default'}:${ip}`
    const now = Date.now()const record = requestCounts.get(key)
    
    if (!record || now > record.resetTime) {
        requestCounts.set(key, { count: 1, resetTime: now + config.windowMs })
        return { success: true, remaining: config.maxRequests - 1 }
    }
    
    if (record.count >= config.maxRequests) {
        await createLogs({
            logs: [{ level: 'WARN', type: 'RATE_LIMIT', message: `Rate limit exceeded for ${key}` }]
        })
        return { success: false, remaining: 0 }
    }
    
    record.count++
    return { success: true, remaining: config.maxRequests - record.count }
}
```

**Step 2: Apply to public endpoints**

Add rate limiting to:
- `app/api/public/images/[id]/route.ts` - 100 req/min
- `app/api/alive/route.ts` - 60 req/min
- Auth endpoints - 10 req/min**Step 3: Test rate limiting**

Create `scripts/test-rate-limit.ts` to verify rate limiting works.

**Step 4: Commit rate limiting**

```bash
git add utils/rate-limit.ts app/api/
git commit -m "feat: add rate limiting to public and auth endpoints"
```

---

### Task 9: Fix Broken Imports in accounts Components

**Files:**
- Modify: `components/accounts/authkeyList.tsx`
- Check: `utils/types/auth.ts`- Check: `utils/env.ts`
- Check: All referenced modules

**Step 1: Identify all broken imports**

Read `components/accounts/authkeyList.tsx` and list:
- `@/utils/types/auth` - Missing?- `@/utils/env` - Missing?
- `@/server/actions/profile` - Path correct?- `@/components/sidebar` - Path correct?
- `@/server/actions/email` - Path correct?

**Step 2: Check if files exist**

```bash
ls -la utils/types/auth.ts utils/env.ts server/actions/profile.ts components/sidebar.tsx server/actions/email.ts
```

**Step 3: Fix or create missing files**

For each missing import:
- Create missing file if needed
- Update import path if file exists elsewhere
- Remove unused imports

**Step 4: Fix userInfo and addNotification types**

In `components/accounts/authkeyList.tsx`:
- Fix `userInfo` type on unknown
- Fix `addNotification` type on unknown

**Step 5: Run type check**

```bash
bunx tsc --noEmit
```

Expected: authkeyList.tsx has no errors

**Step 6: Commit import fixes**

```bash
git add components/accounts/authkeyList.tsx utils/types/auth.ts utils/env.ts
git commit -m "fix: resolve broken imports and type errors in accounts components"
```

---

## Part 2: Business Logic Audit

### Task 10: Audit All Business Logic Components

**Files:**
- Read: `app/**/page.tsx` (all feature pages)
- Read: `components/**/` (all feature components)
- Read: `app/(app)/` (authenticated routes)
- Create: `docs/plans/business-logic-audit.md`

**Step 1: Inventory all business features**

List all feature areas with their components and actions:

| Feature | Pages | Components | Server Actions |
|---------|-------|------------|----------------|
| Accounting | `app/accounting/` | `components/accounting/` | `accounting.ts` |
| Appointments | `app/appointments/` | `components/appointments/` | `appointments.ts` |
| Inventory | `app/inventory/` | `components/inventory/` | `inventory.ts` |
| Sales/POS | `app/sales/` | `components/sales/` | `transactions.ts` |
| Payroll | `app/payroll/` | `components/payroll/` | `payroll.ts` |
| Users | `app/accounts/` | `components/accounts/` | `profile.ts` |
| Branches | `app/(app)/admin/branches/` | - | `branches.ts` |
| Settings | `app/config/` | - | `settings.ts` |
| Metrics | `app/metrics/` | `components/metrics/` | `metrics.ts` |

**Step 2: Check data flow consistency**

For each feature, verify:
- Client component calls correct server action- Server action returns expected data
- Error states handled in UI
- Loading states properly managed

**Step 3: Document business rule gaps**

Identify missing business rules:
- Validation that should exist but doesn't
- Edge cases not handled
- Business logic in wrong layer (UI vs server)

**Step 4: Commit audit documentation**

```bash
git add docs/plans/business-logic-audit.md
git commit -m "docs: add comprehensive business logic audit report"
```

---

### Task 11: Validate Accounting Business Logic

**Files:**- Read: `server/actions/accounting.ts`
- Read: `app/accounting/page.tsx`
- Read: `components/accounting/` (all components)
- Modify: Issues found during validation
- Test: Manual testing of accounting flows

**Step 1: Review accounting action functions**

List all functions in `accounting.ts`:
- `getCategories` - Fetch accounting categories
- `createCategory` - Create new category
- `updateCategory` - Update category
- `deleteCategory` - Delete category
- `getLedgerEntries` - Fetch ledger entries
- `createLedgerEntry` - Create entry
- `updateLedgerEntry` - Update entry
- `deleteLedgerEntry` - Delete entry

**Step 2: Validate business rules**

Check these business rules are enforced:
- Categories must have unique names per branch
- Ledger entries must have valid category ID
- Amount must be positive for income, negative for expenses
- Date must be within valid range
- Only authorized users can modify entries

**Step 3: Check UI validation**

Verify client-side validation matches server-side:
- Form validation in components
- Error handling and display
- Success feedback to user

**Step 4: Test accounting workflows**

Manually test:
- Create category → verify in database
- Create ledger entry → verify calculations
- Update entry → verify history preserved
- Delete entry → verify soft delete orhard delete
- Export accounting data → verify CSV format

**Step 5: Document and fix issues**

Createissue list with:
- Business rule violations
- Missing validations
- UI/Server inconsistencies

**Step 6: Commit accounting fixes**

```bash
git add server/actions/accounting.ts app/accounting/ components/accounting/
git commit -m "fix: resolve accounting business logic issues and validation gaps"
```

---

### Task 12: Validate Appointments Business Logic

**Files:**
- Read: `server/actions/appointments.ts`
- Read: `app/appointments/page.tsx`
- Read: `app/calendar/page.tsx`
- Read: `components/appointments/` (all components)
- Modify: Issues found during validation
- Test: Manual testing of appointment flows

**Step 1: Review appointment action functions**

List all functions in `appointments.ts`:
- `getAppointments` - Fetch appointments with filters
- `getAppointmentById` - Fetch single appointment
- `createAppointment` - Create new appointment
- `createAppointmentWithDetails` - Create with tattoo/piercing details
- `updateAppointment` - Update appointment
- `updateAppointmentStatus` - Update status only
- `deleteAppointment` - Cancel/remove appointment
- `getWalkIns` - Fetch walk-in appointments
- `createWalkIn` - Create walk-in

**Step 2: Validate business rules**

Check these business rules:
- Appointments must have valid artist ID
- Appointments must have valid customer info
- Time slots cannot overlap for same artist
- Status transitions must follow valid order
- Deposit tracking must match payment records

**Step 3: Check calendar integration**

Verify calendar components:
- Proper date/time handling
- Timezone considerations
- Recurring appointment handling
- Calendar view updates correctly

**Step 4: Test appointment workflows**

Manually test:
- Create appointment → verify all fields saved
- Create appointment with details → verify tattoo details linked
- Update status → verify status history
- Create walk-in → verify walk-in flag set
- Time conflict → verify overlap detection

**Step 5: Document and fix issues**

Createissue list with:
- Scheduling conflicts not handled
- Missing status transition validation
- Timezone issues

**Step 6: Commit appointment fixes**

```bash
git add server/actions/appointments.ts app/appointments/ app/calendar/ components/appointments/
git commit -m "fix: resolve appointments business logic issues and scheduling validation"
```

---

### Task 13: Validate Inventory Business Logic

**Files:**
- Read: `server/actions/inventory.ts`
- Read: `app/inventory/page.tsx`
- Read: `components/inventory/` (all components)
- Modify: Issues found during validation
- Test: Manual testing of inventory flows

**Step 1: Review inventory action functions**

List all functions in `inventory.ts`:
- `getInventory` - Fetch inventory items
- `getInventoryItem` - Fetch single item
- `createInventoryItem` - Create new item
- `updateInventoryItem` - Update item
- `deleteInventoryItem` - Delete item
- `restockInventory` - Add stock
- `exportInventory` - Export to CSV
- `getRestockLog` - Fetch restock history

**Step 2: Validate business rules**

Check these business rules:
- Item codes must be unique per branch- Quantity cannot go below zero
- Restock must create log entry
- Low stock threshold must trigger alerts
- Items linked to sales must have proper tracking

**Step 3:Checklow stock alerts**

Verify low stock functionality:
- Threshold is checked on every stock change
- Alerts are properly triggered
- Alert notifications sent to correct users
- Alert history is maintained

**Step 4: Test inventory workflows**

Manually test:
- Create item → verify all fields saved
- Update quantity → verify restock log created
- Delete item → verify no broken references
- Export inventory → verify CSV format
- Low stock → verify alert triggers

**Step 5: Document and fix issues**

Createissue list with:
- Quantity calculation errors
- Missing restock log entries
- Broken sales references

**Step 6: Commit inventory fixes**

```bash
git add server/actions/inventory.ts app/inventory/ components/inventory/
git commit -m "fix: resolve inventory business logic issues and quantity tracking"
```

---

### Task 14: Validate Sales/POS Business Logic

**Files:**
- Read: `server/actions/transactions.ts`
- Read: `app/sales/page.tsx`
- Read: `app/transactions/page.tsx`
- Read: `components/sales/` (all components)
- Read: `components/sales/context/SalesContext.tsx`
- Modify: Issues found during validation
- Test: Manual testing of POS flows

**Step 1: Review transaction action functions**

List all functions in `transactions.ts`:
- `getTransactions` - Fetch transactions with filters
- `getTransactionById` - Fetch single transaction
- `createTransaction` - Create new transaction
- `updateTransaction` - Update transaction
- `voidTransaction` - Void/cancel transaction
- `getTransactionPayments` - Fetch payment details

**Step 2: Validate business rules**

Check these business rules:
- Transactions must have valid items
- Payment amounts must equal transaction total
- Voided transactions cannot be restored
- Tax calculations must be accurate
- Discount rules must be validated

**Step 3: Check SalesContext state management**

Review `SalesContext.tsx` for:
- Proper state initialization
- Cart management logic
- Payment split handling
- Error handling in state updates

**Step 4: Test POS workflows**

Manually test:
- Create sale with items → verify total calculated
- Apply discount → verify correct calculation
- Split payment → verify amounts match
- Void transaction → verify items restored
- Print receipt → verify correct format

**Step 5: Document and fix issues**

Createissue list with:
- Tax calculation issues
- Payment split bugs
- Void transaction not restoring stock

**Step 6: Commit POS fixes**

```bash
git add server/actions/transactions.ts app/sales/ app/transactions/ components/sales/
git commit -m "fix: resolve POS business logic issues and payment handling"
```

---

### Task 15: Validate Payroll Business Logic

**Files:**
- Read: `server/actions/payroll.ts`
- Read: `server/actions/time-clock.ts`
- Read: `app/payroll/page.tsx`
- Read: `app/my-payroll/page.tsx`
- Modify: Issues found during validation
- Test: Manual testing of payroll flows

**Step 1: Review payroll action functions**

List all functions in `payroll.ts`:
- `getPayrollStaffRates` - Fetch staff rates
- `createPayrollStaffRate` - Create rate for staff
- `updatePayrollStaffRate` - Update rate
- `deletePayrollStaffRate` - Delete rate
- `processPayroll` - Process payroll (check if implemented)
- `getPayrollRequests` - Fetch payroll requests
- `approvePayrollRequest` - Approve request
- `rejectPayrollRequest` - Reject request

**Step 2: Validate time clock integration**

Check `time-clock.ts` for:
- Clock in/out time tracking
- Break duration handling
- Overtime calculation
- Schedule validation

**Step 3: Verify payroll calculation**

Check these calculations:
- Hourly rate × hours worked = base pay
- Overtime rate applied correctly
- Deductions calculated properly
- Net pay calculation accurate

**Step 4: Test payroll workflows**

Manually test:
- Create staff rate → verify saved correctly
- Process payroll → verify calculations
- Approve payroll → verify status change
- View my payroll → verify staff can see own data
- Time clock integration → verify hours logged

**Step 5: Implement missing functions**

If functions are stubbed:
- Implement `processPayroll` fully
- Implement payroll period handling
- Add payroll history tracking

**Step 6: Commit payroll fixes**

```bash
git add server/actions/payroll.ts server/actions/time-clock.ts app/payroll/ app/my-payroll/
git commit -m "fix: complete payroll module implementation and time clock integration"
```

---

### Task 16: Validate Branch Management Business Logic

**Files:**
- Read: `server/actions/branches.ts`
- Read: `app/(app)/admin/branches/page.tsx`
- Read: `utils/auth/permissions.ts`
- Modify: Issues found during validation
- Test: Manual testing of branch management

**Step 1: Review branch action functions**

List all functions in `branches.ts`:
- `getBranches` - Fetch all branches (IT admin only)
- `getBranchById` - Fetch single branch
- `createBranch` - Create new branch
- `updateBranch` - Update branch
- `deleteBranch` - Delete branch

**Step 2: Validate permission checks**

Verify permission enforcement:
- Only IT admins can manage branches
- Regular users cannot access branch management
- Branch-scoped data access is enforced

**Step 3: Check multi-branch data isolation**

Verify:
- Users only see data from their branch
- Branch switching properly filters data
- Cross-branch access is prevented

**Step 4: Test branch workflows**

Manually test:
- Create branch → verify IT admin required
- Update branch → verify changes saved
- Switch branch → verify data filtered
- Delete branch → verify cascade handled

**Step 5: Document and fix issues**

Createissue list with:
- Permission bypass vulnerabilities
- Missing branch scope checks
- Data leakage across branches

**Step 6: Commit branch fixes**

```bash
git add server/actions/branches.ts app/(app)/admin/branches/ utils/auth/permissions.ts
git commit -m "fix: enforce branch management permissions and multi-branch data isolation"
```

---

## Part 3: Scripts & Configuration Audit

### Task 17: Audit package.json Scripts

**Files:**
- Modify: `package.json`
- Read: `scripts/*.ts` (all scripts)
- Create: `docs/plans/scripts-audit.md`

**Step 1: List all current scripts**

Read `package.json` scripts section:

| Script | Command | Status |
|--------|---------|--------|
| `dev` | `next dev --turbopack --experimental-https` | Verify|
| `build` | `next build --turbopack` | Verify|
| `start` | `next start` | Verify|
| `lint` | `eslint` | Verify|
| `merge` | Git workflow | Verify|
| `invite` | `bun run scripts/generate-invite.ts` | Verify|
| `db:generate` | `drizzle-kit generate` | Verify|
| `db:push` | `drizzle-kit push` | Verify|
| `db:pull` | `drizzle-kit pull` | Verify|
| `db:drop` | `drizzle-kit drop` | Verify|
| `seed` | `bun run scripts/seed-database.ts` | Verify|
| `setup` | `bun run scripts/setup-database.ts` | Verify|

**Step 2: Verify each script works**

Test each script:
```bash
bun run dev --help 2>/dev/null || echo "dev needs testing"
bun run build --help 2>/dev/null || echo "build needs testing"
bun run lint --help 2>/dev/null || echo "lint needs testing"
bun run db:generate --help 2>/dev/null || echo "db:generate needs testing"
```

**Step 3: Check script dependencies**

Verify each script:
- Imports are valid
- Environment variables accessed exist
- Database references are correct
- File paths resolve correctly

**Step 4: Add missing scripts**

Consider adding:
- `db:migrate` - Run pending migrations
- `db:studio` - Open Drizzle Studio
- `typecheck` - Run TypeScript check
- `test` - Run test suite (when added)

**Step 5: Update package.json**

Add missing scripts:
```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "db:studio": "drizzle-kit studio"
  }
}
```

**Step 6: Commit script updates**

```bash
git add package.json
git commit -m "chore: add typecheck script and verify all npm scripts"
```

---

### Task 18: Audit Database Setup Scripts

**Files:**
- Read: `scripts/setup-database.ts`
- Read: `scripts/seed-database.ts`
- Read: `scripts/generate-invite.ts`
- Read: `scripts/test-auth.ts`
- Read: `scripts/check-schema.ts`
- Modify: Issues found during audit
- Test: Run scripts in test environment

**Step 1: Audit setup-database.ts**

Verify script:
- Connects to database correctly
- Creates required tables
- Handles errors gracefully
- Provides progress feedback
- Can be run idempotently

**Step 2: Audit seed-database.ts**

Verify script:
- Seeds default settings correctly
- Creates default accounting categories
- Creates default payroll rates
- Handles duplicate seeding (idempotent)
- Uses correct default values

**Step 3: Audit generate-invite.ts**

Verify script:
- Creates valid invitation codes
- Handles command line arguments
- Outputs clear instructions
- Validates input parameters

**Step 4: Test scripts**

Run scripts in test mode:
```bash
bun run scripts/check-schema.ts
bun run scripts/seed-database.ts
bun run scripts/generate-invite.ts --help
```

**Step 5: Fix script issues**

Address:
- Missing error handling
- Incorrect imports
- Hardcoded values that should be config
- Missing validation

**Step 6: Commit script fixes**

```bash
git add scripts/
git commit -m "fix: update database scripts with proper error handling and validation"
```

---

### Task 19: Verify Drizzle Configuration

**Files:**
- Read: `drizzle.config.ts`
- Read: `server/db/index.ts`
- Modify: Configuration if needed
- Test: Connection verification

**Step 1: Audit drizzle.config.ts**

Verify configuration:
```typescript
export default defineConfig({
    out: './drizzle',
    schema: './server/db/schema.ts',
    dialect: 'postgresql',
    dbCredentials: { url: process.env.DATABASE_URL },
})
```

Check:
- `out` directory exists or can be created
- `schema` path resolves correctly
- `DATABASE_URL` is properly referenced
- SSL configuration for production

**Step 2: Audit database connection**

Read `server/db/index.ts`:
- Pool configuration is correct
- SSL handling for production
- Connection pool size appropriate
- Error handling on connection failures

**Step 3: Verify schema exports**

Check `server/db/schema.ts`:
- All models exported correctly
- Relations defined properly
- Indexes defined where needed
- Constraints properly defined

**Step 4: Test database connection**

```bash
bun run scripts/check-schema.ts
```

Expected: All tables accessible, no connection errors

**Step 5: Add production SSL configuration**

Update database connection for production:
```typescript
// server/db/index.ts
const ssl = process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: true }
    : false

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl,
    max: 10
})
```

**Step 6: Commit config updates**

```bash
git add drizzle.config.ts server/db/index.ts
git commit -m "fix: configure database connection for production with proper SSL"
```

---

### Task 20: Verify Database Schema Integrity

**Files:**
- Read: `server/db/schema/*.ts` (all 13 schema files)
- Read: `supabase/migrations/*.sql` (all migration files)
- Create: `docs/plans/schema-audit.md`
- Modify: Schema issues found

**Step 1: Inventory all schema files**

List schema files in `server/db/schema/`:

| File | Tables | Status |
|------|--------|--------|
| `auth.ts` | user, session, account, verification, twoFactor, passkey | Verify|
| `accounting.ts` | accountingCategory, generalLedger | Verify|
| `appointments.ts` | appointments, tattooDetails, shoeDetails, piercingDetails, appointmentServices | Verify|
| `branches.ts` | branches | Verify|
| `inventory.ts` | inventory, restockLog | Verify|
| `invitations.ts` | invitations | Verify|
| `logs.ts` | systemLogs | Verify|
| `payroll.ts` | payrollStaffRate, payrollEntry, payrollRequest, paymentMethod | Verify|
| `services.ts` | services, serviceItems | Verify|
| `settings.ts` | systemSettings | Verify|
| `storage.ts` | storageFiles | Verify|
| `timeclock.ts` | timeClockEntries, staffSchedules | Verify|
| `transactions.ts` | transactions, transactionItems, transactionPayments | Verify|

**Step 2: Verify table relationships**

Check foreign key relationships:
- User → Branch (branchId)
- Appointment → User (artistId, customerId)- Transaction → User (userId)
- Inventory → Branch (branchId)
- All logs → User (userId)

**Step 3: Check for missing indexes**

Identify tables needing indexes:
- `appointments` - Index on date, artistId, status
- `transactions` - Index on date, userId
- `inventory` - Index on item_code, branchId
- `systemLogs` - Index on created_at, type

**Step 4: Verify migration files**

Check `supabase/migrations/`:
- All migrations are numbered correctly
- No conflicting migrations
- Migrations match schema definitions

**Step 5: Create missing indexes**

Add indexes for performance:
```typescript
// In respective schema files
pgIndex('appointments_date_idx').on(appointments.date)
pgIndex('appointments_artist_idx').on(appointments.artistId)
pgIndex('transactions_date_idx').on(transactions.createdAt)
```

**Step 6: Commit schema fixes**

```bash
git add server/db/schema/
git commit -m "feat: add missing indexes and verify schema relationships"
```

---

### Task 21: Verify Drizzle Migrations

**Files:**
- Read: `supabase/migrations/*.sql`
- Create: `drizzle/` directory for migrations (if not exists)
- Check: Migration consistency
- Test: Migration execution

**Step 1: Audit existing migrations**

List all migration files:
```bash
ls -la supabase/migrations/*.sql
```

Check for:
- Sequential numbering
- Descriptive names
- No duplicate migrations
- Reversible migrations (down migrations)

**Step 2: Compare migrations with schema**

For each schema change:
1. Check if migration exists
2. Verify migration matches schema definition
3. Check for orphaned migrations (no schema match)

**Step 3: Generate missing migrations**

```bash
bun run db:generate
```

Expected: Drizzle Kit detects schema changes and generates migration

**Step 4: Create migration convention**

Establish migration naming:
- `0001_initial_schema.sql`
- `0002_add_appointment_details.sql`
- `0003_add_inventory_tracking.sql`

**Step 5: Document migration process**

Add to README:
```markdown
## Database Migrations

1. Make schema changes in `server/db/schema/*.ts`
2. Run `bun run db:generate` to create migration
3. Review generated SQL in `drizzle/migrations/`
4. Run `bun run db:push` to apply to database
```

**Step 6: Commit migration docs**

```bash
git add drizzle/ (if created) docs/plans/migration-guide.md
git commit -m "docs: document database migration process and verify existing migrations"
```

---

### Task 22: Add Database Connection Health Check

**Files:**
- Create: `app/api/health/db/route.ts`
- Modify: `server/db/index.ts` (add health check)
- Test: Health endpoint

**Step 1: Create health check endpoint**

Create `app/api/health/db/route.ts`:
```typescript
import { db } from '@/server/db'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        await db.execute(sql`SELECT 1`)
        return NextResponse.json({ 
            status: 'healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
        })
    } catch (error) {
        return NextResponse.json({ 
            status: 'unhealthy',
            database: 'disconnected',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        }, { status: 503 })
    }
}
```

**Step 2: Add connection pooling health**

Update `server/db/index.ts`:
```typescript
export async function checkDatabaseConnection(): Promise<boolean> {
    try {
        await db.execute(sql`SELECT 1`)
        return true
    } catch {
        return false
    }
}
```

**Step 3: Test health endpoint**

```bash
curl http://localhost:3000/api/health/db
```

Expected: `{"status":"healthy","database":"connected","timestamp":"..."}`

**Step 4: Add to monitoring**

Configure for:
- Dokploy health checks
- Kubernetes probes (if applicable)
- Load balancer health checks

**Step 5: Commit health check**

```bash
git add app/api/health/db/ server/db/index.ts
git commit -m "feat: add database health check endpoint for monitoring"
```

---

## Part 4: Documentation Update

### Task 23: Update README with Installation Instructions

**Files:**
- Modify: `README.md`
- Create: `docs/SETUP.md` (detailed setup)
- Read: `.env.example`

**Step 1: Audit current README**

Read current README.md and identify:
- Missing installation steps
- Outdated commands
- Missing environment variable documentation
- Unclear deployment instructions

**Step 2: Create comprehensive installation section**

Update README.md with:

```markdown
## Installation

### Prerequisites

- Node.js 20+
- Bun 1.1.38+
- PostgreSQL 15+
- S3-compatible storage (MinIO, AWS S3, or Supabase Storage)

### Quick Start

1. **Clone the repository**
   \`\`\`bash
   git clone <repository-url>
   cd inksight-rdmd
   \`\`\`

2. **Install dependencies**
   \`\`\`bash
   bun install
   \`\`\`

3. **Set up environment variables**
   \`\`\`bash
   cp .env.example .env.local
   # Edit .env.local with your values
   \`\`\`

4. **Set up the database**
   \`\`\`bash
   # Push schema to database
   bun run db:push
   
   # Seed default data
   bun run seed
   \`\`\`

5. **Create admin user**
   \`\`\`bash
   bun run invite --email admin@example.com
   \`\`\`

6. **Start development server**
   \`\`\`bash
   bun run dev
   \`\`\`
```

**Step 3: Document environment variables**

Create comprehensive environment variable documentation:

```markdown
## Environment Variables

### Required Variables

| Variable |Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `NEXT_PUBLIC_APP_URL` | Public URL of the application | `https://inksight.example.com` |
| `BETTER_AUTH_SECRET` | Secret for session encryption | `your-32-char-secret` |
| `BETTER_AUTH_URL` | Auth service URL | `https://inksight.example.com` |

### S3 Storage Variables

| Variable |Description | Example |
|----------|-------------|---------|
| `S3_ACCESS_KEY` | S3 access key | `your-access-key` |
| `S3_SECRET_KEY` | S3 secret key | `your-secret-key` |
| `S3_BUCKET` | S3 bucket name | `inksight-storage` |
| `S3_ENDPOINT` | S3 endpoint URL | `https://s3.example.com` |
| `S3_REGION` | S3 region | `us-east-1` |

### Email Variables (Resend)

| Variable |Description | Example |
|----------|-------------|---------|
| `RESEND_API_KEY` | Resend API key | `re_xxxxx` |
| `EMAIL_FROM` | Sender email address | `noreply@example.com` |
```

**Step 4: Add troubleshooting section**

```markdown
## Troubleshooting

### Database Connection Issues

1. Verify `DATABASE_URL` is correct
2. Check PostgreSQL is running: `pg_isready`
3. Test connection: `bun run scripts/check-schema.ts`

### Authentication Issues

1. Verify `BETTER_AUTH_SECRET` is set
2. Check cookies are being set correctly
3. Clear browser cookies and try again

### S3 Upload Issues

1. Verify S3 credentials are correct
2. Check bucket exists and has correct permissions
3. Verify endpoint URL is accessible
```

**Step 5: Commit README updates**

```bash
git add README.md docs/SETUP.md
git commit -m "docs: add comprehensive installation instructions and environment variable documentation"
```

---

### Task 24: Create Dokploy Deployment Guide

**Files:**
- Create: `docs/DEPLOYMENT.md`
- Modify: `README.md` (add link to deployment guide)
- Create: `docs/dokploy-setup.md`

**Step 1: Create comprehensive deployment documentation**

Create `docs/DEPLOYMENT.md`:

```markdown
# Deployment Guide

This guide covers deploying Inksight RDMD to Dokploy (self-hosted PaaS).

## Prerequisites

- Dokploy instance running
- PostgreSQL database (Dokploy or external)
- S3-compatible storage
- Resend account for emails
- Domain name with DNS configured

## Dokploy Setup

### 1. Create Application

1. Navigate to your Dokploy dashboard
2. Create new application:
   - **Name:** `inksight-rdmd`
   - **Source:** Git repository
   - **Branch:** `main`
   - **Build Pack:** Nixpacks

### 2. Configure Environment

Add all required environment variables in Dokploy dashboard:

\`\`\`env
DATABASE_URL=postgresql://...
NEXT_PUBLIC_APP_URL=https://your-domain.com
BETTER_AUTH_SECRET=your-secret
BETTER_AUTH_URL=https://your-domain.com
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=...
S3_ENDPOINT=...
S3_REGION=...
RESEND_API_KEY=...
EMAIL_FROM=noreply@your-domain.com
\`\`\`

### 3. Configure Database

Option A: Dokploy PostgreSQL
\`\`\`
1. Create PostgreSQL service in Dokploy
2. Note the connection string
3. Add DATABASE_URL to environment variables
\`\`\`

Option B: External PostgreSQL
\`\`\`
1. Set up PostgreSQL server
2. Create database and user
3. Add DATABASE_URL to environment variables
\`\`\`

### 4. Configure Storage

For S3-compatible storage (MinIO, AWS S3, Supabase):
- Create bucket with public read access for images
- Generate access keys
- Configure S3_* environment variables

### 5. Configure Email (Resend)

1. Create Resend account
2. Verify domain
3. Generate API key
4. Configure RESEND_API_KEY and EMAIL_FROM

### 6. Deploy

\`\`\`bash
# Trigger deployment from Dokploy dashboard
# Or push to main branch for automatic deployment
\`\`\`

### 7. Post-Deployment

\`\`\`bash
# Run database migrations
bun run db:push

# Seed default data
bun run seed

# Create admin user
bun run invite --email admin@your-domain.com
\`\`\`

## Health Checks

Configure health checks in Dokploy:
- **Path:** `/api/health/db`
- **Interval:** 30s
- **Timeout:** 10s
```

**Step 2: Add DNS configuration**

```markdown
## DNS Configuration

### Domain Setup

1. Add domain in Dokploy dashboard
2. Configure DNS records:

| Type | Name | Value |
|------|------|-------|
| A | @ | Your server IP |
| CNAME | www | your-domain.com |

3. Enable SSL/HTTPS (Let's Encrypt)
```

**Step 3: Add monitoring setup**

```markdown
## Monitoring

### Logs

View logs in Dokploy dashboard or:
\`\`\`bash
# SSH into server
docker logs inksight-rdmd --follow
\`\`\`

### Health Monitoring

Configure alerts for:
- Database connection failures
- High memory usage
- Response time degradation
```

**Step 4: Add backup procedures**

```markdown
## Backup

### Database Backup

\`\`\`bash
# PostgreSQL backup
pg_dump -h localhost -U postgres inksight > backup_$(date +%Y%m%d).sql

# Restore
psql -h localhost -U postgres inksight < backup_20250323.sql
\`\`\`

### S3 Backup

Configure S3 versioning or cross-region replication for storage backup.
```

**Step 5: Commit deployment docs**

```bash
git add docs/DEPLOYMENT.md docs/dokploy-setup.md README.md
git commit -m "docs: add comprehensive Dokploy deployment guide with S3 and Resend setup"
```

---

### Task 25: Create Environment Variable Validation

**Files:**
- Create: `utils/env.ts`
- Create: `scripts/validate-env.ts`
- Modify: `server/db/index.ts` (add env check)
- Test: Validation script

**Step 1: Create environment variable schema**

Create `utils/env.ts`:

```typescript
import { z } from 'zod'

const envSchema = z.object({
    // Database
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
    
    // Authentication
    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
    BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL must be a valid URL'),
    NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL'),
    
    // Storage
    S3_ACCESS_KEY: z.string().min(1, 'S3_ACCESS_KEY is required'),
    S3_SECRET_KEY: z.string().min(1, 'S3_SECRET_KEY is required'),
    S3_BUCKET: z.string().min(1, 'S3_BUCKET is required'),
    S3_ENDPOINT: z.string().url('S3_ENDPOINT must be a valid URL'),
    S3_REGION: z.string().default('us-east-1'),
    
    // Email
    RESEND_API_KEY: z.string().startsWith('re_', 'RESEND_API_KEY must start with "re_"'),
    EMAIL_FROM: z.string().email('EMAIL_FROM must be a valid email'),
    
    // Environment
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(): Env {
    const parsed = envSchema.safeParse(process.env)
    
    if (!parsed.success) {
        console.error('❌ Invalid environment variables:')
        parsed.error.issues.forEach((issue) => {
            console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
        })
        process.exit(1)
    }
    
    return parsed.data
}

// Lazy-loaded validated env
let _env: Env | null = null

export function getEnv(): Env {
    if (!_env) {
        _env = validateEnv()
    }
    return _env
}
```

**Step 2: Create validation script**

Create `scripts/validate-env.ts`:

```typescript
#!/usr/bin/env bun
import { validateEnv } from '../utils/env'
import 'dotenv/config'

console.log('🔍 Validating environment variables...\n')

try {
    const env = validateEnv()
    console.log('✅ All environment variables are valid!\n')
    console.log('Environment:', env.NODE_ENV)
    console.log('Database:', env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'))
    console.log('App URL:', env.NEXT_PUBLIC_APP_URL)
    console.log('S3 Endpoint:', env.S3_ENDPOINT)
    console.log('Email From:', env.EMAIL_FROM)
} catch (error) {
    console.error('❌ Environment validation failed')
    process.exit(1)
}
```

**Step 3: Add validation to scripts in package.json**

```json
{
  "scripts": {
    "validate:env": "bun run scripts/validate-env.ts"
  }
}
```

**Step 4: Import in application entry**

Update `server/db/index.ts` to validate env on startup:

```typescript
import { getEnv } from '@/utils/env'

// Validate env before connecting
const env = getEnv()

const pool = new Pool({ connectionString: env.DATABASE_URL })
```

**Step 5: Test validation**

```bash
bun run validate:env
```

Expected: All variables validated or clear error messages

**Step 6: Commit env validation**

```bash
git add utils/env.ts scripts/validate-env.ts package.json server/db/index.ts
git commit -m "feat: add environment variable validation with Zod schema"
```

---

### Task 26: Final Integration Testing and Cleanup

**Files:**
- Test: All server actions
- Test: All UI components
- Test: All workflows
- Modify: Any issues found
- Create: `docs/TESTING.md`

**Step 1: Run comprehensive type check**

```bash
bunx tsc --noEmit
```

Expected: Zero TypeScript errors

**Step 2: Run linting**

```bash
bun run lint
```

Expected: Zero ESLint errors (warnings acceptable)

**Step 3: Test database connection**

```bash
bun run scripts/check-schema.ts
```

Expected: All tables accessible

**Step 4: Test environment validation**

```bash
bun run validate:env
```

Expected: All variables valid

**Step 5: Manual workflow testing**

Test all critical workflows:
1. User authentication
2. Appointment creation
3. Inventory management
4. Sales/POS transaction
5. Payroll processing
6. Branch management

**Step 6: Create testing documentation**

Create `docs/TESTING.md`:

```markdown
# Testing Guide

## Prerequisites

- Development database running
- Environment variables configured
- Test user accounts created

## Manual Testing Checklist

### Authentication
- [ ] Sign up with invitation code
- [ ] Sign in with credentials
- [ ] Password reset flow
- [ ] Two-factor authentication
- [ ] Session persistence

### Appointments
- [ ] Create new appointment
- [ ] Create appointment with details
- [ ] Update appointment status
- [ ] Create walk-in
- [ ] Calendar integration

### Inventory
- [ ] Create inventory item
- [ ] Update stock quantity
- [ ] Restock logging
- [ ] Export inventory

### Sales/POS
- [ ] Create transaction
- [ ] Apply discount
- [ ] Split payment
- [ ] Void transaction

### Payroll
- [ ] Time clock in/out
- [ ] Create payroll request
- [ ] Approve/reject payroll
- [ ] View payroll history

### Admin
- [ ] Branch management
- [ ] User management
- [ ] System settings
```

**Step 7: Commit final cleanup**

```bash
git add docs/TESTING.md
git add -u(remaining changes)
git commit -m "docs: add testing documentation and complete final integration testing"
```

---

## Summary

| Task | Category | Priority |
|------|----------|----------|
| 1-6 | Server Actions | High |
| 7-9 | Server Actions (continued) | High |
| 10-16 | Business Logic | High |
| 17-22 | Scripts & Drizzle | Medium |
| 23-26 | Documentation | Medium |

**Estimated Time:** 20-30 hours total

**Dependencies:**
- Tasks 1-3 should be completed first (foundation)
- Tasks 4-9 depend on Task 2 (response types)
- Tasks 10-16 can be done in parallel
- Tasks 17-22 can be done in parallel
- Tasks 23-26 should be done last

**Risk Areas:**
- Payroll module requires significant implementation work
- Transaction handling changes may affect existing data
- Environment variable validation may require .env updates

---

## Execution Options

Plan complete and saved to `docs/plans/2025-03-23-comprehensive-audit-refactor.md`.

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach would you like to take?**