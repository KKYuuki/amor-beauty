import { Metadata } from "next"
import { redirect } from "next/navigation"
import ConfigPage from "./configPage"
import { getCurrentUser, canManageSystemConfig } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Settings",
    description: "Settings Page",
}

export default async function Config() {
    const user = await getCurrentUser()
    if (!user || !(await canManageSystemConfig(user))) {
        redirect("/unauthorized")
    }
    return <ConfigPage />
}
