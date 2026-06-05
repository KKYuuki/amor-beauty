import { Metadata } from "next"
import { redirect } from "next/navigation"
import AppointmentsPageClient from "./appointmentsPage"
import { getCurrentUser, canManageAppointments, canViewAppointments } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Appointments",
    description: "Manage your appointments",
}

export default async function AppointmentsPage() {
    const user = await getCurrentUser()
    if (!user) redirect("/auth")

    const canManage = await canManageAppointments(user)
    const canView = await canViewAppointments(user)

    if (!canManage && !canView) {
        redirect("/unauthorized")
    }

    return <AppointmentsPageClient isReadOnly={!canManage} />
}
