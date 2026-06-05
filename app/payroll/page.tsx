import { Metadata } from "next"
import { redirect } from "next/navigation"
import PayrollPageClient from "./payrollPage"
import { getCurrentUser, canManagePayroll } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Payroll Management",
    description: "Manage staff payroll and payments",
}

export default async function PayrollPage() {
    const user = await getCurrentUser()
    if (!user || !(await canManagePayroll(user))) {
        redirect("/unauthorized")
    }
    return <PayrollPageClient />
}
