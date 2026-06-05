# TODOs, Stubs, and Build Fixes - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all build-breaking issues, implement stubbed functions, and add image processing utilities.

**Architecture:** 
- Phase 1: Fix module export errors causing build failures
- Phase 2: Implement export functionality for metrics and transactions
- Phase 3: Add image compression, crop, and batch upload features

**Tech Stack:** Next.js 15, React 19, TypeScript, Bun, Drizzle ORM, S3 Storage

---

## Phase 1: Critical Build Fixes

### Task 1: Remove Invalid Re-export from profile.ts

**Files:**
- Modify: `server/actions/profile.ts:611`

**Step 1: Remove the problematic re-export line**

Delete line 611 which contains:
```typescript
export { getUserImages, uploadImage, deleteUserImage } from './storage'
```

**Step 2: Verify the export statement is removed**

The file should end at the `createUser` function (around line 608). The `uploadProfileImage` function defined earlier (lines 78-112) remains unchanged as a proper export.

**Step 3: Verify build starts processing**

Run: `bun run build`
Expected: Build should now process profile.ts and show actual import errors for missing exports in consuming files

---

### Task 2: Update profilePage.tsx Imports

**Files:**
- Modify: `app/profile/profilePage.tsx:5-13`

**Step 1: Split the import statement**

Current imports (lines 5-13):
```typescript
import {
    getArtistProfile,
    getProfile,
    updateArtistProfile,
    updateProfile,
    uploadProfileImage as uploadProfileImageAction,
    getUserImages,
    deleteUserImage,
} from "@/server/actions/profile"
```

Replace with two import statements:
```typescript
import {
    getArtistProfile,
    getProfile,
    updateArtistProfile,
    updateProfile,
    uploadProfileImage as uploadProfileImageAction,
} from "@/server/actions/profile"
import {
    getUserImages,
    deleteUserImage,
} from "@/server/actions/storage"
```

**Step 2: Verify the uploadProfileImage wrapper is still called correctly**

The wrapper function at line 27-32 should remain:
```typescript
async function uploadProfileImage(file: File, userId: string): Promise<boolean | null> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('userId', userId)
    return uploadProfileImageAction(formData)
}
```

**Step 3: Run build to verify no import errors**

Run: `bun run build`
Expected: Build should now pass the profile.ts and profilePage.tsx compilation

---

### Task 3: Update profile page.tsx Imports

**Files:**
- Modify: `app/profile/page.tsx`

**Step 1: Check current imports**

Read the file to see current import structure. If it imports storage-related functions from profile, update to import from storage directly.

**Step 2: Update imports if needed**

Add storage import if getUserImages or similar are imported:
```typescript
import { getUserImages } from "@/server/actions/storage"
```

**Step 3: Verify build passes for profile pages**

Run: `bun run build`
Expected: No errors in profile/page.tsx or profile/profilePage.tsx

**Step 4: Commit Phase 1**

```bash
git add server/actions/profile.ts app/profile/profilePage.tsx app/profile/page.tsx
git commit -m "fix: remove invalid server action re-export, update imports"
```

---

## Phase 2: Export Functionality

### Task 4: Create Export Utility

**Files:**
- Create: `utils/export.ts`

**Step 1: Create the export utility file**

```typescript
/**
 * Export utilities for generating CSV and JSON exports
 */

export interface ExportColumn {
    key: string
    header: string
    formatter?: (value: unknown) => string
}

export interface ExportOptions {
    filename: string
    format: 'csv' | 'json'
    columns: ExportColumn[]
}

/**
 * Formats a value for CSV output
 */
function formatCsvValue(value: unknown): string {
    if (value === null || value === undefined) {
        return ''
    }
    const str = String(value)
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

/**
 * Converts array of objects to CSV string
 */
export function arrayToCsv<T extends Record<string, unknown>>(
    data: T[],
    columns: ExportColumn[]
): string {
    const headers = columns.map(col => col.header)
    const rows = data.map(item =>
        columns.map(col => {
            const value = item[col.key]
            const formatted = col.formatter ? col.formatter(value) : value
            return formatCsvValue(formatted)
        }).join(',')
    )
    return [headers.join(','), ...rows].join('\n')
}

/**
 * Converts array of objects to pretty-printed JSON string
 */
export function arrayToJson<T extends Record<string, unknown>>(
    data: T[],
    columns: ExportColumn[]
): string {
    const filteredData = data.map(item => {
        const result: Record<string, unknown> = {}
        for (const col of columns) {
            const value = item[col.key]
            result[col.key] = col.formatter ? col.formatter(value) : value
        }
        return result
    })
    return JSON.stringify(filteredData, null, 2)
}

/**
 * Generates a filename with timestamp
 */
export function generateFilename(baseName: string, format: 'csv' | 'json'): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    return `${baseName}_${timestamp}.${format}`
}

/**
 * Creates a download response for export
 */
export function createExportResponse<T extends Record<string, unknown>>(
    data: T[],
    options: ExportOptions
): { content: string; contentType: string; filename: string } {
    const content = options.format === 'csv'
        ? arrayToCsv(data, options.columns)
        : arrayToJson(data, options.columns)
    
    const contentType = options.format === 'csv'
        ? 'text/csv'
        : 'application/json'
    
    const filename = generateFilename(options.filename, options.format)
    
    return { content, contentType, filename }
}
```

**Step 2: Add export to index if exists**

Verify no central utils index, file is standalone.

**Step 3: Commit**

```bash
git add utils/export.ts
git commit -m "feat: add export utility for CSV/JSON generation"
```

---

### Task 5: Implement exportMetrics()

**Files:**
- Modify: `server/actions/metrics.ts:681`

**Step 1: Import the export utility**

Add at top of file:
```typescript
import { createExportResponse, ExportColumn } from '@/utils/export'
```

**Step 2: Define export column configurations**

Add near the export function:
```typescript
const METRICS_EXPORT_COLUMNS: ExportColumn[] = [
    { key: 'date', header: 'Date' },
    { key: 'revenue', header: 'Revenue', formatter: (v) => String(Number(v) || 0) },
    { key: 'expenses', header: 'Expenses', formatter: (v) => String(Number(v) || 0) },
    { key: 'appointments', header: 'Appointments', formatter: (v) => String(Number(v) || 0) },
    { key: 'clients', header: 'New Clients', formatter: (v) => String(Number(v) || 0) },
]
```

**Step 3: Replace the stub implementation**

Find the stub at line ~681 and replace with:
```typescript
export async function exportMetrics(
    format: 'csv' | 'json',
    _startDate?: Date,
    _endDate?: Date
): Promise<ActionResponse<{ content: string; contentType: string; filename: string }>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized: Not authenticated")
        }

        const adminCheck = await isAdmin(currentUser)
        if (!adminCheck) {
            return failure("Unauthorized: Admin access required")
        }

        // Get metrics data for export
        const metricsData = await getMetricsSummary()
        
        if (!metricsData) {
            return failure("No metrics data available")
        }

        // Prepare data for export
        const exportData = [{
            date: new Date().toISOString().split('T')[0],
            revenue: metricsData.totalRevenue || 0,
            expenses: metricsData.totalExpenses || 0,
            appointments: metricsData.totalAppointments || 0,
            clients: metricsData.newClients || 0,
        }]

        const result = createExportResponse(exportData, {
            filename: 'metrics_export',
            format,
            columns: METRICS_EXPORT_COLUMNS,
        })

        return success(result)
    } catch (error) {
        await logError({
            type: 'METRICS',
            message: `Failed to export metrics: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to export metrics')
    }
}
```

**Step 4: Commit**

```bash
git add server/actions/metrics.ts
git commit -m "feat: implement metrics export functionality"
```

---

### Task 6: Implement exportTransactions()

**Files:**
- Modify: `server/actions/transactions.ts:705`

**Step 1: Import the export utility**

Add at top of file:
```typescript
import { createExportResponse, ExportColumn } from '@/utils/export'
```

**Step 2: Define export column configurations**

Add near the export function:
```typescript
const TRANSACTION_EXPORT_COLUMNS: ExportColumn[] = [
    { key: 'id', header: 'Transaction ID' },
    { key: 'date', header: 'Date' },
    { key: 'type', header: 'Type' },
    { key: 'amount', header: 'Amount', formatter: (v) => String(Number(v) || 0) },
    { key: 'currency', header: 'Currency' },
    { key: 'status', header: 'Status' },
    { key: 'category', header: 'Category' },
    { key: 'description', header: 'Description' },
    { key: 'created_by', header: 'Created By' },
]
```

**Step 3: Replace the stub implementation**

Find the stub at line ~705 and replace with:
```typescript
export async function exportTransactions(
    format: 'csv' | 'json',
    filters?: TransactionFilters,
    _startDate?: Date,
    _endDate?: Date
): Promise<ActionResponse<{ content: string; contentType: string; filename: string }>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized: Not authenticated")
        }

        // Get transactions based on filters
        const result = await getTransactions(filters)
        
        if (!result.success || !result.data) {
            return failure("Failed to fetch transactions for export")
        }

        // Map transactions for export
        const exportData = result.data.map(t => ({
            id: t.id,
            date: t.created_at?.toISOString?.() ?? String(t.created_at),
            type: t.transaction_type || 'UNKNOWN',
            amount: t.amount || 0,
            currency: t.currency || 'PHP',
            status: t.status || 'PENDING',
            category: t.category || 'OTHER',
            description: t.description || '',
            created_by: t.created_by || '',
        }))

        const exportResult = createExportResponse(exportData, {
            filename: 'transactions_export',
            format,
            columns: TRANSACTION_EXPORT_COLUMNS,
        })

        return success(exportResult)
    } catch (error) {
        await logError({
            type: 'TRANSACTION',
            message: `Failed to export transactions: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to export transactions')
    }
}
```

**Step 4: Commit**

```bash
git add server/actions/transactions.ts
git commit -m "feat: implement transactions export functionality"
```

---

## Phase 3: Image Processing Features

### Task 7: Add Compression Presets to compressImage.ts

**Files:**
- Modify: `utils/compressImage.ts`

**Step 1: Add compression preset types**

Add after the imports:
```typescript
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
```

**Step 2: Add preset-based compression function**

Add after the existing compressImage function:
```typescript
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
```

**Step 3: Add Options import from library**

Update import at top:
```typescript
import imageCompression, { Options } from 'browser-image-compression'
```

**Step 4: Commit**

```bash
git add utils/compressImage.ts
git commit -m "feat: add compression presets for avatar/portfolio/reference"
```

---

### Task 8: Create Image Crop Utility for Avatars

**Files:**
- Create: `utils/imageCrop.ts`

**Step 1: Create the image crop utility**

```typescript
'use client'

export interface CropArea {
    x: number
    y: number
    width: number
    height: number
}

export interface CropOptions {
    aspectRatio?: number
    maxWidth?: number
    maxHeight?: number
    outputFormat?: 'image/jpeg' | 'image/png' | 'image/webp'
    quality?: number
}

const DEFAULT_CROP_OPTIONS: CropOptions = {
    aspectRatio: 1,
    maxWidth: 512,
    maxHeight: 512,
    outputFormat: 'image/jpeg',
    quality: 0.85,
}

export async function getCroppedImage(
    image: HTMLImageElement,
    cropArea: CropArea,
    options: CropOptions = {}
): Promise<Blob> {
    const opts = { ...DEFAULT_CROP_OPTIONS, ...options }
    
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
        throw new Error('Failed to get canvas context')
    }

    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height

    const cropX = cropArea.x * scaleX
    const cropY = cropArea.y * scaleY
    const cropWidth = cropArea.width * scaleX
    const cropHeight = cropArea.height * scaleY

    const outputWidth = opts.maxWidth || cropWidth
    const outputHeight = opts.maxHeight || cropHeight

    canvas.width = outputWidth
    canvas.height = outputHeight

    ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        outputWidth,
        outputHeight
    )

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob)
                } else {
                    reject(new Error('Failed to create blob'))
                }
            },
            opts.outputFormat,
            opts.quality
        )
    })
}

export async function cropAndResizeAvatar(
    file: File,
    cropArea?: CropArea
): Promise<File> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        
        reader.onload = (e) => {
            const img = new Image()
            
            img.onload = async () => {
                try {
                    let area = cropArea
                    
                    if (!area) {
                        const size = Math.min(img.width, img.height)
                        area = {
                            x: (img.width - size) / 2,
                            y: (img.height - size) / 2,
                            width: size,
                            height: size,
                        }
                    }

                    const blob = await getCroppedImage(img, area, {
                        aspectRatio: 1,
                        maxWidth: 512,
                        maxHeight: 512,
                        quality: 0.85,
                    })

                    const croppedFile = new File(
                        [blob],
                        file.name.replace(/\.[^.]+$/, '.jpg'),
                        { type: 'image/jpeg' }
                    )

                    resolve(croppedFile)
                } catch (error) {
                    reject(error)
                }
            }
            
            img.onerror = () => reject(new Error('Failed to load image'))
            img.src = e.target?.result as string
        }
        
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
    })
}

export function createCenteredCrop(
    imageWidth: number,
    imageHeight: number,
    aspectRatio: number = 1
): CropArea {
    let cropWidth: number
    let cropHeight: number

    if (imageWidth / imageHeight > aspectRatio) {
        cropHeight = imageHeight
        cropWidth = cropHeight * aspectRatio
    } else {
        cropWidth = imageWidth
        cropHeight = cropWidth / aspectRatio
    }

    return {
        x: (imageWidth - cropWidth) / 2,
        y: (imageHeight - cropHeight) / 2,
        width: cropWidth,
        height: cropHeight,
    }
}
```

**Step 2: Commit**

```bash
git add utils/imageCrop.ts
git commit -m "feat: add image crop utility for avatars"
```

---

### Task 9: Add Batch Upload to storage.ts

**Files:**
- Modify: `server/actions/storage.ts`

**Step 1: Add batch upload function after existing uploadImage function**

Add after the `deleteUserImage` function:
```typescript
export interface BatchUploadResult {
    successful: UserImage[]
    failed: { file: string; error: string }[]
    total: number
}

export async function uploadBatchImages(
    files: File[],
    userId: string,
    options: UploadImageOptions = {}
): Promise<ActionResponse<BatchUploadResult>> {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return failure("Unauthorized: Not authenticated")
        }

        const hasAccess = await canAccessUserImages(currentUser.id, userId)
        if (!hasAccess) {
            return failure("Unauthorized: Cannot upload images for this user")
        }

        const successful: UserImage[] = []
        const failed: { file: string; error: string }[] = []

        const CONCURRENT_UPLOADS = 3
        const batches: File[][] = []
        
        for (let i = 0; i < files.length; i += CONCURRENT_UPLOADS) {
            batches.push(files.slice(i, i + CONCURRENT_UPLOADS))
        }

        for (const batch of batches) {
            const results = await Promise.allSettled(
                batch.map(file => uploadImage(file, userId, options))
            )

            for (let i = 0; i < results.length; i++) {
                const result = results[i]
                const file = batch[i]

                if (result.status === 'fulfilled') {
                    const uploadResult = result.value
                    if (uploadResult.success && uploadResult.data) {
                        successful.push(uploadResult.data)
                    } else {
                        failed.push({
                            file: file.name,
                            error: uploadResult.error || 'Upload failed',
                        })
                    }
                } else {
                    failed.push({
                        file: file.name,
                        error: result.reason?.message || 'Unknown error',
                    })
                }
            }
        }

        createLogs({
            logs: [{
                level: successful.length > 0 ? 'INFO' : 'WARN',
                message: `Batch upload completed: ${successful.length} successful, ${failed.length} failed for user ${userId}`,
                type: 'STORAGE'
            }]
        })

        return success({
            successful,
            failed,
            total: files.length,
        })
    } catch (error) {
        await logError({
            type: 'STORAGE',
            message: `Failed to batch upload images for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure(error instanceof Error ? error.message : 'Failed to upload images')
    }
}
```

**Step 2: Commit**

```bash
git add server/actions/storage.ts
git commit -m "feat: add batch image upload with concurrent limit"
```

---

### Task 10: Create BatchImageUploader Component

**Files:**
- Create: `components/BatchImageUploader.tsx`

**Step 1: Create the batch uploader component**

```typescript
"use client"

import { useState, useCallback, useRef } from 'react'
import { UploadIcon, XIcon, CheckIcon, LoaderCircleIcon } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { uploadBatchImages, UserImage } from '@/server/actions/storage'
import { compressImageWithPreset, CompressionPreset } from '@/utils/compressImage'

interface BatchImageUploaderProps {
    userId: string
    preset?: CompressionPreset
    maxFiles?: number
    onUploadComplete?: (images: UserImage[]) => void
    onUploadError?: (errors: { file: string; error: string }[]) => void
    className?: string
}

interface UploadingFile {
    id: string
    file: File
    status: 'pending' | 'uploading' | 'success' | 'error'
    error?: string
    result?: UserImage
}

export default function BatchImageUploader({
    userId,
    preset = 'portfolio',
    maxFiles = 10,
    onUploadComplete,
    onUploadError,
    className = '',
}: BatchImageUploaderProps) {
    const [files, setFiles] = useState<UploadingFile[]>([])
    const [isDragging, setIsDragging] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const handleFilesSelected = useCallback(async (selectedFiles: FileList | null) => {
        if (!selectedFiles) return

        const fileArray = Array.from(selectedFiles).slice(0, maxFiles)
        const newFiles: UploadingFile[] = fileArray.map(file => ({
            id: `${file.name}-${Date.now()}`,
            file,
            status: 'pending' as const,
        }))

        setFiles(prev => [...prev, ...newFiles])

        const compressedFiles: File[] = []
        for (const uf of newFiles) {
            try {
                const compressed = await compressImageWithPreset(uf.file, preset)
                compressedFiles.push(compressed)
            } catch {
                compressedFiles.push(uf.file)
            }
        }

        setFiles(prev => prev.map(f => 
            newFiles.some(nf => nf.id === f.id)
                ? { ...f, status: 'uploading' as const }
                : f
        ))

        const result = await uploadBatchImages(compressedFiles, userId)

        if (result.success && result.data) {
            const { successful, failed } = result.data

            setFiles(prev => prev.map(f => {
                const uploadIndex = newFiles.findIndex(nf => nf.id === f.id)
                if (uploadIndex === -1) return f

                const successResult = successful[uploadIndex]
                const failResult = failed.find(fa => fa.file === f.file.name)

                if (successResult) {
                    return { ...f, status: 'success' as const, result: successResult }
                } else if (failResult) {
                    return { ...f, status: 'error' as const, error: failResult.error }
                }
                return f
            }))

            if (successful.length > 0 && onUploadComplete) {
                onUploadComplete(successful)
            }
            if (failed.length > 0 && onUploadError) {
                onUploadError(failed)
            }
        } else {
            setFiles(prev => prev.map(f =>
                newFiles.some(nf => nf.id === f.id)
                    ? { ...f, status: 'error' as const, error: result.error || 'Upload failed' }
                    : f
            ))
        }
    }, [userId, preset, maxFiles, onUploadComplete, onUploadError])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        handleFilesSelected(e.dataTransfer.files)
    }, [handleFilesSelected])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback(() => {
        setIsDragging(false)
    }, [])

    const removeFile = useCallback((id: string) => {
        setFiles(prev => prev.filter(f => f.id !== id))
    }, [])

    return (
        <div className={`space-y-4 ${className}`}>
            <div
                className={`
                    border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                    transition-colors duration-200
                    ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600 hover:border-gray-500'}
                `}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => inputRef.current?.click()}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFilesSelected(e.target.files)}
                />
                <UploadIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-400">
                    Drag and drop images here, or click to select
                </p>
                <p className="text-sm text-gray-500 mt-2">
                    Max {maxFiles} files
                </p>
            </div>

            <AnimatePresence>
                {files.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-2"
                    >
                        {files.map(file => (
                            <motion.div
                                key={file.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg"
                            >
                                {file.status === 'uploading' && (
                                    <LoaderCircleIcon className="w-5 h-5 animate-spin text-blue-400" />
                                )}
                                {file.status === 'success' && (
                                    <CheckIcon className="w-5 h-5 text-green-400" />
                                )}
                                {file.status === 'error' && (
                                    <XIcon className="w-5 h-5 text-red-400" />
                                )}
                                <span className="flex-1 text-sm truncate">
                                    {file.file.name}
                                </span>
                                {file.error && (
                                    <span className="text-xs text-red-400">{file.error}</span>
                                )}
                                <button
                                    onClick={() => removeFile(file.id)}
                                    className="p-1 hover:bg-gray-700 rounded"
                                >
                                    <XIcon className="w-4 h-4" />
                                </button>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
```

**Step 2: Commit**

```bash
git add components/BatchImageUploader.tsx
git commit -m "feat: add BatchImageUploader component with drag and drop"
```

---

### Task 11: Add Error Logging to Blocked Stubs

**Files:**
- Modify: `server/actions/metrics.ts` (getRatingMetrics, getStaffPerformance, getAppointmentReviews)
- Modify: `server/actions/appointments.ts` (appointment item functions)

**Step 1: Update getRatingMetrics stub**

In `server/actions/metrics.ts`, find `getRatingMetrics` and update the stub:
```typescript
export async function getRatingMetrics(): Promise<ActionResponse<RatingMetrics>> {
    await logError({
        type: 'METRICS',
        message: 'getRatingMetrics called but ratings table not implemented. Returning empty metrics.'
    })
    return success({
        averageRating: 0,
        totalRatings: 0,
        distribution: [],
    })
}
```

**Step 2: Update getStaffPerformance stub**
```typescript
export async function getStaffPerformance(): Promise<ActionResponse<StaffPerformance[]>> {
    await logError({
        type: 'METRICS',
        message: 'getStaffPerformance called but ratings table not implemented. Returning empty array.'
    })
    return success([])
}
```

**Step 3: Update getAppointmentReviews stub**
```typescript
export async function getAppointmentReviews(): Promise<ActionResponse<{ data: AppointmentReview[]; hasMore: boolean; total: number }>> {
    await logError({
        type: 'METRICS',
        message: 'getAppointmentReviews called but reviews table not implemented. Returning empty result.'
    })
    return success({ data: [], hasMore: false, total: 0 })
}
```

**Step 4: Update appointment items stubs**

In `server/actions/appointments.ts`, update the stubs:
```typescript
export async function getAppointmentItems(_appointmentId: string) {
    await logError({
        type: 'APPOINTMENT',
        message: `getAppointmentItems called with ${_appointmentId} but inventory relations not implemented. Returning empty array.`
    })
    return []
}

export async function addAppointmentItem(_appointmentId: string, _itemId: string, _quantity: number) {
    await logError({
        type: 'APPOINTMENT',
        message: `addAppointmentItem called but inventory relations not implemented. Operation failed.`
    })
    return false
}

export async function updateAppointmentItem(_appointmentItemId: string, _quantity: number) {
    await logError({
        type: 'APPOINTMENT',
        message: `updateAppointmentItem called but inventory relations not implemented. Operation failed.`
    })
    return false
}

export async function deleteAppointmentItem(_appointmentItemId: string) {
    await logError({
        type: 'APPOINTMENT',
        message: `deleteAppointmentItem called but inventory relations not implemented. Operation failed.`
    })
    return false
}
```

**Step 5: Commit**

```bash
git add server/actions/metrics.ts server/actions/appointments.ts
git commit -m "fix: add error logging to blocked stub functions"
```

---

### Task 12: Run Final Build and Lint

**Files:**
- None (verification only)

**Step 1: Run lint**

```bash
bun run lint
```

Expected: No errors. Fix any warnings.

**Step 2: Run build**

```bash
bun run build
```

Expected: Build completes successfully without errors.

**Step 3: Run typecheck if available**

```bash
bun run typecheck
```

Expected: No TypeScript errors.

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final build verification and cleanup"
```