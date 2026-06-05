'use server'

// Task 1: Implement getSettings with Drizzle
import { db } from "@/server/db"
import { systemSettings } from "@/server/db/schema"
import { asc, eq } from "drizzle-orm"
import { z } from "zod"
import {
    SystemSetting,
    SettingKey,
    SettingCategory,
    SettingValueMap,
    DEFAULT_SETTINGS,
    BusinessHoursValue,
    DayOfWeek,
    DayHours,
} from "@/utils/types/settings"
import { logError } from "./logs"
import { ActionResponse, success, failure } from "@/utils/types/responses"
import {
    getCurrentUser,
    isAdmin,
} from "@/utils/auth/permissions"

// ============================================================================
// Setting Validation Schemas
// ============================================================================

const SETTING_VALIDATORS: Record<SettingKey, z.ZodSchema> = {
    restock_recipients: z.object({
        user_ids: z.array(z.string().uuid()),
    }),
    appointment_notifications: z.object({
        mode: z.enum(["all_admins", "specific_users"]),
        user_ids: z.array(z.string().uuid()).optional(),
    }),
    daily_summary: z.object({
        enabled: z.boolean(),
        recipients: z.array(z.string().uuid()),
    }),
    business_hours: z.object({
        monday: z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/), closed: z.boolean() }),
        tuesday: z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/), closed: z.boolean() }),
        wednesday: z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/), closed: z.boolean() }),
        thursday: z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/), closed: z.boolean() }),
        friday: z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/), closed: z.boolean() }),
        saturday: z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/), closed: z.boolean() }),
        sunday: z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/), closed: z.boolean() }),
        branch_overrides: z.record(
            z.string(),
            z.record(
                z.string(),
                z.object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/), closed: z.boolean() })
            )
        ).optional(),
    }),
    currency_tax: z.object({
        currency_symbol: z.string().min(1).max(10),
        tax_rate: z.number().min(0).max(1),
        tax_enabled: z.boolean(),
        tax_inclusive: z.boolean(),
    }),
    maintenance_mode: z.object({
        enabled: z.boolean(),
        message: z.string().min(1).max(500),
    }),
    log_retention: z.object({
        days: z.number().int().min(1).max(3650),
    }),
    accounting_period_lock: z.object({
        locked_until: z.string().datetime().nullable(),
        locked_by: z.string().uuid().nullable(),
    }),
}

export interface GetSettingsResult {
    settings: SystemSetting[]
}

export async function getSettings(): Promise<ActionResponse<GetSettingsResult>> {
    try {
        const settings = await db
            .select()
            .from(systemSettings)
            .orderBy(asc(systemSettings.key))

        const mappedSettings: SystemSetting[] = settings.length > 0 
            ? settings.map(setting => ({
                key: setting.key,
                value: setting.value,
                category: setting.category as SystemSetting['category'],
                label: setting.label,
                description: setting.description,
                updated_at: setting.updatedAt.toISOString(),
                updated_by: setting.updatedBy || '',
            }))
            : []

        return success({ settings: mappedSettings })
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to fetch settings: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch settings')
    }
}

export async function getSetting<K extends SettingKey>(
    key: K
): Promise<ActionResponse<SettingValueMap[K] | null>> {
    try {
        const result = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.key, key))
            .limit(1)

        if (result.length === 0) {
            return success(null)
        }

        return success(result[0].value as SettingValueMap[K])
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to fetch setting ${key}: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch setting')
    }
}

export async function updateSetting<K extends SettingKey>(
    key: K,
    value: SettingValueMap[K],
    user_id: string
): Promise<ActionResponse<void>> {
    // Check admin authorization
    const user = await getCurrentUser()
    if (!user || user.role !== 'admin') {
        return failure('Unauthorized: Admin access required')
    }

    // Validate the setting value
    const validator = SETTING_VALIDATORS[key]
    const parseResult = validator.safeParse(value)
    if (!parseResult.success) {
        const errorMessage = parseResult.error.issues.map((issue: z.ZodIssue) => issue.message).join(', ')
        return failure(`Invalid value for ${key}: ${errorMessage}`)
    }

    try {
        const dbResult = await db
            .update(systemSettings)
            .set({
                value: value,
                updatedAt: new Date(),
                updatedBy: user_id,
            })
            .where(eq(systemSettings.key, key))

        if ((dbResult.rowCount ?? 0) === 0) {
            return failure('Setting not found or not updated')
        }

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to update setting ${key}: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to update setting')
    }
}

export async function initializeSettings(user_id: string): Promise<ActionResponse<void>> {
    // Check admin authorization
    const user = await getCurrentUser()
    if (!user || user.role !== 'admin') {
        return failure('Unauthorized: Admin access required')
    }

    try {
        // Check if settings already exist
        const existing = await db.select().from(systemSettings).limit(1)
        if (existing.length > 0) {
            return success(undefined, 'Settings already initialized')
        }

        // Insert default settings
        const settingsToInsert = (Object.keys(DEFAULT_SETTINGS) as SettingKey[]).map(
            (key) => {
                const setting = DEFAULT_SETTINGS[key]
                return {
                    key: key,
                    value: setting.value,
                    category: setting.category,
                    label: setting.label,
                    description: setting.description,
                    updatedBy: user_id,
                }
            }
        )

        await db.insert(systemSettings).values(settingsToInsert)
        return success(undefined, 'Settings initialized successfully')
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to initialize settings: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to initialize settings')
    }
}

export async function getSettingsByCategory(category: SettingCategory): Promise<ActionResponse<GetSettingsResult>> {
    try {
        const settings = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.category, category))
            .orderBy(asc(systemSettings.key))

        const mappedSettings: SystemSetting[] = settings.map(setting => ({
            key: setting.key,
            value: setting.value,
            category: setting.category as SystemSetting['category'],
            label: setting.label,
            description: setting.description,
            updated_at: setting.updatedAt.toISOString(),
            updated_by: setting.updatedBy || '',
        }))

        return success({ settings: mappedSettings })
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to fetch settings by category: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch settings by category')
    }
}

// ============================================================================
// Business Hours Validation
// ============================================================================

const DAY_NUMBER_TO_NAME: Record<number, DayOfWeek> = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
}

/**
 * Check if an appointment time falls within business hours
 * @param startTime - Appointment start time
 * @param endTime - Appointment end time
 * @param branchId - Optional branch ID to check branch-specific hours
 * @returns Object with valid boolean and optional reason string
 */
export async function isWithinBusinessHours(
    startTime: Date,
    endTime: Date,
    branchId?: string
): Promise<{ valid: boolean; reason?: string }> {
    try {
        const response = await getSetting('business_hours')

        if (!response.success) {
            return { valid: false, reason: 'Failed to retrieve business hours settings' }
        }

        const businessHours = (response.data || DEFAULT_SETTINGS.business_hours.value) as BusinessHoursValue
        const dayOfWeek = startTime.getDay()
        const dayName = DAY_NUMBER_TO_NAME[dayOfWeek]

        // Check for branch-specific override first
        let dayHours: DayHours | undefined
        if (branchId && businessHours.branch_overrides?.[branchId]?.[dayName]) {
            dayHours = businessHours.branch_overrides[branchId][dayName]
        }

        // Fall back to global hours if no branch override
        if (!dayHours) {
            dayHours = businessHours[dayName]
        }

        if (dayHours.closed) {
            return { valid: false, reason: 'Business is closed on this day' }
        }

        const [openHour, openMin] = dayHours.open.split(':').map(Number)
        const [closeHour, closeMin] = dayHours.close.split(':').map(Number)

        const openMinutes = openHour * 60 + openMin
        const closeMinutes = closeHour * 60 + closeMin
        const startMinutes = startTime.getHours() * 60 + startTime.getMinutes()
        const endMinutes = endTime.getHours() * 60 + endTime.getMinutes()

        if (startMinutes < openMinutes) {
            return { valid: false, reason: `Business opens at ${dayHours.open}` }
        }

        if (endMinutes > closeMinutes) {
            return { valid: false, reason: `Business closes at ${dayHours.close}` }
        }

        return { valid: true }
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Error checking business hours: ${error instanceof Error ? error.message : String(error)}`
        })
        return { valid: false, reason: 'Error validating business hours' }
    }
}

// ============================================================================
// Accounting Period Lock Management
// ============================================================================

export async function lockAccountingPeriod(
    untilDate: Date
): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user || !(await isAdmin(user))) {
        return failure('Unauthorized: Admin access required')
    }

    try {
        const result = await db
            .update(systemSettings)
            .set({
                value: {
                    locked_until: untilDate.toISOString(),
                    locked_by: user.id,
                },
                updatedAt: new Date(),
                updatedBy: user.id,
            })
            .where(eq(systemSettings.key, 'accounting_period_lock'))

        if ((result.rowCount ?? 0) === 0) {
            // Setting doesn't exist yet, insert it
            await db.insert(systemSettings).values({
                key: 'accounting_period_lock',
                value: {
                    locked_until: untilDate.toISOString(),
                    locked_by: user.id,
                },
                category: 'System',
                label: 'Accounting Period Lock',
                description: 'Lock accounting entries up to a specific date to prevent modifications.',
                updatedBy: user.id,
            })
        }

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to lock accounting period: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to lock accounting period')
    }
}

export async function unlockAccountingPeriod(): Promise<ActionResponse<void>> {
    const user = await getCurrentUser()
    if (!user || !(await isAdmin(user))) {
        return failure('Unauthorized: Admin access required')
    }

    try {
        const result = await db
            .update(systemSettings)
            .set({
                value: {
                    locked_until: null,
                    locked_by: null,
                },
                updatedAt: new Date(),
                updatedBy: user.id,
            })
            .where(eq(systemSettings.key, 'accounting_period_lock'))

        if ((result.rowCount ?? 0) === 0) {
            return failure('Accounting period lock setting not found')
        }

        return success(undefined)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to unlock accounting period: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to unlock accounting period')
    }
}

export async function getAccountingPeriodLock(): Promise<ActionResponse<{ locked_until: string | null; locked_by: string | null }>> {
    try {
        const result = await db
            .select()
            .from(systemSettings)
            .where(eq(systemSettings.key, 'accounting_period_lock'))
            .limit(1)

        if (result.length === 0) {
            return success({ locked_until: null, locked_by: null })
        }

        const value = result[0].value as { locked_until: string | null; locked_by: string | null }
        return success(value)
    } catch (error) {
        await logError({
            type: 'SYSTEM',
            message: `Failed to get accounting period lock: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to get accounting period lock')
    }
}
