"use client"

import { useState, useEffect, useCallback } from "react"
import { authClient, Passkey } from "@/lib/auth-client"
import { Fingerprint, Trash2, Plus, Loader2, Laptop, Smartphone, KeyRound } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useContext } from "react"
import { NotificationContext } from "@/components/notifications"

export default function PasskeyManager() {
    const { addNotification } = useContext(NotificationContext)
    const [passkeys, setPasskeys] = useState<Passkey[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null) // 'add' or passkey ID
    const [newPasskeyName, setNewPasskeyName] = useState("")
    const [isAdding, setIsAdding] = useState(false)

    const fetchPasskeys = useCallback(async () => {
        try {
            const { data, error } = await authClient.passkey.listUserPasskeys()
            if (error) {
                console.error("Failed to list passkeys", error)
                return
            }
            setPasskeys((data as unknown as Passkey[]) || [])
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchPasskeys()
    }, [fetchPasskeys])

    const handleAddPasskey = async () => {
        if (!newPasskeyName.trim()) {
            addNotification("Please enter a name for your passkey", "WARNING")
            return
        }

        setActionLoading("add")
        try {
            const { error } = await authClient.passkey.addPasskey({
                name: newPasskeyName,
            })

            if (error) {
                addNotification(error.message || "Failed to add passkey", "ERROR")
            } else {
                addNotification("Passkey added successfully", "SUCCESS")
                setNewPasskeyName("")
                setIsAdding(false)
                await fetchPasskeys()
            }
        } catch (err) {
            addNotification("An unexpected error occurred", "ERROR")
            console.error(err)
        } finally {
            setActionLoading(null)
        }
    }

    const handleDeletePasskey = async (id: string) => {
        if (!confirm("Are you sure you want to delete this passkey?")) return

        setActionLoading(id)
        try {
            const { error } = await authClient.passkey.deletePasskey({
                id,
            })

            if (error) {
                addNotification(error.message || "Failed to delete passkey", "ERROR")
            } else {
                addNotification("Passkey deleted successfully", "SUCCESS")
                await fetchPasskeys()
            }
        } catch (err) {
            addNotification("An unexpected error occurred", "ERROR")
            console.error(err)
        } finally {
            setActionLoading(null)
        }
    }

    const getIconForDevice = (deviceType?: string) => {
        if (deviceType?.toLowerCase().includes("mobile") || deviceType?.toLowerCase().includes("phone")) {
            return <Smartphone className="w-4 h-4" />
        }
        if (deviceType?.toLowerCase().includes("desktop") || deviceType?.toLowerCase().includes("laptop")) {
            return <Laptop className="w-4 h-4" />
        }
        return <KeyRound className="w-4 h-4" />
    }

    return (
        <div className="w-full bg-white/10 border-2 border-white/5 rounded-lg p-4 flex flex-col gap-2">
            <div className="w-full flex flex-row gap-2 justify-between font-semibold text-lg md:text-xl items-start">
                <div className="flex items-center gap-2">
                    Security & Passkeys
                </div>
                {!isAdding && (
                    <button
                        type="button"
                        className="flex flex-row gap-1 items-center border-2 border-white/5 px-3 py-1 font-semibold text-sm rounded-md cursor-pointer transition-colors bg-white/10 hover:bg-white/20 active:hover:bg-white/30"
                        onClick={() => setIsAdding(true)}
                    >
                        <Plus size={18} />
                        Add Passkey
                    </button>
                )}
            </div>

            <div className="flex flex-col gap-4 mt-2">
                {/* Add Passkey Form */}
                <AnimatePresence>
                    {isAdding && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                                <div className="flex-1 w-full">
                                    <label className="text-xs text-white/60 mb-1 block">Passkey Name</label>
                                    <input
                                        type="text"
                                        value={newPasskeyName}
                                        onChange={(e) => setNewPasskeyName(e.target.value)}
                                        placeholder="e.g. MacBook Pro, iPhone 15"
                                        className="w-full bg-black/20 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
                                        autoFocus
                                    />
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <button
                                        type="button"
                                        onClick={() => setIsAdding(false)}
                                        className="flex-1 sm:flex-none px-3 py-2 text-sm font-medium text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-md transition-colors"
                                        disabled={actionLoading === "add"}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleAddPasskey}
                                        disabled={actionLoading === "add"}
                                        className="flex-1 sm:flex-none px-3 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors flex items-center justify-center gap-2 min-w-[100px]"
                                    >
                                        {actionLoading === "add" ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>
                                                <Fingerprint className="w-4 h-4" />
                                                Register
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* List Passkeys */}
                {loading ? (
                    <div className="text-center py-8 text-white/40 flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span className="text-sm">Loading passkeys...</span>
                    </div>
                ) : passkeys.length === 0 ? (
                    <div className="text-center py-8 text-white/40 bg-white/5 rounded-lg border-2 border-dashed border-white/5">
                        <Fingerprint className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No passkeys registered yet</p>
                        <p className="text-xs mt-1">Add a passkey to sign in securely without a password</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {passkeys.map((passkey) => (
                            <div
                                key={passkey.id}
                                className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-center justify-between group hover:border-white/20 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                                        {getIconForDevice(passkey.deviceType)}
                                    </div>
                                    <div>
                                        <div className="font-medium text-white flex items-center gap-2">
                                            {passkey.name || "Unnamed Passkey"}
                                            {passkey.backedUp && (
                                                <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full border border-green-500/20">
                                                    Synced
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-white/40">
                                            Added {passkey.createdAt ? new Date(passkey.createdAt).toLocaleDateString() : "Unknown date"}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleDeletePasskey(passkey.id)}
                                    disabled={actionLoading === passkey.id}
                                    className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                                    title="Remove passkey"
                                >
                                    {actionLoading === passkey.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
