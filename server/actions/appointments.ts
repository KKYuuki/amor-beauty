'use server'

import { z } from 'zod'
import { sanitizeText, sanitizeMinimal } from '@/utils/sanitize'
import { db } from '@/server/db'
import {
    appointments,
    tattooDetails,
    shoeDetails,
    piercingDetails,
    appointmentServices,
    user,
    appointmentItems,
    inventory,
    services,
} from '@/server/db/schema'
import { branches } from '@/server/db/schema/branches'
import { eq, and, gte, lte, desc, ne, or, isNull } from 'drizzle-orm'
import { createLogs, logError } from './logs'
import { reserveStock } from './reservations'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import {
    Appointment,
    AppointmentStatus,
    AppointmentType,
    PaymentStatus,
    TattooAppointment,
    ShoeAppointment,
    PiercingAppointment,
    AppointmentItem,
} from '@/utils/types/general'
import { getCurrentUser, canManageAppointments } from '@/utils/auth/permissions'

// ============================================================================
// Zod Schemas
// ============================================================================

const CreateAppointmentSchema = z.object({
    title: z.string().min(1, 'Appointment title is required'),
    client_id: z.string().optional(),
    staff_id: z.string().nullable().optional(),
    branch_id: z.string().optional(),
    time_start: z.date(),
    time_end: z.date(),
    actual_time_start: z.date().optional(),
    actual_time_end: z.date().optional(),
    status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
    notes: z.string().optional(),
    type: z.enum(['TATTOO', 'SHOE', 'PIERCING', 'OTHER']).nullable().optional(),
    is_active: z.boolean().optional(),
    is_walkin: z.boolean().optional(),
    client_name: z.string().optional(),
    client_phone: z.string().optional(),
    client_email: z.string().email('Invalid email address').optional(),
    items: z.array(z.object({
        inventory_id: z.string(),
        quantity: z.number().min(1, 'Quantity must be at least 1'),
    })).optional(),
}).refine((data) => data.time_start < data.time_end, {
    message: 'End time must be after start time',
    path: ['time_end'],
})

const UpdateAppointmentSchema = z.object({
    title: z.string().min(1, 'Appointment title is required').optional(),
    staff_id: z.string().nullable().optional(),
    branch_id: z.string().nullable().optional(),
    time_start: z.date().optional(),
    time_end: z.date().optional(),
    actual_time_start: z.date().optional(),
    actual_time_end: z.date().optional(),
    status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
    notes: z.string().optional(),
    is_active: z.boolean().optional(),
    client_name: z.string().optional().nullable(),
    client_phone: z.string().optional().nullable(),
    client_email: z.string().email('Invalid email address').optional().nullable(),
}).partial().refine(
    (_data) => {
        // If both time_start and time_end are provided, ensure end > start
        if (_data.time_start && _data.time_end) {
            return _data.time_start < _data.time_end
        }
        return true
    },
    {
        message: 'End time must be after start time',
        path: ['time_end'],
    }
).refine(
    () => {
        // If only time_end is provided without time_start, we need current appointment data
        // This will be checked at runtime in the function
        return true
    },
    {
        message: 'Cannot update end time without start time context',
        path: ['time_start'],
    }
)

// ============================================================================
// Double-Booking Prevention
// ============================================================================

/**
 * Checks if a new appointment would overlap with existing appointments for a staff member
 */
async function checkAppointmentOverlap(
    staffId: string,
    timeStart: Date,
    timeEnd: Date,
    excludeId?: string
): Promise<{ hasOverlap: boolean; conflictingAppointment?: typeof appointments.$inferSelect }> {
    const conditions = [
        eq(appointments.staffId, staffId),
        eq(appointments.isActive, true),
        ne(appointments.status, 'CANCELLED'),
        lte(appointments.timeStart, timeEnd),
        gte(appointments.timeEnd, timeStart),
    ]

    if (excludeId) {
        conditions.push(ne(appointments.id, excludeId))
    }

    const overlapping = await db
        .select()
        .from(appointments)
        .where(and(...conditions))
        .limit(1)

    if (overlapping.length > 0) {
        return { hasOverlap: true, conflictingAppointment: overlapping[0] }
    }

    return { hasOverlap: false }
}

// ============================================================================
// Helper Functions
// ============================================================================

async function requireStaffAuth(): Promise<{ userId: string }> {
    const user = await getCurrentUser()
    if (!user) {
        throw new Error('Unauthorized: No user found')
    }
    // All users in the system are staff - role-based check
    const canManage = await canManageAppointments(user)
    if (!canManage) {
        throw new Error('Unauthorized: Staff access required')
    }
    return { userId: user.id }
}

function transformAppointment(raw: typeof appointments.$inferSelect): Appointment {
    return {
        id: raw.id,
        created_at: raw.createdAt,
        title: raw.title,
        client_id: raw.clientId || undefined,
        staff_id: raw.staffId || null,
        branch_id: raw.branchId,
        time_start: raw.timeStart,
        time_end: raw.timeEnd,
        actual_time_start: raw.actualTimeStart || undefined,
        actual_time_end: raw.actualTimeEnd || undefined,
        status: raw.status as AppointmentStatus,
        notes: raw.notes || undefined,
        type: raw.type as AppointmentType | null,
        is_active: raw.isActive,
        is_walkin: raw.isWalkin,
        client_name: raw.clientName || undefined,
        client_phone: raw.clientPhone || undefined,
        client_email: raw.clientEmail || undefined,
        // Payment tracking (Issue #004 fix)
        payment_status: raw.paymentStatus as PaymentStatus,
        downpayment_id: raw.downpaymentId || null,
        downpayment_amount: raw.downpaymentAmount ? Number(raw.downpaymentAmount) : null,
        downpayment_collected_at: raw.downpaymentCollectedAt || null,
    }
}

function transformTattooDetails(raw: typeof tattooDetails.$inferSelect): TattooAppointment {
    return {
        id: raw.id,
        created_at: raw.createdAt,
        design_concept: raw.designConcept,
        body_placement: raw.bodyPlacement,
        size_estimate: raw.sizeEstimate ? Number(raw.sizeEstimate) : undefined,
        is_color: raw.isColor,
        artist_prep_time: Number(raw.artistPrepTime),
        reference_image_id: raw.referenceImageId,
        final_image_id: raw.finalImageId,
    }
}

function transformShoeDetails(raw: typeof shoeDetails.$inferSelect): ShoeAppointment {
    return {
        id: raw.id,
        created_at: raw.createdAt,
        shoe_name: raw.shoeName,
        quantity: Number(raw.quantity),
        drop_off_date: raw.dropOffDate || undefined,
        pick_up_date: raw.pickUpDate || undefined,
        cleaning_service: raw.cleaningService as ShoeAppointment['cleaning_service'],
        add_on_rush: raw.addOnRush,
        add_on_replacement: raw.addOnReplacement,
        add_on_water_repellent: raw.addOnWaterRepellent,
        sole_whitening: raw.soleWhitening as ShoeAppointment['sole_whitening'],
        reglue_service: raw.reglueService as ShoeAppointment['reglue_service'],
        total_cost: Number(raw.totalCost),
    }
}

function transformPiercingDetails(raw: typeof piercingDetails.$inferSelect): PiercingAppointment {
    return {
        id: raw.id,
        created_at: raw.createdAt,
        piercing_location: raw.piercingLocation,
        jewelry_material: raw.jewelryMaterial,
        jewelry_style: raw.jewelryStyle as PiercingAppointment['jewelry_style'],
        previous_piercing_issues: raw.previousPiercingIssues,
        aftercare_instructions: raw.aftercareInstructions || undefined,
    }
}

// ============================================================================
// Business Logic Validation Helpers
// ============================================================================

/**
 * Validate status transitions according to business rules
 * @param currentStatus - Current appointment status
 * @param newStatus - Desired new status
 * @returns Object with valid boolean and optional error message
 */
function validateStatusTransition(
    currentStatus: AppointmentStatus,
    newStatus: AppointmentStatus
): { valid: boolean; message?: string } {
    // Define valid transitions
    const validTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
        PENDING: ['CONFIRMED', 'CANCELLED'],
        CONFIRMED: ['ONGOING', 'CANCELLED'],       // was ['COMPLETED', 'CANCELLED']
        ONGOING: ['COMPLETED', 'CANCELLED'],        // NEW
        COMPLETED: ['CANCELLED'],                    // was [] (terminal); now can cancel for refund
        CANCELLED: ['CONFIRMED', 'PENDING']          // recovery unchanged
    }

    // Same status is always valid (idempotent)
    if (currentStatus === newStatus) {
        return { valid: true }
    }

    const allowed = validTransitions[currentStatus]
    if (!allowed.includes(newStatus)) {
        return {
            valid: false,
            message: `Cannot transition from ${currentStatus} to ${newStatus}. Valid transitions from ${currentStatus}: ${allowed.join(', ') || 'none'}`
        }
    }

    return { valid: true }
}

/**
 * Validate that a staff ID exists and is active
 * @param staffId - The staff ID to validate
 * @returns Object with valid boolean and optional error message
 */
async function validateStaffId(staffId: unknown): Promise<{ valid: boolean; message?: string }> {
    if (!staffId || typeof staffId !== 'string') {
        return { valid: true } // Staff is optional
    }

    try {
        const staffResult = await db
            .select()
            .from(user)
            .where(and(eq(user.id, staffId), eq(user.isActive, true)))
            .limit(1)

        if (!staffResult || staffResult.length === 0) {
            return { valid: false, message: `Staff member with ID ${staffId} not found or is inactive` }
        }

        return { valid: true }
    } catch (error) {
        return { valid: false, message: `Error validating staff: ${error instanceof Error ? error.message : String(error)}` }
    }
}

/**
 * Validate that a branch ID exists
 * @param branchId - The branch ID to validate
 * @returns Object with valid boolean and optional error message
 */
async function validateBranchId(branchId: unknown): Promise<{ valid: boolean; message?: string }> {
    if (!branchId || typeof branchId !== 'string') {
        return { valid: true } // Branch is optional (null allowed)
    }

    try {
        const branchResult = await db
            .select()
            .from(branches)
            .where(eq(branches.id, branchId))
            .limit(1)

        if (!branchResult || branchResult.length === 0) {
            return { valid: false, message: `Branch with ID ${branchId} not found` }
        }

        return { valid: true }
    } catch (error) {
        return { valid: false, message: `Error validating branch: ${error instanceof Error ? error.message : String(error)}` }
    }
}

// ============================================================================
// Query Functions
// ============================================================================

export async function getUserAppointments(userId: string): Promise<ActionResponse<Appointment[]>> {
    try {
        const user = await getCurrentUser()
        if (!user) return failure('Unauthorized')

        const canManage = await canManageAppointments(user)

        let results: { appointment: typeof appointments.$inferSelect; branchName: string | null }[]

        if (canManage) {
            results = await db
                .select({
                    appointment: appointments,
                    branchName: branches.name,
                })
                .from(appointments)
                .leftJoin(branches, eq(appointments.branchId, branches.id))
                .where(eq(appointments.isActive, true))
                .orderBy(desc(appointments.timeStart))
        } else {
            // Non-managing staff can only see their own appointments (assigned as staff)
            results = await db
                .select({
                    appointment: appointments,
                    branchName: branches.name,
                })
                .from(appointments)
                .leftJoin(branches, eq(appointments.branchId, branches.id))
                .where(
                    and(
                        eq(appointments.staffId, userId),
                        eq(appointments.isActive, true)
                    )
                )
                .orderBy(desc(appointments.timeStart))
        }

        return success(results.map(r => {
            const appointment = transformAppointment(r.appointment)
            appointment.branch_name = r.branchName || 'All Branches'
            return appointment
        }))
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error fetching user appointments: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch user appointments')
    }
}

export async function getAllAppointments(branchId?: string | null): Promise<ActionResponse<Appointment[]>> {
    try {
        await requireStaffAuth()

        let whereClause = eq(appointments.isActive, true)

        if (branchId) {
            whereClause = and(
                whereClause,
                or(
                    eq(appointments.branchId, branchId),
                    isNull(appointments.branchId)
                )
            ) as typeof whereClause
        }

        const results = await db
            .select({
                appointment: appointments,
                branchName: branches.name,
            })
            .from(appointments)
            .leftJoin(branches, eq(appointments.branchId, branches.id))
            .where(whereClause)
            .orderBy(desc(appointments.timeStart))

        return success(results.map(r => {
            const appointment = transformAppointment(r.appointment)
            appointment.branch_name = r.branchName || 'All Branches'
            return appointment
        }))
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error fetching all appointments: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch all appointments')
    }
}

export async function getStaffAppointments(staffId: string): Promise<ActionResponse<Appointment[]>> {
    try {
        await requireStaffAuth()

        const results = await db
            .select({
                appointment: appointments,
                branchName: branches.name,
            })
            .from(appointments)
            .leftJoin(branches, eq(appointments.branchId, branches.id))
            .where(
                and(
                    eq(appointments.staffId, staffId),
                    eq(appointments.isActive, true)
                )
            )
            .orderBy(desc(appointments.timeStart))

        return success(results.map(r => {
            const appointment = transformAppointment(r.appointment)
            appointment.branch_name = r.branchName || 'All Branches'
            return appointment
        }))
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error fetching staff appointments: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch staff appointments')
    }
}

export async function getMonthlyAppointments(branchId?: string | null): Promise<ActionResponse<Appointment[]>> {
    try {
        await requireStaffAuth()

        const now = new Date()
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)

        let whereClause = and(
            gte(appointments.timeStart, firstDay),
            lte(appointments.timeStart, lastDay),
            eq(appointments.isActive, true)
        )

        if (branchId) {
            whereClause = and(
                whereClause,
                or(
                    eq(appointments.branchId, branchId),
                    isNull(appointments.branchId)
                )
            ) as typeof whereClause
        }

        const results = await db
            .select({
                appointment: appointments,
                branchName: branches.name,
            })
            .from(appointments)
            .leftJoin(branches, eq(appointments.branchId, branches.id))
            .where(whereClause)
            .orderBy(desc(appointments.timeStart))

        return success(results.map(r => {
            const appointment = transformAppointment(r.appointment)
            appointment.branch_name = r.branchName || 'All Branches'
            return appointment
        }))
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error fetching monthly appointments: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch monthly appointments')
    }
}

export async function getAppointment(appointmentId: string): Promise<ActionResponse<Appointment | null>> {
    try {
        const results = await db
            .select({
                appointment: appointments,
                branchName: branches.name,
            })
            .from(appointments)
            .leftJoin(branches, eq(appointments.branchId, branches.id))
            .where(
                and(
                    eq(appointments.id, appointmentId),
                    eq(appointments.isActive, true)
                )
            )
            .limit(1)

        if (results.length === 0) return success(null)

        const result = results[0]
        const appointment = transformAppointment(result.appointment)
        appointment.branch_name = result.branchName || 'All Branches'

        return success(appointment)
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error fetching appointment: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch appointment')
    }
}

export interface AppointmentWithDetails {
    appointment: Appointment | null
    details: TattooAppointment | ShoeAppointment | PiercingAppointment | null
}

export async function getAppointmentWithDetails(appointmentId: string): Promise<ActionResponse<AppointmentWithDetails>> {
    try {
        const response = await getAppointment(appointmentId)
        if (!response.success) {
            return failure(response.error)
        }

        const appointment = response.data
        if (!appointment || !appointment.type) {
            return success({ appointment, details: null })
        }

        let details: TattooAppointment | ShoeAppointment | PiercingAppointment | null = null

        switch (appointment.type) {
            case 'TATTOO': {
                const tattooResult = await db
                    .select()
                    .from(tattooDetails)
                    .where(eq(tattooDetails.id, appointmentId))
                    .limit(1)
                if (tattooResult.length > 0) {
                    details = transformTattooDetails(tattooResult[0])
                }
                break
            }
            case 'SHOE': {
                const shoeResult = await db
                    .select()
                    .from(shoeDetails)
                    .where(eq(shoeDetails.id, appointmentId))
                    .limit(1)
                if (shoeResult.length > 0) {
                    details = transformShoeDetails(shoeResult[0])
                }
                break
            }
            case 'PIERCING': {
                const piercingResult = await db
                    .select()
                    .from(piercingDetails)
                    .where(eq(piercingDetails.id, appointmentId))
                    .limit(1)
                if (piercingResult.length > 0) {
                    details = transformPiercingDetails(piercingResult[0])
                }
                break
            }
        }

        return success({ appointment, details })
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error fetching appointment with details: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch appointment with details')
    }
}

// ============================================================================
// Mutation Functions
// ============================================================================

export interface AppointmentPayload extends Omit<Appointment, 'id' | 'created_at'> {
    items?: Array<{ inventory_id: string; quantity: number }>
}

export async function createAppointment(
    appointment: AppointmentPayload
): Promise<ActionResponse<Appointment>> {
    const auth = await requireStaffAuth()

    const validated = CreateAppointmentSchema.safeParse(appointment)
    if (!validated.success) {
        const fieldErrors = validated.error.flatten().fieldErrors
        return {
            success: false,
            validationErrors: fieldErrors as Record<string, string[]>,
            error:   'Validation failed',
        }
    }

    try {
        // Validate staff ID if provided
        if (validated.data.staff_id) {
            const staffValidation = await validateStaffId(validated.data.staff_id)
            if (!staffValidation.valid) {
                return {
                    success: false,
                    error: staffValidation.message || 'Invalid staff member',
                }
            }
        }

        // Perform overlap check and insertion in a transaction to prevent race conditions
        const result = await db.transaction(async (tx) => {
            // Check for overlapping appointments within the transaction
            if (validated.data.staff_id) {
                const conditions = [
                    eq(appointments.staffId, validated.data.staff_id),
                    eq(appointments.isActive, true),
                    ne(appointments.status, 'CANCELLED'),
                    lte(appointments.timeStart, validated.data.time_end),
                    gte(appointments.timeEnd, validated.data.time_start),
                ]

                const overlapping = await tx
                    .select()
                    .from(appointments)
                    .where(and(...conditions))
                    .limit(1)

                if (overlapping.length > 0) {
                    const conflicting = overlapping[0]
                    throw new Error(
                        `Staff member already has an appointment from ${conflicting.timeStart.toLocaleString()} to ${conflicting.timeEnd.toLocaleString()}`
                    )
                }
            }

            const [inserted] = await tx
                .insert(appointments)
                .values({
                    title: sanitizeText(validated.data.title),
                    clientId: validated.data.client_id,
                    staffId: validated.data.staff_id,
                    branchId: validated.data.branch_id,
                    timeStart: validated.data.time_start,
                    timeEnd: validated.data.time_end,
                    status: validated.data.status || 'CONFIRMED',
                    notes: validated.data.notes ? sanitizeText(validated.data.notes) : undefined,
                    type: validated.data.type,
                    isActive: validated.data.is_active ?? true,
                    isWalkin: validated.data.is_walkin ?? false,
                    clientName: validated.data.client_name ? sanitizeText(validated.data.client_name) : undefined,
                    clientPhone: validated.data.client_phone ? sanitizeMinimal(validated.data.client_phone) : undefined,
                    clientEmail: validated.data.client_email,
                    createdBy: auth.userId,
                })
                .returning()

            return inserted
        })

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'APPOINTMENT',
                message: `Appointment created: ${result.id} by ${auth.userId}`,
                user_id: auth.userId,
                branch_id: validated.data.branch_id ?? undefined,
            }]
        })

        // Reserve inventory for items if provided
        if (validated.data.items && validated.data.items.length > 0) {
            for (const item of validated.data.items) {
                const reservationResult = await reserveStock(
                    item.inventory_id,
                    result.id,
                    item.quantity
                )
                if (!reservationResult.success) {
                    // Log warning but don't fail - reservation is optional
                    await logError({
                        type: 'APPOINTMENT',
                        message: `Failed to reserve stock for item ${item.inventory_id}: ${reservationResult.error}`,
                        userId: auth.userId,
                    })
                }
            }
        }

        return {
            success: true,
            data: transformAppointment(result),
        }
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error creating appointment: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return {
            success: false,
            error:   error instanceof Error ? error.message : 'Failed to create appointment',
        }
    }
}

export async function updateAppointment(
    appointmentId: string,
    updates: Partial<Appointment>
): Promise<ActionResponse<Appointment>> {
    const auth = await requireStaffAuth()

    const validated = UpdateAppointmentSchema.safeParse(updates)
    if (!validated.success) {
        const fieldErrors = validated.error.flatten().fieldErrors
        return {
            success: false,
            validationErrors: fieldErrors as Record<string, string[]>,
            error:   'Validation failed',
        }
    }

    try {
        // Get current appointment to check for conflicts and validate status transition
        const currentAppointment = await db
            .select()
            .from(appointments)
            .where(eq(appointments.id, appointmentId))
            .limit(1)

        if (!currentAppointment || currentAppointment.length === 0) {
            return {
                success: false,
                error: 'Appointment not found',
            }
        }

        const current = currentAppointment[0]

        // Validate required fields if being updated
        if (validated.data.title !== undefined && !validated.data.title.trim()) {
            return failure('Appointment title is required')
        }

        // Validate status transition if status is being updated
        if (validated.data.status !== undefined) {
            const transitionCheck = validateStatusTransition(
                current.status as AppointmentStatus,
                validated.data.status
            )
            if (!transitionCheck.valid) {
                return {
                    success: false,
                    error: transitionCheck.message || 'Invalid status transition',
                }
            }
        }

        // Validate staff ID if being changed
        if (validated.data.staff_id !== undefined && validated.data.staff_id) {
            const staffValidation = await validateStaffId(validated.data.staff_id)
            if (!staffValidation.valid) {
                return {
                    success: false,
                    error: staffValidation.message || 'Invalid staff member',
                }
            }
        }

        // Validate branch ID if being changed
        if (validated.data.branch_id !== undefined && validated.data.branch_id) {
            const branchValidation = await validateBranchId(validated.data.branch_id)
            if (!branchValidation.valid) {
                return {
                    success: false,
                    error: branchValidation.message || 'Invalid branch',
                }
            }
        }

        // Determine the effective time range (using current values if not being updated)
        const effectiveStartTime = validated.data.time_start || current.timeStart
        const effectiveEndTime = validated.data.time_end || current.timeEnd
        const effectiveStaffId = validated.data.staff_id !== undefined
            ? validated.data.staff_id
            : current.staffId

        // Validate end time is after start time
        if (effectiveStartTime && effectiveEndTime) {
            if (new Date(effectiveEndTime) <= new Date(effectiveStartTime)) {
                return failure('End time must be after start time')
            }
        }

        // Check for overlap if time or staff is being changed
        if (validated.data.time_start || validated.data.time_end || validated.data.staff_id !== undefined) {
            if (effectiveStaffId) {
                const overlapCheck = await checkAppointmentOverlap(
                    effectiveStaffId,
                    new Date(effectiveStartTime),
                    new Date(effectiveEndTime),
                    appointmentId // Exclude current appointment
                )

                if (overlapCheck.hasOverlap) {
                    const conflicting = overlapCheck.conflictingAppointment!
                    return failure(
                        `Staff member already has an appointment from ${conflicting.timeStart.toLocaleString()} to ${conflicting.timeEnd.toLocaleString()}`
                    )
                }
            }
        }

        const updateData: Partial<typeof appointments.$inferInsert> = {
            updatedAt: new Date(),
            updatedBy: auth.userId,
        }

        if (validated.data.title !== undefined) updateData.title = sanitizeText(validated.data.title)
        if (validated.data.staff_id !== undefined) updateData.staffId = validated.data.staff_id
        if (validated.data.branch_id !== undefined) updateData.branchId = validated.data.branch_id
        if (validated.data.time_start !== undefined) updateData.timeStart = validated.data.time_start
        if (validated.data.time_end !== undefined) updateData.timeEnd = validated.data.time_end
        if (validated.data.actual_time_start !== undefined) updateData.actualTimeStart = validated.data.actual_time_start
        if (validated.data.actual_time_end !== undefined) updateData.actualTimeEnd = validated.data.actual_time_end
        if (validated.data.status !== undefined) updateData.status = validated.data.status
        if (validated.data.notes !== undefined) updateData.notes = sanitizeText(validated.data.notes)
        if (validated.data.is_active !== undefined) updateData.isActive = validated.data.is_active
        if (validated.data.client_name !== undefined) updateData.clientName = validated.data.client_name ? sanitizeText(validated.data.client_name) : null
        if (validated.data.client_phone !== undefined) updateData.clientPhone = validated.data.client_phone ? sanitizeMinimal(validated.data.client_phone) : null
        if (validated.data.client_email !== undefined) updateData.clientEmail = validated.data.client_email

        const [result] = await db
            .update(appointments)
            .set(updateData)
            .where(eq(appointments.id, appointmentId))
            .returning()

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'APPOINTMENT',
                message: `Appointment updated: ${appointmentId} by ${auth.userId}`,
                user_id: auth.userId,
                branch_id: current.branchId ?? undefined,
            }]
        })

        return {
            success: true,
            data: transformAppointment(result),
        }
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error updating appointment: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return {
            success: false,
            error:   error instanceof Error ? error.message : 'Failed to update appointment',
        }
    }
}

export async function setAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus
): Promise<ActionResponse<Appointment>> {
    // First get current appointment to check timestamps
    const [current] = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId))
        .limit(1)

    if (!current) {
        return failure('Appointment not found')
    }

    // Build update with auto-timestamps
    const updates: Record<string, unknown> = { status }

    if (status === 'ONGOING' && current.actualTimeStart === null) {
        updates.actual_time_start = new Date()
    }

    if (status === 'COMPLETED' && current.actualTimeEnd === null) {
        updates.actual_time_end = new Date()
    }

    if (status === 'COMPLETED') {
        // Update payment_status based on downpayment presence
        if (current.downpaymentAmount && Number(current.downpaymentAmount) > 0) {
            updates.payment_status = 'DEPOSIT_PAID'
        } else {
            updates.payment_status = 'UNPAID'
        }
    }

    return updateAppointment(appointmentId, updates as Partial<Appointment>)
}

export async function deleteAppointment(appointmentId: string): Promise<ActionResponse<void>> {
    const auth = await requireStaffAuth()

    try {
        await db
            .update(appointments)
            .set({
                isActive: false,
                updatedAt: new Date(),
                updatedBy: auth.userId,
            })
            .where(eq(appointments.id, appointmentId))

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'APPOINTMENT',
                message: `Appointment deleted: ${appointmentId} by ${auth.userId}`,
            }]
        })

        return success(undefined, 'Appointment deleted successfully')
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error deleting appointment: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to delete appointment')
    }
}

export async function getInactiveAppointments(): Promise<ActionResponse<Appointment[]>> {
    try {
        await requireStaffAuth()

        const results = await db
            .select({
                appointment: appointments,
                branchName: branches.name,
            })
            .from(appointments)
            .leftJoin(branches, eq(appointments.branchId, branches.id))
            .where(eq(appointments.isActive, false))
            .orderBy(desc(appointments.timeStart))

        return success(results.map(r => {
            const appointment = transformAppointment(r.appointment)
            appointment.branch_name = r.branchName || 'All Branches'
            return appointment
        }))
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error fetching inactive appointments: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch inactive appointments')
    }
}

export async function restoreAppointment(appointmentId: string): Promise<ActionResponse<void>> {
    const auth = await requireStaffAuth()

    try {
        await db
            .update(appointments)
            .set({
                isActive: true,
                updatedAt: new Date(),
                updatedBy: auth.userId,
            })
            .where(eq(appointments.id, appointmentId))

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'APPOINTMENT',
                message: `Appointment restored: ${appointmentId} by ${auth.userId}`,
            }]
        })

        return success(undefined, 'Appointment restored successfully')
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error restoring appointment: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to restore appointment')
    }
}

// ============================================================================
// Appointment Details Functions
// ============================================================================

export type TattooPayload = Omit<TattooAppointment, 'created_at'>
export type ShoePayload = Omit<ShoeAppointment, 'created_at'>
export type PiercingPayload = Omit<PiercingAppointment, 'created_at'>

export async function createAppointmentDetails(
    type: AppointmentType,
    payload: TattooPayload | ShoePayload | PiercingPayload
): Promise<boolean> {
    await requireStaffAuth()

    try {
        switch (type) {
            case 'TATTOO': {
                const tattooPayload = payload as TattooPayload
                await db.insert(tattooDetails).values({
                    id: tattooPayload.id,
                    designConcept: sanitizeText(tattooPayload.design_concept),
                    bodyPlacement: sanitizeText(tattooPayload.body_placement),
                    sizeEstimate: tattooPayload.size_estimate?.toString(),
                    isColor: tattooPayload.is_color,
                    artistPrepTime: tattooPayload.artist_prep_time.toString(),
                    referenceImageId: tattooPayload.reference_image_id,
                    finalImageId: tattooPayload.final_image_id,
                })
                break
            }
            case 'SHOE': {
                const shoePayload = payload as ShoePayload
                await db.insert(shoeDetails).values({
                    id: shoePayload.id,
                    shoeName: sanitizeText(shoePayload.shoe_name),
                    quantity: shoePayload.quantity.toString(),
                    dropOffDate: shoePayload.drop_off_date,
                    pickUpDate: shoePayload.pick_up_date,
                    cleaningService: shoePayload.cleaning_service,
                    addOnRush: shoePayload.add_on_rush,
                    addOnReplacement: shoePayload.add_on_replacement,
                    addOnWaterRepellent: shoePayload.add_on_water_repellent,
                    soleWhitening: shoePayload.sole_whitening,
                    reglueService: shoePayload.reglue_service,
                    totalCost: shoePayload.total_cost.toString(),
                })
                break
            }
            case 'PIERCING': {
                const piercingPayload = payload as PiercingPayload
                await db.insert(piercingDetails).values({
                    id: piercingPayload.id,
                    piercingLocation: sanitizeText(piercingPayload.piercing_location),
                    jewelryMaterial: sanitizeText(piercingPayload.jewelry_material),
                    jewelryStyle: piercingPayload.jewelry_style,
                    previousPiercingIssues: piercingPayload.previous_piercing_issues,
                    aftercareInstructions: sanitizeText(piercingPayload.aftercare_instructions),
                })
                break
            }
        }

        return true
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error creating appointment details: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return false
    }
}

export async function getAppointmentDetails(
    appointmentId: string,
    type: AppointmentType
): Promise<TattooAppointment | ShoeAppointment | PiercingAppointment | null> {
    try {
        switch (type) {
            case 'TATTOO': {
                const results = await db
                    .select()
                    .from(tattooDetails)
                    .where(eq(tattooDetails.id, appointmentId))
                    .limit(1)
                return results.length > 0 ? transformTattooDetails(results[0]) : null
            }
            case 'SHOE': {
                const results = await db
                    .select()
                    .from(shoeDetails)
                    .where(eq(shoeDetails.id, appointmentId))
                    .limit(1)
                return results.length > 0 ? transformShoeDetails(results[0]) : null
            }
            case 'PIERCING': {
                const results = await db
                    .select()
                    .from(piercingDetails)
                    .where(eq(piercingDetails.id, appointmentId))
                    .limit(1)
                return results.length > 0 ? transformPiercingDetails(results[0]) : null
            }
            default:
                return null
        }
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error fetching appointment details: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return null
    }
}

export async function updateAppointmentDetails(
    appointmentId: string,
    type: AppointmentType,
    updates: Partial<TattooAppointment | ShoeAppointment | PiercingAppointment>
): Promise<boolean> {
    await requireStaffAuth()

    try {
        switch (type) {
            case 'TATTOO': {
                const tattooUpdates = updates as Partial<TattooAppointment>
                const updateData: Partial<typeof tattooDetails.$inferInsert> = {}
                if (tattooUpdates.design_concept !== undefined) updateData.designConcept = sanitizeText(tattooUpdates.design_concept)
                if (tattooUpdates.body_placement !== undefined) updateData.bodyPlacement = sanitizeText(tattooUpdates.body_placement)
                if (tattooUpdates.size_estimate !== undefined) updateData.sizeEstimate = tattooUpdates.size_estimate?.toString()
                if (tattooUpdates.is_color !== undefined) updateData.isColor = tattooUpdates.is_color
                if (tattooUpdates.artist_prep_time !== undefined) updateData.artistPrepTime = tattooUpdates.artist_prep_time.toString()
                if (tattooUpdates.reference_image_id !== undefined) updateData.referenceImageId = tattooUpdates.reference_image_id
                if (tattooUpdates.final_image_id !== undefined) updateData.finalImageId = tattooUpdates.final_image_id

                await db.update(tattooDetails).set(updateData).where(eq(tattooDetails.id, appointmentId))
                break
            }
            case 'SHOE': {
                const shoeUpdates = updates as Partial<ShoeAppointment>
                const updateData: Partial<typeof shoeDetails.$inferInsert> = {}
                if (shoeUpdates.shoe_name !== undefined) updateData.shoeName = sanitizeText(shoeUpdates.shoe_name)
                if (shoeUpdates.quantity !== undefined) updateData.quantity = shoeUpdates.quantity.toString()
                if (shoeUpdates.drop_off_date !== undefined) updateData.dropOffDate = shoeUpdates.drop_off_date
                if (shoeUpdates.pick_up_date !== undefined) updateData.pickUpDate = shoeUpdates.pick_up_date
                if (shoeUpdates.cleaning_service !== undefined) updateData.cleaningService = shoeUpdates.cleaning_service
                if (shoeUpdates.add_on_rush !== undefined) updateData.addOnRush = shoeUpdates.add_on_rush
                if (shoeUpdates.add_on_replacement !== undefined) updateData.addOnReplacement = shoeUpdates.add_on_replacement
                if (shoeUpdates.add_on_water_repellent !== undefined) updateData.addOnWaterRepellent = shoeUpdates.add_on_water_repellent
                if (shoeUpdates.sole_whitening !== undefined) updateData.soleWhitening = shoeUpdates.sole_whitening
                if (shoeUpdates.reglue_service !== undefined) updateData.reglueService = shoeUpdates.reglue_service
                if (shoeUpdates.total_cost !== undefined) updateData.totalCost = shoeUpdates.total_cost.toString()

                await db.update(shoeDetails).set(updateData).where(eq(shoeDetails.id, appointmentId))
                break
            }
            case 'PIERCING': {
                const piercingUpdates = updates as Partial<PiercingAppointment>
                const updateData: Partial<typeof piercingDetails.$inferInsert> = {}
                if (piercingUpdates.piercing_location !== undefined) updateData.piercingLocation = sanitizeText(piercingUpdates.piercing_location)
                if (piercingUpdates.jewelry_material !== undefined) updateData.jewelryMaterial = sanitizeText(piercingUpdates.jewelry_material)
                if (piercingUpdates.jewelry_style !== undefined) updateData.jewelryStyle = piercingUpdates.jewelry_style
                if (piercingUpdates.previous_piercing_issues !== undefined) updateData.previousPiercingIssues = piercingUpdates.previous_piercing_issues
                if (piercingUpdates.aftercare_instructions !== undefined) updateData.aftercareInstructions = sanitizeText(piercingUpdates.aftercare_instructions)

                await db.update(piercingDetails).set(updateData).where(eq(piercingDetails.id, appointmentId))
                break
            }
        }

        return true
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error updating appointment details: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return false
    }
}

export async function deleteAppointmentDetails(
    appointmentId: string,
    type: AppointmentType
): Promise<boolean> {
    await requireStaffAuth()

    try {
        switch (type) {
            case 'TATTOO':
                await db.delete(tattooDetails).where(eq(tattooDetails.id, appointmentId))
                break
            case 'SHOE':
                await db.delete(shoeDetails).where(eq(shoeDetails.id, appointmentId))
                break
            case 'PIERCING':
                await db.delete(piercingDetails).where(eq(piercingDetails.id, appointmentId))
                break
        }
        return true
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error deleting appointment details: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return false
    }
}

// ============================================================================
// Appointment Services Functions
// ============================================================================

export async function getAppointmentServices(appointmentId: string) {
    try {
        const results = await db
            .select({
                appointmentId: appointmentServices.appointmentId,
                serviceId: appointmentServices.serviceId,
                createdAt: appointmentServices.createdAt,
                service: {
                    id: services.id,
                    title: services.title,
                    price: services.price,
                    pricingType: services.pricingType,
                    hourlyRate: services.hourlyRate,
                    isActive: services.isActive,
                }
            })
            .from(appointmentServices)
            .innerJoin(services, eq(appointmentServices.serviceId, services.id))
            .where(eq(appointmentServices.appointmentId, appointmentId))
            .orderBy(desc(appointmentServices.createdAt))

        return results.map(r => ({
            appointment_id: r.appointmentId,
            service_id: r.serviceId,
            created_at: r.createdAt,
            service: {
                id: r.service.id,
                title: r.service.title,
                price: Number(r.service.price),
                pricing_type: r.service.pricingType as 'FIXED' | 'HOURLY',
                hourly_rate: Number(r.service.hourlyRate),
                is_active: r.service.isActive,
            }
        }))
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error fetching appointment services: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return []
    }
}

export async function addServiceToAppointment(
    appointmentId: string,
    serviceId: string
): Promise<ActionResponse<{ id: string }>> {
    const auth = await requireStaffAuth()

    try {
        // Get appointment for branch_id
        const [appointment] = await db
            .select()
            .from(appointments)
            .where(eq(appointments.id, appointmentId))
            .limit(1)

        // Check if service is already added
        const existing = await db
            .select()
            .from(appointmentServices)
            .where(
                and(
                    eq(appointmentServices.appointmentId, appointmentId),
                    eq(appointmentServices.serviceId, serviceId)
                )
            )
            .limit(1)

        if (existing.length > 0) {
            return failure('Service already added to appointment')
        }

        await db.insert(appointmentServices).values({
            appointmentId,
            serviceId,
        })

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'APPOINTMENT',
                message: `Service ${serviceId} added to appointment ${appointmentId} by ${auth.userId}`,
                user_id: auth.userId,
                branch_id: appointment?.branchId ?? undefined,
            }]
        })

        return success({ id: serviceId })
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error adding service to appointment: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return failure('Failed to add service')
    }
}

export async function removeServiceFromAppointment(
    appointmentId: string,
    serviceId: string
): Promise<ActionResponse<boolean>> {
    const auth = await requireStaffAuth()

    try {
        // Get appointment for branch_id
        const [appointment] = await db
            .select()
            .from(appointments)
            .where(eq(appointments.id, appointmentId))
            .limit(1)

        await db
            .delete(appointmentServices)
            .where(
                and(
                    eq(appointmentServices.appointmentId, appointmentId),
                    eq(appointmentServices.serviceId, serviceId)
                )
            )

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'APPOINTMENT',
                message: `Service ${serviceId} removed from appointment ${appointmentId} by ${auth.userId}`,
                user_id: auth.userId,
                branch_id: appointment?.branchId ?? undefined,
            }]
        })

        return success(true)
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error removing service from appointment: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return failure('Failed to remove service')
    }
}

// ============================================================================
// Appointment Items Functions (Inventory)
// ============================================================================

export async function getAppointmentItems(appointmentId: string): Promise<ActionResponse<AppointmentItem[]>> {
    try {
        const items = await db
            .select({
                id: appointmentItems.id,
                appointmentId: appointmentItems.appointmentId,
                inventoryId: appointmentItems.inventoryId,
                quantity: appointmentItems.quantity,
                fluidQuantity: appointmentItems.fluidQuantity,
                // Inventory relation
                inventoryId_col: inventory.id,
                inventoryName: inventory.name,
                inventoryItemCode: inventory.itemCode,
                inventoryUnitPrice: inventory.unitPrice,
                inventorySellingPrice: inventory.sellingPrice,
            })
            .from(appointmentItems)
            .leftJoin(inventory, eq(appointmentItems.inventoryId, inventory.id))
            .where(eq(appointmentItems.appointmentId, appointmentId))

        const mappedItems = items.map(item => ({
            id: item.id,
            appointment_id: item.appointmentId,
            inventory_id: item.inventoryId || undefined,
            quantity: Number(item.quantity),
            fluid_quantity: item.fluidQuantity ? Number(item.fluidQuantity) : undefined,
            inventory: item.inventoryId_col ? {
                id: item.inventoryId_col,
                name: item.inventoryName || 'Unknown',
                item_code: item.inventoryItemCode || undefined,
                unit_price: item.inventoryUnitPrice ? Number(item.inventoryUnitPrice) : 0,
                selling_price: item.inventorySellingPrice ? Number(item.inventorySellingPrice) : undefined,
            } : null,
        }))

        return success(mappedItems)
    } catch (error) {
        await logError({
            type: 'APPOINTMENT',
            message: `Failed to get appointment items: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to get appointment items')
    }
}

export async function addAppointmentItem(
    appointmentId: string,
    itemId: string,
    quantity: number
): Promise<ActionResponse<boolean>> {
    try {
        // Get inventory item
        const [invItem] = await db
            .select()
            .from(inventory)
            .where(eq(inventory.id, itemId))
            .limit(1)

        if (!invItem) {
            await logError({
                type: 'APPOINTMENT',
                message: `Inventory item not found: ${itemId}`
            })
            return failure('Inventory item not found')
        }

        await db.insert(appointmentItems).values({
            appointmentId,
            inventoryId: itemId,
            quantity: String(quantity),
        })

        return success(true)
    } catch (error) {
        await logError({
            type: 'APPOINTMENT',
            message: `Failed to add appointment item: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to add appointment item')
    }
}

export async function updateAppointmentItem(
    appointmentItemId: string,
    quantity: number
): Promise<ActionResponse<boolean>> {
    try {
        await db
            .update(appointmentItems)
            .set({ quantity: String(quantity) })
            .where(eq(appointmentItems.id, appointmentItemId))

        return success(true)
    } catch (error) {
        await logError({
            type: 'APPOINTMENT',
            message: `Failed to update appointment item: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to update appointment item')
    }
}

export async function deleteAppointmentItem(appointmentItemId: string): Promise<ActionResponse<boolean>> {
    try {
        await db.delete(appointmentItems).where(eq(appointmentItems.id, appointmentItemId))
        return success(true)
    } catch (error) {
        await logError({
            type: 'APPOINTMENT',
            message: `Failed to delete appointment item: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to delete appointment item')
    }
}

// ============================================================================
// Walk-in Appointment Functions
// ============================================================================

export interface CreateWalkinAppointmentPayload {
    title: string
    client_name: string
    client_phone?: string
    client_email?: string
    staff_id?: string | null
    time_start: Date
    time_end: Date
    notes?: string
    type: AppointmentType | null
    branch_id?: string | null
    status?: AppointmentStatus
}

export async function createWalkinAppointment(
    payload: CreateWalkinAppointmentPayload
): Promise<{ success: boolean; appointment?: Appointment; message?: string }> {
    const auth = await requireStaffAuth()

    try {
        // Validate required fields
        if (!payload.title.trim()) {
            return { success: false, message: 'Appointment title is required' }
        }

        if (!payload.client_name.trim()) {
            return { success: false, message: 'Client name is required' }
        }

        if (!payload.type) {
            return { success: false, message: 'Appointment type is required' }
        }

        if (payload.time_start >= payload.time_end) {
            return { success: false, message: 'End time must be after start time' }
        }

        // Validate staff ID if provided
        if (payload.staff_id) {
            const staffValidation = await validateStaffId(payload.staff_id)
            if (!staffValidation.valid) {
                return { success: false, message: staffValidation.message || 'Invalid staff member' }
            }
        }

        // Perform overlap check and insertion in a transaction to prevent race conditions
        const result = await db.transaction(async (tx) => {
            // Check for overlapping appointments within the transaction
            if (payload.staff_id) {
                const conditions = [
                    eq(appointments.staffId, payload.staff_id),
                    eq(appointments.isActive, true),
                    ne(appointments.status, 'CANCELLED'),
                    lte(appointments.timeStart, payload.time_end),
                    gte(appointments.timeEnd, payload.time_start),
                ]

                const overlapping = await tx
                    .select()
                    .from(appointments)
                    .where(and(...conditions))
                    .limit(1)

                if (overlapping.length > 0) {
                    const conflicting = overlapping[0]
                    throw new Error(
                        `Staff member already has an appointment from ${conflicting.timeStart.toLocaleString()} to ${conflicting.timeEnd.toLocaleString()}`
                    )
                }
            }

            const [inserted] = await tx
                .insert(appointments)
                .values({
                    title: sanitizeText(payload.title),
                    clientName: sanitizeText(payload.client_name),
                    clientPhone: payload.client_phone ? sanitizeMinimal(payload.client_phone) : undefined,
                    clientEmail: payload.client_email,
                    staffId: payload.staff_id,
                    timeStart: payload.time_start,
                    timeEnd: payload.time_end,
                    notes: payload.notes ? sanitizeText(payload.notes) : undefined,
                    type: payload.type,
                    status: payload.status || 'CONFIRMED', // Walk-ins are confirmed immediately
                    isActive: true,
                    isWalkin: true,
                    createdBy: auth.userId,
                    branchId: payload.branch_id,
                })
                .returning()

            return inserted
        })

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'APPOINTMENT',
                message: `Walk-in appointment created: ${result.id} by ${auth.userId}`,
            }]
        })

        return {
            success: true,
            appointment: transformAppointment(result),
        }
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error creating walk-in appointment: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to create walk-in appointment'
        }
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

export async function getUnpaidAppointments(): Promise<ActionResponse<Appointment[]>> {
    try {
        await requireStaffAuth()

        // Get completed appointments that might need payment tracking
        const results = await db
            .select()
            .from(appointments)
            .where(
                and(
                    eq(appointments.status, 'COMPLETED'),
                    eq(appointments.isActive, true)
                )
            )
            .orderBy(desc(appointments.timeStart))

        return success(results.map(transformAppointment))
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error fetching unpaid appointments: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch unpaid appointments')
    }
}

export async function getLatestConfirmedAppointmentBetweenUsers(
    userId1: string,
    userId2: string
): Promise<ActionResponse<Appointment | null>> {
    try {
        const results = await db
            .select()
            .from(appointments)
            .where(
                and(
                    eq(appointments.status, 'CONFIRMED'),
                    eq(appointments.isActive, true),
                    or(
                        and(
                            eq(appointments.clientId, userId1),
                            eq(appointments.staffId, userId2)
                        ),
                        and(
                            eq(appointments.clientId, userId2),
                            eq(appointments.staffId, userId1)
                        )
                    )
                )
            )
            .orderBy(desc(appointments.timeStart))
            .limit(1)

        return success(results.length > 0 ? transformAppointment(results[0]) : null)
    } catch (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Error fetching latest appointment: ${error instanceof Error ? error.message : String(error)}`,
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch latest appointment')
    }
}
