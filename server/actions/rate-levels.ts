'use server'

import { eq, asc, sql } from 'drizzle-orm'

import { db } from '@/server/db'
import { rateLevels } from '@/server/db/schema/rate-levels'
import { payrollStaffRate } from '@/server/db/schema/payroll'
import { user } from '@/server/db/schema/auth'
import { createLogs, logError } from '@/server/actions/logs'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import { getCurrentUser, isAdmin } from '@/utils/auth/permissions'
import type {
    RateLevelItem,
    CreateRateLevelPayload,
    UpdateRateLevelPayload,
} from '@/utils/types/payroll'

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

export async function getRateLevels(activeOnly = false): Promise<ActionResponse<RateLevelItem[]>> {
    try {
        const query = activeOnly
            ? db.select().from(rateLevels).where(eq(rateLevels.isActive, true)).orderBy(asc(rateLevels.sortOrder))
            : db.select().from(rateLevels).orderBy(asc(rateLevels.sortOrder))
        const levels = await query
        return success(levels.map((level) => ({
            id: level.id,
            name: level.name,
            slug: level.slug,
            is_active: level.isActive,
            sort_order: level.sortOrder,
            created_at: level.createdAt,
            updated_at: level.updatedAt ?? undefined,
            created_by: level.createdBy ?? undefined,
        })))
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Failed to fetch rate levels: ${error instanceof Error ? error.message : String(error)}`,
        })
        return failure('Failed to fetch rate levels')
    }
}

export async function createRateLevel(payload: CreateRateLevelPayload): Promise<ActionResponse<RateLevelItem>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const admin = await isAdmin(currentUser)
    if (!admin) {
        return failure('Admin access required')
    }

    try {
        const nameCheck = await db
            .select({ id: rateLevels.id, name: rateLevels.name, slug: rateLevels.slug })
            .from(rateLevels)
            .where(sql`LOWER(${rateLevels.name}) = LOWER(${payload.name})`)
            .limit(1)

        if (nameCheck.length > 0) {
            return failure(`A rate level with a similar name already exists: "${nameCheck[0].name}". Use a different name or edit the existing one.`)
        }
    } catch (_error) {
        // Non-critical: continue if this query fails
    }

    const slug = slugify(payload.name)

    // Auto-set sort order to max existing + 1
    let sortOrder = payload.sort_order
    if (sortOrder === undefined || sortOrder === null) {
        try {
            const maxResult = await db
                .select({ maxOrder: sql<number>`COALESCE(MAX(${rateLevels.sortOrder}), 0)` })
                .from(rateLevels)
            sortOrder = Number(maxResult[0]?.maxOrder ?? 0) + 1
        } catch (_e) {
            sortOrder = 0
        }
    }

    try {
        const result = await db.insert(rateLevels).values({
            name: payload.name,
            slug,
            sortOrder,
        }).returning() as unknown as typeof rateLevels.$inferSelect[]
        const newLevel = result[0]
        return success({
            id: newLevel.id,
            name: newLevel.name,
            slug: newLevel.slug,
            is_active: newLevel.isActive,
            sort_order: newLevel.sortOrder,
            created_at: newLevel.createdAt,
        }, 'Rate level created successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Failed to create rate level: ${error instanceof Error ? error.message : String(error)}`,
        })
        return failure('Failed to create rate level')
    }
}

export async function updateRateLevel(payload: UpdateRateLevelPayload): Promise<ActionResponse<RateLevelItem>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const admin = await isAdmin(currentUser)
    if (!admin) {
        return failure('Admin access required')
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (payload.name !== undefined) {
        updates.name = payload.name
        updates.slug = slugify(payload.name)
    }
    if (payload.is_active !== undefined) updates.isActive = payload.is_active
    if (payload.sort_order !== undefined) updates.sortOrder = payload.sort_order

    try {
        const [updated] = await db.update(rateLevels).set(updates).where(eq(rateLevels.id, payload.id)).returning()
        if (!updated) return failure('Rate level not found')
        return success({
            id: updated.id,
            name: updated.name,
            slug: updated.slug,
            is_active: updated.isActive,
            sort_order: updated.sortOrder,
            created_at: updated.createdAt,
            updated_at: updated.updatedAt ?? undefined,
        }, 'Rate level updated successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Failed to update rate level: ${error instanceof Error ? error.message : String(error)}`,
        })
        return failure('Failed to update rate level')
    }
}

export async function deactivateRateLevel(id: string): Promise<ActionResponse<void>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const admin = await isAdmin(currentUser)
    if (!admin) {
        return failure('Admin access required')
    }

    try {
        await db.update(rateLevels).set({ isActive: false, updatedAt: new Date() }).where(eq(rateLevels.id, id))
        return success(undefined, 'Rate level deactivated successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Failed to deactivate rate level: ${error instanceof Error ? error.message : String(error)}`,
        })
        return failure('Failed to deactivate rate level')
    }
}

export async function deleteRateLevel(id: string): Promise<void> {
    const [rateRefs, userRefs] = await Promise.all([
        db.select({ count: sql<number>`COUNT(*)` }).from(payrollStaffRate).where(eq(payrollStaffRate.rateLevelId, id)),
        db.select({ id: user.id }).from(user).where(eq(user.rateLevelId, id)).limit(1),
    ])
    const rateRefCount = Number(rateRefs[0]?.count || 0)
    if (rateRefCount > 0 || userRefs.length > 0) {
        const parts: string[] = []
        if (rateRefCount > 0) parts.push(`${rateRefCount} staff rate(s)`)
        if (userRefs.length > 0) parts.push(`${userRefs.length} staff member(s)`)
        throw new Error(
            `Cannot delete rate level: it is still referenced by ${parts.join(' and ')}. ` +
            `Deactivate the rate level instead, or reassign the references first.`
        )
    }
    try {
        await db.delete(rateLevels).where(eq(rateLevels.id, id))
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'PAYROLL', message: `Failed to delete rate level: ${error}` }] })
        throw new Error('Failed to delete rate level')
    }
}
