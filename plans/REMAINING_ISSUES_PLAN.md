# Remaining Issues Investigation Plan

## Overview
This document outlines the plan for investigating and fixing three critical issues in the Inksight RDMD application.

---

## Issue 1: Dashboard Stuck in Loading for Admin and Staff

### Current Behavior
- Admin dashboard shows infinite loading spinner
- Staff dashboard also stuck in loading state
- Client dashboard may work (not reported broken)

### Root Cause Analysis

#### Files to Investigate
1. **`app/page.tsx`** - Main dashboard server component
   - Currently stubbed with TODO comment: "Stub - no auth check since authentication is disabled"
   - Passes `null` userProfile and empty `initialData` to DashboardClient
   
2. **`app/dashboardClient.tsx`** - Dashboard client component
   - Line 80-89: Receives `initialData` and `userProfile` props
   - Line 85-89: Falls back to context user info if props are empty
   - Line 92-94: Sets current view based on user role
   - **CRITICAL ISSUE (Line 125)**: Switch statement uses `"ADMIN"` (uppercase) but role check uses `"admin"` (lowercase)
   - **CRITICAL ISSUE (Line 132)**: Switch statement uses `"STAFF"` (uppercase) but role check uses `userInfo.role !== "admin"`
   - Line 147-157: Default case returns loading spinner indefinitely

### Problem Identified
The `renderDashboard()` function uses uppercase string literals `"ADMIN"`, `"STAFF"`, `"CLIENT"` in the switch cases, but the role comparison uses lowercase `"admin"`. Since `userInfo.role` is likely lowercase ("admin", "staff", "client"), none of the cases match, causing the default loading state to persist indefinitely.

### Fix Required
```typescript
// In renderDashboard() switch statement, change:
case "ADMIN": → case "admin":
case "STAFF": → case "staff":
case "CLIENT": → case "client":
```

### Verification Steps
1. Log in as admin user
2. Verify dashboard loads immediately with admin view
3. Switch to "View As: Staff" and verify staff dashboard loads
4. Log in as staff user and verify staff dashboard loads

---

## Issue 2: Profile Page Redirects to Auth and Stays There

### Current Behavior
- User navigates to `/profile`
- Middleware redirects to `/auth` (correct behavior if not authenticated)
- After successful authentication, user stays on `/auth` page instead of redirecting back

### Root Cause Analysis

#### Files to Investigate
1. **`middleware.ts`** - Route protection
   - Line 32-34: Redirects to `/auth` if no session
   - No `returnTo` or callback URL parameter is added to the redirect
   
2. **`app/profile/page.tsx`** - Profile page server component
   - Line 20-21: Has hardcoded `redirect("/auth")` stub
   - This is for the "authentication disabled" state but may interfere
   
3. **`app/auth/page.tsx`** - Auth page
   - Simple page that renders `SignIn` component
   - No logic to handle post-authentication redirects
   
4. **`components/auth/SignIn.tsx`** - Sign-in component
   - Line 35-49: `handleEmailSignIn` calls `router.push('/')` after success
   - Line 64-85: `handleSignUp` calls `router.push('/')` after success  
   - Line 93-121: `handlePasskeySignIn` calls `router.push('/')` after success
   - **ISSUE**: Always redirects to `'/'` (home/dashboard), not the original requested page

### Problem Identified
After successful authentication, the SignIn component always redirects to `'/'` regardless of where the user originally intended to go. The middleware doesn't preserve the original URL, and the auth component doesn't check for a return URL.

### Fix Required
1. **Middleware**: Add `returnTo` query parameter when redirecting to auth
   ```typescript
   const returnTo = encodeURIComponent(path)
   return NextResponse.redirect(new URL(`/auth?returnTo=${returnTo}`, request.url))
   ```

2. **SignIn.tsx**: Read returnTo parameter and redirect there instead of '/'
   ```typescript
   const searchParams = useSearchParams()
   const returnTo = searchParams.get('returnTo') || '/'
   // Use returnTo in router.push(returnTo)
   ```

### Verification Steps
1. While logged out, navigate directly to `/profile`
2. Verify redirected to `/auth?returnTo=%2Fprofile`
3. Sign in with valid credentials
4. Verify automatically redirected back to `/profile`
5. Test with other protected routes (appointments, inventory, etc.)

---

## Issue 3: Remove Customer Satisfaction and Artist/Appointment Ratings

### Current Behavior
- Customer satisfaction metrics displayed in business insights
- Artist ratings shown on staff dashboard
- Appointment ratings visible in various places

### Root Cause Analysis

#### Files to Investigate

**A. Staff Dashboard Ratings (app/dashboardClient.tsx)**
- Lines 465-466: `ratings` state for staff dashboard
- Lines 487-489: `fetchRatings` callback
- Lines 620-691: "My Ratings" section in StaffDashboard component
- Uses `getStaffRatings` from `app/api/actions/ratings.ts`

**B. Business Insights - Customer Satisfaction (components/metrics/businessInsights.tsx)**
- Lines 97, 206: Ratings metrics state
- Lines 1172-1277: "Customer Satisfaction" section with:
  - Average Rating metric card
  - Total Ratings metric card
  - Rating Distribution chart
  - Staff Performance section (top rated artists)
  - Appointment Reviews section

**C. Rating Actions (app/api/actions/ratings.ts)**
- Already stubbed with TODO comment
- All functions return null/empty arrays
- No actual database operations

**D. Rate Staff Modal (components/appointments/rateStaffModal.tsx)**
- Full rating UI component for submitting ratings
- May be used in appointments page

**E. Appointments Page (app/appointments/appointmentsPage.tsx)**
- Line 45: Imports `getAppointmentRating`
- May have UI for viewing/submitting ratings

### Components to Remove

1. **From `app/dashboardClient.tsx`:**
   - Remove `ratings` state (line 465-466)
   - Remove `fetchRatings` callback (lines 487-489)
   - Remove `await fetchRatings()` from `getValues` (line 513)
   - Remove entire "My Ratings" section JSX (lines 620-691)
   - Remove `ratings` from DashboardData interface (line 65)
   - Remove `getStaffRatings` import (line 38)
   - Remove `AppointmentRating` import (line 39)

2. **From `components/metrics/businessInsights.tsx`:**
   - Remove ratings state (line 97)
   - Remove `getRatingMetrics` import (line 10)
   - Remove `RatingMetrics` import (line 17)
   - Remove ratings data fetch (line 206)
   - Remove "Customer Satisfaction" section (lines 1172-1277)
   - Remove `ratings` from state and all references

3. **Delete files:**
   - `components/appointments/rateStaffModal.tsx`
   - `app/api/actions/ratings.ts`
   - `supabase/ratings.sql`

4. **Clean up imports and references:**
   - Remove rating-related code from appointments page
   - Remove rating types from type definitions if no longer needed
   - Check for any other rating-related components

### Verification Steps
1. Load staff dashboard - verify no "My Ratings" section
2. Load admin metrics page - verify no "Customer Satisfaction" section
3. Load appointments page - verify no rating UI
4. Search codebase for any remaining rating references
5. Run `bun run lint` to ensure no import errors

---

## Implementation Order

1. **First: Fix Dashboard Loading (Issue 1)**
   - Quick string case fix
   - Immediate user impact

2. **Second: Fix Auth Redirect (Issue 2)**
   - Update middleware to add returnTo parameter
   - Update SignIn component to respect returnTo
   - Test with multiple entry points

3. **Third: Remove Ratings (Issue 3)**
   - Remove ratings UI from dashboard
   - Remove ratings from business insights
   - Delete rating files and clean up imports
   - Run linter and fix any issues

---

## Testing Checklist

### Dashboard Loading
- [ ] Admin dashboard loads without infinite spinner
- [ ] Staff dashboard loads without infinite spinner
- [ ] View toggle works for admin (switch between admin/staff view)
- [ ] Client dashboard still works (if applicable)

### Auth Redirect
- [ ] Visiting /profile while logged out redirects to /auth?returnTo=%2Fprofile
- [ ] After login, user is redirected to /profile
- [ ] Visiting /appointments while logged out redirects correctly
- [ ] After login, user is redirected to /appointments
- [ ] Direct visit to /auth (no returnTo) still redirects to / after login

### Ratings Removal
- [ ] Staff dashboard has no "My Ratings" section
- [ ] Metrics page has no "Customer Satisfaction" section
- [ ] No rating modals or UI elements visible
- [ ] No console errors about missing rating functions
- [ ] `bun run lint` passes with no errors

---

## Notes

- The ratings functionality has already been stubbed in `app/api/actions/ratings.ts` - it's just the UI that needs removal
- Consider keeping the types definitions (`AppointmentRating`, etc.) in case they're referenced elsewhere, or remove them if truly unused
- The auth redirect fix requires coordination between middleware (server) and SignIn component (client)
- The dashboard case sensitivity issue is a simple fix but high impact
