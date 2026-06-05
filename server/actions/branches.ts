'use server'

import { db } from '@/server/db'
import { branches } from '@/server/db/schema/branches'
import { user } from '@/server/db/schema/auth'
import { eq, sql } from 'drizzle-orm'
import { getCurrentUser, canManageBranches, isAdmin } from '@/utils/auth/permissions'
import { Branch, CreateBranchPayload, UpdateBranchPayload } from '@/utils/types/branch'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import { createLogs, logError } from './logs'
import { sanitizeText, sanitizeMinimal } from '@/utils/sanitize'

// ============================================================================
// READ OPERATIONS (All authenticated users)
// ============================================================================

export async function getBranches(): Promise<ActionResponse<Branch[]>> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return failure('Not authenticated')
        }

        const rows = await db
            .select()
            .from(branches)
            .where(eq(branches.isActive, true))
            .orderBy(branches.name)

        const data: Branch[] = rows.map(row => ({
            id: row.id,
            created_at: row.createdAt.toISOString(),
            updated_at: row.updatedAt.toISOString(),
            name: row.name,
            code: row.code,
            city: row.city,
            address: row.address,
            phone: row.phone,
            is_active: row.isActive,
            created_by: row.createdBy,
            updated_by: row.updatedBy,
        }))

        return success(data)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error fetching branches: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch branches')
    }
}

export async function getAllBranches(includeInactive = false): Promise<ActionResponse<Branch[]>> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return failure('Not authenticated')
        }

        // Non-admin users should only see active branches
        const isUserAdmin = await isAdmin(user)
        const shouldIncludeInactive = includeInactive && isUserAdmin

        const rows = await db
            .select()
            .from(branches)
            .where(shouldIncludeInactive ? undefined : eq(branches.isActive, true))
            .orderBy(branches.name)

        const data: Branch[] = rows.map(row => ({
            id: row.id,
            created_at: row.createdAt.toISOString(),
            updated_at: row.updatedAt.toISOString(),
            name: row.name,
            code: row.code,
            city: row.city,
            address: row.address,
            phone: row.phone,
            is_active: row.isActive,
            created_by: row.createdBy,
            updated_by: row.updatedBy,
        }))

        return success(data)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error fetching all branches: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch branches')
    }
}

export async function getBranchById(id: string): Promise<ActionResponse<Branch | null>> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return failure('Not authenticated')
        }

        const [row] = await db
            .select()
            .from(branches)
            .where(eq(branches.id, id))
            .limit(1)

        if (!row) {
            return success(null)
        }

        const data: Branch = {
            id: row.id,
            created_at: row.createdAt.toISOString(),
            updated_at: row.updatedAt.toISOString(),
            name: row.name,
            code: row.code,
            city: row.city,
            address: row.address,
            phone: row.phone,
            is_active: row.isActive,
            created_by: row.createdBy,
            updated_by: row.updatedBy,
        }

        return success(data)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error fetching branch: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch branch')
    }
}

export async function getBranchByCode(code: string): Promise<ActionResponse<Branch | null>> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return failure('Not authenticated')
        }

        const [row] = await db
            .select()
            .from(branches)
            .where(eq(branches.code, code))
            .limit(1)

        if (!row) {
            return success(null)
        }

        const data: Branch = {
            id: row.id,
            created_at: row.createdAt.toISOString(),
            updated_at: row.updatedAt.toISOString(),
            name: row.name,
            code: row.code,
            city: row.city,
            address: row.address,
            phone: row.phone,
            is_active: row.isActive,
            created_by: row.createdBy,
            updated_by: row.updatedBy,
        }

        return success(data)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error fetching branch by code: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch branch')
    }
}

// ============================================================================
// WRITE OPERATIONS (Admin only)
// ============================================================================

export async function createBranch(payload: CreateBranchPayload): Promise<ActionResponse<Branch>> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return failure('Not authenticated')
        }

        const canManage = await canManageBranches(user)
        if (!canManage) {
            return failure('Permission denied')
        }

        // Validation
        const sanitizedName = sanitizeText(payload.name)
        const sanitizedCode = payload.code ? sanitizeMinimal(payload.code) : ''
        const sanitizedCity = payload.city ? sanitizeText(payload.city) : ''

        if (!sanitizedName) {
            return failure('Branch name is required')
        }

        if (!sanitizedCode) {
            return failure('Branch code is required')
        }

        if (!sanitizedCity) {
            return failure('Branch city is required')
        }

        // Check for duplicate code
        const [existing] = await db
            .select()
            .from(branches)
            .where(eq(branches.code, sanitizedCode))
            .limit(1)

        if (existing) {
            return failure('Branch code already exists')
        }

        const [row] = await db
            .insert(branches)
            .values({
                name: sanitizedName,
                code: sanitizedCode,
                city: sanitizedCity,
                ...(payload.address && { address: sanitizeText(payload.address) }),
                ...(payload.phone && { phone: sanitizeMinimal(payload.phone) }),
                isActive: true,
                createdBy: user.id,
            })
            .returning()

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `Branch created: ${row.name} (${row.code}) by ${user.id}`,
            }]
        })

        const data: Branch = {
            id: row.id,
            created_at: row.createdAt.toISOString(),
            updated_at: row.updatedAt.toISOString(),
            name: row.name,
            code: row.code,
            city: row.city,
            address: row.address,
            phone: row.phone,
            is_active: row.isActive,
            created_by: row.createdBy,
            updated_by: row.updatedBy,
        }

        return success(data)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error creating branch: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to create branch')
    }
}

export async function updateBranch(
    id: string,
    payload: UpdateBranchPayload
): Promise<ActionResponse<Branch>> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return failure('Not authenticated')
        }

        const canManage = await canManageBranches(user)
        if (!canManage) {
            return failure('Permission denied')
        }

        // Check if branch exists
        const [existing] = await db
            .select()
            .from(branches)
            .where(eq(branches.id, id))
            .limit(1)

        if (!existing) {
            return failure('Branch not found')
        }

        // Check for duplicate code if updating code
        if (payload.code && payload.code !== existing.code) {
            const sanitizedCode = sanitizeMinimal(payload.code)
            const [duplicate] = await db
                .select()
                .from(branches)
                .where(eq(branches.code, sanitizedCode))
                .limit(1)

            if (duplicate) {
                return failure('Branch code already exists')
            }
        }

        const [row] = await db
            .update(branches)
            .set({
                ...(payload.name !== undefined && { name: sanitizeText(payload.name) }),
                ...(payload.code !== undefined && { code: sanitizeMinimal(payload.code) }),
                ...(payload.city !== undefined && { city: sanitizeText(payload.city) }),
                ...(payload.address !== undefined && { address: payload.address ? sanitizeText(payload.address) : null }),
                ...(payload.phone !== undefined && { phone: payload.phone ? sanitizeMinimal(payload.phone) : null }),
                updatedAt: new Date(),
                updatedBy: user.id,
            })
            .where(eq(branches.id, id))
            .returning()

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `Branch updated: ${row.name} (${row.code}) by ${user.id}`,
            }]
        })

        const data: Branch = {
            id: row.id,
            created_at: row.createdAt.toISOString(),
            updated_at: row.updatedAt.toISOString(),
            name: row.name,
            code: row.code,
            city: row.city,
            address: row.address,
            phone: row.phone,
            is_active: row.isActive,
            created_by: row.createdBy,
            updated_by: row.updatedBy,
        }

        return success(data)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error updating branch: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to update branch')
    }
}

export async function archiveBranch(id: string): Promise<ActionResponse<void>> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return failure('Not authenticated')
        }

        const canManage = await canManageBranches(user)
        if (!canManage) {
            return failure('Permission denied')
        }

        const [existing] = await db
            .select()
            .from(branches)
            .where(eq(branches.id, id))
            .limit(1)

        if (!existing) {
            return failure('Branch not found')
        }

        if (!existing.isActive) {
            return failure('Branch is already archived')
        }

        await db
            .update(branches)
            .set({
                isActive: false,
                updatedAt: new Date(),
                updatedBy: user.id,
            })
            .where(eq(branches.id, id))

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `Branch archived: ${existing.name} (${existing.code}) by ${user.id}`,
            }]
        })

        return success(undefined, 'Branch archived successfully')
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error archiving branch: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to archive branch')
    }
}

export async function restoreBranch(id: string): Promise<ActionResponse<void>> {
    try {
        const user = await getCurrentUser()
        if (!user) {
            return failure('Not authenticated')
        }

        const canManage = await canManageBranches(user)
        if (!canManage) {
            return failure('Permission denied')
        }

        const [existing] = await db
            .select()
            .from(branches)
            .where(eq(branches.id, id))
            .limit(1)

        if (!existing) {
            return failure('Branch not found')
        }

        if (existing.isActive) {
            return failure('Branch is already active')
        }

        await db
            .update(branches)
            .set({
                isActive: true,
                updatedAt: new Date(),
                updatedBy: user.id,
            })
            .where(eq(branches.id, id))

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `Branch restored: ${existing.name} (${existing.code}) by ${user.id}`,
            }]
        })

        return success(undefined, 'Branch restored successfully')
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error restoring branch: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to restore branch')
    }
}

export async function deleteBranch(id: string): Promise<ActionResponse<void>> {
    return archiveBranch(id)
}

// ============================================================================
// USER BRANCH ASSIGNMENT (Admin only)
// ============================================================================

export async function assignUserToBranch(
    userId: string,
    branchId: string
): Promise<ActionResponse<void>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser || !(await isAdmin(currentUser))) {
            return failure('Unauthorized: Admin access required')
        }

        // Use atomic array_append operation to prevent race conditions
        // This avoids the read-modify-write pattern
        const result = await db.execute(sql`
            UPDATE ${user} 
            SET branch_ids = array_append(branch_ids, ${branchId})
            WHERE id = ${userId} 
            AND (branch_ids IS NULL OR NOT (${branchId} = ANY(branch_ids)))
            RETURNING id
        `)

        // If no rows updated, user either doesn't exist or already has the branch
        if (result.rowCount === 0) {
            // Check if user exists
            const [targetUser] = await db
                .select({ id: user.id })
                .from(user)
                .where(eq(user.id, userId))
                .limit(1)

            if (!targetUser) {
                return failure('User not found')
            }

            // User exists, so they must already have this branch assigned
            return success(undefined, 'User already assigned to this branch')
        }

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'AUTH',
                message: `User ${userId} assigned to branch ${branchId} by ${currentUser.id}`,
            }]
        })

        return success(undefined, 'Branch assignment successful')
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error assigning user to branch: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to assign user to branch')
    }
}

export async function unassignUserFromBranch(
    userId: string,
    branchId: string
): Promise<ActionResponse<void>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser || !(await isAdmin(currentUser))) {
            return failure('Unauthorized: Admin access required')
        }

        // Use atomic array_remove operation to prevent race conditions
        // This avoids the read-modify-write pattern
        const result = await db.execute(sql`
            UPDATE ${user} 
            SET branch_ids = array_remove(branch_ids, ${branchId})
            WHERE id = ${userId} 
            AND branch_ids IS NOT NULL 
            AND ${branchId} = ANY(branch_ids)
            RETURNING id
        `)

        // If no rows updated, user either doesn't exist or doesn't have the branch
        if (result.rowCount === 0) {
            // Check if user exists
            const [targetUser] = await db
                .select({ id: user.id })
                .from(user)
                .where(eq(user.id, userId))
                .limit(1)

            if (!targetUser) {
                return failure('User not found')
            }

            // User exists, so they must not have this branch assigned
            return success(undefined, 'User is not assigned to this branch')
        }

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'AUTH',
                message: `User ${userId} unassigned from branch ${branchId} by ${currentUser.id}`,
            }]
        })

        return success(undefined, 'Branch unassignment successful')
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error unassigning user from branch: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to unassign user from branch')
    }
}
