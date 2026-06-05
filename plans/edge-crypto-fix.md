# Edge Runtime Crypto Fix Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Edge Runtime compatibility issues with Node.js crypto module

**Architecture:** 
- **Issue:** Better-Auth or our code uses Node.js `crypto` which doesn't work in Edge Runtime
- **Solution:** Use Web Crypto API or ensure crypto is only used in Node.js contexts

**Tech Stack:** Web Crypto API, Better-Auth

---

### Task 1: Diagnose Crypto Usage

**Files:**
- Check: `server/auth.ts`
- Check: `middleware.ts`
- Check: Any files importing `crypto`

**Step 1: Find Crypto Usage**
Search for all imports of `crypto` module.

**Step 2: Identify Edge Runtime Context**
Check which files run in Edge Runtime (middleware, API routes with edge config).

---

### Task 2: Fix Auth Configuration

**Files:**
- Modify: `server/auth.ts`

**Step 1: Remove Direct Crypto Import**
If auth.ts imports crypto directly, remove it or make it conditional.

**Step 2: Configure Better-Auth for Edge**
Ensure Better-Auth is configured to work without Node.js crypto in Edge contexts.

---

### Task 3: Fix Middleware

**Files:**
- Modify: `middleware.ts`

**Step 1: Update Middleware**
Ensure middleware doesn't import auth.ts or uses Edge-compatible auth checks.

---

### Task 4: Update Script (if needed)

**Files:**
- Check: `scripts/generate-invite.ts`

**Step 1: Verify Script Works**
CLI scripts should be fine with Node.js crypto since they run in Node.js context, not Edge.

---

### Task 5: Verification

**Step 1: Test Build**
Run build to verify no Edge Runtime errors.

**Step 2: Test Auth Flow**
Verify auth still works correctly.
