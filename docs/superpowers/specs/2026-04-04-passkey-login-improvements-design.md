# Passkey & Login Flow Improvements - Design Document

**Date**: 2026-04-04
**Status**: Approved
**Implementation Approach**: Phased

## Overview

This document outlines the design for improving passkey adoption and enforcement across the Inksight RDMD application. The changes include a modernized login flow, passkey onboarding wizard, dashboard enforcement, and passkey-protected time clock operations.

## Current State Analysis

### Existing Passkey Implementation
- **Server**: `@better-auth/passkey` plugin configured in `server/auth.ts`
- **Client**: `passkeyClient()` plugin in `lib/auth-client.ts` with WebAuthn availability helpers
- **UI**: `PasskeyManager` component in profile for CRUD operations

### Existing Login Implementation
- Tabbed interface (Sign In / Sign Up)
- Password/Passkey method toggle
- Passkey autofill enabled via `handlePasskeySignIn(true)` on mount
- Last method stored in localStorage

### Existing Time Clock
- Clock-In: QR code scan via `ClockInScanner`
- Clock-Out: Simple button click via `ClockOutButton`
- No passkey verification in either flow

## Design Specifications

### Phase 1: Modern Login Flow

**Goal**: Single-page login with Email + Password as primary, passkey autofill working in background.

#### UI Changes

1. **Remove Tab Structure**
   - Single unified form instead of Sign In / Sign Up tabs
   - Sign Up becomes inline expansion from "Create account" link

2. **Primary Form Layout**
   ```
   ┌─────────────────────────────────────┐
   │  Welcome Back                       │
   │                                     │
   │  ┌─────────────────────────────┐   │
   │  │ 📧 Email                   │   │
   │  └─────────────────────────────┘   │
   │  ┌─────────────────────────────┐   │
   │  │ 🔒 Password           👁️  │   │
   │  └─────────────────────────────┘   │
   │                                     │
   │  [        Sign In →        ]       │
   │                                     │
   │  ──── or ────                       │
   │                                     │
   │  [🔐 Sign in with passkey]         │
   │                                     │
   │  Don't have an account? Create one  │
   └─────────────────────────────────────┘
   ```

3. **Passkey Autofill**
   - Email input: `autocomplete="email webauthn"`
   - Password input: `autocomplete="current-password webauthn"`
   - Background `authClient.signIn.passkey({ autoFill: true })` on mount
   - Browser-native passkey suggestion in credential picker

4. **Sign Up Expansion**
   - Clicking "Create one" expands inline to show:
     - Full Name field
     - Invitation Code field
     - Password requirements display
     - Create Account button

#### Technical Changes

**File: `components/auth/SignIn.tsx`**
- Remove `activeTab` state and tab UI
- Remove `authMethod` toggle
- Keep passkey autofill effect
- Add conditional rendering for sign-up fields
- Add proper `autocomplete` attributes

**File: `lib/auth-client.ts`**
- No changes needed (already configured correctly)

---

### Phase 2: Passkey Onboarding Wizard

**Goal**: 3-step guided wizard for first-time passkey setup.

#### UI Design

**Step 1: Introduction**
```
┌─────────────────────────────────────┐
│  🔐 Secure Your Account            │
│                                     │
│  Passkeys let you sign in with:     │
│  • Face ID, Touch ID, or Windows    │
│    Hello                            │
│  • No passwords to remember         │
│  • Protection against phishing      │
│                                     │
│  [    Set Up Passkey →    ]         │
│  [        Skip for now        ]     │
└─────────────────────────────────────┘
```

**Step 2: Device Detection & Registration**
```
┌─────────────────────────────────────┐
│  📱 Register Your Passkey           │
│                                     │
│  Detected: macOS (Safari)           │
│                                     │
│  Passkey Name:                      │
│  ┌─────────────────────────────┐   │
│  │ MacBook Pro                 │   │
│  └─────────────────────────────┘   │
│                                     │
│  [    Register Passkey     ]        │
│                                     │
│  Your device will prompt for        │
│  Face ID or Touch ID                │
└─────────────────────────────────────┘
```

**Step 3: Success & Tips**
```
┌─────────────────────────────────────┐
│  ✅ Passkey Registered!             │
│                                     │
│  You can now sign in without        │
│  a password on this device.         │
│                                     │
│  💡 Tips:                           │
│  • Add passkeys on other devices    │
│  • Your passkey syncs via iCloud/   │
│    Google Password Manager          │
│                                     │
│  [      Done      ]                 │
└─────────────────────────────────────┘
```

#### Device Detection Logic

```typescript
function detectDevice(): { platform: string; suggestedName: string } {
  const ua = navigator.userAgent;
  if (/Mac/.test(ua)) return { platform: 'macOS', suggestedName: 'MacBook' };
  if (/iPhone|iPad/.test(ua)) return { platform: 'iOS', suggestedName: 'iPhone' };
  if (/Windows/.test(ua)) return { platform: 'Windows', suggestedName: 'Windows PC' };
  if (/Android/.test(ua)) return { platform: 'Android', suggestedName: 'Android Phone' };
  return { platform: 'Desktop', suggestedName: 'My Device' };
}
```

#### Technical Changes

**New File: `components/auth/PasskeyOnboarding.tsx`**
- 3-step wizard component
- Device detection
- Integration with `authClient.passkey.addPasskey()`
- Skip functionality with localStorage tracking

**New File: `hooks/usePasskeyStatus.ts`**
- Hook to check if user has passkeys
- Returns `{ hasPasskeys: boolean, passkeyCount: number, isLoading: boolean }`
- Uses `authClient.passkey.listUserPasskeys()`

---

### Phase 3: Dashboard Passkey Enforcement

**Goal**: Persistent banner + first-login modal for users without passkeys.

#### Dashboard Banner

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ Your account is not secured with a passkey.              │
│    [Set Up Now]                                    [Learn More] │
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Yellow/amber background with warning icon
- Non-dismissible until user has ≥1 passkey
- "Set Up Now" opens onboarding wizard
- "Learn More" opens help modal with passkey explanation
- Only visible to authenticated users with 0 passkeys

#### First Login Modal

**Trigger Conditions:**
- User has 0 passkeys
- `localStorage.getItem('passkeyOnboardingDismissed')` is null
- User is on dashboard or first protected route

**Behavior:**
- Shows onboarding wizard (Phase 2)
- Can be dismissed with "Skip for now"
- Sets `passkeyOnboardingDismissed = 'true'` on dismiss
- Banner remains visible after dismissal

#### Technical Changes

**New File: `components/auth/PasskeyBanner.tsx`**
- Persistent banner component
- Checks passkey status via `usePasskeyStatus` hook
- Integrates with onboarding wizard

**Modified File: `app/layout.tsx` or `components/page-wrapper.tsx`**
- Include `PasskeyBanner` for authenticated users
- Include `PasskeyOnboarding` modal with first-login logic

---

### Phase 4: Time Clock Passkey Verification

**Goal**: Strict passkey requirement for clock-in and clock-out operations.

#### Clock-In Flow

```
Current Flow:
  User → Scan QR → Clock In ✅

New Flow:
  User → Scan QR → Passkey Verification → Clock In ✅
                    ↓ (if verification fails)
                    Retry or Cancel
```

#### Clock-Out Flow

```
Current Flow:
  User → Click "Clock Out" → Clock Out ✅

New Flow:
  User → Click "Clock Out" → Passkey Verification → Clock Out ✅
                              ↓ (if verification fails)
                              Retry or Cancel
```

#### Passkey Verification Modal

```
┌─────────────────────────────────────┐
│  🔐 Verify Your Identity           │
│                                     │
│  To clock in, please verify with    │
│  your passkey.                      │
│                                     │
│  [   Verify with Passkey   ]       │
│                                     │
│  ─────────────────────────────      │
│  Having trouble? Use password       │
│  ┌─────────────────────────────┐   │
│  │ 🔒 Password           👁️  │   │
│  └─────────────────────────────┘   │
│  [   Verify with Password   ]      │
└─────────────────────────────────────┘
```

**Fallback Behavior:**
- If WebAuthn is unavailable, show password fallback
- Log all fallback usage for audit trail
- Error message if neither method works

#### Technical Changes

**New File: `components/auth/PasskeyVerification.tsx`**
- Reusable verification modal component
- Passkey-first with password fallback
- Callback on successful verification
- Error handling and retry logic

**Modified File: `components/clock/ClockInScanner.tsx`**
- Add passkey verification step after QR scan success
- Only call `clockInWithQR` after verification passes
- Pass verification token/data to server action

**Modified File: `components/clock/ClockOutButton.tsx`**
- Add passkey verification before clock-out
- Show verification modal on click
- Only call `clockOut` after verification passes

**Modified File: `server/actions/time-clock.ts`**
- Add verification parameter to `clockInWithQR` and `clockOut`
- Server-side validation of passkey verification
- Audit logging for verification method used

**Modified File: `components/dashboard/timeClockWidget.tsx`**
- Update to use passkey verification for both clock-in and clock-out
- Consistent behavior with main time clock page

---

## Data Flow

### Login Flow
```
1. User enters email + password
2. Client calls authClient.signIn.email()
3. Server validates credentials
4. Session created, redirect to dashboard
```

### Passkey Login Flow
```
1. Browser shows passkey suggestion (autofill)
2. User selects passkey
3. Browser prompts biometric/PIN
4. Client calls authClient.signIn.passkey()
5. Server validates WebAuthn response
6. Session created, redirect to dashboard
```

### Time Clock with Passkey
```
Clock-In:
1. User scans QR code
2. QR code validated locally
3. Passkey verification modal shown
4. User authenticates with passkey
5. Client calls clockInWithQR(staffId, qrCode, verificationData)
6. Server validates QR + verification
7. Clock entry created

Clock-Out:
1. User clicks "Clock Out"
2. Passkey verification modal shown
3. User authenticates with passkey
4. Client calls clockOut(staffId, verificationData)
5. Server validates verification
6. Clock entry updated with clock-out time
```

## Error Handling

### Login Errors
- Invalid credentials: Show inline error
- No passkey found: Suggest password login
- WebAuthn unavailable: Hide passkey option, show password only

### Onboarding Errors
- Registration cancelled: Stay on step 2, show retry
- WebAuthn not supported: Show "passkeys not available" message
- Registration failed: Show error with retry button

### Time Clock Errors
- Passkey verification failed: Show retry option
- WebAuthn unavailable: Show password fallback
- Server verification failed: Show error, log for audit
- No passkeys registered: Block clock-in/out, redirect to profile to set up passkey

## Security Considerations

1. **Passkey Verification**: Server must validate WebAuthn responses, not just trust client
2. **Audit Logging**: Log all verification attempts and fallbacks
3. **Graceful Degradation**: Password fallback for WebAuthn-unavailable devices
4. **Session Management**: Passkey verification should not extend session duration

## Testing Strategy

1. **Login Flow**: Test with and without passkeys, autofill behavior
2. **Onboarding**: Test on iOS, Android, macOS, Windows
3. **Dashboard**: Test banner visibility logic, dismissal behavior
4. **Time Clock**: Test clock-in/out with passkey, fallback scenarios

## Migration Notes

- No database schema changes required
- Existing passkey registrations continue to work
- Feature can be rolled out incrementally per phase
- No breaking changes to existing auth flow

## Dependencies

- `@better-auth/passkey`: Already installed and configured
- WebAuthn API: Browser-native, no additional dependencies
- No new npm packages required

## Implementation Order

1. **Phase 1**: Modern Login Flow (low risk, immediate UX improvement)
2. **Phase 2**: Passkey Onboarding Wizard (enables Phase 3)
3. **Phase 3**: Dashboard Enforcement (depends on Phase 2)
4. **Phase 4**: Time Clock Verification (highest complexity, most security impact)

Each phase should be completed, tested, and deployed before moving to the next.
