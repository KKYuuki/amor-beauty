import { describe, test, expect } from "bun:test"
import { deriveSalesCategoryAndDescription } from "@/server/actions/accounting-ledger-utils"

describe("deriveSalesCategoryAndDescription", () => {
    test("single HAIR service type returns 'Hair Services' category and enriched description", () => {
        const items = [
            { service_type: "HAIR" as const, item_name: "Haircut & Style", quantity: 1, unit_price: 1500 },
            { service_type: "HAIR" as const, item_name: "Hair Color", quantity: 1, unit_price: 3000 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-001")
        expect(result.category).toBe("Hair Services")
        expect(result.description).toBe("Hair: Haircut & Style, Hair Color (TXN-001)")
    })

    test("mixed service types fall back to 'Services' category and generic Services description", () => {
        const items = [
            { service_type: "HAIR" as const, item_name: "Haircut", quantity: 1, unit_price: 1500 },
            { service_type: "NAILS" as const, item_name: "Gel Manicure", quantity: 1, unit_price: 800 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-002")
        expect(result.category).toBe("Services")
        expect(result.description).toBe("Services: Haircut, Gel Manicure (TXN-002)")
    })

    test("no items returns 'SALES' category and generic Sale description", () => {
        const result = deriveSalesCategoryAndDescription([], "TXN-003")
        expect(result.category).toBe("SALES")
        expect(result.description).toBe("Sale: TXN-003")
    })

    test("user-authored salesDescription takes precedence", () => {
        const items = [
            { service_type: "HAIR" as const, item_name: "Haircut", quantity: 1, unit_price: 1500 },
        ]
        const result = deriveSalesCategoryAndDescription(
            items,
            "TXN-004",
            "Custom styling with treatment"
        )
        expect(result.category).toBe("Hair Services")
        expect(result.description).toBe("Custom styling with treatment | Haircut (TXN-004)")
    })

    test("NAILS service type uses 'Nail Services' category and Nails prefix", () => {
        const items = [
            { service_type: "NAILS" as const, item_name: "Gel Manicure", quantity: 1, unit_price: 800 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-005")
        expect(result.category).toBe("Nail Services")
        expect(result.description).toBe("Nails: Gel Manicure (TXN-005)")
    })

    test("FACIAL service type uses 'Facial Services' category and Facial prefix", () => {
        const items = [
            { service_type: "FACIAL" as const, item_name: "Classic Facial", quantity: 1, unit_price: 1200 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-006")
        expect(result.category).toBe("Facial Services")
        expect(result.description).toBe("Facial: Classic Facial (TXN-006)")
    })

    test("MANUAL service type uses 'Services' category and generic Services description", () => {
        const items = [
            { service_type: "MANUAL" as const, item_name: "Custom Work", quantity: 1, unit_price: 2000 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-007")
        expect(result.category).toBe("Services")
        expect(result.description).toBe("Services: Custom Work (TXN-007)")
    })

    test("inventory items without service_type use 'SALES' category and generic Sale", () => {
        const items = [
            { item_name: "Shampoo Bottle", quantity: 1, unit_price: 500 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-008")
        expect(result.category).toBe("SALES")
        expect(result.description).toBe("Sale: Shampoo Bottle (TXN-008)")
    })

    test("includes staff name in description when provided", () => {
        const items = [
            { service_type: "HAIR" as const, item_name: "Haircut & Style", quantity: 1, unit_price: 1500 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-009", undefined, "Juan")
        expect(result.category).toBe("Hair Services")
        expect(result.description).toBe("Staff: Juan | Hair: Haircut & Style (TXN-009)")
    })

    test("includes staff name in description for inventory-only with staff", () => {
        const items = [
            { item_name: "Shampoo Bottle", quantity: 2, unit_price: 500 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-010", undefined, "Maria")
        expect(result.category).toBe("SALES")
        expect(result.description).toBe("Staff: Maria | Sale: Shampoo Bottle (TXN-010)")
    })

    test("includes staff name in description for mixed services", () => {
        const items = [
            { service_type: "HAIR" as const, item_name: "Haircut", quantity: 1, unit_price: 1500 },
            { service_type: "NAILS" as const, item_name: "Manicure", quantity: 1, unit_price: 800 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-011", undefined, "Pedro")
        expect(result.category).toBe("Services")
        expect(result.description).toBe("Staff: Pedro | Services: Haircut, Manicure (TXN-011)")
    })

    test("includes staff name in description with user-authored salesDescription", () => {
        const items = [
            { service_type: "HAIR" as const, item_name: "Haircut", quantity: 1, unit_price: 1500 },
        ]
        const result = deriveSalesCategoryAndDescription(
            items,
            "TXN-012",
            "Custom styling",
            "Juan"
        )
        expect(result.category).toBe("Hair Services")
        expect(result.description).toBe("Staff: Juan | Custom styling | Haircut (TXN-012)")
    })
})
