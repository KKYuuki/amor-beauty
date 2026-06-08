"use client"

import { useState, useContext, useEffect } from "react"
import { LoaderCircleIcon, PencilIcon } from "lucide-react"
import {
    CreateInventoryItemPayload,
    InventoryItem,
} from "@/utils/types/inventory"
import { updateInventoryItem } from "@/server/actions/inventory"
import { NotificationContext } from "@/components/notifications"
import BaseModal from "./BaseModal"

interface EditModalProps {
    isOpen: boolean
    onClose: () => void
    selectedItem: InventoryItem | null
    onSuccess: () => void
}

export default function EditModal({
    isOpen,
    onClose,
    selectedItem,
    onSuccess,
}: EditModalProps) {
    const { addNotification } = useContext(NotificationContext)
    const [loading, setLoading] = useState(false)
    const [itemUpdate, setItemUpdate] = useState<Partial<CreateInventoryItemPayload>>({
        name: "",
        item_code: "",
        description: "",
        external_link: "",
        unit_price: 0,
        selling_price: 0,
        stock_warning_threshold: 0,
    })

    useEffect(() => {
        if (selectedItem) {
            setItemUpdate({
                name: selectedItem.name,
                item_code: selectedItem.item_code,
                description: selectedItem.description || "",
                external_link: selectedItem.external_link || "",
                unit_price: selectedItem.unit_price || 0,
                selling_price: selectedItem.selling_price || 0,
                stock_warning_threshold: selectedItem.stock_warning_threshold || 0,
            })
        }
    }, [selectedItem])

    if (!selectedItem) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const res = await updateInventoryItem({
                item_id: selectedItem.id,
                updates: itemUpdate,
            })

            if (res.success) {
                addNotification("Item updated successfully", "SUCCESS")
                onSuccess()
                onClose()
            } else {
                addNotification(res.error || "Error updating item", "ERROR")
            }
        } catch (error) {
            console.error("Error updating item:", error)
            addNotification("An error occurred while updating", "ERROR")
        } finally {
            setLoading(false)
        }
    }

    const footer = (
        <div className="flex justify-end gap-3">
            <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors disabled:opacity-50"
            >
                Cancel
            </button>
            <button
                type="submit"
                form="edit-form"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2"
            >
                {loading && (
                    <LoaderCircleIcon className="w-4 h-4 animate-spin" />
                )}
                {loading ? "Saving..." : "Save Changes"}
            </button>
        </div>
    )

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="Edit Item"
            description={selectedItem.name}
            icon={PencilIcon}
            iconColor="text-blue-400"
            iconBgColor="bg-blue-500/10"
            size="md"
            loading={loading}
            footer={footer}
        >
            <form id="edit-form" onSubmit={handleSubmit} className="space-y-4">
                {/* Item Name */}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Item Name *
                    </label>
                    <input
                        type="text"
                        value={itemUpdate.name}
                        onChange={(e) =>
                            setItemUpdate({
                                ...itemUpdate,
                                name: e.target.value,
                            })
                        }
                        className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-blue-500/50 outline-none transition-colors"
                        required
                        disabled={loading}
                    />
                </div>

                {/* Item Code */}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Item Code / SKU
                    </label>
                    <input
                        type="text"
                        value={itemUpdate.item_code}
                        onChange={(e) =>
                            setItemUpdate({
                                ...itemUpdate,
                                item_code: e.target.value,
                            })
                        }
                        className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-blue-500/50 outline-none transition-colors"
                        disabled={loading}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Cost Price */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Cost Price (₱)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={itemUpdate.unit_price}
                            onChange={(e) =>
                                setItemUpdate({
                                    ...itemUpdate,
                                    unit_price: parseFloat(e.target.value) || 0,
                                })
                            }
                            className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-blue-500/50 outline-none transition-colors"
                            disabled={loading}
                        />
                    </div>

                    {/* Selling Price */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Selling Price (₱)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={itemUpdate.selling_price}
                            onChange={(e) =>
                                setItemUpdate({
                                    ...itemUpdate,
                                    selling_price: parseFloat(e.target.value) || 0,
                                })
                            }
                            className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-blue-500/50 outline-none transition-colors"
                            disabled={loading}
                        />
                    </div>
                </div>

                {/* Stock Warning Threshold */}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Stock Warning Threshold
                    </label>
                    <input
                        type="number"
                        min="0"
                        value={itemUpdate.stock_warning_threshold}
                        onChange={(e) =>
                            setItemUpdate({
                                ...itemUpdate,
                                stock_warning_threshold: parseFloat(e.target.value) || 0,
                            })
                        }
                        className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-blue-500/50 outline-none transition-colors"
                        disabled={loading}
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Description
                    </label>
                    <textarea
                        value={itemUpdate.description}
                        onChange={(e) =>
                            setItemUpdate({
                                ...itemUpdate,
                                description: e.target.value,
                            })
                        }
                        rows={2}
                        className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-blue-500/50 outline-none resize-none transition-colors"
                        disabled={loading}
                    />
                </div>

                {/* External Link */}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        External Link
                    </label>
                    <input
                        type="url"
                        value={itemUpdate.external_link}
                        onChange={(e) =>
                            setItemUpdate({
                                ...itemUpdate,
                                external_link: e.target.value,
                            })
                        }
                        placeholder="https://..."
                        className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-blue-500/50 outline-none transition-colors"
                        disabled={loading}
                    />
                </div>
            </form>
        </BaseModal>
    )
}
