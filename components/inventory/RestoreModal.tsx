"use client"

import { useState, useContext } from "react"
import { LoaderCircleIcon, RotateCcwIcon, CheckCircleIcon } from "lucide-react"
import { InventoryItem } from "@/utils/types/inventory"
import { restoreInventoryItem } from "@/server/actions/inventory"
import { NotificationContext } from "@/components/notifications"
import BaseModal from "./BaseModal"

interface RestoreModalProps {
    isOpen: boolean
    onClose: () => void
    selectedItem: InventoryItem | null
    onSuccess: () => void
}

export default function RestoreModal({
    isOpen,
    onClose,
    selectedItem,
    onSuccess,
}: RestoreModalProps) {
    const { addNotification } = useContext(NotificationContext)
    const [loading, setLoading] = useState(false)

    if (!selectedItem) return null

    const handleRestore = async () => {
        setLoading(true)

        try {
            const res = await restoreInventoryItem({
                item_id: selectedItem.id,
            })

            if (res.success) {
                addNotification(
                    `Successfully restored ${selectedItem.name}`,
                    "SUCCESS"
                )
                onSuccess()
                onClose()
            } else {
                addNotification(res.error || "Error restoring item", "ERROR")
            }
        } catch (error) {
            console.error("Error restoring item:", error)
            addNotification("An error occurred while restoring", "ERROR")
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
                onClick={handleRestore}
                disabled={loading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2"
            >
                {loading && (
                    <LoaderCircleIcon className="w-4 h-4 animate-spin" />
                )}
                {loading ? "Restoring..." : "Restore Item"}
            </button>
        </div>
    )

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="Restore Item"
            icon={RotateCcwIcon}
            iconColor="text-green-400"
            iconBgColor="bg-green-500/10"
            size="sm"
            loading={loading}
            footer={footer}
        >
            <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <CheckCircleIcon className="w-5 h-5 text-green-400 flex-shrink-0" />
                    <p className="text-sm text-green-300">
                        This will reactivate the item and make it available
                        in the inventory list.
                    </p>
                </div>

                <div className="text-center">
                    <p className="text-white/60">
                        Are you sure you want to restore
                    </p>
                    <p className="text-lg font-semibold mt-1">
                        {selectedItem.name}
                    </p>
                </div>
            </div>
        </BaseModal>
    )
}
