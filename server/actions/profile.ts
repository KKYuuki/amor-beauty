'use server'

import { headers } from "next/headers"
import { z } from 'zod'
import { eq, inArray, and, desc, isNull } from "drizzle-orm"

import { db } from "@/server/db"
import { user } from "@/server/db/schema/auth"
import { rateLevels } from "@/server/db/schema/rate-levels"
import { invitations } from "@/server/db/schema/invitations"
import { notifications } from "@/server/db/schema/notifications"
import { auth } from "@/server/auth"
import { AuthKeys, CreateUserProfilePayload, UserProfile, UserRoleType, PayoutPeriodType } from "@/utils/types/auth"
import { ArtistProfile } from "@/utils/types/general"
import { NotificationItem } from "@/utils/types/notifications"
import { ActionResponse, success, failure } from "@/utils/types/responses"
import { getCurrentUser, isAdmin } from "@/utils/auth/permissions"
import { STAFF_ROLES } from "@/utils/auth/constants"
import { normalizeFlag, isValidAccessFlag } from '@/utils/auth/access-flags'
import { uploadFile } from "@/utils/storage"
import { sanitizeText, sanitizeMinimal } from '@/utils/sanitize'

import { createLogs, logError } from "./logs"
import { sendInviteEmail } from "./email"

// ============================================================================
// Zod Schemas
// ============================================================================

const CreateUserProfileSchema = z.object({
    full_name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address'),
    role: z.enum(['admin', 'manager', 'staff', 'artist', 'piercer', 'shoe_tech']),
    phone_number: z.string().optional(),
    instagram_handle: z.string().optional(),
    access_flags: z.array(z.string()).optional(),
})

const UpdateUserProfileSchema = z.object({
    full_name: z.string().min(1).optional().nullable(),
    email: z.string().email('Invalid email address').optional().nullable(),
    role: z.enum(['admin', 'manager', 'staff', 'artist', 'piercer', 'shoe_tech']).optional().nullable(),
    phone_number: z.string().optional().nullable(),
    instagram_handle: z.string().optional().nullable(),
    avatar_url: z.string().url().optional().nullable().or(z.literal('')),
    access_flags: z.array(z.string()).optional().nullable(),
    is_active: z.boolean().optional().nullable(),
    rate_level_id: z.string().uuid().optional(),
    payout_period: z.enum(['DAILY', 'WEEKLY', 'BIMONTHLY', 'MONTHLY']).optional(),
}).partial()

const PasswordStrengthSchema = z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')

// Helper to map DB user to UserProfile
function mapUserToProfile(dbUser: typeof user.$inferSelect): UserProfile {
    return {
        id: dbUser.id,
        created_at: dbUser.createdAt,
        full_name: dbUser.fullName || dbUser.name || '',
        email: dbUser.email,
        phone_number: dbUser.phoneNumber ?? undefined,
        instagram_handle: dbUser.instagramHandle ?? undefined,
        avatar_url: dbUser.avatarUrl ?? undefined,
        role: (dbUser.role?.toLowerCase() || 'staff') as UserRoleType,
        access_flags: dbUser.accessFlags ?? [],
        is_active: dbUser.isActive,
        last_login_at: dbUser.lastLoginAt ?? undefined,
        rate_level_id: dbUser.rateLevelId ?? undefined,
        payout_period: dbUser.payoutPeriod as PayoutPeriodType | undefined,
        branch_ids: dbUser.branchIds ?? [],
    }
}

/*
async function requireAdminAuth(): Promise<{ authorized: boolean; userId: string }> {
    const user = await getCurrentUser()
    if (!user) {
        return { authorized: false, userId: '' }
    }
    const adminCheck = await isAdmin(user)
    if (!adminCheck) {
        return { authorized: false, userId: user.id }
    }
    return { authorized: true, userId: user.id }
}
*/

export async function uploadProfileImage(formData: FormData): Promise<boolean | null> {
    try {
        const file = formData.get('file') as File
        const userId = formData.get('userId') as string
        
        if (!file || !userId) return null

        // Verify permissions
        const currentUser = await getCurrentUser()
        if (!currentUser || (currentUser.id !== userId && !(await isAdmin(currentUser)))) {
            return null
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const extension = file.name.split('.').pop() || 'jpg'
        const key = `avatars/${userId}-${Date.now()}.${extension}`
        
        const uploadResult = await uploadFile(buffer, key, file.type)
        
        // Update user profile with new avatar URL
        await updateProfile({ 
            userId, 
            profile: { avatar_url: uploadResult.url },
            updatedBy: currentUser.id
        })

        return true
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error uploading profile image: ${error instanceof Error ? error.message : String(error)}`
        })
        return null
    }
}

export async function sendUserNotification(
    userId: string,
    notification: Omit<NotificationItem, 'id'>
): Promise<{ success: boolean; message: string }> {
    try {
        await db.insert(notifications).values({
            userId,
            type: notification.type,
            title: notification.title || '',
            message: notification.message,
            data: null,
        })

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `Notification sent to user ${userId}: ${notification.title || notification.message}`,
            }]
        })

        return { success: true, message: 'Notification sent' }
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to send notification: ${error instanceof Error ? error.message : String(error)}`
        })
        return { success: false, message: 'Failed to send notification' }
    }
}

export async function sendBulkAppNotification(
    userIds: string[],
    notification: Omit<NotificationItem, 'id'>
): Promise<{ successful: number; failed: number; total: number }> {
    let successful = 0
    let failed = 0

    for (const userId of userIds) {
        try {
            await db.insert(notifications).values({
                userId,
                type: notification.type,
                title: notification.title || '',
                message: notification.message,
                data: null,
            })
            successful++
        } catch {
            failed++
        }
    }

    return { successful, failed, total: userIds.length }
}

export async function getUserNotifications(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number }
): Promise<ActionResponse<NotificationItem[]>> {
    try {
        const { unreadOnly = false, limit = 50 } = options || {}

        const conditions = [eq(notifications.userId, userId)]
        if (unreadOnly) {
            conditions.push(isNull(notifications.readAt))
        }

        const results = await db
            .select()
            .from(notifications)
            .where(and(...conditions))
            .orderBy(desc(notifications.createdAt))
            .limit(limit)

        return success(results.map(n => ({
            id: n.id,
            type: n.type as NotificationItem['type'],
            title: n.title,
            message: n.message,
            data: n.data as Record<string, unknown> | undefined,
            readAt: n.readAt?.toISOString(),
            createdAt: n.createdAt.toISOString(),
        })))
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to get notifications: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to get notifications')
    }
}

export async function markNotificationRead(notificationId: string): Promise<ActionResponse<void>> {
    try {
        await db
            .update(notifications)
            .set({ readAt: new Date() })
            .where(eq(notifications.id, notificationId))

        return success(undefined)
    } catch (_error) {
        return failure('Failed to mark notification as read')
    }
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
    try {
        const [dbUser] = await db.select().from(user).where(eq(user.id, userId)).limit(1)
        if (!dbUser) return null
        return mapUserToProfile(dbUser)
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error fetching profile: ${error instanceof Error ? error.message : String(error)}`
        })
        return null
    }
}

export async function getProfiles(): Promise<UserProfile[] | null> {
    try {
        const users = await db.select().from(user)
        return users.map(mapUserToProfile)
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error fetching profiles: ${error instanceof Error ? error.message : String(error)}`
        })
        return null
    }
}

export async function getProfilesByIds(userIds: string[]): Promise<UserProfile[]> {
    try {
        if (!userIds.length) return []
        const users = await db.select().from(user).where(inArray(user.id, userIds))
        return users.map(mapUserToProfile)
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error fetching profiles by IDs: ${error instanceof Error ? error.message : String(error)}`
        })
        return []
    }
}

export async function getStaffProfiles(): Promise<UserProfile[]> {
    try {
        const staffUsers = await db
            .select({ user: user, rateLevel: rateLevels })
            .from(user)
            .leftJoin(rateLevels, eq(user.rateLevelId, rateLevels.id))
            .where(inArray(user.role, [...STAFF_ROLES]))

        return staffUsers.map(({ user: u, rateLevel }) => {
            const profile = mapUserToProfile(u)
            return {
                ...profile,
                rate_level_name: rateLevel?.name ?? undefined,
            }
        })
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error fetching staff profiles: ${error instanceof Error ? error.message : String(error)}`
        })
        return []
    }
}

export async function getStaffList(): Promise<{
    id: string
    full_name: string
    avatar_url?: string
    access_flags?: string[]
    role?: string
    rate_level_id?: string
    rate_level_name?: string
}[] | null> {
    try {
        const staff = await getStaffProfiles()
        return staff.map(s => ({
            id: s.id,
            full_name: s.full_name,
            avatar_url: s.avatar_url,
            access_flags: s.access_flags,
            role: s.role,
            rate_level_id: s.rate_level_id ?? undefined,
            rate_level_name: s.rate_level_name ?? undefined,
        }))
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error fetching staff list: ${error instanceof Error ? error.message : String(error)}`
        })
        return null
    }
}

export async function createProfile({ userId, profile, _authKey }: { userId: string, profile: CreateUserProfilePayload, _authKey: string | null }): Promise<ActionResponse<void>> {
    try {
        await db.update(user).set({
            fullName: sanitizeText(profile.full_name),
            email: profile.email,
        }).where(eq(user.id, userId))
        createLogs({ logs: [{ level: 'INFO', type: 'OTHER', message: `Profile created/updated for user: ${userId}` }] })
        return success(undefined, "Profile updated successfully")
    } catch (error) {
        await logError({
            type: 'OTHER',
            message: `Failed to create/update profile: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to update profile')
    }
}

export async function getProfileRole(userId: string) {
    const profile = await getProfile(userId)
    return profile?.role || null
}

export async function updateProfile({ userId, profile, updatedBy }: { userId: string, profile: Partial<UserProfile>, updatedBy?: string }): Promise<ActionResponse<void>> {
    // Normalize null values to undefined
    const normalizedProfile = {
        ...profile,
        full_name: profile.full_name ?? undefined,
        email: profile.email ?? undefined,
        phone_number: profile.phone_number ?? undefined,
        instagram_handle: profile.instagram_handle ?? undefined,
        avatar_url: profile.avatar_url ?? undefined,
        role: profile.role ?? undefined,
        access_flags: profile.access_flags ?? undefined,
        is_active: profile.is_active,
        rate_level_id: profile.rate_level_id ?? undefined,
        payout_period: profile.payout_period ?? undefined,
    }

    const validated = UpdateUserProfileSchema.safeParse(normalizedProfile)
    if (!validated.success) {
        const fieldErrors = validated.error.flatten().fieldErrors
        return failure(
            "Validation failed",
            fieldErrors as Record<string, string[]>
        )
    }

    try {
        const updateData: Partial<typeof user.$inferInsert> = {}
        
        if (validated.data.full_name !== undefined && validated.data.full_name !== null) updateData.fullName = sanitizeText(validated.data.full_name)
        if (validated.data.email !== undefined && validated.data.email !== null) updateData.email = validated.data.email
        if (validated.data.phone_number !== undefined && validated.data.phone_number !== null) updateData.phoneNumber = sanitizeMinimal(validated.data.phone_number)
        if (validated.data.instagram_handle !== undefined && validated.data.instagram_handle !== null) updateData.instagramHandle = sanitizeText(validated.data.instagram_handle)
        if (validated.data.avatar_url !== undefined && validated.data.avatar_url !== null) updateData.avatarUrl = validated.data.avatar_url
        if (validated.data.role !== undefined && validated.data.role !== null) updateData.role = validated.data.role
        // Normalize and validate access flags before saving
        if (validated.data.access_flags !== undefined && validated.data.access_flags !== null) {
            updateData.accessFlags = [...new Set(validated.data.access_flags.map(f => normalizeFlag(f)).filter(f => isValidAccessFlag(f)))]
        }
        
        // These fields are not in the schema, so they're not validated, but still need to be updated
        if (profile.is_active !== undefined) updateData.isActive = profile.is_active
        if (profile.rate_level_id !== undefined) updateData.rateLevelId = profile.rate_level_id
        if (profile.payout_period !== undefined) updateData.payoutPeriod = profile.payout_period
        
        await db.update(user).set(updateData).where(eq(user.id, userId))

        // Notify connected SSE clients if access or role changed
        if (updateData.accessFlags !== undefined || updateData.role !== undefined) {
            const { sessionEventEmitter } = await import('@/utils/sse/session-events')
            sessionEventEmitter.emit('session-changed', userId)
        }

        createLogs({ logs: [{ 
            level: 'INFO', 
            message: `Profile updated for user ${userId} by ${updatedBy || 'unknown'}`, 
            type: 'OTHER' 
        }] })
        
        return success(undefined, "Profile updated successfully")
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error updating profile: ${error instanceof Error ? error.message : String(error)}`
        })
        createLogs({ logs: [{ 
            level: 'ERROR', 
            message: `Failed to update profile for user ${userId}: ${error}`, 
            type: 'OTHER' 
        }] })
        return failure(error instanceof Error ? error.message : 'Failed to update profile')
    }
}

export async function updatePassword({ _userId, _newPassword, _updatedBy }: { _userId: string, _newPassword: string, _updatedBy: string }): Promise<boolean> {
    try {
        const passwordValidation = PasswordStrengthSchema.safeParse(_newPassword)
        if (!passwordValidation.success) {
            await logError({
                type: 'AUTH',
                message: `Password update failed: does not meet security requirements`
            })
            return false
        }

        await auth.api.setUserPassword({
            body: {
                userId: _userId,
                newPassword: _newPassword
            },
            headers: await headers()
        })

        createLogs({ logs: [{
            level: 'INFO',
            message: `Password reset for user ${_userId} by admin ${_updatedBy}`,
            type: 'AUTH'
        }] })

        return true
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error updating password: ${error instanceof Error ? error.message : String(error)}`
        })
        return false
    }
}

export async function deleteProfile(userId: string, deletedBy: string) {
    try {
        await db.delete(user).where(eq(user.id, userId))
        createLogs({ logs: [{ 
            level: 'WARN', 
            message: `User ${userId} deleted by ${deletedBy}`, 
            type: 'AUTH' 
        }] })
        return true
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error deleting profile: ${error instanceof Error ? error.message : String(error)}`
        })
        return false
    }
}

export async function getInactiveProfiles(): Promise<UserProfile[] | null> {
    try {
        const inactiveUsers = await db.select().from(user).where(eq(user.isActive, false))
        return inactiveUsers.map(mapUserToProfile)
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error fetching inactive profiles: ${error instanceof Error ? error.message : String(error)}`
        })
        return null
    }
}

export async function restoreProfile(userId: string, _restoredBy: string) {
    try {
        await db.update(user).set({ isActive: true }).where(eq(user.id, userId))
        return true
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error restoring profile: ${error instanceof Error ? error.message : String(error)}`
        })
        return false
    }
}

export async function getAuthKeys() {
    await createLogs({
        logs: [{
            level: 'WARN',
            type: 'AUTH',
            message: 'DEPRECATED: Auth Keys system replaced by invitation system - getAuthKeys called',
        }]
    })
    return [] as AuthKeys[]
}

export async function getSingleAuthKeys(_keyId: string) {
    await createLogs({
        logs: [{
            level: 'WARN',
            type: 'AUTH',
            message: 'DEPRECATED: Auth Keys system replaced by invitation system - getSingleAuthKeys called',
        }]
    })
    return null
}

export async function createAuthKeys(_email?: string, _user_type?: UserRoleType) {
    await createLogs({
        logs: [{
            level: 'WARN',
            type: 'AUTH',
            message: 'DEPRECATED: Auth Keys system replaced by invitation system - createAuthKeys called',
        }]
    })
    return false
}

export async function deleteAuthKeys(_keyId: string) {
    await createLogs({
        logs: [{
            level: 'WARN',
            type: 'AUTH',
            message: 'DEPRECATED: Auth Keys system replaced by invitation system - deleteAuthKeys called',
        }]
    })
    return false
}

export async function requestPasswordReset(email: string) {
    try {
        // Better Auth uses forgetPassword on client, but on server it might be resetPassword or similar
        // The error suggested 'resetPassword'
        // @ts-expect-error - Dynamic API method might not be fully typed
        await auth.api.forgetPassword({
            body: { email }
        })
        return "Password reset email sent"
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error requesting password reset: ${error instanceof Error ? error.message : String(error)}`
        })
        return "Error requesting password reset"
    }
}

export async function confirmPasswordReset(__keyId: string, _email: string, _newPassword: string) {
    await createLogs({
        logs: [{
            level: 'WARN',
            type: 'AUTH',
            message: 'DEPRECATED: Password reset confirmation is handled by Better Auth client-side flow - confirmPasswordReset called',
        }]
    })
    return 'Please use the link sent to your email'
}

export async function getArtistProfile(userId: string) {
    const profile = await getProfile(userId)
    if (!profile) return null
    
    return {
        id: profile.id,
        artistName: profile.full_name,
        email: profile.email,
        phone: profile.phone_number,
        instagram: profile.instagram_handle,
        avatar: profile.avatar_url,
        photos: [], 
        bio: "", 
        tags: "" 
    }
}

export async function updateArtistProfile(userId: string, data: Partial<ArtistProfile>) {
    const updateData: Partial<UserProfile> = {}
    if (data.artistName) updateData.full_name = sanitizeText(data.artistName)
    if (data.phone) updateData.phone_number = sanitizeMinimal(data.phone)
    if (data.instagram) updateData.instagram_handle = sanitizeText(data.instagram)
    if (data.avatar) updateData.avatar_url = data.avatar

    return updateProfile({ userId, profile: updateData })
}

// ============================================================================
// USER CREATION & INVITATION
// ============================================================================

interface InviteUserParams {
    email: string
    role: UserRoleType
}

interface CreateUserParams {
    full_name: string
    email: string
    password: string
    role: UserRoleType
}

export async function inviteUser({ email, role }: InviteUserParams): Promise<{ success: boolean; message: string }> {
    try {
        // Verify admin permissions
        const currentUser = await getCurrentUser()
        if (!currentUser || !(await isAdmin(currentUser))) {
            return { success: false, message: "Unauthorized: Admin access required" }
        }

        // Normalize email
        const normalizedEmail = email.toLowerCase().trim()

        // Check if user already exists
        const existingUser = await db.select().from(user).where(eq(user.email, normalizedEmail)).limit(1)
        if (existingUser.length > 0) {
            return { success: false, message: "A user with this email already exists" }
        }

        // Check for existing active invitation
        const existingInvitation = await db
            .select()
            .from(invitations)
            .where(eq(invitations.email, normalizedEmail))
            .limit(1)

        if (existingInvitation.length > 0 && new Date(existingInvitation[0].expiresAt) > new Date()) {
            return { success: false, message: "An active invitation already exists for this email" }
        }

        // Generate 8-digit numeric invitation token
        const token = Math.floor(10000000 + Math.random() * 90000000).toString()
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiration

        // Create invitation record
        await db.insert(invitations).values({
            email: normalizedEmail,
            role: role.toLowerCase(),
            token,
            expiresAt,
            createdBy: currentUser.id,
        })

        // Send invitation email
        await sendInviteEmail(normalizedEmail, token)

        createLogs({
            logs: [{
                level: 'INFO',
                message: `Invitation sent to ${normalizedEmail} with role ${role} by ${currentUser.id}`,
                type: 'AUTH'
            }]
        })

        return { success: true, message: `Invitation sent to ${normalizedEmail}` }
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error sending invitation: ${error instanceof Error ? error.message : String(error)}`
        })
        createLogs({
            logs: [{
                level: 'ERROR',
                message: `Failed to send invitation to ${email}: ${error}`,
                type: 'AUTH'
            }]
        })
        return { success: false, message: "Failed to send invitation. Please try again." }
    }
}

export async function createUser({ full_name, email, password, role }: CreateUserParams): Promise<{ success: boolean; message: string }> {
    try {
        // Validate inputs with clear error messages
        if (!full_name?.trim()) {
            return { success: false, message: "Full name is required" }
        }
        if (!email?.trim()) {
            return { success: false, message: "Email is required" }
        }
        if (!password?.trim()) {
            return { success: false, message: "Password is required" }
        }
        if (!role) {
            return { success: false, message: "Role is required" }
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            return { success: false, message: "Invalid email format" }
        }

        // Validate password strength
        if (password.length < 8) {
            return { success: false, message: "Password must be at least 8 characters" }
        }

        // Normalize email
        const normalizedEmail = email.toLowerCase().trim()

        // Verify admin permissions
        const currentUser = await getCurrentUser()
        if (!currentUser || !(await isAdmin(currentUser))) {
            return { success: false, message: "Unauthorized: Admin access required" }
        }

        // Check if user already exists
        const existingUser = await db.select().from(user).where(eq(user.email, normalizedEmail)).limit(1)
        if (existingUser.length > 0) {
            return { success: false, message: "A user with this email already exists" }
        }

        // Validate password strength with detailed feedback
        const passwordValidation = PasswordStrengthSchema.safeParse(password)
        if (!passwordValidation.success) {
            return { 
                success: false, 
                message: `Password does not meet security requirements: ${passwordValidation.error.issues.map((e: { message: string }) => e.message).join(', ')}`
            }
        }

        // Validate params against schema (partial since password is separate)
        const validated = CreateUserProfileSchema.safeParse({
            full_name,
            email,
            role
        })

        if (!validated.success) {
            const fieldErrors = validated.error.flatten().fieldErrors
            const errorMessages = Object.entries(fieldErrors)
                .map(([field, errors]) => `${field}: ${errors?.join(', ')}`)
                .join('; ')
            return { success: false, message: `Validation failed: ${errorMessages || 'Invalid user data'}` }
        }

        // Clean up any existing invitations for this email to avoid conflicts
        await db.delete(invitations).where(eq(invitations.email, normalizedEmail))

        // Generate synthetic invitation for admin creation
        const token = Math.floor(10000000 + Math.random() * 90000000).toString()
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 1) // 1 day expiration

        // Create invitation record
        await db.insert(invitations).values({
            email: normalizedEmail,
            role: role.toLowerCase(),
            token,
            expiresAt,
            createdBy: currentUser.id,
        })

        // Create user via Better Auth Public API (signUpEmail) to ensure invitation hook works properly
        // We use signUpEmail because createUser (Admin API) might strip custom body fields like invitationCode
        const requestHeaders = new Headers(await headers())
        requestHeaders.delete('cookie') // Ensure no session conflict with admin user

        const result = await auth.api.signUpEmail({
            body: {
                email: normalizedEmail,
                password,
                name: full_name,
                invitationCode: token,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            headers: requestHeaders
        })

        if (!result) {
            return { success: false, message: "Failed to create user" }
        }

        // Update additional profile fields including role
        const updateData: Partial<typeof user.$inferInsert> = {
            fullName: full_name,
            role: role.toLowerCase(),
        }

        // Set default rate_level for artist role
        if (role === "artist" && !updateData.rateLevelId) {
            const defaultLevel = await db
                .select({ id: rateLevels.id })
                .from(rateLevels)
                .where(and(eq(rateLevels.isActive, true), eq(rateLevels.slug, "standard")))
                .limit(1)
            if (defaultLevel[0]) {
                updateData.rateLevelId = defaultLevel[0].id
            }
        }

        await db.update(user)
            .set(updateData)
            .where(eq(user.email, normalizedEmail))

        createLogs({
            logs: [{
                level: 'INFO',
                message: `User ${normalizedEmail} created with role ${role} by ${currentUser.id}`,
                type: 'AUTH'
            }]
        })

        return { success: true, message: `User ${full_name} created successfully` }
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error creating user: ${error instanceof Error ? error.message : String(error)}`
        })
        createLogs({
            logs: [{
                level: 'ERROR',
                message: `Failed to create user ${email}: ${error}`,
                type: 'AUTH'
            }]
        })
        return { success: false, message: "Failed to create user. Please try again." }
    }
}

interface InvitationWithCreator {
    id: string
    email: string
    token: string
    role: UserRoleType
    created_at: Date
    expires_at: Date | null
    created_by: string
    creator_name?: string
}

export async function listInvitations(): Promise<ActionResponse<InvitationWithCreator[]>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure('Not authenticated')
        }

        const adminCheck = await isAdmin(currentUser)
        if (!adminCheck) {
            return failure('Access denied')
        }

        const invitationList = await db
            .select({
                id: invitations.id,
                email: invitations.email,
                token: invitations.token,
                role: invitations.role,
                created_at: invitations.createdAt,
                expires_at: invitations.expiresAt,
                created_by: invitations.createdBy,
            })
            .from(invitations)
            .orderBy(desc(invitations.createdAt))

        // Get creator names (filter out null created_by values)
        const creatorIds = [...new Set(invitationList.map(i => i.created_by).filter((id): id is string => id !== null))]
        
        let creatorMap = new Map<string, string | null>()
        if (creatorIds.length > 0) {
            const creators = await db
                .select({ id: user.id, name: user.fullName })
                .from(user)
                .where(inArray(user.id, creatorIds))
            creatorMap = new Map(creators.map(c => [c.id, c.name]))
        }

        const result: InvitationWithCreator[] = invitationList.map(inv => ({
            id: inv.id,
            email: inv.email,
            token: inv.token,
            role: inv.role.toUpperCase() as UserRoleType,
            created_at: inv.created_at,
            expires_at: inv.expires_at,
            created_by: inv.created_by ?? 'unknown',
            creator_name: inv.created_by ? (creatorMap.get(inv.created_by) ?? 'Unknown') : 'System',
        }))

        return success(result)
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error listing invitations: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to list invitations')
    }
}
