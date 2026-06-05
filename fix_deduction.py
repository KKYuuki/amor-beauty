with open('.worktrees/logic-audit-2026-04-23/server/actions/payroll.ts', 'r') as f:
    content = f.read()

old = '''export async function createDeduction(
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

    const advanceValidation = CreateAdvanceSchema.safeParse({ userId, amount, reason })
    if (!advanceValidation.success) {
        return failure(advanceValidation.error.issues.map(i => i.message).join(', '))
    }'''

new = '''export async function createDeduction(
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
    }'''

content = content.replace(old, new)

with open('.worktrees/logic-audit-2026-04-23/server/actions/payroll.ts', 'w') as f:
    f.write(content)

print('Fixed createDeduction in worktree')
