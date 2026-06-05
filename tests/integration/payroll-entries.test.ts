import { describe, test, expect } from "bun:test"
import {
    getPayrollEntryTransactionItems,
    getPayrollDashboardSummary,
    getPayrollEntries,
} from "@/server/actions/payroll"
import type { PayrollEntryTransactionItem } from "@/utils/types/payroll"

describe("getPayrollEntryTransactionItems", () => {
    test("function exists and is callable", () => {
        expect(getPayrollEntryTransactionItems).toBeDefined()
        expect(typeof getPayrollEntryTransactionItems).toBe("function")
    })

    test("returns failure for invalid entry ID", async () => {
        const result = await getPayrollEntryTransactionItems("non-existent-id")
        expect(result.success).toBe(false)
    })

    test("returns PayrollEntryTransactionItem[] shape on success", async () => {
        const entries = await getPayrollEntries({ pageSize: 1 })
        if (entries.success && entries.data.data.length > 0) {
            const entryId = entries.data.data[0].id
            const result = await getPayrollEntryTransactionItems(entryId)
            if (result.success) {
                expect(Array.isArray(result.data)).toBe(true)
                if (result.data.length > 0) {
                    const item = result.data[0] as PayrollEntryTransactionItem
                    expect(typeof item.item_name).toBe("string")
                    expect(typeof item.quantity).toBe("number")
                    expect(typeof item.unit_price).toBe("number")
                    expect(typeof item.line_total).toBe("number")
                }
            }
        }
    })
})

describe("getPayrollDashboardSummary date filtering", () => {
    test("returns summary for today without error", async () => {
        const today = new Date().toISOString().split("T")[0]
        const result = await getPayrollDashboardSummary(
            null,
            today,
            today
        )
        expect(result.success).toBe(true)
        if (result.success && result.data) {
            expect(typeof result.data.pendingAmount).toBe("number")
            expect(typeof result.data.pendingCount).toBe("number")
        }
    })

    test("returns summary for this week without error", async () => {
        const now = new Date()
        const startOfWeek = new Date(now)
        startOfWeek.setDate(now.getDate() - now.getDay())
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 6)

        const result = await getPayrollDashboardSummary(
            null,
            startOfWeek.toISOString().split("T")[0],
            endOfWeek.toISOString().split("T")[0]
        )
        expect(result.success).toBe(true)
    })

    test("returns summary for this year without error", async () => {
        const year = new Date().getFullYear()
        const result = await getPayrollDashboardSummary(
            null,
            `${year}-01-01`,
            `${year}-12-31`
        )
        expect(result.success).toBe(true)
    })
})