/**
 * Canonical Access Flags Registry
 *
 * SINGLE SOURCE OF TRUTH for all access flags in the system.
 * Every reference to flags — route config, permission functions, admin UI,
 * middleware — MUST use this registry. No hardcoded flag strings elsewhere.
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/** Feature access flags — control route visibility and feature operations */
export const FEATURE_ACCESS_FLAGS = {
    inventory_manage:         { label: 'Inventory Manage',   description: 'View and manage inventory items' },
    sales_access:             { label: 'Sales Access',       description: 'Access the sales page and process sales' },
    accounting_access:        { label: 'Accounting Access',  description: 'View and manage general ledger entries' },
    accounting_analytics_view:{ label: 'Accounting Analytics View', description: 'View summary analytics cards and enhanced reports in Accounting' },
    payroll_manage:           { label: 'Payroll Manage',     description: 'Process and manage staff payroll' },
    transactions_manage:      { label: 'Transactions Manage',description: 'Create, void, and refund transactions' },
    appointments_manage:      { label: 'Appointments Manage',description: 'Create and manage all appointments' },
    appointments_view:        { label: 'Appointments View',  description: 'View appointments calendar' },
    user_manage:              { label: 'User Manage',        description: 'View and edit user accounts' },
    services_manage:          { label: 'Services Manage',    description: 'Manage service catalog' },
    metrics_view:             { label: 'Metrics View',       description: 'View business metrics and charts' },
    logs_view:                { label: 'Logs View',          description: 'View system audit logs' },
    time_clock_manage:        { label: 'Time Clock Manage',  description: 'Manage time clock, QR codes, schedules' },
    system_config:            { label: 'System Config',      description: 'Modify system configuration' },
    notifications_send:       { label: 'Notifications Send', description: 'Send email notifications to users' },
} as const

/** Hybrid capability flags — grant work-execution abilities to admin users */
export const CAPABILITY_FLAGS = {
    artist:   { label: 'Artist',   description: 'Work as an artist (appointments, services, payroll)' },
    piercing: { label: 'Piercing', description: 'Work as a piercer (piercing appointments)' },
    shoe:     { label: 'Shoe',     description: 'Work as a shoe tech (shoe appointments)' },
} as const

/** All access flags combined */
export const ACCESS_FLAGS = {
    ...FEATURE_ACCESS_FLAGS,
    ...CAPABILITY_FLAGS,
} as const

// ============================================================================
// STRING LITERAL TYPES
// ============================================================================

export type FeatureAccessFlag = keyof typeof FEATURE_ACCESS_FLAGS
export type CapabilityFlag = keyof typeof CAPABILITY_FLAGS
export type AccessFlag = FeatureAccessFlag | CapabilityFlag

/** Array of all valid feature flag strings */
export const VALID_FEATURE_FLAGS = Object.keys(FEATURE_ACCESS_FLAGS) as FeatureAccessFlag[]

/** Array of all valid capability flag strings */
export const VALID_CAPABILITY_FLAGS = Object.keys(CAPABILITY_FLAGS) as CapabilityFlag[]

/** Array of all valid access flag strings */
export const VALID_ACCESS_FLAGS = Object.keys(ACCESS_FLAGS) as AccessFlag[]

// ============================================================================
// TYPE GUARD
// ============================================================================

/** Validate that a string is a known access flag */
export function isValidAccessFlag(flag: string): flag is AccessFlag {
    return flag in ACCESS_FLAGS
}

/** Validate that a string is a known feature access flag */
export function isValidFeatureFlag(flag: string): flag is FeatureAccessFlag {
    return flag in FEATURE_ACCESS_FLAGS
}

// ============================================================================
// FLAG MIGRATION MAP (Old → New)
// ============================================================================

/**
 * Maps legacy flag names to canonical names.
 * Used by the migration script and for backward-compatible permission checks.
 */
export const FLAG_MIGRATION_MAP: Record<string, AccessFlag> = {
    'inventory':           'inventory_manage',
    'accounting':          'accounting_access',
    'payroll_manager':     'payroll_manage',
    'transactions':        'transactions_manage',
    'appointments':        'appointments_manage',
    'user_management':     'user_manage',
    'services':            'services_manage',
    'sales':               'sales_access',
    'metrics':             'metrics_view',
    'view_logs':           'logs_view',
    'time_clock_admin':    'time_clock_manage',
    'config':              'system_config',
    'notify':              'notifications_send',
    'accounts':            'user_manage',
    'view_appointments':   'appointments_view',
    // Capability flags unchanged — map to themselves
    'artist':              'artist',
    'piercing':            'piercing',
    'shoe':                'shoe',
}

/**
 * Normalize a flag name — resolve old names to canonical, pass through unknowns.
 */
export function normalizeFlag(flag: string): string {
    return (FLAG_MIGRATION_MAP as Record<string, string>)[flag] ?? flag
}

/**
 * Check if user has a specific flag (or admin bypass).
 * Handles both old and new flag names via normalizeFlag.
 */
export function userHasFlag(
    user: { role?: string | null; access_flags?: string[] | null },
    flag: string
): boolean {
    if (user.role === 'admin') return true
    const flags = user.access_flags ?? []
    const canonical = normalizeFlag(flag)
    // Check both canonical name AND any old name that maps to it
    return flags.some(f => normalizeFlag(f) === canonical)
}
