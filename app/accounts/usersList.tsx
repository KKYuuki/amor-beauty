"use client"

import { NotificationContext } from "@/components/notifications"
import { SideBarContext } from "@/components/sidebar"
import { UserProfile, UserRoleType } from "@/utils/types/auth"
import { AnimatePresence } from "motion/react"
import { useRouter } from "next/navigation"
import {
    RefObject,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react"
import { getInactiveProfiles, getProfiles } from "@/server/actions/profile"
import DeleteUserModal from "@/components/accounts/DeleteUserModal"
import RestoreUserModal from "@/components/accounts/RestoreUserModal"
import CreateUserModal from "@/components/accounts/CreateUserModal"
import InviteUserModal from "@/components/accounts/InviteUserModal"
import UserFilters from "@/components/accounts/UserFilters"
import UserTable from "@/components/accounts/UserTable"

export default function UsersList({
    headerRef,
}: {
    headerRef: RefObject<HTMLDivElement | null>
}) {
    // Refs
    const filtersRef = useRef<HTMLDivElement>(null)

    // Router
    const router = useRouter()

    // Context
    const { addNotification } = useContext(NotificationContext)
    const { userInfo } = useContext(SideBarContext)

    // States
    // -- Filters
    const [userType, setUserType] = useState<UserRoleType | "">("")
    const [search, setSearch] = useState("")
    const [showInactive, setShowInactive] = useState(false)
    // -- Users
    const [users, setUsers] = useState<UserProfile[]>([])
    const [inactiveUsers, setInactiveUsers] = useState<UserProfile[]>([])
    // -- Modals
    const [deleteUser, setDeleteUser] = useState<UserProfile | null>(null)
    const [restoreUser, setRestoreUser] = useState<UserProfile | null>(null)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [showInviteModal, setShowInviteModal] = useState(false)

    // Derived State
    const filteredUsers = useMemo(() => {
        let result = showInactive ? inactiveUsers : users

        // Filter Search
        if (search) {
            const lowerSearch = search.toLowerCase()
            result = result.filter(
                (user) =>
                    user.full_name.toLowerCase().includes(lowerSearch) ||
                    user.email.toLowerCase().includes(lowerSearch) ||
                    user.id === search
            )
        }

        // Filter Role
        if (userType) {
            result = result.filter((user) => user.role === userType)
        }

        return result
    }, [users, inactiveUsers, showInactive, search, userType])

    // -- Fetch
    const fetchUsers = useCallback(async () => {
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
        }
    }, [addNotification])

    const fetchInactiveUsers = useCallback(async () => {
        try {
            const res = await getInactiveProfiles()
            if (res) {
                setInactiveUsers(
                    res.sort(
                        (a, b) =>
                            new Date(b.created_at).getTime() -
                            new Date(a.created_at).getTime()
                    )
                )
            } else {
                addNotification("Failed to load inactive users", "ERROR")
            }
        } catch (_error) {
            addNotification("Failed to load inactive users", "ERROR")
        }
    }, [addNotification])

    // Effects
    useEffect(() => {
        fetchUsers()
        fetchInactiveUsers()
    }, [fetchUsers, fetchInactiveUsers])

    return (
        <>
            {/* Filters */}
            <UserFilters
                containerRef={filtersRef}
                userType={userType}
                setUserType={setUserType}
                search={search}
                setSearch={setSearch}
                showInactive={showInactive}
                setShowInactive={setShowInactive}
                activeCount={users.length}
                inactiveCount={inactiveUsers.length}
                isAdmin={userInfo.role === "admin"}
                onCreateUser={() => setShowCreateModal(true)}
                onInviteUser={() => setShowInviteModal(true)}
            />

            {/* Modals */}
            <AnimatePresence>
                {deleteUser && (
                    <DeleteUserModal
                        user={deleteUser}
                        currentUser={userInfo}
                        onClose={() => setDeleteUser(null)}
                        onSuccess={() => {
                            setDeleteUser(null)
                            fetchUsers()
                            fetchInactiveUsers()
                        }}
                    />
                )}
                {restoreUser && (
                    <RestoreUserModal
                        user={restoreUser}
                        currentUser={userInfo}
                        onClose={() => setRestoreUser(null)}
                        onSuccess={() => {
                            setRestoreUser(null)
                            fetchUsers()
                        }}
                    />
                )}
                {showCreateModal && (
                    <CreateUserModal
                        onClose={() => setShowCreateModal(false)}
                        onSuccess={() => {
                            setShowCreateModal(false)
                            fetchUsers()
                        }}
                    />
                )}
                {showInviteModal && (
                    <InviteUserModal
                        onClose={() => setShowInviteModal(false)}
                        onSuccess={() => {
                            setShowInviteModal(false)
                            fetchUsers()
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Content */}
            <UserTable
                users={filteredUsers}
                showInactive={showInactive}
                isAdmin={userInfo.role === "admin"}
                onEdit={(user) => router.push(`/accounts/${user.id}`)}
                onDelete={setDeleteUser}
                onRestore={setRestoreUser}
                heightOffset={
                    (headerRef.current?.offsetHeight ?? 0) +
                    (filtersRef.current?.offsetHeight ?? 0)
                }
            />
        </>
    )
}
