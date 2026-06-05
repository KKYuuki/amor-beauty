'use server'

import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { db } from '@/server/db'
import { pushSubscriptions } from '@/server/db/schema/push-subscriptions'
import { getCurrentUser } from '@/utils/auth/permissions'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import { logError } from './logs'

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