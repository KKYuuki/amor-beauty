#!/usr/bin/env bun
import { config } from "dotenv"
config({ path: ".env.local" })

import { db } from "../server/db"
import { user } from "../server/db/schema/auth"
import { branches } from "../server/db/schema/branches"
import { services } from "../server/db/schema/services"
import { inventory } from "../server/db/schema/inventory"
import { payrollStaffRate } from "../server/db/schema/payroll"
import { eq, sql } from "drizzle-orm"

const TEST_ACCOUNTS = [
  { email: "e2e-admin@rdmdstudio.com", role: "admin" },
  { email: "e2e-manager@rdmdstudio.com", role: "manager" },
  { email: "e2e-artist@rdmdstudio.com", role: "artist" },
  { email: "e2e-staff@rdmdstudio.com", role: "staff" },
]

const CHECKS: { name: string; fn: () => Promise<boolean> }[] = [
  {
    name: "Dev server running",
    fn: async (): Promise<boolean> => {
      try {
        const res = await fetch("http://localhost:3000", { signal: AbortSignal.timeout(5000) })
        return res.ok || res.status === 307 || res.status === 302 || res.status === 200
      } catch {
        return false
      }
    },
  },
  {
    name: "Test accounts active",
    fn: async (): Promise<boolean> => {
      for (const acc of TEST_ACCOUNTS) {
        const rows = await db
          .select({ isActive: user.isActive })
          .from(user)
          .where(eq(user.email, acc.email))
          .limit(1)
        if (rows.length === 0 || !rows[0].isActive) {
          console.log(`   ✗ ${acc.email}: ${rows.length === 0 ? "not found" : "inactive"}`)
          return false
        }
      }
      return true
    },
  },
  {
    name: "At least 1 branch exists",
    fn: async (): Promise<boolean> => {
      const rows = await db.select({ count: sql<number>`count(*)` }).from(branches)
      return (rows[0]?.count ?? 0) >= 1
    },
  },
  {
    name: "E2E services present (>= 4)",
    fn: async (): Promise<boolean> => {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(services)
        .where(sql`${services.title} LIKE ${'%[E2E]%'}`)
      return (rows[0]?.count ?? 0) >= 4
    },
  },
  {
    name: "E2E inventory present (>= 3)",
    fn: async (): Promise<boolean> => {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(inventory)
        .where(sql`${inventory.name} LIKE ${'%[E2E]%'}`)
      return (rows[0]?.count ?? 0) >= 3
    },
  },
  {
    name: "Payroll rates present (>= 18)",
    fn: async (): Promise<boolean> => {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(payrollStaffRate)
        .where(eq(payrollStaffRate.isActive, true))
      return (rows[0]?.count ?? 0) >= 18
    },
  },
]

async function main() {
  console.log("🔍 E2E Precondition Check\n")
  let allPassed = true

  for (const check of CHECKS) {
    process.stdout.write(`  ${check.name}... `)
    try {
      const passed = await check.fn()
      if (passed) {
        console.log("✅")
      } else {
        console.log("❌ FAILED")
        allPassed = false
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`❌ ERROR: ${message}`)
      allPassed = false
    }
  }

  console.log(`\n${allPassed ? "✅ All preconditions met — ready for testing." : "❌ Some preconditions failed. Fix before continuing."}`)
  process.exit(allPassed ? 0 : 1)
}

main()