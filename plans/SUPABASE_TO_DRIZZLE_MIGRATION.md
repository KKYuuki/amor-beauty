# Transition Plan: Supabase to Drizzle + Better-Auth

## 🎯 Objective
Fully migrate the application from Supabase to a native stack using **Drizzle ORM** (PostgreSQL) and **Better-Auth**, removing all dependencies on Supabase services (Auth, Database, Storage, Realtime).

## 📊 Current Status
- **Auth:** ✅ Migrated to Better-Auth (Schema created, Client updated, API routes set).
- **Database:** ✅ Migrated to Drizzle (Schemas defined for Auth, Inventory, Accounting, Payroll, Appointments).
- **Permissions:** ✅ Updated `utils/auth/permissions.ts` to use Better-Auth.
- **Inventory:** ✅ Partially migrated (Actions use Drizzle).
- **Profile:** ❌ Stubbed (Need implementation).
- **Storage:** ❌ Stubbed (Need replacement for Supabase Storage).
- **Realtime:** ❌ To be removed/replaced.

## 📝 Implementation Phases

### Phase 1: User Profile & Management (High Priority) 🚀
*Implement full CRUD for user profiles to unblock application logic.*

1.  **Implement `app/api/actions/profile.ts`**
    - [ ] `getProfile(userId)`: Fetch from `user` table.
    - [ ] `updateProfile(...)`: Update `user` table.
    - [ ] `getStaffList()`: Query users where `userRole` != 'CLIENT'.
    - [ ] `createProfile(...)`: Handle user creation (mostly handled by Better-Auth hooks, but need to verify).
    - [ ] `requestPasswordReset` / `updatePassword`: Use Better-Auth admin API.

2.  **Verify & Fix Types**
    - [ ] Ensure `UserProfile` type in `utils/types/auth.ts` matches Drizzle schema return types.

### Phase 2: Storage Replacement (Images & Files) 📦
*Replace Supabase Storage with a provider-agnostic solution.*

1.  **Schema Update**
    - [ ] Create a `files` table in Drizzle to store file metadata (name, size, type, url, relations).
    - [ ] *Decision:* Store file content in:
        - **Option A (Simpler):** Database `bytea` column (good for small apps/prototypes).
        - **Option B (Better):** S3-compatible storage (AWS/R2/MinIO).
        - **Option C (Local):** Local filesystem (only works for VPS/Self-hosted, not Vercel).
    - *Recommendation:* We will implement **Option A** initially for avatars/small images to keep it self-contained, with an interface to swap to S3 later.

2.  **Implement Upload Actions**
    - [ ] Create `uploadFile` server action.
    - [ ] Update `uploadProfileImage` in `profilePage.tsx`.
    - [ ] Update appointment image uploads.

### Phase 3: Cleanup & Optimization hj
*Remove legacy code and dependencies.*

1.  **Remove Dependencies**
    - [ ] Uninstall `@supabase/supabase-js`, `@supabase/ssr`.
    - [ ] Remove `utils/supabase/` directory.

2.  **Environment Variables**
    - [ ] Remove `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_*` from `.env`.

3.  **Global Search & Destroy**
    - [ ] Find and remove any remaining `console.warn('Supabase disabled...')` stubs.

## 📅 Execution Steps for Phase 1

1.  **Refactor `app/api/actions/profile.ts`**:
    - Import `db` and schema.
    - Rewrite `getProfile`, `updateProfile`, `getStaffList` using Drizzle queries.
    - Rewrite permission checks to use the new `utils/auth/permissions.ts`.

2.  **Refactor `app/api/actions/settings.ts`**:
    - Ensure settings retrieval uses Drizzle.

3.  **Refactor `app/api/actions/users.ts` (if exists)**:
    - Ensure user management uses Better-Auth Admin API + Drizzle.
