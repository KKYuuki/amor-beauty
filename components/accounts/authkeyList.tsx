"use client"
import { AuthKeys, UserRoleType } from "@/utils/types/auth"
import { env } from "@/utils/env"
import { LinkIcon, MailIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import {
    RefObject,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react"
import {
    createAuthKeys,
    deleteAuthKeys,
    getAuthKeys,
} from "@/server/actions/profile"
import { SideBarContext } from "@/components/sidebar"
import { NotificationContext } from "@/components/notifications"
import useOutsideClick from "@/utils/useOutsideClick"
import { sendInviteEmail } from "@/server/actions/email"

export default function AuthkeysList({
    headerRef,
}: {
    headerRef: RefObject<HTMLDivElement | null>
}) {
    // Refs
    const filtersRef = useRef<HTMLDivElement>(null)
    const deleteModal = useRef<HTMLDivElement>(null)
    const newModalRef = useRef<HTMLDivElement>(null)
    const sendInvModal = useRef<HTMLDivElement>(null)

    // Context
    const { userInfo } = useContext(SideBarContext)
    const { addNotification } = useContext(NotificationContext)

    // Constants

    // States
    // -- Filters
    const [filter, setFilter] = useState<"pass" | "user_role" | "">("")

    // -- Authkeys
    const [authkeys, setAuthkeys] = useState<AuthKeys[]>([])
    const [selectedDelete, setSelectedDelete] = useState<AuthKeys | null>(null)

    // -- New
    const [newModal, setNewModal] = useState(false)
    const [newKey, setNewKey] = useState("")
    const [keyType, setKeyType] = useState<"pass" | "user_role">("pass")
    const [newStatus, setNewStatus] = useState("Create")

    // -- Send Invitation
    const [email, setEmail] = useState("")
    const [invKey, setInvKey] = useState<AuthKeys | null>(null)
    const [invStatus, setInvStatus] = useState("Send")

    // Handlers
    // -- Outside Clicks
    const removeDeleteModal = useOutsideClick(
        deleteModal,
        () => setSelectedDelete(null),
        selectedDelete ? true : false
    )
    const closeDelete = useCallback(() => {
        removeDeleteModal()
        setSelectedDelete(null)
    }, [removeDeleteModal, setSelectedDelete])

    const removeNewModal = useOutsideClick(
        newModalRef,
        () => setNewModal(false),
        newModal ? true : false
    )
    const closeNewModal = useCallback(() => {
        removeNewModal()
        setNewModal(false)
        setNewKey("")
    }, [removeNewModal, setNewModal, setNewKey])

    const removeSendInvModal = useOutsideClick(
        sendInvModal,
        () => setInvKey(null),
        invKey ? true : false
    )
    const closeSendInvModal = useCallback(() => {
        removeSendInvModal()
        setInvKey(null)
        setEmail("")
    }, [removeSendInvModal, setInvKey])

    // -- Fetch
    const fetchAuthkeys = useCallback(async () => {
        const res = await getAuthKeys()
        if (res)
            setAuthkeys(
                res.sort(
                    (a, b) =>
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime()
                )
            )
    }, [setAuthkeys])

    // -- POST
    const handleDelete = useCallback(async () => {
        if (selectedDelete) {
            const res = await deleteAuthKeys(selectedDelete.id)
            if (!res) {
                addNotification("Error deleting auth key", "ERROR")
                closeDelete()
                return
            }
            addNotification(
                "Auth key has been successfully deleted",
                "SUCCESS",
                "Auth Key Deleted"
            )
            await fetchAuthkeys()
            closeDelete()
        }
    }, [selectedDelete, addNotification, closeDelete, fetchAuthkeys])

    const handleSendInvitation = useCallback(async () => {
        if (invKey && email) {
            setInvStatus("Sending...")
            const res = await sendInviteEmail(email, invKey.id)
            if (!res) {
                addNotification("Error sending invitation", "ERROR")
                closeSendInvModal()
                setInvStatus("Send")
                return
            }
            addNotification(
                "Invitation has been successfully sent",
                "SUCCESS",
                "Invitation Sent"
            )
            setInvStatus("Send")
            closeSendInvModal()
        }
    }, [invKey, email, addNotification, closeSendInvModal])

    const handleCreateAuthKey = useCallback(async () => {
        if (newKey) {
            setNewStatus("Creating...")
            if (keyType === "pass") {
                // Password Reset
                const res = await createAuthKeys(newKey, undefined)
                if (!res) {
                    addNotification("Error creating password reset", "ERROR")
                    setNewStatus("Create")
                    closeNewModal()
                    return
                }
            } else {
                // Create User w/ type
                const res = await createAuthKeys(
                    undefined,
                    newKey as UserRoleType
                )
                if (!res) {
                    addNotification("Error creating auth key", "ERROR")
                    setNewStatus("Create")
                    closeNewModal()
                    return
                }
            }
            addNotification(
                "Auth key has been successfully created",
                "SUCCESS",
                "Auth Key Created"
            )
            await fetchAuthkeys()
            setNewStatus("Create")
            closeNewModal()
        }
    }, [
        newKey,
        keyType,
        addNotification,
        closeNewModal,
        fetchAuthkeys,
        setNewStatus,
    ])

    // Effects
    useEffect(() => {
        fetchAuthkeys()
    }, [fetchAuthkeys])

    useEffect(() => {
        setNewKey("")
    }, [keyType])

    return (
        <>
            {/* Filters */}
            <div
                ref={filtersRef}
                className='w-full flex flex-row gap-4 items-center justify-between flex-wrap'
            >
                {/* User Count */}
                <span className='text-xl font-semibold flex flex-row gap-2 items-center select-none'>
                    Auth Keys <div className='h-6 w-[1px] bg-white/40' />
                    {authkeys ? authkeys.length : 0}
                </span>
                <div className='flex flex-row gap-4 flex-wrap w-max'>
                    <select
                        title='Filter Auth Keys by type'
                        className='min-w-max px-4 py-1 bg-white/5 border-2 border-white/10 rounded-md hover:bg-white/20 transition-colors cursor-pointer font-medium flex-1 md:flex-none'
                        value={filter}
                        onChange={(e) =>
                            setFilter(
                                e.target.value as "pass" | "user_role" | ""
                            )
                        }
                    >
                        <option value=''>All</option>
                        <option value='pass'>Password Reset</option>
                        <option value='user_role'>Set Roles</option>
                    </select>
                    <button
                        type='button'
                        title='Create new key'
                        className='flex flex-row gap-2 font-semibold items-center bg-white/5 border-2 border-white/10 px-2 py-1 rounded-md cursor-pointer transition-colors hover:bg-white/20 active:hover:bg-white/30 flex-1 md:flex-none'
                        onClick={() => setNewModal(true)}
                    >
                        <PlusIcon size={16} /> New Key
                    </button>
                </div>
            </div>
            {/* Modals */}
            <AnimatePresence>
                {newModal && (
                    <motion.div
                        ref={newModalRef}
                        key='edit-modal'
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className='fixed top-1/2 left-1/2 -translate-1/2 bg-black/90 border-2 border-white/10 rounded-3xl px-4 py-5 flex flex-col gap-2 w-lg max-w-[calc(100%-1rem)] z-10'
                    >
                        <div className='flex flex-row gap-4 items-top justify-between font-bold'>
                            Create Auth Key
                            <button
                                title='Close'
                                type='button'
                                className='p-1 transition-colors rounded-md bg-transparent hover:bg-white/10 cursor-pointer'
                                onClick={() => closeNewModal()}
                            >
                                <XIcon size={18} />
                            </button>
                        </div>
                        <label className='flex flex-col gap-1 font-semibold text-sm text-white/40 mt-2'>
                            Auth Key Type
                            <select
                                value={keyType}
                                onChange={(e) =>
                                    setKeyType(
                                        e.target.value as "pass" | "user_role"
                                    )
                                }
                                className='bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1 text-white font-normal cursor-pointer transition-colors hover:bg-white/10'
                            >
                                <option value='pass'>Password Reset</option>
                                <option value='user_role'>User Role</option>
                            </select>
                        </label>
                        {keyType === "pass" && (
                            <label className='flex flex-col gap-1 font-semibold text-sm text-white/40 mt-2'>
                                Email
                                <input
                                    type='email'
                                    placeholder='email of user (non-existant emails will fail)'
                                    value={newKey}
                                    onChange={(e) => setNewKey(e.target.value)}
                                    className='bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1 text-white font-normal cursor-pointer transition-colors hover:bg-white/10'
                                />
                            </label>
                        )}
                        {keyType === "user_role" && (
                            <label className='flex flex-col gap-1 font-semibold text-sm text-white/40 mt-2'>
                                Role
                                <select
                                    value={newKey}
                                    onChange={(e) => {
                                        if (
                                            userInfo.role !== "admin" &&
                                            e.target.value === "ADMIN"
                                        ) {
                                            addNotification(
                                                "You can't change the role if you are not an admin",
                                                "ERROR"
                                            )
                                            return
                                        }
                                        setNewKey(e.target.value)
                                    }}
                                    className='bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1 text-white font-normal cursor-pointer transition-colors hover:bg-white/10'
                                >
                                    <option
                                        value=''
                                        defaultChecked
                                        disabled
                                    >
                                        Select Role
                                    </option>
                                    <option value='ADMIN'>Admin</option>
                                    <option value='STAFF'>Staff</option>
                                    <option value='ARTIST'>Artist</option>
                                    <option value='PIERCER'>Piercer</option>
                                    <option value='SHOE_TECH'>Shoe Tech</option>
                                    <option value='CLIENT'>Client</option>
                                </select>
                            </label>
                        )}
                        <div className='flex justify-end'>
                            <button
                                title='Save Changes'
                                type='button'
                                className='bg-white/10 rounded-md mt-4 cursor-pointer transition-colors not-disabled:hover:bg-white/20 not-disabled:active:hover:bg-white/30 disabled:bg-white/5 disabled:cursor-not-allowed border-2 border-white/5 px-4 w-max'
                                disabled={newStatus !== "Create"}
                                onClick={() => {
                                    if (newKey === "") {
                                        addNotification(
                                            "Input is empty",
                                            "WARNING"
                                        )
                                        return
                                    }
                                    handleCreateAuthKey()
                                }}
                            >
                                {newStatus}
                            </button>
                        </div>
                    </motion.div>
                )}
                {selectedDelete && (
                    <motion.div
                        ref={deleteModal}
                        key='delete-modal'
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className='fixed top-1/2 left-1/2 -translate-1/2 bg-black/90 border-2 border-white/10 rounded-3xl px-4 py-5 flex flex-col w-max max-w-[calc(100%-1rem)] z-10 items-center'
                    >
                        <div className='font-bold'>Delete Auth Key</div>
                        <p className='font-medium text-sm my-2'>
                            Are you sure you want to{" "}
                            <span className='text-red-400'>delete</span> the key
                            from the system?
                        </p>
                        <div className='w-full grid grid-cols-2 gap-2'>
                            <button
                                title='Cancel'
                                type='button'
                                className='bg-green-400/20 px-2 py-1 font-semibold border-2 border-white/10 rounded-lg cursor-pointer transition-colors hover:bg-green-400/30 active:hover:bg-green-400/40'
                                onClick={() => closeDelete()}
                            >
                                Cancel
                            </button>
                            <button
                                title='Are you sure?'
                                type='button'
                                className='bg-red-400/20 px-2 py-1 font-semibold border-2 border-white/10 rounded-lg cursor-pointer transition-colors hover:bg-red-400/30 active:hover:bg-red-400/40 text-nowrap'
                                onClick={() => handleDelete()}
                            >
                                Confirm Delete
                            </button>
                        </div>
                    </motion.div>
                )}
                {invKey && (
                    <motion.div
                        ref={sendInvModal}
                        key='invite-modal'
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className='fixed top-1/2 left-1/2 -translate-1/2 bg-black/90 border-2 border-white/10 rounded-3xl px-4 py-5 flex flex-col gap-2 w-lg max-w-[calc(100%-1rem)] z-10'
                    >
                        <div className='flex flex-row gap-4 items-top justify-between font-bold'>
                            Send Invitation
                            <button
                                title='Close'
                                type='button'
                                className='p-1 transition-colors rounded-md bg-transparent hover:bg-white/10 cursor-pointer'
                                onClick={() => closeSendInvModal()}
                            >
                                <XIcon size={18} />
                            </button>
                        </div>
                        <label className='flex flex-col gap-1 font-semibold text-sm text-white/40 mt-2'>
                            Email
                            <input
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                type='email'
                                className='bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1 text-white font-normal cursor-pointer transition-colors hover:bg-white/10'
                            />
                        </label>
                        <div className='flex justify-end'>
                            <button
                                title='Send Invitation'
                                type='button'
                                className='bg-white/10 rounded-md mt-4 cursor-pointer transition-colors not-disabled:hover:bg-white/20 not-disabled:active:hover:bg-white/30 disabled:bg-white/5 disabled:cursor-not-allowed border-2 border-white/5 px-4 w-max'
                                disabled={invStatus !== "Send"}
                                onClick={() => {
                                    if (email === "") {
                                        addNotification(
                                            "Input is empty",
                                            "WARNING"
                                        )
                                        return
                                    }
                                    handleSendInvitation()
                                }}
                            >
                                {invStatus}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Content */}
            <motion.div
                className='flex-1 w-full overflow-auto'
                style={{
                    maxHeight: `calc(100% - ${
                        (headerRef.current?.offsetHeight ?? 0) +
                        (filtersRef.current?.offsetHeight ?? 0)
                    }px - 1rem)`,
                }}
            >
                <motion.table
                    className={`min-w-max w-full h-max table-auto border-collapse relative`}
                >
                    <thead className='sticky top-0 bg-black/80'>
                        <tr className='text-nowrap select-none'>
                            <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase w-max border-b border-white'>
                                ID
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>
                                Type
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>
                                Email
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>
                                User Role
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>
                                Created At
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>
                                Actions
                            </th>
                        </tr>
                    </thead>
                    {/* Main Content */}
                    <motion.tbody layout>
                        <AnimatePresence
                            mode='popLayout'
                            initial={false}
                        >
                            {authkeys
                                .filter((key) => {
                                    if (filter === "pass") {
                                        return key.email
                                    } else if (filter === "user_role") {
                                        return key.user_type
                                    } else {
                                        return true
                                    }
                                })
                                .map(({ id, email, user_type, created_at }) => (
                                    <motion.tr
                                        className='hover:bg-white/5 transition-colors text-nowrap'
                                        key={id}
                                        layout
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <td className='px-3 py-1 text-sm font-medium w-max capitalize'>
                                            {id}
                                        </td>
                                        <td className='px-3 py-1 text-sm font-medium w-max capitalize'>
                                            <div
                                                className={`border-2 border-white/10 px-2 capitalize rounded-lg w-max ${email ? "bg-orange-400/20" : "bg-blue-400/20"}`}
                                            >
                                                {email
                                                    ? "Password Reset"
                                                    : "Role Registration"}
                                            </div>
                                        </td>
                                        <td className='px-3 py-1 text-sm font-medium w-max'>
                                            <a
                                                href={`mailto:${email}`}
                                                title={`send an email`}
                                                className='hover:underline hover:text-white/60 transition-colors'
                                            >
                                                {email}
                                            </a>
                                        </td>
                                        <td className='px-3 py-1 text-sm font-medium w-max capitalize'>
                                            <div
                                                className={`border-2 border-white/10 px-2 capitalize rounded-lg w-max ${
                                                    user_type === "ADMIN" &&
                                                    "bg-orange-400/20"
                                                }
                                                            ${
                                                                user_type ===
                                                                    "STAFF" &&
                                                                "bg-blue-400/20"
                                                            }
                                                            ${
                                                                user_type ===
                                                                    "CLIENT" &&
                                                                "bg-green-400/20"
                                                            }
                                                            ${
                                                                (user_type ===
                                                                    "ARTIST" ||
                                                                    user_type ===
                                                                        "PIERCER" ||
                                                                    user_type ===
                                                                        "SHOE_TECH") &&
                                                                "bg-purple-400/20"
                                                            }`}
                                            >
                                                {user_type?.toLowerCase() ?? ""}
                                            </div>
                                        </td>
                                        <td className='px-3 py-1 text-sm font-medium w-max'>
                                            {new Date(
                                                created_at as Date
                                            ).toLocaleDateString("en-US", {
                                                day: "numeric",
                                                month: "long",
                                                year: "numeric",
                                                hour: "numeric",
                                                minute: "numeric",
                                            })}
                                        </td>
                                        <td className='px-3 py-2 w-max flex flex-row gap-2 items-center justify-center'>
                                            {user_type && (
                                                <button
                                                    type='button'
                                                    title='Send Invitation Email'
                                                    className='p-1 flex items-center justify-center rounded-md bg-transparent cursor-pointer transition-colors hover:bg-blue-400/60'
                                                    onClick={() => {
                                                        setInvKey(
                                                            authkeys.find(
                                                                (key) =>
                                                                    key.id ===
                                                                    id
                                                            ) as AuthKeys
                                                        )
                                                    }}
                                                >
                                                    <MailIcon size={16} />
                                                </button>
                                            )}
                                            <button
                                                type='button'
                                                title='Get Link'
                                                className='p-1 flex items-center justify-center rounded-md bg-transparent cursor-pointer transition-colors hover:bg-green-400/60'
                                                onClick={() => {
                                                    const baseUrl = env.siteUrl
                                                    let link = ""
                                                    if (email) {
                                                        link = `${baseUrl}/auth?action=reset&key=${id}`
                                                    } else {
                                                        link = `${baseUrl}/auth?action=user_type&key=${id}`
                                                    }
                                                    navigator.clipboard.writeText(
                                                        link
                                                    )
                                                    addNotification(
                                                        "Link copied to clipboard",
                                                        "SUCCESS",
                                                        "Link Copied"
                                                    )
                                                }}
                                            >
                                                <LinkIcon size={16} />
                                            </button>
                                            {userInfo.role === "admin" && (
                                                <button
                                                    type='button'
                                                    title='Delete Key'
                                                    className='p-1 flex items-center justify-center rounded-md bg-transparent cursor-pointer transition-colors hover:bg-red-400/60'
                                                    onClick={() => {
                                                        setSelectedDelete(
                                                            authkeys.find(
                                                                (key) =>
                                                                    key.id ===
                                                                    id
                                                            ) as AuthKeys
                                                        )
                                                    }}
                                                >
                                                    <Trash2Icon size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </motion.tr>
                                ))}
                        </AnimatePresence>
                    </motion.tbody>
                </motion.table>
            </motion.div>
        </>
    )
}
