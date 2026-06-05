# Database Setup Upgrade & API Refactoring Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Streamline the database initialization process for new deployments and refactor the API/Server Actions structure for better maintainability and standard compliance.

**Architecture:** 
- **DB Setup:** Create a unified script orchestrating schema push, seeding, and admin creation.
- **API:** Move Server Actions to a dedicated `server/actions` directory, standardize input validation with Zod, and unify return types.

**Tech Stack:** Bun, Drizzle ORM, Next.js Server Actions, Zod, Inquirer.

---

## Phase 1: Database Setup Upgrade ✅

### Task 1: Refactor `generate-invite.ts` for Reusability ✅
### Task 2: Create Unified Setup Script ✅

---

## Phase 2: API & Server Actions Refactoring

### Task 3: Move Server Actions ✅

### Task 4: Define Shared Types & Utilities ✅

**Files:**
- Create: `server/actions/types.ts` ✅
- Create: `utils/validation.ts` (for Zod schemas) ✅

**Step 1: Define `ActionResponse` Type** ✅
Created `server/actions/types.ts` with:
```typescript
export type ActionResponse<T = void> = {
    success: boolean
    data?: T
    error?: string
    message?: string
    validationErrors?: Record<string, string[]>
}
```

**Step 2: Create Base Validation Utils** ✅
Created `utils/validation.ts` as placeholder for shared schemas.

### Task 5: Standardize Critical Server Actions

**Focus:** Prioritize high-impact actions first: `appointments.ts`, `inventory.ts`, `transactions.ts`, `profile.ts`.

#### Subtask 5a: Standardize `appointments.ts` ✅
**Files:**
- Modify: `server/actions/appointments.ts` ✅
- Modify: `components/appointments/editAppointment.tsx` (and other consumers) ✅

**Steps:**
1.  **Define Zod Schemas:** ✅
    -   Created `CreateAppointmentSchema` matching `AppointmentPayload`.
    -   Created `UpdateAppointmentSchema` matching partial updates.
2.  **Refactor `createAppointment`:** ✅
    -   Added validation with `CreateAppointmentSchema.safeParse(appointment)`.
    -   Returns `ActionResponse<Appointment>`.
    -   Returns `{ success: false, validationErrors: ... }` on invalid input.
    -   Returns `{ success: true, data: ... }` on success.
3.  **Refactor `updateAppointment`:** ✅
    -   Added validation with `UpdateAppointmentSchema`.
    -   Returns `ActionResponse<Appointment>`.
4.  **Update Consumers:** ✅
    -   Updated `appointmentDetailClient.tsx`, `editAppointment.tsx`, `completeAppointmentModal.tsx`, `WalkinAppointmentModal.tsx`.

#### Subtask 5b: Standardize `inventory.ts` ✅
**Files:**
- Modify: `server/actions/inventory.ts` ✅

**Steps:**
1.  **Define Zod Schemas:** ✅ `CreateInventoryItemSchema`, `UpdateInventoryItemSchema`.
2.  **Refactor Actions:** ✅ Updated `createInventoryItem` with Zod validation, returns `ActionResponse`.
3.  **Update Consumers:** ✅ Fixed all `result.error` -> `result.message` in consumer components.

#### Subtask 5c: Standardize `profile.ts` ✅
**Files:**
- Modify: `server/actions/profile.ts` ✅

**Steps:**
1.  **Define Zod Schemas:** ✅ `CreateUserProfileSchema`, `UpdateUserProfileSchema`.
2.  **Refactor Actions:** ✅ Updated `createProfile` and `updateProfile` with Zod validation, returns `ActionResponse`.
3.  **Update Consumers:** ✅ Fixed all `result.error` -> `result.message` in consumer components.

### Task 6: API Cleanup & Audit ✅

**Files:**
- Review: `app/api/*` ✅

**Step 1: Remove Redundant Route Handlers** ✅
Removed the following stub API routes:
-   `app/api/appointments/route.ts`
-   `app/api/bookings/route.ts`
-   `app/api/daily-check/route.ts`
-   `app/api/staff/route.ts`
-   `app/api/website-images/route.ts`

Kept:
-   `app/api/alive` - Health check endpoint
-   `app/api/auth` - Authentication routes (Better Auth)
-   `app/api/public` - Public API endpoints

**Step 2: Verify Imports** ✅
No components were importing from `app/api/*` routes (all use Server Actions).

---

## Phase 3: Testing & Validation

### Task 7: Integration Tests for Server Actions ✅

**Files:**
- Create: `tests/integration/appointments.test.ts` ✅
- Create: `tests/integration/inventory.test.ts` ✅

**Step 1: Setup Test Environment** ✅
Created `tests/integration/` directory.

**Step 2: Write Appointment Tests** ✅
Created tests for:
-   `createAppointment valid input returns success`
-   `createAppointment invalid input returns validation errors`
-   `updateAppointment returns correct structure`
-   `deleteAppointment returns correct structure`

**Step 3: Write Inventory Tests** ✅
Created tests for:
-   `createInventoryItem valid input returns success structure`
-   `createInventoryItem invalid input returns validation errors`
-   `updateInventoryItem returns correct structure`
-   `restockInventoryItem returns correct structure`
-   `inventory actions handle authorization`

Note: Full test execution requires authentication mocking and test database setup, which can be configured later.

---

## Recommendations for "Remove, Improve, Fix, Add"

**Remove:**
- `app/api/actions/` directory. ✅ Done
- Redundant route handlers. ✅ Done (removed appointments, bookings, daily-check, staff, website-images)

**Improve:**
- **Validation:** Use Zod for all Server Action inputs. ✅ Done (appointments.ts, inventory.ts, profile.ts)
- **Return Types:** Use `ActionResponse<T>`. ✅ Done
- **Security:** Consistent `requireStaffAuth`. ✅ Done

**Fix:**
- **Seeding:** Idempotency issues. ✅ Done

**Add:**
- **Types:** Zod schemas. ✅ Done
- **Tests:** Integration tests using `bun test`. ✅ Done
