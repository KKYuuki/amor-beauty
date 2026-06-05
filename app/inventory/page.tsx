import { Metadata } from "next"
import { redirect } from "next/navigation"
import InventoryPageClientComponent from "./inventoryPage"
import { getCurrentUser, canManageInventory } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Inventory",
    description: "Manage your inventory items",
}

export default async function InventoryPage() {
    const user = await getCurrentUser()
    if (!user || !(await canManageInventory(user))) {
        redirect("/unauthorized")
    }
    return <InventoryPageClientComponent />
}
