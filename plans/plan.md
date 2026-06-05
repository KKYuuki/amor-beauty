# Implementation Plan: Inksight RDMD Enhancements

This plan outlines the phased implementation for upgrading payroll, service logic, payment architecture, and discounts.

## Global Checklist

- [x] Phase 1: Foundation (Database & Types)
- [x] Phase 2: Payroll Core (Static & Manual)
- [x] Phase 3: Service Logic (Hourly Rates & Tax)
- [x] Phase 4: Payment Architecture (Multiple Payments)
- [x] Phase 5: Discounts & Polish
- [x] Phase 6: Final Verification

---

## Styling Standards
**Aesthetic:** Glassmorphism
- **Colors:** Zinc / Neutral palette.
- **Backgrounds:** `bg-white/10` or similar translucent layers.
- **Icons:** `lucide-react`.
- **Animations:** `motion/react` for smooth transitions.
- **Components:** Ensure all new UI elements match existing translucent, modern design.
- **Security:** No RLS (Row Level Security) - Server-side actions will handle all permission checks.

---

## Phase 1: Foundation (Database & Types)

This phase establishes the data structures required for new features.

- [x] **Database Schema: Staff Rates**
    - [x] Modify `payroll_staff_rates` table.
    - [x] Add column `payment_mode` (enum/text: 'PERCENTAGE', 'FIXED').
    - [x] Add column `fixed_amount` (decimal/numeric).
- [x] **Database Schema: Services**
    - [x] Modify `services` table.
    - [x] Add column `pricing_type` (enum/text: 'FLAT', 'HOURLY').
    - [x] Add column `hourly_rate` (decimal/numeric).
- [x] **Database Schema: Payments**
    - [x] Create new table `transaction_payments`.
    - [x] Columns: `id`, `transaction_id` (FK), `amount`, `method`, `created_at`, `notes`.
    - [x] No RLS - server-side checks only.
- [x] **TypeScript Interfaces**
    - [x] Update `PayrollStaffRate` type to include new fields.
    - [x] Update `Transaction` type to reflect relation to `transaction_payments`.
    - [x] Update `Service` type for pricing logic.
- [x] **Verification & Build**
    - [x] Run migration/push schema.
    - [x] `bun run lint`
    - [x] `bun run build`

**Note:** After running Phase 4 (Payment Architecture), you must run the `fix_partial_status.sql` migration to update the transactions status check constraint to include 'PARTIAL'.

## Phase 2: Payroll Core (Static & Manual)

Implement logic for fixed-rate payroll and manual adjustments.

- [x] **Backend: Fixed Rate Logic**
    - [x] Update `calculateAndCreatePayrollEntry` function.
    - [x] Handle `payment_mode` check: if 'FIXED', use `fixed_amount` instead of commission %.
- [x] **Backend: Manual Entry**
    - [x] Create server action `createManualPayrollEntry`.
    - [x] Allow inputs: Staff ID, Amount, Description, Date.
- [x] **UI: Rate Settings**
    - [x] Update Staff Settings / Rates component.
    - [x] Add toggle/selector for "Percentage" vs "Fixed Amount".
    - [x] Input field for Fixed Amount.
- [x] **UI: Manual Payroll Modal**
    - [x] Add "Manual Payroll Entry" button in `app/payroll/page.tsx`.
    - [x] Create Modal component (Glassmorphism style).
    - [x] Connect to `createManualPayrollEntry` action.
- [x] **Verification & Build**
    - [x] Test rate switching.
    - [x] Test manual entry creation.
    - [x] `bun run lint`
    - [x] `bun run build`

## Phase 3: Service Logic (Hourly Rates & Tax)

Enable hourly service calculations and correct tax handling.

- [x] **Backend: Service Calculation**
    - [x] Update service calculation utility.
    - [x] Accept optional `startTime` and `endTime` or `duration`.
    - [x] Logic: If `pricing_type` is 'HOURLY', `cost = duration_hours * hourly_rate`.
- [x] **UI: Sales Cart Updates**
    - [x] Update `salesPage.tsx` (or cart component).
    - [x] For items with `pricing_type` = 'HOURLY':
        - [x] Show time/duration inputs.
        - [x] Auto-update price based on duration.
- [x] **Backend: Tax Logic Fix**
    - [x] Audit `createTransaction`.
    - [x] Ensure Tax is deducted from the gross amount *before* commission is calculated (Net Sales basis).
- [x] **Verification & Build**
    - [x] Test hourly service addition to cart.
    - [x] Verify tax/commission math.
    - [x] `bun run lint`
    - [x] `bun run build`

## Phase 4: Payment Architecture (Multiple Payments)

Support partial payments, deposits, and split tenders.

- [x] **Backend: Transaction Refactor**
    - [x] Refactor `createTransaction` to accept an initial payment array or amount.
    - [x] Allow transaction creation with `status` = 'PARTIAL' or 'PENDING' if amount < total.
    - [x] Record initial payment into `transaction_payments`.
- [x] **Backend: Add Payment Action**
    - [x] Create `addTransactionPayment` action.
    - [x] Update transaction status to 'COMPLETED' if balance reaches 0.
- [x] **UI: Checkout Modal Redesign**
    - [x] Redesign for Split Payments / Deposits.
    - [x] Allow entering an amount less than the total.
    - [x] Display "Remaining Balance".
- [x] **UI: Transaction History**
    - [x] Update Transaction Detail view.
    - [x] Show "Balance Due".
    - [x] Add "Add Payment" button for incomplete transactions.
- [x] **Verification & Build**
    - [x] Test partial payment flow.
    - [x] Test fulfilling a balance.
    - [x] `bun run lint`
    - [x] `bun run build`

## Phase 5: Discounts & Polish

Add discount functionality and refine the UI.

- [x] **UI: Add Discount Button**
    - [x] Add "Add Discount" button in the Cart/Checkout area.
- [x] **UI: Discount Modal**
    - [x] Create Modal: Choice between "Fixed Amount ($)" and "Percentage (%)".
    - [x] Input for value.
    - [x] Input for "Reason" (tag/text).
- [x] **Backend: Discount Logic**
    - [x] Update `createTransaction` to handle discount fields.
    - [x] Ensure discounts reduce the taxable/commissionable base correctly.
    - [x] Log discount reason.
- [x] **UI Polish**
    - [x] Review all new components.
    - [x] Ensure `bg-white/10` and `lucide-react` icons are consistent.
    - [x] Check `motion/react` animations for smoothness.
- [x] **Verification & Build**
    - [x] Test discount application.
    - [x] Visual regression check.
    - [x] `bun run lint`
    - [x] `bun run build`

## Phase 6: Final Verification

Comprehensive testing and cleanup.

- [x] **E2E Manual Test Plan**
    - [x] Run through full flow: Create Service (Hourly) -> Staff Rate (Fixed) -> Checkout (Partial Payment + Discount) -> Add Final Payment -> Check Payroll.
- [x] **Audit: Payroll Credit**
    - [x] Check for any double-counting of credits in complex scenarios.
    - [x] Audit complete - No double-counting found. Implementation correctly creates separate ledger entries for each service item.
- [x] **Verification & Build**
    - [x] Final global lint: `bun run lint`
    - [x] Final production build: `bun run build`

---

# Implementation Summary

All 6 phases have been completed successfully:

1. **Foundation (Phase 1)**: Database schema updated for fixed payments, hourly services, and multiple payments. All types updated.

2. **Payroll Core (Phase 2)**: Fixed rate support added to payroll calculations. Manual payroll entry modal created for ad-hoc adjustments.

3. **Service Logic (Phase 3)**: Hourly rate calculation implemented based on service duration. Tax deduction fixed to use net amount for commission calculations.

4. **Payment Architecture (Phase 4)**: Partial payments/deposits supported. Transaction status tracking (PARTIAL, COMPLETED). Add Payment functionality for outstanding balances.

5. **Discounts & Polish (Phase 5)**: Discount modal with Percentage/Fixed options. Automatic percentage calculation. Discount reason tagging. Consistent Glassmorphism styling.

6. **Final Verification (Phase 6)**: Lint and production build verified. Payroll credit audited - no double-counting found.

All features follow the project's Glassmorphism aesthetic with `bg-white/10` backgrounds, `lucide-react` icons, and `motion/react` animations.
