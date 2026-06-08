'use client'

import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
    UploadIcon,
    FileSpreadsheetIcon,
    DownloadIcon,
    AlertCircleIcon,
    CheckCircleIcon,
    XIcon,
    FileIcon,
    TableIcon,
} from 'lucide-react'
import {
    CSVColumn,
    CSVImportResult,
    parseCSV,
    generateCSVTemplate,
} from '@/utils/csv-import'


interface CSVImportModalProps<T extends Record<string, unknown>> {
    isOpen: boolean
    onClose: () => void
    onImport: (data: T[], defaultBranchId: string | null) => Promise<{ success: boolean; error?: string }>
    columns: CSVColumn[]
    title: string
    description?: string
    maxPreviewRows?: number
    defaultBranchId?: string | null
}

export default function CSVImportModal<T extends Record<string, unknown>>({
    isOpen,
    onClose,
    onImport,
    columns,
    title,
    description = 'Upload a CSV file to import data',
    maxPreviewRows = 5,
    defaultBranchId,
}: CSVImportModalProps<T>) {
    const [file, setFile] = useState<File | null>(null)
    const [content, setContent] = useState<string>('')
    const [parseResult, setParseResult] = useState<CSVImportResult<T> | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [importSuccess, setImportSuccess] = useState(false)
    const [selectedBranchId, setSelectedBranchId] = useState<string | null>(defaultBranchId ?? null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        const droppedFile = e.dataTransfer.files[0]
        if (droppedFile && droppedFile.type === 'text/csv') {
            handleFile(droppedFile)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (selectedFile) {
            handleFile(selectedFile)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleFile = (selectedFile: File) => {
        setFile(selectedFile)
        setParseResult(null)
        setImportSuccess(false)

        const reader = new FileReader()
        reader.onload = (e) => {
            const text = e.target?.result as string
            setContent(text)
            const result = parseCSV<T>(text, columns)
            setParseResult(result)
        }
        reader.readAsText(selectedFile)
    }

    const handleDownloadTemplate = () => {
        const template = generateCSVTemplate(columns)
        const blob = new Blob([template], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'template.csv'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
    }

    const handleImport = async () => {
        if (!parseResult?.data || parseResult.data.length === 0) return

        setIsImporting(true)
        try {
            const result = await onImport(parseResult.data as T[], selectedBranchId)
            if (result.success) {
                setImportSuccess(true)
                setTimeout(() => {
                    onClose()
                    resetState()
                }, 1500)
            } else {
                setParseResult({
                    ...parseResult,
                    success: false,
                    errors: [
                        ...(parseResult.errors || []),
                        { row: 0, field: 'import', message: result.error || 'Import failed' },
                    ],
                })
            }
        } catch (error) {
            setParseResult({
                ...parseResult,
                success: false,
                errors: [
                    ...(parseResult.errors || []),
                    {
                        row: 0,
                        field: 'import',
                        message: error instanceof Error ? error.message : 'Import failed',
                    },
                ],
            })
        } finally {
            setIsImporting(false)
        }
    }

    const resetState = () => {
        setFile(null)
        setContent('')
        setParseResult(null)
        setImportSuccess(false)
    }

    const handleClose = () => {
        resetState()
        onClose()
    }

    const getPreviewRows = () => {
        if (!content) return []
        const lines = content.trim().split('\n')
        return lines.slice(1, maxPreviewRows + 1)
    }

    const getPreviewHeaders = () => {
        if (!content) return []
        const lines = content.trim().split('\n')
        if (lines.length === 0) return []
        return lines[0].split(',').map(h => h.trim())
    }

    if (!isOpen) return null

    return (
        <AnimatePresence>
            {isOpen && (
                <div
                    className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className='bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-border flex flex-col'
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className='p-6 border-b border-border flex items-center justify-between'>
                            <div className='flex items-center gap-3'>
                                <div className='p-2 bg-blue-500/20 rounded-lg'>
                                    <FileSpreadsheetIcon className='w-6 h-6 text-blue-400' />
                                </div>
                                <div>
                                    <h2 className='text-xl font-bold'>{title}</h2>
                                    <p className='text-muted-foreground text-sm'>{description}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                className='p-2 hover:bg-muted rounded-lg transition-colors'
                            >
                                <XIcon className='w-5 h-5' />
                            </button>
                        </div>

                        {/* Content */}
                        <div className='flex-1 overflow-auto p-6 space-y-6'>
                            {/* Branch Selector */}
                            <div className='p-4 bg-muted rounded-lg border border-border'>
                                
                                <p className='mt-2 text-xs text-muted-foreground'>
                                    Select a default branch. Entries without a &apos;branch&apos; column will use this branch.
                                </p>
                            </div>

                            {/* Template Download */}
                            <div className='flex items-center justify-between p-4 bg-muted rounded-lg border border-border'>
                                <div className='flex items-center gap-3'>
                                    <TableIcon className='w-5 h-5 text-muted-foreground' />
                                    <div>
                                        <p className='font-medium'>Download Template</p>
                                        <p className='text-sm text-muted-foreground'>
                                            Get a CSV template with the correct columns
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleDownloadTemplate}
                                    className='flex items-center gap-2 px-4 py-2 bg-card hover:bg-muted rounded-lg transition-colors text-sm'
                                >
                                    <DownloadIcon className='w-4 h-4' />
                                    Template
                                </button>
                            </div>

                            {/* Drop Zone */}
                            {!file && (
                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                                        isDragging
                                            ? 'border-blue-500 bg-blue-500/10'
                                            : 'border-border hover:border-border'
                                    }`}
                                >
                                    <UploadIcon className='w-12 h-12 mx-auto mb-4 text-muted-foreground/70' />
                                    <p className='font-medium mb-2'>
                                        Drop your CSV file here, or click to browse
                                    </p>
                                    <p className='text-sm text-muted-foreground'>
                                        Supports .csv files up to 10MB
                                    </p>
                                    <input
                                        ref={fileInputRef}
                                        type='file'
                                        accept='.csv,text/csv'
                                        onChange={handleFileInput}
                                        className='hidden'
                                    />
                                </div>
                            )}

                            {/* File Info */}
                            {file && !importSuccess && (
                                <div className='flex items-center gap-3 p-4 bg-muted rounded-lg border border-border'>
                                    <FileIcon className='w-8 h-8 text-green-400' />
                                    <div className='flex-1'>
                                        <p className='font-medium'>{file.name}</p>
                                        <p className='text-sm text-muted-foreground'>
                                            {(file.size / 1024).toFixed(2)} KB
                                        </p>
                                    </div>
                                    <button
                                        onClick={resetState}
                                        className='p-2 hover:bg-muted rounded-lg transition-colors'
                                    >
                                        <XIcon className='w-4 h-4' />
                                    </button>
                                </div>
                            )}

                            {/* Preview */}
                            {content && parseResult?.data && parseResult.data.length > 0 && (
                                <div className='space-y-2'>
                                    <h3 className='font-medium flex items-center gap-2'>
                                        <TableIcon className='w-4 h-4' />
                                        Preview ({Math.min(parseResult.data.length, maxPreviewRows)} of{' '}
                                        {parseResult.data.length} rows)
                                    </h3>
                                    <div className='overflow-x-auto border border-border rounded-lg'>
                                        <table className='w-full text-sm'>
                                            <thead className='bg-muted'>
                                                <tr>
                                                    {getPreviewHeaders().map((header, idx) => (
                                                        <th
                                                            key={idx}
                                                            className='px-4 py-2 text-left font-medium text-foreground border-b border-border whitespace-nowrap'
                                                        >
                                                            {header}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {getPreviewRows().map((row, rowIdx) => (
                                                    <tr
                                                        key={rowIdx}
                                                        className='border-b border-border last:border-0'
                                                    >
                                                        {row.split(',').map((cell, cellIdx) => (
                                                            <td
                                                                key={cellIdx}
                                                                className='px-4 py-2 text-muted-foreground whitespace-nowrap truncate max-w-[150px]'
                                                            >
                                                                {cell.replace(/^"|"$/g, '')}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Errors */}
                            {parseResult?.errors && parseResult.errors.length > 0 && (
                                <div className='space-y-2'>
                                    <h3 className='font-medium flex items-center gap-2 text-red-400'>
                                        <AlertCircleIcon className='w-4 h-4' />
                                        Errors ({parseResult.errors.length})
                                    </h3>
                                    <div className='bg-red-500/10 border border-red-500/20 rounded-lg p-4 max-h-48 overflow-auto'>
                                        <ul className='space-y-2 text-sm'>
                                            {parseResult.errors.map((error, idx) => (
                                                <li
                                                    key={idx}
                                                    className='flex items-start gap-2 text-red-300'
                                                >
                                                    <span className='font-mono text-xs bg-red-500/20 px-2 py-0.5 rounded shrink-0'>
                                                        Row {error.row}
                                                    </span>
                                                    <span>
                                                        <span className='font-medium'>{error.field}:</span>{' '}
                                                        {error.message}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Success Summary */}
                            {parseResult?.success && parseResult.data && (
                                <div className='flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg'>
                                    <CheckCircleIcon className='w-6 h-6 text-green-400 shrink-0' />
                                    <div>
                                        <p className='font-medium text-green-300'>
                                            {parseResult.data.length} row(s) ready to import
                                        </p>
                                        {parseResult.skippedRows && parseResult.skippedRows > 0 && (
                                            <p className='text-sm text-muted-foreground'>
                                                {parseResult.skippedRows} empty row(s) skipped
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Import Success */}
                            {importSuccess && (
                                <div className='flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg'>
                                    <CheckCircleIcon className='w-6 h-6 text-green-400 shrink-0' />
                                    <p className='font-medium text-green-300'>
                                        Import completed successfully!
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className='p-6 border-t border-border flex justify-end gap-3'>
                            <button
                                onClick={handleClose}
                                className='px-4 py-2 bg-card hover:bg-muted rounded-lg transition-colors'
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={
                                    !parseResult?.success ||
                                    !parseResult.data?.length ||
                                    isImporting
                                }
                                className='flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2 border-blue-500/30'
                            >
                                {isImporting ? (
                                    <>
                                        <div className='w-4 h-4 border-2 border-blue-300/30 border-t-blue-300 rounded-full animate-spin' />
                                        Importing...
                                    </>
                                ) : (
                                    <>
                                        <UploadIcon className='w-4 h-4' />
                                        Import
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
