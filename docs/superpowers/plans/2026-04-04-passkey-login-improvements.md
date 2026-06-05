# Passkey & Login Flow Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [`) syntax for tracking.

**Goal:** Modernize login flow, enforce passkey setup, and require passkey verification for time clock operations.

**Architecture:** Phased implementation across 4 phases: (1) Modern Login UI, (2) Passkey Onboarding Wizard, (3) Dashboard Enforcement, (4) Time Clock Verification. Each phase builds on the previous and can be tested independently.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Better Auth (passkey plugin), WebAuthn API, Motion (Framer Motion), Lucide Icons

---

## File Structure

### New Files to Create
- `components/auth/PasskeyOnboarding.tsx` - 3-step onboarding wizard component
- `components/auth/PasskeyBanner.tsx` - Persistent dashboard banner for users without passkeys
- `components/auth/PasskeyVerification.tsx` - Reusable passkey verification modal
- `hooks/usePasskeyStatus.ts` - Hook to check user's passkey status

### Existing Files to Modify
- `components/auth/SignIn.tsx` - Major refactor for modern login flow
- `components/clock/ClockInScanner.tsx` - Add passkey verification step
- `components/clock/ClockOutButton.tsx` - Add passkey verification step
- `components/dashboard/timeClockWidget.tsx` - Add passkey verification
- `server/actions/time-clock.ts` - Add verification parameters to clock actions
- `app/layout.tsx` or page wrapper - Add banner and onboarding modal

---

## Phase 1: Modern Login Flow

### Task 1.1: Refactor SignIn Component - Remove Tabs

**Files:**
- Modify: `components/auth/SignIn.tsx`

**Steps:**

- [ ] **Step 1: Remove tab state and toggle UI**

Current code has:
```tsx
const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
```

Remove the tab buttons section (lines ~140-170) and replace with unified header.

- [ ] **Step 2: Create unified sign-in form header**

```tsx
{/* Header */}
<div className='text-center mb-6'>
    <h2 className='text-xl font-semibold text-white'>
        {showSignUp ? 'Create Account' : 'Welcome Back'}
    </h2>
    <p className='text-sm text-white/60 mt-1'>
        {showSignUp 
            ? 'Sign up with your invitation code' 
            : 'Sign in to your account'}
    </p>
</div>
```

- [ ] **Step 3: Add showSignUp state to replace tabs**

```tsx
const [showSignUp, setShowSignUp] = useState(false);
```

- [ ] **Step 4: Remove authMethod toggle section**

Remove the password/passkey toggle buttons at the bottom of sign-in form. Keep the passkey autofill functionality.

- [ ] **Step 5: Commit**

```bash
git add components/auth/SignIn.tsx
git commit -m "refactor(auth): remove tab structure from SignIn component"
```

### Task 1.2: Implement Unified Login Form

**Files:**
- Modify: `components/auth/SignIn.tsx`

**Steps:**

- [ ] **Step 1: Update form autocomplete attributes for passkey autofill**

```tsx
<input
    type='email'
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    required
    autoComplete='email webauthn'
    className='w-full bg-white/5 border border-white/10 rounded-md py-2.5 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all'
    placeholder='you@example.com'
/>

<input
    type={showPassword ? 'text' : 'password'}
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    required
    autoComplete='current-password webauthn'
    className='w-full bg-white/5 border border-white/10 rounded-md py-2.5 pl-10 pr-10 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all'
    placeholder='Enter your password'
/>
```

- [ ] **Step 2: Add "or" divider with passkey button**

```tsx
{/* After the Sign In button */}
<div className='relative my-4'>
    <div className='absolute inset-0 flex items-center'>
        <div className='w-full border-t border-white/10'></div>
    </div>
    <div className='relative flex justify-center text-sm'>
        <span className='px-2 bg-black/40 text-white/40'>or</span>
    </div>
</div>

<button
    type='button'
    onClick={() => handlePasskeySignIn(false)}
    disabled={isLoading}
    className='w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-2.5 rounded-md transition-all duration-200 flex items-center justify-center gap-2'
>
    <Fingerprint className='w-4 h-4' />
    Sign in with passkey
</button>
```

- [ ] **Step 3: Add "Create account" link at bottom**

```tsx
<p className='text-center text-sm text-white/60 mt-4'>
    Don't have an account?{' '}
    <button
        type='button'
        onClick={() => setShowSignUp(true)}
        className='text-blue-400 hover:text-blue-300 font-medium'
    >
        Create one
    </button>
</p>
```

- [ ] **Step 4: Add "Back to sign in" link for signup view**

```tsx
<p className='text-center text-sm text-white/60 mt-4'>
    Already have an account?{' '}
    <button
        type='button'
        onClick={() => setShowSignUp(false)}
        className='text-blue-400 hover:text-blue-300 font-medium'
    >
        Sign in
    </button>
</p>
```

- [ ] **Step 5: Test the login flow manually**

1. Visit `/auth`
2. Verify email + password form shows by default
3. Click "Sign in with passkey" - verify passkey prompt
4. Click "Create one" - verify signup form appears
5. Click "Sign in" - verify returns to login form

- [ ] **Step 6: Commit**

```bash
git add components/auth/SignIn.tsx
git commit -m "feat(auth): implement unified login form with passkey support"
```

### Task 1.3: Clean Up SignIn Component

**Files:**
- Modify: `components/auth/SignIn.tsx`

**Steps:**

- [ ] **Step 1: Remove unused authMethod state**

Delete:
```tsx
const [authMethod, setAuthMethod] = useState<'password' | 'passkey'>('password');
```

- [ ] **Step 2: Remove lastSignInMethod state and localStorage logic**

Remove `lastSignInMethod` state and `storeLastMethod` function if not needed for the new design.

- [ ] **Step 3: Remove conditional rendering for authMethod**

The component should always show the email + password form, with passkey as a secondary option.

- [ ] **Step 4: Verify all form submissions still work**

Test sign in, sign up, and passkey sign in functionality.

- [ ] **Step 5: Commit**

```bash
git add components/auth/SignIn.tsx
git commit -m "refactor(auth): clean up SignIn component state management"
```

---

## Phase 2: Passkey Onboarding Wizard

### Task 2.1: Create usePasskeyStatus Hook

**Files:**
- Create: `hooks/usePasskeyStatus.ts`

**Steps:**

- [ ] **Step 1: Create the hook file**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { authClient } from '@/lib/auth-client'

interface PasskeyStatus {
    hasPasskeys: boolean
    passkeyCount: number
    isLoading: boolean
    error: string | null
    refetch: () => Promise<void>
}

export function usePasskeyStatus(): PasskeyStatus {
    const [passkeyCount, setPasskeyCount] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchPasskeys = useCallback(async () => {
        try {
            setIsLoading(true)
            setError(null)
            const { data, error: fetchError } = await authClient.passkey.listUserPasskeys()
            
            if (fetchError) {
                setError(fetchError.message || 'Failed to fetch passkeys')
                return
            }
            
            setPasskeyCount((data as unknown as Array<unknown>)?.length || 0)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchPasskeys()
    }, [fetchPasskeys])

    return {
        hasPasskeys: passkeyCount > 0,
        passkeyCount,
        isLoading,
        error,
        refetch: fetchPasskeys,
    }
}
```

- [ ] **Step 2: Test the hook**

```typescript
// In any component:
const { hasPasskeys, passkeyCount, isLoading } = usePasskeyStatus()
console.log({ hasPasskeys, passkeyCount, isLoading })
```

- [ ] **Step 3: Commit**

```bash
git add hooks/usePasskeyStatus.ts
git commit -m "feat(auth): add usePasskeyStatus hook"
```

### Task 2.2: Create Device Detection Utility

**Files:**
- Create: `utils/auth/deviceDetection.ts`

**Steps:**

- [ ] **Step 1: Create device detection utility**

```typescript
interface DeviceInfo {
    platform: string
    suggestedName: string
    icon: 'laptop' | 'smartphone' | 'tablet' | 'key'
}

export function detectDevice(): DeviceInfo {
    if (typeof window === 'undefined') {
        return { platform: 'Unknown', suggestedName: 'My Device', icon: 'key' }
    }

    const ua = navigator.userAgent

    // iOS detection
    if (/iPhone/.test(ua)) {
        return { platform: 'iOS', suggestedName: 'iPhone', icon: 'smartphone' }
    }
    if (/iPad/.test(ua)) {
        return { platform: 'iPadOS', suggestedName: 'iPad', icon: 'tablet' }
    }

    // Android detection
    if (/Android/.test(ua)) {
        if (/Mobile/.test(ua)) {
            return { platform: 'Android', suggestedName: 'Android Phone', icon: 'smartphone' }
        }
        return { platform: 'Android', suggestedName: 'Android Tablet', icon: 'tablet' }
    }

    // macOS detection
    if (/Mac/.test(ua)) {
        return { platform: 'macOS', suggestedName: 'MacBook', icon: 'laptop' }
    }

    // Windows detection
    if (/Windows/.test(ua)) {
        return { platform: 'Windows', suggestedName: 'Windows PC', icon: 'laptop' }
    }

    // Linux detection
    if (/Linux/.test(ua)) {
        return { platform: 'Linux', suggestedName: 'Linux PC', icon: 'laptop' }
    }

    return { platform: 'Desktop', suggestedName: 'My Device', icon: 'laptop' }
}
```

- [ ] **Step 2: Commit**

```bash
git add utils/auth/deviceDetection.ts
git commit -m "feat(auth): add device detection utility for passkey naming"
```

### Task 2.3: Create PasskeyOnboarding Component

**Files:**
- Create: `components/auth/PasskeyOnboarding.tsx`

**Steps:**

- [ ] **Step 1: Create component skeleton with props interface**

```tsx
'use client'

import { useState, useContext } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Fingerprint, ChevronRight, ChevronLeft, Check, X, Laptop, Smartphone, Tablet, KeyRound } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { detectDevice } from '@/utils/auth/deviceDetection'
import { NotificationContext } from '@/components/notifications'

interface PasskeyOnboardingProps {
    isOpen: boolean
    onClose: () => void
    onComplete: () => void
    showSkip?: boolean
}

type Step = 'intro' | 'register' | 'success'

export default function PasskeyOnboarding({ 
    isOpen, 
    onClose, 
    onComplete,
    showSkip = true 
}: PasskeyOnboardingProps) {
    const { addNotification } = useContext(NotificationContext)
    const [currentStep, setCurrentStep] = useState<Step>('intro')
    const [isRegistering, setIsRegistering] = useState(false)
    const [passkeyName, setPasskeyName] = useState('')
    const device = detectDevice()

    // Set default name on mount
    useState(() => {
        setPasskeyName(device.suggestedName)
    })

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            {/* Content will go here */}
        </div>
    )
}
```

- [ ] **Step 2: Add step content rendering**

```tsx
// Inside the component, after the outer div:
const renderStepContent = () => {
    switch (currentStep) {
        case 'intro':
            return (
                <motion.div
                    key="intro"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="text-center"
                >
                    <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <Fingerprint className="w-8 h-8 text-blue-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">
                        Secure Your Account
                    </h2>
                    <p className="text-white/60 mb-6">
                        Passkeys let you sign in quickly and securely using your device&apos;s biometric authentication.
                    </p>
                    <div className="text-left space-y-3 mb-8">
                        <div className="flex items-start gap-3">
                            <Check className="w-5 h-5 text-green-400 mt-0.5" />
                            <span className="text-white/80">Sign in with Face ID, Touch ID, or Windows Hello</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <Check className="w-5 h-5 text-green-400 mt-0.5" />
                            <span className="text-white/80">No passwords to remember or type</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <Check className="w-5 h-5 text-green-400 mt-0.5" />
                            <span className="text-white/80">Protection against phishing attacks</span>
                        </div>
                    </div>
                </motion.div>
            )
        case 'register':
            return (
                <motion.div
                    key="register"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                >
                    <h2 className="text-xl font-bold text-white mb-2">
                        Register Your Passkey
                    </h2>
                    <div className="flex items-center gap-2 text-sm text-white/60 mb-6">
                        {device.icon === 'laptop' && <Laptop className="w-4 h-4" />}
                        {device.icon === 'smartphone' && <Smartphone className="w-4 h-4" />}
                        {device.icon === 'tablet' && <Tablet className="w-4 h-4" />}
                        {device.icon === 'key' && <KeyRound className="w-4 h-4" />}
                        <span>Detected: {device.platform}</span>
                    </div>
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-white/70 mb-2">
                            Passkey Name
                        </label>
                        <input
                            type="text"
                            value={passkeyName}
                            onChange={(e) => setPasskeyName(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-md py-2.5 px-4 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
                            placeholder="e.g., MacBook Pro"
                        />
                    </div>
                    <p className="text-xs text-white/40">
                        Your device will prompt for Face ID, Touch ID, or PIN to register this passkey.
                    </p>
                </motion.div>
            )
        case 'success':
            return (
                <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center"
                >
                    <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                        <Check className="w-8 h-8 text-green-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">
                        Passkey Registered!
                    </h2>
                    <p className="text-white/60 mb-6">
                        You can now sign in without a password on this device.
                    </p>
                    <div className="bg-white/5 rounded-lg p-4 text-left mb-6">
                        <p className="text-sm font-medium text-white mb-2">💡 Tips:</p>
                        <ul className="text-sm text-white/60 space-y-1">
                            <li>• Add passkeys on other devices for backup access</li>
                            <li>• Your passkey syncs via iCloud or Google Password Manager</li>
                        </ul>
                    </div>
                </motion.div>
            )
    }
}
```

- [ ] **Step 3: Add navigation and registration logic**

```tsx
const handleNext = async () => {
    if (currentStep === 'intro') {
        setCurrentStep('register')
    } else if (currentStep === 'register') {
        await handleRegister()
    } else if (currentStep === 'success') {
        onComplete()
        onClose()
    }
}

const handleBack = () => {
    if (currentStep === 'register') {
        setCurrentStep('intro')
    }
}

const handleRegister = async () => {
    if (!passkeyName.trim()) {
        addNotification('Please enter a name for your passkey', 'WARNING')
        return
    }

    setIsRegistering(true)
    try {
        const { error } = await authClient.passkey.addPasskey({
            name: passkeyName,
        })

        if (error) {
            addNotification(error.message || 'Failed to register passkey', 'ERROR')
            return
        }

        addNotification('Passkey registered successfully', 'SUCCESS')
        setCurrentStep('success')
    } catch (err) {
        addNotification('An unexpected error occurred', 'ERROR')
        console.error(err)
    } finally {
        setIsRegistering(false)
    }
}
```

- [ ] **Step 4: Add modal container and navigation buttons**

```tsx
return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-md overflow-hidden shadow-2xl"
        >
            {/* Close button */}
            <div className="flex justify-end p-4">
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                    <X className="w-5 h-5 text-white/60" />
                </button>
            </div>

            {/* Content */}
            <div className="px-6 pb-6">
                <AnimatePresence mode="wait">
                    {renderStepContent()}
                </AnimatePresence>

                {/* Navigation */}
                <div className="flex gap-3 mt-6">
                    {currentStep !== 'success' && showSkip && (
                        <button
                            onClick={onClose}
                            className="flex-1 py-2.5 text-sm text-white/60 hover:text-white transition-colors"
                        >
                            Skip for now
                        </button>
                    )}
                    {currentStep === 'register' && (
                        <button
                            onClick={handleBack}
                            className="py-2.5 px-4 text-white/60 hover:text-white transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                    )}
                    <button
                        onClick={handleNext}
                        disabled={isRegistering}
                        className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-medium py-2.5 rounded-md transition-colors flex items-center justify-center gap-2"
                    >
                        {isRegistering ? (
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                            />
                        ) : (
                            <>
                                {currentStep === 'intro' && 'Set Up Passkey'}
                                {currentStep === 'register' && 'Register Passkey'}
                                {currentStep === 'success' && 'Done'}
                                {currentStep !== 'success' && <ChevronRight className="w-4 h-4" />}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </motion.div>
    </div>
)
```

- [ ] **Step 5: Test the onboarding flow**

1. Import and render the component
2. Click through all 3 steps
3. Verify passkey registration works
4. Verify skip functionality works

- [ ] **Step 6: Commit**

```bash
git add components/auth/PasskeyOnboarding.tsx utils/auth/deviceDetection.ts
git commit -m "feat(auth): add 3-step passkey onboarding wizard"
```

---

## Phase 3: Dashboard Enforcement

### Task 3.1: Create PasskeyBanner Component

**Files:**
- Create: `components/auth/PasskeyBanner.tsx`

**Steps:**

- [ ] **Step 1: Create the banner component**

```tsx
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ShieldAlert, X, Fingerprint } from 'lucide-react'
import { usePasskeyStatus } from '@/hooks/usePasskeyStatus'
import PasskeyOnboarding from './PasskeyOnboarding'

export default function PasskeyBanner() {
    const { hasPasskeys, isLoading } = usePasskeyStatus()
    const [showOnboarding, setShowOnboarding] = useState(false)
    const [isDismissed, setIsDismissed] = useState(false)

    // Don't show if loading, has passkeys, or dismissed
    if (isLoading || hasPasskeys || isDismissed) {
        return null
    }

    return (
        <>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-yellow-500/10 border-b border-yellow-500/20"
                >
                    <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                            <p className="text-sm text-yellow-200">
                                <span className="font-medium">Your account is not secured with a passkey.</span>{' '}
                                Set up a passkey to protect against unauthorized access.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowOnboarding(true)}
                                className="px-4 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-black text-sm font-medium rounded-md transition-colors flex items-center gap-2"
                            >
                                <Fingerprint className="w-4 h-4" />
                                Set Up Now
                            </button>
                            <button
                                onClick={() => setIsDismissed(true)}
                                className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
                                title="Dismiss"
                            >
                                <X className="w-4 h-4 text-white/60" />
                            </button>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>

            <PasskeyOnboarding
                isOpen={showOnboarding}
                onClose={() => setShowOnboarding(false)}
                onComplete={() => {
                    setShowOnboarding(false)
                    // Banner will auto-hide due to hasPasskeys check
                }}
                showSkip={true}
            />
        </>
    )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/auth/PasskeyBanner.tsx
git commit -m "feat(auth): add persistent passkey warning banner"
```

### Task 3.2: Create PasskeyFirstLoginModal Component

**Files:**
- Create: `components/auth/PasskeyFirstLoginModal.tsx`

**Steps:**

- [ ] **Step 1: Create the first-login modal wrapper**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { usePasskeyStatus } from '@/hooks/usePasskeyStatus'
import PasskeyOnboarding from './PasskeyOnboarding'

const ONBOARDING_DISMISSED_KEY = 'passkeyOnboardingDismissed'

export default function PasskeyFirstLoginModal() {
    const { hasPasskeys, isLoading } = usePasskeyStatus()
    const [showOnboarding, setShowOnboarding] = useState(false)
    const [hasChecked, setHasChecked] = useState(false)

    useEffect(() => {
        if (isLoading || hasChecked) return

        // Check if onboarding was previously dismissed
        const wasDismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true'

        // Show onboarding if user has no passkeys and hasn't dismissed
        if (!hasPasskeys && !wasDismissed) {
            // Small delay to avoid showing immediately on page load
            const timer = setTimeout(() => {
                setShowOnboarding(true)
            }, 1000)
            return () => clearTimeout(timer)
        }

        setHasChecked(true)
    }, [hasPasskeys, isLoading, hasChecked])

    const handleClose = () => {
        setShowOnboarding(false)
        localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true')
    }

    const handleComplete = () => {
        setShowOnboarding(false)
        localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true')
    }

    return (
        <PasskeyOnboarding
            isOpen={showOnboarding}
            onClose={handleClose}
            onComplete={handleComplete}
            showSkip={true}
        />
    )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/auth/PasskeyFirstLoginModal.tsx
git commit -m "feat(auth): add first-login passkey onboarding modal"
```

### Task 3.3: Integrate Banner and Modal into App

**Files:**
- Modify: `app/layout.tsx` or a shared layout component

**Steps:**

- [ ] **Step 1: Find the appropriate location to add the components**

Look for the root layout or a shared authenticated layout component.

- [ ] **Step 2: Import the components**

```tsx
import PasskeyBanner from '@/components/auth/PasskeyBanner'
import PasskeyFirstLoginModal from '@/components/auth/PasskeyFirstLoginModal'
```

- [ ] **Step 3: Add components to the layout**

The banner should be at the top of the authenticated area:
```tsx
{/* Inside authenticated layout */}
<PasskeyBanner />
{/* Rest of the page content */}
<PasskeyFirstLoginModal />
```

Note: These components should only render for authenticated users. Wrap them in an auth check if needed.

- [ ] **Step 4: Test the enforcement flow**

1. Login with a user that has no passkeys
2. Verify the first-login modal appears after 1 second
3. Dismiss the modal
4. Verify the persistent banner appears
5. Refresh the page - modal should not appear again (dismissed)
6. Click "Set Up Now" on banner
7. Complete passkey setup
8. Verify banner disappears

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx  # or wherever you added the components
git commit -m "feat(auth): integrate passkey banner and first-login modal"
```

---

## Phase 4: Time Clock Passkey Verification

### Task 4.1: Create PasskeyVerification Component

**Files:**
- Create: `components/auth/PasskeyVerification.tsx`

**Steps:**

- [ ] **Step 1: Create the verification modal component**

```tsx
'use client'

import { useState, useContext } from 'react'
import { motion } from 'motion/react'
import { Fingerprint, Lock, EyeIcon, EyeClosedIcon, X, AlertCircle } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { NotificationContext } from '@/components/notifications'

interface PasskeyVerificationProps {
    isOpen: boolean
    onClose: () => void
    onVerified: () => void
    title?: string
    description?: string
}

export default function PasskeyVerification({
    isOpen,
    onClose,
    onVerified,
    title = 'Verify Your Identity',
    description = 'Please verify with your passkey to continue.',
}: PasskeyVerificationProps) {
    const { addNotification } = useContext(NotificationContext)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showFallback, setShowFallback] = useState(false)
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)

    if (!isOpen) return null

    // ... implementation continues
}
```

- [ ] **Step 2: Add passkey verification handler**

```tsx
const handlePasskeyVerify = async () => {
    setError(null)
    setIsLoading(true)

    try {
        const result = await authClient.signIn.passkey({
            autoFill: false,
        })

        if (result.error) {
            setError(result.error.message || 'Passkey verification failed')
            setShowFallback(true)
            return
        }

        addNotification('Identity verified', 'SUCCESS')
        onVerified()
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed')
        setShowFallback(true)
    } finally {
        setIsLoading(false)
    }
}
```

- [ ] **Step 3: Add password fallback handler**

Note: For strict passkey requirement, password fallback may need server-side support. For now, we'll show the fallback UI but the actual password verification would need additional server action.

```tsx
const handlePasswordVerify = async () => {
    if (!password.trim()) {
        setError('Please enter your password')
        return
    }

    setError(null)
    setIsLoading(true)

    try {
        // For now, we'll use a simple re-authentication approach
        // In production, you might want a dedicated verification endpoint
        addNotification('Password verification not yet implemented', 'WARNING')
        // TODO: Implement password verification endpoint
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
        setIsLoading(false)
    }
}
```

- [ ] **Step 4: Add the modal UI**

```tsx
return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900 border border-white/10 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                    <X className="w-5 h-5 text-white/60" />
                </button>
            </div>

            {/* Content */}
            <div className="p-6">
                <p className="text-white/60 text-sm mb-6">{description}</p>

                {/* Error */}
                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-md flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                )}

                {/* Passkey Button */}
                {!showFallback && (
                    <button
                        onClick={handlePasskeyVerify}
                        disabled={isLoading}
                        className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-medium py-3 rounded-md transition-colors flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                            />
                        ) : (
                            <>
                                <Fingerprint className="w-5 h-5" />
                                Verify with Passkey
                            </>
                        )}
                    </button>
                )}

                {/* Password Fallback */}
                {showFallback && (
                    <div className="space-y-4">
                        <div className="text-center text-sm text-white/40 mb-4">
                            <p>Passkey unavailable. Use password instead.</p>
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-md py-2.5 pl-10 pr-10 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50"
                                placeholder="Enter your password"
                            />
                            <button
                                type="button'
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                            >
                                {showPassword ? <EyeClosedIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                            </button>
                        </div>
                        <button
                            onClick={handlePasswordVerify}
                            disabled={isLoading}
                            className="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-2.5 rounded-md transition-colors"
                        >
                            Verify with Password
                        </button>
                        <button
                            onClick={() => setShowFallback(false)}
                            className="w-full text-sm text-white/60 hover:text-white py-2 transition-colors"
                        >
                            Try passkey again
                        </button>
                    </div>
                )}
            </div>
        </motion.div>
    </div>
)
```

- [ ] **Step 5: Commit**

```bash
git add components/auth/PasskeyVerification.tsx
git commit -m "feat(auth): add passkey verification modal with fallback"
```

### Task 4.2: Add Passkey Verification to ClockInScanner

**Files:**
- Modify: `components/clock/ClockInScanner.tsx`

**Steps:**

- [ ] **Step 1: Import PasskeyVerification component**

```tsx
import PasskeyVerification from '@/components/auth/PasskeyVerification'
```

- [ ] **Step 2: Add state for verification modal**

```tsx
const [showVerification, setShowVerification] = useState(false)
const [pendingQrCode, setPendingQrCode] = useState<string | null>(null)
```

- [ ] **Step 3: Modify handleScanSuccess to require verification**

Change the flow from:
```
QR Scanned → Clock In
```
To:
```
QR Scanned → Show Verification Modal → Verify → Clock In
```

```tsx
const handleScanSuccess = useCallback(async (decodedText: string) => {
    if (isLoadingRef.current) return

    // Store the QR code and show verification
    setPendingQrCode(decodedText)
    setShowVerification(true)
    await stopScanner()
}, [])

const handleVerified = async () => {
    if (!pendingQrCode) return

    setShowVerification(false)
    setIsLoading(true)
    setError(null)

    try {
        const { clockInWithQR } = await import('@/server/actions/time-clock')
        const result = await clockInWithQR(staffIdRef.current, pendingQrCode)

        if (!result.success) {
            setError(result.error)
            setIsLoading(false)
            return
        }

        setSuccess(true)
        setTimeout(() => {
            onSuccessRef.current()
        }, 1500)
    } catch (err) {
        console.error('Clock in error:', err)
        setError('Failed to process clock in. Please try again.')
        setIsLoading(false)
    } finally {
        setPendingQrCode(null)
    }
}
```

- [ ] **Step 4: Add PasskeyVerification modal to render**

```tsx
// In the return statement, add:
<PasskeyVerification
    isOpen={showVerification}
    onClose={() => {
        setShowVerification(false)
        setPendingQrCode(null)
    }}
    onVerified={handleVerified}
    title="Verify Clock In"
    description="Please verify your identity to clock in."
/>
```

- [ ] **Step 5: Test the clock-in flow**

1. Open time clock page
2. Scan QR code
3. Verify passkey modal appears
4. Complete verification
5. Verify clock-in succeeds

- [ ] **Step 6: Commit**

```bash
git add components/clock/ClockInScanner.tsx
git commit -m "feat(time-clock): add passkey verification to clock-in flow"
```

### Task 4.3: Add Passkey Verification to ClockOutButton

**Files:**
- Modify: `components/clock/ClockOutButton.tsx`

**Steps:**

- [ ] **Step 1: Import PasskeyVerification**

```tsx
import PasskeyVerification from '@/components/auth/PasskeyVerification'
```

- [ ] **Step 2: Add state for verification modal**

```tsx
const [showVerification, setShowVerification] = useState(false)
```

- [ ] **Step 3: Modify handleClockOut to show verification first**

```tsx
const handleClockOutClick = () => {
    setShowVerification(true)
}

const handleVerified = async () => {
    setShowVerification(false)
    setIsLoading(true)
    setError(null)

    try {
        const { clockOut } = await import('@/server/actions/time-clock')
        const result = await clockOut(staffId)

        if (!result.success) {
            setError(result.error)
            setIsLoading(false)
            return
        }

        onClockOut()
    } catch (_err) {
        setError('Failed to clock out. Please try again.')
        setIsLoading(false)
    }
}
```

- [ ] **Step 4: Update button onClick and add verification modal**

```tsx
return (
    <div className="flex flex-col gap-3">
        <Button
            onClick={handleClockOutClick}
            disabled={isLoading || !currentEntryId}
            loading={isLoading}
            size="lg"
            className="bg-orange-500/30 hover:bg-orange-500/50 border-2 border-white/10 text-white"
        >
            <Clock className="w-5 h-5" />
            Clock Out
        </Button>

        {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-md">
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-200">{error}</p>
            </div>
        )}

        {!currentEntryId && (
            <p className="text-sm text-white/50 text-center">
                No active clock-in session
            </p>
        )}

        <PasskeyVerification
            isOpen={showVerification}
            onClose={() => setShowVerification(false)}
            onVerified={handleVerified}
            title="Verify Clock Out"
            description="Please verify your identity to clock out."
        />
    </div>
)
```

- [ ] **Step 5: Test the clock-out flow**

1. Be clocked in
2. Click "Clock Out"
3. Verify passkey modal appears
4. Complete verification
5. Verify clock-out succeeds

- [ ] **Step 6: Commit**

```bash
git add components/clock/ClockOutButton.tsx
git commit -m "feat(time-clock): add passkey verification to clock-out flow"
```

### Task 4.4: Add Passkey Verification to TimeClockWidget

**Files:**
- Modify: `components/dashboard/timeClockWidget.tsx`

**Steps:**

- [ ] **Step 1: Import PasskeyVerification**

```tsx
import PasskeyVerification from '@/components/auth/PasskeyVerification'
```

- [ ] **Step 2: Add state for verification modal**

```tsx
const [showVerification, setShowVerification] = useState(false)
const [verificationAction, setVerificationAction] = useState<'clockIn' | 'clockOut' | null>(null)
```

- [ ] **Step 3: Modify clock-in button to show verification**

```tsx
const handleClockInClick = () => {
    setVerificationAction('clockIn')
    setShowVerification(true)
}

const handleClockOutClick = () => {
    setVerificationAction('clockOut')
    setShowVerification(true)
}

const handleVerified = async () => {
    setShowVerification(false)

    if (verificationAction === 'clockIn') {
        setShowScanner(true)
    } else if (verificationAction === 'clockOut') {
        await handleClockOut()
    }

    setVerificationAction(null)
}
```

- [ ] **Step 4: Update buttons to use new handlers**

```tsx
{status?.isClockedIn ? (
    <button
        type="button"
        onClick={handleClockOutClick}
        disabled={loading}
        className="px-4 py-1 text-xs bg-red-400/20 text-red-400 rounded-md border border-red-400/30 hover:bg-red-400/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
    >
        Clock Out
    </button>
) : (
    <button
        type="button"
        onClick={handleClockInClick}
        disabled={loading}
        className="px-4 py-1 text-xs bg-green-400/20 text-green-400 rounded-md border border-green-400/30 hover:bg-green-400/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
    >
        Clock In
    </button>
)}
```

- [ ] **Step 5: Add PasskeyVerification modal to render**

```tsx
<PasskeyVerification
    isOpen={showVerification}
    onClose={() => {
        setShowVerification(false)
        setVerificationAction(null)
    }}
    onVerified={handleVerified}
    title={verificationAction === 'clockIn' ? 'Verify Clock In' : 'Verify Clock Out'}
    description={`Please verify your identity to ${verificationAction === 'clockIn' ? 'clock in' : 'clock out'}.`}
/>
```

- [ ] **Step 6: Test the dashboard widget flow**

1. Go to dashboard
2. Click "Clock In" on widget
3. Verify passkey modal appears
4. Complete verification
5. Verify QR scanner opens
6. Clock in and then click "Clock Out"
7. Verify passkey modal appears for clock-out

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/timeClockWidget.tsx
git commit -m "feat(time-clock): add passkey verification to dashboard widget"
```

---

## Final Verification

### Task 5.1: End-to-End Testing

**Steps:**

- [ ] **Step 1: Test complete login flow**

1. Visit `/auth`
2. Enter email and password
3. Click "Sign In"
4. Verify redirect to dashboard
5. Return to `/auth`
6. Click "Sign in with passkey"
7. Verify passkey authentication works

- [ ] **Step 2: Test passkey onboarding**

1. Login with a user that has no passkeys
2. Verify first-login modal appears
3. Go through all 3 steps
4. Verify passkey is registered
5. Refresh page - modal should not appear

- [ ] **Step 3: Test dashboard banner**

1. Login with a user that has no passkeys
2. Verify yellow banner appears at top
3. Click "Set Up Now"
4. Complete passkey setup
5. Verify banner disappears

- [ ] **Step 4: Test time clock with passkey**

1. Go to time clock page
2. Click "Clock In"
3. Scan QR code
4. Verify passkey verification modal appears
5. Complete verification
6. Verify clock-in succeeds
7. Click "Clock Out"
8. Verify passkey verification modal appears
9. Complete verification
10. Verify clock-out succeeds

- [ ] **Step 5: Test dashboard widget time clock**

1. Go to dashboard
2. Use widget to clock in (with verification)
3. Use widget to clock out (with verification)
4. Verify both work correctly

- [ ] **Step 6: Run linting**

```bash
bun run lint
```

Fix any errors or warnings.

- [ ] **Step 7: Build and verify**

```bash
bun run build
```

Ensure the build completes without errors.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: complete passkey and login flow improvements"
```

---

## Summary

This plan implements:
1. **Modern Login Flow** - Single-page design with email/password primary and passkey as secondary option
2. **Passkey Onboarding** - 3-step wizard with device detection and guided setup
3. **Dashboard Enforcement** - Persistent banner and first-login modal for users without passkeys
4. **Time Clock Verification** - Passkey required for both clock-in and clock-out

Each task is self-contained and can be tested independently. The implementation follows the existing codebase patterns and uses the Better Auth passkey plugin that's already configured.
