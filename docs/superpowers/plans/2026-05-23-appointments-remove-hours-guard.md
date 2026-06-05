# Remove Working Hours Guard & Lock from Appointments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip `checkStaffAvailability` (staff schedule guard) and `isWithinBusinessHours` (business hours lock) from all three appointment mutation functions, leaving only the overlap/collision check as the sole scheduling constraint. Delete all resulting dead code and unused imports.

**Architecture:** Six code-block deletions spread across three functions (`createAppointment`, `updateAppointment`, `createWalkinAppointment`) in one file (`server/actions/appointments.ts`), followed by dead-code removal of `checkStaffAvailability()`, its two helpers (`timeToMinutes`, `DAY_NUMBER_TO_NAME`), and two now-unused imports (`staffSchedules`, `isWithinBusinessHours`). Zero DB changes, zero component changes.

**Tech Stack:** TypeScript, Drizzle ORM, Zod, Bun

---

### Task 1: Remove `checkStaffAvailability` block from `createAppointment()`

**Files:**
- Modify: `server/actions/appointments.ts:714–726`

- [x] **Step 1: Delete the `checkStaffAvailability` guard block in `createAppointment`**

Delete lines 714–726 (the comment line + the entire `if (validated.data.staff_id)` block that calls `checkStaffAvailability`):

```typescript
        // Check staff availability
        if (validated.data.staff_id) {
            const availability = await checkStaffAvailability(
                validated.data.staff_id,
                validated.data.time_start,
                validated.data.time_end
            )

            if (!availability.isAvailable) {
                return failure(availability.reason!)
            }
        }
```

The code before deletion (line 713 area):
```typescript
                }
            }
        }

        // Check staff availability       <-- DELETE FROM HERE
        if (validated.data.staff_id) {    <--
            const availability = ...      <--
            ...                           <--
        }                                 <-- TO HERE

        // Check business hours           <-- this block stays (for now; Task 3 removes it)
```

After deletion, the code should flow directly from the `validateStaffId` closing brace to a blank line, then the `isWithinBusinessHours` block:

```typescript
                }
            }
        }

        // Check business hours
        const hoursCheck = await isWithinBusinessHours(
            validated.data.time_start,
            validated.data.time_end
        )
```

- [x] **Step 2: Verify lint pass on the modified file**

Run: `bun run lint -- --file server/actions/appointments.ts`

Expected: PASS with no new errors. (The function `checkStaffAvailability` is still defined and imported, so no "unused" warnings yet — those come in Task 4.)

- [x] **Step 3: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "feat: remove checkStaffAvailability guard from createAppointment"
```

---

### Task 2: Remove `checkStaffAvailability` block from `createWalkinAppointment()`

**Files:**
- Modify: `server/actions/appointments.ts:1699–1711`

- [x] **Step 1: Delete the `checkStaffAvailability` guard block in `createWalkinAppointment`**

Delete lines 1699–1711:

```typescript
        // Check staff availability
        if (payload.staff_id) {
            const availability = await checkStaffAvailability(
                payload.staff_id,
                payload.time_start,
                payload.time_end
            )

            if (!availability.isAvailable) {
                return { success: false, message: availability.reason! }
            }
        }
```

The code before deletion (line 1697–1698):
```typescript
            }
        }

        // Check staff availability       <-- DELETE FROM HERE
        if (payload.staff_id) {           <--
            ...                           <--
        }                                 <-- TO HERE

        // Check business hours           <-- this block stays (Task 3 removes it)
```

After deletion:

```typescript
            }
        }

        // Check business hours
        const hoursCheck = await isWithinBusinessHours(
            payload.time_start,
            payload.time_end
        )
```

- [x] **Step 2: Verify lint**

Run: `bun run lint -- --file server/actions/appointments.ts`

Expected: PASS with no new errors.

- [x] **Step 3: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "feat: remove checkStaffAvailability guard from createWalkinAppointment"
```

---

### Task 3: Remove `checkStaffAvailability` block from `updateAppointment()`

**Files:**
- Modify: `server/actions/appointments.ts:923–935`

- [x] **Step 1: Delete the `checkStaffAvailability` guard block in `updateAppointment`**

Delete lines 923–935:

```typescript
        // Check staff availability if staff or time is being changed
        if (effectiveStaffId && (validated.data.time_start || validated.data.time_end || validated.data.staff_id !== undefined)) {
            const availability = await checkStaffAvailability(
                effectiveStaffId,
                new Date(effectiveStartTime),
                new Date(effectiveEndTime)
            )

            if (!availability.isAvailable) {
                return failure(availability.reason || 'Staff member is not available for this time slot')
            }
        }
```

The code before deletion (line 921–922):
```typescript
            }
        }

        // Check staff availability...    <-- DELETE FROM HERE
        if (effectiveStaffId && ...) {    <--
            ...                           <--
        }                                 <-- TO HERE

        // Check for overlap if time or staff is being changed
```

After deletion:

```typescript
            }
        }

        // Check for overlap if time or staff is being changed
        if (validated.data.time_start || validated.data.time_end || validated.data.staff_id !== undefined) {
```

- [x] **Step 2: Verify lint**

Run: `bun run lint -- --file server/actions/appointments.ts`

Expected: PASS with no new errors. At this point `checkStaffAvailability` is no longer called anywhere in the file.

- [x] **Step 3: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "feat: remove checkStaffAvailability guard from updateAppointment"
```

---

### Task 4: Delete dead code — `checkStaffAvailability()`, helpers, and `staffSchedules` import

**Files:**
- Modify: `server/actions/appointments.ts:12–13` (import line), `321–401` (function + helpers + comment block)

- [x] **Step 1: Remove `staffSchedules` from the schema import**

On line 12–13, change:

```typescript
    user,
    staffSchedules,
    appointmentItems,
```

To:

```typescript
    user,
    appointmentItems,
```

- [x] **Step 2: Delete the entire "Staff Availability Check" section header**

Delete lines 320–322:

```typescript
// ============================================================================
// Staff Availability Check
// ============================================================================
```

- [x] **Step 3: Delete `DAY_NUMBER_TO_NAME` constant**

Delete lines 324–332:

```typescript
const DAY_NUMBER_TO_NAME: Record<number, string> = {
    0: 'SUNDAY',
    1: 'MONDAY',
    2: 'TUESDAY',
    3: 'WEDNESDAY',
    4: 'THURSDAY',
    5: 'FRIDAY',
    6: 'SATURDAY',
}
```

- [x] **Step 4: Delete `timeToMinutes` helper**

Delete lines 334–340 (the JSDoc comment + function):

```typescript
/**
 * Convert time string ("HH:MM") to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
}
```

- [x] **Step 5: Delete `checkStaffAvailability` function**

Delete lines 342–401 (the JSDoc comment + function body):

```typescript
/**
 * Checks if staff member is available for the given time slot
 */
async function checkStaffAvailability(
    staffId: string,
    startTime: Date,
    endTime: Date
): Promise<{ isAvailable: boolean; reason?: string }> {
    const dayOfWeek = startTime.getDay()
    const dayName = DAY_NUMBER_TO_NAME[dayOfWeek]

    // Get staff schedule for this day
    const schedule = await db
        .select()
        .from(staffSchedules)
        .where(and(
            eq(staffSchedules.staffId, staffId),
            eq(staffSchedules.dayOfWeek, dayName),
            eq(staffSchedules.isActive, true)
        ))
        .limit(1)

    if (schedule.length === 0) {
        return { isAvailable: false, reason: 'Staff member is not scheduled for this day' }
    }

    const scheduleStart = schedule[0].startTime
    const scheduleEnd = schedule[0].endTime

    // Check if appointment is within working hours
    const appointmentStartMinutes = startTime.getHours() * 60 + startTime.getMinutes()
    const appointmentEndMinutes = endTime.getHours() * 60 + endTime.getMinutes()
    const scheduleStartMinutes = timeToMinutes(scheduleStart)
    const scheduleEndMinutes = timeToMinutes(scheduleEnd)

    if (appointmentStartMinutes < scheduleStartMinutes || appointmentEndMinutes > scheduleEndMinutes) {
        return {
            isAvailable: false,
            reason: `Appointment is outside working hours (${scheduleStart} - ${scheduleEnd})`
        }
    }

    return { isAvailable: true }
}
```

- [x] **Step 6: Verify lint**

Run: `bun run lint -- --file server/actions/appointments.ts`

Expected: PASS. If ESLint reports `staffSchedules` still imported somewhere, double-check the import line was correctly updated in Step 1.

- [x] **Step 7: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "chore: delete checkStaffAvailability, timeToMinutes, DAY_NUMBER_TO_NAME dead code"
```

---

### Task 5: Remove `isWithinBusinessHours` from all three functions + clean import

**Files:**
- Modify: `server/actions/appointments.ts:22` (import), and three call-site blocks

- [x] **Step 1: Remove `isWithinBusinessHours` from `createAppointment()`**

Delete lines 728–736 (the comment + entire block):

```typescript
        // Check business hours
        const hoursCheck = await isWithinBusinessHours(
            validated.data.time_start,
            validated.data.time_end
        )

        if (!hoursCheck.valid) {
            return failure(hoursCheck.reason!)
        }
```

After deletion, the code should flow directly from the `validateStaffId` closing brace into the transaction:

```typescript
                }
            }
        }

        // Perform overlap check and insertion in a transaction to prevent race conditions
        const result = await db.transaction(async (tx) => {
```

- [x] **Step 2: Remove `isWithinBusinessHours` from `updateAppointment()`**

Delete lines 956–965 (note: line numbers may have shifted ~40 lines up from the deletions in Tasks 1–4 — verify the actual block before deleting):

```typescript
        // Check business hours if time is being updated
        if (validated.data.time_start || validated.data.time_end) {
            const hoursCheck = await isWithinBusinessHours(
                new Date(effectiveStartTime),
                new Date(effectiveEndTime)
            )

            if (!hoursCheck.valid) {
                return failure(hoursCheck.reason || 'Appointment is outside business hours')
            }
        }
```

After deletion, the `updateData` object initialization follows directly:

```typescript
        }

        const updateData: Partial<typeof appointments.$inferInsert> = {
```

- [x] **Step 3: Remove `isWithinBusinessHours` from `createWalkinAppointment()`**

Delete lines 1713–1721 (again, line numbers shifted — verify the actual block):

```typescript
        // Check business hours
        const hoursCheck = await isWithinBusinessHours(
            payload.time_start,
            payload.time_end
        )

        if (!hoursCheck.valid) {
            return { success: false, message: hoursCheck.reason! }
        }
```

After deletion, the transaction follows directly:

```typescript
        }

        // Perform overlap check and insertion in a transaction to prevent race conditions
        const result = await db.transaction(async (tx) => {
```

- [x] **Step 4: Remove `isWithinBusinessHours` from the imports**

On line 22, delete the entire line:

```typescript
import { isWithinBusinessHours } from './settings'
```

- [x] **Step 5: Verify lint**

Run: `bun run lint`

Expected: PASS with zero errors and zero warnings. No unused imports, no undefined references.

- [x] **Step 6: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "feat: remove isWithinBusinessHours lock from all appointment mutations"
```

---

### Task 6: Full build verification

**Files:**
- Verify: `server/actions/appointments.ts` (already modified)

- [x] **Step 1: Run full production build**

```bash
bun run build
```

Expected: Build succeeds with no type errors. The build will catch any dangling references to `checkStaffAvailability`, `isWithinBusinessHours`, `timeToMinutes`, `DAY_NUMBER_TO_NAME`, or `staffSchedules` that survived the deletions.

- [x] **Step 2: Run the full lint suite**

```bash
bun run lint
```

Expected: PASS with zero errors. If pre-existing warnings exist in other files, they are unrelated to this change.

- [x] **Step 3: Final commit (if needed)**

Only commit if you made any fixes during verification:

```bash
git add -A
git commit -m "chore: post-verification fixes for hours guard removal"
```

---

### Verification Checklist (manual — post-build)

After a successful build, verify the following manually against a running dev server:

| # | Scenario | Expected |
|---|---|---|
| 1 | Create appointment with staff outside their schedule hours | ✅ Succeeds |
| 2 | Create appointment outside business hours (e.g., 2 AM) | ✅ Succeeds |
| 3 | Create appointment with staff already booked in that slot | ❌ Fails with overlap error |
| 4 | Create appointment with no staff assigned | ✅ Succeeds |
| 5 | Update appointment to overlap another appointment | ❌ Fails with overlap error |
| 6 | Create walk-in appointment outside business hours | ✅ Succeeds |
| 7 | Delete appointment | ✅ Succeeds (unchanged) |
| 8 | Status transitions (PENDING→CONFIRMED→ONGOING→COMPLETED) | ✅ Unchanged |
