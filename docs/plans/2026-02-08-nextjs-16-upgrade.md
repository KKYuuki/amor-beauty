# Next.js 16 Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade Inksight RDMD from Next.js 15.5.9 to Next.js 16.1.6, migrating all breaking changes and leveraging new features.

**Architecture:** This is a tattoo studio management application using Next.js App Router with Supabase for backend, TypeScript strict mode, and Tailwind CSS 4. The upgrade requires updating dependencies, migrating middleware to proxy, converting async params, and updating configuration.

**Tech Stack:** Next.js 16.1.6, React 19.2, TypeScript 5+, Bun 1.1.38, Supabase, Turbopack (default in v16)

---

## Pre-Upgrade Checklist

- [ ] Node.js version is 20.9+ (required for Next.js 16)
- [ ] TypeScript version is 5.1+ (already satisfied)
- [ ] Current application builds successfully with `bun run build`
- [ ] All tests pass (manual integration tests)
- [ ] Git working tree is clean

---

## Task 1: Create Upgrade Branch

**Files:**
- N/A (git operations only)

**Step 1: Verify clean working tree**

Run: `git status`
Expected: `nothing to commit, working tree clean`

**Step 2: Create feature branch**

```bash
git checkout -b feat/nextjs-16-upgrade
```

**Step 3: Verify branch created**

Run: `git branch --show-current`
Expected: `feat/nextjs-16-upgrade`

---

## Task 2: Upgrade Core Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Update Next.js and React packages**

Run:
```bash
bun add next@16.1.6 react@19.2.0 react-dom@19.2.0
```

**Step 2: Update ESLint config**

Run:
```bash
bun add -D eslint-config-next@16.1.6
```

**Step 3: Verify package.json updates**

Run: `grep '"next":' package.json`
Expected: `"next": "16.1.6"` (or similar pinned version)

**Step 4: Run fresh install**

```bash
bun install
```

**Step 5: Commit dependency updates**

```bash
git add package.json bun.lockb
git commit -m "chore: upgrade next.js to 16.1.6 and react to 19.2"
```

---

## Task 3: Rename middleware.ts to proxy.ts

**Files:**
- Rename: `middleware.ts` -> `proxy.ts`
- Modify: `proxy.ts` (rename exported function)

**Step 1: Rename the middleware file**

```bash
mv middleware.ts proxy.ts
```

**Step 2: Update function export in proxy.ts**

**Before:**
```typescript
export async function middleware(request: NextRequest) {
```

**After:**
```typescript
export async function proxy(request: NextRequest) {
```

**Step 3: Verify file renamed and function updated**

Run: `grep "export async function proxy" proxy.ts`
Expected: `export async function proxy(request: NextRequest) {`

**Step 4: Commit the middleware to proxy migration**

```bash
git add middleware.ts proxy.ts
git commit -m "refactor: rename middleware to proxy for Next.js 16"
```

---

## Task 4: Migrate Async params in Dynamic Routes

**Files:**
- Modify: `app/share/view/[id]/page.tsx`

**Step 1: Update the ShareViewPage component to use async params**

**Before (lines 6-11):**
```typescript
export default async function ShareViewPage({
    params,
}: {
    params: { id: string }
}) {
    const { id } = params
```

**After:**
```typescript
export default async function ShareViewPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
```

**Step 2: Verify the change**

Run: `grep "Promise<{ id: string }>" app/share/view/[id]/page.tsx`
Expected: `params: Promise<{ id: string }>`

**Step 3: Commit the async params migration**

```bash
git add app/share/view/[id]/page.tsx
git commit -m "refactor: migrate params to async for Next.js 16"
```

---

## Task 5: Update next.config.ts

**Files:**
- Modify: `next.config.ts`

**Step 1: Review and update configuration**

The current config uses `experimental.serverActions.bodySizeLimit`. In Next.js 16, Server Actions are stable but the bodySizeLimit config location remains the same. 

Turbopack is now default, so the `--turbopack` flags can be removed from scripts (handled in Task 7).

**Current config is compatible. No changes required to next.config.ts itself.**

**Step 2: Verify config is valid**

Run: `cat next.config.ts`
Expected: Config should have valid TypeScript syntax with no deprecated options.

**Step 3: (Optional) Add React Compiler support**

If you want to enable the React Compiler for automatic memoization, add:

```typescript
const nextConfig: NextConfig = {
  reactCompiler: true,  // Optional: Enable React Compiler
  // ... existing config
}
```

Note: This requires installing `babel-plugin-react-compiler`:
```bash
bun add -D babel-plugin-react-compiler
```

**Recommendation:** Skip React Compiler initially to avoid increased build times. Can be added later.

---

## Task 6: Update package.json Scripts

**Files:**
- Modify: `package.json`

**Step 1: Remove --turbopack flags (now default)**

**Before:**
```json
"scripts": {
    "dev": "next dev --turbopack --experimental-https",
    "build": "next build --turbopack",
```

**After:**
```json
"scripts": {
    "dev": "next dev --experimental-https",
    "build": "next build",
```

Note: `--experimental-https` can remain for HTTPS in development.

**Step 2: Remove `lint` script (next lint is removed in v16)**

**Before:**
```json
"lint": "eslint",
```

**After:**
```json
"lint": "eslint .",
```

Note: The `lint` script was already using ESLint directly (`"lint": "eslint"`), but should specify a path. In Next.js 16, `next lint` is removed, so ensure ESLint is called directly.

**Step 3: Commit script updates**

```bash
git add package.json
git commit -m "chore: update scripts for Next.js 16 (turbopack default)"
```

---

## Task 7: Verify Build and Development Server

**Files:**
- N/A (verification only)

**Step 1: Clear .next directory**

```bash
rm -rf .next
```

**Step 2: Run development build**

```bash
bun run dev
```

Wait for "Ready" message. Press Ctrl+C to stop.

Expected: Server starts without errors on https://localhost:3000

**Step 3: Run production build**

```bash
bun run build
```

Expected: Build completes successfully with no errors

**Step 4: Test production server**

```bash
bun run start
```

Expected: Server starts on http://localhost:3000

**Step 5: Run linter**

```bash
bun run lint
```

Expected: No ESLint errors (warnings acceptable)

---

## Task 8: Test Critical Application Flows

**Files:**
- N/A (manual testing)

**Step 1: Test authentication flow**

1. Navigate to `/auth`
2. Attempt to access protected route (e.g., `/inventory`)
3. Verify redirect to `/auth` works
4. Sign in with valid credentials
5. Verify redirect to dashboard works

**Step 2: Test dynamic route with async params**

1. Navigate to `/share/view/left-arm`
2. Verify 3D model viewer loads
3. Navigate to `/share/view/[valid-image-id]` if you have test data
4. Verify decal viewer loads

**Step 3: Test image loading from Supabase**

1. Navigate to a page with Supabase-hosted images
2. Verify images load correctly (remotePatterns config)

**Step 4: Verify Supabase SSR cookies**

1. Sign in
2. Refresh the page
3. Verify session persists (proxy.ts cookie handling works)

---

## Task 9: Update AGENTS.md Documentation

**Files:**
- Modify: `AGENTS.md`

**Step 1: Update the Technology Stack section**

Change:
```markdown
- **Framework:** Next.js 15 with App Router
```

To:
```markdown
- **Framework:** Next.js 16 with App Router
```

**Step 2: Add note about proxy convention**

Add to the file:

```markdown
### Proxy (formerly Middleware)

In Next.js 16, `middleware.ts` has been renamed to `proxy.ts`. The proxy runs before each request and handles:
- Authentication checks via Supabase
- Role-based access control
- Route protection

Location: `proxy.ts` at project root
```

**Step 3: Commit documentation update**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md for Next.js 16"
```

---

## Task 10: Final Verification and Merge Preparation

**Files:**
- N/A (verification only)

**Step 1: Run final build**

```bash
bun run build
```

Expected: Successful build with no errors

**Step 2: Run linter**

```bash
bun run lint
```

Expected: No errors

**Step 3: Review all commits**

```bash
git log --oneline feat/nextjs-16-upgrade ^dev
```

Expected: List of commits made during upgrade

**Step 4: Push branch and create PR (or merge directly)**

```bash
git push -u origin feat/nextjs-16-upgrade
```

Or merge to dev:
```bash
git checkout dev
git merge feat/nextjs-16-upgrade
git push origin dev
```

---

## Post-Upgrade Considerations

### New Features to Explore (Optional)

1. **React Compiler** - Enable `reactCompiler: true` in next.config.ts for automatic memoization
2. **View Transitions** - React 19.2 includes `<ViewTransition>` for animated page transitions
3. **Cache Components** - New `cacheComponents` config option for Partial Pre-Rendering
4. **updateTag API** - New Server Action API for read-your-writes semantics
5. **Turbopack File System Caching** - Enable `experimental.turbopackFileSystemCacheForDev` for faster restarts

### Breaking Changes Addressed

| Change | Status | Notes |
|--------|--------|-------|
| middleware -> proxy | Done | Renamed file and function |
| Async params | Done | Migrated `app/share/view/[id]/page.tsx` |
| Turbopack default | Done | Removed `--turbopack` flags |
| Node.js 20.9+ | Verify | Check Node version on deployment |
| next lint removed | N/A | Already using ESLint directly |
| AMP removed | N/A | Not used in project |
| Runtime config removed | N/A | Not used in project |

### Rollback Plan

If issues occur after upgrade:

```bash
# Revert to dev branch state
git checkout dev

# Or revert specific commits
git revert <commit-hash>

# Downgrade packages
bun add next@15.5.9 react@19.1.0 react-dom@19.1.0
bun add -D eslint-config-next@15.5.3
```

---

## Reference Links

- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Proxy Documentation](https://nextjs.org/docs/app/getting-started/proxy)
- [Better Auth Next.js Integration](https://www.better-auth.com/docs/integrations/next)
- [React 19.2 Announcement](https://react.dev/blog/2025/10/01/react-19-2)
