import re

with open('.worktrees/logic-audit-2026-04-23/server/actions/payroll.ts') as f:
    content = f.read()

open_braces = 0
i = 0
length = len(content)
current_line = 1
last_zero_line = None
last_negative_line = None

while i < length:
    ch = content[i]
    if ch == '\n':
        current_line += 1
    if ch == '/' and i + 1 < length:
        if content[i+1] == '/':
            while i < length and content[i] != '\n':
                i += 1
            continue
        elif content[i+1] == '*':
            i += 2
            while i < length - 1 and not (content[i] == '*' and content[i+1] == '/'):
                if content[i] == '\n':
                    current_line += 1
                i += 1
            i += 2
            continue
    if ch == '"' or ch == "'" or ch == '`':
        quote = ch
        i += 1
        while i < length:
            if content[i] == '\\':
                i += 2
                continue
            if content[i] == quote:
                i += 1
                break
            if content[i] == '\n':
                current_line += 1
            i += 1
        continue
    if ch == '{':
        open_braces += 1
    elif ch == '}':
        open_braces -= 1
        if open_braces < 0:
            last_negative_line = current_line
            print(f'Negative brace balance at line {current_line}')
            # reset to 0 to continue tracking
            open_braces = 0
    if open_braces == 0:
        last_zero_line = current_line
    i += 1

print(f'Last line with zero balance: {last_zero_line}')
print(f'Last negative line: {last_negative_line}')
print(f'Final balance: {open_braces}')
