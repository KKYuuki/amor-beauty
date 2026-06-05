# Architectural Specification: PWA Push Notifications for Payroll Events

## 1. Executive Summary

Add real-time push notifications to the InkSight RDMD PWA so that (a) admins are notified when a staff member submits a payroll request, and (b) staff are notified when an admin disburses their payroll. This is implemented via the standard Web Push API — no third-party push service is needed beyond the browser's built-in push infrastructure. VAPID keys provide identity verification.

## 2. Constraints & Non-Negotiables

- **Push must never block payroll actions.** Payroll server actions `createPayrollRequest()`, `createDisbursement()`, and `completePayrollRequest()` must succeed or fail independently of push delivery. Push is always fire-and-forget, called as a side effect after the main action completes.
- **VAPID private key must never be exposed client-side.** The private key lives in `.env.local` (`VAPID_PRIVATE_KEY`) and is only used by server-side code. The public key (`VAPID_PUBLIC_KEY`) is exposed to the client via a server action or API route.
- **No external push services.** No OneSignal, Firebase Cloud Messaging SDK, or similar. Only the standard Web Push protocol via the `web-push` npm library.
- **Users can only subscribe/unsubscribe themselves.** Server actions enforce `user_id == currentUser.id` on push subscription writes and deletes.
- **Lock-screen notifications must not expose sensitive amounts.** Notification body text describes the event type and staff name, never specific payroll figures.
- **Existing service worker caching strategy remains untouched.** The `public/sw.js` file gains push event listeners but its existing cache-first/network-first strategies are preserved.

## 3. System Boundaries

### In Scope
- New `push_subscriptions` database table and Drizzle schema
- Server actions: `subscribePushSubscription()`, `unsubscribePushSubscription()`, `getPushSubscriptions()` (for client-side management)
- Server-side push trigger utilities: `sendPushToUser(userId, payload)` and `sendPushToRole(role, payload)`
- Client-side `usePushNotifications` hook — manages subscription lifecycle (subscribe, unsubscribe, permission check)
- `PushNotificationSettings` component — an opt-in/opt-out toggle in user settings
- Push event listener and notificationclick handler added to `public/sw.js`
- Push trigger calls inserted in `server/actions/payroll.ts` (after `createPayrollRequest`) and `server/actions/payroll-disbursements.ts` (after `createDisbursement`)
- E2E browser test verifying the subscribe/unsubscribe UI flow
- Environment variables: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

### Out of Scope
- In-app toast notifications (already exist via `NotificationContext` / `sendUserNotification`)
- Email notifications about payroll events (already possible via Resend, separate feature)
- Notification read/dismiss sync across devices
- Rich notification actions (buttons in the notification — future enhancement)
- Push notifications for non-payroll events (appointments, inventory, etc.) — the architecture supports adding them later

### Integration Surfaces
- **Database (PostgreSQL):** New `push_subscriptions` table, read/written by server actions
- **Existing auth layer:** `getCurrentUser()` and `isAdmin()` for permission gating
- **Existing payroll server actions:** Push triggers injected after payroll state transitions
- **Existing service worker `public/sw.js`:** Push + notificationclick event listeners added
- **Existing user settings page:** Push notification toggle rendered in existing settings UI

## 4. Component Architecture

### New Modules

| Module | Location | Responsibility |
|--------|----------|----------------|
| Push Subscriptions Schema | `server/db/schema/push-subscriptions.ts` | Drizzle table definition for storing push endpoints |
| Push Subscription Actions | `server/actions/push-subscriptions.ts` | Server actions: subscribe, unsubscribe, list |
| Push Trigger | `server/actions/push-trigger.ts` | Utilities: `sendPushToUser(userId, payload)` and `sendPushToRole(role, payload)` — fire-and-forget push dispatch. The `role` parameter accepts the same values as the user table's `role` column (`'admin'`, `'manager'`, `'staff'`, `'artist'`). The current implementation only uses `'admin'`. |
| usePushNotifications | `hooks/use-push-notifications.ts` | Client hook managing subscription lifecycle and permission state |
| PushNotificationSettings | `components/push-notification-settings.tsx` | Toggle UI for opt-in/opt-out |

### Modified Modules

| Module | Location | Change |
|--------|----------|--------|
| Service Worker | `public/sw.js` | Add `push` + `notificationclick` event listeners |
| Payroll Actions | `server/actions/payroll.ts` | Call `sendPushToRole('admin', ...)` after `createPayrollRequest` |
| Disbursement Actions | `server/actions/payroll-disbursements.ts` | Call `sendPushToUser(staffId, ...)` after `createDisbursement` |
| Schema Index | `server/db/schema.ts` | Export push-subscriptions schema |

### Communication Patterns

```
[Client Hook] ──subscribe/unsubscribe──→ [Server Action: push-subscriptions.ts] ──→ [PostgreSQL]
[Payroll Action] ──fire-and-forget──→ [Push Trigger] ──webpush.sendNotification──→ [Browser Push Service] ──→ [Service Worker] ──showNotification──→ [OS Notification]
```

All server-to-SW communication is asynchronous and happens through the browser's push service. The payroll server action never waits for the push to be delivered.

### Exact Trigger Points

| Event | Trigger Location | Target Audience | Condition |
|-------|-----------------|-----------------|-----------|
| Staff submits payroll request | `createPayrollRequest()` in `server/actions/payroll.ts` | All users with role `'admin'` (excluding the action user) | After successful INSERT + UPDATE commit |
| Admin creates disbursement | `createDisbursement()` in `server/actions/payroll-disbursements.ts` | The staff member who owns the payroll request | After successful INSERT (and optional completion) commit |

**`completePayrollRequest()` does NOT trigger a separate push.** Full completion is an internal state transition that happens atomically when the last disbursement fully covers the request total. Only the disbursement action triggers the staff notification.

### Notification Payload Format

```typescript
interface PushPayload {
    title: string          // Short title: "Payroll Request" or "Payroll Disbursed"
    body: string           // One-line description: "Payroll request from Juan" or "Your payroll has been disbursed"
    icon: string           // "/icon-192.png"
    badge: string          // "/icon-192.png"
    tag: string            // Dedup key: e.g. "payroll-request-${requestId}"
    data: {
        path: string       // Deep link: "/payroll" (admin) or "/my-payroll" (staff)
        requestId: string  // For UI to navigate to specific request
    }
}
```

**No monetary amounts appear in the notification body or title.** This prevents sensitive payroll data from appearing on lock screens.

### Service Worker Focus Handling

When the app is already open and focused in a browser tab, the `push` event in the service worker checks whether any client is already viewing the relevant page. If so, the system notification is suppressed and the in-app notification system (already implemented via `NotificationContext`) handles the UX. This prevents duplicate noise — the user doesn't see both a system notification and an in-app toast.

### Push Trigger Implementation Pattern

```typescript
// fire-and-forget wrapper — called after payroll actions succeed
function sendPushToRole(role: string, payload: PushPayload): void {
    // Runs asynchronously, never awaited
    getSubscriptionsByRole(role).then(subscriptions => {
        for (const sub of subscriptions) {
            webpush.sendNotification(sub, JSON.stringify(payload))
                .catch(err => {
                    if (err.statusCode === 410) deleteSubscription(sub.endpoint)
                    else logError({ type: 'PUSH', message: err.message })
                })
        }
    }).catch(err => logError({ type: 'PUSH', message: `Failed to query subs: ${err.message}` }))
}
```

This function is called with `.catch()` on the returned promise, never awaited by the caller.

## 5. Data Flow

### Flow 1: User Opts Into Push Notifications (Subscription)

```
User clicks "Enable" toggle in settings
  → usePushNotifications hook:
    1. Check Notification.permission
       - 'default' → Notification.requestPermission() → if denied, stop
       - 'denied' → show "Please enable notifications in browser settings"
       - 'granted' → continue
    2. navigator.serviceWorker.ready → get registration
    3. registration.pushManager.subscribe({
         userVisibleOnly: true,
         applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
       })
    4. Extract { endpoint, keys: { p256dh, auth } }
  → Server action subscribePushSubscription({ endpoint, p256dh, auth })
    1. Validate auth: currentUser required
    2. Upsert: INSERT ... ON CONFLICT (endpoint) DO UPDATE SET updated_at = NOW()
    3. Return success
  → Hook sets state: subscribed = true
```

### Flow 2: User Opts Out

```
User clicks "Disable" toggle
  → usePushNotifications hook:
    1. registration.pushManager.getSubscription()
    2. subscription.unsubscribe()
  → Server action unsubscribePushSubscription(endpoint)
    1. Validate auth: currentUser required
    2. DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?
    3. Return success
  → Hook sets state: subscribed = false
```

### Flow 3: Staff Submits Payroll → Admin Notified

```
Staff action → createPayrollRequest(payload)
  1. Validate input (Zod)
  2. Check auth (getCurrentUser)
  3. DB transaction: INSERT payroll_request, UPDATE entries
  4. Return { success: true, data: request }
  5. (Fire-and-forget) sendPushToRole('admin', {
       title: 'Payroll Request',
       body: `Payroll request from ${staffName}`,
       data: { path: '/payroll', requestId: request.id }
     })
     → Query: SELECT p.* FROM push_subscriptions p
              JOIN "user" u ON u.id = p.user_id
              WHERE u.role = 'admin' AND u.id != actionUserId
     → For each: webpush.sendNotification()
       → On 410: DELETE subscription
       → On other error: logError(...)
```

### Flow 4: Admin Disburses Payroll → Staff Notified

```
Admin action → createDisbursement(payload)
  1. Validate: Zod + admin check
  2. DB transaction: INSERT disbursement, maybe complete request
  3. Return { success: true, data: disbursement }
  4. (Fire-and-forget) sendPushToUser(staffId, {
       title: 'Payroll Disbursed',
       body: `Your payroll has been disbursed`,
       data: { path: '/my-payroll', requestId: request.id }
     })
     → Query: SELECT * FROM push_subscriptions WHERE user_id = staffId
     → Same error handling as Flow 3
```

### Flow 5: Service Worker Receives Push (All Devices)

```
Service Worker "push" event fires
  1. event.waitUntil(
       self.registration.showNotification(title, {
         body,
         icon: '/icon-192.png',
         badge: '/icon-192.png',
         tag: `payroll-${requestId}`,
         data: payload.data  // e.g. { path, requestId }
       })
     )

User clicks notification
  → Service Worker "notificationclick" event fires
    1. event.notification.close()
    2. clients.openWindow(data.path || '/')
       or clients.matchAll() → focus existing window
```

### State Ownership
| State | Owner | Location |
|-------|-------|----------|
| Push subscription (browser) | Client (browser-managed, persisted in IndexedDB) | PushManager stores subscription |
| Push subscription (DB) | Server | PostgreSQL `push_subscriptions` table |
| Opt-in status (derived) | Client | Derived from whether subscription exists |
| Notification permission | Browser | `Notification.permission` |
| Payload to send | Server | Constructed in push trigger utility |
| Push delivery state | Browser push service | Not stored — fire-and-forget |

## 6. Security & Error Handling

### Authentication & Authorization

- **Subscribe:** Server action checks `getCurrentUser()`. The `user_id` column is always set to `currentUser.id`. No user can subscribe on behalf of another.
- **Unsubscribe:** Server action verifies the subscription's `user_id` matches `currentUser.id`. Endpoint-only matching is insufficient (could guess endpoints) — we enforce both `endpoint` AND `user_id`.
- **Push trigger:** Only called from within fully authorized server actions (payroll actions already gate on `isAdmin()` / `getCurrentUser()`).
- **VAPID key security:** Private key is server-only, read from `process.env.VAPID_PRIVATE_KEY`. Public key is exposed via a server action to the client for subscription.

### Error Handling Strategy

| Scenario | Handling |
|----------|----------|
| Push service returns 410 Gone | Delete the subscription from DB silently, continue to next |
| Push service returns other error | Log via `logError()` with type `'PUSH'`, continue |
| DB query for subscriptions fails | Log error, return — push is skipped silently |
| Push service unreachable | Caught by `webpush.sendNotification()` → log error |
| User denies notification permission | Hook detects `'denied'` state, shows guidance, toggle stays off |
| Subscription creation fails on server | Hook shows error via `addNotification()`, toggle reverts |
| Multiple rapid payroll actions | Each triggers independent pushes — no dedup needed |

**Core principle:** Push is a **side effect** that never influences the success or failure of the business action that triggered it.

### Logging
- Push failures logged via existing `logError()` with type `'PUSH'`
- Successful subscription changes logged via `createLogs()` with level `'INFO'`, type `'SYSTEM'`
- Subscription counts per push attempt can be logged at `'DEBUG'` level (future)

## 7. Migration & Rollback

### Database Migration

New table `push_subscriptions`:

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh_key  TEXT NOT NULL,
    auth_key    TEXT NOT NULL,
    user_agent  TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);
```

**Pre-setup:** VAPID env vars have been added to `.env.example` and `.env.local` with placeholder values. Before development, generate real keys:

```bash
npx web-push generate-vapid-keys
```

Then copy the output into both `.env.example` and `.env.local`.

**Migration action:** Create a new Drizzle migration file with the above DDL.

### Rollback

1. **Database:** Drop the `push_subscriptions` table (no data loss risk — subscriptions are ephemeral)
2. **Code:** Revert the modified files and delete the new files
3. **Env vars:** Remove `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` from `.env.local`
4. **Dependency:** `bun remove web-push @types/web-push`

**Backward compatibility:** The existing `notifications` table and in-app toast system are completely unaffected. The service worker without push event listeners still functions as a caching SW. No existing API contracts are changed.

## 8. Testing Strategy

- **Unit/Integration:** TDD mandatory per implementation plan
  - Server action tests for subscribe/unsubscribe auth enforcement
  - Push trigger tests for fire-and-forget behavior and 410 cleanup
  - Hook tests for subscription lifecycle state transitions
- **E2E Browser Testing:** OPTED-IN
  - **Flow to cover:** User settings page → toggle push notifications → browser prompts for permission → grant → verify subscription appears in DB → toggle off → verify subscription removed from DB
  - **Note:** True push notification delivery cannot be verified in headless E2E (no push service). Test validates the subscription lifecycle at the DB level.

### E2E Browser Test Flow
1. Navigate to user settings page
2. Locate push notification toggle
3. Toggle "Enable" → browser permission prompt appears → grant
4. Confirm UI shows "subscribed" state
5. Verify via server action that subscription exists in DB for this user
6. Toggle "Disable"
7. Confirm UI shows "unsubscribed" state
8. Verify via server action that subscription is removed from DB

## 9. Open Questions

- **Where to render the PushNotificationSettings component?** The existing user settings page location needs to be identified during implementation planning. Options: dedicated section in profile settings, or a new tab in the user settings panel.
- **Notification payload for disbursement completion:** When a request is fully disbursed (auto-completed), should we send one push about the disbursement or two (one for partial disbursement + one for completion)? Decision: only send a push for the disbursement. Full completion is an internal state transition, not a user-facing event.
- **Browser compatibility:** Web Push is supported in all modern browsers. iOS Safari PWA push support was added in iOS 16.4+. Edge case documented, no action needed.
