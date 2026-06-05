"use client"

import { useState, useEffect, useContext } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "motion/react"
import Image from "next/image"
import Link from "next/link"
import {
    ArrowLeftIcon,
    UserIcon,
    ShieldIcon,
    ClockIcon,
    CreditCardIcon,
    SaveIcon,
    EyeIcon,
    EyeOffIcon,
    Loader2Icon,
} from "lucide-react"
import { UserProfile, UserRoleType, PayoutPeriodType } from "@/utils/types/auth"
import { hasWorkCapability } from "@/utils/auth/user-capabilities"
import { getProfile, updateProfile, updatePassword } from "@/server/actions/profile"
import { getRateLevels } from "@/server/actions/rate-levels"
import { RateLevelItem } from "@/utils/types/payroll"
import { createLogs } from "@/server/actions/logs"
import { NotificationContext } from "@/components/notifications"
import { SideBarContext } from "@/components/sidebar"
import ScheduleEditor from "@/components/schedules/scheduleEditor"
import PaymentMethods from "@/components/accounts/PaymentMethods"
import { FEATURE_ACCESS_FLAGS, VALID_FEATURE_FLAGS, CAPABILITY_FLAGS, VALID_CAPABILITY_FLAGS, normalizeFlag } from "@/utils/auth/access-flags"

interface UserDetailPageProps {
    params: Promise<{
        id: string
    }>
}

const TABS = [
    { id: "main", label: "Main Info", icon: UserIcon },
    { id: "access", label: "Access & Work", icon: ShieldIcon },
    { id: "schedule", label: "Schedule", icon: ClockIcon },
    { id: "payment", label: "Payment Methods", icon: CreditCardIcon },
] as const

export default function UserDetailPage({ params }: UserDetailPageProps) {
    const _router = useRouter()
    const { addNotification } = useContext(NotificationContext)
    const { userInfo: currentUser } = useContext(SideBarContext)
    const [userId, setUserId] = useState<string | null>(null)

    // State
    const [user, setUser] = useState<UserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [activeTab, setActiveTab] = useState<typeof TABS[number]["id"]>("main")

    // Edit state
    const [editData, setEditData] = useState<Partial<UserProfile>>({})
    const [newPassword, setNewPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [rateLevels, setRateLevels] = useState<RateLevelItem[]>([])

    // Available flags from canonical registry
    const availableFlags = VALID_FEATURE_FLAGS

    // Load user ID from params
    useEffect(() => {
        params.then((p) => setUserId(p.id))
    }, [params])

    // Fetch rate levels
    useEffect(() => {
        getRateLevels(true).then((result) => {
            if (result.success) {
                setRateLevels(result.data)
            }
        }).catch(console.error)
    }, [])

    // Fetch user data
    useEffect(() => {
        if (!userId) return

        const fetchUser = async () => {
            setLoading(true)
            const data = await getProfile(userId)
            if (data) {
                setUser(data)
                setEditData(data)
            }
            setLoading(false)
        }
        fetchUser()
    }, [userId])

    // Password validation
    const checkPasswordRequirements = (password: string) => ({
        length: password.length >= 12,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^A-Za-z0-9]/.test(password),
    })

    const passwordReqs = checkPasswordRequirements(newPassword)

    // Handle save
    const handleSave = async () => {
        if (!user || !userId) {
            addNotification("User data not loaded", "ERROR")
            return
        }

        setSaving(true)

        try {
            // Validation
            if (newPassword && newPassword.length < 12) {
                addNotification("Password must be at least 12 characters", "ERROR")
                setSaving(false)
                return
            }
            if (!editData.full_name?.trim()) {
                addNotification("Name cannot be empty", "ERROR")
                setSaving(false)
                return
            }
            if (!editData.email?.includes('@')) {
                addNotification("Please enter a valid email address", "ERROR")
                setSaving(false)
                return
            }

            // Save password if provided
            if (newPassword) {
                const passRes = await updatePassword({
                    _userId: userId,
                    _newPassword: newPassword,
                    _updatedBy: currentUser?.id ?? '',
                })
                if (!passRes) {
                    addNotification("Failed to update password", "ERROR")
                    setSaving(false)
                    return
                }
                setNewPassword("")
            }

            // Save profile
            const res = await updateProfile({
                userId,
                profile: editData,
                updatedBy: currentUser?.id,
            })

            if (res.success) {
                addNotification("User updated successfully", "SUCCESS")

                // Refresh user data
                const freshData = await getProfile(userId)
                if (freshData) {
                    setUser(freshData)
                    setEditData(freshData)
                }
            } else {
                addNotification(res.error || "Failed to update user", "ERROR")
            }
        } catch (error) {
            await createLogs({
                logs: [{
                    level: 'ERROR',
                    type: 'SYSTEM',
                    message: `Error saving user: ${error}`,
                    user_id: userId ?? undefined
                }]
            })
            addNotification("An error occurred while saving", "ERROR")
        } finally {
            setSaving(false)
        }
    }

    // Toggle access flag
    const toggleFlag = (flag: string) => {
        const currentFlags = editData.access_flags || []
        const canonicalFlag = normalizeFlag(flag)
        const isActive = currentFlags.some(f => normalizeFlag(f) === canonicalFlag)

        if (isActive) {
            // Remove ALL variants (old + new names) of this canonical flag
            setEditData({
                ...editData,
                access_flags: currentFlags.filter(f => normalizeFlag(f) !== canonicalFlag),
            })
        } else {
            // Add the canonical name only
            setEditData({
                ...editData,
                access_flags: [...currentFlags, canonicalFlag],
            })
        }
    }

    if (loading || !user) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <Loader2Icon className="animate-spin" size={32} />
            </div>
        )
    }

    const isAdmin = currentUser?.role === "admin"
    const isOwnProfile = currentUser?.id === userId

    return (
        <div className="w-full h-full flex flex-col gap-4 p-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link
                    href="/accounts"
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                    <ArrowLeftIcon size={20} />
                </Link>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold">{user.full_name}</h1>
                    <p className="text-white/60">{user.email}</p>
                </div>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-400/20 text-blue-400 rounded-lg border border-blue-400/30 hover:bg-blue-400/30 transition-colors disabled:opacity-50"
                >
                    {saving ? (
                        <Loader2Icon size={16} className="animate-spin" />
                    ) : (
                        <SaveIcon size={16} />
                    )}
                    {saving ? "Saving..." : "Save Changes"}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex flex-row gap-2 border-b border-white/10">
                {TABS.map((tab) => {
                    const Icon = tab.icon
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-3 font-medium transition-colors border-b-2 ${
                                activeTab === tab.id
                                    ? "border-blue-400 text-blue-400"
                                    : "border-transparent text-white/60 hover:text-white"
                            }`}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto">
                <AnimatePresence mode="wait">
                    {activeTab === "main" && (
                        <motion.div
                            key="main"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="max-w-2xl space-y-6"
                        >
                            {/* Avatar */}
                            <div className="flex items-center gap-4">
                                <div className="w-20 h-20 rounded-full bg-white/10 overflow-hidden">
                                    {user.avatar_url ? (
                                        <Image
                                            src={user.avatar_url}
                                            alt={user.full_name}
                                            width={80}
                                            height={80}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <UserIcon size={32} className="text-white/40" />
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm text-white/60">Avatar</p>
                                    <p className="text-xs text-white/40">Avatar upload coming soon</p>
                                </div>
                            </div>

                            {/* Full Name */}
                            <label className="block">
                                <span className="text-sm font-medium text-white/60">Full Name</span>
                                <input
                                    type="text"
                                    value={editData.full_name || ""}
                                    onChange={(e) =>
                                        setEditData({ ...editData, full_name: e.target.value })
                                    }
                                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/30"
                                />
                            </label>

                            {/* Email */}
                            <label className="block">
                                <span className="text-sm font-medium text-white/60">Email</span>
                                <input
                                    type="email"
                                    value={editData.email || ""}
                                    onChange={(e) =>
                                        setEditData({ ...editData, email: e.target.value })
                                    }
                                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/30"
                                />
                            </label>

                            {/* Phone */}
                            <label className="block">
                                <span className="text-sm font-medium text-white/60">Phone Number</span>
                                <input
                                    type="tel"
                                    value={editData.phone_number || ""}
                                    onChange={(e) =>
                                        setEditData({ ...editData, phone_number: e.target.value })
                                    }
                                    placeholder="+63..."
                                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/30"
                                />
                            </label>

                            {/* Password Reset (Admin only) */}
                            {isAdmin && (
                                <div className="pt-6 border-t border-white/10">
                                    <h3 className="font-semibold mb-4">Reset Password</h3>
                                    <div className="space-y-4">
                                        <label className="block">
                                            <span className="text-sm font-medium text-white/60">New Password</span>
                                            <div className="mt-1 relative">
                                                <input
                                                    type={showPassword ? "text" : "password"}
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-10 text-white focus:outline-none focus:border-white/30"
                                                    placeholder="Leave blank to keep current"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                                                >
                                                    {showPassword ? (
                                                        <EyeOffIcon size={16} />
                                                    ) : (
                                                        <EyeIcon size={16} />
                                                    )}
                                                </button>
                                            </div>
                                        </label>

                                        {newPassword && (
                                            <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2">
                                                <p className="text-sm font-medium text-white/60">Password Requirements</p>
                                                {[
                                                    { key: "length", label: "At least 12 characters" },
                                                    { key: "uppercase", label: "One uppercase letter" },
                                                    { key: "lowercase", label: "One lowercase letter" },
                                                    { key: "number", label: "One number" },
                                                    { key: "special", label: "One special character" },
                                                ].map(({ key, label }) => (
                                                    <div
                                                        key={key}
                                                        className={`flex items-center gap-2 text-sm ${
                                                            passwordReqs[key as keyof typeof passwordReqs]
                                                                ? "text-green-400"
                                                                : "text-white/40"
                                                        }`}
                                                    >
                                                        <span
                                                            className={`w-2 h-2 rounded-full ${
                                                                passwordReqs[key as keyof typeof passwordReqs]
                                                                    ? "bg-green-400"
                                                                    : "bg-white/20"
                                                            }`}
                                                        />
                                                        {label}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Login Information */}
                            {(user.last_login_at || user.last_login_method) && (
                                <div className="pt-6 border-t border-white/10">
                                    <h3 className="font-semibold mb-4">Login Information</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {user.last_login_at && (
                                            <div>
                                                <span className="text-sm text-white/60">Last Login</span>
                                                <p className="font-medium">
                                                    {new Date(user.last_login_at).toLocaleString("en-PH", {
                                                        dateStyle: "medium",
                                                        timeStyle: "short",
                                                    })}
                                                </p>
                                            </div>
                                        )}
                                        {user.last_login_method && (
                                            <div>
                                                <span className="text-sm text-white/60">Login Method</span>
                                                <p className="font-medium capitalize">
                                                    {user.last_login_method.replace("_", " ")}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === "access" && (
                        <motion.div
                            key="access"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="max-w-2xl space-y-6"
                        >
                            {/* Role */}
                            <label className="block">
                                <span className="text-sm font-medium text-white/60">User Role</span>
                                <select
                                    value={editData.role || "staff"}
                                    onChange={(e) => {
                                        const newRole = e.target.value as UserRoleType
                                        // Prevent downgrading self
                                        if (isOwnProfile && newRole !== "admin") {
                                            addNotification("You cannot downgrade your own role", "ERROR")
                                            return
                                        }
                                        // Prevent non-admins from setting admin
                                        if (!isAdmin && newRole === "admin") {
                                            addNotification("Only admins can set admin role", "ERROR")
                                            return
                                        }
                                        const updates: Partial<UserProfile> = { ...editData, role: newRole }

                                        // Auto-set rate_level_id when changing to artist role
                                        if (newRole === "artist" && !editData.rate_level_id) {
                                            const defaultLevel = rateLevels.find(l => l.slug === 'standard')
                                            if (defaultLevel) {
                                                updates.rate_level_id = defaultLevel.id
                                            }
                                        }

                                        // Clear rate_level_id when changing to non-artist role
                                        if (newRole !== "artist" && editData.rate_level_id) {
                                            updates.rate_level_id = undefined
                                        }

                                        setEditData(updates)
                                    }}
                                    disabled={!isAdmin}
                                    className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
                                >
                                    <option value="admin">Admin</option>
                                    <option value="manager">Manager</option>
                                    <option value="staff">Staff</option>
                                    <option value="artist">Artist</option>
                                    <option value="piercer">Piercer</option>
                                    <option value="shoe_tech">Shoe Tech</option>
                                </select>
                            </label>

                            {/* Access Flags from canonical registry */}
                            <div className="space-y-4">
                                <h3 className="font-semibold">Feature Access</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {availableFlags.map((flag) => {
                                        const meta = FEATURE_ACCESS_FLAGS[flag]
                                        // Check both old and new flag names during transition
                                        const isChecked = editData.access_flags?.some(
                                            (f) => f === flag || normalizeFlag(f) === flag
                                        ) || false
                                        return (
                                            <label key={flag} className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => toggleFlag(flag)}
                                                    disabled={!isAdmin}
                                                    className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
                                                />
                                                <span className="capitalize">{meta?.label || flag.replace(/_/g, " ")}</span>
                                            </label>
                                        )
                                    })}
                                </div>

                                {/* Capabilities for Admin */}
                                {editData.role === "admin" && (
                                    <>
                                        <h3 className="font-semibold pt-4">Capabilities (Hybrid Roles)</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {VALID_CAPABILITY_FLAGS.map((flag) => {
                                                const meta = CAPABILITY_FLAGS[flag]
                                                const isChecked = editData.access_flags?.includes(flag) || false
                                                return (
                                                    <label key={flag} className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => toggleFlag(flag)}
                                                            disabled={!isAdmin}
                                                            className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
                                                        />
                                                        <span className="capitalize">{meta?.label || flag}</span>
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Payroll Settings */}
                            <div className="pt-6 border-t border-white/10 space-y-4">
                                <h3 className="font-semibold">Payroll Settings</h3>

                                <div className={`grid gap-4 ${hasWorkCapability(editData) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                    {hasWorkCapability(editData) && (
                                        <label className="block">
                                            <span className="text-sm font-medium text-white/60">Rate Level</span>
                                            <select
                                                value={editData.rate_level_id || ""}
                                                onChange={(e) =>
                                                    setEditData({
                                                        ...editData,
                                                        rate_level_id: e.target.value || undefined,
                                                    })
                                                }
                                                disabled={!isAdmin}
                                                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
                                            >
                                                <option value="">Select Rate Level</option>
                                                {rateLevels.map((level) => (
                                                    <option key={level.id} value={level.id}>{level.name}</option>
                                                ))}
                                            </select>
                                            {hasWorkCapability(editData) && !editData.rate_level_id && (
                                                <p className='text-yellow-400 text-xs mt-1'>
                                                    Warning: No rate level assigned. Commission calculations will fail.
                                                </p>
                                            )}
                                        </label>
                                    )}

                                    <label className="block">
                                        <span className="text-sm font-medium text-white/60">Payout Period</span>
                                        <select
                                            value={editData.payout_period || "DAILY"}
                                            onChange={(e) =>
                                                setEditData({
                                                    ...editData,
                                                    payout_period: e.target.value as PayoutPeriodType,
                                                })
                                            }
                                            disabled={!isAdmin}
                                            className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
                                        >
                                            <option value="DAILY">Daily</option>
                                            <option value="WEEKLY">Weekly</option>
                                            <option value="BIMONTHLY">Bi-monthly</option>
                                            <option value="MONTHLY">Monthly</option>
                                        </select>
                                    </label>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === "schedule" && (
                        <motion.div
                            key="schedule"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                        {user.role === "staff" ||
                        user.role === "artist" ||
                        user.role === "piercer" ||
                        user.role === "shoe_tech" ||
                        (user.role === "admin" && user.access_flags?.some(f => ["artist", "piercing", "shoe"].includes(f))) ? (
                            <ScheduleEditor
                                staffId={userId!}
                                staffName={user.full_name}
                                onClose={() => {}}
                                readonly={!isAdmin}
                                inline
                            />
                        ) : (
                            <div className="p-8 text-center text-white/40 bg-white/5 rounded-xl border border-white/10">
                                <ClockIcon size={32} className="mx-auto mb-3 opacity-50" />
                                <p>Scheduling is not available</p>
                            </div>
                        )}
                        </motion.div>
                    )}

                    {activeTab === "payment" && (
                        <motion.div
                            key="payment"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <PaymentMethods userId={userId!} isAdmin={isAdmin} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
