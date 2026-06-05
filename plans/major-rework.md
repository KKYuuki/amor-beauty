# Major System Rework & Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Streamline the system by removing unused features (realtime, storage, messaging), migrating backend to Drizzle+Better-Auth, and enhancing core business modules (Accounting, Inventory, Payroll).

**Architecture:** 
- **Backend:** PostgreSQL (via Drizzle ORM) + Better-Auth (Auth)
- **Frontend:** Next.js 15 App Router + Server Actions
- **State:** React Query (recommended for data fetching replacement of Supabase subscriptions) or simple Server Actions + `useActionState`

**Tech Stack:** Drizzle ORM, Better-Auth (Passkey, 2FA), PostgreSQL, Tailwind v4, React 19

---

### Task 1: Environment & Dependency Setup

**Files:**
- Modify: `package.json`
- Create: `drizzle.config.ts`
- Create: `server/db/index.ts`
- Create: `server/auth.ts`

**Step 1: Install Dependencies**
Remove `@supabase/*`.
Add `drizzle-orm`, `drizzle-kit`, `better-auth`, `pg` (or `@neondatabase/serverless`), `dotenv`.

**Step 2: Configure Drizzle**
Create `drizzle.config.ts` pointing to `server/db/schema.ts`.

**Step 3: Setup Database Connection**
Initialize Drizzle client in `server/db/index.ts`.

**Step 4: Setup Better-Auth**
Initialize Better-Auth in `server/auth.ts` with plugins:
- `passkey`
- `twoFactor`
- `admin`

---

### Task 2: Schema Migration (Supabase -> Drizzle)

**Files:**
- Create: `server/db/schema.ts`
- Create: `server/db/schema/auth.ts` (Better-Auth tables)
- Create: `server/db/schema/accounting.ts`
- Create: `server/db/schema/inventory.ts`
- Create: `server/db/schema/payroll.ts`

**Step 1: Define Auth Schema**
Implement Better-Auth required tables (User, Session, Account, Verification).
Add custom columns to User: `access_flags`, `user_role`, `artist_level`, `payout_period`.

**Step 2: Define Accounting Schema**
Port `general_ledger` table.
Create new `accounting_categories` table (id, name, type, is_active).

**Step 3: Define Inventory Schema**
Port `inventory` table.
Add `restock_logs` table (id, item_id, quantity, cost, invoice_no, proof_link, created_at).

**Step 4: Define Payroll Schema**
Port `payroll_staff_rates`, `payroll_entries`, `payroll_requests`.
Create `payment_methods` table (id, user_id, type, provider, account_name, account_number, is_default).

**Step 5: Generate & Push**
Run `drizzle-kit generate` and `drizzle-kit push` (or migrate).

---

### Task 3: Cleanup & Removal

**Files:**
- Delete: `utils/supabase/*`
- Delete: `app/messages`
- Delete: `app/images`
- Delete: `app/share`
- Delete: `components/messages`
- Delete: `app/api/actions/messages.ts`
- Delete: `app/api/actions/storage.ts`
- Modify: `app/layout.tsx` (Remove Supabase providers)

**Step 1: Remove Realtime/Storage Dependencies**
Delete all files relying on `supabase-js` realtime or storage.

**Step 2: Remove Pages**
Delete Messages, Images, Share routes.

**Step 3: Clean Layout**
Remove `AuthProvider` (Supabase version) from root layout.

---

### Task 4: Auth Implementation (Better-Auth)

**Files:**
- Create: `components/auth/SignIn.tsx`
- Create: `app/auth/page.tsx` (Update)
- Modify: `middleware.ts` (Update protection logic)
- Create: `lib/auth-client.ts`

**Step 1: Client Setup**
Create `lib/auth-client.ts` using `createAuthClient`.

**Step 2: Sign In Page**
Reimplement Sign In with Better-Auth (Email/Pass + Passkey support).

**Step 3: Middleware**
Update middleware to use Better-Auth session checking.

---

### Task 5: Sidebar Rework

**Files:**
- Modify: `components/sidebar.tsx`
- Modify: `utils/routes.ts`

**Step 1: Update Routes Structure**
Group routes in `utils/routes.ts`:
- **Core:** Dashboard, Calendar, Appointments
- **Management:** Inventory, Accounting, Payroll, Sales
- **Admin:** Staff, Users, Config

**Step 2: Rework Sidebar Component**
Implement collapsible groups.
Ensure mobile responsiveness (hamburger menu, slide-out).

---

### Task 6: Accounts Page Rework

**Files:**
- Modify: `app/accounts/page.tsx`
- Create: `app/accounts/[id]/page.tsx` (Dedicated Edit Page)
- Create: `components/accounts/PaymentMethods.tsx`

**Step 1: List View**
Update user list to just be a list with "Edit" action navigating to detailed page.

**Step 2: Detail Page Layout**
Implement Tabs:
1.  **Main Information:** Name, Email, Phone, Avatar.
2.  **Access & Work:** Role, Access Flags, Artist Level, Rates.
3.  **Schedule:** Work hours/availability.
4.  **Payment Methods:** (New)

**Step 3: Payment Methods Component**
Implement CRUD for Payment Methods with obfuscation (only last 4 visible unless toggled).

---

### Task 7: Accounting Rework

**Files:**
- Modify: `app/accounting/page.tsx`
- Create: `app/accounting/categories/page.tsx` (Config)
- Modify: `app/api/actions/accounting.ts`

**Step 1: Category Management**
Create a UI to manage `accounting_categories` (Add/Edit/Archive).

**Step 2: Add Entry Modal**
Redesign `EntryModal`:
- Use `Select` for Category (fetched from DB).
- Dynamic Type selection.
- Validation improvements.

**Step 3: Exports Verification**
Refactor `handleExport` to ensure `utils/export-utils.ts` generates valid files with new data structure.

---

### Task 8: Metrics Update

**Files:**
- Modify: `app/metrics/page.tsx`
- Create: `components/metrics/ExecutiveAccounting.tsx`

**Step 1: Executive Tab**
Add "Executive Accounting" tab.

**Step 2: Implement Charts/Stats**
Show P&L, Expense Breakdown, Revenue vs Expense trends (custom date ranges).

---

### Task 9: Inventory Rework

**Files:**
- Modify: `app/inventory/page.tsx`
- Modify: `components/inventory/RestockModal.tsx`
- Modify: `app/api/actions/inventory.ts`

**Step 1: Actions UI**
Simplify "Actions" into a Dropdown menu per row or a clear Toolbar.

**Step 2: Restock Modal**
Update `RestockModal` to accept `invoice_number` and `proof_link`.
Save to `restock_logs`.

**Step 3: Style Unification**
Ensure Inventory modals match the new Accounting/Accounts style (Tailwind v4 theme).

---

### Task 10: Appointments (Walk-in Only)

**Files:**
- Modify: `app/appointments/page.tsx`
- Delete: `components/appointments/requestAppointment.tsx`
- Modify: `app/api/actions/appointments.ts`

**Step 1: Remove Request Flow**
Disable/Remove public appointment request forms.

**Step 2: Manager Entry**
Ensure `Add Appointment` modal is robust for Managers to input all details (Service, Artist, Client, Deposit).

---

### Task 11: Final Polish & Verification

**Files:**
- Test: `app/test/export-verification.tsx` (Create)

**Step 1: Export Verification**
Manually verify exports from Accounting, Sales, Inventory.

**Step 2: Security Check**
Verify 2FA and Passkey flows work for Admin accounts.
