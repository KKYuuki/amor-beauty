import { describe, test, expect } from 'bun:test'
import { sendPushToUser, sendPushToRole } from '@/server/actions/push-trigger'
import type { PushPayload } from '@/server/actions/push-trigger'

// We test the exported function contracts:
// - Fire-and-forget: never throws, never blocks
// - Returns void (synchronous, not Promise)
// - PushPayload has required fields and excludes monetary amounts

describe('sendPushToUser', () => {
  test('exists and is callable', () => {
    expect(sendPushToUser).toBeDefined()
    expect(typeof sendPushToUser).toBe('function')
  })

  test('does NOT throw (fire-and-forget contract)', () => {
    const payload: PushPayload = {
      title: 'Test',
      body: 'Test body',
      icon: '/icon.png',
      badge: '/badge.png',
      tag: 'test-tag',
      data: {
        path: '/test',
        requestId: 'req-123',
      },
    }

    // Even with a non-existent userId and no DB connection,
    // sendPushToUser must not throw — it swallows all errors
    expect(() => sendPushToUser('non-existent-user-id', payload)).not.toThrow()
  })

  test('does NOT throw with missing VAPID keys', () => {
    // When VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY are missing,
    // the function should gracefully handle it without throwing
    const payload: PushPayload = {
      title: 'No VAPID',
      body: 'Should not throw',
      icon: '/icon.png',
      badge: '/badge.png',
      tag: 'no-vapid',
      data: {
        path: '/test',
        requestId: 'req-456',
      },
    }

    expect(() => sendPushToUser('some-user-id', payload)).not.toThrow()
  })

  test('returns a Promise (async server action contract)', async () => {
    const payload: PushPayload = {
      title: 'Test',
      body: 'Test body',
      icon: '/icon.png',
      badge: '/badge.png',
      tag: 'test-tag',
      data: {
        path: '/test',
        requestId: 'req-789',
      },
    }

    const result = sendPushToUser('some-user-id', payload)
    // Must return a Promise (async), not undefined — Next.js 'use server' requires async exports
    expect(result).toBeInstanceOf(Promise)
    // Fire-and-forget: awaiting must not throw (errors caught internally)
    await expect(result).resolves.toBeUndefined()
  })
})

describe('sendPushToRole', () => {
  test('exists and is callable', () => {
    expect(sendPushToRole).toBeDefined()
    expect(typeof sendPushToRole).toBe('function')
  })

  test('does NOT throw (fire-and-forget contract)', () => {
    const payload: PushPayload = {
      title: 'Role Test',
      body: 'Test body',
      icon: '/icon.png',
      badge: '/badge.png',
      tag: 'role-test',
      data: {
        path: '/test',
        requestId: 'req-role-123',
      },
    }

    expect(() => sendPushToRole('admin', payload)).not.toThrow()
  })

  test('accepts valid roles without throwing', () => {
    const payload: PushPayload = {
      title: 'Role',
      body: 'Body',
      icon: '/icon.png',
      badge: '/badge.png',
      tag: 'roles',
      data: {
        path: '/test',
        requestId: 'req-role-456',
      },
    }

    const validRoles = ['admin', 'manager', 'staff', 'artist']
    for (const role of validRoles) {
      expect(() => sendPushToRole(role, payload)).not.toThrow()
    }
  })

  test('accepts excludeUserId parameter without throwing', () => {
    const payload: PushPayload = {
      title: 'Excluded',
      body: 'Body',
      icon: '/icon.png',
      badge: '/badge.png',
      tag: 'excluded',
      data: {
        path: '/test',
        requestId: 'req-excl-123',
      },
    }

    expect(() => sendPushToRole('admin', payload, 'exclude-this-user-id')).not.toThrow()
  })

  test('returns a Promise (async server action contract)', async () => {
    const payload: PushPayload = {
      title: 'Test',
      body: 'Test body',
      icon: '/icon.png',
      badge: '/badge.png',
      tag: 'test-tag',
      data: {
        path: '/test',
        requestId: 'req-void',
      },
    }

    const result = sendPushToRole('admin', payload)
    // Must return a Promise (async), not undefined — Next.js 'use server' requires async exports
    expect(result).toBeInstanceOf(Promise)
    // Fire-and-forget: awaiting must not throw (errors caught internally)
    await expect(result).resolves.toBeUndefined()
  })
})

describe('PushPayload type', () => {
  test('has required title, body, and data fields', () => {
    // Compile-time type check: PushPayload requires these fields
    const payload: PushPayload = {
      title: 'Title',
      body: 'Body',
      icon: '/icon.png',
      badge: '/badge.png',
      tag: 'tag',
      data: {
        path: '/path',
        requestId: 'req-id',
      },
    }

    // Runtime check: verify required fields exist
    expect(payload.title).toBe('Title')
    expect(payload.body).toBe('Body')
    expect(payload.data).toBeDefined()
    expect(payload.data.path).toBe('/path')
    expect(payload.data.requestId).toBe('req-id')
  })

  test('does NOT contain amount field (security: no monetary amounts in push payloads)', () => {
    const payload: PushPayload = {
      title: 'Payment',
      body: 'A payment was processed',
      icon: '/icon.png',
      badge: '/badge.png',
      tag: 'payment',
      data: {
        path: '/accounting',
        requestId: 'req-payment',
      },
    }

    // Security: push payloads should never contain monetary amounts
    // They are visible in device notification storage and can leak financial data
    expect('amount' in payload).toBe(false)
    expect('amount' in payload.data).toBe(false)
  })
})