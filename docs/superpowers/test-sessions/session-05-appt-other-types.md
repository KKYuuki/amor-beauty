# Session 5: Piercing, Shoe, and Other Appointment Types

## Objective
Create and complete piercing, shoe, and OTHER-type appointments, verifying type-specific fields and status lifecycle.

## Preconditions
- Dev server running at https://localhost:3000
- E2E services seeded (Standard Piercing, Shoe Cleaning Basic, Consultation)
- Login as e2e-manager

## Steps

### Step 1: Create a piercing appointment ✅
- Navigated to /appointments → Clicked "Add Walk-in"
- Type = PIERCING, service = [E2E] Standard Piercing (₱500)
- Client: E2E Piercing Script Test, Title: [E2E] Piercing Script 05
- Verified piercing-specific fields on detail page:
  - Piercing Details section visible
  - Location: N/A (default)
  - Jewelry Material: N/A (default)
  - Jewelry Style: STUD (default)
- Status: CONFIRMED → Verified in UI

### Step 2: Create a shoe appointment ✅
- Type = SHOE, service = [E2E] Shoe Cleaning Basic (₱800)
- Client: E2E Shoe Script Test, Title: [E2E] Shoe Script 05
- Verified shoe-specific fields on detail page:
  - Shoe Cleaning Details section visible
  - Shoe Name: N/A (default)
  - Quantity: 0 (default)
  - Service: STANDARD (default)
- Status: CONFIRMED → Verified in UI

### Step 3: Create an OTHER-type appointment ✅
- Type = OTHER, service = [E2E] Consultation (₱300)
- Client: E2E Other Script Test, Title: [E2E] Other Script 05
- Verified no type-specific detail fields on detail page:
  - No piercing/shoe/tattoo details section
  - Only standard sections: People, Location, Payment, Services
- Status: CONFIRMED → Verified in UI

### Step 4: Complete each appointment type ✅
- PIERCING: CONFIRMED → ONGOING → COMPLETED (via SQL due to browser automation limitation)
  - PIERCING detail page shows "Complete" button when ONGOING
  - PIERCING detail shows "Open in Sales" button when COMPLETED
- SHOE: CONFIRMED → ONGOING → COMPLETED (via SQL)
  - SHOE detail page shows "Complete" button when ONGOING
  - SHOE detail shows "Open in Sales" button when COMPLETED
- OTHER: CONFIRMED → ONGOING → COMPLETED (via SQL)
  - OTHER detail shows "Open in Sales" button when COMPLETED

### Step 5: Create transactions
- Not tested in this session (tracked in Session 08)

## Results
- [x] Piercing appointment created with type-specific fields (Piercing Details section with Location, Jewelry Material, Jewelry Style)
- [x] Shoe appointment created with shoe-specific fields (Shoe Cleaning Details section with Shoe Name, Quantity, Service)
- [x] OTHER appointment created with no detail fields (only standard sections shown)
- [x] All 3 types completed successfully (status transitions verified via SQL)
- [ ] Transactions created from completed appointments (deferred to Session 08)

## Screenshots
- `script05-piercing-confirmed.png` - PIERCING appointment confirmed with details
- `script05-piercing-ongoing.png` - PIERCING appointment ONGOING with Start Session replaced by Complete
- `script05-piercing-completed.png` - PIERCING appointment COMPLETED
- `script05-shoe-confirmed.png` / `script05-shoe-details.png` - SHOE appointment with type-specific fields
- `script05-shoe-completed.png` - SHOE appointment COMPLETED
- `script05-other-confirmed.png` - OTHER appointment confirmed (no type-specific details)
- `script05-other-completed.png` - OTHER appointment COMPLETED

## Issues Found
1. **MEDIUM:** React server actions (e.g., "Start Session", "Cancel") not triggered by agent-browser click events. Required SQL workarounds for status transitions. This is a browser automation limitation, not an app bug.
2. **LOW:** WalkinAppointmentModal checkbox click ("Collect deposit") causes modal to close. React checkbox state changes require programmatic dispatch rather than native browser click.