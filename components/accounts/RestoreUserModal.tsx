"use client"

import { restoreProfile } from "@/server/actions/profile"
import { NotificationContext } from "@/components/notifications"
import { UserProfile } from "@/utils/types/auth"
import { motion } from "motion/react"
import { useContext } from "react"

interface RestoreUserModalProps {
    user: UserProfile
    currentUser: UserProfile
    onClose: () => void
    onSuccess: () => void
}

export default function RestoreUserModal({
    user,
    currentUser,
    onClose,
    onSuccess,
}: RestoreUserModalProps) {
    const { addNotification } = useContext(NotificationContext)

    const handleRestoreUser = async () => {
        const res = await restoreProfile(user.id, currentUser.id)
        if (!res) {
            addNotification(
                "Please try again later",
                "ERROR",
                "Error Restoring User"
            )
            onClose()
            return
        }
        addNotification("User has been successfully restored", "SUCCESS")
        onSuccess()
    }

    return (
        <motion.div
            key='restore-modal'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='fixed top-1/2 left-1/2 -translate-1/2 bg-black/90 border-2 border-white/10 rounded-3xl px-4 py-5 flex flex-col w-max max-w-[calc(100%-1rem)] z-10 items-center'
        >
            <div className='font-bold'>Restore User</div>
            <p className='font-medium text-sm mt-2'>
                Are you sure you want to{" "}
                <span className='text-green-400'>restore</span>
            </p>
            <p className='font-extrabold'>{user.full_name}</p>
            <p className='font-medium text-sm mb-2'>to the system?</p>
            <div className='w-full grid grid-cols-2 gap-2'>
                <button
                    title='Cancel'
                    type='button'
                    className='bg-red-400/20 px-2 py-1 font-semibold border-2 border-white/10 rounded-lg cursor-pointer transition-colors hover:bg-red-400/30 active:hover:bg-red-400/40'
                    onClick={onClose}
                >
                    Cancel
                </button>
                <button
                    title='Confirm Restore'
                    type='button'
                    className='bg-green-400/20 px-2 py-1 font-semibold border-2 border-white/10 rounded-lg cursor-pointer transition-colors hover:bg-green-400/30 active:hover:bg-green-400/40 text-nowrap'
                    onClick={handleRestoreUser}
                >
                    Confirm Restore
                </button>
            </div>
        </motion.div>
    )
}
