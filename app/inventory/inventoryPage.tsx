"use client"

import {
    useCallback,
    useContext,
    useEffect,
    useState,
    useMemo,
    useRef,
} from "react"
import {
    PackageIcon,
    SearchIcon,
    DownloadIcon,
    PlusIcon,
    DropletsIcon,
    ArchiveIcon,
    BoxesIcon,
    ChevronDownIcon,
    FileSpreadsheetIcon,
    FileTextIcon,
    FileIcon,
    UploadIcon,
} from "lucide-react"
import { InventoryItem } from "@/utils/types/inventory"
import {
    getInactiveInventory,
    getInventory,
    exportInventory,
} from "@/server/actions/inventory"
import { AnimatePresence } from "motion/react"
import { NotificationContext } from "@/components/notifications"
import { ExportFormat } from "@/utils/export-utils"
import { CSVColumn } from "@/utils/csv-import"
import { importInventoryItems, InventoryImportRow } from "@/server/actions/inventory-import"
import TransactionModal from "@/components/inventory/TransactionModal"
import FluidModal from "@/components/inventory/FluidModal"
import EditModal from "@/components/inventory/EditModal"
import AdjustModal from "@/components/inventory/AdjustModal"
import DuplicateModal from "@/components/inventory/DuplicateModal"
import RestockModal from "@/components/inventory/RestockModal"
import DeleteModal from "@/components/inventory/DeleteModal"
import HistoryModal from "@/components/inventory/HistoryModal"
import RestoreModal from "@/components/inventory/RestoreModal"
import InventoryTable from "@/components/inventory/InventoryTable"
import { SideBarContext } from "@/components/sidebar"
import { useBranchContext } from "@/components/branch-context"
import CSVImportModal from "@/components/ui/csv-import-modal"
import React from "react"
import PageHeader from "@/components/ui/PageHeader"
import StatsGrid from "@/components/ui/StatsGrid"
import StatCard from "@/components/ui/StatCard"
import FilterBar from "@/components/ui/FilterBar"

type ModalType =
    | "edit"
    | "adjust"
    | "duplicate"
    | "restock"
    | "delete"
    | "history"
    | "restore"
    | null

const inventoryCSVColumns: CSVColumn[] = [
    { key: 'name', label: 'Name', required: true, type: 'string' },
    { key: 'item_code', label: 'Item Code/SKU', required: false, type: 'string' },
    { key: 'description', label: 'Description', required: false, type: 'string' },
    { key: 'item_category', label: 'Category', required: true, type: 'string' },
    { key: 'item_type', label: 'Type', required: true, type: 'enum', enumValues: ['ITEM', 'FLUID'] },
    { key: 'unit_price', label: 'Cost Price', required: false, type: 'number' },
    { key: 'selling_price', label: 'Selling Price', required: false, type: 'number' },
    { key: 'current_stock', label: 'Current Stock', required: false, type: 'number' },
    { key: 'stock_warning_threshold', label: 'Low Stock Threshold', required: false, type: 'number' },
    { key: 'external_link', label: 'External Link', required: false, type: 'string' },
]

export default function InventoryPageClientComponent() {
    const { addNotification } = useContext(NotificationContext)
    const { userInfo } = useContext(SideBarContext)
    const { currentBranch } = useBranchContext()
    const userId = userInfo?.id || ""

    // State
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
    const [inactiveItems, setInactiveItems] = useState<InventoryItem[]>([])
    const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([])
    const [loading, setLoading] = useState(false)
    const [activeTab, setActiveTab] = useState<"active" | "inactive">("active")

    // Modal states
    const [activeModal, setActiveModal] = useState<ModalType>(null)
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [showFluidModal, setShowFluidModal] = useState(false)
    const [showImportModal, setShowImportModal] = useState(false)

    // Filter states
    const [searchQuery, setSearchQuery] = useState("")
    const [categoryFilter, setCategoryFilter] = useState<string>("")
    const [typeFilter, setTypeFilter] = useState<string>("")
    const [lowStockOnly, setLowStockOnly] = useState(false)
    const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
    const exportDropdownRef = useRef<HTMLDivElement>(null)

    // Close export dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                exportDropdownRef.current &&
                !exportDropdownRef.current.contains(event.target as Node)
            ) {
                setExportDropdownOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () =>
            document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    // Fetch data
    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const [active, inactive] = await Promise.all([
                getInventory({ branchId: currentBranch?.id }),
                getInactiveInventory({ branchId: currentBranch?.id }),
            ])
            setInventoryItems(active)
            setInactiveItems(inactive)
        } catch (error) {
            console.error("Error fetching inventory:", error)
            addNotification("Failed to load inventory", "ERROR")
        } finally {
            setLoading(false)
        }
    }, [addNotification, currentBranch?.id])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Filter items by branch
    const branchFilteredItems = useMemo(() => {
        const items = activeTab === "active" ? inventoryItems : inactiveItems

        // If no branch selected, show all items
        if (!currentBranch) {
            return items
        }

        // Filter items: show items for current branch OR shared items
        return items.filter(
            (item) =>
                item.branch_id === currentBranch.id || item.is_shared === true
        )
    }, [inventoryItems, inactiveItems, activeTab, currentBranch])

    // Filter items
    useEffect(() => {
        let filtered = [...branchFilteredItems]

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase()
            filtered = filtered.filter(
                (item) =>
                    item.name.toLowerCase().includes(query) ||
                    item.item_code?.toLowerCase().includes(query) ||
                    item.description?.toLowerCase().includes(query),
            )
        }

        // Category filter
        if (categoryFilter) {
            filtered = filtered.filter(
                (item) => item.item_category === categoryFilter,
            )
        }

        // Type filter
        if (typeFilter) {
            filtered = filtered.filter((item) => item.item_type === typeFilter)
        }

        // Low stock filter
        if (lowStockOnly) {
            filtered = filtered.filter(
                (item) =>
                    item.current_stock <= (item.stock_warning_threshold || 0),
            )
        }

        setFilteredItems(filtered)
    }, [
        branchFilteredItems,
        searchQuery,
        categoryFilter,
        typeFilter,
        lowStockOnly,
    ])

    // Handle actions
    const handleAction = useCallback(
        (action: Exclude<ModalType, null>, item: InventoryItem) => {
            setSelectedItem(item)
            setActiveModal(action)
        },
        [],
    )

    const handleCloseModal = useCallback(() => {
        setActiveModal(null)
        setSelectedItem(null)
    }, [])

    const handleSuccess = useCallback(() => {
        fetchData()
    }, [fetchData])

    // Import handler
    const handleImport = useCallback(
        async (data: InventoryImportRow[], defaultBranchId: string | null) => {
            try {
                const result = await importInventoryItems(
                    data,
                    userId,
                    defaultBranchId
                )

                if (result.success) {
                    addNotification(
                        `Successfully imported ${result.created} items`,
                        "SUCCESS"
                    )
                    fetchData()
                    return { success: true }
                } else {
                    return {
                        success: false,
                        error: result.errors.join('\n'),
                    }
                }
            } catch (error) {
                console.error("Import error:", error)
                return {
                    success: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Import failed",
                }
            }
        },
        [addNotification, fetchData, userId]
    )

    // Export
    const handleExport = async (format: ExportFormat) => {
        try {
            const result = await exportInventory({
                format,
                filters: {
                    showInactive: activeTab === "inactive",
                    category: categoryFilter,
                    type: typeFilter,
                },
            })

            if (result.success && result.data) {
                // Download file
                const blob = new Blob(
                    [Buffer.from(result.data.content, "base64")],
                    { type: result.data.mimeType },
                )
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = result.data.filename || `inventory.${format}`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                window.URL.revokeObjectURL(url)

                addNotification(
                    `Exported inventory as ${format.toUpperCase()}`,
                    "SUCCESS",
                )
            } else {
                addNotification(result.success ? "Export failed" : result.error || "Export failed", "ERROR")
            }
        } catch (error) {
            console.error("Export error:", error)
            addNotification("Export failed", "ERROR")
        }
    }

    // Stats
    const stats = useMemo(() => {
        return {
            total: branchFilteredItems.length,
            lowStock: branchFilteredItems.filter(
                (item) =>
                    item.current_stock <= (item.stock_warning_threshold || 0),
            ).length,
            fluids: branchFilteredItems.filter((item) => item.item_type === "FLUID").length,
        }
    }, [branchFilteredItems])

    // Filter options
    const categories = useMemo(
        () => [...new Set(inventoryItems.map((item) => item.item_category))],
        [inventoryItems],
    )

    return (
        <div className='flex flex-col h-full gap-4'>
            {/* Header */}
            <div className='flex flex-col gap-4'>
                <PageHeader
                    title="Inventory Management"
                    description="Manage your inventory items and stock levels"
                    icon={<PackageIcon className='w-6 h-6' />}
                    actions={
                        <>
                            <button
                                onClick={() => setShowImportModal(true)}
                                className='flex items-center gap-1.5 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-md transition-colors border-2 border-purple-500/30'
                            >
                                <UploadIcon className='w-4 h-4' />
                                <span className='hidden sm:inline'>Import CSV</span>
                            </button>
                            <button
                                onClick={() => setShowFluidModal(true)}
                                className='flex items-center gap-1.5 px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-md transition-colors border-2 border-cyan-500/30'
                            >
                                <DropletsIcon className='w-4 h-4' />
                                <span className='hidden sm:inline'>Modify Fluid</span>
                            </button>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className='flex items-center gap-1.5 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-md transition-colors border-2 border-blue-500/30'
                            >
                                <PlusIcon className='w-4 h-4' />
                                <span className='hidden sm:inline'>Add Item</span>
                            </button>
                        </>
                    }
                />

                {/* Tabs */}
                <div className='flex items-center gap-4 border-b border-white/10'>
                    <button
                        onClick={() => setActiveTab("active")}
                        className={`pb-2 px-1 font-medium transition-colors border-b-2 ${
                            activeTab === "active"
                                ? "border-blue-500 text-white"
                                : "border-transparent text-white/60 hover:text-white"
                        }`}
                    >
                        <span className='flex items-center gap-2'>
                            <BoxesIcon className='w-4 h-4' />
                            Active Items
                            <span className='px-2 py-0.5 bg-white/10 rounded-full text-xs'>
                                {inventoryItems.length}
                            </span>
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab("inactive")}
                        className={`pb-2 px-1 font-medium transition-colors border-b-2 ${
                            activeTab === "inactive"
                                ? "border-blue-500 text-white"
                                : "border-transparent text-white/60 hover:text-white"
                        }`}
                    >
                        <span className='flex items-center gap-2'>
                            <ArchiveIcon className='w-4 h-4' />
                            Inactive Items
                            <span className='px-2 py-0.5 bg-white/10 rounded-full text-xs'>
                                {inactiveItems.length}
                            </span>
                        </span>
                    </button>
                </div>
            </div>

            {/* Stats */}
            <StatsGrid columns={{ mobile: 1, tablet: 3, desktop: 3 }}>
                <StatCard
                    label="Total Items"
                    value={stats.total}
                />
                <StatCard
                    label="Low Stock"
                    value={stats.lowStock}
                    color={stats.lowStock > 0 ? 'danger' : 'default'}
                />
                <StatCard
                    label="Fluids"
                    value={stats.fluids}
                />
            </StatsGrid>

            {/* Filters */}
            <FilterBar>
                {/* Search */}
                <div className='relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-xs'>
                    <SearchIcon className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40' />
                    <input
                        type='text'
                        placeholder='Search items...'
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className='w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500/50 outline-none transition-colors'
                    />
                </div>

                {/* Category Filter */}
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className='px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500/50 outline-none transition-colors'
                >
                    <option value=''>All Categories</option>
                    {categories.map((cat) => (
                        <option
                            key={cat}
                            value={cat}
                        >
                            {cat.charAt(0) + cat.slice(1).toLowerCase()}
                        </option>
                    ))}
                </select>

                {/* Type Filter */}
                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className='px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500/50 outline-none transition-colors'
                >
                    <option value=''>All Types</option>
                    <option value='ITEM'>Item</option>
                    <option value='FLUID'>Fluid</option>
                </select>

                {/* Low Stock Toggle */}
                <label className='flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:bg-white/10 transition-colors'>
                    <input
                        type='checkbox'
                        checked={lowStockOnly}
                        onChange={(e) => setLowStockOnly(e.target.checked)}
                        className='rounded border-white/20'
                    />
                    <span className='text-sm'>Low Stock Only</span>
                </label>

                {/* Export Dropdown */}
                <div
                    className='relative ml-auto'
                    ref={exportDropdownRef}
                >
                    <button
                        onClick={() =>
                            setExportDropdownOpen(!exportDropdownOpen)
                        }
                        className='flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors'
                        title='Download'
                    >
                        <DownloadIcon className='w-4 h-4' />
                        <span className='text-sm'>Export</span>
                        <ChevronDownIcon
                            className={`w-4 h-4 transition-transform ${exportDropdownOpen ? "rotate-180" : ""}`}
                        />
                    </button>

                    {exportDropdownOpen && (
                        <div className='absolute right-0 top-full mt-1 w-40 bg-zinc-900 rounded-lg shadow-xl border border-white/10 z-50 overflow-hidden'>
                            <button
                                onClick={() => {
                                    handleExport("csv")
                                    setExportDropdownOpen(false)
                                }}
                                className='w-full px-4 py-2 text-left text-sm hover:bg-white/5 transition-colors flex items-center gap-2'
                            >
                                <FileTextIcon className='w-4 h-4 text-green-400' />
                                CSV
                            </button>
                            <button
                                onClick={() => {
                                    handleExport("excel")
                                    setExportDropdownOpen(false)
                                }}
                                className='w-full px-4 py-2 text-left text-sm hover:bg-white/5 transition-colors flex items-center gap-2'
                            >
                                <FileSpreadsheetIcon className='w-4 h-4 text-blue-400' />
                                Excel
                            </button>
                            <button
                                onClick={() => {
                                    handleExport("pdf")
                                    setExportDropdownOpen(false)
                                }}
                                className='w-full px-4 py-2 text-left text-sm hover:bg-white/5 transition-colors flex items-center gap-2'
                            >
                                <FileIcon className='w-4 h-4 text-red-400' />
                                PDF
                            </button>
                        </div>
                    )}
                </div>
            </FilterBar>

            {/* Table */}
            <div className='flex-1 min-h-0'>
                <InventoryTable
                    items={filteredItems}
                    showInactiveItems={activeTab === "inactive"}
                    isLoading={loading}
                    onAction={handleAction}
                    onRefresh={handleSuccess}
                />
            </div>

            {/* Modals */}
            <AnimatePresence>
                {showCreateModal && (
                    <TransactionModal
                        isOpen={showCreateModal}
                        onClose={() => setShowCreateModal(false)}
                        onSuccess={handleSuccess}
                    />
                )}

                {showFluidModal && (
                    <FluidModal
                        isOpen={showFluidModal}
                        onClose={() => setShowFluidModal(false)}
                        inventoryItems={inventoryItems}
                        onSuccess={handleSuccess}
                    />
                )}

                {activeModal === "edit" && selectedItem && (
                    <EditModal
                        isOpen={activeModal === "edit"}
                        onClose={handleCloseModal}
                        selectedItem={selectedItem}
                        onSuccess={handleSuccess}
                    />
                )}

                {activeModal === "adjust" && selectedItem && (
                    <AdjustModal
                        isOpen={activeModal === "adjust"}
                        onClose={handleCloseModal}
                        selectedItem={selectedItem}
                        onSuccess={handleSuccess}
                    />
                )}

                {activeModal === "duplicate" && selectedItem && (
                    <DuplicateModal
                        isOpen={activeModal === "duplicate"}
                        onClose={handleCloseModal}
                        selectedItem={selectedItem}
                        onSuccess={handleSuccess}
                    />
                )}

                {activeModal === "restock" && selectedItem && (
                    <RestockModal
                        isOpen={activeModal === "restock"}
                        item={selectedItem}
                        userId={userId}
                        currencySymbol='₱'
                        onClose={handleCloseModal}
                        onSuccess={handleSuccess}
                    />
                )}

                {activeModal === "delete" && selectedItem && (
                    <DeleteModal
                        isOpen={activeModal === "delete"}
                        onClose={handleCloseModal}
                        selectedItem={selectedItem}
                        onSuccess={handleSuccess}
                    />
                )}

                {activeModal === "history" && selectedItem && (
                    <HistoryModal
                        isOpen={activeModal === "history"}
                        onClose={handleCloseModal}
                        selectedItem={selectedItem}
                    />
                )}

                {activeModal === "restore" && selectedItem && (
                    <RestoreModal
                        isOpen={activeModal === "restore"}
                        onClose={handleCloseModal}
                        selectedItem={selectedItem}
                        onSuccess={handleSuccess}
                    />
                )}

                <CSVImportModal<InventoryImportRow>
                    isOpen={showImportModal}
                    onClose={() => setShowImportModal(false)}
                    onImport={handleImport}
                    columns={inventoryCSVColumns}
                    title='Import Inventory Items'
                    description='Upload a CSV file with inventory items. Required columns: Name, Category, Type.'
                    defaultBranchId={currentBranch?.id}
                />
            </AnimatePresence>
        </div>
    )
}
