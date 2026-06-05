'use server'

import { db } from "@/server/db"
import { storageFiles } from "@/server/db/schema"
import { eq } from "drizzle-orm"
import { Image } from "@/utils/types/storage"
import { createLogs } from "./logs"
import { ActionResponse, success, failure } from "@/utils/types/responses"

function isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidRegex.test(uuid)
}

export async function getSharedImage(imageId: string): Promise<ActionResponse<Image>> {
    if (!isValidUUID(imageId)) {
        return failure('Invalid image ID')
    }

    try {
        const [file] = await db
            .select()
            .from(storageFiles)
            .where(eq(storageFiles.id, imageId))
            .limit(1)

        if (!file) {
            return failure('Image not found')
        }

        const image: Image = {
            id: file.id,
            created_at: file.created_at,
            user_id: file.uploaded_by || '',
            name: file.name,
            url: file.public_url || file.url,
            is_tattoo: false,
            is_3d: false,
            is_website: false,
            message_id: undefined,
            appointment_id: undefined,
            chosen_model: undefined,
            thumbnail_url: null,
            overlay_type: null,
            overlay_data: null,
        }

        return success(image)
    } catch (error) {
        await createLogs({
            logs: [{
                level: 'ERROR',
                type: 'SYSTEM',
                message: error instanceof Error ? error.message : 'Unknown error fetching shared image',
            }],
        })
        return failure(error instanceof Error ? error.message : 'Failed to fetch image')
    }
}
