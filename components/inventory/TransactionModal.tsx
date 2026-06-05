"use client"

import { useState, useContext, useEffect } from "react"
import { LoaderCircleIcon, PlusIcon } from "lucide-react"
import {
    CreateInventoryItemPayload,
    InventoryItem,
} from "@/utils/types/inventory"
import { createInventoryItem } from "@/server/actions/inventory"
import { NotificationContext } from "@/components/notifications"
import { useBranchContext } from "@/components/branch-context"
import BaseModal from "./BaseModal"

interface TransactionModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

// URL validation helper
const isValidUrl = (url: string): boolean => {
    if (!url) return true // Empty is valid (optional field)
    try {
        new URL(url)
        return true
    } catch {
        return false
    }
}

export default function TransactionModal({
    isOpen,
    onClose,
    onSuccess,
}: TransactionModalProps) {
    const { addNotification } = useContext(NotificationContext)
    const { branches, currentBranch } = useBranchContext()
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState<CreateInventoryItemPayload>({
        name: "",
        item_code: "",
        description: "",
        external_link: "",
        item_type: "ITEM",
        item_category: "OTHER",
        current_stock: 0,
        stock_warning_threshold: 0,
        unit_price: 0,
        selling_price: 0,
        fluid_unit_size: 0,
        fluid_remaining: 0,
        fluid_unit_of_measure: "",
        is_perishable: false,
        branch_id: currentBranch?.id ?? null,
    })

    // Reset form when modal closes
    useEffect(() => {
        if (!isOpen) {
            setFormData({
                name: "",
                item_code: "",
                description: "",
                external_link: "",
                item_type: "ITEM",
                item_category: "OTHER",
                current_stock: 0,
                stock_warning_threshold: 0,
                unit_price: 0,
                selling_price: 0,
                fluid_unit_size: 0,
                fluid_remaining: 0,
                fluid_unit_of_measure: "",
                is_perishable: false,
                branch_id: currentBranch?.id ?? null,
            })
            setLoading(false)
        }
    }, [isOpen, currentBranch])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!formData.name.trim()) {
            addNotification("Please enter a name", "WARNING")
            return
        }

        if (formData.current_stock < 0) {
            addNotification("Please enter a valid stock", "WARNING")
            return
        }

        if (
            formData.item_type === "FLUID" &&
            (!formData.fluid_unit_of_measure || !formData.fluid_unit_size)
        ) {
            addNotification(
                "Please enter a fluid unit of measure and size for liquid items",
                "WARNING"
            )
            return
        }

        // Validate external_link URL
        if (formData.external_link && !isValidUrl(formData.external_link)) {
            addNotification("Please enter a valid URL for external link", "WARNING")
            return
        }

        setLoading(true)

        try {
            const res = await createInventoryItem({
                item: formData,
            })

            if (res.success) {
                addNotification("Item created successfully", "SUCCESS")
                onSuccess()
                onClose()
            } else {
                addNotification(res.error || "Error creating item", "ERROR")
            }
        } catch (error) {
            console.error("Error creating item:", error)
            addNotification("An error occurred", "ERROR")
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
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors disabled:opacity-50"
            >
                Cancel
            </button>
            <button
                type="submit"
                form="transaction-form"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2"
            >
                {loading && (
                    <LoaderCircleIcon className="w-4 h-4 animate-spin" />
                )}
                {loading ? "Creating..." : "Create Item"}
            </button>
        </div>
    )

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="Create Inventory Item"
            icon={PlusIcon}
            iconColor="text-blue-400"
            iconBgColor="bg-blue-500/10"
            size="lg"
            maxHeight="max-h-[90vh]"
            loading={loading}
            footer={footer}
        >
            <form id="transaction-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    {/* Item Name */}
                    <div className="col-span-2">
                        <label className="block text-sm font-medium mb-1">
                            Item Name *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    name: e.target.value,
                                })
                            }
                            placeholder="e.g., Plastic Cup"
                            className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-blue-500/50 outline-none transition-colors"
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
                            value={formData.item_code}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    item_code: e.target.value,
                                })
                            }
                            placeholder="e.g., PLCUP"
                            className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-blue-500/50 outline-none transition-colors"
                            disabled={loading}
                        />
                    </div>

                    {/* Type */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Type *
                        </label>
                        <select
                            value={formData.item_type}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    item_type: e.target
                                        .value as InventoryItem["item_type"],
                                })
                            }
                            className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-blue-500/50 outline-none transition-colors"
                            disabled={loading}
                        >
                            <option value="ITEM">Item</option>
                            <option value="FLUID">Fluid</option>
                        </select>
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Category *
                        </label>
                        <select
                            value={formData.item_category}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    item_category: e.target
                                        .value as InventoryItem["item_category"],
                                })
                            }
                            className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-blue-500/50 outline-none transition-colors"
                            disabled={loading}
                        >
                            <option value="TATTOO">Tattoo</option>
                            <option value="PIERCING">Piercing</option>
                            <option value="APPAREL">Apparel</option>
                            <option value="EQUIPMENT">Equipment</option>
                            <option value="FOOD">Food</option>
                            <option value="OTHER">Other</option>
                        </select>
                    </div>

                    {/* Branch */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Branch
                        </label>
                        <select
                            value={formData.branch_id || ""}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    branch_id: e.target.value || null,
                                })
                            }
                            className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-blue-500/50 outline-none transition-colors"
                            disabled={loading}
                        >
                            <option value="">Global (All Branches)</option>
                            {branches.map((branch) => (
                                <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                </option>
                            ))}
                        </select>
                        {currentBranch && formData.branch_id === currentBranch.id && (
                            <p className="mt-1 text-xs text-blue-400">
                                Using current branch
                            </p>
                        )}
                    </div>

                    {/* Starting Stock */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Starting Stock
                        </label>
                        <input
                            type="number"
                            min="0"
                            value={formData.current_stock}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    current_stock:
                                        parseFloat(e.target.value) || 0,
                                })
                            }
                            className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-blue-500/50 outline-none transition-colors"
                            disabled={loading}
                        />
                    </div>

                    {/* Warning Threshold */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Warning Threshold
                        </label>
                        <input
                            type="number"
                            min="0"
                            value={formData.stock_warning_threshold}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    stock_warning_threshold:
                                        parseFloat(e.target.value) || 0,
                                })
                            }
                            className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-blue-500/50 outline-none transition-colors"
                            disabled={loading}
                        />
                    </div>

                    {/* Cost Price */}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Cost Price (₱)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.unit_price}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    unit_price: parseFloat(e.target.value) || 0,
                                })
                            }
                            className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-blue-500/50 outline-none transition-colors"
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
                            value={formData.selling_price}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    selling_price: parseFloat(e.target.value) || 0,
                                })
                            }
                            className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-blue-500/50 outline-none transition-colors"
                            disabled={loading}
                        />
                    </div>
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Description
                    </label>
                    <textarea
                        value={formData.description}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                description: e.target.value,
                            })
                        }
                        placeholder="Enter item description..."
                        rows={2}
                        className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-blue-500/50 outline-none resize-none transition-colors"
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
                        value={formData.external_link}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                external_link: e.target.value,
                            })
                        }
                        placeholder="https://..."
                        className={`w-full px-3 py-2 bg-white/10 border rounded-md focus:border-blue-500/50 outline-none transition-colors ${
                            formData.external_link && !isValidUrl(formData.external_link)
                                ? "border-red-500/50 focus:border-red-500/50"
                                : "border-white/10"
                        }`}
                        disabled={loading}
                    />
                    {formData.external_link && !isValidUrl(formData.external_link) && (
                        <p className="mt-1 text-sm text-red-400">Please enter a valid URL</p>
                    )}
                </div>

                {/* Fluid-specific fields */}
                {formData.item_type === "FLUID" && (
                    <div className="grid grid-cols-2 gap-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Container Size
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={formData.fluid_unit_size}
                                onChange={(e) => {
                                    const size = parseFloat(e.target.value) || 0
                                    setFormData({
                                        ...formData,
                                        fluid_unit_size: size,
                                        fluid_remaining: size,
                                    })
                                }}
                                className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-blue-500/50 outline-none transition-colors"
                                disabled={loading}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Unit of Measure
                            </label>
                            <input
                                type="text"
                                value={formData.fluid_unit_of_measure}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        fluid_unit_of_measure: e.target.value,
                                    })
                                }
                                placeholder="ml, l, oz, etc."
                                className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-blue-500/50 outline-none transition-colors"
                                disabled={loading}
                            />
                        </div>
                    </div>
                )}
            </form>
        </BaseModal>
    )
}
