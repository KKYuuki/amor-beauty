"use server"

import { db } from "@/server/db"
import { systemLogs } from "@/server/db/schema"
import { user } from "@/server/db/schema/auth"
import { branches } from "@/server/db/schema/branches"
import { eq, and, gte, lte, desc, like } from "drizzle-orm"
import { CreateLogEntryPayload, LogEntry, LogLevel, LogType } from "@/utils/types/logs"
import { ActionResponse, success, failure } from "@/utils/types/responses"

// Valid values for runtime validation
const VALID_LOG_LEVELS: LogLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG', 'FATAL']
const VALID_LOG_TYPES: LogType[] = ['APPOINTMENT', 'INVENTORY', 'SYSTEM', 'AUTH', 'ACCOUNTING', 'PAYROLL', 'STORAGE', 'METRICS', 'OTHER', 'PUSH']

/**
 * Validates and maps a database log entry to LogEntry type
 */
function mapToLogEntry(log: {
    id: string
    createdAt: Date
    level: string
    type: string
    userId: string | null
    branchId: string | null
    message: string | null
}, userName?: string | null, branchName?: string | null): LogEntry | null {
    const level = log.level as LogLevel
    const type = log.type as LogType

    // Validate level and type against valid enums
    if (!VALID_LOG_LEVELS.includes(level)) {
        console.error(`Invalid log level: ${log.level}`)
        return null
    }

    if (!VALID_LOG_TYPES.includes(type)) {
        console.error(`Invalid log type: ${log.type}`)
        return null
    }

    return {
        id: log.id,
        date: log.createdAt.toISOString(),
        level,
        type,
        user_id: log.userId || undefined,
        user_name: userName || undefined,
        branch_id: log.branchId || undefined,
        branch_name: branchName || undefined,
        message: log.message || undefined,
    }
}

/**
 * Validates and sanitizes page number
 */
function validatePage(page: number): number {
    if (typeof page !== 'number' || isNaN(page) || page < 1) {
        return 1
    }
    return page
}

/**
 * Validates if a string is a valid date
 */
function isValidDate(dateString: string): boolean {
    const date = new Date(dateString)
    return !isNaN(date.getTime())
}

/**
 * Create logs in the database
 * Falls back to console logging if database insert fails
 */
export async function createLogs({ logs }: { logs: CreateLogEntryPayload[] }): Promise<ActionResponse<void>> {
    try {
        // Insert logs into database
        await db.insert(systemLogs).values(
            logs.map(log => ({
                level: log.level,
                type: log.type,
                userId: log.user_id,
                branchId: log.branch_id,
                message: log.message,
            }))
        )

        return success(undefined)
    } catch (error) {
        // Fallback to console logging for critical DB failures
        // This is the only place where console.error is acceptable as a last resort
        console.error("CRITICAL: Failed to persist logs to database:", error)
        logs.forEach(log => {
            console.log(`[${log.level}] ${log.type}: ${log.message}`)
        })

        return failure(error instanceof Error ? error.message : "Failed to create logs")
    }
}

export interface GetLogsResult {
    logs: LogEntry[]
    total: number
    hasMore: boolean
}

/**
 * Get logs with pagination and optional filters
 * Joins with user and branches tables to get names
 */
export async function getLogs(
    page: number = 1,
    level?: LogLevel,
    type?: LogType,
    branchId?: string,
    startDate?: string,
    endDate?: string,
    search?: string,
    limit?: number
): Promise<ActionResponse<GetLogsResult>> {
    const validatedPage = validatePage(page)
    const pageSize = limit && limit > 0 && limit <= 10000 ? limit : 50
    const offset = (validatedPage - 1) * pageSize

    try {
        // Build filters array
        const filters = []

        if (level) {
            filters.push(eq(systemLogs.level, level))
        }

        if (type) {
            filters.push(eq(systemLogs.type, type))
        }

        if (branchId) {
            filters.push(eq(systemLogs.branchId, branchId))
        }

        if (startDate && isValidDate(startDate)) {
            filters.push(gte(systemLogs.createdAt, new Date(startDate)))
        }

        if (endDate && isValidDate(endDate)) {
            filters.push(lte(systemLogs.createdAt, new Date(endDate)))
        }

        if (search && search.trim()) {
            filters.push(like(systemLogs.message, `%${search.trim()}%`))
        }

        const whereClause = filters.length > 0 ? and(...filters) : undefined

        // Get paginated results with joins
        const results = await db
            .select({
                log: systemLogs,
                userName: user.fullName,
                branchName: branches.name,
            })
            .from(systemLogs)
            .leftJoin(user, eq(systemLogs.userId, user.id))
            .leftJoin(branches, eq(systemLogs.branchId, branches.id))
            .where(whereClause)
            .orderBy(desc(systemLogs.createdAt))
            .limit(pageSize)
            .offset(offset)

        // Get total count
        const countResult = await db
            .select({ count: db.$count(systemLogs) })
            .from(systemLogs)
            .leftJoin(user, eq(systemLogs.userId, user.id))
            .leftJoin(branches, eq(systemLogs.branchId, branches.id))
            .where(whereClause)

        const total = Number(countResult[0]?.count) ?? 0

        // Map to LogEntry type with validation
        const logs: LogEntry[] = results
            .map(({ log, userName, branchName }) => mapToLogEntry(log, userName, branchName))
            .filter((log): log is LogEntry => log !== null)

        return success({ logs, total, hasMore: total > offset + logs.length && (!limit || limit === 50) })
    } catch (error) {
        // Note: Can't use logError here as it would cause infinite recursion
        console.error("CRITICAL: Error fetching logs from database:", error)
        return failure(error instanceof Error ? error.message : "Failed to fetch logs")
    }
}

export interface GetLogsByUserResult {
    logs: LogEntry[]
    total: number
    hasMore: boolean
}

/**
 * Get logs for a specific user
 */
export async function getLogsByUser(
    userId: string,
    page: number = 1
): Promise<ActionResponse<GetLogsByUserResult>> {
    const validatedPage = validatePage(page)
    const limit = 50
    const offset = (validatedPage - 1) * limit

    try {
        // Get paginated results for user with joins
        const results = await db
            .select({
                log: systemLogs,
                userName: user.fullName,
                branchName: branches.name,
            })
            .from(systemLogs)
            .leftJoin(user, eq(systemLogs.userId, user.id))
            .leftJoin(branches, eq(systemLogs.branchId, branches.id))
            .where(eq(systemLogs.userId, userId))
            .orderBy(desc(systemLogs.createdAt))
            .limit(limit)
            .offset(offset)

        // Get total count
        const countResult = await db
            .select({ count: db.$count(systemLogs) })
            .from(systemLogs)
            .where(eq(systemLogs.userId, userId))

        const total = Number(countResult[0]?.count) ?? 0

        // Map to LogEntry type with validation
        const logs: LogEntry[] = results
            .map(({ log, userName, branchName }) => mapToLogEntry(log, userName, branchName))
            .filter((log): log is LogEntry => log !== null)

        return success({ logs, total, hasMore: total > offset + logs.length })
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error fetching logs for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : "Failed to fetch logs")
    }
}

/**
 * Helper function to log error messages with proper typing
 */
export async function logError(context: { type: LogType; message: string; userId?: string }) {
    return createLogs({
        logs: [{
            level: 'ERROR',
            type: context.type,
            message: context.message,
            user_id: context.userId
        }]
    })
}

/**
 * Helper function to log info messages with proper typing
 */
export async function logInfo(context: { type: LogType; message: string; userId?: string }) {
    return createLogs({
        logs: [{
            level: 'INFO',
            type: context.type,
            message: context.message,
            user_id: context.userId
        }]
    })
}

/**
 * Helper function to log warning messages with proper typing
 */
export async function logWarn(context: { type: LogType; message: string; userId?: string }) {
    return createLogs({
        logs: [{
            level: 'WARN',
            type: context.type,
            message: context.message,
            user_id: context.userId
        }]
    })
}
