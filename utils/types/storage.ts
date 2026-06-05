export interface OverlayData {
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
    scale: { x: number; y: number; z: number }
}

export type OverlayType = 'TEXTURE' | 'DECAL'

export interface Image {
    id: string
    created_at: Date
    updated_at?: Date
    user_id: string
    message_id?: string
    appointment_id?: string
    name: string
    url: string
    is_tattoo: boolean
    is_3d?: boolean
    is_website?: boolean
    chosen_model?: number
    thumbnail_url?: string | null
    overlay_type?: OverlayType | null
    overlay_data?: OverlayData | null
    size?: string
    tags?: string
}

export interface ImageUploadOptions {
    existingId?: string
    isTattoo?: boolean
    isWebsite?: boolean
    tattooData?: {
        size: string
        tags: string
    }
}

export interface UploadResult {
    id: string
    url: string
}