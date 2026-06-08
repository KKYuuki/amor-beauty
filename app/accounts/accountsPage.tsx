"use client"
import { useRef, useState } from "react"
import UsersList from "./usersList"
import InvitationsClient from "./invitationsClient"
import { UsersIcon, KeyIcon } from "lucide-react"
import PageWrapper from "@/components/page-wrapper"

export default function AccountsClientPage() {
    const headerRef = useRef<HTMLDivElement>(null)
    const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users')

    return (
        <PageWrapper>
            <div ref={headerRef} className='flex flex-row gap-8 items-center'>
                <div>
                    <h1 className='text-2xl font-bold flex items-center gap-2'>
                        <UsersIcon className='w-6 h-6' />
                        Accounts
                    </h1>
                    <p className='text-muted-foreground text-sm mt-1'>
                        Manage system users and invitations
                    </p>
                </div>
            </div>

            <div className='flex gap-2'>
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-4 py-2 rounded-md font-semibold transition-colors ${activeTab === 'users' ? 'bg-muted text-foreground' : 'bg-muted text-muted-foreground hover:bg-muted'}`}
                >
                    Users
                </button>
                <button
                    onClick={() => setActiveTab('invitations')}
                    className={`px-4 py-2 rounded-md font-semibold transition-colors flex items-center gap-2 ${activeTab === 'invitations' ? 'bg-muted text-foreground' : 'bg-muted text-muted-foreground hover:bg-muted'}`}
                >
                    <KeyIcon className='w-4 h-4' />
                    Invitations
                </button>
            </div>

            {activeTab === 'users' ? (
                <UsersList headerRef={headerRef} />
            ) : (
                <InvitationsClient />
            )}
        </PageWrapper>
    )
}
