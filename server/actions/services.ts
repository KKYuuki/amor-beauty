'use server'

import { sanitizeText } from '@/utils/sanitize'
import { db } from '@/server/db'
import { services, serviceItems } from '@/server/db/schema'
import { inventory } from '@/server/db/schema'
import { eq, desc, or, and, SQL } from 'drizzle-orm'
import { Service, ServiceItem } from "@/utils/types/general"
import { createLogs, logError } from "./logs"
import { getCurrentUser, canManageServices } from '@/utils/auth/permissions'
import { ActionResponse, success, failure } from '@/utils/types/responses'
import { ServiceType } from '@/utils/types/payroll'

export type ServiceWithItems = Service & {
    items: (ServiceItem & {
        inventory: {
            name: string
            unit_price: number
        }
    })[]
}

export type CreateServicePayload = {
    title: string
    price: number
    pricing_type?: 'FIXED' | 'HOURLY'
    hourly_rate?: number
    branch_id?: string | null
    is_shared?: boolean
    service_type?: ServiceType
    items: {
        inventory_id: string
        quantity: number
    }[]
}

export type UpdateServicePayload = {
    title: string
    price: number
    pricing_type?: 'FIXED' | 'HOURLY'
    hourly_rate?: number
    branch_id?: string | null
    is_shared?: boolean
    service_type?: ServiceType
    items: {
        inventory_id: string
        quantity: number
    }[]
}

export interface GetServicesResult {
    services: ServiceWithItems[]
}

export interface GetServicesOptions {
    branchId?: string | null
}

export async function getServices(options?: GetServicesOptions): Promise<ActionResponse<GetServicesResult>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    try {
        // Build where conditions
        const conditions: (SQL<unknown> | undefined)[] = [eq(services.isActive, true)]

        if (options?.branchId) {
            // Filter by branch OR shared services
            conditions.push(
                or(
                    eq(services.branchId, options.branchId),
                    eq(services.isShared, true)
                )
            )
        }

        const servicesList = await db
            .select()
            .from(services)
            .where(and(...conditions))
            .orderBy(desc(services.createdAt))

        // Fetch items for each service
        const servicesWithItems: ServiceWithItems[] = await Promise.all(
            servicesList.map(async (service) => {
                const items = await db
                    .select({
                        serviceId: serviceItems.serviceId,
                        inventoryId: serviceItems.inventoryId,
                        quantity: serviceItems.quantity,
                        fluidQuantity: serviceItems.fluidQuantity,
                        inventoryName: inventory.name,
                        inventoryUnitPrice: inventory.unitPrice,
                    })
                    .from(serviceItems)
                    .innerJoin(inventory, eq(serviceItems.inventoryId, inventory.id))
                    .where(eq(serviceItems.serviceId, service.id))

                return {
                    id: service.id,
                    created_at: service.createdAt.toISOString(),
                    title: service.title,
                    price: Number(service.price),
                    pricing_type: service.pricingType as 'FIXED' | 'HOURLY',
                    hourly_rate: Number(service.hourlyRate),
                    is_active: service.isActive,
                    is_shared: service.isShared ?? false,
                    branch_id: service.branchId,
                    service_type: service.serviceType as 'TATTOO' | 'PIERCING' | 'SHOE' | undefined,
                    items: items.map(item => ({
                        service_id: item.serviceId,
                        inventory_id: item.inventoryId,
                        quantity: String(item.quantity),
                        fluid_quantity: item.fluidQuantity ? Number(item.fluidQuantity) : undefined,
                        inventory: {
                            name: item.inventoryName,
                            unit_price: Number(item.inventoryUnitPrice || 0),
                        }
                    }))
                }
            })
        )

        return success({ services: servicesWithItems })
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to fetch services: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch services')
    }
}

export async function getInactiveServices(): Promise<ActionResponse<GetServicesResult>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canManageServices(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        // Use standard select with joins instead of query syntax
        const servicesList = await db
            .select()
            .from(services)
            .where(eq(services.isActive, false))
            .orderBy(desc(services.createdAt))

        // Fetch items for each service
        const servicesWithItems: ServiceWithItems[] = await Promise.all(
            servicesList.map(async (service) => {
                const items = await db
                    .select({
                        serviceId: serviceItems.serviceId,
                        inventoryId: serviceItems.inventoryId,
                        quantity: serviceItems.quantity,
                        fluidQuantity: serviceItems.fluidQuantity,
                        inventoryName: inventory.name,
                        inventoryUnitPrice: inventory.unitPrice,
                    })
                    .from(serviceItems)
                    .innerJoin(inventory, eq(serviceItems.inventoryId, inventory.id))
                    .where(eq(serviceItems.serviceId, service.id))

                return {
                    id: service.id,
                    created_at: service.createdAt.toISOString(),
                    title: service.title,
                    price: Number(service.price),
                    pricing_type: service.pricingType as 'FIXED' | 'HOURLY',
                    hourly_rate: Number(service.hourlyRate),
                    is_active: service.isActive,
                    is_shared: service.isShared ?? false,
                    service_type: service.serviceType as 'TATTOO' | 'PIERCING' | 'SHOE' | undefined,
                    items: items.map(item => ({
                        service_id: item.serviceId,
                        inventory_id: item.inventoryId,
                        quantity: String(item.quantity),
                        fluid_quantity: item.fluidQuantity ? Number(item.fluidQuantity) : undefined,
                        inventory: {
                            name: item.inventoryName,
                            unit_price: Number(item.inventoryUnitPrice || 0),
                        }
                    }))
                }
            })
        )

        return success({ services: servicesWithItems })
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to fetch inactive services: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch inactive services')
    }
}

export interface CreateServiceResult {
    serviceId: string
}

export async function createService(payload: CreateServicePayload, user_id: string): Promise<ActionResponse<CreateServiceResult>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canManageServices(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    // Validate payload
    if (!payload.title || payload.price < 0) {
        return failure('Invalid service payload: title and price are required')
    }

    try {
        // Create service
        const [newService] = await db.insert(services).values({
            title: sanitizeText(payload.title),
            price: String(payload.price),
            pricingType: payload.pricing_type || 'FIXED',
            hourlyRate: payload.hourly_rate ? String(payload.hourly_rate) : '0',
            branchId: payload.branch_id,
            isShared: payload.is_shared ?? false,
            serviceType: payload.service_type || 'TATTOO',
            isActive: true,
        }).returning()

        // Create service items if any
        if (payload.items && payload.items.length > 0) {
            await db.insert(serviceItems).values(
                payload.items.map(item => ({
                    serviceId: newService.id,
                    inventoryId: item.inventory_id,
                    quantity: String(item.quantity),
                }))
            )
        }

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `Created service: ${payload.title}`,
                user_id: user_id,
                branch_id: payload.branch_id ?? undefined,
            }]
        })

        return success({ serviceId: newService.id })
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error creating service: ${error instanceof Error ? error.message : String(error)}`
        })
        createLogs({ 
            logs: [{ 
                level: 'ERROR', 
                type: 'SYSTEM',
                message: `Failed to create service: ${error}`,
                user_id: user_id 
            }] 
        })
        return failure(error instanceof Error ? error.message : 'Failed to create service')
    }
}

export async function updateService(id: string, payload: CreateServicePayload | UpdateServicePayload, user_id: string): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canManageServices(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    // Validate payload
    if (!payload.title || payload.price < 0) {
        return failure('Invalid service payload: title and price are required')
    }

    try {
        // Get current service for branch_id
        const [currentService] = await db
            .select()
            .from(services)
            .where(eq(services.id, id))
            .limit(1)

        // Update service
        await db.update(services)
            .set({
                title: sanitizeText(payload.title),
                price: String(payload.price),
                pricingType: payload.pricing_type || 'FIXED',
                hourlyRate: payload.hourly_rate ? String(payload.hourly_rate) : '0',
                branchId: payload.branch_id,
                isShared: payload.is_shared ?? false,
                serviceType: payload.service_type || 'TATTOO',
                updatedAt: new Date(),
            })
            .where(eq(services.id, id))

        // Delete existing service items
        await db.delete(serviceItems)
            .where(eq(serviceItems.serviceId, id))

        // Create new service items
        if (payload.items && payload.items.length > 0) {
            await db.insert(serviceItems).values(
                payload.items.map(item => ({
                    serviceId: id,
                    inventoryId: item.inventory_id,
                    quantity: String(item.quantity),
                }))
            )
        }

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `Updated service: ${payload.title} (ID: ${id})`,
                user_id: user_id,
                branch_id: currentService?.branchId ?? undefined,
            }]
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error updating service: ${error instanceof Error ? error.message : String(error)}`
        })
        createLogs({ 
            logs: [{ 
                level: 'ERROR', 
                type: 'SYSTEM',
                message: `Failed to update service: ${error}`,
                user_id: user_id 
            }] 
        })
        return failure(error instanceof Error ? error.message : 'Failed to update service')
    }
}

export async function deleteService(id: string, user_id: string): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canManageServices(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        // Get current service for branch_id
        const [currentService] = await db
            .select()
            .from(services)
            .where(eq(services.id, id))
            .limit(1)

        await db.update(services)
            .set({
                isActive: false,
                updatedAt: new Date(),
            })
            .where(eq(services.id, id))

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `Deleted service (ID: ${id})`,
                user_id: user_id,
                branch_id: currentService?.branchId ?? undefined,
            }]
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error deleting service: ${error instanceof Error ? error.message : String(error)}`
        })
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'SYSTEM',
                message: `Failed to delete service: ${error}`,
                user_id: user_id
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to delete service')
    }
}

export async function restoreService(id: string, user_id: string): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Not authenticated')
    }

    const hasAccess = await canManageServices(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        // Get current service for branch_id
        const [currentService] = await db
            .select()
            .from(services)
            .where(eq(services.id, id))
            .limit(1)

        await db.update(services)
            .set({
                isActive: true,
                updatedAt: new Date(),
            })
            .where(eq(services.id, id))

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'SYSTEM',
                message: `Restored service (ID: ${id})`,
                user_id: user_id,
                branch_id: currentService?.branchId ?? undefined,
            }]
        })

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error restoring service: ${error instanceof Error ? error.message : String(error)}`
        })
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'SYSTEM',
                message: `Failed to restore service: ${error}`,
                user_id: user_id
            }]
        })
        return failure(error instanceof Error ? error.message : 'Failed to restore service')
    }
}
