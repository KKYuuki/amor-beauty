"use client"

import { useState, useEffect, useCallback, useContext } from "react"
import { normalizeFlag } from "@/utils/auth/access-flags"
import { Clock, QrCode, Calendar, Users, ShieldAlert } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import PageWrapper from "@/components/page-wrapper"
import { SideBarContext } from "@/components/sidebar"
import { NotificationContext } from "@/components/notifications"
import QRCodeDisplay from "@/components/clock/QRCodeDisplay"
import TimeClockCalendar from "@/components/clock/TimeClockCalendar"
import StaffClockStatus from "@/components/clock/StaffClockStatus"

type TabType = "qr" | "calendar" | "staff"

export default function AdminTimeClockPage() {
    const { userInfo } = useContext(SideBarContext)
    const { addNotification } = useContext(NotificationContext)

    const [activeTab, setActiveTab] = useState<TabType>("qr")
    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null)

    const checkAccess = useCallback(() => {
        const hasAdminAccess =
            userInfo?.role === "admin" ||
            userInfo?.access_flags?.some(f => normalizeFlag(f) === "time_clock_manage") ||
            false
        setIsAuthorized(hasAdminAccess)

        if (!hasAdminAccess) {
            addNotification(
                "You do not have permission to access this page",
                "ERROR"
            )
        }
    }, [userInfo, addNotification])

    useEffect(() => {
        checkAccess()
    }, [checkAccess])

    if (isAuthorized === null) {
        return (
            <PageWrapper>
                <div className="flex items-center justify-center h-full">
                    <div className="animate-pulse text-white/40">
                        Checking permissions...
                    </div>
                </div>
            </PageWrapper>
        )
    }

    if (!isAuthorized) {
        return (
            <PageWrapper>
                <div className="flex flex-col items-center justify-center h-full gap-6">
                    <div className="p-6 bg-red-500/10 border-2 border-red-500/30 rounded-full">
                        <ShieldAlert className="w-16 h-16 text-red-400" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-white mb-2">
                            Access Denied
                        </h1>
                        <p className="text-white/60 max-w-md">
                            You do not have permission to access the Time Clock
                            Management page. Please contact an administrator if
                            you need access.
                        </p>
                    </div>
                </div>
            </PageWrapper>
        )
    }

    return (
        <PageWrapper>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Clock className="w-6 h-6" />
                        Time Clock Management
                    </h1>
                    <p className="text-white/60 text-sm mt-1">
                        Manage QR codes and view staff time clock data
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
                {[
                    {
                        key: "qr" as TabType,
                        label: "QR Codes",
                        icon: QrCode,
                    },
                    {
                        key: "calendar" as TabType,
                        label: "Calendar",
                        icon: Calendar,
                    },
                    {
                        key: "staff" as TabType,
                        label: "Staff Status",
                        icon: Users,
                    },
                ].map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                            activeTab === tab.key
                                ? "bg-white/20 text-white"
                                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1"
                >
                    {activeTab === "qr" && (
                        <div className="max-w-md">
                            <QRCodeDisplay />
                        </div>
                    )}

                    {activeTab === "calendar" && <TimeClockCalendar />}

                    {activeTab === "staff" && <StaffClockStatus />}
                </motion.div>
            </AnimatePresence>
        </PageWrapper>
    )
}
