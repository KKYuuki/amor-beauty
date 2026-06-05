"use client"

import { useContext } from "react"
import { SideBarContext } from "@/components/sidebar"
import type { FeatureAccessFlag } from "@/utils/auth/access-flags"

interface FlagGateProps {
    requiredFlag: FeatureAccessFlag
    children: React.ReactNode
}

/**
 * Renders children only if the current user has the required access flag
 * (or is an admin — admin always bypasses).
 * No passkey prompt — for routine feature-gated operations.
 */
export default function FlagGate({ requiredFlag, children }: FlagGateProps) {
    const { userInfo } = useContext(SideBarContext)

    const isAdmin = userInfo?.role === "admin"
    const hasFlag = userInfo?.access_flags?.includes(requiredFlag) ?? false

    if (!isAdmin && !hasFlag) {
        return null
    }

    return <>{children}</>
}
