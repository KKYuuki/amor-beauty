// Branch Types

export type BranchStatus = 'ACTIVE' | 'INACTIVE'

export interface Branch {
    id: string
    created_at: string // Changed from Date to string for consistency
    updated_at: string
    name: string
    code: string // Unique short code (e.g., 'CEB-CR', 'CEB-LL')
    city: string
    address?: string | null
    phone?: string | null
    is_active: boolean
    created_by?: string | null
    updated_by?: string | null
}

export interface CreateBranchPayload {
    name: string
    code: string
    city: string
    address?: string
    phone?: string
}

export interface UpdateBranchPayload {
    id: string
    name?: string
    code?: string
    city?: string
    address?: string | null
    phone?: string | null
    is_active?: boolean
}
