"use client"

import { UserPaymentMethod, CreatePaymentMethodPayload } from "@/utils/types/payroll"
import { NotificationContext } from "@/components/notifications"
import { useState, useEffect, useContext } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
    PlusIcon,
    Trash2Icon,
    EditIcon,
    StarIcon,
    EyeIcon,
    EyeOffIcon,
    BanknoteIcon,
    CreditCardIcon,
    WalletIcon,
    LandmarkIcon,
    XIcon,
} from "lucide-react"
import {
    getUserPaymentMethods,
    createPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    setDefaultPaymentMethod,
} from "@/server/actions/payment-methods"

interface PaymentMethodsProps {
    userId: string
    isAdmin: boolean
}

const PAYMENT_TYPE_OPTIONS = [
    { value: "BANK_TRANSFER", label: "Bank Account", icon: LandmarkIcon },
    { value: "GCASH", label: "GCash", icon: WalletIcon },
    { value: "MAYA", label: "Maya", icon: CreditCardIcon },
    { value: "PAYMAYA", label: "Paymaya", icon: CreditCardIcon },
    { value: "CASH", label: "Cash", icon: BanknoteIcon },
] as const

function maskAccountNumber(number: string): string {
    if (!number || number.length <= 4) return number || ""
    return "•".repeat(number.length - 4) + number.slice(-4)
}

function getPaymentTypeIcon(type: string) {
    const option = PAYMENT_TYPE_OPTIONS.find((opt) => opt.value === type)
    const Icon = option?.icon || CreditCardIcon
    return <Icon size={20} className="text-muted-foreground" />
}

export default function PaymentMethods({ userId, isAdmin }: PaymentMethodsProps) {
    const { addNotification } = useContext(NotificationContext)
    const [methods, setMethods] = useState<UserPaymentMethod[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [editingMethod, setEditingMethod] = useState<UserPaymentMethod | null>(null)
    const [revealedNumbers, setRevealedNumbers] = useState<Set<string>>(new Set())

    // Form state
    const [formData, setFormData] = useState<CreatePaymentMethodPayload>({
        user_id: userId,
        type: "BANK_TRANSFER",
        provider: "",
        account_name: "",
        account_number: "",
        is_default: false,
    })

    // Fetch payment methods
    useEffect(() => {
        const fetchMethods = async () => {
            setLoading(true)
            const result = await getUserPaymentMethods(userId)
            if (result.success) {
                setMethods(result.data.methods)
            }
            setLoading(false)
        }
        fetchMethods()
    }, [userId])

    // Toggle account number visibility
    const toggleReveal = (methodId: string) => {
        setRevealedNumbers((prev) => {
            const newSet = new Set(prev)
            if (newSet.has(methodId)) {
                newSet.delete(methodId)
            } else {
                newSet.add(methodId)
            }
            return newSet
        })
    }

    // Handle form submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (editingMethod) {
            // Update existing
            const result = await updatePaymentMethod(editingMethod.id, userId, {
                type: formData.type,
                provider: formData.provider,
                account_name: formData.account_name,
                account_number: formData.account_number,
                is_default: formData.is_default,
            })
            if (result.success) {
                addNotification("Payment method updated successfully", "SUCCESS")
                const methodsResult = await getUserPaymentMethods(userId)
                if (methodsResult.success) {
                    setMethods(methodsResult.data.methods)
                }
                setShowForm(false)
                setEditingMethod(null)
            } else {
                addNotification(result.error || "Failed to update", "ERROR")
            }
        } else {
            // Create new
            const result = await createPaymentMethod(userId, formData)
            if (result.success) {
                addNotification("Payment method added successfully", "SUCCESS")
                const methodsResult = await getUserPaymentMethods(userId)
                if (methodsResult.success) {
                    setMethods(methodsResult.data.methods)
                }
                setShowForm(false)
            } else {
                addNotification(result.error || "Failed to add", "ERROR")
            }
        }
    }

    // Handle delete
    const handleDelete = async (methodId: string) => {
        if (!confirm("Are you sure you want to delete this payment method?")) return

        const result = await deletePaymentMethod(methodId, userId)
        if (result.success) {
            addNotification("Payment method deleted", "SUCCESS")
            setMethods((prev) => prev.filter((m) => m.id !== methodId))
        } else {
            addNotification(result.error || "Failed to delete", "ERROR")
        }
    }

    // Handle set default
    const handleSetDefault = async (methodId: string) => {
        const result = await setDefaultPaymentMethod(methodId, userId)
        if (result.success) {
            addNotification("Default payment method updated", "SUCCESS")
            const methodsResult = await getUserPaymentMethods(userId)
            if (methodsResult.success) {
                setMethods(methodsResult.data.methods)
            }
        } else {
            addNotification(result.error || "Failed to update", "ERROR")
        }
    }

    // Open edit form
    const handleEdit = (method: UserPaymentMethod) => {
        setEditingMethod(method)
        setFormData({
            user_id: userId,
            type: method.type,
            provider: method.provider || "",
            account_name: method.account_name || "",
            account_number: method.account_number || "",
            is_default: method.is_default,
        })
        setShowForm(true)
    }

    // Open add form
    const handleAdd = () => {
        setEditingMethod(null)
        setFormData({
            user_id: userId,
        type: "BANK_TRANSFER",
            provider: "",
            account_name: "",
            account_number: "",
            is_default: methods.length === 0, // Default if first
        })
        setShowForm(true)
    }

    // Close form
    const handleClose = () => {
        setShowForm(false)
        setEditingMethod(null)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin h-8 w-8 border-2 border-border border-t-white rounded-full" />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex flex-row items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Payment Methods</h3>
                    <p className="text-sm text-muted-foreground">Manage bank accounts and e-wallets for payouts</p>
                </div>
                {isAdmin && (
                    <button
                        type="button"
                        onClick={handleAdd}
                        className="flex items-center gap-2 px-4 py-2 bg-card hover:bg-muted rounded-lg transition-colors text-sm font-medium"
                    >
                        <PlusIcon size={16} />
                        Add Method
                    </button>
                )}
            </div>

            {/* Methods List */}
            <div className="flex flex-col gap-3">
                {methods.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground/70 bg-muted rounded-xl border border-border">
                        <CreditCardIcon size={32} className="mx-auto mb-3 opacity-50" />
                        <p>No payment methods configured</p>
                        {isAdmin && (
                            <button
                                type="button"
                                onClick={handleAdd}
                                className="mt-3 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                Add your first payment method
                            </button>
                        )}
                    </div>
                ) : (
                    methods.map((method) => (
                        <motion.div
                            key={method.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`p-4 rounded-xl border transition-colors ${
                                method.is_default
                                    ? "bg-blue-400/10 border-blue-400/30"
                                    : "bg-muted border-border hover:bg-muted"
                            }`}
                        >
                            <div className="flex items-start gap-4">
                                {/* Icon */}
                                <div className="p-3 bg-card rounded-lg">
                                    {getPaymentTypeIcon(method.type)}
                                </div>

                                {/* Details */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-semibold">
                                            {method.provider || method.type}
                                        </span>
                                        {method.is_default && (
                                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-yellow-400/20 text-yellow-400 rounded-full">
                                                <StarIcon size={10} />
                                                Default
                                            </span>
                                        )}
                                    </div>
                                    {method.account_name && (
                                        <p className="text-sm text-muted-foreground mb-1">{method.account_name}</p>
                                    )}
                                    {method.account_number && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-mono text-muted-foreground/70">
                                                {revealedNumbers.has(method.id)
                                                    ? method.account_number
                                                    : maskAccountNumber(method.account_number)}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => toggleReveal(method.id)}
                                                className="p-1 hover:bg-muted rounded transition-colors"
                                                title={
                                                    revealedNumbers.has(method.id) ? "Hide" : "Reveal"
                                                }
                                            >
                                                {revealedNumbers.has(method.id) ? (
                                                    <EyeOffIcon size={14} />
                                                ) : (
                                                    <EyeIcon size={14} />
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                {isAdmin && (
                                    <div className="flex items-center gap-1">
                                        {!method.is_default && (
                                            <button
                                                type="button"
                                                onClick={() => handleSetDefault(method.id)}
                                                className="p-2 hover:bg-yellow-400/20 rounded-lg transition-colors"
                                                title="Set as default"
                                            >
                                                <StarIcon size={16} className="text-yellow-400" />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleEdit(method)}
                                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                                            title="Edit"
                                        >
                                            <EditIcon size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(method.id)}
                                            className="p-2 hover:bg-red-400/20 rounded-lg transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2Icon size={16} className="text-red-400" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Form Modal */}
            <AnimatePresence>
                {showForm && (
                    <>
                        <div
                            className="fixed inset-0 bg-black/50 z-40"
                            onClick={handleClose}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-black/95 border border-border rounded-2xl p-6 z-50"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-semibold">
                                    {editingMethod ? "Edit Payment Method" : "Add Payment Method"}
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="p-1 hover:bg-muted rounded-lg transition-colors"
                                >
                                    <XIcon size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                {/* Type */}
                                <label className="flex flex-col gap-1">
                                    <span className="text-sm font-medium text-muted-foreground">Type</span>
                                    <select
                                        value={formData.type}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                type: e.target.value as CreatePaymentMethodPayload["type"],
                                            })
                                        }
                                        className="bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary"
                                    >
                                        {PAYMENT_TYPE_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                {/* Provider */}
                                <label className="flex flex-col gap-1">
                                    <span className="text-sm font-medium text-muted-foreground">
                                        Provider / Bank Name
                                    </span>
                                    <input
                                        type="text"
                                        value={formData.provider}
                                        onChange={(e) =>
                                            setFormData({ ...formData, provider: e.target.value })
                                        }
                                        placeholder="e.g. BDO, BPI, Metrobank"
                                        className="bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary"
                                    />
                                </label>

                                {/* Account Name */}
                                <label className="flex flex-col gap-1">
                                    <span className="text-sm font-medium text-muted-foreground">Account Name</span>
                                    <input
                                        type="text"
                                        value={formData.account_name}
                                        onChange={(e) =>
                                            setFormData({ ...formData, account_name: e.target.value })
                                        }
                                        placeholder="Full name on account"
                                        className="bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary"
                                    />
                                </label>

                                {/* Account Number */}
                                <label className="flex flex-col gap-1">
                                    <span className="text-sm font-medium text-muted-foreground">Account Number</span>
                                    <input
                                        type="text"
                                        value={formData.account_number}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                account_number: e.target.value,
                                            })
                                        }
                                        placeholder="Account number"
                                        className="bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary"
                                    />
                                </label>

                                {/* Default */}
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_default}
                                        onChange={(e) =>
                                            setFormData({ ...formData, is_default: e.target.checked })
                                        }
                                        className="w-4 h-4 rounded border-border bg-card text-blue-500 focus:ring-2 focus:ring-blue-500/50"
                                    />
                                    <span className="text-sm">Set as default payment method</span>
                                </label>

                                {/* Actions */}
                                <div className="flex flex-row gap-2 justify-end pt-4 border-t border-border">
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        className="px-6 py-2 bg-muted rounded-lg border border-border hover:bg-muted transition-colors font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-2 bg-blue-400/20 text-blue-400 rounded-lg border border-blue-400/30 hover:bg-blue-400/30 transition-colors font-medium"
                                    >
                                        {editingMethod ? "Update" : "Add Method"}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}
