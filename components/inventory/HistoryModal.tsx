"use client"

import { useState, useEffect } from "react"
import {
    InventoryItem,
    InventoryRestockHistoryItem,
} from "@/utils/types/inventory"
import { getItemRestockHistory } from "@/server/actions/inventory"
import { HistoryIcon, ExternalLinkIcon, PackageIcon } from "lucide-react"
import BaseModal from "./BaseModal"

interface HistoryModalProps {
    isOpen: boolean
    onClose: () => void
    selectedItem: InventoryItem | null
}

export default function HistoryModal({
    isOpen,
    onClose,
    selectedItem,
}: HistoryModalProps) {
    const [history, setHistory] = useState<InventoryRestockHistoryItem[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (selectedItem && isOpen) {
            setLoading(true)
            getItemRestockHistory(selectedItem.id).then((restockHistory) => {
                setHistory(restockHistory)
                setLoading(false)
            })
        } else {
            setHistory([])
        }
    }, [selectedItem, isOpen])

    if (!selectedItem) return null

    const footer = (
        <div className="flex justify-end">
            <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors"
            >
                Close
            </button>
        </div>
    )

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="Restock History"
            description={selectedItem.name}
            icon={HistoryIcon}
            iconColor="text-gray-400"
            iconBgColor="bg-gray-500/10"
            size="xl"
            maxHeight="max-h-[80vh]"
            footer={footer}
        >
            {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin mb-4"></div>
                    <p className="text-white/60">Loading history... </p>
                </div>
            ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="p-4 bg-white/5 rounded-full mb-4">
                        <PackageIcon className="w-8 h-8 text-white/40" />
                    </div>
                    <p className="text-white/60">No restock history found</p>
                    <p className="text-sm text-white/40 mt-1">
                        This item has not been restocked yet.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="text-left py-3 px-4 text-sm font-medium text-white/60">
                                    Date
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-white/60">
                                    Quantity
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-white/60">
                                    Unit Cost
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-white/60">
                                    Supplier
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-white/60">
                                    Invoice
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-white/60">
                                    Proof
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((restock) => (
                                <tr
                                    key={restock.id}
                                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                                >
                                    <td className="py-3 px-4 text-sm whitespace-nowrap">
                                        {new Intl.DateTimeFormat(
                                            "en-PH",
                                            {
                                                year: "numeric",
                                                month: "short",
                                                day: "2-digit",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            }
                                        ).format(
                                            new Date(restock.restocked_at)
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-sm">
                                        <span className="text-green-400 font-medium">
                                            +{restock.quantity_added}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-sm">
                                        {restock.unit_cost
                                            ? new Intl.NumberFormat(
                                                  "en-PH",
                                                  {
                                                      style: "currency",
                                                      currency: "PHP",
                                                  }
                                              ).format(restock.unit_cost)
                                            : "-"}
                                    </td>
                                    <td className="py-3 px-4 text-sm">
                                        {restock.supplier_name || "-"}
                                    </td>
                                    <td className="py-3 px-4 text-sm">
                                        {restock.invoice_number || "-"}
                                    </td>
                                    <td className="py-3 px-4 text-sm">
                                        {restock.proof_link ? (
                                            <a
                                                href={restock.proof_link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1"
                                            >
                                                <ExternalLinkIcon className="w-4 h-4" />
                                                View
                                            </a>
                                        ) : (
                                            "-"
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </BaseModal>
    )
}
