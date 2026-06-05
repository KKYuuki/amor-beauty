# Plan: Split Payments, Unassigned Staff & Walk-in Customers

This plan outlines the steps to implement:
1. **Optional Staff** - Allow transactions without a commission receiver ("Shop Sales")
2. **Split Payments** - Support multiple payment methods (Cash + Card) with partial payment option
3. **Walk-in Customers** - Allow transactions without a registered client, using manual name/phone/email input
4. **Unassigned Appointments** - Allow appointments without a specific staff member initially

**Status Tracking:**
- [x] Phase 1: Database Schema Migration (Staff Optional, Client Optional)
- [x] Phase 2: Backend Logic Updates (Split Payments, Optional Staff/Client)
- [x] Phase 3: Frontend - Walk-in Appointments (Unassigned)
- [x] Phase 4: Frontend - Sales Page (Split Payments, Shop Sale, Walk-in Customers)
- [ ] Phase 5: Testing & Final Verification

---

## What's Next: Phase 5 - Testing & Final Verification

Now that all code changes are complete and the build passes, it's time to **test** the implementation to ensure everything works as expected.

### Testing Checklist

#### Test Case A: Shop Sale (No Commission)
1. Go to Sales Page
2. Add items to cart
3. Open Checkout Modal
4. Select "Shop Sale (No Commission)" from Staff dropdown
5. Complete transaction
6. **Verify:**
   - [ ] Transaction is created successfully
   - [ ] NO payroll entry is generated in the database
   - [ ] Transaction shows `staff_id` as NULL

#### Test Case B: Walk-in Customer
1. Go to Sales Page
2. Add items to cart
3. Open Checkout Modal
4. Select "Walk-in Customer"
5. Enter: Name (required), Phone (optional), Email (optional)
6. Complete transaction
7. **Verify:**
   - [ ] Transaction is created successfully
   - [ ] `buyer_id` is NULL
   - [ ] `buyer_name` matches entered name
   - [ ] `customer_phone` and `customer_email` are saved correctly

#### Test Case C: Split Payment (Full Payment)
1. Go to Sales Page
2. Add items to cart (e.g., Total = 1000)
3. Open Checkout Modal
4. Select "SPLIT" as Payment Method
5. Add payments:
   - Cash: 500
   - Card: 500
6. Complete transaction
7. **Verify:**
   - [ ] Transaction status is COMPLETED
   - [ ] Two entries exist in `transaction_payments` table
   - [ ] `amount_paid` = 1000
   - [ ] `balance_due` = 0

#### Test Case D: Split Payment (Partial Payment)
1. Go to Sales Page
2. Add items to cart (e.g., Total = 1000)
3. Open Checkout Modal
4. Select "SPLIT" as Payment Method
5. Add payment: Cash: 500 only
6. Complete transaction
7. **Verify:**
   - [ ] Transaction status is PARTIAL
   - [ ] One entry exists in `transaction_payments` table
   - [ ] `amount_paid` = 500
   - [ ] `balance_due` = 500

#### Test Case E: Unassigned Appointment
1. Go to Appointments Page
2. Create new appointment
3. Leave "Staff/Artist" field empty
4. Complete appointment creation
5. **Verify:**
   - [ ] Appointment is created successfully
   - [ ] `staff_id` is NULL
   - [ ] Appointment displays as "Unassigned"

---

## Final Verification Steps

After all tests pass:

1. **Check Database Integrity**
   ```sql
   -- Verify staff_id is nullable in both tables
   SELECT table_name, column_name, is_nullable
   FROM information_schema.columns
   WHERE column_name = 'staff_id'
   AND table_name IN ('transactions', 'appointments');
   
   -- Verify customer_phone and customer_email columns exist
   SELECT column_name
   FROM information_schema.columns
   WHERE table_name = 'transactions'
   AND column_name IN ('customer_phone', 'customer_email');
   ```

2. **Run Final Lint & Build Check**
   ```bash
   bun run lint
   bun run build
   ```
   Both should complete successfully (2 expected warnings in editAppointment.tsx are acceptable).

3. **Clean Up & Deploy**
   - Commit all changes to git
   - Deploy to production
   - Monitor for any issues in production logs

---

## Summary of Changes

### Database
- ✅ `transactions.staff_id` → nullable (Shop Sale support)
- ✅ `transactions.customer_phone`, `transactions.customer_email` → added (Walk-in details)
- ✅ `appointments.staff_id` → nullable (Unassigned appointments)

### Backend
- ✅ Split payment handling in `createTransaction`
- ✅ Optional staff handling (skips payroll when null)
- ✅ Walk-in customer fields in transaction payload

### Frontend
- ✅ Walk-in appointment creation (unassigned staff)
- ✅ Sales Page Walk-in Customer form
- ✅ Sales Page Shop Sale option
- ✅ Sales Page Split Payment builder with animations
- ✅ Real-time split payment summary
- ✅ Partial payment toggle integration

All code changes are complete and the build passes. Proceed with testing!

---

## Phase 1: Database Schema Migration
**Goal:** Allow NULL for both `staff_id` (no commission) and `buyer_id` (walk-in customer).

1.  **Create Migration File** `supabase/migrations/walkin_sales_split_payments.sql`
    - [ ] Make `staff_id` nullable in `transactions` (for Shop Sales - no commission).
    - [ ] Add `customer_phone` and `customer_email` to `transactions` (for walk-in details).
    - [ ] Make `staff_id` nullable in `appointments` (for unassigned walk-ins).
    - [ ] Add comments documenting these changes.

2.  **Execute Migration**
    - [ ] Run migration against Supabase.
    - [ ] Verify schema changes in Supabase dashboard.

---

## Phase 2: Backend Logic Updates
**Goal:** Handle optional staff, split payments, and walk-in customer data.

1.  **Update Types** (`utils/types/transactions.ts`)
    - [ ] `Transaction.staff_id` -> `string | null`.
    - [ ] `Transaction` interface: Add `customer_phone`, `customer_email`.
    - [ ] `CreateTransactionPayload`:
        - `buyer_id` -> `string | null` (walk-in).
        - `buyer_name`, `customer_phone`, `customer_email` -> optional strings.
        - `staff_id` -> `string | null`.
        - Add `payments?: SplitPayment[]` (for split payments).

2.  **Refactor Transaction Action** (`app/api/actions/transactions.ts`)
    - [ ] **`createTransaction`:**
        - [ ] Handle `payload.staff_id` being null (skip payroll if so).
        - [ ] Handle `payload.buyer_id` being null (walk-in with manual details).
        - [ ] **Split Payments:**
            - If `payment_method === 'SPLIT'`, process `payload.payments` array.
            - Create multiple `transaction_payments` entries.
            - Calculate `amount_paid` = sum of split payments.
        - [ ] **Status Logic:**
            - `COMPLETED` if `amount_paid >= total`.
            - `PARTIAL` if `0 < amount_paid < total`.
            - `PENDING` if `amount_paid == 0`.

3.  **Refactor Appointment Action** (`app/api/actions/appointments.ts`)
    - [ ] **`createAppointment`:**
        - [ ] Accept `null` for `staff_id` (unassigned walk-in).
        - [ ] Handle notifications gracefully if no staff.

4.  **Verification**
    - [ ] Run `npm run lint` to check type errors.

---

## Phase 3: Frontend - Walk-in Appointments (Unassigned)
**Goal:** UI to create appointments without a specific staff member.

1.  **Modify Component** (`components/appointments/requestAppointment.tsx`)
    - [ ] **Staff Input:**
        - Allow clearing/leaving empty.
        - Display "Unassigned / Walk-in" when empty.
    - [ ] **Validation:**
        - Remove blocker for empty `staffId`.
    - [ ] **Submission:**
        - Pass `null` for `staff_id` if empty.

2.  **Verification**
    - [ ] Build check.

---

## Phase 4: Frontend - Sales Page (Split Payments, Shop Sale, Walk-in)
**Goal:** Full payment flow with multiple methods, optional staff, and walk-in customer form.

1.  **Modify Sales Page** (`app/sales/salesPage.tsx`)
    - [ ] **Customer Selection:**
        - Toggle: "Registered Client" vs "Walk-in".
        - **Walk-in Mode:**
            - Show inputs: Name, Phone, Email.
            - Set `buyer_id` to `null`.
    - [ ] **Staff Selection:**
        - Add option: "Shop Sale (No Commission)".
        - Allow clearing selection -> `staff_id` = `null`.
    - [ ] **Checkout Modal:**
        - Add `splitPayments` array state.
        - Add `allowPartial` boolean state.
    - [ ] **Split Payment UI:**
        - When `payment_method === 'SPLIT'`:
            - Show dynamic list builder:
                - Row: Method Select | Amount Input | Ref Input | Add Button (+)
                - List of payments with Remove (Trash) button.
                - *Style Note:* Use `AnimatePresence` (motion/react) for smooth transitions. Match glassmorphism theme.
            - **Summary:**
                - "Total Due", "Total Entered", "Remaining".
            - **Partial Toggle:**
                - Checkbox "Allow Partial Payment".
                - Enable "Complete" button if `Remaining <= 0` OR partial is enabled.
    - [ ] **Checkout Submission:**
        - Map UI state to payload:
            - `buyer_id`: null if walk-in.
            - `buyer_name`, `customer_phone`, `customer_email`: from walk-in form.
            - `staff_id`: null if "Shop Sale".
            - `payments`: split array.

2.  **Verification**
    - [ ] Run `npm run lint`.
    - [ ] Run `npm run build` (ensure no build errors).

---

## Phase 5: Testing & Final Verification
**Goal:** End-to-end testing.

1.  **Test Case A: Walk-in Customer + Shop Sale**
    - [ ] Walk-in (manual name/phone) + No Staff.
    - [ ] Verify: No payroll entry.

2.  **Test Case B: Registered Client + Staff + Split Payment**
    - [ ] Client selected + Staff + Split (Cash + Card).
    - [ ] Verify: 2 `transaction_payments` entries.

3.  **Test Case C: Partial Payment**
    - [ ] Any customer + Partial payment enabled.
    - [ ] Verify: Status = `PARTIAL`, balance_due > 0.

4.  **Test Case D: Unassigned Appointment**
    - [ ] Appointment with no staff.
    - [ ] Verify: Saves and displays correctly.
