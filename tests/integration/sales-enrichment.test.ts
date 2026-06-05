import { describe, test, expect } from "bun:test"
import { deriveSalesCategoryAndDescription } from "@/server/actions/accounting-ledger-utils"

describe("Sales accounting enrichment", () => {
    test("deriveSalesCategoryAndDescription is importable", () => {
        expect(deriveSalesCategoryAndDescription).toBeDefined()
    })

    test("new description format is used for single payment", () => {
        const items = [
            { service_type: "TATTOO" as const, item_name: "Butterfly", quantity: 1, unit_price: 3500 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-TEST-001")
        expect(result.description).toContain("Tattoo:")
        expect(result.description).toContain("Butterfly")
        expect(result.description).toContain("TXN-TEST-001")
        expect(result.category).toBe("Tattoo Services")
    })

    test("createTransaction server action exists", async () => {
        const { createTransaction } = await import("@/server/actions/transactions")
        expect(createTransaction).toBeDefined()
        expect(typeof createTransaction).toBe("function")
    })
})