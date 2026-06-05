"use client"

import { useState, useContext } from "react"
import { LoaderCircleIcon, Trash2Icon, AlertTriangleIcon } from "lucide-react"
import { InventoryItem } from "@/utils/types/inventory"
import { deleteInventoryItem } from "@/server/actions/inventory"
import { NotificationContext } from "@/components/notifications"
import BaseModal from "./BaseModal"

interface DeleteModalProps {
    isOpen: boolean
    onClose: () => void
    selectedItem: InventoryItem | null
    onSuccess: () => void
}

export default function DeleteModal({
    isOpen,
    onClose,
    selectedItem,
    onSuccess,
}: DeleteModalProps) {
    const { addNotification } = useContext(NotificationContext)
    const [loading, setLoading] = useState(false)

    if (!selectedItem) return null

    const handleDelete = async () => {
        setLoading(true)

        try {
            const res = await deleteInventoryItem({
                item_id: selectedItem.id,
            })

            if (res.success) {
                addNotification(
                    `Successfully deleted ${selectedItem.name}`,
                    "SUCCESS"
                )
                onSuccess()
                onClose()
            } else {
                addNotification(res.error || "Error deleting item", "ERROR")
            }
        } catch (error) {
            console.error("Error deleting item:", error)
            addNotification("An error occurred while deleting", "ERROR")
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
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2"
            >
                {loading && (
                    <LoaderCircleIcon className="w-4 h-4 animate-spin" />
                )}
                {loading ? "Deleting..." : "Delete Item"}
            </button>
        </div>
    )

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="Delete Item"
            icon={Trash2Icon}
            iconColor="text-red-400"
            iconBgColor="bg-red-500/10"
            size="sm"
            loading={loading}
            footer={footer}
        >
            <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertTriangleIcon className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-300">
                        This action will deactivate the item. It can be
                        restored later from the inactive items tab.
                    </p>
                </div>

                <div className="text-center">
                    <p className="text-white/60">
                        Are you sure you want to delete
                    </p>
                    <p className="text-lg font-semibold mt-1">
                        {selectedItem.name}
                    </p>
                </div>
            </div>
        </BaseModal>
    )
}
