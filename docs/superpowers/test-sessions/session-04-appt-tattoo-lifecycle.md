# Session 4: Tattoo Appointment Full Lifecycle

## Objective
Create a tattoo appointment and exercise the full status lifecycle (PENDING → CONFIRMED → ONGOING → COMPLETED → Transaction Created).

## Preconditions
- Dev server running at http://localhost:3000
- E2E services and inventory seeded
- Login as e2e-manager (appointments_manage permission)

## Steps

### Step 1: Create a scheduled tattoo appointment
- Navigate to /appointments → click "New Appointment"
- Fill: title, type=TATTOO, client, staff=E2E Artist, date, time, select service [E2E] Small Tattoo
- Submit → verify appointment created with PENDING status

### Step 2: Status transition PENDING → CONFIRMED
- Open appointment detail → click Confirm
- Status should change to CONFIRMED

### Step 3: CONFIRMED → ONGOING
- Click "Start Session"
- Status changes to ONGOING, actual_time_start set

### Step 4: ONGOING → COMPLETED
- Click "Complete"
- Verify completion modal appears (no S3 upload needed)
- Status changes to COMPLETED

### Step 5: Create transaction from completed appointment
- Click "Open in Sales" / "Collect Balance"
- Verify transaction created

## Results
- [ ] Appointment created successfully
- [ ] PENDING → CONFIRMED transition works
- [ ] CONFIRMED → ONGOING transition works
- [ ] ONGOING → COMPLETED transition works
- [ ] Transaction auto-created from completed appointment

## Issues Found
- None yet
