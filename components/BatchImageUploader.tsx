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
        } else if (!result.success) {
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
