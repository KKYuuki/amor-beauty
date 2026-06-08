import { useMemo, useState, useEffect, useRef, useContext } from "react"
import { motion, AnimatePresence } from "motion/react"
import { InventoryItem } from "@/utils/types/inventory"
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    ArrowDownIcon,
    ArrowUpIcon,
    ArrowUpDownIcon,
    MoreVerticalIcon,
    PenSquareIcon,
    PackageSearchIcon,
    CopyIcon,
    ShoppingCartIcon,
    TrashIcon,
    HistoryIcon,
    RotateCcwIcon,
    ExternalLinkIcon,
    BellIcon,
    EyeIcon,
    EyeOffIcon,
} from "lucide-react"
import { updateInventoryItem, requestInventoryRestock } from "@/server/actions/inventory"
import { NotificationContext } from "@/components/notifications"

interface InventoryTableProps {
    items: InventoryItem[]
    showInactiveItems: boolean
    isLoading?: boolean
    onAction: (
        action:
            | "edit"
            | "adjust"
            | "duplicate"
            | "restock"
            | "delete"
            | "history"
            | "restore",
        item: InventoryItem
    ) => void
    onRefresh?: () => void
}

type SortKey = keyof InventoryItem | "last_restocked"

interface SortConfig {
    key: SortKey
    direction: "asc" | "desc"
}

interface DropdownMenuProps {
    item: InventoryItem
    showInactiveItems: boolean
    onAction: InventoryTableProps["onAction"]
    _onRefresh?: () => void
}

function ActionDropdown({ item, showInactiveItems, onAction, _onRefresh }: DropdownMenuProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isRequesting, setIsRequesting] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const { addNotification } = useContext(NotificationContext)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleAction = (action: Parameters<typeof onAction>[0]) => {
        onAction(action, item)
        setIsOpen(false)
    }

    const handleRequestRestock = async () => {
        setIsRequesting(true)
        try {
            const result = await requestInventoryRestock({
                item_id: item.id,
            })
            if (result.success) {
                addNotification("Restock request sent", "SUCCESS")
            } else {
                addNotification(result.error || "Failed to send restock request", "ERROR")
            }
        } catch (_error) {
            addNotification("Failed to send restock request", "ERROR")
        } finally {
            setIsRequesting(false)
            setIsOpen(false)
        }
    }

    if (showInactiveItems) {
        return (
            <button
                type="button"
                className="p-2 bg-card hover:bg-green-500/20 transition-colors rounded-md border border-border"
                title="Restore Item"
                onClick={() => handleAction("restore")}
            >
                <RotateCcwIcon className="w-4 h-4 text-green-400" />
            </button>
        )
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                className="p-2 bg-card hover:bg-muted transition-colors rounded-md border border-border"
                onClick={() => setIsOpen(!isOpen)}
            >
                <MoreVerticalIcon className="w-4 h-4" />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.1 }}
                        className="absolute right-0 top-full mt-1 w-48 bg-card rounded-lg shadow-xl border border-border z-50 overflow-hidden"
                    >
                        <div className="py-1">
                            <button
                                type="button"
                                className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
                                onClick={() => handleAction("edit")}
                            >
                                <PenSquareIcon className="w-4 h-4 text-blue-400" />
                                Edit
                            </button>
                            <button
                                type="button"
                                className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
                                onClick={() => handleAction("adjust")}
                            >
                                <PackageSearchIcon className="w-4 h-4 text-purple-400" />
                                Adjust Stock
                            </button>
                            <button
                                type="button"
                                className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
                                onClick={() => handleAction("restock")}
                            >
                                <ShoppingCartIcon className="w-4 h-4 text-green-400" />
                                Restock
                            </button>
                            <button
                                type="button"
                                disabled={isRequesting}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2 disabled:opacity-50"
                                onClick={handleRequestRestock}
                            >
                                <BellIcon className={`w-4 h-4 text-yellow-400 ${isRequesting ? 'animate-pulse' : ''}`} />
                                {isRequesting ? 'Requesting...' : 'Request Restock'}
                            </button>
                            <button
                                type="button"
                                className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
                                onClick={() => handleAction("duplicate")}
                            >
                                <CopyIcon className="w-4 h-4 text-orange-400" />
                                Duplicate
                            </button>
                            <button
                                type="button"
                                className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
                                onClick={() => handleAction("history")}
                            >
                                <HistoryIcon className="w-4 h-4 text-gray-400" />
                                History
                            </button>
                            <div className="border-t border-border my-1"></div>
                            <button
                                type="button"
                                className="w-full px-4 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2 text-red-400"
                                onClick={() => handleAction("delete")}
                            >
                                <TrashIcon className="w-4 h-4" />
                                Delete
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default function InventoryTable({
    items,
    showInactiveItems,
    isLoading = false,
    onAction,
    onRefresh,
}: InventoryTableProps) {
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [updatingShowInSales, setUpdatingShowInSales] = useState<Set<string>>(new Set())
    const { addNotification } = useContext(NotificationContext)
    const itemsPerPage = 15

    const handleToggleShowInSales = async (item: InventoryItem) => {
        if (updatingShowInSales.has(item.id)) return
        
        setUpdatingShowInSales(prev => new Set(prev).add(item.id))
        try {
            const result = await updateInventoryItem({
                item_id: item.id,
                updates: { show_in_sales: !item.show_in_sales },
            })
            if (result.success) {
                addNotification(
                    `Item ${!item.show_in_sales ? 'shown' : 'hidden'} in sales`,
                    "SUCCESS"
                )
                onRefresh?.()
            } else {
                addNotification(result.error || "Failed to update item", "ERROR")
            }
        } catch (_error) {
            addNotification("Failed to update item", "ERROR")
        } finally {
            setUpdatingShowInSales(prev => {
                const next = new Set(prev)
                next.delete(item.id)
                return next
            })
        }
    }

    const handleSort = (key: SortKey) => {
        let direction: "asc" | "desc" = "asc"
        if (
            sortConfig &&
            sortConfig.key === key &&
            sortConfig.direction === "asc"
        ) {
            direction = "desc"
        }
        setSortConfig({ key, direction })
    }

    const sortedItems = useMemo(() => {
        const sortableItems = [...items]
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key]
                const bValue = b[sortConfig.key]

                if (aValue === null || aValue === undefined) return 1
                if (bValue === null || bValue === undefined) return -1

                if (aValue < bValue) {
                    return sortConfig.direction === "asc" ? -1 : 1
                }
                if (aValue > bValue) {
                    return sortConfig.direction === "asc" ? 1 : -1
                }
                return 0
            })
        }
        return sortableItems
    }, [items, sortConfig])

    const totalPages = Math.ceil(sortedItems.length / itemsPerPage)
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage
        return sortedItems.slice(start, start + itemsPerPage)
    }, [sortedItems, currentPage, itemsPerPage])

    // Reset page when items change (e.g. search filter)
    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(1)
        }
    }, [items.length, totalPages, currentPage])

    const renderSortIcon = (columnKey: SortKey) => {
        if (!sortConfig || sortConfig.key !== columnKey) {
            return <ArrowUpDownIcon className="w-4 h-4 ml-1 opacity-20" />
        }
        return sortConfig.direction === "asc" ? (
            <ArrowUpIcon className="w-4 h-4 ml-1 text-blue-300" />
        ) : (
            <ArrowDownIcon className="w-4 h-4 ml-1 text-blue-300" />
        )
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-auto bg-muted rounded-lg border border-border relative">
                <table className="min-w-max w-full table-auto border-collapse">
                    <thead className="bg-muted sticky top-0 z-10 backdrop-blur-sm">
                        <tr className="text-nowrap select-none">
                            {[
                                { label: "Item Name", key: "name" },
                                { label: "SKU/Code", key: "item_code" },
                                { label: "Description", key: "description" },
                                { label: "Category", key: "item_category" },
                                { label: "Type", key: "item_type" },
                                {
                                    label: "Unit Size",
                                    key: "fluid_unit_size",
                                },
                                {
                                    label: "Fluid Rem.",
                                    key: "fluid_remaining",
                                },
                                { label: "Stock", key: "current_stock" },
                                {
                                    label: "Warning",
                                    key: "stock_warning_threshold",
                                },
                                { label: "Low Stock", key: null },
                                { label: "Expires", key: "expiration_date" },
                                { label: "Cost Price", key: "unit_price" },
                                {
                                    label: "Selling Price",
                                    key: "selling_price",
                                },
                                {
                                    label: "Last Restocked",
                                    key: "last_restocked",
                                },
                                { label: "Link", key: "external_link" },
                                { label: "Show in Sales", key: null },
                                { label: "Actions", key: null },
                            ].map((col, idx) => (
                                <th
                                    key={idx}
                                    className={`text-left px-4 py-3 text-sm text-foreground font-bold uppercase border-b border-border ${
                                        col.key
                                            ? "cursor-pointer hover:bg-muted transition-colors group"
                                            : ""
                                    }`}
                                    onClick={() =>
                                        col.key &&
                                        handleSort(col.key as SortKey)
                                    }
                                >
                                    <div className="flex items-center">
                                        {col.label}
                                        {col.key &&
                                            renderSortIcon(col.key as SortKey)}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td
                                    colSpan={17}
                                    className="p-8 text-center text-muted-foreground"
                                >
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-8 h-8 border-2 border-border border-t-white/80 rounded-full animate-spin"></div>
                                        Loading inventory...
                                    </div>
                                </td>
                            </tr>
                        ) : paginatedItems.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={17}
                                    className="p-8 text-center text-muted-foreground italic"
                                >
                                    No items found.
                                </td>
                            </tr>
                        ) : (
                            <AnimatePresence mode="wait">
                                {paginatedItems.map((item) => (
                                    <motion.tr
                                        className={`hover:bg-muted transition-colors text-nowrap border-b border-border ${
                                            showInactiveItems
                                                ? "opacity-60"
                                                : ""
                                        }`}
                                        key={item.id}
                                        layout
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <td className="px-4 py-2 text-sm font-medium w-max capitalize">
                                            {item.name}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-medium w-max uppercase">
                                            {item.item_code}
                                        </td>
                                        <td
                                            className="px-4 py-2 text-sm font-medium max-w-[150px] truncate"
                                            title={item.description || ""}
                                        >
                                            {item.description || "-"}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-medium w-max capitalize">
                                            {item.item_category.toLowerCase()}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-medium w-max capitalize">
                                            {item.item_type.toLowerCase()}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-medium w-max text-center">
                                            {item.item_type === "FLUID" &&
                                            item.fluid_unit_size
                                                ? `${item.fluid_unit_size} ${item.fluid_unit_of_measure || ""}`
                                                : "-"}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-medium w-max text-center">
                                            {item.item_type === "FLUID" &&
                                            item.fluid_remaining
                                                ? `${item.fluid_remaining} ${item.fluid_unit_of_measure || ""}`
                                                : "-"}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-medium w-max capitalize text-center">
                                            {item.current_stock}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-medium w-max capitalize text-center">
                                            {item.stock_warning_threshold}
                                        </td>
                                        <td
                                            className={`px-4 py-2 text-sm font-medium w-max capitalize ${
                                                item.current_stock <=
                                                (item.stock_warning_threshold ||
                                                    0)
                                                    ? "text-red-400 font-semibold"
                                                    : ""
                                            }`}
                                        >
                                            {item.current_stock <=
                                            (item.stock_warning_threshold || 0)
                                                ? "Yes"
                                                : "No"}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-medium w-max capitalize text-nowrap">
                                            {item.expiration_date
                                                ? new Date(
                                                      item.expiration_date
                                                  ).toLocaleDateString("en-PH")
                                                : "-"}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-medium w-max capitalize">
                                            {new Intl.NumberFormat("en-PH", {
                                                style: "currency",
                                                currency: "PHP",
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            }).format(item.unit_price || 0)}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-medium w-max capitalize">
                                            {new Intl.NumberFormat("en-PH", {
                                                style: "currency",
                                                currency: "PHP",
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            }).format(item.selling_price || 0)}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-medium w-max capitalize text-nowrap">
                                            {item.last_restocked
                                                ? new Date(
                                                      item.last_restocked
                                                  ).toLocaleDateString(
                                                      "en-PH",
                                                      {
                                                          month: "numeric",
                                                          day: "numeric",
                                                          year: "numeric",
                                                          hour: "numeric",
                                                          minute: "numeric",
                                                      }
                                                  )
                                                : "N/A"}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-medium w-max text-center">
                                            {item.external_link ? (
                                                <a
                                                    href={item.external_link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-400 hover:text-blue-300 transition-colors inline-block"
                                                    title="Open Link"
                                                >
                                                    <ExternalLinkIcon
                                                        size={16}
                                                    />
                                                </a>
                                            ) : (
                                                "-"
                                            )}
                                        </td>
                                        <td className="px-4 py-2 w-max text-center">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleShowInSales(item)}
                                                disabled={updatingShowInSales.has(item.id) || showInactiveItems}
                                                className={`p-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                                    item.show_in_sales
                                                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                                        : 'bg-card text-muted-foreground/70 hover:bg-muted'
                                                }`}
                                                title={item.show_in_sales ? 'Shown in sales' : 'Hidden from sales'}
                                            >
                                                {updatingShowInSales.has(item.id) ? (
                                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                ) : item.show_in_sales ? (
                                                    <EyeIcon className="w-4 h-4" />
                                                ) : (
                                                    <EyeOffIcon className="w-4 h-4" />
                                                )}
                                            </button>
                                        </td>
                                        <td className="px-4 py-2 w-max">
                                            <ActionDropdown
                                                item={item}
                                                showInactiveItems={showInactiveItems}
                                                onAction={onAction}
                                                _onRefresh={onRefresh}
                                            />
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {!isLoading && totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-2">
                    <span className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                        {Math.min(
                            currentPage * itemsPerPage,
                            sortedItems.length
                        )}{" "}
                        of {sortedItems.length} items
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() =>
                                setCurrentPage((p) => Math.max(1, p - 1))
                            }
                            disabled={currentPage === 1}
                            className="p-1 rounded-md bg-muted border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronLeftIcon className="w-5 h-5 text-foreground" />
                        </button>
                        <span className="text-sm text-foreground px-2">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            onClick={() =>
                                setCurrentPage((p) =>
                                    Math.min(totalPages, p + 1)
                                )
                            }
                            disabled={currentPage === totalPages}
                            className="p-1 rounded-md bg-muted border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <ChevronRightIcon className="w-5 h-5 text-foreground" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}