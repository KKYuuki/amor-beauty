// TODO: Migrate to Drizzle in Task 7
import DashboardClient, { DashboardData } from "./dashboardClient"
import { UserProfile } from "@/utils/types/auth"
import { getCurrentUser } from "@/utils/auth/permissions"
import { redirect } from "next/navigation"
import { getInventory } from "@/server/actions/inventory"

import { getTodaySummary } from "@/server/actions/transactions"
import { getFinancialMetrics } from "@/server/actions/metrics"
import { createLogs } from "@/server/actions/logs"

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
    // Check auth - redirect if not logged in
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        redirect("/auth")
    }

    // Fetch real dashboard data based on user role
    let initialData: DashboardData = {}

    try {
        // Fetch all data types in parallel regardless of role.
        // The client component dispatches to the correct dashboard view.
        const isAdmin = currentUser.role === "admin"

        const [inventory, dailySales, financialMetrics] =
            await Promise.all([
                getInventory(),
                isAdmin ? getTodaySummary() : Promise.resolve(null),
                isAdmin ? getFinancialMetrics() : Promise.resolve(null),
            ])

        initialData = {
            // Unified shape — all views available, client decides what to use
            admin: isAdmin
                ? {
                      inventory: inventory || [],
                      dailySales: dailySales?.success && dailySales.data
                          ? dailySales.data
                          : { totalRevenue: 0, completedCount: 0, pendingCount: 0, itemsSold: 0, servicesRendered: 0 },
                      financialMetrics:
                          financialMetrics?.success && financialMetrics.data
                              ? financialMetrics.data
                              : {
                                    revenue: 0,
                                    transactions: 0,
                                    averageTicket: 0,
                                },
                  }
                : undefined,
            staff: !isAdmin
                ? {
                      inventory: inventory || [],
                      dailySales: { totalRevenue: 0, completedCount: 0, pendingCount: 0, itemsSold: 0, servicesRendered: 0 },
                  }
                : undefined,
        }
    } catch (error) {
        // Log error but still render dashboard with empty data
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Failed to fetch dashboard data: ${error instanceof Error ? error.message : String(error)}` }] })
    }

    return (
        <DashboardClient
            initialData={initialData}
            userProfile={currentUser as UserProfile}
        />
    )
}
