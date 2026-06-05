# Comprehensive System Audit — Access Flags, POS Cut Distribution & Service Visibility

**Date:** 2026-05-20
**Status:** Source of Truth — architectural boundaries & constraints
**Scope:** Three known bugs + full system audit of access enforcement, POS commission flow, and feature visibility
**Predecessor Spec:** `2026-05-15-access-flags-audit-design.md` (flags registry already implemented)

---

## 1. Issue #1: Admin Access Flag Toggle Doesn't Work Properly

### 1.1 Observed Behavior

When an admin toggles a feature access flag on or off for a user in `app/accounts/[id]/page.tsx`, the change either:
- Does not visually persist after save/reload (flag reverts)
- Adds duplicate flag entries when toggled on → off → on
- Cannot uncheck a flag that appears checked

### 1.2 Root Cause — `toggleFlag` vs `isChecked` Asymmetry

The checkbox `isChecked` determination uses **normalized** flag comparison, but the `toggleFlag` handler uses **direct** inclusion check. This creates a mismatch when legacy flag names are stored in the database.

```typescript
// isChecked (lines 487-489) — uses normalizeFlag for backward compat
const isChecked = editData.access_flags?.some(
    (f) => f === flag || normalizeFlag(f) === flag  // ← accepts old AND new names
) || false

// toggleFlag (lines 183-196) — uses strict equality ONLY
const toggleFlag = (flag: string) => {
    const currentFlags = editData.access_flags || []
    if (currentFlags.includes(flag)) {       // ← only checks NEW names!
        // remove it
    } else {
        // add it
    }
}
```

**Concrete Example:**

1. **User has `services` (old name) in DB** → `normalizeFlag('services') === 'services_manage'` → checkbox for `services_manage` shows **checked**
2. **Admin clicks to UNCHECK** → `toggleFlag('services_manage')` → `currentFlags.includes('services_manage')` → **FALSE** (array has `services`, not `services_manage`) → **ADDS** `services_manage` instead of removing `services`
3. **Admin clicks to CHECK again** → `currentFlags.includes('services_manage')` → **TRUE** → removes `services_manage`
4. **Result:** Old flag `services` remains forever; user ends up with both `services` and `services_manage` or just `services`

### 1.3 Required Fix — Normalize on Toggle

The `toggleFlag` function MUST normalize existing flags before checking membership:

```typescript
const toggleFlag = (flag: string) => {
    const currentFlags = editData.access_flags || []
    const canonicalFlag = normalizeFlag(flag)
    const normalizedFlags = currentFlags.map(f => normalizeFlag(f))
    const isActive = normalizedFlags.includes(canonicalFlag)

    if (isActive) {
        // Remove ALL variants (old + new) of this canonical flag
        setEditData({
            ...editData,
            access_flags: currentFlags.filter(f => normalizeFlag(f) !== canonicalFlag),
        })
    } else {
        // Add the canonical name
        setEditData({
            ...editData,
            access_flags: [...currentFlags, canonicalFlag],
        })
    }
}
```

### 1.4 Save-Time Normalization

In `server/actions/profile.ts` → `updateProfile`, before saving `accessFlags` to DB:

```typescript
// Normalize all flag names and deduplicate
if (validated.data.access_flags !== undefined && validated.data.access_flags !== null) {
    const normalized = [...new Set(
        validated.data.access_flags.map((f: string) => normalizeFlag(f))
    )].filter((f: string) => isValidAccessFlag(f))
    updateData.accessFlags = normalized
}
```

This ensures old flag names are cleaned up on every save, requiring no separate migration step.

### 1.5 Validation Before Save

In `server/actions/profile.ts`, add flag validation via `UpdateUserProfileSchema`:

```typescript
const UpdateUserProfileSchema = z.object({
    // ... existing fields
    access_flags: z.array(z.string()).optional().nullable(),
        // .refine((flags) => flags?.every(f => isValidAccessFlag(f)), {
        //     message: 'Contains invalid access flag names'
        // })
}).partial()
```

**Rule:** Only admins may modify `access_flags`. The `updateProfile` function already checks `isAdmin` but should also log flag changes to the audit trail.

---

## 2. Issue #2: Cut Does Not Reflect to Users Marked as Receivers

### 2.1 Observed Behavior

When a transaction is processed in POS/Sales, all service commissions (cuts) are assigned to the single `staff_id` selected at checkout. Users who performed individual services ("receivers") get no cut.

### 2.2 Root Cause — No Per-Service-Item Artist Assignment

**Data Model Gap:**

```typescript
// utils/types/transactions.ts
export interface CreateTransactionItemPayload {
    inventory_id?: string
    service_id?: string
    item_name: string
    quantity: number
    unit_price: number
    service_type?: ServiceType
    is_free?: boolean
    // ← NO artist_id / receiver_id field
}
```

**Payroll Creation (transactions.ts lines 311-329):**

```typescript
// ALL service items are assigned to the single staff_id
if (payload.staff_id) {
    for (const item of payload.items) {
        if (item.service_id) {
            const payrollResult = await calculateAndCreatePayrollEntry({
                transactionId: newTransaction.id,
                serviceId: item.service_id,
                staffId: payload.staff_id!,  // ← ALL services → single staff
                // ...
            })
        }
    }
}
```

**UI Gap (CheckoutModal):**

A single `<select>` for "Staff Assignment" maps to one `selectedStaffId` for the entire transaction. There is no per-cart-item artist selector.

### 2.3 Two-Role Architecture

| Role | Meaning | Example |
|------|---------|---------|
| **Staff (seller)** | The user processing the checkout | Cashier, Receptionist |
| **Artist/Receiver** | The user who performed each service | Tattoo artist, Piercer, Shoe tech |

A transaction has **one staff** (checkout processor) but can have **many artists** (one per service item).

### 2.4 Required Changes

#### 2.4.1 Data Model — Add `artist_id` to `CreateTransactionItemPayload`

```typescript
export interface CreateTransactionItemPayload {
    inventory_id?: string
    service_id?: string
    artist_id?: string      // ← NEW: who performed this service
    item_name: string
    quantity: number
    unit_price: number
    service_type?: ServiceType
    is_free?: boolean
}
```

`artist_id` is optional — if absent, falls back to `staff_id` (transaction-level staff).

#### 2.4.2 Database Schema — Add `artistId` to `transaction_items`

```typescript
// server/db/schema/transactions.ts
export const transactionItems = pgTable('transaction_items', {
    // ... existing columns
    artistId: text('artist_id'),  // ← NEW: who performed this service
})
```

#### 2.4.3 Payroll Creation Logic

In `server/actions/transactions.ts`, the payroll loop MUST use `item.artist_id ?? payload.staff_id`:

```typescript
for (const item of payload.items) {
    if (item.service_id) {
        const performerId = item.artist_id || payload.staff_id!
        const payrollResult = await calculateAndCreatePayrollEntry({
            transactionId: newTransaction.id,
            serviceId: item.service_id,
            staffId: performerId,               // ← per-item artist
            amount: item.quantity * item.unit_price,
            quantity: item.quantity,
            clientType: payload.client_type as ClientType | undefined,
            serviceType: item.service_type,
            paymentMethod: primaryPaymentMethod,
        })
    }
}
```

#### 2.4.4 UI — Per-Cart-Item Artist Selector in Checkout

The checkout modal MUST allow assigning an artist per SERVICE cart item:

```
Cart Panel (right side):
┌─────────────────────────────────────┐
│ Regular Tattoo ............... 500  │
│ Artist: [Select Artist _____ ▼]     │ ← per-service selector
│                                     │
│ Touch-up .................... 200   │
│ Artist: [Select Artist _____ ▼]     │ ← per-service selector
│                                     │
│ T-shirt ..................... 300   │
│ (no service)                        │ ← inventory item, no artist
│                                     │
│ Total: ........................1000 │
└─────────────────────────────────────┘
```

**UI Requirements:**
- Only show for cart items where `type === 'SERVICE'`
- Default each service's artist to the selected `staff_id` (checkout person)
- Allow changing per service
- Artist list source: staff, artists, and admin users with relevant capability flags

#### 2.4.5 CartItem Type Update

```typescript
// components/sales/context/SalesContext.tsx — CartItem interface
interface CartItem {
    id: string
    type: 'SERVICE' | 'INVENTORY'
    name: string
    unit_price: number
    quantity: number
    // ... existing fields
    artist_id?: string   // ← NEW: per-item artist assignment
}
```

#### 2.4.6 Appointment-Based Transactions (createTransactionFromAppointment)

In `server/actions/sales.ts`, appointments use `appointment.staffId` for all payroll entries. This is correct ONLY if the appointment has exactly one artist.

**Constraint:** Multi-artist appointment support is out of scope. For this fix, appointment → transaction conversion continues using `appointment.staffId`. The `appointment_services` table currently has no `artist_id` column (schema validation confirms this).

---

## 3. Issue #3: Services Not Visible in POS Without `services_manage` Flag

### 3.1 Observed Behavior

Users without the `services_manage` flag cannot see services in the POS sales interface. Per the requirements, **all users should be able to see and select services** — only catalog management (create/update/delete) should be gated.

### 3.2 Root Cause — Read-Only Action Gated by Write Permission

```typescript
// server/actions/services.ts — getServices
export async function getServices(options?) {
    const user = await getCurrentUser()
    if (!user) return failure('Not authenticated')

    const hasAccess = await canManageServices(user)  // ← WRONG
    if (!hasAccess) return failure('Access denied')
    // ... query logic
}
```

`getServices` is a **read-only** query used by:
- Sales POS (`SalesContext.tsx` line 365)
- Service selection UIs throughout the app

It is incorrectly gated behind `canManageServices` (which checks `services_manage`).

### 3.3 Required Change — Read Access = All Authenticated Users

```typescript
// getServices — read-only, available to all authenticated users
export async function getServices(options?: GetServicesOptions): Promise<ActionResponse<GetServicesResult>> {
    const user = await getCurrentUser()
    if (!user) return failure('Not authenticated')
    // ← NO permission check needed — read-only operation
    // ... business logic
}

// createService, updateService, deleteService — write operations
export async function createService(payload: CreateServicePayload): Promise<ActionResponse<ServiceWithItems>> {
    const user = await getCurrentUser()
    if (!user) return failure('Not authenticated')
    const hasAccess = await canManageServices(user)  // ← KEEP: write gated
    if (!hasAccess) return failure('Access denied')
    // ...
}
```

**Files requiring this change:**
- `server/actions/services.ts` — remove `canManageServices` from `getServices`, keep on `createService`, `updateService`, `deleteService`

### 3.4 Systemic Pattern — Feature Visibility vs Feature Management

The core principle: **System actions (read, view, select) should proceed regardless of flags. Direct edit/manage operations should be gated.**

This section audits every feature for compliance with this principle.

---

## 4. Comprehensive Feature-Visibility Audit

### 4.1 Principle Statement

> **If it's a system action (reading data, rendering a view, processing a transaction), it should go through. Only direct create/update/delete operations on the feature's core data should be stopped by access flags.**

### 4.2 Services

| Operation | Current Gate | Required Gate | Status |
|-----------|-------------|---------------|--------|
| `getServices` (read) | `canManageServices` | **None** (auth only) | ❌ **BUG** |
| `createService` | `canManageServices` | `canManageServices` | ✅ Correct |
| `updateService` | `canManageServices` | `canManageServices` | ✅ Correct |
| `batchUpdateServices` | `canManageServices` | `canManageServices` | ✅ Correct |
| `deleteService` | `canManageServices` | `canManageServices` | ✅ Correct |

### 4.3 Inventory

| Operation | Current Gate | Required Gate | Status |
|-----------|-------------|---------------|--------|
| `getInventory` (read) | `canManageInventory` | **None** (auth only) | ❌ **BUG** |
| `createItem` | `canManageInventory` | `canManageInventory` | ✅ Correct |
| `updateItem` | `canManageInventory` | `canManageInventory` | ✅ Correct |
| `deleteInventoryItem` | `canManageInventory` | `canManageInventory` | ✅ Correct |

**Justification:** Users need to see inventory items in POS to add them to a cart, even if they can't manage inventory.

### 4.4 Appointments

| Operation | Current Gate | Required Gate | Status |
|-----------|-------------|---------------|--------|
| Appointment list/view (read) | `canManageAppointments` | **None** (auth only) | ❌ **BUG** |
| `createAppointment` | `canManageAppointments` | `canManageAppointments` | ✅ Correct |
| `updateAppointment` | `canManageAppointments` | `canManageAppointments` | ✅ Correct |
| `cancelAppointment` | `canManageAppointments` | `canManageAppointments` | ✅ Correct |

**Justification:** POS needs to see unpaid appointments to check them out. Staff need to see their own appointments. The `getAppointments` equivalent in the system should not require manage permission.

### 4.5 Accounting

| Operation | Current Gate | Required Gate | Status |
|-----------|-------------|---------------|--------|
| Get ledger entries (read) | `canAccessAccounting` | `canAccessAccounting` | ✅ Correct |
| Create ledger entries | `canAccessAccounting` | `canAccessAccounting` | ✅ Correct |
| Transaction detail page | `canAccessAccounting` | `canAccessTransactions` | ❌ **WRONG FLAG** |

**Transaction Detail Bug:** `app/transactions/[id]/page.tsx` checks `canAccessAccounting` instead of `canAccessTransactions`. A user with `transactions_manage` flag cannot view transaction details. Fix: import and use `canAccessTransactions`.

### 4.6 Payroll

| Operation | Current Gate | Required Gate | Status |
|-----------|-------------|---------------|--------|
| `getPayroll` (manage) | `canManagePayroll` | `canManagePayroll` | ✅ Correct |
| `getMyPayroll` | `canViewOwnPayroll` | `canViewOwnPayroll` | ✅ Correct |
| Create manual payroll entry | `canManagePayroll` | `canManagePayroll` | ✅ Correct |

### 4.7 Time Clock

| Operation | Current Gate | Required Gate | Status |
|-----------|-------------|---------------|--------|
| Clock in/out (own) | Auth only | Auth only | ✅ Correct |
| Time clock admin | `canManageTimeClock` | `canManageTimeClock` | ✅ Correct |
| Get staff clock status | `canManageTimeClock` | `canManageTimeClock` | ✅ Correct |

### 4.8 Metrics

| Operation | Current Gate | Required Gate | Status |
|-----------|-------------|---------------|--------|
| View metrics | `canViewMetrics` | `canViewMetrics` | ✅ Correct |

### 4.9 Config/System Settings

| Operation | Current Gate | Required Gate | Status |
|-----------|-------------|---------------|--------|
| View config | `canManageSystemConfig` | `canManageSystemConfig` | ✅ Correct |
| Update config | `canManageSystemConfig` | `canManageSystemConfig` | ✅ Correct |

### 4.10 Users/Accounts

| Operation | Current Gate | Required Gate | Status |
|-----------|-------------|---------------|--------|
| List users | `canManageUsers` | `canManageUsers` | ✅ Correct |
| Edit user | `canManageUsers` | `canManageUsers` | ✅ Correct |
| Create user | Admin only | Admin only | ✅ Correct |

### 4.11 Action-File Gate Audit

| Server Action File | Lines Using Wrong Gate | Required Fix |
|-------------------|----------------------|--------------|
| `services.ts:65` | `getServices` → `canManageServices` | Remove gate (auth-only) |
| `inventory.ts` (verify) | `getInventory` → `canManageInventory` | Remove gate (auth-only) |
| `appointments.ts` (verify) | Appointment list → `canManageAppointments` | Remove gate for reads |

---

## 5. Page Guard Audit (Defense in Depth)

### 5.1 Current State

All major page routes have been verified to include server-side guards in their `page.tsx`:

| Page | Guard | Correct? |
|------|-------|----------|
| `/sales` | `canAccessTransactions` | ✅ |
| `/transactions` | `canAccessTransactions` | ✅ |
| `/transactions/[id]` | `canAccessAccounting` | ❌ Wrong flag (should be `canAccessTransactions`) |
| `/inventory` | `canManageInventory` | ✅ |
| `/accounting` | `canAccessAccounting` | ✅ |
| `/payroll` | `canManagePayroll` | ✅ |
| `/my-payroll` | `canViewOwnPayroll` | ✅ |
| `/appointments` | `canManageAppointments` | ✅ |
| `/accounts` | `canManageUsers` | ✅ |
| `/config` | `canManageSystemConfig` | ✅ |
| `/notify` | `canSendNotifications` | ✅ |
| `/metrics` | `canViewMetrics` | ✅ |
| `/unauthorized` | None (public) | ✅ |
| `/calendar` | Auth only | ✅ |
| `/my-time-clock` | Auth only | ✅ |
| `/admin/branches` | `canManageBranches` | ✅ |

### 5.2 Required Fix

**`app/transactions/[id]/page.tsx` line 2:**
```typescript
// OLD:
import { getCurrentUser, canAccessAccounting } from "@/utils/auth/permissions"
// NEW:
import { getCurrentUser, canAccessTransactions } from "@/utils/auth/permissions"

// Also fix the check:
const canManage = user ? await canAccessTransactions(user) : false
```

### 5.3 Middleware

Current middleware correctly handles:
- Authentication (redirects unauthenticated users to `/auth`)
- Admin role bypass (admins can access everything)
- Special `"admin"` perms (admin role only for branches)
- Route visibility via page guards

**Gap:** Middleware does NOT perform granular flag checks for non-admin users. It relies entirely on page guards and server actions. This is acceptable as defense-in-depth since page guards and server actions enforce separately. However, adding middleware-level flag queries would improve security.

**Recommendation:** For this spec, keep middleware as-is (defers to page guards). Future spec can add middleware DB queries for true full-stack enforcement.

---

## 6. Server Action Guard Audit

### 6.1 Current State

| Action File | Guard Pattern | Status |
|------------|---------------|--------|
| `transactions.ts` | `canAccessTransactions` | ✅ |
| `payroll.ts` | `canManagePayroll` | ✅ |
| `time-clock.ts` | `canManageTimeClock` | ✅ |
| `services.ts` (writes) | `canManageServices` | ✅ |
| `services.ts` (getServices) | `canManageServices` | ❌ Remove |
| `inventory.ts` (writes) | `canManageInventory` | ✅ |
| `inventory.ts` (getInventory) | `canManageInventory` | ❌ Remove |
| `profile.ts` | `isAdmin` for user management | ✅ |

### 6.2 All Functions Are Async (Note)

All permission functions in `permissions.ts` are declared `async` even though they wrap synchronous `userHasFlag()` calls. This is technically unnecessary but harmless — `async` functions return a Promise. The `canAccessTransactions` call in `sales/page.tsx` correctly uses `await`. No changes needed.

---

## 7. Sidebar Visibility Audit

### 7.1 Current State

The sidebar filtering logic in `components/sidebar.tsx` (line 110-122) correctly uses `normalizeFlag` for backward compatibility:

```typescript
const filteredRoutes = useMemo(() => {
    return routes.filter((route) => {
        if (route.perms.length > 0) {
            if (userInfo.role === "admin") return true
            const hasFlag = userInfo.access_flags?.some(
                (f) => normalizeFlag(f) === normalizeFlag(route.perms)
            )
            if (!hasFlag) return false
        }
        return true
    })
}, [routes, userInfo.access_flags, userInfo.role])
```

**Status:** ✅ Correct. No changes needed.

---

## 8. Security Constraints

### 8.1 Flag Toggle Security

- Only admins may toggle flags (already enforced by `disabled={!isAdmin}` on checkboxes)
- Only admins may change user roles (already enforced)
- Self-downgrade prevention: admins cannot remove their own admin role (already implemented)

### 8.2 Save-Time Validation

All flag writes to `user.accessFlags` MUST:
1. Normalize via `normalizeFlag()` — resolve old names
2. Deduplicate via `new Set()`
3. Validate via `isValidAccessFlag()` — reject unknown flags
4. Only proceed if caller is admin (already done in `updateProfile`)

### 8.3 Artist Assignment Security

- Any authenticated staff user can be assigned as an artist/receiver
- No special flag required for receiving cuts (it's a payroll operation)
- The `staff_id` (checkout processor) MUST still be authenticated and have `transactions_manage` flag

### 8.4 Service Visibility Security

- Removing the `canManageServices` gate from `getServices` does NOT expose write capabilities
- Write operations (`createService`, `updateService`, `deleteService`) remain gated
- All authenticated users see services — this is a design choice, not a vulnerability

---

## 9. Implementation Boundaries

### 9.1 In Scope (This Spec)

| # | Issue | Files | Priority |
|---|-------|-------|----------|
| 1 | Fix `toggleFlag` normalization | `app/accounts/[id]/page.tsx` | P0 |
| 2 | Add save-time flag normalization | `server/actions/profile.ts` | P0 |
| 3 | Add `artist_id` to `CreateTransactionItemPayload` | `utils/types/transactions.ts` | P0 |
| 4 | Add `artistId` to `transaction_items` schema | `server/db/schema/transactions.ts` + migration | P0 |
| 5 | Add per-item artist selector UI | `components/sales/modals/CheckoutModal.tsx`, `components/sales/context/SalesContext.tsx` | P0 |
| 6 | Update payroll creation to use per-item `artist_id` | `server/actions/transactions.ts` | P0 |
| 7 | Remove `canManageServices` from `getServices` | `server/actions/services.ts` | P0 |
| 8 | Verify/remove `canManageInventory` from `getInventory` | `server/actions/inventory.ts` | P1 |
| 9 | Fix `transactions/[id]` wrong permission flag | `app/transactions/[id]/page.tsx` | P1 |
| 10 | Add flag validation to `UpdateUserProfileSchema` | `server/actions/profile.ts` | P1 |

### 9.2 Out of Scope (Future Specs)

- Multi-artist appointment support (artist per `appointment_services` row)
- Middleware-level DB flag queries for non-admin users
- RBAC (role-based access control) redesign
- Temporary/expiring access flags
- Audit log for individual flag changes

### 9.3 Migration Strategy

- **Flag normalization on save** (Item 2) handles old → new name migration automatically as admins edit users
- **`artist_id` column** in `transaction_items` requires a DB migration (`drizzle push` or manual ALTER TABLE)
- **Existing transactions** with service items already have payroll entries tied to `staff_id`. No backfill needed — new transactions will use `artist_id` when provided

---

## 10. Acceptance Criteria

1. **Toggle flags work correctly for all users.** Old flag names are removed when unchecked; new names are added when checked. Toggle on → save → reload shows correct state.
2. **Old flag names are normalized on save.** Any legacy flag name saved through `updateProfile` is automatically converted to canonical name.
3. **Per-service artist assignment works.** Checkout modal shows artist selector for each service cart item.
4. **Payroll entries use the correct artist.** Each service's payroll entry credits the artist assigned to that service item, falling back to `staff_id`.
5. **Services are visible in POS without `services_manage` flag.** Any authenticated user can see and select services.
6. **Inventory is visible in POS without `inventory_manage` flag.** Any authenticated user can see and select inventory.
7. **Transaction detail page uses correct permission.** `canAccessTransactions` instead of `canAccessAccounting`.
8. **No duplicate, unknown, or unmigrated flag names are saved.** The `updateProfile` function normalizes and validates.
9. **Sidebar filtering remains correct.** Uses `normalizeFlag` consistently.

---

## Appendix A: File Change Summary

| File | Change | Priority |
|------|--------|----------|
| `app/accounts/[id]/page.tsx` | Fix `toggleFlag` normalization (Section 1.3) | P0 |
| `server/actions/profile.ts` | Add flag normalization + validation on save (Section 1.4-1.5) | P0 |
| `utils/types/transactions.ts` | Add `artist_id` to `CreateTransactionItemPayload` (Section 2.4.1) | P0 |
| `server/db/schema/transactions.ts` | Add `artistId` column (Section 2.4.2) | P0 |
| `server/actions/transactions.ts` | Use `item.artist_id ?? payload.staff_id` in payroll loop (Section 2.4.3) | P0 |
| `components/sales/context/SalesContext.tsx` | Add `artist_id` to `CartItem`, add per-item artist state (Section 2.4.5) | P0 |
| `components/sales/modals/CheckoutModal.tsx` | Add per-cart-item artist selector UI (Section 2.4.4) | P0 |
| `components/sales/layout/CartPanel.tsx` | Render per-item artist selector (Section 2.4.4) | P0 |
| `server/actions/services.ts` | Remove `canManageServices` from `getServices` (Section 3.3) | P0 |
| `server/actions/inventory.ts` | Remove `canManageInventory` from `getInventory` (Section 4.3) | P1 |
| `app/transactions/[id]/page.tsx` | Fix wrong permission check (Section 5.2) | P1 |
| DB migration | Add `artist_id` column to `transaction_items` | P0 |

## Appendix B: Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       CHECKOUT FLOW (Fixed)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐ │
│ │  Cart (items) │    │  CheckoutModal   │    │ createTransaction│ │
│ │              │───▶│                  │───▶│                 │ │
│ │ Service A    │    │  Staff: [User 1] │    │ staff_id = User1│ │
│ │  artist: U2  │    │  ─────────────── │    │ items:          │ │
│ │ Service B    │    │  Service A       │    │  - svc A:       │ │
│ │  artist: U3  │    │   Artist: [U2 ▼] │    │    artist_id:U2 │ │
│ │ T-shirt      │    │  Service B       │    │  - svc B:       │ │
│ │              │    │   Artist: [U3 ▼] │    │    artist_id:U3 │ │
│ └──────────────┘    │  ─────────────── │    └────────┬────────┘ │
│                     │  Total: $1000    │             │          │
│                     └──────────────────┘             ▼          │
│                                              ┌─────────────────┐ │
│                                              │ Payroll Entries │ │
│                                              │                 │ │
│                                              │ User 2 ← $ cut  │ │
│                                              │ User 3 ← $ cut  │ │
│                                              └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLAG TOGGLE FLOW (Fixed)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌──────────────┐    1. Normalize both current & target flag      │
│ │  User DB     │    ─────────────────────────────                 │
│ │  flags:      │    toggleFlag('services_manage')                │
│ │  ['services']│       → canonicalFlag = 'services_manage'      │
│ └──────┬───────┘       → normalizedCurrent = ['services_manage'] │
│        │               → isActive = true (yes, it's checked)    │
│        │               → filter out ALL matching variants        │
│        ▼               → new flags = []                         │
│ ┌──────────────┐    2. Save via updateProfile                    │
│ │  User DB     │       → normalize each flag                     │
│ │  flags: []   │       → deduplicate, validate                   │
│ └──────────────┘       → store canonical names only              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Appendix C: Dependency Chain

```
Toggle Flag Fix
  ├── app/accounts/[id]/page.tsx (toggleFlag normalization)
  └── server/actions/profile.ts (save-time normalization)

Service Visibility Fix
  └── server/actions/services.ts (remove gate from getServices)

Inventory Visibility Fix
  └── server/actions/inventory.ts (remove gate from getInventory)

Cut Distribution Fix
  ├── utils/types/transactions.ts (artist_id field)
  ├── server/db/schema/transactions.ts (artistId column)
  ├── DB migration
  ├── server/actions/transactions.ts (per-item artist lookup)
  ├── components/sales/context/SalesContext.tsx (CartItem.artist_id)
  ├── components/sales/modals/CheckoutModal.tsx (per-item selector)
  └── components/sales/layout/CartPanel.tsx (render selector)

Wrong Permission Fix
  └── app/transactions/[id]/page.tsx (canAccessAccounting → canAccessTransactions)
```
