"use server"

import { db } from "@/server/db"
import { qrSessions } from "@/server/db/schema"
import type { QRSession } from "@/server/db/schema/timeclock"
import { eq, and, gte, lte, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { toDataURL } from "qrcode"
import { createLogs } from "@/server/actions/logs"

// ============================================================================
// TYPES
// ============================================================================

export interface GenerateQRCodeResult {
    qrCode: string
    validUntil: Date
    qrImageUrl?: string
    isSingleUse: boolean
}

export interface VerifyQRCodeResult {
    valid: boolean
    branchId?: string
    error?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get start and end of a specific date for database queries
 */
function getDateRange(date: Date): { start: Date; end: Date } {
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)

    const end = new Date(date)
    end.setHours(23, 59, 59, 999)

    return { start, end }
}

/**
 * Check if a date is today
 */
function isToday(date: Date): boolean {
    const today = new Date()
    return (
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()
    )
}

/**
 * Format QR code string with prefix, branch ID, nanoid, and timestamp
 * Format: CLK-{branchId.slice(0,8)}-{nanoid(12)}-{timestamp}
 */
function formatQRCode(branchId: string): string {
    const shortBranchId = branchId.slice(0, 8)
    const randomPart = nanoid(12)
    const timestamp = Date.now().toString(36).toUpperCase()
    return `CLK-${shortBranchId}-${randomPart}-${timestamp}`
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Generate a unique QR code for a branch for the current day
 * If a QR code already exists for today and is active, returns the existing one
 *
 * @param branchId - The branch ID to generate QR code for
 * @param generatedBy - The user ID who is generating this QR code
 * @returns Object containing qrCode string and validUntil date, with optional qrImageUrl
 */
export async function generateDailyQRCode(
    branchId: string,
    generatedBy: string,
    isSingleUse: boolean = false
): Promise<GenerateQRCodeResult> {
    try {
        // Get today's date range
        const today = new Date()
        const { start, end } = getDateRange(today)

        // Check if QR code already exists for today
        const existingSessions = await db
            .select()
            .from(qrSessions)
            .where(
                and(
                    eq(qrSessions.branchId, branchId),
                    gte(qrSessions.validDate, start),
                    lte(qrSessions.validDate, end)
                )
            )
            .limit(1)

        if (existingSessions.length > 0 && existingSessions[0].isActive) {
            const existing = existingSessions[0]

            if (!(existing.isSingleUse && existing.timesUsed > 0)) {
                await createLogs({
                    logs: [{
                        level: 'INFO',
                        type: 'SYSTEM',
                        message: `Retrieved existing QR code for branch ${branchId.slice(0, 8)}... on ${today.toISOString().split('T')[0]}`,
                        user_id: generatedBy,
                    }]
                })

                return {
                    qrCode: existing.qrCode,
                    validUntil: end,
                    isSingleUse: existing.isSingleUse,
                }
            }
        }

        // Generate new QR code
        const qrCodeString = formatQRCode(branchId)

        // Insert new QR session
        const [newSession] = await db
            .insert(qrSessions)
            .values({
                branchId,
                validDate: today,
                qrCode: qrCodeString,
                isActive: true,
                isSingleUse,
                timesUsed: 0,
                generatedBy,
            })
            .returning()

        if (!newSession) {
            throw new Error("Failed to create QR session in database")
        }

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `Generated new QR code ${qrCodeString.slice(0, 20)}... for branch ${branchId.slice(0, 8)}...`,
                user_id: generatedBy,
            }]
        })

        return {
            qrCode: newSession.qrCode,
            validUntil: end,
            isSingleUse: newSession.isSingleUse,
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error generating QR code"

        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'SYSTEM',
                message: `Failed to generate QR code for branch ${branchId.slice(0, 8)}...: ${errorMessage}`,
                user_id: generatedBy,
            }]
        })

        throw new Error(`Failed to generate QR code: ${errorMessage}`)
    }
}

/**
 * Generate a QR code image URL for display
 *
 * @param qrCodeString - The QR code string to encode
 * @returns Data URL of the QR code image
 */
export async function generateQRCodeImage(qrCodeString: string): Promise<string> {
    try {
        const dataUrl = await toDataURL(qrCodeString, {
            width: 400,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF',
            },
        })
        return dataUrl
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error generating QR image"

        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'SYSTEM',
                message: `Failed to generate QR code image: ${errorMessage}`,
            }]
        })

        throw new Error(`Failed to generate QR code image: ${errorMessage}`)
    }
}

/**
 * Verify a scanned QR code is valid
 * Checks if QR exists, is active, and is valid for today
 *
 * @param qrCode - The QR code string to verify
 * @returns Object with valid flag, optional branchId, and optional error message
 */
export async function verifyQRCode(qrCode: string): Promise<VerifyQRCodeResult> {
    try {
        // Check if QR exists in database
        const sessions = await db
            .select()
            .from(qrSessions)
            .where(eq(qrSessions.qrCode, qrCode))
            .limit(1)

        if (sessions.length === 0) {
            await createLogs({
                logs: [{
                    level: 'WARN',
                    type: 'SYSTEM',
                    message: `QR code verification failed: Code not found (${qrCode.slice(0, 20)}...)`,
                }]
            })

            return {
                valid: false,
                error: "Invalid QR code: Code not found",
            }
        }

        const session = sessions[0]

        // Check if is_active is true
        if (!session.isActive) {
            await createLogs({
                logs: [{
                    level: 'WARN',
                    type: 'SYSTEM',
                    message: `QR code verification failed: Code is inactive (${qrCode.slice(0, 20)}...)`,
                }]
            })

            return {
                valid: false,
                error: "Invalid QR code: Code has been deactivated",
            }
        }

        // Check if single-use QR has already been consumed
        if (session.isSingleUse && session.timesUsed > 0) {
            await createLogs({
                logs: [{
                    level: 'WARN',
                    type: 'SYSTEM',
                    message: `QR code verification failed: Single-use code already consumed (${qrCode.slice(0, 20)}...)`,
                }]
            })

            return {
                valid: false,
                error: "This QR code has already been used. Please scan a new one.",
            }
        }

        // Check if valid_date is today
        if (!isToday(session.validDate)) {
            await createLogs({
                logs: [{
                    level: 'WARN',
                    type: 'SYSTEM',
                    message: `QR code verification failed: Code expired (${qrCode.slice(0, 20)}...)`,
                }]
            })

            return {
                valid: false,
                error: "Invalid QR code: Code has expired",
            }
        }

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `QR code verified successfully for branch ${session.branchId.slice(0, 8)}...`,
            }]
        })

        return {
            valid: true,
            branchId: session.branchId,
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error verifying QR code"

        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'SYSTEM',
                message: `Error verifying QR code: ${errorMessage}`,
            }]
        })

        return {
            valid: false,
            error: `Verification error: ${errorMessage}`,
        }
    }
}

/**
 * Increment the usage count of a QR code
 * If it's a single-use QR, also deactivates it
 *
 * @param qrCode - The QR code string to increment usage for
 * @returns True if successfully incremented
 */
export async function incrementQRUsage(qrCode: string): Promise<boolean> {
    try {
        const [session] = await db
            .select()
            .from(qrSessions)
            .where(eq(qrSessions.qrCode, qrCode))
            .limit(1)

        if (!session) return false

        if (session.isSingleUse) {
            await db
                .update(qrSessions)
                .set({ isActive: false, timesUsed: sql`${qrSessions.timesUsed} + 1` })
                .where(eq(qrSessions.qrCode, qrCode))
        } else {
            await db
                .update(qrSessions)
                .set({ timesUsed: sql`${qrSessions.timesUsed} + 1` })
                .where(eq(qrSessions.qrCode, qrCode))
        }

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `QR code usage incremented: ${qrCode.slice(0, 20)}... (single-use: ${session.isSingleUse})`,
            }]
        })

        return true
    } catch (error) {
        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'SYSTEM',
                message: `Failed to increment QR usage: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return false
    }
}

/**
 * Get all QR sessions for a specific date
 *
 * @param date - The date to query for
 * @returns Array of QR sessions for that date
 */
export async function getQRSessionsByDate(date: Date): Promise<QRSession[]> {
    try {
        const { start, end } = getDateRange(date)

        const sessions = await db
            .select()
            .from(qrSessions)
            .where(
                and(
                    gte(qrSessions.validDate, start),
                    lte(qrSessions.validDate, end)
                )
            )
            .orderBy(qrSessions.createdAt)

        return sessions
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error fetching QR sessions"

        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'SYSTEM',
                message: `Failed to fetch QR sessions for ${date.toISOString().split('T')[0]}: ${errorMessage}`,
            }]
        })

        throw new Error(`Failed to fetch QR sessions: ${errorMessage}`)
    }
}

/**
 * Deactivate a QR code (e.g., when a new one is generated or manually disabled)
 *
 * @param qrCode - The QR code string to deactivate
 * @returns True if successfully deactivated
 */
export async function deactivateQRCode(qrCode: string): Promise<boolean> {
    try {
        await db
            .update(qrSessions)
            .set({ isActive: false })
            .where(eq(qrSessions.qrCode, qrCode))

        await createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `Deactivated QR code: ${qrCode.slice(0, 20)}...`,
            }]
        })

        return true
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error deactivating QR code"

        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'SYSTEM',
                message: `Failed to deactivate QR code: ${errorMessage}`,
            }]
        })

        return false
    }
}
