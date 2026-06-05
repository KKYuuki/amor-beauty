# Better-Auth Passkey Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement full Better-Auth Passkey support, including management in the profile page and enforcing passkey usage for critical admin actions in production.

**Architecture:**
- **Profile Page:** Add a new section to `app/profile/profilePage.tsx` using `authClient` to list, add, and remove passkeys.
- **Admin Guard:** Create a `AdminActionGuard` component that wraps critical buttons. It intercepts the `onClick` event, checks for admin role and production environment, and triggers a passkey re-authentication modal if necessary.
- **Login:** Existing `SignIn.tsx` is sufficient but will be verified.

**Tech Stack:** Next.js 15, React 19, Better-Auth, Tailwind CSS, Framer Motion.

---

### Task 1: Profile Page Passkey Management

**Files:**
- Modify: `app/profile/profilePage.tsx`
- Create: `components/profile/PasskeyManager.tsx`

**Step 1: Create PasskeyManager Component**

Create `components/profile/PasskeyManager.tsx` with the following logic:
- Fetch passkeys on mount using `authClient.passkey.listPasskeys()`.
- Render a list of passkeys (name, created at).
- Add "Register New Passkey" button that calls `authClient.passkey.addPasskey()`.
- Add "Remove" button for each passkey that calls `authClient.passkey.deletePasskey()`.
- Handle loading and error states.

```tsx
"use client"
import { useState, useEffect } from "react"
import { authClient } from "@/lib/auth-client"
import { Fingerprint, Trash2, Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button" // Assume or use raw button
import { toast } from "sonner" // Or NotificationContext

export default function PasskeyManager() {
    const [passkeys, setPasskeys] = useState([])
    const [loading, setLoading] = useState(false)

    // ... implementation ...
}
```

**Step 2: Integrate into Profile Page**

Modify `app/profile/profilePage.tsx`:
- Import `PasskeyManager`.
- Add it to the "Security" or a new section in the profile page.

**Step 3: Verification**

- Manual test: Go to `/profile`, add a passkey, refresh, see it listed, remove it.

### Task 2: Admin Action Guard Component

**Files:**
- Create: `components/admin/AdminActionGuard.tsx`

**Step 1: Create AdminActionGuard**

Create `components/admin/AdminActionGuard.tsx`:
- Props: `children` (ReactElement), `onAction` (() => void), `bypass` (boolean).
- Logic:
    - If `user.role !== 'admin'` OR `bypass` OR `process.env.NODE_ENV !== 'production'`, call `onAction()` directly.
    - Else, open a Modal.
    - Modal Content: "Admin Verification Required".
    - Button: "Verify with Passkey".
    - On Click: Call `authClient.signIn.passkey()` (or verify method).
    - If successful, call `onAction()` and close modal.
    - If no passkey registered (error code), prompt to go to Profile to add one.

```tsx
"use client"
import { useState } from "react"
import { authClient } from "@/lib/auth-client"
// ... imports

export default function AdminActionGuard({ children, onAction, bypass = false }: Props) {
    // ... implementation
}
```

### Task 3: Protect Critical Admin Actions

**Files:**
- Modify: `app/accounts/usersList.tsx` (Delete/Edit User)
- Modify: `app/accounting/accountingPage.tsx` (Approve/Reject)
- Modify: `app/payroll/payrollPage.tsx` (Process Payroll)
- Modify: `app/config/configPage.tsx` (System Settings)

**Step 1: Identify and Wrap Buttons**

- Locate critical action buttons (e.g., "Delete User", "Save Settings").
- Wrap them with `<AdminActionGuard onAction={originalHandler}> <Button ... /> </AdminActionGuard>`.
- **Exception:** Export buttons should have `bypass={true}`.

**Step 2: Verification**

- Manual test (simulate Prod or temporary remove env check):
    - Click "Delete User".
    - Verify Modal appears.
    - Verify Passkey prompt.
    - Verify Action executes only after success.

---
