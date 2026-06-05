# Comprehensive Inksight RDMD Update Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Implement a comprehensive set of updates across Dashboard, Appointments, Inventory, Accounting, Payroll, Sales, Staff, Config, and Notify modules to improve usability, fix bugs, and streamline workflows.

**Architecture:** 
Updates will primarily involve modifying React Client Components for UI/UX changes and Server Actions/Drizzle Schema for backend logic. Key architectural changes include moving Appointment details to a separate page, removing "Pending" appointment status logic, and adding "Show in Sales" flag to Inventory.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Drizzle ORM, Supabase.

---

### Task 1: Database & Type Updates (Inventory)

**Files:**
- Modify: `server/db/schema/inventory.ts`
- Modify: `utils/types/inventory.ts`
- Modify: `app/api/actions/inventory.ts`

**Step 1: Add `showInSales` column to inventory schema**
- Add `showInSales` boolean column to `inventory` table in `server/db/schema/inventory.ts`. Default to `true`.

**Step 2: Update TypeScript types**
- Update `InventoryItem` interface in `utils/types/inventory.ts` to include `show_in_sales?: boolean`.
- Update `CreateInventoryItemPayload` if necessary.

**Step 3: Update Server Actions**
- Update `getInventory` in `app/api/actions/inventory.ts` to map `showInSales` to `show_in_sales`.
- Update `createInventoryItem` and `updateInventoryItem` to handle the new field.

---

### Task 2: Dashboard Updates

**Files:**
- Modify: `app/dashboardClient.tsx`

**Step 1: Remove unused Quick Actions**
- Remove "Book Now", "3D Playground", "Message" buttons from both `StaffDashboard` and `AdminDashboard`.
- Keep "Walk-in", "Gallery", "Inventory" (for Admin).

**Step 2: Remove "Appointment Requests" sections**
- Remove the "Appointment Requests" widget/column from the grid.
- Adjust grid layout to fill the space (likely span "Upcoming Appointments" or "Inventory Alerts" to fill).

**Step 3: Fix Dashboard Layout Overflow**
- Modify the main container `div` (line 153 and 342) to ensure it allows `overflow-y-auto` and isn't constrained to exactly `100vh` if content overflows. Remove `h-full` or `max-h-full` constraints where they force clipping.

---

### Task 3: Appointment System Overhaul

**Files:**
- Modify: `app/api/actions/appointments.ts`
- Modify: `app/appointments/appointmentsPage.tsx`
- Create: `app/appointments/[id]/page.tsx` (New Page)
- Create: `app/appointments/appointmentDetailClient.tsx` (New Client Component)

**Step 1: Update Appointment Status Logic**
- in `app/api/actions/appointments.ts`, ensure `createAppointment` defaults status to `CONFIRMED` instead of `PENDING` (if not already).
- Remove any logic that creates "requests".

**Step 2: Create Appointment Detail Page**
- Create `app/appointments/[id]/page.tsx` that receives `params.id`.
- Create `app/appointments/appointmentDetailClient.tsx` to display the appointment details (move logic from the "right side" of `appointmentsPage.tsx`).

**Step 3: Update Appointments Page List**
- In `app/appointments/appointmentsPage.tsx`:
    - Remove the split-view layout (List + Details).
    - Make the list take full width.
    - Change clicking an appointment to navigate to `/appointments/[id]`.
    - Remove "Scan Client Code" button and `AztecScanner` component.
    - Remove "Request New Appointment" empty state.
    - Improve filtering/display (use a table or cleaner card grid).

**Step 4: Update Dashboard Links**
- Ensure Dashboard "Upcoming Appointments" click navigates to `/appointments/[id]` (it already does via `href="/appointments/?id=..."`, change to `/appointments/[id]`).

---

### Task 4: Inventory System Enhancements

**Files:**
- Modify: `app/inventory/inventoryPage.tsx`
- Modify: `components/inventory/InventoryTable.tsx` (if exists, or inline table)
- Modify: `components/inventory/RestockModal.tsx`

**Step 1: Add "Show in Sales" Toggle**
- In `InventoryTable` (or `inventoryPage.tsx`), add a column/toggle for `show_in_sales`.
- Connect to `updateInventoryItem` action.

**Step 2: Add "Request Restock" Button**
- Add "Request Restock" button to the header or row actions.
- Connect to `requestInventoryRestock` action (already exists).

**Step 3: Fix Export Dropdown**
- Change the current 3 separate buttons (CSV, Excel, PDF) into a single "Download" icon button that opens a dropdown menu with the options.

**Step 4: Add "Apparel" Category**
- In `inventoryPage.tsx` (or where categories are defined), add "Apparel" to the list of categories.
- Ensure type definitions allow "Apparel" (might need to update `utils/types/inventory.ts`).

**Step 5: Fix Restock Modal**
- Review `components/inventory/RestockModal.tsx` and `restockInventoryItemWithAccounting`.
- Ensure file upload works (check `react-dropzone` usage).
- Ensure "Proof URL" is correctly saved and displayed in Accounting if needed.

---

### Task 5: Accounting & Payroll Fixes

**Files:**
- Modify: `app/accounting/accountingPage.tsx`
- Modify: `app/payroll/payrollPage.tsx`
- Modify: `app/payroll/ratesTab.tsx` (if exists, or inline)

**Step 1: Fix Accounting "Proof URL does not exist"**
- In `app/accounting/accountingPage.tsx`, check where `proofLink` or `proofUrl` is accessed on ledger entries.
- Ensure the property matches the API response from `getLedgerEntries`.

**Step 2: Payroll Rate Configuration**
- In `app/payroll/payrollPage.tsx` (Rates Tab), verify `rates` are being fetched and displayed.
- Ensure "Edit" and "Add" (if applicable) logic works. If "Rate Configuration empty", check if `getStaffRates` returns data.
- Fix CRUD logic for rates.

---

### Task 6: Staff/Accounts Enhancements

**Files:**
- Modify: `app/accounts/usersList.tsx`
- Modify: `app/accounts/UserFilters.tsx` (if exists)
- Modify: `components/accounts/UserTable.tsx`

**Step 1: Add "Invite User" & "Create User"**
- Add buttons for "Invite User" (send email) and "Create User" (manual creation) in `UsersList` header.
- Implement the modals/forms for these actions (using `createProfile` or similar actions).

**Step 2: Change Actions to Dropdown**
- In `UserTable.tsx`, change the individual action buttons (Edit, Delete, etc.) to a single "Actions" (three dots) dropdown menu.

**Step 3: Verify CRUD**
- Ensure Create, Read, Update, Delete/Deactivate works for users.

---

### Task 7: Config & Notify Updates

**Files:**
- Modify: `app/config/configPage.tsx`
- Modify: `app/notify/notifyPage.tsx`

**Step 1: Fix Config Infinite Loop**
- In `app/config/configPage.tsx`, refactor `fetchSettings` and `useEffect` to prevent infinite re-fetching.
- Likely remove `fetchSettings` from `useEffect` dependency array or use a ref to track initialization.

**Step 2: Remove In-App Notifications**
- In `app/notify/notifyPage.tsx`, remove the "Channel" toggle (Email vs In-App).
- Remove all `in-app` related logic and UI. Keep only Email and Batch Email.

---

### Task 8: System-Wide Verification

**Files:**
- Verify: `app/sales/salesPage.tsx`
- Verify: `app/metrics/page.tsx`
- Verify: `app/api/actions/*.ts`

**Step 1: Sales CRUD**
- Review `SalesPage` logic for adding/removing items to cart, checkout, etc.

**Step 2: Metrics Page**
- Check `app/metrics/page.tsx` for loading errors.

**Step 3: API Actions**
- General code review of `app/api/actions` to ensure consistent CRUD patterns and error handling.

---
