import { Metadata } from "next"
import { redirect } from "next/navigation"
import TransactionsPageClient from "./transactionsPage"
import { getCurrentUser, canAccessTransactions } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Transactions | InkSight",
    description: "Manage transactions",
}

export default async function TransactionsPage() {
    const user = await getCurrentUser()
    if (!user || !(await canAccessTransactions(user))) {
        redirect("/unauthorized")
    }
    return <TransactionsPageClient />
}
