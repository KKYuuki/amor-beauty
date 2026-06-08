"use client"

import { useState, useEffect, useContext } from "react"
import { MailIcon, RefreshCwIcon, CopyIcon, KeyIcon } from "lucide-react"
import { NotificationContext } from "@/components/notifications"
import { listInvitations } from "@/server/actions/profile"
import { UserRoleType } from "@/utils/types/auth"

interface Invitation {
    id: string
    email: string
    token: string
    role: UserRoleType
    created_at: string
    expires_at: string | null
    created_by: string
    creator_name?: string
}

const ROLE_COLORS: Record<UserRoleType, string> = {
    admin: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    manager: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    staff: "bg-green-500/20 text-green-400 border-green-500/30",
    artist: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    piercer: "bg-pink-500/20 text-pink-400 border-pink-500/30",
    shoe_tech: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
}

export default function InvitationsClient() {
    const { addNotification } = useContext(NotificationContext)
    const [invitations, setInvitations] = useState<Invitation[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchInvitations()
    }, [])

    const fetchInvitations = async () => {
        setLoading(true)
        setError(null)
        try {
            const result = await listInvitations()
            if (result.success) {
                setInvitations(result.data as unknown as Invitation[])
            } else {
                setError(result.error || "Failed to load invitations")
            }
        } catch {
            setError("An unexpected error occurred")
        } finally {
            setLoading(false)
        }
    }

    const copyToken = (token: string) => {
        navigator.clipboard.writeText(token)
        addNotification("Invitation code copied!", "SUCCESS", "Copied")
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString()
    }

    const isExpired = (expiresAt: string | null) => {
        if (!expiresAt) return false
        return new Date(expiresAt) < new Date()
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <KeyIcon className="w-6 h-6 text-blue-500" />
                    <div>
                        <h1 className="text-2xl font-bold">Invitation Codes</h1>
                        <p className="text-muted-foreground text-sm">Manage user invitation codes</p>
                    </div>
                </div>
                <button
                    onClick={fetchInvitations}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 bg-card hover:bg-muted rounded-md transition-colors"
                >
                    <RefreshCwIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <RefreshCwIcon className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
            ) : invitations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    <MailIcon className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>No pending invitations</p>
                </div>
            ) : (
                <div className="bg-muted border border-border rounded-lg overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-muted">
                            <tr className="text-left text-sm text-muted-foreground">
                                <th className="px-4 py-3">Email</th>
                                <th className="px-4 py-3">Role</th>
                                <th className="px-4 py-3">Code</th>
                                <th className="px-4 py-3">Created</th>
                                <th className="px-4 py-3">Expires</th>
                                <th className="px-4 py-3">Created By</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {invitations.map((inv) => (
                                <tr key={inv.id} className="hover:bg-muted transition-colors">
                                    <td className="px-4 py-3 font-medium">{inv.email}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded text-xs border ${ROLE_COLORS[inv.role]}`}>
                                            {inv.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <code className="bg-card px-2 py-1 rounded text-sm font-mono">
                                                {inv.token}
                                            </code>
                                            <button
                                                onClick={() => copyToken(inv.token)}
                                                className="p-1 hover:bg-muted rounded transition-colors"
                                                title="Copy code"
                                            >
                                                <CopyIcon className="w-4 h-4 text-muted-foreground" />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                        {formatDate(inv.created_at)}
                                    </td>
                                    <td className="px-4 py-3">
                                        {inv.expires_at ? (
                                            <span className={isExpired(inv.expires_at) ? "text-red-400" : "text-muted-foreground"}>
                                                {formatDate(inv.expires_at)}
                                                {isExpired(inv.expires_at) && " (Expired)"}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground/70">Never</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                        {inv.creator_name}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
