'use server'

import { db } from '@/server/db'
import { timeClockEntries, staffSchedules, qrSessions, branches, user } from '@/server/db/schema'
import { eq, and, isNull, asc, desc, gte, lte } from 'drizzle-orm'
import { StaffSchedule, ScheduleInput } from "@/utils/types/schedules"
import { getCurrentUser, canManageTimeClock } from "@/utils/auth/permissions"
import { createLogs, logError } from "./logs"
import { ActionResponse, success, failure } from "@/utils/types/responses"
import { verifyQRCode, generateDailyQRCode, generateQRCodeImage, incrementQRUsage } from "@/server/utils/qr-code"

// ============================================================================
// TYPES
// ============================================================================

export interface ClockInWithQRResult {
    entryId: string
    branchName: string
    clockedInAt: string
}

export interface ClockOutResult {
    entryId: string
    duration: string
    clockedOutAt: string
}

export interface ClockOutWithQRResult {
    entryId: string
    duration: string
    clockedOutAt: string
    branchName: string | null
}

export interface ClockStatusResult {
    isClockedIn: boolean
    clockedInAt: string | null
    branchId: string | null
    branchName: string | null
    duration: string | null
    entryId: string | null
}

export interface TimeClockEntry {
    id: string
    staff_id: string
    staff_name: string
    staff_email: string
    clock_in: string
    clock_out: string | null
    duration: string | null
    branch_id: string | null
    branch_name: string | null
    notes: string | null
    clock_in_device: string | null
    clock_out_device: string | null
}

export interface GetTimeClockEntriesParams {
    startDate: Date
    endDate: Date
    branchId?: string
    staffId?: string
}

export interface GetTimeClockEntriesResult {
    entries: TimeClockEntry[]
}

export interface StaffClockStatus {
    staff_id: string
    staff_name: string | null
    staff_email: string
    is_clocked_in: boolean
    clocked_in_at: string | null
    branch_id: string | null
    branch_name: string | null
    duration: string | null
}

export interface GetStaffClockStatusResult {
    staff: StaffClockStatus[]
}

export interface GenerateQRCodeResult {
    qrCode: string
    qrDataUrl: string
    validUntil: string
    branchName: string
    branchCode: string
    isSingleUse: boolean
}

export interface QRSessionWithBranch {
    id: string
    qr_code: string
    valid_date: string
    is_active: boolean
    branch_id: string
    branch_name: string
    branch_code: string
    generated_by: string | null
    created_at: string
}

export interface GetQRSessionsResult {
    sessions: QRSessionWithBranch[]
}

// ============================================================================
// ACCESS CONTROL HELPER
// ============================================================================

// ============================================================================
// TIME HELPER FUNCTIONS
// ============================================================================

/**
 * Convert time string ("HH:MM") to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number)
    return hours * 60 + minutes
}

/**
 * Format duration from milliseconds to HH:MM:SS
 */
function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = seconds % 60
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

// ============================================================================
// DAY OF WEEK MAPPING
// ============================================================================

const DAY_NUMBER_TO_NAME: Record<number, string> = {
    0: 'SUNDAY',
    1: 'MONDAY',
    2: 'TUESDAY',
    3: 'WEDNESDAY',
    4: 'THURSDAY',
    5: 'FRIDAY',
    6: 'SATURDAY',
}

const DAY_NAME_TO_NUMBER: Record<string, number> = {
    'SUNDAY': 0,
    'MONDAY': 1,
    'TUESDAY': 2,
    'WEDNESDAY': 3,
    'THURSDAY': 4,
    'FRIDAY': 5,
    'SATURDAY': 6,
}

// ============================================================================
// MAP FUNCTIONS
// ============================================================================

/**
 * Map database schedule to StaffSchedule type
 */
function mapScheduleToType(dbSchedule: typeof staffSchedules.$inferSelect): StaffSchedule {
    return {
        id: dbSchedule.id,
        staff_id: dbSchedule.staffId,
        day_of_week: DAY_NAME_TO_NUMBER[dbSchedule.dayOfWeek] ?? 0,
        start_time: dbSchedule.startTime,
        end_time: dbSchedule.endTime,
        is_off: !dbSchedule.isActive,
        created_at: dbSchedule.createdAt.toISOString(),
        updated_at: dbSchedule.updatedAt?.toISOString() ?? dbSchedule.createdAt.toISOString(),
    }
}

// ============================================================================
// CLOCK IN WITH QR
// ============================================================================

export async function clockInWithQR(
    staffId: string,
    qrCode: string,
    deviceInfo?: string,
    verificationMethod?: 'passkey' | 'session_cache'
): Promise<ActionResponse<ClockInWithQRResult>> {
    try {
        // Check authentication
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        // Allow self clock-in or admin
        const isSelf = currentUser.id === staffId
        const hasAdminAccess = await canManageTimeClock(currentUser)
        
        if (!isSelf && !hasAdminAccess) {
            return failure("Access denied: Can only clock yourself in")
        }

        // Verify QR code format
        if (!qrCode.startsWith('CLK-')) {
            return failure("Invalid QR code format. Please scan a valid studio QR code.")
        }

        // Verify QR code
        const qrVerification = await verifyQRCode(qrCode)
        if (!qrVerification.valid || !qrVerification.branchId) {
            await createLogs({
                logs: [{
                    level: 'WARN',
                    type: 'SYSTEM',
                    message: `Invalid QR code attempt by staff ${staffId}: ${qrVerification.error}`,
                    user_id: currentUser.id,
                    branch_id: qrVerification.branchId ?? undefined,
                }]
            })
            return failure(qrVerification.error || "Invalid QR code. Please scan a valid studio QR code.")
        }

        const branchId = qrVerification.branchId

        // Check if staff is already clocked in
        const [existingActiveEntry] = await db
            .select()
            .from(timeClockEntries)
            .where(
                and(
                    eq(timeClockEntries.staffId, staffId),
                    isNull(timeClockEntries.clockOut)
                )
            )
            .limit(1)

        if (existingActiveEntry) {
            return failure("Already clocked in. Please clock out first before clocking in again.")
        }

        // Get QR session ID
        const [qrSession] = await db
            .select()
            .from(qrSessions)
            .where(eq(qrSessions.qrCode, qrCode))
            .limit(1)

        if (!qrSession) {
            return failure("QR session not found. The QR code may have expired. Please scan a new one.")
        }

        // Get branch name
        const [branch] = await db
            .select({ name: branches.name })
            .from(branches)
            .where(eq(branches.id, branchId))
            .limit(1)

        if (!branch) {
            return failure("Branch not found. Please contact your administrator.")
        }

        const now = new Date()

        // Create time clock entry
        const [newEntry] = await db
            .insert(timeClockEntries)
            .values({
                staffId,
                clockIn: now,
                branchId,
                qrSessionId: qrSession.id,
                clockInDevice: deviceInfo || null,
            })
            .returning()

        if (!newEntry) {
            throw new Error("Failed to create time clock entry")
        }

        await incrementQRUsage(qrCode)

        // Log the action
        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Staff ${staffId} clocked in at branch ${branch?.name || branchId} via QR (${verificationMethod || 'unknown'})`,
                user_id: currentUser.id,
                branch_id: branchId,
            }]
        })

        return success({
            entryId: newEntry.id,
            branchName: branch?.name || "Unknown Branch",
            clockedInAt: now.toISOString(),
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await logError({
            type: 'PAYROLL',
            message: `Error clocking in with QR: ${errorMessage}`,
        })
        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'PAYROLL',
                message: `Failed to clock in staff ${staffId} with QR: ${errorMessage}`,
            }]
        })
        return failure(errorMessage || 'Failed to clock in with QR')
    }
}

// ============================================================================
// CLOCK OUT
// ============================================================================

export async function clockOut(
    staffId: string,
    notes?: string,
    deviceInfo?: string
): Promise<ActionResponse<ClockOutResult>> {
    try {
        // Check authentication
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        // Allow self clock-out or admin
        const isSelf = currentUser.id === staffId
        const hasAdminAccess = await canManageTimeClock(currentUser)
        
        if (!isSelf && !hasAdminAccess) {
            return failure("Access denied: Can only clock yourself out")
        }

        // Find active entry
        const [activeEntry] = await db
            .select()
            .from(timeClockEntries)
            .where(
                and(
                    eq(timeClockEntries.staffId, staffId),
                    isNull(timeClockEntries.clockOut)
                )
            )
            .limit(1)

        if (!activeEntry) {
            return failure("Not clocked in. Please clock in first.")
        }

        const now = new Date()
        const duration = now.getTime() - activeEntry.clockIn.getTime()

        // Update active entry with clock_out time
        await db
            .update(timeClockEntries)
            .set({
                clockOut: now,
                notes: notes || activeEntry.notes,
                clockOutDevice: deviceInfo || null,
                updatedAt: now,
            })
            .where(eq(timeClockEntries.id, activeEntry.id))

        // Log the action
        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Staff ${staffId} clocked out after ${formatDuration(duration)}`,
                user_id: currentUser.id,
                branch_id: activeEntry.branchId ?? undefined,
            }]
        })

        return success({
            entryId: activeEntry.id,
            duration: formatDuration(duration),
            clockedOutAt: now.toISOString(),
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await logError({
            type: 'PAYROLL',
            message: `Error clocking out: ${errorMessage}`,
        })
        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'PAYROLL',
                message: `Failed to clock out staff ${staffId}: ${errorMessage}`,
            }]
        })
        return failure(errorMessage || 'Failed to clock out')
    }
}

// ============================================================================
// CLOCK OUT WITH QR
// ============================================================================

export async function clockOutWithQR(
    staffId: string,
    qrCode: string,
    deviceInfo?: string,
    verificationMethod?: 'passkey' | 'session_cache'
): Promise<ActionResponse<ClockOutWithQRResult>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        const isSelf = currentUser.id === staffId
        const hasAdminAccess = await canManageTimeClock(currentUser)

        if (!isSelf && !hasAdminAccess) {
            return failure("Access denied: Can only clock yourself out")
        }

        // Verify QR code
        if (!qrCode.startsWith('CLK-')) {
            return failure("Invalid QR code format. Please scan a valid studio QR code.")
        }

        const qrVerification = await verifyQRCode(qrCode)
        if (!qrVerification.valid || !qrVerification.branchId) {
            await createLogs({
                logs: [{
                    level: 'WARN',
                    type: 'PAYROLL',
                    message: `Invalid QR code on clock-out attempt by staff ${staffId}: ${qrVerification.error}`,
                    user_id: currentUser.id,
                    branch_id: qrVerification.branchId ?? undefined,
                }]
            })
            return failure(qrVerification.error || "Invalid QR code. Please scan a valid studio QR code.")
        }

        // Find active entry
        const [activeEntry] = await db
            .select()
            .from(timeClockEntries)
            .where(
                and(
                    eq(timeClockEntries.staffId, staffId),
                    isNull(timeClockEntries.clockOut)
                )
            )
            .limit(1)

        if (!activeEntry) {
            return failure("Not clocked in. Please clock in first.")
        }

        const now = new Date()
        const duration = now.getTime() - activeEntry.clockIn.getTime()
        const branchId = qrVerification.branchId

        // Update active entry with clock_out time
        await db
            .update(timeClockEntries)
            .set({
                clockOut: now,
                clockOutDevice: deviceInfo || null,
                updatedAt: now,
            })
            .where(eq(timeClockEntries.id, activeEntry.id))

        // Increment QR usage (handles single-use invalidation)
        await incrementQRUsage(qrCode)

        // Get branch name
        const [branch] = await db
            .select({ name: branches.name })
            .from(branches)
            .where(eq(branches.id, branchId))
            .limit(1)

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'PAYROLL',
                message: `Staff ${staffId} clocked out at branch ${branch?.name || branchId} via QR after ${formatDuration(duration)} (${verificationMethod || 'unknown'})`,
                user_id: currentUser.id,
                branch_id: branchId,
            }]
        })

        return success({
            entryId: activeEntry.id,
            duration: formatDuration(duration),
            clockedOutAt: now.toISOString(),
            branchName: branch?.name || null,
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await logError({
            type: 'PAYROLL',
            message: `Error clocking out with QR: ${errorMessage}`,
        })
        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'PAYROLL',
                message: `Failed to clock out staff ${staffId} with QR: ${errorMessage}`,
            }]
        })
        return failure(errorMessage || 'Failed to clock out with QR')
    }
}

// ============================================================================
// CLOCK STATUS
// ============================================================================

export async function getClockStatus(staffId: string): Promise<ActionResponse<ClockStatusResult>> {
    try {
        // Check for active entry (clock_out is null) with branch info
        const [activeEntry] = await db
            .select({
                id: timeClockEntries.id,
                clockIn: timeClockEntries.clockIn,
                branchId: timeClockEntries.branchId,
                branchName: branches.name,
            })
            .from(timeClockEntries)
            .leftJoin(branches, eq(timeClockEntries.branchId, branches.id))
            .where(
                and(
                    eq(timeClockEntries.staffId, staffId),
                    isNull(timeClockEntries.clockOut)
                )
            )
            .limit(1)

        if (!activeEntry) {
            return success({
                isClockedIn: false,
                clockedInAt: null,
                branchId: null,
                branchName: null,
                duration: null,
                entryId: null,
            })
        }

        // Calculate duration
        const now = new Date()
        const duration = now.getTime() - activeEntry.clockIn.getTime()

        return success({
            isClockedIn: true,
            clockedInAt: activeEntry.clockIn.toISOString(),
            branchId: activeEntry.branchId,
            branchName: activeEntry.branchName,
            duration: formatDuration(duration),
            entryId: activeEntry.id,
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await logError({
            type: 'PAYROLL',
            message: `Error getting clock status: ${errorMessage}`
        })
        return failure(errorMessage || 'Failed to get clock status')
    }
}

// ============================================================================
// GET TODAY'S HOURS
// ============================================================================

export interface TodayHoursResult {
    totalHours: string
    entriesCount: number
    firstClockIn: string | null
    lastClockOut: string | null
}

/**
 * Get today's total hours and session summary for a staff member
 */
export async function getTodayHours(staffId: string): Promise<ActionResponse<TodayHoursResult>> {
    try {
        // Get today's date range
        const today = new Date()
        const startOfDay = new Date(today.setHours(0, 0, 0, 0))
        const endOfDay = new Date(today.setHours(23, 59, 59, 999))

        // Get all entries for today
        const entries = await db
            .select({
                clock_in: timeClockEntries.clockIn,
                clock_out: timeClockEntries.clockOut,
            })
            .from(timeClockEntries)
            .where(
                and(
                    eq(timeClockEntries.staffId, staffId),
                    gte(timeClockEntries.clockIn, startOfDay),
                    lte(timeClockEntries.clockIn, endOfDay)
                )
            )
            .orderBy(asc(timeClockEntries.clockIn))

        // Calculate total duration
        let totalMs = 0
        let firstClockIn: string | null = null
        let lastClockOut: string | null = null

        for (const entry of entries) {
            if (!firstClockIn) {
                firstClockIn = entry.clock_in.toISOString()
            }

            const clockInTime = entry.clock_in.getTime()
            const clockOutTime = entry.clock_out?.getTime() || Date.now()
            
            totalMs += clockOutTime - clockInTime

            if (entry.clock_out) {
                lastClockOut = entry.clock_out.toISOString()
            }
        }

        // Format total hours
        const totalSeconds = Math.floor(totalMs / 1000)
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)

        return success({
            totalHours: `${hours}h ${minutes}m`,
            entriesCount: entries.length,
            firstClockIn,
            lastClockOut,
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await logError({
            type: 'PAYROLL',
            message: `Error getting today's hours: ${errorMessage}`
        })
        return failure(errorMessage || 'Failed to get today\'s hours')
    }
}

// ============================================================================
// GET TIME CLOCK ENTRIES
// ============================================================================

export async function getTimeClockEntries(
    params: GetTimeClockEntriesParams
): Promise<ActionResponse<GetTimeClockEntriesResult>> {
    try {
        // Check authentication
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        // Check permissions - time clock admins can view all, staff can only view own
        const hasTimeClockAdminAccess = await canManageTimeClock(currentUser)
        if (!hasTimeClockAdminAccess && params.staffId && params.staffId !== currentUser.id) {
            return failure("Access denied: Can only view your own time entries")
        }

        // Build filters
        const filters = [
            gte(timeClockEntries.clockIn, params.startDate),
            lte(timeClockEntries.clockIn, params.endDate),
        ]

        if (params.branchId) {
            filters.push(eq(timeClockEntries.branchId, params.branchId))
        }

        if (params.staffId) {
            filters.push(eq(timeClockEntries.staffId, params.staffId))
        }

        // Query entries with joins
        const entries = await db
            .select({
                id: timeClockEntries.id,
                staff_id: timeClockEntries.staffId,
                staff_name: user.fullName,
                staff_email: user.email,
                clock_in: timeClockEntries.clockIn,
                clock_out: timeClockEntries.clockOut,
                notes: timeClockEntries.notes,
                branch_id: timeClockEntries.branchId,
                branch_name: branches.name,
                clock_in_device: timeClockEntries.clockInDevice,
                clock_out_device: timeClockEntries.clockOutDevice,
            })
            .from(timeClockEntries)
            .leftJoin(user, eq(timeClockEntries.staffId, user.id))
            .leftJoin(branches, eq(timeClockEntries.branchId, branches.id))
            .where(and(...filters))
            .orderBy(desc(timeClockEntries.clockIn))

        // Calculate duration and map results
        const mappedEntries: TimeClockEntry[] = entries.map(entry => {
            let duration: string | null = null
            if (entry.clock_out) {
                const durationMs = entry.clock_out.getTime() - entry.clock_in.getTime()
                duration = formatDuration(durationMs)
            }

            return {
                id: entry.id,
                staff_id: entry.staff_id,
                staff_name: entry.staff_name || 'Unknown',
                staff_email: entry.staff_email || 'Unknown',
                clock_in: entry.clock_in.toISOString(),
                clock_out: entry.clock_out?.toISOString() || null,
                duration,
                branch_id: entry.branch_id,
                branch_name: entry.branch_name,
                notes: entry.notes,
                clock_in_device: entry.clock_in_device,
                clock_out_device: entry.clock_out_device,
            }
        })

        return success({ entries: mappedEntries })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await logError({
            type: 'PAYROLL',
            message: `Error fetching time clock entries: ${errorMessage}`
        })
        return failure(errorMessage || 'Failed to fetch time clock entries')
    }
}

// ============================================================================
// GET STAFF CLOCK STATUS
// ============================================================================

export async function getStaffClockStatus(
    branchId?: string
): Promise<ActionResponse<GetStaffClockStatusResult>> {
    try {
        // Check authentication
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        // Only time clock admins can view all staff clock status
        const hasTimeClockAdminAccess = await canManageTimeClock(currentUser)
        if (!hasTimeClockAdminAccess) {
            return failure("Access denied: Time clock admin access required")
        }

        // Get all active staff
        const staffQuery = db
            .select({
                id: user.id,
                full_name: user.fullName,
                email: user.email,
            })
            .from(user)
            .where(eq(user.isActive, true))

        const allStaff = await staffQuery

        // Get all active clock entries
        const activeEntries = await db
            .select({
                staff_id: timeClockEntries.staffId,
                clock_in: timeClockEntries.clockIn,
                branch_id: timeClockEntries.branchId,
                branch_name: branches.name,
            })
            .from(timeClockEntries)
            .leftJoin(branches, eq(timeClockEntries.branchId, branches.id))
            .where(
                and(
                    isNull(timeClockEntries.clockOut),
                    branchId ? eq(timeClockEntries.branchId, branchId) : undefined
                )
            )

        // Create a map of staff_id to clock status
        const clockStatusMap = new Map<string, {
            clock_in: Date
            branch_id: string | null
            branch_name: string | null
        }>()

        for (const entry of activeEntries) {
            if (entry.staff_id) {
                clockStatusMap.set(entry.staff_id, {
                    clock_in: entry.clock_in,
                    branch_id: entry.branch_id,
                    branch_name: entry.branch_name,
                })
            }
        }

        // Map staff with their clock status
        const now = new Date()
        const staffStatus: StaffClockStatus[] = allStaff.map(staffMember => {
            const clockData = clockStatusMap.get(staffMember.id)
            
            let duration: string | null = null
            if (clockData) {
                const durationMs = now.getTime() - clockData.clock_in.getTime()
                duration = formatDuration(durationMs)
            }

            return {
                staff_id: staffMember.id,
                staff_name: staffMember.full_name || null,
                staff_email: staffMember.email,
                is_clocked_in: !!clockData,
                clocked_in_at: clockData?.clock_in.toISOString() || null,
                branch_id: clockData?.branch_id || null,
                branch_name: clockData?.branch_name || null,
                duration,
            }
        })

        return success({ staff: staffStatus })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await logError({
            type: 'PAYROLL',
            message: `Error fetching staff clock status: ${errorMessage}`
        })
        return failure(errorMessage || 'Failed to fetch staff clock status')
    }
}

// ============================================================================
// GENERATE QR CODE
// ============================================================================

export async function generateQRCode(
    branchId: string,
    isSingleUse: boolean = false
): Promise<ActionResponse<GenerateQRCodeResult>> {
    let currentUserId: string | undefined

    try {
        // Check authentication
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        currentUserId = currentUser.id

        // Only time clock admins can generate QR codes
        const hasTimeClockAdminAccess = await canManageTimeClock(currentUser)
        if (!hasTimeClockAdminAccess) {
            return failure("Access denied: Time clock admin access required")
        }

        // Get branch info
        const [branch] = await db
            .select({ name: branches.name, code: branches.code })
            .from(branches)
            .where(eq(branches.id, branchId))
            .limit(1)

        if (!branch) {
            return failure("Branch not found")
        }

        // Generate QR code using the utility function
        const qrResult = await generateDailyQRCode(branchId, currentUser.id, isSingleUse)

        const qrDataUrl = await generateQRCodeImage(qrResult.qrCode)

        return success({
            qrCode: qrResult.qrCode,
            qrDataUrl,
            validUntil: qrResult.validUntil.toISOString(),
            branchName: branch.name,
            branchCode: branch.code,
            isSingleUse: qrResult.isSingleUse,
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await logError({
            type: 'SYSTEM',
            message: `Error generating QR code: ${errorMessage}`
        })
        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'SYSTEM',
                message: `Failed to generate QR code for branch ${branchId}: ${errorMessage}`,
                user_id: currentUserId,
            }]
        })
        return failure(errorMessage || 'Failed to generate QR code')
    }
}

// ============================================================================
// GET QR SESSIONS FOR TODAY
// ============================================================================

export async function getQRSessionsForToday(): Promise<ActionResponse<GetQRSessionsResult>> {
    try {
        // Check authentication
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        // Only time clock admins can view QR sessions
        const hasTimeClockAdminAccess = await canManageTimeClock(currentUser)
        if (!hasTimeClockAdminAccess) {
            return failure("Access denied: Time clock admin access required")
        }

        // Get today's date range
        const today = new Date()
        const startOfDay = new Date(today.setHours(0, 0, 0, 0))
        const endOfDay = new Date(today.setHours(23, 59, 59, 999))

        // Query QR sessions with branch info
        const sessions = await db
            .select({
                id: qrSessions.id,
                qr_code: qrSessions.qrCode,
                valid_date: qrSessions.validDate,
                is_active: qrSessions.isActive,
                branch_id: qrSessions.branchId,
                branch_name: branches.name,
                branch_code: branches.code,
                generated_by: qrSessions.generatedBy,
                created_at: qrSessions.createdAt,
            })
            .from(qrSessions)
            .leftJoin(branches, eq(qrSessions.branchId, branches.id))
            .where(
                and(
                    gte(qrSessions.validDate, startOfDay),
                    lte(qrSessions.validDate, endOfDay)
                )
            )
            .orderBy(desc(qrSessions.createdAt))

        const mappedSessions: QRSessionWithBranch[] = sessions.map(session => ({
            id: session.id,
            qr_code: session.qr_code,
            valid_date: session.valid_date.toISOString(),
            is_active: session.is_active,
            branch_id: session.branch_id,
            branch_name: session.branch_name || 'Unknown',
            branch_code: session.branch_code || 'Unknown',
            generated_by: session.generated_by,
            created_at: session.created_at.toISOString(),
        }))

        return success({ sessions: mappedSessions })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await logError({
            type: 'SYSTEM',
            message: `Error fetching QR sessions: ${errorMessage}`
        })
        return failure(errorMessage || 'Failed to fetch QR sessions')
    }
}

// ============================================================================
// LEGACY CLOCK IN (without QR)
// ============================================================================

export async function clockIn(
    staffId: string,
    notes?: string
): Promise<ActionResponse<void>> {
    try {
        // Check admin permissions
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        // Allow self clock-in or admin
        const isSelf = currentUser.id === staffId
        const hasAdminAccess = await canManageTimeClock(currentUser)
        
        if (!isSelf && !hasAdminAccess) {
            return failure("Access denied")
        }

        // Prevent duplicate clock-in
        const [existingActiveEntry] = await db
            .select()
            .from(timeClockEntries)
            .where(
                and(
                    eq(timeClockEntries.staffId, staffId),
                    isNull(timeClockEntries.clockOut)
                )
            )
            .limit(1)

        if (existingActiveEntry) {
            return failure("Already clocked in")
        }

        // Create time clock entry
        await db.insert(timeClockEntries).values({
            staffId,
            clockIn: new Date(),
            notes,
        })

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'OTHER',
                message: `Staff ${staffId} clocked in by ${currentUser.id}`,
                user_id: currentUser.id,
            }]
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error clocking in: ${error instanceof Error ? error.message : String(error)}`
        })
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'OTHER',
                message: `Failed to clock in staff ${staffId}: ${error}`,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to clock in')
    }
}

// ============================================================================
// STAFF SCHEDULE
// ============================================================================

export interface GetStaffScheduleResult {
    schedules: StaffSchedule[]
}

export async function getStaffSchedule(staffId: string): Promise<ActionResponse<GetStaffScheduleResult>> {
    try {
        const schedules = await db
            .select()
            .from(staffSchedules)
            .where(eq(staffSchedules.staffId, staffId))
            .orderBy(asc(staffSchedules.dayOfWeek))

        return success({ schedules: schedules.map(mapScheduleToType) })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching staff schedule: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch schedule')
    }
}

export async function updateStaffSchedule(
    staffId: string,
    schedules: ScheduleInput[]
): Promise<ActionResponse<void>> {
    try {
        // Check permissions
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized")
        }

        // Allow self update or admin
        const isSelf = currentUser.id === staffId
        const hasAdminAccess = await canManageTimeClock(currentUser)

        if (!isSelf && !hasAdminAccess) {
            return failure("Access denied")
        }

        // Use transaction for atomic update
        await db.transaction(async (tx) => {
            // Delete existing schedules
            await tx
                .delete(staffSchedules)
                .where(eq(staffSchedules.staffId, staffId))

            // Insert new schedules
            if (schedules.length > 0) {
                await tx.insert(staffSchedules).values(
                    schedules.map(schedule => ({
                        staffId,
                        dayOfWeek: DAY_NUMBER_TO_NAME[schedule.day_of_week],
                        startTime: schedule.start_time ?? '09:00',
                        endTime: schedule.end_time ?? '17:00',
                        isActive: !schedule.is_off,
                    }))
                )
            }
        })

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'OTHER',
                message: `Schedule updated for staff ${staffId} by ${currentUser.id}`,
                user_id: currentUser.id,
            }]
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error updating staff schedule: ${error instanceof Error ? error.message : String(error)}`
        })
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'OTHER',
                message: `Failed to update schedule for staff ${staffId}: ${error}`,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to update schedule')
    }
}

// ============================================================================
// AVAILABLE STAFF
// ============================================================================

export interface GetAvailableStaffResult {
    staffIds: string[]
}

export async function getAvailableStaff(date: Date = new Date()): Promise<ActionResponse<GetAvailableStaffResult>> {
    try {
        const dayOfWeek = date.getDay()
        const dayName = DAY_NUMBER_TO_NAME[dayOfWeek]
        
        const currentTime = date.toTimeString().slice(0, 5) // HH:MM format

        // Get all active schedules for the day
        const schedules = await db
            .select({
                staffId: staffSchedules.staffId,
                startTime: staffSchedules.startTime,
                endTime: staffSchedules.endTime,
            })
            .from(staffSchedules)
            .where(
                and(
                    eq(staffSchedules.dayOfWeek, dayName),
                    eq(staffSchedules.isActive, true)
                )
            )

        // Filter staff whose current time falls within schedule
        const currentMinutes = timeToMinutes(currentTime)
        const availableStaff = schedules
            .filter(schedule => {
                const startMinutes = timeToMinutes(schedule.startTime)
                const endMinutes = timeToMinutes(schedule.endTime)
                return currentMinutes >= startMinutes && currentMinutes <= endMinutes
            })
            .map(schedule => schedule.staffId)

        // Remove duplicates
        return success({ staffIds: [...new Set(availableStaff)] })
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error fetching available staff: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch available staff')
    }
}
