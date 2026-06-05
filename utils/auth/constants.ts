export const STAFF_ROLES = ['admin', 'manager', 'staff', 'artist', 'piercer', 'shoe_tech'] as const

export type StaffRole = typeof STAFF_ROLES[number]
