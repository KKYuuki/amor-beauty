export type UserRoleType = "admin" | "manager" | "staff" | "artist" | "piercer" | "shoe_tech"
export type PayoutPeriodType = "DAILY" | "WEEKLY" | "BIMONTHLY" | "MONTHLY"

export { type RateLevel as RateLevelId } from './payroll'

export interface UserProfile {
    id: string
    created_at: Date
    full_name: string
    email: string
    phone_number?: string
    instagram_handle?: string
    avatar_url?: string
    role: UserRoleType
    access_flags?: string[]
    is_active?: boolean
    last_login_at?: Date
    last_login_method?: string
    // Payroll fields
    rate_level_id?: string      // UUID reference to rate_levels
    rate_level_name?: string     // Display name for UI
    payout_period?: PayoutPeriodType
    // Branch assignments
    branch_ids?: string[]
}

export interface CreateUserProfilePayload {
    full_name: string
    email: string
}

export interface CreateNewUserPayload {
    first_name: string
    last_name: string
    email: string
    password: string
    confirm_password: string
}

export interface AuthKeys {
    id: string
    created_at: Date
    email?: string
    user_type?: string
}