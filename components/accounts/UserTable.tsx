"use client"

import { UserProfile } from "@/utils/types/auth"
import { AnimatePresence, motion } from "motion/react"
import UserRow from "./UserRow"

interface UserTableProps {
    users: UserProfile[]
    showInactive: boolean
    isAdmin: boolean
    onEdit: (user: UserProfile) => void
    onDelete: (user: UserProfile) => void
    onRestore: (user: UserProfile) => void
    heightOffset: number
}

export default function UserTable({
    users,
    showInactive,
    isAdmin,
    onEdit,
    onDelete,
    onRestore,
    heightOffset,
}: UserTableProps) {
    return (
        <motion.div
            className='flex-1 w-full overflow-auto'
            style={{
                maxHeight: `calc(100% - ${heightOffset}px - 1rem)`,
            }}
        >
            <motion.table
                className={`min-w-max w-full h-max table-auto border-collapse relative`}
            >
                <thead className='sticky top-0 bg-black/80 z-5'>
                    <tr className='text-nowrap select-none'>
                        <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase w-max border-b border-white'>
                            Role
                        </th>
                        <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                            Name
                        </th>
                        <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                            Email
                        </th>
                        <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                            Rate Level
                        </th>
                        <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
                            Payout Period
                        </th>
                        <th className='text-left px-4 py-2 text-sm text-foreground font-bold uppercase border-b border-white'>
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
                        {users.map((user) => (
                            <UserRow
                                key={user.id}
                                user={user}
                                showInactive={showInactive}
                                isAdmin={isAdmin}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onRestore={onRestore}
                            />
                        ))}
                    </AnimatePresence>
                </motion.tbody>
            </motion.table>
        </motion.div>
    )
}
