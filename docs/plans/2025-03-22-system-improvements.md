# InksightRDMD System Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement comprehensive system improvements including server actions business logic, Drizzle ORM migration, system logs, domain configuration, and UI fixes.

**Architecture:** Next.js 15 App Router with Drizzle ORM for PostgreSQL, Better-Auth for authentication, and Supabase Storage for files. Uses Server Actions for data operations.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Better-Auth, Tailwind CSS 4, Motion (Framer Motion)

---

## Overview

This plan addresses:
1. Server Actions - Complete incomplete implementations and migrate remaining Supabase calls to Drizzle
2. System Logs - Implement database persistence with proper integration
3. Domain Configuration - Update to *.rdmdstudio.com
4. Staff/Accounts Pages - Fix create/invite functionality and auth keys issues
5. Account Edit Page - Fix schedule tab and save logic
6. Notification Provider - Make ephemeral by default

---

## Phase 1: Server Actions & Drizzle Migration

### Task 1: Create System Logs Database Schema

**Files:**
- Create: `server/db/schema/logs.ts`
- Modify: `server/db/schema.ts:1-105`
- Modify: `utils/types/logs.ts:1-19`
- Create: `drizzle/migrations/` (migration file)

**Step 1: Write the logs schema**

```typescript
// server/db/schema/logs.ts
import { pgTable, uuid, timestamp, varchar, text, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const systemLogs = pgTable('system_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    level: varchar('level', { length: 20 }).notNull(), // INFO, WARN, ERROR, DEBUG, FATAL
    type: varchar('type', { length: 50 }).notNull(), // APPOINTMENT, INVENTORY, SYSTEM, AUTH, ACCOUNTING, PAYROLL, OTHER
    user_id: text('user_id'), // Optional reference to user
    message: text('message'),
}, (table) => ({
    levelIdx: index('idx_logs_level').on(table.level),
    typeIdx: index('idx_logs_type').on(table.type),
    createdIdx: index('idx_logs_created').on(table.created_at),
    userIdx: index('idx_logs_user').on(table.user_id),
}))

export const systemLogsRelations = relations(systemLogs, ({ one }) => ({
    user: one(user, {
        fields: [systemLogs.user_id],
        references: [user.id],
    }),
}))
```

**Step 2: Run database migration**

Run: `bun run drizzle-kit generate`
Run: `bun run drizzle-kit migrate`

Expected: Migration files created and applied

**Step 3: Update schema exports**

Add to `server/db/schema.ts`:
```typescript
// Logs Schema
export {
    systemLogs,
    systemLogsRelations,
} from './schema/logs'
```

**Step 4: Commit**

```bash
git add server/db/schema/logs.ts server/db/schema.ts utils/types/logs.ts
git commit -m "feat(db): add system_logs schema for persistent logging"
```

---

### Task 2: Implement System Logs Server Action

**Files:**
- Modify: `server/actions/logs.ts:1-15`
- Test: Verify logs persist to database

**Step 1: Write the implementation**

```typescript
// server/actions/logs.ts
'use server'

import { db } from "@/server/db"
import { systemLogs } from "@/server/db/schema"
import { desc, eq, and, gte, lte } from "drizzle-orm"
import { CreateLogEntryPayload, LogEntry, LogLevel, LogType } from "@/utils/types/logs"

export async function createLogs({ logs }: { logs: CreateLogEntryPayload[] }) {
    try {
        const logEntries = logs.map(log => ({
            level: log.level as LogLevel,
            type: log.type as LogType,
            user_id: log.user_id || null,
            message: log.message || null,
        }))

        await db.insert(systemLogs).values(logEntries)
        return { success: true }
    } catch (error) {
        // Fallback to console if database fails
        console.error('Failed to persist logs to database:', error)
        logs.forEach(log => {
            console.log(`[${log.level}] ${log.type}: ${log.message}`)
        })
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
}

export async function getLogs(
    page: number = 1,
    level?: string,
    type?: string,
    startDate?: string,
    endDate?: string
): Promise<LogEntry[]> {
    try {
        const limit = 50
        const offset = (page - 1) * limit

        let query = db.select().from(systemLogs).orderBy(desc(systemLogs.created_at))

        // Apply filters
        const conditions = []
        if (level) conditions.push(eq(systemLogs.level, level as LogLevel))
        if (type) conditions.push(eq(systemLogs.type, type as LogType))
        if (startDate) conditions.push(gte(systemLogs.created_at, new Date(startDate)))
        if (endDate) conditions.push(lte(systemLogs.created_at, new Date(endDate)))

        if (conditions.length > 0) {
            query = db.select().from(systemLogs)
                .where(and(...conditions))
                .orderBy(desc(systemLogs.created_at))
                .limit(limit)
                .offset(offset)
        } else {
            query = db.select().from(systemLogs)
                .orderBy(desc(systemLogs.created_at))
                .limit(limit)
                .offset(offset)
        }

        const result = await query

        return result.map(log => ({
            id: log.id,
            date: log.created_at.toISOString(),
            level: log.level as LogLevel,
            type: log.type as LogType,
            user_id: log.user_id || undefined,
            message: log.message || undefined,
        }))
    } catch (error) {
        console.error('Error fetching logs:', error)
        return []
    }
}

export async function getLogsByUser(userId: string, page: number = 1): Promise<LogEntry[]> {
    return getLogs(page, undefined, undefined, undefined, undefined)
}
```

**Step 2: Test the implementation**

Run: `bun run dev`

Expected: Application starts without errors

**Step 3: Commit**

```bash
git add server/actions/logs.ts
git commit -m "feat(logs): implement database persistence for system logs"
```

---

### Task 3: Implement Time Clock Server Actions

**Files:**
- Modify: `server/actions/time-clock.ts:1-36`
- Create: `server/db/schema/timeclock.ts`
- Modify: `server/db/schema.ts`

**Step 1: Create timeclock schema**

```typescript
// server/db/schema/timeclock.ts
import { pgTable, uuid, timestamp, text, boolean, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const timeClockEntries = pgTable('time_clock_entries', {
    id: uuid('id').defaultRandom().primaryKey(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
    staff_id: text('staff_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    clock_in: timestamp('clock_in').notNull(),
    clock_out: timestamp('clock_out'),
    notes: text('notes'),
    branch_id: text('branch_id').references(() => branches.id, { onDelete: 'set null' }),
}, (table) => ({
    staffIdx: index('idx_timeclock_staff').on(table.staff_id),
    clockInIdx: index('idx_timeclock_clock_in').on(table.clock_in),
}))

export const staffSchedules = pgTable('staff_schedules', {
    id: uuid('id').defaultRandom().primaryKey(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    staff_id: text('staff_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    day_of_week: text('day_of_week').notNull(), // 'MONDAY', 'TUESDAY', etc.
    start_time: text('start_time').notNull(), // '09:00'
    end_time: text('end_time').notNull(), // '17:00'
    is_active: boolean('is_active').default(true).notNull(),
}, (table) => ({
    staffIdx: index('idx_schedule_staff').on(table.staff_id),
}))

export const timeClockEntriesRelations = relations(timeClockEntries, ({ one }) => ({
    staff: one(user, {
        fields: [timeClockEntries.staff_id],
        references: [user.id],
    }),
    branch: one(branches, {
        fields: [timeClockEntries.branch_id],
        references: [branches.id],
    }),
}))

export const staffSchedulesRelations = relations(staffSchedules, ({ one }) => ({
    staff: one(user, {
        fields: [staffSchedules.staff_id],
        references: [user.id],
    }),
}))

// Import user and branches at top of file
import { user } from './auth'
import { branches } from './branches'
```

**Step 2: Update schema exports**

Add to `server/db/schema.ts`:
```typescript
// Time Clock Schema
export {
    timeClockEntries,
    staffSchedules,
    timeClockEntriesRelations,
    staffSchedulesRelations,
} from './schema/timeclock'
```

**Step 3: Implement time-clock actions**

```typescript
// server/actions/time-clock.ts
'use server'

import { db } from "@/server/db"
import { timeClockEntries, staffSchedules } from "@/server/db/schema"
import { eq, and, isNull, gte, lte, desc } from "drizzle-orm"
import { ClockStatus, StaffSchedule, ScheduleInput } from "@/utils/types/schedules"
import { getCurrentUser } from "@/utils/auth/permissions"
import { createLogs } from "./logs"

export async function getClockStatus(staffId: string): Promise<ClockStatus> {
    try {
        const [activeEntry] = await db
            .select()
            .from(timeClockEntries)
            .where(and(
                eq(timeClockEntries.staff_id, staffId),
                isNull(timeClockEntries.clock_out)
            ))
            .limit(1)

        if (!activeEntry) {
            return {
                isClockedIn: false,
                currentLog: null,
                clockedInAt: null,
                duration: null,
            }
        }

        const clockedInAt = activeEntry.clock_in
        const now = new Date()
        const duration = now.getTime() - clockedInAt.getTime()

        return {
            isClockedIn: true,
            currentLog: {
                id: activeEntry.id,
                clock_in: clockedInAt.toISOString(),
                clock_out: null,
                notes: activeEntry.notes || undefined,
            },
            clockedInAt: clockedInAt.toISOString(),
            duration,
        }
    } catch (error) {
        console.error('Error getting clock status:', error)
        return {
            isClockedIn: false,
            currentLog: null,
            clockedInAt: null,
            duration: null,
        }
    }
}

export async function clockIn(staffId: string, notes?: string): Promise<{ success: boolean; error?: string }> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return { success: false, error: 'Unauthorized' }
        }

        // Check if already clocked in
        const status = await getClockStatus(staffId)
        if (status.isClockedIn) {
            return { success: false, error: 'Already clocked in' }
        }

        await db.insert(timeClockEntries).values({
            staff_id: staffId,
            clock_in: new Date(),
            notes: notes || null,
        })

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'OTHER',
                user_id: currentUser.id,
                message: `Staff ${staffId} clocked in`,
            }]
        })

        return { success: true }
    } catch (error) {
        console.error('Error clocking in:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
}

export async function clockOut(staffId: string, notes?: string): Promise<{ success: boolean; error?: string }> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return { success: false, error: 'Unauthorized' }
        }

        const status = await getClockStatus(staffId)
        if (!status.isClockedIn || !status.currentLog) {
            return { success: false, error: 'Not clocked in' }
        }

        await db
            .update(timeClockEntries)
            .set({
                clock_out: new Date(),
                notes: notes || status.currentLog.notes,
                updated_at: new Date(),
            })
            .where(eq(timeClockEntries.id, status.currentLog.id))

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'OTHER',
                user_id: currentUser.id,
                message: `Staff ${staffId} clocked out`,
            }]
        })

        return { success: true }
    } catch (error) {
        console.error('Error clocking out:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
}

export async function getStaffSchedule(staffId: string): Promise<StaffSchedule[]> {
    try {
        const schedules = await db
            .select()
            .from(staffSchedules)
            .where(eq(staffSchedules.staff_id, staffId))
            .orderBy(staffSchedules.day_of_week)

        return schedules.map(s => ({
            id: s.id,
            staff_id: s.staff_id,
            day_of_week: s.day_of_week as StaffSchedule['day_of_week'],
            start_time: s.start_time,
            end_time: s.end_time,
            is_active: s.is_active,
        }))
    } catch (error) {
        console.error('Error fetching staff schedule:', error)
        return []
    }
}

export async function updateStaffSchedule(
    staffId: string,
    schedules: ScheduleInput[]
): Promise<{ success: boolean; error?: string }> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return { success: false, error: 'Unauthorized' }
        }

        // Delete existing schedules
        await db.delete(staffSchedules).where(eq(staffSchedules.staff_id, staffId))

        // Insert new schedules
        if (schedules.length > 0) {
            await db.insert(staffSchedules).values(
                schedules.map(s => ({
                    staff_id: staffId,
                    day_of_week: s.day_of_week,
                    start_time: s.start_time,
                    end_time: s.end_time,
                    is_active: s.is_active ?? true,
                }))
            )
        }

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'OTHER',
                user_id: currentUser.id,
                message: `Schedule updated for staff ${staffId}`,
            }]
        })

        return { success: true }
    } catch (error) {
        console.error('Error updating staff schedule:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
}

export async function getAvailableStaff(date: Date = new Date()): Promise<string[]> {
    try {
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'uppercase' })
        const startTime = date.toTimeString().slice(0, 5)
        const endTime = '23:59'

        const available = await db
            .select({ staff_id: staffSchedules.staff_id })
            .from(staffSchedules)
            .where(and(
                eq(staffSchedules.day_of_week, dayOfWeek),
                eq(staffSchedules.is_active, true),
                lte(staffSchedules.start_time, startTime),
                gte(staffSchedules.end_time, endTime)
            ))

        return available.map(s => s.staff_id)
    } catch (error) {
        console.error('Error getting available staff:', error)
        return []
    }
}
```

**Step 4: Run migration**

Run: `bun run drizzle-kit generate && bun run drizzle-kit migrate`

**Step 5: Commit**

```bash
git add server/db/schema/timeclock.ts server/db/schema.ts server/actions/time-clock.ts
git commit -m "feat(timeclock): implement time clock and staff schedule schema and actions"
```

---

## Phase 2: Server Actions Cleanup & Public API

### Task 4: Implement Public Server Actions

**Files:**
- Modify: `server/actions/public.ts:1-10`
- Modify: `app/api/public/artists/available/route.ts`
- Modify: `app/api/public/hours/route.ts`

**Step 1: Implement getSharedImage action**

```typescript
// server/actions/public.ts
'use server'

import { db } from "@/server/db"
import { storageFiles } from "@/server/db/schema/storage"
import { eq } from "drizzle-orm"
import { Image } from "@/utils/types/storage"

export async function getSharedImage(imageId: string): Promise<Image | null> {
    try {
        const [file] = await db
            .select()
            .from(storageFiles)
            .where(eq(storageFiles.id, imageId))
            .limit(1)

        if (!file) return null

        return {
            id: file.id,
            name: file.name,
            url: file.public_url || file.url,
            size: file.size,
            mimeType: file.mime_type,
            created_at: file.created_at.toISOString(),
        }
    } catch (error) {
        console.error('Error fetching shared image:', error)
        return null
    }
}
```

**Step 2: Create storage files schema if missing**

Check if `server/db/schema/storage.ts` exists. If not, create it:

```typescript
// server/db/schema/storage.ts
import { pgTable, uuid, timestamp, text, integer, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const storageFiles = pgTable('storage_files', {
    id: uuid('id').defaultRandom().primaryKey(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    public_url: text('public_url'),
    size: integer('size'),
    mime_type: text('mime_type'),
    bucket: text('bucket'),
    key: text('key'),
    is_public: boolean('is_public').default(false),
    uploaded_by: text('uploaded_by'),
})

export const storageFilesRelations = relations(storageFiles, ({ one }) => ({
    uploader: one(user, {
        fields: [storageFiles.uploaded_by],
        references: [user.id],
    }),
}))

import { user } from './auth'
```

**Step 3: Update API routes**

```typescript
// app/api/public/artists/available/route.ts
import { NextResponse } from 'next/server'
import { getAvailableStaff } from '@/server/actions/time-clock'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date')
    const date = dateStr ? new Date(dateStr) : new Date()
    
    const staffIds = await getAvailableStaff(date)
    return NextResponse.json({ staff: staffIds })
}

// app/api/public/hours/route.ts
import { NextResponse } from 'next/server'
import { getSettings } from '@/server/actions/settings'

export async function GET() {
    const settings = await getSettings()
    const hoursSetting = settings?.find(s => s.key === 'operating_hours')
    return NextResponse.json({ hours: hoursSetting?.value || {} })
}
```

**Step 4: Commit**

```bash
git add server/actions/public.ts server/db/schema/storage.ts app/api/public/
git commit -m "feat(public): implement public API server actions"
```

---

### Task 5: Fix Metrics Server Actions (Implement Remaining Stub Functions)

**Files:**
- Modify: `server/actions/metrics.ts:1-383`

**Step 1: Implement financial metrics**

Replace stub functions with actual implementations (keeping existing `getPLMetrics`, `getExpenseBreakdown`, `getRevenueExpenseTrend` which are already implemented):

```typescript
// Add to existing metrics.ts

export async function getScopedFinancialMetrics(
    startDate: string,
    endDate: string
): Promise<FinancialMetrics> {
    const user = await getCurrentUser()
    if (!user) return { revenue: 0, transactions: 0, averageTicket: 0 }
    
    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) return { revenue: 0, transactions: 0, averageTicket: 0 }

    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const entries = await db
            .select({
                credit: generalLedger.credit,
                entryType: generalLedger.entryType,
            })
            .from(generalLedger)
            .where(and(
                eq(generalLedger.isVoided, false),
                eq(generalLedger.entryType, 'REVENUE'),
                gte(generalLedger.entryDate, start),
                lte(generalLedger.entryDate, end)
            ))

        const revenue = entries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0)
        const transactions = entries.length
        const averageTicket = transactions > 0 ? revenue / transactions : 0

        return { revenue, transactions, averageTicket }
    } catch (error) {
        console.error('Error fetching financial metrics:', error)
        return { revenue: 0, transactions: 0, averageTicket: 0 }
    }
}

export async function getFinancialMetrics(): Promise<FinancialMetrics> {
    const today = new Date()
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    return getScopedFinancialMetrics(startOfMonth.toISOString(), today.toISOString())
}

export async function getRevenueTrend(
    startDate: string,
    endDate: string,
    groupBy: "day" | "month" = "day"
): Promise<RevenueTrend> {
    const user = await getCurrentUser()
    if (!user) return []
    
    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) return []

    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const entries = await db
            .select({
                entryDate: generalLedger.entryDate,
                credit: generalLedger.credit,
            })
            .from(generalLedger)
            .where(and(
                eq(generalLedger.isVoided, false),
                eq(generalLedger.entryType, 'REVENUE'),
                gte(generalLedger.entryDate, start),
                lte(generalLedger.entryDate, end)
            ))
            .orderBy(generalLedger.entryDate)

        // Group by day or month
        const grouped = new Map<string, number>()
        
        entries.forEach(entry => {
            const date = new Date(entry.entryDate)
            const key = groupBy === 'day' 
                ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            
            const current = grouped.get(key) || 0
            grouped.set(key, current + (Number(entry.credit) || 0))
        })

        return Array.from(grouped.entries()).map(([date, revenue]) => ({
            date,
            revenue,
        }))
    } catch (error) {
        console.error('Error fetching revenue trend:', error)
        return []
    }
}
```

**Step 2: Implement operational metrics**

```typescript
export async function getOperationalMetrics(
    startDate: string,
    endDate: string
): Promise<OperationalMetrics> {
    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const allAppointments = await db
            .select({
                status: appointments.status,
            })
            .from(appointments)
            .where(and(
                gte(appointments.start_time, start),
                lte(appointments.end_time, end)
            ))

        const total = allAppointments.length
        const completed = allAppointments.filter(a => a.status === 'COMPLETED').length
        const cancelled = allAppointments.filter(a => a.status === 'CANCELLED').length
        const cancellationRate = total > 0 ? (cancelled / total) * 100 : 0

        return { totalAppointments: total, completedAppointments: completed, cancelledAppointments: cancelled, cancellationRate }
    } catch (error) {
        console.error('Error fetching operational metrics:', error)
        return { totalAppointments: 0, completedAppointments: 0, cancelledAppointments: 0, cancellationRate: 0 }
    }
}
```

**Step 3: Implement inventory metrics**

```typescript
export async function getInventoryMetrics(
    startDate: string
): Promise<InventoryMetrics> {
    try {
        // Get total inventory value
        const items = await db
            .select({
                quantity: inventory.quantity,
                cost: inventory.unit_cost,
                price: inventory.unit_price,
                name: inventory.name,
            })
            .from(inventory)
            .where(eq(inventory.is_active, true))

        const totalValue = items.reduce((sum, item) => sum + ((Number(item.cost) || 0) * (item.quantity || 0)), 0)
        const potentialRevenue = items.reduce((sum, item) => sum + ((Number(item.price) || 0) * (item.quantity || 0)), 0)
        
        // Top selling would require transaction data
        const topSelling: InventoryMetrics['topSelling'] = []

        return { totalValue, potentialRevenue, topSelling }
    } catch (error) {
        console.error('Error fetching inventory metrics:', error)
        return { totalValue: 0, potentialRevenue: 0, topSelling: [] }
    }
}
```

**Step 4: Implement remaining stub functions**

```typescript
export async function getRatingMetrics(): Promise<RatingMetrics> {
    // Requires ratings table - return empty for now
    return { averageRating: 0, totalRatings: 0, distribution: [] }
}

export async function getStaffPerformance(): Promise<StaffPerformanceMetric[]> {
    // Requires ratings table - return empty for now
    return []
}

export async function getClientTypeMetrics(
    startDate: string,
    endDate: string
): Promise<ClientTypeMetrics> {
    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const appts = await db
            .select({
                client_type: appointments.client_type,
            })
            .from(appointments)
            .where(and(
                gte(appointments.start_time, start),
                lte(appointments.end_time, end)
            ))

        const walkinCount = appts.filter(a => a.client_type === 'WALKIN').length
        const personalCount = appts.filter(a => a.client_type === 'PERSONAL').length

        return { walkinCount, personalCount }
    } catch (error) {
        console.error('Error fetching client type metrics:', error)
        return { walkinCount: 0, personalCount: 0 }
    }
}

export async function getArtistLeaderboard(
    startDate: string,
    endDate: string
): Promise<ArtistLeaderboardEntry[]> {
    try {
        const start = new Date(startDate)
        const end = new Date(endDate)

        const entries = await db
            .select({
                staff_id: generalLedger.staff_id,
                credit: generalLedger.credit,
            })
            .from(generalLedger)
            .where(and(
                eq(generalLedger.entryType, 'REVENUE'),
                eq(generalLedger.isVoided, false),
                gte(generalLedger.entryDate, start),
                lte(generalLedger.entryDate, end),
                isNotNull(generalLedger.staff_id)
            ))

        // Group by staff
        const byStaff = new Map<string, number>()
        entries.forEach(e => {
            if (e.staff_id) {
                const current = byStaff.get(e.staff_id) || 0
                byStaff.set(e.staff_id, current + (Number(e.credit) || 0))
            }
        })

        // Get staff names
        const staffIds = Array.from(byStaff.keys())
        const profiles = await getProfilesByIds(staffIds)

        return Array.from(byStaff.entries())
            .map(([staff_id, total_revenue]) => {
                const profile = profiles.find(p => p.id === staff_id)
                return {
                    staff_id,
                    full_name: profile?.full_name || 'Unknown',
                    avatar_url: profile?.avatar_url,
                    total_revenue,
                }
            })
            .sort((a, b) => b.total_revenue - a.total_revenue)
            .slice(0, 10)
    } catch (error) {
        console.error('Error fetching artist leaderboard:', error)
        return []
    }
}

export async function getAppointmentReviews(
    page: number = 1,
    limit: number = 10
): Promise<AppointmentReviewsResult> {
    // Requires reviews table - return empty for now
    return { data: [], hasMore: false, total: 0 }
}

export async function exportMetrics(
    format: MetricsExportFormat,
    startDate: string,
    endDate: string,
    groupBy: "day" | "month" = "day"
): Promise<MetricsExportResult> {
    // Requires implementation - return not implemented for now
    return { success: false, error: 'Export functionality not yet implemented' }
}
```

**Step 5: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "feat(metrics): implement remaining server action stub functions"
```

---

### Task 6: Update Domain Configuration to rdmdstudio.com

**Files:**
- Modify: `.env.example`
- Check: `.env.local` (update actual values)
- Modify: Any hardcoded URLs in components

**Step 1: Update environment variable documentation**

```bash
# .env.example updates
# Change:
NEXT_PUBLIC_SITE_URL="https://localhost:3000"
NEXT_PUBLIC_APP_URL="https://localhost:3000"
BETTER_AUTH_URL="https://localhost:3000"
NEXT_PUBLIC_BETTER_AUTH_URL="https://localhost:3000"

# To:
NEXT_PUBLIC_SITE_URL="https://inksight.rdmdstudio.com"
NEXT_PUBLIC_APP_URL="https://inksight.rdmdstudio.com"
BETTER_AUTH_URL="https://inksight.rdmdstudio.com"
NEXT_PUBLIC_BETTER_AUTH_URL="https://inksight.rdmdstudio.com"
```

**Step 2: Find and update hardcoded URLs**

Run: `grep -r "inksight.rdmdstudio.com" --include="*.ts" --include="*.tsx" .`

Find occurrences in:
- `components/accounts/authkeyList.tsx:575` - Update hardcoded URL

```typescript
// In authkeyList.tsx, update lines 575-578:
let link = ""
if (email) {
    link = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://inksight.rdmdstudio.com'}/auth?action=reset&key=${id}`
} else {
    link = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://inksight.rdmdstudio.com'}/auth?action=user_type&key=${id}`
}
```

**Step 3: Create environment utility**

Create `utils/env.ts`:

```typescript
export const env = {
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://inksight.rdmdstudio.com',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://inksight.rdmdstudio.com',
    betterAuthUrl: process.env.BETTER_AUTH_URL || 'https://inksight.rdmdstudio.com',
} as const
```

**Step 4: Update middleware domain check**

```typescript
// middleware.ts - update if needed
// Ensure the middleware handles the new domain properly
```

**Step 5: Commit**

```bash
git add .env.example utils/env.ts components/accounts/authkeyList.tsx
git commit -m "feat(config): update domain configuration to rdmdstudio.com"
```

---

## Phase 3: Accounts & User Management

### Task 7: Fix Schedule Editor and Account Edit Page

**Files:**
- Modify: `components/schedules/scheduleEditor.tsx`
- Modify: `app/accounts/[id]/page.tsx:1-533`

**Step 1: Review ScheduleEditor component**

Check `components/schedules/scheduleEditor.tsx` for:
- Proper integration with `getStaffSchedule` and `updateStaffSchedule`
- Error handling for failed saves
- Loading states

**Step 2: Fix account edit page save logic**

Update the save logic in `/accounts/[id]/page.tsx`:

```typescript
// Fix handleSave function around line 95

const handleSave = async () => {
    if (!user || !userId) {
        addNotification("User data not loaded", "ERROR")
        return
    }

    setSaving(true)

    // Validation
    if (newPassword && newPassword.length < 12) {
        addNotification("Password must be at least 12 characters", "ERROR")
        setSaving(false)
        return
    }
    if (!editData.full_name || editData.full_name.trim().length === 0) {
        addNotification("Name cannot be empty", "ERROR")
        setSaving(false)
        return
    }
    if (!editData.email || !editData.email.includes('@')) {
        addNotification("Please enter a valid email address", "ERROR")
        setSaving(false)
        return
    }

    try {
        // Save password if provided
        if (newPassword) {
            const passRes = await updatePassword({
                _userId: userId,
                _newPassword: newPassword,
                _updatedBy: currentUser?.id ?? '',
            })
            if (!passRes) {
                addNotification("Failed to update password", "ERROR")
                setSaving(false)
                return
            }
            setNewPassword("")
        }

        // Save profile
        const res = await updateProfile({
            userId,
            profile: editData,
            updatedBy: currentUser?.id,
        })

        if (res.success) {
            addNotification("User updated successfully", "SUCCESS")
            setUser({ ...user, ...editData } as UserProfile)
            // Refresh user data
            const freshData = await getProfile(userId)
            if (freshData) {
                setUser(freshData)
                setEditData(freshData)
            }
        } else {
            addNotification(res.error || "Failed to update user", "ERROR")
        }
    } catch (error) {
        console.error('Error saving user:', error)
        addNotification("An error occurred while saving", "ERROR")
    } finally {
        setSaving(false)
    }
}
```

**Step 3: Fix schedule tab rendering**

The schedule tab calls `ScheduleEditor` but it might need specific props. Ensure ScheduleEditor handles the `readonly` prop:

```typescript
// In app/accounts/[id]/page.tsx around line 500
{activeTab === "schedule" && (
    <motion.div
        key="schedule"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
    >
        {user.role === "staff" ||
        user.role === "artist" ||
        user.role === "piercer" ||
        user.role === "shoe_tech" ? (
            <ScheduleEditor
                staffId={userId!}
                staffName={user.full_name}
                onClose={() => {}}
                readonly={!isAdmin}
            />
        ) : (
            <div className="p-8 text-center text-white/40 bg-white/5 rounded-xl border border-white/10">
                <ClockIcon size={32} className="mx-auto mb-3 opacity-50" />
                <p>Scheduling is not available for this user role</p>
            </div>
        )}
    </motion.div>
)}
```

**Step 4: Commit**

```bash
git add app/accounts/[id]/page.tsx components/schedules/scheduleEditor.tsx
git commit -m "fix(accounts): improve account edit page save logic and schedule tab"
```

---

### Task 8: Fix CreateUser and InviteUser Functionality

**Files:**
- Review: `server/actions/profile.ts:468-561`
- Review: `components/accounts/CreateUserModal.tsx:1-211`
- Review: `components/accounts/InviteUserModal.tsx:1-124`
- Review: `app/accounts/usersList.tsx:1-188`

**Step 1: Verify createUser server action works correctly**

The `createUser` function in `profile.ts` already:
1. Validates input with Zod
2. Checks admin permissions
3. Creates invitation record
4. Uses Better Auth's signUpEmail API
5. Updates user role

No changes needed - verify it works with existing tests.

**Step 2: Verify inviteUser server action works correctly**

The `inviteUser` function in `profile.ts` already:
1. Checks admin permissions
2. Validates email
3. Creates invitation record
4. Sends email via Resend

No changes needed - verify it works.

**Step 3: Fix CreateUserModal role select options**

Update role options to match Better Auth role values:

```typescript
// In CreateUserModal.tsx, line 127-135
<select
    value={role}
    onChange={(e) => setRole(e.target.value as UserRoleType)}
    className='bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1 text-white font-normal cursor-pointer transition-colors hover:bg-white/10'
>
    <option value='admin'>Admin</option>
    <option value='staff'>Staff</option>
    <option value='artist'>Artist</option>
    <option value='piercer'>Piercer</option>
    <option value='shoe_tech'>Shoe Tech</option>
</select>
```

**Step 4: Remove deprecated role options**

Remove 'manager' and 'client' options if they don't exist in the system:

```typescript
// Remove these options from both Create and Invite modals:
// <option value='manager'>Manager</option>
// <option value='client'>Client</option>
```

**Step 5: Update success callbacks**

Ensure `onSuccess` callbacks refresh the user list:

```typescript
// In usersList.tsx, ensure onSuccess callbacks work correctly
// The existing implementation already calls fetchUsers() and fetchInactiveUsers()
```

**Step 6: Commit**

```bash
git add components/accounts/CreateUserModal.tsx components/accounts/InviteUserModal.tsx
git commit -m "fix(accounts): update role options to match system roles"
```

---

### Task 9: Handle Auth Keys Deprecation

**Files:**
- Modify: `components/accounts/authkeyList.tsx:1-618`
- Modify: `app/accounts/accountsPage.tsx:1-53`

**Step 1: Evaluate auth keys tab**

The `authkeyList.tsx` shows:
- A legacy Auth Keys system that's been deprecated
- The server actions `getAuthKeys`, `createAuthKeys`, `deleteAuthKeys` return empty arrays or false
- Comments indicate "Legacy Auth Keys system is deprecated"

**Step 2: Decision - Remove or Keep Auth Keys Tab**

Option A: **Remove the tab** (Recommended - it's deprecated and non-functional)

```typescript
// In accountsPage.tsx, remove auth keys tab option:
export default function AccountsClientPage() {
    const containerRef = useRef<HTMLDivElement>(null)
    const headerRef = useRef<HTMLDivElement>(null)

    return (
        <div
            className='w-full h-full flex flex-col gap-4'
            ref={containerRef}
        >
            <div
                ref={headerRef}
                className='flex flex-row gap-8 items-center'
            >
                <div>
                    <h1 className='text-2xl font-bold flex items-center gap-2'>
                        <UsersIcon className='w-6 h-6' />
                        Accounts
                    </h1>
                    <p className='text-white/60 text-sm mt-1'>
                        Manage system users
                    </p>
                </div>
            </div>
            <UsersList headerRef={headerRef} />
        </div>
    )
}
```

Option B: **Keep but update UI to show deprecation notice**

```typescript
// Add a deprecation banner at the top of authkeyList.tsx
<div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-4">
    <p className="text-yellow-400 text-sm">
        <strong>Deprecated:</strong> Auth Keys functionality has been replaced by the invitation system.
        Use the "Invite User" button in the Users tab to send invitations.
    </p>
</div>
```

**Step 3: Implement Option A (Remove tab)**

Update `accountsPage.tsx` to only show Users tab:

```typescript
"use client"
import { useRef } from "react"
import UsersList from "./usersList"
import { UsersIcon } from "lucide-react"

export default function AccountsClientPage() {
    const containerRef = useRef<HTMLDivElement>(null)
    const headerRef = useRef<HTMLDivElement>(null)

    return (
        <div
            className='w-full h-full flex flex-col gap-4'
            ref={containerRef}
        >
            <div
                ref={headerRef}
                className='flex flex-row gap-8 items-center'
            >
                <div>
                    <h1 className='text-2xl font-bold flex items-center gap-2'>
                        <UsersIcon className='w-6 h-6' />
                        Accounts
                    </h1>
                    <p className='text-white/60 text-sm mt-1'>
                        Manage system users
                    </p>
                </div>
            </div>
            <UsersList headerRef={headerRef} />
        </div>
    )
}
```

**Step 4: Delete or deprecate authkeyList component**

If removing, delete the file:
```bash
rm components/accounts/authkeyList.tsx
```

Or rename to indicate deprecation:
```bash
mv components/accounts/authkeyList.tsx components/accounts/authkeyList.deprecated.tsx
```

**Step 5: Clean up server actions**

Update `profile.ts` to remove deprecated auth key functions or keep them as stubs with clearer deprecation notices:

```typescript
// Keep as stubs that return empty/false with console warning
export async function getAuthKeys() {
    console.warn('DEPRECATED: Auth Keys system is deprecated. Use invitations instead.')
    return [] as AuthKeys[]
}
```

**Step 6: Commit**

```bash
git add app/accounts/accountsPage.tsx
git rm components/accounts/authkeyList.tsx
git commit -m "refactor(accounts): remove deprecated auth keys tab in favor of invitation system"
```

---

## Phase 4: Notification Provider & Polish

### Task 10: Make Notifications Ephemeral by Default

**Files:**
- Modify: `components/notifications.tsx:1-165`
- Modify: `utils/types/notifications.ts:1-14`

**Step 1: Update NotificationContextType**

```typescript
// utils/types/notifications.ts
export type NotificationType = 'INFO' | 'SUCCESS' | 'ERROR' | 'WARNING'

export interface NotificationItem {
    id: string
    title?: string
    message: string
    type: NotificationType
}

export interface NotificationContextType {
    notifications: NotificationItem[]
    addNotification: (
        message: string, 
        type?: NotificationType, 
        title?: string, 
        ephemeral?: boolean
    ) => void
    removeNotification: (id: string) => void
}
```

**Step 2: Update NotificationProvider to default ephemeral to true**

```typescript
// components/notifications.tsx
"use client"

import {
    NotificationContextType,
    NotificationItem,
} from "@/utils/types/notifications"
import { CheckIcon, TriangleAlertIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { createContext, useCallback, useEffect, useState } from "react"

export const NotificationContext = createContext<NotificationContextType>({
    notifications: [],
    addNotification: () => {},
    removeNotification: () => {},
})

export default function NotificationProvider({
    children,
}: {
    children: React.ReactNode
}) {
    const [notifications, setNotifications] = useState<NotificationItem[]>([])

    const [isHovered, setIsHovered] = useState(false)

    const removeNotification: NotificationContextType["removeNotification"] =
        useCallback((id) => {
            setNotifications((prevNotifications) =>
                prevNotifications.filter((n) => n.id !== id)
            )
        }, [])

    const addNotification: NotificationContextType["addNotification"] =
        useCallback(
            (message, type = "INFO", title, ephemeral = true) => {
                const id =
                    Date.now().toString(36) +
                    Math.random().toString(36).slice(2)
                const newNotification: NotificationItem = {
                    id,
                    title: title || "",
                    message,
                    type: type || "INFO",
                }
                setNotifications((prevNotifications) => [
                    newNotification,
                    ...prevNotifications,
                ])
                
                // Ephemeral notifications auto-remove after 5 seconds
                // Non-ephemeral notifications persist until manually dismissed
                if (ephemeral) {
                    setTimeout(() => {
                        removeNotification(id)
                    }, 5000)
                }
            },
            [removeNotification]
        )

    const contextValue: NotificationContextType = {
        notifications,
        addNotification,
        removeNotification,
    }

    useEffect(() => {
        if (notifications.length < 1) {
            setIsHovered(false)
        }
    }, [notifications])

    return (
        <NotificationContext.Provider value={contextValue}>
            {children}
            <AnimatePresence>
                {notifications.length > 0 && (
                    <motion.div
                        key='notifcation-box'
                        className={`fixed bottom-2 right-2 z-50 flex flex-col-reverse gap-2 max-h-[80svh] w-max ${isHovered ? "overflow-y-auto" : ""}`}
                        onMouseLeave={() => setIsHovered(false)}
                        layout
                    >
                        <AnimatePresence mode='popLayout'>
                            {notifications.map(
                                ({ id, title, message, type }, idx) => (
                                    <motion.div
                                        key={id}
                                        initial={{
                                            opacity: 0,
                                            scale: 0,
                                        }}
                                        animate={{
                                            scale: isHovered
                                                ? 1
                                                : idx === 0
                                                  ? 1
                                                  : 1 - idx * 0.1,
                                            y: isHovered
                                                ? 0
                                                : idx === 0
                                                  ? 0
                                                  : idx * -20,
                                            zIndex: isHovered ? 0 : 100 - idx,
                                            opacity: isHovered
                                                ? 1
                                                : idx == 0
                                                  ? 1
                                                  : 1 - idx * 0.15,
                                        }}
                                        exit={{
                                            opacity: 0,
                                            scale: 0,
                                        }}
                                        transition={{
                                            type: "spring",
                                            stiffness: 260,
                                            damping: 20,
                                        }}
                                        whileHover={{
                                            opacity: 0.8,
                                        }}
                                        layout
                                        onClick={() => removeNotification(id)}
                                        onMouseEnter={() => {
                                            if (idx === 0) {
                                                setIsHovered(true)
                                            }
                                        }}
                                        className={` w-[80svw] max-w-xl backdrop-blur-lg p-4 rounded-md border-2 border-white/5 select-none cursor-pointer flex flex-row gap-2 
                                            ${isHovered ? "relative" : idx === 0 ? "relative" : "absolute bottom-0 right-0"}
                            ${
                                type === "INFO" && "bg-white/10"
                            } ${type === "WARNING" && "bg-orange-500/10"} ${
                                type === "ERROR" && "bg-red-500/10"
                            } ${type === "SUCCESS" && "bg-green-500/10"}`}
                                    >
                                        <div className='flex-1'>
                                            {title && (
                                                <p className='font-bold text-xs text-white/60'>
                                                    {title}
                                                </p>
                                            )}
                                            <p className='text-sm'>{message}</p>
                                        </div>
                                        {type === "SUCCESS" && (
                                            <CheckIcon
                                                size={20}
                                                className='stroke-white/80'
                                            />
                                        )}
                                        {(type === "WARNING" ||
                                            type === "ERROR") && (
                                            <TriangleAlertIcon
                                                size={20}
                                                className='stroke-white/80'
                                            />
                                        )}
                                    </motion.div>
                                )
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </NotificationContext.Provider>
    )
}
```

**Step 3: Update all addNotification calls to explicitly use ephemeral**

Search and update places where persistent notifications are needed:

```typescript
// For persistent notifications (errors that need user attention), use:
addNotification("Critical error message", "ERROR", "Error", false)

// For ephemeral notifications (success messages, temporary info), use:
addNotification("Operation successful", "SUCCESS") // defaults to ephemeral=true
// or explicitly:
addNotification("Operation successful", "SUCCESS", undefined, true)
```

**Step 4: Audit existing notification calls**

Run: `grep -r "addNotification" --include="*.tsx" . | grep -v "ephemeral"`

Review each call and decide if it should be:
- Ephemeral (default): Success messages, temporary info
- Persistent (ephemeral=false): Critical errors, validation errors requiring user action

**Step 5: Commit**

```bash
git add components/notifications.tsx utils/types/notifications.ts
git commit -m "feat(notifications): make ephemeral default for notifications"
```

---

### Task 11: Integrate System Logs Across All Actions

**Files:**
- Verify: All `server/actions/*.ts` files
- Verify: `createLogs` calls are consistent

**Step 1: Audit all server actions for logging**

Run: `grep -r "import { createLogs }" server/actions/`

Verify all action files import and use `createLogs`:
- ✅ transactions.ts
- ✅ services.ts
- ✅ branches.ts
- ✅ profile.ts
- ✅ inventory.ts
- ✅ accounting.ts
- ✅ appointments.ts
- ✅ payment-methods.ts
- ✅ payroll.ts
- ✅ logs.ts

**Step 2: Ensure consistent log format**

All log calls should follow this pattern:

```typescript
// Success logs
await createLogs({
    logs: [{
        level: 'INFO',
        type: 'INVENTORY', // Use appropriate type
        user_id: currentUser?.id,
        message: `Description of what happened: ${relevantData}`,
    }]
})

// Error logs
await createLogs({
    logs: [{
        level: 'ERROR',
        type: 'INVENTORY',
        message: `Failed to do X: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }]
})
```

**Step 3: Add user_id to all logs where possible**

Update any logs that don't include `user_id` to include it when a user context is available.

**Step 4: Ensure error logging catches all error types**

```typescript
try {
    // operation
} catch (error) {
    console.error('Error description:', error)
    await createLogs({
        logs: [{
            level: 'ERROR',
            type: 'APPROPRIATE_TYPE',
            message: `Failed to do X: ${error instanceof Error ? error.message : String(error)}`,
        }]
    })
    return { success: false, error: 'User-friendly error message' }
}
```

**Step 5: No file changes needed if already consistent**

If logging is already consistent, skip commit. Otherwise:

```bash
git add server/actions/
git commit -m "refactor(logging): ensure consistent logging across all server actions"
```

---

### Task 12: Final Integration Testing & Documentation

**Files:**
- Create: `docs/SYSTEM-ACTIONS.md` (documentation)
- Run: Integration tests

**Step 1: Create system actions documentation**

```markdown
# docs/SYSTEM-ACTIONS.md

# InkSight RDMD System Actions

## Overview

All server actions are located in `server/actions/` and use Drizzle ORM for database operations.

## Available Actions

### Authentication & Users (`profile.ts`)
- `getProfile(userId)` - Get user profile
- `getProfiles()` - Get all user profiles
- `updateProfile(userId, profile)` - Update user profile
- `createUser(params)` - Create new user (admin only)
- `inviteUser(params)` - Send invitation (admin only)

### Time Clock (`time-clock.ts`)
- `getClockStatus(staffId)` - Get current clock status
- `clockIn(staffId, notes?)` - Clock in staff
- `clockOut(staffId, notes?)` - Clock out staff
- `getStaffSchedule(staffId)` - Get staff schedule
- `updateStaffSchedule(staffId, schedules)` - Update schedule

### Inventory (`inventory.ts`)
- `getInventory()` - Get all active inventory
- `createInventoryItem(item)` - Create item
- `updateInventoryItem(itemId, item)` - Update item
- `deleteInventoryItem(itemId)` - Soft delete
- `restockInventoryItem(itemId, quantity)` - Add stock

### Appointments (`appointments.ts`)
- `getAppointments(filters)` - Get appointments
- `createAppointment(data)` - Create appointment
- `updateAppointment(id, data)` - Update appointment
- `cancelAppointment(id)` - Cancel appointment

### Logging (`logs.ts`)
- `createLogs({ logs })` - Create log entries
- `getLogs(page, level?, type?)` - Get paginated logs

## Log Types
- `APPOINTMENT` - Appointment events
- `INVENTORY` - Inventory changes
- `SYSTEM` - System events
- `AUTH` - Authentication events
- `ACCOUNTING` - Financial transactions
- `PAYROLL` - Payroll events
- `OTHER` - Miscellaneous

## Log Levels
- `INFO` - Informational
- `WARN` - Warning
- `ERROR` - Error
- `DEBUG` - Debug information
- `FATAL` - Critical error
```

**Step 2: Run development server and verify**

Run: `bun run dev`

Verify:
1. Application starts without errors
2. Authentication works
3. User management pages load
4. No TypeScript errors

**Step 3: Run lint check**

Run: `bun run lint`

Fix any linting issues.

**Step 4: Create integration test checklist**

- [ ] User creation works via CreateUserModal
- [ ] User invitation works via InviteUserModal
- [ ] Account edit page saves profile changes
- [ ] Schedule tab loads and saves schedules
- [ ] Time clock functions work
- [ ] Notifications appear and auto-dismiss
- [ ] System logs persist to database
- [ ] Domain configuration uses rdmdstudio.com

**Step 5: Final commit for documentation**

```bash
git add docs/SYSTEM-ACTIONS.md
git commit -m "docs: add system actions documentation"
```

---

## Additional Improvements (Suggestions)

### Suggestion 1: Add Database Indexes for Performance

Add indexes frequently queried columns:

```typescript
// In schema files, add indexes for:
// - appointments.start_time (already exists)
// - appointments.status
// - inventory.item_type
// - inventory.branch_id
// - generalLedger.entry_date (already exists)
// - generalLedger.entry_type
```

### Suggestion 2: Implement Rate Limiting for Auth Actions

```typescript
// Add rate limiting to:
// - createUser
// - inviteUser
// - login attempts (Better Auth should handle this)
```

### Suggestion 3: Add Audit Trail for Sensitive Operations

Extend logging to capture before/after states:

```typescript
// For operations like:
// - Role changes
// - Permission changes
// - Payroll modifications
// - Financial transactions

await createLogs({
    logs: [{
        level: 'INFO',
        type: 'SYSTEM',
        user_id: currentUser.id,
        message: `Changed user role from "${oldRole}" to "${newRole}" for user ${targetUserId}`,
    }]
})
```

### Suggestion 4: Add Request Validation Middleware

Create a server-side validation utility:

```typescript
// utils/validation.ts
import { z } from 'zod'

export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data)
    if (!result.success) {
        throw new Error(`Validation failed: ${JSON.stringify(result.error.flatten())}`)
    }
    return result.data
}
```

### Suggestion 5: Implement Soft Delete for All Entities

Ensure all delete operations use soft delete:

```typescript
// Instead of:
await db.delete(table).where(eq(table.id, id))

// Use:
await db.update(table).set({ is_deleted: true }).where(eq(table.id, id))
```

---

## Execution Order Summary

1. **Phase 1: Server Actions & Drizzle Migration**
   - Task 1: Create System Logs Database Schema
   - Task 2: Implement System Logs Server Action
   - Task 3: Implement Time Clock Server Actions

2. **Phase 2: Server Actions Cleanup**
   - Task 4: Implement Public Server Actions
   - Task 5: Fix Metrics Server Actions
   - Task 6: Update Domain Configuration

3. **Phase 3: Accounts & User Management**
   - Task 7: Fix Schedule Editor and Account Edit Page
   - Task 8: Fix CreateUser and InviteUser Functionality
   - Task 9: Handle Auth Keys Deprecation

4. **Phase 4: Notification Provider & Polish**
   - Task 10: Make Notifications Ephemeral by Default
   - Task 11: Integrate System Logs Across All Actions
   - Task 12: Final Integration Testing & Documentation

---

**Plan complete and saved to `docs/plans/2025-03-22-system-improvements.md`.**

**Execution options:**

**1. Subagent-Driven (this session)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open a new session with the executing-plans skill, batch execution with checkpoints

**Which approach would you like to use?**