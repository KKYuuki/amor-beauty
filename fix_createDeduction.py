with open('.worktrees/logic-audit-2026-04-23/server/actions/payroll.ts', 'r') as f:
    content = f.read()

old_func = '''export async function createDeduction(
    userId: string,
    amount: number,
    reason: string,
    type: 'DEDUCTION' | 'ADJUSTMENT' = 'DEDUCTION'
): Promise<ActionResponse<Deduction>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
        return failure('Unauthorized')
    }

    const admin = await isAdmin(currentUser)
    if (!admin) {
        return failure('Admin access required')
    }

    const deductionValidation = CreateDeductionSchema.safeParse({ userId, amount, reason, type })
    if (!deductionValidation.success) {
        return failure(deductionValidation.error.issues.map(i => i.message).join(', '))
    }

    try {
        if (!userId || amount <= 0) {
            return failure('Valid user ID and positive amount are required')
        }

        const [deduction] = await db
            .insert(payrollDeductions)
            .values({
                userId,
                type,
                amount,
                reason,
                status: 'PENDING',
            })
            .returning()

        const data: Deduction = {
            id: deduction.id,
            user_id: deduction.userId,
            type: deduction.type as 'ADVANCE' | 'DEDUCTION' | 'ADJUSTMENT',
            amount: deduction.amount,
            reason: deduction.reason || undefined,
            status: deduction.status as 'PENDING' | 'DEDUCTED' | 'CANCELLED',
            created_at: deduction.createdAt,
            deducted_at: deduction.deductedAt || undefined,
        }

        createLogs({
            logs: [
                {
                    level: 'INFO',
                    type: 'PAYROLL',
                    message: `Deduction created: ${deduction.id} for user ${userId} amount ${amount} type ${type} by ${currentUser.id}`,
                },
            ],
        })

        return success(data, 'Deduction created successfully')
    } catch (error) {
        await logError({
            type: 'PAYROLL',
            message: `Error creating deduction: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to create deduction')
    }
}'''

# Find the start of the old function
start = content.find('export async function createDeduction(')
if start == -1:
    print('Function not found')
else:
    # Find the matching end brace for the function
    brace_count = 0
    i = start
    length = len(content)
    found_first_brace = False
    while i < length:
        ch = content[i]
        if ch == '{':
            brace_count += 1
            found_first_brace = True
        elif ch == '}':
            brace_count -= 1
        if found_first_brace and brace_count == 0:
            end = i + 1
            break
        i += 1
    else:
        print('Could not find end of function')
        exit(1)

    content = content[:start] + old_func + content[end:]
    with open('.worktrees/logic-audit-2026-04-23/server/actions/payroll.ts', 'w') as f:
        f.write(content)
    print('Replaced createDeduction function')
