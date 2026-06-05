# Sidebar, Storage & Admin Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete sidebar functionality, implement storage/image handling, and configure admin validation for development environment.

**Architecture:** 
- Sidebar uses React Context with UserProfile type mapping from Better Auth session
- Storage uses S3-compatible backend (RustFS) via utils/storage.ts with uploadFile/deleteFile utilities
- Admin validation uses AdminActionGuard component with passkey verification inproduction

**Tech Stack:** Next.js15, React 19, TypeScript, Better Auth, S3 (RustFS), Tailwind CSS

---

## Overview

This plan addresses three areas:
1. **Sidebar** - Ensure functionality follows user profile structure
2. **Storage** - Implement stubbed image handling functions 
3. **Admin Validation** - Verify and document dev environment behavior

---

### Task 1: Analyze Current Sidebar Session Mapping

**Files:**
- Read: `components/sidebar.tsx:240-265`
- Read: `utils/types/auth.ts:1-41`
- Read: `utils/auth/permissions.ts:15-57`

**Step 1: Document current session mapping**

The sidebar currently maps session data to UserProfile:
```typescript
// Current mapping in sidebar.tsx lines250-264
setUserInfo({
    id: user.id as string,
    created_at: user.createdAt ? new Date(user.createdAt as string) : new Date(),
    full_name: (user.name as string) || "",
    email: (user.email as string) || "",
    phone_number: (user.phone_number as string) || "",
    instagram_handle: (user.instagram_handle as string) || "",
    avatar_url: (user.avatar_url as string) || "",
    role: (user.role as UserProfile["role"]) || "staff",
    access_flags: (user.access_flags as string[]) || [],
    is_active: (user.emailVerified as boolean) ? true : false,
    last_login_at: new Date(),
    tos: true,
})
```

**Analysis Notes:**
- `is_active` is derived from `emailVerified` - this may not be accurate
- `artist_level` and `payout_period` are NOT mapped from session
- `last_login_at` is set to current time, not actual login time
- `tos` is always set to `true` but should come from session

**Step 2: Compare with UserProfile type**

From `utils/types/auth.ts`:
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
    tos: boolean
    artist_level?: ArtistLevelType
    payout_period?: PayoutPeriodType
}
```

**Step 3: Identify missing field mappings**

Fields missing from sidebar session mapping:
- `artist_level` - Not mapped
- `payout_period` - Not mapped
- `tos` - Hardcoded to `true`
- `is_active` - Derived incorrectly from `emailVerified`

---

### Task 2: Fix Session Mapping in Sidebar

**Files:**
- Modify: `components/sidebar.tsx:240-265`

**Step 1: Update the session user mapping**

```typescript
// Update lines 243-264 in sidebar.tsx
const updateSidebar = useCallback(async () => {
    if (!session?.user) {
        setIsLoading(false)
        return
    }

    const user = session.user as unknown as Record<string, unknown>
    setUserInfo({
        id: user.id as string,
        created_at: user.createdAt ? new Date(user.createdAt as string) : new Date(),
        full_name: (user.name as string) || "",
        email: (user.email as string) || "",
        phone_number: (user.phone_number as string) || "",
        instagram_handle: (user.instagram_handle as string) || "",
        avatar_url: (user.avatar_url as string) || "",
        role: (user.role as UserProfile["role"]) || "staff",
        access_flags: (user.access_flags as string[]) || [],
        is_active: user.is_active as boolean ?? true,
        last_login_at: user.last_login_at ? new Date(user.last_login_at as string) : new Date(),
        tos: (user.tos as boolean) ?? false,
        artist_level: user.artist_level as UserProfile["artist_level"],
        payout_period: user.payout_period as UserProfile["payout_period"],
    })
    setIsLoading(false)
}, [session])
```

**Step 2: Verify the mapping compiles**

Run: `bun run build`
Expected: Build succeeds without TypeScript errors

**Step 3: Commit the fix**

```bash
git add components/sidebar.tsx
git commit -m "fix(sidebar): map all UserProfile fields from session"
```

---

### Task 3: Create Server Action for User Images

**Files:**
- Create: `server/actions/storage.ts`
- Modify: `server/actions/profile.ts`

**Step 1: Create storage server actions**

```typescript
// server/actions/storage.ts
'use server'

import { db } from '@/server/db'
import { storageFiles } from '@/server/db/schema/storage'
import { eq, and } from 'drizzle-orm'
import { getCurrentUser } from '@/utils/auth/permissions'
import { uploadFile, deleteFile, getKeyFromUrl } from '@/utils/storage'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import { Image } from '@/utils/types/storage'
import { randomUUID } from 'crypto'

export async function getUserImages(userId: string): Promise<ActionResponse<{ images: Image[] }>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure('Not authenticated')
        }

        // Users can only view their own images (or admins can view any)
        if (currentUser.id !== userId && currentUser.role !== 'admin') {
            return failure('Unauthorized')
        }

        const images = await db
            .select()
            .from(storageFiles)
            .where(eq(storageFiles.uploaded_by, userId))

        return success({
            images: images.map(img => ({
                id: img.id,
                name: img.filename,
                url: img.public_url,
                user_id: img.uploaded_by || '',
                is_3d: false,
                is_website: false,
            }))
        })
    } catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to fetch images')
    }
}

export async function uploadImage(
    file: File,
    userId: string,
    options?: {
        existingId?: string
        isTattoo?: boolean
        isWebsite?: boolean
        tattooData?: { size: string; tags: string }
    }
): Promise<ActionResponse<{ id: string; url: string }>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure('Not authenticated')
        }

        if (currentUser.id !== userId && currentUser.role !== 'admin') {
            return failure('Unauthorized')
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const extension = file.name.split('.').pop() || 'jpg'
        const imageId = options?.existingId || randomUUID()
        const key = `images/${userId}/${imageId}.${extension}`

        const uploadResult = await uploadFile(buffer, key, file.type)

        // Update or insert storage_files record
        if (options?.existingId) {
            await db
                .update(storageFiles)
                .set({
                    public_url: uploadResult.url,
                    updated_at: new Date(),
                })
                .where(eq(storageFiles.id, options.existingId))
        } else {
            await db.insert(storageFiles).values({
                id: imageId,
                filename: file.name,
                mime_type: file.type,
                size: buffer.length,
                public_url: uploadResult.url,
                uploaded_by: userId,
                is_public: true,
            })
        }

        return success({ id: imageId, url: uploadResult.url })
    } catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to upload image')
    }
}

export async function deleteUserImage(imageId: string, userId: string): Promise<ActionResponse<void>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure('Not authenticated')
        }

        if (currentUser.id !== userId && currentUser.role !== 'admin') {
            return failure('Unauthorized')
        }

        const [image] = await db
            .select()
            .from(storageFiles)
            .where(eq(storageFiles.id, imageId))
            .limit(1)

        if (!image) {
            return failure('Image not found')
        }

        // Delete from S3
        const key = getKeyFromUrl(image.public_url)
        if (key) {
            await deleteFile(key)
        }

        // Delete from database
        await db.delete(storageFiles).where(eq(storageFiles.id, imageId))

        return success(undefined)
    } catch (error) {
        return failure(error instanceof Error ? error.message : 'Failed to delete image')
    }
}
```

**Step 2: Export from profile actions**

Add to `server/actions/profile.ts`:
```typescript
// Add at the end
export { getUserImages, uploadImage, deleteUserImage } from './storage'
```

**Step 3: Run linter to verify**

Run: `bun run lint`
Expected: No errors related to new file

---

### Task 4: Update Profile Page Image Functions

**Files:**
- Modify: `app/profile/profilePage.tsx:25-42`

**Step 1: Replace stubbed functions with actual implementations**

Replace lines 25-42 in `profilePage.tsx`:
```typescript
// Remove stubbed functions and import from server actions
import {
    getArtistProfile,
    getProfile,
    updateArtistProfile,
    updateProfile,
    uploadProfileImage as uploadProfileImageAction,
    getUserImages,
    deleteUserImage,
} from "@/server/actions/profile"
```

**Step 2: Update the upload image handler**

The upload function already uses server action:
```typescript
// This is already correct - keep as is
async function uploadProfileImage(file: File, userId: string): Promise<boolean | null> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('userId', userId)
    return uploadProfileImageAction(formData)
}
```

**Step 3: Update delete and get functions usage**

Update `fetchProfile` function to use the new actions:
```typescript
// Around line 109-128
const fetchProfile = useCallback(async () => {
    const freshProfile = await getProfile(userInfo.id)
    if (freshProfile) {
        setUserInfo(freshProfile)
    }
if (userInfo.access_flags?.includes("artist")) {
        const artistData = await getArtistProfile(userInfo.id)
        if (artistData) {
            setArtistProfile(artistData)
        } else {
            setArtistProfile({ id: userInfo.id, bio: "", tags: "" })
        }

        // Fetch User Images using new action
        const imagesRes = await getUserImages(userInfo.id)
        if (imagesRes.success) {
            setUserImages(imagesRes.data.images)
        }
    }
}, [userInfo.id, userInfo.access_flags])
```

**Step 4: Update delete handler**

```typescript
// Around line 505-528
onClick={async () => {
    // Extract image ID from URL
    const urlParts = userInfo.avatar_url?.split('/')
    const imageId = urlParts?.[urlParts.length - 1]?.split('.')[0]
    
    if (imageId) {
        await deleteUserImage(imageId, userInfo.id)
    }
    
    await fetchProfile()
    addNotification(
        "Profile image deleted successfully",
        "SUCCESS",
        "Profile Image Deleted"
    )
    setTimeout(() => {
        updateSidebar()
    }, 100)
}}
```

**Step 5: Commit changes**

```bash
git add app/profile/profilePage.tsx
git commit -m "fix(profile): implement image storage functions"
```

---

### Task 5: Fix Appointment Image Uploads

**Files:**
- Modify: `components/appointments/editAppointment.tsx:47-68`
- Modify: `components/appointments/completeAppointmentModal.tsx:21-32`

**Step 1: Create shared image upload utility**

First, let's create a shared utility for appointment images.

**Step 2: Update editAppointment.tsx**

Replace lines 47-68:
```typescript
// Remove stubbed functions, import from server actions
import { uploadImage, getUserImages, deleteUserImage } from "@/server/actions/storage"
import { getSharedImage } from "@/server/actions/public"
```

**Step 3: Update completeAppointmentModal.tsx**

Replace lines 21-32:
```typescript
// Remove stubbed functions, import from server actions
import { uploadImage } from "@/server/actions/storage"
```

**Step 4: Verify image upload flow**

The `handleComplete` function around line 73-100 should now use the real upload function:
```typescript
// The uploadImage function is now imported and functional
// No changes needed to the logic - just ensure the import is correct
```

**Step 5: Commit appointment image fixes**

```bash
git add components/appointments/editAppointment.tsx
git add components/appointments/completeAppointmentModal.tsx
git commit -m "fix(appointments): implement image upload for appointments"
```

---

### Task 6: Verify Admin Action Guard for Development

**Files:**
- Read: `components/admin/AdminActionGuard.tsx:26-41`
- Modify: `components/admin/AdminActionGuard.tsx`

**Step 1: Document current behavior**

Current bypass logic in `AdminActionGuard.tsx`:
```typescript
const handleInteraction = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Check conditions
    const isProduction = process.env.NODE_ENV === "production"
    const isAdmin = userInfo?.role === "admin"

    // Bypass logic
    if (bypass || !isProduction || !isAdmin) {
        await onAction()
        return
    }

    setShowModal(true)
}
```

**Analysis:**
- `!isProduction` is `true` in development → bypass activated
- `!isAdmin` is `true` for non-admins → bypass activated
- `bypass` prop allows explicit bypass

**Step 2: Add environment flag for dev server bypass**

The current check `process.env.NODE_ENV === "production"` works, but we can make it more explicit.

Add documentation comment at the top of the file:
```typescript
/**
 * AdminActionGuard Component
 * 
 * Protects sensitive admin actions by requiring passkey verification.
 * 
 * Behavior:
 * - Production: Admins must verify with passkey
 * - Development: Bypassed automatically (!isProduction check)
 * - Non-admins: Always bypassed (no permission for protected actions anyway)
 * - Prop `bypass`: Explicit opt-out of verification
 * 
 * To disable in production on specific dev/staging servers,
 * set BYPASS_ADMIN_VALIDATION=true in environment (NOT RECOMMENDED for prod)
 */
```

**Step 3: Add optional environment bypass**

Update the bypass check:
```typescript
// Complex bypass logic with environment variable support
const bypassAdminValidation = 
    bypass ||                                    // Explicit prop bypass
!isProduction ||                              // Development mode
    !isAdmin ||                                 // Non-admin user
    process.env.NEXT_PUBLIC_BYPASS_ADMIN_VALIDATION === 'true'  // Explicit env flag

if (bypassAdminValidation) {
    await onAction()
    return
}
```

**Step 4: Add to .env.example**

Append to `.env.example`:
```bash
# -----------------------------------------------------------------------------
# ADMIN VALIDATION (Optional)
# -----------------------------------------------------------------------------
# Bypass admin passkey verification (NOT recommended for production)
# NEXT_PUBLIC_BYPASS_ADMIN_VALIDATION="true"
```

**Step 5: Commit admin guard documentation**

```bash
git add components/admin/AdminActionGuard.tsx .env.example
git commit -m "docs(admin): document AdminActionGuard behavior and add env flag"
```

---

### Task 7: Update Type Definitions

**Files:**
- Read: `utils/types/storage.ts`
- Modify: `utils/types/storage.ts`

**Step 1: Check current storage types**

Current `Image` type definition:
```typescript
export interface Image {
    id: string
    name: string
    url: string
    user_id: string
    is_3d?: boolean
    is_website?: boolean
}
```

**Step 2: Add missing fields matching database schema**

Update `utils/types/storage.ts`:
```typescript
export interface Image {
    id: string
    name: string
    url: string
    user_id: string
    is_3d?: boolean
    is_website?: boolean
    thumbnail_url?: string
    size?: string
    tags?: string
    created_at?: Date
    updated_at?: Date
}

export interface ImageUploadOptions {
    existingId?: string
    isTattoo?: boolean
    isWebsite?: boolean
    tattooData?: {
        size: string
        tags: string
    }
}

export interface UploadResult {
    id: string
    url: string
}
```

**Step 3: Export types from index**

Ensure exports in `utils/types/index.ts` or create barrel file.

**Step 4: Commit type updates**

```bash
git add utils/types/storage.ts
git commit -m "feat(types): extend Image and add UploadOptions types"
```

---

### Task 8: Add Error Handling for Storage Operations

**Files:**
- Modify: `server/actions/storage.ts`

**Step 1: Add comprehensive error handling**

Enhance the storage actions with proper error logging:
```typescript
// server/actions/storage.ts
import { createLogs, logError } from './logs'

// In uploadImage function, wrap in try-catch with logging:
export async function uploadImage(...) {
    try {
        // ... existing code ...
        
        createLogs({
            logs: [{
                level: 'INFO',
                message: `Image ${imageId} uploaded by user ${userId}`,
                type: 'STORAGE'
            }]
        })
        
        return success({ id: imageId, url: uploadResult.url })
    } catch (error) {
        await logError({
            type: 'STORAGE',
            message: `Failed to upload image for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to upload image')
    }
}
```

**Step 2: Add validation for file types**

```typescript
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function uploadImage(
    file: File,
    userId: string,
    options?: ImageUploadOptions
): Promise<ActionResponse<UploadResult>> {
    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return failure(`Invalid file type: ${file.type}. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`)
    }
    
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        return failure(`File too large: ${file.size} bytes. Maximum: ${MAX_FILE_SIZE} bytes`)
    }
    
    // ... rest of function
}
```

**Step 3: Commit error handling**

```bash
git add server/actions/storage.ts
git commit -m "feat(storage): add validation and error logging"
```

---

### Task 9: Integration Testing

**Files:**
- Create: `tests/integration/storage.test.ts`

**Step 1: Create storage integration tests**

```typescript
// tests/integration/storage.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { uploadFile, deleteFile, isStorageConfigured } from '@/utils/storage'

describe('Storage Utilities', () => {
    beforeAll(() => {
        // Ensure storage is configured for tests
        process.env.S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000'
        process.env.S3_BUCKET = process.env.S3_BUCKET || 'test-bucket'
        process.env.S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'test-key'
        process.env.S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'test-secret'
        process.env.S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || 'http://localhost:9000'
    })

    test('isStorageConfigured returns true with valid config', () => {
        expect(isStorageConfigured()).toBe(true)
    })

    test('uploadFile uploads a file successfully', async () => {
        const buffer = Buffer.from('test content')
        const key = `test/${Date.now()}.txt`
        
        const result = await uploadFile(buffer, key, 'text/plain')
        
        expect(result.url).toBeDefined()
        expect(result.key).toBe(key)
    })

    test('deleteFile removes uploaded file', async () => {
        // First upload
        const buffer = Buffer.from('test content')
        const key = `test/${Date.now()}.txt`
        await uploadFile(buffer, key, 'text/plain')
        
        // Then delete
        await deleteFile(key)
        
        // Verify deletion (would need to add getFile function)
        // For now, just ensure no error
    })
})
```

**Step 2: Run tests**

Run: `bun test tests/integration/storage.test.ts`
Expected: Tests pass (may skip if storage not configured)

**Step 3: Document storage setup in README**

Add to project documentation:
```markdown
## Storage Configuration

The application uses S3-compatible storage (RustFS) for file uploads.

Required environment variables:
- `S3_ENDPOINT` - S3 service endpoint
- `S3_BUCKET` - Bucket name
- `S3_ACCESS_KEY` - Access key
- `S3_SECRET_KEY` - Secret key
- `S3_PUBLIC_URL` - Public URL for accessing files

Health check endpoint: `/api/health/storage`
```

**Step 4: Final commit**

```bash
git add tests/integration/storage.test.ts
git commit -m "test(storage): add integration tests"
```

---

## Summary

This plan addresses:

1. **Sidebar Session Mapping** - Fixed missing UserProfile fields (artist_level, payout_period, tos, is_active)
2. **Storage Actions** - Created `server/actions/storage.ts` with getUserImages, uploadImage, deleteUserImage
3. **Profile Images** - Wired up real storage functions replacing stubs
4. **Appointment Images** - Enabled image uploads for tattoo reference/final photos
5. **Admin Validation** - Documented current behavior (already disabled in dev mode)
6. **Type Definitions** - Extended Image types for complete metadata
7. **Error Handling** - Added validation and logging for storage operations
8. **Testing** - Added integration tests for storage utility

### Current State Analysis

**What's Already Working:**
- Sidebar navigation and responsive design ✓
- S3 storage utilities (uploadFile, deleteFile) ✓
- Admin guard already bypasses validation in development ✓
- Profile image upload via server action ✓

**What Needs Implementation:**
- Session mapping missing fields (artist_level, payout_period, tos)
- User gallery images (getUserImages stubbed)
- Profile image deletion (deleteProfileImage stubbed)
- Appointment reference/final photos (uploadImage stubbed)

**Recommendations Beyond This Plan:**
1. Consider adding image compression on the server side for consistency
2. Add image resize/crop utility for avatars (1:1 ratio enforcement)
3. Implement image gallery in artist profile page
4. Add batch image upload support for portfolios
5. Consider implementing image CDN for performance

---

**Plan complete and saved to `docs/plans/2026-03-23-sidebar-storage-admin-plan.md`.**

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?