# Phase 5: System Logs Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance system logs to display user names instead of IDs and include branch information where applicable.

**Architecture:**
1. Update log schema to include `branch_id`
2. Modify log creation functions to accept branch context
3. Update log retrieval to join with user and branch tables
4. Update log display UI to show resolved names

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM

---

## Task 1: Update Log Schema with Branch Reference

**Files:**
- Modify: `server/db/schema/logs.ts`
- Create: `server/db/migrations/[timestamp]_add_branch_to_logs.ts`

**Step 1: Read current log schema**

Read `server/db/schema/logs.ts` to understand current structure.

**Step 2: Add branch_id to logs**

Modify `server/db/schema/logs.ts`:

```typescript
import { pgTable, uuid, timestamp, text, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'
import { branches } from './branches'

export const logLevelEnum = pgEnum('log_level', ['INFO', 'WARN', 'ERROR', 'DEBUG', 'FATAL'])
export const logTypeEnum = pgEnum('log_type', ['APPOINTMENT', 'INVENTORY', 'SYSTEM', 'AUTH', 'ACCOUNTING', 'PAYROLL', 'STORAGE', 'METRICS', 'OTHER'])

export const logs = pgTable('logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    
    level: logLevelEnum('level').notNull(),
    type: logTypeEnum('type').notNull(),
    
    // User who performed the action
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    
    // Branch where action occurred (new)
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    
    // Log message
    message: text('message').notNull(),
    
    // Additional metadata (JSON)
    metadata: text('metadata'),
}, (table) => ({
    userIdIdx: index('idx_logs_user_id').on(table.userId),
    branchIdIdx: index('idx_logs_branch_id').on(table.branchId),
    typeIdx: index('idx_logs_type').on(table.type),
    createdAtIdx: index('idx_logs_created_at').on(table.createdAt),
}))

export const logsRelations = relations(logs, ({ one }) => ({
    user: one(user, {
        fields: [logs.userId],
        references: [user.id],
    }),
    branch: one(branches, {
        fields: [logs.branchId],
        references: [branches.id],
    }),
}))

export type Log = typeof logs.$inferSelect
export type NewLog = typeof logs.$inferInsert
```

**Step 3: Update TypeScript types**

Modify `utils/types/logs.ts`:

```typescript
export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG" | "FATAL"

export type LogType = "APPOINTMENT" | "INVENTORY" | "SYSTEM" | "AUTH" | "ACCOUNTING" | "PAYROLL" | "STORAGE" | "METRICS" | "OTHER"

export interface LogEntry {
    id: string
    date: string
    level: LogLevel
    type: LogType
    user_id?: string
    user_name?: string// New: resolved user name
    user_email?: string// New: resolved user email
    branch_id?: string
    branch_name?: string// New: resolved branch name
    branch_code?: string// New: resolved branch code
    message?: string
    metadata?: Record<string, unknown>
}

export interface CreateLogEntryPayload {
    level: LogLevel
    type: LogType
    user_id?: string
    branch_id?: string// New
    message?: string
    metadata?: Record<string, unknown>
}
```

**Step 4: Generate and run migration**

Run: `bun run db:generate`
Run: `bun run db:migrate`

**Step 5: Commit schema changes**

```bash
git add server/db/schema/logs.ts utils/types/logs.ts
git commit -m "feat(logs): add branch_id to logs schema"
```

---

## Task 2: Update Log Creation Functions

**Files:**
- Modify: `server/actions/logs.ts`

**Step 1: Read current logs actions**

Read `server/actions/logs.ts` to understand current implementation.

**Step 2: Update createLogs function**

Modify `server/actions/logs.ts`:

```typescript
'use server'

import { db } from '@/server/db'
import { logs } from '@/server/db/schema'
import { desc, eq, and, gte, lte, or, ilike } from 'drizzle-orm'
import type { LogEntry, CreateLogEntryPayload, LogLevel, LogType } from '@/utils/types/logs'

export interface CreateLogsParams {
    logs: CreateLogEntryPayload[]
}

export async function createLogs(params: CreateLogsParams): Promise<void> {
    try {
        const logEntries = params.logs.map(log => ({
            level: log.level,
            type: log.type,
            userId: log.user_id ?? null,
            branchId: log.branch_id ?? null,// Add branch_id
            message: log.message ?? null,
            metadata: log.metadata ? JSON.stringify(log.metadata) : null,
        }))

        await db.insert(logs).values(logEntries)
    } catch (error) {
        console.error('Failed to create logs:', error)
        throw error
    }
}

export async function logError(params: CreateLogEntryPayload): Promise<void> {
    await createLogs({
        logs: [{
            level: 'ERROR',
            type: params.type,
            user_id: params.user_id,
            branch_id: params.branch_id,
            message: params.message,
            metadata: params.metadata,
        }]
    })
}

export async function logInfo(params: CreateLogEntryPayload): Promise<void> {
    await createLogs({
        logs: [{
            level: 'INFO',
            type: params.type,
            user_id: params.user_id,
            branch_id: params.branch_id,
            message: params.message,
            metadata: params.metadata,
        }]
    })
}
```

**Step 3: Update log retrieval to include user and branch names**

```typescript
export interface GetLogsParams {
    startDate?: Date
    endDate?: Date
    userId?: string
    branchId?: string
    type?: LogType
    level?: LogLevel
    search?: string
    limit?: number
    offset?: number
}

export interface LogWithUser extends LogEntry {
    id: string
    createdAt: Date
    level: LogLevel
    type: LogType
    userId: string | null
    userName: string | null
    userEmail: string | null
    branchId: string | null
    branchName: string | null
    branchCode: string | null
    message: string | null
}

export async function getLogs(params: GetLogsParams = {}): Promise<{
    logs: LogWithUser[]
    total: number
}> {
    const conditions = []

    if (params.startDate) {
        conditions.push(gte(logs.createdAt, params.startDate))
    }
    if (params.endDate) {
        conditions.push(lte(logs.createdAt, params.endDate))
    }
    if (params.userId) {
        conditions.push(eq(logs.userId, params.userId))
    }
    if (params.branchId) {
        conditions.push(eq(logs.branchId, params.branchId))
    }
    if (params.type) {
        conditions.push(eq(logs.type, params.type))
    }
    if (params.level) {
        conditions.push(eq(logs.level, params.level))
    }
    if (params.search) {
        conditions.push(ilike(logs.message, `%${params.search}%`))
    }

    const limit = params.limit ?? 50
    const offset = params.offset ?? 0

    try {
        // Join with user and branch tables to get names
        const results = await db
            .select({
                id: logs.id,
                createdAt: logs.createdAt,
                level: logs.level,
                type: logs.type,
                userId: logs.userId,
                userName: user.fullName,
                userEmail: user.email,
                branchId: logs.branchId,
                branchName: branches.name,
                branchCode: branches.code,
                message: logs.message,
                metadata: logs.metadata,
            })
            .from(logs)
            .leftJoin(user, eq(logs.userId, user.id))
            .leftJoin(branches, eq(logs.branchId, branches.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(logs.createdAt))
            .limit(limit)
            .offset(offset)

        // Get total count for pagination
        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(logs)
            .where(conditions.length > 0 ? and(...conditions) : undefined)

        const formattedLogs: LogWithUser[] = results.map(r => ({
            id: r.id,
            createdAt: r.createdAt,
            level: r.level as LogLevel,
            type: r.type as LogType,
            userId: r.userId,
            userName: r.userName,
            userEmail: r.userEmail,
            branchId: r.branchId,
            branchName: r.branchName,
            branchCode: r.branchCode,
            message: r.message,
        }))

        return {
            logs: formattedLogs,
            total: Number(countResult[0]?.count ?? 0),
        }
    } catch (error) {
        console.error('Failed to fetch logs:', error)
        return {
            logs: [],
            total: 0,
        }
    }
}
```

**Step 4: Commit logs actions changes**

```bash
git add server/actions/logs.ts
git commit -m "feat(logs): include user and branch names in log retrieval"
```

---

## Task 3: Update Log-Using Code to Include Branch Context

**Files:**
- Modify: Multiple files that call `createLogs` or `logError`
- Search: `server/actions/*.ts` for log calls

**Step 1: Find all log usage**

Run: `grep -r "createLogs\|logError" --include="*.ts" server/actions/`

**Step 2: Update appointment actions**

Modify `server/actions/appointments.ts`:

Update all `createLogs` calls to include `branch_id`:

```typescript
// Example: In createAppointment
createLogs({
    logs: [{
        level: 'INFO',
        type: 'APPOINTMENT',
        message: `Appointment created: ${result.id} by ${auth.userId}`,
        user_id: auth.userId,
        branch_id: validated.data.branch_id,// Add branch context
    }]
})

// Example: In updateAppointment
createLogs({
    logs: [{
        level: 'INFO',
        type: 'APPOINTMENT',
        message: `Appointment updated: ${appointmentId} by ${auth.userId}`,
        user_id: auth.userId,
        branch_id: current.branchId ??undefined,// Use existing branch
    }]
})
```

**Step 3: Update inventory actions**

Modify `server/actions/inventory.ts`:

```typescript
// In inventory creation/update
createLogs({
    logs: [{
        level: 'INFO',
        type: 'INVENTORY',
        message: `Inventory item created: ${newItem.name}`,
        user_id: userId,
        branch_id: payload.branch_id,
    }]
})
```

**Step 4: Update other modules**

Repeat for:
- `server/actions/services.ts`
- `server/actions/transactions.ts` (if exists)
- `server/actions/time-clock.ts` (already updated in Phase 4)
- `server/actions/payroll.ts` (if exists)

**Step 5: Commit log usage updates**

```bash
git add server/actions/*.ts
git commit -m "feat(logs): add branch context to all log calls"
```

---

## Task 4: Create System Logs Admin Page

**Files:**
- Create: `app/(app)/admin/logs/page.tsx`
- Create: `app/(app)/admin/logs/logsPage.tsx`

**Step 1: Create logs page**

Create `app/(app)/admin/logs/page.tsx`:

```tsx
import { Metadata } from "next"
import LogsPageClient from "./logsPageClient"

export const metadata: Metadata = {
    title: "System Logs",
    description: "View and search system activity logs",
}

export default function LogsPage() {
    return <LogsPageClient />
}
```

**Step 2: Create logs client component**

Create `app/(app)/admin/logs/logsPageClient.tsx`:

```tsx
"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import {
    SearchIcon,
    FilterIcon,
    DownloadIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ClockIcon,
    UserIcon,
    Building2Icon,
    AlertCircleIcon,
    InfoIcon,
    AlertTriangleIcon,
} from "lucide-react"
import { getLogs } from "@/server/actions/logs"
import { useBranchContext } from "@/components/branch-context"
import type { LogWithUser } from "@/server/actions/logs"
import type { LogLevel, LogType } from "@/utils/types/logs"

const LEVEL_COLORS: Record<LogLevel, string> = {
    INFO: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    WARN: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    ERROR: 'bg-red-500/20 text-red-400 border-red-500/30',
    DEBUG: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    FATAL: 'bg-red-700/20 text-red-300 border-red-700/30',
}

const TYPE_LABELS: Record<LogType, string> = {
    APPOINTMENT: 'Appointment',
    INVENTORY: 'Inventory',
    SYSTEM: 'System',
    AUTH: 'Authentication',
    ACCOUNTING: 'Accounting',
    PAYROLL: 'Payroll',
    STORAGE: 'Storage',
    METRICS: 'Metrics',
    OTHER: 'Other',
}

export default function LogsPageClient() {
    const { branches } = useBranchContext()
    const [logs, setLogs] = useState<LogWithUser[]>([])
    const [loading, setLoading] = useState(true)
    const [total, setTotal] = useState(0)
    
    // Filters
    const [page, setPage] = useState(0)
    const [search, setSearch] = useState("")
    const [levelFilter, setLevelFilter] = useState<LogLevel | "">("")
    const [typeFilter, setTypeFilter] = useState<LogType | "">("")
    const [branchFilter, setBranchFilter] = useState<string | "">("")
    const [startDate, setStartDate] = useState("")
    const [endDate, setEndDate] = useState("")
    
    const pageSize = 50

    useEffect(() => {
        loadLogs()
    }, [page, levelFilter, typeFilter, branchFilter, startDate, endDate])

    const loadLogs = async () => {
        setLoading(true)
        
        const result = await getLogs({
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            level: levelFilter || undefined,
            type: typeFilter || undefined,
            branchId: branchFilter || undefined,
            search: search || undefined,
            limit: pageSize,
            offset: page * pageSize,
        })
        
        if (result.logs) {
            setLogs(result.logs)
            setTotal(result.total)
        }
        
        setLoading(false)
    }

    const handleSearch = () => {
        setPage(0)
        loadLogs()
    }

    const handleExport = () => {
        // TODO: Implement CSV export
        const csvContent = logs.map(log => 
            `${log.createdAt.toISOString()},${log.level},${log.type},${log.userName || 'System'},${log.branchName || '-'},${log.message}`
        ).join('\n')
        
        const blob = new Blob([csvContent], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `logs-${format(new Date(), 'yyyy-MM-dd')}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    const totalPages = Math.ceil(total / pageSize)

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">System Logs</h1>

            {/* Filters */}
            <div className="bg-white/5 p-4 rounded-lg border border-white/10 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {/* Search */}
                    <div className="lg:col-span-2">
                        <label className="text-sm text-white/60 mb-1 block">Search</label>
                        <div className="relative">
                            <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Search logs..."
                                className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-white/30"
                            />
                        </div>
                    </div>

                    {/* Level Filter */}
                    <div>
                        <label className="text-sm text-white/60 mb-1 block">Level</label>
                        <select
                            value={levelFilter}
                            onChange={(e) => setLevelFilter(e.target.value as LogLevel | "")}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-white/30"
                        >
                            <option value="">All Levels</option>
                            <option value="INFO">Info</option>
                            <option value="WARN">Warning</option>
                            <option value="ERROR">Error</option>
                            <option value="DEBUG">Debug</option>
                            <option value="FATAL">Fatal</option>
                        </select>
                    </div>

                    {/* Type Filter */}
                    <div>
                        <label className="text-sm text-white/60 mb-1 block">Type</label>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as LogType | "")}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-white/30"
                        >
                            <option value="">All Types</option>
                            {Object.entries(TYPE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Branch Filter */}
                    <div>
                        <label className="text-sm text-white/60 mb-1 block">Branch</label>
                        <select
                            value={branchFilter}
                            onChange={(e) => setBranchFilter(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-white/30"
                        >
                            <option value="">All Branches</option>
                            {branches.map((branch) => (
                                <option key={branch.id} value={branch.id}>{branch.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date Range */}
                    <div>
                        <label className="text-sm text-white/60 mb-1 block">Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-white/30"
                        />
                    </div>
                </div>

                <div className="flex justify-end mt-4 gap-2">
                    <button
                        onClick={() => {
                            setSearch("")
                            setLevelFilter("")
                            setTypeFilter("")
                            setBranchFilter("")
                            setStartDate("")
                            setEndDate("")
                            setPage(0)
                        }}
                        className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                    >
                        Clear Filters
                    </button>
                    <button
                        onClick={handleSearch}
                        className="px-4 py-2 text-sm bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-md text-blue-400 transition-colors"
                    >
                        Apply Filters
                    </button>
                </div>
            </div>

            {/* Export */}
            <div className="flex justify-end mb-4">
                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-white/5 hover:bg-white/10 border border-white/10 rounded-md transition-colors"
                >
                    <DownloadIcon size={16} />
                    Export CSV
                </button>
            </div>

            {/* Logs Table */}
            <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white/5">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-medium text-white/60">Time</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-white/60">Level</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-white/60">Type</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-white/60">User</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-white/60">Branch</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-white/60">Message</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-white/40">
                                        Loading...
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-white/40">
                                        No logs found
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-white/5">
                                        <td className="px-4 py-3 text-sm text-white/80 whitespace-nowrap">
                                            {format(log.createdAt, 'MMM d, yyyy HH:mm:ss')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${LEVEL_COLORS[log.level]}`}>
                                                {log.level}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-white/60">
                                            {TYPE_LABELS[log.type]}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <div className="flex items-center gap-2">
                                                <UserIcon size={14} className="text-white/40" />
                                                <span className="text-white/80">{log.userName || 'System'}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {log.branchName ? (
                                                <div className="flex items-center gap-2">
                                                    <Building2Icon size={14} className="text-white/40" />
                                                    <span className="text-white/80">{log.branchName}</span>
                                                    <span className="text-xs text-white/40">({log.branchCode})</span>
                                                </div>
                                            ) : (
                                                <span className="text-white/40">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-white/80 max-w-md truncate">
                                            {log.message}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                        <div className="text-sm text-white/60">
                            Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, total)} of {total} entries
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0}
                                className="p-2hover:bg-white/10 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronLeftIcon size={16} />
                            </button>
                            <span className="px-4 py-2 text-sm">
                                Page {page + 1} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                disabled={page >= totalPages - 1}
                                className="p-2 hover:bg-white/10 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronRightIcon size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
```

**Step 3: Add route to sidebar**

Modify `utils/routes.ts` or appropriate navigation file to include the logs page:

```typescript
// Add to admin routes
{
    name: 'System Logs',
    path: '/admin/logs',
    icon: 'scroll-text',
    perms: 'time_clock_admin',// Or create 'view_logs' permission
}
```

**Step 4: Commit logs page**

```bash
git add "app/(app)/admin/logs/*.tsx" utils/routes.ts
git commit -m "feat(logs): create system logs admin page with filtering"
```

---

## Task 5: Add Route for Logs Page

**Files:**
- Modify: `utils/routes.ts` or equivalent navigation configuration

**Step 1: Find routes configuration**

Read `utils/routes.ts` to understand current navigation structure.

**Step 2: Add logs route**

Add the system logs route to the admin section:

```typescript
// In admin routes section
{
    name: 'System Logs',
    path: '/admin/logs',
    icon: FileTextIcon,// or appropriate icon
    perms: 'view_logs', // Or appropriate permission
}
```

**Step 3: Add view_logs to access flags**

Update `utils/types/auth.ts` to include the new access flag:

```typescript
// Update available access flags
export type AccessFlag = 
    | 'view_appointments'
    | 'transactions'
    | 'time_clock_admin'
    | 'view_logs'// New flag
    // ... other flags
```

**Step 4: Commit route changes**

```bash
git add utils/routes.ts utils/types/auth.ts
git commit -m "feat(logs): add system logs to navigation"
```

---

## Task 6: Update All Log Calls Throughout Codebase

**Files:**
- Multiple files in `server/actions/`
- Use semantic search to find all `createLogs` calls

**Step 1: Find all createLogs calls**

Run script to find all files with createLogs calls that need branch_id:

```bash
grep -rn "createLogs" --include="*.ts" server/actions/ | grep -v "branch_id"
```

**Step 2: Update each file systematically**

For each file found, add branch_id where contextually appropriate.

Examples:

**appointments.ts:**
- createAppointment: `branch_id: validated.data.branch_id`
- updateAppointment: `branch_id: current.branchId`
- setAppointmentStatus: `branch_id: appointment.branchId`

**inventory.ts:**
- Any inventory operation: `branch_id: item.branchId`

**time-clock.ts** (already updated in Phase 4)

**Step 3: Verify all updates**

Run: `bun run build` to verify no TypeScript errors

**Step 4: Commit log updates**

```bash
git add server/actions/*.ts
git commit -m "feat(logs): add branch context to all remaining log calls"
```

---

## Verification

After all tasks are complete:

1. Run `bun run lint` - should pass
2. Run `bun run build` - should build successfully
3. Run `bun run db:migrate` - migrations applied
4. Test logs page:
   - Verify user names display instead of IDs
   - Verify branch names display where applicable
   - Test filtering by level, type, branch, date
   - Test search functionality
   - Test pagination
   - Test CSV export

5. Create test log entries and verify they appear with correct user/branch info

## Notes

- User names are resolved at query time via JOIN
- Branch names are resolved at query time via JOIN
- Logs without user show "System" as the user name
- Logs without branch show "-" for branch
- CSV export includes all visible columns
- Consider adding log archiver for old logs (future enhancement)