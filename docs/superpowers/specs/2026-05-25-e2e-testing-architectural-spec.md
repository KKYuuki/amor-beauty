# Architectural Specification: End-to-End Testing of InkSight RDMD

## 1. Executive Summary

This specification defines a comprehensive browser-based end-to-end testing plan for the InkSight RDMD tattoo studio management application. The testing covers the full operational pipeline — appointments → sales → payroll → accounting — plus all supporting subsystems (time-clock, inventory, services, rate configuration, branch management) — executed via the `agent_browser` tool. The goal is to validate every business flow, identify all defects, and document reproduction steps so issues can be systematically resolved.

## 2. Constraints & Non-Negotiables

### Test Approach
- **Must use** `agent_browser` for all UI interactions — no direct server action calls during testing
- **Must use** the existing invitation-based account creation flow via `scripts/generate-invite.ts` for test account setup
- **Must use** the seed script (`bun run db:seed`) to establish baseline reference data (rate levels, accounting categories, branches, payroll rate templates)
- **Must** record all issues found in a structured log (one entry per defect) with: subsystem, steps-to-reproduce, expected behavior, actual behavior, severity
- **Must** capture screenshots at key verification points using agent_browser's snapshot/screenshot capabilities

### Environment
- Uses the **existing development database** (`DATABASE_URL` in `.env.local`) — all testing happens against the live dev PostgreSQL instance
- The app must be running locally via `bun run dev` before testing begins
- Each test session uses `sessionMode=fresh` to ensure clean browser profiles
- Prefer `--profile Default` for signed-in content

### Security
- **Never commit** test credentials or .env.local changes
- **Never modify** production data — verify with `check-data.ts` that the database URL points to dev/staging, not production
- All test accounts get flagged/disabled after testing concludes (via `is_active = false`)

### Scope Enforcement
- Every user-facing feature in the sidebar must be visited at least once
- Every appointment status transition must be exercised
- Every payment method (CASH, CARD, GCASH, BANK_TRANSFER, SPLIT) must be used at least once
- Every appointment type (TATTOO, PIERCING, SHOE, OTHER) must be created

## 3. System Boundaries

### IN Scope
The following subsystems are tested end-to-end as an integrated pipeline:

| # | Subsystem | Key Features |
|---|-----------|--------------|
| 1 | **Auth & User Mgmt** | Account creation via invitation, role assignment (admin, manager, artist, staff), access flag assignment, login/logout |
| 2 | **Appointments** | Create scheduled appointments (all 4 types), create walk-in appointments, status lifecycle (PENDING→CONFIRMED→ONGOING→COMPLETED→CANCELLED), rescheduling, service/item attachment, downpayment collection, final photo upload |
| 3 | **Sales / Transactions** | Create transaction from completed appointment, manual POS-style transactions, split payments, apply downpayments, collect balance, void transactions, refunds |
| 4 | **Payroll** | Configure staff rates (by service type × client type × rate level), downpayment assignment to staff, automatic payroll entry generation from transactions, manual payroll entries, payroll requests (REQUESTED→CONFIRMED→COMPLETED), deductions (advances), staggered disbursements, tax withholding |
| 5 | **Accounting** | General ledger entries auto-created from transactions and payroll, manual ledger entries, void/restore entries, category management, period locking |
| 6 | **Time-Clock** | QR code generation, clock-in via QR, clock-out, staff schedule management, attendance reporting |
| 7 | **Services** | Service catalog management (CRUD), pricing (fixed/hourly), service type assignment, service-item linkage |
| 8 | **Inventory** | Inventory item CRUD, stock adjustments, restock logging, fluid tracking |
| 9 | **Metrics** | Dashboard metrics (today's summary, staff earnings), date-range filtering |
| 10 | **Configuration** | System settings (business hours, tax config, notification preferences), branch management |
| 11 | **Sidebar & Navigation** | Branch selector, role-based UI gating (FlagGate), responsive layout |
| 12 | **My Payroll** | Staff self-service view of payroll entries, requests, and payouts |
| 13 | **My Time Clock** | Personal time clock entries view, clock in/out status |
| 14 | **Profile** | Edit name, phone, email, avatar, instagram handle |
| 15 | **Notifications** | Notification display and management |

### OUT OF Scope (explicitly)
- **Email sending** — Resend integration is skipped (requires actual API calls)
- **File storage / S3** — Final photo upload testing is UI-only (verification that the upload modal opens and submits)
- **Security / Turnstile** — Cloudflare Turnstile bot protection is not tested
- **Performance / Load testing** — Single-user flows only
- **Mobile responsive layout** — Desktop viewport only
- **Cron jobs / scheduled tasks** — Only triggered by cron, not user-facing
- **API routes** — `/api/` endpoints are not tested directly; only user-facing pages
- **Service worker / PWA** — Not tested

### Integration Surfaces Tested

```
Appointments ──→ Sales ──→ Payroll ──→ Accounting
      │              │          │            │
      │              │          │            ├─ General Ledger entries
      │              │          │            ├─ Category reconciliation
      │              │          │            └─ Void/restore paths
      │              │          │
      │              │          ├─ Payroll Entries (auto from transaction)
      │              │          ├─ Payroll Requests (with deductions)
      │              │          └─ Disbursements (staggered payments)
      │              │
      │              ├─ Cash flow tracking
      │              ├─ Downpayment application
      │              └─ Split payments
      │
      ├─ Services catalog
      ├─ Inventory usage (service-item, appointment-item)
      └─ Final photo capture

Time-Clock ←──→ Payroll (attendance tracking, schedule adherence)
```

## 4. Component Architecture (Test Suite Structure)

### Test Account Hierarchy

Four test accounts are required, structured by access level:

| Account ID | Role | Access Flags | Purpose |
|-----------|------|-------------|---------|
| `e2e-admin` | `admin` | *(all by default)* | Full system access — setup, teardown, config changes |
| `e2e-manager` | `manager` | `appointments_manage`, `sales_access`, `payroll_manage`, `accounting_access`, `transactions_manage` | Day-to-day operations, payroll processing |
| `e2e-artist` | `artist` | `appointments_view`, `appointments_manage`, `time_clock_manage` | Appointment delivery, time-clock, limited sales |
| `e2e-staff` | `staff` | `appointments_view`, `time_clock_manage` | View-only appointments, time-clock |

Additionally, each role with hybrid capabilities: the admin account also gets `artist`, `piercing`, `shoe` capability flags.

### Test Data Requirements

Before browser testing begins, the following data must exist (created via seed script or database setup):

1. **Rate Levels:** Standard, Senior, Owner (from `seed-database.ts`)
2. **Branches:** At least 1 branch, e.g. "Main Studio" (code: MAIN)
3. **Payroll Rates:** Templates for all (service_type × client_type × rate_level) combinations
4. **Accounting Categories:** At least 5: REVENUE (Tattoo Services, Piercing Services, Shoe Services, Product Sales) + EXPENSE (Staff Payroll)
5. **Services:** Minimum 4 services — 1 TATTOO, 1 PIERCING, 1 SHOE, 1 OTHER — each with a fixed price
6. **Inventory Items:** Minimum 3 items — 1 ITEM (e.g. "Gloves"), 1 FLUID (e.g. "Black Ink"), 1 PIERCING (e.g. "Stud Earring") — each with selling price and stock quantity
7. **Staff Schedules:** Artist on weekdays 09:00–18:00, Staff on weekdays 10:00–17:00
8. **System Settings:** Default business hours set to 09:00–21:00

### Browser Test Session Structure

Each major subsystem gets its own agent_browser session chain. Sessions are structured as:

```
Session 1: Setup & Auth
  └─ Open app → Login as e2e-admin → Verify sidebar → Snapshot

Session 2: Services & Inventory Setup
  └─ Create services → Create inventory items → Verify in lists

Session 3: Payroll Rate Configuration
  └─ Verify default rates → Add/modify rates → Verify saves

Session 4: Appointment Lifecycle (TATTOO)
  └─ Create appt → Verify PENDING → Confirm → Verify CONFIRMED →
      Mark ONGOING → Verify ONGOING → Complete → Verify COMPLETED →
      Collect payment (Create transaction) → Verify in Sales

Session 5: Appointment Lifecycle (PIERCING + SHOE + OTHER)
  └─ Repeat for each type — test walk-in mode, downpayment collection

Session 6: Walk-in Appointment with Downpayment
  └─ Create walk-in → Request downpayment → Verify DEPOSIT_PAID →
      Complete → Collect balance → Verify PAID_IN_FULL

Session 7: Reschedule & Cancel
  └─ Edit CONFIRMED appointment → Change staff/time →
      Cancel → Recover from CANCELLED

Session 8: Sales Deep Dive
  └─ Multi-item sale → Split payment → Void transaction →
      Refund → Verify accounting impact

Session 9: Payroll Processing
  └─ Verify payroll entries from transactions → Create deduction →
      Create payroll request → Confirm → Disburse (staggered)

Session 10: Accounting Verification
  └─ Verify ledger entries created from transactions →
      Verify ledger entries created from payroll →
      Create manual entry → Void entry

Session 11: Time-Clock
  └─ Generate daily QR → Clock in as artist → Clock out →
      Verify time clock entry → Set staff schedule

Session 12: Metrics & Dashboard
  └─ Verify today's summary → Staff earnings → Date range filtering

Session 13: Configuration & Branch Management
  └─ Business hours → Tax settings → Branch details →
      Access flag gating verification

Session 14: Cleanup
  └─ Disable test accounts → Flag for deletion
```

### Issue Tracking Format

Each defect found must be logged in `/Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd/docs/superpowers/issues/YYYY-MM-DD-issues-log.md` with this structure:

```markdown
### Issue [#001]
- **Subsystem:** Appointments
- **Severity:** HIGH / MEDIUM / LOW
- **Status:** OPEN
- **Description:** [What happens vs what should happen]
- **Steps to Reproduce:**
  1. ...
  2. ...
- **Expected:** 
- **Actual:** 
- **Screenshot:** [path or reference]
- **Notes:**
```

## 5. Data Flow

### Core Pipeline Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    1. APPOINTMENT                            │
│                                                              │
│  Create Appt ──→ PENDING ──→ CONFIRMED ──→ ONGOING ──→     │
│                      ↓                        ↓              │
│                  Cancel ◄─────────────── Cancel              │
│                      ↓                                       │
│                   CANCELLED ──→ Recover ──→ CONFIRMED        │
│                                                              │
│  COMPLETED ──→ Creates Transaction (PENDING status) ──→     │
│       │                ↓                                     │
│       │    Collect Payment ──→ TRANSACTION COMPLETED         │
│       │                ↓                                     │
│       └── Payroll Entries Created ──→ General Ledger Entries│
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    2. PAYROLL FLOW                            │
│                                                              │
│  Transaction Completed                                       │
│       ↓                                                      │
│  Payroll Entry Auto-Created (per service item)               │
│       ↓                                                      │
│  Payroll Request Created (period-based aggregation)          │
│       ↓                                                      │
│  REQUESTED ──→ CONFIRMED ──→ COMPLETED                       │
│       │              │              │                        │
│       │              │         Disbursement(s)               │
│       │              │              │                        │
│       │         Deductions    Staggered Split                │
│       │         Applied                                      │
│       │                                                      │
│  Accounting: Debit Staff Cut (EXPENSE), Credit Cash          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    3. ACCOUNTING FLOW                          │
│                                                              │
│  Source: TRANSACTION (appointment sale)                      │
│  → Debit: Cash/AR  → Credit: Revenue (SALES)                │
│                                                              │
│  Source: PAYROLL (staff payment)                             │
│  → Debit: Staff Payroll (EXPENSE)  → Credit: Cash           │
│                                                              │
│  Source: MANUAL (user-entered)                               │
│  → User-defined debit/credit                                 │
│                                                              │
│  Void: Sets isVoided=true, preserves original entry          │
│  Restore: Sets isVoided=false                                │
└─────────────────────────────────────────────────────────────┘
```

### State Ownership

| State | Location | Lifecycle |
|-------|----------|-----------|
| User session | Better Auth tokens (cookies) + PostgreSQL `session` table | Until logout or expiry |
| Appointment status | PostgreSQL `appointments.status` column | Managed by `setAppointmentStatus` |
| Transaction state | PostgreSQL `transactions` table | Created by `createTransaction` / `createTransactionFromAppointment` |
| Payment tracking | PostgreSQL `transaction_payments` + `appointments.payment_status` | Updated on payment collection |
| Payroll rates | PostgreSQL `payroll_staff_rate` | CRUD via `updateStaffRate` |
| Payroll entries | PostgreSQL `payroll_entry` | Auto-created on transaction completion |
| General ledger | PostgreSQL `general_ledger` | Auto-created + manual via `createLedgerEntry` |
| Branch context | React Context + `branch-storage.ts` (localStorage) | Persisted across page loads |

### Caching Strategy for Testing

- `revalidatePath()` and `revalidateTag()` are called by server actions after mutations
- After every mutation in agent_browser, the flow should **navigate away and back** or **reload the page** to verify persistence
- The `cache.ts` utility may cache server action results — be aware that immediate subsequent calls to the same action may return cached data
- When testing CRUD operations, always refresh the page after the create/update/delete action, then verify the result is visible

## 6. Security & Error Handling

### Authentication/Authorization Model

- **Route-level gating:** Middleware checks session + access flags for protected routes. Admin role bypasses all flag checks.
- **Server action gating:** Each action calls `getCurrentUser()` + appropriate permission check (`canAccessSales`, `canManagePayroll`, etc.)
- **Flag-based UI gating:** `FlagGate` component conditionally renders UI elements based on user's `access_flags`
- **Key test scenarios:**
  1. Staff user cannot access accounting page → verify redirect to `/unauthorized`
  2. Artist cannot process payroll → verify disabled/hidden buttons
  3. Admin can access everything → verify no unexpected blocks

### Input Validation Strategy

- All server actions use Zod schemas for input validation
- Appointments: `CreateAppointmentSchema` validates required fields, time_start < time_end
- Status transitions: `validateStatusTransition()` enforces business rules
- Financial: Non-negative debit/credit enforced at DB constraint level; zero-balance validation for accounting entries
- The testing must verify **negative cases**:
  1. Submit empty forms → expect validation errors
  2. Set time_end before time_start → expect error
  3. Cancel a COMPLETED appointment → verify it's allowed (CANCELLED is valid from COMPLETED)
  4. Create transaction from PENDING appointment → expect failure (only COMPLETED allowed)

### Error Handling Patterns to Test

| Error Scenario | Expected Behavior |
|---------------|-------------------|
| Create appointment with no services | Allowed (appointment without services) |
| Complete appointment without marking ONGOING | Actual transition: PENDING→COMPLETED should fail via UI button gating (only ONGOING→COMPLETED shown) |
| Create transaction from already-billed appointment | Returns existing transaction, not duplicate |
| Void already-voided entry | Should show entry as already voided |
| Payroll request with zero entries | Should allow? Need to verify |
| Clock out without clocking in | Should fail gracefully |
| Access page without permission | Redirect to `/unauthorized` |

### Logging & Monitoring

- All server actions log to `logs` table via `createLogs()` calls
- Errors are logged via `logError()` with type, message, and user context
- During testing, after each major operation, verify the log entry was created (via Logs viewer if accessible, or DB query)

## 7. Migration & Rollback

This testing project does **not** deploy database migrations. It uses the existing schema.

### Setup Procedure

1. Ensure app is running: `bun run dev` (verify at `https://localhost:3000`)
2. Seed baseline data if not already present: `bun run db:seed`
3. Generate test invitations: Run `scripts/setup-database.ts` or manually create invites for all 4 test accounts
4. Register each account through the browser (agent_browser fills the registration form)
5. Verify all accounts can log in

### Cleanup Procedure

After testing is complete:

1. Set all test accounts to `is_active = false` via database
2. Optionally mark test appointments/transactions with a `notes` field containing "TEST: E2E Testing"
3. Do **not** delete test data — it may be referenced by other records (appointments, transactions, payroll entries)
4. The issue log document is the deliverable — preserved in `docs/superpowers/issues/`

### Rollback Strategy

If testing corrupts data:
- Transaction data: Use the existing void/refund flows through the UI to undo
- Payroll data: Cancel payroll requests through the UI
- Appointment data: Cancel appointments through the UI
- For irreversible corruption: Restore from the last database backup (if available)

## 8. Open Questions

| # | Question | Resolution Needed |
|---|----------|-------------------|
| 1 | Does the app use HTTPS locally? The dev command uses `--experimental-https` — verify the local URL is `https://localhost:3000` and handle self-signed cert in agent_browser | First test session |
| 2 | What is the current state of the database? Does it already have data from prior development? Run `scripts/check-all-tables.ts` before seeding | Before session 1 |
| 3 | Does the invitation flow require SMTP/Resend to be configured? If Resend is down, can we bypass it for testing? | First test session |
| 4 | Are there any rate limits on the auth endpoints that could block repeated test logins? (There's a `rate-limit.ts` utility) | First test session |
| 5 | Is the `app/test` directory purely manual? The AGENTS.md mentions it — verify it exists and contains any test pages | Before session 1 |

---

## Appendices

### A. Complete Status Transition Matrix

```
Current Status    →    Valid Next States
─────────────────────────────────────────
PENDING           →    CONFIRMED, CANCELLED
CONFIRMED         →    ONGOING, CANCELLED
ONGOING           →    COMPLETED, CANCELLED
COMPLETED         →    CANCELLED
CANCELLED         →    CONFIRMED, PENDING
```

### B. Payment Status Transition Matrix

```
Current Status    →    Valid Next States
─────────────────────────────────────────
UNPAID            →    DEPOSIT_PAID, PAID_IN_FULL
DEPOSIT_PAID      →    PAID_IN_FULL, REFUNDED
PAID_IN_FULL      →    REFUNDED
REFUNDED          →    (terminal — no further transitions)
```

### C. Payroll Request Status Matrix

```
Current Status    →    Valid Next States
─────────────────────────────────────────
REQUESTED         →    CONFIRMED, CANCELLED
CONFIRMED         →    COMPLETED, CANCELLED
COMPLETED         →    (terminal — no further transitions)
CANCELLED         →    (terminal — no further transitions)
```

### D. Key UI Components to Interact With

| Component | File | Purpose |
|-----------|------|---------|
| AppointmentActionBar | `components/appointments/AppointmentActionBar.tsx` | Status transition buttons |
| CompleteAppointmentModal | `components/appointments/completeAppointmentModal.tsx` | Final photo + complete flow |
| WalkinAppointmentModal | `components/appointments/WalkinAppointmentModal.tsx` | Walk-in creation with downpayment |
| AppointmentPaymentSection | `components/appointments/AppointmentPaymentSection.tsx` | Payment status display |
| Sidebar | `components/sidebar.tsx` | Navigation + branch selector |
| FlagGate | `components/accessChecker.tsx` | Permission-gated UI rendering |

### E. Server Action Map (Testing Reference)

| Action | File | Input | Output |
|--------|------|-------|--------|
| `createAppointment` | `server/actions/appointments.ts` | title, time_start, time_end, type, staff_id, ... | ActionResponse<Appointment> |
| `updateAppointment` | same | id + partial fields | ActionResponse<Appointment> |
| `setAppointmentStatus` | same | id, status | ActionResponse<Appointment> |
| `createTransactionFromAppointment` | `server/actions/sales.ts` | appointmentId | ActionResponse<CreateTransactionFromAppointmentResult> |
| `calculateAndCreatePayrollEntry` | `server/actions/payroll.ts` | transactionId, serviceId, staffId, ... | ActionResponse<PayrollEntry> |
| `createAutoLedgerEntry` | `server/actions/accounting.ts` | sourceType, sourceId, entryData, userId, tx | ActionResponse<void> |
| `createDownpayment` | `server/actions/downpayments.ts` | transaction_id, amount, downpaymentType, ... | Downpayment |
