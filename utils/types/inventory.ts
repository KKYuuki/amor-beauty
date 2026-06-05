import { Branch } from "./branch"

export type InventoryType = "ITEM" | "FLUID"

export type InventoryCategory = "TATTOO" | "PIERCING" | "EQUIPMENT" | "FOOD" | "APPAREL" | "OTHER"

export interface InventoryItem {
    id: string,
    created_at: string,
    updated_at: string,
    name: string,
    item_code?: string,
    description?: string,
    external_link?: string,
    // General Information
    item_type: InventoryType,
    item_category: InventoryCategory,
    current_stock: number,
    stock_warning_threshold?: number,
    unit_price?: number,
    selling_price?: number,
    last_restocked?: string,
    // Tracking Fluids
    fluid_unit_size?: number,
    fluid_remaining?: number,
    fluid_unit_of_measure?: string,
    // Tracking Perishables
    is_perishable: boolean,
    expiration_date?: Date,
    is_active: boolean,
    show_in_sales: boolean,

    // Branch assignment
    branch_id?: string | null,
    is_shared: boolean,
    branch?: Branch
}

export interface CreateInventoryItemPayload {
    name: string,
    item_code?: string,
    description?: string,
    external_link?: string,
    // General Information
    item_type: InventoryType,
    item_category: InventoryCategory,
    current_stock: number,
    stock_warning_threshold?: number,
    unit_price?: number,
    selling_price?: number,
    last_restocked?: Date,
    // Tracking Fluids
    fluid_unit_size?: number,
    fluid_remaining?: number,
    fluid_unit_of_measure?: string,
    // Tracking Perishables
    is_perishable: boolean,
    expiration_date?: Date,
    show_in_sales?: boolean,

    // Branch assignment
    branch_id?: string | null,
    is_shared?: boolean
}

export interface InventoryRestockHistoryItem {
    id: string,
    restocked_at: string,
    inventory_item_id: string,
    quantity_added: number,
    new_total_stock?: number,
    unit_cost?: number,
    supplier_name?: string,
    order_reference?: string,
    invoice_number?: string,
    proof_link?: string,
    restocked_by?: string,
}

export interface CreateInventoryRestockHistoryItemPayload {
    inventory_item_id: string,
    quantity_added: number,
    new_total_stock?: number,
    unit_cost?: number,
    supplier_name?: string,
    order_reference?: string,
    invoice_number?: string,
    proof_link?: string,
}