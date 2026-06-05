# Bug Fixes and Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical bugs, implement missing features, and improve UI consistency across the Inksight RDMD application.

**Architecture:** Fix data flow issues in SalesContext, implement getStaffPerformance with ratings table, add comprehensive editing capabilities, and modernize UI components.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Tailwind CSS, Framer Motion

---

## Summary of Issues

1. **Critical Bug:** Sales page crash - `sales.appointments.filter is not a function`
2. **Stub Implementation:** `getStaffPerformance` returns empty array
3. **Validation Errors:** Inventory creation and profile update failing
4. **Duplicate Dropdowns:** Accounting categories showing duplicates
5. **Dead Code:** "Open Chat" button references non-existent chat
6. **Missing UI:** No way to view auth keys/invitations
7. **Missing UI:** No way to edit appointment details
8. **Missing UI:** No branch selection for appointments/inventory/accounting/payroll
9. **Styling:** Branches admin page styling outdated
10. **Notifications:** Two implementations need consolidation
11. **Auth Keys:** Change to 8-digit numeric codes
12. **User Creation:** "Invalid User Data" error

---

## Task 1: Fix Sales Page Crash - Appointments Filter Error

**Files:**
- Modify: `components/sales/context/SalesContext.tsx:329-358`

**Problem:** `getUnpaidAppointments` returns `ActionResponse<Appointment[]>` (object with success/error), but the context treats it as a raw array. When the API fails, it returns `{ success: false, error: "..." }` which has no `.filter()` method.

**Step 1: Fix the data extraction in SalesContext**

In `components/sales/context/SalesContext.tsx`, locate lines 309-372 (the `fetchData` function). Replace the Promise.all section:

```typescript
// FIND THIS CODE (around line 317-336):
const raceResult = await Promise.race([
    Promise.all([
        getInventory(),
        getServices(),
        getTransactions({ pageSize: 20 }),
        getTodaySummary(),
        getSetting("currency_tax"),
        getUnpaidAppointments(),
    ]),
    timeoutPromise,
])

const [invData, servResult, txnResult, statsResult, taxResult, appointmentsData] = raceResult as [
    InventoryItem[],
    ActionResponse<GetServicesResult>,
    ActionResponse<GetTransactionsResult>,
    ActionResponse<GetTodaySummaryResult>,
    ActionResponse<CurrencyTaxValue | null>,
    UnpaidAppointment[]
]

// ... existing code ...
setAppointments((appointmentsData || []) as UnpaidAppointment[])

// REPLACE WITH:
const raceResult = await Promise.race([
    Promise.all([
        getInventory(),
        getServices(),
        getTransactions({ pageSize: 20 }),
        getTodaySummary(),
        getSetting("currency_tax"),
        getUnpaidAppointments(),
    ]),
    timeoutPromise,
])

const [invData, servResult, txnResult, statsResult, taxResult, appointmentsResult] = raceResult as [
    InventoryItem[],
    ActionResponse<GetServicesResult>,
    ActionResponse<GetTransactionsResult>,
    ActionResponse<GetTodaySummaryResult>,
    ActionResponse<CurrencyTaxValue | null>,
    ActionResponse<UnpaidAppointment[]>
]

const staffData = await getStaffList()
setStaffList(staffData || [])

// Filter out non-sales items
const salesInv = (invData || []).filter(
    (item) => item.show_in_sales,
)
setInventory(salesInv || [])
if (servResult.success) {
    setServices(servResult.data.services || [])
}
if (txnResult.success) {
    setTransactions(txnResult.data.data || [])
}
if (statsResult.success) {
    setTodayStats(statsResult.data || { totalSales: 0, transactionCount: 0 })
}
if (taxResult.success && taxResult.data) {
    setTaxSettings(taxResult.data)
}
// FIX: Extract appointments from ActionResponse properly
if (appointmentsResult.success) {
    setAppointments(appointmentsResult.data as UnpaidAppointment[])
} else {
    setAppointments([])
}
```

**Step 2: Update the interface type**

Also update the `UnpaidAppointment` interface import location. The type should properly reflect that appointments comes from an ActionResponse. Add clarification comment:

```typescript
// At line 62-73, the UnpaidAppointment interface is correct.
// No changes needed there, but ensure setAppointments handles the array correctly.
```

**Step 3: Test the fix**

Run: `bun run dev`
Navigate to: Sales page (`/sales`)
Expected: No runtime error, appointments load or show empty state

**Step 4: Commit**

```bash
git add components/sales/context/SalesContext.tsx
git commit -m "fix: handle ActionResponse in unpaid appointments fetch"
```

---

## Task 2: Implement getStaffPerformance Function

**Files:**
- Modify: `server/actions/metrics.ts:361-367`
- Modify: `server/db/schema/ratings.ts` (verify schema)
- Test: Run metrics page to verify staff performance loads

**Problem:** Function logs error and returns empty array instead of querying ratings table.

**Step 1: Define the return type**

In `server/actions/metrics.ts`, find the `StaffPerformanceMetric` type (around line 340-350). If it doesn't exist, add it:

```typescript
export type StaffPerformanceMetric = {
    staff_id: string
    staff_name: string
    average_rating: number
    total_ratings: number
    rating_distribution: {
        1: number
        2: number
        3: number
        4: number
        5: number
    }
    appointments_completed: number
}
```

**Step 2: Implement the query**

Replace the stub at lines 361-367:

```typescript
export async function getStaffPerformance(): Promise<ActionResponse<StaffPerformanceMetric[]>> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return failure('Not authenticated')
        }

        const hasAccess = await canViewMetrics(user)
        if (!hasAccess) {
            return failure('Access denied')
        }

        // Get all staff with their ratings aggregated
        const staffRatings = await db
            .select({
                staff_id: ratings.staffId,
                staff_name: user.fullName,
                rating: ratings.rating,
            })
            .from(ratings)
            .innerJoin(user, eq(ratings.staffId, user.id))
            .where(eq(ratings.staffId, user.id))

        // Get staff who have appointments but no ratings yet
        const staffWithAppointments = await db
            .select({
                staff_id: appointments.staffId,
                staff_name: user.fullName,
            })
            .from(appointments)
            .innerJoin(user, eq(appointments.staffId, user.id))
            .where(eq(appointments.status, 'COMPLETED'))
            .groupBy(appointments.staffId, user.fullName)

        // Aggregate ratings per staff
        const performanceMap = new Map<string, StaffPerformanceMetric>()

        // Initialize with all staff who have completed appointments
        for (const staff of staffWithAppointments) {
            if (staff.staff_id) {
                performanceMap.set(staff.staff_id, {
                    staff_id: staff.staff_id,
                    staff_name: staff.staff_name || 'Unknown',
                    average_rating: 0,
                    total_ratings: 0,
                    rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                    appointments_completed: 0,
                })
            }
        }

        // Process ratings
        for (const rating of staffRatings) {
            const existing = performanceMap.get(rating.staff_id)
            if (existing) {
                existing.total_ratings++
                existing.rating_distribution[rating.rating as 1|2|3|4|5]++
                // Recalculate average
                existing.average_rating = 
                    (existing.average_rating * (existing.total_ratings - 1) + rating.rating) 
                    / existing.total_ratings
            }
        }

        // Count completed appointments per staff
        const completedCounts = await db
            .select({
                staff_id: appointments.staffId,
                count: sql<number>`count(*)`.as('count'),
            })
            .from(appointments)
            .where(eq(appointments.status, 'COMPLETED'))
            .groupBy(appointments.staffId)

        for (const count of completedCounts) {
            const existing = performanceMap.get(count.staff_id)
            if (existing) {
                existing.appointments_completed = Number(count.count)
            }
        }

        return success(Array.from(performanceMap.values()))
    } catch (error) {
        await logError({
            type: 'METRICS',
            message: `Failed to get staff performance: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to get staff performance')
    }
}
```

**Step 3: Add necessary imports at top of file**

```typescript
// Add to existing imports at top of server/actions/metrics.ts
import { ratings, appointments } from '@/server/db/schema'
import { sql } from 'drizzle-orm'
```

**Step 4: Test**

Run: `bun run dev`
Navigate to: Business Insights metrics page
Expected: Staff performance metrics displayed (may show empty if no ratings yet)

**Step 5: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "feat: implement getStaffPerformance with ratings table query"
```

---

## Task 3: Fix Inventory Creation Validation Error

**Files:**
- Modify: `server/actions/inventory.ts:26-44` (schema)
- Modify: `app/(app)/inventory/components/InventoryForm.tsx` (validation handling)

**Problem:** "Validation Failed" error on inventory creation due to mismatch between frontend data and backend schema validation.

**Step 1: Analyze the schema requirements**

In `server/actions/inventory.ts`, the `CreateInventoryItemSchema` requires:
- `name` (string, min 1 char) ✓
- `item_code` (optional string)
- `description` (optional string)
- `external_link` (optional, must be URL or empty string)
- `item_type` (enum: 'ITEM' | 'FLUID')
- `item_category` (enum: 'TATTOO' | 'PIERCING' | 'EQUIPMENT' | 'FOOD' | 'APPAREL' | 'OTHER')
- `current_stock` (number, min 0)
- `stock_warning_threshold` (optional number, min 0)
- `unit_price` (optional number, min 0)
- `selling_price` (optional number, min 0)
- `last_restocked` (optional Date)
- `fluid_unit_size` (optional number)
- `fluid_remaining` (optional number)
- `fluid_unit_of_measure` (optional string)
- `is_perishable` (boolean)
- `expiration_date` (optional Date)
- `show_in_sales` (boolean)

**Step 2: Fix handle null/undefined values in creation**

The issue is likely that `null` values don't pass the URL validation for `external_link`. Fix in `server/actions/inventory.ts` around line 284-310:

```typescript
// FIND: The validation and insertion code (around line 276-310)
// MODIFY: Handle empty/null values before validation

export async function createInventoryItem({ item, _user_id }: { item: CreateInventoryItemPayload, _user_id: string }): Promise<ActionResponse> {
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, error: "Unauthorized" }
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return { success: false, error: "Access denied" }
    }

    // Normalize empty strings to undefined for optional fields
    const normalizedItem = {
        ...item,
        external_link: item.external_link?.trim() || undefined,
        item_code: item.item_code?.trim() || undefined,
        description: item.description?.trim() || undefined,
        // Ensure numbers are valid
        current_stock: Number(item.current_stock) || 0,
        unit_price: item.unit_price ? Number(item.unit_price) : undefined,
        selling_price: item.selling_price ? Number(item.selling_price) : undefined,
        stock_warning_threshold: item.stock_warning_threshold ? Number(item.stock_warning_threshold) : undefined,
        fluid_unit_size: item.fluid_unit_size ? Number(item.fluid_unit_size) : undefined,
        fluid_remaining: item.fluid_remaining ? Number(item.fluid_remaining) : undefined,
    }

    const validated = CreateInventoryItemSchema.safeParse(normalizedItem)
    if (!validated.success) {
        const fieldErrors = validated.error.flatten().fieldErrors
        console.error('Validation errors:', fieldErrors)
        return {
            success: false,
            validationErrors: fieldErrors as Record<string, string[]>,
            error: "Validation failed",
        }
    }

    // ... rest of function
}
```

**Step 3: Update schema to be more lenient**

```typescript
// MODIFY the schema at lines 26-44 to be more lenient with optional fields

const CreateInventoryItemSchema = z.object({
    name: z.string().min(1, 'Item name is required'),
    item_code: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    external_link: z.string().url().optional().nullable().or(z.literal('')),
    item_type: z.enum(['ITEM', 'FLUID']),
    item_category: z.enum(['TATTOO', 'PIERCING', 'EQUIPMENT', 'FOOD', 'APPAREL', 'OTHER']),
    current_stock: z.coerce.number().min(0, 'Stock must be non-negative'),
    stock_warning_threshold: z.coerce.number().min(0).optional().nullable(),
    unit_price: z.coerce.number().min(0).optional().nullable(),
    selling_price: z.coerce.number().min(0).optional().nullable(),
    last_restocked: z.coerce.date().optional().nullable(),
    fluid_unit_size: z.coerce.number().min(0).optional().nullable(),
    fluid_remaining: z.coerce.number().min(0).optional().nullable(),
    fluid_unit_of_measure: z.string().optional().nullable(),
    is_perishable: z.coerce.boolean(),
    expiration_date: z.coerce.date().optional().nullable(),
    show_in_sales: z.coerce.boolean(),
})
```

**Step 4: Test**

Run: `bun run dev`
Navigate to: Inventory page, click "Add Item"
Fill form with various combinations of empty/filled optional fields
Expected: Form submits successfully

**Step 5: Commit**

```bash
git add server/actions/inventory.ts
git commit -m "fix: improve inventory creation validation with null handling"
```

---

## Task 4: Fix Accounting Categories Dropdown Duplicates

**Files:**
- Modify: `components/accounting/EntryModal.tsx` (or wherever category dropdown exists)
- Possibly: `server/actions/accounting.ts:1340-1343`

**Problem:** Categories may appear multiple times in dropdown due to database having duplicates or frontend not deduplicating.

**Step 1: Find the dropdown component**

Search for where categories are rendered as options:

```bash
grep -rn "getLedgerCategories\|getAccountingCategories" --include="*.tsx" app/
```

**Step 2: Add deduplication at query level**

In `server/actions/accounting.ts`, modify the `getLedgerCategories` function:

```typescript
// FIND around line 1340-1343:
export async function getLedgerCategories(): Promise<string[]> {
    const categories = await getAccountingCategories()
    return categories.filter((c) => c.is_active).map((c) => c.name)
}

// REPLACE WITH:
export async function getLedgerCategories(): Promise<string[]> {
    const categories = await getAccountingCategories()
    const activeCategories = categories.filter((c) => c.is_active)
    // Deduplicate by name (case-insensitive)
    const seen = new Set<string>()
    return activeCategories.filter((c) => {
        const lowerName = c.name.toLowerCase()
        if (seen.has(lowerName)) {
            return false
        }
        seen.add(lowerName)
        return true
    }).map((c) => c.name)
}
```

**Step 3: Test**

Run: `bun run dev`
Navigate to: Accounting, create new ledger entry
Expected: Category dropdown shows no duplicates

**Step 4: Commit**

```bash
git add server/actions/accounting.ts
git commit -m "fix: deduplicate categories in getLedgerCategories"
```

---

## Task 5: Fix Profile Update Validation Error for Admin

**Files:**
- Modify: `server/actions/profile.ts:35-43` (UpdateUserProfileSchema)
- Check: Frontend form sending correct data types

**Problem:** Admin profile updates failing with validation error.

**Step 1: Update schema to allow partial updates and handle nulls**

```typescript
// FIND at lines 35-43:
const UpdateUserProfileSchema = z.object({
    full_name: z.string().min(1).optional(),
    email: z.string().email('Invalid email address').optional(),
    role: z.enum(['ADMIN', 'MANAGER', 'STAFF', 'ARTIST']).optional(),
    phone_number: z.string().optional(),
    instagram_handle: z.string().optional(),
    avatar_url: z.string().url().optional().or(z.literal('')),
    access_flags: z.array(z.string()).optional(),
}).partial()

// REPLACE WITH:
const UpdateUserProfileSchema = z.object({
    full_name: z.string().min(1).optional().nullable(),
    email: z.string().email('Invalid email address').optional().nullable(),
    role: z.enum(['ADMIN', 'MANAGER', 'STAFF', 'ARTIST']).optional().nullable(),
    phone_number: z.string().optional().nullable(),
    instagram_handle: z.string().optional().nullable(),
    avatar_url: z.string().url().optional().nullable().or(z.literal('')),
    access_flags: z.array(z.string()).optional().nullable(),
    is_active: z.boolean().optional().nullable(),
    artist_level: z.enum(['APPRENTICE', 'JUNIOR', 'SENIOR', 'MASTER']).optional().nullable(),
    payout_period: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional().nullable(),
}).partial()
```

**Step 2: Handle null/undefined in updateProfile function**

```typescript
// MODIFY around line 331-378 in server/actions/profile.ts

export async function updateProfile({ userId, profile, updatedBy }: { userId: string, profile: Partial<UserProfile>, updatedBy?: string }): Promise<ActionResponse<void>> {
    // Normalize null values to undefined
    const normalizedProfile = {
        ...profile,
        full_name: profile.full_name || undefined,
        email: profile.email || undefined,
        phone_number: profile.phone_number || undefined,
        instagram_handle: profile.instagram_handle || undefined,
        avatar_url: profile.avatar_url || undefined,
        role: profile.role || undefined,
        access_flags: profile.access_flags || undefined,
        is_active: profile.is_active,
        artist_level: profile.artist_level || undefined,
        payout_period: profile.payout_period || undefined,
    }

    const validated = UpdateUserProfileSchema.safeParse(normalizedProfile)
    if (!validated.success) {
        const fieldErrors = validated.error.flatten().fieldErrors
        console.error('Profile update validation errors:', fieldErrors)
        return failure(
            "Validation failed",
            fieldErrors as Record<string, string[]>
        )
    }

    // ... rest of function remains the same
}
```

**Step 3: Test**

Run: `bun run dev`
Navigate to: Admin > Users, edit a user profile
Expected: Profile updates successfully

**Step 4: Commit**

```bash
git add server/actions/profile.ts
git commit -m "fix: handle null values in profile update validation"
```

---

## Task 6: Remove "Open Chat" Button and Chat References

**Files:**
- Modify: `app/appointments/appointmentDetailClient.tsx:200-209`
- Search and remove: Any other chat-related code

**Step 1: Remove chat button from appointment details**

In `app/appointments/appointmentDetailClient.tsx`, find lines 200-209:

```tsx
// DELETE THIS ENTIRE BLOCK:
{/* Chat Button */}
{appointment.status === "CONFIRMED" && (
    <Link
        href={`/messages/?user=${isStaff ? appointment.client_id : appointment.staff_id}&appointment=${appointment.id}`}
        className="px-3 py-1.5 bg-blue-400/20 hover:bg-blue-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors"
    >
        <MessageCircleIcon size={16} />
        Open Chat
    </Link>
)}
```

**Step 2: Search for remaining chat references**

```bash
grep -rn "chat\|Chat\|messages/\|MessageCircle" --include="*.tsx" --include="*.ts" app/ components/
```

**Step 3: Remove unused imports if any**

If `MessageCircleIcon` is no longer used elsewhere in the file, remove the import:

```typescript
// In imports at top, remove if unused:
import { MessageCircleIcon } from "lucide-react"
```

**Step 4: Test**

Run: `bun run dev`
Navigate to: Appointment details page
Expected: No chat button visible, no errors

**Step 5: Commit**

```bash
git add app/appointments/appointmentDetailClient.tsx
git commit -m "refactor: remove Open Chat button (chat feature discontinued)"
```

---

## Task 7: Consolidate Notification Components

**Files:**
- Modify: `components/notifications.tsx` - Update to use styling from notification-provider.tsx
- Check: All imports of notifications component

**Problem:** Two notification implementations exist with different styling. Need to update `notifications.tsx` to match the better styling of `notification-provider.tsx`.

**Step 1: Update notifications.tsx to use new styling**

The file `components/notifications.tsx` should be updated to match the styling pattern in `notification-provider.tsx`. Key improvements:
- Better visual hierarchy (icon container with background)
- Progress bar for auto-dismiss
- Clear all button
- Better accessibility (aria attributes)
- Cleaner animation

Replace the entire `components/notifications.tsx` with an updated version that exports both providers for backward compatibility:

```typescript
"use client"

import {
    NotificationContextType,
    NotificationItem,
} from "@/utils/types/notifications"
import { CheckIcon, TriangleAlertIcon, XIcon, InfoIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { createContext, useCallback, useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"

const notificationStyles = {
    INFO: {
        icon: InfoIcon,
        borderColor: "border-slate-300",
        iconColor: "text-slate-600",
        iconBg: "bg-slate-100",
        bgAccent: "bg-slate-50",
        progressColor: "bg-slate-400",
    },
    SUCCESS: {
        icon: CheckIcon,
        borderColor: "border-green-500/40",
        iconColor: "text-green-600",
        iconBg: "bg-green-100",
        bgAccent: "bg-green-50",
        progressColor: "bg-green-400",
    },
    WARNING: {
        icon: TriangleAlertIcon,
        borderColor: "border-orange-500/40",
        iconColor: "text-orange-600",
        iconBg: "bg-orange-100",
        bgAccent: "bg-orange-50",
        progressColor: "bg-orange-400",
    },
    ERROR: {
        icon: XIcon,
        borderColor: "border-red-500/40",
        iconColor: "text-red-600",
        iconBg: "bg-red-100",
        bgAccent: "bg-red-50",
        progressColor: "bg-red-400",
    },
} as const

type NotificationType = keyof typeof notificationStyles

interface LegacyNotificationItem {
    id: string
    title?: string
    message: string
    type: NotificationType
}

export const NotificationContext = createContext<NotificationContextType>({
    notifications: [],
    addNotification: () => {},
    removeNotification: () => {},
})

const DEFAULT_DURATION = 5000
const MAX_NOTIFICATIONS = 5

export default function NotificationProvider({
    children,
}: {
    children: React.ReactNode
}) {
    const [notifications, setNotifications] = useState<LegacyNotificationItem[]>([])
    const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    // Cleanup timeouts on unmount
    useEffect(() => {
        const timeouts = timeoutsRef.current
        return () => {
            timeouts.forEach((timeout) => clearTimeout(timeout))
            timeouts.clear()
        }
    }, [])

    const removeNotification: NotificationContextType["removeNotification"] =
        useCallback((id) => {
            const timeout = timeoutsRef.current.get(id)
            if (timeout) {
                clearTimeout(timeout)
                timeoutsRef.current.delete(id)
            }
            setNotifications((prevNotifications) =>
                prevNotifications.filter((n) => n.id !== id),
            )
        }, [])

    const addNotification: NotificationContextType["addNotification"] =
        useCallback(
            (message, type = "INFO", title, ephemeral = true) => {
                const id =
                    Date.now().toString(36) +
                    Math.random().toString(36).slice(2)
                const newNotification: LegacyNotificationItem = {
                    id,
                    title: title || "",
                    message,
                    type: type as NotificationType,
                }
                
                setNotifications((prevNotifications) => {
                    const updated = [newNotification, ...prevNotifications].slice(0, MAX_NOTIFICATIONS)
                    // Clear timeouts for removed notifications
                    if (prevNotifications.length >= MAX_NOTIFICATIONS) {
                        prevNotifications.slice(MAX_NOTIFICATIONS - 1).forEach((n) => {
                            const t = timeoutsRef.current.get(n.id)
                            if (t) {
                                clearTimeout(t)
                                timeoutsRef.current.delete(n.id)
                            }
                        })
                    }
                    return updated
                })
                
                // Ephemeral notifications auto-remove after 5 seconds
                if (ephemeral) {
                    const timeout = setTimeout(() => {
                        removeNotification(id)
                    }, DEFAULT_DURATION)
                    timeoutsRef.current.set(id, timeout)
                }
            },
            [removeNotification],
        )

    const clearAll = useCallback(() => {
        timeoutsRef.current.forEach((timeout) => clearTimeout(timeout))
        timeoutsRef.current.clear()
        setNotifications([])
    }, [])

    const contextValue: NotificationContextType = {
        notifications,
        addNotification,
        removeNotification,
    }

    // Render toasts as portal
    const toastContainer = mounted ? createPortal(
        <div
            role="log"
            aria-live="polite"
            aria-atomic="false"
            aria-label="Notifications"
            className="fixed right-4 bottom-4 z-[100] flex w-full max-w-sm flex-col-reverse gap-2 md:right-6 md:bottom-6"
        >
            {notifications.length > 1 && (
                <motion.button
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    onClick={clearAll}
                    className="self-end rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-md ring-1 ring-black/5 select-none hover:bg-slate-50 hover:text-slate-700"
                >
                    Clear all
                </motion.button>
            )}
            <AnimatePresence mode="popLayout">
                {notifications.map((notification) => {
                    const style = notificationStyles[notification.type]
                    const IconComponent = style.icon
                    
                    return (
                        <motion.div
                            key={notification.id}
                            layout
                            role="alert"
                            initial={{ opacity: 0, x: 60, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 60, scale: 0.95, transition: { duration: 0.2 } }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            onClick={() => removeNotification(notification.id)}
                            className={`w-full cursor-pointer overflow-hidden rounded-xl border bg-white shadow-lg select-none ${style.borderColor}`}
                        >
                            <div className={`flex items-start gap-3 p-4 ${style.bgAccent}`}>
                                <div className={`shrink-0 rounded-lg p-1.5 ${style.iconBg}`}>
                                    <IconComponent size={16} strokeWidth={2.5} className={style.iconColor} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    {notification.title && (
                                        <p className="mb-0.5 text-sm font-semibold text-slate-900 select-none">
                                            {notification.title}
                                        </p>
                                    )}
                                    <p className="text-sm leading-relaxed text-slate-600 select-none">
                                        {notification.message}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        removeNotification(notification.id)
                                    }}
                                    aria-label="Dismiss notification"
                                    className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-white/60 hover:text-slate-700"
                                >
                                    <XIcon size={14} />
                                </button>
                            </div>
                            <div
                                className={`h-0.5 origin-left ${style.progressColor}`}
                                style={{
                                    animation: `drain ${DEFAULT_DURATION}ms linear forwards`,
                                }}
                            />
                        </motion.div>
                    )
                })}
            </AnimatePresence>
        </div>,
        document.body
    ) : null

    return (
        <NotificationContext.Provider value={contextValue}>
            {children}
            {toastContainer}
        </NotificationContext.Provider>
    )
}
```

**Step 2: Add CSS animation for progress bar**

In `app/globals.css` or a global stylesheet, ensure the drain animation exists:

```css
@keyframes drain {
    from {
        transform: scaleX(1);
    }
    to {
        transform: scaleX(0);
    }
}
```

**Step 3: Test**

Run: `bun run dev`
Trigger notifications from various actions
Expected: Notifications appear with new styling, progress bar, close button

**Step 4: Commit**

```bash
git add components/notifications.tsx app/globals.css
git commit -m "refactor: update notifications with improved styling from notification-provider"
```

---

## Task 8: Add View Auth Keys/Invitations Admin UI

**Files:**
- Create: `app/(app)/admin/invitations/page.tsx`
- Create: `app/(app)/admin/invitations/invitationsClient.tsx`
- Modify: `server/actions/profile.ts` - Add list invitations function

**Step 1: Add server action to list invitations**

In `server/actions/profile.ts`, add:

```typescript
// Add after existing imports
import { invitations } from "@/server/db/schema/invitations"

// Add new function around line 700
export async function listInvitations(): Promise<ActionResponse<Array<{
    id: string
    email: string
    token: string
    role: UserRoleType
    created_at: Date
    expires_at: Date | null
    created_by: string
    creator_name?: string
}>>> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return failure('Not authenticated')
        }

        const adminCheck = await isAdmin(user)
        if (!adminCheck) {
            return failure('Access denied')
        }

        const invitationList = await db
            .select({
                id: invitations.id,
                email: invitations.email,
                token: invitations.token,
                role: invitations.role,
                created_at: invitations.createdAt,
                expires_at: invitations.expiresAt,
                created_by: invitations.createdBy,
            })
            .from(invitations)
            .orderBy(desc(invitations.createdAt))

        // Get creator names
        const creatorIds = [...new Set(invitationList.map(i => i.created_by))]
        const creators = await db
            .select({ id: user.id, name: user.fullName })
            .from(user)
            .where(inArray(user.id, creatorIds))

        const creatorMap = new Map(creators.map(c => [c.id, c.name]))

        return success(invitationList.map(inv => ({
            ...inv,
            creator_name: creatorMap.get(inv.created_by) || 'Unknown',
        })))
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error listing invitations: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to list invitations')
    }
}
```

**Step 2: Create admin invitations page**

Create `app/(app)/admin/invitations/page.tsx`:

```typescript
import InvitationsClient from './invitationsClient'

export default function InvitationsPage() {
    return <InvitationsClient />
}
```

**Step 3: Create invitations client component**

Create `app/(app)/admin/invitations/invitationsClient.tsx`:

```typescript
"use client"

import { useState, useEffect, useContext } from "react"
import { MailIcon, ClockIcon, Trash2Icon, RefreshCwIcon, CopyIcon, KeyIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { SideBarContext } from "@/components/sidebar"
import { NotificationContext } from "@/components/notifications"
import { listInvitations } from "@/server/actions/profile"
import { UserRoleType } from "@/utils/types/auth"
import { ActionResponse } from "@/utils/types/responses"

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
    ADMIN: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    MANAGER: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    STAFF: "bg-green-500/20 text-green-400 border-green-500/30",
    ARTIST: "bg-orange-500/20 text-orange-400 border-orange-500/30",
}

export default function InvitationsClient() {
    const { userInfo } = useContext(SideBarContext)
    const { addNotification } = useContext(NotificationContext)
    const [invitations, setInvitations] = useState<Invitation[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchInvitations()
    }, [])

    const fetchInvitations = async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await listInvitations()
            if (result.success) {
                setInvitations(result.data as Invitation[])
            } else {
                setError(result.error || "Failed to load invitations")
            }
        } catch (err) {
            setError("An unexpected error occurred")
        } finally {
            setLoading(false)
        }
    }

    const copyToken = (token: string) => {
        navigator.clipboard.writeText(token)
        addNotification("Invitation code copied!", "SUCCESS", "Copied")
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString()
    }

    const isExpired = (expiresAt: string | null) => {
        if (!expiresAt) return false
        return new Date(expiresAt) < new Date()
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <KeyIcon className="w-6 h-6 text-blue-500" />
                    <div>
                        <h1 className="text-2xl font-bold">Invitation Codes</h1>
                        <p className="text-white/60 text-sm">Manage user invitation codes</p>
                    </div>
                </div>
                <button
                    onClick={fetchInvitations}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors"
                >
                    <RefreshCwIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <RefreshCwIcon className="w-8 h-8 animate-spin text-white/60" />
                </div>
            ) : invitations.length === 0 ? (
                <div className="text-center py-12 text-white/60">
                    <MailIcon className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>No pending invitations</p>
                </div>
            ) : (
                <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-white/5">
                            <tr className="text-left text-sm text-white/60">
                                <th className="px-4 py-3">Email</th>
                                <th className="px-4 py-3">Role</th>
                                <th className="px-4 py-3">Code</th>
                                <th className="px-4 py-3">Created</th>
                                <th className="px-4 py-3">Expires</th>
                                <th className="px-4 py-3">Created By</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {invitations.map((inv) => (
                                <tr key={inv.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-4 py-3 font-medium">{inv.email}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded text-xs border ${ROLE_COLORS[inv.role]}`}>
                                            {inv.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <code className="bg-white/10 px-2 py-1 rounded text-sm font-mono">
                                                {inv.token}
                                            </code>
                                            <button
                                                onClick={() => copyToken(inv.token)}
                                                className="p-1 hover:bg-white/10 rounded transition-colors"
                                                title="Copy code"
                                            >
                                                <CopyIcon className="w-4 h-4 text-white/60" />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white/60">
                                        {formatDate(inv.created_at)}
                                    </td>
                                    <td className="px-4 py-3">
                                        {inv.expires_at ? (
                                            <span className={isExpired(inv.expires_at) ? "text-red-400" : "text-white/60"}>
                                                {formatDate(inv.expires_at)}
                                                {isExpired(inv.expires_at) && " (Expired)"}
                                            </span>
                                        ) : (
                                            <span className="text-white/40">Never</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white/60">
                                        {inv.creator_name}
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

**Step 4: Test**

Run: `bun run dev`
Navigate to: `/admin/invitations`
Expected: Table showing all invitation codes with copy button

**Step 5: Commit**

```bash
git add app/\(app\)/admin/invitations/page.tsx app/\(app\)/admin/invitations/invitationsClient.tsx server/actions/profile.ts
git commit -m "feat: add admin UI to view invitation codes"
```

---

## Task 9: Change Auth Keys to 8-Digit Numeric Codes

**Files:**
- Modify: `server/db/schema/invitations.ts` - Update token field
- Modify: `server/actions/profile.ts` - Update token generation
- Check: Any invite scripts

**User Decision:** Numeric only (00000000-99999999), migrate all existing codes.

**Step 1: Update token length in schema**

In `server/db/schema/invitations.ts`, verify the token field:

```typescript
// The token field should allow 8 characters
// Current schema likely already supports this, but verify:
token: text('token').notNull().unique(), // 8-digit numeric codes
```

**Step 2: Update token generation function**

In `server/actions/profile.ts`, find the token generation (around line 567-572):

```typescript
// FIND:
// Generate invitation token
const token = randomUUID()

// REPLACE WITH:
// Generate 8-digit numeric invitation token
const token = Math.floor(10000000 + Math.random() * 90000000).toString()
```

**Step 3: Add migration script for existing tokens**

Create `scripts/migrate-invitation-codes.ts`:

```typescript
/**
 * Migration script to regenerate all invitation codes to 8-digit numeric format
 * Run with: bun run scripts/migrate-invitation-codes.ts
 */

import { db } from '../server/db'
import { invitations } from '../server/db/schema/invitations'
import { isNull, isNotNull } from 'drizzle-orm'

async function migrateCodes() {
    console.log('Starting invitation code migration...')
    
    // Get all existing invitations
    const existing = await db.select().from(invitations)
    console.log(`Found ${existing.length} invitations to migrate`)
    
    const usedCodes = new Set<string>()
    
    for (const inv of existing) {
        // Generate unique 8-digit code
        let newCode: string
        do {
            newCode = Math.floor(10000000 + Math.random() * 90000000).toString()
        } while (usedCodes.has(newCode))
        
        usedCodes.add(newCode)
        
        await db
            .update(invitations)
            .set({ token: newCode })
            .where(eq(invitations.id, inv.id))
        
        console.log(`Migrated ${inv.email}: ${inv.token.slice(0, 8)}... -> ${newCode}`)
    }
    
    console.log('Migration complete!')
    process.exit(0)
}

migrateCodes().catch(console.error)
```

**Step 4: Run migration**

```bash
bun run scripts/migrate-invitation-codes.ts
```

**Step 5: Update any invite-related scripts**

Search for other places generating invitation codes:

```bash
grep -rn "randomUUID\|invitation.*token\|invite.*code" --include="*.ts" server/
```

**Step 6: Test**

Run: `bun run dev`
Create a new invitation
Expected: Token is 8-digit numeric (e.g., "12345678")

**Step 7: Commit**

```bash
git add server/actions/profile.ts server/db/schema/invitations.ts scripts/migrate-invitation-codes.ts
git commit -m "feat: change invitation codes to 8-digit numeric format"
```

---

## Task 10: Fix "Invalid User Data" Error When Creating User

**Files:**
- Modify: `server/actions/profile.ts` - createUser function
- Check: Frontend user creation form

**Problem:** User creation failing with "Invalid User Data" error.

**Step 1: Examine the createUser function**

In `server/actions/profile.ts`, find `createUser` (around line 609) and examine validation:

```typescript
// FIND the createUser function and examine what validation is failing
```

**Step 2: Update the createUser function with better error handling**

```typescript
// FIND around line 609-620, MODIFY to:

export async function createUser({ full_name, email, password, role }: CreateUserParams): Promise<{ success: boolean; message: string }> {
    try {
        // Validate inputs
        if (!full_name?.trim()) {
            return { success: false, message: "Full name is required" }
        }
        if (!email?.trim()) {
            return { success: false, message: "Email is required" }
        }
        if (!password?.trim()) {
            return { success: false, message: "Password is required" }
        }
        if (!role) {
            return { success: false, message: "Role is required" }
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            return { success: false, message: "Invalid email format" }
        }

        // Normalize email
        const normalizedEmail = email.toLowerCase().trim()

        // Check for existing user
        const existingUser = await db
            .select()
            .from(user)
            .where(eq(user.email, normalizedEmail))
            .limit(1)

        if (existingUser.length > 0) {
            return { success: false, message: "A user with this email already exists" }
        }

        // Generate invitation token
        const token = Math.floor(10000000 + Math.random() * 90000000).toString()

        // Create invitation record
        await db.insert(invitations).values({
            id: randomUUID(),
            email: normalizedEmail,
            token: token,
            role: role,
            createdAt: new Date(),
            createdBy: (await getCurrentUser())?.id || 'system',
        })

        // Create user via Better Auth Public API
        // ... rest of user creation logic
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error creating user: ${error instanceof Error ? error.message : String(error)}`
        })
        return { success: false, message: `Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
}
```

**Step 3: Test**

Run: `bun run dev`
Navigate to: Admin > Users
Create a new user with various inputs
Expected: Clear error messages, successful creation

**Step 4: Commit**

```bash
git add server/actions/profile.ts
git commit -m "fix: improve user creation validation and error messages"
```

---

## Task 11: Add Appointment Details Editing

**Files:**
- Modify: `app/appointments/appointmentDetailClient.tsx`
- Modify: `server/actions/appointments.ts` - updateAppointment function

**User Decision:** Full edit (all fields)

**Step 1: Add edit mode state to appointment detail client**

In `app/appointments/appointmentDetailClient.tsx`, add edit mode functionality:

```typescript
// Add state after existing useState hooks (around line 50-80)
const [isEditing, setIsEditing] = useState(false)
const [editForm, setEditForm] = useState({
    title: appointment.title || '',
    time_start: new Date(appointment.time_start),
    time_end: new Date(appointment.time_end),
    staff_id: appointment.staff_id || '',
    notes: appointment.notes || '',
    client_name: appointment.client_name || '',
    client_phone: appointment.client_phone || '',
    client_email: appointment.client_email || '',
})
const [saving, setSaving] = useState(false)
```

**Step 2: Add edit button and form**

In the Action Bar section (around line 198-230), add:

```tsx
// ADD AFTER the existing action buttons:

{/* Edit Button */}
{isStaff && appointment.status === "CONFIRMED" && !isEditing && (
    <button
        onClick={() => setIsEditing(true)}
        className="px-3 py-1.5 bg-yellow-400/20 hover:bg-yellow-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors"
    >
        <PencilIcon size={16} />
        Edit
    </button>
)}

{/* Edit Mode Actions */}
{isEditing && (
    <>
        <button
            onClick={handleSaveEdit}
            disabled={saving}
            className="px-3 py-1.5 bg-green-400/20 hover:bg-green-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
        >
            {saving ? <LoaderCircleIcon className="w-4 h-4 animate-spin" /> : <CheckIcon size={16} />}
            Save
        </button>
        <button
            onClick={() => {
                setIsEditing(false)
                // Reset form to original values
                setEditForm({
                    title: appointment.title || '',
                    time_start: new Date(appointment.time_start),
                    time_end: new Date(appointment.time_end),
                    staff_id: appointment.staff_id || '',
                    notes: appointment.notes || '',
                    client_name: appointment.client_name || '',
                    client_phone: appointment.client_phone || '',
                    client_email: appointment.client_email || '',
                })
            }}
            disabled={saving}
            className="px-3 py-1.5 bg-red-400/20 hover:bg-red-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors"
        >
            <XIcon size={16} />
            Cancel
        </button>
    </>
)}
```

**Step 3: Add edit form fields**

Add editable fields in the appointment details section:

```tsx
// Replace static display with editable when isEditing is true

// For title:
{isEditing ? (
    <input
        type="text"
        value={editForm.title}
        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none"
    />
) : (
    <p>{appointment.title}</p>
)}

// For time:
{isEditing ? (
    <div className="flex gap-2">
        <input
            type="datetime-local"
            value={editForm.time_start.toISOString().slice(0, 16)}
            onChange={(e) => setEditForm({ ...editForm, time_start: new Date(e.target.value) })}
            className="px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none"
        />
        <input
            type="datetime-local"
            value={editForm.time_end.toISOString().slice(0, 16)}
            onChange={(e) => setEditForm({ ...editForm, time_end: new Date(e.target.value) })}
            className="px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none"
        />
    </div>
) : (
    <p>{formatDate(appointment.time_start)} - {formatDate(appointment.time_end)}</p>
)}

// For notes:
{isEditing ? (
    <textarea
        value={editForm.notes}
        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none min-h-[100px]"
    />
) : (
    <p className="whitespace-pre-wrap">{appointment.notes || "No notes"}</p>
)}
```

**Step 4: Add save handler**

```typescript
// Add handler function before the return statement:

const handleSaveEdit = async () => {
    setSaving(true)
    try {
        const result = await updateAppointment({
            id: appointment.id,
            title: editForm.title,
            time_start: editForm.time_start,
            time_end: editForm.time_end,
            staff_id: editForm.staff_id,
            notes: editForm.notes,
            client_name: editForm.client_name,
            client_phone: editForm.client_phone,
            client_email: editForm.client_email,
        })
        
        if (result.success) {
            addNotification("Appointment updated", "SUCCESS")
            setIsEditing(false)
            router.refresh()
        } else {
            addNotification(result.error || "Failed to update appointment", "ERROR")
        }
    } catch (error) {
        addNotification("An unexpected error occurred", "ERROR")
    } finally {
        setSaving(false)
    }
}
```

**Step 5: Update server action if needed**

Ensure `updateAppointment` in `server/actions/appointments.ts` supports all fields:

```typescript
// Check UpdateAppointmentSchema accepts all needed fields
// Add client_name, client_phone, client_email if not present
```

**Step 6: Test**

Run: `bun run dev`
Navigate to: Appointment details page
Click Edit, modify fields, save
Expected: Appointment updates successfully

**Step 7: Commit**

```bash
git add app/appointments/appointmentDetailClient.tsx server/actions/appointments.ts
git commit -m "feat: add full edit capability to appointment details"
```

---

## Task 12: Add Branch Selection UI for Appointments/Inventory/Accounting/Payroll

**Files:**
- Create: `components/BranchSelector.tsx`
- Modify: `components/sidebar.tsx` - Add branch context
- Modify: Various forms to include branch selection

**Step 1: Create BranchSelector component**

Create `components/BranchSelector.tsx`:

```typescript
"use client"

import { useContext, useEffect, useState } from "react"
import { Building2Icon, ChevronDownIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { SideBarContext } from "./sidebar"
import { getAllBranches } from "@/server/actions/branches"
import { Branch } from "@/utils/types/branch"

interface BranchSelectorProps {
    value?: string
    onChange: (branchId: string | null) => void
    placeholder?: string
    disabled?: boolean
    allowAll?: boolean
}

export default function BranchSelector({
    value,
    onChange,
    placeholder = "Select branch",
    disabled = false,
    allowAll = true,
}: BranchSelectorProps) {
    const { currentBranch, setCurrentBranch } = useContext(SideBarContext)
    const [branches, setBranches] = useState<Branch[]>([])
    const [loading, setLoading] = useState(true)
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        fetchBranches()
    }, [])

    const fetchBranches = async () => {
        setLoading(true)
        try {
            const result = await getAllBranches()
            if (result.success) {
                setBranches(result.data.filter(b => b.is_active))
            }
        } catch (error) {
            console.error("Failed to fetch branches:", error)
        } finally {
            setLoading(false)
        }
    }

    const selectedBranch = branches.find(b => b.id === value)

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled || loading}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-white/10 border border-white/20 rounded-md hover:bg-white/20 transition-colors disabled:opacity-50"
            >
                <div className="flex items-center gap-2">
                    <Building2Icon className="w-4 h-4 text-white/60" />
                    {selectedBranch ? (
                        <span>{selectedBranch.name}</span>
                    ) : allowAll ? (
                        <span className="text-white/60">All Branches</span>
                    ) : (
                        <span className="text-white/60">{placeholder}</span>
                    )}
                </div>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute z-50 mt-1 w-full bg-zinc-900 border border-white/10 rounded-md shadow-lg overflow-hidden"
                    >
                        {allowAll && (
                            <button
                                type="button"
                                onClick={() => {
                                    onChange(null)
                                    setIsOpen(false)
                                }}
                                className={`w-full px-3 py-2 text-left hover:bg-white/10 transition-colors ${!value ? "bg-white/5" : ""}`}
                            >
                                All Branches
                            </button>
                        )}
                        {branches.map((branch) => (
                            <button
                                key={branch.id}
                                type="button"
                                onClick={() => {
                                    onChange(branch.id)
                                    setIsOpen(false)
                                }}
                                className={`w-full px-3 py-2 text-left hover:bg-white/10 transition-colors ${value === branch.id ? "bg-white/5" : ""}`}
                            >
                                {branch.name}
                                {branch.code && (
                                    <span className="text-white/40 text-sm ml-2">
                                        ({branch.code})
                                    </span>
                                )}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
```

**Step 2: Add branchContext to sidebar**

In `components/sidebar.tsx`, add branch state to the context:

```typescript
// Add to SideBarContext interface (around line 20-40)
interface SideBarContextType {
    // ... existing properties
    currentBranch: string | null
    setCurrentBranch: (branchId: string | null) => void
}

// Add to the provider (around line 60-80)
const [currentBranch, setCurrentBranch] = useState<string | null>(null)

// Add to contextValue
const contextValue = {
    // ... existing values
    currentBranch,
    setCurrentBranch,
}
```

**Step 3: Add branch selector to appointment form**

In appointment creation/edit forms, add:

```tsx
import BranchSelector from "@/components/BranchSelector"

// In the form JSX:
<div>
    <label className="block text-sm font-medium mb-1">Branch</label>
    <BranchSelector
        value={formData.branch_id}
        onChange={(branchId) => setFormData({ ...formData, branch_id: branchId })}
        placeholder="Select branch"
        allowAll={false}
    />
</div>
```

**Step 4: Add branch selector to inventory form**

In inventory creation/edit forms:

```tsx
// Similar pattern as above
<div>
    <label className="block text-sm font-medium mb-1">Branch</label>
    <BranchSelector
        value={formData.branch_id}
        onChange={(branchId) => setFormData({ ...formData, branch_id: branchId || undefined })}
        allowAll={true}
    />
</div>
```

**Step 5: Add to accounting entries**

In accounting entry creation:

```tsx
<div>
    <label className="block text-sm font-medium mb-1">Branch (Optional)</label>
    <BranchSelector
        value={formData.branch_id}
        onChange={(branchId) => setFormData({ ...formData, branch_id: branchId })}
        allowAll={true}
    />
</div>
```

**Step 6: Test**

Run: `bun run dev`
Navigate to: Appointment creation, Inventory creation, Accounting entry creation
Expected: Branch selector appears and functions correctly

**Step 7: Commit**

```bash
git add components/BranchSelector.tsx components/sidebar.tsx app/appointments/*.tsx app/inventory/*.tsx app/accounting/*.tsx
git commit -m "feat: add BranchSelector component for branch selection across forms"
```

---

## Task 13: Update Branches Admin UI Styling

**Files:**
- Modify: `app/(app)/admin/branches/page.tsx`
- Modify: `app/(app)/admin/branches/branch-form.tsx`

**Problem:** Current styling doesn't match newer card-based UI patterns used elsewhere in the app.

**Step 1: Update main branches page**

Replace the content of `app/(app)/admin/branches/page.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { getAllBranches, createBranch, updateBranch, deleteBranch } from '@/server/actions/branches'
import { Branch, CreateBranchPayload, UpdateBranchPayload } from '@/utils/types/branch'
import { getCurrentUser, canManageBranches } from '@/utils/auth/permissions'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Pencil, Trash2, MapPin, Phone, Mail, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { BranchForm } from './branch-form'

export default function BranchesAdminPage() {
    const [branches, setBranches] = useState<Branch[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [canManage, setCanManage] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
    const router = useRouter()

    useEffect(() => {
        checkAccess()
    }, [])

    const checkAccess = async () => {
        const user = await getCurrentUser()
        if (!user) {
            router.push('/auth/login')
            return
        }
        const manageAccess = await canManageBranches(user)
        setCanManage(manageAccess)
        await fetchBranches()
    }

    const fetchBranches = async () => {
        setLoading(true)
        try {
            const result = await getAllBranches()
            if (!result.success) {
                setError(result.error)
            } else {
                setBranches(result.data)
            }
        } catch (err) {
            setError('Failed to load branches')
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = async (payload: CreateBranchPayload) => {
        const result = await createBranch(payload)
        if (!result.success) {
            setError(result.error)
            return false
        }
        setBranches([...branches, result.data])
        setShowForm(false)
        return true
    }

    const handleUpdate = async (payload: UpdateBranchPayload) => {
        if (!editingBranch) return false
        const result = await updateBranch(editingBranch.id, payload)
        if (!result.success) {
            setError(result.error)
            return false
        }
        setBranches(branches.map(b => b.id === result.data.id ? result.data : b))
        setEditingBranch(null)
        return true
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Deactivate this branch?')) return
        const result = await deleteBranch(id)
        if (!result.success) {
            setError(result.error)
            return
        }
        setBranches(branches.map(b => b.id === id ? { ...b, is_active: false } : b))
    }

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-8 h-8 animate-spin text-white/60" />
                </div>
            </div>
        )
    }

    return (
        <div className='container mx-auto px-4 py-8'>
            {/* Header */}
            <div className='flex items-center justify-between mb-6'>
                <div className='flex items-center gap-3'>
                    <div className='p-2 bg-blue-500/20 rounded-lg'>
                        <Building2 className='w-6 h-6 text-blue-400' />
                    </div>
                    <div>
                        <h1 className='text-2xl font-bold'>Branch Management</h1>
                        <p className='text-white/60 text-sm'>Manage studio locations</p>
                    </div>
                </div>
                <div className='flex items-center gap-2'>
                    <button
                        onClick={fetchBranches}
                        disabled={loading}
                        className='p-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'
                        title='Refresh'
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {canManage && (
                        <button
                            onClick={() => setShowForm(true)}
                            className='flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors font-medium'
                        >
                            <Plus className='w-4 h-4' />
                            Add Branch
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className='mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400'>
                    {error}
                </div>
            )}

            {!canManage && (
                <div className='mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400'>
                    Read-only access. Contact an administrator to manage branches.
                </div>
            )}

            {/* Branch Cards */}
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
                <AnimatePresence>
                    {branches.map((branch) => (
                        <motion.div
                            key={branch.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className={`p-4 rounded-lg border-2 ${branch.is_active ? 'bg-white/5 border-white/10' : 'bg-white/2 border-white/5 opacity-60'}`}
                        >
                            <div className='flex items-start justify-between mb-3'>
                                <div>
                                    <h3 className='font-semibold text-lg'>{branch.name}</h3>
                                    <span className='text-sm text-white/40'>{branch.code}</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-xs ${branch.is_active ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                    {branch.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>

                            {branch.address && (
                                <div className='flex items-start gap-2 mb-2 text-sm text-white/60'>
                                    <MapPin className='w-4 h-4 shrink-0 mt-0.5' />
                                    <span>{branch.address}</span>
                                </div>
                            )}

                            {branch.city && (
                                <p className='text-sm text-white/40 mb-2'>{branch.city}</p>
                            )}

                            {branch.phone && (
                                <div className='flex items-center gap-2 mb-2 text-sm text-white/60'>
                                    <Phone className='w-4 h-4' />
                                    <span>{branch.phone}</span>
                                </div>
                            )}

                            {branch.email && (
                                <div className='flex items-center gap-2 text-sm text-white/60'>
                                    <Mail className='w-4 h-4' />
                                    <span>{branch.email}</span>
                                </div>
                            )}

                            {canManage && (
                                <div className='flex items-center gap-2 mt-4 pt-4 border-t border-white/10'>
                                    <button
                                        onClick={() => setEditingBranch(branch)}
                                        className='flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md transition-colors text-sm'
                                    >
                                        <Pencil className='w-3.5 h-3.5' />
                                        Edit
                                    </button>
                                    {branch.is_active && (
                                        <button
                                            onClick={() => handleDelete(branch.id)}
                                            className='flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-md transition-colors text-sm'
                                        >
                                            <Trash2 className='w-3.5 h-3.5' />
                                            Deactivate
                                        </button>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {branches.length === 0 && !loading && (
                <div className='text-center py-12 text-white/60'>
                    <Building2 className='w-12 h-12 mx-auto mb-4 opacity-30' />
                    <p>No branches found</p>
                    {canManage && (
                        <button
                            onClick={() => setShowForm(true)}
                            className='mt-4 text-blue-400 hover:text-blue-300'
                        >
                            Create your first branch
                        </button>
                    )}
                </div>
            )}

            {/* Form Modals */}
            <AnimatePresence>
                {showForm && (
                    <BranchForm
                        onSubmit={handleCreate}
                        onClose={() => setShowForm(false)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {editingBranch && (
                    <BranchForm
                        branch={editingBranch}
                        onSubmit={handleUpdate}
                        onClose={() => setEditingBranch(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}
```

**Step 2: Update branch form styling**

Update `app/(app)/admin/branches/branch-form.tsx` to match the new styling.

**Step 3: Test**

Run: `bun run dev`
Navigate to: `/admin/branches`
Expected: Card-based layout matching other admin pages

**Step 4: Commit**

```bash
git add app/\(app\)/admin/branches/page.tsx app/\(app\)/admin/branches/branch-form.tsx
git commit -m "refactor: update branches admin UI to card-based layout"
```

---

## Task 14: Additional Improvements and Cleanup

**Files:**
- Various files for minor improvements

**Step 1: Add error boundary to Sales page**

Create an error boundary wrapper for the sales page to gracefully handle errors:

```typescript
// Add to SalesContent in app/sales/salesPage.tsx
if (sales.loading) {
    return (
        <div className="w-full h-full flex items-center justify-center">
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            >
                <RefreshCwIcon className="w-8 h-8 text-white/60" />
            </motion.div>
        </div>
    )
}
```

**Step 2: Add input sanitization to appointment creation**

In `server/actions/appointments.ts`, ensure inputs are sanitized:

```typescript
// Add at the start of createAppointment function
const sanitizedData = {
    ...validated.data,
    title: sanitizeText(validated.data.title),
    notes: validated.data.notes ? sanitizeText(validated.data.notes) : undefined,
    client_name: validated.data.client_name ? sanitizeText(validated.data.client_name) : undefined,
}
```

**Step 3: Add consistent loading states across components**

Ensure all components have consistent loading state UI patterns.

**Step 4: Commit**

```bash
git add app/sales/salesPage.tsx server/actions/appointments.ts
git commit -m "refactor: add error handling and loading states"
```

---

## Verification Steps

After completing all tasks, run:

```bash
# Run linting
bun run lint

# Build the project
bun run build

# Test critical flows
bun run dev
# Navigate to:
# - Sales page - verify no crashes
# - Business Insights - verify staff performance loads
# - Inventory - create item successfully
# - Accounting Categories - no duplicates in dropdown
# - Appointments - edit details works
# - Admin Invitations - view codes
# - Admin Branches - updated styling
```

---

## Summary

This plan addresses:
1. ✅ Sales page crash fix
2. ✅ getStaffPerformance implementation
3. ✅ Inventory creation validation
4. ✅ Accounting categories duplicates
5. ✅ Profile update validation
6. ✅ Remove Chat references
7. ✅ Notification component consolidation
8. ✅ Auth keys/invitations admin UI
9. ✅ Auth keys to 8-digit format
10. ✅ User creation error fix
11. ✅ Appointment editing UI
12. ✅ Branch selection for forms
13. ✅ Branches admin UI styling
14. ✅ Additional improvements

**Estimated time:** 3-4 hours total
**Complexity:** Medium - Several interconnected fixes