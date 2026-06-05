"use client"

import {
    Suspense,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence } from "motion/react"
import {
    CalendarFoldIcon,
    ClipboardListIcon,
    ClockIcon,
    PlusIcon,
    SearchIcon,
} from "lucide-react"
import { NotificationContext } from "@/components/notifications"
import { SideBarContext } from "@/components/sidebar"
import WalkinAppointmentModal from "@/components/appointments/WalkinAppointmentModal"
import { getUserAppointments } from "@/server/actions/appointments"
import { getProfilesByIds } from "@/server/actions/profile"
import { getStatusBadgeClasses, getTypeBadgeClasses } from "@/utils/appointment-styles"
import { Appointment, AppointmentStatus } from "@/utils/types/general"
import { UserProfile } from "@/utils/types/auth"
import PageWrapper from "@/components/page-wrapper"
import { useBranchContext } from "@/components/branch-context"
import PageHeader from "@/components/ui/PageHeader"
import FilterBar from "@/components/ui/FilterBar"
import ResponsiveTable from "@/components/ui/ResponsiveTable"

export default function AppointmentsPageClient({ isReadOnly = false }: { isReadOnly?: boolean }) {
    const router = useRouter()
    const { addNotification } = useContext(NotificationContext)
    const { userInfo } = useContext(SideBarContext)
    const { currentBranch } = useBranchContext()

    // Page States
    const [loading, setLoading] = useState(true)
    const [status, setStatus] = useState<AppointmentStatus | "" | "ALL">("CONFIRMED")
    const [searchQuery, setSearchQuery] = useState("")
    const [showWalkinModal, setShowWalkinModal] = useState(false)

    // Data States
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [profilesMap, setProfilesMap] = useState<Map<string, UserProfile>>(
        new Map(),
    )

    // Handlers
    const getAppointments = useCallback(async () => {
        if (userInfo.id !== "") {
            setLoading(true)
            const res = await getUserAppointments(userInfo.id)
            if (res.success && res.data) {
                const appointmentsData = res.data
                setAppointments(appointmentsData)
                // Batch fetch all unique user profiles
                const userIds = new Set<string>()
                appointmentsData.forEach((a) => {
                    if (a.client_id) userIds.add(a.client_id)
                    if (a.staff_id) userIds.add(a.staff_id)
                })
                const profiles = await getProfilesByIds(Array.from(userIds))
                const map = new Map<string, UserProfile>()
                profiles.forEach((p) => map.set(p.id, p))
                setProfilesMap(map)
            }
            setLoading(false)
        }
    }, [userInfo.id])

    // Memoized filtered appointments list
    const filteredAppointments = useMemo(() => {
        let filtered = appointments

        // Filter by branch - only if a specific branch is selected
        if (currentBranch) {
            filtered = filtered.filter((a) => a.branch_id === currentBranch.id)
        }
        // If currentBranch is null (All Branches), show all appointments

        // Filter by status
        if (status !== "" && status !== "ALL") {
            filtered = filtered.filter((a) => a.status === status)
        }

        // Filter by search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            filtered = filtered.filter((a) => {
                const clientName = a.is_walkin 
                    ? (a.client_name || "")
                    : (profilesMap.get(a.client_id || "")?.full_name || "")
                const staffName = profilesMap.get(a.staff_id || "")?.full_name || ""
                
                return (
                    a.title.toLowerCase().includes(query) ||
                    a.type?.toLowerCase().includes(query) ||
                    clientName.toLowerCase().includes(query) ||
                    staffName.toLowerCase().includes(query)
                )
            })
        }

        return filtered
    }, [appointments, status, searchQuery, profilesMap, currentBranch])

    // Memoized formatted dates
    const formattedDates = useMemo(() => {
        const now = Date.now()
        const map = new Map<
            string,
            {
                date: string
                startTime: string
                endTime: string
                isLate: boolean
                isToday: boolean
            }
        >()
        appointments.forEach((a) => {
            const startDate = new Date(a.time_start)
            const endDate = new Date(a.time_end)
            const today = new Date()
            const isToday = startDate.toDateString() === today.toDateString()
            
            map.set(a.id, {
                date: startDate.toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                }),
                startTime: startDate.toLocaleTimeString("en-PH", {
                    hour: "numeric",
                    minute: "numeric",
                }),
                endTime: endDate.toLocaleTimeString("en-PH", {
                    hour: "numeric",
                    minute: "numeric",
                }),
                isLate:
                    now - startDate.getTime() > 0 &&
                    !a.actual_time_start &&
                    a.status !== "CANCELLED",
                isToday,
            })
        })
        return map
    }, [appointments])



    useEffect(() => {
        if (userInfo.id !== "") {
            getAppointments()
        }
    }, [userInfo.id, getAppointments])

    return (
        <Suspense>
            {/* Walk-in Appointment Modal */}
            {!isReadOnly && (
                <AnimatePresence>
                    {showWalkinModal && (
                        <WalkinAppointmentModal
                            isOpen={showWalkinModal}
                            onClose={() => setShowWalkinModal(false)}
                            onSuccess={() => {
                                getAppointments()
                                addNotification(
                                    "Walk-in appointment created",
                                    "SUCCESS",
                                )
                            }}
                        />
                    )}
                </AnimatePresence>
            )}

            <PageWrapper>
                {/* Header */}
                <PageHeader
                    title="Appointments"
                    icon={<ClipboardListIcon className='w-6 h-6' />}
                    actions={
                        !isReadOnly ? (
                            <button
                                onClick={() => setShowWalkinModal(true)}
                                className='flex items-center gap-2 px-3 sm:px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-md border-2 border-green-400/20 font-semibold transition-colors'
                            >
                                <PlusIcon size={18} />
                                <span className='hidden sm:inline'>Add Walk-in</span>
                            </button>
                        ) : undefined
                    }
                />

                {/* Filters */}
                <FilterBar>
                    <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-xs">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <input
                            type="text"
                            placeholder="Search appointments..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white/5 border-2 border-white/10 rounded-md text-sm focus:outline-none focus:border-white/20 transition-colors"
                        />
                    </div>

                    <select
                        title="Filter by Status"
                        aria-label="Filter by Status"
                        onChange={(e) => setStatus(e.target.value as AppointmentStatus | "" | "ALL")}
                        value={status}
                        className="px-4 py-2 bg-white/5 border-2 border-white/10 rounded-md text-sm font-medium cursor-pointer hover:bg-white/10 transition-colors focus:outline-none focus:border-white/20"
                    >
                        <option value="CONFIRMED">Confirmed</option>
                        <option value="PENDING">Pending</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                        <option value="ALL">View All</option>
                    </select>
                </FilterBar>

                {/* Quick status pills with counts */}
                <div className="flex flex-wrap gap-2 mb-3">
                    {(["PENDING", "CONFIRMED", "ONGOING", "COMPLETED", "CANCELLED"] as AppointmentStatus[]).map((s) => {
                        const count = appointments.filter(a => a.status === s).length
                        const isActive = status === s
                        return (
                            <button
                                key={s}
                                onClick={() => setStatus(s)}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                    isActive
                                        ? "bg-white/20 text-white border-white/30"
                                        : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                                }`}
                            >
                                {s.charAt(0) + s.slice(1).toLowerCase()} ({count})
                            </button>
                        )
                    })}
                </div>

                {/* Mobile day selector */}
                <div className="lg:hidden flex gap-1 overflow-x-auto pb-2 mb-3">
                    {Array.from({ length: 7 }).map((_, i) => {
                        const d = new Date()
                        d.setDate(d.getDate() + i)
                        const isToday = i === 0
                        return (
                            <button
                                key={i}
                                className={`flex-shrink-0 w-14 h-16 flex flex-col items-center justify-center rounded-lg border text-xs ${
                                    isToday ? "bg-white/10 border-white/30 text-white" : "bg-white/5 border-white/10 text-white/60"
                                }`}
                            >
                                <span className="font-medium">{d.toLocaleDateString("en-PH", { weekday: "short" })}</span>
                                <span className="text-lg font-bold">{d.getDate()}</span>
                            </button>
                        )
                    })}
                </div>

                {/* Appointments Table */}
                <div className='flex-1 overflow-hidden rounded-lg border border-white/10 bg-white/5'>
                    <ResponsiveTable<Appointment>
                        columns={[
                            {
                                key: 'title',
                                header: 'Appointment',
                                mobileCard: {
                                    label: 'Title',
                                    priority: 'primary',
                                    render: (value: unknown, appointment) => (
                                        <div className='flex flex-col gap-1'>
                                            <span className='font-medium'>{value as string}</span>
                                            {(() => {
                                                const dateInfo = formattedDates.get(appointment.id)
                                                return dateInfo?.isLate ? (
                                                    <span className="inline-block text-xs font-semibold px-1.5 py-0.5 bg-red-400/20 text-red-400 rounded-sm border border-red-400/20">
                                                        Late
                                                    </span>
                                                ) : null
                                            })()}
                                        </div>
                                    )
                                }
                            },
                            {
                                key: 'client_id',
                                header: 'Client',
                                mobileCard: {
                                    label: 'Client',
                                    priority: 'secondary',
                                    render: (_, appointment) => (
                                        <span className='text-white/80'>
                                            {appointment.is_walkin
                                                ? (appointment.client_name || 'Walk-in')
                                                : (profilesMap.get(appointment.client_id || '')?.full_name || 'Unknown')}
                                        </span>
                                    )
                                }
                            },
                            {
                                key: 'staff_id',
                                header: 'Staff',
                                mobileCard: {
                                    label: 'Staff',
                                    priority: 'secondary',
                                    render: (_, appointment) => (
                                        profilesMap.get(appointment.staff_id || '')?.full_name || 'Unassigned'
                                    )
                                }
                            },
                            {
                                key: 'time_start',
                                header: 'Date & Time',
                                mobileCard: {
                                    label: 'Date & Time',
                                    priority: 'primary',
                                    render: (_, appointment) => {
                                        const dateInfo = formattedDates.get(appointment.id)
                                        return (
                                            <div className='flex flex-col gap-1'>
                                                <span className='text-white/80 flex items-center gap-1'>
                                                    <CalendarFoldIcon size={14} />
                                                    {dateInfo?.date}
                                                    {dateInfo?.isToday && (
                                                        <span className="text-xs px-1.5 py-0.5 bg-green-400/20 text-green-400 rounded-sm">
                                                            Today
                                                        </span>
                                                    )}
                                                </span>
                                                <span className='text-white/60 text-sm flex items-center gap-1'>
                                                    <ClockIcon size={14} />
                                                    {dateInfo?.startTime} - {dateInfo?.endTime}
                                                </span>
                                            </div>
                                        )
                                    }
                                }
                            },
                            {
                                key: 'status',
                                header: 'Status',
                                mobileCard: {
                                    label: 'Status',
                                    priority: 'tertiary',
                                    render: (value) => (
                                        <span className={`inline-block px-2 py-0.5 rounded-sm text-xs font-semibold border capitalize ${getStatusBadgeClasses(value as AppointmentStatus)}`}>
                                            {(value as AppointmentStatus).toLowerCase()}
                                        </span>
                                    )
                                }
                            },
                            {
                                key: 'branch_name',
                                header: 'Branch',
                                mobileCard: {
                                    label: 'Branch',
                                    priority: 'tertiary',
                                    render: (value) => (
                                        <span className='text-white/80 text-sm'>
                                            {(value as string) || 'All Branches'}
                                        </span>
                                    )
                                }
                            },
                            {
                                key: 'type',
                                header: 'Type',
                                mobileCard: {
                                    label: 'Type',
                                    priority: 'tertiary',
                                    render: (value: unknown, appointment) => (
                                        <div className='flex items-center gap-1'>
                                            <span className={`inline-block px-2 py-0.5 rounded-sm text-xs font-semibold border capitalize ${getTypeBadgeClasses(value as string)}`}>
                                                {(value as string)?.toLowerCase() || 'other'}
                                            </span>
                                            {appointment.is_walkin && (
                                                <span className="inline-block px-2 py-0.5 bg-green-500/20 text-green-400 rounded-sm text-xs font-semibold border border-green-400/20">
                                                    Walk-in
                                                </span>
                                            )}
                                        </div>
                                    )
                                }
                            }
                        ]}
                        data={filteredAppointments}
                        rowKey="id"
                        onRowClick={(appointment) => router.push(`/appointments/${appointment.id}`)}
                        emptyMessage={
                            searchQuery
                                ? "No appointments match your search criteria."
                                : isReadOnly
                                    ? "No appointments in this category."
                                    : "No appointments in this category. Click \"+ Add Walk-in\" to create one."
                        }
                        loading={loading}
                    />
                </div>
            </PageWrapper>
        </Suspense>
    )
}
