"use client"

import { useState, useEffect, useContext } from "react"
import { RefreshCwIcon, CopyIcon, MailIcon, Trash2Icon } from "lucide-react"
import { NotificationContext } from "@/components/notifications"
import { listInvitations } from "@/server/actions/profile"
import { deleteInvitation } from "@/server/actions/invitations"
import { UserRoleType } from "@/utils/types/auth"

interface Invitation {
    id: string
    email: string
    token: string
    role: UserRoleType
    created_at: Date | string
    expires_at: Date | string | null
    created_by: string
    creator_name?: string
}

const ROLE_COLORS: Record<UserRoleType, string> = {
    admin: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    manager: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    staff: "bg-green-500/20 text-green-400 border-green-500/30",
    artist: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    piercer: "bg-pink-500/20 text-pink-400 border-pink-500/30",
    shoe_tech: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
}

export default function InvitationsClient() {
    const { addNotification } = useContext(NotificationContext)
    const [invitations, setInvitations] = useState<Invitation[]>([])
    const [loading, setLoading] = useState(true)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    useEffect(() => {
        fetchInvitations()
    }, [])

    const fetchInvitations = async () => {
        setLoading(true)
        try {
            const result = await listInvitations()
            if (result.success) {
                setInvitations(result.data as Invitation[])
            }
        } catch (error) {
            console.error("Error fetching invitations:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (invitationId: string) => {
        if (!confirm("Are you sure you want to delete this invitation?")) {
            return
        }
        
        setDeletingId(invitationId)
        try {
            const result = await deleteInvitation(invitationId)
            if (result.success) {
                addNotification("Invitation deleted successfully", "SUCCESS")
                setInvitations(prev => prev.filter(inv => inv.id !== invitationId))
            } else {
                addNotification(result.error || "Failed to delete invitation", "ERROR")
            }
        } catch (_error) {
            addNotification("An error occurred while deleting", "ERROR")
        } finally {
            setDeletingId(null)
        }
    }

    const copyToken = (token: string) => {
        navigator.clipboard.writeText(token)
        addNotification("Invitation code copied!", "SUCCESS", "Copied")
    }

    const formatDate = (dateStr: Date | string) => {
        const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
        return date.toLocaleString()
    }

    const isExpired = (expiresAt: Date | string | null) => {
        if (!expiresAt) return false
        const date = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
        return date < new Date()
    }

    if (loading) {
        return <div className="flex items-center justify-center py-8"><RefreshCwIcon className="w-6 h-6 animate-spin text-muted-foreground" /></div>
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Pending Invitations</h2>
                <button onClick={fetchInvitations} disabled={loading} className="p-2 bg-card hover:bg-muted rounded-md transition-colors">
                    <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {invitations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <MailIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No pending invitations</p>
                </div>
            ) : (
                <div className="bg-muted border border-border rounded-lg overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-muted">
                            <tr className="text-left text-sm text-muted-foreground">
                                <th className="px-4 py-2">Email</th>
                                <th className="px-4 py-2">Role</th>
                                <th className="px-4 py-2">Code</th>
                                <th className="px-4 py-2">Expires</th>
                                <th className="px-4 py-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {invitations.map(inv => (
                                <tr key={inv.id} className="hover:bg-muted">
                                    <td className="px-4 py-2">{inv.email}</td>
                                    <td className="px-4 py-2">
                                        <span className={`px-2 py-0.5 rounded text-xs border ${ROLE_COLORS[inv.role]}`}>
                                            {inv.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2">
                                        <div className="flex items-center gap-2">
                                            <code className="bg-card px-2 py-0.5 rounded text-sm">{inv.token}</code>
                                            <button onClick={() => copyToken(inv.token)} className="p-1 hover:bg-muted rounded">
                                                <CopyIcon className="w-3 h-3 text-muted-foreground" />
                                            </button>
                                        </div>
                                    </td>
                                    <td className={`px-4 py-2 text-sm ${isExpired(inv.expires_at) ? 'text-red-400' : 'text-muted-foreground'}`}>
                                        {inv.expires_at ? formatDate(inv.expires_at) : 'Never'}
                                    </td>
                                    <td className="px-4 py-2">
                                        <button 
                                            onClick={() => handleDelete(inv.id)}
                                            disabled={deletingId === inv.id}
                                            className="p-1 hover:bg-red-500/20 rounded text-red-400 disabled:opacity-50"
                                            title="Delete invitation"
                                        >
                                            {deletingId === inv.id ? (
                                                <RefreshCwIcon className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Trash2Icon className="w-4 h-4" />
                                            )}
                                        </button>
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
