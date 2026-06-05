# TODOs, Stubs, and Build Fixes - Design Document

> **Goal:** Fix all build-breaking issues, address TODOs/stubbed functions, and add image processing utilities.

> **Date:** 2026-03-23

---

## Executive Summary

This plan addresses three categories of work in priority order:

1. **Critical Build Fixes** - Fix module export errors breaking the build
2. **TODOs and Stubbed Functions** - Implement or document 15 TODOs and 14 stubbed functions
3. **New Features** - Add image compression enhancement, batch upload, and resize/crop utilities

---

## Part 1: Critical Build Fixes

### Problem

`server/actions/profile.ts` line 611 attempts to re-export from `'./storage'`, but both files have `"use server"` directive which causes Turbopack bundler failures. The error cascades, making the entire module appear to have "no exports at all."

### Affected Files

| File | Issue |
|------|-------|
| `server/actions/profile.ts:611` | Invalid re-export from server action |
| `app/profile/profilePage.tsx:5-13` | Imports `uploadProfileImage`, `getUserImages`, `deleteUserImage` from profile |
| `app/profile/page.tsx` | Similar imports |

### Solution

1. **Remove the re-export** from `profile.ts` line 611
2. **Update import statements** in consuming components to import directly from `@/server/actions/storage`
3. **Keep `uploadProfileImage`** in `profile.ts` as it's a FormData wrapper specific to profile uploads

### Files to Modify

- `server/actions/profile.ts` - Remove line 611
- `app/profile/profilePage.tsx` - Update imports to add storage imports
- `app/profile/page.tsx` - Verify imports are correct

---

## Part 2: TODOs and Stubbed Functions

### Category A: Missing Database Tables (Requires Schema Work)

These stubs require new database tables that don't exist yet. Document as "blocked by schema design."

| Function | File | What's Needed |
|----------|------|---------------|
| `getRatingMetrics()` | `server/actions/metrics.ts:280` | `ratings` table |
| `getStaffPerformance()` | `server/actions/metrics.ts:286` | `ratings` table |
| `getAppointmentReviews()` | `server/actions/metrics.ts:441` | `reviews` table |

**Recommendation:** Create design spec for ratings/reviews schema, defer implementation.

### Category B: Inventory Relations (Blocked)

These appointment item functions return empty/false because inventory relations aren't available.

| Function | File | Current Return |
|----------|------|----------------|
| `getAppointmentItems()` | `server/actions/appointments.ts:1162` | `[]` |
| `addAppointmentItem()` | `server/actions/appointments.ts:1171` | `false` |
| `updateAppointmentItem()` | `server/actions/appointments.ts:1180` | `false` |
| `deleteAppointmentItem()` | `server/actions/appointments.ts:1188` | `false` |

**Recommendation:** Requires inventory-appointment join table design. Defer with proper error logging.

### Category C: Export Functions (Implementable)

Export functions are stubbed with placeholder returns. Implement CSV/JSON export.

| Function | File | Current Return |
|----------|------|----------------|
| `exportMetrics()` | `server/actions/metrics.ts:681` | `failure('Export functionality not yet implemented')` |
| `exportTransactions()` | `server/actions/transactions.ts:705` | `failure('Export functionality not yet implemented')` |

**Solution:** Create shared export utility that generates CSV/JSON from data.

### Category D: Notification System (Blocked)

| Function | File | Current Return |
|----------|------|----------------|
| `sendUserNotification()` | `server/actions/profile.ts:114` | `{ success: false, message: 'Notification system pending' }` |
| `sendBulkAppNotification()` | `server/actions/profile.ts:119` | `{ successful: 0, failed: userIds.length, total: userIds.length }` |

**Recommendation:** Requires notification infrastructure (Push/WebSocket/Email). Defer.

### Category E: Auth Migration TODOs

| Location | TODO Text | Action |
|----------|-----------|--------|
| `middleware.ts:39` | Implement permission checking with Better-Auth | Defer - requires auth system review |
| `middleware.ts:48` | Query user_profiles table for access_flags | Defer - requires schema migration |

---

## Part 3: New Features

### 3A: Enhanced Image Compression

**Current State:** `utils/compressImage.ts` provides basic compression (5MB, 2048px, 0.85 quality).

**Enhancements:**
- Add configurable compression presets (avatar, portfolio, reference)
- Add progress callback for upload UI
- Handle HEIC/WEBP conversion

### 3B: Batch Image Upload for Portfolios

**What:** Allow uploading multiple images at once for artist portfolios.

**Implementation:**
- Add `uploadBatchImages()` to `server/actions/storage.ts`
- Accept array of Files with optional metadata
- Return array of UploadResults with success/failure per image
- Add client-side component for multi-file drag/drop

### 3C: Image Resize/Crop Utility for Avatars

**What:** Server-side image processing to create proper avatar thumbnails.

**Options:**
1. Use `sharp` library (Node.js native, fast)
2. Use client-side canvas (no server processing, lighter)

**Recommendation:** Use client-side approach with `canvas` API since:
- No additional dependencies
- Images are already compressed client-side
- Immediate feedback to user
- Reduces server load

**Implementation:**
- Create `utils/imageCrop.ts` with crop/resize functions
- Add preview component showing crop area
- Output fixed dimensions (e.g., 200x200 for avatars)

---

## Implementation Order

### Phase 1: Build Fixes (Critical - Must Do First)
1. Remove invalid re-export from profile.ts
2. Update imports in profilePage.tsx
3. Verify build passes

### Phase 2: Implementable Stubs
4. Create `utils/export.ts` for CSV/JSON export
5. Implement `exportMetrics()` 
6. Implement `exportTransactions()`
7. Add error logging to blocked stubs

### Phase 3: New Features
8. Add compression presets to compressImage.ts
9. Create imageCrop.ts for avatar cropping
10. Add batch upload to storage.ts
11. Create BatchImageUploader component

### Phase 4: Document Blocked Items
12. Create follow-up spec for ratings/reviews schema
13. Create follow-up spec for inventory-appointment relations
14. Create follow-up spec for notification system

---

## Testing Strategy

- Unit tests for export utilities
- Integration tests for image upload batch operations
- E2E tests for profile image upload flow
- Build verification after each phase

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Break existing upload flow | Keep `uploadProfileImage` in profile.ts unchanged |
| Large batch uploads timeout | Add concurrent upload limit (max 5 at once) |
| Client-side crop browser support | Feature detect, fallback to server-side sharp |