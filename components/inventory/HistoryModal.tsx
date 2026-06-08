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
                className="px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors"
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
                    <div className="w-8 h-8 border-2 border-border border-t-white/80 rounded-full animate-spin mb-4"></div>
                    <p className="text-muted-foreground">Loading history... </p>
                </div>
            ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="p-4 bg-muted rounded-full mb-4">
                        <PackageIcon className="w-8 h-8 text-muted-foreground/70" />
                    </div>
                    <p className="text-muted-foreground">No restock history found</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                        This item has not been restocked yet.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border">
                                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                                    Date
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                                    Quantity
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                                    Unit Cost
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                                    Supplier
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                                    Invoice
                                </th>
                                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                                    Proof
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((restock) => (
                                <tr
                                    key={restock.id}
                                    className="border-b border-border hover:bg-muted transition-colors"
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
