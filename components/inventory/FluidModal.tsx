"use client"

import { useState, useContext, useEffect } from "react"
import { LoaderCircleIcon, DropletsIcon } from "lucide-react"
import {
    CreateInventoryItemPayload,
    InventoryItem,
} from "@/utils/types/inventory"
import { updateInventoryItem } from "@/server/actions/inventory"
import { NotificationContext } from "@/components/notifications"
import BaseModal from "./BaseModal"

interface FluidModalProps {
    isOpen: boolean
    onClose: () => void
    inventoryItems: InventoryItem[]
    onSuccess: () => void
}

export default function FluidModal({
    isOpen,
    onClose,
    inventoryItems,
    onSuccess,
}: FluidModalProps) {
    const { addNotification } = useContext(NotificationContext)
    const [loading, setLoading] = useState(false)
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
    const [fluidSubtract, setFluidSubtract] = useState("")

    // Reset form when modal closes
    useEffect(() => {
        if (!isOpen) {
            setSelectedItem(null)
            setFluidSubtract("")
            setLoading(false)
        }
    }, [isOpen])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const amount = parseFloat(fluidSubtract)
        if (isNaN(amount) || amount <= 0) {
            addNotification("Please enter a valid amount", "WARNING")
            return
        }

        if (!selectedItem) {
            addNotification("Please select a fluid item", "WARNING")
            return
        }

        if (
            selectedItem.fluid_remaining !== undefined &&
            selectedItem.fluid_unit_size
        ) {
            if (
                amount >= selectedItem.fluid_remaining &&
                selectedItem.current_stock -
                    Math.ceil(
                        (amount + 1 - selectedItem.fluid_remaining) /
                            selectedItem.fluid_unit_size
                    ) <
                    0
            ) {
                addNotification("Not enough stock", "WARNING")
                return
            }

            setLoading(true)

            try {
                const updateAmount: Partial<CreateInventoryItemPayload> = {
                    fluid_remaining:
                        amount >= selectedItem.fluid_remaining
                            ? selectedItem.fluid_unit_size -
                              ((amount - selectedItem.fluid_remaining) %
                                  selectedItem.fluid_unit_size)
                            : selectedItem.fluid_remaining - amount,
                    current_stock:
                        amount >= selectedItem.fluid_remaining
                            ? selectedItem.current_stock -
                              Math.ceil(
                                  (amount + 1 - selectedItem.fluid_remaining) /
                                      selectedItem.fluid_unit_size
                              )
                            : selectedItem.current_stock,
                }

                const res = await updateInventoryItem({
                    item_id: selectedItem.id,
                    updates: updateAmount,
                })

                if (res.success) {
                    addNotification("Fluid updated successfully", "SUCCESS")
                    onSuccess()
                    onClose()
                } else {
                    addNotification(res.error || "Error updating fluid item", "ERROR")
                }
            } catch (error) {
                console.error("Error updating fluid:", error)
                addNotification("An error occurred", "ERROR")
            } finally {
                setLoading(false)
            }
        }
    }

    const fluidItems = inventoryItems.filter((item) => item.item_type === "FLUID")

    const calculateNewStock = () => {
        if (!selectedItem || !fluidSubtract) return selectedItem?.current_stock

        const amount = parseFloat(fluidSubtract)
        if (
            selectedItem.fluid_remaining !== undefined &&
            selectedItem.fluid_unit_size &&
            amount >= selectedItem.fluid_remaining
        ) {
            return (
                selectedItem.current_stock -
                Math.ceil(
                    (amount + 1 - selectedItem.fluid_remaining) /
                        selectedItem.fluid_unit_size
                )
            )
        }
        return selectedItem.current_stock
    }

    const calculateNewRemaining = () => {
        if (!selectedItem || !fluidSubtract) return selectedItem?.fluid_remaining

        const amount = parseFloat(fluidSubtract)
        if (
            selectedItem.fluid_remaining !== undefined &&
            selectedItem.fluid_unit_size
        ) {
            if (amount >= selectedItem.fluid_remaining) {
                return (
                    selectedItem.fluid_unit_size -
                    ((amount - selectedItem.fluid_remaining) %
                        selectedItem.fluid_unit_size)
                )
            }
            return selectedItem.fluid_remaining - amount
        }
        return selectedItem.fluid_remaining
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
                form="fluid-form"
                disabled={loading || !selectedItem || !fluidSubtract}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2"
            >
                {loading && (
                    <LoaderCircleIcon className="w-4 h-4 animate-spin" />
                )}
                {loading ? "Updating..." : "Update Fluid"}
            </button>
        </div>
    )

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="Modify Fluid"
            icon={DropletsIcon}
            iconColor="text-cyan-400"
            iconBgColor="bg-cyan-500/10"
            size="md"
            loading={loading}
            footer={footer}
        >
            <form id="fluid-form" onSubmit={handleSubmit} className="space-y-4">
                {/* Fluid Selector */}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Select Fluid *
                    </label>
                    <select
                        value={selectedItem?.id || ""}
                        onChange={(e) => {
                            const item = fluidItems.find(
                                (item) => item.id === e.target.value
                            )
                            setSelectedItem(item || null)
                        }}
                        className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-cyan-500/50 outline-none transition-colors"
                        required
                        disabled={loading}
                    >
                        <option value="">Select a fluid item...</option>
                        {fluidItems.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name}
                            </option>
                        ))}
                    </select>
                </div>

                {selectedItem && (
                    <>
                        {/* Stock Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-muted rounded-lg border border-border">
                                <p className="text-sm text-muted-foreground">Current Stock</p>
                                <p className="text-lg font-bold">
                                    {selectedItem.current_stock}
                                </p>
                            </div>
                            <div className="p-3 bg-muted rounded-lg border border-border">
                                <p className="text-sm text-muted-foreground">New Stock</p>
                                <p
                                    className={`text-lg font-bold ${
                                        (calculateNewStock() || 0) <
                                        selectedItem.current_stock
                                            ? "text-red-400"
                                            : ""
                                    }`}
                                >
                                    {calculateNewStock()}
                                </p>
                            </div>
                        </div>

                        {/* Fluid Details */}
                        <div className="grid grid-cols-3 gap-4 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
                            <div className="text-center">
                                <p className="text-sm text-muted-foreground">Full Container</p>
                                <p className="text-lg font-bold">
                                    {selectedItem.fluid_unit_size}{" "}
                                    {selectedItem.fluid_unit_of_measure}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-sm text-muted-foreground">Remaining</p>
                                <p className="text-lg font-bold">
                                    {selectedItem.fluid_remaining}{" "}
                                    {selectedItem.fluid_unit_of_measure}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-sm text-muted-foreground">After</p>
                                <p className="text-lg font-bold">
                                    {calculateNewRemaining()}{" "}
                                    {selectedItem.fluid_unit_of_measure}
                                </p>
                            </div>
                        </div>

                        {/* Amount Input */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Amount to Remove (
                                {selectedItem.fluid_unit_of_measure}) *
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={fluidSubtract}
                                onChange={(e) =>
                                    setFluidSubtract(e.target.value)
                                }
                                placeholder={`Enter amount in ${selectedItem.fluid_unit_of_measure}...`}
                                className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-cyan-500/50 outline-none transition-colors"
                                required
                                disabled={loading}
                            />
                            <p className="mt-2 text-xs text-muted-foreground">
                                If amount exceeds remaining, it will carry over
                                to the next container.
                            </p>
                        </div>
                    </>
                )}
            </form>
        </BaseModal>
    )
}
