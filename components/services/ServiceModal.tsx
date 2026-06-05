"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { SaveIcon, XIcon, PackageIcon, ShareIcon } from "lucide-react"
import BaseModal from "@/components/inventory/BaseModal"
import { Button } from "@/components/ui/button"
import AdminActionGuard from "@/components/admin/AdminActionGuard"
import { BranchSelectorInline } from "@/components/ui/branch-selector-inline"
import { ServiceWithItems } from "@/server/actions/services"
import { InventoryItem } from "@/utils/types/inventory"
import { ServiceType } from "@/utils/types/payroll"

type ServiceFormState = {
    title: string
    price: number
    pricing_type: "FIXED" | "HOURLY"
    hourly_rate: number
    items: { inventory_id: string; quantity: number }[]
    branch_id: string | null
    service_type: ServiceType
    is_shared: boolean
}

interface ServiceModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (formData: ServiceFormState) => Promise<void>
    onError?: (message: string) => void
    editingService?: ServiceWithItems | null
    inventory: InventoryItem[]
    currencySymbol: string
    saving?: boolean
}

const VALID_SERVICE_TYPES: ServiceType[] = ["HAIR", "NAILS", "FACIAL", "BODY_MASSAGE", "WAXING", "LASH_BROW", "MAKEUP"]

const SERVICE_TYPE_LABELS: Record<string, string> = {
    HAIR: "Hair",
    NAILS: "Nails",
    FACIAL: "Facial",
    BODY_MASSAGE: "Body Massage",
    WAXING: "Waxing",
    LASH_BROW: "Lash & Brow",
    MAKEUP: "Makeup",
    MANUAL: "Manual",
}

function isValidServiceType(value: string | null | undefined): value is ServiceType {
    return VALID_SERVICE_TYPES.includes(value as ServiceType)
}

export default function ServiceModal({
    isOpen,
    onClose,
    onSave,
    onError,
    editingService,
    inventory,
    currencySymbol,
    saving = false,
}: ServiceModalProps) {
    const [formData, setFormData] = useState<ServiceFormState>({
        title: "",
        price: 0,
        pricing_type: "FIXED",
        hourly_rate: 0,
        items: [],
        branch_id: null,
        service_type: "HAIR",
        is_shared: false,
    })
    const [itemSearch, setItemSearch] = useState("")
    const [showItemDropdown, setShowItemDropdown] = useState(false)
    const itemSearchRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (isOpen) {
            if (editingService) {
                setFormData({
                    title: editingService.title,
                    price: editingService.price,
                    pricing_type: editingService.pricing_type,
                    hourly_rate: editingService.hourly_rate,
                    items: editingService.items.map((i) => ({
                        inventory_id: i.inventory_id,
                        quantity: Number(i.quantity),
                    })),
                    branch_id: editingService.branch_id ?? null,
                    service_type: isValidServiceType(editingService.service_type)
                        ? editingService.service_type
                        : "HAIR",
                    is_shared: editingService.is_shared,
                })
            } else {
                setFormData({
                    title: "",
                    price: 0,
                    pricing_type: "FIXED",
                    hourly_rate: 0,
                    items: [],
                    branch_id: null,
                    service_type: "HAIR",
                    is_shared: false,
                })
            }
            setItemSearch("")
            setShowItemDropdown(false)
        }
    }, [isOpen, editingService])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement
            if (showItemDropdown && itemSearchRef.current && !itemSearchRef.current.contains(target)) {
                setShowItemDropdown(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [showItemDropdown])

    const handleSave = async () => {
        if (!formData.title) {
            onError?.("Service title is required")
            return
        }
        if (formData.price < 0) {
            onError?.("Price cannot be negative")
            return
        }
        await onSave(formData)
    }

    const filteredItems = useMemo(
        () =>
            inventory.filter(
                (item) =>
                    item.name.toLowerCase().includes(itemSearch.toLowerCase()) &&
                    !formData.items.find((i) => i.inventory_id === item.id)
            ),
        [inventory, itemSearch, formData.items]
    )

    const footer = (
        <div className="flex gap-3 justify-end">
            <Button onClick={onClose} variant="outline">
                Cancel
            </Button>
            <AdminActionGuard onAction={handleSave}>
                <Button loading={saving}>
                    <SaveIcon className="w-4 h-4" />
                    Save Service
                </Button>
            </AdminActionGuard>
        </div>
    )

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title={editingService ? "Edit Service" : "New Service"}
            description="Add or edit a service offering"
            icon={PackageIcon}
            iconColor="text-blue-400"
            iconBgColor="bg-blue-500/10"
            footer={footer}
            size="lg"
        >
            <div className="flex flex-col gap-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="flex flex-col gap-1">
                        <span className="text-sm text-white/60">Service Title</span>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) =>
                                setFormData({ ...formData, title: e.target.value })
                            }
                            className="bg-white/10 rounded-md px-3 py-2 text-sm"
                            placeholder="e.g., Haircut & Style"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-sm text-white/60">
                            Base Price ({currencySymbol})
                        </span>
                        <input
                            type="number"
                            value={formData.price}
                            onChange={(e) =>
                                setFormData({ ...formData, price: Number(e.target.value) })
                            }
                            className="bg-white/10 rounded-md px-3 py-2 text-sm"
                            min="0"
                        />
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-sm text-white/60">Pricing Type</span>
                        <select
                            value={formData.pricing_type}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    pricing_type: e.target.value as "FIXED" | "HOURLY",
                                })
                            }
                            className="bg-white/10 rounded-md px-3 py-2 text-sm"
                        >
                            <option value="FIXED">Fixed Price</option>
                            <option value="HOURLY">Hourly Rate</option>
                        </select>
                    </label>
                </div>

                {formData.pricing_type === "HOURLY" && (
                    <label className="flex flex-col gap-1">
                        <span className="text-sm text-white/60">
                            Hourly Rate ({currencySymbol}/hr)
                        </span>
                        <input
                            type="number"
                            value={formData.hourly_rate}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    hourly_rate: Number(e.target.value),
                                })
                            }
                            className="bg-white/10 rounded-md px-3 py-2 text-sm"
                            min="0"
                        />
                    </label>
                )}

                <div className="flex flex-col gap-3">
                    <span className="text-sm text-white/60">Service Type</span>
                    <div className="flex gap-2">
                        {(["HAIR", "NAILS", "FACIAL", "BODY_MASSAGE", "WAXING", "LASH_BROW", "MAKEUP"] as ServiceType[]).map((type) => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setFormData({ ...formData, service_type: type })}
                                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                    formData.service_type === type
                                        ? "bg-blue-500/30 border-2 border-blue-400 text-white"
                                        : "bg-white/5 border-2 border-white/10 text-white/60 hover:border-white/20"
                                }`}
                            >
                                {SERVICE_TYPE_LABELS[type] || type}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={formData.is_shared}
                            onChange={(e) =>
                                setFormData({ ...formData, is_shared: e.target.checked })
                            }
                            className="w-4 h-4 rounded border-white/20 bg-white/10"
                        />
                        <ShareIcon size={16} className="text-white/60" />
                        <span className="text-sm text-white/60">Share across all branches</span>
                    </label>
                </div>

                {!formData.is_shared && (
                    <BranchSelectorInline
                        value={formData.branch_id}
                        onChange={(id) => setFormData({ ...formData, branch_id: id })}
                        showAllOption={true}
                        label="Branch (optional)"
                    />
                )}

                <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-white/80">
                            Linked Inventory Items
                        </span>
                    </div>
                    <div ref={itemSearchRef} className="relative item-search-container">
                        <input
                            type="text"
                            placeholder="Search items to link..."
                            value={itemSearch}
                            onChange={(e) => setItemSearch(e.target.value)}
                            onFocus={() => setShowItemDropdown(true)}
                            className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm"
                        />
                        {showItemDropdown && (
                            <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-white/10 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                {filteredItems.length === 0 ? (
                                    <div className="px-3 py-2 text-sm text-white/40 text-center">
                                        {itemSearch ? "No matching items" : "No items available"}
                                    </div>
                                ) : (
                                    filteredItems.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => {
                                                setFormData({
                                                    ...formData,
                                                    items: [
                                                        ...formData.items,
                                                        { inventory_id: item.id, quantity: 1 },
                                                    ],
                                                })
                                                setItemSearch("")
                                                setShowItemDropdown(false)
                                            }}
                                            className="w-full px-3 py-2 text-left hover:bg-white/10 text-sm text-left flex justify-between"
                                        >
                                            <span>{item.name}</span>
                                            <span className="text-white/60">
                                                {currencySymbol}
                                                {item.unit_price}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {formData.items.length === 0 ? (
                        <div className="text-sm text-white/40 italic p-4 border border-dashed border-white/10 rounded-md text-center">
                            No inventory items linked
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {formData.items.map((item, index) => {
                                const invItem = inventory.find((i) => i.id === item.inventory_id)
                                return (
                                    <div
                                        key={item.inventory_id}
                                        className="flex items-center gap-3 bg-white/5 p-2 rounded-md"
                                    >
                                        <span className="flex-1 text-sm">{invItem?.name || "Unknown Item"}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-white/60">Qty:</span>
                                            <input
                                                type="number"
                                                value={item.quantity}
                                                onChange={(e) => {
                                                    const newItems = [...formData.items]
                                                    newItems[index].quantity = Math.max(
                                                        1,
                                                        Number(e.target.value)
                                                    )
                                                    setFormData({ ...formData, items: newItems })
                                                }}
                                                className="w-16 bg-white/10 rounded px-2 py-1 text-sm"
                                                min="1"
                                            />
                                        </div>
                                        <Button
                                            onClick={() => {
                                                const newItems = formData.items.filter(
                                                    (_, i) => i !== index
                                                )
                                                setFormData({ ...formData, items: newItems })
                                            }}
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-400 hover:text-red-300 hover:bg-red-400/20 h-8 w-8"
                                        >
                                            <XIcon size={16} />
                                        </Button>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </BaseModal>
    )
}
