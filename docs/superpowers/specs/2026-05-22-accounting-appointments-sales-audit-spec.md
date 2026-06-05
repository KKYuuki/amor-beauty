# Architecture & Audit Spec — Accounting Access, Appointments Revamp, Sales Tracking

**Date:** 2026-05-22
**Status:** Source of Truth — architectural boundaries, constraints & data flow requirements
**Scope:** Accounting access enforcement, appointments full-system revamp, sales tracking audit
**Predecessor Specs:**
- `2026-05-15-access-flags-audit-design.md` (flags registry & middleware gap analysis)
- `2026-05-20-access-pos-cut-audit-spec.md` (flag toggle bug, POS cut distribution)
- `2026-05-22-sales-description-to-accounting-spec.md`
- `2026-05-22-sales-payroll-architecture-design.md`

---

## 0. Executive Summary

Three distinct but interconnected problem domains exist in the current system:

| Domain | Root Problem | Severity |
|--------|-------------|----------|
| **Accounting Access** | `createLedgerEntry` requires `admin` role, not just `accounting_access` flag; front-end button gated behind `AdminActionGuard` (passkey) | Blocking — users with the access flag cannot create entries |
| **Appointments** | Fragmented status model (no ONGOING), downpayment ↔ appointment disconnect, walk-in creation has scheduling gaps (hardcoded hours, no schedule integration), UI and flow are not cohesive | Critical — core workflow is unreliable |
| **Sales Tracking** | `getTodaySummary` has SQL injection risk in `IN` clause, missing timezone handling, stale data after cash-register operations, no cache invalidation | High — reported numbers are unreliable |

---

## 1. Accounting Access Flag Fix

### 1.1 Current Architecture (As-Is)

**Permission Enforcement for Ledger Operations:**

| Operation | Server Action | Required Check | Effective Gate |
|-----------|-------------|----------------|----------------|
| **Read entries** | `getLedgerEntries` | `canAccessAccounting(user)` | Works — flag-gated |
| **Read summary** | `getLedgerSummary` | `canAccessAccounting(user)` | Works — flag-gated |
| **Read trial balance** | `getTrialBalance` | `canAccessAccounting(user)` | Works — flag-gated |
| **Read breakdown** | `getLedgerDetailBreakdown` | `canAccessAccounting(user)` | Works — flag-gated |
| **Read categories** | `getAccountingCategories` | `canAccessAccounting(user)` | Works — flag-gated |
| **Create entry** | `createLedgerEntry` | **`user.role !== 'admin'`** THEN `canAccessAccounting(user)` | **Broken** — only admin role can bypass; `accounting_access` flag is never reached for non-admins |
| **Edit entry** | `updateLedgerEntry` | `user.role !== 'admin'` | Broken — same pattern |
| **Void/restore/delete** | `voidLedgerEntry`, `restoreLedgerEntry`, `hardDeleteLedgerEntry` | `user.role !== 'admin'` | Broken — same pattern |
| **Export** | `exportLedger` | `canAccessAccounting(user)` | Works — flag-gated |

**Frontend UI Gating:**

The "Add Entry" button is wrapped in `AdminActionGuard`, which:
1. Checks `userInfo.role === 'admin'` → non-admins ALWAYS bypass to `onAction()`
2. For admins in production → requires passkey verification
3. The component name is misleading — it gates on admin role + passkey, not on access flag

### 1.2 Root Cause

The `createLedgerEntry` server action (line 354 in `server/actions/accounting.ts`) has a **role check BEFORE the flag check**:

```
if (!user || user.role !== 'admin') → failure('Unauthorized')
if (!canAccessAccounting(user)) → failure('Access denied')
```

A user with `accounting_access` flag but `manager`/`staff` role hits the first check and gets `'Unauthorized'` — the flag check is unreachable.

Additionally, the `AdminActionGuard` component on the frontend does not check `canAccessAccounting` at all — it only gates on admin role + passkey.

### 1.3 Architectural Boundaries (New Constraints)

#### 1.3.1 Server Action Permission Matrix

| Action | Read | Create | Update | Void | Hard Delete | Export |
|--------|------|--------|--------|------|-------------|--------|
| Role: admin | ✅ | ✅ (no passkey needed) | ✅ | ✅ | ✅ | ✅ |
| Role: manager/staff + `accounting_access` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Role: manager/staff + no flag | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Constraints:**
1. **Hard Delete** remains admin-only regardless of flags (irreversible data loss)
2. **Create, Update, Void** require `canAccessAccounting(user)` (which returns true for admins by default)
3. **Read/Export** unchanged — already flag-gated correctly
4. All mutations must still pass audit logging (unchanged)

#### 1.3.2 Frontend UI Gating

The "Add Entry" button and other action buttons must shift from `AdminActionGuard` to a new guard that checks the user's effective permissions:

```
<AccessGate requiredFlag="accounting_access">
    <button>Add Entry</button>
</AccessGate>
```

**New component: `AccessGate`**
- Props: `requiredFlag: FeatureAccessFlag`, `children`
- Checks `userInfo.role === 'admin'` OR `userInfo.access_flags.includes(requiredFlag)`
- Renders children if authorized, nothing if not
- No passkey requirement (that stays for sensitive ops only)

**Passkey stays for:** Hard delete entries, critical system config changes, but NOT for routine CRUD operations on gated features.

#### 1.3.3 AdminActionGuard Remediation

The `AdminActionGuard` component currently has a flawed bypass logic:

```typescript
const bypassAdminValidation = 
    bypass ||                                    // Explicit prop bypass
    !isProduction ||                            // Development mode — bypasses in prod too sometimes
    !isAdmin ||                                 // Non-admin user — ALWAYS bypasses for non-admins!
    process.env.NEXT_PUBLIC_BYPASS_ADMIN_VALIDATION === 'true'
```

**Bug:** `!isAdmin` means non-admin users bypass the passkey check entirely. The guard was designed as "admin-only sensitive actions need passkey" but non-admins skip it. This is intentional (non-admins shouldn't reach these buttons anyway), but it creates a false sense of security.

**Fix:** Replace `AdminActionGuard` with granular guards:
- `AdminOnlyGate` — for hard delete, system config, user management
- `FlagGate` — for feature-gated CRUD (accounting, payroll, etc.)

### 1.4 Data Flow

```
User clicks "Add Entry"
  → FlagGate checks userInfo.access_flags for 'accounting_access' (or admin bypass)
  → EntryModal opens
  → User fills form, submits
  → Server action createLedgerEntry:
      → getCurrentUser() — auth check
      → canAccessAccounting(user) — flag/role check (UPDATED: remove role check)
      → Validation → DB insert → Audit log → Cache invalidation
      → Return success/failure
```

---

## 2. Appointments System Revamp

### 2.1 Current Architecture (As-Is)

#### 2.1.1 Status Model

```
AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'
```

Valid transitions:
- PENDING → CONFIRMED, CANCELLED
- CONFIRMED → COMPLETED, CANCELLED
- COMPLETED → [] (terminal — no outgoing transitions)
- CANCELLED → CONFIRMED, PENDING (recovery)

**There is NO ONGOING status.** The current "Mark as On-going" button in `AppointmentDetailClient` only sets `actual_time_start` but does NOT change the appointment status. This means:
- A tattoo that starts at 2pm and ends at 6pm shows `CONFIRMED` for 4 hours
- Staff cannot distinguish "in progress" from "waiting to start"
- The calendar/reports cannot distinguish active sessions from scheduled ones

#### 2.1.2 Downpayment ↔ Appointment Disconnect

**Current flow:**
1. Walk-in appointment created (no downpayment support at creation)
2. Appointment completed via `CompleteAppointmentModal`
3. Staff creates sales transaction via "Open in Sales" button
4. Transaction uses `createTransactionFromAppointment` (server action in `sales.ts`) which:
   - Gets appointment services/items
   - Creates transaction with `amount_paid = 0` (or full amount if collected)
   - Transaction status = `COMPLETED` or `DOWNPAYMENT_PENDING`
5. If downpayment was collected, staff must manually enter it in Sales POS

**Gaps:**
- No way to collect downpayment at appointment creation time
- No way to link downpayment amount to appointment record
- The `Downpayment` table (in `downpayments.ts`) is tied to transactions, not appointments
- Appointment status is `COMPLETED` before full payment is collected — no "partially paid" indicator on appointments
- No status for "appointment is done but payment is ongoing"

#### 2.1.3 Walk-in Creation — Scheduling Gaps

**`WalkinAppointmentModal` issues:**
1. Staff selection does NOT filter by schedule — all staff shown regardless of availability
2. Time slots are hardcoded `13:00 - 21:00` (1pm to 9pm) — not configurable
3. Slot generation only checks booking overlap, NOT staff working hours (`staffSchedules` table)
4. No branch-aware time slots (different branches have different hours)
5. Staff schedule (`staffSchedules`) is not loaded or referenced during creation
6. The `returnFormattedTime` function creates dates using the picked date + hour, but ignores timezone offset

#### 2.1.4 Appointment Detail Page Layout

The current `AppointmentDetailClient.tsx` is a single monolithic component (1131+ lines) that handles:
- Status transitions
- Editing
- Services & items management
- Type-specific details (tattoo, piercing, shoe)
- Completion modal
- Transaction creation
- Final photo upload

This leads to excessive re-renders and fragile state management.

### 2.2 Required Architectural Changes

#### 2.2.1 New Status Models (Two Independent Axes)

**Axis 1 — Appointment/Work Status:**

```
AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'
```

**Valid transitions:**
```
PENDING ──→ CONFIRMED ──→ ONGOING ──→ COMPLETED
   │            │                       │
   └─→ CANCELLED ←──────────────────────┘
```

- PENDING → CONFIRMED, CANCELLED
- CONFIRMED → ONGOING, CANCELLED
- ONGOING → COMPLETED, CANCELLED
- COMPLETED → CANCELLED (if refund needed)
- CANCELLED → CONFIRMED (recovery)

**ONGOING status replaces the current `actual_time_start`-only approach:**
- Setting to ONGOING automatically records `actual_time_start = now()`
- Setting to COMPLETED automatically records `actual_time_end = now()`
- Staff can see "In Progress" in list views, calendar, and reports
- Clients can see real-time status if front-end exposes it

**Axis 2 — Payment Status (independent of work status):**

```
PaymentStatus = 'UNPAID' | 'DEPOSIT_PAID' | 'PAID_IN_FULL' | 'REFUNDED'
```

- Any appointment status can have any payment status
- A COMPLETED appointment can be UNPAID (needs billing)
- A CONFIRMED appointment can be DEPOSIT_PAID (downpayment collected)
- Payment status changes never trigger work status transitions, and vice versa

#### 2.2.2 Downpayment-Aware Appointment Lifecycle

**Problem:** Downpayments are transaction-level but customers think of them as appointment-level. The system needs a unified view.

**Adopted Model: Two Independent Axes**

| Dimension | Tracks | States |
|-----------|--------|-------|
| **Work Status** | Scheduling & work progress | `PENDING → CONFIRMED → ONGOING → COMPLETED → CANCELLED` |
| **Payment Status** | Money collected | `UNPAID / DEPOSIT_PAID / PAID_IN_FULL / REFUNDED` |

**Downpayment collection at appointment creation:**
- Add optional downpayment fields to walk-in creation modal
- When downpayment is collected:
  1. Create appointment with status `CONFIRMED`, payment_status `DEPOSIT_PAID`
  2. Create transaction with status `DOWNPAYMENT_PENDING` or `DOWNPAYMENT_ASSIGNED`
  3. Link transaction ↔ downpayment (downpayment table remains transaction-scoped)
  4. Link appointment ↔ downpayment (appointment.downpayment_id)
  5. Create auto-ledger entry for unearned revenue (LIABILITY)
  6. Staff cut triggers immediately via **PER_PAYMENT** default mode

**Completion flow with existing downpayment:**
- When appointment completes:
  1. If downpayment exists, transaction becomes `PARTIAL` (balance due remains)
  2. Appointment payment_status stays `DEPOSIT_PAID`
  3. Staff clicks "Collect Balance" → opens Sales POS with balance pre-loaded
  4. When balance collected → transaction → `COMPLETED`, downpayment → `settled`, payment_status → `PAID_IN_FULL`

**Key payroll constraint:**
- **Default mode: `PER_PAYMENT`** — each collected payment triggers proportional staff cut immediately
- **Optional mode: `ON_COMPLETION`** — staff cut only after full amount is paid
- Configurable via `payroll_split_mode` field with clear UI
- **Rationale:** Downpayment acts as a gate for work to start. Artist earns the DP by doing design/initial work. Studio absorbs bad debt risk on the balance, not the artist.

#### 2.2.3 Appointment Downpayment Collection UI

**At appointment creation (walk-in modal):**
- New toggle: "Collect deposit?"
- If yes: amount field (or percentage-of-estimated), payment method
- Creates transaction + downpayment record immediately
- Appointment shows "Deposit: ₱X collected" in list view

**At appointment detail:**
- Payment status indicator (No Payment / Deposit Paid / Paid in Full)
- Payment history section showing collections
- "Collect Balance" button (if downpayment exists)
- "Record Payment" button (for any mid-appointment collection)

#### 2.2.4 Schedule-Aware Walk-in Creation

**Required changes to `WalkinAppointmentModal`:**

1. **Load staff schedules** when staff and date are selected
2. **Generate time slots** based on:
   - Staff's `staffSchedules` entry for that day (startTime, endTime, breakTime)
   - Existing appointments (already implemented via `getStaffAppointments`)
   - Business hours from settings
   - Branch hours (if branch-specific hours are needed)
3. **Soft-block vs hard-block:** Show unavailable slots as disabled/indicated but allow override (staff may work outside schedule)
4. **Business hours:** Replace hardcoded `generateSlots()` with fetched settings
5. **Multi-day appointments:** Support if time_end crosses midnight

#### 2.2.5 Appointment Detail Page Refactoring

**Splitting `AppointmentDetailClient.tsx` (1131 lines):**

| File | Responsibility | Estimated Lines |
|------|---------------|-----------------|
| `AppointmentDetailClient.tsx` | Top-level orchestrator, layout, data fetching | 150 |
| `AppointmentInfoCard.tsx` | Header info, status badge, timing | 100 |
| `AppointmentPeopleCard.tsx` | Client & staff info | 80 |
| `AppointmentServiceSection.tsx` | Services list + management | 120 |
| `AppointmentItemSection.tsx` | Items list + management | 120 |
| `AppointmentPaymentSection.tsx` | Payment status, downpayment, balance | 150 |
| `AppointmentActionBar.tsx` | Status buttons, edit, open in sales | 100 |
| `AppointmentStatusManager.ts` | Status transition logic, validation | 80 |

#### 2.2.6 Database Schema Changes

**`appointments` table additions:**
```sql
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS downpayment_id UUID REFERENCES downpayments(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS downpayment_amount DECIMAL(12,2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS downpayment_collected_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'UNPAID';
-- payment_status: 'UNPAID' | 'DEPOSIT' | 'PAID_IN_FULL' | 'REFUNDED'
```

**`staffSchedules` table** already exists — no changes needed, but must be integrated into walk-in creation.

### 2.3 UI/UX Redesign Requirements

#### 2.3.1 Appointments List Page (`appointmentsPage.tsx`)

**Current issues:**
- Only shows status filter (CONFIRMED by default)
- No date range filter
- No branch filter
- No calendar view integration
- Dense table with too many columns

**Required improvements:**

**Layout by device (decision: hybrid):**

| Device | Primary | Secondary |
|--------|---------|-----------|
| **Desktop** (≥1024px) | Calendar grid (day/week) | Toggle to filterable list |
| **Mobile/Tablet** (<1024px) | Card list with horizontal day selector | Quick date picker, no grid |

**Common filters (both views):**
1. **Date range** — today, this week, this month, custom
2. **Quick status pills** — PENDING, CONFIRMED, ONGOING, COMPLETED, CANCELLED with counts, multi-select
3. **Staff filter** — dropdown of available staff
4. **Client search** — search by client name or phone
5. **Branch filter** — all/show specific
6. **Quick actions** — hover/tap to confirm, cancel, or mark ongoing without navigation

#### 2.3.2 Appointment Detail Page

**Required layout improvements:**
1. **Left sidebar:** Timeline/steps (Pending → Confirmed → Ongoing → Completed) with current step highlighted
2. **Main content:** Tabbed or sectioned layout (Info → Services → Items → Payment → Notes)
3. **Right sidebar:** Summary (totals, deposit, balance due)
4. **Sticky action bar:** Status buttons always visible at top
5. **Inline editing:** Click-to-edit on most fields (no separate "Edit" mode)
6. **Payment section:** Show all payments received against this appointment (via linked transaction)
7. **Image gallery:** Reference photos, final photos

#### 2.3.3 Walk-in Creation Modal

**Required improvements:**
1. **Step-by-step wizard:** Step 1: Client Info → Step 2: Appointment Details → Step 3: Services → Step 4: Deposit (optional) → Step 5: Review
2. **Real-time staff availability:** Shows available slots based on loaded schedules
3. **Service catalog browser:** Search/filter services, see prices, multi-select
4. **Estimated total:** Shows running total as services are added
5. **Deposit collection:** Optional deposit field with payment method
6. **Confirmation summary:** Review all details before final create

---

## 3. Sales Tracking — Comprehensive Audit

### 3.1 Current Architecture (As-Is)

#### 3.1.1 Today's Sales Data Flow

```
SalesHeader.tsx
  └─ todayStats: { totalSales, transactionCount }
     └─ from SalesContext.todayStats
        └─ from fetchData() → getTodaySummary(userInfo.id, currentBranch?.id)
           └─ Server Action: getTodaySummary in transactions.ts (line 1273)
```

```
getTodaySummary(staffId?, branchId?):
  1. Calculate todayStart = midnight, todayEnd = 23:59:59.999
  2. Build activeStatuses = ['COMPLETED', 'PARTIAL', 'DOWNPAYMENT_ASSIGNED', 'DOWNPAYMENT_PENDING']
  3. Query transactions WHERE created_at BETWEEN todayStart AND todayEnd
     AND status IN (activeStatuses)
     AND (staffId matches OR branchId matches)
  4. SUM(amountPaid) as totalSales, COUNT(*) as transactionCount
```

#### 3.1.2 Identified Bugs & Risks

**BUG 1: SQL Injection via Status Array**

```typescript
// transactions.ts line 1293
sql`${transactions.status} IN (${sql.join(activeStatuses.map(s => sql`${s}`), sql`, `)})`
```

While the statuses are hardcoded (not user-supplied), the `sql.join` + `sql` tagged template with string interpolation creates a raw SQL fragment. The `activeStatuses` are hardcoded so this is not exploitable today, but it's a fragile pattern. If any status value is ever derived from user input, this becomes injectable.

**Fix:** Use Drizzle's `inArray` operator instead:
```typescript
import { inArray } from 'drizzle-orm'
// ...
inArray(transactions.status, activeStatuses)
```

**BUG 2: Timezone Handling**

`todayStart` and `todayEnd` are calculated using the server's local time:
```typescript
const todayStart = new Date()
todayStart.setHours(0, 0, 0, 0)
```

If the server runs in UTC and the business is in PH (UTC+8), "today's sales" will be offset by 8 hours. At 8am PH time, the server shows no sales yet (server time is midnight, previous day's cutoff).

**Fix:** Hardcode to **Philippine time (UTC+8)** — the business operates exclusively in one timezone. Use `Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila' })` or calculate the offset manually from the server's UTC date to get the correct local day boundaries.

**BUG 3: Stale Data After Sales Operations**

After a transaction is created/voided in the `SalesContext`, `todayStats` is NOT refreshed. The `fetchData()` function is called only:
1. On mount
2. When `currentBranch?.id` or `userInfo?.id` changes

So when a staff member creates a sale:
- The cart panel clears
- The transaction list refreshes (via `refreshTransactions`)
- But `todayStats` remains stale until the page reloads

**BUG 4: `amountPaid` vs `total` Mismatch**

The summary uses `SUM(amountPaid)` which is correct for partial/downpayment transactions. However, the "Transactions" count includes `DOWNPAYMENT_PENDING` and `DOWNPAYMENT_ASSIGNED` statuses which may have zero or minimal amount paid. This inflates the transaction count while the sales total looks artificially low.

**BUG 5: Missing Cache Invalidation**

Unlike the accounting system (which has `cache.invalidate()` calls), the sales `getTodaySummary` has no cache invalidation. If data is cached at Next.js level, sales numbers will be stale.

**BUG 6: Branch Filter is Inconsistent**

The branch filter in `getTodaySummary` uses:
```typescript
if (branchId) {
    whereClause = and(whereClause, or(
        eq(transactions.branchId, branchId),
        isNull(transactions.branchId)  // ← shared transactions included
    ))
}
```

This means shared/global transactions are counted in EVERY branch's "Today's Sales", causing double-counting if you sum across branches.

### 3.2 Required Fixes

#### 3.2.1 Critical (P0)

| Bug | Fix | File |
|-----|-----|------|
| B3 — Stale stats after sale | Call `setTodayStats` with updated data after `handleCheckout` succeeds | `SalesContext.tsx` — in `handleCheckout` |
| B4 — Count inflation | Split summary into separate metrics: `totalSales` (SUM amountPaid), `completedTransactions` (COUNT where paid in full), `pendingTransactions` (COUNT where partial/downpayment) | `getTodaySummary` + `SalesHeader` |
| B1 — SQL pattern | Replace `sql.join` with `inArray` | `transactions.ts` line 1293 |

#### 3.2.2 High (P1)

| Bug | Fix | File |
|-----|-----|------|
| B2 — Timezone | Accept timezone offset in `getTodaySummary`, use it to calculate local day boundaries | `getTodaySummary` signature + `SalesContext` |

#### 3.2.3 Medium (P2)

| Bug | Fix | File |
|-----|-----|------|
| B5 — Cache | Add `revalidatePath('/sales')` after transaction creation/void | `handleCheckout`, `handleVoid` |
| B6 — Branch double-count | Remove `isNull(branchId)` from branch filter; shared transactions should be attributed to origin branch or omitted | `getTodaySummary` |

### 3.3 Enhanced Sales Tracking Design

#### 3.3.1 New Summary Shape

```typescript
interface TodaySalesSummary {
    totalCollected: number     // SUM(amount_paid) — actual cash in drawer
    totalTransactions: number  // COUNT(*) all valid transactions today
    completedTransactions: number  // COUNT(*) where status = 'COMPLETED'
    pendingTransactions: number    // COUNT(*) where status in ('PARTIAL', 'DOWNPAYMENT_PENDING', 'DOWNPAYMENT_ASSIGNED')
    voidedTransactions: number     // COUNT(*) where status = 'VOIDED'
    totalItemsSold: number    // SUM(items.quantity) across all transactions
    totalServicesRendered: number // COUNT(services) across all transactions
    averageTransactionValue: number // totalCollected / completedTransactions
    paymentMethodBreakdown: {   // per-method totals
        method: PaymentMethod
        total: number
        count: number
    }[]
}
```

#### 3.3.2 Data Flow (Fixed)

```
handleCheckout() success
  → setTodayStats with updated data from createTransaction response
  → revalidatePath('/sales')
  → refreshTransactions() (existing)
  → Clear cart

handleVoid() success
  → getTodaySummary() re-fetch
  → revalidatePath('/sales')
  → refreshTransactions()
```

#### 3.3.3 Transaction Creation — Accounting Consistency

The `createTransaction` function in `transactions.ts` already creates auto-ledger entries for each sale. This is correct. However:

**Check: Does voiding a transaction reverse the ledger entries?**
- `voidTransaction` (line 739+) does NOT reverse accounting entries
- This means voided sales still count in accounting reports
- **Fix:** Add reverse accounting entries when voiding transactions

#### 3.3.4 Number of Sales Tracking

The "number of sales" should be the count of **completed transaction items** (services + products sold), not just transaction count. A single transaction with 5 items is 5 sales. This is the distinction:

```
"Today's Sales" (revenue) = SUM(amount_paid)
"Number of Sales" (volume) = SUM(items.quantity) + COUNT(services)
```

Both the header and the POS dashboard should show both metrics.

---

## 4. Cross-Cutting Concerns

### 4.1 Access Control Consolidation

The middleware (middleware.ts) still has ALL flag checks commented out as TODO. Without middleware enforcement, all route-level access control is cosmetic (sidebar hiding). This must be resolved across all three workstreams.

**Decision: Do now — implement alongside all other fixes.**

**Implementation:**
1. Uncomment the middleware flag check
2. Query the user table for `accessFlags` using Drizzle with the user ID already available from `auth.api.getSession` (single query, no joins)
3. Compare against `matchingRoute.perms` using `normalizeFlag`
4. Redirect to `/unauthorized` if not authorized
5. Ensure `/unauthorized` page exists at `app/unauthorized/page.tsx` — currently referenced but 404

### 4.2 Audit Logging Consistency

| Area | Current State | Required |
|------|--------------|----------|
| Accounting | ✅ All mutations logged | Keep |
| Appointments | ✅ Most actions logged | Ensure downpayment transition is logged |
| Sales | ⚠️ Transaction creation logged, void logged | Add logging for add-payment, void-reversal |

### 4.3 Error Handling Patterns

All server actions should follow the established `ActionResponse<T>` pattern:
```typescript
return success<T>(data)
return failure('Human-readable error message')
```

The `createWalkinAppointment` function uses a different return shape (`{ success, appointment, message }`) — must be aligned with the standard pattern.

---

## 5. Implementation Sequencing

### Phase 1 — Fixes (P0)
1. **Accounting access:** Fix `createLedgerEntry` role check → use `canAccessAccounting`
2. **Sales summary:** Fix SQL pattern (inArray), add cache invalidation, split metrics
3. **Sales stale stats:** Update todayStats after checkout/void

### Phase 2 — Appointments Foundation (P1)
1. Add `ONGOING` status to schema, types, valid transitions, server action
2. Integrate staff schedules into walk-in creation modal
3. Add downpayment_id and payment_status to appointments table
4. Create downpayment-at-creation flow in walk-in modal

### Phase 3 — Appointments UI Overhaul (P1)
1. Refactor appointment detail page into sub-components
2. Redesign appointment list with calendar toggle
3. Add payment section to appointment detail
4. Create "Collect Balance" flow

### Phase 4 — Sales Tracking Enhancement (P2)
1. Add timezone support to getTodaySummary
2. Fix branch double-counting
3. Add void-reversal accounting entries
4. Implement `numberOfSales` (item count) metric
5. Middleware access flag enforcement

---

## 6. Security Constraints

| Constraint | Rule |
|-----------|------|
| **Hard Delete** | Admin role ONLY — never flag-gated |
| **Transaction Void** | Requires `transactions_manage` flag + audit trail |
| **Ledger Create/Update** | Requires `accounting_access` flag — no passkey needed |
| **Downpayment Settle** | Requires `appointments_manage` or `accounting_access` flag |
| **Sales Checkout** | Requires `sales_access` flag (already enforced in SalesContext) |
| **Middleware** | Must enforce ALL route flags before page renders |
| **Database RLS** | Disabled (known trade-off); all enforcement at application layer |

---

## 7. Data Flow Diagrams

### 7.1 Accounting Entry Creation (Fixed)

```
User (accounting_access flag)
  → /accounting page (server: canAccessAccounting check)
  → Clicks "Add Entry"
  → FlagGate checks front-end: userInfo.role === 'admin' OR access_flags.includes('accounting_access')
  → EntryModal renders
  → Fills form, submits
  → Server: createLedgerEntry
      → getCurrentUser() —— auth
      → canAccessAccounting(user) —— permission (UPDATED)
      → sanitizeText(fields) —— injection prevention
      → validateSingleEntry —— business rules
      → DB insert —— with audit fields
      → Cache invalidation —— all accounting caches
      → Return success(data) or failure(error)
```

### 7.2 Appointment with Downpayment (New Flow)

```
Walk-in Modal
  → Step 1: Client info (name, phone, email)
  → Step 2: Appointment details (type, staff, date, time)
  → Step 3: Services (browse, select, see running total)
  → Step 4: Deposit (toggle on, enter amount/percentage, select payment method)
  → Step 5: Review summary
  → Submit:
      1. createAppointment(status='CONFIRMED')
      2. If deposit: createTransaction(status='DOWNPAYMENT_PENDING', amount_paid=deposit)
      3. If deposit: createDownpayment(transaction_id, amount, type)
      4. Link: appointment.downpayment_id = downpayment.id
      5. Create auto-ledger entry for unearned revenue (LIABILITY)
  
Completion Flow
  → Staff marks appointment ONGOING → records actual_time_start
  → Staff marks COMPLETED → records actual_time_end
  → If downpayment exists:
      → Update transaction: status = 'PARTIAL', balance_due = total - amount_paid
      → Appointment shows "Deposit paid: ₱X | Balance due: ₱Y"
      → Staff clicks "Collect Balance" → opens Sales POS with cart pre-loaded
      → On full payment: transaction → COMPLETED, downpayment → settled
  → If no downpayment:
      → Standard "Open in Sales" flow (existing)
```

### 7.3 Today's Sales Data Flow (Fixed)

```
SalesHeader renders
  └─ 5 stats cards from SalesContext.todayStats
     └─ fetchData() on mount + branch change + after checkout/void
        └─ getTodaySummary(currentBranch?.id) — UPDATED
           ├─ auth check → canAccessSales(user)
           ├─ Calculate local-day boundaries using timezone
           ├─ Query completed transactions
           │    └─ inArray(status, ['COMPLETED'])
           │    └─ SUM(amount_paid) → totalRevenue
           │    └─ COUNT(*) → completedCount
           ├─ Query pending transactions
           │    └─ inArray(status, ['PARTIAL','DOWNPAYMENT_PENDING','DOWNPAYMENT_ASSIGNED'])
           │    └─ COUNT(*) → pendingCount
           ├─ Join transaction_items for completed transactions
           │    └─ SUM(quantity) where inventory_id IS NOT NULL → itemCount
           │    └─ COUNT(*) where service_id IS NOT NULL → serviceCount
           └─ Return { totalRevenue, completedCount, pendingCount, itemCount, serviceCount }

handleCheckout() success
  ├─ Permission: canAccessSales(user) — CHECKED ✅
  ├─ setTodayStats(newStats) — directly update context
  ├─ revalidatePath('/sales')
  └─ addNotification('Sale completed', 'SUCCESS')

handleVoid() success
  ├─ Permission: canAccessTransactions(user) — CHECKED ✅
  ├─ Void reverses accounting entries (NEW)
  ├─ revalidatePath('/sales')
  └─ refreshTransactions()
```

---

## 8. Design Decisions (Brainstorming Outcomes)

### 8.1 Downpayment → Payroll Cut

**Decision: Configurable (`PER_PAYMENT` default)**
- `payroll_split_mode` is configurable per-appointment with a clear UI toggle
- **Default:** `PER_PAYMENT` — each collected payment immediately triggers a proportional staff cut
- **Rationale:** The downpayment is a gate for work to start (artist won't begin without it). Even if the client never returns, the artist earned the downpayment by doing design/initial work. The studio absorbs bad debt risk, not the artist.
- The current codebase already supports both `PER_PAYMENT` and `ON_COMPLETION` modes in the `downpayments` table — this decision formalizes the default and its rationale.

### 8.2 Downpayment Amount Calculation

**Decision: Estimated total × % → editable amount**
- Staff enters an **estimated total** (e.g., ₱30,000)
- System auto-calculates DP as **% of total** (default configurable, e.g., 10%)
- Staff can **override the DP amount** independently without changing the estimated total
- Supports three DP types already in the codebase:
  - `FLAT_FEE`: Fixed amount
  - `PERCENTAGE`: % of estimated total
  - `CUSTOM`: Arbitrary amount

### 8.3 Appointment Status + Payment Model

**Decision: Two independent axes**

| Dimension | Statuses | Purpose |
|-----------|----------|---------|
| **Appointment Status** | `PENDING → CONFIRMED → ONGOING → COMPLETED → CANCELLED` | Tracks **work progress** — scheduling, in-progress, done |
| **Payment Status** | `UNPAID / DEPOSIT_PAID / PAID_IN_FULL / REFUNDED` | Tracks **money collected** — independent of work state |

**Constraints:**
- A COMPLETED appointment can be UNPAID (client needs billing)
- A CONFIRMED appointment can be DEPOSIT_PAID (downpayment collected, awaiting session)
- Adding installment plans or multiple downpayments only touches payment status, never appointment statuses
- Calendar/scheduling views filter on appointment status only — unaffected by payment complexity

### 8.4 Appointments List UI

**Decision: Hybrid by device**

| Device | Primary View | Secondary |
|--------|-------------|-----------|
| **Desktop** (≥1024px) | Calendar (day/week grid with visual blocks) | Toggle to filterable list |
| **Mobile/Tablet** (<1024px) | Card list (swipeable, tappable) with horizontal day selector | Quick date picker, no calendar grid |

**Rationale:** Calendar grids are unusable on mobile (tiny cells, horizontal scrolling). Cards with a horizontal day selector (Mon Tue Wed Thu Fri Sat Sun) + "Today" button is more practical for mobile use.

### 8.5 Cancellation & Refunds

**Decision: Configurable cancellation policy + refund to original payment method**

- **Cancellation policy** is configurable **per appointment** at creation time:
  - `NON_REFUNDABLE` — full forfeit (artist already prepped)
  - `PARTIAL_REFUND` — configurable % kept as fee, rest refunded
  - `FULL_REFUND` — everything back
- **Refund method:** Must go back to **original payment method** (GCash → GCash, Card → Card, Cash → Cash). No store credit.
- **Payment status:** `REFUNDED` is added to the PaymentStatus enum
- **Ledger impact:** Refund creates a reverse accounting entry to unwind the unearned revenue liability
- **Constraint:** Refund amount cannot exceed `amount_paid` on the linked transaction

### 8.6 Sales Page — Stats Cards Revamp

**Decision: New 5-card layout for sales header**

| Card | Metric | Source |
|------|--------|--------|
| 💰 **Today's Revenue** | `SUM(amount_paid)` for today — actual cash collected | `getTodaySummary` (fixed) |
| 📦 **Items Sold** | `SUM(items.quantity)` across today's completed transactions | New query or join in `getTodaySummary` |
| 🎨 **Services Rendered** | `COUNT(service_items)` across today's completed transactions | New query or join in `getTodaySummary` |
| 📊 **Transactions** | `COUNT(*)` where status = `'COMPLETED'` today | `getTodaySummary` (fixed — excludes partial/downpayment from count) |
| ⏳ **Pending Payments** | `COUNT(*)` where status in `('PARTIAL','DOWNPAYMENT_PENDING','DOWNPAYMENT_ASSIGNED')` today | `getTodaySummary` (new — split from total count) |

### 8.7 Sales Permissions — Access Flag Fix

**Decision: Granular permission model for sales operations**

| Operation | Required Flag | Rationale |
|-----------|--------------|-----------|
| View sales page | `sales_access` | Daily POS operations |
| Create transaction (checkout) | `sales_access` | Ringing up a sale |
| Add payment to existing transaction | `sales_access` | Collecting balance |
| Void a transaction | `transactions_manage` | Sensitive — can't undo easily |
| Refund a transaction | `transactions_manage` | Financial impact, audit trail |
| View transaction detail | `transactions_manage` or `sales_access` | Read-only access |

**Fixes required:**
1. `server/actions/sales.ts` — add `canAccessSales(user)` to `createTransactionFromAppointment`
2. `server/actions/transactions.ts` — `createTransaction` currently checks `canAccessTransactions` → should check `canAccessSales` for creation, keep `canAccessTransactions` for void/refund
3. Route config: `/sales` should check `sales_access` (already correct), `/transactions` should check `transactions_manage` (already correct)

---

## 9. Remaining Discussion Items

1. **Stats card on mobile** — the 5-card layout on the sales page may need to collapse/scroll horizontally on small screens
