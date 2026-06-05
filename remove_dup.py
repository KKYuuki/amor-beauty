with open('.worktrees/logic-audit-2026-04-23/server/actions/payroll.ts', 'r') as f:
    content = f.read()

old_block = '''const TAX_BRACKETS: TaxBracket[] = [
    { min: 0, max: 10000, rate: 0, name: 'Zero' },
    { min: 10001, max: 30000, rate: 5, name: 'Basic' },
    { min: 30001, max: 50000, rate: 10, name: 'Standard' },
    { min: 50001, max: Infinity, rate: 15, name: 'Higher' },
]

function normalizePayrollPaymentMethod(method: string): string {
    if (method === 'BANK') return 'BANK_TRANSFER'
    return method
}

function calculateTax(grossAmount: number): { rate: number; amount: number; bracket: string } {
    const bracket = TAX_BRACKETS.find(b => grossAmount >= b.min && grossAmount <= b.max)
        || TAX_BRACKETS[TAX_BRACKETS.length - 1]

    return {
        rate: bracket.rate,
        amount: Math.round(grossAmount * bracket.rate / 100),
        bracket: bracket.name,
    }
}

'''

content = content.replace(old_block, '')

with open('.worktrees/logic-audit-2026-04-23/server/actions/payroll.ts', 'w') as f:
    f.write(content)

print('Removed duplicate tax block')
