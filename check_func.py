import re

with open('.worktrees/logic-audit-2026-04-23/server/actions/payroll.ts') as f:
    lines = f.readlines()

# Extract lines 2010-2069 (0-indexed: 2009-2068)
func_lines = lines[2009:2069]

open_braces = 0
for i, line in enumerate(func_lines, 2010):
    for ch in line:
        if ch == '"' or ch == "'" or ch == '`':
            # skip to end of string (simplified)
            continue
        if ch == '{':
            open_braces += 1
        elif ch == '}':
            open_braces -= 1
    print(f'{2010+i}: {line.rstrip()} -> balance {open_braces}')

print(f'Final balance inside createDeduction (rough): {open_braces}')
