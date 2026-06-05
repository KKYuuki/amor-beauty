# Phase 2: Auth Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve authentication UX with conditional passkey UI and add last login method tracking.

**Architecture:** 
1. Add `last_login_method` column to user table via Drizzle migration
2. Update better-auth configuration to use passkey plugin with conditional UI
3. Create login hooks for tracking login method
4. Update auth client to detect WebAuthn availability and show passkey option directly

**Tech Stack:** Next.js 15, React 19, TypeScript, better-auth, Drizzle ORM, WebAuthn

---

## Task 1: Add Last Login Method Database Schema

**Files:**
- Create: `server/db/migrations/[timestamp]_add_last_login_method.ts`
- Modify: `server/db/schema/auth.ts`

**Step 1: Read current auth schema**

Read `server/db/schema/auth.ts` to understand current user table structure.

**Step 2: Add last_login_method column to user table**

Modify `server/db/schema/auth.ts`:

Add the `lastLoginMethod` column to the user table definition:

```typescript
// Add to user table columns
lastLoginMethod: text('last_login_method'), // 'password' | 'passkey' | 'google' | etc.
lastLoginAt: timestamp('last_login_at'), // When they last logged in
```

**Step 3: Create Drizzle migration**

Run: `bun run db:generate`
Expected: New migration file created

**Step 4: Apply migration**

Run: `bun run db:migrate`
Expected: Migration applied successfully

**Step 5: Update user profile type**

Modify `utils/types/auth.ts`:

```typescript
export interface UserProfile {
    id: string
    created_at: Date
    full_name: string
    email: string
    phone_number?: string
    instagram_handle?: string
    avatar_url?: string
    role: UserRoleType
    access_flags?: string[]
    is_active?: boolean
    last_login_at?: Date
    last_login_method?: string  // Add this
    // Payroll fields
    artist_level?: ArtistLevelType
    payout_period?: PayoutPeriodType
    // Branch assignments
    branch_ids?: string[]
}
```

**Step 6: Verify migration**

Run: `bun run build`
Expected: Build succeeds with new types

**Step 7: Commit schema changes**

```bash
git add server/db/schema/auth.ts utils/types/auth.ts server/db/migrations/
git commit -m "feat(auth): add last_login_method column to user schema"
```

---

## Task 2: Update Better-Auth Server Configuration

**Files:**
- Modify: `server/auth.ts`
- Modify: `server/actions/audit.ts`

**Step 1: Read current auth configuration**

Read `server/auth.ts` to understand current setup.

**Step 2: Add last-login-method plugin configuration**

Modify `server/auth.ts`:

Import and configure the last-login-method plugin from better-auth:

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import { admin } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { passkey } from '@better-auth/passkey';

export const auth = betterAuth({
    // ... existing config ...
    plugins: [
        twoFactor({
            issuer: 'Inksight',
        }),
        admin(),
        passkey(),
        nextCookies(),
    ],
    // Add hooks for tracking login method
    databaseHooks: {
        session: {
            create: {
                after: async (session) => {
                    // Track successful login - this is already here
                    if (session.userId) {
                        await recordSuccessfulLogin(session.userId);
                        // Update last login method
                        await updateLastLoginMethod(session.userId, 'password'); // Default
                    }
                },
            },
        },
        // ... existing hooks ...
    },
});
```

**Step 3: Create updateLastLoginMethod function**

Modify `server/actions/audit.ts` to add:

```typescript
export async function updateLastLoginMethod(userId: string, method: string): Promise<void> {
    try {
        await db.update(user)
            .set({
                lastLoginMethod: method,
                lastLoginAt: new Date(),
            })
            .where(eq(user.id, userId));
    } catch (error) {
        // Non-critical - log but don't throw
        console.error('Failed to update last login method:', error);
    }
}
```

**Step 4: Export function from audit.ts**

Ensure `updateLastLoginMethod` is exported from the module.

**Step 5: Commit auth configuration changes**

```bash
git add server/auth.ts server/actions/audit.ts
git commit -m "feat(auth): configure last login method tracking"
```

---

## Task 3: Update Auth Client for Conditional Passkey UI

**Files:**
- Modify: `lib/auth-client.ts`
- Modify: `app/auth/page.tsx` or auth component

**Step 1: Read current auth client setup**

Read `lib/auth-client.ts` to understand current client configuration.

**Step 2: Add helper functions for WebAuthn detection**

Modify `lib/auth-client.ts`:

```typescript
import { createAuthClient } from 'better-auth/react';
import { passkeyClient } from '@better-auth/passkey/client';

const getBaseURL = () => {
    if (process.env.NEXT_PUBLIC_BETTER_AUTH_URL) {
        return process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    }
    if (typeof window !== 'undefined') {
        const protocol = window.location.protocol;
        const host = window.location.host;
        return `${protocol}//${host}`;
    }
    return 'http://localhost:3000';
};

export const authClient = createAuthClient({
    baseURL: getBaseURL(),
    plugins: [
        passkeyClient(),
    ],
});

// Helper to check if WebAuthn/Passkeys are available
export async function isPasskeyAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    
    // Check if WebAuthn is supported
    if (!window.PublicKeyCredential) return false;
    
    // Check if conditional UI is available
    try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

// Helper to check if user has registered passkeys
export async function hasRegisteredPasskey(): Promise<boolean> {
    try {
        const session = await authClient.getSession();
        if (!session?.user) return false;
        
        // Attempt to list passkeys - if any exist, user has registered
        const passkeys = await authClient.passkey.list();
        return passkeys && passkeys.length > 0;
    } catch {
        return false;
    }
}

export type AuthClient = typeof authClient;
export type Session = typeof authClient.$Infer.Session;
export type User = typeof authClient.$Infer.Session.user;
```

**Step 3: Read current auth page**

Read `app/auth/page.tsx` to understand current login form structure.

**Step 4: Create auth page with conditional passkey UI**

Modify the auth page to show passkey option directly when available:

```tsx
"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authClient, isPasskeyAvailable } from "@/lib/auth-client"
// ... other imports

export default function AuthPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [passkeyAvailable, setPasskeyAvailable] = useState(false)
    const [passkeyLoading, setPasskeyLoading] = useState(false)

    // Check WebAuthn availability on mount
    useEffect(() => {
        isPasskeyAvailable().then(setPasskeyAvailable)
    }, [])

    // Handle passkey sign-in directly
    const handlePasskeySignIn = async () => {
        setPasskeyLoading(true)
        setError("")
        
        try {
            await authClient.signIn.passkey({
                auto: true, // Enable conditional UI
            })
            router.push("/")
        } catch (err) {
            setError("Passkey sign-in failed. Please try again.")
        } finally {
            setPasskeyLoading(false)
        }
    }

    // Handle password sign-in
    const handlePasswordSignIn = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError("")
        
        try {
            const result = await authClient.signIn.email({
                email,
                password,
            })
            
            if (result.error) {
                setError(result.error.message || "Sign in failed")
                return
            }
            
            router.push("/")
        } catch (err) {
            setError("Invalid email or password")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="w-full max-w-md p-6">
                {/* Header */}
                <h1 className="text-2xl font-bold text-center mb-6">
                    Sign In
                </h1>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/40 rounded-md text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Passkey Sign In - Show first if available */}
                {passkeyAvailable && (
                    <div className="mb-6">
                        <button
                            onClick={handlePasskeySignIn}
                            disabled={passkeyLoading}
                            className="w-full py-3 px-4 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 rounded-md text-blue-400 font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                        >
                            {passkeyLoading ? (
                                <LoaderCircleIcon className="w-5 h-5 animate-spin" />
                            ) : (
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C9.243 2 7 4.243 7 7v3H6c-1.103 0-2 .897-2 2v10c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2V12c0-1.103-.897-2-2-2h-1V7c0-2.757-2.243-5-5-5zm0 2c1.654 0 3 1.346 3 3v3H9V7c0-1.654 1.346-3 3-3z"/>
                                </svg>
                            )}
                            Sign in with Passkey
                        </button>
                        <p className="mt-2 text-center text-sm text-white/40">
                            Use your device's biometric or security key
                        </p>
                    </div>
                )}

                {/* Divider */}
                <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-white/10"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-black text-white/40">or sign in with password</span>
                    </div>
                </div>

                {/* Password Sign In Form */}
                <form onSubmit={handlePasswordSignIn} className="space-y-4">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-white/60 mb-1">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                            placeholder="you@example.com"
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-white/60 mb-1">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white placeholder-white/40 focus:outline-none focus:border-white/30"
                            placeholder="Enter your password"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 px-4 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded-md text-green-400 font-medium transition-colors disabled:opacity-50"
                    >
                        {loading ? "Signing in..." : "Sign In"}
                    </button>
                </form>

                {/* Registration link */}
                <p className="mt-6 text-center text-sm text-white/40">
                    Don't have an account? Contact an administrator.
                </p>
            </div>
        </div>
    )
}
```

**Step 5: Add conditional UI for autofill**

For browsers that support WebAuthn conditional UI (autofill), add the autocomplete attribute:

```tsx
<input
    id="email"
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    required
    autoComplete="username webauthn"
    className="..."
    placeholder="you@example.com"
/>
```

**Step 6: Commit auth client changes**

```bash
git add lib/auth-client.ts app/auth/page.tsx
git commit -m "feat(auth): add conditional passkey UI with WebAuthn detection"
```

---

## Task 4: Display Last Login Method in User Profile

**Files:**
- Modify: `app/accounts/[id]/page.tsx`
- Modify: `components/sidebar.tsx` (or wherever user info is displayed)

**Step 1: Read user profile display component**

Read `app/accounts/[id]/page.tsx` to find where user information is displayed.

**Step 2: Add last login method display**

In the user profile detail page, add a section showing login information:

```tsx
{/* Last Login Info - User profile section */}
{(user.last_login_at || user.last_login_method) && (
    <div className="bg-white/5 p-6 rounded-lg border border-white/10">
        <h3 className="text-lg font-semibold mb-4">Login Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {user.last_login_at && (
                <div>
                    <span className="text-sm text-white/60">Last Login</span>
                    <p className="font-medium">
                        {new Date(user.last_login_at).toLocaleString("en-PH", {
                            dateStyle: "medium",
                            timeStyle: "short",
                        })}
                    </p>
                </div>
            )}
            {user.last_login_method && (
                <div>
                    <span className="text-sm text-white/60">Login Method</span>
                    <p className="font-medium capitalize">
                        {user.last_login_method.replace("_", " ")}
                    </p>
                </div>
            )}
        </div>
    </div>
)}
```

**Step 3: Update sidebar user info (if applicable)**

Read `components/sidebar.tsx` to check if user info is displayed there.

If applicable, add a small indicator for login method in the user dropdown or profile section.

**Step 4: Commit profile display changes**

```bash
git add app/accounts/[id]/page.tsx components/sidebar.tsx
git commit -m "feat(auth): display last login method in user profile"
```

---

## Task 5: Update Session Hooks to Track Login Method

**Files:**
- Modify: `server/auth.ts`

**Step 1: Create custom hooks for passkey login tracking**

The better-auth passkey plugin should automatically handle passkey login. We need to hook into this to update the login method.

Modify `server/auth.ts`:

```typescript
// Add passkey login tracking
databaseHooks: {
    session: {
        create: {
            after: async (session, context) => {
                if (session.userId) {
                    // Determine login method from context
                    const method = context?.headers?.get('x-login-method') || 'password';
                    await recordSuccessfulLogin(session.userId);
                    await updateLastLoginMethod(session.userId, method);
                }
            },
        },
    },
    // ... existing hooks
},
```

**Step 2: Add login method tracking for passkey flows**

Create a server action or hook that the passkey client can call:

Create `server/actions/auth-tracking.ts`:

```typescript
'use server'

import { getCurrentUser } from '@/utils/auth/permissions';
import { db } from '@/server/db';
import { user } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

export async function recordPasskeyLogin(): Promise<{ success: boolean }> {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        return { success: false };
    }

    try {
        await db.update(user)
            .set({
                lastLoginMethod: 'passkey',
                lastLoginAt: new Date(),
            })
            .where(eq(user.id, currentUser.id));

        return { success: true };
    } catch (error) {
        console.error('Failed to record passkey login:', error);
        return { success: false };
    }
}
```

**Step 3: Call tracking after successful passkey login**

Modify the auth client to call tracking:

In `lib/auth-client.ts` or the auth page component:

```typescript
// After successful passkey sign-in
import { recordPasskeyLogin } from '@/server/actions/auth-tracking';

const handlePasskeySignIn = async () => {
    setPasskeyLoading(true);
    setError("");
    
    try {
        await authClient.signIn.passkey({ auto: true });
        await recordPasskeyLogin(); // Track passkey login
        router.push("/");
    } catch (err) {
        setError("Passkey sign-in failed. Please try again.");
    } finally {
        setPasskeyLoading(false);
    }
};
```

**Step 4: Commit tracking changes**

```bash
git add server/auth.ts server/actions/auth-tracking.ts lib/auth-client.ts
git commit -m "feat(auth): track passkey login method separately"
```

---

## Verification

After all tasks are complete:

1. Run `bun run lint` - should pass with no errors
2. Run `bun run build` - should build successfully
3. Run `bun run db:generate` + `bun run db:migrate` - migrations should apply
4. Test login flow:
   - Passkey option should appear first on supported browsers
   - Password login should work as fallback
   - After login, check user profile shows last login method

## Notes

- WebAuthn conditional UI allows users to select passkeys from browser autofill
- The `auto: true` option enables conditional UI in better-auth passkey client
- Last login method helps administrators track authentication patterns
- Passkey availability check uses `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`