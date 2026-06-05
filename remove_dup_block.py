with open('.worktrees/logic-audit-2026-04-23/server/actions/payroll.ts', 'r') as f:
    lines = f.readlines()

# Remove lines 2008-2022 (1-indexed) -> indices 2007-2021
new_lines = lines[:2007] + lines[2022:]

with open('.worktrees/logic-audit-2026-04-23/server/actions/payroll.ts', 'w') as f:
    f.writelines(new_lines)

print('Removed duplicate block lines 2008-2022')
