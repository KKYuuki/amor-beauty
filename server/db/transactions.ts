import { db } from './index'
import { createLogs } from '@/server/actions/logs'
import { ActionResponse } from '@/utils/types/responses'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import { ExtractTablesWithRelations } from 'drizzle-orm'

export type TransactionClient = PgTransaction<
    NodePgQueryResultHKT,
    Record<string, never>,
    ExtractTablesWithRelations<Record<string, never>>
>

export interface TransactionContext {
    action: 'APPOINTMENT' | 'INVENTORY' | 'SYSTEM' | 'AUTH' | 'ACCOUNTING' | 'PAYROLL' | 'OTHER'
    userId?: string
}

export async function withTransaction<T>(
    operations: (tx: TransactionClient) => Promise<T>,
    context: TransactionContext,
    onCommit?: () => void | Promise<void>
): Promise<ActionResponse<T>> {
    try {
        const result = await db.transaction(async (tx) => {
            return await operations(tx as TransactionClient)
        })

        if (onCommit) {
            try {
                await onCommit()
            } catch (postCommitError) {
                await createLogs({
                    logs: [{
                        level: 'WARN',
                        type: context.action,
                        message: `Post-commit callback error: ${postCommitError instanceof Error ? postCommitError.message : String(postCommitError)}`,
                        user_id: context.userId
                    }]
                })
            }
        }

        return { success: true, data: result }
    } catch (error) {
        await createLogs({
            logs: [{
                level: 'ERROR',
                type: context.action,
                message: `Transaction failed: ${error instanceof Error ? error.message : String(error)}`,
                user_id: context.userId
            }]
        })
        return { success: false, error: `Operation failed: ${error instanceof Error ? error.message : String(error)}` }
    }
}