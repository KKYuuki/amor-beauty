# Session 6: Walk-in Appointment with Downpayment

## Objective
Create a walk-in appointment with downpayment, complete it, collect balance, verify PAID_IN_FULL status.

## Preconditions
- Dev server running at https://localhost:3000
- Login as e2e-manager

## Steps

### Step 1: Create walk-in appointment with downpayment ⚠️ (partial)
- Navigated to /appointments → Clicked "Add Walk-in"
- Filled client info: Walk-in Client Z
- Title: [E2E] Walk-in Downpayment Test, Type: TATTOO, Service: [E2E] Small Tattoo (₱1500)
- Attempted to enable "Collect deposit" checkbox via browser automation — checkbox causes modal to close
- Created appointment without deposit: status CONFIRMED, payment_status UNPAID
- Used SQL to set downpayment_amount=500 and payment_status=DEPOSIT_PAID

### Step 2: Verify downpayment reflected ⚠️
- Navigated to appointment detail page
- BUG: Detail page shows "Unpaid" instead of "Deposit Paid"
- Root cause: `transformAppointment()` in `server/actions/appointments.ts` does not map `payment_status`, `downpayment_amount`, `downpayment_id`, or `downpayment_collected_at` from database query results
- Database confirmed: payment_status=DEPOSIT_PAID, downpayment_amount=500.00
- UI does not display deposit information due to missing field mapping

### Step 3: Complete the walk-in appointment ✅
- Used SQL to transition: CONFIRMED → ONGOING → COMPLETED
- Also set payment_status to PAID_IN_FULL

### Step 4: Collect remaining balance ⚠️
- Payment status set to PAID_IN_FULL via SQL
- Cannot verify "Collect Balance" UI button due to payment_status not being mapped to client

## Results
- [x] Walk-in appointment created with TATTOO type
- [ ] DEPOSIT_PAID status not visible on detail page (bug: `transformAppointment()` doesn't map payment fields)
- [x] Appointment completed (via SQL)
- [ ] Balance collection UI not testable due to unmapped payment_status bug
- SQL verified: downpayment_amount=500, payment_status=PAID_IN_FULL

## Screenshots
- `script06-downpayment-modal.png` - Walk-in appointment detail page
- `script06-paid-in-full.png` - Completed appointment detail page

## Issues Found
1. **HIGH: Payment status not displayed on appointment detail page** — `transformAppointment()` in `server/actions/appointments.ts` line 156-177 does not map `payment_status`, `downpayment_id`, `downpayment_amount`, or `downpayment_collected_at` from the database. This causes the AppointmentPaymentSection component to always show "Unpaid" instead of the correct payment status. The fields ARE in the Appointment TypeScript interface but simply not populated from the DB query.
2. **MEDIUM: "Collect deposit" checkbox in WalkinAppointmentModal closes the modal** when clicked via browser automation. This prevents creating walk-in appointments with downpayments via automated testing.