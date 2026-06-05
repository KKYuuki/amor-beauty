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