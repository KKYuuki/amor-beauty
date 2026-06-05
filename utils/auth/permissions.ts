'use server'

import { headers } from 'next/headers'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import { user } from '@/server/db/schema/auth'
import { eq } from 'drizzle-orm'
import { UserProfile, UserRoleType, PayoutPeriodType } from '@/utils/types/auth'
import { STAFF_ROLES } from './constants'
import { userHasFlag } from './access-flags'

/**
 * Get the current authenticated user from Better Auth session
 */
export async function getCurrentUser(): Promise<UserProfile | null> {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        if (!session?.user) {
            return null
        }

        const [dbUser] = await db
            .select()
            .from(user)
            .where(eq(user.id, session.user.id))
            .limit(1)

        if (!dbUser) {
            return null
        }

        return {
            id: dbUser.id,
            created_at: dbUser.createdAt,
            full_name: dbUser.fullName || dbUser.name || '',
            email: dbUser.email,
            phone_number: dbUser.phoneNumber ?? undefined,
            instagram_handle: dbUser.instagramHandle ?? undefined,
            avatar_url: dbUser.avatarUrl ?? undefined,
            role: (dbUser.role || 'client') as UserRoleType,
            access_flags: dbUser.accessFlags ?? [],
            is_active: dbUser.isActive,
            last_login_at: dbUser.lastLoginAt ?? undefined,
            rate_level_id: dbUser.rateLevelId ?? undefined,
            payout_period: dbUser.payoutPeriod as PayoutPeriodType | undefined,
            branch_ids: dbUser.branchIds ?? [],
        }
    } catch (error) {
        console.error('Error getting current user:', error)
        return null
    }
}

/**
 * Get a user by their ID
 */
export async function getUserById(userId: string): Promise<UserProfile | null> {
    try {
        const [dbUser] = await db
            .select()
            .from(user)
            .where(eq(user.id, userId))
            .limit(1)

        if (!dbUser) {
            return null
        }

        return {
            id: dbUser.id,
            created_at: dbUser.createdAt,
            full_name: dbUser.fullName || dbUser.name || '',
            email: dbUser.email,
            phone_number: dbUser.phoneNumber ?? undefined,
            instagram_handle: dbUser.instagramHandle ?? undefined,
            avatar_url: dbUser.avatarUrl ?? undefined,
            role: (dbUser.role || 'client') as UserRoleType,
            access_flags: dbUser.accessFlags ?? [],
            is_active: dbUser.isActive,
            last_login_at: dbUser.lastLoginAt ?? undefined,
            rate_level_id: dbUser.rateLevelId ?? undefined,
            payout_period: dbUser.payoutPeriod as PayoutPeriodType | undefined,
            branch_ids: dbUser.branchIds ?? [],
        }
    } catch (error) {
        console.error('Error getting user by ID:', error)
        return null
    }
}

// ============================================================================
// Role Checks
// ============================================================================

export async function isAdmin(user: UserProfile): Promise<boolean> {
    return user.role === 'admin'
}

export async function isStaff(user: UserProfile): Promise<boolean> {
    return STAFF_ROLES.includes(user.role)
}

// ============================================================================
// Feature Access Permission Functions
// ============================================================================

export async function canAccessAccounting(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'accounting_access')
}

export async function canViewMetrics(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'metrics_view')
}

export async function canAccessSales(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'sales_access')
}

export async function canManagePayroll(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'payroll_manage')
}

export async function canViewOwnPayroll(user: UserProfile): Promise<boolean> {
    return isStaff(user)
}

export async function canAccessTransactions(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'transactions_manage')
}

export async function canManageInventory(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'inventory_manage')
}

export async function canManageAppointments(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'appointments_manage')
}

export async function canViewAppointments(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'appointments_view')
}

export async function canManageUsers(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'user_manage')
}

export async function canAccessLogs(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'logs_view')
}

export async function canManageBranches(user: UserProfile): Promise<boolean> {
    return user.role === 'admin'
}

export async function canManageServices(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'services_manage')
}

export async function canManageTimeClock(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'time_clock_manage')
}

export async function canSendNotifications(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'notifications_send')
}

export async function canManageSystemConfig(user: UserProfile): Promise<boolean> {
    return userHasFlag(user, 'system_config')
}

// ============================================================================
// Authorization Helpers
// ============================================================================

export type PermissionCheck = (user: UserProfile) => boolean

export interface AuthResult {
    authorized: boolean
    user?: UserProfile
    message?: string
}

/**
 * Authorize an action with a permission check.
 * Use at the top of every guarded server action.
 */
export async function authorizeAction(
    permissionCheck: PermissionCheck
): Promise<AuthResult> {
    const currentUser = await getCurrentUser()

    if (!currentUser) {
        return { authorized: false, message: 'Not authenticated' }
    }

    const hasPermission = await permissionCheck(currentUser)

    if (!hasPermission) {
        return { authorized: false, user: currentUser, message: 'Insufficient permissions' }
    }

    return { authorized: true, user: currentUser }
}

/**
 * Require authentication with optional permission check.
 * Returns the user if authorized, null otherwise.
 */
export async function requireAuth(
    permissionCheck?: PermissionCheck
): Promise<UserProfile | null> {
    const currentUser = await getCurrentUser()

    if (!currentUser) {
        return null
    }

    if (permissionCheck) {
        const hasPermission = await permissionCheck(currentUser)
        if (!hasPermission) {
            return null
        }
    }

    return currentUser
}
