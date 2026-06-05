'use server'

import { db } from '@/server/db'
import { inventory } from '@/server/db/schema'
import { inArray } from 'drizzle-orm'
import { sanitizeText, sanitizeMinimal } from '@/utils/sanitize'
import { createLogs, logError } from './logs'
import { getCurrentUser, canManageInventory } from '@/utils/auth/permissions'
import { revalidatePath } from 'next/cache'

export interface InventoryImportRow extends Record<string, unknown> {
    name: string
    item_code?: string
    description?: string
    item_category: string
    item_type: string
    unit_price?: number
    selling_price?: number
    current_stock?: number
    stock_warning_threshold?: number
    external_link?: string
}

export async function importInventoryItems(
    items: InventoryImportRow[],
    userId: string,
    branchId: string | null
): Promise<{ success: boolean; created: number; errors: string[] }> {
    const errors: string[] = []

    // Get current user for permission check
    const user = await getCurrentUser()
    if (!user) {
        return { success: false, created: 0, errors: ['Unauthorized'] }
    }

    const hasAccess = await canManageInventory(user)
    if (!hasAccess) {
        return { success: false, created: 0, errors: ['Access denied'] }
    }

    // Validate item categories
    const validCategories = ['TATTOO', 'PIERCING', 'EQUIPMENT', 'FOOD', 'APPAREL', 'OTHER']

    // Check for duplicate item codes
    const itemCodes = items.filter(i => i.item_code).map(i => i.item_code as string)
    if (itemCodes.length > 0) {
        const existingItems = await db
            .select({ itemCode: inventory.itemCode })
            .from(inventory)
            .where(inArray(inventory.itemCode, itemCodes))

        if (existingItems && existingItems.length > 0) {
            const duplicateCodes = existingItems.map(e => e.itemCode).join(', ')
            return {
                success: false,
                created: 0,
                errors: [`Duplicate item codes found: ${duplicateCodes}`]
            }
        }
    }

    // Validate all items
    for (let i = 0; i < items.length; i++) {
        const item = items[i]

        // Validate category
        if (!validCategories.includes(item.item_category.toUpperCase())) {
            errors.push(
                `Row ${i + 1}: Invalid category "${item.item_category}". Must be one of: ${validCategories.join(', ')}`
            )
        }

        // Validate type
        const validTypes = ['ITEM', 'FLUID']
        if (!validTypes.includes(item.item_type.toUpperCase())) {
            errors.push(
                `Row ${i + 1}: Invalid type "${item.item_type}". Must be one of: ${validTypes.join(', ')}`
            )
        }

        // Validate name
        if (!item.name || item.name.trim().length === 0) {
            errors.push(`Row ${i + 1}: Name is required`)
        }
    }

    if (errors.length > 0) {
        return { success: false, created: 0, errors }
    }

    // Prepare items for insert
    const itemsToInsert = items.map(item => ({
        name: sanitizeText(item.name),
        itemCode: item.item_code ? sanitizeMinimal(item.item_code) : null,
        description: item.description ? sanitizeText(item.description) : null,
        itemCategory: item.item_category.toUpperCase(),
        itemType: item.item_type.toUpperCase(),
        unitPrice: item.unit_price ? String(item.unit_price) : null,
        sellingPrice: item.selling_price ? String(item.selling_price) : null,
        currentStock: String(item.current_stock || 0),
        stockWarningThreshold: item.stock_warning_threshold ? String(item.stock_warning_threshold) : null,
        externalLink: item.external_link || null,
        branchId: branchId,
        isShared: !branchId,
        createdBy: userId,
        isActive: true,
        showInSales: true,
        isPerishable: false,
        fluidUnitSize: null,
        fluidRemaining: null,
        fluidUnitOfMeasure: null,
        lastRestocked: null,
        expirationDate: null,
    }))

    try {
        // Insert items in batches
        const BATCH_SIZE = 100
        let created = 0

        for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
            const batch = itemsToInsert.slice(i, i + BATCH_SIZE)
            await db.insert(inventory).values(batch)
            created += batch.length
        }

        // Log the import
        createLogs({
            logs: [{
                level: 'INFO',
                type: 'INVENTORY',
                message: `Imported ${created} inventory items via CSV`,
                user_id: userId,
                branch_id: branchId ?? undefined,
            }]
        })

        revalidatePath('/inventory')

        return {
            success: true,
            created,
            errors: []
        }
    } catch (error) {
        await logError({
            type: 'INVENTORY',
            message: `Failed to import inventory items: ${error instanceof Error ? error.message : String(error)}`
        })
        return {
            success: false,
            created: 0,
            errors: [`Failed to import items: ${error instanceof Error ? error.message : 'Unknown error'}`]
        }
    }
}
