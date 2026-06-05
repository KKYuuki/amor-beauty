"use server"

import { db } from "@/server/db"
import { storageFiles } from "@/server/db/schema/storage"
import { eq, and, desc } from "drizzle-orm"
import { getCurrentUser, isAdmin } from "@/utils/auth/permissions"
import { uploadFile, deleteFile, getKeyFromUrl } from "@/utils/storage"
import { ActionResponse, success, failure } from "@/utils/types/responses"
import { createLogs, logError } from "./logs"

// ============================================================================
// CONSTANTS
// ============================================================================

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// ============================================================================
// TYPES
// ============================================================================

export interface UserImage {
    id: string
    created_at: string
    name: string
    url: string
    public_url: string | null
    size: number | null
    mime_type: string | null
    is_public: boolean | null
}

export interface UploadImageOptions {
    isPublic?: boolean
    bucket?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Maps database storage file to UserImage type
 */
function mapToUserImage(file: typeof storageFiles.$inferSelect): UserImage {
    return {
        id: file.id,
        created_at: file.created_at.toISOString(),
        name: file.name,
        url: file.url,
        public_url: file.public_url,
        size: file.size,
        mime_type: file.mime_type,
        is_public: file.is_public,
    }
}

/**
 * Check if user can access another user's images
 * Users can only access their own images, admins can access any
 */
async function canAccessUserImages(currentUserId: string, targetUserId: string): Promise<boolean> {
    if (currentUserId === targetUserId) {
        return true
    }

    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return false
    }

    return isAdmin(currentUser)
}

// ============================================================================
// STORAGE ACTIONS
// ============================================================================

/**
 * Fetches images for a user from storage_files table
 * @param userId - The user ID to fetch images for
 * @returns ActionResponse with array of UserImage
 */
export async function getUserImages(userId: string): Promise<ActionResponse<UserImage[]>> {
    try {
        // Verify authentication
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized: Not authenticated")
        }

        // Check permissions
        const hasAccess = await canAccessUserImages(currentUser.id, userId)
        if (!hasAccess) {
            return failure("Unauthorized: Cannot access this user's images")
        }

        // Fetch images from database
        const files = await db
            .select()
            .from(storageFiles)
            .where(eq(storageFiles.uploaded_by, userId))
            .orderBy(desc(storageFiles.created_at))

        return success(files.map(mapToUserImage))
    } catch (error) {
        await logError({
            type: 'STORAGE',
            message: `Failed to fetch images for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch images')
    }
}

/**
 * Uploads an image to S3 and records in database
 * @param file - The file to upload
 * @param userId - The user ID uploading the image
 * @param options - Optional upload options (isPublic, bucket)
 * @returns ActionResponse with the uploaded UserImage
 */
export async function uploadImage(
    file: File,
    userId: string,
    options: UploadImageOptions = {}
): Promise<ActionResponse<UserImage>> {
    try {
        // Verify authentication
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized: Not authenticated")
        }

        // Check permissions - users can only upload to their own account unless admin
        const hasAccess = await canAccessUserImages(currentUser.id, userId)
        if (!hasAccess) {
            return failure("Unauthorized: Cannot upload images for this user")
        }

        // Validate file type
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            return failure(`Invalid file type: ${file.type}. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`)
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return failure(`File too large: ${file.size} bytes. Maximum: ${MAX_FILE_SIZE} bytes`)
        }

        // Generate unique key for S3
        const timestamp = Date.now()
        const key = `uploads/${userId}/${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

        // Convert file to buffer
        const buffer = Buffer.from(await file.arrayBuffer())

        // Upload to S3
        const uploadResult = await uploadFile(buffer, key, file.type)

        // Insert record into database
        const [inserted] = await db
            .insert(storageFiles)
            .values({
                name: file.name,
                url: uploadResult.url,
                public_url: uploadResult.url,
                size: file.size,
                mime_type: file.type,
                bucket: options.bucket ?? 'default',
                key: uploadResult.key,
                is_public: options.isPublic ?? false,
                uploaded_by: userId,
            })
            .returning()

        if (!inserted) {
            // If database insert failed, try to clean up the S3 file
            try {
                await deleteFile(uploadResult.key)
            } catch {
                // Ignore cleanup errors
            }
            return failure("Failed to save image record to database")
        }

        // Log successful upload
        createLogs({
            logs: [{
                level: 'INFO',
                message: `Image ${inserted.id} uploaded by user ${userId}`,
                type: 'STORAGE'
            }]
        })

        return success(mapToUserImage(inserted), "Image uploaded successfully")
    } catch (error) {
        await logError({
            type: 'STORAGE',
            message: `Failed to upload image for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to upload image')
    }
}

/**
 * Deletes an image from S3 and database
 * @param imageId - The ID of the image to delete
 * @param userId - The user ID requesting deletion
 * @returns ActionResponse with void
 */
export async function deleteUserImage(
    imageId: string,
    userId: string
): Promise<ActionResponse<void>> {
    try {
        // Verify authentication
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized: Not authenticated")
        }

        // Check permissions
        const hasAccess = await canAccessUserImages(currentUser.id, userId)
        if (!hasAccess) {
            return failure("Unauthorized: Cannot delete this user's images")
        }

        // Fetch the image record
        const [imageRecord] = await db
            .select()
            .from(storageFiles)
            .where(
                and(
                    eq(storageFiles.id, imageId),
                    eq(storageFiles.uploaded_by, userId)
                )
            )
            .limit(1)

        if (!imageRecord) {
            return failure("Image not found")
        }

        // Delete from S3 if we have a key
        if (imageRecord.key) {
            try {
                await deleteFile(imageRecord.key)
            } catch (error) {
                // Log but continue - the file might already be deleted
                await logError({
                    type: 'SYSTEM',
                    message: `Failed to delete file from S3 for image ${imageId}: ${error instanceof Error ? error.message : String(error)}`
                })
            }
        } else if (imageRecord.public_url) {
            // Try to extract key from URL
            const keyFromUrl = getKeyFromUrl(imageRecord.public_url)
            if (keyFromUrl) {
                try {
                    await deleteFile(keyFromUrl)
                } catch (error) {
                    await logError({
                        type: 'SYSTEM',
                        message: `Failed to delete file from S3 (from URL) for image ${imageId}: ${error instanceof Error ? error.message : String(error)}`
                    })
                }
            }
        }

        // Delete from database
        await db
            .delete(storageFiles)
            .where(eq(storageFiles.id, imageId))

        // Log successful deletion
        createLogs({
            logs: [{
                level: 'INFO',
                message: `Image ${imageId} deleted by user ${userId}`,
                type: 'STORAGE'
            }]
        })

        return success(undefined, "Image deleted successfully")
    } catch (error) {
        await logError({
            type: 'STORAGE',
            message: `Failed to delete image ${imageId}: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : "Failed to delete image")
    }
}

export interface BatchUploadResult {
    successful: UserImage[]
    failed: { file: string; error: string }[]
    total: number
}

export async function uploadBatchImages(
    files: File[],
    userId: string,
    options: UploadImageOptions = {}
): Promise<ActionResponse<BatchUploadResult>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized: Not authenticated")
        }

        const hasAccess = await canAccessUserImages(currentUser.id, userId)
        if (!hasAccess) {
            return failure("Unauthorized: Cannot upload images for this user")
        }

        const successful: UserImage[] = []
        const failed: { file: string; error: string }[] = []

        const CONCURRENT_UPLOADS = 3
        const batches: File[][] = []
        
        for (let i = 0; i < files.length; i += CONCURRENT_UPLOADS) {
            batches.push(files.slice(i, i + CONCURRENT_UPLOADS))
        }

        for (const batch of batches) {
            const results = await Promise.allSettled(
                batch.map(file => uploadImage(file, userId, options))
            )

            for (let i = 0; i < results.length; i++) {
                const result = results[i]
                const file = batch[i]

                if (result.status === 'fulfilled') {
                    const uploadResult = result.value
                    if (uploadResult.success) {
                        successful.push(uploadResult.data)
                    } else {
                        failed.push({
                            file: file.name,
                            error: uploadResult.error || 'Upload failed',
                        })
                    }
                } else {
                    failed.push({
                        file: file.name,
                        error: result.reason?.message || 'Unknown error',
                    })
                }
            }
        }

        createLogs({
            logs: [{
                level: successful.length > 0 ? 'INFO' : 'WARN',
                message: `Batch upload completed: ${successful.length} successful, ${failed.length} failed for user ${userId}`,
                type: 'STORAGE'
            }]
        })

        return success({
            successful,
            failed,
            total: files.length,
        })
    } catch (error) {
        await logError({
            type: 'STORAGE',
            message: `Failed to batch upload images for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to upload images')
    }
}
