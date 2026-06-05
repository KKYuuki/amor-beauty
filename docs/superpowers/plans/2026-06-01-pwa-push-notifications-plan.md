# PWA Push Notifications for Payroll Events — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Every task follows TDD (Red-Green-Refactor). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time Web Push notifications to the InkSight RDMD PWA so admins are notified when staff submit payroll requests, and staff are notified when admins disburse their payroll.

**Architecture:** New `push_subscriptions` DB table → server actions for subscribe/unsubscribe → `web-push` library for server-side push dispatch → service worker event handlers for notification display → client hook + UI toggle for opt-in/opt-out.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Bun, `web-push`, existing custom service worker

---

## Phase 1: Foundation

### Task 1: Install web-push dependency

**Files:**
- Modify: `package.json` (dependency added by bun)

**Dependencies:** None

- [x] **INSTALL: Add web-push and its types**

  Run:
  ```bash
  bun add web-push
  bun add -d @types/web-push
  ```

- [x] **VERIFY: Check installation**

  Run:
  ```bash
  grep "web-push" package.json
  ```
  Expected output: Both `"web-push"` and `"@types/web-push"` appear in dependencies.

- [x] **Commit**

  ```bash
  git add package.json bun.lock
  git commit -m "chore: add web-push dependency for PWA push notifications (Task 1)"
  ```

---

### Task 2: Push subscriptions database schema + migration

**Files:**
- Create: `server/db/schema/push-subscriptions.ts`
- Test: `tests/integration/push-subscriptions.test.ts`

**Dependencies:** Task 1 (web-push installed, but schema is independent)

**TDD Cycle:**

- [x] **RED: Write the failing test**

  Create `tests/integration/push-subscriptions.test.ts`:

  ```typescript
  import { describe, test, expect } from "bun:test"
  import { pushSubscriptions } from "@/server/db/schema/push-subscriptions"

  describe("pushSubscriptions schema", () => {
    test("exports a Drizzle pgTable", () => {
      expect(pushSubscriptions).toBeDefined()
      expect(typeof pushSubscriptions).toBe("object")
      // Drizzle tables have Symbol properties — verify it's a table object
      expect(pushSubscriptions.id).toBeDefined()
      expect(pushSubscriptions.userId).toBeDefined()
      expect(pushSubscriptions.endpoint).toBeDefined()
      expect(pushSubscriptions.p256dhKey).toBeDefined()
      expect(pushSubscriptions.authKey).toBeDefined()
    })

    test("endpoint column has unique constraint", () => {
      // Verify the endpoint column is configured with unique
      expect(pushSubscriptions.endpoint).toBeDefined()
      // We can verify the schema exports a Drizzle table with expected columns
      const columns = ["id", "userId", "endpoint", "p256dhKey", "authKey", "userAgent", "createdAt", "updatedAt"]
      for (const col of columns) {
        expect(pushSubscriptions).toHaveProperty(col)
      }
    })

    test("userId references user table", () => {
      // Verify user_id is a FK to user.id
      expect(pushSubscriptions.userId).toBeDefined()
    })
  })
  ```

- [x] **RED: Verify the test fails**

  Run:
  ```bash
  bun test tests/integration/push-subscriptions.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/server/db/schema/push-subscriptions'` or similar (file does not exist yet).

- [x] **GREEN: Write the Drizzle schema**

  Create `server/db/schema/push-subscriptions.ts`:

  ```typescript
  import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'
  import { randomUUID } from 'crypto'
  import { user } from './auth'

  export const pushSubscriptions = pgTable('push_subscriptions', {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dhKey: text('p256dh_key').notNull(),
    authKey: text('auth_key').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at'),
  })

  export type PushSubscription = typeof pushSubscriptions.$inferSelect
  export type PushSubscriptionInsert = typeof pushSubscriptions.$inferInsert
  ```

- [x] **GREEN: Verify the test passes**

  Run:
  ```bash
  bun test tests/integration/push-subscriptions.test.ts
  ```
  Expected: PASS — 3 assertions green.

- [x] **REFACTOR: Clean up**
  - Verify column names match the spec: `id`, `user_id`, `endpoint`, `p256dh_key`, `auth_key`, `user_agent`, `created_at`, `updated_at`
  - Verify `ON DELETE CASCADE` is on the `userId` foreign key
  - Verify `endpoint` has `unique()` constraint
  - Check that `id` uses `$defaultFn(() => randomUUID())` matching the project's existing pattern (see `server/db/schema/notifications.ts`)
  - Re-run tests to confirm still green

- [x] **Generate migration**

  Run:
  ```bash
  bun run db:generate
  ```
  Expected: A new SQL migration file is created under `drizzle/`. Inspect the generated SQL to ensure it matches:
  
  ```sql
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
  );

  CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);
  ```

  If the generated migration differs significantly from the above, adjust the schema and regenerate.

- [x] **Commit**

  ```bash
  git add server/db/schema/push-subscriptions.ts tests/integration/push-subscriptions.test.ts drizzle/
  git commit -m "feat: add push_subscriptions schema with migration (Task 2)"
  ```

---

### Task 3: Export push-subscriptions schema from index

**Files:**
- Modify: `server/db/schema.ts` (append export near line 163)

**Dependencies:** Task 2

- [x] **IMPLEMENT: Add export to schema index**

  Open `server/db/schema.ts`. Locate the last exports section (near line 163 where other schemas are exported). Add after the `notifications` export block:

  ```typescript
  // Push Subscriptions Schema
  export {
      pushSubscriptions,
  } from './schema/push-subscriptions'
  export type { PushSubscription, PushSubscriptionInsert } from './schema/push-subscriptions'
  ```

- [x] **VERIFY: Importable from index**

  Run:
  ```bash
  bun test tests/integration/push-subscriptions.test.ts
  ```
  Expected: PASS — the schema is accessible through `@/server/db/schema` via the existing re-export chain.

  Alternatively, verify by running:
  ```bash
  bun -e "import { pushSubscriptions } from '@/server/db/schema'; console.log('OK:', typeof pushSubscriptions)"
  ```

- [x] **Commit**

  ```bash
  git add server/db/schema.ts
  git commit -m "feat: export push-subscriptions schema from schema index (Task 3)"
  ```

---

## Phase 2: Core Logic

### Task 4: Push subscription server actions

**Files:**
- Create: `server/actions/push-subscriptions.ts`
- Test: `tests/integration/push-subscriptions-actions.test.ts`

**Dependencies:** Task 3 (schema export)

**TDD Cycle:**

- [x] **RED: Write the failing test**

  Create `tests/integration/push-subscriptions-actions.test.ts`:

  ```typescript
  import { describe, test, expect } from "bun:test"
  import {
    subscribePushSubscription,
    unsubscribePushSubscription,
    getVapidPublicKey,
  } from "@/server/actions/push-subscriptions"

  describe("subscribePushSubscription", () => {
    test("function exists and is callable", () => {
      expect(subscribePushSubscription).toBeDefined()
      expect(typeof subscribePushSubscription).toBe("function")
    })

    test("returns failure when user is not authenticated", async () => {
      // When called without auth context (e.g., outside of an HTTP request),
      // the function should return failure (Unauthorized).
      const result = await subscribePushSubscription({
        endpoint: "https://example.com/push/endpoint",
        p256dhKey: "test-p256dh",
        authKey: "test-auth",
      })
      expect(result.success).toBe(false)
    })

    test("rejects malformed input (missing endpoint)", async () => {
      // Even without auth, it may validate input first or fail with auth first.
      // At minimum, the function should not throw.
      const result = await subscribePushSubscription({
        endpoint: "",
        p256dhKey: "test-p256dh",
        authKey: "test-auth",
      })
      expect(result.success).toBe(false)
    })
  })

  describe("unsubscribePushSubscription", () => {
    test("function exists and is callable", () => {
      expect(unsubscribePushSubscription).toBeDefined()
      expect(typeof unsubscribePushSubscription).toBe("function")
    })

    test("returns failure when user is not authenticated", async () => {
      const result = await unsubscribePushSubscription("https://example.com/push/endpoint")
      expect(result.success).toBe(false)
    })
  })

  describe("getVapidPublicKey", () => {
    test("function exists and is callable", () => {
      expect(getVapidPublicKey).toBeDefined()
      expect(typeof getVapidPublicKey).toBe("function")
    })

    test("returns the VAPID public key or empty string", async () => {
      const result = await getVapidPublicKey()
      // Should not throw. Returns the public key (may be empty if not configured).
      expect(typeof result).toBe("string")
    })
  })
  ```

- [x] **RED: Verify the test fails**

  Run:
  ```bash
  bun test tests/integration/push-subscriptions-actions.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/server/actions/push-subscriptions'`

- [x] **GREEN: Write the server actions**

  Create `server/actions/push-subscriptions.ts`:

  ```typescript
  'use server'

  import { eq, and } from 'drizzle-orm'
  import { db } from '@/server/db'
  import { pushSubscriptions } from '@/server/db/schema'
  import { getCurrentUser } from '@/utils/auth/permissions'
  import { ActionResponse, success, failure } from '@/utils/types/responses'
  import { logError } from './logs'
  import { z } from 'zod'

  const SubscribeSchema = z.object({
    endpoint: z.string().min(1, 'Endpoint is required'),
    p256dhKey: z.string().min(1, 'p256dh key is required'),
    authKey: z.string().min(1, 'Auth key is required'),
    userAgent: z.string().optional(),
  })

  export type SubscribeInput = z.infer<typeof SubscribeSchema>

  export async function subscribePushSubscription(
    input: SubscribeInput
  ): Promise<ActionResponse<{ id: string }>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return failure('Unauthorized')
    }

    const validation = SubscribeSchema.safeParse(input)
    if (!validation.success) {
      return failure(validation.error.issues.map(i => i.message).join(', '))
    }

    try {
      const [subscription] = await db
        .insert(pushSubscriptions)
        .values({
          userId: currentUser.id,
          endpoint: validation.data.endpoint,
          p256dhKey: validation.data.p256dhKey,
          authKey: validation.data.authKey,
          userAgent: validation.data.userAgent || null,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            p256dhKey: validation.data.p256dhKey,
            authKey: validation.data.authKey,
            userAgent: validation.data.userAgent || null,
            updatedAt: new Date(),
          },
        })
        .returning()

      return success({ id: subscription.id })
    } catch (error) {
      await logError({
        type: 'PUSH',
        message: `Failed to save push subscription: ${error instanceof Error ? error.message : String(error)}`
      })
      return failure('Failed to save push subscription')
    }
  }

  export async function unsubscribePushSubscription(
    endpoint: string
  ): Promise<ActionResponse<void>> {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return failure('Unauthorized')
    }

    try {
      await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, endpoint),
            eq(pushSubscriptions.userId, currentUser.id),
          )
        )

      return success(undefined)
    } catch (error) {
      await logError({
        type: 'PUSH',
        message: `Failed to delete push subscription: ${error instanceof Error ? error.message : String(error)}`
      })
      return failure('Failed to delete push subscription')
    }
  }

  export async function getVapidPublicKey(): Promise<string> {
    return process.env.VAPID_PUBLIC_KEY || ''
  }
  ```

- [x] **GREEN: Verify the test passes**

  Run:
  ```bash
  bun test tests/integration/push-subscriptions-actions.test.ts
  ```
  Expected: PASS — all 6 test assertions green.

- [x] **REFACTOR: Clean up**
  - Verify `unsubscribePushSubscription` enforces both `endpoint` AND `userId` in the WHERE clause (not just endpoint — prevents cross-user unsubscription)
  - Verify `subscribePushSubscription` uses upsert (ON CONFLICT DO UPDATE) so re-subscribing doesn't error
  - Confirm the pattern matches existing server actions (see `server/actions/profile.ts`'s `sendUserNotification` for the `'use server'` + `getCurrentUser` + `ActionResponse` pattern)
  - Re-run tests to confirm still green

- [x] **Commit**

  ```bash
  git add server/actions/push-subscriptions.ts tests/integration/push-subscriptions-actions.test.ts
  git commit -m "feat: add push subscription server actions (subscribe, unsubscribe, getVapidKey) (Task 4)"
  ```

---

### Task 5: Push trigger utility (sendPushToUser, sendPushToRole)

**Files:**
- Create: `server/actions/push-trigger.ts`
- Test: `tests/integration/push-trigger.test.ts`

**Dependencies:** Tasks 2 (schema), 4 (subscription actions may inform query patterns)

**TDD Cycle:**

- [x] **RED: Write the failing test**

  Create `tests/integration/push-trigger.test.ts`:

  ```typescript
  import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"
  import {
    sendPushToUser,
    sendPushToRole,
    type PushPayload,
  } from "@/server/actions/push-trigger"

  describe("sendPushToUser", () => {
    test("function exists and is callable", () => {
      expect(sendPushToUser).toBeDefined()
      expect(typeof sendPushToUser).toBe("function")
    })

    test("does not throw when called (fire-and-forget contract)", () => {
      // The function must NEVER throw — it's fire-and-forget.
      // Even with invalid inputs, it should catch errors internally.
      const payload: PushPayload = {
        title: "Test",
        body: "Test body",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "test",
        data: { path: "/", requestId: "test-123" },
      }

      expect(() => {
        sendPushToUser("non-existent-user", payload)
      }).not.toThrow()
    })

    test("does not throw with missing env vars (VAPID keys)", () => {
      const payload: PushPayload = {
        title: "Test",
        body: "Test",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "test",
        data: { path: "/", requestId: "test-123" },
      }

      // Even if VAPID keys are not set, the function should not throw
      expect(() => {
        sendPushToUser("some-user", payload)
      }).not.toThrow()
    })
  })

  describe("sendPushToRole", () => {
    test("function exists and is callable", () => {
      expect(sendPushToRole).toBeDefined()
      expect(typeof sendPushToRole).toBe("function")
    })

    test("does not throw when called (fire-and-forget contract)", () => {
      const payload: PushPayload = {
        title: "Test",
        body: "Test",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "test",
        data: { path: "/", requestId: "test-123" },
      }

      expect(() => {
        sendPushToRole("admin", payload)
      }).not.toThrow()
    })

    test("accepts valid roles", () => {
      const payload: PushPayload = {
        title: "Test",
        body: "Test",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "test",
        data: { path: "/", requestId: "test-123" },
      }

      // All standard role values should be callable without throwing
      const roles = ["admin", "manager", "staff", "artist"]
      for (const role of roles) {
        expect(() => sendPushToRole(role, payload)).not.toThrow()
      }
    })
  })

  describe("PushPayload type", () => {
    test("payload has required title, body, and data fields", () => {
      const payload: PushPayload = {
        title: "Payroll Request",
        body: "Payroll request from Juan",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "payroll-request-abc",
        data: {
          path: "/payroll",
          requestId: "abc-123",
        },
      }

      expect(payload.title).toBe("Payroll Request")
      expect(payload.body).toBe("Payroll request from Juan")
      expect(payload.data.path).toBe("/payroll")
      expect(payload.data.requestId).toBe("abc-123")
      // Verify no amount field — per spec, amounts must not appear in push payloads
      expect((payload as Record<string, unknown>).amount).toBeUndefined()
    })
  })
  ```

- [x] **RED: Verify the test fails**

  Run:
  ```bash
  bun test tests/integration/push-trigger.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/server/actions/push-trigger'`

- [x] **GREEN: Write the push trigger utility**

  Create `server/actions/push-trigger.ts`:

  ```typescript
  'use server'

  import { eq, and, ne } from 'drizzle-orm'
  import { db } from '@/server/db'
  import { pushSubscriptions } from '@/server/db/schema/push-subscriptions'
  import { user } from '@/server/db/schema/auth'
  import { logError } from './logs'
  import webpush from 'web-push'

  export interface PushPayload {
    title: string
    body: string
    icon: string
    badge: string
    tag: string
    data: {
      path: string
      requestId: string
    }
  }

  function getVapidKeys() {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY || '',
      privateKey: process.env.VAPID_PRIVATE_KEY || '',
      subject: process.env.VAPID_SUBJECT || 'mailto:admin@inksight.rdmdstudio.com',
    }
  }

  function configureWebPush() {
    const keys = getVapidKeys()
    if (!keys.publicKey || !keys.privateKey) {
      return false
    }
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey)
    return true
  }

  interface DbSubscription {
    endpoint: string
    p256dhKey: string
    authKey: string
  }

  async function sendPushToSubscriptions(
    subscriptions: DbSubscription[],
    payload: PushPayload
  ): Promise<void> {
    if (!configureWebPush()) {
      return
    }

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dhKey,
              auth: sub.authKey,
            },
          },
          JSON.stringify(payload)
        )
      } catch (error: unknown) {
        const err = error as { statusCode?: number; message?: string }
        if (err.statusCode === 410) {
          // Subscription expired — clean up
          try {
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.endpoint, sub.endpoint))
          } catch {
            // Silently ignore cleanup failures
          }
        } else {
          await logError({
            type: 'PUSH',
            message: `Push delivery failed: ${err.message || String(error)}`
          })
        }
      }
    }
  }

  /**
   * Send a push notification to a specific user.
   * Fire-and-forget: never throws, never blocks the caller.
   */
  export function sendPushToUser(
    userId: string,
    payload: PushPayload
  ): void {
    // Fire-and-forget — the caller never awaits this promise
    db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dhKey: pushSubscriptions.p256dhKey,
        authKey: pushSubscriptions.authKey,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .then(subs => sendPushToSubscriptions(subs, payload))
      .catch(error => {
        logError({
          type: 'PUSH',
          message: `Failed to query subscriptions for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
        }).catch(() => {})
      })
  }

  /**
   * Send a push notification to all users with a given role,
   * excluding the action user (to prevent self-notifications).
   * Fire-and-forget: never throws, never blocks the caller.
   */
  export function sendPushToRole(
    role: string,
    payload: PushPayload,
    excludeUserId?: string
  ): void {
    // Fire-and-forget — the caller never awaits this promise
    const conditions = [eq(user.role, role)]
    if (excludeUserId) {
      conditions.push(ne(user.id, excludeUserId))
    }

    db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dhKey: pushSubscriptions.p256dhKey,
        authKey: pushSubscriptions.authKey,
      })
      .from(pushSubscriptions)
      .innerJoin(user, eq(pushSubscriptions.userId, user.id))
      .where(and(...conditions))
      .then(subs => sendPushToSubscriptions(subs, payload))
      .catch(error => {
        logError({
          type: 'PUSH',
          message: `Failed to query subscriptions for role ${role}: ${error instanceof Error ? error.message : String(error)}`
        }).catch(() => {})
      })
  }
  ```

- [x] **GREEN: Verify the test passes**

  Run:
  ```bash
  bun test tests/integration/push-trigger.test.ts
  ```
  Expected: PASS — all 8 test assertions green.

- [x] **REFACTOR: Clean up**
  - Verify `sendPushToUser` and `sendPushToRole` are synchronous functions that return `void` (not async/Promise). The fire-and-forget pattern means the function initiates the async work but does not return a Promise the caller must await.
  - Confirm `sendPushToRole` accepts the `excludeUserId` optional parameter for self-notification prevention.
  - Confirm 410 Gone handling deletes the subscription from DB.
  - Confirm VAPID key check gracefully handles missing env vars (returns early, no error thrown).
  - Confirm error logging uses the existing `logError` pattern with type `'PUSH'`.
  - Re-run tests to confirm still green.

- [x] **Commit**

  ```bash
  git add server/actions/push-trigger.ts tests/integration/push-trigger.test.ts
  git commit -m "feat: add push trigger utilities (sendPushToUser, sendPushToRole) (Task 5)"
  ```

---

## Phase 3: Integration

### Task 6: Service worker push + notificationclick handlers

**Files:**
- Modify: `public/sw.js` (append push + notificationclick listeners at end of file)

**Dependencies:** Task 5 (push trigger payload format informs SW handler)

**Note:** The service worker is a static file. There is no Bun test framework that runs inside a service worker context. The verification step below manually inspects the file for correctness and tests it via a browser dev server.

- [x] **IMPLEMENT: Add push event listener**

  Open `public/sw.js`. Append the following block at the end of the file (before any trailing blank lines):

  ```javascript
  // ==========================================================================
  // PUSH NOTIFICATIONS
  // ==========================================================================

  self.addEventListener("push", (event) => {
    let payload = { title: "New Notification", body: "", data: {} }

    if (event.data) {
      try {
        payload = event.data.json()
      } catch {
        payload.body = event.data.text()
      }
    }

    const { title, ...options } = payload

    event.waitUntil(
      self.registration.showNotification(title, {
        body: options.body || "",
        icon: options.icon || "/icon-192.png",
        badge: options.badge || "/icon-192.png",
        tag: options.tag || "payroll-notification",
        data: options.data || {},
        vibrate: [200, 100, 200],
        requireInteraction: false,
      })
    )
  })
  ```

- [x] **IMPLEMENT: Add notificationclick handler**

  Append after the push listener:

  ```javascript
  self.addEventListener("notificationclick", (event) => {
    event.notification.close()

    const { path = "/" } = event.notification.data || {}

    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        // If a window is already open, focus it and navigate
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus()
            client.postMessage({ type: "notification-navigate", path })
            return
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(path)
        }
      })
    )
  })
  ```

- [x] **VERIFY: Confirm the SW file is valid**

  Run a syntax check:
  ```bash
  node --check public/sw.js
  ```
  Expected: No output (exit code 0) — the file parses without errors.

  If `node` is not available, use Bun:
  ```bash
  bun -e "const src = require('fs').readFileSync('public/sw.js','utf8'); new Function(src); console.log('Syntax OK')"
  ```

- [x] **VERIFY: Confirm existing caching logic is untouched**

  Run:
  ```bash
  grep -c "self.addEventListener" public/sw.js
  ```
  Expected: 5 (install, activate, fetch, push, notificationclick) — the original 3 plus 2 new.

  Verify the original listeners remain unchanged:
  ```bash
  head -n 145 public/sw.js | grep -c "self.addEventListener"
  ```
  Expected: 3 (only the original install, activate, fetch).

- [x] **Commit**

  ```bash
  git add public/sw.js
  git commit -m "feat: add push + notificationclick handlers to service worker (Task 6)"
  ```

---

### Task 7: Inject push triggers into payroll actions

**Files:**
- Modify: `server/actions/payroll.ts` (add push trigger after `createPayrollRequest` return, ~line 1162-1164)
- Modify: `server/actions/payroll-disbursements.ts` (add push trigger after `createDisbursement` return, ~line 182-187)
- Test: `tests/integration/payroll-push-triggers.test.ts`

**Dependencies:** Tasks 5 (push trigger), 6 (SW — but not strictly dependent)

**TDD Cycle:**

- [x] **RED: Write the failing test**

  Create `tests/integration/payroll-push-triggers.test.ts`:

  ```typescript
  import { describe, test, expect } from "bun:test"

  describe("Payroll push trigger integration", () => {
    test("createPayrollRequest still exports (import not broken)", async () => {
      const mod = await import("@/server/actions/payroll")
      expect(mod.createPayrollRequest).toBeDefined()
      expect(typeof mod.createPayrollRequest).toBe("function")
    })

    test("createDisbursement still exports (import not broken)", async () => {
      const mod = await import("@/server/actions/payroll-disbursements")
      expect(mod.createDisbursement).toBeDefined()
      expect(typeof mod.createDisbursement).toBe("function")
    })

    test("sendPushToRole is importable from push-trigger", async () => {
      const mod = await import("@/server/actions/push-trigger")
      expect(mod.sendPushToRole).toBeDefined()
      expect(mod.sendPushToUser).toBeDefined()
    })

    test("payroll actions do not have circular imports", async () => {
      const [payroll, disbursements] = await Promise.all([
        import("@/server/actions/payroll"),
        import("@/server/actions/payroll-disbursements"),
      ])
      expect(payroll).toBeDefined()
      expect(disbursements).toBeDefined()
    })
  })
  ```

- [x] **RED: Verify the test passes (it should pass BEFORE modifications)**

  Run:
  ```bash
  bun test tests/integration/payroll-push-triggers.test.ts
  ```
  Expected: PASS — the modules exist even before we add the push triggers. This validates our baseline.

- [x] **IMPLEMENT: Add push trigger to createPayrollRequest**

  Open `server/actions/payroll.ts`. Locate the `createPayrollRequest` function.

  **Step A — Add import at top of file** (near line 1-10, alongside other action imports):

  ```typescript
  import { sendPushToRole } from './push-trigger'
  ```

  **Step B — Add push trigger call after the `cache.invalidate` block**

  Locate this section (~lines 1159-1164):

  ```typescript
        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')

        return success(result.data, 'Payroll request created successfully')
  ```

  Replace with:

  ```typescript
        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')

        // Push notification: notify admins of new payroll request
        // Fire-and-forget — never blocks the response
        db
          .select({ fullName: user.fullName })
          .from(user)
          .where(eq(user.id, staff_id))
          .limit(1)
          .then(([staffUser]) => {
            const staffName = staffUser?.fullName || 'Staff Member'
            sendPushToRole('admin', {
              title: 'Payroll Request',
              body: `Payroll request from ${staffName}`,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: `payroll-request-${result.request.id}`,
              data: {
                path: '/payroll',
                requestId: result.request.id,
              },
            }, currentUser.id)
          })
          .catch(() => {})

        return success(result.data, 'Payroll request created successfully')
  ```

  Note: `user` and `eq` are already imported in this file's existing imports. Verify they are available.

- [x] **IMPLEMENT: Add push trigger to createDisbursement**

  Open `server/actions/payroll-disbursements.ts`.

  **Step A — Add import at top of file** (add near line 1, alongside other action imports):

  ```typescript
  import { sendPushToUser } from './push-trigger'
  ```

  **Step B — Add push trigger call after the `cache.invalidate` block**

  Locate this section (~lines 182-187):

  ```typescript
        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')

        return success({ disbursement_id: disbursement.id })
  ```

  Replace with:

  ```typescript
        cache.invalidate('payroll_dashboard')
        cache.invalidate('staff_payroll')
        cache.invalidate('business_insights')
        cache.invalidate('exec_accounting')

        // Push notification: notify the staff that their payroll has been disbursed
        // Fire-and-forget — never blocks the response
        sendPushToUser(request.staffId, {
          title: 'Payroll Disbursed',
          body: 'Your payroll has been disbursed',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `payroll-disbursement-${disbursement.id}`,
          data: {
            path: '/my-payroll',
            requestId: payload.request_id,
          },
        })

        return success({ disbursement_id: disbursement.id })
  ```

- [x] **GREEN: Verify tests still pass**

  Run:
  ```bash
  bun test tests/integration/payroll-push-triggers.test.ts
  ```
  Expected: PASS — all imports still work after modifications.

  Also verify the existing payroll tests still pass:
  ```bash
  bun test tests/integration/payroll-entries.test.ts
  bun test tests/integration/payroll-manual-entry.test.ts
  ```
  Expected: Both PASS.

- [x] **GREEN: Verify TypeScript compilation**

  Run:
  ```bash
  bun run typecheck
  ```
  Expected: No errors.

- [x] **REFACTOR: Clean up**
  - Verify the `sendPushToRole` call in `createPayrollRequest` passes `currentUser.id` as the third argument (`excludeUserId`) to prevent self-notification.
  - Verify `sendPushToUser` in `createDisbursement` uses `request.staffId`.
  - Confirm both push calls are NOT wrapped in `await` — they must be pure fire-and-forget.
  - Confirm no notification body contains monetary amounts.
  - Re-run all tests to confirm still green.

- [x] **Commit**

  ```bash
  git add server/actions/payroll.ts server/actions/payroll-disbursements.ts tests/integration/payroll-push-triggers.test.ts
  git commit -m "feat: inject push triggers into payroll request + disbursement actions (Task 7)"
  ```

---

## Phase 4: Presentation

### Task 8: usePushNotifications client hook

**Files:**
- Create: `hooks/use-push-notifications.ts`
- Test: `tests/integration/use-push-notifications.test.ts`

**Dependencies:** Tasks 4 (subscription server actions), 5 (push trigger — for PushPayload type reference)

**TDD Cycle:**

- [x] **RED: Write the failing test**

  Create `tests/integration/use-push-notifications.test.ts`:

  ```typescript
  import { describe, test, expect } from "bun:test"

  // NOTE: This hook uses browser APIs (Notification, navigator.serviceWorker).
  // In Bun's test environment, these are NOT available by default.
  // The test validates that the module exports the expected interface.

  describe("usePushNotifications hook", () => {
    test("module exports the usePushNotifications function", async () => {
      const mod = await import("@/hooks/use-push-notifications")
      expect(mod.usePushNotifications).toBeDefined()
      expect(typeof mod.usePushNotifications).toBe("function")
    })

    test("module does not throw during static import", () => {
      expect(async () => {
        await import("@/hooks/use-push-notifications")
      }).not.toThrow()
    })
  })
  ```

- [x] **RED: Verify the test fails**

  Run:
  ```bash
  bun test tests/integration/use-push-notifications.test.ts
  ```
  Expected: FAIL — `Cannot find module '@/hooks/use-push-notifications'`.

- [x] **GREEN: Write the usePushNotifications hook**

  Create `hooks/use-push-notifications.ts`:

  ```typescript
  "use client"

  import { useState, useEffect, useCallback } from "react"
  import {
    subscribePushSubscription,
    unsubscribePushSubscription,
    getVapidPublicKey,
  } from "@/server/actions/push-subscriptions"

  export type PushPermissionState = "default" | "granted" | "denied"

  interface UsePushNotificationsReturn {
    isSupported: boolean
    permission: PushPermissionState
    isSubscribed: boolean
    isLoading: boolean
    error: string | null
    subscribe: () => Promise<void>
    unsubscribe: () => Promise<void>
  }

  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
    const rawData = atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  export function usePushNotifications(): UsePushNotificationsReturn {
    const [permission, setPermission] = useState<PushPermissionState>("default")
    const [isSubscribed, setIsSubscribed] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const isSupported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window

    // Check current subscription state on mount
    useEffect(() => {
      if (!isSupported) return

      setPermission(Notification.permission as PushPermissionState)

      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then((subscription) => {
          setIsSubscribed(!!subscription)
        }).catch(() => {
          setIsSubscribed(false)
        })
      }).catch(() => {
        setIsSubscribed(false)
      })
    }, [isSupported])

    const subscribe = useCallback(async () => {
      if (!isSupported) {
        setError("Push notifications are not supported in this browser")
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        // Request permission if not yet granted
        let currentPermission = Notification.permission as PushPermissionState
        if (currentPermission === "default") {
          currentPermission = (await Notification.requestPermission()) as PushPermissionState
          setPermission(currentPermission)
        }

        if (currentPermission === "denied") {
          setError("Notification permission was denied. Please enable it in your browser settings.")
          setIsLoading(false)
          return
        }

        // Get VAPID public key from server
        const vapidPublicKey = await getVapidPublicKey()
        if (!vapidPublicKey) {
          setError("Push notification configuration is not available")
          setIsLoading(false)
          return
        }

        // Subscribe via service worker
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })

        // Save subscription to server
        const result = await subscribePushSubscription({
          endpoint: subscription.endpoint,
          p256dhKey: subscription.toJSON().keys?.p256dh || "",
          authKey: subscription.toJSON().keys?.auth || "",
          userAgent: navigator.userAgent,
        })

        if (!result.success) {
          setError(result.error || "Failed to save subscription")
          setIsSubscribed(false)
        } else {
          setIsSubscribed(true)
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to enable push notifications"
        )
        setIsSubscribed(false)
      } finally {
        setIsLoading(false)
      }
    }, [isSupported])

    const unsubscribe = useCallback(async () => {
      if (!isSupported) return

      setIsLoading(true)
      setError(null)

      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()

        if (subscription) {
          await subscription.unsubscribe()
          await unsubscribePushSubscription(subscription.endpoint)
        }

        setIsSubscribed(false)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to disable push notifications"
        )
      } finally {
        setIsLoading(false)
      }
    }, [isSupported])

    return {
      isSupported,
      permission,
      isSubscribed,
      isLoading,
      error,
      subscribe,
      unsubscribe,
    }
  }
  ```

- [x] **GREEN: Verify the test passes**

  Run:
  ```bash
  bun test tests/integration/use-push-notifications.test.ts
  ```
  Expected: PASS — the module exports the expected function.

- [x] **REFACTOR: Clean up**
  - Re-run tests to confirm still green.

- [x] **Commit**

  ```bash
  git add hooks/use-push-notifications.ts tests/integration/use-push-notifications.test.ts
  git commit -m "feat: add usePushNotifications client hook (Task 8)"
  ```

---

### Task 9: PushNotificationSettings toggle component

**Files:**
- Create: `components/push-notification-settings.tsx`
- Modify: `app/profile/profilePage.tsx` (render the component)

**Dependencies:** Task 8 (usePushNotifications hook)

- [x] **IMPLEMENT: Create PushNotificationSettings component**

  Create `components/push-notification-settings.tsx`:

  ```typescript
  "use client"

  import { usePushNotifications } from "@/hooks/use-push-notifications"
  import { BellIcon, BellOffIcon, Loader2Icon } from "lucide-react"

  export default function PushNotificationSettings() {
    const {
      isSupported,
      isSubscribed,
      isLoading,
      error,
      subscribe,
      unsubscribe,
    } = usePushNotifications()

    if (!isSupported) {
      return null
    }

    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/20 p-2">
              {isSubscribed ? (
                <BellIcon size={18} className="text-blue-400" />
              ) : (
                <BellOffIcon size={18} className="text-zinc-500" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Push Notifications
              </h3>
              <p className="text-xs text-zinc-400">
                {isSubscribed
                  ? "You will receive payroll notifications on your device"
                  : "Get notified when payroll requests are submitted or disbursed"}
              </p>
            </div>
          </div>
          <button
            onClick={isSubscribed ? unsubscribe : subscribe}
            disabled={isLoading}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors ${
              isSubscribed
                ? "border-blue-500 bg-blue-500"
                : "border-zinc-700 bg-zinc-700"
            } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
            aria-label={isSubscribed ? "Disable push notifications" : "Enable push notifications"}
          >
            {isLoading ? (
              <Loader2Icon size={12} className="absolute left-0.5 animate-spin text-white" />
            ) : (
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                  isSubscribed ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            )}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-xs text-red-400">{error}</p>
        )}
      </div>
    )
  }
  ```

- [x] **IMPLEMENT: Add component to profile page**

  Open `app/profile/profilePage.tsx`.

  **Step A — Add import** (alongside other component imports):

  ```typescript
  import PushNotificationSettings from "@/components/push-notification-settings"
  ```

  **Step B — Render** (before the `<ScheduleEditor` component):

  ```typescript
  <PushNotificationSettings />
  ```

- [x] **VERIFY: TypeScript compilation + build**

  Run:
  ```bash
  bun run typecheck
  bun run build 2>&1 | tail -20
  ```
  Expected: No errors.

- [x] **Commit**

  ```bash
  git add components/push-notification-settings.tsx app/profile/profilePage.tsx
  git commit -m "feat: add PushNotificationSettings toggle to profile page (Task 9)"
  ```

---

## Phase 5: E2E Browser Testing

### Task 10: E2E — Push notification subscribe/unsubscribe flow

**Prerequisites:** Dev server running at `https://localhost:3000`. Database migrated (Task 2 migration applied). Profile page renders the `PushNotificationSettings` component (Task 9 complete).

**Files:**
- Create: `docs/superpowers/e2e/push-notification-subscribe-flow.md` (test script + evidence)
- Screenshots saved to: `docs/superpowers/e2e/screenshots/`

**Dependencies:** Phase 4 (Presentation) must be complete

**E2E Cycle:**

- [x] **DEFINE: Write the E2E test script**

  Create `docs/superpowers/e2e/push-notification-subscribe-flow.md`:

  ```markdown
  # E2E Test: Push Notification Subscribe/Unsubscribe Flow

  **App URL:** https://localhost:3000/profile
  **Flow:** User navigates to profile settings, toggles push notifications on, grants permission, verifies DB subscription, then toggles off.
  **Auth required:** Yes (must be logged in as a studio user)

  ## Steps

  1. Open https://localhost:3000/profile
     - Verify the page loads and shows the user profile
     - Take screenshot: `step01-profile-loaded.png`

  2. Verify PushNotificationSettings section is visible
     - Look for text "Push Notifications" on the page
     - Look for the toggle button
     - Take screenshot: `step02-toggle-visible.png`

  3. Click the push notification toggle to enable
     - Use semanticAction: click with text "Enable push notifications"
     - Browser permission dialog should appear — accept/allow
     - Wait for the toggle to switch to "on" state (blue background)
     - Take screenshot: `step03-subscribed.png`

  4. Verify subscription is stored in the database
     - Use a server action call or check the push_subscriptions table
     - Assert at least one row exists for the current user
     - Take screenshot: `step04-db-verified.png` (optional admin panel check)

  5. Click the toggle again to disable
     - The toggle should switch to "off" state (zinc/gray background)
     - Text should change to "Get notified when payroll requests..."
     - Take screenshot: `step05-unsubscribed.png`

  6. Verify subscription is removed from the database
     - Assert no rows exist in push_subscriptions for the current user

  ## Acceptance Criteria
  - [x] Profile page loads without errors
  - [x] PushNotificationSettings section renders (supported browser only)
  - [x] Toggle click triggers browser permission prompt
  - [x] After granting, toggle shows subscribed state
  - [x] Push subscription exists in DB
  - [x] Toggle off removes subscription from DB
  ```

- [x] **EXECUTE: Run the E2E test**

  Dispatch a subagent with the `agent_browser` tool:

  ```
  Agent type: general-purpose
  Model: ollama/deepseek-v4-pro:cloud
  Prompt: |
    E2E Browser Test: Push Notification Subscribe/Unsubscribe Flow
    App URL: https://localhost:3000/profile
    
    IMPORTANT: This is a PWA push notification flow. The key browser behaviors to test:
    1. The push notification toggle component renders on the profile page
    2. Clicking the toggle triggers the Notification.requestPermission() flow
    3. After granting permission, the toggle shows "subscribed" state
    4. Toggling off calls unsubscribe and resets the toggle
    
    Using agent_browser (open → snapshot -i → click/fill @refs → snapshot -i):
    
    1. Open https://localhost:3000/profile with sessionMode=fresh
    2. Take a snapshot and verify the page loads
    3. Look for "Push Notifications" text — this is the toggle section
    4. If found, click the toggle button
       - The browser may show a permission dialog — note if it appears
    5. After clicking, snapshot again to verify state change
    6. Save all screenshots to docs/superpowers/e2e/screenshots/
    
    Report: pass/fail per step, with evidence screenshots.
  ```

- [x] **VERIFY: Check results**

  After the subagent completes:
  - Review the screenshots in `docs/superpowers/e2e/screenshots/`
  - Confirm the toggle component renders on the profile page
  - Confirm the toggle changes state after interaction
  - If the browser permission dialog cannot be automated (a known limitation of CDP), document this as a manual verification step and confirm the toggle's visual state instead

- [x] **DOCUMENT: Save evidence**

  Update `docs/superpowers/e2e/push-notification-subscribe-flow.md` with the subagent's results and screenshot file references. Note any manual verification steps required.

- [x] **Commit**

  ```bash
  git add docs/superpowers/e2e/
  git commit -m "test: E2E browser test for push notification subscribe/unsubscribe flow (Task 10)"
  ```

---
