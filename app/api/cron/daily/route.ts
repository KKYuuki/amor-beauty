import { NextRequest, NextResponse } from "next/server"
import { db } from "@/server/db"
import { sql } from "drizzle-orm"
import { createLogs } from "@/server/actions/logs"

// ============================================================================
// TYPES
// ============================================================================

interface TaskResult {
    count: number
    details: string[]
}

interface DailyMaintenanceResult {
    success: boolean
    timestamp: string
    tasks: {
        logCleanup: TaskResult & { olderThanDays: number }
        sessionCleanup: TaskResult
        ledgerReconciliation: TaskResult
        payrollReconciliation: TaskResult
    }
    errors: string[]
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verify CRON_SECRET from Authorization header or query parameter
 */
function verifyCronSecret(request: NextRequest): boolean {
    const expectedSecret = process.env.CRON_SECRET

    if (!expectedSecret) {
        console.error("CRON_SECRET environment variable is not set")
        return false
    }

    // Check Authorization header first
    const authHeader = request.headers.get("authorization")
    if (authHeader) {
        const token = authHeader.replace("Bearer ", "")
        if (token === expectedSecret) {
            return true
        }
    }

    // Check query parameter as fallback
    const { searchParams } = new URL(request.url)
    const secretParam = searchParams.get("secret")
    if (secretParam === expectedSecret) {
        return true
    }

    return false
}

// ============================================================================
// TASK FUNCTIONS
// ============================================================================

/**
 * Task 1: Log cleanup (placeholder)
 */
async function performLogCleanup(): Promise<TaskResult & { olderThanDays: number }> {
    const olderThanDays = 90
    const result: TaskResult & { olderThanDays: number } = {
        count: 0,
        details: [],
        olderThanDays,
    }

    try {
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

        // Placeholder for future implementation
        // TODO: Archive/delete logs older than 90 days

        result.details.push(
            `Log cleanup check performed. Cutoff date: ${cutoffDate.toISOString().split("T")[0]} (90 days ago)`
        )
        result.details.push("Archive/delete logic to be implemented")

        await createLogs({
            logs: [{
                level: "INFO",
                type: "SYSTEM",
                message: `Daily maintenance: Log cleanup check performed (90-day cutoff: ${cutoffDate.toISOString().split("T")[0]})`,
            }]
        })

        return result
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        result.details.push(`Error during log cleanup: ${errorMessage}`)
        throw error
    }
}

/**
 * Task 2: Session cleanup (placeholder)
 */
async function performSessionCleanup(): Promise<TaskResult> {
    const result: TaskResult = { count: 0, details: [] }

    try {
        // Placeholder for future implementation
        // TODO: Clean up expired sessions

        result.details.push("Session cleanup check performed")
        result.details.push("Cleanup logic to be implemented")

        await createLogs({
            logs: [{
                level: "INFO",
                type: "SYSTEM",
                message: "Daily maintenance: Session cleanup check performed",
            }]
        })

        return result
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        result.details.push(`Error during session cleanup: ${errorMessage}`)
        throw error
    }
}

/**
 * Task 3: Reconcile transactions against general ledger
 */
async function performLedgerReconciliation(): Promise<TaskResult> {
    const result: TaskResult = { count: 0, details: [] }

    try {
        // Find transactions without REVENUE ledger entries
        interface LedgerRow {
            id: string
            transaction_number: string | null
            status: string
            created_at: Date
        }
        const orphanedTransactions = await db.execute(sql`
            SELECT t.id, t.transaction_number, t.status, t.created_at
            FROM transactions t
            LEFT JOIN general_ledger gl
                ON gl.source_type = 'TRANSACTION'
                AND gl.source_id = t.id
                AND gl.is_voided = false
            WHERE t.status IN ('COMPLETED', 'PARTIAL', 'DOWNPAYMENT_ASSIGNED')
              AND gl.id IS NULL
              AND t.created_at > NOW() - INTERVAL '30 days'
            ORDER BY t.created_at DESC
            LIMIT 100
        `) as unknown as { rows: LedgerRow[] }

        result.count = orphanedTransactions.rows.length

        if (orphanedTransactions.rows.length > 0) {
            result.details.push(
                `WARNING: ${orphanedTransactions.rows.length} completed transactions have no GL entries in last 30 days`
            )
            // Log each orphaned transaction (limit to first 10 to avoid log spam)
            for (const row of orphanedTransactions.rows.slice(0, 10)) {
                result.details.push(
                    `  TXN ${row.transaction_number} (${row.id.slice(0, 8)}...) status=${row.status}`
                )
            }
        } else {
            result.details.push("No orphaned transactions found")
        }

        await createLogs({
            logs: [{
                level: orphanedTransactions.rows.length > 0 ? 'WARN' : 'INFO',
                type: 'SYSTEM',
                message: `Daily reconciliation: ${orphanedTransactions.rows.length} orphaned transactions found`,
            }]
        })

        return result
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        result.details.push(`Error during ledger reconciliation: ${errorMessage}`)
        throw error
    }
}

/**
 * Task 4: Reconcile payroll entries against transactions
 */
async function performPayrollReconciliation(): Promise<TaskResult> {
    const result: TaskResult = { count: 0, details: [] }

    try {
        // Find payroll entries with dangling transaction references
        interface PayrollRow {
            id: string
            staff_id: string | null
            transaction_id: string | null
            payment_status: string | null
        }
        const orphanedPayroll = await db.execute(sql`
            SELECT pe.id, pe.staff_id, pe.transaction_id, pe.payment_status
            FROM payroll_entry pe
            LEFT JOIN transactions t ON t.id = pe.transaction_id
            WHERE pe.transaction_id IS NOT NULL
              AND t.id IS NULL
              AND pe.payment_status != 'CANCELLED'
              AND pe.created_at > NOW() - INTERVAL '30 days'
            LIMIT 50
        `) as unknown as { rows: PayrollRow[] }

        result.count = orphanedPayroll.rows.length

        if (orphanedPayroll.rows.length > 0) {
            result.details.push(
                `WARNING: ${orphanedPayroll.rows.length} payroll entries reference nonexistent transactions`
            )
            for (const row of orphanedPayroll.rows.slice(0, 10)) {
                result.details.push(
                    `  Payroll entry ${row.id.slice(0, 8)}... transaction_id=${row.transaction_id?.slice(0, 8)}... staff=${row.staff_id?.slice(0, 8)}...`
                )
            }
        } else {
            result.details.push("No orphaned payroll entries found")
        }

        await createLogs({
            logs: [{
                level: orphanedPayroll.rows.length > 0 ? 'WARN' : 'INFO',
                type: 'SYSTEM',
                message: `Daily payroll reconciliation: ${orphanedPayroll.rows.length} orphaned payroll entries found`,
            }]
        })

        return result
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        result.details.push(`Error during payroll reconciliation: ${errorMessage}`)
        throw error
    }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
    const startTime = Date.now()
    const timestamp = new Date().toISOString()
    const errors: string[] = []

    // Verify CRON_SECRET
    if (!verifyCronSecret(request)) {
        await createLogs({
            logs: [{
                level: "WARN",
                type: "AUTH",
                message: "Unauthorized attempt to access daily maintenance endpoint",
            }]
        })

        return NextResponse.json(
            { success: false, error: "Unauthorized" },
            { status: 401 }
        )
    }

    // Log start of maintenance
    await createLogs({
        logs: [{
            level: "INFO",
            type: "SYSTEM",
            message: "Daily maintenance started",
        }]
    })

    // Initialize result
    const result: DailyMaintenanceResult = {
        success: true,
        timestamp,
        tasks: {
            logCleanup: { count: 0, details: [], olderThanDays: 90 },
            sessionCleanup: { count: 0, details: [] },
            ledgerReconciliation: { count: 0, details: [] },
            payrollReconciliation: { count: 0, details: [] },
        },
        errors,
    }

    try {
        // Task 1: Log cleanup
        try {
            result.tasks.logCleanup = await performLogCleanup()
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error"
            errors.push(`Log cleanup failed: ${errorMessage}`)
            result.tasks.logCleanup.details.push(`ERROR: ${errorMessage}`)
        }

        // Task 2: Session cleanup
        try {
            result.tasks.sessionCleanup = await performSessionCleanup()
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error"
            errors.push(`Session cleanup failed: ${errorMessage}`)
            result.tasks.sessionCleanup.details.push(`ERROR: ${errorMessage}`)
        }

        // Task 3: Ledger reconciliation
        try {
            result.tasks.ledgerReconciliation = await performLedgerReconciliation()
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error"
            errors.push(`Ledger reconciliation failed: ${errorMessage}`)
            result.tasks.ledgerReconciliation.details.push(`ERROR: ${errorMessage}`)
        }

        // Task 4: Payroll reconciliation
        try {
            result.tasks.payrollReconciliation = await performPayrollReconciliation()
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error"
            errors.push(`Payroll reconciliation failed: ${errorMessage}`)
            result.tasks.payrollReconciliation.details.push(`ERROR: ${errorMessage}`)
        }

        // Mark as unsuccessful if there were any errors
        if (errors.length > 0) {
            result.success = false
        }

        // Calculate duration
        const duration = Date.now() - startTime

        // Log completion
        await createLogs({
            logs: [{
                level: result.success ? "INFO" : "WARN",
                type: "SYSTEM",
                message: `Daily maintenance completed in ${duration}ms. Success: ${result.success}. Tasks: Log cleanup (placeholder), Session cleanup (placeholder), Ledger reconciliation (${result.tasks.ledgerReconciliation.count}), Payroll reconciliation (${result.tasks.payrollReconciliation.count}). Errors: ${errors.length}`,
            }]
        })

        return NextResponse.json(result)
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        errors.push(`Fatal error: ${errorMessage}`)

        await createLogs({
            logs: [{
                level: "ERROR",
                type: "SYSTEM",
                message: `Daily maintenance failed with fatal error: ${errorMessage}`,
            }]
        })

        return NextResponse.json(
            {
                success: false,
                timestamp,
                tasks: result.tasks,
                errors,
            },
            { status: 500 }
        )
    }
}
