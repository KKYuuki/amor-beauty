import { describe, test, expect } from "bun:test"

describe("usePushNotifications hook", () => {
  test("module exports the usePushNotifications function", async () => {
    const mod = await import("@/hooks/use-push-notifications")
    expect(mod.usePushNotifications).toBeDefined()
    expect(typeof mod.usePushNotifications).toBe("function")
  })

  test("module does not throw during static import", async () => {
    expect(async () => {
      await import("@/hooks/use-push-notifications")
    }).not.toThrow()
  })
})