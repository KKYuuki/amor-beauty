import { Metadata } from "next"
import { redirect } from "next/navigation"
import AccountsClientPage from "./accountsPage"
import { getCurrentUser, canManageUsers } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Accounts",
    description: "Manage users",
}
export default async function AccountsPage() {
    const user = await getCurrentUser()
    if (!user || !(await canManageUsers(user))) {
        redirect("/unauthorized")
    }
    return <AccountsClientPage />
}
