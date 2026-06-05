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
    subject: process.env.VAPID_SUBJECT || 'mailto:admin@amorbeautylounge.com',
  }
}

function configureWebPush(): boolean {
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
 * Fire-and-forget: never throws (errors caught internally).
 * Async to satisfy Next.js 'use server' contract — callers may await or fire-and-forget.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  try {
    const subs = await db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dhKey: pushSubscriptions.p256dhKey,
        authKey: pushSubscriptions.authKey,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))

    await sendPushToSubscriptions(subs, payload)
  } catch (error) {
    await logError({
      type: 'PUSH',
      message: `Failed to query subscriptions for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
    }).catch(() => {})
  }
}

/**
 * Send a push notification to all users with a given role,
 * excluding the action user (to prevent self-notifications).
 * Fire-and-forget: never throws (errors caught internally).
 * Async to satisfy Next.js 'use server' contract — callers may await or fire-and-forget.
 */
export async function sendPushToRole(
  role: string,
  payload: PushPayload,
  excludeUserId?: string
): Promise<void> {
  try {
    const conditions = [eq(user.role, role)]
    if (excludeUserId) {
      conditions.push(ne(user.id, excludeUserId))
    }

    const subs = await db
      .select({
        endpoint: pushSubscriptions.endpoint,
        p256dhKey: pushSubscriptions.p256dhKey,
        authKey: pushSubscriptions.authKey,
      })
      .from(pushSubscriptions)
      .innerJoin(user, eq(pushSubscriptions.userId, user.id))
      .where(and(...conditions))

    await sendPushToSubscriptions(subs, payload)
  } catch (error) {
    await logError({
      type: 'PUSH',
      message: `Failed to query subscriptions for role ${role}: ${error instanceof Error ? error.message : String(error)}`
    }).catch(() => {})
  }
}