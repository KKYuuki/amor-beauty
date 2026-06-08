"use client"

import { deleteProfile } from "@/server/actions/profile"
import { NotificationContext } from "@/components/notifications"
import { UserProfile } from "@/utils/types/auth"
import { motion } from "motion/react"
import { useContext } from "react"

interface DeleteUserModalProps {
    user: UserProfile
    currentUser: UserProfile
    onClose: () => void
    onSuccess: () => void
}

export default function DeleteUserModal({
    user,
    currentUser,
    onClose,
    onSuccess,
}: DeleteUserModalProps) {
    const { addNotification } = useContext(NotificationContext)

    const handleDeleteUser = async () => {
        if (user.id === currentUser.id) {
            addNotification(
                "You cannot delete yourself",
                "ERROR",
                "Error Deleting User"
            )
            onClose()
            return
        }
        const res = await deleteProfile(user.id, currentUser.id)
        if (!res) {
            addNotification(
                "Please try again later",
                "ERROR",
                "Error Deleting User"
            )
            onClose()
            return
        }
        addNotification("User has been successfully deleted", "SUCCESS")
        onSuccess()
    }

    return (
        <motion.div
            key='delete-modal'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='fixed top-1/2 left-1/2 -translate-1/2 bg-black/90 border-2 border-border rounded-3xl px-4 py-5 flex flex-col w-max max-w-[calc(100%-1rem)] z-10 items-center'
        >
            <div className='font-bold'>Delete User</div>
            <p className='font-medium text-sm mt-2'>
                Are you sure you want to{" "}
                <span className='text-red-400'>delete</span>
            </p>
            <p className='font-extrabold'>{user.full_name}</p>
            <p className='font-medium text-sm mb-2'>from the system?</p>
            <div className='w-full grid grid-cols-2 gap-2'>
                <button
                    title='Cancel'
                    type='button'
                    className='bg-green-400/20 px-2 py-1 font-semibold border-2 border-border rounded-lg cursor-pointer transition-colors hover:bg-green-400/30 active:hover:bg-green-400/40'
                    onClick={onClose}
                >
                    Cancel
                </button>
                <button
                    title='Are you sure?'
                    type='button'
                    className='bg-red-400/20 px-2 py-1 font-semibold border-2 border-border rounded-lg cursor-pointer transition-colors hover:bg-red-400/30 active:hover:bg-red-400/40 text-nowrap'
                    onClick={handleDeleteUser}
                >
                    Confirm Delete
                </button>
            </div>
        </motion.div>
    )
}
