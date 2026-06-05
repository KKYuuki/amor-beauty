# Architectural Spec: Remove Working Hours Guard & Lock from Appointments

**Date:** 2026-05-23
**Status:** Finalized
**Scope:** Server actions only — no DB schema changes, no migration, no component restructuring

---

## 1. Objective

Remove every constraint from appointment creation/update **except** the overlap (collision) check when a staff member is assigned. The only validation that must survive is: *"no two active, non-cancelled appointments may overlap for the same staff member."*

---

## 2. Constraints to Remove (Source of Truth)

### 2.1 Remove `checkStaffAvailability` — The "Working Hours Guard"

**Definition:** An async function that queries `staff_schedules` for the assigned staff member's `start_time` / `end_time` on the appointment's day of week, then rejects the appointment if its time window falls outside that schedule.

**Files & call sites:**

| File | Function | Line(s) |
|---|---|---|
| `server/actions/appointments.ts` | `createAppointment()` | ~716–726 |
| `server/actions/appointments.ts` | `updateAppointment()` | ~925–935 |
| `server/actions/appointments.ts` | `createWalkinAppointment()` | ~1701–1711 |

**What it currently rejects:**
- Staff not scheduled for that day of week → `"Staff member is not scheduled for this day"`
- Appointment starts before schedule start or ends after schedule end → `"Appointment is outside working hours (HH:MM - HH:MM)"`

**Post-removal behaviour:** All time slots are accepted regardless of the staff member's personal schedule.

### 2.2 Remove `isWithinBusinessHours` — The "Business Hours Lock"

**Definition:** An async function in `server/actions/settings.ts` (line 265) that reads the `business_hours` system setting (with optional `branch_overrides`) and rejects appointments whose window falls outside the venue's defined open/close times.

**Files & call sites:**

| File | Function | Line(s) |
|---|---|---|
| `server/actions/appointments.ts` | `createAppointment()` | ~728–736 |
| `server/actions/appointments.ts` | `updateAppointment()` | ~957–965 |
| `server/actions/appointments.ts` | `createWalkinAppointment()` | ~1713–1721 |

**What it currently rejects:**
- Business closed on that day → `"Business is closed on this day"`
- Appointment starts before opening → `"Business opens at HH:MM"`
- Appointment ends after closing → `"Business closes at HH:MM"`

**Post-removal behaviour:** Any time-of-day is accepted regardless of global business hours.

### 2.3 Constraints That Must Survive

| Constraint | Keep? | Reason |
|---|---|---|
| Staff-collision (overlap) check inside **transaction** | **YES** | This is the only remaining guard; prevents double-booking |
| `validateStaffId()` | **YES** | Ensures assigned staff exists and is active |
| `validateBranchId()` | **YES** | Soft validation — branch is optional |
| `validateStatusTransition()` | **YES** | Governs valid state flows (PENDING→CONFIRMED→ONGOING→COMPLETED) |
| Auth guard (`requireStaffAuth()`) | **YES** | Protects write access |
| Zod input validation (schema) | **YES** | Ensures data shape/time-order correctness |

---

## 3. Security Analysis

### 3.1 Risk: Unbounded Appointment Windows

**Scenario:** A staff member with a defined schedule of 10:00–18:00 could be booked for a 22:00–02:00 appointment.

**Mitigation:** This is the intended design. The overlap check is the only remaining gate. If management wants to prevent this, they must manage it through staff scheduling discipline or re-introduce a lighter check later.

**Acceptance:** **Accepted** — the user specifically asked for this.

### 3.2 Risk: Race Condition on Overlap Check

**Current protection:** The overlap query and the `INSERT` happen inside a `db.transaction()`. This is already correct and must not be weakened.

**Verification:** Lines 738–770 (`createAppointment`), lines 970–987 (`updateAppointment`), lines 1723–1755 (`createWalkinAppointment`) all use transactions.

**Acceptance:** No change required.

### 3.3 Risk: No Notification When Overlap Occurs

**Current behaviour:** The overlap check throws a human-readable error describing the conflicting time window.

**Acceptance:** This is sufficient. No change required.

### 3.4 Risk: Implicit Dependency on `getStaffSchedule` in the Frontend

**Observation:** The `WalkinAppointmentModal` component calls `getStaffSchedule(staffId)` to filter available time slots in the UI dropdown. This is a **pure UI convenience** — it does not enforce any guard.

**Recommendation:** Leave the frontend filtering as-is. If a staff member has no schedule for a day, the UI shows a yellow warning (`⚠ No schedule found for this day. Times may be outside working hours.`). Removing this entirely or modifying it is **out of scope** for this spec but should be considered a follow-up cosmetic change.

---

## 4. Data Flow (Post-Removal)

```
Client request (createAppointment / updateAppointment / createWalkinAppointment)
  │
  ├─ 1. requireStaffAuth()          → 401 if no valid session
  ├─ 2. Zod schema validation       → 422 with field errors
  ├─ 3. validateStaffId() (if set)  → 404 if staff not found
  ├─ 4. validateBranchId() (if set) → 404 if branch not found   (update only)
  ├─ 5. validateStatusTransition()  → 422 if illegal transition (update only)
  │
  ├─ [REMOVED] checkStaffAvailability()    ─── WAS: staff schedule guard
  ├─ [REMOVED] isWithinBusinessHours()     ─── WAS: business hours lock
  │
  ├─ 6. Overlap check via TRANSACTION     → 409 "Staff already has appointment"
  │       │                                   (only when staff_id is provided)
  │       └─ If overlapping: ROLLBACK + error
  │       └─ If clear: INSERT/UPDATE + COMMIT
  │
  └─ 7. Return transformed appointment
```

---

## 5. Touch Points Summary

### 5.1 Server Actions (`server/actions/appointments.ts`)

| Function | Lines to change | What changes |
|---|---|---|
| `createAppointment()` | `~710–736` | Remove the `checkStaffAvailability` block and the `isWithinBusinessHours` block. The overlap transaction follows immediately after and must stay. |
| `updateAppointment()` | `~920–965` | Same two blocks removed. The overlap check inside the `if` guard must stay. |
| `createWalkinAppointment()` | `~1695–1721` | Same two blocks removed. The overlap transaction must stay. |
| `checkStaffAvailability()` | Entire function (`~345–400`) | Function declaration is no longer called. Can be deleted entirely to avoid dead code. |
| `timeToMinutes()` | `~335–340` | Only called by `checkStaffAvailability()`. Safe to delete, but harmless to leave. |
| `DAY_NUMBER_TO_NAME` | `~325–333` | Also used by `checkStaffAvailability()`. Check if it's used elsewhere first. |

### 5.2 No DB Changes

The `staff_schedules` table, `staffSchedules` export, and `business_hours` system setting are unchanged. Other features (time-clock, schedule editor, getStaffSchedule) continue to use them.

### 5.3 No Component Changes

- `WalkinAppointmentModal.tsx` — may still call `getStaffSchedule` for UI slot generation. This is cosmetic and unchanged.
- `editAppointment.tsx` — no references to either function. Unchanged.

### 5.4 Side-Effect Check

| Artifact | Impact |
|---|---|
| `settings.ts` `isWithinBusinessHours()` | Still exported; no longer called from appointments. Other consumers (if any) unaffected. |
| `getAvailableStaff()` in `time-clock.ts` | Uses `staffSchedules` independently. Unchanged. |
| `api/public/artists/available/route.ts` | Uses `getAvailableStaff()`. Unchanged. |
| Tests (`tests/integration/appointments.test.ts`) | May have tests covering working hours / business hours. Need updating. |

---

## 6. Deletion Boundary: `checkStaffAvailability` + Dependencies

The `checkStaffAvailability()` function depends on:
- `DAY_NUMBER_TO_NAME` constant
- `timeToMinutes()` helper
- `staffSchedules` import
- `db` import (already present)

**Recommended approach:** Delete `checkStaffAvailability()` entirely. Leave `DAY_NUMBER_TO_NAME` and `timeToMinutes()` unless a strict "no dead code" policy is enforced — they are tiny and `DAY_NUMBER_TO_NAME` may be reused later. The import of `staffSchedules` is still needed by the overlap check's `from()` chain only if passed through the schema import; the actual overlap check uses `appointments`, not `staffSchedules`. Verify and clean up the import if `staffSchedules` becomes unused.

---

## 7. Verification Criteria

After implementation:

1. **Create appointment with staff outside their schedule** — should succeed (no "outside working hours" error)
2. **Create appointment outside business hours** — should succeed (no "business closed" error)
3. **Create appointment with staff already booked for that slot** — must fail with "already has an appointment" error
4. **Create appointment with no staff assigned** — must succeed (no overlap check needed)
5. **Update appointment time to overlapping slot** — must fail with overlap error
6. **Create walk-in appointment outside business hours** — should succeed

All existing overlap, auth, validation, and status-transition guards must remain intact.

---

## 8. Architectural Boundaries (Do Not Cross)

| Boundary | Rule |
|---|---|
| No DB schema changes | `staff_schedules` table is untouched. No migration. |
| No export API changes | Server action signatures remain identical. |
| No component API changes | Component props and return types unchanged. |
| `isWithinBusinessHours` stays in `settings.ts` | Other potential consumers (future features) may still use it. |
| Overlap transaction stays in all 3 functions | Must remain inside `db.transaction()` for race-condition safety. |
