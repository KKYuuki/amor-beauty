"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { motion } from "motion/react"
import { XIcon, LoaderCircleIcon, AlertCircleIcon, UploadIcon, FileIcon } from "lucide-react"
import {
    LedgerEntry,
    LedgerEntryType,
    CreateLedgerEntryPayload,
} from "@/utils/types/ledger"
import { useDropzone } from "react-dropzone"
import {
    AccountingCategory,
    createLedgerEntry,
    updateLedgerEntry,
} from "@/server/actions/accounting"
import { withRetry } from "@/utils/retry"
import { ACCOUNTING_PAYMENT_METHODS, AccountingPaymentMethod } from "@/utils/types/payment"
import { safeToDate, safeToISOString } from "@/utils/date-utils"

const ENTRY_TYPES: LedgerEntryType[] = [
    "EXPENSE",
    "REVENUE",
    "ASSET",
    "LIABILITY",
    "EQUITY",
]

const ENTRY_TYPE_COLORS: Record<LedgerEntryType, string> = {
    EXPENSE: "text-red-300 border-red-500/30 bg-red-500/10",
    REVENUE: "text-green-300 border-green-500/30 bg-green-500/10",
    ASSET: "text-blue-300 border-blue-500/30 bg-blue-500/10",
    LIABILITY: "text-orange-300 border-orange-500/30 bg-orange-500/10",
    EQUITY: "text-purple-300 border-purple-500/30 bg-purple-500/10",
}

export interface EntryNotificationDetails {
    description: string
    date: Date
    isUpdate: boolean
}

interface EntryModalProps {
    entry: LedgerEntry | null
    currencySymbol: string
    categories: AccountingCategory[]
    onClose: () => void
    onSuccess: (details: EntryNotificationDetails) => void
    isAdmin: boolean
    viewOnly?: boolean
}

export default function EntryModal({
    entry,
    currencySymbol,
    categories,
    onClose,
    onSuccess,
    isAdmin,
    viewOnly = false,
}: EntryModalProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<AccountingPaymentMethod | "">(
        entry?.payment_method || ""
    )
    const [formData, setFormData] = useState<CreateLedgerEntryPayload>({
        entry_date: entry ? new Date(entry.entry_date) : new Date(),
        entry_type: entry?.entry_type || "EXPENSE",
        category: entry?.category || "",
        description: entry?.description || "",
        reference: entry?.reference || "",
        debit: entry ? Number(entry.debit) : 0,
        credit: entry ? Number(entry.credit) : 0,
    })
    const [proofFile, setProofFile] = useState<File | null>(null)
    const [categorySource, setCategorySource] = useState<"dropdown" | "custom">("dropdown")

    const categoriesByType = useMemo(() => {
        const grouped: Record<LedgerEntryType, AccountingCategory[]> = {
            EXPENSE: [],
            REVENUE: [],
            ASSET: [],
            LIABILITY: [],
            EQUITY: [],
        }
        categories.forEach((cat) => {
            grouped[cat.type].push(cat)
        })
        return grouped
    }, [categories])

    const availableCategories = categoriesByType[formData.entry_type] || []

    const getDebitCreditLabels = (entryType: LedgerEntryType) => {
        switch (entryType) {
            case "EXPENSE":
                return { debitLabel: "Expense Amount (+)", creditLabel: "Reduction (−)" }
            case "REVENUE":
                return { debitLabel: "Reduction / Refund (−)", creditLabel: "Income Amount (+)" }
            case "ASSET":
                return { debitLabel: "Increase (+)", creditLabel: "Decrease (−)" }
            case "LIABILITY":
                return { debitLabel: "Decrease (−)", creditLabel: "Increase (+)" }
            case "EQUITY":
                return { debitLabel: "Decrease (−)", creditLabel: "Increase (+)" }
            default:
                return { debitLabel: "Debit", creditLabel: "Credit" }
        }
    }

    const { debitLabel, creditLabel } = getDebitCreditLabels(formData.entry_type)

    const handleCategoryChange = (categoryName: string) => {
        setCategorySource("dropdown")
        const selectedCategory = categories.find((c) => c.name === categoryName)
        if (selectedCategory) {
            setFormData((prev) => ({
                ...prev,
                category: categoryName,
                entry_type: selectedCategory.type,
            }))
        } else {
            setFormData((prev) => ({
                ...prev,
                category: "",
            }))
        }
    }

    const handleCustomCategoryChange = (value: string) => {
        setCategorySource("custom")
        setFormData((prev) => ({
            ...prev,
            category: value,
        }))
    }

    const handleTypeChange = (type: LedgerEntryType) => {
        const currentCategory = categories.find((c) => c.name === formData.category)
        if (currentCategory && currentCategory.type !== type) {
            setFormData((prev) => ({
                ...prev,
                entry_type: type,
                category: "",
            }))
        } else {
            setFormData((prev) => ({
                ...prev,
                entry_type: type,
            }))
        }
    }

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const file = acceptedFiles[0]
            if (file.size > 10 * 1024 * 1024) {
                setError("File size must be less than 10MB")
                return
            }
            setProofFile(file)
            setError(null)
        }
    }, [])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.png', '.jpg', '.jpeg'],
            'application/pdf': ['.pdf'],
        },
        maxFiles: 1,
    })

    const validateForm = (): string | null => {
        if (!formData.description.trim()) {
            return "Description is required"
        }

        if (formData.debit < 0 || formData.credit < 0) {
            return "Amounts cannot be negative"
        }

        if (formData.debit === 0 && formData.credit === 0) {
            return "Either debit or credit must be greater than 0"
        }

        if (formData.debit > 0 && formData.credit > 0) {
            return "Only one of debit or credit should be entered"
        }

        return null
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        
        // In view-only mode, just close
        if (viewOnly) {
            onClose()
            return
        }
        
        setError(null)

        const validationError = validateForm()
        if (validationError) {
            setError(validationError)
            return
        }

        setLoading(true)
        try {
            if (entry && isAdmin) {
                const result = await withRetry(() => updateLedgerEntry(entry.id, {
                    entry_date: formData.entry_date,
                    entry_type: formData.entry_type,
                    category: formData.category,
                    description: formData.description,
                    reference: formData.reference,
                    debit: formData.debit,
                    credit: formData.credit,
                    branch_id: selectedBranchId,
                    payment_method: selectedPaymentMethod || undefined,
                }))
                if (result.success) {
                    onSuccess({
                        description: formData.description,
                        date: formData.entry_date,
                        isUpdate: true,
                    })
                } else {
                    setError(result.error || "Failed to update entry")
                }
            } else {
                const payload = {
                    ...formData,
                    proof_file: proofFile,
                    branch_id: selectedBranchId,
                    payment_method: selectedPaymentMethod || undefined,
                }
                const result = await withRetry(() => createLedgerEntry(payload))
                if (result.success) {
                    onSuccess({
                        description: formData.description,
                        date: formData.entry_date,
                        isUpdate: false,
                    })
                } else {
                    setError(result.error || "Failed to create entry")
                }
            }
        } catch (error) {
            console.error("Error saving entry:", error)
            setError("An unexpected error occurred")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm' onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-card rounded-xl shadow-2xl max-h-[80svh] w-full max-w-lg border border-border flex flex-col'
                onClick={(e) => e.stopPropagation()}
            >
                <div className='p-6 border-b border-border flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>
                        {viewOnly ? "View Entry" : entry ? "Edit Entry" : "Add Entry"}
                    </h3>
                    <button
                        onClick={onClose}
                        className='text-muted-foreground hover:text-foreground transition-colors'
                    >
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className='p-6 space-y-4 flex-1 overflow-y-auto'
                >
                    {error && (
                        <div className='flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-300 text-sm'>
                            <AlertCircleIcon className='w-4 h-4 flex-shrink-0' />
                            {error}
                        </div>
                    )}

                    <div className='space-y-4'>
                        <h4 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider'>Entry Details</h4>

                        <div className='grid grid-cols-2 gap-4'>
                            <div>
                                <label className='block text-sm font-medium mb-1'>
                                    Type *
                                </label>
                                <select
                                    value={formData.entry_type}
                                    onChange={(e) =>
                                        handleTypeChange(e.target.value as LedgerEntryType)
                                    }
                                    disabled={viewOnly}
                                    className={`w-full px-3 py-2 border rounded-md outline-none transition-colors ${viewOnly ? 'opacity-75 cursor-default' : ''} ${ENTRY_TYPE_COLORS[formData.entry_type]}`}
                                >
                                    {ENTRY_TYPES.map((type) => (
                                        <option key={type} value={type}>
                                            {type}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className='block text-sm font-medium mb-1'>
                                    Category
                                    {categorySource === "custom" && formData.category && (
                                        <span className='ml-2 text-xs text-blue-400 font-normal'>
                                            (custom)
                                        </span>
                                    )}
                                </label>
                                <select
                                    value={categorySource === "custom" ? "__CUSTOM__" : (formData.category || "")}
                                    onChange={(e) => handleCategoryChange(e.target.value)}
                                    disabled={viewOnly}
                                    className={`w-full px-3 py-2 bg-card border rounded-md focus:border-primary outline-none transition-colors ${viewOnly ? 'opacity-75 cursor-default' : ''} ${
                                        categorySource === "dropdown" && formData.category
                                            ? "border-border"
                                            : "border-border"
                                    }`}
                                >
                                    <option value="">-- Select Category --</option>
                                    {availableCategories.length > 0 && (
                                        <optgroup label={formData.entry_type}>
                                            {availableCategories.map((cat) => (
                                                <option key={cat.id} value={cat.name}>
                                                    {cat.name}
                                                </option>
                                            ))}
                                        </optgroup>
                                    )}
                                    <optgroup label="Custom">
                                        <option value="__CUSTOM__">✎ Custom Category...</option>
                                    </optgroup>
                                </select>
                                <div className='relative mt-2'>
                                    <input
                                        type='text'
                                        value={categorySource === "custom" ? (formData.category || "") : ""}
                                        onChange={(e) => handleCustomCategoryChange(e.target.value)}
                                        disabled={viewOnly}
                                        placeholder={categorySource === "dropdown" ? "Select from dropdown or choose Custom..." : "Enter custom category..."}
                                        className={`w-full px-3 py-2 bg-card border rounded-md focus:border-primary outline-none transition-colors text-sm ${viewOnly ? 'opacity-75 cursor-default' : ''} ${
                                            categorySource === "custom"
                                                ? "border-blue-500/50 bg-blue-500/5"
                                                : "border-border"
                                        }`}
                                    />
                                    {categorySource === "custom" && formData.category && (
                                        <span className='absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-400'>
                                            active
                                        </span>
                                    )}
                                </div>
                                {availableCategories.length === 0 && categorySource === "dropdown" && (
                                    <p className='mt-1 text-xs text-muted-foreground/70'>
                                        No categories for this type. Use custom input below.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className='block text-sm font-medium mb-1'>
                                Payment Method
                            </label>
                            <select
                                value={selectedPaymentMethod}
                                onChange={(e) => setSelectedPaymentMethod(e.target.value as AccountingPaymentMethod | "")}
                                disabled={viewOnly}
                                className={`w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none transition-colors ${viewOnly ? 'opacity-75 cursor-default' : ''}`}
                            >
                                <option value="">-- Unspecified --</option>
                                {ACCOUNTING_PAYMENT_METHODS.map((method) => (
                                    <option key={method.key} value={method.key} className={method.key === 'CASH' ? 'text-green-400' : ''}>
                                        {method.label}
                                    </option>
                                ))}
                            </select>
                            {selectedPaymentMethod && (
                                <p className='text-xs text-muted-foreground/70 mt-1'>
                                    {ACCOUNTING_PAYMENT_METHODS.find(m => m.key === selectedPaymentMethod)?.description}
                                </p>
                            )}
                        </div>

                        <div className='grid grid-cols-2 gap-4'>
                            <div>
                                <label className='block text-sm font-medium mb-1'>
                                    Date *
                                </label>
                                <input
                                    type='date'
                                    value={safeToISOString(formData.entry_date)}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            entry_date: safeToDate(e.target.value),
                                        })
                                    }
                                    disabled={viewOnly}
                                    className={`w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none transition-colors ${viewOnly ? 'opacity-75 cursor-default' : ''}`}
                                    required
                                />
                            </div>

                        </div>
                    </div>

                    <div className='border-t border-zinc-200 dark:border-border' />

                    <div className='space-y-4'>
                        <h4 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider'>Amounts & Description</h4>

                        <div>
                            <label className='block text-sm font-medium mb-1'>
                                Description *
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        description: e.target.value,
                                    })
                                }
                                disabled={viewOnly}
                                placeholder='Enter description...'
                                rows={2}
                                className={`w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none resize-none transition-colors ${viewOnly ? 'opacity-75 cursor-default' : ''}`}
                                required
                            />
                        </div>

                        <div>
                            <label className='block text-sm font-medium mb-1'>
                                Reference
                            </label>
                            <input
                                type='text'
                                value={formData.reference || ""}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        reference: e.target.value,
                                    })
                                }
                                disabled={viewOnly}
                                placeholder='Invoice #, Receipt #, etc.'
                                className={`w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none transition-colors ${viewOnly ? 'opacity-75 cursor-default' : ''}`}
                            />
                        </div>

                        <div className='grid grid-cols-2 gap-4'>
                            <div>
                                <label className='block text-sm font-medium mb-1 text-red-300'>
                                    {debitLabel} ({currencySymbol})
                                </label>
                                <input
                                    type='number'
                                    step='0.01'
                                    min='0'
                                    value={formData.debit || ""}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            debit:
                                                e.target.value === ""
                                                    ? 0
                                                    : parseFloat(e.target.value),
                                            credit: e.target.value && parseFloat(e.target.value) > 0
                                                ? 0
                                                : formData.credit,
                                        })
                                    }
                                    disabled={viewOnly}
                                    placeholder='0.00'
                                    className={`w-full px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-md focus:border-red-500/50 outline-none font-mono text-red-300 placeholder:text-red-300/30 transition-colors ${viewOnly ? 'opacity-75 cursor-default' : ''}`}
                                />
                            </div>
                            <div>
                                <label className='block text-sm font-medium mb-1 text-green-300'>
                                    {creditLabel} ({currencySymbol})
                                </label>
                                <input
                                    type='number'
                                    step='0.01'
                                    min='0'
                                    value={formData.credit || ""}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            credit:
                                                e.target.value === ""
                                                    ? 0
                                                    : parseFloat(e.target.value),
                                            debit: e.target.value && parseFloat(e.target.value) > 0
                                                ? 0
                                                : formData.debit,
                                        })
                                    }
                                    disabled={viewOnly}
                                    placeholder='0.00'
                                    className={`w-full px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-md focus:border-green-500/50 outline-none font-mono text-green-300 placeholder:text-green-300/30 transition-colors ${viewOnly ? 'opacity-75 cursor-default' : ''}`}
                                />
                            </div>
                        </div>
                    </div>

                    <div className='border-t border-zinc-200 dark:border-border' />

                    <div className='space-y-4'>
                        <h4 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider'>Proof / Attachment</h4>

                        <div>
                            <label className='block text-sm font-medium mb-1'>Attachment (Invoice/Receipt)</label>
                            {viewOnly ? (
                                entry?.proof_url ? (
                                    <a
                                        href={entry.proof_url}
                                        target='_blank'
                                        rel='noopener noreferrer'
                                        className='flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-md text-blue-400 hover:text-blue-300 transition-colors'
                                    >
                                        <FileIcon className='w-5 h-5' />
                                        <span className='text-sm'>View Attachment</span>
                                    </a>
                                ) : (
                                    <p className='px-3 py-2 bg-muted border border-border rounded-md text-muted-foreground/70 text-sm'>
                                        No attachment
                                    </p>
                                )
                            ) : (
                                <div
                                    {...getRootProps()}
                                    className={`border-2 border-dashed rounded-md p-4 cursor-pointer transition-colors ${
                                        isDragActive
                                            ? 'border-blue-500 bg-blue-500/10'
                                            : 'border-border hover:border-border'
                                    }`}
                                >
                                    <input {...getInputProps()} />
                                    {proofFile ? (
                                        <div className='flex items-center gap-2 text-green-400'>
                                            <FileIcon className='w-5 h-5' />
                                            <span className='text-sm'>{proofFile.name}</span>
                                            <button
                                                type='button'
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setProofFile(null)
                                                }}
                                                className='text-red-400 hover:text-red-300 ml-auto'
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <div className='flex flex-col items-center gap-2 text-muted-foreground'>
                                            <UploadIcon className='w-8 h-8' />
                                            <p className='text-sm text-center'>
                                                {isDragActive
                                                    ? 'Drop the file here'
                                                    : 'Drag & drop invoice/receipt, or click to select'}
                                            </p>
                                            <p className='text-xs text-muted-foreground/70'>PNG, JPG, or PDF up to 10MB</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        {viewOnly ? (
                            <button
                                type='button'
                                onClick={onClose}
                                className='px-6 py-2 bg-card hover:bg-muted rounded-md transition-colors font-medium'
                            >
                                Close
                            </button>
                        ) : (
                            <>
                                <button
                                    type='button'
                                    onClick={onClose}
                                    disabled={loading}
                                    className='px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors disabled:opacity-50'
                                >
                                    Cancel
                                </button>
                                <button
                                    type='submit'
                                    disabled={loading}
                                    className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2'
                                >
                                    {loading && <LoaderCircleIcon className='w-4 h-4 animate-spin' />}
                                    {loading
                                        ? "Saving..."
                                        : entry
                                          ? "Update"
                                          : "Create"}
                                </button>
                            </>
                        )}
                    </div>
                </form>
            </motion.div>
        </div>
    )
}