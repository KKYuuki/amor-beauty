"use client"

import { useContext, useEffect } from "react"
import { SideBarContext } from "./sidebar"
import { redirect } from "next/navigation"
import { userHasFlag } from "@/utils/auth/access-flags"

export default function AccessChecker({
    isAdmin,
    perms,
}: {
    isAdmin?: boolean
    perms?: string
}) {
    const { userInfo } = useContext(SideBarContext)

    useEffect(() => {
        if (isAdmin && perms === "") {
            if (userInfo.role !== "admin") {
                redirect("/unauthorized")
            }
        }
        if (perms && !userHasFlag(userInfo, perms)) {
            redirect("/unauthorized")
        }
    }, [userInfo, isAdmin, perms])

    return <></>
}
