#Phase 3: Branch Logic Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement branch filtering and assignment across all business modules: Appointments, Calendar, Inventory, Services, Sales/Transactions, Payroll, and Metrics.

**Architecture:** 
1. Extend existing branch schema with `is_shared` for inventory/services
2. Add `branch_id` foreign keys to all relevant tables (appointments, inventory, services, transactions, time_clock_entries)
3. Create branch context provider for client-side filtering
4. Update all creation/edit forms to include branch selector
5. Update all list views to support branch filtering
6. Add branch column to system logs

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, React Context

---

## Task 1: Update Database Schema for Branch Associations

**Files:**
- Modify: `server/db/schema/appointments.ts`
- Modify: `server/db/schema/inventory.ts`
- Modify: `server/db/schema/services.ts`
- Modify: `server/db/schema/timeclock.ts`
- Modify: `server/db/schema/branches.ts`
- Modify: `utils/types/general.ts`
- Modify: `utils/types/inventory.ts`
- Create: `server/db/migrations/[timestamp]_add_branch_associations.ts`

**Step 1: Read current schema files**

Read each schema file to understand current structure:
- `server/db/schema/appointments.ts`
- `server/db/schema/inventory.ts`
- `server/db/schema/services.ts`
- `server/db/schema/timeclock.ts`
- `server/db/schema/branches.ts`

**Step 2: Update appointments schema**

Modify `server/db/schema/appointments.ts` to add branch_id:

```typescript
// Add to appointments table columns
branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
```

Add the relationship:

```typescript
export const appointmentsRelations = relations(appointments, ({ one }) => ({
    // ... existing relations
    branch: one(branches, {
        fields: [appointments.branchId],
        references: [branches.id],
    }),
}));
```

**Step 3: Update inventory schema**

Modify `server/db/schema/inventory.ts`:

The inventory already has `branch_id` and `is_shared` fields (I verified this). Verify the types are correct:

```typescript
// Already exists - verify these fields
branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
isShared: boolean('is_shared').default(false).notNull(),
```

**Step 4: Update services schema**

Modify `server/db/schema/services.ts`:

Add branch association:

```typescript
// Add to services table columns
branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
isShared: boolean('is_shared').default(true).notNull(),// Services shared by default
```

Add the relationship:

```typescript
export const servicesRelations = relations(services, ({ one, many }) => ({
    // ... existing relations
    branch: one(branches, {
        fields: [services.branchId],
        references: [branches.id],
    }),
}));
```

**Step 5: Update time_clock_entries schema**

Verify `server/db/schema/timeclock.ts` already has branch_id:

```typescript
// Should already exist - verify
branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
```

**Step 6: Create transactions schema (if needed)**

Check if transactions table exists and add branch_id if not present:

Read `server/db/schema/` to find transactions file.

Add branch association:

```typescript
// Add to transactions/payments table
branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
```

**Step 7: Update TypeScript types**

Modify `utils/types/general.ts`:

```typescript
export interface Appointment {
    id: string
    created_at: Date
    title: string
    client_id?: string
    staff_id?: string | null
    branch_id?: string | null// Add this
    time_start: Date
    time_end: Date
    // ... rest of fields
    branch?:{// Add this
        id: string
        name: string
        code: string
    }
}

export interface Service {
    id: string
    created_at: string
    title: string
    price: number
    pricing_type: 'FIXED' | 'HOURLY'
    hourly_rate: number
    is_active: boolean
    branch_id?: string | null// Add this
    is_shared: boolean// Add this
}
```

**Step 8: Update inventory types**

Verify `utils/types/inventory.ts` has:

```typescript
export interface InventoryItem {
    // ... existing fields
    branch_id?: string | null
    is_shared: boolean
    branch?: Branch
}
```

**Step 9: Generate and run migration**

Run: `bun run db:generate`
Expected: New migration file created

Run: `bun run db:migrate`
Expected: Migration applied successfully

**Step 10: Commit schema changes**

```bash
git add server/db/schema/*.ts utils/types/*.ts
git commit -m "feat(schema): add branch associations to all business modules"
```

---

## Task 2: Create Branch Context Provider

**Files:**
- Create: `components/branch-context.tsx`
- Modify: `app/layout.tsx`

**Step 1: Create branch context**

Create `components/branch-context.tsx`:

```tsx
"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { Branch } from "@/utils/types/branch"

interface BranchContextType {
    branches: Branch[]
    currentBranch: Branch | null
    setCurrentBranch: (branch: Branch | null) => void
    isLoading: boolean
    error: string | null
}

const BranchContext = createContext<BranchContextType | null>(null)

export function BranchProvider({ children }: { children: ReactNode }) {
    const [branches, setBranches] = useState<Branch[]>([])
    const [currentBranch, setCurrentBranch] = useState<Branch | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchBranches = async () => {
            try {
                setIsLoading(true)
                const response = await fetch("/api/branches")
                if (!response.ok) throw new Error("Failed to fetch branches")
                const data = await response.json()
                setBranches(data)
                // Set first branch as default, or null for "all branches"
                if (data.length > 0 && !currentBranch) {
                    setCurrentBranch(data[0])
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Unknown error")
            } finally {
                setIsLoading(false)
            }
        }

        fetchBranches()
    }, [currentBranch])

    return (
        <BranchContext.Provider
            value={{
                branches,
                currentBranch,
                setCurrentBranch,
                isLoading,
                error,
            }}
        >
            {children}
        </BranchContext.Provider>
    )
}

export function useBranchContext() {
    const context = useContext(BranchContext)
    if (!context) {
        throw new Error("useBranchContext must be used within a BranchProvider")
    }
    return context
}

// Hook for filtered queries - returns branch filter params
export function useBranchFilter() {
    const { currentBranch } = useBranchContext()
    return {
        branchId: currentBranch?.id ?? null,
        includeShared: true, // Always include shared items
    }
}
```

**Step 2: Create branches API route**

Create `app/api/branches/route.ts`:

```tsx
import { NextResponse } from "next/server"
import { db } from "@/server/db"
import { branches } from "@/server/db/schema"
import { eq } from "drizzle-orm"
import { getCurrentUser } from "@/utils/auth/permissions"

export async function GET() {
    const user = await getCurrentUser()
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const allBranches = await db
            .select()
            .from(branches)
            .where(eq(branches.isActive, true))
            .orderBy(branches.name)

        return NextResponse.json(allBranches)
    } catch (error) {
        console.error("Error fetching branches:", error)
        return NextResponse.json(
            { error: "Failed to fetch branches" },
            { status: 500 }
        )
    }
}
```

**Step 3: Integrate provider in layout**

Modify `app/layout.tsx`:

```tsx
import BranchProvider from "@/components/branch-context"
// ... other imports

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    // ... existing code

    return (
        <html
            lang='en'
            className='bg-black text-white scheme-dark [&_button]:cursor-pointer'
        >
            <head>{/* ... */}</head>
            <body className={`${geist.variable} ${bodoni.variable} antialiased overflow-clip overscroll-none`}>
                <NotificationProvider>
                    <BranchProvider>{/* Add this */}
                        <OverlayProvider>
                            <Sidebar maintenanceMode={maintenanceMode}>{children}</Sidebar>
                        </OverlayProvider>
                    </BranchProvider>{/* Add this */}
                </NotificationProvider>
            </body>
        </html>
    )
}
```

**Step 4: Commit context changes**

```bash
git add components/branch-context.tsx app/api/branches/route.ts app/layout.tsx
git commit -m "feat(branch): create branch context provider for client-side filtering"
```

---

## Task 3: Create BranchSelector Component

**Files:**
- Create: `components/branch-selector.tsx`

**Step 1: Create branch selector component**

Create `components/branch-selector.tsx`:

```tsx
"use client"

import { Building2Icon, ChevronDownIcon } from "lucide-react"
import { useBranchContext } from "./branch-context"

interface BranchSelectorProps {
    showAllOption?: boolean
    onBranchChange?: (branch: string | null) => void
    className?: string
}

export default function BranchSelector({
    showAllOption = false,
    onBranchChange,
    className = "",
}: BranchSelectorProps) {
    const { branches, currentBranch, setCurrentBranch, isLoading } = useBranchContext()

    const handleBranchChange = (branchId: string) => {
        if (branchId === "all") {
            setCurrentBranch(null)
            onBranchChange?.(null)
        } else {
            const branch = branches.find((b) => b.id === branchId)
            if (branch) {
                setCurrentBranch(branch)
                onBranchChange?.(branch.id)
            }
        }
    }

    if (isLoading) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-white/5 rounded-md ${className}`}>
                <Building2Icon size={16} className="text-white/40" />
                <span className="text-sm text-white/40">Loading branches...</span>
            </div>
        )
    }

    if (branches.length === 0) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-white/5 rounded-md ${className}`}>
                <Building2Icon size={16} className="text-white/40" />
                <span className="text-sm text-white/40">No branches</span>
            </div>
        )
    }

    if (branches.length === 1) {
        return (
            <div className={`flex items-center gap-2 px-3 py-2 bg-white/5 rounded-md ${className}`}>
                <Building2Icon size={16} className="text-blue-400" />
                <span className="text-sm font-medium">{branches[0].name}</span>
            </div>
        )
    }

    return (
        <div className={`relative ${className}`}>
            <select
                value={currentBranch?.id ?? "all"}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm font-medium cursor-pointer hover:bg-white/10 focus:outline-none focus:border-white/30 appearance-none pr-8 w-full"
            >
                {showAllOption && (
                    <option value="all">All Branches</option>
                )}
                {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                    </option>
                ))}
            </select>
            <ChevronDownIcon
                size={16}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
            />
        </div>
    )
}

// Smaller inline version for forms
export function BranchSelectorInline({
    value,
    onChange,
    showSharedOption = true,
   disabled = false,
    className = "",
}: {
    value: string | null | undefined
    onChange: (value: string | null, isShared: boolean) => void
    showSharedOption?: boolean
    disabled?: boolean
    className?: string
}) {
    const { branches, isLoading } = useBranchContext()

    if (isLoading) return null

    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            <select
                value={value ?? "shared"}
                onChange={(e) => {
                    const newValue = e.target.value === "shared" ? null : e.target.value
                    onChange(newValue, newValue === null)
                }}
                disabled={disabled}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-white/30 disabled:opacity-50"
            >
                {showSharedOption && (
                    <option value="shared">Shared (All Branches)</option>
                )}
                {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                        {branch.name}
                    </option>
                ))}
            </select>
        </div>
    )
}
```

**Step 2: Export from components index**

Create or update `components/index.ts`:

```tsx
export { default as BranchSelector, BranchSelectorInline } from "./branch-selector"
```

**Step 3: Commit component**

```bash
git add components/branch-selector.tsx components/index.ts
git commit -m "feat(branch): create BranchSelector component for forms and filters"
```

---

## Task 4: Update Appointments Module with Branch Logic

**Files:**
- Modify: `server/actions/appointments.ts`
- Modify: `app/appointments/appointmentsPage.tsx`
- Modify: `app/appointments/appointmentDetailClient.tsx`
- Modify: `components/appointments/WalkinAppointmentModal.tsx`
- Modify: `utils/types/general.ts`

**Step 1: Update appointment creation server action**

Modify `server/actions/appointments.ts`:

Update the `CreateAppointmentPayload` and `CreateWalkinAppointmentPayload` interfaces:

```typescript
export interface AppointmentPayload extends Omit<Appointment, 'id' | 'created_at'> {
    items?: Array<{ inventory_id: string; quantity: number }>
    branch_id?: string | null  // Add this
}

export interface CreateWalkinAppointmentPayload {
    // ... existing fields
    branch_id?: string | null  // Add this
}
```

Update the `createAppointment` function:

```typescript
// In the insert statement
const [result] = await db
    .insert(appointments)
    .values({
        title: sanitizeText(validated.data.title),
        clientId: validated.data.client_id,
        staffId: validated.data.staff_id,
        branchId: validated.data.branch_id,  // Add this
        // ... rest of fields
    })
    .returning()
```

Update the `transformAppointment` function:

```typescript
function transformAppointment(raw: typeof appointments.$inferSelect): Appointment {
    return {
        id: raw.id,
        created_at: raw.createdAt,
        title: raw.title,
        client_id: raw.clientId || undefined,
        staff_id: raw.staffId || null,
        branch_id: raw.branchId || null,  // Add this
        // ... rest of fields
    }
}
```

**Step 2: Add branch filtering to appointment queries**

Add new function `getAppointmentsByBranch`:

```typescript
export async function getAppointmentsByBranch(branchId: string): Promise<ActionResponse<Appointment[]>> {
    try {
        await requireStaffAuth()

        const results = await db
            .select({
                appointment: appointments,
                branch: branches,
            })
            .from(appointments)
            .leftJoin(branches, eq(appointments.branchId, branches.id))
            .where(
                and(
                    eq(appointments.isActive, true),
                    or(
                        eq(appointments.branchId, branchId),
                        isNull(appointments.branchId)// Include appointments without branch
                    )
                )
            )
            .orderBy(desc(appointments.timeStart))

        return success(results.map(r => ({
            ...transformAppointment(r.appointment),
            branch: r.branch ? {
                id: r.branch.id,
                name: r.branch.name,
                code: r.branch.code,
            } : undefined,
        })))
    } catch (error) {
        // ... error handling
    }
}
```

**Step 3: Update WalkinAppointmentModal**

Read `components/appointments/WalkinAppointmentModal.tsx` first.

Add branch selector to the modal:

```tsx
import BranchSelectorInline from "@/components/branch-selector"

// In the form state
const [selectedBranch, setSelectedBranch] = useState<string | null>(null)

// In the form JSX
<div className="space-y-2">
    <label className="text-sm font-medium text-white/60">Branch</label>
    <BranchSelectorInline
        value={selectedBranch}
        onChange={(branchId, isShared) => {
            setSelectedBranch(branchId)
            setIsShared(isShared)
        }}
        showSharedOption={false}
    />
</div>
```

**Step 4: Update appointments list page with branch filter**

Modify `app/appointments/appointmentsPage.tsx`:

```tsx
import BranchSelector from "@/components/branch-selector"
import { useBranchFilter } from "@/components/branch-context"

// In the component
const { currentBranch } = useBranchContext()
const { branchId } = useBranchFilter()

// Filter appointments by branch
const filteredAppointments = useMemo(() => {
    let filtered = appointments

    // Filter by branch
    if (branchId) {
        filtered = filtered.filter(a => 
            a.branch_id === branchId || !a.branch_id// Include shared
        )
    }

    // ... rest of filtering

    return filtered
}, [appointments, branchId, /* other deps */])

// In the JSX, add branch selector in header
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <h1 className="text-2xl font-bold flex items-center gap-2">
        <ClipboardListIcon className="w-6 h-6" />
        Appointments
    </h1>
    <div className="flex items-center gap-4">
        <BranchSelector showAllOption={true} />
        <button
            onClick={() => setShowWalkinModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-md border-2 border-green-400/20 font-semibold transition-colors"
        >
            <PlusIcon size={18} />
            Add Walk-in
        </button>
    </div>
</div>
```

**Step 5: Update appointment detail page**

Modify `app/appointments/appointmentDetailClient.tsx`:

Display branch information in the appointment details:

```tsx
// In the People Card section, add branch display
<div>
    <span className="text-sm text-white/60">Branch</span>
    <p className="font-medium">
        {appointment.branch?.name || appointment.branch_id 
            ? branches.find(b => b.id === appointment.branch_id)?.name 
            : "Not assigned"}
    </p>
</div>
```

**Step 6: Commit appointments changes**

```bash
git add server/actions/appointments.ts app/appointments/*.tsx components/appointments/WalkinAppointmentModal.tsx
git commit -m "feat(appointments): add branch filtering and assignment"
```

---

## Task 5: Update Calendar Module with Branch Filtering

**Files:**
- Modify: `app/calendar/calendarPage.tsx`
- Modify: `server/actions/appointments.ts` (add branch-filtered calendar query if needed)

**Step 1: Read calendar page implementation**

Read `app/calendar/calendarPage.tsx` to understand current structure.

**Step 2: Add branch filter to calendar**

```tsx
import BranchSelector from "@/components/branch-selector"
import { useBranchFilter } from "@/components/branch-context"

// In the component
const { branchId } = useBranchFilter()

// Filter events by branch
const filteredEvents = useMemo(() => {
    if (!branchId) return events
    
    return events.filter(event => {
        // Include events for selected branch or shared events
        return event.branch_id === branchId || !event.branch_id
    })
}, [events, branchId])

// In JSX
<div className="flex items-center justify-between">
    <h1>Calendar</h1>
    <BranchSelector showAllOption={true} />
</div>
```

**Step 3: Commit calendar changes**

```bash
git add app/calendar/calendarPage.tsx
git commit -m "feat(calendar): add branch filtering to calendar view"
```

---

## Task 6: Update Inventory Module with Branch Assignment

**Files:**
- Modify: `server/actions/inventory.ts`
- Modify: `app/inventory/inventoryPage.tsx`
- Modify: `components/inventory/InventoryForm.tsx` (or equivalent)

**Step 1: Read current inventory implementation**

Read `server/actions/inventory.ts` and `app/inventory/inventoryPage.tsx`.

**Step 2: Update inventory creation to include branch**

Modify `server/actions/inventory.ts`:

The inventory already has `branch_id` and `is_shared` fields. Update the creation and update functions:

```typescript
export interface CreateInventoryPayload {
    name: string
    // ... existing fields
    branch_id?: string | null
    is_shared?: boolean
}

// In createInventory function
const [item] = await db.insert(inventory).values({
    // ... existing fields
    branchId: payload.branch_id ?? null,
    isShared: payload.is_shared ?? false,
}).returning()
```

**Step 3: Add branch filter to inventory list**

```tsx
import BranchSelector from "@/components/branch-selector"
import { useBranchFilter } from "@/components/branch-context"

// Filter inventory
const filteredInventory = useMemo(() => {
    if (!branchId) return inventory
    
    return inventory.filter(item => {
        // Include items forselected branch
        if (item.branch_id === branchId) return true
        // Include shared items
        if (item.is_shared) return true
        return false
    })
}, [inventory, branchId])
```

**Step 4: Add branch selector to inventory form**

```tsx
<div className="space-y-2">
    <label className="text-sm font-medium text-white/60">Branch Assignment</label>
    <div className="flex gap-4">
        <BranchSelectorInline
            value={selectedBranch}
            onChange={(branchId, isShared) => {
                setSelectedBranch(branchId)
                setIsShared(isShared)
            }}
        />
        <label className="flex items-center gap-2">
            <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-white/10"
            />
            <span className="text-sm">Shared across all branches</span>
        </label>
    </div>
</div>
```

**Step 5: Commit inventory changes**

```bash
git add server/actions/inventory.ts app/inventory/inventoryPage.tsx components/inventory/*.tsx
git commit -m "feat(inventory): add branch assignment and filtering"
```

---

## Task 7: Update Services Module with Branch Assignment

**Files:**
- Modify: `server/actions/services.ts`
- Modify: services management page/component

**Step 1: Read services actions**

Read `server/actions/services.ts`.

**Step 2: Update services to include branch**

```typescript
export interface CreateServicePayload {
    title: string
    price: number
    // ... existing fields
    branch_id?: string | null
    is_shared?: boolean
}
```

**Step 3: Update service creation/update**

```typescript
const [newService] = await db.insert(services).values({
    // ... existing fields
    branchId: payload.branch_id ?? null,
    isShared: payload.is_shared ?? true, // Default to shared
}).returning()
```

**Step 4: Add branch filter to services**

Similar to inventory, filter services by branch.

**Step 5: Commit services changes**

```bash
git add server/actions/services.ts
git commit -m "feat(services): add branch assignment and filtering"
```

---

## Task 8: Update Sales/Transactions with Branch Tracking

**Files:**
- Modify: transactions/payments schema if needed
- Modify: `server/actions/transactions.ts` (or equivalent)
- Modify: sales page components

**Step 1: Check transactions schema**

Read relevant transaction/payment schema files.

**Step 2: Add branch_id if not present**

If transactions table doesn't have branch_id, add migration.

**Step 3: Update transaction creation**

When a sale is completed, automatically set the branch from the appointment or current context.

**Step 4: Add branch filter to transactions list**

**Step 5: Commit transactions changes**

```bash
git add server/actions/transactions.ts app/sales/*.tsx app/transactions/*.tsx
git commit -m "feat(transactions): add branch tracking and filtering"
```

---

## Task 9: Update Payroll Module with Branch Separation

**Files:**
- Modify: `server/actions/payroll.ts` (or equivalent)
- Modify: `app/payroll/payrollPage.tsx`
- Modify: `app/my-payroll/myPayrollPage.tsx`

**Step 1: Read payroll implementation**

Read payroll-related files.

**Step 2: Filter payroll by branch**

When calculating payroll for appointments/sales, consider only those that occurred at the selected branch.

**Step 3: Add branch column to payroll displays**

Show which branch each payment or work hour belongs to.

**Step 4: Commit payroll changes**

```bash
git add server/actions/payroll.ts app/payroll/*.tsx app/my-payroll/*.tsx
git commit -m "feat(payroll): add branch separation for payments"
```

---

## Task 10: Update Metrics Module with Branch Filtering

**Files:**
- Modify: `server/actions/metrics.ts` (or equivalent)
- Modify: `app/metrics/metricsPage.tsx`

**Step 1: Read metrics implementation**

**Step 2: Add branch filtering to metric calculations**

```typescript
export async function getMetrics(branchId?: string | null) {
    // Filter all queries by branch
    const branchFilter = branchId 
        ? and(eq(x.branchId, branchId), or(isNull(x.branchId)))
        : undefined
    
    // Apply filter to all metric queries
}
```

**Step 3: Add branch selector to metrics page**

**Step 4: Commit metrics changes**

```bash
git add server/actions/metrics.ts app/metrics/*.tsx
git commit -m "feat(metrics): add branch filtering for branch-specific analytics"
```

---

## Task 11: Update System Logs with Branch Tracking

**Files:**
- Modify: `server/actions/logs.ts`
- Modify: `utils/types/logs.ts`
- Modify: system logs viewing component

**Step 1: Update log types**

Modify `utils/types/logs.ts`:

```typescript
export interface LogEntry {
    id: string
    date: string
    level: LogLevel
    type: LogType
    user_id?: string
    user_name?: string// Add this
    branch_id?: string// Add this
    branch_name?: string// Add this
    message?: string
}
```

**Step 2: Update log creation to include branch**

Modify `server/actions/logs.ts`:

```typescript
export async function createLogs(params: { 
    logs: CreateLogEntryPayload[] 
}) {
    const user = await getCurrentUser()
    const userBranch = user?.branch_ids?.[0]// Get user's primary branch
    
    // Include user and branch info in logs
}
```

**Step 3: Update log viewing to show user names**

Join with user table to resolve user names:

```typescript
const logs = await db
    .select({
        log: logsTable,
        user: {
            id: user.id,
            name: user.fullName,
        },
        branch: {
            id: branches.id,
            name: branches.name,
        },
    })
    .from(logsTable)
    .leftJoin(user, eq(logsTable.userId, user.id))
    .leftJoin(branches, eq(logsTable.branchId, branches.id))
```

**Step 4: Display user and branch in UI**

**Step 5: Commit logs changes**

```bash
git add server/actions/logs.ts utils/types/logs.ts
git commit -m "feat(logs): track user names and branches in system logs"
```

---

## Verification

After all tasks are complete:

1. Run `bun run lint` - should pass
2. Run `bun run build` - should build successfully
3. Run migrations: `bun run db:migrate`
4. Test branch creation in admin panel
5. Test appointment creation with branch assignment
6. Verify inventory/services show branch correctly
7. Test calendar filtering by branch
8. Verify metrics show branch-specific data
9. Check system logs display user names and branches

## Notes

- Branch context provides client-side state management
- All modules filter by selected branch OR include shared items
- Appointment branch is set during creation and affects available inventory/services
- Inventory and Services can be "shared" (available to all branches)
- Transactions inherit branch from appointment or manually assigned
- Metrics aggregate data per branch for comparison