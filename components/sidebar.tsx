"use client"

import { UserProfile } from "@/utils/types/auth"
import { MaintenanceModeValue } from "@/utils/types/settings"
import {
    LogOutIcon,
    MenuIcon,
    PanelLeftCloseIcon,
    PanelLeftOpenIcon,
    UserRoundIcon,
    XIcon,
    ChevronDownIcon,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useId,
} from "react"
import { NotificationContext } from "./notifications"
import logo from "@/public/icon.svg"
import useOutsideClick from "@/utils/useOutsideClick"
import { routeGroups, Route, RouteGroupKey } from "@/utils/routes"
import { authClient } from "@/lib/auth-client"
import { normalizeFlag } from "@/utils/auth/access-flags"
import { useSessionSSE } from "@/hooks/useSessionSSE"
import PasskeyBanner from "@/components/auth/PasskeyBanner"
import PasskeyFirstLoginModal from "@/components/auth/PasskeyFirstLoginModal"
import { PasskeyStatusProvider } from "@/contexts/PasskeyStatusContext"
import BranchSelector from "@/components/branch-selector"

interface SideBarContextType {
    updateSidebar: () => Promise<void>
    userInfo: UserProfile
    isMobile: boolean
}

export const SideBarContext = createContext<SideBarContextType>({
    updateSidebar: async () => {},
    userInfo: {
        id: "",
        created_at: new Date("2024-01-01"),
        full_name: "",
        email: "",
        phone_number: "",
        instagram_handle: "",
        avatar_url: "",
        role: "staff",
        access_flags: [],
        is_active: true,
        last_login_at: new Date("2024-01-01"),
    },
    isMobile: false,
})

export function useSidebar() {
    const context = useContext(SideBarContext)
    if (!context) {
        throw new Error("useSidebar must be used within a SidebarProvider")
    }
    return context
}

function isRouteActive(
    pathname: string,
    routeHref: string,
    exactMatch?: boolean,
) {
    if (exactMatch) {
        return pathname === routeHref
    }
    if (routeHref === "/") {
        return pathname === "/"
    }
    return pathname === routeHref || pathname.startsWith(routeHref + "/")
}

// Collapsible Group Component
interface RouteGroupProps {
    groupKey: RouteGroupKey
    title: string
    routes: Route[]
    isExpanded: boolean
    isMobile: boolean
    pathname: string
    userInfo: UserProfile
    onNavigate: () => void
}

function RouteGroup({
    groupKey: _groupKey,
    title,
    routes,
    isExpanded,
    isMobile,
    pathname,
    userInfo,
    onNavigate,
}: RouteGroupProps) {
    const [isOpen, setIsOpen] = useState(true)
    const contentId = useId()

    const filteredRoutes = useMemo(() => {
        return routes.filter((route) => {
            if (route.perms.length > 0) {
                // Admin sees everything
                if (userInfo.role === "admin") return true
                // Check primary perm
                const hasFlag = userInfo.access_flags?.some(
                    (f) => normalizeFlag(f) === normalizeFlag(route.perms)
                )
                // Check fallback perms if primary fails
                const hasFallbackFlag = route.fallbackPerms?.some(fp =>
                    userInfo.access_flags?.some(
                        (f) => normalizeFlag(f) === normalizeFlag(fp)
                    )
                ) ?? false
                if (!hasFlag && !hasFallbackFlag) return false
            }
            return true
        })
    }, [routes, userInfo.access_flags, userInfo.role])

    if (filteredRoutes.length === 0) return null

    return (
        <div className='flex flex-col'>
            {(isExpanded || isMobile) && (
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    aria-expanded={isOpen}
                    aria-controls={contentId}
                    aria-label={`Toggle ${title} section`}
                    className='flex items-center justify-between px-2 py-1.5 text-xs font-medium text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors'
                >
                    <span>{title}</span>
                    <motion.div
                        animate={{ rotate: isOpen ? 0 : -90 }}
                        transition={{ duration: 0.2 }}
                    >
                        <ChevronDownIcon className='w-3 h-3' />
                    </motion.div>
                </button>
            )}
            <AnimatePresence initial={false}>
                {(isOpen || (!isExpanded && !isMobile)) && (
                    <motion.div
                        id={contentId}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className='flex flex-col gap-1 overflow-hidden'
                    >
                        {filteredRoutes.map((route) => (
                            <Link
                                href={route.href}
                                className={`flex items-center gap-3 font-medium text-sm rounded-md p-2 transition-colors relative ${
                                    isRouteActive(
                                        pathname,
                                        route.href,
                                        route.exactMatch,
                                    )
                                        ? "bg-white/5 text-white"
                                        : "text-white/60 hover:bg-white/10 hover:text-white"
                                }`}
                                key={route.title}
                                title={route.title}
                                draggable={false}
                                onClick={onNavigate}
                            >
                                {/* Active indicator */}
                                {isRouteActive(
                                    pathname,
                                    route.href,
                                    route.exactMatch,
                                ) && (
                                    <motion.div
                                        layoutId='activeIndicator'
                                        className='absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-400 rounded-full'
                                        initial={false}
                                        transition={{
                                            type: "spring",
                                            stiffness: 500,
                                            damping: 30,
                                        }}
                                    />
                                )}
                                <route.icon
                                    className='stroke-1 shrink-0'
                                    size={20}
                                />
                                <AnimatePresence mode='popLayout'>
                                    {(isExpanded || isMobile) && (
                                        <motion.span
                                            key={route.title}
                                            layout='position'
                                            className='truncate'
                                        >
                                            {route.title}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </Link>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

interface SidebarProps {
    children: React.ReactNode
    maintenanceMode: MaintenanceModeValue | null
}

export default function Sidebar({ children, maintenanceMode }: SidebarProps) {
    const { addNotification } = useContext(NotificationContext)
    const router = useRouter()
    const pathname = usePathname()

    const [isExpanded, setIsExpanded] = useState(true)
    const [isMobile, setIsMobile] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [userInfo, setUserInfo] = useState<UserProfile>({
        id: "",
        created_at: new Date("2024-01-01"),
        full_name: "",
        email: "",
        phone_number: "",
        instagram_handle: "",
        avatar_url: "",
        role: "staff",
        access_flags: [],
        is_active: true,
        last_login_at: new Date("2024-01-01"),
    })

    const { data: session, isPending, refetch } = authClient.useSession()

    // SSE: instantly refetch session when admin updates this user's flags/role
    useSessionSSE(session?.user?.id as string | undefined, () => refetch())

    const isLoggedIn = useMemo(() => !!session?.user, [session])

    const [avatarTimestamp] = useState(() => Date.now())
    const avatarUrl = useMemo(() => {
        if (!userInfo.avatar_url) return null
        if (userInfo.avatar_url.includes("?"))
            return `${userInfo.avatar_url}&t=${avatarTimestamp}`
        return `${userInfo.avatar_url}?t=${avatarTimestamp}`
    }, [userInfo.avatar_url, avatarTimestamp])

    const handleLogout = useCallback(async () => {
        try {
            await authClient.signOut()
            setUserInfo({
                id: "",
                created_at: new Date("2024-01-01"),
                full_name: "",
                email: "",
                phone_number: "",
                instagram_handle: "",
                avatar_url: "",
                role: "staff",
                access_flags: [],
                is_active: true,
                last_login_at: new Date("2024-01-01"),
            })
            router.push("/auth")
            router.refresh()
        } catch (_error) {
            addNotification(
                "Failed to logout. Please try again.",
                "ERROR",
                "Logout Error",
                true,
            )
        }
    }, [router, addNotification])

    const updateSidebar = useCallback(async () => {
        if (!session?.user) {
            setIsLoading(false)
            return
        }

        const user = session.user as unknown as Record<string, unknown>
        setUserInfo({
            id: user.id as string,
            created_at: user.createdAt
                ? new Date(user.createdAt as string)
                : new Date(),
            full_name: (user.name as string) || "",
            email: (user.email as string) || "",
            phone_number: (user.phoneNumber as string) || "",
            instagram_handle: (user.instagramHandle as string) || "",
            avatar_url: (user.avatarUrl as string) || "",
            role: (user.role as UserProfile["role"]) || "staff",
            access_flags: (user.accessFlags as string[]) || [],
            is_active: (user.isActive as boolean) ?? true,
            last_login_at: user.lastLoginAt
                ? new Date(user.lastLoginAt as string)
                : new Date(),
            rate_level_id: user.rateLevelId as UserProfile["rate_level_id"],
            payout_period: user.payoutPeriod as UserProfile["payout_period"],
        })
        setIsLoading(false)
    }, [session])

    useEffect(() => {
        let resizeTimeout: ReturnType<typeof setTimeout>

        const handleResize = () => {
            clearTimeout(resizeTimeout)
            resizeTimeout = setTimeout(() => {
                if (window.innerWidth < 768) {
                    setIsExpanded(false)
                    setIsMobile(true)
                } else if (window.innerWidth < 1024) {
                    setIsExpanded(false)
                    setIsMobile(false)
                } else {
                    setIsExpanded(true)
                    setIsMobile(false)
                }
            }, 150)
        }

        handleResize()
        window.addEventListener("resize", handleResize)

        return () => {
            clearTimeout(resizeTimeout)
            window.removeEventListener("resize", handleResize)
        }
    }, [])

    useEffect(() => {
        if (!isPending) {
            updateSidebar()
        }
    }, [session, isPending, updateSidebar])

    const sidebarRef = useRef<HTMLDivElement>(null)
    useOutsideClick(
        sidebarRef,
        () => {
            if (isMobile && isExpanded) {
                setIsExpanded(false)
            }
        },
        isExpanded,
    )

    // Focus trap for mobile menu accessibility
    useEffect(() => {
        if (!isMobile || !isExpanded || !sidebarRef.current) return

        const sidebar = sidebarRef.current
        const focusableElements = sidebar.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select',
        )
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        const handleTabKey = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return

            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    e.preventDefault()
                    lastElement?.focus()
                }
            } else {
                if (document.activeElement === lastElement) {
                    e.preventDefault()
                    firstElement?.focus()
                }
            }
        }

        // Focus first element when menu opens
        firstElement?.focus()

        document.addEventListener("keydown", handleTabKey)
        return () => {
            document.removeEventListener("keydown", handleTabKey)
        }
    }, [isMobile, isExpanded])

    const handleNavigate = useCallback(() => {
        if (isMobile) {
            setIsExpanded(false)
        }
    }, [isMobile])

    const showLoading = useMemo(() => {
        if (isPending || isLoading) return true
        if (!isLoggedIn && pathname !== "/auth") return true
        return false
    }, [isPending, isLoading, isLoggedIn, pathname])

    const isInMaintenanceMode =
        maintenanceMode?.enabled && userInfo.role !== "admin"

    if (isInMaintenanceMode) {
        return (
            <div className='w-svw h-svh flex flex-col items-center justify-center bg-black'>
                <Image
                    src={logo}
                    alt=''
                    className='mb-8'
                />
                <h1 className='text-2xl sm:text-3xl md:text-4xl font-bodoni text-center px-8 mb-4'>
                    Maintenance Mode
                </h1>
                <p className='text-white/60 text-center px-8 max-w-md'>
                    {maintenanceMode?.message ||
                        "System is under maintenance. Please check back later."}
                </p>
            </div>
        )
    }

    return (
        <SideBarContext.Provider
            value={{
                updateSidebar,
                userInfo,
                isMobile,
            }}
        >
            <AnimatePresence
                mode='popLayout'
                initial={false}
            >
                {showLoading ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        key='loading-section'
                        className='w-svw h-svh flex flex-col items-center justify-center absolute top-0 left-0 z-50'
                    >
                        <Image
                            src={logo}
                            alt=''
                            className='animate-pulse'
                        />
                        <h1 className='text-lg sm:text-xl md:text-2xl lg:text-3xl font-bodoni absolute left-4 bottom-4'>
                            <LoadingText text='Loading' />
                        </h1>
                    </motion.div>
                ) : (
                    <motion.main
                        key='main-section'
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className='w-svw h-svh flex flex-col md:flex-row pt-16 md:pt-0'
                    >
                        {pathname !== "/auth" && (
                            <motion.nav
                                ref={sidebarRef}
                                key='navigation'
                                className={`fixed md:relative top-0 left-0 z-20 transition-all duration-300 ease-in-out ${
                                    isMobile
                                        ? isExpanded
                                            ? "w-full h-full"
                                            : "w-full h-16"
                                        : isExpanded
                                          ? "w-64 h-full"
                                          : "w-16 h-full"
                                }`}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                            >
                                <motion.div
                                    className={`bg-black/80 md:bg-white/5 backdrop-blur-xl md:backdrop-blur-lg flex flex-col h-full gap-3 relative border-b md:border-r border-white/10 md:border-white/5 transition-all duration-300 ${
                                        isMobile && !isExpanded
                                            ? "px-4 py-3"
                                            : "p-3"
                                    }`}
                                >
                                    {/* Header */}
                                    <motion.div
                                        key='top-section'
                                        layout='position'
                                        className={`flex gap-2 ${
                                            isExpanded
                                                ? "flex-row"
                                                : "flex-row md:flex-col md:items-center"
                                        }`}
                                    >
                                        <Link
                                            href='/profile'
                                            title='Profile'
                                            className='flex flex-row items-center gap-2 flex-1 group hover:bg-white/10 rounded-md transition-colors p-2'
                                        >
                                            <div
                                                className={`aspect-square rounded-full w-8 h-8 flex items-center justify-center cursor-pointer bg-white/10 group-hover:bg-white/30 transition-colors overflow-clip ${
                                                    userInfo.avatar_url
                                                        ? ""
                                                        : "p-1"
                                                }`}
                                                draggable={false}
                                            >
                                                {userInfo.avatar_url ? (
                                                    <Image
                                                        src={
                                                            avatarUrl as string
                                                        }
                                                        alt='avatar'
                                                        width={400}
                                                        height={400}
                                                        className='rounded-full w-full h-full object-cover object-center'
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <UserRoundIcon
                                                        size={20}
                                                        className='stroke-1'
                                                    />
                                                )}
                                            </div>
                                            {(isExpanded || isMobile) && (
                                                <span className='w-max text-sm text-nowrap font-semibold select-none'>
                                                    {userInfo.full_name ||
                                                        "Loading..."}
                                                </span>
                                            )}
                                        </Link>
                                        <button
                                            title={
                                                isExpanded
                                                    ? "Collapse"
                                                    : "Expand"
                                            }
                                            aria-label={
                                                isExpanded
                                                    ? "Collapse sidebar"
                                                    : "Expand sidebar"
                                            }
                                            aria-expanded={isExpanded}
                                            className='flex items-center justify-center hover:bg-white/10 rounded-md p-2 transition-colors cursor-pointer'
                                            onClick={() =>
                                                setIsExpanded(!isExpanded)
                                            }
                                        >
                                            {isExpanded ? (
                                                isMobile ? (
                                                    <XIcon
                                                        className='stroke-1'
                                                        size={20}
                                                    />
                                                ) : (
                                                    <PanelLeftCloseIcon
                                                        className='stroke-1'
                                                        size={20}
                                                    />
                                                )
                                            ) : isMobile ? (
                                                <MenuIcon
                                                    className='stroke-1'
                                                    size={20}
                                                />
                                            ) : (
                                                <PanelLeftOpenIcon
                                                    className='stroke-1'
                                                    size={20}
                                                />
                                            )}
                                        </button>
                                    </motion.div>

                                    {/* Global Branch Selector */}
                                    <div
                                        className={`${isMobile && !isExpanded ? 'hidden' : ''} ${!isExpanded && !isMobile ? 'flex justify-center' : ''}`}
                                    >
                                        <BranchSelector
                                            showAllOption={true}
                                            className={
                                                !isExpanded && !isMobile
                                                    ? "w-10"
                                                    : "w-full"
                                            }
                                        />
                                    </div>

                                    {/* Mobile overlay background */}
                                    {isMobile && isExpanded && (
                                        <div className='fixed inset-0 bg-black/60 -z-10' />
                                    )}

                                    {/* Navigation Groups */}
                                    <motion.div
                                        key='links-section'
                                        className={`flex-1 flex flex-col gap-4 overflow-y-auto ${
                                            isMobile && !isExpanded && "hidden"
                                        } ${
                                            !isMobile && !isExpanded
                                                ? "items-center"
                                                : ""
                                        }`}
                                        layout='position'
                                    >
                                        {(
                                            Object.keys(
                                                routeGroups,
                                            ) as RouteGroupKey[]
                                        ).map((groupKey) => (
                                            <RouteGroup
                                                key={groupKey}
                                                groupKey={groupKey}
                                                title={
                                                    routeGroups[groupKey].title
                                                }
                                                routes={
                                                    routeGroups[groupKey].routes
                                                }
                                                isExpanded={isExpanded}
                                                isMobile={isMobile}
                                                pathname={pathname}
                                                userInfo={userInfo}
                                                onNavigate={handleNavigate}
                                            />
                                        ))}
                                    </motion.div>

                                    {/* Logout */}
                                    <motion.div
                                        key='logout-section'
                                        layout='position'
                                        className={`flex items-center gap-3 font-medium text-sm hover:bg-white/10 active:bg-white/30 rounded-md p-2 transition-colors cursor-pointer ${
                                            !isExpanded && "justify-center"
                                        } ${
                                            isMobile && !isExpanded && "hidden"
                                        }`}
                                        onClick={handleLogout}
                                    >
                                        <LogOutIcon
                                            size={20}
                                            className='stroke-1 shrink-0'
                                        />
                                        <AnimatePresence mode='popLayout'>
                                            {(isExpanded || isMobile) && (
                                                <motion.span
                                                    key='logout-text'
                                                    layout='position'
                                                >
                                                    Logout
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                </motion.div>
                            </motion.nav>
                        )}
                        <motion.div
                            key='content'
                            className='flex-1 h-full flex flex-col pt-2 p-4 md:p-4 md:pl-4 overflow-y-auto'
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            {isLoggedIn && (
                                <PasskeyStatusProvider>
                                    <PasskeyBanner />
                                    <PasskeyFirstLoginModal />
                                </PasskeyStatusProvider>
                            )}
                            {children}
                        </motion.div>
                    </motion.main>
                )}
            </AnimatePresence>
        </SideBarContext.Provider>
    )
}

function LoadingText({ text }: { text: string }) {
    return (
        <AnimatePresence>
            {text.split("").map((char, index) => (
                <motion.span
                    initial={{ opacity: 0, translateY: "-100%" }}
                    animate={{ opacity: 1, translateY: 0 }}
                    transition={{
                        delay: 0.5 + index * 0.05,
                    }}
                    key={char + index}
                >
                    {char}
                </motion.span>
            ))}
        </AnimatePresence>
    )
}
