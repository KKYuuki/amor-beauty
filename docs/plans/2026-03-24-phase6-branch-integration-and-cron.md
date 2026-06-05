# Phase 6: Branch Integration, Cron Jobs, and Enhancements

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete branch filtering across all modules, implement automatic QR code management via Dokploy cron jobs, and enhance time clock access controls.

**Architecture:** 
- Extend BranchProvider pattern to Sales, Payroll, and Metrics modules
- Create protected API endpoint for daily maintenance tasks (QR rotation, cleanup)
- Modify time clock actions to allow `time_clock_admin` role in addition to admin

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, PostgreSQL, Server Actions

---

## Task 0: Commit Pending TypeScript Fixes

**Goal:** Commit the TypeScript fixes made during bug resolution before starting new work.

**Files:**
- Modify: `components/clock/QRCodeDisplay.tsx`
- Modify: `components/clock/TimeClockCalendar.tsx`
- Modify: `components/dashboard/timeClockWidget.tsx`
- Modify: `components/sales/context/SalesContext.tsx`
- Modify: `server/actions/time-clock.ts`

**Step 1: Stage modified files**

Run:
```bash
git add components/clock/QRCodeDisplay.tsx components/clock/TimeClockCalendar.tsx components/dashboard/timeClockWidget.tsx components/sales/context/SalesContext.tsx server/actions/time-clock.ts
```

**Step 2: Commit with descriptive message**

Run:
```bash
git commit -m "fix: resolve TypeScript errors in time-clock and sales modules

- Add branchName/branchCode to GenerateQRCodeResult type
- Fix branchId parameter type in TimeClockCalendar (null → undefined)
- Update timeClockWidget to use ClockStatusResult type
- Fix handleAppointmentSelect type mismatch in SalesContext
- Remove unused imports from time-clock.ts
- Clean up type definitions for consistency"
```

**Step 3: Verify commit**

Run:
```bash
git log --oneline -1
```

Expected: Shows the new commit

---

## Task 1: Create Sales Branch Filter

**Goal:** Add branch filtering to the Sales/POS module so transactions and inventory can be filtered by branch.

**Files:**
- Modify: `components/sales/context/SalesContext.tsx`
- Modify: `app/sales/salesPage.tsx`

**Step 1: Add branch context to SalesContext**

Read `components/sales/context/SalesContext.tsx` to understand its structure, then add branch filtering:

```tsx
// Add at top with other imports
import { useBranchContext } from "@/components/branch-context"

// Inside SalesProvider component, add branch context
const { currentBranch } = useBranchContext()

// Modify fetchInventory call to filter by branch
// Filter by: item.branch_id === currentBranch?.id OR item.is_shared === true
// When currentBranch is null (All Branches), show all items

// Modify fetchServices call similarly
// Modify fetchAppointments call similarly
```

**Step 2: Add BranchSelector to salesPage.tsx**

Read `app/sales/salesPage.tsx`, then add BranchSelector in the header section:

```tsx
// Add import
import { BranchSelectorInline } from "@/components/branch-selector"
import { useBranchContext } from "@/components/branch-context"

// Inside SalesContent component
const { currentBranch, setCurrentBranch, branches, isLoading: branchesLoading } = useBranchContext()

// Add in header area (after SalesHeader or in a new header row)
<div className="flex items-center gap-4 mb-4">
    <BranchSelectorInline 
        branches={branches}
        currentBranch={currentBranch}
        onSelect={setCurrentBranch}
        isLoading={branchesLoading}
    />
</div>
```

**Step 3: Verify the component compiles**

Run:
```bash
bun run lint 2>&1 | head -50
```

Expected: No new errors

**Step 4: Commit**

Run:
```bash
git add components/sales/context/SalesContext.tsx app/sales/salesPage.tsx
git commit -m "feat(sales): add branch filtering to Sales module

- Integrate BranchContext in SalesContext
- Filter inventory by branch or shared items
- Filter services by branch or shared services
- Filter appointments by branch
- Add BranchSelector to sales page header"
```

---

## Task 2: Create Payroll Branch Filter

**Goal:** Add branch filtering to Payroll module so payroll entries and requests can be filtered by branch.

**Files:**
- Modify: `app/payroll/payrollPage.tsx`
- Modify: `server/actions/payroll.ts` (if branch_id not already in queries)

**Step 1: Review payroll schema and actions**

Run:
```bash
grep -n "branch" server/actions/payroll.ts | head -20
```

Expected: Check if payroll entries have branch_id

**Step 2: Add branch filtering to payroll queries**

If `time_clock_entries` already has `branch_id` (confirmed from previous implementation), modify payroll actions to join with time clock entries and filter by branch.

**Step 3: Add branch context to payrollPage.tsx**

```tsx
// Add imports
import { useBranchContext } from "@/components/branch-context"
import { BranchSelectorInline } from "@/components/branch-selector"

// Inside component
const { currentBranch, setCurrentBranch, branches } = useBranchContext()

// Add BranchSelector in header
// Filter payroll requests/entries by currentBranch
```

**Step 4: Commit**

Run:
```bash
git add app/payroll/payrollPage.tsx server/actions/payroll.ts
git commit -m "feat(payroll): add branch filtering to Payroll module

- Integrate BranchContext in payroll page
- Filter payroll entries by staff's clock-in branch
- Filter payroll requests by branch
- Add BranchSelector to payroll page header"
```

---

## Task 3: Create Metrics Branch Filter

**Goal:** Add branch filtering to Metrics/Analytics module so business insights can be filtered by branch.

**Files:**
- Modify: `app/metrics/metricsPage.tsx`
- Modify: `components/metrics/businessInsights.tsx`
- Modify: `components/metrics/ExecutiveAccounting.tsx`
- Modify: `components/metrics/logsMetrics.tsx` (if different from admin logs)

**Step 1: Review metrics components**

Check what data each metrics component displays and how it's fetched.

**Step 2: Add BranchProvider integration if not present**

```tsx
// In metricsPage.tsx
import { useBranchContext } from "@/components/branch-context"
import { BranchSelector } from "@/components/branch-selector"

// Add BranchSelector in the tab header area
```

**Step 3: Pass branch context to child components**

```tsx
// Pass currentBranch to BusinessInsights, ExecutiveAccounting
<BusinessInsights branchId={currentBranch?.id} />
<ExecutiveAccounting branchId={currentBranch?.id} />
```

**Step 4: Update component props and server actions**

Each metrics component needs to accept `branchId` and pass it to their data fetching functions.

**Step 5: Commit**

Run:
```bash
git add app/metrics/metricsPage.tsx components/metrics/businessInsights.tsx components/metrics/ExecutiveAccounting.tsx
git commit -m "feat(metrics): add branch filtering to Metrics module

- Integrate BranchContext in metrics page
- Add BranchSelector to metrics header
- Pass branchId to BusinessInsights and ExecutiveAccounting
- Filter analytics data by branch"
```

---

## Task 4: Create Daily Maintenance API Endpoint

**Goal:** Create a protected API endpoint that Dokploy cron can call at midnight to perform daily maintenance tasks.

**Files:**
- Create: `app/api/cron/daily/route.ts`
- Modify: `server/utils/qr-code.ts`
- Modify: `server/actions/time-clock.ts`

**Step 1: Create the API route file**

Create `app/api/cron/daily/route.ts`:

```tsx
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/server/db"
import { qrSessions, branches } from "@/server/db/schema"
import { eq, and, lt, isNotNull } from "drizzle-orm"
import { nanoid } from "nanoid"
import { createLogs } from "@/server/actions/logs"

// Cron job secret for authentication
const CRON_SECRET = process.env.CRON_SECRET

interface DailyMaintenanceResult {
    success: boolean
    timestamp: string
    tasks: {
        qrDeactivation: {
            count: number
            details: string[]
        }
        qrGeneration: {
            count: number
            details: string[]
        }
        logCleanup: {
            count: number
            olderThanDays: number
        }
        sessionCleanup: {
            count: number
        }
    }
    errors: string[]
}

export async function GET(request: NextRequest) {
    const startTime = Date.now()
    const result: DailyMaintenanceResult = {
        success: true,
        timestamp: new Date().toISOString(),
        tasks: {
            qrDeactivation: { count: 0, details: [] },
            qrGeneration: { count: 0, details: [] },
            logCleanup: { count: 0, olderThanDays: 90 },
            sessionCleanup: { count: 0 },
        },
        errors: [],
    }

    try {
        // Verify cron secret (from header or query param)
        const authHeader = request.headers.get("authorization")
        const querySecret = request.nextUrl.searchParams.get("secret")
        const providedSecret = authHeader?.replace("Bearer ", "") || querySecret

        if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
            await createLogs({
                logs: [{
                    level: "WARN",
                    type: "SYSTEM",
                    message: "Unauthorized cron attempt: invalid or missing secret",
                }]
            })
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            )
        }

        const now = new Date()
        const today = new Date(now.setHours(0, 0, 0, 0))
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)

        // ========================================
        // TASK 1: Deactivate old QR codes
        // ========================================
        try {
            const oldQRCodes = await db
                .update(qrSessions)
                .set({ isActive: false })
                .where(
                    and(
                        eq(qrSessions.isActive, true),
                        lt(qrSessions.validDate, today)
                    )
                )
                .returning({ id: qrSessions.id, branchId: qrSessions.branchId })

            result.tasks.qrDeactivation.count = oldQRCodes.length
            result.tasks.qrDeactivation.details = oldQRCodes.map(q => 
                `QR session ${q.id.slice(0, 8)}... deactivated`
            )

            await createLogs({
                logs: [{
                    level: "INFO",
                    type: "SYSTEM",
                    message: `Cron: Deactivated ${oldQRCodes.length} expired QR codes`,
                }]
            })
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error"
            result.errors.push(`QR Deactivation failed: ${errorMsg}`)
            result.success = false
        }

        // ========================================
        // TASK 2: Generate new QR codes for all active branches
        // ========================================
        try {
            const activeBranches = await db
                .select({ id: branches.id, name: branches.name, code: branches.code })
                .from(branches)
                .where(eq(branches.isActive, true))

            const newQRCodes: string[] = []

            for (const branch of activeBranches) {
                // Generate QR code string
                const shortBranchId = branch.id.slice(0, 8)
                const randomPart = nanoid(12)
                const timestamp = Date.now().toString(36).toUpperCase()
                const qrCodeString = `CLK-${shortBranchId}-${randomPart}-${timestamp}`

                // Insert new QR session
                await db.insert(qrSessions).values({
                    branchId: branch.id,
                    validDate: today,
                    qrCode: qrCodeString,
                    isActive: true,
                    generatedBy: null, // System-generated
                })

                newQRCodes.push(`${branch.name} (${branch.code}): ${qrCodeString.slice(0, 20)}...`)
            }

            result.tasks.qrGeneration.count = newQRCodes.length
            result.tasks.qrGeneration.details = newQRCodes

            await createLogs({
                logs: [{
                    level: "INFO",
                    type: "SYSTEM",
                    message: `Cron: Generated ${newQRCodes.length} new QR codes for active branches`,
                }]
            })
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error"
            result.errors.push(`QR Generation failed: ${errorMsg}`)
            result.success = false
        }

        // ========================================
        // TASK 3: Archive/rotate system logs (older than 90 days)
        // ========================================
        try {
            const ninetyDaysAgo = new Date()
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

            // For now, just count old logs. In production, you might:
            // 1. Move to archive table
            // 2. Export to S3/external storage
            // 3. Delete if retention policy allows
            const oldLogsCount = 0 // Placeholder - implement actual cleanup if needed

            result.tasks.logCleanup.count = oldLogsCount

            await createLogs({
                logs: [{
                    level: "INFO",
                    type: "SYSTEM",
                    message: `Cron: Log cleanup check complete (${ninetyDaysAgo.toISOString().split('T')[0]} cutoff)`,
                }]
            })
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error"
            result.errors.push(`Log Cleanup failed: ${errorMsg}`)
            // Don't mark success as false for non-critical cleanup
        }

        // ========================================
        // TASK 4: Cleanup expired sessions
        // ========================================
        try {
            // Clean up any stale session data if applicable
            // This is a placeholder for future session cleanup logic
            const sessionsCleaned = 0

            result.tasks.sessionCleanup.count = sessionsCleaned
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error"
            result.errors.push(`Session Cleanup failed: ${errorMsg}`)
            // Don't mark success as false for non-critical cleanup
        }

        // ========================================
        // Final summary log
        // ========================================
        const duration = Date.now() - startTime
        await createLogs({
            logs: [{
                level: result.success ? "INFO" : "WARN",
                type: "SYSTEM",
                message: `Cron: Daily maintenance completed in ${duration}ms. QR Deactivated: ${result.tasks.qrDeactivation.count}, QR Generated: ${result.tasks.qrGeneration.count}, Errors: ${result.errors.length}`,
            }]
        })

        return NextResponse.json(result)

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        
        await createLogs({
            logs: [{
                level: "ERROR",
                type: "SYSTEM",
                message: `Cron: Daily maintenance failed with error: ${errorMsg}`,
            }]
        })

        result.success = false
        result.errors.push(errorMsg)

        return NextResponse.json(result, { status: 500 })
    }
}
```

**Step 2: Add CRON_SECRET to environment**

Add to `.env.example`:
```bash
# Cron job authentication secret
CRON_SECRET=your-secure-random-string-here
```

**Step 3: Verify the route compiles**

Run:
```bash
bun run lint 2>&1 | head -50
```

**Step 4: Commit**

Run:
```bash
git add app/api/cron/daily/route.ts .env.example
git commit -m "feat(cron): add daily maintenance API endpoint for Dokploy

- Create /api/cron/daily endpoint with CRON_SECRET auth
- Deactivate expired QR codes from previous days
- Auto-generate new QR codes for all active branches
- Log cleanup task (placeholder for future implementation)
- Session cleanup task (placeholder)
- Comprehensive logging and error handling
- Returns detailed task results"
```

---

## Task 5: Update Time Clock Access Controls

**Goal:** Update time clock actions to allow `time_clock_admin` role in addition to admin for QR code management.

**Files:**
- Modify: `server/actions/time-clock.ts`

**Step 1: Create helper function for time clock admin check**

Add to `server/actions/time-clock.ts` after the imports:

```tsx
/**
 * Check if user has time clock admin access
 * Returns true if user is admin OR has time_clock_admin access flag
 */
async function hasTimeClockAccess(user: { id: string; role: string; access_flags?: string[] }): Promise<boolean> {
    if (user.role === "admin") return true
    return user.access_flags?.includes("time_clock_admin") ?? false
}
```

**Step 2: Update generateQRCode function**

Find the `generateQRCode` function and update the access check:

```tsx
// Replace:
const hasAdminAccess = await isAdmin(currentUser)
if (!hasAdminAccess) {
    return failure("Access denied: Admin access required to generate QR codes")
}

// With:
const hasAccess = await hasTimeClockAccess(currentUser)
if (!hasAccess) {
    return failure("Access denied: Time clock admin access required to generate QR codes")
}
```

**Step 3: Update getQRSessionsForToday function**

Find the `getQRSessionsForToday` function and update the access check similarly:

```tsx
// Replace:
const hasAdminAccess = await isAdmin(currentUser)
if (!hasAdminAccess) {
    return failure("Access denied: Admin access required")
}

// With:
const hasAccess = await hasTimeClockAccess(currentUser)
if (!hasAccess) {
    return failure("Access denied: Time clock admin access required")
}
```

**Step 4: Verify the changes compile**

Run:
```bash
bun run lint 2>&1 | head -50
```

**Step 5: Commit**

Run:
```bash
git add server/actions/time-clock.ts
git commit -m "feat(time-clock): allow time_clock_admin role for QR code management

- Add hasTimeClockAccess helper function
- Update generateQRCode to accept time_clock_admin role
- Update getQRSessionsForToday to accept time_clock_admin role
- Maintains admin access as fallback"
```

---

## Task 6: Update Admin Time Clock Page Authorization

**Goal:** Update the admin time clock page to properly check `time_clock_admin` access flag.

**Files:**
- Modify: `app/(app)/admin/time-clock/page.tsx`

**Step 1: Review current authorization**

The page already checks for `time_clock_admin`. Verify the check is complete.

**Step 2: Ensure consistent access control messaging**

The current implementation is already using `time_clock_admin` flag. No changes needed if the check is:

```tsx
const hasAdminAccess =
    userInfo?.role === "admin" ||
    userInfo?.access_flags?.includes("time_clock_admin") ||
    false
```

**Step 3: Verify and commit if changes were made**

Run:
```bash
bun run lint 2>&1 | head -50
```

If no changes needed:
```bash
echo "Authorization already correct"
```

---

## Task 7: Add Branch Filter to Get Time Clock Entries

**Goal:** The `getTimeClockEntries` function should already support branch filtering from previous implementation. Verify and enhance if needed.

**Files:**
- Modify: `server/actions/time-clock.ts`

**Step 1: Verify branch filtering exists**

Run:
```bash
grep -n "branchId" server/actions/time-clock.ts | head -20
```

Expected: Should show branchId parameter in getTimeClockEntries

**Step 2: Ensure branch filter is properly applied**

The TimeClockCalendar component already passes `branchId: currentBranch?.id ?? undefined`. Verify the query filters correctly.

**Step 3: If needed, add any missing branch filtering**

No changes needed if already implemented correctly.

---

## Task 8: Create Cron Job Documentation

**Goal:** Document how to set up the Dokploy cron job.

**Files:**
- Create: `docs/cron-setup.md`

**Step 1: Create documentation file**

Create `docs/cron-setup.md`:

```markdown
# Cron Job Setup for Dokploy

This document explains how to configure the daily maintenance cron job in Dokploy.

## Prerequisites

1. A deployed instance of Inksight RDMD
2. Dokploy project with scheduled jobs enabled
3. `CRON_SECRET` environment variable set in your deployment

## Environment Variable

Set the following environment variable in your Dokploy deployment:

```bash
CRON_SECRET=your-secure-random-string-here
```

Generate a secure random string:
```bash
openssl rand -hex 32
```

## Cron Job Configuration

In Dokploy, create a new scheduled job with the following settings:

### Basic Settings

- **Name:** `inksight-daily-maintenance`
- **Schedule:** `0 0 * * *` (Runs at midnight every day)
- **Timezone:** Your server's timezone (e.g., `Asia/Manila`)

### Job Type

- **Type:** HTTP Request

### HTTP Settings

- **Method:** GET
- **URL:** `https://your-domain.com/api/cron/daily`
- **Headers:** 
  ```
  Authorization: Bearer YOUR_CRON_SECRET
  ```

Alternative (query parameter):
- **URL:** `https://your-domain.com/api/cron/daily?secret=YOUR_CRON_SECRET`

## What the Cron Job Does

The daily maintenance job performs the following tasks:

1. **QR Code Deactivation**
   - Deactivates all QR codes from previous days
   - Marks them as inactive in the database
   - Logs the count of deactivated codes

2. **QR Code Generation**
   - Automatically generates new QR codes for all active branches
   - Each branch gets a unique QR code valid for the day
   - Staff can clock in immediately without waiting for manual generation

3. **Log Cleanup**
   - Identifies logs older than retention period (90 days)
   - Placeholder for archive/delete operations
   - Logs the cleanup status

4. **Session Cleanup**
   - Cleans up stale session data
   - Placeholder for future implementation

## Monitoring

### Success Response

```json
{
  "success": true,
  "timestamp": "2026-03-25T00:00:00.000Z",
  "tasks": {
    "qrDeactivation": { "count": 5, "details": [...] },
    "qrGeneration": { "count": 3, "details": [...] },
    "logCleanup": { "count": 0, "olderThanDays": 90 },
    "sessionCleanup": { "count": 0 }
  },
  "errors": []
}
```

### Error Response (401 Unauthorized)

```json
{
  "error": "Unauthorized"
}
```

### Logs

All cron executions are logged in the `system_logs` table with type `SYSTEM`.

Check logs:
```sql
SELECT * FROM system_logs 
WHERE type = 'SYSTEM' 
AND message LIKE 'Cron:%' 
ORDER BY created_at DESC 
LIMIT 10;
```

## Testing

### Manual Trigger

Test the endpoint manually:

```bash
curl -X GET "https://your-domain.com/api/cron/daily" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Expected Success

You should receive a JSON response with `success: true` and task details.

## Troubleshooting

### 401 Unauthorized

- Verify `CRON_SECRET` is set in environment
- Check the Authorization header matches the secret
- Ensure no extra whitespace in the secret

### 500 Internal Server Error

- Check server logs for error details
- Verify database connection is working
- Check that `branches` table has active branches

### No QR Codes Generated

- Verify there are active branches in the database
- Check that branches have `is_active = true`
```

**Step 2: Commit documentation**

Run:
```bash
git add docs/cron-setup.md
git commit -m "docs: add Dokploy cron job setup documentation

- Explain CRON_SECRET environment variable
- Document HTTP request configuration
- Describe all maintenance tasks
- Include monitoring and troubleshooting guide"
```

---

## Task 9: Add Environment Variable to .env.example

**Goal:** Ensure CRON_SECRET is documented in environment variable examples.

**Files:**
- Modify: `.env.example`

**Step 1: Add CRON_SECRET entry**

If not already added in Task 4, add to `.env.example`:

```bash
# Cron job authentication secret (generate with: openssl rand -hex 32)
CRON_SECRET=
```

**Step 2: Commit if changed**

Run:
```bash
git diff .env.example
```

If changes exist:
```bash
git add .env.example
git commit -m "chore: add CRON_SECRET to .env.example"
```

---

## Task 10: Final Verification and Testing

**Goal:** Verify all implementations work correctly together.

**Files:**
- None (testing only)

**Step 1: Run TypeScript check**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors

**Step 2: Run lint check**

Run:
```bash
bun run lint
```

Expected: No errors (warnings acceptable)

**Step 3: Test build**

Run:
```bash
bun run build
```

Expected: Build succeeds

**Step 4: Test cron endpoint manually**

Start dev server:
```bash
bun run dev
```

In another terminal, test the endpoint:
```bash
# First, set a test secret
curl -X GET "http://localhost:3000/api/cron/daily?secret=test-secret-123"
```

Expected: 401 Unauthorized (or 200 if CRON_SECRET is set to test value)

**Step 5: Stage all changes and create final commit**

Run:
```bash
git add -A
git commit -m "feat: complete Phase 6 implementation

- Add branch filtering to Sales, Payroll, and Metrics modules
- Create daily maintenance API endpoint for Dokploy cron
- Update time clock access controls for time_clock_admin role
- Add cron job setup documentation
- All TypeScript errors resolved
- All lint checks pass"
```

---

## Summary

This plan implements:

### Branch Integration
- Sales page filters inventory, services, and appointments by branch
- Payroll page filters entries and requests by branch
- Metrics page filters analytics by branch

### Cron Job (Dokploy)
- Daily API endpoint for maintenance tasks
- Deactivates expired QR codes from previous days
- Auto-generates new QR codes for all active branches
- Logs cleanup task (placeholder)
- Session cleanup task (placeholder)
- Secured with CRON_SECRET authentication

### Access Control
- `time_clock_admin` role can now generate and view QR codes
- Maintains admin access as fallback
- Documentation for Dokploy setup

### Tasks Breakdown
1. ✓ Commit TypeScript fixes
2. ✓ Sales branch filter
3. ✓ Payroll branch filter
4. ✓ Metrics branch filter
5. ✓ Daily maintenance API endpoint
6. ✓ Time clock access controls
7. ✓ Admin page authorization
8. ✓ Branch filter verification
9. ✓ Cron job documentation
10. ✓ Final verification

---

## Execution Choice

**Plan complete and saved to `docs/plans/2026-03-24-phase6-branch-integration-and-cron.md`**

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**