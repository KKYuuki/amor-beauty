# Bug Fixes and Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical bugs, improve user experience, and ensure system consistency across the Inksight RDMD application.

**Architecture:** Fix user creation role validation, update notification styling, complete appointment flow for walk-ins, improve appointment editing, add invitation viewing to accounts, enhance service linking UI, and ensure accounting integration for payroll.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Tailwind CSS, Framer Motion

---

## Summary of Issues

1. **Notification Styling** - Uses light backgrounds instead of dark theme
2. **Walk-in Appointment Completion** - Redirects to sales but doesn't mark complete
3. **Appointment Editing** - Can't edit service type details or add/remove services/items
4. **User Creation Role Validation** - Schema mismatches type (ADMIN vs admin, missing roles)
5. **Invite Viewing** - Exists in /admin/invitations but needs link in /accounts
6. **Service Item Linking UI** - Hard dropdown needs search functionality
7. **Staff in Transaction Tracking** - Verify staff_id properly tracked
8. **Payroll-Accounting Integration** - Ensure accounting entries created on payroll completion

---

## Task 1: Fix Notification Styling to Match Dark Theme

**Files:**
- Modify: `components/notifications.tsx`

**Problem:** Notifications use light backgrounds (`bg-white`, `bg-slate-50`) that don't match the project's dark theme.

**Step 1: Update notificationStyles object**

Replace the entire `notificationStyles` object (lines 9-42) with dark theme colors:

```typescript
const notificationStyles = {
    INFO: {
        icon: InfoIcon,
        borderColor: "border-blue-500/40",
        iconColor: "text-blue-400",
        iconBg: "bg-blue-500/20",
        bgAccent: "bg-blue-500/10",
        progressColor: "bg-blue-400",
    },
    SUCCESS: {
        icon: CheckIcon,
        borderColor: "border-green-500/40",
        iconColor: "text-green-400",
        iconBg: "bg-green-500/20",
        bgAccent: "bg-green-500/10",
        progressColor: "bg-green-400",
    },
    WARNING: {
        icon: TriangleAlertIcon,
        borderColor: "border-orange-500/40",
        iconColor: "text-orange-400",
        iconBg: "bg-orange-500/20",
        bgAccent: "bg-orange-500/10",
        progressColor: "bg-orange-400",
    },
    ERROR: {
        icon: XIcon,
        borderColor: "border-red-500/40",
        iconColor: "text-red-400",
        iconBg: "bg-red-500/20",
        bgAccent: "bg-red-500/10",
        progressColor: "bg-red-400",
    },
} as const
```

**Step 2: Update toast container background**

Find the portal container (around line 189-207) and update:

```typescript
// Find the className on the motion.div container:
className={`w-full cursor-pointer overflow-hidden rounded-xl border bg-white shadow-lg select-none ${style.borderColor}`}

// Replace with:
className={`w-full cursor-pointer overflow-hidden rounded-xl border-2 bg-zinc-900 shadow-lg select-none ${style.borderColor}`}
```

**Step 3: Update inner content div styling**

```typescript
// Find the inner div with bgAccent:
<div className={`flex items-start gap-3 p-4 ${style.bgAccent}`}>

// Replace with dark theme styling:
<div className="flex items-start gap-3 p-4 bg-black/20">
```

**Step 4: Update text colors**

```typescript
// Find title and message paragraphs:
<p className="mb-0.5 text-sm font-semibold text-slate-900 select-none">
<p className="text-sm leading-relaxed text-slate-600 select-none">

// Replace with:
<p className="mb-0.5 text-sm font-semibold text-white select-none">
<p className="text-sm leading-relaxed text-white/80 select-none">
```

**Step 5: Update "Clear all" button styling**

```typescript
// Find the clear all button:
className="self-end rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-md ring-1 ring-black/5 select-none hover:bg-slate-50 hover:text-slate-700"

// Replace with:
className="self-end rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70 shadow-md ring-1 ring-white/10 select-none hover:bg-white/20 hover:text-white"
```

**Step 6: Test**

Run: `bun run dev`
Trigger various notification types
Expected: Dark themed notifications that match project styling

**Step 7: Commit**

```bash
git add components/notifications.tsx
git commit -m "fix: update notification styling to dark theme"
```

---

## Task 2: Fix User Creation Role Validation

**Files:**
- Modify: `server/actions/profile.ts:26-33, 35-46`
- Modify: `components/accounts/CreateUserModal.tsx:128-135`
- Possibly: `utils/types/auth.ts:1`

**Problem:** Schema uses uppercase roles with only 4 options (`['ADMIN', 'MANAGER', 'STAFF', 'ARTIST']`) but `UserRoleType` has 6 roles in lowercase (`"admin" | "manager" | "staff" | "artist" | "piercer" | "shoe_tech"`). This causes "invalid option" error.

**Step 1: Update CreateUserProfileSchema**

In `server/actions/profile.ts`, update lines 26-33:

```typescript
const CreateUserProfileSchema = z.object({
    full_name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address'),
    role: z.enum(['admin', 'manager', 'staff', 'artist', 'piercer', 'shoe_tech']),
    phone_number: z.string().optional(),
    instagram_handle: z.string().optional(),
    access_flags: z.array(z.string()).optional(),
})
```

**Step 2: Update UpdateUserProfileSchema**

Update lines 35-46:

```typescript
const UpdateUserProfileSchema = z.object({
    full_name: z.string().min(1).optional().nullable(),
    email: z.string().email('Invalid email address').optional().nullable(),
    role: z.enum(['admin', 'manager', 'staff', 'artist', 'piercer', 'shoe_tech']).optional().nullable(),
    phone_number: z.string().optional().nullable(),
    instagram_handle: z.string().optional().nullable(),
    avatar_url: z.string().url().optional().nullable().or(z.literal('')),
    access_flags: z.array(z.string()).optional().nullable(),
    is_active: z.boolean().optional().nullable(),
    artist_level: z.enum(['APPRENTICE', 'JUNIOR', 'SENIOR', 'MASTER']).optional().nullable(),
    payout_period: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional().nullable(),
}).partial()
```

**Step 3: Update CreateUserModal role options**

In `components/accounts/CreateUserModal.tsx`, lines 128-135:

```tsx
<select
    value={role}
    onChange={(e) => setRole(e.target.value as UserRoleType)}
    className='bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1 text-white font-normal cursor-pointer transition-colors hover:bg-white/10'
>
    <option value='admin'>Admin</option>
    <option value='manager'>Manager</option>
    <option value='staff'>Staff</option>
    <option value='artist'>Artist</option>
    <option value='piercer'>Piercer</option>
    <option value='shoe_tech'>Shoe Tech</option>
</select>
```

**Step 4: Fix role case handling in createUser**

In `server/actions/profile.ts`, around line 704:

```typescript
// FIND:
role: role.toLowerCase(),

// This is already correct, but ensure invite creation also uses lowercase
// The token generation around line 697 is already correct
```

**Step 5: Update mapUserToProfile if needed**

Around line 65:

```typescript
// Ensure role is mapped correctly:
role: (dbUser.role?.toLowerCase() || 'staff') as UserRoleType,
```

**Step 6: Test**

Run: `bun run dev`
Navigate to: Accounts > Create User
Try creating users with each role type
Expected: All 6 roles (admin, manager, staff, artist, piercer, shoe_tech) work correctly

**Step 7: Commit**

```bash
git add server/actions/profile.ts components/accounts/CreateUserModal.tsx
git commit -m "fix: align user role validation schema with UserRoleType"
```

---

## Task 3: Fix Walk-in Appointment Completion After Sales

**Files:**
- Modify: `components/sales/context/SalesContext.tsx`
- Modify: `server/actions/appointments.ts`

**Problem:** Walk-in appointments redirect to sales page but don't get marked as completed after the sale is processed.

**Step 1: Update handleCheckout to mark appointment complete**

In `components/sales/context/SalesContext.tsx`, find `handleCheckout` function (around line 659-789) and update:

```typescript
// Find around line 760-780, after result.success:
if (result.success) {
    addNotification(
        isPartialPayment
            ? "Deposit recorded successfully!"
            : "Transaction completed!",
        "SUCCESS",
    )
    
    // ADD: Mark appointment as completed if it was a walk-in
    if (selectedAppointmentId) {
        try {
            const appointmentResult = await updateAppointment(selectedAppointmentId, {
                status: 'COMPLETED',
                actual_time_end: new Date(),
            })
            if (!appointmentResult.success) {
                console.error('Failed to mark appointment as completed:', appointmentResult.error)
            }
        } catch (error) {
            console.error('Error marking appointment as completed:', error)
        }
    }
    
    setCart([])
    setSelectedAppointmentId(null)
    // ... rest of cleanup
}
```

**Step 2: Import updateAppointment if not present**

At the top of `components/sales/context/SalesContext.tsx`:

```typescript
// Add to imports:
import { updateAppointment } from '@/server/actions/appointments'
```

**Step 3: Verify UpdateAppointmentSchema accepts status and actual_time_end**

In `server/actions/appointments.ts`, verify line 61-71:

```typescript
const UpdateAppointmentSchema = z.object({
    title: z.string().min(1).optional(),
    staff_id: z.string().nullable().optional(),
    time_start: z.date().optional(),
    time_end: z.date().optional(),
    actual_time_start: z.date().optional().nullable(),
    actual_time_end: z.date().optional().nullable(),
    status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
    notes: z.string().optional().nullable(),
    is_active: z.boolean().optional(),
}).partial()
```

**Step 4: Test**

Run: `bun run dev`
1. Create a walk-in appointment
2. Go to sales page with appointment
3. Add items and complete transaction
4. Check appointment status in database
Expected: Walk-in appointment marked as COMPLETED after sale

**Step 5: Commit**

```bash
git add components/sales/context/SalesContext.tsx server/actions/appointments.ts
git commit -m "fix: mark walk-in appointments as completed after sales transaction"
```

---

## Task 4: Add Invitation Viewing to Accounts Page

**Files:**
- Modify: `app/accounts/accountsPage.tsx`
- Create: `app/accounts/invitationsClient.tsx`
- Check: `app/(app)/admin/invitations/invitationsClient.tsx` (for reference)

**Problem:** Invitations can only be viewed in /admin/invitations, but users need easier access from /accounts.

**Step 1: Create invitations tab component**

Create `app/accounts/invitationsClient.tsx`:

```typescript
"use client"

import { useState, useEffect, useContext } from "react"
import { KeyIcon, RefreshCwIcon, CopyIcon, MailIcon } from "lucide-react"
import { SideBarContext } from "@/components/sidebar"
import { NotificationContext } from "@/components/notifications"
import { listInvitations } from "@/server/actions/profile"
import { UserRoleType } from "@/utils/types/auth"

interface Invitation {
    id: string
    email: string
    token: string
    role: UserRoleType
    created_at: string
    expires_at: string | null
    created_by: string
    creator_name?: string
}

const ROLE_COLORS: Record<UserRoleType, string> = {
    admin: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    manager: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    staff: "bg-green-500/20 text-green-400 border-green-500/30",
    artist: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    piercer: "bg-pink-500/20 text-pink-400 border-pink-500/30",
    shoe_tech: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
}

export default function InvitationsClient() {
    const { addNotification } = useContext(NotificationContext)
    const [invitations, setInvitations] = useState<Invitation[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchInvitations()
    }, [])

    const fetchInvitations = async () => {
        setLoading(true)
        try {
            const result = await listInvitations()
            if (result.success) {
                setInvitations(result.data as Invitation[])
            }
        } catch (error) {
            console.error("Error fetching invitations:", error)
        } finally {
            setLoading(false)
        }
    }

    const copyToken = (token: string) => {
        navigator.clipboard.writeText(token)
        addNotification("Invitation code copied!", "SUCCESS", "Copied")
    }

    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString()

    const isExpired = (expiresAt: string | null) => {
        if (!expiresAt) return false
        return new Date(expiresAt) < new Date()
    }

    if (loading) {
        return <div className="flex items-center justify-center py-8"><RefreshCwIcon className="w-6 h-6 animate-spin text-white/60" /></div>
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Pending Invitations</h2>
                <button onClick={fetchInvitations} disabled={loading} className="p-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors">
                    <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {invitations.length === 0 ? (
                <div className="text-center py-8 text-white/60">
                    <MailIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No pending invitations</p>
                </div>
            ) : (
                <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-white/5">
                            <tr className="text-left text-sm text-white/60">
                                <th className="px-4 py-2">Email</th>
                                <th className="px-4 py-2">Role</th>
                                <th className="px-4 py-2">Code</th>
                                <th className="px-4 py-2">Expires</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {invitations.map(inv => (
                                <tr key={inv.id} className="hover:bg-white/5">
                                    <td className="px-4 py-2">{inv.email}</td>
                                    <td className="px-4 py-2">
                                        <span className={`px-2 py-0.5 rounded text-xs border ${ROLE_COLORS[inv.role]}`}>
                                            {inv.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2">
                                        <div className="flex items-center gap-2">
                                            <code className="bg-white/10 px-2 py-0.5 rounded text-sm">{inv.token}</code>
                                            <button onClick={() => copyToken(inv.token)} className="p-1 hover:bg-white/10 rounded">
                                                <CopyIcon className="w-3 h-3 text-white/60" />
                                            </button>
                                        </div>
                                    </td>
                                    <td className={`px-4 py-2 text-sm ${isExpired(inv.expires_at) ? 'text-red-400' : 'text-white/60'}`}>
                                        {inv.expires_at ? formatDate(inv.expires_at) : 'Never'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
```

**Step 2: Update accountsPage to include invitations tab**

Modify `app/accounts/accountsPage.tsx`:

```typescript
"use client"
import { useRef, useState } from "react"
import UsersList from "./usersList"
import InvitationsClient from "./invitationsClient"
import { UsersIcon, KeyIcon } from "lucide-react"

export default function AccountsClientPage() {
    const containerRef = useRef<HTMLDivElement>(null)
    const headerRef = useRef<HTMLDivElement>(null)
    const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users')

    return (
        <div className='w-full h-full flex flex-col gap-4' ref={containerRef}>
            <div ref={headerRef} className='flex flex-row gap-8 items-center'>
                <div>
                    <h1 className='text-2xl font-bold flex items-center gap-2'>
                        <UsersIcon className='w-6 h-6' />
                        Accounts
                    </h1>
                    <p className='text-white/60 text-sm mt-1'>
                        Manage system users and invitations
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className='flex gap-2'>
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-4 py-2 rounded-md font-semibold transition-colors ${activeTab === 'users' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                    Users
                </button>
                <button
                    onClick={() => setActiveTab('invitations')}
                    className={`px-4 py-2 rounded-md font-semibold transition-colors flex items-center gap-2 ${activeTab === 'invitations' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                    <KeyIcon className='w-4 h-4' />
                    Invitations
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'users' ? (
                <UsersList headerRef={headerRef} />
            ) : (
                <InvitationsClient />
            )}
        </div>
    )
}
```

**Step 3: Test**

Run: `bun run dev`
Navigate to: `/accounts`
Click on "Invitations" tab
Expected: Shows pending invitations with copy functionality

**Step 4: Commit**

```bash
git add app/accounts/accountsPage.tsx app/accounts/invitationsClient.tsx
git commit -m "feat: add invitations tab to accounts page"
```

---

## Task 5: Improve Service Item Linking UI with Search

**Files:**
- Find: Service form/create component (search for service items dropdown)
- Modify: Service form to include search

**Problem:** Dropdown for linking items to services is slow and hard to use. Need search functionality.

**Step 1: Find the service form component**

Search for service items linking:
```bash
grep -rn "service.*item\|item.*link\|inventory_id" --include="*.tsx" app/services/ app/config/
```

Likely in: `app/config/` or `components/services/`

**Step 2: Add search input to dropdown**

Replace the current dropdown with a searchable select:

```typescript
// Example pattern for searchable select:
const [itemSearchQuery, setItemSearchQuery] = useState("")
const [showItemDropdown, setShowItemDropdown] = useState(false)

const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(itemSearchQuery.toLowerCase())
)

// In JSX:
<div className="relative">
    <input
        type="text"
        placeholder="Search items..."
        value={itemSearchQuery}
        onChange={(e) => setItemSearchQuery(e.target.value)}
        onFocus={() => setShowItemDropdown(true)}
        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2"
    />
    {showItemDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-white/10 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {filteredItems.map(item => (
                <button
                    key={item.id}
                    onClick={() => {
                        handleAddItem(item)
                        setItemSearchQuery("")
                        setShowItemDropdown(false)
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-white/10"
                >
                    {item.name} - ${item.unit_price}
                </button>
            ))}
        </div>
    )}
</div>
```

**Step 3: Add search for services in appointment editing**

Similarly add search for services in appointment editing component.

**Step 4: Test**

Run: `bun run dev`
Navigate to: Service configuration or appointment editing
Type in search box
Expected: Items/services filter as you type

**Step 5: Commit**

```bash
git add <affected files>
git commit -m "feat: add search functionality to service item linking"
```

---

## Task 6: Verify Staff Tracking in Transactions and Payroll-Accounting Integration

**Files:**
- Investigate: `components/sales/context/SalesContext.tsx`
- Investigate: `server/actions/transactions.ts`
- Investigate: `server/actions/payroll.ts`

**Problem:** Need to verify staff_id is tracked in transactions and accounting entries are created on payroll completion.

**Step 1: Verify staff_id in transactions**

Check `components/sales/context/SalesContext.tsx` around line 697-698:

```typescript
// Verify this exists:
let staff_id = selectedStaffId || userInfo.id

if (staff_id === "SHOP_SALE") {
    staff_id = null
}

const payload: CreateTransactionPayload = {
    staff_id: staff_id as string | null | undefined,
    // ...
}
```

**Step 2: Check transactions schema has staff_id**

Verify `server/db/schema/transactions.ts` or similar contains:
```typescript
staffId: text('staff_id').references(() => user.id)
```

**Step 3: Add accounting entry for payroll completion**

In `server/actions/payroll.ts`, find `completePayrollRequest` function and add:

```typescript
// After payroll is marked complete:
// Create accounting ledger entry
await createAutoLedgerEntry({
    type: 'EXPENSE',
    category: 'PAYROLL',
    amount: totalAmount,
    description: `Payroll payment - ${staffName}`,
    date: new Date(),
    // ... other fields
})
```

**Step 4: Verify createAutoLedgerEntry exists or create it**

If it doesn't exist in `server/actions/accounting.ts`, add it.

**Step 5: Test**

1. Create a transaction as a staff member
2. Check database for staff_id
3. Complete a payroll request
4. Check accounting ledger for entry

**Step 6: Commit**

```bash
git add <affected files>
git commit -m "fix: ensure staff tracking in transactions and accounting entries for payroll"
```

---

## Task 7: Fix Appointment Editing for Service Type Details

**Files:**
- Modify: `app/appointments/appointmentDetailClient.tsx`
- Modify: `server/actions/appointments.ts`

**Problem:** Can't edit service type specifics (tattoo details, piercing details, shoe details) or add/remove services/items during editing.

**Step 1: Add service/item editing to appointment detail edit mode**

In `app/appointments/appointmentDetailClient.tsx`, the edit form was added but missing service type details. Update the edit form to include type-specific fields:

```typescript
// Add after other edit form fields:

{/* Service Type Details - Only show if appointment type matches */}
{appointment.type === 'TATTOO' && (
    <TattooDetailsEdit
        appointmentId={appointment.id}
        initialData={appointment.tattoo_details}
        onUpdate={(data) => setEditForm({ ...editForm, tattoo_details: data })}
    />
)}

{appointment.type === 'PIERCING' && (
    <PiercingDetailsEdit
        appointmentId={appointment.id}
        initialData={appointment.piercing_details}
        onUpdate={(data) => setEditForm({ ...editForm, piercing_details: data })}
    />
)}

{appointment.type === 'SHOE' && (
    <ShoeDetailsEdit
        appointmentId={appointment.id}
        initialData={appointment.shoe_details}
        onUpdate={(data) => setEditForm({ ...editForm, shoe_details: data })}
    />
)}
```

**Step 2: Create TattooDetailsEdit component**

Create `components/appointments/TattooDetailsEdit.tsx`:

```typescript
"use client"

import { useState } from "react"

interface TattooDetailsEditProps {
    appointmentId: string
    initialData?: {
        size?: string
        placement?: string
        description?: string
        reference_image_id?: string
    }
    onUpdate: (data: any) => void
}

export default function TattooDetailsEdit({ appointmentId, initialData, onUpdate }: TattooDetailsEditProps) {
    const [size, setSize] = useState(initialData?.size || '')
    const [placement, setPlacement] = useState(initialData?.placement || '')
    const [description, setDescription] = useState(initialData?.description || '')

    return (
        <div className="flex flex-col gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
            <h4 className="text-sm font-semibold text-white/80">Tattoo Details</h4>
            
            <label className="flex flex-col gap-1">
                <span className="text-xs text-white/60">Size</span>
                <input
                    type="text"
                    value={size}
                    onChange={(e) => { setSize(e.target.value); onUpdate({ size: e.target.value, placement, description }) }}
                    placeholder="e.g., 6x4 inches"
                    className="bg-black/40 px-3 py-2 rounded-md border border-white/10 focus:border-white/40 outline-none"
                />
            </label>

            <label className="flex flex-col gap-1">
                <span className="text-xs text-white/60">Placement</span>
                <input
                    type="text"
                    value={placement}
                    onChange={(e) => { setPlacement(e.target.value); onUpdate({ size, placement: e.target.value, description }) }}
                    placeholder="e.g., Left forearm"
                    className="bg-black/40 px-3 py-2 rounded-md border border-white/10 focus:border-white/40 outline-none"
                />
            </label>

            <label className="flex flex-col gap-1">
                <span className="text-xs text-white/60">Description</span>
                <textarea
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); onUpdate({ size, placement, description: e.target.value }) }}
                    placeholder="Additional notes..."
                    rows={3}
                    className="bg-black/40 px-3 py-2 rounded-md border border-white/10 focus:border-white/40 outline-none resize-none"
                />
            </label>
        </div>
    )
}
```

**Step 3: Create similar components for Piercing and Shoe**

Follow the same pattern for `PiercingDetailsEdit.tsx` and `ShoeDetailsEdit.tsx` with their specific fields.

**Step 4: Add services/items management to edit mode**

```typescript
// Add to edit form:
<div className="flex flex-col gap-3">
    <h4 className="text-sm font-semibold text-white/80">Services</h4>
    {/* List current services with remove button */}
    {appointment.appointment_services?.map((as, idx) => (
        <div key={idx} className="flex items-center justify-between bg-white/5 p-2 rounded">
            <span>{as.service?.title}</span>
            <button onClick={() => handleRemoveService(as.service_id)} className="text-red-400 hover:text-red-300">
                Remove
            </button>
        </div>
    ))}
    <button onClick={() => setShowAddServiceModal(true)} className="bg-blue-500/20 px-3 py-2 rounded-md">
        Add Service
    </button>
</div>

<div className="flex flex-col gap-3 mt-4">
    <h4 className="text-sm font-semibold text-white/80">Items</h4>
    {/* List current items with remove button */}
    {appointment.appointment_items?.map((ai, idx) => (
        <div key={idx} className="flex items-center justify-between bg-white/5 p-2 rounded">
            <span>{ai.inventory?.name} x{ai.quantity}</span>
            <button onClick={() => handleRemoveItem(ai.inventory_id)} className="text-red-400 hover:text-red-300">
                Remove
            </button>
        </div>
    ))}
    <button onClick={() => setShowAddItemModal(true)} className="bg-blue-500/20 px-3 py-2 rounded-md">
        Add Item
    </button>
</div>
```

**Step 5: Test**

Run: `bun run dev`
Navigate to: Appointment details
Click Edit
Expected: Can edit tattoo/piercing/shoe details and add/remove services and items

**Step 6: Commit**

```bash
git add app/appointments/appointmentDetailClient.tsx components/appointments/TattooDetailsEdit.tsx components/appointments/PiercingDetailsEdit.tsx components/appointments/ShoeDetailsEdit.tsx
git commit -m "feat: add service type details editing and service/item management to appointments"
```

---

## Task 8: Fix LSP Errors from Previous Work

**Files:**
- Modify: `utils/metrics-export-utils.ts`
- Fix: Various type mismatches

**Problem:** Type errors in metrics-export-utils.ts due to changed StaffPerformanceMetric fields.

**Step 1: Fix StaffPerformanceMetric property names**

In `utils/metrics-export-utils.ts`, find lines using wrong property names and fix:

```typescript
// FIND these occurrences and REPLACE:
// artistName -> staff_name
// averageRating -> average_rating
// totalRatings -> total_ratings

// Line 114:
// Before: `${data.staffPerformance.artistName}`
// After: `${data.staffPerformance.staff_name}`

// And similar throughout the file
```

**Step 2: Fix Appointment type in salesPage**

The `sales.appointments.filter is not a function` was fixed earlier, but ensure the type is correct:

```typescript
// In app/sales/salesPage.tsx, line 41-44
const filteredAppointments = (sales.appointments as Appointment[]).filter((apt) =>
    apt.user_profiles?.full_name
        ?.toLowerCase()
        .includes(sales.searchQuery.toLowerCase()),
)
```

Or update the SalesContext to use the correct Appointment type instead of UnpaidAppointment.

**Step 3: Fix missing module tosModal**

Create `utils/terms-of-service.ts` if missing:

```typescript
export const TERMS_OF_SERVICE_CONTENT = `
// Terms of service content here
`
```

Or remove the import from `components/tosModal.tsx` if not needed.

**Step 4: Test**

Run: `bun run lint`
Expected: No LSP errors

**Step 5: Commit**

```bash
git add utils/metrics-export-utils.ts app/sales/salesPage.tsx utils/terms-of-service.ts
git commit -m "fix: resolve LSP type errors"
```

---

## Task 9: Additional Improvements Checklist

**Files:**
- Various files as needed

**Checklist of additional improvements to implement:

**Step 1: Appointment Status Consistency**
- Ensure all appointment status changes properly update timestamps
- Add `actual_time_start` when marking as "On-going"
- Add `actual_time_end` when marking as "Completed"

**Step 2: Transaction Staff Display**
- In transaction history, show staff name instead of just ID
- Add staff_id to transaction creation for better tracking

**Step 3: Notification Error Handling**
- Add try-catch blocks around notification creation
- Handle cases where notification system is unavailable

**Step 4: Form Validation Consistency**
- Ensure all forms use consistent validation patterns
- Add proper error messages for all validation failures

**Step 5: Loading States**
- Add loading indicators to all async operations
- Prevent double-submission on forms

**Step 6: Commit**

```bash
git add <affected files>
git commit -m "fix: additional improvements and consistency fixes"
```

---

## Verification Steps

After completing all tasks, run:

```bash
# Run linting
bun run lint

# Build the project
bun run build

# Test critical flows:
bun run dev
# - Create user with each role type
# - Send invitation and verify it appears in /accounts
# - Complete walk-in appointment via sales
# - Edit appointment with type-specific details
# - Create transaction and verify staff tracking
# - View notifications with dark theme
```

---

## Summary

This plan addresses:
1. ✅ **Notifications** - Dark theme styling to match project
2. ✅ **User Creation** - Fixed role validation schema mismatch
3. ✅ **Walk-in Appointments** - Auto-complete after sales
4. ✅ **Invitations** - Added tab to /accounts page
5. ✅ **Service Linking** - Search functionality (pattern provided)
6. ✅ **Staff Tracking** - Verify in transactions and payroll-accounting
7. ✅ **Appointment Editing** - Type-specific details and service/item management
8. ✅ **LSP Errors** - Fixed type mismatches
9. ✅ **Additional Improvements** - Various consistency fixes

**Estimated time:** 4-5 hours total
**Complexity:** Medium - Multiple interconnected fixes