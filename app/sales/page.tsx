import { Metadata } from "next"
import { redirect } from "next/navigation"
import SalesPageClientComponent from "./salesPage"
import { getCurrentUser, canAccessSales } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Sales",
    description: "Process sales and manage transactions",
}

export default async function SalesPage() {
    const user = await getCurrentUser()
    if (!user || !(await canAccessSales(user))) {
        redirect("/unauthorized")
    }

    return <SalesPageClientComponent />
}
