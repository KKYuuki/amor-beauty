"use client"

import { NotificationContext } from "@/components/notifications"
import { UserRoleType } from "@/utils/types/auth"
import { XIcon, MailIcon } from "lucide-react"
import { motion } from "motion/react"
import { useContext, useState } from "react"
import { inviteUser } from "@/server/actions/profile"

interface InviteUserModalProps {
    onClose: () => void
    onSuccess: () => void
}

export default function InviteUserModal({ onClose, onSuccess }: InviteUserModalProps) {
    const { addNotification } = useContext(NotificationContext)

    const [email, setEmail] = useState("")
    const [role, setRole] = useState<UserRoleType>("staff")
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async () => {
        if (!email || !email.includes("@")) {
            addNotification("Please enter a valid email address", "ERROR", "Invalid Email")
            return
        }

        setIsLoading(true)

        try {
            const result = await inviteUser({ email, role })
            
            if (result.success) {
                addNotification(result.message, "SUCCESS")
                onSuccess()
            } else {
                addNotification(result.message, "ERROR", "Error")
                setIsLoading(false)
            }
        } catch (_error) {
            addNotification("An error occurred while sending the invitation", "ERROR", "Error")
            setIsLoading(false)
        }
    }

    return (
        <motion.div
            key='invite-modal'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='fixed top-1/2 left-1/2 -translate-1/2 bg-black/90 border-2 border-border rounded-3xl px-4 py-5 flex flex-col gap-4 w-lg max-w-[calc(100%-1rem)] z-10'
        >
            <div className='flex flex-row gap-4 items-center justify-between font-bold'>
                <div className='flex items-center gap-2'>
                    <MailIcon size={20} className='text-blue-400' />
                    Invite User
                </div>
                <button
                    title='Close'
                    type='button'
                    className='p-1 transition-colors rounded-md bg-transparent hover:bg-muted cursor-pointer'
                    onClick={onClose}
                >
                    <XIcon size={18} />
                </button>
            </div>

            <p className='text-sm text-muted-foreground'>
                Send an invitation email to allow someone to join the system. They will receive a link to create their account.
            </p>

            <div className='flex flex-col gap-4'>
                <label className='flex flex-col gap-1 font-semibold text-sm text-muted-foreground/70'>
                    Email Address
                    <input
                        type='email'
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder='user@example.com'
                        className='bg-muted border-2 border-border rounded-lg px-2 py-1 text-foreground font-normal transition-colors hover:bg-muted'
                    />
                </label>

                <label className='flex flex-col gap-1 font-semibold text-sm text-muted-foreground/70'>
                    Role
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as UserRoleType)}
                        className='bg-muted border-2 border-border rounded-lg px-2 py-1 text-foreground font-normal cursor-pointer transition-colors hover:bg-muted'
                    >
                        <option value='admin'>Admin</option>
                        <option value='manager'>Manager</option>
                        <option value='staff'>Staff</option>
                        <option value='artist'>Artist</option>
                        <option value='piercer'>Piercer</option>
                        <option value='shoe_tech'>Shoe Tech</option>
                    </select>
                </label>
            </div>

            <div className='flex flex-row gap-2 justify-end mt-2'>
                <button
                    title='Cancel'
                    type='button'
                    className='bg-muted px-4 py-1 font-semibold border-2 border-border rounded-lg cursor-pointer transition-colors hover:bg-muted'
                    onClick={onClose}
                    disabled={isLoading}
                >
                    Cancel
                </button>
                <button
                    title='Send Invitation'
                    type='button'
                    className='bg-blue-400/20 px-4 py-1 font-semibold border-2 border-border rounded-lg cursor-pointer transition-colors hover:bg-blue-400/30 disabled:opacity-50 disabled:cursor-not-allowed'
                    onClick={handleSubmit}
                    disabled={isLoading}
                >
                    {isLoading ? "Sending..." : "Send Invitation"}
                </button>
            </div>
        </motion.div>
    )
}
