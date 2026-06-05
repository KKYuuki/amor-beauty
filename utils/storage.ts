import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// ============================================================================
// S3 CONFIGURATION
// ============================================================================

interface S3Config {
    endpoint: string
    bucket: string
    accessKey: string
    secretKey: string
    publicUrl: string
}

function getS3Config(): S3Config | null {
    const endpoint = process.env.S3_ENDPOINT
    const bucket = process.env.S3_BUCKET
    const accessKey = process.env.S3_ACCESS_KEY
    const secretKey = process.env.S3_SECRET_KEY
    const publicUrl = process.env.S3_PUBLIC_URL

    if (!endpoint || !bucket || !accessKey || !secretKey || !publicUrl) {
        console.warn('S3 configuration incomplete. Missing required environment variables.')
        return null
    }

    return { endpoint, bucket, accessKey, secretKey, publicUrl }
}

function createS3Client(config: S3Config): S3Client {
    return new S3Client({
        region: "auto",
        endpoint: config.endpoint,
        credentials: {
            accessKeyId: config.accessKey,
            secretAccessKey: config.secretKey,
        },
        forcePathStyle: true, // Required for RustFS and other S3-compatible services
    })
}

let s3ClientInstance: S3Client | null = null
let s3ConfigInstance: S3Config | null = null

export function getS3ClientAndConfig(): { client: S3Client; config: S3Config } | null {
    if (!s3ConfigInstance) {
        s3ConfigInstance = getS3Config()
    }

    if (!s3ConfigInstance) {
        return null
    }

    if (!s3ClientInstance) {
        s3ClientInstance = createS3Client(s3ConfigInstance)
    }

    return { client: s3ClientInstance, config: s3ConfigInstance }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class StorageError extends Error {
    constructor(
        message: string,
        public readonly operation: string,
        public readonly cause?: Error
    ) {
        super(message)
        this.name = 'StorageError'
    }
}

// ============================================================================
// UPLOAD OPERATIONS
// ============================================================================

export interface UploadResult {
    url: string
    key: string
}

/**
 * Uploads a file buffer to S3-compatible storage (RustFS)
 * @param buffer - File content as Buffer
 * @param key - Unique file path/name (e.g., "avatars/user-123.png")
 * @param contentType - MIME type of the file
 * @returns Upload result with public URL and key
 */
export async function uploadFile(
    buffer: Buffer,
    key: string,
    contentType: string
): Promise<UploadResult> {
    const result = getS3ClientAndConfig()

    if (!result) {
        throw new StorageError(
            'S3 storage not configured. Check S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_PUBLIC_URL environment variables.',
            'upload'
        )
    }

    const { client, config } = result

    try {
        const command = new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            ACL: "public-read",
        })

        await client.send(command)

        const publicUrl = `${config.publicUrl}/${config.bucket}/${key}`

        return {
            url: publicUrl,
            key: key,
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('S3 Upload Error:', { key, contentType, error: message })
        throw new StorageError(
            `Failed to upload file to storage: ${message}`,
            'upload',
            error instanceof Error ? error : undefined
        )
    }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Deletes a file from S3-compatible storage
 * @param key - Unique file path/name
 */
export async function deleteFile(key: string): Promise<void> {
    const result = getS3ClientAndConfig()

    if (!result) {
        throw new StorageError(
            'S3 storage not configured.',
            'delete'
        )
    }

    const { client, config } = result

    try {
        const command = new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: key,
        })

        await client.send(command)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('S3 Delete Error:', { key, error: message })
        throw new StorageError(
            `Failed to delete file from storage: ${message}`,
            'delete',
            error instanceof Error ? error : undefined
        )
    }
}

// ============================================================================
// PRESIGNED URL OPERATIONS
// ============================================================================

/**
 * Generates a presigned URL for temporary file access
 * @param key - Unique file path/name
 * @param expiresIn - Expiration time in seconds (default 3600)
 * @returns Presigned URL for temporary access
 */
export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const result = getS3ClientAndConfig()

    if (!result) {
        throw new StorageError(
            'S3 storage not configured.',
            'presign'
        )
    }

    const { client, config } = result

    try {
        const command = new GetObjectCommand({
            Bucket: config.bucket,
            Key: key,
        })

        return await getSignedUrl(client, command, { expiresIn })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('S3 Presign Error:', { key, error: message })
        throw new StorageError(
            `Failed to generate presigned URL: ${message}`,
            'presign',
            error instanceof Error ? error : undefined
        )
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extracts the S3 key from a full public URL
 * @param url - Full public URL
 * @returns The object key, or null if invalid
 */
export function getKeyFromUrl(url: string): string | null {
    const config = getS3Config()

    if (!config) {
        return null
    }

    if (!url.startsWith(config.publicUrl)) {
        return null
    }

    const prefix = `${config.publicUrl}/${config.bucket}/`
    if (url.startsWith(prefix)) {
        return url.slice(prefix.length)
    }

    return null
}

/**
 * Check if S3 storage is properly configured
 * @returns true if all required environment variables are set
 */
export function isStorageConfigured(): boolean {
    return getS3Config() !== null
}

/**
 * Get the public URL base for constructing file URLs
 * @returns The public URL base or null if not configured
 */
export function getStoragePublicUrl(): string | null {
    const config = getS3Config()
    return config ? `${config.publicUrl}/${config.bucket}` : null
}
