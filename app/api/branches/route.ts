import { NextResponse } from "next/server"
import { db } from "@/server/db"
import { branches } from "@/server/db/schema"
import { eq } from "drizzle-orm"
import { getCurrentUser, isAdmin } from "@/utils/auth/permissions"
import { createLogs } from "@/server/actions/logs"

export async function GET() {
    const user = await getCurrentUser()
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // Non-admin users should only see active branches
        const isUserAdmin = await isAdmin(user)
        let query = db
            .select()
            .from(branches)
            .orderBy(branches.name)
            .$dynamic()

        // Apply filter for non-admin users
        if (!isUserAdmin) {
            query = query.where(eq(branches.isActive, true))
        }

        const allBranches = await query

        // Transform to proper type with consistent field naming
        const formattedBranches = allBranches.map(row => ({
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

        return NextResponse.json(formattedBranches)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Failed to fetch branches: ${error instanceof Error ? error.message : String(error)}` }] })
        return NextResponse.json(
            { error: "Failed to fetch branches" },
            { status: 500 }
        )
    }
}
