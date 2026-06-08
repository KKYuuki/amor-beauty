"use client"

import { useState, useCallback } from "react"
import { LoaderCircleIcon, UploadIcon, FileIcon, PackageIcon } from "lucide-react"
import { InventoryItem } from "@/utils/types/inventory"
import { restockInventoryItemWithAccounting } from "@/server/actions/inventory"
import { useDropzone } from "react-dropzone"
import BaseModal from "./BaseModal"

interface RestockModalProps {
    item: InventoryItem
    userId: string
    currencySymbol: string
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

export default function RestockModal({
    item,
    userId,
    currencySymbol,
    isOpen,
    onClose,
    onSuccess,
}: RestockModalProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [proofFile, setProofFile] = useState<File | null>(null)
    
    const [formData, setFormData] = useState({
        quantity: 0,
        unit_cost: 0,
        total_amount: 0,
        invoice_number: "",
        supplier_name: "",
        order_reference: "",
        restocked_at: new Date().toISOString().split("T")[0], // Today's date
        create_accounting_entry: true,
        accounting_category: "INVENTORY_PURCHASE",
    })

    // Calculate total when quantity or unit_cost changes
    const updateTotal = (qty: number, cost: number) => {
        setFormData(prev => ({
            ...prev,
            quantity: qty,
            unit_cost: cost,
            total_amount: qty * cost,
        }))
    }

    // File drop handling
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const file = acceptedFiles[0]
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (formData.quantity <= 0) {
            setError("Quantity must be greater than 0")
            return
        }

        setLoading(true)
        
        try {
            const result = await restockInventoryItemWithAccounting({
                item_id: item.id,
                user_id: userId,
                quantity_added: formData.quantity,
                unit_cost: formData.unit_cost,
                total_amount: formData.total_amount,
                invoice_number: formData.invoice_number || undefined,
                supplier_name: formData.supplier_name || undefined,
                order_reference: formData.order_reference || undefined,
                restocked_at: new Date(formData.restocked_at),
                proof_file: proofFile,
                create_accounting_entry: formData.create_accounting_entry,
                accounting_category: formData.accounting_category,
            })

            if (result.success) {
                onSuccess()
            } else {
                setError(result.error || "Failed to restock item")
            }
        } catch (err) {
            console.error("Restock error:", err)
            setError("An unexpected error occurred")
        } finally {
            setLoading(false)
        }
    }

    const footer = (
        <div className='flex justify-end gap-3'>
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
                form='restock-form'
                disabled={loading || formData.quantity <= 0}
                className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2'
            >
                {loading && <LoaderCircleIcon className='w-4 h-4 animate-spin' />}
                {loading ? 'Restocking...' : 'Restock Item'}
            </button>
        </div>
    )

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title={`Restock: ${item.name}`}
            description={`Current stock: ${item.current_stock} ${item.item_type === 'FLUID' ? item.fluid_unit_of_measure : 'units'}`}
            icon={PackageIcon}
            size='md'
            loading={loading}
            footer={footer}
            maxHeight='90vh'
        >
            <form id='restock-form' onSubmit={handleSubmit} className='space-y-4'>
                {error && (
                    <div className='p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-300 text-sm'>
                        {error}
                    </div>
                )}

                {/* Date */}
                <div>
                    <label className='block text-sm font-medium mb-1'>Restock Date *</label>
                    <input
                        type='date'
                        value={formData.restocked_at}
                        onChange={(e) => setFormData({...formData, restocked_at: e.target.value})}
                        className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none transition-colors'
                        required
                    />
                </div>

                {/* Quantity and Cost */}
                <div className='grid grid-cols-2 gap-4'>
                    <div>
                        <label className='block text-sm font-medium mb-1'>
                            Quantity Added *
                        </label>
                        <input
                            type='number'
                            step={item.item_type === 'FLUID' ? '0.01' : '1'}
                            min='0.01'
                            value={formData.quantity || ''}
                            onChange={(e) => updateTotal(parseFloat(e.target.value) || 0, formData.unit_cost)}
                            className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none transition-colors'
                            required
                        />
                    </div>
                    <div>
                        <label className='block text-sm font-medium mb-1'>
                            Unit Cost ({currencySymbol})
                        </label>
                        <input
                            type='number'
                            step='0.01'
                            min='0'
                            value={formData.unit_cost || ''}
                            onChange={(e) => updateTotal(formData.quantity, parseFloat(e.target.value) || 0)}
                            className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none transition-colors'
                        />
                    </div>
                </div>

                {/* Total Amount */}
                <div>
                    <label className='block text-sm font-medium mb-1'>
                        Total Amount ({currencySymbol})
                    </label>
                    <input
                        type='number'
                        step='0.01'
                        value={formData.total_amount || ''}
                        onChange={(e) => setFormData({...formData, total_amount: parseFloat(e.target.value) || 0})}
                        className='w-full px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-md focus:border-green-500/50 outline-none transition-colors font-mono text-green-300'
                    />
                </div>

                {/* Invoice Number */}
                <div>
                    <label className='block text-sm font-medium mb-1'>Invoice Number</label>
                    <input
                        type='text'
                        value={formData.invoice_number}
                        onChange={(e) => setFormData({...formData, invoice_number: e.target.value})}
                        placeholder='e.g., INV-2024-001'
                        className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none transition-colors'
                    />
                </div>

                {/* Supplier Name */}
                <div>
                    <label className='block text-sm font-medium mb-1'>Supplier Name</label>
                    <input
                        type='text'
                        value={formData.supplier_name}
                        onChange={(e) => setFormData({...formData, supplier_name: e.target.value})}
                        placeholder='e.g., ABC Supplies Co.'
                        className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none transition-colors'
                    />
                </div>

                {/* Order Reference */}
                <div>
                    <label className='block text-sm font-medium mb-1'>Order Reference</label>
                    <input
                        type='text'
                        value={formData.order_reference}
                        onChange={(e) => setFormData({...formData, order_reference: e.target.value})}
                        placeholder='e.g., PO-2024-001'
                        className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none transition-colors'
                    />
                </div>

                {/* Proof Upload */}
                <div>
                    <label className='block text-sm font-medium mb-1'>Proof of Invoice / Delivery</label>
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
                                        : 'Drag & drop invoice/delivery proof, or click to select'}
                                </p>
                                <p className='text-xs text-muted-foreground/70'>PNG, JPG, or PDF up to 10MB</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Create Accounting Entry Toggle */}
                <label className='flex items-center gap-2 cursor-pointer p-3 bg-muted rounded-md'>
                    <input
                        type='checkbox'
                        checked={formData.create_accounting_entry}
                        onChange={(e) => setFormData({...formData, create_accounting_entry: e.target.checked})}
                        className='rounded'
                    />
                    <div>
                        <span className='text-sm font-medium'>Create accounting entry</span>
                        <p className='text-xs text-muted-foreground'>Automatically record this restock as an expense</p>
                    </div>
                </label>
            </form>
        </BaseModal>
    )
}
