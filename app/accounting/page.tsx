import { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import AccountingPageClient from "./accountingPage"
import { getCurrentUser, canAccessAccounting } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Accounting",
    description: "General Ledger and Financial Records",
}

export default async function AccountingPage() {
    const user = await getCurrentUser()
    if (!user || !(await canAccessAccounting(user))) {
        redirect("/unauthorized")
    }
    return (
        <Suspense>
            <AccountingPageClient />
        </Suspense>
    )
}
