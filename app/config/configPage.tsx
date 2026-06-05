"use client"

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
    SettingCategory,
    SettingKey,
    SettingValueMap,
    RestockRecipientsValue,
    DailySummaryValue,
    BusinessHoursValue,
    CurrencyTaxValue,
    MaintenanceModeValue,
    LogRetentionValue,
    AppointmentNotificationsValue,
    SystemSetting,
} from "@/utils/types/settings"
import {
    getSettings,
    updateSetting,
    initializeSettings,
} from "@/server/actions/settings"
import { ServiceType } from "@/utils/types/payroll"
import { NotificationContext } from "@/components/notifications"
import { SideBarContext } from "@/components/sidebar"
import { getProfiles } from "@/server/actions/profile"
import { UserProfile } from "@/utils/types/auth"
import {
    BellIcon,
    BriefcaseIcon,
    ServerIcon,
    SaveIcon,
    LoaderCircleIcon,
    UserRoundIcon,
    PlusIcon,
    PencilIcon,
    RotateCcwIcon,
    TrashIcon,

    PackageIcon,
    Settings2Icon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import {
    createService,
    deleteService,
    getInactiveServices,
    getServices,
    restoreService,
    ServiceWithItems,
    updateService,
} from "@/server/actions/services"
import { getInventory } from "@/server/actions/inventory"
import { InventoryItem } from "@/utils/types/inventory"
import AdminActionGuard from "@/components/admin/AdminActionGuard"
import { useBranchContext } from "@/components/branch-context"
import ServiceModal from "@/components/services/ServiceModal"

import { DayOfWeek, DayHours } from "@/utils/types/settings"

export default function ConfigPage() {
    // Refs
    const restockRecipientsRef = useRef<HTMLDivElement>(null)

    // Contexts
    const { userInfo } = useContext(SideBarContext)
    const { addNotification } = useContext(NotificationContext)
    const { currentBranch } = useBranchContext()

    // States
    const [activeCategory, setActiveCategory] = useState<
        SettingCategory | "Services"
    >("Services")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [users, setUsers] = useState<UserProfile[]>([])

    // -- Services
    const [services, setServices] = useState<ServiceWithItems[]>([])
    const [inactiveServices, setInactiveServices] = useState<
        ServiceWithItems[]
    >([])
    const [showInactiveServices, setShowInactiveServices] = useState(false)
    const [inventory, setInventory] = useState<InventoryItem[]>([])
    const [isEditingService, setIsEditingService] = useState(false)
    const [editingServiceId, setEditingServiceId] = useState<string | null>(
        null
    )
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [serviceForm, setServiceForm] = useState({
        title: "",
        price: 0,
        pricing_type: "FIXED" as "FIXED" | "HOURLY",
        hourly_rate: 0,
        items: [] as { inventory_id: string; quantity: number }[],
        branch_id: null as string | null,
        service_type: "TATTOO" as ServiceType,
        is_shared: false,
    })

    // Filter services by branch
    const filteredServices = useMemo(() => {
        // If no branch selected, show all services
        if (!currentBranch) {
            return services
        }
        // Filter services: show services for current branch OR shared services
        return services.filter(
            (service) =>
                service.branch_id === currentBranch.id || service.is_shared === true
        )
    }, [services, currentBranch])

    const filteredInactiveServices = useMemo(() => {
        // If no branch selected, show all inactive services
        if (!currentBranch) {
            return inactiveServices
        }
        // Filter inactive services: show services for current branch OR shared services
        return inactiveServices.filter(
            (service) =>
                service.branch_id === currentBranch.id || service.is_shared === true
        )
    }, [inactiveServices, currentBranch])

    // -- Settings
    const [restockRecipients, setRestockRecipients] =
        useState<RestockRecipientsValue>({ user_ids: [] })
    const [dailySummary, setDailySummary] = useState<DailySummaryValue>({
        enabled: false,
        recipients: [],
    })
    const [businessHours, setBusinessHours] = useState<BusinessHoursValue>({
        monday: { open: "09:00", close: "18:00", closed: false },
        tuesday: { open: "09:00", close: "18:00", closed: false },
        wednesday: { open: "09:00", close: "18:00", closed: false },
        thursday: { open: "09:00", close: "18:00", closed: false },
        friday: { open: "09:00", close: "18:00", closed: false },
        saturday: { open: "10:00", close: "16:00", closed: false },
        sunday: { open: "10:00", close: "16:00", closed: true },
        branch_overrides: {},
    })
    const [useGlobalHours, setUseGlobalHours] = useState(true)
    const [currencyTax, setCurrencyTax] = useState<CurrencyTaxValue>({
        currency_symbol: "$",
        tax_rate: 0.12,
        tax_enabled: true,
        tax_inclusive: true,
    })
    const [maintenanceMode, setMaintenanceMode] =
        useState<MaintenanceModeValue>({
            enabled: false,
            message: "System is under maintenance. Please check back later.",
        })
    const [logRetention, setLogRetention] = useState<LogRetentionValue>({
        days: 90,
    })
    const [_appointmentNotifications, setAppointmentNotifications] =
        useState<AppointmentNotificationsValue>({ mode: 'all_admins' })

    // Helper function to populate settings state from result
    const populateSettingsFromResult = useCallback((settings: SystemSetting[]) => {
        settings.forEach((setting) => {
            switch (setting.key) {
                case "restock_recipients":
                    setRestockRecipients(setting.value as RestockRecipientsValue)
                    break
                case "daily_summary":
                    setDailySummary(setting.value as DailySummaryValue)
                    break
                case "business_hours":
                    const hours = setting.value as BusinessHoursValue
                    setBusinessHours(hours)
                    // Determine if current branch uses global hours
                    if (currentBranch && hours.branch_overrides?.[currentBranch.id]) {
                        setUseGlobalHours(false)
                    } else {
                        setUseGlobalHours(true)
                    }
                    break
                case "currency_tax":
                    setCurrencyTax(setting.value as CurrencyTaxValue)
                    break
                case "maintenance_mode":
                    setMaintenanceMode(setting.value as MaintenanceModeValue)
                    break
                case "log_retention":
                    setLogRetention(setting.value as LogRetentionValue)
                    break
                case "appointment_notifications":
                    setAppointmentNotifications(setting.value as AppointmentNotificationsValue)
                    break
            }
        })
    }, [currentBranch])

    // Functions
    const fetchSettings = useCallback(async () => {
        setLoading(true)
        try {
            const result = await getSettings()
            if (result.success && result.data && result.data.settings.length > 0) {
                // Populate local state using helper function
                populateSettingsFromResult(result.data.settings)
            } else {
                // Initialize settings if empty
                const initResult = await initializeSettings(userInfo.id)
                if (initResult.success) {
                    // Fetch the newly initialized settings (non-recursive)
                    const newResult = await getSettings()
                    if (newResult.success && newResult.data && newResult.data.settings.length > 0) {
                        populateSettingsFromResult(newResult.data.settings)
                    }
                }
            }
        } catch (_error) {
            addNotification("Failed to load settings", "ERROR")
        } finally {
            setLoading(false)
        }
    }, [userInfo.id, addNotification, populateSettingsFromResult])

    const fetchUsers = useCallback(async () => {
        const profiles = await getProfiles()
        if (profiles) {
            setUsers(profiles)
        }
    }, [])

    const fetchServicesData = useCallback(async () => {
        const result = await getServices({ branchId: currentBranch?.id })
        if (result.success && result.data) {
            setServices(result.data.services)
        }
    }, [currentBranch?.id])

    const fetchInactiveServicesData = useCallback(async () => {
        const result = await getInactiveServices()
        if (result.success && result.data) {
            setInactiveServices(result.data.services)
        }
    }, [])

    const fetchInventoryData = useCallback(async () => {
        const data = await getInventory()
        setInventory(data)
    }, [])

    useEffect(() => {
        fetchSettings()
        fetchUsers()
        fetchServicesData()
        fetchInactiveServicesData()
        fetchInventoryData()
    }, [fetchSettings, fetchUsers, fetchServicesData, fetchInactiveServicesData, fetchInventoryData])

    // Update useGlobalHours when branch changes
    useEffect(() => {
        if (currentBranch && businessHours.branch_overrides?.[currentBranch.id]) {
            setUseGlobalHours(false)
        } else {
            setUseGlobalHours(true)
        }
    }, [currentBranch, businessHours.branch_overrides])

    const handleSave = async <K extends SettingKey>(
        key: K,
        value: SettingValueMap[K]
    ) => {
        setSaving(true)
        const result = await updateSetting(key, value, userInfo.id)
        if (result.success) {
            addNotification("Setting saved successfully", "SUCCESS")
            await fetchSettings()
        } else {
            addNotification("Failed to save setting", "ERROR")
        }
        setSaving(false)
    }

    const handleSaveService = async (form: typeof serviceForm) => {
        if (!form.title || form.price < 0) {
            addNotification("Please fill in all required fields", "ERROR")
            return
        }

        setSaving(true)
        let result

        if (editingServiceId) {
            result = await updateService(
                editingServiceId,
                form,
                userInfo.id
            )
        } else {
            result = await createService(form, userInfo.id)
        }

        if (result.success) {
            addNotification(
                `Service ${editingServiceId ? "updated" : "created"} successfully`,
                "SUCCESS"
            )
            setIsEditingService(false)
            setEditingServiceId(null)
            setServiceForm({ title: "", price: 0, pricing_type: "FIXED", hourly_rate: 0, items: [], branch_id: null, service_type: "TATTOO", is_shared: false })
            await fetchServicesData()
            await fetchInactiveServicesData()
        } else {
            addNotification(
                `Failed to ${editingServiceId ? "update" : "create"} service`,
                "ERROR"
            )
        }
        setSaving(false)
    }

    const handleDeleteService = async (id: string) => {
        if (confirm("Are you sure you want to delete this service?")) {
            const result = await deleteService(id, userInfo.id)
            if (result.success) {
                addNotification("Service deleted successfully", "SUCCESS")
                await fetchServicesData()
                await fetchInactiveServicesData()
            } else {
                addNotification("Failed to delete service", "ERROR")
            }
        }
    }

    const handleRestoreService = async (id: string) => {
        const result = await restoreService(id, userInfo.id)
        if (result.success) {
            addNotification("Service restored successfully", "SUCCESS")
            await fetchServicesData()
            await fetchInactiveServicesData()
            setShowInactiveServices(false)
        } else {
            addNotification("Failed to restore service", "ERROR")
        }
    }

    const categoryIcon = (category: SettingCategory | "Services") => {
        switch (category) {
            case "Services":
                return <PackageIcon className='w-5 h-5' />
            case "Notifications":
                return <BellIcon className='w-5 h-5' />
            case "Business":
                return <BriefcaseIcon className='w-5 h-5' />
            case "System":
                return <ServerIcon className='w-5 h-5' />
        }
    }

    // Render
    const renderServicesSettings = () => (
        <div className='flex flex-col gap-4 w-full h-full overflow-hidden relative'>
            <div className='flex justify-between items-center'>
                <div className='flex items-center gap-4'>
                    <h3 className='text-xl font-semibold'>
                        {showInactiveServices
                            ? "Deleted Services"
                            : "Services List"}
                    </h3>
                </div>
                <div className='flex items-center gap-2'>
                    {filteredInactiveServices.length > 0 && (
                        <Button
                            onClick={() =>
                                setShowInactiveServices(!showInactiveServices)
                            }
                            variant='outline'
                            size='sm'
                            className={showInactiveServices ? "bg-amber-400/20 hover:bg-amber-400/30" : ""}
                        >
                            <RotateCcwIcon size={16} />
                            {showInactiveServices
                                ? `Active (${filteredServices.length})`
                                : `Deleted (${filteredInactiveServices.length})`}
                        </Button>
                    )}
                    {!showInactiveServices && (
                        <Button
                                onClick={() => {
                                    setServiceForm({
                                        title: "",
                                        price: 0,
                                        pricing_type: "FIXED",
                                        hourly_rate: 0,
                                        items: [],
                                        branch_id: currentBranch?.id ?? null,
                                        service_type: "TATTOO",
                                        is_shared: false,
                                    })
                                    setEditingServiceId(null)
                                    setIsEditingService(true)
                                }}
                            size='sm'
                        >
                            <PlusIcon size={16} />
                            Add Service
                        </Button>
                    )}
                </div>
            </div>

            <div className='flex-1 overflow-y-auto'>
                <div className='grid grid-cols-1 gap-3'>
                    {showInactiveServices ? (
                        filteredInactiveServices.length === 0 ? (
                            <div className='text-center py-12 text-white/40'>
                                No deleted services found.
                            </div>
                        ) : (
                            filteredInactiveServices.map((service) => (
                                <motion.div
                                    key={service.id}
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className='bg-white/5 border border-white/5 rounded-lg p-4 flex items-center justify-between group hover:border-white/10 transition-colors opacity-60'
                                >
                                    <div className='flex flex-col gap-1'>
                                        <h4 className='font-medium text-lg'>
                                            {service.title}
                                        </h4>
                                        <div className='flex items-center gap-4 text-sm text-white/60'>
                                            <span>
                                                {service.pricing_type === "HOURLY"
                                                    ? `${currencyTax.currency_symbol}${service.hourly_rate.toFixed(2)}/hr`
                                                    : `${currencyTax.currency_symbol}${service.price.toFixed(2)}`}
                                            </span>
                                            {service.pricing_type === "HOURLY" && (
                                                <span className='text-xs bg-amber-400/20 px-2 py-0.5 rounded'>
                                                    HOURLY
                                                </span>
                                            )}
                                            {service.service_type && (
                                                <span className={`text-xs px-2 py-0.5 rounded ${
                                                    service.service_type === 'TATTOO' ? 'bg-purple-400/20 text-purple-300' :
                                                    service.service_type === 'PIERCING' ? 'bg-cyan-400/20 text-cyan-300' :
                                                    'bg-orange-400/20 text-orange-300'
                                                }`}>
                                                    {service.service_type}
                                                </span>
                                            )}
                                            {service.is_shared && (
                                                <span className='bg-green-400/20 text-xs px-2 py-0.5 rounded text-green-300'>
                                                    SHARED
                                                </span>
                                            )}
                                            {service.items.length > 0 && (
                                                <span className='flex items-center gap-1'>
                                                    <PackageIcon size={14} />
                                                    {service.items.length}{" "}
                                                    linked item
                                                    {service.items.length !== 1
                                                        ? "s"
                                                        : ""}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                <div className='flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity'>
                                    <AdminActionGuard
                                        onAction={() =>
                                            handleRestoreService(service.id)
                                        }
                                    >
                                        <Button
                                            variant='ghost'
                                            size='icon'
                                            className='text-green-400 hover:text-green-400 hover:bg-green-400/20'
                                            title='Restore'
                                        >
                                            <RotateCcwIcon size={18} />
                                        </Button>
                                    </AdminActionGuard>
                                </div>
                                </motion.div>
                            ))
                        )
                    ) : filteredServices.length === 0 ? (
                        <div className='text-center py-12 text-white/40'>
                            No services found. Create one to get started.
                        </div>
                    ) : (
                        filteredServices.map((service) => (
                            <motion.div
                                key={service.id}
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className='bg-white/5 border border-white/5 rounded-lg p-4 flex items-center justify-between group hover:border-white/10 transition-colors'
                            >
                                <div className='flex flex-col gap-1'>
                                    <h4 className='font-medium text-lg'>
                                        {service.title}
                                    </h4>
                                    <div className='flex items-center gap-4 text-sm text-white/60'>
                                        <span>
                                            {service.pricing_type === "HOURLY"
                                                ? `${currencyTax.currency_symbol}${service.hourly_rate.toFixed(2)}/hr`
                                                : `${currencyTax.currency_symbol}${service.price.toFixed(2)}`}
                                        </span>
                                        {service.pricing_type === "HOURLY" && (
                                            <span className='text-xs bg-amber-400/20 px-2 py-0.5 rounded'>
                                                HOURLY
                                            </span>
                                        )}
                                        {service.service_type && (
                                            <span className={`text-xs px-2 py-0.5 rounded ${
                                                service.service_type === 'TATTOO' ? 'bg-purple-400/20 text-purple-300' :
                                                service.service_type === 'PIERCING' ? 'bg-cyan-400/20 text-cyan-300' :
                                                'bg-orange-400/20 text-orange-300'
                                            }`}>
                                                {service.service_type}
                                            </span>
                                        )}
                                        {service.is_shared && (
                                            <span className='text-xs bg-green-400/20 px-2 py-0.5 rounded text-green-300'>
                                                SHARED
                                            </span>
                                        )}
                                        {service.items.length > 0 && (
                                            <span className='flex items-center gap-1'>
                                                <PackageIcon size={14} />
                                                {service.items.length} linked
                                                item
                                                {service.items.length !== 1
                                                    ? "s"
                                                    : ""}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className='flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity'>
                                    <Button
                                        onClick={() => {
                                            setServiceForm({
                                                title: service.title,
                                                price: service.price,
                                                pricing_type: service.pricing_type,
                                                hourly_rate: service.hourly_rate,
                                                items: service.items.map(
                                                    (i) => ({
                                                        inventory_id:
                                                            i.inventory_id,
                                                        quantity: Number(
                                                            i.quantity
                                                        ),
                                                    })
                                                ),
                                                branch_id: service.branch_id ?? null,
                                                service_type: service.service_type ?? "TATTOO",
                                                is_shared: service.is_shared ?? false,
                                            })
                                            setEditingServiceId(service.id)
                                            setIsEditingService(true)
                                        }}
                                        variant='ghost'
                                        size='icon'
                                        className='text-blue-400 hover:text-blue-400'
                                        title='Edit'
                                    >
                                        <PencilIcon size={18} />
                                    </Button>
                                    <AdminActionGuard
                                        onAction={() =>
                                            handleDeleteService(service.id)
                                        }
                                    >
                                        <Button
                                            variant='ghost'
                                            size='icon'
                                            className='text-red-400 hover:text-red-400'
                                            title='Delete'
                                        >
                                            <TrashIcon size={18} />
                                        </Button>
                                    </AdminActionGuard>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </div>

            <ServiceModal
                isOpen={isEditingService}
                onClose={() => {
                    setIsEditingService(false)
                    setEditingServiceId(null)
                }}
                onSave={async (form) => {
                    setServiceForm(form)
                    await handleSaveService(form)
                }}
                editingService={
                    editingServiceId
                        ? services.find((s) => s.id === editingServiceId) ?? null
                        : null
                }
                inventory={inventory}
                currencySymbol={currencyTax.currency_symbol}
                saving={saving}
            />
        </div>
    )

    const renderNotificationSettings = () => (
        <div className='flex flex-col gap-4 w-full h-full overflow-auto'>
            {/* Restock Recipients */}
            <div
                ref={restockRecipientsRef}
                className='w-full flex flex-row gap-4 items-center justify-between flex-wrap'
            >
                <h3 className='text-xl font-semibold flex flex-row gap-2 items-center select-none'>
                    Restock Alert Recipients{" "}
                    <div className='h-6 w-[1px] bg-white/40' />
                    {restockRecipients.user_ids.length ?? 0}
                </h3>
                <div className='flex flex-row gap-2 flex-wrap w-max'>
                    <AdminActionGuard
                        onAction={() =>
                            handleSave("restock_recipients", restockRecipients)
                        }
                    >
                        <Button
                            size='sm'
                        >
                            <SaveIcon size={16} /> Save
                        </Button>
                    </AdminActionGuard>
                </div>
            </div>
            <motion.div
                className='flex-1 w-full overflow-auto'
                style={{
                    maxHeight: `calc(50% - ${
                        restockRecipientsRef.current?.offsetHeight ?? 0
                    }px - 1rem)`,
                }}
            >
                <motion.table
                    className={`min-w-max w-full h-max table-auto border-collapse relative`}
                >
                    <thead className='sticky top-0 bg-black/80'>
                        <tr className='text-nowrap select-none'>
                            <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase w-max border-b border-white'>
                                Role
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>
                                Name
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>
                                Email
                            </th>
                            <th className='text-left px-4 py-2 text-sm text-white font-bold uppercase border-b border-white'>
                                Included?
                            </th>
                        </tr>
                    </thead>
                    <motion.tbody layout>
                        <AnimatePresence
                            mode='popLayout'
                            initial={false}
                        >
                            {
                                // Filter Role
                                users
                                    .filter(
                                        (u) =>
                                            u.role === "admin" ||
                                            u.access_flags?.includes(
                                                "inventory"
                                            )
                                    )
                                    .map(
                                        ({
                                            id,
                                            full_name,
                                            avatar_url,
                                            email,
                                            role,
                                        }) => {
                                            return (
                                                <motion.tr
                                                    className='hover:bg-white/5 transition-colors text-nowrap'
                                                    key={id}
                                                    layout
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                >
                                                    <td className='px-3 py-1 text-sm font-medium w-max capitalize'>
                                                        <div
                                                            className={`border-2 border-white/10 px-2 capitalize rounded-lg cursor-pointer w-max ${
                                                                role ===
                                                                    "admin" &&
                                                                "bg-orange-400/20"
                                                            }
                                                            ${
                                                                role ===
                                                                    "manager" &&
                                                                "bg-purple-400/20"
                                                            }
                                                            ${
                                                                role ===
                                                                    "staff" &&
                                                                "bg-blue-400/20"
                                                            }
                                                            ${
                                                                (role === "artist" || role === "piercer" || role === "shoe_tech") &&
                                                                "bg-green-400/20"
                                                            }`}
                                                        >
                                                            {role}
                                                        </div>
                                                    </td>
                                                    <td className='px-3 py-1 text-sm font-medium h-10 w-max flex flex-row gap-2 items-center'>
                                                        <div
                                                            className={`aspect-square rounded-full w-6 h-6 flex items-center justify-center cursor-pointer bg-white/10 hover:bg-white/30 transition-colors overflow-clip ${
                                                                avatar_url
                                                                    ? "p-0"
                                                                    : "p-1"
                                                            }`}
                                                            draggable={false}
                                                        >
                                                            {avatar_url ? (
                                                                <Image
                                                                    src={
                                                                        avatar_url
                                                                    }
                                                                    alt='avatar'
                                                                    width={300}
                                                                    height={300}
                                                                    className='rounded-full w-full h-full object-cover object-center'
                                                                    unoptimized
                                                                />
                                                            ) : (
                                                                <UserRoundIcon
                                                                    size={14}
                                                                    className='stroke-1'
                                                                />
                                                            )}
                                                        </div>
                                                        {full_name}
                                                    </td>
                                                    <td className='px-3 py-1 text-sm font-medium w-max'>
                                                        <a
                                                            href={`mailto:${email}`}
                                                            title={`send an email to ${full_name}`}
                                                            className='hover:underline hover:text-white/60 transition-colors'
                                                        >
                                                            {email}
                                                        </a>
                                                    </td>
                                                    <td className='px-3 py-2 w-max flex flex-row items-center justify-center'>
                                                        <input
                                                            type='checkbox'
                                                            checked={restockRecipients.user_ids.includes(
                                                                id
                                                            )}
                                                            onChange={(e) =>
                                                                setRestockRecipients(
                                                                    {
                                                                        ...restockRecipients,
                                                                        user_ids:
                                                                            e
                                                                                .target
                                                                                .checked
                                                                                ? [
                                                                                      ...restockRecipients.user_ids,
                                                                                      id,
                                                                                  ]
                                                                                : restockRecipients.user_ids.filter(
                                                                                      (
                                                                                          uid
                                                                                      ) =>
                                                                                          uid !==
                                                                                          id
                                                                                  ),
                                                                    }
                                                                )
                                                            }
                                                        />
                                                    </td>
                                                </motion.tr>
                                            )
                                        }
                                    )
                            }
                        </AnimatePresence>
                    </motion.tbody>
                </motion.table>
            </motion.div>

            {/* Daily Summary */}
            <div className='bg-white/5 border-2 border-white/5 rounded-lg p-4'>
                <h3 className='font-semibold text-lg mb-2'>Daily Summary</h3>
                <p className='text-sm text-white/60 mb-4'>
                    Automated daily email with appointments and low stock items
                </p>
                <label className='flex items-center gap-2 mb-4 cursor-pointer'>
                    <input
                        type='checkbox'
                        checked={dailySummary.enabled}
                        onChange={(e) =>
                            setDailySummary({
                                ...dailySummary,
                                enabled: e.target.checked,
                            })
                        }
                        className='w-4 h-4'
                    />
                    <span className='text-sm'>Enable daily summary email</span>
                </label>
                {dailySummary.enabled && (
                    <>
                        <div className='flex flex-col gap-2'>
                            <span className='text-sm text-white/60'>
                                Recipients
                            </span>
                            {users
                                .filter((u) => u.role === "admin")
                                .map((user) => (
                                    <label
                                        key={user.id}
                                        className='flex items-center gap-2 cursor-pointer'
                                    >
                                        <input
                                            type='checkbox'
                                            checked={dailySummary.recipients.includes(
                                                user.id
                                            )}
                                            onChange={(e) => {
                                                const newRecipients = e.target
                                                    .checked
                                                    ? [
                                                          ...dailySummary.recipients,
                                                          user.id,
                                                      ]
                                                    : dailySummary.recipients.filter(
                                                          (id) => id !== user.id
                                                      )
                                                setDailySummary({
                                                    ...dailySummary,
                                                    recipients: newRecipients,
                                                })
                                            }}
                                            className='w-4 h-4'
                                        />
                                        <span className='text-sm'>
                                            {user.full_name}
                                        </span>
                                    </label>
                                ))}
                        </div>
                    </>
                )}
                <AdminActionGuard
                    onAction={() => handleSave("daily_summary", dailySummary)}
                >
                    <Button
                        loading={saving}
                        size='sm'
                        className='mt-4'
                    >
                        <SaveIcon className='w-4 h-4' />
                        Save
                    </Button>
                </AdminActionGuard>
            </div>
        </div>
    )

    const renderBusinessSettings = () => {
        // Get the effective hours to display (branch override or global)
        const getEffectiveHours = (day: DayOfWeek): DayHours => {
            if (!useGlobalHours && currentBranch && businessHours.branch_overrides?.[currentBranch.id]?.[day]) {
                return businessHours.branch_overrides[currentBranch.id][day]!
            }
            return businessHours[day]
        }

        // Update hours based on current mode (global or branch override)
        const updateHours = (day: DayOfWeek, updates: Partial<DayHours>) => {
            const currentDayHours = getEffectiveHours(day)
            const newDayHours = { ...currentDayHours, ...updates }

            if (!useGlobalHours && currentBranch) {
                // Update branch override
                const branchOverrides = businessHours.branch_overrides || {}
                const branchHours = branchOverrides[currentBranch.id] || {}
                setBusinessHours({
                    ...businessHours,
                    branch_overrides: {
                        ...branchOverrides,
                        [currentBranch.id]: {
                            ...branchHours,
                            [day]: newDayHours,
                        },
                    },
                })
            } else {
                // Update global hours
                setBusinessHours({
                    ...businessHours,
                    [day]: newDayHours,
                })
            }
        }

        // Toggle use global hours
        const handleToggleGlobalHours = (checked: boolean) => {
            if (checked) {
                // Switching to global - remove branch override
                if (currentBranch && businessHours.branch_overrides?.[currentBranch.id]) {
                    const { [currentBranch.id]: _, ...restOverrides } = businessHours.branch_overrides
                    setBusinessHours({
                        ...businessHours,
                        branch_overrides: restOverrides,
                    })
                }
                setUseGlobalHours(true)
            } else {
                // Switching to branch-specific - copy global hours as starting point
                if (currentBranch) {
                    const branchOverrides = businessHours.branch_overrides || {}
                    setBusinessHours({
                        ...businessHours,
                        branch_overrides: {
                            ...branchOverrides,
                            [currentBranch.id]: {
                                monday: { ...businessHours.monday },
                                tuesday: { ...businessHours.tuesday },
                                wednesday: { ...businessHours.wednesday },
                                thursday: { ...businessHours.thursday },
                                friday: { ...businessHours.friday },
                                saturday: { ...businessHours.saturday },
                                sunday: { ...businessHours.sunday },
                            },
                        },
                    })
                }
                setUseGlobalHours(false)
            }
        }

        return (
            <div className='flex flex-col gap-6'>
                {/* Business Hours */}
                <div className='bg-white/5 border-2 border-white/5 rounded-lg p-4'>
                    <div className='flex items-center justify-between mb-2'>
                        <div>
                            <h3 className='font-semibold text-lg'>Operating Hours</h3>
                            <p className='text-sm text-white/60'>
                                Set your studio&apos;s operating hours
                            </p>
                        </div>
                    </div>

                    {/* Global/Branch Toggle - only show when a branch is selected */}
                    {currentBranch && (
                        <div className='bg-white/5 rounded-md p-3 mb-4'>
                            <label className='flex items-center gap-3 cursor-pointer'>
                                <input
                                    type='checkbox'
                                    checked={useGlobalHours}
                                    onChange={(e) => handleToggleGlobalHours(e.target.checked)}
                                    className='w-4 h-4'
                                />
                                <div className='flex flex-col'>
                                    <span className='text-sm font-medium'>Use global hours</span>
                                    <span className='text-xs text-white/60'>
                                        {useGlobalHours
                                            ? `Using global hours for ${currentBranch.name}`
                                            : `Using custom hours for ${currentBranch.name}`}
                                    </span>
                                </div>
                            </label>
                        </div>
                    )}

                    <div className='flex flex-col gap-3'>
                        {(
                            [
                                "monday",
                                "tuesday",
                                "wednesday",
                                "thursday",
                                "friday",
                                "saturday",
                                "sunday",
                            ] as DayOfWeek[]
                        ).map((day) => {
                            const dayHours = getEffectiveHours(day)
                            return (
                                <div
                                    key={day}
                                    className='grid grid-cols-[100px_1fr_1fr_auto] gap-3 items-center'
                                >
                                    <span className='capitalize text-sm'>{day}</span>
                                    <input
                                        type='time'
                                        value={dayHours.open}
                                        onChange={(e) =>
                                            updateHours(day, { open: e.target.value })
                                        }
                                        disabled={dayHours.closed}
                                        className='bg-white/10 rounded-md px-3 py-2 text-sm disabled:opacity-50'
                                    />
                                    <input
                                        type='time'
                                        value={dayHours.close}
                                        onChange={(e) =>
                                            updateHours(day, { close: e.target.value })
                                        }
                                        disabled={dayHours.closed}
                                        className='bg-white/10 rounded-md px-3 py-2 text-sm disabled:opacity-50'
                                    />
                                    <label className='flex items-center gap-2 cursor-pointer'>
                                        <input
                                            type='checkbox'
                                            checked={dayHours.closed}
                                            onChange={(e) =>
                                                updateHours(day, { closed: e.target.checked })
                                            }
                                            className='w-4 h-4'
                                        />
                                        <span className='text-sm'>Closed</span>
                                    </label>
                                </div>
                            )
                        })}
                    </div>
                    <AdminActionGuard
                        onAction={() => handleSave("business_hours", businessHours)}
                    >
                        <Button
                            loading={saving}
                            size='sm'
                            className='mt-4'
                        >
                            <SaveIcon className='w-4 h-4' />
                            Save
                        </Button>
                    </AdminActionGuard>
                </div>

            {/* Currency & Tax */}
            <div className='bg-white/5 border-2 border-white/5 rounded-lg p-4'>
                <h3 className='font-semibold text-lg mb-2'>Currency & Tax</h3>
                <p className='text-sm text-white/60 mb-4'>
                    Set currency and tax defaults
                </p>
                <div className='flex flex-col gap-4'>
                    <label className='flex flex-col gap-1'>
                        <span className='text-sm text-white/60'>
                            Currency symbol
                        </span>
                        <input
                            type='text'
                            value={currencyTax.currency_symbol}
                            onChange={(e) =>
                                setCurrencyTax({
                                    ...currencyTax,
                                    currency_symbol: e.target.value,
                                })
                            }
                            className='bg-white/10 rounded-md px-3 py-2 text-sm'
                        />
                    </label>
                    <label className='flex flex-col gap-1'>
                        <span className='text-sm text-white/60'>
                            Tax rate (decimal, e.g., 0.12 for 12%)
                        </span>
                        <input
                            type='number'
                            step='0.01'
                            value={currencyTax.tax_rate}
                            onChange={(e) =>
                                setCurrencyTax({
                                    ...currencyTax,
                                    tax_rate: Number(e.target.value),
                                })
                            }
                            className='bg-white/10 rounded-md px-3 py-2 text-sm'
                        />
                    </label>
                    <label className='flex flex-col gap-1'>
                        <span className='text-sm text-white/60'>
                            Tax Enabled
                        </span>
                        <select
                            value={currencyTax.tax_enabled ? "true" : "false"}
                            onChange={(e) => {
                                setCurrencyTax({
                                    ...currencyTax,
                                    tax_enabled: e.target.value === "true",
                                })
                            }}
                            className='bg-white/10 rounded-md px-3 py-2 text-sm'
                        >
                            <option value='true'>Yes</option>
                            <option value='false'>No</option>
                        </select>
                    </label>
                    {currencyTax.tax_enabled && (
                        <label className='flex flex-col gap-1'>
                            <span className='text-sm text-white/60'>
                                Tax Mode
                            </span>
                            <select
                                value={
                                    currencyTax.tax_inclusive
                                        ? "inclusive"
                                        : "exclusive"
                                }
                                onChange={(e) => {
                                    setCurrencyTax({
                                        ...currencyTax,
                                        tax_inclusive:
                                            e.target.value === "inclusive",
                                    })
                                }}
                                className='bg-white/10 rounded-md px-3 py-2 text-sm'
                            >
                                <option value='inclusive'>
                                    Inclusive (tax included in price)
                                </option>
                                <option value='exclusive'>
                                    Exclusive (tax added on top)
                                </option>
                            </select>
                            <span className='text-xs text-white/40 mt-1'>
                                {currencyTax.tax_inclusive
                                    ? "Prices shown already include tax. Tax will be extracted from the total."
                                    : "Prices shown are before tax. Tax will be added to the total."}
                            </span>
                        </label>
                    )}
                </div>
                <AdminActionGuard
                    onAction={() => handleSave("currency_tax", currencyTax)}
                >
                    <Button
                        loading={saving}
                        className='mt-4'
                    >
                        <SaveIcon className='w-4 h-4' />
                        Save
                    </Button>
                </AdminActionGuard>
            </div>
        </div>
    )
    }

    const renderSystemSettings = () => (
        <div className='flex flex-col gap-6'>
            {/* Maintenance Mode */}
            <div className='bg-white/5 border-2 border-white/5 rounded-lg p-4'>
                <h3 className='font-semibold text-lg mb-2'>Maintenance Mode</h3>
                <p className='text-sm text-white/60 mb-4'>
                    Prevent non-admin access during maintenance
                </p>
                <label className='flex items-center gap-2 mb-4 cursor-pointer'>
                    <input
                        type='checkbox'
                        checked={maintenanceMode.enabled}
                        onChange={(e) =>
                            setMaintenanceMode({
                                ...maintenanceMode,
                                enabled: e.target.checked,
                            })
                        }
                        className='w-4 h-4'
                    />
                    <span className='text-sm'>Enable maintenance mode</span>
                </label>
                {maintenanceMode.enabled && (
                    <label className='flex flex-col gap-1'>
                        <span className='text-sm text-white/60'>
                            Maintenance message
                        </span>
                        <textarea
                            value={maintenanceMode.message}
                            onChange={(e) =>
                                setMaintenanceMode({
                                    ...maintenanceMode,
                                    message: e.target.value,
                                })
                            }
                            className='bg-white/10 rounded-md px-3 py-2 text-sm resize-none'
                            rows={3}
                        />
                    </label>
                )}
                <AdminActionGuard
                    onAction={() =>
                        handleSave("maintenance_mode", maintenanceMode)
                    }
                >
                    <Button
                        loading={saving}
                        size='sm'
                        className='mt-4'
                    >
                        <SaveIcon className='w-4 h-4' />
                        Save
                    </Button>
                </AdminActionGuard>
            </div>

            {/* Log Retention */}
            <div className='bg-white/5 border-2 border-white/5 rounded-lg p-4'>
                <h3 className='font-semibold text-lg mb-2'>
                    Log Retention Period
                </h3>
                <p className='text-sm text-white/60 mb-4'>
                    How long to keep system logs
                </p>
                <label className='flex flex-col gap-1'>
                    <span className='text-sm text-white/60'>Days</span>
                    <input
                        type='number'
                        value={logRetention.days}
                        onChange={(e) =>
                            setLogRetention({
                                days: Number(e.target.value),
                            })
                        }
                        className='bg-white/10 rounded-md px-3 py-2 text-sm'
                    />
                </label>
                <AdminActionGuard
                    onAction={() => handleSave("log_retention", logRetention)}
                >
                    <Button
                        loading={saving}
                        size='sm'
                        className='mt-4'
                    >
                        <SaveIcon className='w-4 h-4' />
                        Save
                    </Button>
                </AdminActionGuard>
            </div>
        </div>
    )

    return (
        <div className='w-full h-full flex flex-col gap-4'>
            <div className='flex flex-row gap-8 items-end'>
                <div>
                    <h1 className='text-2xl font-bold flex items-center gap-2'>
                        <Settings2Icon className='w-6 h-6' />
                        Configuration
                    </h1>
                    <p className='text-white/60 text-sm mt-1'>
                        Manage system settings
                    </p>
                </div>
                <div className='flex flex-row gap-4'>
                    {(
                        [
                            "Services",
                            "Notifications",
                            "Business",
                            "System",
                        ] as const
                    ).map((category) => (
                        <motion.button
                            key={category}
                            className={`font-medium cursor-pointer transition-colors hover:text-white flex items-center gap-2 ${
                                activeCategory === category
                                    ? "text-white"
                                    : "text-white/60"
                            }`}
                            onClick={() => setActiveCategory(category)}
                        >
                            {categoryIcon(category)}
                            {category}
                        </motion.button>
                    ))}
                </div>
            </div>
            <div className='flex-1 overflow-y-auto'>
                {loading ? (
                    <div className='w-full h-full flex items-center justify-center'>
                        <LoaderCircleIcon className='w-8 h-8 animate-spin' />
                    </div>
                ) : (
                    <>
                        {activeCategory === "Services" &&
                            renderServicesSettings()}
                        {activeCategory === "Notifications" &&
                            renderNotificationSettings()}
                        {activeCategory === "Business" &&
                            renderBusinessSettings()}
                        {activeCategory === "System" && renderSystemSettings()}
                    </>
                )}
            </div>
        </div>
    )
}
