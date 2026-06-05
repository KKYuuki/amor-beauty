# Comprehensive Branch System Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all missing branch integrations across the application so that branches work consistently in appointments, inventory, accounting, payroll, sales, calendar, time clock, and all other pages that require branch context.

**Architecture:** The database schema already has `branch_id` columns in all necessary tables (appointments, services, inventory, transactions, general_ledger, time_clock_entries). The BranchContext is properly set up and fetching branches. The issue is that server actions don't filter by branch, don't accept branch_id on create/update, and client components only filter client-side without passing branch context to the server.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, PostgreSQL, Tailwind CSS

---

## Overview of Issues Found

| Component | Issue | Impact |
|-----------|-------|--------|
| WalkinAppointmentModal | No branch selection | Appointments created without branch |
| Appointment editing | No branch field | Cannot change appointment branch |
| Services | `getServices()` doesn't filter by branch | Shows all services regardless of branch |
| Inventory | Only client-side filtering | All inventory fetched, filtered in browser |
| Accounting | No branch integration | Shows all transactions |
| Sales | No branch integration | Shows all sales |
| Items in appointments | Wrong data structure | Shows "Unknown Item" |
| Services in appointments | Missing branch filter | Services not filtered by branch |
| Time Clock Calendar | Uses branch correctly | OK |
| Metrics | Uses branch correctly | OK |
| Payroll | Partial branch support | Needs improvement |

---

## Task 1: Fix AppointmentItem Data Structure (Unknown Item Issue)

**Files:**
- Modify: `server/actions/appointments.ts`
- Modify: `app/appointments/appointmentDetailClient.tsx`

### Analysis

The `getAppointmentItems` function returns a flattened object with `name` directly, but the client expects `item.inventory?.name`. Also need to add `inventory` relation properly.

### Step 1: Update getAppointmentItems to return proper structure

**File:** `server/actions/appointments.ts`

Find the `getAppointmentItems` function (around line 1309) and update it:

```typescript
export async function getAppointmentItems(appointmentId: string) {
    try {
        const items = await db
            .select({
                id: appointmentItems.id,
                appointmentId: appointmentItems.appointmentId,
                inventoryId: appointmentItems.inventoryId,
                quantity: appointmentItems.quantity,
                fluidQuantity: appointmentItems.fluidQuantity,
                // Inventory relation
                inventoryId_col: inventory.id,
                inventoryName: inventory.name,
                inventoryUnitPrice: inventory.unitPrice,
                inventorySellingPrice: inventory.sellingPrice,
            })
            .from(appointmentItems)
            .leftJoin(inventory, eq(appointmentItems.inventoryId, inventory.id))
            .where(eq(appointmentItems.appointmentId, appointmentId))

        return items.map(item => ({
            id: item.id,
            appointment_id: item.appointmentId,
            inventory_id: item.inventoryId || undefined,
            quantity: Number(item.quantity),
            fluid_quantity: item.fluidQuantity ? Number(item.fluidQuantity) : undefined,
            inventory: item.inventoryId_col ? {
                id: item.inventoryId_col,
                name: item.inventoryName || 'Unknown',
                unit_price: item.inventoryUnitPrice ? Number(item.inventoryUnitPrice) : 0,
                selling_price: item.inventorySellingPrice ? Number(item.inventorySellingPrice) : undefined,
            } : null,
        }))
    } catch (error) {
        await logError({
            type: 'APPOINTMENT',
            message: `Failed to get appointment items: ${error instanceof Error ? error.message : String(error)}`
        })
        return []
    }
}
```

### Step 2: Update the AppointmentItem type definition

**File:** `utils/types/general.ts`

Find or add the `AppointmentItem` interface:

```typescript
export interface AppointmentItem {
    id: string
    appointment_id: string
    inventory_id?: string
    quantity: number
    fluid_quantity?: number
    inventory: {
        id: string
        name: string
        unit_price: number
        selling_price?: number
    } | null
}
```

### Step 3: Run lint

Run: `bun run lint`
Expected: No errors

### Step 4: Commit

```bash
git add server/actions/appointments.ts utils/types/general.ts
git commit -m "fix: return proper inventory relation in getAppointmentItems"
```

---

## Task 2: Add Branch Integration to Walk-in Appointment Modal

**Files:**
- Modify: `components/appointments/WalkinAppointmentModal.tsx`
- Modify: `server/actions/appointments.ts`
- Modify: `utils/types/general.ts`

### Step 1: Update CreateWalkinAppointmentPayload type

**File:** `server/actions/appointments.ts`

Find the `CreateWalkinAppointmentPayload` type (around line 22-32) and add branch_id:

```typescript
export interface CreateWalkinAppointmentPayload {
    title: string
    client_name: string
    client_phone?: string
    client_email?: string
    staff_id?: string | null
    time_start: Date
    time_end: Date
    notes?: string
    type: AppointmentType | null
    branch_id?: string | null  // Add this
    status?: AppointmentStatus
}
```

### Step 2: Update createWalkinAppointment to save branch_id

**File:** `server/actions/appointments.ts`

Find the `createWalkinAppointment` function and update the insert values (around line 1492-1509):

```typescript
const [result] = await db
    .insert(appointments)
    .values({
        title: sanitizeText(payload.title),
        clientName: sanitizeText(payload.client_name),
        clientPhone: payload.client_phone ? sanitizeMinimal(payload.client_phone) : undefined,
        clientEmail: payload.client_email,
        staffId: payload.staff_id,
        timeStart: payload.time_start,
        timeEnd: payload.time_end,
        notes: payload.notes ? sanitizeText(payload.notes) : undefined,
        type: payload.type,
        status: payload.status || 'CONFIRMED',
        isActive: true,
        isWalkin: true,
        createdBy: auth.userId,
        branchId: payload.branch_id,  // Add this
    })
    .returning()
```

### Step 3: Update WalkinAppointmentModal to include branch selection

**File:** `components/appointments/WalkinAppointmentModal.tsx`

Add branch selector import and usage:

```typescript
// Add to imports at top
import { useBranchContext } from "@/components/branch-context"

// In component, add:
const { branches, currentBranch } = useBranchContext()
const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)

// Add branch selection in the form (after Appointment Type section, around line 475)
{/* Branch Selection */}
<label className='w-full font-semibold text-xs capitalize text-white/60'>
    Branch (Optional)
    <select
        value={selectedBranchId || ""}
        onChange={(e) => setSelectedBranchId(e.target.value || null)}
        className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
        disabled={isLoading}
    >
        <option value="">Select a branch...</option>
        {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
                {branch.name}
            </option>
        ))}
    </select>
    {currentBranch && !selectedBranchId && (
        <span className='text-xs text-blue-400 mt-1 block'>
            Current branch: {currentBranch.name}
        </span>
    )}
</label>

// Update handleSubmit to include branch_id:
const payload: CreateWalkinAppointmentPayload = {
    title,
    client_name: clientName,
    client_phone: clientPhone || undefined,
    client_email: clientEmail || undefined,
    staff_id: staffId || null,
    time_start: returnFormattedTime(startTime),
    time_end: returnFormattedTime(endTime),
    notes: notes || undefined,
    type,
    branch_id: selectedBranchId || currentBranch?.id || null,  // Add this
}
```

### Step 4: Run lint

Run: `bun run lint`
Expected: No errors

### Step 5: Commit

```bash
git add components/appointments/WalkinAppointmentModal.tsx server/actions/appointments.ts
git commit -m "feat: add branch selection to walk-in appointment creation"
```

---

## Task 3: Add Branch Integration to Services

**Files:**
- Modify: `server/actions/services.ts`
- Modify: `app/config/configPage.tsx`

### Step 1: Update getServices to filter by branch

**File:** `server/actions/services.ts`

Update the `getServices` function to accept branch filter and return branch_id:

```typescript
export interface GetServicesOptions {
    branchId?: string | null
}

export async function getServices(options?: GetServicesOptions): Promise<ActionResponse<GetServicesResult>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canManageServices(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        // Build where conditions
        const conditions = [eq(services.isActive, true)]
        
        if (options?.branchId) {
            // Filter by branch OR shared services
            conditions.push(
                or(
                    eq(services.branchId, options.branchId),
                    eq(services.isShared, true)
                )
            )
        }

        const servicesList = await db
            .select()
            .from(services)
            .where(and(...conditions))
            .orderBy(desc(services.createdAt))

        // ... rest of the function remains the same
        // Make sure to include branch_id in the return:
        return {
            id: service.id,
            created_at: service.createdAt.toISOString(),
            title: service.title,
            price: Number(service.price),
            pricing_type: service.pricingType as 'FIXED' | 'HOURLY',
            hourly_rate: Number(service.hourlyRate),
            is_active: service.isActive,
            is_shared: service.isShared ?? true,
            branch_id: service.branchId,  // Add this
            items: items.map(item => ({ ... })),
        }
    }
    // ... error handling
}
```

### Step 2: Update services page to pass branch

**File:** `app/config/configPage.tsx`

Find where services are fetched and add branchId parameter:

```typescript
// In the fetchServices function or useEffect
const { currentBranch } = useBranchContext()

// Update fetch call
const fetchServices = useCallback(async () => {
    const result = await getServices({ branchId: currentBranch?.id })
    if (result.success) {
        setServices(result.data.services)
    }
    // ... error handling
}, [currentBranch?.id])
```

### Step 3: Run lint

Run: `bun run lint`
Expected: No errors

### Step 4: Commit

```bash
git add server/actions/services.ts app/config/configPage.tsx
git commit -m "feat: add branch filtering to services"
```

---

## Task 4: Add Branch Integration to Inventory Server-Side

**Files:**
- Modify: `server/actions/inventory.ts`
- Modify: `app/inventory/inventoryPage.tsx`

### Step 1: Update getInventory to filter by branch

**File:** `server/actions/inventory.ts`

Update the `getInventory` function:

```typescript
export interface GetInventoryOptions {
    branchId?: string | null
}

export async function getInventory(options?: GetInventoryOptions): Promise<InventoryItem[]> {
    const user = await getCurrentUser()
    if (!user) {
        return []
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return []
    }

    try {
        // Build where conditions
        const conditions = [eq(inventory.isActive, true)]
        
        if (options?.branchId) {
            // Filter by branch OR shared items
            conditions.push(
                or(
                    eq(inventory.branchId, options.branchId),
                    eq(inventory.isShared, true)
                )
            )
        }

        const items = await db
            .select()
            .from(inventory)
            .where(and(...conditions))
            .orderBy(desc(inventory.createdAt))

        return items.map(item => ({
            id: item.id,
            created_at: item.createdAt.toISOString(),
            updated_at: item.updatedAt.toISOString(),
            name: item.name,
            item_code: item.itemCode || undefined,
            description: item.description || undefined,
            external_link: item.externalLink || undefined,
            item_type: item.itemType as InventoryItem['item_type'],
            item_category: item.itemCategory as InventoryItem['item_category'],
            current_stock: Number(item.currentStock),
            stock_warning_threshold: item.stockWarningThreshold ? Number(item.stockWarningThreshold) : undefined,
            unit_price: item.unitPrice ? Number(item.unitPrice) : undefined,
            selling_price: item.sellingPrice ? Number(item.sellingPrice) : undefined,
            last_restocked: item.lastRestocked?.toISOString(),
            fluid_unit_size: item.fluidUnitSize ? Number(item.fluidUnitSize) : undefined,
            fluid_remaining: item.fluidRemaining ? Number(item.fluidRemaining) : undefined,
            fluid_unit_of_measure: item.fluidUnitOfMeasure || undefined,
            is_perishable: item.isPerishable,
            expiration_date: item.expirationDate || undefined,
            is_active: item.isActive,
            show_in_sales: item.showInSales,
            branch_id: item.branchId,
            is_shared: item.isShared,
        }))
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Failed to fetch inventory: ${error instanceof Error ? error.message : String(error)}`
        })
        return []
    }
}
```

### Step 2: Update inventory page to pass branch to server

**File:** `app/inventory/inventoryPage.tsx`

```typescript
// Update the fetchData function
const fetchData = useCallback(async () => {
    setLoading(true)
    try {
        const [active, inactive] = await Promise.all([
            getInventory({ branchId: currentBranch?.id }),
            getInactiveInventory({ branchId: currentBranch?.id }),
        ])
        setInventoryItems(active)
        setInactiveItems(inactive)
    } catch (error) {
        console.error("Error fetching inventory:", error)
        addNotification("Failed to load inventory", "ERROR")
    } finally {
        setLoading(false)
    }
}, [addNotification, currentBranch?.id])

// Remove client-side filtering since it's now server-side
useEffect(() => {
    fetchData()
}, [fetchData])
```

### Step 3: Run lint

Run: `bun run lint`
Expected: No errors

### Step 4: Commit

```bash
git add server/actions/inventory.ts app/inventory/inventoryPage.tsx
git commit -m "feat: add server-side branch filtering to inventory"
```

---

## Task 5: Add Branch Display to Appointment Details

**Files:**
- Modify: `app/appointments/appointmentDetailClient.tsx`
- Modify: `server/actions/appointments.ts`

### Step 1: Update getAppointment to include branch

**File:** `server/actions/appointments.ts`

Update the `getAppointment` function to return branch info:

```typescript
// In getAppointment function, update the select to include branch
const [result] = await db
    .select({
        appointment: appointments,
        branchName: branches.name,
    })
    .from(appointments)
    .leftJoin(branches, eq(appointments.branchId, branches.id))
    .where(eq(appointments.id, appointmentId))
    .limit(1)

// And update the transform function or return
return {
    ...transformAppointment(result.appointment),
    branch_id: result.appointment.branchId,
    branch_name: result.branchName || null,
}
```

### Step 2: Update Appointment type

**File:** `utils/types/general.ts`

```typescript
export interface Appointment {
    id: string
    created_at: Date
    title: string
    client_id?: string
    staff_id: string | null
    time_start: Date
    time_end: Date
    actual_time_start?: Date
    actual_time_end?: Date
    status: AppointmentStatus
    notes?: string
    type: AppointmentType | null
    is_active: boolean
    is_walkin: boolean
    client_name?: string
    client_phone?: string
    client_email?: string
    branch_id?: string | null      // Add this
    branch_name?: string | null    // Add this
}
```

### Step 3: Display branch in appointment details

**File:** `app/appointments/appointmentDetailClient.tsx`

Add branch display in the "People Card" section:

```typescript
// Add after the People Card section (around line 649)
{/* Branch Info */}
{appointment.branch_name && (
    <div className="bg-white/5 p-6 rounded-lg border border-white/10">
        <h3 className="text-lg font-semibold mb-4">Location</h3>
        <div className="flex items-center gap-2">
            <Building2Icon size={16} className="text-white/60" />
            <span className="font-medium">{appointment.branch_name}</span>
        </div>
    </div>
)}
```

Also add Building2Icon to imports.

### Step 4: Run lint

Run: `bun run lint`
Expected: No errors

### Step 5: Commit

```bash
git add server/actions/appointments.ts app/appointments/appointmentDetailClient.tsx utils/types/general.ts
git commit -m "feat: add branch display to appointment details"
```

---

## Task 6: Add Branch Integration to Accounting Transactions

**Files:**
- Modify: `app/accounting/page.tsx` or accounting components
- Check for accounting-related server actions

### Step 1: Verify accounting page uses branch context

**File:** Check `app/accounting/page.tsx`

Ensure the accounting page has:
1. Branch selector in the UI
2. Passes branch to server actions when fetching data
3. Creates transactions with branch_id

### Step 2: Verify accounting server actions accept branch

Check `server/actions/accounting.ts` for functions that should filter by branch.

### Step 3: Test and commit

```bash
git add app/accounting/*.tsx server/actions/accounting.ts
git commit -m "feat: add branch integration to accounting"
```

---

## Task 7: Add Branch Integration to Sales

**Files:**
- Modify: Sales page and context
- Modify: `server/actions/sales.ts` or equivalent

### Step 1: Ensure sales uses branch context

Verify the sales page has:
1. Branch selector in UI
2. Passes branch to server actions
3. Creates sales records with branch_id

### Step 2: Test and commit

```bash
git add app/sales/*.tsx components/sales/*.tsx server/actions/sales.ts
git commit -m "feat: add branch integration to sales"
```

---

## Task 8: Add Branch Integration to Payroll

**Files:**
- Modify: `app/payroll/payrollPage.tsx`
- Modify: `server/actions/payroll.ts`

### Step 1: Verify payroll uses branch

Check that `getStaffClockStatus` and other payroll functions properly filter by branch.

### Step 2: Test and commit

```bash
git add app/payroll/*.tsx server/actions/payroll.ts
git commit -m "feat: add branch integration to payroll"
```

---

## Task 9: Update Calendar to Properly Filter Appointments by Branch

**Files:**
- Modify: `app/calendar/calendarPage.tsx`
- Modify: `server/actions/appointments.ts`

### Step 1: Ensure getUserAppointments accepts branch filter

**File:** `server/actions/appointments.ts`

Update `getUserAppointments` to accept and use branch_id:

```typescript
export async function getUserAppointments(
    userId: string,
    branchId?: string | null
): Promise<ActionResponse<Appointment[]>> {
    // ... existing auth code ...

    const conditions = [
        eq(appointments.isActive, true),
        // ... other conditions ...
    ]

    if (branchId) {
        conditions.push(
            or(
                eq(appointments.branchId, branchId),
                isNull(appointments.branchId)
            )
        )
    }

    const results = await db
        .select({
            appointment: appointments,
            branchName: branches.name,
        })
        .from(appointments)
        .leftJoin(branches, eq(appointments.branchId, branches.id))
        .where(and(...conditions))
        // ... rest of query ...

    // Transform and include branch info
    return results.map(r => ({
        ...transformAppointment(r.appointment),
        branch_id: r.appointment.branchId,
        branch_name: r.branchName || null,
    }))
}
```

### Step 2: Update calendar to pass branch

**File:** `app/calendar/calendarPage.tsx`

The code already has the branch filter on line 77-79. Verify it's passing branch to the server action.

### Step 3: Commit

```bash
git add server/actions/appointments.ts app/calendar/calendarPage.tsx
git commit -m "feat: ensure proper branch filtering in calendar"
```

---

## Task 10: Add Branch Selector to Appointment Create/Edit

**Files:**
- Modify: `components/appointments/WalkinAppointmentModal.tsx` (done in Task 2)
- Create new: `components/appointments/AppointmentEditModal.tsx` if needed
- Modify: `app/appointments/appointmentDetailClient.tsx`

### Step 1: Add branch field to edit form

**File:** `app/appointments/appointmentDetailClient.tsx`

In the edit form section, add branch selection:

```typescript
// Add to editForm state
const [editForm, setEditForm] = useState({
    // ... existing fields ...
    branch_id: appointment.branch_id || '',
})

// Add to handleSaveEdit to include branch
const result = await updateAppointment(appointment.id, {
    // ... existing fields ...
    branch_id: editForm.branch_id || null,
})

// Add branch selector in the edit UI
{isEditing && (
    <div>
        <span className="text-sm text-white/60">Branch</span>
        <select
            value={editForm.branch_id}
            onChange={(e) => setEditForm({ ...editForm, branch_id: e.target.value })}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none mt-1"
        >
            <option value="">No Branch</option>
            {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
            ))}
        </select>
    </div>
)}
```

### Step 2: Update updateAppointment server action

**File:** `server/actions/appointments.ts`

Ensure `updateAppointment` accepts and saves `branch_id`:

```typescript
const UpdateAppointmentSchema = z.object({
    // ... existing fields ...
    branch_id: z.string().nullable().optional(),
})

// In the update function
await db
    .update(appointments)
    .set({
        // ... existing fields ...
        branchId: data.branch_id,
        updatedAt: new Date(),
    })
    .where(eq(appointments.id, id))
```

### Step 3: Commit

```bash
git add app/appointments/appointmentDetailClient.tsx server/actions/appointments.ts
git commit -m "feat: add branch field to appointment edit form"
```

---

## Task 11: Update All Appointment Services to Filter by Branch

**Files:**
- Modify: `components/appointments/WalkinAppointmentModal.tsx`
- Modify: `app/appointments/appointmentDetailClient.tsx`

### Step 1: Filter services by branch when fetching

**File:** `components/appointments/WalkinAppointmentModal.tsx`

```typescript
// Update the useEffect that fetches services
useEffect(() => {
    const fetchData = async () => {
        const [staffData, servicesResult] = await Promise.all([
            getStaffProfiles(),
            getServices({ branchId: currentBranch?.id }),  // Pass branch filter
        ])
        setStaff(staffData)
        if (servicesResult.success) {
            setServices(servicesResult.data.services.filter((s: { is_active: boolean }) => s.is_active))
        }
    }
    fetchData()
}, [currentBranch?.id])  // Add dependency
```

**File:** `app/appointments/appointmentDetailClient.tsx`

```typescript
// Update loadServicesAndInventory in useEffect
const loadServicesAndInventory = async () => {
    const [servicesResult, inventoryItems] = await Promise.all([
        getServices({ branchId: currentBranch?.id }),  // Pass branch
        getInventory({ branchId: currentBranch?.id }),  // Pass branch
    ])
    if (servicesResult.success) {
        setAvailableServices(servicesResult.data.services)
    }
    setAvailableInventory(inventoryItems)
}
```

### Step 2: Commit

```bash
git add components/appointments/WalkinAppointmentModal.tsx app/appointments/appointmentDetailClient.tsx
git commit -m "feat: filter services and inventory by branch in appointment modals"
```

---

## Task 12: Final Verification and Testing

### Step 1: Run lint

Run: `bun run lint`
Expected: No errors

### Step 2: Run build

Run: `bun run build`
Expected: Build succeeds

### Step 3: Manual Testing Checklist

Test each of these scenarios:

1. **Create Walk-in Appointment**
   - Select a branch
   - Verify appointment is created with branch_id
   
2. **Edit Appointment**
   - Change branch on an existing appointment
   - Verify branch is updated

3. **View Appointment Details**
   - Verify branch name is displayed
   - Verify services show correct names (not "Unknown")

4. **Services Page**
   - Verify only services for selected branch appear
   - Create a service and assign to a branch

5. **Inventory Page**
   - Verify only inventory for selected branch appears
   - Verify "All Branches" shows everything

6. **Calendar**
   - Switch branches
   - Verify appointments filter correctly

7. **Time Clock**
   - Verify staff clock status shows correct branch info
   - Verify calendar filters by branch

8. **Accounting/Metrics**
   - Verify filtering works by branch

### Step 4: Final commit

```bash
git add .
git commit -m "feat: comprehensive branch system integration across all modules"
```

---

## Summary of Changes

| Task | Files Modified | Change |
|------|----------------|--------|
| 1 | `server/actions/appointments.ts`, `utils/types/general.ts` | Fix AppointmentItem data structure |
| 2 | `components/appointments/WalkinAppointmentModal.tsx`, `server/actions/appointments.ts` | Add branch to walk-in creation |
| 3 | `server/actions/services.ts`, `app/config/configPage.tsx` | Add branch filtering to services |
| 4 | `server/actions/inventory.ts`, `app/inventory/inventoryPage.tsx` | Add server-side branch filtering |
| 5 | `server/actions/appointments.ts`, `app/appointments/appointmentDetailClient.tsx`, `utils/types/general.ts` | Display branch in appointment details |
| 6 | `app/accounting/*.tsx`, `server/actions/accounting.ts` | Add branch to accounting |
| 7 | `app/sales/*.tsx`, `server/actions/sales.ts` | Add branch to sales |
| 8 | `app/payroll/*.tsx`, `server/actions/payroll.ts` | Ensure branch filtering in payroll |
| 9 | `server/actions/appointments.ts`, `app/calendar/calendarPage.tsx` | Calendar branch filtering |
| 10 | `app/appointments/appointmentDetailClient.tsx` | Branch field in edit form |
| 11 | `components/appointments/WalkinAppointmentModal.tsx`, `app/appointments/appointmentDetailClient.tsx` | Filter services/items by branch |
| 12 | All modified files | Final verification and testing |

---

**Plan complete and saved to `docs/plans/2026-03-24-comprehensive-branch-integration.md`.**

This plan addresses all the branch integration issues found in the codebase. Each task is designed to be independently implementable and testable.

**Execution Options:**

1. **Subagent-Driven (this session)** - Tasks can be implemented in order with verification between tasks

2. **Parallel Session (separate)** - Open new session with executing-plans for batch execution

Which approach would you like to use?