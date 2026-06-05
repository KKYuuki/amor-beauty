import { Metadata } from "next"
import { redirect } from "next/navigation"
import MyPayrollPageClient from "./myPayrollPage"
import { getCurrentUser, canViewOwnPayroll } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "My Payroll",
    description: "View your earnings and request payments",
}

export default async function MyPayrollPage() {
    const user = await getCurrentUser()
    if (!user || !(await canViewOwnPayroll(user))) {
        redirect("/unauthorized")
    }
    return <MyPayrollPageClient />
}
