import {
    ChartAreaIcon,
    HomeIcon,
    PackageIcon,
    UsersIcon,
    Settings2Icon,
    ClipboardListIcon,
    LucideIcon,
    MegaphoneIcon,
    FileTextIcon,
    HandCoinsIcon,
    WalletIcon,
    BanknoteIcon,
    BookOpenIcon,
    Building2Icon,
    ClockIcon,
    ScrollTextIcon
} from "lucide-react"
import { routeConfig, RouteConfig } from "./routes-config"

const iconMap: Record<string, LucideIcon> = {
    HomeIcon,
    ClipboardListIcon,
    PackageIcon,
    ChartAreaIcon,
    UsersIcon,
    Settings2Icon,
    MegaphoneIcon,
    FileTextIcon,
    HandCoinsIcon,
    WalletIcon,
    BanknoteIcon,
    BookOpenIcon,
    Building2Icon,
    ClockIcon,
    ScrollTextIcon
}

export interface Route extends Omit<RouteConfig, 'iconName'> {
    icon: LucideIcon
}

export const routes: Route[] = routeConfig.map(route => ({
    ...route,
    icon: iconMap[route.iconName]
}))

export const routeGroups = {
    core: {
        title: "Core",
        routes: routes.filter(r => r.group === 'core')
    },
    management: {
        title: "Management",
        routes: routes.filter(r => r.group === 'management')
    },
    admin: {
        title: "Admin",
        routes: routes.filter(r => r.group === 'admin')
    }
} as const

export type RouteGroupKey = keyof typeof routeGroups

