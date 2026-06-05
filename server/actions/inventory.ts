'use server'

import { z } from 'zod'
import { sanitizeText, sanitizeMinimal } from '@/utils/sanitize'
import { db } from '@/server/db'
import { inventory, restockLog } from '@/server/db/schema'
import { eq, desc, and, or, sql, SQL, isNull } from 'drizzle-orm'
import { CreateInventoryItemPayload, CreateInventoryRestockHistoryItemPayload, InventoryItem, InventoryRestockHistoryItem } from "@/utils/types/inventory"
import { createLogs, logError } from "./logs"
import { ActionResponse, success, failure } from "@/utils/types/responses"
import { sendUserNotification } from "./profile"
import {
    ExportFormat,
    formatInventoryForExport,
    generateInventoryCSV,
    generateInventoryExcel
} from "@/utils/export-utils"
// generateInventoryPDF is dynamically imported at the call site (avoids server-only guard in tests)
import { DateRangePreset } from "@/utils/date-utils"
import { uploadFile } from "@/utils/storage"
import { getCurrentUser } from '@/utils/auth/permissions'
import { canManageInventory } from '@/utils/auth/permissions'
import { createAutoLedgerEntry } from './accounting'
import { withTransaction } from '@/server/db/transactions'

const CreateInventoryItemSchema = z.object({
    name: z.string().min(1, 'Item name is required'),
    item_code: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    external_link: z.string().url().optional().nullable().or(z.literal('')),
    item_type: z.enum(['ITEM', 'FLUID']),
    item_category: z.enum(['TATTOO', 'PIERCING', 'EQUIPMENT', 'FOOD', 'APPAREL', 'OTHER']),
    current_stock: z.coerce.number().min(0, 'Stock must be non-negative'),
    stock_warning_threshold: z.coerce.number().min(0).optional().nullable(),
    unit_price: z.coerce.number().min(0).optional().nullable(),
    selling_price: z.coerce.number().min(0).optional().nullable(),
    last_restocked: z.coerce.date().optional().nullable(),
    fluid_unit_size: z.coerce.number().min(0).optional().nullable(),
    fluid_remaining: z.coerce.number().min(0).optional().nullable(),
    fluid_unit_of_measure: z.string().optional().nullable(),
    is_perishable: z.coerce.boolean(),
    expiration_date: z.coerce.date().optional().nullable(),
    show_in_sales: z.coerce.boolean(),
})

const UpdateInventoryItemSchema = z.object({
    name: z.string().min(1).optional(),
    item_code: z.string().optional(),
    description: z.string().optional(),
    external_link: z.string().url().optional().or(z.literal('')),
    item_type: z.enum(['ITEM', 'FLUID']).optional(),
    item_category: z.enum(['TATTOO', 'PIERCING', 'EQUIPMENT', 'FOOD', 'APPAREL', 'OTHER']).optional(),
    current_stock: z.number().min(0).optional(),
    stock_warning_threshold: z.number().min(0).optional(),
    unit_price: z.number().min(0).optional(),
    selling_price: z.number().min(0).optional(),
    last_restocked: z.date().optional(),
    fluid_unit_size: z.number().min(0).optional(),
    fluid_remaining: z.number().min(0).optional(),
    fluid_unit_of_measure: z.string().optional(),
    is_perishable: z.boolean().optional(),
    expiration_date: z.date().optional(),
    show_in_sales: z.boolean().optional(),
}).partial()

export interface GetInventoryOptions {
    branchId?: string | null
}

export async function getInventory(options?: GetInventoryOptions): Promise<InventoryItem[]> {
    const user = await getCurrentUser()
    if (!user) {
        return []
    }

    try {
        // Build where conditions
        const baseCondition = eq(inventory.isActive, true)
        
        let finalCondition = baseCondition
        
        if (options?.branchId) {
            // Filter by branch OR shared items OR global items (branchId is null)
            const branchCondition = or(
                eq(inventory.branchId, options.branchId),
                eq(inventory.isShared, true),
                isNull(inventory.branchId)
            )
            if (branchCondition) {
                finalCondition = and(baseCondition, branchCondition) as SQL<unknown>
            }
        }

        const items = await db
            .select()
            .from(inventory)
            .where(finalCondition)
            .orderBy(desc(inventory.createdAt))

        return items.map(item => ({
            id: item.id,
            created_at: item.createdAt.toISOString(),
            updated_at: item.updatedAt.toISOString(),
            name: item.name,
            item_code: item.itemCode || undefined,
            description: item.description || undefined,
            external_link: item.externalLink || undefined,
            item_type: item.itemType as InventoryItem['item_type'],
            item_category: item.itemCategory as InventoryItem['item_category'],
            current_stock: Number(item.currentStock),
            stock_warning_threshold: item.stockWarningThreshold ? Number(item.stockWarningThreshold) : undefined,
            unit_price: item.unitPrice ? Number(item.unitPrice) : undefined,
            selling_price: item.sellingPrice ? Number(item.sellingPrice) : undefined,
            last_restocked: item.lastRestocked?.toISOString(),
            fluid_unit_size: item.fluidUnitSize ? Number(item.fluidUnitSize) : undefined,
            fluid_remaining: item.fluidRemaining ? Number(item.fluidRemaining) : undefined,
            fluid_unit_of_measure: item.fluidUnitOfMeasure || undefined,
            is_perishable: item.isPerishable,
            expiration_date: item.expirationDate || undefined,
            is_active: item.isActive,
            show_in_sales: item.showInSales,
            branch_id: item.branchId,
            is_shared: item.isShared,
        }))
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Failed to fetch inventory: ${error instanceof Error ? error.message : String(error)}`
        })
        return []
    }
}

export async function getInactiveInventory(options?: GetInventoryOptions): Promise<InventoryItem[]> {
    const user = await getCurrentUser()
    if (!user) {
        return []
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return []
    }

    try {
        // Build where conditions
        const baseCondition = eq(inventory.isActive, false)
        
        let finalCondition: SQL<unknown> = baseCondition
        
        if (options?.branchId) {
            // Filter by branch OR shared items OR global items (branchId is null)
            const branchCondition = or(
                eq(inventory.branchId, options.branchId),
                eq(inventory.isShared, true),
                isNull(inventory.branchId)
            )
            if (branchCondition) {
                finalCondition = and(baseCondition, branchCondition) as SQL<unknown>
            }
        }

        const items = await db
            .select()
            .from(inventory)
            .where(finalCondition)
            .orderBy(desc(inventory.createdAt))

        return items.map(item => ({
            id: item.id,
            created_at: item.createdAt.toISOString(),
            updated_at: item.updatedAt.toISOString(),
            name: item.name,
            item_code: item.itemCode || undefined,
            description: item.description || undefined,
            external_link: item.externalLink || undefined,
            item_type: item.itemType as InventoryItem['item_type'],
            item_category: item.itemCategory as InventoryItem['item_category'],
            current_stock: Number(item.currentStock),
            stock_warning_threshold: item.stockWarningThreshold ? Number(item.stockWarningThreshold) : undefined,
            unit_price: item.unitPrice ? Number(item.unitPrice) : undefined,
            selling_price: item.sellingPrice ? Number(item.sellingPrice) : undefined,
            last_restocked: item.lastRestocked?.toISOString(),
            fluid_unit_size: item.fluidUnitSize ? Number(item.fluidUnitSize) : undefined,
            fluid_remaining: item.fluidRemaining ? Number(item.fluidRemaining) : undefined,
            fluid_unit_of_measure: item.fluidUnitOfMeasure || undefined,
            is_perishable: item.isPerishable,
            expiration_date: item.expirationDate || undefined,
            is_active: item.isActive,
            show_in_sales: item.showInSales,
            branch_id: item.branchId,
            is_shared: item.isShared,
        }))
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Failed to fetch inactive inventory: ${error instanceof Error ? error.message : String(error)}`
        })
        return []
    }
}

export async function getInventoryItem(item_id: string): Promise<InventoryItem | null> {
    const user = await getCurrentUser()
    if (!user) {
        return null
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return null
    }

    try {
        const [item] = await db
            .select()
            .from(inventory)
            .where(eq(inventory.id, item_id))

        if (!item) {
            return null
        }

        return {
            id: item.id,
            created_at: item.createdAt.toISOString(),
            updated_at: item.updatedAt.toISOString(),
            name: item.name,
            item_code: item.itemCode || undefined,
            description: item.description || undefined,
            external_link: item.externalLink || undefined,
            item_type: item.itemType as InventoryItem['item_type'],
            item_category: item.itemCategory as InventoryItem['item_category'],
            current_stock: Number(item.currentStock),
            stock_warning_threshold: item.stockWarningThreshold ? Number(item.stockWarningThreshold) : undefined,
            unit_price: item.unitPrice ? Number(item.unitPrice) : undefined,
            selling_price: item.sellingPrice ? Number(item.sellingPrice) : undefined,
            last_restocked: item.lastRestocked?.toISOString(),
            fluid_unit_size: item.fluidUnitSize ? Number(item.fluidUnitSize) : undefined,
            fluid_remaining: item.fluidRemaining ? Number(item.fluidRemaining) : undefined,
            fluid_unit_of_measure: item.fluidUnitOfMeasure || undefined,
            is_perishable: item.isPerishable,
            expiration_date: item.expirationDate || undefined,
            is_active: item.isActive,
            show_in_sales: item.showInSales,
            branch_id: item.branchId,
            is_shared: item.isShared,
        }
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Failed to fetch inventory item: ${error instanceof Error ? error.message : String(error)}`
        })
        return null
    }
}

export async function getItemRestockHistory(item_id: string): Promise<InventoryRestockHistoryItem[]> {
    const user = await getCurrentUser()
    if (!user) {
        return []
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return []
    }

    try {
        const logs = await db
            .select()
            .from(restockLog)
            .where(eq(restockLog.itemId, item_id))
            .orderBy(desc(restockLog.createdAt))

        return logs.map(log => ({
            id: log.id,
            restocked_at: (log.restockedAt || log.createdAt).toISOString(),
            inventory_item_id: log.itemId,
            quantity_added: Number(log.quantity),
            new_total_stock: undefined,
            unit_cost: log.cost ? Number(log.cost) : undefined,
            supplier_name: log.supplierName || undefined,
            order_reference: log.orderReference || undefined,
            invoice_number: log.invoiceNo || undefined,
            proof_link: log.proofLink || undefined,
            restocked_by: log.createdBy || undefined,
        }))
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Failed to fetch restock history: ${error instanceof Error ? error.message : String(error)}`
        })
        return []
    }
}

export async function createInventoryItem({ item }: { item: CreateInventoryItemPayload }): Promise<ActionResponse> {
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, error: "Unauthorized" }
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return { success: false, error: "Access denied" }
    }

    const validated = CreateInventoryItemSchema.safeParse(item)
    if (!validated.success) {
        const fieldErrors = validated.error.flatten().fieldErrors
        return {
            success: false,
            validationErrors: fieldErrors as Record<string, string[]>,
            error: "Validation failed",
        }
    }

    // Check for duplicate item code per branch (only active items)
    if (item.item_code) {
        const existingItem = await db
            .select()
            .from(inventory)
            .where(
                and(
                    eq(inventory.itemCode, item.item_code),
                    eq(inventory.isActive, true),
                    item.branch_id ? eq(inventory.branchId, item.branch_id) : isNull(inventory.branchId)
                )
            )
            .limit(1)

        if (existingItem.length > 0) {
            return {
                success: false,
                error: `Item code "${item.item_code}" already exists`,
            }
        }
    }

    try {
        await db.insert(inventory).values({
            name: sanitizeText(item.name),
            itemCode: item.item_code ? sanitizeMinimal(item.item_code) : undefined,
            description: item.description ? sanitizeText(item.description) : undefined,
            externalLink: item.external_link,
            itemType: item.item_type,
            itemCategory: item.item_category,
            currentStock: String(item.current_stock),
            stockWarningThreshold: item.stock_warning_threshold ? String(item.stock_warning_threshold) : null,
            unitPrice: item.unit_price ? String(item.unit_price) : null,
            sellingPrice: item.selling_price ? String(item.selling_price) : null,
            fluidUnitSize: item.fluid_unit_size ? String(item.fluid_unit_size) : null,
            fluidRemaining: item.fluid_remaining ? String(item.fluid_remaining) : null,
            fluidUnitOfMeasure: item.fluid_unit_of_measure ? sanitizeMinimal(item.fluid_unit_of_measure) : undefined,
            isPerishable: item.is_perishable,
            expirationDate: item.expiration_date,
            isActive: true,
            showInSales: item.show_in_sales ?? true,
            branchId: item.branch_id ?? null,
            isShared: item.is_shared ?? false,
        })

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'INVENTORY',
                message: `Created inventory item: ${item.name}`,
                user_id: user.id,
                branch_id: item.branch_id ?? undefined,
            }]
        })
        return success(undefined, `Successfully created ${item.name}`)
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Failed to create inventory item: ${error instanceof Error ? error.message : String(error)}`
        })
        return { success: false, error: `Failed to create item: ${error}` }
    }
}

export async function restockInventoryItem(
    {
        item_id, new_stock
    }: {
        item_id: string,
        new_stock: Partial<CreateInventoryRestockHistoryItemPayload>
    }
): Promise<ActionResponse> {
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, error: "Unauthorized" }
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return { success: false, error: "Access denied" }
    }

    const quantityAdded = new_stock.quantity_added || 0
    if (quantityAdded <= 0) {
        return { success: false, error: "Quantity must be greater than 0" }
    }

    // Wrap the read-update operation in a transaction with row-level locking
    const transactionResult = await withTransaction(async (tx) => {
        // Get current item with row-level lock to prevent race conditions
        const [item] = await tx
            .select()
            .from(inventory)
            .where(eq(inventory.id, item_id))
            .for('update')

        if (!item) {
            throw new Error("Item not found")
        }

        // Calculate new stock
        const currentStock = Number(item.currentStock)
        const newTotalStock = currentStock + quantityAdded

        // Update inventory
        await tx
            .update(inventory)
            .set({
                currentStock: String(newTotalStock),
                lastRestocked: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(inventory.id, item_id))

        // Create restock log
        await tx.insert(restockLog).values({
            itemId: item_id,
            quantity: String(quantityAdded),
            cost: new_stock.unit_cost ? String(new_stock.unit_cost) : null,
            invoiceNo: new_stock.invoice_number ? sanitizeMinimal(new_stock.invoice_number) : null,
            proofLink: new_stock.proof_link,
            supplierName: new_stock.supplier_name ? sanitizeText(new_stock.supplier_name) : null,
            orderReference: new_stock.order_reference ? sanitizeMinimal(new_stock.order_reference) : null,
            createdBy: user.id,
        })

        return { item }
    }, { action: 'INVENTORY', userId: user.id })

    if (!transactionResult.success) {
        return { success: false, error: transactionResult.error || "Transaction failed" }
    }

    const { item } = transactionResult.data

    createLogs({
        logs: [{
            level: 'INFO',
            type: 'INVENTORY',
            message: `Restocked item ${item.name}: +${quantityAdded}`,
            user_id: user.id,
            branch_id: item.branchId ?? undefined,
        }]
    })

    return success(undefined, `Successfully restocked ${item.name}`)
}

export async function updateInventoryItem({ item_id, updates }: { item_id: string, updates: Partial<CreateInventoryItemPayload> }): Promise<ActionResponse> {
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, error: "Unauthorized" }
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return { success: false, error: "Access denied" }
    }

    const validated = UpdateInventoryItemSchema.safeParse(updates)
    if (!validated.success) {
        const fieldErrors = validated.error.flatten().fieldErrors
        return {
            success: false,
            validationErrors: fieldErrors as Record<string, string[]>,
            error: "Validation failed",
        }
    }

    // Check for duplicate item code when updating
    if (validated.data.item_code) {
        // Check if there's another item with the same code
        const duplicateItem = await db
            .select()
            .from(inventory)
            .where(
                and(
                    eq(inventory.itemCode, validated.data.item_code),
                    eq(inventory.isActive, true)
                )
            )
            .limit(1)

        if (duplicateItem.length > 0 && duplicateItem[0].id !== item_id) {
            return {
                success: false,
                error: `Item code "${validated.data.item_code}" already exists`,
            }
        }
    }

    // Validate current_stock doesn't go negative
    if (validated.data.current_stock !== undefined && validated.data.current_stock < 0) {
        return {
            success: false,
            error: "Stock quantity cannot be negative",
        }
    }

    try {
        // Get current item for branch_id
        const [currentItem] = await db
            .select()
            .from(inventory)
            .where(eq(inventory.id, item_id))

        await db
            .update(inventory)
            .set({
                ...(validated.data.name && { name: sanitizeText(validated.data.name) }),
                ...(validated.data.item_code !== undefined && { itemCode: validated.data.item_code ? sanitizeMinimal(validated.data.item_code) : null }),
                ...(validated.data.description !== undefined && { description: validated.data.description ? sanitizeText(validated.data.description) : null }),
                ...(validated.data.external_link !== undefined && { externalLink: validated.data.external_link }),
                ...(validated.data.item_type && { itemType: validated.data.item_type }),
                ...(validated.data.item_category && { itemCategory: validated.data.item_category }),
                ...(validated.data.current_stock !== undefined && { currentStock: String(validated.data.current_stock) }),
                ...(validated.data.stock_warning_threshold !== undefined && { stockWarningThreshold: String(validated.data.stock_warning_threshold) }),
                ...(validated.data.unit_price !== undefined && { unitPrice: String(validated.data.unit_price) }),
                ...(validated.data.selling_price !== undefined && { sellingPrice: String(validated.data.selling_price) }),
                ...(validated.data.fluid_unit_size !== undefined && { fluidUnitSize: String(validated.data.fluid_unit_size) }),
                ...(validated.data.fluid_remaining !== undefined && { fluidRemaining: String(validated.data.fluid_remaining) }),
                ...(validated.data.fluid_unit_of_measure !== undefined && { fluidUnitOfMeasure: validated.data.fluid_unit_of_measure ? sanitizeMinimal(validated.data.fluid_unit_of_measure) : null }),
                ...(validated.data.is_perishable !== undefined && { isPerishable: validated.data.is_perishable }),
                ...(validated.data.expiration_date !== undefined && { expirationDate: validated.data.expiration_date }),
                ...(validated.data.show_in_sales !== undefined && { showInSales: validated.data.show_in_sales }),
                updatedAt: new Date(),
            })
            .where(eq(inventory.id, item_id))

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'INVENTORY',
                message: `Updated inventory item: ${item_id}`,
                user_id: user.id,
                branch_id: currentItem?.branchId ?? undefined,
            }]
        })
        return success(undefined, "Item updated successfully")
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Failed to update inventory item: ${error instanceof Error ? error.message : String(error)}`
        })
        return { success: false, error:   `Failed to update item: ${error}` }
    }
}

export async function deleteInventoryItem({ item_id }: { item_id: string }): Promise<ActionResponse> {
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, error:   "Unauthorized" }
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return { success: false, error:   "Access denied" }
    }

    try {
        // Get current item for branch_id
        const [currentItem] = await db
            .select()
            .from(inventory)
            .where(eq(inventory.id, item_id))

        await db
            .update(inventory)
            .set({
                isActive: false,
                updatedAt: new Date(),
            })
            .where(eq(inventory.id, item_id))

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'INVENTORY',
                message: `Deleted inventory item: ${item_id}`,
                user_id: user.id,
                branch_id: currentItem?.branchId ?? undefined,
            }]
        })
        return success(undefined, "Item deleted successfully")
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Failed to delete inventory item: ${error instanceof Error ? error.message : String(error)}`
        })
        return { success: false, error:   `Failed to delete item: ${error}` }
    }
}

export async function restoreInventoryItem({ item_id }: { item_id: string }): Promise<ActionResponse> {
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, error:   "Unauthorized" }
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return { success: false, error:   "Access denied" }
    }

    try {
        // Get current item for branch_id
        const [currentItem] = await db
            .select()
            .from(inventory)
            .where(eq(inventory.id, item_id))

        await db
            .update(inventory)
            .set({
                isActive: true,
                updatedAt: new Date(),
            })
            .where(eq(inventory.id, item_id))

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'INVENTORY',
                message: `Restored inventory item: ${item_id}`,
                user_id: user.id,
                branch_id: currentItem?.branchId ?? undefined,
            }]
        })
        return success(undefined, "Item restored successfully")
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Failed to restore inventory item: ${error instanceof Error ? error.message : String(error)}`
        })
        return { success: false, error:   `Failed to restore item: ${error}` }
    }
}

export async function duplicateInventoryItem({ item_id, name }: { item_id: string, name: string }): Promise<ActionResponse> {
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, error:   "Unauthorized" }
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return { success: false, error:   "Access denied" }
    }

    try {
        const [item] = await db
            .select()
            .from(inventory)
            .where(eq(inventory.id, item_id))

        if (!item) {
            return { success: false, error:   "Item not found" }
        }

        await db.insert(inventory).values({
            name: sanitizeText(name),
            itemCode: item.itemCode ? `${sanitizeMinimal(item.itemCode)}-COPY` : undefined,
            description: item.description,
            externalLink: item.externalLink,
            itemType: item.itemType,
            itemCategory: item.itemCategory,
            currentStock: '0',
            stockWarningThreshold: item.stockWarningThreshold,
            unitPrice: item.unitPrice,
            sellingPrice: item.sellingPrice,
            fluidUnitSize: item.fluidUnitSize,
            fluidRemaining: null,
            fluidUnitOfMeasure: item.fluidUnitOfMeasure,
            isPerishable: item.isPerishable,
            isActive: true,
            showInSales: item.showInSales,
            branchId: item.branchId,
        })

        createLogs({ logs: [{ level: 'INFO', type: 'INVENTORY', message: `Duplicated inventory item: ${item.name} -> ${name}` }] })
        return success(undefined, "Item duplicated successfully")
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Failed to duplicate inventory item: ${error instanceof Error ? error.message : String(error)}`
        })
        return { success: false, error:   `Failed to duplicate item: ${error}` }
    }
}

export async function requestInventoryRestock({
    item_id,
}: {
    item_id: string
}): Promise<ActionResponse> {
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, error:   "Unauthorized" }
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return { success: false, error:   "Access denied" }
    }

    try {
        const [item] = await db
            .select()
            .from(inventory)
            .where(eq(inventory.id, item_id))

        if (!item) {
            return { success: false, error:   "Item not found" }
        }

        // This is just a notification/alert action
        // The actual restocking is done via restockInventoryItem
        createLogs({ logs: [{ level: 'INFO', type: 'INVENTORY', message: `Restock requested for: ${item.name}` }] })

        return success(undefined, `Restock request sent for ${item.name}`)
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Error requesting inventory restock: ${error instanceof Error ? error.message : String(error)}`
        })
        return { success: false, error:   "Failed to send restock request" }
    }
}

export async function checkStockAvailability(item_id: string, quantity: number): Promise<{ success: boolean; available: boolean; current_stock: number; name: string; error?: string }> {
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, available: false, current_stock: 0, name: 'Unknown Item', error: "Unauthorized" }
    }

    try {
        const [item] = await db
            .select()
            .from(inventory)
            .where(eq(inventory.id, item_id))

        if (!item) {
            return { success: false, available: false, current_stock: 0, name: 'Unknown Item', error: "Item not found" }
        }

        const currentStock = Number(item.currentStock)
        return {
            success: true,
            available: currentStock >= quantity,
            current_stock: currentStock,
            name: item.name,
        }
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Error checking stock availability: ${error instanceof Error ? error.message : String(error)}`
        })
        return { success: false, available: false, current_stock: 0, name: 'Unknown Item', error: `Error: ${error}` }
    }
}

export interface InventoryFilters {
    searchQuery?: string
    category?: string
    type?: string
    lowStock?: boolean
    showInactive?: boolean
    datePreset?: DateRangePreset
    startDate?: string
    endDate?: string
}

interface RestockWithAccountingPayload {
    item_id: string
    user_id: string
    quantity_added: number
    unit_cost: number
    total_amount: number
    invoice_number?: string
    supplier_name?: string
    order_reference?: string
    restocked_at: Date
    proof_file?: File | null
    create_accounting_entry: boolean
    accounting_category?: string
}

export interface RestockWithAccountingResult {
    accounting_entry_id?: string
    proof_url?: string
}

export async function restockInventoryItemWithAccounting(
    payload: RestockWithAccountingPayload
): Promise<ActionResponse<RestockWithAccountingResult>> {
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, error: "Unauthorized" }
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return { success: false, error: "Access denied" }
    }

    try {
        // Upload proof file if provided (outside transaction - external operation)
        let proofUrl: string | undefined
        if (payload.proof_file) {
            const buffer = Buffer.from(await payload.proof_file.arrayBuffer())
            const extension = payload.proof_file.name.split('.').pop() || 'jpg'
            const key = `inventory-proofs/${payload.item_id}/${Date.now()}.${extension}`
            const uploadResult = await uploadFile(buffer, key, payload.proof_file.type)
            proofUrl = uploadResult.url
        }

        // Use provided restock date or current date
        const restockDate = payload.restocked_at || new Date()

        // Perform inventory read, update, restock log creation, and accounting entry in transaction
        const transactionResult = await withTransaction(async (tx) => {
            // Get current item inside the transaction to prevent stale data
            const [item] = await tx
                .select()
                .from(inventory)
                .where(eq(inventory.id, payload.item_id))

            if (!item) {
                throw new Error("Item not found")
            }

            // Calculate new stock
            const currentStock = Number(item.currentStock)
            const newTotalStock = currentStock + payload.quantity_added

            // Update inventory
            await tx
                .update(inventory)
                .set({
                    currentStock: String(newTotalStock),
                    lastRestocked: restockDate,
                    updatedAt: new Date(),
                })
                .where(eq(inventory.id, payload.item_id))

            // Create restock log
            const [restockLogEntry] = await tx.insert(restockLog).values({
                itemId: payload.item_id,
                quantity: String(payload.quantity_added),
                cost: payload.unit_cost > 0 ? String(payload.unit_cost) : null,
                invoiceNo: payload.invoice_number ? sanitizeMinimal(payload.invoice_number) : null,
                proofLink: proofUrl,
                supplierName: payload.supplier_name ? sanitizeText(payload.supplier_name) : null,
                orderReference: payload.order_reference ? sanitizeMinimal(payload.order_reference) : null,
                restockedAt: restockDate,
                createdBy: payload.user_id,
            }).returning()

            // Create accounting entry if requested and there's a cost (inside transaction)
            let accountingEntryId: string | undefined
            if (payload.create_accounting_entry && payload.total_amount > 0) {
                const accountingResult = await createAutoLedgerEntry(
                    'INVENTORY',
                    restockLogEntry.id,
                    {
                        entry_date: restockDate,
                        entry_type: 'EXPENSE',
                        category: payload.accounting_category || 'INVENTORY_PURCHASE',
                        description: `Restock: ${item.name} (${payload.quantity_added} units)`,
                        reference: payload.invoice_number || `RESTOCK-${restockLogEntry.id.slice(0, 8)}`,
                        debit: payload.total_amount,
                        credit: 0,
                        branch_id: item.branchId || null,
                    },
                    payload.user_id,
                    tx // Pass transaction client for atomicity
                )

                if (!accountingResult.success) {
                    throw new Error(accountingResult.error || "Failed to create accounting entry")
                }
                accountingEntryId = accountingResult.data.id
            }

            return { restockLogEntry, item, newTotalStock, accountingEntryId }
        }, { action: 'INVENTORY', userId: payload.user_id })

        if (!transactionResult.success) {
            return { success: false, error: transactionResult.error || "Transaction failed" }
        }

        const { restockLogEntry: _restockLogEntry, item, accountingEntryId } = transactionResult.data

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'INVENTORY',
                message: `Restocked item ${item.name}: +${payload.quantity_added}${proofUrl ? ' with proof' : ''}${accountingEntryId ? ' + accounting entry' : ''}`,
                user_id: user.id,
                branch_id: item.branchId ?? undefined,
            }]
        })

        return success({
            accounting_entry_id: accountingEntryId,
            proof_url: proofUrl,
        }, `Successfully restocked ${item.name}`)
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Failed to restock inventory item: ${error instanceof Error ? error.message : String(error)}`
        })
        return { success: false, error: `Failed to restock item: ${error}` }
    }
}

export async function exportInventory(options: {
    format: ExportFormat
    filters?: InventoryFilters
}): Promise<ActionResponse<{ content: string; mimeType: string; filename: string }>> {
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, error:   'Unauthorized' }
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return { success: false, error:   'Access denied' }
    }

    try {
        // Build filter conditions using and()
        const conditions: SQL<unknown>[] = []

        if (!options.filters?.showInactive) {
            conditions.push(eq(inventory.isActive, true))
        }

        if (options.filters?.category) {
            conditions.push(eq(inventory.itemCategory, options.filters.category))
        }

        if (options.filters?.type) {
            conditions.push(eq(inventory.itemType, options.filters.type))
        }

        // Fetch filtered items
        let items
        if (conditions.length > 0) {
            items = await db
                .select()
                .from(inventory)
                .where(and(...conditions))
        } else {
            items = await db.select().from(inventory)
        }

        // Convert to InventoryItem format
        const formattedItems: InventoryItem[] = items.map(item => ({
            id: item.id,
            created_at: item.createdAt.toISOString(),
            updated_at: item.updatedAt.toISOString(),
            name: item.name,
            item_code: item.itemCode || undefined,
            description: item.description || undefined,
            external_link: item.externalLink || undefined,
            item_type: item.itemType as InventoryItem['item_type'],
            item_category: item.itemCategory as InventoryItem['item_category'],
            current_stock: Number(item.currentStock),
            stock_warning_threshold: item.stockWarningThreshold ? Number(item.stockWarningThreshold) : undefined,
            unit_price: item.unitPrice ? Number(item.unitPrice) : undefined,
            selling_price: item.sellingPrice ? Number(item.sellingPrice) : undefined,
            last_restocked: item.lastRestocked?.toISOString(),
            fluid_unit_size: item.fluidUnitSize ? Number(item.fluidUnitSize) : undefined,
            fluid_remaining: item.fluidRemaining ? Number(item.fluidRemaining) : undefined,
            fluid_unit_of_measure: item.fluidUnitOfMeasure || undefined,
            is_perishable: item.isPerishable,
            expiration_date: item.expirationDate || undefined,
            is_active: item.isActive,
            show_in_sales: item.showInSales,
            branch_id: item.branchId,
            is_shared: item.isShared,
        }))

        // Format for export
        const exportRows = formatInventoryForExport(formattedItems)

        // Generate export based on format
        let content: string
        let mimeType: string
        let filename: string

        const timestamp = new Date().toISOString().split('T')[0]

        switch (options.format) {
            case 'csv':
                content = generateInventoryCSV(exportRows)
                mimeType = 'text/csv'
                filename = `inventory-${timestamp}.csv`
                break
            case 'excel':
                content = await generateInventoryExcel(exportRows)
                mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                filename = `inventory-${timestamp}.xlsx`
                break
            case 'pdf':
                const { generateInventoryPDF } = await import("@/utils/pdf-export-server")
                content = await generateInventoryPDF(exportRows)
                mimeType = 'application/pdf'
                filename = `inventory-${timestamp}.pdf`
                break
            default:
                return { success: false, error:   'Invalid export format' }
        }

        return {
            success: true,
            data: { content, mimeType, filename },
            message: 'Export generated successfully',
        }
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Error exporting inventory: ${error instanceof Error ? error.message : String(error)}`
        })
        return { success: false, error:   'Failed to export inventory' }
    }
}

export async function checkLowStock(): Promise<ActionResponse<{ lowStock: typeof inventory.$inferSelect[] }>> {
    const user = await getCurrentUser()
    if (!user) return failure('Unauthorized')
    const hasAccess = await canManageInventory(user)
    if (!hasAccess) return failure('Forbidden')

    const lowStockItems = await db
        .select()
        .from(inventory)
        .where(sql`${inventory.currentStock} <= ${inventory.stockWarningThreshold}`)

    return success({ lowStock: lowStockItems })
}

export async function notifyLowStock(): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) return failure('Unauthorized')
    const hasAccess = await canManageInventory(user)
    if (!hasAccess) return failure('Forbidden')

    const result = await checkLowStock()
    if (!result.success) return failure('Failed to check low stock')

    for (const item of result.data.lowStock) {
        await sendUserNotification('SYSTEM', {
            type: 'WARNING' as const,
            title: 'Low Stock Alert',
            message: `${item.name} is below reorder point (${item.currentStock} / ${item.stockWarningThreshold})`,
        })
    }

    return success(undefined)
}
