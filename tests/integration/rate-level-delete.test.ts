import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { db } from "@/server/db"
import { rateLevels } from "@/server/db/schema/rate-levels"
import { payrollStaffRate } from "@/server/db/schema/payroll"
import { eq } from "drizzle-orm"

describe("Rate Level Deletion with Referencing Staff Rates", () => {
  let levelId: string
  let rateId: string

  beforeAll(async () => {
    // Create a rate level directly via DB (bypasses auth)
    const [level] = await db
      .insert(rateLevels)
      .values({ name: "Test Level for FK Test", slug: "test-level-for-fk-test" })
      .returning()
    levelId = level.id

    // Create a staff rate referencing that level directly via DB
    const [rate] = await db
      .insert(payrollStaffRate)
      .values({
        rateName: "Test FK Rate",
        serviceType: "HAIR",
        clientType: "WALKIN",
        rateLevelId: levelId,
        shopPercentage: "50",
        staffPercentage: "50",
        paymentMode: "PERCENTAGE",
      })
      .returning()
    rateId = rate.id
  })

  afterAll(async () => {
    // Clean up created test data
    if (rateId) {
      await db.delete(payrollStaffRate).where(eq(payrollStaffRate.id, rateId))
    }
    if (levelId) {
      await db.delete(rateLevels).where(eq(rateLevels.id, levelId))
    }
  })

  test("deleting a rate level with referencing staff rates sets FK to null (does not throw FK error)", async () => {
    // act: delete the rate level that has a staff rate referencing it
    let error: Error | null = null
    try {
      await db.delete(rateLevels).where(eq(rateLevels.id, levelId))
    } catch (e) {
      error = e as Error
    }

    // assert: no foreign key violation error
    expect(error).toBeNull()

    // assert: the referencing staff rate's rate_level_id is now null
    const [rate] = await db
      .select({ rateLevelId: payrollStaffRate.rateLevelId })
      .from(payrollStaffRate)
      .where(eq(payrollStaffRate.id, rateId))
      .limit(1)

    expect(rate.rateLevelId).toBeNull()
  })
})