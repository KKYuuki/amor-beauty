import { AppointmentStatus } from "./types/general"

/**
 * Get CSS classes for appointment status badges
 */
export function getStatusBadgeClasses(status: AppointmentStatus): string {
    switch (status) {
        case "COMPLETED":
            return "bg-green-400/20 text-green-400 border-green-400/20"
        case "CANCELLED":
            return "bg-red-400/20 text-red-400 border-red-400/20"
        case "CONFIRMED":
            return "bg-blue-400/20 text-blue-400 border-blue-400/20"
        case "PENDING":
            return "bg-yellow-400/20 text-yellow-400 border-yellow-400/20"
        default:
            return "bg-white/10 text-white/60 border-white/10"
    }
}

/**
 * Get CSS classes for appointment type badges
 */
export function getTypeBadgeClasses(type: string | null): string {
    switch (type) {
        case "TATTOO":
            return "bg-purple-400/20 text-purple-400 border-purple-400/20"
        case "PIERCING":
            return "bg-pink-400/20 text-pink-400 border-pink-400/20"
        case "SHOE":
            return "bg-cyan-400/20 text-cyan-400 border-cyan-400/20"
        default:
            return "bg-white/10 text-white/60 border-white/10"
    }
}
