"use client"

import { useCallback, useContext, useEffect, useState } from "react"
import {
    ArrowLeftIcon,
    PlusIcon,
    PencilIcon,
    ArchiveIcon,
    RefreshCwIcon,
    LoaderCircleIcon,
    XIcon,

    TagsIcon,
    AlertCircleIcon,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { SideBarContext } from "@/components/sidebar"
import { NotificationContext } from "@/components/notifications"
import { LedgerEntryType } from "@/utils/types/ledger"
import {
    AccountingCategory,
    getAccountingCategories,
    createAccountingCategory,
    updateAccountingCategory,
    archiveAccountingCategory,
    restoreAccountingCategory,
} from "@/server/actions/accounting"
import { createLogs } from "@/server/actions/logs"
import { safeFormatDate } from "@/utils/date-utils"

const ENTRY_TYPES: { value: LedgerEntryType; label: string; color: string }[] = [
    { value: "EXPENSE", label: "Expense", color: "text-red-300 bg-red-500/10 border-red-500/30" },
    { value: "REVENUE", label: "Revenue", color: "text-green-300 bg-green-500/10 border-green-500/30" },
    { value: "ASSET", label: "Asset", color: "text-blue-300 bg-blue-500/10 border-blue-500/30" },
    { value: "LIABILITY", label: "Liability", color: "text-orange-300 bg-orange-500/10 border-orange-500/30" },
    { value: "EQUITY", label: "Equity", color: "text-purple-300 bg-purple-500/10 border-purple-500/30" },
]

export default function CategoriesPageClient() {
    const { userInfo } = useContext(SideBarContext)
    const { addNotification } = useContext(NotificationContext)
    const isAdmin = userInfo?.role === "admin"

    // Data State
    const [categories, setCategories] = useState<AccountingCategory[]>([])
    const [loading, setLoading] = useState(true)
    const [showInactive, setShowInactive] = useState(false)

    // Modal State
    const [showAddModal, setShowAddModal] = useState(false)
    const [editingCategory, setEditingCategory] = useState<AccountingCategory | null>(null)
    const [archivingCategory, setArchivingCategory] = useState<AccountingCategory | null>(null)

    // --- Data Fetching ---
    const fetchCategories = useCallback(async () => {
        setLoading(true)
        try {
            const result = await getAccountingCategories(showInactive)
            if (result.success) {
                setCategories(result.data)
            } else {
                addNotification(result.error || "Failed to load categories", "ERROR")
            }
        } catch (error) {
            createLogs({ logs: [{ level: 'ERROR', type: 'ACCOUNTING', message: `Error fetching categories: ${error instanceof Error ? error.message : String(error)}` }] })
            addNotification("Failed to load categories", "ERROR")
        } finally {
            setLoading(false)
        }
    }, [addNotification, showInactive])

    useEffect(() => {
        fetchCategories()
    }, [fetchCategories])

    // Group categories by type
    const categoriesByType = ENTRY_TYPES.map((type) => ({
        ...type,
        categories: categories.filter((c) => c.type === type.value),
    })).filter((group) => group.categories.length > 0)

    return (
        <div className='flex-1 w-full flex flex-col h-full overflow-hidden'>
            {/* Header */}
            <div className='mb-4'>
                <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4'>
                    <div className='flex items-center gap-3'>
                        <Link
                            href='/accounting'
                            className='p-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors border-2 border-white/5'
                            title='Back to Accounting'
                        >
                            <ArrowLeftIcon className='w-5 h-5' />
                        </Link>
                        <div>
                            <h1 className='text-xl md:text-2xl font-bold flex items-center gap-2'>
                                <TagsIcon className='w-5 h-5 md:w-6 md:h-6' />
                                Category Management
                            </h1>
                            <p className='text-white/60 text-xs md:text-sm mt-1'>
                                Manage accounting categories for ledger entries
                            </p>
                        </div>
                    </div>
                    
                    <div className='flex items-center gap-2'>
                        {/* Show Inactive Toggle */}
                        <label className='flex items-center gap-2 px-3 py-2 bg-white/10 rounded-md cursor-pointer hover:bg-white/20 transition-colors border-2 border-white/5'>
                            <input
                                type='checkbox'
                                checked={showInactive}
                                onChange={(e) => setShowInactive(e.target.checked)}
                                className='rounded border-white/30'
                            />
                            <span className='text-sm'>Show Archived</span>
                        </label>

                        {/* Add Category Button */}
                        {isAdmin && (
                            <button
                                onClick={() => setShowAddModal(true)}
                                className='flex items-center gap-1.5 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-md transition-colors border-2 border-green-500/30 cursor-pointer'
                            >
                                <PlusIcon className='w-4 h-4' />
                                <span className='text-sm font-medium'>Add Category</span>
                            </button>
                        )}

                        {/* Refresh Button */}
                        <button
                            onClick={fetchCategories}
                            disabled={loading}
                            className='p-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors disabled:opacity-50 border-2 border-white/5 cursor-pointer'
                            title='Refresh'
                        >
                            <RefreshCwIcon
                                className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
                            />
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className='grid grid-cols-2 md:grid-cols-5 gap-4'>
                    {ENTRY_TYPES.map((type) => {
                        const count = categories.filter((c) => c.type === type.value && c.is_active).length
                        return (
                            <div
                                key={type.value}
                                className={`${type.color} border rounded-lg p-3`}
                            >
                                <p className='text-[10px] uppercase font-semibold opacity-70'>{type.label}</p>
                                <p className='text-lg font-bold'>{count}</p>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Categories List */}
            <div className='flex-1 overflow-auto'>
                {loading ? (
                    <div className='flex flex-col items-center justify-center gap-2 py-12'>
                        <LoaderCircleIcon className='w-8 h-8 animate-spin text-white/60' />
                        <p className='text-white/60'>Loading categories...</p>
                    </div>
                ) : categories.length === 0 ? (
                    <div className='flex flex-col items-center justify-center gap-2 py-12 text-white/60'>
                        <TagsIcon className='w-8 h-8 opacity-20' />
                        <p>No categories found</p>
                        {isAdmin && (
                            <button
                                onClick={() => setShowAddModal(true)}
                                className='text-blue-400 hover:text-blue-300 text-sm'
                            >
                                Create your first category
                            </button>
                        )}
                    </div>
                ) : (
                    <div className='space-y-6'>
                        {categoriesByType.map((group) => (
                            <div key={group.value}>
                                <h3 className={`text-sm font-bold uppercase mb-3 flex items-center gap-2 ${group.color.split(' ')[0]}`}>
                                    <span className={`px-2 py-0.5 rounded border ${group.color} text-xs`}>{group.label}</span>
                                    <span className='text-white/40'>({group.categories.length})</span>
                                </h3>
                                <div className='bg-white/5 border border-white/10 rounded-lg overflow-hidden'>
                                    <table className='w-full'>
                                        <thead className='bg-white/5'>
                                            <tr className='text-left text-xs text-white/60'>
                                                <th className='px-4 py-2'>Name</th>
                                                <th className='px-4 py-2'>Status</th>
                                                <th className='px-4 py-2'>Created</th>
                                                {isAdmin && <th className='px-4 py-2 text-right'>Actions</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.categories.map((category) => (
                                                <tr
                                                    key={category.id}
                                                    className={`border-t border-white/5 hover:bg-white/5 transition-colors ${!category.is_active ? 'opacity-50' : ''}`}
                                                >
                                                    <td className='px-4 py-3'>{category.name}</td>
                                                    <td className='px-4 py-3'>
                                                        {category.is_active ? (
                                                            <span className='px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-300 border border-green-500/30'>
                                                                Active
                                                            </span>
                                                        ) : (
                                                            <span className='px-2 py-0.5 rounded text-xs bg-white/10 text-white/60 border border-white/20'>
                                                                Archived
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className='px-4 py-3 text-sm text-white/60'>
                                                        {safeFormatDate(category.created_at)}
                                                    </td>
                                                    {isAdmin && (
                                                        <td className='px-4 py-3'>
                                                            <div className='flex items-center justify-end gap-2'>
                                                                <button
                                                                    onClick={() => setEditingCategory(category)}
                                                                    className='p-1.5 hover:bg-white/10 rounded transition-colors'
                                                                    title='Edit'
                                                                >
                                                                    <PencilIcon className='w-4 h-4 text-blue-400' />
                                                                </button>
                                                                {category.is_active ? (
                                                                    <button
                                                                        onClick={() => setArchivingCategory(category)}
                                                                        className='p-1.5 hover:bg-white/10 rounded transition-colors'
                                                                        title='Archive'
                                                                    >
                                                                        <ArchiveIcon className='w-4 h-4 text-orange-400' />
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        onClick={async () => {
                                                                            const result = await restoreAccountingCategory(category.id)
                                                                            if (result.success) {
                                                                                addNotification("Category restored", "SUCCESS")
                                                                                fetchCategories()
                                                                            } else {
                                                                                addNotification(result.error || "Failed to restore", "ERROR")
                                                                            }
                                                                        }}
                                                                        className='p-1.5 hover:bg-white/10 rounded transition-colors'
                                                                        title='Restore'
                                                                    >
                                                                        <RefreshCwIcon className='w-4 h-4 text-green-400' />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add/Edit Category Modal */}
            <AnimatePresence>
                {(showAddModal || editingCategory) && (
                    <CategoryModal
                        category={editingCategory}
                        onClose={() => {
                            setShowAddModal(false)
                            setEditingCategory(null)
                        }}
                        onSuccess={() => {
                            setShowAddModal(false)
                            setEditingCategory(null)
                            fetchCategories()
                            addNotification(
                                editingCategory ? "Category updated" : "Category created",
                                "SUCCESS"
                            )
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Archive Confirmation Modal */}
            <AnimatePresence>
                {archivingCategory && (
                    <ArchiveModal
                        category={archivingCategory}
                        onClose={() => setArchivingCategory(null)}
                        onConfirm={async () => {
                            const result = await archiveAccountingCategory(archivingCategory.id)
                            if (result.success) {
                                addNotification("Category archived", "SUCCESS")
                                fetchCategories()
                            } else {
                                addNotification(result.error || "Failed to archive", "ERROR")
                            }
                            setArchivingCategory(null)
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}

// ============================================
// Category Modal Component
// ============================================

function CategoryModal({
    category,
    onClose,
    onSuccess,
}: {
    category: AccountingCategory | null
    onClose: () => void
    onSuccess: () => void
}) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [formData, setFormData] = useState({
        name: category?.name || "",
        type: category?.type || "EXPENSE",
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!formData.name.trim()) {
            setError("Category name is required")
            return
        }

        setLoading(true)
        try {
            if (category) {
                // Update existing
                const result = await updateAccountingCategory(category.id, formData)
                if (result.success) {
                    onSuccess()
                } else {
                    setError(result.error || "Failed to update category")
                }
            } else {
                // Create new
                const result = await createAccountingCategory(formData)
                if (result.success) {
                    onSuccess()
                } else {
                    setError(result.error || "Failed to create category")
                }
            }
        } catch (error) {
            createLogs({ logs: [{ level: 'ERROR', type: 'ACCOUNTING', message: `Error saving category: ${error instanceof Error ? error.message : String(error)}` }] })
            setError("An unexpected error occurred")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm' onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10'
                onClick={(e) => e.stopPropagation()}
            >
                <div className='p-6 border-b border-white/10 flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>
                        {category ? "Edit Category" : "Add Category"}
                    </h3>
                    <button onClick={onClose} className='text-white/60 hover:text-white transition-colors'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className='p-6 space-y-4'>
                    {error && (
                        <div className='flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-300 text-sm'>
                            <AlertCircleIcon className='w-4 h-4 flex-shrink-0' />
                            {error}
                        </div>
                    )}

                    <div>
                        <label className='block text-sm font-medium mb-1'>Name *</label>
                        <input
                            type='text'
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder='e.g., Office Supplies'
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none transition-colors'
                            required
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium mb-1'>Type *</label>
                        <select
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value as LedgerEntryType })}
                            className='w-full px-3 py-2 bg-white/10 border border-white/10 rounded-md focus:border-white/30 outline-none transition-colors'
                            disabled={!!category} // Can't change type when editing
                        >
                            {ENTRY_TYPES.map((type) => (
                                <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                        </select>
                        {category && (
                            <p className='text-xs text-white/40 mt-1'>Type cannot be changed after creation</p>
                        )}
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        <button
                            type='button'
                            onClick={onClose}
                            disabled={loading}
                            className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors disabled:opacity-50'
                        >
                            Cancel
                        </button>
                        <button
                            type='submit'
                            disabled={loading || !formData.name.trim()}
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2'
                        >
                            {loading && <LoaderCircleIcon className='w-4 h-4 animate-spin' />}
                            {category ? "Update" : "Create"}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    )
}

// ============================================
// Archive Modal Component
// ============================================

function ArchiveModal({
    category,
    onClose,
    onConfirm,
}: {
    category: AccountingCategory
    onClose: () => void
    onConfirm: () => void
}) {
    const [loading, setLoading] = useState(false)

    const handleConfirm = async () => {
        setLoading(true)
        await onConfirm()
        setLoading(false)
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm' onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-white/10'
                onClick={(e) => e.stopPropagation()}
            >
                <div className='p-6 border-b border-white/10'>
                    <div className='flex items-center gap-3'>
                        <div className='p-3 bg-orange-500/20 rounded-full'>
                            <ArchiveIcon className='w-6 h-6 text-orange-400' />
                        </div>
                        <div>
                            <h3 className='text-xl font-bold'>Archive Category</h3>
                            <p className='text-white/60 text-sm'>This action can be undone later</p>
                        </div>
                    </div>
                </div>

                <div className='p-6'>
                    <p className='text-white/80 mb-4'>
                        Are you sure you want to archive the category
                        <span className='font-semibold text-white'> &ldquo;{category.name}&rdquo;</span>?
                    </p>
                    
                    <p className='text-sm text-white/60'>
                        Archived categories will no longer appear in the dropdown when creating ledger entries.
                    </p>

                    <div className='flex justify-end gap-3 mt-6'>
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors disabled:opacity-50'
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading}
                            className='px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2'
                        >
                            {loading && <LoaderCircleIcon className='w-4 h-4 animate-spin' />}
                            Archive
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
