# Clock-In/Out Audit & Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the double passkey verification bug, ensure clock-in completes successfully, and harden the clock-in/out flow for robustness.

**Architecture:** The clock-in flow has three entry points (dashboard widget, dedicated time-clock page, my-time-clock page) that converge on `ClockInScanner`. The dashboard widget incorrectly adds a redundant passkey verification step before opening the scanner, which already handles verification post-QR-scan. The fix removes this redundancy, adds proper loading/error states, and ensures the window closes reliably after successful clock-in.

**Tech Stack:** Next.js 15, React 19, TypeScript, Better Auth (passkey), html5-qrcode

---

## Root Cause Analysis

### Bug 1: Double Passkey Verification
**Entry Point:** Dashboard widget (`components/dashboard/timeClockWidget.tsx`)

**Flow:**
1. User clicks "Clock In" → `handleClockInClick()` (line 83-86) sets `verificationAction = 'clockIn'` and opens `PasskeyVerification`
2. User verifies → `handleVerified()` (line 93-103) opens `ClockInScanner`
3. User scans QR → `handleScanSuccess()` (line 64-74 in ClockInScanner) opens `PasskeyVerification` AGAIN
4. User verifies again → `handleVerified()` (line 76-105 in ClockInScanner) finally calls `clockInWithQR`

**Fix:** Remove passkey verification from dashboard widget for clock-in. The `ClockInScanner` already handles verification after QR scan. Keep verification for clock-out only.

### Bug 2: Window Not Closing After Clock-In
After successful `clockInWithQR`, `ClockInScanner` calls `setSuccess(true)` and schedules `onSuccessRef.current()` after 1500ms. The dashboard's `handleClockInSuccess` should close the scanner. This works in isolation, but the double verification flow may cause state confusion.

### Bug 3: PasskeyOnboarding Shows Unnecessarily
When `hasPasskeys` is `false` (e.g., context not yet loaded), the `PasskeyOnboarding` modal flashes instead of `PasskeyVerification`. The `usePasskeyStatus` hook may return `false` before the context initializes.

### Bug 4: No Error Recovery
If `clockInWithQR` fails after passkey verification, the user must restart from QR scanning. The `pendingQrCode` is cleared in `finally` block (line 103), but there's no retry mechanism.

---

## Files Affected

| File | Role |
|------|------|
| `components/dashboard/timeClockWidget.tsx` | Dashboard clock-in/out widget - **PRIMARY BUG** |
| `components/clock/ClockInScanner.tsx` | QR scanner with passkey verification |
| `components/clock/ClockOutButton.tsx` | Clock-out button with passkey verification |
| `components/auth/PasskeyVerification.tsx` | Passkey verification modal |
| `components/auth/PasskeyOnboarding.tsx` | Passkey setup modal |
| `contexts/PasskeyStatusContext.tsx` | Passkey status context |
| `server/actions/time-clock.ts` | Server actions for clock-in/out |
| `app/time-clock/page.tsx` | Dedicated time-clock page |
| `app/my-time-clock/page.tsx` | My time-clock page |

---

## Task 1: Fix Double Passkey in Dashboard Widget

**Files:**
- Modify: `components/dashboard/timeClockWidget.tsx:83-103`

**Problem:** The dashboard widget requires passkey verification BEFORE opening the scanner, but the scanner requires passkey verification AFTER QR scan. This creates a redundant double-verification.

**Step 1: Remove passkey verification for clock-in from dashboard widget**

Modify `components/dashboard/timeClockWidget.tsx`:

```typescript
// Change handleClockInClick to directly open scanner (no pre-verification)
const handleClockInClick = () => {
    setShowScanner(true)
}

// Keep handleClockOutClick with verification (clock-out needs it)
const handleClockOutClick = () => {
    setVerificationAction('clockOut')
    setShowVerification(true)
}

// Update handleVerified to only handle clock-out
const handleVerified = async () => {
    setShowVerification(false)

    if (verificationAction === 'clockOut') {
        await handleClockOut()
    }

    setVerificationAction(null)
}

// Update PasskeyVerification props to only show for clock-out
<PasskeyVerification
    isOpen={showVerification}
    onClose={() => {
        setShowVerification(false)
        setVerificationAction(null)
    }}
    onVerified={handleVerified}
    title="Verify Clock Out"
    description="Please verify your identity to clock out."
/>
```

**Step 2: Verify the fix**

Test the flow:
1. Dashboard → Click "Clock In" → Scanner opens directly (no passkey prompt)
2. Scan QR → Passkey verification appears (once)
3. Verify → Clock-in succeeds → Window closes
4. Dashboard → Click "Clock Out" → Passkey verification appears
5. Verify → Clock-out succeeds

**Step 3: Commit**

```bash
git add components/dashboard/timeClockWidget.tsx
git commit -m "fix(clock): remove redundant passkey verification for clock-in on dashboard"
```

---

## Task 2: Fix Passkey Status Context Race Condition

**Files:**
- Modify: `contexts/PasskeyStatusContext.tsx`
- Modify: `hooks/usePasskeyStatus.ts`

**Problem:** `usePasskeyStatus` may return `hasPasskeys: false` before the context loads, causing `PasskeyOnboarding` to flash instead of `PasskeyVerification`.

**Step 1: Add loading state to passkey status context**

Read `contexts/PasskeyStatusContext.tsx` first, then add an `isLoading` field:

```typescript
interface PasskeyStatusContextType {
    hasPasskeys: boolean
    isLoading: boolean
    refreshStatus: () => Promise<void>
}

// In the provider, add:
const [isLoading, setIsLoading] = useState(true)

// Set isLoading to false after fetch completes
// Return isLoading in the context value
```

**Step 2: Update ClockInScanner to handle loading state**

Modify `components/clock/ClockInScanner.tsx`:

```typescript
const { hasPasskeys, isLoading: passkeysLoading } = usePasskeyStatus()

const handleScanSuccess = useCallback(async (decodedText: string) => {
    if (isLoadingRef.current) return

    setPendingQrCode(decodedText)

    // Wait for passkey status to load before deciding
    if (passkeysLoading) {
        // Show a brief loading state, then check again
        // Or: queue the verification until status is known
        return
    }

    if (hasPasskeys) {
        setShowVerification(true)
    } else {
        setShowPasskeySetup(true)
    }
    await stopScanner()
}, [hasPasskeys, passkeysLoading])
```

**Step 3: Update ClockOutButton similarly**

Same pattern for `ClockOutButton.tsx`.

**Step 4: Commit**

```bash
git add contexts/PasskeyStatusContext.tsx hooks/usePasskeyStatus.ts components/clock/ClockInScanner.tsx components/clock/ClockOutButton.tsx
git commit -m "fix(clock): add loading state to passkey status to prevent race condition"
```

---

## Task 3: Add Error Recovery and Retry to ClockInScanner

**Files:**
- Modify: `components/clock/ClockInScanner.tsx:76-105`

**Problem:** If `clockInWithQR` fails after passkey verification, the user must restart from QR scanning. The `pendingQrCode` is cleared in `finally`, preventing retry.

**Step 1: Preserve QR code on failure for retry**

Modify `handleVerified` in `ClockInScanner.tsx`:

```typescript
const handleVerified = async () => {
    if (!pendingQrCode) return

    setShowVerification(false)
    setIsLoading(true)
    setError(null)

    try {
        const { clockInWithQR } = await import("@/server/actions/time-clock")
        const result = await clockInWithQR(staffIdRef.current, pendingQrCode)

        if (!result.success) {
            setError(result.error)
            setIsLoading(false)
            // Keep pendingQrCode so user can retry
            return
        }

        setSuccess(true)
        // Only clear QR code on success
        setPendingQrCode(null)

        setTimeout(() => {
            onSuccessRef.current()
        }, SUCCESS_REDIRECT_DELAY_MS)
    } catch {
        createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: 'Clock in failed' }] })
        setError("Failed to process clock in. Please try again.")
        setIsLoading(false)
        // Keep pendingQrCode so user can retry
    }
}

// Add retry function
const handleRetryVerification = () => {
    if (pendingQrCode && hasPasskeys) {
        setShowVerification(true)
    } else if (pendingQrCode) {
        setShowPasskeySetup(true)
    }
}
```

**Step 2: Add retry UI when error occurs with pending QR**

Add a "Try Again" button in the error display section:

```tsx
{error && (
    <div className="flex flex-col gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-md">
        <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-200">{error}</p>
        </div>
        {pendingQrCode && (
            <Button
                onClick={handleRetryVerification}
                variant="outline"
                size="sm"
                className="w-full"
            >
                Retry Verification
            </Button>
        )}
    </div>
)}
```

**Step 3: Commit**

```bash
git add components/clock/ClockInScanner.tsx
git commit -m "fix(clock): add error recovery and retry for failed clock-in attempts"
```

---

## Task 4: Implement Password Fallback in PasskeyVerification

**Files:**
- Modify: `components/auth/PasskeyVerification.tsx:58-75`

**Problem:** The password fallback shows "Password verification not yet implemented" and just closes the modal. This leaves users without passkeys unable to verify.

**Step 1: Implement password verification fallback**

Modify `handlePasswordVerify` in `PasskeyVerification.tsx`:

```typescript
const handlePasswordVerify = async () => {
    if (!password.trim()) {
        setError('Please enter your password')
        return
    }

    setError(null)
    setIsLoading(true)

    try {
        // Use Better Auth's email/password sign-in as verification
        const result = await authClient.signIn.email({
            email: /* get current user email from session */,
            password: password,
        })

        if (result.error) {
            setError(result.error.message || 'Password verification failed')
            return
        }

        addNotification('Identity verified', 'SUCCESS')
        onVerified()
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
        setIsLoading(false)
    }
}
```

**Note:** Need to check Better Auth API for the correct method. May need to get current user's email from session context.

**Step 2: Commit**

```bash
git add components/auth/PasskeyVerification.tsx
git commit -m "feat(auth): implement password fallback for passkey verification"
```

---

## Task 5: Add Loading Indicator During Passkey Verification in ClockInScanner

**Files:**
- Modify: `components/clock/ClockInScanner.tsx`

**Problem:** After scanning QR and during passkey verification, there's no visual feedback that verification is in progress. The scanner is stopped but the UI shows the scanner container with no indication of what's happening.

**Step 1: Add verification loading state**

Add a new state variable and update the UI:

```typescript
const [isVerifying, setIsVerifying] = useState(false)
```

Update `handleScanSuccess` to set `isVerifying`:

```typescript
const handleScanSuccess = useCallback(async (decodedText: string) => {
    if (isLoadingRef.current) return

    setPendingQrCode(decodedText)
    setIsVerifying(true)

    if (hasPasskeys) {
        setShowVerification(true)
    } else {
        setShowPasskeySetup(true)
    }
    await stopScanner()
}, [hasPasskeys])
```

Update `handleVerified` and modal close handlers to reset `isVerifying`:

```typescript
const handleVerified = async () => {
    setIsVerifying(false)
    // ... rest of function
}
```

**Step 2: Show verification loading overlay**

Add a loading overlay when `isVerifying` is true and `showVerification` or `showPasskeySetup` is open:

```tsx
{(showVerification || showPasskeySetup) && pendingQrCode && (
    <div className="flex items-center justify-center gap-2 text-white/70 py-4">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Verifying identity...</span>
    </div>
)}
```

**Step 3: Commit**

```bash
git add components/clock/ClockInScanner.tsx
git commit -m "fix(clock): add loading indicator during passkey verification"
```

---

## Task 6: Harden Server Action Error Messages

**Files:**
- Modify: `server/actions/time-clock.ts:187-307`

**Problem:** Some error messages from `clockInWithQR` are generic. Better error messages help debug issues.

**Step 1: Improve error messages in clockInWithQR**

Review and enhance error messages:

```typescript
// Line 237: Already clocked in
if (existingActiveEntry) {
    return failure("Already clocked in. Please clock out first before clocking in again.")
}

// Line 219: Invalid QR
return failure(qrVerification.error || "Invalid QR code. Please scan a valid studio QR code.")

// Line 248: QR session not found
if (!qrSession) {
    return failure("QR session not found. The QR code may have expired. Please scan a new one.")
}
```

**Step 2: Add validation for edge cases**

Add additional checks:

```typescript
// Check if QR code format is valid before database lookup
if (!qrCode.startsWith('CLK-')) {
    return failure("Invalid QR code format. Please scan a valid studio QR code.")
}

// Check if branch still exists
if (!branch) {
    return failure("Branch not found. Please contact your administrator.")
}
```

**Step 3: Commit**

```bash
git add server/actions/time-clock.ts
git commit -m "fix(clock): improve error messages and add validation in clockInWithQR"
```

---

## Task 7: Unify Clock-In Flow Across All Entry Points

**Files:**
- Modify: `app/time-clock/page.tsx:215-222`
- Modify: `app/my-time-clock/page.tsx:215-222`
- Modify: `components/dashboard/timeClockWidget.tsx`

**Problem:** The dashboard widget had a different flow (pre-verification) compared to the dedicated pages (post-verification). After Task 1, all entry points should use the same flow: open scanner → scan QR → verify → clock-in.

**Step 1: Verify consistency across all entry points**

Check that all three entry points:
1. `app/time-clock/page.tsx` - Opens `ClockInScanner` directly on button click
2. `app/my-time-clock/page.tsx` - Opens `ClockInScanner` directly on button click
3. `components/dashboard/timeClockWidget.tsx` - After Task 1, opens `ClockInScanner` directly

All should now follow the same pattern.

**Step 2: Extract shared clock-in button component (optional improvement)**

If the clock-in button logic is duplicated across pages, consider extracting to a shared component:

```typescript
// components/clock/ClockInButton.tsx
interface ClockInButtonProps {
    staffId: string
    onSuccess: () => void
    variant?: 'default' | 'compact'
}

export default function ClockInButton({ staffId, onSuccess, variant = 'default' }: ClockInButtonProps) {
    const [showScanner, setShowScanner] = useState(false)

    const handleSuccess = () => {
        setShowScanner(false)
        onSuccess()
    }

    return (
        <>
            <button onClick={() => setShowScanner(true)} className={/* variant styles */}>
                Clock In
            </button>
            {showScanner && (
                <Modal>
                    <ClockInScanner
                        staffId={staffId}
                        onSuccess={handleSuccess}
                        onCancel={() => setShowScanner(false)}
                    />
                </Modal>
            )}
        </>
    )
}
```

**Step 3: Commit**

```bash
git add app/time-clock/page.tsx app/my-time-clock/page.tsx components/dashboard/timeClockWidget.tsx
git commit -m "refactor(clock): unify clock-in flow across all entry points"
```

---

## Task 8: Run Lint and TypeCheck

**Files:**
- All modified files

**Step 1: Run lint**

```bash
bun run lint
```

Expected: No errors

**Step 2: Run typecheck**

```bash
bun run build
```

Expected: Build succeeds

**Step 3: Fix any issues**

Address any lint or type errors found.

**Step 4: Commit fixes if needed**

```bash
git add .
git commit -m "fix(clock): resolve lint and type errors"
```

---

## Improvement Suggestions

### 1. Add Clock-In Confirmation Sound
Play a subtle sound on successful clock-in for immediate feedback, especially useful in noisy studio environments.

### 2. Add Clock-In History Summary on Dashboard
Show today's clock-in/out times on the dashboard widget for quick reference.

### 3. Add Offline Support
Cache the last known clock status locally. If the network is unavailable, show the cached status with a warning indicator.

### 4. Add Geolocation Verification
Optionally record the user's location when clocking in (with permission) for audit purposes.

### 5. Add Auto Clock-Out
Implement a configurable auto clock-out after N hours to prevent forgotten clock-outs.

### 6. Add Shift Notifications
Send push notifications when a shift is about to start or when a user forgets to clock out.

---

## Testing Checklist

After implementing all tasks, verify:

- [ ] Dashboard "Clock In" opens scanner directly (no pre-verification)
- [ ] Dashboard "Clock Out" shows passkey verification
- [ ] `/time-clock` page "Clock In" opens scanner directly
- [ ] `/my-time-clock` page "Clock In" opens scanner directly
- [ ] QR scan triggers passkey verification (once)
- [ ] Successful verification completes clock-in and closes window
- [ ] Failed verification shows error with retry option
- [ ] Passkey onboarding only shows when user has no passkeys
- [ ] Password fallback works when passkey is unavailable
- [ ] Error messages are clear and actionable
- [ ] Loading states are visible during all async operations
- [ ] No console errors during normal flow
- [ ] Build succeeds with `bun run build`
- [ ] Lint passes with `bun run lint`
