# Database & Auth Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Switch from Neon to standard `node-postgres` driver and implement invite-only signup flow with CLI invitation generator.

**Architecture:** 
- **DB:** Standard PostgreSQL via `pg` driver (replacing `@neondatabase/serverless`)
- **Auth:** Better-Auth with custom "auth key" verification on signup
- **CLI:** Bun script to generate invitation codes with role assignment

**Tech Stack:** `pg` (node-postgres), Drizzle ORM, Better-Auth, Bun

---

### Task 1: Migrate Database Driver

**Files:**
- Modify: `package.json`
- Modify: `drizzle.config.ts`
- Modify: `server/db/index.ts`

**Step 1: Update Dependencies**
Remove `@neondatabase/serverless`.
Add `pg` and `@types/pg`.

**Step 2: Update Drizzle Config**
Ensure `drizzle.config.ts` is compatible with standard PostgreSQL connection strings.

**Step 3: Update DB Client**
Rewrite `server/db/index.ts` to use `drizzle-orm/node-postgres`.

---

### Task 2: Invitation System Schema

**Files:**
- Modify: `server/db/schema/auth.ts`
- Create: `server/db/schema/invitations.ts`
- Modify: `server/db/schema.ts`

**Step 1: Create Invitation Table**
Define `invitations` table with columns:
- `id` (uuid, pk)
- `email` (text, unique, not null)
- `role` (text, not null, default 'STAFF')
- `token` (text, unique, not null)
- `expires_at` (timestamp, not null)
- `used_at` (timestamp)
- `created_by` (uuid, references user.id)

**Step 2: Generate Migration**
Run `drizzle-kit generate` to create the SQL migration.

---

### Task 3: Secure Signup Flow

**Files:**
- Modify: `server/auth.ts`
- Modify: `components/auth/SignIn.tsx`
- Modify: `lib/auth-client.ts`

**Step 1: Disable Open Signups**
In `server/auth.ts`, add a `signUp` hook to Better-Auth.
The hook must:
1. Check if an invitation code is provided in `input`.
2. Verify the code exists in `invitations` table, matches the email, is not expired, and not used.
3. If valid, allow signup and mark invitation as used.
4. If invalid, throw error "Invalid or expired invitation code".

**Step 2: Update UI**
Modify `components/auth/SignIn.tsx` sign-up tab to include an "Invitation Code" field.
Make it required.

---

### Task 4: CLI Invitation Generator

**Files:**
- Create: `scripts/generate-invite.ts`

**Step 1: Create Script**
Build an interactive CLI script using `prompts` or standard input.
Flow:
1. Ask for Email.
2. Ask for Role (Arrow key selection: ADMIN, MANAGER, STAFF, ARTIST).
3. Generate a secure random token.
4. Insert into `invitations` table via Drizzle.
5. Output the invitation code to console.

**Step 2: Add Package Script**
Add `"invite": "bun run scripts/generate-invite.ts"` to `package.json`.

---

### Task 5: Verification

**Files:**
- Test: Manual verification steps

**Step 1: Test DB Connection**
Verify the app connects to the `postgres://` URL using `node-postgres`.

**Step 2: Test Invite Flow**
1. Run `bun run invite` -> generate code for `test@example.com` as `ADMIN`.
2. Try signing up with `test@example.com` WITHOUT code -> Should fail.
3. Try signing up with WRONG code -> Should fail.
4. Sign up with CORRECT code -> Should succeed and assign ADMIN role.
