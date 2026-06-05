'use server'

import { db } from "@/server/db"
import { invitations } from "@/server/db/schema/invitations"
import { eq } from "drizzle-orm"
import { getCurrentUser, isAdmin } from "@/utils/auth/permissions"
import { ActionResponse, success, failure } from "@/utils/types/responses"
import { createLogs, logError } from "./logs"

export async function deleteInvitation(invitationId: string): Promise<ActionResponse<void>> {
    try {
        // Check authentication
        const user = await getCurrentUser()
        if (!user) {
            return failure('Not authenticated')
        }

        // Check admin permissions
        const adminCheck = await isAdmin(user)
        if (!adminCheck) {
            return failure('Access denied: Admin required')
        }

        // Check if invitation exists
        const [existingInvitation] = await db
            .select()
            .from(invitations)
            .where(eq(invitations.id, invitationId))
            .limit(1)

        if (!existingInvitation) {
            return failure('Invitation not found')
        }

        // Delete the invitation
        await db.delete(invitations).where(eq(invitations.id, invitationId))

        // Log the action
        createLogs({
            logs: [{
                level: 'INFO',
                type: 'AUTH',
                message: `Invitation deleted: ${invitationId} by ${user.id}`,
            }]
        })

        return success(undefined, 'Invitation deleted successfully')
    } catch (error) {
        await logError({
            type: 'AUTH',
            message: `Error deleting invitation: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to delete invitation')
    }
}
