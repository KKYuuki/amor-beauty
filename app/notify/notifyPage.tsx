"use client"
import { normalizeFlag } from "@/utils/auth/access-flags"
import AccessChecker from "@/components/accessChecker"
import { useBranchContext } from "@/components/branch-context"
import { NotificationContext } from "@/components/notifications"
import PageWrapper from "@/components/page-wrapper"
import { SideBarContext } from "@/components/sidebar"
import { UserProfile, UserRoleType } from "@/utils/types/auth"
import {
    CheckIcon,
    Loader2Icon,
    MegaphoneIcon,
    SearchIcon,
    SendIcon,
    UserIcon,
    UsersIcon,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useContext, useEffect, useState } from "react"
import { sendBulkNotificationEmail } from "@/server/actions/email"
import { getProfiles } from "@/server/actions/profile"

export default function NotifyClientPage() {
    // Context
    const { addNotification } = useContext(NotificationContext)
    const { userInfo } = useContext(SideBarContext)
    const { currentBranch } = useBranchContext()

    // State
    const [activeTab, setActiveTab] = useState<"select" | "manual">("select")
    const [loading, setLoading] = useState(false)
    const [sending, setSending] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)

    // Data
    const [users, setUsers] = useState<UserProfile[]>([])
    const [selectedUsers, setSelectedUsers] = useState<UserProfile[]>([])
    const [manualEmails, setManualEmails] = useState("")

    // Filters
    const [search, setSearch] = useState("")
    const [roleFilter, setRoleFilter] = useState<UserRoleType | "">("")

    // Email Content
    const [templateType, setTemplateType] = useState<
        "generic" | "notification"
    >("generic")
    const [subject, setSubject] = useState("")
    const [message, setMessage] = useState("")
    const [link, setLink] = useState("")
    const [buttonText, setButtonText] = useState("")

    // Effects
    useEffect(() => {
        const fetchUsers = async () => {
            setLoading(true)
            try {
                const res = await getProfiles()
                if (res) {
                    setUsers(
                        res.sort(
                            (a, b) =>
                                new Date(b.created_at).getTime() -
                                new Date(a.created_at).getTime()
                        )
                    )
                } else {
                    addNotification("Failed to load users", "ERROR")
                }
            } catch (_error) {
                addNotification("Failed to load users", "ERROR")
            } finally {
                setLoading(false)
            }
        }
        fetchUsers()
    }, [addNotification])

    // Permission check - block access if no permission (must be after all hooks)
    if (userInfo && !userInfo.access_flags?.some(f => normalizeFlag(f) === "notifications_send") && userInfo.role !== 'admin') {
        return (
            <PageWrapper>
                <AccessChecker perms="notifications_send" />
            </PageWrapper>
        )
    }

    // Handlers
    const parseManualEmails = (input: string): string[] => {
        return input.split(/[\n,]/).map(e => e.trim()).filter(e => e.length > 0)
    }

    const handleSelectAll = () => {
        const filteredUsers = users.filter((user) => {
            const matchesSearch =
                user.full_name.toLowerCase().includes(search.toLowerCase()) ||
                user.email.toLowerCase().includes(search.toLowerCase())
            const matchesRole = roleFilter
                ? user.role === roleFilter
                : true
            const matchesBranch = currentBranch
                ? user.branch_ids?.includes(currentBranch.id) ?? true
                : true
            return matchesSearch && matchesRole && matchesBranch
        })

        // If all filtered users are already selected, deselect them
        const allSelected = filteredUsers.every((user) =>
            selectedUsers.find((u) => u.id === user.id)
        )

        if (allSelected) {
            setSelectedUsers(
                selectedUsers.filter(
                    (u) => !filteredUsers.find((fu) => fu.id === u.id)
                )
            )
        } else {
            // Add unselected filtered users
            const newSelected = [...selectedUsers]
            filteredUsers.forEach((user) => {
                if (!newSelected.find((u) => u.id === user.id)) {
                    newSelected.push(user)
                }
            })
            setSelectedUsers(newSelected)
        }
    }

    const getRecipients = (): {
        email: string
        name: string
        id?: string
    }[] => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (activeTab === "select") {
            return selectedUsers.map((u) => ({
                email: u.email,
                name: u.full_name,
                id: u.id,
            }))
        } else {
            return parseManualEmails(manualEmails)
                .filter(e => emailRegex.test(e))
                .map(e => ({ email: e, name: "" }))
        }
    }

    const handleSend = async () => {
        const recipients = getRecipients()

        if (recipients.length === 0) {
            addNotification("Please select at least one recipient", "ERROR")
            return
        }

        if (!subject) {
            addNotification("Please enter a subject", "ERROR")
            return
        }

        if (!message) {
            addNotification("Please enter a message", "ERROR")
            return
        }

        // Check for invalid emails in manual mode
        if (activeTab === "manual") {
            const rawEmails = parseManualEmails(manualEmails)
            const invalidCount = rawEmails.length - recipients.length
            if (invalidCount > 0) {
                addNotification(`${invalidCount} invalid email(s) were skipped`, "WARNING")
            }
        }

        setSending(true)

        const res = await sendBulkNotificationEmail(
            recipients,
            subject,
            message,
            templateType,
            link,
            buttonText
        )

        setSending(false)
        setConfirmOpen(false)

        if (!res.success) {
            addNotification(
                res.error || "Failed to send emails",
                "ERROR"
            )
            return
        }

        const { successful, failed } = res.data
        if (failed === 0) {
            addNotification(
                `Successfully sent ${successful} emails`,
                "SUCCESS"
            )
            // Reset form
            setSubject("")
            setMessage("")
            setLink("")
            setButtonText("")
            setSelectedUsers([])
            setManualEmails("")
        } else {
            addNotification(
                `Sent ${successful} emails, failed ${failed}`,
                "ERROR"
            )
        }
    }

    const roleColors: Record<UserRoleType, string> = {
        admin: "bg-orange-500/20 text-orange-300",
        manager: "bg-purple-500/20 text-purple-300",
        staff: "bg-blue-500/20 text-blue-300",
        artist: "bg-pink-500/20 text-pink-300",
        piercer: "bg-cyan-500/20 text-cyan-300",
        shoe_tech: "bg-amber-500/20 text-amber-300",
    }

    return (
        <PageWrapper>
        <div className='w-full h-full flex flex-col gap-4 overflow-hidden'>
            {/* Header */}
            <div className='flex items-center justify-between'>
                <div>
                    <h1 className='text-2xl font-bold flex items-center gap-2'>
                        <MegaphoneIcon className='w-6 h-6' />
                        Notify
                    </h1>
                    <p className='text-white/60 text-sm mt-1'>
                        Send notifications to users
                    </p>
                </div>
                <div className='flex items-center gap-3'>
                </div>
            </div>

            {/* Main Content */}
            <div className='flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden [&_button]:cursor-pointer'>
                {/* Left Panel: Recipients */}
                <div className='flex-1 flex flex-col gap-4 bg-white/5 border-2 border-white/10 rounded-2xl p-4 overflow-hidden'>
                    {/* Tabs */}
                    <div className='flex flex-row gap-2 bg-black/20 p-1 rounded-lg shrink-0'>
                        <button
                            onClick={() => setActiveTab("select")}
                            className={`flex-1 py-2 rounded-md font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
                                activeTab === "select"
                                    ? "bg-white/10 text-white"
                                    : "text-white/40 hover:text-white/60"
                            }`}
                        >
                            <UsersIcon size={16} />
                            Select Users
                        </button>
                        <button
                            onClick={() => setActiveTab("manual")}
                            className={`flex-1 py-2 rounded-md font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
                                activeTab === "manual"
                                    ? "bg-white/10 text-white"
                                    : "text-white/40 hover:text-white/60"
                            }`}
                        >
                            <UserIcon size={16} />
                            Manual Input
                        </button>
                    </div>

                    {/* Tab Content */}
                    {activeTab === "select" ? (
                        <div className='flex-1 flex flex-col gap-4 overflow-hidden'>
                            {/* Filters */}
                            <div className='flex flex-row gap-2 flex-wrap shrink-0'>
                                <div className='flex-1 min-w-[200px] relative'>
                                    <SearchIcon
                                        size={16}
                                        className='absolute left-3 top-1/2 -translate-y-1/2 text-white/40'
                                    />
                                    <input
                                        type='text'
                                        placeholder='Search users...'
                                        value={search}
                                        onChange={(e) =>
                                            setSearch(e.target.value)
                                        }
                                        className='w-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-white/30 transition-colors'
                                    />
                                </div>
                                <select
                                    value={roleFilter}
                                    onChange={(e) =>
                                        setRoleFilter(
                                            e.target.value as UserRoleType | ""
                                        )
                                    }
                                    className='bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 transition-colors cursor-pointer'
                                >
                                    <option value=''>All Roles</option>
                                    <option value='admin'>Admin</option>
                                    <option value='manager'>Manager</option>
                                    <option value='staff'>Staff</option>
                                    <option value='artist'>Artist</option>
                                    <option value='piercer'>Piercer</option>
                                    <option value='shoe_tech'>Shoe Tech</option>
                                </select>
                                <button
                                    onClick={handleSelectAll}
                                    className='px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-semibold transition-colors'
                                >
                                    Select/Deselect All
                                </button>
                            </div>

                            {/* User List */}
                            <div className='flex-1 overflow-auto rounded-lg border border-white/10 bg-black/20'>
                                {loading ? (
                                    <div className='w-full h-full flex items-center justify-center'>
                                        <Loader2Icon
                                            className='animate-spin text-white/40'
                                            size={24}
                                        />
                                    </div>
                                ) : (
                                    <table className='w-full text-left border-collapse'>
                                        <thead className='sticky top-0 bg-[#1a1a1a] z-10'>
                                            <tr>
                                                <th className='p-3 text-xs font-bold text-white/40 uppercase border-b border-white/10 w-10'>
                                                    #
                                                </th>
                                                <th className='p-3 text-xs font-bold text-white/40 uppercase border-b border-white/10'>
                                                    Name
                                                </th>
                                                <th className='p-3 text-xs font-bold text-white/40 uppercase border-b border-white/10'>
                                                    Email
                                                </th>
                                                <th className='p-3 text-xs font-bold text-white/40 uppercase border-b border-white/10 w-24'>
                                                    Role
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users
                                                .filter((user) => {
                                                    const matchesSearch =
                                                        user.full_name
                                                            .toLowerCase()
                                                            .includes(
                                                                search.toLowerCase()
                                                            ) ||
                                                        user.email
                                                            .toLowerCase()
                                                            .includes(
                                                                search.toLowerCase()
                                                            )
                                                    const matchesRole =
                                                        roleFilter
                                                            ? user.role ===
                                                              roleFilter
                                                            : true
                                                    const matchesBranch =
                                                        currentBranch
                                                            ? user.branch_ids?.includes(currentBranch.id) ?? true
                                                            : true
                                                    return (
                                                        matchesSearch &&
                                                        matchesRole &&
                                                        matchesBranch
                                                    )
                                                })
                                                .map((user) => {
                                                    const isSelected =
                                                        selectedUsers.some(
                                                            (u) =>
                                                                u.id === user.id
                                                        )
                                                    return (
                                                        <tr
                                                            key={user.id}
                                                            onClick={() => {
                                                                if (
                                                                    isSelected
                                                                ) {
                                                                    setSelectedUsers(
                                                                        selectedUsers.filter(
                                                                            (
                                                                                u
                                                                            ) =>
                                                                                u.id !==
                                                                                user.id
                                                                        )
                                                                    )
                                                                } else {
                                                                    setSelectedUsers(
                                                                        [
                                                                            ...selectedUsers,
                                                                            user,
                                                                        ]
                                                                    )
                                                                }
                                                            }}
                                                            className={`cursor-pointer transition-colors border-b border-white/5 last:border-0 ${
                                                                isSelected
                                                                    ? "bg-white/10 hover:bg-white/15"
                                                                    : "hover:bg-white/5"
                                                            }`}
                                                        >
                                                            <td className='p-3'>
                                                                <div
                                                                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                                                        isSelected
                                                                            ? "bg-blue-500 border-blue-500"
                                                                            : "border-white/40"
                                                                    }`}
                                                                >
                                                                    {isSelected && (
                                                                        <CheckIcon
                                                                            size={
                                                                                12
                                                                            }
                                                                            className='text-white'
                                                                        />
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className='p-3 text-sm font-medium'>
                                                                {user.full_name}
                                                            </td>
                                                            <td className='p-3 text-sm text-white/60'>
                                                                {user.email}
                                                            </td>
                                                            <td className='p-3'>
                                                                <span
                                                                    className={`text-xs font-bold px-2 py-1 rounded-full ${roleColors[user.role]}`}
                                                                >
                                                                    {user.role}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                            <div className='text-xs text-white/40 font-medium px-1'>
                                {selectedUsers.length} users selected
                            </div>
                        </div>
                    ) : (
                        <div className='flex-1 flex flex-col gap-2'>
                            <textarea
                                value={manualEmails}
                                onChange={(e) =>
                                    setManualEmails(e.target.value)
                                }
                                placeholder='Enter email addresses (separated by commas or new lines)...'
                                className='flex-1 w-full bg-black/20 border border-white/10 rounded-lg p-4 text-sm outline-none focus:border-white/30 transition-colors resize-none font-mono'
                            />
                            <p className='text-xs text-white/40'>
                                Example: user@example.com, another@example.com
                            </p>
                        </div>
                    )}
                </div>

                {/* Right Panel: Email Content */}
                <div className='flex-1 flex flex-col gap-4 bg-white/5 border-2 border-white/10 rounded-2xl p-4 overflow-y-auto'>
                    <h2 className='font-semibold text-lg flex items-center gap-2'>
                        <MegaphoneIcon size={20} />
                        Compose Message
                    </h2>

                    {/* Template Selection */}
                    <div className='flex flex-col gap-1'>
                        <label className='text-xs font-bold text-white/40 uppercase'>
                            Template
                        </label>
                        <div className='flex flex-row gap-2'>
                            <button
                                onClick={() => setTemplateType("generic")}
                                className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-all ${
                                    templateType === "generic"
                                        ? "border-blue-500 bg-blue-500/10 text-blue-400"
                                        : "border-white/10 bg-black/20 text-white/60 hover:border-white/20"
                                }`}
                            >
                                Generic Message
                            </button>
                            <button
                                onClick={() =>
                                    setTemplateType("notification")
                                }
                                className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-all ${
                                    templateType === "notification"
                                        ? "border-purple-500 bg-purple-500/10 text-purple-400"
                                        : "border-white/10 bg-black/20 text-white/60 hover:border-white/20"
                                }`}
                            >
                                Notification
                            </button>
                        </div>
                    </div>

                    {/* Subject */}
                    <div className='flex flex-col gap-1'>
                        <label className='text-xs font-bold text-white/40 uppercase'>
                            Subject / Title
                        </label>
                        <input
                            type='text'
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder='Important Update'
                            className='w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 transition-colors'
                        />
                    </div>

                    {/* Message */}
                    <div className='flex flex-col gap-1 flex-1'>
                        <div className='flex flex-row justify-between items-end'>
                            <label className='text-xs font-bold text-white/40 uppercase'>
                                Message Content
                            </label>
                        </div>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder='Type your message here...'
                            className='w-full h-full min-h-[200px] bg-black/20 border border-white/10 rounded-lg p-3 text-sm outline-none focus:border-white/30 transition-colors resize-none'
                        />
                    </div>

                    {/* Optional Fields */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div className='flex flex-col gap-1'>
                            <label className='text-xs font-bold text-white/40 uppercase'>
                                Link URL (Optional)
                            </label>
                            <input
                                type='text'
                                value={link}
                                onChange={(e) => setLink(e.target.value)}
                                placeholder='https://...'
                                className='w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 transition-colors'
                            />
                        </div>
                        {templateType === "generic" && (
                            <div className='flex flex-col gap-1'>
                                <label className='text-xs font-bold text-white/40 uppercase'>
                                    Button Text (Optional)
                                </label>
                                <input
                                    type='text'
                                    value={buttonText}
                                    onChange={(e) =>
                                        setButtonText(e.target.value)
                                    }
                                    placeholder='Click Here'
                                    className='w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-white/30 transition-colors'
                                />
                            </div>
                        )}
                    </div>

                    {/* Send Button */}
                    <button
                        onClick={() => setConfirmOpen(true)}
                        disabled={
                            !subject ||
                            !message ||
                            (activeTab === "select" &&
                                selectedUsers.length === 0) ||
                            (activeTab === "manual" && !manualEmails)
                        }
                        className='flex flex-row gap-2 items-center justify-center px-4 py-2 bg-white/5 border-2 border-white/10 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-white/5 cursor-pointer'
                    >
                        <SendIcon size={18} />
                        Send Notification
                    </button>
                </div>
            </div>

            {/* Confirmation Modal */}
            <AnimatePresence>
                {confirmOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className='fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4'
                        onClick={() => setConfirmOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className='bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl'
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className='text-xl font-bold mb-2'>
                                Confirm Send
                            </h3>
                            <p className='text-white/60 mb-6'>
                                You are about to send this email to{" "}
                                <span className='text-white font-bold'>
                                    {getRecipients().length}
                                </span>{" "}
                                recipients. This action cannot be undone.
                            </p>

                            <div className='flex flex-row gap-3'>
                                <button
                                    onClick={() => setConfirmOpen(false)}
                                    className='flex-1 flex flex-row gap-2 items-center justify-center px-4 py-2 bg-white/5 border-2 border-white/10 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-white/5 cursor-pointer'
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSend}
                                    disabled={sending}
                                    className='flex-1 flex flex-row gap-2 items-center justify-center px-4 py-2 bg-blue-400/20 border-2 border-white/10 rounded-lg transition-colors hover:bg-blue-400/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-white/5 cursor-pointer'
                                >
                                    {sending ? (
                                        <Loader2Icon
                                            className='animate-spin'
                                            size={18}
                                        />
                                    ) : (
                                        "Confirm & Send"
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
        </PageWrapper>
    )
}
