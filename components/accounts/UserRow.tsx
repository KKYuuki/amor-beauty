"use client"

import { UserProfile } from "@/utils/types/auth"
import { hasWorkCapability } from "@/utils/auth/user-capabilities"
import AdminActionGuard from "@/components/admin/AdminActionGuard"
import {
    EditIcon,
    RotateCcwIcon,
    Trash2Icon,
    UserRoundIcon,
    MoreVerticalIcon,
    BanknoteIcon,
} from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import Image from "next/image"
import Link from "next/link"
import { memo, useState, useRef, useEffect } from "react"

interface UserRowProps {
    user: UserProfile
    showInactive: boolean
    isAdmin: boolean
    onEdit: (user: UserProfile) => void
    onDelete: (user: UserProfile) => void
    onRestore: (user: UserProfile) => void
}

function UserRow({
    user,
    showInactive,
    isAdmin,
    onEdit,
    onDelete,
    onRestore,
}: UserRowProps) {
    const { id, full_name, avatar_url, email, role } = user
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsDropdownOpen(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleAction = (action: "edit" | "delete" | "restore") => {
        setIsDropdownOpen(false)
        switch (action) {
            case "edit":
                onEdit(user)
                break
            case "delete":
                onDelete(user)
                break
            case "restore":
                onRestore(user)
                break
        }
    }

    return (
        <motion.tr
            className='hover:bg-white/5 transition-colors text-nowrap'
            key={id}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <td className='px-3 py-1 text-sm font-medium w-max capitalize'>
                <div
                    className={`border-2 border-white/10 px-2 capitalize rounded-lg cursor-pointer w-max ${
                        role === "admin" && "bg-orange-400/20"
                    }
                                                            ${
                                                                role ===
                                                                    "staff" &&
                                                                "bg-blue-400/20"
                                                            }
                                                            ${
                                                                role ===
                                                                    "artist" &&
                                                                "bg-indigo-400/20"
                                                            }
                                                            ${
                                                                role ===
                                                                    "piercer" &&
                                                                "bg-violet-400/20"
                                                            }
                                                            ${
                                                                role ===
                                                                    "shoe_tech" &&
                                                                "bg-cyan-400/20"
                                                            }`}
                >
                    {role.replace("_", " ")}
                </div>
            </td>
            <td className='px-3 py-1 text-sm font-medium h-10 w-max flex flex-row gap-2 items-center'>
                <div
                    className={`aspect-square rounded-full w-6 h-6 flex items-center justify-center cursor-pointer bg-white/10 hover:bg-white/30 transition-colors overflow-clip ${
                        avatar_url ? "p-0" : "p-1"
                    }`}
                    draggable={false}
                >
                    {avatar_url ? (
                        <Image
                            src={avatar_url}
                            alt='avatar'
                            width={300}
                            height={300}
                            className='rounded-full w-full h-full object-cover object-center'
                            unoptimized
                        />
                    ) : (
                        <UserRoundIcon
                            size={14}
                            className='stroke-1'
                        />
                    )}
                </div>
                {full_name}
            </td>
            <td className='px-3 py-1 text-sm font-medium w-max'>
                <a
                    href={`mailto:${email}`}
                    title={`send an email to ${full_name}`}
                    className='hover:underline hover:text-white/60 transition-colors'
                >
                    {email}
                </a>
            </td>
            <td className='px-3 py-1 text-sm font-medium w-max'>
                {hasWorkCapability(user) ? (
                    user.rate_level_name || user.rate_level_id ? (
                        <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                user.rate_level_name === "Owner"
                                    ? "bg-purple-500/30 text-purple-300"
                                    : user.rate_level_name === "Senior"
                                      ? "bg-blue-500/30 text-blue-300"
                                      : "bg-green-500/30 text-green-300"
                            }`}
                        >
                            {user.rate_level_name || "Standard"}
                        </span>
                    ) : (
                        <span className='px-2 py-0.5 rounded text-xs font-semibold bg-gray-500/30 text-gray-400'>
                            NONE
                        </span>
                    )
                ) : (
                    <span className='text-white/30'>—</span>
                )}
            </td>
            <td className='px-3 py-1 text-sm font-medium w-max'>
                {user.payout_period ? (
                    <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            user.payout_period === "DAILY"
                                ? "bg-yellow-500/30 text-yellow-300"
                                : user.payout_period === "WEEKLY"
                                  ? "bg-orange-500/30 text-orange-300"
                                  : user.payout_period === "BIMONTHLY"
                                    ? "bg-pink-500/30 text-pink-300"
                                    : "bg-teal-500/30 text-teal-300"
                        }`}
                    >
                        {user.payout_period}
                    </span>
                ) : (
                    <span className='text-white/30'>—</span>
                )}
            </td>
            <td className='px-3 py-2 w-max'>
                {showInactive ? (
                    <AdminActionGuard onAction={() => onRestore(user)}>
                        <button
                            type='button'
                            title='Restore User'
                            className='p-1 flex items-center justify-center rounded-md bg-transparent cursor-pointer transition-colors hover:bg-green-400/60'
                        >
                            <RotateCcwIcon size={16} />
                        </button>
                    </AdminActionGuard>
                ) : (
                    <div className="relative" ref={dropdownRef}>
                        <button
                            type='button'
                            title='Actions'
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className='p-1 flex items-center justify-center rounded-md bg-transparent cursor-pointer transition-colors hover:bg-white/10'
                        >
                            <MoreVerticalIcon size={16} />
                        </button>

                        <AnimatePresence>
                            {isDropdownOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                    transition={{ duration: 0.1 }}
                                    className="absolute right-0 top-full mt-1 w-40 bg-zinc-900 rounded-lg shadow-xl border border-white/10 z-50 overflow-hidden"
                                >
                                    <div className="py-1">
                                        <Link
                                            href={`/payroll?staffId=${user.id}`}
                                            className="w-full px-4 py-2 text-left text-sm hover:bg-white/5 transition-colors flex items-center gap-2"
                                            onClick={() => setIsDropdownOpen(false)}
                                        >
                                            <BanknoteIcon size={16} className="text-yellow-400" />
                                            Payroll
                                        </Link>
                                        <div className="border-t border-white/10 my-1"></div>
                                        <button
                                            type='button'
                                            className="w-full px-4 py-2 text-left text-sm hover:bg-white/5 transition-colors flex items-center gap-2"
                                            onClick={() => handleAction("edit")}
                                        >
                                            <EditIcon size={16} className="text-blue-400" />
                                            Manage
                                        </button>
                                        {isAdmin && (
                                            <>
                                                <div className="border-t border-white/10 my-1"></div>
                                                <AdminActionGuard
                                                    onAction={() =>
                                                        handleAction("delete")
                                                    }
                                                >
                                                    <button
                                                        type='button'
                                                        className='w-full px-4 py-2 text-left text-sm hover:bg-white/5 transition-colors flex items-center gap-2 text-red-400'
                                                    >
                                                        <Trash2Icon size={16} />
                                                        Deactivate
                                                    </button>
                                                </AdminActionGuard>
                                            </>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </td>
        </motion.tr>
    )
}

export default memo(UserRow)
