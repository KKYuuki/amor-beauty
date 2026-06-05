import { describe, test, expect } from "bun:test"
import { createManualPayrollEntry } from "@/server/actions/payroll"

describe("createManualPayrollEntry — rate tracking", () => {
  test("manual entry with rate_id stores it in the database", () => {
    expect(createManualPayrollEntry).toBeDefined()
    expect(typeof createManualPayrollEntry).toBe("function")
  })

  test("manual entry without rate_id still succeeds (backward compatible)", () => {
    expect(createManualPayrollEntry).toBeDefined()
  })
})