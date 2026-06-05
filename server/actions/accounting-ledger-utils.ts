import { ServiceType } from "@/utils/types/payroll"

interface ItemForDescription {
    service_type?: ServiceType
    item_name: string
    quantity: number
    unit_price: number
    service_id?: string
}

interface SalesDescriptionResult {
    category: string
    description: string
}

const SERVICE_TYPE_PREFIX: Record<string, string> = {
    TATTOO: "Tattoo",
    PIERCING: "Piercing",
    SHOE: "Shoe",
}

const SERVICE_TYPE_CATEGORY: Record<string, string> = {
    TATTOO: "Tattoo Services",
    PIERCING: "Piercing Services",
    SHOE: "Shoe Services",
    MANUAL: "Services",
}

export function deriveSalesCategoryAndDescription(
    items: ItemForDescription[],
    transactionNumber: string,
    salesDescription?: string,
    staffName?: string
): SalesDescriptionResult {
    // Collect item names
    const itemNames = items.map((item) => item.item_name)
    const itemsText = itemNames.join(", ")

    // Determine primary service type (exclude MANUAL)
    const serviceTypes = new Set(
        items
            .filter((item) => item.service_type && item.service_type !== "MANUAL")
            .map((item) => item.service_type as string)
    )

    // Determine if any item has a service type
    const hasServices = items.some((item) => item.service_type)

    // Determine category dynamically
    let category: string
    if (!hasServices) {
        // Inventory-only transaction — keep as Sales
        category = "SALES"
    } else if (serviceTypes.size === 1) {
        // Single service type — use its mapped category
        const type = [...serviceTypes][0]
        category = SERVICE_TYPE_CATEGORY[type] || "Services"
    } else if (serviceTypes.size > 1) {
        // Mixed service types — use "Services"
        category = "Services"
    } else {
        // Only MANUAL service type
        category = "Services"
    }

    // Build staff prefix for description
    const staffPrefix = staffName ? `Staff: ${staffName} | ` : ""

    // Build description
    let description: string

    if (salesDescription) {
        // User-authored description takes precedence
        description = `${staffPrefix}${salesDescription} | ${itemsText} (${transactionNumber})`
    } else if (serviceTypes.size === 1) {
        // Single service type — use its prefix
        const type = [...serviceTypes][0]
        const prefix = SERVICE_TYPE_PREFIX[type] || type
        description = `${staffPrefix}${prefix}: ${itemsText} (${transactionNumber})`
    } else if (items.length > 0) {
        // Mixed, MANUAL-only, or inventory — generic Sale/Services
        const label = hasServices ? "Services" : "Sale"
        description = `${staffPrefix}${label}: ${itemsText} (${transactionNumber})`
    } else {
        // No items at all
        description = `${staffPrefix}Sale: ${transactionNumber}`
    }

    return { category, description }
}