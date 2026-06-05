# Remaining E2E Issues Fix — Implementation Plan

> **For agentic workers:** This plan fixes the 7 remaining issues from the 14-session E2E testing cycle. Every task follows strict TDD: RED → GREEN → REFACTOR → COMMIT.

**Target issues:** #004 (HIGH), #010 (MEDIUM), #007 (LOW), #006 (LOW), #009 (LOW), #005 (MEDIUM), #008 (LOW)

**Prerequisites:** `bun run dev` running at `http://localhost:3000`, E2E accounts active, database seeded with `[E2E]` data.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `server/actions/appointments.ts:156-177` | Modify | Add `payment_status`, `downpayment_id`, `downpayment_amount`, `downpayment_collected_at` to `transformAppointment()` |
| `middleware.ts:64-75` | Modify | Add `isActive` check after `accessFlags` query |
| `components/appointments/AppointmentActionBar.tsx:82` | Modify | Change `isAssignedStaff` → `isStaff` for Cancel button |
| `components/appointments/WalkinAppointmentModal.tsx:684-688` | Modify | Add `stopPropagation` to deposit checkbox onChange |
| `server/actions/sales.ts:215-275` | Verify | Confirm payroll creation flow covers all transaction paths |
| `components/appointments/AppointmentActionBar.tsx:46-135` | Modify | Add `data-testid` attributes to all action buttons |

---

## Phase 1: Foundation — Payment Field Mapping (Issue #004)

> **Deliverable:** `transformAppointment()` returns `payment_status`, `downpayment_id`, `downpayment_amount`, `downpayment_collected_at`. Appointment detail page shows correct payment status.

---

### Task 1: Add Payment Fields to transformAppointment()

**Files:**
- Modify: `server/actions/appointments.ts:156-177` (add 4 field mappings)

**Dependencies:** None

**TDD Cycle:**

- [ ] **RED: Verify the current transformAppointment() omits payment fields**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && sed -n '156,177p' server/actions/appointments.ts
  ```
  Expected output (no payment fields in return):
  ```typescript
  function transformAppointment(raw: typeof appointments.$inferSelect): Appointment {
      return {
          id: raw.id,
          created_at: raw.createdAt,
          title: raw.title,
          client_id: raw.clientId || undefined,
          staff_id: raw.staffId || null,
          branch_id: raw.branchId,
          time_start: raw.timeStart,
          time_end: raw.timeEnd,
          actual_time_start: raw.actualTimeStart || undefined,
          actual_time_end: raw.actualTimeEnd || undefined,
          status: raw.status as AppointmentStatus,
          notes: raw.notes || undefined,
          type: raw.type as AppointmentType | null,
          is_active: raw.isActive,
          is_walkin: raw.isWalkin,
          client_name: raw.clientName || undefined,
          client_phone: raw.clientPhone || undefined,
          client_email: raw.clientEmail || undefined,
      }
  }
  ```

  **Confirmation:** No mention of `payment_status`, `downpayment_id`, `downpayment_amount`, or `downpayment_collected_at`. These 4 fields exist in the DB schema (`server/db/schema/appointments.ts:59-62`) and the `Appointment` interface (`utils/types/general.ts:66-69`), but are not mapped in `transformAppointment()`.

- [ ] **RED: Run typecheck to establish baseline**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run typecheck
  ```
  Expected: PASS — 0 errors. The optional fields in `Appointment` mean TypeScript won't error on the missing mappings, but the runtime behavior is broken.

- [ ] **GREEN: Write minimal implementation**

  Read `server/actions/appointments.ts` to confirm exact line numbers, then use the `edit` tool to replace the `transformAppointment` function body.

  **Old (lines 156-177):**
  ```typescript
  function transformAppointment(raw: typeof appointments.$inferSelect): Appointment {
      return {
          id: raw.id,
          created_at: raw.createdAt,
          title: raw.title,
          client_id: raw.clientId || undefined,
          staff_id: raw.staffId || null,
          branch_id: raw.branchId,
          time_start: raw.timeStart,
          time_end: raw.timeEnd,
          actual_time_start: raw.actualTimeStart || undefined,
          actual_time_end: raw.actualTimeEnd || undefined,
          status: raw.status as AppointmentStatus,
          notes: raw.notes || undefined,
          type: raw.type as AppointmentType | null,
          is_active: raw.isActive,
          is_walkin: raw.isWalkin,
          client_name: raw.clientName || undefined,
          client_phone: raw.clientPhone || undefined,
          client_email: raw.clientEmail || undefined,
      }
  }
  ```

  **New (add 4 fields between `client_email` and closing `}`):**
  ```typescript
  function transformAppointment(raw: typeof appointments.$inferSelect): Appointment {
      return {
          id: raw.id,
          created_at: raw.createdAt,
          title: raw.title,
          client_id: raw.clientId || undefined,
          staff_id: raw.staffId || null,
          branch_id: raw.branchId,
          time_start: raw.timeStart,
          time_end: raw.timeEnd,
          actual_time_start: raw.actualTimeStart || undefined,
          actual_time_end: raw.actualTimeEnd || undefined,
          status: raw.status as AppointmentStatus,
          notes: raw.notes || undefined,
          type: raw.type as AppointmentType | null,
          is_active: raw.isActive,
          is_walkin: raw.isWalkin,
          client_name: raw.clientName || undefined,
          client_phone: raw.clientPhone || undefined,
          client_email: raw.clientEmail || undefined,
          // Payment tracking (Issue #004 fix)
          payment_status: raw.paymentStatus as PaymentStatus,
          downpayment_id: raw.downpaymentId || null,
          downpayment_amount: raw.downpaymentAmount ? Number(raw.downpaymentAmount) : null,
          downpayment_collected_at: raw.downpaymentCollectedAt || null,
      }
  }
  ```

  **Note:** `PaymentStatus` is already imported at the top of the file (check by running `grep "PaymentStatus" server/actions/appointments.ts`). If not imported, add: `import { PaymentStatus } from "@/utils/types/general"`.

- [x] **GREEN: Verify SQL queries already select payment columns**

  The existing queries use `.select({ appointment: appointments })` with the full table object, which Drizzle translates to `SELECT *` — all columns including `payment_status`, `downpayment_id`, `downpayment_amount`, `downpayment_collected_at` are already selected. No SQL query changes needed.

  Confirm by checking the schema:
  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && sed -n '59,62p' server/db/schema/appointments.ts
  ```
  Expected output:
  ```typescript
      downpaymentId: text('downpayment_id'),
      downpaymentAmount: numeric('downpayment_amount', { precision: 12, scale: 2 }),
      downpaymentCollectedAt: timestamp('downpayment_collected_at'),
      paymentStatus: text('payment_status', { enum: ['UNPAID', 'DEPOSIT_PAID', 'PAID_IN_FULL', 'REFUNDED'] }).default('UNPAID'),
  ```

- [x] **GREEN: Verify typecheck passes**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run typecheck
  ```
  Expected: PASS — 0 errors. `PaymentStatus` type is imported, `Appointment` interface already has the optional fields, and `typeof appointments.$inferSelect` provides the camelCase JS properties.

- [x] **REFACTOR: Run lint**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint
  ```
  Expected: PASS or only pre-existing issues (the 2 `<a>` tag warnings in `dashboardClient.tsx`, `any` errors in `e2e-setup.ts`).

- [x] **GREEN: Verify with live DB — check a known appointment with payment data**

  First, ensure a test appointment has payment data set:
  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
  # Check if any appointments have payment_status != UNPAID
  psql "$DATABASE_URL" -c "SELECT id, title, payment_status, downpayment_amount FROM appointments WHERE payment_status != 'UNPAID' LIMIT 5;"
  ```
  
  If none exist, set one up for testing:
  ```bash
  psql "$DATABASE_URL" -c "UPDATE appointments SET payment_status = 'DEPOSIT_PAID', downpayment_amount = 500 WHERE is_walkin = true LIMIT 1;"
  ```

  Then verify through the app by navigating to the appointment detail page — the payment section should now show the correct status.

- [x] **Commit**

  ```bash
  git add server/actions/appointments.ts
  git commit -m "fix: map payment_status and downpayment fields in transformAppointment (Task 1 — Issue #004)"
  ```

---

## Phase 2: Core Logic — isActive Enforcement + Payroll Flow (Issues #010, #009)

> **Deliverable:** Deactivated accounts blocked at middleware level. Payroll entries guaranteed for all transaction creation paths.

---

### Task 2: Add isActive Enforcement to Middleware

**Files:**
- Modify: `middleware.ts:64-75` (add `isActive` to the existing user profile query + redirect check)

**Dependencies:** None (independent of Task 1)

**TDD Cycle:**

- [x] **RED: Verify current middleware does NOT check isActive**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && sed -n '64,75p' middleware.ts
  ```
  Expected output (current query only selects `accessFlags`):
  ```typescript
      const [userProfile] = await db
          .select({ access_flags: userTable.accessFlags })
          .from(userTable)
          .where(eq(userTable.id, user.id))
          .limit(1)

      if (!userProfile) {
          return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
  ```

  **Confirmation:** `isActive` is not queried and not checked. Deactivated accounts pass through without restriction.

- [x] **RED: Verify isActive is NOT checked anywhere in middleware**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && grep -n "isActive\|is_active" middleware.ts
  ```
  Expected: No matches. The middleware has zero references to `isActive`.

- [x] **GREEN: Write minimal implementation**

  Read the full `middleware.ts` to confirm exact line numbers, then use the `edit` tool to make TWO changes:

  **Change 1 — Add `isActive` to the existing DB query (line ~66-68):**

  Old:
  ```typescript
      const [userProfile] = await db
          .select({ access_flags: userTable.accessFlags })
          .from(userTable)
          .where(eq(userTable.id, user.id))
          .limit(1)
  ```

  New:
  ```typescript
      const [userProfile] = await db
          .select({
              access_flags: userTable.accessFlags,
              is_active: userTable.isActive,
          })
          .from(userTable)
          .where(eq(userTable.id, user.id))
          .limit(1)
  ```

  **Change 2 — Add isActive check after the user-not-found check (line ~71-74):**

  Old:
  ```typescript
      if (!userProfile) {
          return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
  ```

  New:
  ```typescript
      if (!userProfile) {
          return NextResponse.redirect(new URL('/unauthorized', request.url))
      }

      // Block deactivated accounts
      if (!userProfile.is_active) {
          const signOut = new URL('/auth', request.url)
          signOut.searchParams.set('error', 'account_disabled')
          return NextResponse.redirect(signOut)
      }
  ```

  **Why the extra DB call is avoided:** The existing query already fetches `userProfile` from the user table. Adding `is_active: userTable.isActive` to the `.select()` reuses that same query — zero additional DB round-trips. The `isActive` column (`server/db/schema/auth.ts:39`) is a `boolean` with `default(true)`.

- [x] **GREEN: Verify typecheck passes**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run typecheck
  ```
  Expected: PASS — `userTable.isActive` is typed as `boolean`, so `is_active` in the query result is `boolean | null`. The `!` check handles `null`/`false` correctly.

- [x] **GREEN: Verify lint passes**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run lint
  ```
  Expected: PASS or only pre-existing issues.

- [x] **REFACTOR: Verify deactivated user redirect works end-to-end**

  After the dev server is restarted with the change:
  1. Set an E2E account to `isActive = false` via SQL:
     ```bash
     psql "$DATABASE_URL" -c "UPDATE \"user\" SET is_active = false WHERE email = 'e2e-staff@rdmdstudio.com';"
     ```
  2. Login as that user via browser
  3. **Expected:** Redirected to `/auth?error=account_disabled`
  4. Restore the account:
     ```bash
     psql "$DATABASE_URL" -c "UPDATE \"user\" SET is_active = true WHERE email = 'e2e-staff@rdmdstudio.com';"
     ```

- [x] **Commit**

  ```bash
  git add middleware.ts
  git commit -m "fix: enforce isActive flag in middleware to block deactivated accounts (Task 2 — Issue #010)"
  ```

---

### Task 3: Verify Payroll Entry Creation in Business Flow (Issue #009)

**Files:**
- Verify only: `server/actions/sales.ts:215-275` (confirm payroll created for all transaction paths)

**Dependencies:** None (read-only verification)

**TDD Cycle:**

- [x] **RED: This task has no failing test — it verifies the business flow is correct**

  Issue #009 was logged because payroll entries weren't created for SQL-inserted transactions. The payroll creation lives in the application checkout flow (`server/actions/sales.ts:218-247`), which is the CORRECT design — payroll stays in the app layer.

- [x] **GREEN: Verify payroll creation is part of the transaction checkout flow**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && sed -n '215,250p' server/actions/sales.ts
  ```
  Expected: Shows `calculateAndCreatePayrollEntry` called with `appointmentType`, `serviceType`, `staffId`, `grossAmount` for each service in the transaction. This covers the normal checkout path.

- [x] **GREEN: Verify the only transaction creation path**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && grep -n "export async function create\|insert.*transactions" server/actions/sales.ts
  ```
  Expected: The main `createTransaction` export is the single entry point for creating transactions. All transaction-creation UI goes through this function.

- [x] **GREEN: Verify the WalkinAppointmentModal also goes through the same flow**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && grep -n "createTransaction\|createWalkin" components/appointments/WalkinAppointmentModal.tsx | head -10
  ```
  Expected: WalkinAppointmentModal calls either `createTransaction` or `createWalkinAppointment` server actions, which internally call `calculateAndCreatePayrollEntry`.

- [x] **REFACTOR: Document the design decision**

  The payroll creation belongs in the application checkout flow. Direct SQL inserts bypass this intentionally — they're admin/diagnostic tools, not the normal user path. No code changes needed.

  Add a note to the issue log:
  ```bash
  echo -e "\n### Issue #009 — RESOLVED (design decision)\n- **Resolution:** Payroll entry creation is correctly placed in the application checkout flow (`server/actions/sales.ts`). Direct SQL inserts intentionally bypass application logic. All UI-driven transaction paths go through `createTransaction` which calls `calculateAndCreatePayrollEntry`." >> docs/superpowers/issues/2026-05-25-issues-log.md
  ```

- [x] **Commit**

  ```bash
  git add docs/superpowers/issues/2026-05-25-issues-log.md
  git commit -m "verify: confirm payroll creation is in app business flow, not DB triggers (Task 3 — Issue #009)"
  ```

---

## Phase 3: UI Fixes — Cancel Button + Checkbox (Issues #007, #006)

> **Deliverable:** Cancel button visible to all staff (not just assigned). Deposit checkbox no longer closes modal on browser click.

---

### Task 4: Fix Cancel Button Permission (isAssignedStaff → isStaff)

**Files:**
- Modify: `components/appointments/AppointmentActionBar.tsx:82` (one-line change)

**Dependencies:** None (independent)

**TDD Cycle:**

- [x] **RED: Verify current Cancel button uses isAssignedStaff**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && sed -n '80,88p' components/appointments/AppointmentActionBar.tsx
  ```
  Expected output:
  ```typescript
              {/* Cancel (from CONFIRMED or ONGOING) */}
              {isAssignedStaff && (appointment.status === "CONFIRMED" || appointment.status === "ONGOING") && (
                  <button onClick={() => onStatusChange("CANCELLED")}
                      className="px-3 py-1.5 bg-red-400/20 hover:bg-red-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                      <XIcon size={16} /> Cancel
                  </button>
              )}
  ```

  **Confirmation:** `isAssignedStaff` means only the explicitly assigned staff member can cancel. A manager who isn't the assigned staff cannot see the Cancel button.

- [x] **GREEN: Write minimal implementation**

  Change `isAssignedStaff` to `isStaff` on line 82:

  **Old (line 82):**
  ```typescript
              {isAssignedStaff && (appointment.status === "CONFIRMED" || appointment.status === "ONGOING") && (
  ```

  **New:**
  ```typescript
              {isStaff && (appointment.status === "CONFIRMED" || appointment.status === "ONGOING") && (
  ```

  **Rationale:** `isStaff` is already passed as a prop to `AppointmentActionBar` (line 12: `isStaff: boolean`). It's `true` for admin, manager, artist, and staff roles. The "Start Session" and "Complete" buttons already use `isStaff` at lines 46, 57, 68, and 98, so the Cancel button using `isAssignedStaff` is an inconsistency. This change aligns Cancel with the other action buttons.

- [x] **GREEN: Verify the CANCELLED recovery button already uses isStaff**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && sed -n '90,95p' components/appointments/AppointmentActionBar.tsx
  ```
  Expected: The "Recover" button (line ~91) uses only `appointment.status === "CANCELLED"` — no staff check at all. Since the `AppointmentActionBar` component is only rendered when the user has appointment access, this is fine.

- [x] **GREEN: Verify typecheck and lint pass**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run typecheck && bun run lint
  ```
  Expected: PASS — `isStaff` is already a typed prop on the component, no type changes needed.

- [x] **REFACTOR: Check for other isAssignedStaff-only buttons**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && grep -n "isAssignedStaff" components/appointments/AppointmentActionBar.tsx
  ```
  Expected: Only the Cancel button at line 82 used `isAssignedStaff`. After the fix, zero references remain.

- [x] **Commit**

  ```bash
  git add components/appointments/AppointmentActionBar.tsx
  git commit -m "fix: change cancel button from isAssignedStaff to isStaff (Task 4 — Issue #007)"
  ```

---

### Task 5: Fix Checkbox Event Propagation in WalkinAppointmentModal

**Files:**
- Modify: `components/appointments/WalkinAppointmentModal.tsx:684-688` (add `stopPropagation`)

**Dependencies:** None (independent)

**TDD Cycle:**

- [x] **RED: Verify the current checkbox onChange does NOT call stopPropagation**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && sed -n '682,690p' components/appointments/WalkinAppointmentModal.tsx
  ```
  Expected output:
  ```typescript
                                      <label className='flex items-center gap-2 cursor-pointer'>
                                          <input
                                              type='checkbox'
                                              checked={collectDownpayment}
                                              onChange={(e) => setCollectDownpayment(e.target.checked)}
                                              className='w-4 h-4 rounded'
                                          />
                                          <span className='text-sm font-medium'>Collect deposit</span>
                                      </label>
  ```

  **Confirmation:** The `onChange` handler does NOT call `e.stopPropagation()`. When agent-browser dispatches a click/check event on this checkbox, the event bubbles up to the `<label>` (which toggles the checkbox again) and potentially to the modal backdrop, closing the modal.

- [x] **GREEN: Write minimal implementation**

  Add `stopPropagation()` to the onChange handler:

  **Old (line 686):**
  ```typescript
                                              onChange={(e) => setCollectDownpayment(e.target.checked)}
  ```

  **New:**
  ```typescript
                                              onChange={(e) => { e.stopPropagation(); setCollectDownpayment(e.target.checked) }}
  ```

  **Rationale:** `e.stopPropagation()` prevents the event from bubbling up to the `<label>` and the modal backdrop. This is a one-line fix that doesn't change any behavior for real users (manual clicks on labels don't typically cause this issue since browsers handle label/input interaction natively).

- [x] **GREEN: Verify typecheck and lint pass**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run typecheck && bun run lint
  ```
  Expected: PASS — `stopPropagation` is a standard React synthetic event method, no type changes needed.

- [x] **Commit**

  ```bash
  git add components/appointments/WalkinAppointmentModal.tsx
  git commit -m "fix: add stopPropagation to deposit checkbox onChange (Task 5 — Issue #006)"
  ```

---

## Phase 4: Browser Automation Hardening (Issues #005, #008)

> **Deliverable:** All appointment action buttons have stable `data-testid` attributes for browser automation. Missing screenshots captured for scripts 08-10.

---

### Task 6: Add data-testid Attributes to Appointment Action Buttons

**Files:**
- Modify: `components/appointments/AppointmentActionBar.tsx:46-135` (add `data-testid` to all action buttons)

**Dependencies:** Task 4 (Cancel button already fixed — adds testid to the corrected button)

**TDD Cycle:**

- [x] **RED: Verify current action buttons have no data-testid attributes**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && grep -n "data-testid" components/appointments/AppointmentActionBar.tsx
  ```
  Expected: No matches. The agent-browser has no stable selectors for these server-action buttons.

- [x] **GREEN: Write minimal implementation**

  Read the full `AppointmentActionBar.tsx` component to confirm exact line locations, then add `data-testid` attributes to each action button. Use the `edit` tool for precise replacements.

  Add the following `data-testid` attributes:

  **Line 46-55 — "Start Session" button:**
  ```typescript
              {isStaff && appointment.status === "CONFIRMED" && (
                  <button onClick={() => onStatusChange("ONGOING")}
                      data-testid="appt-action-start-session"
                      className="px-3 py-1.5 bg-blue-400/20 hover:bg-blue-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                      <PlayIcon size={16} /> Start Session
                  </button>
              )}
  ```

  **Line 57-67 — "Complete" button:**
  ```typescript
              {isStaff && appointment.status === "ONGOING" && (
                  <button onClick={() => onStatusChange("COMPLETED")}
                      data-testid="appt-action-complete"
                      className="px-3 py-1.5 bg-green-400/20 hover:bg-green-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                      <CheckIcon size={16} /> Complete
                  </button>
              )}
  ```

  **Line 68-79 — "Confirm" button (PENDING → CONFIRMED):**
  ```typescript
              {appointment.status === "PENDING" && isStaff && (
                  <button onClick={() => onStatusChange("CONFIRMED")}
                      data-testid="appt-action-confirm"
                      className="px-3 py-1.5 bg-yellow-400/20 hover:bg-yellow-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                      <CheckIcon size={16} /> Confirm
                  </button>
              )}
  ```

  **Line 82-87 — "Cancel" button:**
  ```typescript
              {isStaff && (appointment.status === "CONFIRMED" || appointment.status === "ONGOING") && (
                  <button onClick={() => onStatusChange("CANCELLED")}
                      data-testid="appt-action-cancel"
                      className="px-3 py-1.5 bg-red-400/20 hover:bg-red-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                      <XIcon size={16} /> Cancel
                  </button>
              )}
  ```

  **Line 91-96 — "Recover" button (CANCELLED → CONFIRMED):**
  ```typescript
              {appointment.status === "CANCELLED" && (
                  <button onClick={() => onStatusChange("CONFIRMED")}
                      data-testid="appt-action-recover"
                      className="px-3 py-1.5 bg-orange-400/20 hover:bg-orange-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                      <RotateCcwIcon size={16} /> Recover
                  </button>
              )}
  ```

  **Line 98-105 — "Edit" button (CONFIRMED only):**
  ```typescript
              {isStaff && appointment.status === "CONFIRMED" && !isEditing && (
                  <button onClick={onEditStart}
                      data-testid="appt-action-edit"
                      className="px-3 py-1.5 bg-yellow-400/20 hover:bg-yellow-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                      <PencilIcon size={16} /> Edit
                  </button>
              )}
  ```

  **Line ~130 — "Collect Balance" button (COMPLETED + DEPOSIT_PAID):**
  ```typescript
              {appointment.status === "COMPLETED" && appointment.payment_status === "DEPOSIT_PAID" && (
                  <button onClick={() => onCreateTransaction()}
                      data-testid="appt-action-collect-balance"
                      className="px-3 py-1.5 bg-purple-400/20 hover:bg-purple-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                      <DollarSignIcon size={16} /> Collect Balance
                  </button>
              )}
  ```

- [x] **GREEN: Verify typecheck and lint pass**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && bun run typecheck && bun run lint
  ```
  Expected: PASS — `data-testid` is a standard HTML attribute, fully typed in React 19 JSX.

- [x] **REFACTOR: Verify correct syntax**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd && grep -c "data-testid" components/appointments/AppointmentActionBar.tsx
  ```
  Expected: At least 7 matches (one per action button).

- [x] **Commit**

  ```bash
  git add components/appointments/AppointmentActionBar.tsx
  git commit -m "feat: add data-testid attributes to appointment action buttons (Task 6 — Issue #005)"
  ```

---

## Phase 5: Verification (Issue #008)

> **Deliverable:** All fixes browser-verified with screenshots. Coverage report updated.

---

### Task 7: Browser-Verify All Fixes + Capture Missing Screenshots

**Files:**
- Update: `docs/superpowers/issues/2026-05-25-issues-log.md`
- Update: `docs/superpowers/issues/2026-05-25-coverage-report.md`
- Create: `docs/superpowers/screenshots/fix-004-payment-status.png`
- Create: `docs/superpowers/screenshots/fix-010-isactive-blocked.png`

**Dependencies:** Tasks 1-6 (all fixes must be committed before verification)

**TDD Cycle:**

- [x] **RED: Restart dev server with all fixes applied**

  ```bash
  cd /Users/adrianbonpin/Documents/Code/devgo/inksight-rdmd
  kill -9 $(lsof -ti :3000) 2>/dev/null || true
  sleep 2
  bun run dev &
  # Wait for server to be ready
  for i in $(seq 1 30); do
    if curl -sk https://localhost:3000 2>/dev/null | head -c 100 | grep -q .; then echo "Server ready"; break; fi
    sleep 1
  done
  ```

- [x] **GREEN: Verify Issue #004 — Payment Status Display**

  Login as e2e-manager via agent-browser (`/opt/homebrew/bin/agent-browser`), navigate to an appointment that has `DEPOSIT_PAID` status (set via SQL if needed), and verify the detail page shows "Deposit Paid" instead of "Unpaid".

  ```bash
  /opt/homebrew/bin/agent-browser close 2>/dev/null || true
  /opt/homebrew/bin/agent-browser open --profile Default --ignore-https-errors "https://localhost:3000/auth"
  /opt/homebrew/bin/agent-browser snapshot -i
  # Fill e2e-manager credentials, login
  # Navigate to an appointment detail page with payment data
  /opt/homebrew/bin/agent-browser screenshot docs/superpowers/screenshots/fix-004-payment-status.png
  ```

  **Expected:** Payment section shows actual status (DEPOSIT_PAID, PAID_IN_FULL, etc.) with deposit amount, not the default "Unpaid".

- [x] **GREEN: Verify Issue #010 — isActive Enforcement**

  1. Set e2e-staff to isActive=false via SQL
  2. Login as e2e-staff via browser
  3. **Expected:** Redirected to `/auth?error=account_disabled`
  4. Take screenshot: `fix-010-isactive-blocked.png`
  5. Restore: set isActive=true

- [x] **GREEN: Verify Issue #007 — Cancel Button Visible to Manager**

  Login as e2e-manager, navigate to an appointment detail where the manager is NOT the assigned staff. **Expected:** Cancel button is visible (previously hidden).

- [x] **GREEN: Verify Issue #005 — data-testid Attributes**

  Login as e2e-manager, navigate to an appointment detail, snapshot the page.
  ```bash
  /opt/homebrew/bin/agent-browser snapshot -i
  ```
  Expected: Snapshot output includes `data-testid` attributes like `appt-action-start-session`, `appt-action-complete`, etc. — stable automation selectors now available.

- [x] **GREEN: Capture Screenshots for Scripts 08-10 (Issue #008)**

  Login as e2e-manager, navigate to:
  1. `/sales` → screenshot: `script08-sales-verified.png`
  2. `/payroll` → screenshot: `script09-payroll-verified.png`
  3. `/accounting` → screenshot: `script10-accounting-verified.png`

  (These were previously captured as `script08-sales-page.png`, `script09-payroll-page.png`, `script10-accounting-page.png` in the last cycle — verify they still load with the created data.)

- [x] **REFACTOR: Update documentation**

  1. Update issue log:
     - Mark Issue #004 → RESOLVED
     - Mark Issue #010 → RESOLVED
     - Mark Issue #007 → RESOLVED
     - Mark Issue #006 → RESOLVED
     - Mark Issue #005 → RESOLVED
     - Mark Issue #009 → RESOLVED (design decision)
     - Mark Issue #008 → RESOLVED (screenshots captured)

  2. Update coverage report: payment status → ✅, auth gating → ✅

- [x] **Commit**

  ```bash
  git add docs/superpowers/screenshots/ docs/superpowers/issues/
  git commit -m "verify: browser-verify remaining issue fixes — #004, #010, #007, #006, #005, #009, #008 (Task 7 — FINAL)"
  ```

---

## Summary

| Task | Issue | Fix | Files |
|------|-------|-----|-------|
| 1 | #004 (HIGH) | Map payment fields in `transformAppointment()` | `server/actions/appointments.ts` |
| 2 | #010 (MEDIUM) | Add `isActive` check to middleware | `middleware.ts` |
| 3 | #009 (LOW) | Verify payroll in business flow (no code change) | `server/actions/sales.ts` (verify) |
| 4 | #007 (LOW) | `isAssignedStaff` → `isStaff` for Cancel | `AppointmentActionBar.tsx` |
| 5 | #006 (LOW) | `stopPropagation` on deposit checkbox | `WalkinAppointmentModal.tsx` |
| 6 | #005 (MEDIUM) | `data-testid` on action buttons | `AppointmentActionBar.tsx` |
| 7 | #008 (LOW) | Browser-verify all fixes + screenshots | Screenshots + issue log |
