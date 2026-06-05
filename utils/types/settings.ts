// System Settings Types

export type SettingCategory = "Notifications" | "Business" | "System"

export interface SystemSetting {
    key: string
    value: unknown
    category: SettingCategory
    label: string
    description: string
    updated_at: string
    updated_by: string
}

// Individual Setting Value Types

// 1. Notification Settings
export interface RestockRecipientsValue {
    user_ids: string[]
}

export interface AppointmentNotificationsValue {
    mode: "all_admins" | "specific_users"
    user_ids?: string[]
}

export interface DailySummaryValue {
    enabled: boolean
    recipients: string[] // user_ids
}

// 2. Business Settings
export type DayOfWeek =
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday"

export interface DayHours {
    open: string
    close: string
    closed: boolean
}

export type BusinessHoursValue = {
    [day in DayOfWeek]: DayHours
} & {
    branch_overrides?: Record<string, { [day in DayOfWeek]?: DayHours }>
}

export interface CurrencyTaxValue {
    currency_symbol: string
    tax_rate: number // Percentage (e.g., 0.12 for 12%)
    tax_enabled: boolean
    tax_inclusive: boolean // If true, prices already include tax (tax is extracted, not added)
}

// 4. System Maintenance
export interface MaintenanceModeValue {
    enabled: boolean
    message: string // Message to display to users
}

export interface LogRetentionValue {
    days: number
}

// Accounting Period Lock
export interface AccountingPeriodLockValue {
    locked_until: string | null // ISO date string
    locked_by: string | null // User ID
}

// Type-safe setting keys
export type SettingKey =
    | "restock_recipients"
    | "appointment_notifications"
    | "daily_summary"
    | "business_hours"
    | "currency_tax"
    | "maintenance_mode"
    | "log_retention"
    | "accounting_period_lock"

// Helper type for type-safe value retrieval
export type SettingValueMap = {
    restock_recipients: RestockRecipientsValue
    appointment_notifications: AppointmentNotificationsValue
    daily_summary: DailySummaryValue
    business_hours: BusinessHoursValue
    currency_tax: CurrencyTaxValue
    maintenance_mode: MaintenanceModeValue
    log_retention: LogRetentionValue
    accounting_period_lock: AccountingPeriodLockValue
}

// Default values for each setting
export const DEFAULT_SETTINGS: Record<SettingKey, {
    value: SettingValueMap[SettingKey]
    category: SettingCategory
    label: string
    description: string
}> = {
    restock_recipients: {
        value: { user_ids: [] },
        category: "Notifications",
        label: "Restock Alert Recipients",
        description: "Users who will receive emails when inventory is low.",
    },
    appointment_notifications: {
        value: { mode: "all_admins" },
        category: "Notifications",
        label: "Appointment Notification Recipients",
        description: "Who gets notified for new appointment bookings.",
    },
    daily_summary: {
        value: {
            enabled: false,
            recipients: [],
        },
        category: "Notifications",
        label: "Daily Summary Email",
        description: "Send a daily email with today's appointments and low stock items.",
    },
    business_hours: {
        value: {
            monday: { open: "09:00", close: "18:00", closed: false },
            tuesday: { open: "09:00", close: "18:00", closed: false },
            wednesday: { open: "09:00", close: "18:00", closed: false },
            thursday: { open: "09:00", close: "18:00", closed: false },
            friday: { open: "09:00", close: "18:00", closed: false },
            saturday: { open: "10:00", close: "16:00", closed: false },
            sunday: { open: "10:00", close: "16:00", closed: true },
            branch_overrides: {},
        },
        category: "Business",
        label: "Operating Hours",
        description: "Set the studio's operating hours for each day of the week.",
    },
    currency_tax: {
        value: {
            currency_symbol: "$",
            tax_rate: 0.12,
            tax_enabled: true,
            tax_inclusive: true,
        },
        category: "Business",
        label: "Currency & Tax",
        description: "Default currency and tax rate for transactions.",
    },
    maintenance_mode: {
        value: {
            enabled: false,
            message: "System is under maintenance. Please check back later.",
        },
        category: "System",
        label: "Maintenance Mode",
        description: "Prevent non-admin users from accessing the system.",
    },
    log_retention: {
        value: {
            days: 90,
        },
        category: "System",
        label: "Log Retention Period",
        description: "Number of days to keep system logs before auto-deletion.",
    },
    accounting_period_lock: {
        value: {
            locked_until: null,
            locked_by: null,
        },
        category: "System",
        label: "Accounting Period Lock",
        description: "Lock accounting entries up to a specific date to prevent modifications.",
    },
}

// Payload for updating settings
export interface UpdateSettingPayload {
    key: SettingKey
    value: SettingValueMap[SettingKey]
    updated_by: string
}
