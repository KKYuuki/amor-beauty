"use client"

import { useState, useContext, useEffect } from "react"
import { LoaderCircleIcon, ScaleIcon } from "lucide-react"
import {
    InventoryItem,
} from "@/utils/types/inventory"
import {
    updateInventoryItem,
    restockInventoryItem,
} from "@/server/actions/inventory"
import { NotificationContext } from "@/components/notifications"
import BaseModal from "./BaseModal"

interface AdjustModalProps {
    isOpen: boolean
    onClose: () => void
    selectedItem: InventoryItem | null
    onSuccess: () => void
}

export default function AdjustModal({
    isOpen,
    onClose,
    selectedItem,
    onSuccess,
}: AdjustModalProps) {
    const { addNotification } = useContext(NotificationContext)
    const [loading, setLoading] = useState(false)
    const [adjustState, setAdjustState] = useState<"quantity" | "fluid">(
        "quantity"
    )
    const [adjustType, setAdjustType] = useState<"add" | "subtract">("add")
    const [adjustQuantity, setAdjustQuantity] = useState("")
    const [unitCost, setUnitCost] = useState("")
    const [supplierName, setSupplierName] = useState("")
    const [orderReference, setOrderReference] = useState("")

    // Reset form when modal closes
    useEffect(() => {
        if (!isOpen) {
            setAdjustState("quantity")
            setAdjustType("add")
            setAdjustQuantity("")
            setUnitCost("")
            setSupplierName("")
            setOrderReference("")
            setLoading(false)
        }
    }, [isOpen])

    if (!selectedItem) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const qty = parseFloat(adjustQuantity)
        if (isNaN(qty) || qty <= 0) {
            addNotification("Please enter a valid quantity", "WARNING")
            setLoading(false)
            return
        }

        try {
            if (selectedItem.item_type === "FLUID" && adjustState === "fluid") {
                // Fluid logic
                if (!selectedItem.fluid_unit_size) {
                    addNotification("Fluid unit size missing", "ERROR")
                    setLoading(false)
                    return
                }

                const currentFluid = selectedItem.fluid_remaining || 0
                let newFluid = currentFluid
                let newStock = selectedItem.current_stock

                if (adjustType === "add") {
                    newFluid += qty
                    while (newFluid > selectedItem.fluid_unit_size) {
                        newFluid -= selectedItem.fluid_unit_size
                        newStock++
                    }
                } else {
                    newFluid -= qty
                    while (newFluid < 0) {
                        if (newStock > 0) {
                            newFluid += selectedItem.fluid_unit_size
                            newStock--
                        } else {
                            newFluid = 0
                            newStock = 0
                            break
                        }
                    }
                }

                const res = await updateInventoryItem({
                    item_id: selectedItem.id,
                    updates: {
                        fluid_remaining: newFluid,
                        current_stock: newStock,
                    },
                })

                if (res.success) {
                    addNotification("Fluid updated successfully", "SUCCESS")
                    onSuccess()
                    onClose()
                } else {
                    addNotification(res.error || "Failed to update fluid", "ERROR")
                }
            } else {
                // Item logic
                if (adjustType === "add") {
                    const res = await restockInventoryItem({
                        item_id: selectedItem.id,
                        new_stock: {
                            inventory_item_id: selectedItem.id,
                            quantity_added: qty,
                            unit_cost: unitCost ? parseFloat(unitCost) : undefined,
                            supplier_name: supplierName || undefined,
                            order_reference: orderReference || undefined,
                        },
                    })

                    if (res.success) {
                        addNotification("Stock added successfully", "SUCCESS")
                        onSuccess()
                        onClose()
                    } else {
                        addNotification(res.error || "Failed to add stock", "ERROR")
                    }
                } else {
                    if (selectedItem.current_stock - qty < 0) {
                        addNotification("Not enough stock", "WARNING")
                        setLoading(false)
                        return
                    }

                    const res = await updateInventoryItem({
                        item_id: selectedItem.id,
                        updates: {
                            current_stock: selectedItem.current_stock - qty,
                        },
                    })

                    if (res.success) {
                        addNotification("Stock reduced successfully", "SUCCESS")
                        onSuccess()
                        onClose()
                    } else {
                        addNotification(res.error || "Failed to reduce stock", "ERROR")
                    }
                }
            }
        } catch (error) {
            console.error("Error adjusting stock:", error)
            addNotification("An error occurred", "ERROR")
        } finally {
            setLoading(false)
        }
    }

    const isAdding = adjustType === "add"
    const newStock = isAdding
        ? selectedItem.current_stock + (parseFloat(adjustQuantity) || 0)
        : selectedItem.current_stock - (parseFloat(adjustQuantity) || 0)

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
                form="adjust-form"
                disabled={loading || !adjustQuantity}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2"
            >
                {loading && (
                    <LoaderCircleIcon className="w-4 h-4 animate-spin" />
                )}
                {loading ? "Adjusting..." : "Adjust Stock"}
            </button>
        </div>
    )

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="Adjust Stock"
            description={selectedItem.name}
            icon={ScaleIcon}
            iconColor="text-purple-400"
            iconBgColor="bg-purple-500/10"
            size="md"
            loading={loading}
            footer={footer}
        >
            <form id="adjust-form" onSubmit={handleSubmit} className="space-y-4">
                {/* Fluid Toggle */}
                {selectedItem.item_type === "FLUID" && (
                    <div className="flex gap-2 p-1 bg-muted rounded-lg">
                        <button
                            type="button"
                            onClick={() => setAdjustState("quantity")}
                            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                adjustState === "quantity"
                                    ? "bg-card text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Quantity
                        </button>
                        <button
                            type="button"
                            onClick={() => setAdjustState("fluid")}
                            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                adjustState === "fluid"
                                    ? "bg-card text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Fluid
                        </button>
                    </div>
                )}

                {/* Current Stock Display */}
                <div className="p-3 bg-muted rounded-lg border border-border">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Current Stock</span>
                        <span className="text-lg font-bold">
                            {selectedItem.current_stock}
                        </span>
                    </div>
                    {adjustQuantity && (
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
                            <span className="text-sm text-muted-foreground">New Stock</span>
                            <span className={`text-lg font-bold ${
                                newStock < 0 ? "text-red-400" : "text-green-400"
                            }`}>
                                {newStock}
                            </span>
                        </div>
                    )}
                </div>

                {/* Add/Subtract Toggle */}
                <div className="flex gap-2 p-1 bg-muted rounded-lg">
                    <button
                        type="button"
                        onClick={() => setAdjustType("add")}
                        className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            adjustType === "add"
                                ? "bg-green-500/20 text-green-400"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Add Stock
                    </button>
                    <button
                        type="button"
                        onClick={() => setAdjustType("subtract")}
                        className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                            adjustType === "subtract"
                                ? "bg-red-500/20 text-red-400"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Subtract Stock
                    </button>
                </div>

                {/* Quantity Input */}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Quantity to {adjustType === "add" ? "Add" : "Subtract"} *
                    </label>
                    <input
                        type="number"
                        step={selectedItem.item_type === "FLUID" ? "0.01" : "1"}
                        min="0.01"
                        value={adjustQuantity}
                        onChange={(e) => setAdjustQuantity(e.target.value)}
                        placeholder="Enter quantity..."
                        className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-purple-500/50 outline-none transition-colors"
                        required
                        disabled={loading}
                    />
                </div>

                {/* Additional fields for adding stock */}
                {isAdding && adjustState === "quantity" && (
                    <>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Unit Cost (₱)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={unitCost}
                                onChange={(e) => setUnitCost(e.target.value)}
                                placeholder="Enter unit cost..."
                                className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-purple-500/50 outline-none transition-colors"
                                disabled={loading}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Supplier Name
                            </label>
                            <input
                                type="text"
                                value={supplierName}
                                onChange={(e) => setSupplierName(e.target.value)}
                                placeholder="Enter supplier name..."
                                className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-purple-500/50 outline-none transition-colors"
                                disabled={loading}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Order Reference
                            </label>
                            <input
                                type="text"
                                value={orderReference}
                                onChange={(e) => setOrderReference(e.target.value)}
                                placeholder="Enter order reference..."
                                className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-purple-500/50 outline-none transition-colors"
                                disabled={loading}
                            />
                        </div>
                    </>
                )}
            </form>
        </BaseModal>
    )
}
