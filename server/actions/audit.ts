'use server'

import { db } from '@/server/db'
import { user } from '@/server/db/schema/auth'
import { systemLogs } from '@/server/db/schema/logs'
import { eq, desc, and, sql, like } from 'drizzle-orm'
import { createLogs, logError } from './logs'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import { LogEntry } from '@/utils/types/logs'

/**
 * Record a successful login for a user
 * Updates login timestamp, increments login count, and resets failed attempts
 */
export async function recordSuccessfulLogin(userId: string): Promise<ActionResponse<void>> {
    try {
        await db
            .update(user)
            .set({
                lastLoginAt: new Date(),
                loginCount: sql`${user.loginCount} + 1`,
                failedLoginAttempts: 0,
            })
            .where(eq(user.id, userId))

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'AUTH',
                message: `User logged in: ${userId}`,
                user_id: userId,
            }]
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error recording successful login for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
            userId,
        })
        return failure(error instanceof Error ? error.message : 'Failed to record login')
    }
}

/**
 * Update the last login method for a user
 * Called after successful authentication to track login method
 */
export async function updateLastLoginMethod(userId: string, method: string): Promise<void> {
    try {
        await db
            .update(user)
            .set({
                lastLoginMethod: method,
            })
            .where(eq(user.id, userId))

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'AUTH',
                message: `User ${userId} logged in with method: ${method}`,
                user_id: userId,
            }]
        })
    } catch (error) {
        // Non-critical - log but don't throw
        console.error('Failed to update last login method:', error)
    }
}

/**
 * Record a failed login attempt for a user
 * Increments failed login attempts and records timestamp
 */
export async function recordFailedLogin(userId: string): Promise<ActionResponse<void>> {
    try {
        await db
            .update(user)
            .set({
                failedLoginAttempts: sql`${user.failedLoginAttempts} + 1`,
                lastFailedLoginAt: new Date(),
            })
            .where(eq(user.id, userId))

        await createLogs({
            logs: [{
                level: 'WARN',
                type: 'AUTH',
                message: `Failed login attempt for user: ${userId}`,
                user_id: userId,
            }]
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error recording failed login for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
            userId,
        })
        return failure(error instanceof Error ? error.message : 'Failed to record failed login')
    }
}

/**
 * Record a failed login attempt by email (when user ID is not yet known)
 * This is useful for tracking failed attempts before authentication
 */
export async function recordFailedLoginByEmail(email: string): Promise<ActionResponse<void>> {
    try {
        await createLogs({
            logs: [{
                level: 'WARN',
                type: 'AUTH',
                message: `Failed login attempt for email: ${email}`,
            }]
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error recording failed login for email ${email}: ${error instanceof Error ? error.message : String(error)}`,
        })
        return failure(error instanceof Error ? error.message : 'Failed to record failed login')
    }
}

export interface LoginHistoryResult {
    logs: LogEntry[]
    total: number
    hasMore: boolean
}

/**
 * Get login history for a specific user
 * Queries system logs for AUTH type events related to the user
 */
export async function getLoginHistory(
    userId: string,
    page: number = 1,
    limit: number = 50
): Promise<ActionResponse<LoginHistoryResult>> {
    const validatedPage = Math.max(1, page)
    const validatedLimit = Math.min(100, Math.max(1, limit))
    const offset = (validatedPage - 1) * validatedLimit

    try {
        // Query system logs for AUTH events related to this user
        const results = await db
            .select()
            .from(systemLogs)
            .where(and(
                eq(systemLogs.type, 'AUTH'),
                like(systemLogs.message, `%${userId}%`)
            ))
            .orderBy(desc(systemLogs.createdAt))
            .limit(validatedLimit)
            .offset(offset)

        // Get total count
        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(systemLogs)
            .where(and(
                eq(systemLogs.type, 'AUTH'),
                like(systemLogs.message, `%${userId}%`)
            ))

        const total = countResult[0]?.count ?? 0

        // Map to LogEntry type
        const logs: LogEntry[] = results.map(log => ({
            id: log.id,
            date: log.createdAt.toISOString(),
            level: log.level as 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'FATAL',
            type: log.type as 'APPOINTMENT' | 'INVENTORY' | 'SYSTEM' | 'AUTH' | 'ACCOUNTING' | 'PAYROLL' | 'STORAGE' | 'OTHER',
            user_id: log.userId || undefined,
            message: log.message || undefined,
        }))

        return success({
            logs,
            total,
            hasMore: total > offset + logs.length,
        })
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error fetching login history for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
            userId,
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch login history')
    }
}

/**
 * Get user login statistics
 * Returns aggregated login data for a user
 */
export async function getUserLoginStats(userId: string): Promise<ActionResponse<{
    lastLoginAt: Date | null
    loginCount: number
    failedLoginAttempts: number
    lastFailedLoginAt: Date | null
}>> {
    try {
        const [result] = await db
            .select({
                lastLoginAt: user.lastLoginAt,
                loginCount: user.loginCount,
                failedLoginAttempts: user.failedLoginAttempts,
                lastFailedLoginAt: user.lastFailedLoginAt,
            })
            .from(user)
            .where(eq(user.id, userId))
            .limit(1)

        if (!result) {
            return failure('User not found')
        }

        return success({
            lastLoginAt: result.lastLoginAt,
            loginCount: result.loginCount ?? 0,
            failedLoginAttempts: result.failedLoginAttempts ?? 0,
            lastFailedLoginAt: result.lastFailedLoginAt,
        })
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error fetching login stats for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
            userId,
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch login stats')
    }
}

/**
 * Reset failed login attempts for a user
 * Useful for admin intervention or after successful password reset
 */
export async function resetFailedLoginAttempts(userId: string): Promise<ActionResponse<void>> {
    try {
        await db
            .update(user)
            .set({
                failedLoginAttempts: 0,
            })
            .where(eq(user.id, userId))

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'AUTH',
                message: `Failed login attempts reset for user: ${userId}`,
                user_id: userId,
            }]
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error resetting failed login attempts for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
            userId,
        })
        return failure(error instanceof Error ? error.message : 'Failed to reset failed login attempts')
    }
}
