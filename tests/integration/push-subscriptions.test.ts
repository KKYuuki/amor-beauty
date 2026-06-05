import { describe, test, expect } from "bun:test"
import { pushSubscriptions } from "@/server/db/schema/push-subscriptions"

describe("pushSubscriptions schema", () => {
  test("exports a Drizzle pgTable", () => {
    expect(pushSubscriptions).toBeDefined()
    expect(typeof pushSubscriptions).toBe("object")
    expect(pushSubscriptions.id).toBeDefined()
    expect(pushSubscriptions.userId).toBeDefined()
    expect(pushSubscriptions.endpoint).toBeDefined()
    expect(pushSubscriptions.p256dhKey).toBeDefined()
    expect(pushSubscriptions.authKey).toBeDefined()
  })

  test("endpoint column has unique constraint", () => {
    expect(pushSubscriptions.endpoint).toBeDefined()
    const columns = ["id", "userId", "endpoint", "p256dhKey", "authKey", "userAgent", "createdAt", "updatedAt"]
    for (const col of columns) {
      expect(pushSubscriptions).toHaveProperty(col)
    }
  })

  test("userId references user table", () => {
    expect(pushSubscriptions.userId).toBeDefined()
  })
})