# Task 6: Accounts Page Rework - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Accounts page from inline editing modals to a dedicated detail page with tabbed interface and add Payment Methods management.

**Architecture:** Create a new route `/accounts/[id]` for user detail pages with 4 tabs (Main Info, Access & Work, Schedule, Payment Methods). Update the list view to navigate to this new route instead of opening modals.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, Motion (animations), Lucide React icons

---

## Task 1: Add Payment Method Types

**Files:**
- Modify: `utils/types/payroll.ts`

**Step 1: Add PaymentMethodDB type** (based on schema)

```typescript
// User Payment Method (from payment_method table)
export interface UserPaymentMethod {
    id: string
    created_at: Date
    updated_at?: Date
    user_id: string
    type: 'CASH' | 'GCASH' | 'MAYA' | 'BANK'
    provider?: string
    account_name?: string
    account_number?: string
    is_default: boolean
    is_active: boolean
}

export interface CreatePaymentMethodPayload {
    user_id: string
    type: 'CASH' | 'GCASH' | 'MAYA' | 'BANK'
    provider?: string
    account_name?: string
    account_number?: string
    is_default?: boolean
}

export interface UpdatePaymentMethodPayload {
    type?: 'CASH' | 'GCASH' | 'MAYA' | 'BANK'
    provider?: string
    account_name?: string
    account_number?: string
    is_default?: boolean
    is_active?: boolean
}
```

**Step 2: Run lint to verify types**

Run: `bun run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add utils/types/payroll.ts
git commit -m "feat: add payment method types for user accounts"
```

---

## Task 2: Create Payment Method API Stubs

**Files:**
- Create: `app/api/actions/payment-methods.ts`

**Step 1: Create the file with stubbed functions**

```typescript
'use server'

// TODO: Migrate to Drizzle in Task 7
import { createLogs } from "./logs"
import { UserPaymentMethod, CreatePaymentMethodPayload, UpdatePaymentMethodPayload } from "@/utils/types/payroll"

console.warn('Supabase disabled - payment-methods.ts stubbed')

export async function getUserPaymentMethods(userId: string): Promise<UserPaymentMethod[]> {
    console.warn('Supabase disabled - getUserPaymentMethods stubbed')
    return [] as UserPaymentMethod[]
}

export async function createPaymentMethod(
    userId: string, 
    payload: CreatePaymentMethodPayload
): Promise<{ success: boolean; data?: UserPaymentMethod; error?: string }> {
    console.warn('Supabase disabled - createPaymentMethod stubbed')
    return { success: false, error: "Not implemented" }
}

export async function updatePaymentMethod(
    methodId: string,
    userId: string,
    payload: UpdatePaymentMethodPayload
): Promise<{ success: boolean; error?: string }> {
    console.warn('Supabase disabled - updatePaymentMethod stubbed')
    return { success: false, error: "Not implemented" }
}

export async function deletePaymentMethod(
    methodId: string,
    userId: string
): Promise<{ success: boolean; error?: string }> {
    console.warn('Supabase disabled - deletePaymentMethod stubbed')
    return { success: false, error: "Not implemented" }
}

export async function setDefaultPaymentMethod(
    methodId: string,
    userId: string
): Promise<{ success: boolean; error?: string }> {
    console.warn('Supabase disabled - setDefaultPaymentMethod stubbed')
    return { success: false, error: "Not implemented" }
}
```

**Step 2: Run lint to verify**

Run: `bun run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add app/api/actions/payment-methods.ts
git commit -m "feat: add payment method API stubs"
```

---

## Task 3: Update Users List for Navigation

**Files:**
- Modify: `app/accounts/usersList.tsx`

**Step 1: Add import for navigation**

Add to imports:
```typescript
import { useRouter } from "next/navigation"
```

**Step 2: Remove modal states and add router**

Remove these state declarations:
- `selectedUser`
- `scheduleUser` (move to detail page)

Add inside component:
```typescript
const router = useRouter()
```

**Step 3: Update the onEdit handler to navigate**

Change:
```typescript
onEdit={setSelectedUser}
```

To:
```typescript
onEdit={(user) => router.push(`/accounts/${user.id}`)}
```

**Step 4: Remove EditUserModal and ScheduleEditor modals**

Remove these from AnimatePresence:
- EditUserModal
- ScheduleEditor

Keep:
- DeleteUserModal
- RestoreUserModal

**Step 5: Update UserRow onSchedule handler**

Remove onSchedule from UserTable and UserRow props since schedule is now in detail page. Remove the schedule button from UserRow.

**Step 6: Run lint**

Run: `bun run lint`
Expected: PASS

**Step 7: Commit**

```bash
git add app/accounts/usersList.tsx
git commit -m "refactor: update users list to navigate to detail page"
```

---

## Task 4: Update UserRow Component

**Files:**
- Modify: `components/accounts/UserRow.tsx`

**Step 1: Remove schedule-related props and button**

Remove from interface:
- `onSchedule: (user: UserProfile) => void`

Remove the CalendarClockIcon button and its import.

**Step 2: Update the Actions cell**

Keep only Edit and Delete buttons for active users, Restore for inactive.

**Step 3: Run lint**

Run: `bun run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add components/accounts/UserRow.tsx
components/accounts/UserTable.tsx
git commit -m "refactor: remove schedule button from user row"
```

---

## Task 5: Create Payment Methods Component

**Files:**
- Create: `components/accounts/PaymentMethods.tsx`

**Step 1: Create component with CRUD operations**

Features needed:
- Display list of payment methods
- Add new payment method (form)
- Edit existing payment method
- Delete payment method
- Set default payment method
- Obfuscate account numbers (show only last 4 digits)
- Toggle visibility of full account number

**Step 2: Implement the component**

Structure:
- Header with "Add Method" button
- List of payment method cards
- Each card shows: type icon, provider/name, masked account number, default badge, action buttons
- Form modal for add/edit with fields: type (select), provider (text), account name (text), account number (text), is_default (checkbox)

**Step 3: Implement obfuscation logic**

```typescript
function maskAccountNumber(number: string): string {
    if (!number || number.length <= 4) return number
    return '•'.repeat(number.length - 4) + number.slice(-4)
}
```

**Step 4: Run lint**

Run: `bun run lint`
Expected: PASS

**Step 5: Commit**

```bash
git add components/accounts/PaymentMethods.tsx
git commit -m "feat: add payment methods component with CRUD and obfuscation"
```

---

## Task 6: Create User Detail Page

**Files:**
- Create: `app/accounts/[id]/page.tsx`

**Step 1: Create the page structure**

Features:
- Fetch user profile by ID
- 4 tabs: Main Info, Access & Work, Schedule, Payment Methods
- Tab navigation with motion animation
- Back button to return to list
- Loading state

**Step 2: Implement Main Info Tab**

Fields:
- Avatar (with upload placeholder)
- Full Name (editable)
- Email (editable)
- Phone Number (editable)
- Password reset (for admin)

**Step 3: Implement Access & Work Tab**

Fields:
- Role (select: ADMIN, STAFF, ARTIST, PIERCER, SHOE_TECH, CLIENT)
- Access Flags (checkboxes based on routes)
- Capabilities (checkboxes for admin hybrid roles)
- Artist Level (select: NORMAL, HEAD_ARTIST, OWNER)
- Payout Period (select: DAILY, WEEKLY, BIMONTHLY, MONTHLY)

**Step 4: Implement Schedule Tab**

Embed the existing ScheduleEditor component inline or adapted for the tab view.

**Step 5: Implement Payment Methods Tab**

Use the PaymentMethods component created in Task 5.

**Step 6: Run lint**

Run: `bun run lint`
Expected: PASS

**Step 7: Commit**

```bash
git add app/accounts/[id]/page.tsx
git commit -m "feat: create user detail page with tabbed interface"
```

---

## Task 7: Update UserTable Component

**Files:**
- Modify: `components/accounts/UserTable.tsx`

**Step 1: Remove onSchedule prop**

Remove from interface:
- `onSchedule: (user: UserProfile) => void`

**Step 2: Remove onSchedule from UserRow props**

**Step 3: Run lint**

Run: `bun run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add components/accounts/UserTable.tsx
git commit -m "refactor: remove onSchedule prop from user table"
```

---

## Task 8: Final Verification and Testing

**Step 1: Run full lint**

Run: `bun run lint`
Expected: PASS

**Step 2: Run typecheck (if available)**

Check if there's a typecheck command in package.json.

**Step 3: Manual verification checklist**

- [ ] List view shows users with Edit button
- [ ] Clicking Edit navigates to /accounts/[id]
- [ ] Detail page has 4 tabs
- [ ] Main Info tab loads user data
- [ ] Access & Work tab shows role/flags
- [ ] Schedule tab shows weekly schedule
- [ ] Payment Methods tab shows component
- [ ] Back button returns to list

**Step 4: Final commit**

```bash
git commit -m "feat: complete Task 6 - accounts page rework with tabbed detail view"
```

---

## Summary of Changes

**Files Created:**
1. `app/accounts/[id]/page.tsx` - Detail page with tabs
2. `components/accounts/PaymentMethods.tsx` - Payment methods CRUD component
3. `app/api/actions/payment-methods.ts` - API stubs

**Files Modified:**
1. `utils/types/payroll.ts` - Added payment method types
2. `app/accounts/usersList.tsx` - Updated to navigate instead of modal
3. `components/accounts/UserRow.tsx` - Removed schedule button
4. `components/accounts/UserTable.tsx` - Removed onSchedule prop

**UI Flow:**
- `/accounts` → List view with Edit button
- `/accounts/[id]` → Detail page with 4 tabs
- Tabs: Main Info | Access & Work | Schedule | Payment Methods
