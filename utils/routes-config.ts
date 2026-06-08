export interface RouteConfig {
    title: string
    href: string
    perms: string
    iconName: string
    group?: 'core' | 'management' | 'admin'
    exactMatch?: boolean
    fallbackPerms?: string[]  // optional — users with ANY of these flags can access in view-only mode
}

export const routeConfig: RouteConfig[] = [
    // Core Routes - Daily operations
    {
        title: "Dashboard",
        href: "/",
        perms: "",
        iconName: "HomeIcon",
        group: "core",
        exactMatch: true
    },

    // Management Routes - Business operations
    {
        title: "Inventory",
        href: "/inventory",
        perms: "inventory_manage",
        iconName: "PackageIcon",
        group: "management"
    },
    {
        title: "Accounting",
        href: "/accounting",
        perms: "accounting_access",
        iconName: "BookOpenIcon",
        group: "management"
    },
    {
        title: "Payroll",
        href: "/payroll",
        perms: "payroll_manage",
        iconName: "WalletIcon",
        group: "management"
    },
    {
        title: "Sales",
        href: "/sales",
        perms: "sales_access",
        iconName: "HandCoinsIcon",
        group: "management"
    },
    {
        title: "Transactions",
        href: "/transactions",
        perms: "transactions_manage",
        iconName: "FileTextIcon",
        group: "management"
    },
    {
        title: "My Payroll",
        href: "/my-payroll",
        perms: "",
        iconName: "BanknoteIcon",
        group: "core"
    },
    // Admin Routes - System administration
    {
        title: "Staff",
        href: "/accounts",
        perms: "user_manage",
        iconName: "UsersIcon",
        group: "admin"
    },
    {
        title: "Config",
        href: "/config",
        perms: "system_config",
        iconName: "Settings2Icon",
        group: "admin"
    },
    {
        title: "Metrics",
        href: "/metrics",
        perms: "metrics_view",
        iconName: "ChartAreaIcon",
        group: "admin"

    },
    {
        title: "System Logs",
        href: "/admin/logs",
        perms: "logs_view",
        iconName: "FileTextIcon",
        group: "admin"
    },
]
