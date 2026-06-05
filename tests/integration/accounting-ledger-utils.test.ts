import { describe, test, expect } from "bun:test"
import { deriveSalesCategoryAndDescription } from "@/server/actions/accounting-ledger-utils"

describe("deriveSalesCategoryAndDescription", () => {
    test("single TATTOO service type returns 'Tattoo Services' category and enriched description", () => {
        const items = [
            { service_type: "TATTOO" as const, item_name: "Dragon Design", quantity: 1, unit_price: 5000 },
            { service_type: "TATTOO" as const, item_name: "Tiger", quantity: 1, unit_price: 3000 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-001")
        expect(result.category).toBe("Tattoo Services")
        expect(result.description).toBe("Tattoo: Dragon Design, Tiger (TXN-001)")
    })

    test("mixed service types fall back to 'Services' category and generic Services description", () => {
        const items = [
            { service_type: "TATTOO" as const, item_name: "Dragon", quantity: 1, unit_price: 5000 },
            { service_type: "PIERCING" as const, item_name: "Nose Stud", quantity: 1, unit_price: 500 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-002")
        expect(result.category).toBe("Services")
        expect(result.description).toBe("Services: Dragon, Nose Stud (TXN-002)")
    })

    test("no items returns 'SALES' category and generic Sale description", () => {
        const result = deriveSalesCategoryAndDescription([], "TXN-003")
        expect(result.category).toBe("SALES")
        expect(result.description).toBe("Sale: TXN-003")
    })

    test("user-authored salesDescription takes precedence", () => {
        const items = [
            { service_type: "TATTOO" as const, item_name: "Dragon", quantity: 1, unit_price: 5000 },
        ]
        const result = deriveSalesCategoryAndDescription(
            items,
            "TXN-004",
            "Custom sleeve tattoo with aftercare"
        )
        expect(result.category).toBe("Tattoo Services")
        expect(result.description).toBe("Custom sleeve tattoo with aftercare | Dragon (TXN-004)")
    })

    test("PIERCING service type uses 'Piercing Services' category and Piercing prefix", () => {
        const items = [
            { service_type: "PIERCING" as const, item_name: "Ear Lobe", quantity: 2, unit_price: 300 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-005")
        expect(result.category).toBe("Piercing Services")
        expect(result.description).toBe("Piercing: Ear Lobe (TXN-005)")
    })

    test("SHOE service type uses 'Shoe Services' category and Shoe prefix", () => {
        const items = [
            { service_type: "SHOE" as const, item_name: "Deep Clean", quantity: 1, unit_price: 1500 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-006")
        expect(result.category).toBe("Shoe Services")
        expect(result.description).toBe("Shoe: Deep Clean (TXN-006)")
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
            { item_name: "Ink Bottle", quantity: 1, unit_price: 500 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-008")
        expect(result.category).toBe("SALES")
        expect(result.description).toBe("Sale: Ink Bottle (TXN-008)")
    })

    test("includes staff name in description when provided", () => {
        const items = [
            { service_type: "TATTOO" as const, item_name: "Dragon Design", quantity: 1, unit_price: 5000 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-009", undefined, "Juan")
        expect(result.category).toBe("Tattoo Services")
        expect(result.description).toBe("Staff: Juan | Tattoo: Dragon Design (TXN-009)")
    })

    test("includes staff name in description for inventory-only with staff", () => {
        const items = [
            { item_name: "Ink Bottle", quantity: 2, unit_price: 500 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-010", undefined, "Maria")
        expect(result.category).toBe("SALES")
        expect(result.description).toBe("Staff: Maria | Sale: Ink Bottle (TXN-010)")
    })

    test("includes staff name in description for mixed services", () => {
        const items = [
            { service_type: "TATTOO" as const, item_name: "Dragon", quantity: 1, unit_price: 5000 },
            { service_type: "PIERCING" as const, item_name: "Nose Stud", quantity: 1, unit_price: 500 },
        ]
        const result = deriveSalesCategoryAndDescription(items, "TXN-011", undefined, "Pedro")
        expect(result.category).toBe("Services")
        expect(result.description).toBe("Staff: Pedro | Services: Dragon, Nose Stud (TXN-011)")
    })

    test("includes staff name in description with user-authored salesDescription", () => {
        const items = [
            { service_type: "TATTOO" as const, item_name: "Dragon", quantity: 1, unit_price: 5000 },
        ]
        const result = deriveSalesCategoryAndDescription(
            items,
            "TXN-012",
            "Custom sleeve tattoo",
            "Juan"
        )
        expect(result.category).toBe("Tattoo Services")
        expect(result.description).toBe("Staff: Juan | Custom sleeve tattoo | Dragon (TXN-012)")
    })
})
