"use client"

import { NotificationContext } from "@/components/notifications"
import { updatePassword, updateProfile } from "@/server/actions/profile"
import { routes } from "@/utils/routes"
import {
    UserProfile,
    UserRoleType,
    PayoutPeriodType,
} from "@/utils/types/auth"
import { shouldHaveRateLevel } from "@/utils/auth/user-capabilities"
import { RateLevelItem } from "@/utils/types/payroll"
import { XIcon, EyeIcon, EyeClosedIcon } from "lucide-react"
import { motion } from "motion/react"
import Image from "next/image"
import { useContext, useState } from "react"

interface EditUserModalProps {
    user: UserProfile
    currentUser: UserProfile
    rateLevels: RateLevelItem[]
    onClose: () => void
    onSuccess: () => void
}

export default function EditUserModal({
    user,
    currentUser,
    rateLevels,
    onClose,
    onSuccess,
}: EditUserModalProps) {
    // Context
    const { addNotification } = useContext(NotificationContext)

    // State
    const [localUser, setLocalUser] = useState<UserProfile>(user)
    const [newPass, setNewPass] = useState("")
    const [editStatus, setEditStatus] = useState("Save")
    const [showPassword, setShowPassword] = useState(false)

    // Password validation helpers
    const checkPasswordRequirements = (password: string) => ({
        length: password.length >= 12,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^A-Za-z0-9]/.test(password),
    })
    const reqs = checkPasswordRequirements(newPass)

    // Constants
    const availableFlags: string[] = []
    routes.forEach((route) => {
        if (route.perms) {
            availableFlags.push(route.perms)
        }
    })

    // Handlers
    const handleSave = async () => {
        setEditStatus("Saving...")

        // Validation
        if (newPass.length > 0 && newPass.length < 8) {
            addNotification(
                "Password must be at least 8 characters long",
                "ERROR",
                "Password Too Short"
            )
            setEditStatus("Save")
            return
        }
        if (localUser.full_name.length === 0) {
            addNotification("Name cannot be empty", "ERROR", "Name Empty")
            setEditStatus("Save")
            return
        }
        if (localUser.email.length === 0) {
            addNotification("Email cannot be empty", "ERROR", "Email Empty")
            setEditStatus("Save")
            return
        }

        // Save Password
        if (newPass) {
            const passRes = await updatePassword({
                _userId: localUser.id,
                _newPassword: newPass,
                _updatedBy: currentUser.id,
            })
            if (!passRes) {
                addNotification(
                    "Please try again later",
                    "ERROR",
                    "Error Updating Password"
                )
                setEditStatus("Save")
                return
            }
        }

        // Save Profile
        const res = await updateProfile({
            userId: localUser.id,
            profile: localUser,
            updatedBy: currentUser.id,
        })

        if (!res) {
            addNotification(
                "Please try again later",
                "ERROR",
                "Error Updating User"
            )
            setEditStatus("Save")
            return
        }

        setEditStatus("Save")
        addNotification("User has been successfully updated", "SUCCESS")
        onSuccess()
    }

    return (
        <motion.div
            key='edit-modal'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='fixed top-1/2 left-1/2 -translate-1/2 bg-black/90 border-2 border-border rounded-3xl px-4 py-5 flex flex-col gap-2 w-lg max-w-[calc(100%-1rem)] z-10 @container'
        >
            <div className='flex flex-row gap-4 items-top justify-between font-bold'>
                Edit User
                <button
                    title='Close'
                    type='button'
                    className='p-1 transition-colors rounded-md bg-transparent hover:bg-muted cursor-pointer'
                    onClick={onClose}
                >
                    <XIcon size={18} />
                </button>
            </div>
            <div className='w-full flex flex-row gap-4'>
                {localUser.avatar_url && (
                    <Image
                        src={localUser.avatar_url}
                        alt={localUser.full_name}
                        width={300}
                        height={300}
                        className='w-16 h-16 rounded-full object-cover object-center'
                    />
                )}
                <div className='flex-1 flex flex-col'>
                    <h2 className='text-lg font-bold text-foreground'>
                        {localUser.full_name}
                    </h2>
                    <p className='text-xs font-semibold text-muted-foreground'>
                        {`Created at ${new Date(
                            localUser.created_at as Date
                        ).toLocaleDateString("en-US", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                        })}`}
                    </p>
                    <label className='flex flex-col gap-1 font-semibold text-sm text-muted-foreground/70 mt-2'>
                        Role
                        <select
                            value={localUser.role}
                            onChange={(e) => {
                                if (
                                    currentUser.role !== "admin" &&
                                    e.target.value === "admin"
                                ) {
                                    addNotification(
                                        "You can't change the role if you are not an admin",
                                        "ERROR"
                                    )
                                    return
                                }
                                if (
                                    currentUser.id === localUser.id &&
                                    e.target.value !== "admin"
                                ) {
                                    addNotification(
                                        "You can't downgrade your own role",
                                        "ERROR"
                                    )
                                    return
                                }
                                const newRole = e.target.value as UserRoleType
                                const updates = { ...localUser, role: newRole }

                                if (newRole === "artist" && !localUser.rate_level_id) {
                                    const defaultLevel = rateLevels.find(l => l.slug === 'standard')
                                    if (defaultLevel) {
                                        updates.rate_level_id = defaultLevel.id
                                    }
                                }

                                if (newRole !== "artist" && localUser.rate_level_id) {
                                    updates.rate_level_id = undefined
                                }

                                setLocalUser(updates)
                            }}
                            className='bg-muted border-2 border-border rounded-lg px-2 py-1 text-foreground font-normal cursor-pointer transition-colors hover:bg-muted'
                        >
                            <option value='admin'>Admin</option>
                            <option value='staff'>Staff</option>
                            <option value='artist'>Artist</option>
                            <option value='piercer'>Piercer</option>
                            <option value='shoe_tech'>Shoe Tech</option>
                        </select>
                    </label>
                    <label className='flex flex-col gap-1 font-semibold text-sm text-muted-foreground/70 mt-2'>
                        Full Name
                        <input
                            type='text'
                            value={localUser.full_name}
                            onChange={(e) => {
                                setLocalUser({
                                    ...localUser,
                                    full_name: e.target.value,
                                })
                            }}
                            className='bg-muted border-2 border-border rounded-lg px-2 py-1 text-foreground font-normal cursor-pointer transition-colors hover:bg-muted'
                        />
                    </label>
                    <label className='flex flex-col gap-1 font-semibold text-sm text-muted-foreground/70 mt-2'>
                        Email
                        <input
                            type='email'
                            value={localUser.email}
                            onChange={(e) => {
                                setLocalUser({
                                    ...localUser,
                                    email: e.target.value,
                                })
                            }}
                            className='bg-muted border-2 border-border rounded-lg px-2 py-1 text-foreground font-normal cursor-pointer transition-colors hover:bg-muted'
                        />
                    </label>
                    {currentUser.role === "admin" && (
                        <>
                            <label className='flex flex-col gap-1 font-semibold text-sm text-muted-foreground/70 mt-2'>
                                New Password
                                <div className='flex items-center gap-2'>
                                    <input
                                        type={
                                            showPassword ? "text" : "password"
                                        }
                                        value={newPass}
                                        onChange={(e) =>
                                            setNewPass(e.target.value)
                                        }
                                        className='flex-1 bg-muted border-2 border-border rounded-lg px-2 py-1 text-foreground font-normal transition-colors hover:bg-muted'
                                        placeholder='Enter new password'
                                    />
                                    <button
                                        type='button'
                                        onClick={() =>
                                            setShowPassword(!showPassword)
                                        }
                                        className='text-muted-foreground hover:text-foreground transition-colors cursor-pointer'
                                    >
                                        {showPassword ? (
                                            <EyeIcon size={18} />
                                        ) : (
                                            <EyeClosedIcon size={18} />
                                        )}
                                    </button>
                                </div>
                            </label>
                            {newPass.length > 0 && (
                                <div className='bg-muted border-2 border-border rounded-lg px-3 py-2 flex flex-col gap-1'>
                                    <span className='text-muted-foreground font-bold text-xs tracking-wider uppercase mb-1'>
                                        Password Requirements
                                    </span>
                                    <ul className='flex flex-col gap-0.5'>
                                        <li
                                            className={`text-xs flex items-center gap-2 transition-colors ${reqs.length ? "text-blue-400 font-medium" : "text-muted-foreground/70"}`}
                                        >
                                            <span
                                                className={`w-1.5 h-1.5 rounded-full ${reqs.length ? "bg-blue-400" : "bg-muted"}`}
                                            ></span>
                                            At least 12 characters
                                        </li>
                                        <li
                                            className={`text-xs flex items-center gap-2 transition-colors ${reqs.uppercase ? "text-blue-400 font-medium" : "text-muted-foreground/70"}`}
                                        >
                                            <span
                                                className={`w-1.5 h-1.5 rounded-full ${reqs.uppercase ? "bg-blue-400" : "bg-muted"}`}
                                            ></span>
                                            One uppercase letter
                                        </li>
                                        <li
                                            className={`text-xs flex items-center gap-2 transition-colors ${reqs.lowercase ? "text-blue-400 font-medium" : "text-muted-foreground/70"}`}
                                        >
                                            <span
                                                className={`w-1.5 h-1.5 rounded-full ${reqs.lowercase ? "bg-blue-400" : "bg-muted"}`}
                                            ></span>
                                            One lowercase letter
                                        </li>
                                        <li
                                            className={`text-xs flex items-center gap-2 transition-colors ${reqs.number ? "text-blue-400 font-medium" : "text-muted-foreground/70"}`}
                                        >
                                            <span
                                                className={`w-1.5 h-1.5 rounded-full ${reqs.number ? "bg-blue-400" : "bg-muted"}`}
                                            ></span>
                                            One number
                                        </li>
                                        <li
                                            className={`text-xs flex items-center gap-2 transition-colors ${reqs.special ? "text-blue-400 font-medium" : "text-muted-foreground/70"}`}
                                        >
                                            <span
                                                className={`w-1.5 h-1.5 rounded-full ${reqs.special ? "bg-blue-400" : "bg-muted"}`}
                                            ></span>
                                            One special character
                                        </li>
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                    <>
                        <div className='w-full flex flex-col @[25rem]:flex-row gap-2'>
                                <div className='flex flex-col gap-1 font-semibold text-sm text-muted-foreground/70 mt-2 flex-1'>
                                    Access Flags
                                    {[
                                        "view_appointments",
                                        "transactions",
                                        ...availableFlags,
                                    ].map((flag) => (
                                        <label
                                            key={flag}
                                            className='flex flex-row gap-2 font-semibold text-foreground capitalize'
                                        >
                                            <input
                                                type='checkbox'
                                                checked={
                                                    localUser.access_flags
                                                        ? localUser.access_flags.includes(
                                                              flag
                                                          )
                                                        : false
                                                }
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setLocalUser({
                                                            ...localUser,
                                                            access_flags: [
                                                                ...(localUser.access_flags ??
                                                                    []),
                                                                flag,
                                                            ],
                                                        })
                                                    } else {
                                                        setLocalUser({
                                                            ...localUser,
                                                            access_flags:
                                                                localUser.access_flags?.filter(
                                                                    (f) =>
                                                                        f !==
                                                                        flag
                                                                ),
                                                        })
                                                    }
                                                }}
                                            />
                                            {flag.replace("_", " ")}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            {/* Capabilities for Admins (Hybrid Roles) */}
                            {localUser.role === "admin" && (
                                <div className='w-full flex flex-col gap-2 mt-2'>
                                    <div className='flex flex-col gap-1 font-semibold text-sm text-muted-foreground/70 flex-1'>
                                        Capabilities (for Admins)
                                        {["artist", "piercing", "shoe"].map(
                                            (flag) => (
                                                <label
                                                    key={flag}
                                                    className='flex flex-row gap-2 font-semibold text-foreground capitalize'
                                                >
                                                    <input
                                                        type='checkbox'
                                                        checked={
                                                            localUser.access_flags
                                                                ? localUser.access_flags.includes(
                                                                      flag
                                                                  )
                                                                : false
                                                        }
                                                        onChange={(e) => {
                                                            if (
                                                                e.target.checked
                                                            ) {
                                                                setLocalUser({
                                                                    ...localUser,
                                                                    access_flags:
                                                                        [
                                                                            ...(localUser.access_flags ??
                                                                                []),
                                                                            flag,
                                                                        ],
                                                                })
                                                            } else {
                                                                setLocalUser({
                                                                    ...localUser,
                                                                    access_flags:
                                                                        localUser.access_flags?.filter(
                                                                            (
                                                                                f
                                                                            ) =>
                                                                                f !==
                                                                                flag
                                                                        ),
                                                                })
                                                            }
                                                        }}
                                                    />
                                                    {flag.replace("_", " ")}
                                                </label>
                                            )
                                        )}
                                    </div>
                                </div>
                            )}
                            {/* Payroll Settings */}
                            <div className='w-full flex flex-col @[25rem]:flex-row gap-4 mt-4 pt-4 border-t border-border'>
                                {(localUser.role === "artist" || (localUser.role === "admin" && localUser.access_flags?.includes("artist"))) && (
                                    <label className='flex flex-col gap-1 font-semibold text-sm text-muted-foreground/70 flex-1'>
                                        Rate Level
                                        <select
                                            value={
                                                localUser.rate_level_id || ""
                                            }
                                            onChange={(e) => {
                                                setLocalUser({
                                                    ...localUser,
                                                    rate_level_id: e.target
                                                        .value || undefined,
                                                })
                                            }}
                                            className='bg-muted border-2 border-border rounded-lg px-2 py-1 text-foreground font-normal cursor-pointer transition-colors hover:bg-muted'
                                        >
                                            <option value=''>Select Rate Level</option>
                                            {rateLevels.map((level) => (
                                                <option key={level.id} value={level.id}>
                                                    {level.name}
                                                </option>
                                            ))}
                                        </select>
                                        {shouldHaveRateLevel(localUser) && !localUser.rate_level_id && (
                                            <p className='text-yellow-400 text-xs mt-1'>
                                                Warning: This user has no rate level assigned. Commission calculations will fail.
                                            </p>
                                        )}
                                    </label>
                                )}
                                <label className='flex flex-col gap-1 font-semibold text-sm text-muted-foreground/70 flex-1'>
                                    Payout Period
                                    <select
                                        value={
                                            localUser.payout_period || "DAILY"
                                        }
                                        onChange={(e) => {
                                            setLocalUser({
                                                ...localUser,
                                                payout_period: e.target
                                                    .value as PayoutPeriodType,
                                            })
                                        }}
                                        className='bg-muted border-2 border-border rounded-lg px-2 py-1 text-foreground font-normal cursor-pointer transition-colors hover:bg-muted'
                                    >
                                        <option value='DAILY'>Daily</option>
                                        <option value='WEEKLY'>Weekly</option>
                                        <option value='BIMONTHLY'>
                                            Bi-monthly
                                        </option>
                                        <option value='MONTHLY'>Monthly</option>
                                    </select>
                                </label>
                            </div>
                        </>
                    <div className='flex justify-end'>
                        <button
                            title='Save Changes'
                            type='button'
                            className='bg-card rounded-md mt-4 cursor-pointer transition-colors not-disabled:hover:bg-muted not-disabled:active:bg-muted disabled:bg-muted border-2 disabled:cursor-not-allowed border-border px-4 w-max'
                            disabled={editStatus !== "Save"}
                            onClick={handleSave}
                        >
                            {editStatus}
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
