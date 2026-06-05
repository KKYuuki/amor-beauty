import { NotificationType } from "./notifications"
import { ServiceType } from "./payroll"

export interface ArtistProfile {
    id: string
    artistName?: string // Mapped from user.fullName
    email?: string      // Mapped from user.email
    phone?: string      // Mapped from user.phoneNumber
    instagram?: string  // Mapped from user.instagramHandle
    avatar?: string     // Mapped from user.avatarUrl
    photos?: string[]
    bio?: string
    tags?: string
}

export interface Tattoo {
    id: string
    created_at: Date
    artist_id: string
    client_id?: string
    image_id: string
    size: string
    tags: string
}

export interface UserNotification {
    id: string
    created_at: Date
    user_id: string
    appointment_id?: string
    title?: string
    message: string
    type: NotificationType
}

// == APPOINTMENTS START

export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED'

export type PaymentStatus = 'UNPAID' | 'DEPOSIT_PAID' | 'PAID_IN_FULL' | 'REFUNDED'

export type AppointmentType = 'HAIR' | 'NAILS' | 'FACIAL' | 'BODY_MASSAGE' | 'WAXING' | 'LASH_BROW' | 'MAKEUP' | 'OTHER'

export interface Appointment {
    id: string
    created_at: Date
    title: string
    client_id?: string  // Optional for walk-in appointments
    staff_id?: string | null  // Optional - null for unassigned/walk-in appointments
    branch_id?: string | null  // Optional - branch location for the appointment
    branch_name?: string | null  // Branch name from join with branches table
    time_start: Date
    time_end: Date
    actual_time_start?: Date
    actual_time_end?: Date
    status: AppointmentStatus
    notes?: string
    type: AppointmentType | null
    is_active: boolean
    is_walkin: boolean  // True for walk-in appointments without a client account
    // Walk-in client details
    client_name?: string
    client_phone?: string
    client_email?: string
    // Payment tracking
    downpayment_id?: string | null
    downpayment_amount?: number | null
    downpayment_collected_at?: Date | null
    payment_status?: PaymentStatus
}

export interface TattooAppointment {
    id: string
    created_at: Date
    design_concept: string
    body_placement: string
    size_estimate?: number
    is_color: boolean
    artist_prep_time: number
    reference_image_id: string | null
    final_image_id: string | null
}

export type ShoeCleaningServiceType = 'STANDARD' | 'DEEP' | 'FULL'
export type ShoeCleaningWhiteningType = 'NONE' | 'MINIMAL' | 'MEDIUM' | 'FULL'
export type ShoeCleaningReglueType = 'NONE' | 'MINIMAL' | 'MAJOR' | 'FULL'

export interface ShoeAppointment {
    id: string
    created_at: Date
    shoe_name: string
    quantity: number
    drop_off_date?: Date
    pick_up_date?: Date
    cleaning_service: ShoeCleaningServiceType
    add_on_rush: boolean
    add_on_replacement: boolean
    add_on_water_repellent: boolean
    sole_whitening: ShoeCleaningWhiteningType
    reglue_service: ShoeCleaningReglueType
    total_cost: number
}

export type PiercingJewelryType = 'STUD' | 'RING' | 'BARBELL'

export interface PiercingAppointment {
    id: string
    created_at: Date
    piercing_location: string
    jewelry_material: string
    jewelry_style: PiercingJewelryType
    previous_piercing_issues: boolean
    aftercare_instructions?: string
}

// == APPOINTMENTS END

export interface Service {
    id: string
    created_at: string
    title: string
    price: number
    pricing_type: 'FIXED' | 'HOURLY'
    hourly_rate: number
    is_active: boolean
    branch_id?: string | null
    is_shared: boolean
    service_type?: ServiceType
}

export interface ServiceWithQuantity {
    id: string
    title: string
    price: number
    quantity: number
}

export interface ItemWithQuantity {
    id: string
    name: string
    price?: number
    quantity: number
}

// == Many to Many

export interface AppointmentItem {
    id: string
    appointment_id: string
    inventory_id?: string
    quantity: number
    fluid_quantity?: number
    inventory: {
        id: string
        name: string
        item_code?: string
        unit_price: number
        selling_price?: number
    } | null
}

export interface AppointmentService {
    appointment_id: string
    service_id: string
    created_at?: Date
    service?: Service
}

export interface ServiceItem {
    service_id: string
    inventory_id: string
    quantity: string
    fluid_quantity?: number
    inventory?: {
        name: string
        unit_price: number
    }
}
