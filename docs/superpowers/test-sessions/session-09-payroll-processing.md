# Session 9: Payroll Processing

## Objective
Verify payroll entries auto-created from transactions, deductions, request lifecycle (REQUESTED→CONFIRMED→COMPLETED), staggered disbursements.

## Preconditions
- Dev server running at http://localhost:3000
- Multiple completed transactions exist with staff assignments
- Login as e2e-manager

## Steps

### Step 1: Verify auto-created payroll entries
- Navigate to Payroll → Entries
- Verify entries exist for transactions where staff was assigned
- Check: staff_id, gross_amount, shop_cut, staff_cut, payment_status

### Step 2: Create a deduction (advance)
- Navigate to Deductions → Add Deduction
- Select E2E Artist, type=ADVANCE, amount=₱200
- Verify deduction appears with PENDING status

### Step 3: Create payroll request
- Navigate to Requests → New Request
- Select E2E Artist, period=WEEKLY
- Verify totals reflect pending entries minus deductions

### Step 4: Request lifecycle
- REQUESTED → Confirm → CONFIRMED
- CONFIRMED → Complete → COMPLETED with staggered disbursement
- Disbursement 1: ₱300 CASH
- Disbursement 2: ₱250 GCASH (ref: GCASH-DISB-001)

### Step 5: Staff self-service view
- Login as e2e-artist → My Payroll
- Verify artist can see entries, requests, disbursements

## Results
- [ ] Payroll entries auto-created
- [ ] Deduction created and tracked
- [ ] Payroll request full lifecycle tested
- [ ] Staggered disbursements work
- [ ] My Payroll view shows correct data

## Issues Found
- None yet
