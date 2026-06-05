import { Metadata } from "next"
import { redirect } from "next/navigation"
import NotifyClientPage from "./notifyPage"
import { getCurrentUser, canSendNotifications } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Notify",
    description: "Send email notifications to users",
}

export default async function NotifyPage() {
    const user = await getCurrentUser()
    if (!user || !(await canSendNotifications(user))) {
        redirect("/unauthorized")
    }
    return <NotifyClientPage />
}
