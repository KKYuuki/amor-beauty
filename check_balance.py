with open('.worktrees/logic-audit-2026-04-23/server/actions/payroll.ts') as f:
    lines = f.readlines()

# Extract lines 2010-2069 (0-indexed: 2009-2068)
func_text = ''.join(lines[2009:2069])

open_braces = 0
i = 0
length = len(func_text)

while i < length:
    ch = func_text[i]
    if ch == '/' and i + 1 < length:
        if func_text[i+1] == '/':
            while i < length and func_text[i] != '\n':
                i += 1
            continue
        elif func_text[i+1] == '*':
            i += 2
            while i < length - 1 and not (func_text[i] == '*' and func_text[i+1] == '/'):
                i += 1
            i += 2
            continue
    if ch == '"' or ch == "'" or ch == '`':
        quote = ch
        i += 1
        while i < length:
            if func_text[i] == '\\':
                i += 2
                continue
            if func_text[i] == quote:
                i += 1
                break
            i += 1
        continue
    if ch == '{':
        open_braces += 1
    elif ch == '}':
        open_braces -= 1
    i += 1

print(f'Brace balance inside createDeduction: {open_braces}')

# Also check the rest of the file after line 2069
rest_text = ''.join(lines[2069:])

open_braces = 0
i = 0
length = len(rest_text)

while i < length:
    ch = rest_text[i]
    if ch == '/' and i + 1 < length:
        if rest_text[i+1] == '/':
            while i < length and rest_text[i] != '\n':
                i += 1
            continue
        elif rest_text[i+1] == '*':
            i += 2
            while i < length - 1 and not (rest_text[i] == '*' and rest_text[i+1] == '/'):
                i += 1
            i += 2
            continue
    if ch == '"' or ch == "'" or ch == '`':
        quote = ch
        i += 1
        while i < length:
            if rest_text[i] == '\\':
                i += 2
                continue
            if rest_text[i] == quote:
                i += 1
                break
            i += 1
        continue
    if ch == '{':
        open_braces += 1
    elif ch == '}':
        open_braces -= 1
    i += 1

print(f'Brace balance in rest of file: {open_braces}')
