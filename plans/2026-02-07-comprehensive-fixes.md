# Comprehensive Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical bugs in Config and Calendar pages, implement Maintenance Mode, remove Booking Constraints, and standardize UI buttons.

**Architecture:**
- **Maintenance Mode:** Implement server-side setting fetch in `RootLayout` and enforce in `Sidebar` (Client Component) to block access for non-admins.
- **Config/Calendar:** Refactor `user_role` to `role` to match new schema. Remove obsolete Booking Constraints code.
- **UI:** Introduce a reusable `Button` component to replace inconsistent hardcoded styles.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Lucide React.

---

### Task 1: Fix Config Page (Restock Recipients & Remove Booking Constraints)

**Files:**
- Modify: `app/config/configPage.tsx`
- Modify: `utils/types/settings.ts`

**Step 1: Remove Booking Constraints UI and State**
- Remove `bookingConstraints` state and `BookingConstraintsValue` usage.
- Remove the "Booking Constraints" UI section (approx lines 1091-1153).
- Remove `booking_constraints` from `fetchSettings` switch case.

**Step 2: Fix Restock Alert Recipients**
- Replace `user_role` with `role` in the filter and map function (approx lines 798-843).
- Ensure role comparison is case-insensitive or matches `UserRoleType` (lowercase).
  - *Note:* `UserRoleType` is lowercase (`admin`, `staff`), but existing code checks `"ADMIN"`. Update checks to `userInfo.role === 'admin'`.

### Task 2: Implement Maintenance Mode

**Files:**
- Modify: `app/api/actions/settings.ts`
- Modify: `app/layout.tsx`
- Modify: `components/sidebar.tsx`

**Step 1: Implement `getSetting` server action**
- In `app/api/actions/settings.ts`, implement `getSetting<K>` to fetch a single setting by key from DB.

**Step 2: Fetch Maintenance Mode in RootLayout**
- In `app/layout.tsx`, make `RootLayout` async.
- Call `await getSetting("maintenance_mode")`.
- Pass the result as a prop to `Sidebar`.

**Step 3: Enforce in Sidebar**
- Update `Sidebar` props interface to include `maintenanceMode`.
- Fix existing LSP errors in `Sidebar` (prop mismatch `____groupKey` vs `groupKey`).
- In `Sidebar`, check if `maintenanceMode?.enabled` is true.
- If true and `userInfo.role !== 'admin'`, return a "Maintenance Mode" full-screen overlay instead of the app content.
  - Overlay should show `maintenanceMode.message`.

### Task 3: Fix Calendar Page TS Errors

**Files:**
- Modify: `app/calendar/calendarPage.tsx`

**Step 1: Fix `user_role` to `role`**
- Find all instances of `userInfo.user_role`.
- Replace with `userInfo.role`.
- Update string comparisons to lowercase (e.g., `=== "admin"` instead of `"ADMIN"`).

### Task 4: Standardize Buttons

**Files:**
- Create: `components/ui/button.tsx`
- Modify: `app/config/configPage.tsx`
- Modify: `app/calendar/calendarPage.tsx`

**Step 1: Create Button Component**
- Create a `Button` component using Tailwind.
- Support variants: `default` (blue), `destructive` (red), `outline`, `ghost`.
- Support sizes: `sm`, `md`, `lg`, `icon`.
- Include `loading` state support (spinner).

**Step 2: Refactor Config Page Buttons**
- Replace hardcoded `<button>` tags with `<Button>` component.
- Example: "Save Service", "Delete", "Edit", "Save Settings".

**Step 3: Refactor Calendar Page Buttons**
- Replace hardcoded `<button>` tags with `<Button>` component.

### Task 5: Quality Assurance

**Files:**
- Run: `bun run lint`
- Run: `bun run build`

**Step 1: Fix Lint Errors**
- Run `bun run lint` and fix any remaining issues (unused imports, any types, etc.).

**Step 2: Verify Build**
- Run `bun run build` and ensure it completes successfully.

