"use client"

import { useState, useContext } from "react"
import { LoaderCircleIcon, CopyIcon } from "lucide-react"
import { InventoryItem } from "@/utils/types/inventory"
import { duplicateInventoryItem } from "@/server/actions/inventory"
import { NotificationContext } from "@/components/notifications"
import BaseModal from "./BaseModal"

interface DuplicateModalProps {
    isOpen: boolean
    onClose: () => void
    selectedItem: InventoryItem | null
    onSuccess: () => void
}

export default function DuplicateModal({
    isOpen,
    onClose,
    selectedItem,
    onSuccess,
}: DuplicateModalProps) {
    const { addNotification } = useContext(NotificationContext)
    const [loading, setLoading] = useState(false)
    const [duplicateName, setDuplicateName] = useState("")

    if (!selectedItem) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!duplicateName.trim()) {
            addNotification("Please enter a name", "WARNING")
            return
        }

        setLoading(true)

        try {
            const res = await duplicateInventoryItem({
                item_id: selectedItem.id,
                name: duplicateName.trim(),
            })

            if (res.success) {
                addNotification("Item duplicated successfully", "SUCCESS")
                setDuplicateName("")
                onSuccess()
                onClose()
            } else {
                addNotification(res.error || "Could not duplicate item", "ERROR")
            }
        } catch (error) {
            console.error("Error duplicating item:", error)
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
                className="px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors disabled:opacity-50"
            >
                Cancel
            </button>
            <button
                type="submit"
                form="duplicate-form"
                disabled={loading || !duplicateName.trim()}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2"
            >
                {loading && (
                    <LoaderCircleIcon className="w-4 h-4 animate-spin" />
                )}
                {loading ? "Duplicating..." : "Duplicate Item"}
            </button>
        </div>
    )

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="Duplicate Item"
            description={selectedItem.name}
            icon={CopyIcon}
            iconColor="text-orange-400"
            iconBgColor="bg-orange-500/10"
            size="sm"
            loading={loading}
            footer={footer}
        >
            <form id="duplicate-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-1">
                        New Item Name *
                    </label>
                    <input
                        type="text"
                        value={duplicateName}
                        onChange={(e) => setDuplicateName(e.target.value)}
                        placeholder="Enter new item name..."
                        className="w-full px-3 py-2 bg-card border border-border rounded-md focus:border-orange-500/50 outline-none transition-colors"
                        required
                        disabled={loading}
                    />
                </div>

                <div className="p-3 bg-muted rounded-lg border border-border">
                    <p className="text-sm text-muted-foreground">
                        The duplicated item will start with 0 stock and
                        inherit all other properties from the original.
                    </p>
                </div>
            </form>
        </BaseModal>
    )
}
