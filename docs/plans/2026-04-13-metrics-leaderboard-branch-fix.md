# Metrics, Leaderboard & Branch Logic Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix leaderboard calculations to use artist cuts instead of total revenue, fix revenue attribution so only actual artists appear on leaderboards, and ensure all metrics functions properly filter by branch.

**Architecture:** The payroll system (`payroll_entry` table) already tracks the correct artist/staff attribution with `staffId`, `artistCut`, `shopCut`, and `grossAmount`. The fix involves rewriting the leaderboard to use `payroll_entry` data instead of `general_ledger.createdBy`, and adding consistent branch filtering across all metrics functions.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Supabase/PostgreSQL

---

## Issues Found

### Critical: Leaderboard Calculation Wrong (Bug 1)
- **File:** `server/actions/metrics.ts:615-689` (`getArtistLeaderboard`)
- **Problem:** Groups `general_ledger` by `createdBy` and sums `credit`. `createdBy` is whoever entered the data (admin/manager), NOT the artist who performed the service. Sums total revenue (credit) instead of the artist's cut.
- **Fix:** Rewrite to use `payroll_entry.staffId` for artist identity and `payroll_entry.artistCut` for the leaderboard value. Join with `transactions` for branch filtering.

### Critical: Wrong Revenue Attribution (Bug 2)
- **File:** `server/actions/metrics.ts:615-689` (`getArtistLeaderboard`)
- **Problem:** Any manual revenue entry created by an admin gets attributed to that admin on the leaderboard, not to the artist.
- **Fix:** Same as Bug 1 — use `payroll_entry` which correctly links `staffId` to the actual artist.

### Critical: Inconsistent Branch Filtering (Bug 3)
- **Problem:** Several metrics functions lack branch filtering entirely:
  - `getStaffPerformance()` (`metrics.ts:397-486`) — no `branchId` parameter
  - `getRatingMetrics()` (`metrics.ts:343-395`) — no `branchId` parameter
  - `getAppointmentReviews()` (`metrics.ts:709-750`) — no `branchId` parameter
  - `businessInsights.tsx:196-197` — `getPayrollDashboardSummary()` and `getStaffPayrollSummary()` called without `branchId`
  - `businessInsights.tsx:194` — `getStaffPerformance()` called without `branchId`

### Medium: Cache Not Invalidated on Data Changes
- **Problem:** `METRICS_CACHE_TTL` is 5 minutes. Cache keys include `branchId` but data mutations don't invalidate cached results.
- **Fix:** Add cache invalidation on relevant mutations (create ledger entry, complete appointment, create payroll entry). For now, the 5-minute TTL is acceptable; this is a TODO for a future iteration.

### Low: Missing sourceType filter in leaderboard
- **Problem:** `getArtistLeaderboard` includes ALL REVENUE entries from `general_ledger`, including manual/adjustment entries. A `MANUAL` source entry shouldn't land on an artist's leaderboard unless it has a corresponding payroll entry.
- **Fix:** Using `payroll_entry` inherently solves this — only service transactions that go through payroll will appear.

---

## Task 1: Rewrite getArtistLeaderboard to use payroll_entry

**Files:**
- Modify: `server/actions/metrics.ts:608-690`

**Step 1: Update the ArtistLeaderboardEntry type**

Replace the current type with one that includes both artist cut and gross revenue:

```typescript
export type ArtistLeaderboardEntry = {
    staff_id: string
    full_name: string
    avatar_url?: string
    artist_level?: string
    total_revenue: number
    total_artist_cut: number
    total_gross: number
    appointment_count: number
}
```

**Step 2: Rewrite getArtistLeaderboard function**

Replace the entire function body. The new query uses `payroll_entry` joined with `user` for names, filtered by service date range and optionally by branch (via transactions). It sums `artistCut` (for leaderboard value), `grossAmount` (for context), and counts appointments.

```typescript
export async function getArtistLeaderboard(
    startDate: string,
    endDate: string,
    branchId?: string
): Promise<ActionResponse<ArtistLeaderboardEntry[]>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const conditions: SQL<unknown>[] = [
            gte(payrollEntry.serviceDate, start),
            lte(payrollEntry.serviceDate, end),
        ]

        if (branchId) {
            conditions.push(
                sql`EXISTS (SELECT 1 FROM ${transactions} WHERE ${transactions.id} = ${payrollEntry.transactionId} AND ${transactions.branchId} = ${branchId})`
            )
        }

        const entries = await db
            .select({
                staffId: payrollEntry.staffId,
                fullName: user.fullName,
                avatarUrl: user.avatarUrl,
                artistLevel: user.artistLevel,
                totalArtistCut: sql<number>`COALESCE(SUM(CAST(${payrollEntry.artistCut} AS NUMERIC)), 0)`,
                totalGross: sql<number>`COALESCE(SUM(CAST(${payrollEntry.grossAmount} AS NUMERIC)), 0)`,
                appointmentCount: sql<number>`CAST(COUNT(DISTINCT ${payrollEntry.appointmentId}) AS INTEGER)`,
            })
            .from(payrollEntry)
            .leftJoin(user, eq(payrollEntry.staffId, user.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .groupBy(payrollEntry.staffId, user.fullName, user.avatarUrl, user.artistLevel)
            .orderBy(desc(sql`COALESCE(SUM(CAST(${payrollEntry.artistCut} AS NUMERIC)), 0)`))

        const leaderboard: ArtistLeaderboardEntry[] = entries.slice(0, LEADERBOARD_LIMIT).map(entry => ({
            staff_id: entry.staffId,
            full_name: entry.fullName || 'Unknown',
            avatar_url: entry.avatarUrl || undefined,
            artist_level: entry.artistLevel || undefined,
            total_revenue: Number(entry.totalArtistCut) || 0,
            total_artist_cut: Number(entry.totalArtistCut) || 0,
            total_gross: Number(entry.totalGross) || 0,
            appointment_count: entry.appointmentCount || 0,
        }))

        return success(leaderboard)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching artist leaderboard: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch artist leaderboard')
    }
}
```

**Step 3: Verify imports are correct**

At the top of `metrics.ts`, ensure these imports are present:
```typescript
import { payrollEntry, transactions } from '@/server/db/schema'
```

**Step 4: Run lint to verify**

Run: `bun run lint`
Expected: No new errors

**Step 5: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): rewrite artist leaderboard to use payroll_entry artistCut instead of general_ledger credit"
```

---

## Task 2: Add branch filtering to getStaffPerformance

**Files:**
- Modify: `server/actions/metrics.ts:397-486`

**Step 1: Add branchId parameter to getStaffPerformance**

Update the function signature to accept `branchId?: string`:

```typescript
export async function getStaffPerformance(
    branchId?: string
): Promise<ActionResponse<StaffPerformanceMetric[]>> {
```

**Step 2: Add branch filter to appointments query**

In the `staffWithAppointments` query, add branch filtering:

```typescript
const appointmentConditions: SQL<unknown>[] = [
    eq(appointments.status, 'COMPLETED'),
]

if (branchId) {
    const branchCondition = or(eq(appointments.branchId, branchId!), isNull(appointments.branchId))
    if (branchCondition) appointmentConditions.push(branchCondition)
}

const staffWithAppointments = await db
    .select({
        staff_id: appointments.staffId,
        staff_name: user.fullName,
        appointment_count: sql<number>`count(*)`.as('appointment_count'),
    })
    .from(appointments)
    .innerJoin(user, eq(appointments.staffId, user.id))
    .where(and(...appointmentConditions))
    .groupBy(appointments.staffId, user.fullName)
```

**Step 3: Add branch filter to ratings query**

Ratings are linked to appointments via `ratings.appointmentId`. Filter by joining appointments:

```typescript
const ratingsConditions: SQL<unknown>[] = []

if (branchId) {
    // Join ratings with appointments to filter by branch
    const branchAppointments = db
        .select({ id: appointments.id })
        .from(appointments)
        .where(or(eq(appointments.branchId, branchId!), isNull(appointments.branchId)))
        .as('branch_appointments')

    // Instead of a subquery approach, we'll join ratings with appointments
    const ratingsWithBranch = await db
        .select({
            staff_id: ratings.staffId,
            staff_name: user.fullName,
            rating: ratings.rating,
        })
        .from(ratings)
        .innerJoin(user, eq(ratings.staffId, user.id))
        .innerJoin(appointments, eq(ratings.appointmentId, appointments.id))
        .where(
            branchId
                ? and(eq(ratings.staffId, sql`${ratings.staffId}`), or(eq(appointments.branchId, branchId!), isNull(appointments.branchId)))
                : undefined
        )
}
```

However, since the current code already fetches all ratings and processes them in-memory, the simpler approach is:

```typescript
let staffRatings

if (branchId) {
    staffRatings = await db
        .select({
            staff_id: ratings.staffId,
            staff_name: user.fullName,
            rating: ratings.rating,
        })
        .from(ratings)
        .innerJoin(user, eq(ratings.staffId, user.id))
        .innerJoin(appointments, eq(ratings.appointmentId, appointments.id))
        .where(or(eq(appointments.branchId, branchId!), isNull(appointments.branchId)))
} else {
    staffRatings = await db
        .select({
            staff_id: ratings.staffId,
            staff_name: user.fullName,
            rating: ratings.rating,
        })
        .from(ratings)
        .innerJoin(user, eq(ratings.staffId, user.id))
}
```

**Step 4: Update frontend call in businessInsights.tsx**

In `businessInsights.tsx`, line 194, change:
```typescript
getStaffPerformance(),
```
to:
```typescript
getStaffPerformance(branchId),
```

Wait — `getStaffPerformance` also doesn't take date range. For now, we'll add the branch parameter as the first step. A date range parameter can be added later.

**Step 5: Run lint**

Run: `bun run lint`
Expected: No new errors

**Step 6: Commit**

```bash
git add server/actions/metrics.ts components/metrics/businessInsights.tsx
git commit -m "fix(metrics): add branch filtering to staff performance ratings"
```

---

## Task 3: Add branch filtering to getRatingMetrics

**Files:**
- Modify: `server/actions/metrics.ts:343-395`

**Step 1: Add branchId and date range parameters**

```typescript
export async function getRatingMetrics(
    branchId?: string,
    startDate?: string,
    endDate?: string
): Promise<ActionResponse<RatingMetrics>> {
```

**Step 2: Add branch and date filters**

If `branchId` is provided, join `ratings` with `appointments` to filter. If date range is provided, filter by `ratings.createdAt`.

```typescript
try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Not authenticated')
    }

    const cacheKey = `rating_metrics:${branchId || 'all'}:${startDate || 'none'}:${endDate || 'none'}`
    const cached = cache.get<RatingMetrics>(cacheKey)
    if (cached) {
        return success(cached)
    }

    const conditions: SQL<unknown>[] = []

    if (startDate && endDate) {
        conditions.push(gte(ratings.createdAt, new Date(startDate)))
        conditions.push(lte(ratings.createdAt, new Date(endDate)))
    }

    let allRatings

    if (branchId) {
        allRatings = await db
            .select({
                rating: ratings.rating,
            })
            .from(ratings)
            .innerJoin(appointments, eq(ratings.appointmentId, appointments.id))
            .where(
                and(
                    or(eq(appointments.branchId, branchId!), isNull(appointments.branchId)),
                    ...conditions
                )
            )
    } else {
        allRatings = await db
            .select({
                rating: ratings.rating,
            })
            .from(ratings)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
    }

    // ... rest of the calculation logic stays the same
```

**Step 3: Update frontend call in businessInsights.tsx**

The call to `getRatingMetrics()` in businessInsights.tsx doesn't exist directly (it was part of the old code). Check if it's still called. If not, skip this step. Based on the current code review, it's NOT called in businessInsights.tsx, so no frontend change needed.

**Step 4: Run lint**

Run: `bun run lint`

**Step 5: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): add branch and date filtering to rating metrics"
```

---

## Task 4: Pass branchId to payroll functions in businessInsights.tsx

**Files:**
- Modify: `components/metrics/businessInsights.tsx`

**Step 1: Update getPayrollDashboardSummary call**

On line 196, change:
```typescript
getPayrollDashboardSummary(),
```
to:
```typescript
getPayrollDashboardSummary(currentBranch?.id ?? null),
```

Wait — `getPayrollDashboardSummary` already accepts `branchId?: string | null`. Let's check the signature again... Yes, it accepts `branchId?: string | null` at line 1122. So:

```typescript
getPayrollDashboardSummary(currentBranch?.id ?? null),
```

**Step 2: Update getStaffPayrollSummary call**

On line 197, change:
```typescript
getStaffPayrollSummary(),
```
to:
```typescript
getStaffPayrollSummary(currentBranch?.id ?? null),
```

The `getStaffPayrollSummary` function already accepts `branchId?: string | null` at line 1241.

**Step 3: Run lint**

Run: `bun run lint`

**Step 4: Commit**

```bash
git add components/metrics/businessInsights.tsx
git commit -m "fix(metrics): pass branchId to payroll dashboard and staff summary"
```

---

## Task 5: Update ArtistLeaderboardEntry usages in export utils and frontend

**Files:**
- Modify: `utils/metrics-export-utils.ts`
- Modify: `components/metrics/businessInsights.tsx`

**Step 1: Update metrics-export-utils.ts**

The `ArtistLeaderboardEntry` type is imported from `server/actions/metrics`. The CSV export at line 139-144 and Excel export at line 317-323 reference `full_name` and `total_revenue`. After our type change, `total_revenue` now represents `artistCut` (the actual leaderboard value). The export should show both:

Update the CSV export section (around line 139):
```typescript
if (data.artistLeaderboard && data.artistLeaderboard.length > 0) {
    lines.push('ARTIST LEADERBOARD (Earnings)')
    lines.push('Rank,Name,Artist Earnings,Total Sales,Appointments')
    data.artistLeaderboard.forEach((artist, index) => {
        lines.push(`${index + 1},"${artist.full_name}",${artist.total_artist_cut.toFixed(2)},${artist.total_gross.toFixed(2)},${artist.appointment_count}`)
    })
    lines.push('')
}
```

Update the Excel export section (around line 317):
```typescript
if (data.artistLeaderboard && data.artistLeaderboard.length > 0) {
    const leaderboardData = [
        ['ARTIST LEADERBOARD (Earnings)', '', '', ''],
        ['Rank', 'Name', 'Artist Earnings', 'Total Sales', 'Appointments'],
        ...data.artistLeaderboard.map((artist, i) => [i + 1, artist.full_name, artist.total_artist_cut, artist.total_gross, artist.appointment_count])
    ]
    const wsLeaderboard = XLSX.utils.aoa_to_sheet(leaderboardData)
    wsLeaderboard['!cols'] = [{ wch: 8 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, wsLeaderboard, 'Artist Leaderboard')
}
```

Update the PDF export section (around line 628):
```typescript
if (data.artistLeaderboard && data.artistLeaderboard.length > 0) {
    // ... page check ...
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Artist Leaderboard (Earnings)', 14, yPos)
    yPos += 4

    autoTable(doc, {
        startY: yPos,
        head: [['Rank', 'Artist Name', 'Artist Earnings', 'Total Sales', 'Appointments']],
        body: data.artistLeaderboard.map((artist, i) => [
            String(i + 1),
            artist.full_name,
            `${currencySymbol}${artist.total_artist_cut.toLocaleString()}`,
            `${currencySymbol}${artist.total_gross.toLocaleString()}`,
            String(artist.appointment_count),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [66, 66, 66] },
        margin: { left: 14 },
    })

    yPos = (doc as any).lastAutoTable.finalY + 10
}
```

**Step 2: Update businessInsights.tsx leaderboard display**

Update the leaderboard section (around line 748-812) to show artist earnings instead of revenue, and add a subtitle:

```tsx
<section className='flex flex-col gap-4'>
    <h2 className='text-xl font-bold flex items-center gap-2'>
        <TrophyIcon className='text-yellow-400' /> Artist
        Leaderboard (Earnings)
    </h2>
    {artistLeaderboard.length === 0 ? (
        <div className='bg-white/5 rounded-xl p-6 text-center text-white/40'>
            No artist data available for this period
        </div>
    ) : (
        <div className='space-y-2'>
            {artistLeaderboard.slice(0, 5).map((artist, index) => (
                <div
                    key={artist.staff_id}
                    className={`bg-white/5 hover:bg-white/10 rounded-lg p-4 flex items-center justify-between transition-colors ${
                        index === 0
                            ? "border border-yellow-500/30 bg-yellow-500/10"
                            : ""
                    }`}
                >
                    <div className='flex items-center gap-3'>
                        <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                index === 0
                                    ? "bg-yellow-500 text-black"
                                    : index === 1
                                      ? "bg-gray-400 text-black"
                                      : index === 2
                                        ? "bg-orange-700 text-white"
                                        : "bg-white/20 text-white"
                            }`}
                        >
                            {index + 1}
                        </span>
                        <div className='w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white font-bold overflow-hidden'>
                            {artist.avatar_url ? (
                                <NextImage
                                    src={artist.avatar_url}
                                    alt={artist.full_name}
                                    width={40}
                                    height={40}
                                    className='w-full h-full object-cover'
                                />
                            ) : (
                                artist.full_name
                                    .charAt(0)
                                    .toUpperCase()
                            )}
                        </div>
                        <div className='flex flex-col'>
                            <span className='font-medium'>
                                {artist.full_name}
                            </span>
                            <span className='text-xs text-white/40'>
                                {artist.appointment_count} appointments
                            </span>
                        </div>
                    </div>
                    <div className='flex flex-col items-end'>
                        <span className='text-lg font-bold text-green-400'>
                            ₱{artist.total_artist_cut.toLocaleString(
                                undefined,
                                { minimumFractionDigits: 2 }
                            )}
                        </span>
                        <span className='text-xs text-white/40'>
                            of ₱{artist.total_gross.toLocaleString(
                                undefined,
                                { minimumFractionDigits: 2 }
                            )} total
                        </span>
                    </div>
                </div>
            ))}
        </div>
    )}
</section>
```

**Step 3: Run lint**

Run: `bun run lint`

**Step 4: Commit**

```bash
git add utils/metrics-export-utils.ts components/metrics/businessInsights.tsx
git commit -m "fix(metrics): update leaderboard UI and exports to show artist earnings with total sales context"
```

---

## Task 6: Fix branch filtering consistency — use strict matching instead of including null branches

**Files:**
- Modify: `server/actions/metrics.ts`

**Step 1: Review and document the current branch filtering behavior**

Currently, all metrics functions with branch filtering use:
```typescript
or(eq(table.branchId, branchId!), isNull(table.branchId))
```

This includes entries where `branchId IS NULL`. This makes sense for a multi-branch system where some data predates the branch feature (legacy data). However, when a specific branch is selected, showing null-branch data mixed in could be misleading.

**Decision: Keep the current behavior.** Entries without a branch are "shared" across all branches. This is the correct business logic for a tattoo studio where some revenue/entries apply to all branches. But we should add a `branchScope` concept:

- When `branchId` is provided: show entries for that branch + shared (null) entries
- When no `branchId`: show ALL entries (no filter)

This is already the current behavior, so no change needed here. Just document it.

**Step 2: Commit documentation**

No code change needed for this task. The current `or(eq(branchId, X), isNull(branchId))` pattern is correct for "branch + shared" data.

---

## Task 7: Add branch filtering to getAppointmentReviews

**Files:**
- Modify: `server/actions/metrics.ts:709-750`

**Step 1: Add branchId parameter**

```typescript
export async function getAppointmentReviews(
    appointmentId?: string,
    options?: { page?: number; pageSize?: number },
    branchId?: string
): Promise<ActionResponse<{ data: AppointmentReview[]; hasMore: boolean; total: number }>> {
```

**Step 2: Add branch filter**

When `branchId` is provided and no specific `appointmentId` is given, join with `appointments` to filter by branch:

```typescript
try {
    const { page = 1, pageSize = 10 } = options || {}
    const offset = (page - 1) * pageSize

    let allReviews

    if (appointmentId) {
        allReviews = await db
            .select()
            .from(reviews)
            .where(eq(reviews.appointmentId, appointmentId))
            .orderBy(desc(reviews.createdAt))
    } else if (branchId) {
        allReviews = await db
            .select({
                id: reviews.id,
                appointmentId: reviews.appointmentId,
                authorId: reviews.authorId,
                type: reviews.type,
                title: reviews.title,
                content: reviews.content,
                isPublic: reviews.isPublic,
                createdAt: reviews.createdAt,
            })
            .from(reviews)
            .innerJoin(appointments, eq(reviews.appointmentId, appointments.id))
            .where(or(eq(appointments.branchId, branchId!), isNull(appointments.branchId)))
            .orderBy(desc(reviews.createdAt))
    } else {
        allReviews = await db
            .select()
            .from(reviews)
            .orderBy(desc(reviews.createdAt))
    }
```

Note: The select shape differs between the simple and joined queries. We need to handle this correctly. The simpler approach is to use a subquery for branch-filtered reviews.

Actually, let's use a simpler approach:

```typescript
let query = db
    .select()
    .from(reviews)
    .orderBy(desc(reviews.createdAt))

if (appointmentId) {
    query = query.where(eq(reviews.appointmentId, appointmentId))
}

const allReviews = await query
```

For branch filtering when no appointmentId, we need appointments join:

```typescript
export async function getAppointmentReviews(
    appointmentId?: string,
    options?: { page?: number; pageSize?: number },
    branchId?: string
): Promise<ActionResponse<{ data: AppointmentReview[]; hasMore: boolean; total: number }>> {
    try {
        const { page = 1, pageSize = 10 } = options || {}
        const offset = (page - 1) * pageSize

        let allReviews

        if (appointmentId) {
            allReviews = await db
                .select()
                .from(reviews)
                .where(eq(reviews.appointmentId, appointmentId))
                .orderBy(desc(reviews.createdAt))
        } else if (branchId) {
            const branchAppointmentIds = db
                .select({ id: appointments.id })
                .from(appointments)
                .where(or(eq(appointments.branchId, branchId!), isNull(appointments.branchId)))

            allReviews = await db
                .select()
                .from(reviews)
                .where(inArray(reviews.appointmentId, branchAppointmentIds))
                .orderBy(desc(reviews.createdAt))
        } else {
            allReviews = await db
                .select()
                .from(reviews)
                .orderBy(desc(reviews.createdAt))
        }
```

Wait, `inArray` with a subquery isn't directly supported by drizzle-orm. Let's use the sql approach:

```typescript
} else if (branchId) {
    allReviews = await db
        .select()
        .from(reviews)
        .where(sql`${reviews.appointmentId} IN (
            SELECT id FROM appointments
            WHERE branch_id = ${branchId} OR branch_id IS NULL
        )`)
        .orderBy(desc(reviews.createdAt))
}
```

**Step 3: Run lint**

Run: `bun run lint`

**Step 4: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "fix(metrics): add branch filtering to appointment reviews"
```

---

## Task 8: Verify build and run lint on all changes

**Step 1: Run the full lint**

Run: `bun run lint`
Expected: No errors related to our changes

**Step 2: Run the build**

Run: `bun run build`
Expected: Build succeeds with no type errors

**Step 3: Manual testing checklist**

Test the following scenarios:
1. **Leaderboard shows artist cuts**: Navigate to metrics page, verify artist leaderboard shows artist earnings (not total revenue)
2. **Branch filtering works**: Select different branches, verify leaderboard data changes
3. **"All branches" (null branchId)**: Verify selecting "All" shows aggregate data across all branches
4. **Staff performance**: Verify staff ratings filter by branch
5. **Payroll dashboard**: Verify payroll amounts change when switching branches
6. **Rating metrics**: Verify ratings reflect branch selection

---

## Summary of All Changes

| File | Change | Bug |
|------|--------|-----|
| `server/actions/metrics.ts` | Rewrite `getArtistLeaderboard` to use `payroll_entry.artistCut` instead of `general_ledger.credit` | Bug 1 & 2 |
| `server/actions/metrics.ts` | Add `branchId` param to `getStaffPerformance` | Bug 3 |
| `server/actions/metrics.ts` | Add `branchId` and date range params to `getRatingMetrics` | Bug 3 |
| `server/actions/metrics.ts` | Add `branchId` param to `getAppointmentReviews` | Bug 3 |
| `components/metrics/businessInsights.tsx` | Pass `branchId` to `getStaffPerformance`, `getPayrollDashboardSummary`, `getStaffPayrollSummary` | Bug 3 |
| `components/metrics/businessInsights.tsx` | Update leaderboard UI to show artist earnings vs total revenue | Bug 1 |
| `utils/metrics-export-utils.ts` | Update CSV/Excel/PDF exports with new leaderboard fields | Bug 1 |