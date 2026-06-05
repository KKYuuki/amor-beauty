"use client"

import { useCallback, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
    CalendarFoldIcon,
    ClockIcon,
    ArrowLeftIcon,
    LoaderCircleIcon,
    CheckIcon,
    TrashIcon,
    Building2,
} from "lucide-react"
import { NotificationContext } from "@/components/notifications"
import { SideBarContext } from "@/components/sidebar"
import CompleteAppointmentModal from "@/components/appointments/completeAppointmentModal"
import {
    getAppointment,
    setAppointmentStatus,
    updateAppointment,
    getAppointmentDetails,
    getAppointmentServices,
    getAppointmentItems,
    addServiceToAppointment,
    removeServiceFromAppointment,
    addAppointmentItem,
    updateAppointmentItem,
    deleteAppointmentItem,
    updateAppointmentDetails,
} from "@/server/actions/appointments"
import { createTransactionFromAppointment, getTransactionByAppointmentId } from "@/server/actions/sales"
import { getServices } from "@/server/actions/services"
import { getInventory } from "@/server/actions/inventory"
import { getBranches } from "@/server/actions/branches"
import { Service } from "@/utils/types/general"
import { InventoryItem } from "@/utils/types/inventory"
import { Branch } from "@/utils/types/branch"
import { getProfilesByIds, getStaffProfiles } from "@/server/actions/profile"
import { useBranchContext } from "@/components/branch-context"
import { getStatusBadgeClasses } from "@/utils/appointment-styles"
import { Appointment, AppointmentStatus, TattooAppointment, ShoeAppointment, PiercingAppointment, AppointmentService, AppointmentItem } from "@/utils/types/general"
import TattooDetailsEdit from "@/components/appointments/TattooDetailsEdit"
import PiercingDetailsEdit from "@/components/appointments/PiercingDetailsEdit"
import ShoeDetailsEdit from "@/components/appointments/ShoeDetailsEdit"
import AppointmentActionBar from "@/components/appointments/AppointmentActionBar"
import AppointmentPaymentSection from "@/components/appointments/AppointmentPaymentSection"
import { UserProfile } from "@/utils/types/auth"

interface AppointmentDetailClientProps {
    appointment: Appointment
    appointmentDetails: TattooAppointment | ShoeAppointment | PiercingAppointment | null
}

export default function AppointmentDetailClient({
    appointment: initialAppointment,
    appointmentDetails: initialDetails,
}: AppointmentDetailClientProps) {
    const router = useRouter()
    const { addNotification } = useContext(NotificationContext)
    const { userInfo } = useContext(SideBarContext)
    const { currentBranch } = useBranchContext()

    const [appointment, setAppointment] = useState<Appointment>(initialAppointment)
    const [appointmentDetails, setAppointmentDetails] = useState<TattooAppointment | ShoeAppointment | PiercingAppointment | null>(initialDetails)
    const [services, setServices] = useState<AppointmentService[]>([])
    const [items, setItems] = useState<AppointmentItem[]>([])
    const [profilesMap, setProfilesMap] = useState<Map<string, UserProfile>>(new Map())
    const [loading, setLoading] = useState(false)
    const [showCompleteModal, setShowCompleteModal] = useState(false)
    const [creatingTransaction, setCreatingTransaction] = useState(false)
    const [existingTransactionId, setExistingTransactionId] = useState<string | null>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [editForm, setEditForm] = useState({
        title: appointment.title || '',
        time_start: new Date(appointment.time_start),
        time_end: new Date(appointment.time_end),
        staff_id: appointment.staff_id || '',
        branch_id: appointment.branch_id || '',
        notes: appointment.notes || '',
        client_name: appointment.client_name || '',
        client_phone: appointment.client_phone || '',
        client_email: appointment.client_email || '',
    })
    const [saving, setSaving] = useState(false)
    const [staffList, setStaffList] = useState<UserProfile[]>([])
    const [branches, setBranches] = useState<Branch[]>([])
    const [typeSpecificDetails, setTypeSpecificDetails] = useState<Record<string, unknown>>(initialDetails ? { ...initialDetails } : {})

    // Services & Items editing
    const [availableServices, setAvailableServices] = useState<Service[]>([])
    const [availableInventory, setAvailableInventory] = useState<InventoryItem[]>([])
    const [selectedServiceId, setSelectedServiceId] = useState<string>("")
    const [selectedInventoryId, setSelectedInventoryId] = useState<string>("")
    const [loadingServices, setLoadingServices] = useState(false)
    const [loadingItems, setLoadingItems] = useState(false)
    const [savingDetails, setSavingDetails] = useState(false)

    // Handle saving type-specific details to database
    const handleSaveDetails = async (
        type: 'TATTOO' | 'PIERCING' | 'SHOE',
        details: Record<string, unknown>
    ) => {
        setSavingDetails(true)
        try {
            // Extract only relevant fields for each type to prevent cross-contamination
            let updateData: Record<string, unknown> = {}
            if (type === 'TATTOO') {
                updateData = {
                    design_concept: details.design_concept,
                    body_placement: details.body_placement,
                    size_estimate: details.size_estimate,
                    is_color: details.is_color,
                }
            } else if (type === 'PIERCING') {
                updateData = {
                    piercing_location: details.piercing_location,
                    jewelry_material: details.jewelry_material,
                    jewelry_style: details.jewelry_style,
                }
            } else if (type === 'SHOE') {
                updateData = {
                    shoe_name: details.shoe_name,
                    quantity: details.quantity,
                    cleaning_service: details.cleaning_service,
                    drop_off_date: details.drop_off_date,
                }
            }

            const result = await updateAppointmentDetails(
                appointment.id,
                type,
                updateData
            )
            if (result) {
                addNotification('Details saved', 'SUCCESS')
            } else {
                addNotification('Failed to save details', 'ERROR')
            }
        } catch (error) {
            addNotification(
                error instanceof Error ? error.message : 'Failed to save details',
                'ERROR'
            )
        } finally {
            setSavingDetails(false)
        }
    }

    // Load appointment data on mount
    const loadAppointmentData = useCallback(async () => {
        setLoading(true)

        try {
            // Fetch fresh appointment data
            const result = await getAppointment(appointment.id)
            if (result.success && result.data) {
                const freshAppointment = result.data
                setAppointment(freshAppointment)

                // Fetch related data
                const userIds = new Set<string>()
                if (freshAppointment.client_id) userIds.add(freshAppointment.client_id)
                if (freshAppointment.staff_id) userIds.add(freshAppointment.staff_id)

                if (userIds.size > 0) {
                    const profiles = await getProfilesByIds(Array.from(userIds))
                    const map = new Map<string, UserProfile>()
                    profiles.forEach((p) => map.set(p.id, p))
                    setProfilesMap(map)
                }

                // Fetch services and items
                const [appServices, appItems] = await Promise.all([
                    getAppointmentServices(freshAppointment.id),
                    getAppointmentItems(freshAppointment.id),
                ])
                if (appServices) setServices(appServices as AppointmentService[])
                if (appItems.success && appItems.data) setItems(appItems.data)

                // Fetch details if type exists
                if (freshAppointment.type) {
                    const details = await getAppointmentDetails(freshAppointment.id, freshAppointment.type)
                    setAppointmentDetails(details)
                }
            }
        } catch (error) {
            addNotification(
                error instanceof Error ? error.message : "Failed to load appointment data",
                "ERROR"
            )
        } finally {
            setLoading(false)
        }
    }, [appointment.id, addNotification])

    useEffect(() => {
        loadAppointmentData()
    }, [loadAppointmentData])

    // Load staff list for editing
    useEffect(() => {
        const loadStaff = async () => {
            const staff = await getStaffProfiles()
            setStaffList(staff)
        }
        loadStaff()
    }, [])

    // Load branches for editing
    useEffect(() => {
        const loadBranches = async () => {
            const result = await getBranches()
            if (result.success && result.data) {
                setBranches(result.data)
            }
        }
        loadBranches()
    }, [])

    // Load services and inventory when entering edit mode
    useEffect(() => {
        if (isEditing) {
            const loadServicesAndInventory = async () => {
                const [servicesResult, inventoryItems] = await Promise.all([
                    getServices({ branchId: currentBranch?.id }),
                    getInventory({ branchId: currentBranch?.id }),
                ])
                if (servicesResult.success) {
                    setAvailableServices(servicesResult.data.services)
                }
                setAvailableInventory(inventoryItems)
            }
            loadServicesAndInventory()
        }
    }, [isEditing, currentBranch?.id])

    // Check if transaction already exists for completed appointments
    useEffect(() => {
        if (appointment.status === "COMPLETED") {
            const checkExistingTransaction = async () => {
                const result = await getTransactionByAppointmentId(appointment.id)
                if (result.success && result.data) {
                    setExistingTransactionId(result.data.transactionId)
                }
            }
            checkExistingTransaction()
        }
    }, [appointment.id, appointment.status])

    const handleStatusChange = async (newStatus: AppointmentStatus) => {
        addNotification(
            newStatus === "CANCELLED" ? "Cancelling appointment..." :
            newStatus === "CONFIRMED" ? "Confirming appointment..." : "Updating status...",
            "INFO"
        )

        try {
            const result = await setAppointmentStatus(appointment.id, newStatus)
            if (!result.success) {
                addNotification(result.error || "Error updating appointment status", "ERROR")
                return
            }
            if (result.data) {
                setAppointment(result.data)
            }
            addNotification(
                newStatus === "CANCELLED" ? "Appointment cancelled" :
                newStatus === "CONFIRMED" ? "Appointment confirmed" : "Status updated",
                "SUCCESS"
            )
        } catch (error) {
            addNotification(
                error instanceof Error ? error.message : "Failed to update appointment status",
                "ERROR"
            )
        }
    }

    const handleMarkOnGoing = async () => {
        addNotification("Marking as on-going...", "INFO")

        try {
            const result = await setAppointmentStatus(appointment.id, 'ONGOING')
            if (!result.success) {
                addNotification(result.error || "Error marking appointment as on-going", "ERROR")
                return
            }
            if (result.data) {
                setAppointment(result.data)
            }
            addNotification("Appointment marked as on-going", "SUCCESS")
        } catch (error) {
            addNotification(
                error instanceof Error ? error.message : "Failed to mark appointment as on-going",
                "ERROR"
            )
        }
    }

    const handleComplete = async (updated: Appointment | null) => {
        if (!updated) {
            addNotification("Failed to complete appointment", "ERROR")
            return
        }
        setAppointment(updated)
        setShowCompleteModal(false)
        addNotification("Appointment completed", "SUCCESS")
    }

    const handleCreateTransaction = async () => {
        if (!appointment || appointment.status !== "COMPLETED") return

        // If transaction already exists, just redirect to it
        if (existingTransactionId) {
            router.push(`/sales?transactionId=${existingTransactionId}`)
            return
        }

        setCreatingTransaction(true)
        addNotification("Creating sales record...", "INFO")

        try {
            const result = await createTransactionFromAppointment(appointment.id)

            if (result.success && result.data) {
                addNotification("Sales record created successfully", "SUCCESS")
                setExistingTransactionId(result.data.transactionId)
                router.push(`/sales?transactionId=${result.data.transactionId}`)
            } else if (!result.success) {
                addNotification(result.error || "Failed to create sales record", "ERROR")
            }
        } catch (error) {
            addNotification(
                error instanceof Error ? error.message : "Failed to create sales record",
                "ERROR"
            )
        } finally {
            setCreatingTransaction(false)
        }
    }

    const clientInfo = appointment.client_id ? profilesMap.get(appointment.client_id) : undefined
    const staffInfo = appointment.staff_id ? profilesMap.get(appointment.staff_id) : undefined

    const isStaff = userInfo.id !== appointment.client_id
    const isAssignedStaff = userInfo.id === appointment.staff_id

    // Services & Items handlers
    const handleAddService = async () => {
        if (!selectedServiceId) return
        setLoadingServices(true)
        const result = await addServiceToAppointment(appointment.id, selectedServiceId)
        if (result.success) {
            addNotification("Service added successfully", "SUCCESS")
            const updatedServices = await getAppointmentServices(appointment.id)
            if (updatedServices) setServices(updatedServices as AppointmentService[])
        } else {
            addNotification(result.error || "Failed to add service", "ERROR")
        }
        setLoadingServices(false)
        setSelectedServiceId("")
    }

    const handleRemoveService = async (serviceId: string) => {
        if (!confirm("Are you sure you want to remove this service?")) return
        setLoadingServices(true)
        const result = await removeServiceFromAppointment(appointment.id, serviceId)
        if (!result.success) {
            addNotification(result.error || "Failed to remove service", "ERROR")
        } else {
            addNotification("Service removed successfully", "SUCCESS")
            setServices(services.filter(s => s.service_id !== serviceId))
        }
        setLoadingServices(false)
    }

    const handleAddItem = async () => {
        if (!selectedInventoryId) return
        setLoadingItems(true)
        const result = await addAppointmentItem(appointment.id, selectedInventoryId, 1)
        if (!result.success) {
            addNotification(result.error || "Failed to add item", "ERROR")
        } else {
            addNotification("Item added successfully", "SUCCESS")
            const updatedItems = await getAppointmentItems(appointment.id)
            if (updatedItems.success && updatedItems.data) setItems(updatedItems.data)
        }
        setLoadingItems(false)
        setSelectedInventoryId("")
    }

    const handleUpdateItem = async (itemId: string, quantity: number) => {
        if (quantity < 1) return
        const result = await updateAppointmentItem(itemId, quantity)
        if (!result.success) {
            addNotification(result.error || "Failed to update item quantity", "ERROR")
        } else {
            setItems(items.map(item => item.id === itemId ? { ...item, quantity } : item))
        }
    }

    const handleDeleteItem = async (itemId: string) => {
        if (!confirm("Are you sure you want to remove this item?")) return
        setLoadingItems(true)
        const result = await deleteAppointmentItem(itemId)
        if (!result.success) {
            addNotification(result.error || "Failed to remove item", "ERROR")
        } else {
            addNotification("Item removed successfully", "SUCCESS")
            setItems(items.filter(i => i.id !== itemId))
        }
        setLoadingItems(false)
    }

    const startDate = new Date(appointment.time_start)
    const endDate = new Date(appointment.time_end)

    // Update edit form when appointment changes
    useEffect(() => {
        setEditForm({
            title: appointment.title || '',
            time_start: new Date(appointment.time_start),
            time_end: new Date(appointment.time_end),
            staff_id: appointment.staff_id || '',
            branch_id: appointment.branch_id || '',
            notes: appointment.notes || '',
            client_name: appointment.client_name || '',
            client_phone: appointment.client_phone || '',
            client_email: appointment.client_email || '',
        })
    }, [appointment])

    const handleSaveEdit = async () => {
        setSaving(true)
        try {
            const result = await updateAppointment(appointment.id, {
                title: editForm.title,
                time_start: editForm.time_start,
                time_end: editForm.time_end,
                staff_id: editForm.staff_id || null,
                branch_id: editForm.branch_id || null,
                notes: editForm.notes,
                client_name: editForm.client_name,
                client_phone: editForm.client_phone,
                client_email: editForm.client_email,
            })
            
            if (result.success) {
                addNotification("Appointment updated", "SUCCESS")
                setIsEditing(false)
                if (result.data) {
                    setAppointment(result.data)
                }
                router.refresh()
            } else {
                addNotification(result.error || "Failed to update appointment", "ERROR")
            }
        } catch (_error) {
            addNotification("An unexpected error occurred", "ERROR")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="w-full h-full flex flex-col gap-4 p-4">
            {/* Complete Appointment Modal */}
            {showCompleteModal && (
                <CompleteAppointmentModal
                    appointment={appointment}
                    onClose={() => setShowCompleteModal(false)}
                    onComplete={handleComplete}
                />
            )}

            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => router.push("/appointments")}
                    className="p-2 rounded-md hover:bg-white/10 transition-colors"
                    title="Back to appointments"
                >
                    <ArrowLeftIcon size={24} />
                </button>
                <h1 className="text-2xl font-bold">Appointment Details</h1>
            </div>

            {/* Action Bar */}
            <AppointmentActionBar
                appointment={appointment}
                isStaff={isStaff}
                isAssignedStaff={isAssignedStaff}
                isEditing={isEditing}
                saving={saving}
                creatingTransaction={creatingTransaction}
                existingTransactionId={existingTransactionId}
                onStatusChange={handleStatusChange}
                onMarkOnGoing={handleMarkOnGoing}
                onShowCompleteModal={() => setShowCompleteModal(true)}
                onCreateTransaction={handleCreateTransaction}
                onEditStart={() => setIsEditing(true)}
                onEditSave={handleSaveEdit}
                onEditCancel={() => {
                    setIsEditing(false)
                    setEditForm({
                        title: appointment.title || '',
                        time_start: new Date(appointment.time_start),
                        time_end: new Date(appointment.time_end),
                        staff_id: appointment.staff_id || '',
                        branch_id: appointment.branch_id || '',
                        notes: appointment.notes || '',
                        client_name: appointment.client_name || '',
                        client_phone: appointment.client_phone || '',
                        client_email: appointment.client_email || '',
                    })
                }}
            />

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="w-full h-64 flex items-center justify-center">
                        <LoaderCircleIcon size={32} className="animate-spin" />
                    </div>
                ) : (
                    <div className="flex flex-col gap-6 max-w-4xl">
                        {/* Appointment Header Card */}
                        <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                <div className="flex-1">
                                    <span className="text-xs font-semibold text-white/40">ID: {appointment.id}</span>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={editForm.title}
                                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                            className="w-full mt-1 px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none text-2xl font-semibold"
                                            placeholder="Appointment Title"
                                        />
                                    ) : (
                                        <h2 className="text-2xl font-semibold mt-1">{appointment.title}</h2>
                                    )}
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className={`px-2 py-0.5 rounded-sm text-xs font-semibold border ${getStatusBadgeClasses(appointment.status)}`}>
                                            {appointment.status}
                                        </span>
                                        {appointment.is_walkin && (
                                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-sm text-xs font-semibold border border-green-400/20">
                                                Walk-in
                                            </span>
                                        )}
                                        <span className="px-2 py-0.5 bg-blue-400/20 text-white/80 rounded-sm text-xs font-semibold border border-white/10 capitalize">
                                            {appointment.type?.toLowerCase() || "other"}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-3 md:text-right">
                                    {isEditing ? (
                                        <>
                                            <div>
                                                <span className="text-xs text-white/60 block mb-1">Start Time</span>
                                                <input
                                                    type="datetime-local"
                                                    value={editForm.time_start.toISOString().slice(0, 16)}
                                                    onChange={(e) => setEditForm({ ...editForm, time_start: new Date(e.target.value) })}
                                                    className="px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <span className="text-xs text-white/60 block mb-1">End Time</span>
                                                <input
                                                    type="datetime-local"
                                                    value={editForm.time_end.toISOString().slice(0, 16)}
                                                    onChange={(e) => setEditForm({ ...editForm, time_end: new Date(e.target.value) })}
                                                    className="px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none"
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2 md:justify-end text-white">
                                                <CalendarFoldIcon size={16} />
                                                <span className="font-semibold">
                                                    {startDate.toLocaleDateString("en-PH", {
                                                        month: "long",
                                                        day: "numeric",
                                                        year: "numeric",
                                                    })}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 md:justify-end text-white/60">
                                                <ClockIcon size={16} />
                                                <span>
                                                    {startDate.toLocaleTimeString("en-PH", {
                                                        hour: "numeric",
                                                        minute: "numeric",
                                                    })} - {endDate.toLocaleTimeString("en-PH", {
                                                        hour: "numeric",
                                                        minute: "numeric",
                                                    })}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* People Card */}
                        <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                            <h3 className="text-lg font-semibold mb-4">People</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {isEditing ? (
                                    <>
                                        <div>
                                            <span className="text-sm text-white/60">Client Name</span>
                                            <input
                                                type="text"
                                                value={editForm.client_name}
                                                onChange={(e) => setEditForm({ ...editForm, client_name: e.target.value })}
                                                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none mt-1"
                                                placeholder="Client name"
                                            />
                                        </div>
                                        <div>
                                            <span className="text-sm text-white/60">Staff</span>
                                            <select
                                                value={editForm.staff_id}
                                                onChange={(e) => setEditForm({ ...editForm, staff_id: e.target.value })}
                                                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none mt-1"
                                            >
                                                <option value="">Unassigned</option>
                                                {staffList.map((s) => (
                                                    <option key={s.id} value={s.id}>{s.full_name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <span className="text-sm text-white/60">Client Phone</span>
                                            <input
                                                type="tel"
                                                value={editForm.client_phone}
                                                onChange={(e) => setEditForm({ ...editForm, client_phone: e.target.value })}
                                                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none mt-1"
                                                placeholder="Phone number"
                                            />
                                        </div>
                                        <div>
                                            <span className="text-sm text-white/60">Client Email</span>
                                            <input
                                                type="email"
                                                value={editForm.client_email}
                                                onChange={(e) => setEditForm({ ...editForm, client_email: e.target.value })}
                                                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none mt-1"
                                                placeholder="Email address"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <span className="text-sm text-white/60">Client</span>
                                            <p className="font-medium">
                                                {appointment.is_walkin 
                                                    ? (appointment.client_name || "Walk-in Client")
                                                    : (clientInfo?.full_name || "Unknown Client")
                                                }
                                                {appointment.is_walkin && appointment.client_phone && (
                                                    <span className="block text-sm text-white/60 mt-1">
                                                        {appointment.client_phone}
                                                    </span>
                                                )}
                                                {appointment.is_walkin && appointment.client_email && (
                                                    <span className="block text-sm text-white/60 mt-1">
                                                        {appointment.client_email}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="text-sm text-white/60">Staff</span>
                                            <p className="font-medium">
                                                {staffInfo?.full_name || "Unassigned"}
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Branch Info */}
                        {(appointment.branch_name || isEditing) && (
                            <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                                <h3 className="text-lg font-semibold mb-4">Location</h3>
                                {isEditing ? (
                                    <div>
                                        <span className="text-sm text-white/60 block mb-1">Branch</span>
                                        <select
                                            value={editForm.branch_id || ""}
                                            onChange={(e) => setEditForm({ ...editForm, branch_id: e.target.value })}
                                            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none"
                                        >
                                            <option value="">No Branch</option>
                                            {branches.map((b) => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Building2 size={16} className="text-white/60" />
                                        <span className="font-medium">{appointment.branch_name}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Notes */}
                        {(appointment.notes || isEditing) && (
                            <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                                <h3 className="text-lg font-semibold mb-2">Notes</h3>
                                {isEditing ? (
                                    <textarea
                                        value={editForm.notes}
                                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md focus:border-white/40 outline-none min-h-[100px]"
                                        placeholder="Add notes..."
                                    />
                                ) : (
                                    <p className="text-white/80 whitespace-pre-wrap">{appointment.notes}</p>
                                )}
                            </div>
                        )}

                        {/* Payment Section */}
                        <AppointmentPaymentSection
                            appointment={appointment}
                            downpaymentId={appointment.downpayment_id ?? null}
                            downpaymentAmount={appointment.downpayment_amount ?? null}
                        />

                        {/* Timing Info */}
                        {(appointment.actual_time_start || appointment.actual_time_end) && (
                            <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                                <h3 className="text-lg font-semibold mb-4">Actual Timing</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {appointment.actual_time_start && (
                                        <div>
                                            <span className="text-sm text-white/60">Started</span>
                                            <p className="font-medium">
                                                {new Date(appointment.actual_time_start).toLocaleString("en-PH")}
                                            </p>
                                        </div>
                                    )}
                                    {appointment.actual_time_end && (
                                        <div>
                                            <span className="text-sm text-white/60">Completed</span>
                                            <p className="font-medium">
                                                {new Date(appointment.actual_time_end).toLocaleString("en-PH")}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Services */}
                        {(services.length > 0 || isEditing) && (
                            <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                                <h3 className="text-lg font-semibold mb-4">Services</h3>
                                {isEditing && (
                                    <div className="flex gap-2 mb-4">
                                        <select
                                            value={selectedServiceId}
                                            onChange={(e) => setSelectedServiceId(e.target.value)}
                                            className="flex-1 bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white outline-none focus:border-white/40"
                                        >
                                            <option value="">Select a service</option>
                                            {availableServices.map((service) => (
                                                <option key={service.id} value={service.id}>
                                                    {service.title} - ₱{service.price}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={handleAddService}
                                            disabled={!selectedServiceId || loadingServices}
                                            className="bg-blue-500/20 hover:bg-blue-500/30 border-2 border-white/10 text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Add
                                        </button>
                                    </div>
                                )}
                                <div className="flex flex-col gap-2">
                                    {services.map((service, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-black/40 p-3 rounded-md">
                                            <span>{service.service?.title || "Unknown Service"}</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-white/60">₱{service.service?.price}</span>
                                                {isEditing && (
                                                    <button
                                                        onClick={() => handleRemoveService(service.service_id)}
                                                        disabled={loadingServices}
                                                        className="text-red-400 hover:text-red-300 p-1 rounded-md hover:bg-red-400/10 transition-colors disabled:opacity-50"
                                                        title="Remove service"
                                                    >
                                                        <TrashIcon size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {services.length === 0 && (
                                        <div className="text-white/40 text-center py-4 italic">
                                            No services added
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Items */}
                        {(items.length > 0 || isEditing) && (
                            <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                                <h3 className="text-lg font-semibold mb-4">Items Used</h3>
                                {isEditing && (
                                    <div className="flex gap-2 mb-4">
                                        <select
                                            value={selectedInventoryId}
                                            onChange={(e) => setSelectedInventoryId(e.target.value)}
                                            className="flex-1 bg-white/10 border border-white/20 rounded-md px-3 py-2 text-white outline-none focus:border-white/40"
                                        >
                                            <option value="">Select an item</option>
                                            {availableInventory.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name} ({item.current_stock} in stock)
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={handleAddItem}
                                            disabled={!selectedInventoryId || loadingItems}
                                            className="bg-blue-500/20 hover:bg-blue-500/30 border-2 border-white/10 text-white px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Add
                                        </button>
                                    </div>
                                )}
                                <div className="flex flex-col gap-2">
                                    {items.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-black/40 p-3 rounded-md">
                                            <span>{item.inventory?.name || "Unknown Item"}</span>
                                            <div className="flex items-center gap-3">
                                                {isEditing ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-white/40">Qty:</span>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={item.quantity}
                                                            onChange={(e) => handleUpdateItem(item.id, parseInt(e.target.value) || 1)}
                                                            className="w-16 bg-white/10 border border-white/20 rounded-md px-2 py-1 text-center text-white outline-none focus:border-white/40"
                                                        />
                                                    </div>
                                                ) : (
                                                    <span className="text-white/60">x{item.quantity}</span>
                                                )}
                                                {isEditing && (
                                                    <button
                                                        onClick={() => handleDeleteItem(item.id)}
                                                        disabled={loadingItems}
                                                        className="text-red-400 hover:text-red-300 p-1 rounded-md hover:bg-red-400/10 transition-colors disabled:opacity-50"
                                                        title="Remove item"
                                                    >
                                                        <TrashIcon size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {items.length === 0 && (
                                        <div className="text-white/40 text-center py-4 italic">
                                            No items added
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Type-Specific Details */}
                        {appointmentDetails && appointment.type && (
                            <div className="bg-white/5 p-6 rounded-lg border border-white/10">
                                <h3 className="text-lg font-semibold mb-4">
                                    {appointment.type === "TATTOO" ? "Tattoo Details" :
                                     appointment.type === "PIERCING" ? "Piercing Details" :
                                     appointment.type === "SHOE" ? "Shoe Cleaning Details" : "Details"}
                                </h3>
                                {isEditing ? (
                                    <div className="grid grid-cols-1 gap-4">
                                        {appointment.type === "TATTOO" && (
                                            <>
                                                <TattooDetailsEdit
                                                    appointmentId={appointment.id}
                                                    initialData={typeSpecificDetails as {
                                                        design_concept?: string
                                                        body_placement?: string
                                                        size_estimate?: string
                                                        is_color?: boolean
                                                    }}
                                                    onUpdate={(data) => setTypeSpecificDetails(prev => ({ ...prev, ...data }))}
                                                />
                                                <button
                                                    onClick={() => handleSaveDetails('TATTOO', typeSpecificDetails)}
                                                    disabled={savingDetails}
                                                    className='flex items-center gap-2 px-4 py-2 bg-blue-400/20 hover:bg-blue-400/30 rounded-md border-2 border-white/5 font-semibold text-sm transition-colors self-start disabled:opacity-50'
                                                >
                                                    {savingDetails ? <LoaderCircleIcon className='w-4 h-4 animate-spin' /> : <CheckIcon className='w-4 h-4' />}
                                                    Save Tattoo Details
                                                </button>
                                            </>
                                        )}
                                        {appointment.type === "PIERCING" && (
                                            <>
                                                <PiercingDetailsEdit
                                                    appointmentId={appointment.id}
                                                    initialData={typeSpecificDetails as {
                                                        piercing_location?: string
                                                        jewelry_material?: string
                                                        jewelry_style?: string
                                                    }}
                                                    onUpdate={(data) => setTypeSpecificDetails(prev => ({ ...prev, ...data }))}
                                                />
                                                <button
                                                    onClick={() => handleSaveDetails('PIERCING', typeSpecificDetails)}
                                                    disabled={savingDetails}
                                                    className='flex items-center gap-2 px-4 py-2 bg-blue-400/20 hover:bg-blue-400/30 rounded-md border-2 border-white/5 font-semibold text-sm transition-colors self-start disabled:opacity-50'
                                                >
                                                    {savingDetails ? <LoaderCircleIcon className='w-4 h-4 animate-spin' /> : <CheckIcon className='w-4 h-4' />}
                                                    Save Piercing Details
                                                </button>
                                            </>
                                        )}
                                        {appointment.type === "SHOE" && (
                                            <>
                                                <ShoeDetailsEdit
                                                    appointmentId={appointment.id}
                                                    initialData={typeSpecificDetails as {
                                                        shoe_name?: string
                                                        quantity?: number
                                                        cleaning_service?: string
                                                        drop_off_date?: string
                                                    }}
                                                    onUpdate={(data) => setTypeSpecificDetails(prev => ({ ...prev, ...data }))}
                                                />
                                                <button
                                                    onClick={() => handleSaveDetails('SHOE', typeSpecificDetails)}
                                                    disabled={savingDetails}
                                                    className='flex items-center gap-2 px-4 py-2 bg-blue-400/20 hover:bg-blue-400/30 rounded-md border-2 border-white/5 font-semibold text-sm transition-colors self-start disabled:opacity-50'
                                                >
                                                    {savingDetails ? <LoaderCircleIcon className='w-4 h-4 animate-spin' /> : <CheckIcon className='w-4 h-4' />}
                                                    Save Shoe Details
                                                </button>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {appointment.type === "TATTOO" && appointmentDetails && "design_concept" in appointmentDetails && (
                                            <>
                                                <div>
                                                    <span className="text-sm text-white/60">Design Concept</span>
                                                    <p className="font-medium">{appointmentDetails.design_concept || "N/A"}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-white/60">Body Placement</span>
                                                    <p className="font-medium">{appointmentDetails.body_placement || "N/A"}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-white/60">Size Estimate</span>
                                                    <p className="font-medium">{appointmentDetails.size_estimate || "N/A"}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-white/60">Color</span>
                                                    <p className="font-medium">{appointmentDetails.is_color ? "Yes" : "No"}</p>
                                                </div>
                                            </>
                                        )}
                                        {appointment.type === "PIERCING" && appointmentDetails && "piercing_location" in appointmentDetails && (
                                            <>
                                                <div>
                                                    <span className="text-sm text-white/60">Location</span>
                                                    <p className="font-medium">{appointmentDetails.piercing_location || "N/A"}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-white/60">Jewelry Material</span>
                                                    <p className="font-medium">{appointmentDetails.jewelry_material || "N/A"}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-white/60">Jewelry Style</span>
                                                    <p className="font-medium">{appointmentDetails.jewelry_style}</p>
                                                </div>
                                            </>
                                        )}
                                        {appointment.type === "SHOE" && appointmentDetails && "shoe_name" in appointmentDetails && (
                                            <>
                                                <div>
                                                    <span className="text-sm text-white/60">Shoe Name</span>
                                                    <p className="font-medium">{appointmentDetails.shoe_name || "N/A"}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-white/60">Quantity</span>
                                                    <p className="font-medium">{appointmentDetails.quantity}</p>
                                                </div>
                                                <div>
                                                    <span className="text-sm text-white/60">Service</span>
                                                    <p className="font-medium">{appointmentDetails.cleaning_service}</p>
                                                </div>
                                                {appointmentDetails.drop_off_date && (
                                                    <div>
                                                        <span className="text-sm text-white/60">Drop-off Date</span>
                                                        <p className="font-medium">{new Date(appointmentDetails.drop_off_date).toLocaleDateString()}</p>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
