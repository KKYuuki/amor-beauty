# Package.json Scripts Audit

**Date:** 2026-03-23  
**Audited by:** opencode  
**Status:** Complete

---

## Executive Summary

All scripts in package.json have been audited. Found 1 issue with redundant flags and identified 3 missing scripts that should be added for better developer experience.

---

## Current Scripts Inventory

| Script | Command | Status | Notes |
|--------|---------|--------|-------|
| `dev` | `next dev --turbopack --experimental-https` | ✅ Working | Development server with HTTPS |
| `build` | `next build --turbopack` | ✅ Working | Production build |
| `start` | `next start` | ✅ Working | Production server |
| `lint` | `eslint` | ✅ Working | ESLint 9 with flat config |
| `merge` | `git as-work && git checkout prod...` | ✅ Working | Git workflow for deployment |
| `invite` | `bun run scripts/generate-invite.ts` | ✅ Working | Creates user invitations |
| `db:generate` | `drizzle-kit generate --out ./drizzle` | ⚠️ Redundant flag | --out is already in drizzle.config.ts |
| `db:push` | `drizzle-kit push` | ✅ Working | Push schema changes |
| `db:pull` | `drizzle-kit pull --out ./drizzle` | ✅ Working | Pull/introspect from database |
| `db:drop` | `drizzle-kit drop` | ✅ Working | Drop tables |
| `seed` | `bun run scripts/seed-database.ts` | ✅ Working | Seeds default data |
| `setup` | `bun run scripts/setup-database.ts` | ✅ Working | Full database setup |

---

## Script Verification Results

### Development Scripts

- ✅ `dev`: Next.js 15 with Turbopack and HTTPS
- ✅ `build`: Turbopack-enabled build
- ✅ `start`: Standard Next.js production server
- ✅ `lint`: ESLint 9 with flat config support

### Database Scripts

All drizzle-kit commands verified:
- ✅ `generate`: Creates migration files
- ✅ `push`: Applies schema changes
- ✅ `pull`: Introspects database (alias for `introspect`)
- ✅ `drop`: Drops tables

### Utility Scripts

- ✅ `invite`: Interactive script for creating user invitations
- ✅ `seed`: Seeds settings, payroll rates, and accounting categories
- ✅ `setup`: Orchestrates push → seed → create admin

---

## Issues Found

### Issue #1: Redundant --out Flag

**Location:** `db:generate` and `db:pull` scripts

**Problem:**
Both scripts include `--out ./drizzle` flag, but this is already configured in `drizzle.config.ts`:

```typescript
export default defineConfig({
    out: './drizzle',  // Already defined here
    // ...
});
```

**Impact:** Low - Works but redundant

**Recommendation:** Remove `--out ./drizzle` from these scripts to avoid confusion.

---

## Missing Scripts (Recommended Additions)

### 1. `db:migrate` - Run Pending Migrations

**Command:** `drizzle-kit migrate`

**Purpose:** Apply pending migrations (different from `push` which syncs schema directly)

**When to use:**
- After pulling migrations from version control
- When deploying to production
- When `db:generate` created new migration files

### 2. `db:studio` - Open Drizzle Studio

**Command:** `drizzle-kit studio`

**Purpose:** Visual database browser and editor

**When to use:**
- Exploring database data
- Making quick edits to records
- Debugging data issues

### 3. `typecheck` - TypeScript Type Checking

**Command:** `tsc --noEmit`

**Purpose:** Run TypeScript compiler without emitting files

**When to use:**
- Pre-commit hooks
- CI/CD pipelines
- Before building to catch type errors

---

## Script Dependencies Verification

### scripts/generate-invite.ts
- ✅ Imports: `@inquirer/prompts`, `../server/db/index`, `crypto`, `dotenv`
- ✅ Environment: Requires `.env.local` with DATABASE_URL
- ✅ File paths: Valid relative imports

### scripts/seed-database.ts
- ✅ Imports: `../server/db/index`, `drizzle-orm`, schema files
- ✅ Environment: Requires `.env.local` with DATABASE_URL
- ✅ Database: References `settings`, `payroll_staff_rate`, `accounting_category` tables

### scripts/setup-database.ts
- ✅ Imports: `child_process`, `./generate-invite`, `./seed-database`
- ✅ Environment: Requires `.env.local`
- ✅ Orchestration: Calls `db:push`, `seedDatabase()`, `createInvitation()`

---

## Recommendations

### High Priority
1. **Add `typecheck` script** - Essential for CI/CD and type safety
2. **Add `db:studio` script** - Improves developer experience

### Medium Priority
3. **Add `db:migrate` script** - Completes the migration workflow
4. **Remove redundant `--out` flags** - Clean up `db:generate` and `db:pull`

### Low Priority
5. **Consider adding `db:check`** - Validates schema consistency
6. **Consider adding script categories** - Group related scripts

---

## Script Organization Suggestion

```json
{
  "scripts": {
    "dev": "next dev --turbopack --experimental-https",
    "build": "next build --turbopack",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:pull": "drizzle-kit pull",
    "db:drop": "drizzle-kit drop",
    "db:studio": "drizzle-kit studio",
    
    "seed": "bun run scripts/seed-database.ts",
    "setup": "bun run scripts/setup-database.ts",
    "invite": "bun run scripts/generate-invite.ts",
    
    "merge": "git as-work && git checkout prod && git merge dev && git push origin prod && git checkout dev && git as-personal"
  }
}
```

---

## Action Items

- [x] Audit all existing scripts
- [x] Verify script dependencies
- [x] Identify missing scripts
- [x] Document findings
- [ ] Update package.json (in separate commit)
- [ ] Test updated scripts

---

## Appendix: Available Scripts in /scripts Directory

| Script | Purpose |
|--------|---------|
| `generate-invite.ts` | Create user invitations |
| `seed-database.ts` | Seed default data |
| `setup-database.ts` | Full database setup |
| `generate-invite-quick.ts` | Quick invitation (no prompts) |
| `check-schema.ts` | Verify database schema |
| `check-data.ts` | Check database data integrity |
| `test-auth.ts` | Test authentication flows |
| `test-db-connection.ts` | Test database connectivity |
| `add-missing-columns.ts` | Migration helper |
| `fix-schema.ts` | Schema repair utilities |
| `add-2fa-column.ts` | 2FA migration |
| `check-action-types.ts` | Type checking utilities |
| `check-invitations.ts` | Invitation validation |
| `check-all-tables.ts` | Table existence check |
| `apply-invitations-migration.ts` | Apply specific migration |
| `test-rate-limit.ts` | Rate limiting tests |
| `test-invite-flow.ts` | Test invitation flow |

**Note:** Scripts not referenced in package.json are utility/debug scripts for manual use.

---

## Testing Commands

```bash
# Verify Next.js commands
bun run dev --help
bun run build --help

# Verify drizzle-kit commands
bunx drizzle-kit --help
bunx drizzle-kit generate --help
bunx drizzle-kit migrate --help
bunx drizzle-kit studio --help

# Verify TypeScript
bunx tsc --version

# Run typecheck (after adding script)
bun run typecheck
```

---

**End of Audit Report**
