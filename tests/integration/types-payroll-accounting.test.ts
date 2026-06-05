import { describe, test, expect } from "bun:test"
import type { LedgerEntry } from "@/utils/types/ledger"
import type { PayrollEntry, PayrollEntryTransactionItem } from "@/utils/types/payroll"

describe("LedgerEntry type", () => {
    test("accepts optional staff_cut and shop_cut fields", () => {
        // Compile-time type check: these fields should be optional on LedgerEntry
        const entry: Partial<LedgerEntry> = {
            id: "1",
            staff_cut: 500,
            shop_cut: 300,
        }
        expect(entry.staff_cut).toBe(500)
        expect(entry.shop_cut).toBe(300)
        // Non-PAYROLL entries should be able to omit these fields
        const noCutEntry: Partial<LedgerEntry> = {
            id: "2",
            description: "Test",
        }
        expect(noCutEntry.staff_cut).toBeUndefined()
        expect(noCutEntry.shop_cut).toBeUndefined()
    })
})

describe("PayrollEntryTransactionItem type", () => {
    test("has expected shape", () => {
        const item: PayrollEntryTransactionItem = {
            item_name: "Haircut",
            quantity: 1,
            unit_price: 1500,
            line_total: 1500,
            service_type: "HAIR",
            service_id: "svc-1",
            staff_cut: 750,
            shop_cut: 750,
        }
        expect(item.item_name).toBe("Haircut")
        expect(item.service_type).toBe("HAIR")
        expect(item.staff_cut).toBe(2500)
    })

    test("omits optional fields gracefully", () => {
        const item: PayrollEntryTransactionItem = {
            item_name: "Item",
            quantity: 1,
            unit_price: 100,
            line_total: 100,
        }
        expect(item.service_type).toBeUndefined()
        expect(item.staff_cut).toBeUndefined()
    })
})

describe("PayrollEntry type", () => {
    test("accepts optional transaction_items field", () => {
        const entry: Partial<PayrollEntry> = {
            id: "pe-1",
            transaction_items: [
                { item_name: "Haircut", quantity: 1, unit_price: 1500, line_total: 1500 },
            ],
        }
        expect(entry.transaction_items).toBeDefined()
        expect(entry.transaction_items?.length).toBe(1)
    })
})