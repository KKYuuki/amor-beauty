# Phase 1: Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three bugs: inconsistent page padding, redundant Accounts view/edit buttons, and "Unknown Service/Item" display in appointments.

**Architecture:** Three independent fixes - styling audit with wrapper component, Accounts page button consolidation, and data fetching fix for appointment services/items with proper joins.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Drizzle ORM

---

## Task 1: Fix Inconsistent Page Padding

**Files:**
- Create: `components/page-wrapper.tsx`
- Modify: All page files that need padding consistency (appointments, inventory, calendar, etc.)

**Step 1: Create PageWrapper component**

Create `components/page-wrapper.tsx`:

```tsx
"use client"

import { ReactNode } from "react"

interface PageWrapperProps {
    children: ReactNode
    className?: string
}

export default function PageWrapper({ children, className = "" }: PageWrapperProps) {
    return (
        <div className={`w-full h-full flex flex-col gap-4 p-6 ${className}`}>
            {children}
        </div>
    )
}
```

**Step 2: Audit all pages for padding**

Run: `grep -r "p-4\|p-6" --include="*.tsx" app/`
Expected: List of files with inline padding

**Step 3: Update appointments page**

Modify `app/appointments/appointmentsPage.tsx`:
- Replace `<div className="w-full h-full flex flex-col gap-4 p-4">` with `<PageWrapper>`
- Add import for PageWrapper

**Step 4: Update inventory page**

Modify `app/inventory/inventoryPage.tsx`:
- Wrap content with PageWrapper
- Remove inline padding

**Step 5: Update calendar page**

Modify `app/calendar/calendarPage.tsx`:
- Wrap content with PageWrapper
- Remove inline padding

**Step 6: Update transactions page**

Modify `app/transactions/transactionsPage.tsx`:
- Wrap content with PageWrapper
- Remove inline padding

**Step 7: Update sales page**

Modify `app/sales/salesPage.tsx`:
- Wrap content with PageWrapper
- Remove inline padding

**Step 8: Update payroll page**

Modify `app/payroll/payrollPage.tsx`:
- Wrap content with PageWrapper
- Remove inline padding

**Step 9: Update my-payroll page**

Modify `app/my-payroll/myPayrollPage.tsx`:
- Wrap content with PageWrapper
- Remove inline padding

**Step 10: Update metrics page**

Modify `app/metrics/metricsPage.tsx`:
- Wrap content with PageWrapper
- Remove inline padding

**Step 11: Update config page**

Modify `app/config/configPage.tsx`:
- Wrap content with PageWrapper
- Remove inline padding

**Step 12: Update accounting pages**

Modify `app/accounting/accountingPage.tsx` and `app/accounting/categories/categoriesPage.tsx`:
- Wrap content with PageWrapper
- Remove inline padding

**Step 13: Update notify page**

Modify `app/notify/notifyPage.tsx`:
- Wrap content with PageWrapper
- Remove inline padding

**Step 14: Update profile page**

Modify `app/profile/page.tsx`:
- Wrap content with PageWrapper
- Remove inline padding

**Step 15: Update admin pages**

Modify `app/(app)/admin/branches/page.tsx` and `app/(app)/admin/invitations/page.tsx`:
- Wrap content with PageWrapper
- Remove inline padding

**Step 16: Run lint to verify**

Run: `bun run lint`
Expected: No errors

**Step 17: Commit styling fixes**

```bash
git add components/page-wrapper.tsx app/**/*.tsx
git commit -m "fix(ui): standardize page padding with PageWrapper component"
```

---

## Task 2: Fix Accounts Page View/Edit Buttons

**Files:**
- Modify: `app/accounts/usersList.tsx`

**Step 1: Read the current usersList implementation**

Read `app/accounts/usersList.tsx` to understand current button structure.

**Step 2: Identify redundant buttons**

Look for "View" and "Edit" buttons in the user list. They likely both route to `/accounts/[id]`.

**Step 3: Consolidate to single button**

Modify the users list to show only one action button that routes to the account detail page. Change text to "Manage" or "Edit" only.

**Step 4: Update button styling**

Ensure consistent button styling with other action buttons in the application.

**Step 5: Test navigation**

Run: `bun run dev`
Verify clicking the button navigates to the correct account detail page.

**Step 6: Commit accounts page fix**

```bash
git add app/accounts/usersList.tsx
git commit -m "fix(accounts): consolidate redundant view/edit buttons to single action"
```

---

## Task 3: Fix "Unknown Service" and "Unknown Item" in Appointments

**Files:**
- Modify: `server/actions/appointments.ts`
- Modify: `app/appointments/appointmentDetailClient.tsx`

**Step 1: Analyze the issue**

The `getAppointmentServices` function returns only the `appointmentServices` join table records without including the actual service details. Similarly, `getAppointmentItems` needs verification.

**Step 2: Update getAppointmentServices to include service details**

Modify `server/actions/appointments.ts`:

Find the `getAppointmentServices` function (around line 1149) and update it:

```typescript
export async function getAppointmentServices(appointmentId: string) {
    try {
        const results = await db
            .select({
                appointmentId: appointmentServices.appointmentId,
                serviceId: appointmentServices.serviceId,
                createdAt: appointmentServices.createdAt,
                service: {
                    id: services.id,
                    title: services.title,
                    price: services.price,
                    pricingType: services.pricingType,
                    hourlyRate: services.hourlyRate,
                    isActive: services.isActive,
                }
            })
            .from(appointmentServices)
            .innerJoin(services, eq(appointmentServices.serviceId, services.id))
            .where(eq(appointmentServices.appointmentId, appointmentId))
            .orderBy(desc(appointmentServices.createdAt))

        return results.map(r => ({
            appointment_id: r.appointmentId,
            service_id: r.serviceId,
            created_at: r.createdAt,
            service: {
                id: r.service.id,
                title: r.service.title,
                price: Number(r.service.price),
                pricing_type: r.service.pricingType as 'FIXED' | 'HOURLY',
                hourly_rate: Number(r.service.hourlyRate),
                is_active: r.service.isActive,
            }
        }))
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error fetching appointment services: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return []
    }
}
```

**Step 3: Ensure services import is present**

Verify that `services` is imported from `@/server/db/schema` at the top of the file.

**Step 4: Update getAppointmentItems to include inventory details**

The `getAppointmentItems` function (around line 1260) already joins with inventory. Verify it returns the inventory name properly.

Read the current implementation and ensure it includes:
- `inventory_id`
- `name` from inventory
- `quantity`
- `price` from inventory

**Step 5: Update appointmentDetailClient to handle service data**

Modify `app/appointments/appointmentDetailClient.tsx`:

Update the services display section (around line 722-740) to properly use the service data:

```tsx
{services.map((service, idx) => (
    <div key={idx} className="flex justify-between items-center bg-black/40 p-3 rounded-md">
        <span>{service.service?.title ?? "Unknown Service"}</span>
        <div className="flex items-center gap-3">
            <span className="text-white/60">
                {service.service?.pricing_type === 'HOURLY' 
                    ? `₱${service.service?.hourly_rate}/hr`
                    : `₱${service.service?.price}`}
            </span>
            {isEditing && (
                <button
                    onClick={() => handleRemoveService(service.service_id)}
                    disabled={loadingServices}
                    className="text-red-400 hover:text-red-300 p-1 rounded-md hover:bg-red-400/10 transition-colors disabled:opacity-50"
                    title="Remove service"
                >
                    <TrashIcon size={16} />
                </button>
            )}
        </div>
    </div>
))}
```

**Step 6: Update items display to handle inventory data**

Verify the items display (around line 777-807) properly uses `item.name` or `item.inventory?.name`:

```tsx
{items.map((item, idx) => (
    <div key={idx} className="flex justify-between items-center bg-black/40 p-3 rounded-md">
        <span>{item.name ?? item.inventory?.name ?? "Unknown Item"}</span>
        <div className="flex items-center gap-3">
            {isEditing ? (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">Qty:</span>
                    <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleUpdateItem(item.id, parseInt(e.target.value) || 1)}
                        className="w-16 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-center text-white outline-none focus:border-white/40"
                    />
                </div>
            ) : (
                <span className="text-white/60">x{item.quantity}</span>
            )}
            {isEditing && (
                <button
                    onClick={() => handleDeleteItem(item.id)}
                    disabled={loadingItems}
                    className="text-red-400 hover:text-red-300 p-1 rounded-md hover:bg-red-400/10 transition-colors disabled:opacity-50"
                    title="Remove item"
                >
                    <TrashIcon size={16} />
                </button>
            )}
        </div>
    </div>
))}
```

**Step 7: Update type definitions if needed**

Verify that the `AppointmentService` interface in `utils/types/general.ts` includes the full service object:

```typescript
export interface AppointmentService {
    appointment_id: string
    service_id: string
    service?: Service
    created_at?: string
}
```

**Step 8: Update AppointmentItem interface if needed**

Verify that `AppointmentItem` interface includes the inventory details:

```typescript
export interface AppointmentItem {
    id: string
    appointment_id: string
    inventory_id?: string
    name: string  // Added for convenience
    quantity: number
    fluid_quantity?: number
    price?: number
    inventory?: {
        name: string
        unit_price: number
    }
}
```

**Step 9: Test the appointment detail page**

Run: `bun run dev`
Navigate to an appointment with services and items.
Verify services show correct titles instead of "Unknown Service".
Verify items show correct names instead of "Unknown Item".

**Step 10: Commit the fix**

```bash
git add server/actions/appointments.ts app/appointments/appointmentDetailClient.tsx utils/types/general.ts
git commit -m "fix(appointments): display service and item names correctly in appointment details"
```

---

## Verification

After all tasks are complete:

1. Run `bun run lint` - should pass with no errors
2. Run `bun run build` - should build successfully
3. Test each page visually for consistent padding
4. Test Accounts page - should have single action button per user row
5. Test appointment detail page - services and items should show correct names

## Notes

- The styling changes use `p-6` (24px) as the standard padding for all pages
- PageWrapper is a simple component that can be extended with variants if needed
- The services/items fix involves updating the server action to join with the services table
- All changes maintain backward compatibility with existing functionality