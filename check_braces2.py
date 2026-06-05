import re

with open('.worktrees/logic-audit-2026-04-23/server/actions/payroll.ts') as f:
    content = f.read()

# Simple parser that ignores braces inside strings and comments
open_braces = 0
i = 0
length = len(content)
current_line = 1
target_line = 2069

while i < length:
    ch = content[i]
    if ch == '\n':
        current_line += 1
        if current_line > target_line:
            break
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
                    if current_line > target_line:
                        break
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
                if current_line > target_line:
                    break
            i += 1
        continue
    if ch == '{':
        open_braces += 1
    elif ch == '}':
        open_braces -= 1
    i += 1

print(f'Open braces before line {target_line + 1}: {open_braces}')
