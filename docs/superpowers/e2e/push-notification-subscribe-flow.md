# E2E Test: Push Notification Subscribe/Unsubscribe Flow

**Date:** 2026-06-05
**Task:** Task 10 — Phase 5 (E2E Browser Testing)
**App URL:** `https://localhost:3001/profile`

## Flow Description

This test verifies the end-to-end push notification subscribe and unsubscribe flow
via the `PushNotificationSettings` component on the user profile page.

The component displays:
- A toggle button that shows current subscription state
- "Push Notifications" heading text
- A subscribe/unsubscribe action bound to the browser's Push API
- Error states when the browser permission is denied or the service fails
- A loading spinner during async operations

**Component location:** `components/push-notification-settings.tsx`
**Profile page integration:** `app/profile/profilePage.tsx` (line ~922)

## Prerequisites

- Dev server running at `https://localhost:3001`
- User is authenticated and on the profile page
- Browser supports Service Worker, PushManager, and Notification APIs

## Test Procedure

### Step 1 — Load Profile Page

Open `https://localhost:3001/profile` and verify the page renders.

**Actions:**
1. Navigate to the profile page
2. Take a full-page screenshot
3. Verify the page loaded successfully (no error boundaries, 500 errors, etc.)

**Expected result:** Page loads with profile information.

### Step 2 — Verify PushNotificationSettings Component Renders

Look for the "Push Notifications" text on the page to confirm the
`PushNotificationSettings` component is rendered.

**Actions:**
1. Search page content for "Push Notifications" text
2. Take a screenshot showing the component area

**Expected result:** The heading "Push Notifications" is visible in the profile
page layout, indicating `isSupported` returned `true`.

### Step 3 — Observe Initial Toggle State (Unsubscribed)

Before any subscription, the toggle should show the unsubscribed state.

**Actions:**
1. Inspect the toggle button appearance
2. Take a close-up screenshot

**Expected result:**
- Toggle knob is positioned on the left (unsubscribed)
- Background color is zinc-700 (no blue highlight)
- Helper text says: "Get notified when payroll requests are submitted or disbursed"
- Icon is `BellOffIcon` (gray)

### Step 4 — Click Subscribe Toggle

Click the toggle button to trigger the subscribe flow.

**Actions:**
1. Click the toggle button (aria-label: "Enable push notifications")
2. Observe the browser permission dialog (MANUAL STEP — see notes)
3. After granting permission, observe the component state

**Expected result:**
- Browser shows native notification permission prompt
- After granting, toggle moves to subscribed state (knob right, blue background)
- Helper text changes to: "You will receive payroll notifications on your device"
- Icon changes to `BellIcon` (blue)

**Manual Interaction Required:** The browser notification permission dialog
(`Notification.requestPermission()`) is a native browser UI element that cannot
be automated through Chrome DevTools Protocol (CDP). The tester must manually
click "Allow" or "Block" when the dialog appears.

### Step 5 — Observe Subscribed State

After successful subscription, verify the toggle reflects the subscribed state.

**Actions:**
1. Wait for loading spinner to disappear
2. Take a screenshot of the subscribed state

**Expected result:**
- Toggle knob is positioned on the right (subscribed)
- Background is blue-500
- No error message visible
- Bell icon is visible in blue

### Step 6 — Click Unsubscribe Toggle

Click the toggle again to trigger the unsubscribe flow.

**Actions:**
1. Click the toggle button (aria-label: "Disable push notifications")
2. Observe the toggle transitions back to unsubscribed state
3. Take a screenshot

**Expected result:**
- Toggle returns to unsubscribed state
- No error message
- Helper text reverts to unsubscribed description

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Profile page loads without errors | PASS |
| 2 | "Push Notifications" heading is visible on the page | PASS |
| 3 | Toggle renders in unsubscribed state by default | PASS |
| 4 | Clicking toggle triggers browser permission dialog | MANUAL |
| 5 | After granting permission, toggle shows subscribed state | NOT TESTED |
| 6 | Clicking toggle again returns to unsubscribed state | NOT TESTED |
| 7 | Error states display correctly when permission is denied | PASS |
| 8 | Loading spinner shows during async operations | NOT TESTED |

## Notes

- **CDP Limitation:** Native browser permission dialogs (Notifications, Geolocation,
  Camera, etc.) are rendered outside the DOM by the browser chrome and cannot be
  interacted with via Chrome DevTools Protocol. This test requires the tester to
  manually click "Allow"/"Block" when the permission prompt appears (Step 4).
- **Browser Support:** The component checks for `serviceWorker`, `PushManager`,
  and `Notification` APIs. The component returns `null` (renders nothing) if
  `isSupported` is `false`.
- **Server dependency:** Subscribe/unsubscribe actions call server actions
  (`subscribePushSubscription`, `unsubscribePushSubscription`) which require
  the Supabase backend to be available.

## Results

**Test executed:** 2026-06-05
**Browser:** Chromium (headless) via agent_browser
**Auth:** e2e-staff@rdmdstudio.com
**Dev server:** https://localhost:3000

### Screenshots

| Step | Screenshot | Size | Description |
|------|-----------|------|-------------|
| 1 | `screenshots/step1-profile-page.png` | 58.5 KiB | Profile page loaded with PushNotificationSettings visible |
| 2 | `screenshots/step2-component-visible.png` | 55.2 KiB | PushNotificationSettings component with toggle in unsubscribed state |
| 3 | `screenshots/step3-unsubscribed-state.png` | 55.2 KiB | Close-up of unsubscribed toggle with "Get notified..." helper text |
| 4 | `screenshots/step4-permission-dialog.png` | 59.9 KiB | Page state after clicking toggle (permission dialog appeared, auto-denied in headless) |
| 5 | `screenshots/step5-error-denied-state.png` | 73.3 KiB | Error message: "Notification permission was denied. Please enable it in your browser settings." |
| 6 | `screenshots/step6-headed-unsubscribed.png` | 172.1 KiB | Headed session showing the toggle in unsubscribed state (visual verification) |

### Findings

#### Passed (Automated)

1. **Component renders correctly** — The `PushNotificationSettings` component is
   rendered on the profile page (`app/profile/profilePage.tsx` line ~922). Verified
   via snapshot showing heading "Push Notifications" at `ref=e8` and toggle button
   at `ref=e9`.

2. **Unsubscribed state is correct** — By default, the toggle shows:
   - Button aria-label: "Enable push notifications"
   - Helper text: "Get notified when payroll requests are submitted or disbursed"
   - Icon: `BellOffIcon` (gray, zinc-500)
   - Toggle knob: left position (unsubscribed)

3. **Error state works correctly** — When the browser auto-denies the notification
   permission (default headless Chrome behavior), the component displays:
   > "Notification permission was denied. Please enable it in your browser settings."
   
   This error message uses `text-red-400` styling and appears below the toggle.

4. **Browser support check works** — The component checks `serviceWorker`,
   `PushManager`, and `Notification` APIs. In the tested Chromium browser, all
   three APIs are available, so the component renders rather than returning `null`.

#### Requires Manual Testing (CDP Limitation)

5. **Permission dialog interaction** — When `Notification.permission` is `"default"`
   (not yet asked), clicking the toggle calls `Notification.requestPermission()`.
   This opens a native browser dialog that:
   - Is rendered outside the DOM by the browser chrome
   - Cannot be automated or inspected via Chrome DevTools Protocol (CDP)
   - Must be manually clicked by a human tester

   In the headed session test, the permission dialog appeared and was visible,
   but could not be programmatically accepted.

6. **Subscribed state and unsubscribe flow** — Could not be fully automated because:
   - Headless Chrome auto-denies notification permission by default
   - `Browser.grantPermissions` via CDP did not propagate to the page's
     `Notification.permission` value
   - The VAPID public key server action (`getVapidPublicKey`) and subscription
     endpoints require Supabase backend connectivity

   These flows require a **headed browser session with manual permission acceptance**.

#### Edge Cases Verified

- The component gracefully handles denied permission (does not crash)
- Error message clears when re-clicking after a failed attempt
- The toggle button remains functional after error (not permanently disabled)
- The component does not render if `isSupported` is false (verified by code review
  of the early return `if (!isSupported) { return null }`)

### Test Status

- [ ] All acceptance criteria passed
- [x] Partial pass (see findings)
- [ ] Failed (see findings)

**Summary:** 4 of 8 criteria passed in automation, 1 requires manual testing
(browser permission dialog), 3 not tested due to CDP limitations with notification
permissions. The core UI rendering and error handling are verified as correct.
