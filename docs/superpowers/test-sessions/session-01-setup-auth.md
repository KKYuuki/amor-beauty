# Session 1: Setup & Auth Verification

## Objective
Verify all 4 test accounts can log in, the sidebar renders correctly per role, and the branch selector works.

## Preconditions
- Dev server running at http://localhost:3000
- All 4 accounts registered
- Passwords: all accounts use `E2eTest2026!`

## Step 1: Login as e2e-admin ✅

1. Open auth page → login form visible ✅
2. Fill email: e2e-admin@rdmdstudio.com ✅
3. Fill password: E2eTest2026! ✅
4. Click Sign In ✅
5. Redirect to dashboard with full sidebar ✅

**Sidebar items visible:**
- Core: Dashboard, Calendar, Appointments, My Time Clock, My Payroll ✅
- Management: Inventory, Accounting, Payroll, Sales, Transactions, Time Clock ✅
- Admin: Staff, Config, Notify, Metrics, Branches, System Logs ✅

**Result:** ✅ Login successful, dashboard loaded, all sidebar items visible.

## Step 2: Login as e2e-manager ✅

1. Logged out via cookie clear + navigate to /auth ✅
2. Login with e2e-manager@rdmdstudio.com / E2eTest2026! ✅
3. Dashboard loads with correct sidebar ✅

**Verified sidebar:**
- Core: Dashboard, Calendar, Appointments, My Time Clock, My Payroll ✅
- Management: Inventory, Accounting, Payroll, Sales, Transactions ✅ (Time Clock not shown)
- Admin: Notify, Metrics, System Logs ✅ (Config NOT visible - correct!)

## Step 3: Login as e2e-artist ⚠️

1. Login with e2e-artist@rdmdstudio.com / E2eTest2026! ✅
2. Dashboard → CRASHES with client-side exception ⚠️

**Verified via other pages (my-time-clock):**
- Core: Dashboard, Calendar, Appointments, My Time Clock, My Payroll ✅
- Management: Time Clock ✅ (No Inventory, Accounting, Payroll, Sales, Transactions)
- Admin: NOT visible ✅

**Issue:** Dashboard crashes for artist role (see Issue #001)

## Step 4: Login as e2e-staff ✅

1. Login with e2e-staff@rdmdstudio.com / E2eTest2026! ✅
2. Dashboard loads successfully ✅

**Verified sidebar:**
- Core: Dashboard, Calendar, My Time Clock, My Payroll ✅
- Management: Time Clock ✅
- Admin: NOT visible ✅
- Appointments: NOT in sidebar, /appointments redirects to /unauthorized

**Issue:** Staff has `appointments_view` permission but cannot access /appointments (see Issue #002)

## Issues Found (2)
1. **HIGH:** Artist role crashes dashboard with client-side exception
2. **MEDIUM:** Staff with appointments_view flag denied access to appointments
