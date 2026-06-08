"use client"

import { UserRoleType } from "@/utils/types/auth"
import AdminActionGuard from "@/components/admin/AdminActionGuard"
import { RotateCcwIcon, SearchIcon, UserPlusIcon, MailPlusIcon } from "lucide-react"
import { RefObject } from "react"

interface UserFiltersProps {
    // Refs
    containerRef: RefObject<HTMLDivElement | null>
    // State
    userType: UserRoleType | ""
    setUserType: (type: UserRoleType | "") => void
    search: string
    setSearch: (search: string) => void
    showInactive: boolean
    setShowInactive: (show: boolean) => void
    // Data
    activeCount: number
    inactiveCount: number
    isAdmin: boolean
    // Actions
    onCreateUser?: () => void
    onInviteUser?: () => void
}

export default function UserFilters({
    containerRef,
    userType,
    setUserType,
    search,
    setSearch,
    showInactive,
    setShowInactive,
    activeCount,
    inactiveCount,
    isAdmin,
    onCreateUser,
    onInviteUser,
}: UserFiltersProps) {
    return (
        <div
            ref={containerRef}
            className='w-full flex flex-col gap-4'
        >
            {/* Header Row with Title and Action Buttons */}
            <div className='flex flex-row gap-4 items-center justify-between flex-wrap'>
                {/* User Count */}
                <span className='text-xl font-semibold flex flex-row gap-2 items-center select-none'>
                    {showInactive ? "Deleted Users" : "Users"}{" "}
                    <div className='h-6 w-[1px] bg-border' />
                    {showInactive ? inactiveCount : activeCount}
                </span>

                {/* Action Buttons - Only show when viewing active users and user is admin */}
                {!showInactive && isAdmin && (
                    <div className='flex flex-row gap-2'>
                        <AdminActionGuard
                            onAction={() =>
                                onInviteUser && onInviteUser()
                            }
                        >
                            <button
                                type='button'
                                className='flex flex-row gap-2 items-center px-3 py-1.5 font-semibold bg-blue-400/20 border-2 border-blue-400/30 rounded-lg transition-colors cursor-pointer hover:bg-blue-400/30'
                                title='Invite User via Email'
                            >
                                <MailPlusIcon size={16} />
                                <span className='hidden sm:inline'>
                                    Invite User
                                </span>
                            </button>
                        </AdminActionGuard>
                        <AdminActionGuard
                            onAction={() =>
                                onCreateUser && onCreateUser()
                            }
                        >
                            <button
                                type='button'
                                className='flex flex-row gap-2 items-center px-3 py-1.5 font-semibold bg-green-400/20 border-2 border-green-400/30 rounded-lg transition-colors cursor-pointer hover:bg-green-400/30'
                                title='Create User Manually'
                            >
                                <UserPlusIcon size={16} />
                                <span className='hidden sm:inline'>
                                    Create User
                                </span>
                            </button>
                        </AdminActionGuard>
                    </div>
                )}
            </div>

            {/* Search and Filters */}
            <div className='flex flex-row gap-4 flex-wrap w-full items-center justify-end'>
                <select
                    title='Filter Users by Role'
                    className='min-w-max px-2 py-1 bg-muted border-2 border-border rounded-md hover:bg-muted transition-colors cursor-pointer font-medium flex-1 md:flex-none'
                    value={userType}
                    onChange={(e) =>
                        setUserType(e.target.value as UserRoleType | "")
                    }
                >
                    <option value=''>All</option>
                    <option value='admin'>Admin</option>
                    <option value='manager'>Manager</option>
                    <option value='staff'>Staff</option>
                    <option value='artist'>Artist</option>
                    <option value='piercer'>Piercer</option>
                    <option value='shoe_tech'>Shoe Tech</option>
                    <option value='client'>Client</option>
                </select>
                {isAdmin && inactiveCount > 0 && (
                    <button
                        type='button'
                        title={
                            showInactive
                                ? "Show Active Users"
                                : "Show Deleted Users"
                        }
                        className={`flex flex-row gap-2 items-center px-2 py-1 font-semibold border-2 border-border rounded-md transition-colors cursor-pointer flex-1 md:flex-none ${
                            showInactive
                                ? "bg-amber-400/20 hover:bg-amber-400/30"
                                : "bg-muted hover:bg-muted"
                        }`}
                        onClick={() => setShowInactive(!showInactive)}
                    >
                        <RotateCcwIcon size={16} />
                        {showInactive
                            ? `Active (${activeCount})`
                            : `Deleted (${inactiveCount})`}
                    </button>
                )}
                <label
                    title='Search Users (Full Name, Email, or User ID)'
                    className='flex flex-row gap-2 items-center px-2 py-1 font-semibold bg-muted border-2 border-border rounded-md hover:bg-muted transition-colors cursor-pointer flex-1 md:flex-none'
                >
                    <SearchIcon size={16} />
                    <input
                        type='text'
                        placeholder='Search'
                        className='bg-transparent outline-none'
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </label>
            </div>
        </div>
    )
}
