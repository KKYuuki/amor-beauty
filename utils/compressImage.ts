'use client'

import imageCompression, { Options } from 'browser-image-compression'

export type CompressionPreset = 'avatar' | 'portfolio' | 'reference' | 'tutorial'

export interface CompressionSettings {
    maxSizeMB: number
    maxWidthOrHeight: number
    initialQuality: number
    fileType?: string
}

const COMPRESSION_PRESETS: Record<CompressionPreset, CompressionSettings> = {
    avatar: {
        maxSizeMB: 1,
        maxWidthOrHeight: 512,
        initialQuality: 0.85,
    },
    portfolio: {
        maxSizeMB: 5,
        maxWidthOrHeight: 2048,
        initialQuality: 0.9,
    },
    reference: {
        maxSizeMB: 5,
        maxWidthOrHeight: 2048,
        initialQuality: 0.85,
    },
    tutorial: {
        maxSizeMB: 2,
        maxWidthOrHeight: 1280,
        initialQuality: 0.8,
    },
}

/**
 * Compression options optimized for tattoo reference images.
 * - Preserves detail with 2048px max dimension
 * - Good quality at 0.85 for reference photos
 * - ~5MB max to balance quality vs storage
 */
const COMPRESSION_OPTIONS = {
    maxSizeMB: 5,
    maxWidthOrHeight: 2048,
    useWebWorker: true,
    initialQuality: 0.85,
}

/**
 * Compresses an image file for upload.
 * Uses browser-image-compression for efficient client-side compression.
 * 
 * @param file - The image file to compress
 * @returns Compressed file, or original if compression fails/not needed
 */
export async function compressImage(file: File): Promise<File> {
    // Skip non-image files
    if (!file.type.startsWith('image/')) {
        return file
    }

    // Skip already small files (under 1MB)
    if (file.size < 1024 * 1024) {
        return file
    }

    try {
        const compressedFile = await imageCompression(file, COMPRESSION_OPTIONS)

        // Return original if compression made it larger
        if (compressedFile.size >= file.size) {
            return file
        }

        console.log(`Image compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`)
        return compressedFile
    } catch (error) {
        console.error('Image compression failed:', error)
        return file // Return original on error
    }
}

export async function compressImageWithPreset(
    file: File,
    preset: CompressionPreset,
    onProgress?: (progress: number) => void
): Promise<File> {
    if (!file.type.startsWith('image/')) {
        return file
    }

    const settings = COMPRESSION_PRESETS[preset]
    const options: Options = {
        maxSizeMB: settings.maxSizeMB,
        maxWidthOrHeight: settings.maxWidthOrHeight,
        useWebWorker: true,
        initialQuality: settings.initialQuality,
        onProgress,
    }

    try {
        const compressedFile = await imageCompression(file, options)

        if (compressedFile.size >= file.size) {
            console.log(`Compression skipped: file would be larger`)
            return file
        }

        console.log(`Image compressed (${preset}): ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`)
        return compressedFile
    } catch (error) {
        console.error('Image compression failed:', error)
        return file
    }
}
