# Rates, Rate Levels & Downpayments Overhaul

**Goal:** Generalize the "Artist Rates" system into a flexible "Rates" system with dynamic rate levels, add a downpayments feature with flexible payment types and deferred staff assignment, and reflect staff/shop cuts in accounting.

**Architecture:** DB-native overhaul (Approach A). New `rate_levels` and `downpayments` tables. Rename `artist_*` columns to `staff_*`. Downpayments support FLAT_FEE, PERCENTAGE, and CUSTOM types with deferred staff assignment and configurable payroll split modes. Accounting page gets inline cut display and a payroll breakdown report.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase (PostgreSQL), Drizzle ORM, Tailwind CSS 4

---

## 1. Rate Levels (Replacing Artist Levels)

### 1.1 New `rate_levels` Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default gen_random_uuid() | Auto-generated |
| `name` | VARCHAR(50) | NOT NULL | Display name (e.g., "Senior", "Standard", "Owner") |
| `slug` | VARCHAR(50) | NOT NULL, UNIQUE | URL-safe identifier (e.g., "senior", "standard", "owner") |
| `is_active` | BOOLEAN | NOT NULL, default true | Soft delete — deactivate instead of delete |
| `sort_order` | INTEGER | NOT NULL, default 0 | Display ordering in UI dropdowns |
| `created_at` | TIMESTAMP | NOT NULL, default now() | |
| `updated_at` | TIMESTAMP | | |
| `created_by` | UUID | FK → auth.users | |

### 1.2 Migration from Hardcoded Levels

- Seed the `rate_levels` table with 3 default rows mapping from current hardcoded values:
  - `NORMAL` → `{ name: "Standard", slug: "standard" }`
  - `HEAD_ARTIST` → `{ name: "Senior", slug: "senior" }`
  - `OWNER` → `{ name: "Owner", slug: "owner" }`
- Migrate `payroll_staff_rate.artist_level` values to `rate_level_id` references
- Migrate `users.artistLevel` values to `rate_level_id` references
- Drop the `artist_level` enum constraint from `payroll_staff_rate`
- Drop the `artistLevel` enum constraint from `users`

### 1.3 CRUD Operations

- **Create:** Admin creates new rate level with name, slug (auto-generated from name), and sort order
- **Read:** All active rate levels returned for dropdowns; all levels (including inactive) for admin view
- **Update:** Admin can rename, reorder, activate/deactivate levels
- **Deactivate (not delete):** Deactivated levels can't be assigned to new rates or staff. Existing payroll entries and rate snapshots remain intact. If a level is deactivated while still referenced by active rates, show a warning.
- **Delete:** Only available for levels with no references (no rates, no staff assignments, no payroll entries)

### 1.4 Impact on Rates

- The unique rate constraint changes from `(service_type, client_type, artist_level)` to `(service_type, client_type, rate_level_id)`
- `PayrollStaffRate.artist_level` becomes `PayrollStaffRate.rate_level_id` with FK to `rate_levels.id`
- Rate lookup: `getApplicableRate(serviceType, clientType, rateLevelId)` instead of `getApplicableRate(serviceType, clientType, artistLevel)`

---

## 2. Terminology Rename (Artist → Staff)

### 2.1 Type Renames

| Old Name | New Name |
|----------|----------|
| `ArtistLevel` | `RateLevel` |
| `ArtistLevelType` | Removed (consolidated into `RateLevel`) |
| `ArtistRateSnapshot` | `StaffRateSnapshot` |
| `ArtistEarningsSummary` | `StaffEarningsSummary` |

### 2.2 DB Column Renames

| Table | Old Column | New Column |
|-------|-----------|------------|
| `payroll_staff_rate` | `artist_level` | `rate_level_id` |
| `payroll_staff_rate` | `artist_percentage` | `staff_percentage` |
| `users` | `artist_level` | `rate_level_id` |
| `payroll_entry` | `artist_cut` | `staff_cut` |
| `payroll_entry` | `artist_rate_snapshot` | `staff_rate_snapshot` |

### 2.3 TypeScript Property Renames

| Old Property | New Property | Files Affected |
|-------------|-------------|----------------|
| `artist_level` | `rate_level_id` | payroll.ts, auth.ts, payroll-schemas.ts |
| `artist_percentage` | `staff_percentage` | payroll.ts, payroll-schemas.ts |
| `artist_cut` | `staff_cut` | payroll.ts, payroll types |
| `artistLevel` | `rateLevelId` | auth.ts, profile.ts, transactions.ts |
| `ArtistRateSnapshot` | `StaffRateSnapshot` | payroll.ts |

### 2.4 UI Label Changes

| Old Label | New Label | Context |
|-----------|-----------|---------|
| "Artist Rates" | "Rates" | Page headers, tabs, navigation |
| "Head Artist" | Uses rate level name (e.g., "Senior") | Dropdowns, badges, filter labels |
| "Normal Artist" | Uses rate level name (e.g., "Standard") | Dropdowns, badges, filter labels |
| "Artist Level" | "Rate Level" | Form labels, settings, admin panels |
| "Artist Cut" | "Staff Cut" | Payroll displays |
| "Artist %" | "Staff %" | Rate configuration forms |

### 2.5 What Stays the Same

- `payroll_staff_rate` table name (already says "staff")
- `staff_id` references throughout (already correct)
- My Payroll page concept (individual staff viewing their own earnings)

---

## 3. Downpayments

### 3.1 New `downpayments` Table

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, default gen_random_uuid() | Auto-generated |
| `transaction_id` | UUID | FK → transactions, NOT NULL | Linked transaction |
| `amount` | DECIMAL(10,2) | NOT NULL | Downpayment amount |
| `downpayment_type` | VARCHAR(20) | NOT NULL, CHECK IN ('FLAT_FEE', 'PERCENTAGE', 'CUSTOM') | Type of downpayment |
| `percentage_rate` | DECIMAL(5,2) | NULL | Only for PERCENTAGE type (e.g., 20.00 = 20%) |
| `estimated_total` | DECIMAL(10,2) | NULL | Estimated total service cost (for PERCENTAGE calculation reference) |
| `is_settled` | BOOLEAN | NOT NULL, default false | Whether balance is fully paid |
| `staff_id` | UUID | FK → users, NULL | Assigned staff — NULL means unassigned |
| `assigned_at` | TIMESTAMP | NULL | When staff was assigned |
| `payroll_split_mode` | VARCHAR(20) | NOT NULL, default 'PER_PAYMENT', CHECK IN ('PER_PAYMENT', 'ON_COMPLETION') | How to calculate payroll |
| `notes` | TEXT | NULL | Optional notes |
| `created_at` | TIMESTAMP | NOT NULL, default now() | |
| `updated_at` | TIMESTAMP | | |
| `created_by` | UUID | FK → auth.users | |

### 3.2 Downpayment Types

- **FLAT_FEE:** A fixed service amount (e.g., ₱500 booking fee). The `amount` is entered directly by staff. `percentage_rate` and `estimated_total` are NULL.
- **PERCENTAGE:** A percentage of an estimated total. Staff enters the `percentage_rate` and `estimated_total`. The `amount` is auto-calculated as `estimated_total * percentage_rate / 100`. If `estimated_total` changes, the downpayment can be updated.
- **CUSTOM:** Staff enters any arbitrary amount. No auto-calculation, no percentage. `percentage_rate` and `estimated_total` are NULL.

### 3.3 Deferred Staff Assignment Flow

1. **Create downpayment without staff:** Staff creates a downpayment transaction with `staff_id = NULL`. The transaction status is set to `DOWNPAYMENT_PENDING`. No payroll entry is created yet.

2. **Dashboard notification:** The Payroll dashboard shows "Pending Staff Assignment" cards listing unassigned downpayments.

3. **Assign staff:** When staff is assigned (`staff_id` set, `assigned_at` timestamp recorded):
   - The system looks up the applicable rate using `(service_type, client_type, rate_level_id)` from the staff member's rate level
   - A payroll entry is created based on the `payroll_split_mode`:
     - If `PER_PAYMENT`: A payroll entry is created for the downpayment amount
     - If `ON_COMPLETION`: No payroll entry yet; one will be created when the full balance is paid
   - The transaction status updates to `DOWNPAYMENT_ASSIGNED` or remains `PARTIAL` depending on payment status

4. **Balance payment:** When the remaining balance is paid:
   - If `PER_PAYMENT`: A new payroll entry is created for the balance amount
   - If `ON_COMPLETION`: A single payroll entry is created for the full service amount
   - The downpayment is marked `is_settled = true`

### 3.4 Downpayment with Assigned Staff

If staff is known at downpayment time:
- If `PER_PAYMENT`: Payroll entry is created immediately for the downpayment amount
- If `ON_COMPLETION`: No payroll entry until full payment; amount is tracked as pending

### 3.5 Transaction Status Extensions

Add two new transaction statuses:
- `DOWNPAYMENT_PENDING`: Transaction has a downpayment but no staff assigned
- `DOWNPAYMENT_ASSIGNED`: Transaction has a downpayment with staff assigned, balance still owed

These are in addition to the existing statuses: `PENDING`, `COMPLETED`, `PARTIAL`, `VOIDED`, `REFUNDED`.

### 3.6 UI Changes

- **Payroll page:** New "Downpayments" tab showing:
  - Active downpayments with status (unassigned, assigned, settled)
  - Ability to assign staff to unassigned downpayments
  - Filter by status, date range, staff member
- **Sales checkout flow:** "Add Downpayment" option with type selector (FLAT_FEE, PERCENTAGE, CUSTOM)
- **Transaction detail page:** Downpayment info card showing type, amount, percentage, and assignment status

---

## 4. Cuts in Accounting & Sales

### 4.1 Inline Cut Display in Accounting

- The accounting page (`accountingPage.tsx`) table will add columns: `Staff Cut`, `Shop Cut`, `Net Amount`
- These values are sourced from `payroll_entry` records linked to transactions
- For transactions without payroll entries, these columns show "—" (dash)
- The existing export engine is extended with `GroupingDimension` support for grouping by staff/shop cuts

### 4.2 Payroll Breakdown Report

A new section on the Accounting page providing a detailed payroll breakdown:

| Field | Source |
|-------|--------|
| Transaction ID | `payroll_entry.transaction_id` |
| Service Type | `payroll_entry.service_type` |
| Staff Member | `payroll_entry.staff_id` → user name |
| Rate Level | `rate_levels.name` via `payroll_entry.rate_level_id` |
| Gross Amount | `payroll_entry.amount` |
| Staff Cut | `payroll_entry.staff_cut` |
| Shop Cut | `payroll_entry.shop_cut` |
| Split Mode | `downpayments.payroll_split_mode` (if downpayment) or "STANDARD" |
| Payment Status | `transactions.status` |

Filters: date range, staff member, rate level, service type. Export formats: CSV, XLSX, PDF (using existing export engine).

### 4.3 Sales Context Changes

- The `SalesContext` will include the `payroll_split_mode` selection when creating a downpayment transaction
- The `client_type` selection remains as-is
- The checkout modal will show a preview of the estimated staff/shop cut breakdown before confirming

---

## 5. Additional Fixes & Improvements

### 5.1 Codebase Inconsistencies to Fix

- **Duplicate type definitions:** Consolidate `ArtistLevel` (payroll.ts) and `ArtistLevelType` (auth.ts) into single `RateLevel` type
- **Rate snapshot missing fields:** Add `clientType` and `rateLevelId` to `StaffRateSnapshot` for full auditability
- **Fixed amount validation:** Unify the handling between `calculateAndCreatePayrollEntry` (rejects) and `createManualPayrollEntry` (caps) to use consistent behavior (cap at gross amount with a warning)
- **Tax brackets hardcoding:** Move tax brackets to a configurable constant or database setting (future enhancement, not in scope)

### 5.2 ServiceType Consistency

- Ensure `ServiceType` union type matches across all files: `'TATTOO' | 'PIERCING' | 'SHOE' | 'MANUAL'`
- Remove `'OTHER'` from the DB schema comment or add it to the TypeScript type
- The `MANUAL` service type remains system-only (not selectable in rate creation UI)

---

## 6. Files Affected

### Database Schema
- `server/db/schema/payroll.ts` — rate_levels table, column renames, downpayments table
- `server/db/schema/auth.ts` — artistLevel → rate_level_id
- `server/db/schema/transactions.ts` — new downpayment statuses

### Types
- `utils/types/payroll.ts` — All type renames, new Downpayment types
- `utils/types/auth.ts` — Remove ArtistLevelType, update UserProfile
- `utils/types/transactions.ts` — New transaction statuses, downpayment fields

### Server Actions
- `server/actions/payroll.ts` — Rate CRUD with rate_level_id, downpayment CRUD, rate lookup changes
- `server/actions/payroll-schemas.ts` — Updated Zod schemas
- `server/actions/transactions.ts` — Downpayment creation, deferred assignment
- `server/actions/profile.ts` — rateLevelId instead of artistLevel
- `server/actions/metrics.ts` — Update artist leaderboard to use rate_levels

### UI Components
- `app/payroll/payrollPage.tsx` — Rate Levels tab, Downpayments tab, terminology changes
- `app/payroll/modals/CreateRateModal.tsx` — Use rate_level_id dropdown instead of artist_level
- `app/payroll/modals/EditRateModal.tsx` — Same
- `app/my-payroll/myPayrollPage.tsx` — Terminology updates
- `app/accounting/accountingPage.tsx` — Inline cut columns, payroll breakdown report
- `components/sales/context/SalesContext.tsx` — Downpayment integration, split mode selection
- `components/sales/modals/CheckoutModal.tsx` — Downpayment UI
- `components/accounts/EditUserModal.tsx` — rateLevelId instead of artistLevel
- `components/services/ServiceModal.tsx` — ServiceType consistency

### Export Engine
- `utils/export-engine/types.ts` — New GroupingDimension options
- `utils/export-engine/grouping.ts` — Group by rate level, staff cut, shop cut

### Seed Scripts
- `scripts/seed-shoe-rates.ts` — Update to use rate_level_id