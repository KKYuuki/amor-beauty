import { NotificationContext } from "@/components/notifications"
import { UserProfile } from "@/utils/types/auth"
import {
    Appointment,
    AppointmentType,
    PiercingAppointment,
    PiercingJewelryType,
    ShoeAppointment,
    ShoeCleaningReglueType,
    ShoeCleaningServiceType,
    ShoeCleaningWhiteningType,
    TattooAppointment,
} from "@/utils/types/general"
import {
    CheckIcon,
    ClockIcon,
    LoaderCircleIcon,
    MinimizeIcon,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useContext, useEffect, useMemo, useState } from "react"
import {
    createAppointmentDetails,
    deleteAppointmentDetails,
    getAppointmentDetails,
    getStaffAppointments,
    updateAppointment,
    updateAppointmentDetails,
    getAppointmentServices,
    addServiceToAppointment,
    removeServiceFromAppointment,
    getAppointmentItems,
    addAppointmentItem,
    updateAppointmentItem,
    deleteAppointmentItem,
} from "@/server/actions/appointments"
import { getInventory } from "@/server/actions/inventory"
import { getServices } from "@/server/actions/services"
import {
    Service,
    AppointmentService,
    AppointmentItem,
} from "@/utils/types/general"
import { InventoryItem } from "@/utils/types/inventory"
import { PlusIcon, TrashIcon, UserIcon } from "lucide-react"
import { uploadImage as uploadImageServer } from "@/server/actions/storage"
import { compressImage } from "@/utils/compressImage"
import React from "react"

// Helper function to get image by ID (queries storage via server action)
interface ImageData {
    url: string
    thumbnail_url?: string
    is_3d: boolean
}

const getImage = async (imageId: string): Promise<ImageData | null> => {
    // For now, construct the URL from the image ID
    // In a full implementation, this would fetch from a getImage server action
    if (!imageId) return null
    return {
        url: `/api/images/${imageId}`,
        thumbnail_url: undefined,
        is_3d: false,
    }
}

// Wrapper for uploadImage to maintain backward compatibility
interface UploadResult {
    id: string
    url: string
}

const uploadImage = async (
    file: File,
    userId: string,
    _existingId?: string,
    _isTattoo?: boolean,
    _isWebsite?: boolean,
    _tattooData?: { size: string; tags: string },
    _is3D?: boolean,
    _modelId?: number,
    _type?: string,
    _overlayData?: unknown
): Promise<UploadResult | null> => {
    const result = await uploadImageServer(file, userId)
    if (result.success && result.data) {
        return {
            id: result.data.id,
            url: result.data.url,
        }
    }
    return null
}
import { ImageUploader } from "@/components/draganddrop"
import Image from "next/image"
import { useOverlay } from "@/components/overlayProvider"
import { SideBarContext } from "@/components/sidebar"
import { BoxIcon, EyeIcon } from "lucide-react"
import { getStaffProfiles } from "@/server/actions/profile"
import { OverlayData } from "@/utils/types/storage"

export default function EditAppointment({
    appointment,
    staffInfo,
    close,
    refreshAppointments,
}: {
    appointment: Appointment
    staffInfo?: UserProfile
    close: () => void
    refreshAppointments: () => void
}) {
    // Contexts
    const { addNotification } = useContext(NotificationContext)
    const { openOverlay } = useOverlay()
    const { userInfo } = useContext(SideBarContext)

    // States
    // - Appointment Base Info
    const [title, setTitle] = useState(appointment.title)
    const [date, setDate] = useState(new Date(appointment.time_start))
    const [startTime, setStartTime] = useState(
        new Date(appointment.time_start).getHours() % 12
    )
    const [endTime, setEndTime] = useState(
        new Date(appointment.time_end).getHours() % 12
    )
    const [notes, setNotes] = useState(appointment.notes || "")
    const [noteRows, setNoteRows] = useState(
        appointment.notes?.split("\n").length || 1
    )
    const [type, setType] = useState<AppointmentType | null>(appointment.type)
    const [selectedStaffId, setSelectedStaffId] = useState(appointment.staff_id || "")
    const [staffList, setStaffList] = useState<UserProfile[]>([])

    // - Time Slots
    const [availableSlots, setAvailableSlots] = useState<number[]>([])
    const [bookedRanges, setBookedRanges] = useState<
        { start: number; end: number }[]
    >([])

    // - Details
    const [detailsLoading, setDetailsLoading] = useState(true)

    // - Tattoo Info
    const [concept, setConcept] = useState("")
    const [placement, setPlacement] = useState("")
    const [sizeEst, setSizeEst] = useState(0)
    const [isColored, setIsColored] = useState(false)
    const [prepTime, setPrepTime] = useState(0)
    const [reference, setReference] = useState<File | null>()
    const [referenceUrl, setReferenceUrl] = useState("")
    const [referenceThumbnailUrl, setReferenceThumbnailUrl] = useState<
        string | null
    >(null)
    const [referenceId, setReferenceId] = useState("")
    const [referenceType, setReferenceType] = useState<
        "image" | "model" | "tattoo" | "decal"
    >("image")
    const referencePreviewUrl = useMemo(() => {
        if (reference) return URL.createObjectURL(reference)
        return null
    }, [reference])

    const [final, setFinal] = useState<File | null>()
    const [finalUrl, setFinalUrl] = useState("")
    const [finalThumbnailUrl, setFinalThumbnailUrl] = useState<string | null>(
        null
    )
    const [finalId, setFinalId] = useState("")
    const [finalType, setFinalType] = useState<
        "image" | "model" | "tattoo" | "decal"
    >("image")

    const finalPreviewUrl = useMemo(() => {
        if (final) return URL.createObjectURL(final)
        return null
    }, [final])

    // - Tattoo Details for Upload
    const [referenceIsTattoo, setReferenceIsTattoo] = useState(false)
    const [referenceTattooSize, setReferenceTattooSize] = useState("")
    const [referenceTattooTags, setReferenceTattooTags] = useState("")
    const [finalIsTattoo, setFinalIsTattoo] = useState(false)
    const [finalTattooSize, setFinalTattooSize] = useState("")
    const [finalTattooTags, setFinalTattooTags] = useState("")

    // - 3D Model Details for Upload
    const [referenceIs3D, setReferenceIs3D] = useState(false)
    const [finalIs3D, setFinalIs3D] = useState(false)
    // - Decal Overlay Data for 3D Placement
    const [referenceOverlayData, setReferenceOverlayData] =
        useState<OverlayData | null>(null)
    const [referenceChosenModel, _setReferenceChosenModel] = useState(0)
    const [finalOverlayData, setFinalOverlayData] =
        useState<OverlayData | null>(null)
    const [finalChosenModel, _setFinalChosenModel] = useState(0)

    // - Shoe Info
    const [shoeName, setShoeName] = useState("")
    const [quantity, setQuantity] = useState(0)
    const [dropOffDate, setDropOffDate] = useState<Date>(new Date())
    const [isDropOff, setIsDropOff] = useState(false)
    const [pickUpDate, setPickUpDate] = useState<Date>(new Date())
    const [isPickUp, setIsPickUp] = useState(false)
    const [cleaningService, setCleaningService] =
        useState<ShoeCleaningServiceType>("STANDARD")
    const [rush, setRush] = useState(false)
    const [replacement, setReplacement] = useState(false)
    const [waterRepellent, setWaterRepellent] = useState(false)
    const [soleWhitening, setSoleWhitening] =
        useState<ShoeCleaningWhiteningType>("NONE")
    const [reglueService, setReglueService] =
        useState<ShoeCleaningReglueType>("NONE")
    const [totalCost, setTotalCost] = useState(0)

    // - Piercing Info
    const [piercingLocation, setPiercingLocation] = useState("")
    const [material, setMaterial] = useState("")
    const [style, setStyle] = useState<PiercingJewelryType>("STUD")
    const [prevIssues, setPrevIssues] = useState(false)
    const [aftercare, setAftercare] = useState("")
    const [aftercareRows, setAftercareRows] = useState(1)

    // - Services
    const [services, setServices] = useState<Service[]>([])
    const [appointmentServices, setAppointmentServices] = useState<
        AppointmentService[]
    >([])
    const [appointmentItems, setAppointmentItems] = useState<AppointmentItem[]>(
        []
    )
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
    const [selectedInventoryId, setSelectedInventoryId] = useState<string>("")
    const [loadingItems, setLoadingItems] = useState(false)
    const [selectedServiceId, setSelectedServiceId] = useState<string>("")
    const [loadingServices, setLoadingServices] = useState(false)

    // Permissions - allow all users to edit services and inventory
    const canEditServices = true

    // Functions
    // - Services & Items
    const fetchServices = useCallback(async () => {
        setLoadingServices(true)
        setLoadingItems(true)
        const [allServicesResult, appServices, appItems, invItems] =
            await Promise.all([
                getServices(),
                getAppointmentServices(appointment.id),
                getAppointmentItems(appointment.id),
                getInventory(),
            ])
        if (allServicesResult.success) {
            setServices(allServicesResult.data.services)
        }
        setAppointmentServices(appServices as unknown as AppointmentService[])
        if (appItems.success && appItems.data) {
            setAppointmentItems(appItems.data)
        }
        setInventoryItems(invItems)
        setLoadingServices(false)
        setLoadingItems(false)
    }, [appointment.id])

    const handleAddService = async () => {
        if (!selectedServiceId) return
        setLoadingServices(true)
        const result = await addServiceToAppointment(
            appointment.id,
            selectedServiceId
        )
        if (!result.success) {
            addNotification(result.error || "Failed to add service", "ERROR")
        } else {
            addNotification("Service added successfully", "SUCCESS")
            await fetchServices()
        }
        setLoadingServices(false)
        setSelectedServiceId("")
    }

    const handleRemoveService = async (serviceId: string) => {
        if (!confirm("Are you sure you want to remove this service?")) return
        setLoadingServices(true)
        const result = await removeServiceFromAppointment(
            appointment.id,
            serviceId
        )
        if (!result.success) {
            addNotification(result.error || "Failed to remove service", "ERROR")
        } else {
            addNotification("Service removed successfully", "SUCCESS")
            await fetchServices()
        }
        setLoadingServices(false)
    }

    const handleAddItem = async () => {
        if (!selectedInventoryId) return
        setLoadingItems(true)
        const result = await addAppointmentItem(
            appointment.id,
            selectedInventoryId,
            1
        )
        if (!result.success) {
            addNotification(result.error || "Failed to add item", "ERROR")
        } else {
            addNotification("Item added successfully", "SUCCESS")
            await fetchServices()
        }
        setLoadingItems(false)
        setSelectedInventoryId("")
    }

    const handleUpdateItem = async (itemId: string, quantity: number) => {
        if (quantity < 0) return
        const result = await updateAppointmentItem(
            itemId,
            quantity
        )
        if (!result.success) {
            addNotification(result.error || "Failed to update item", "ERROR")
        } else {
            await fetchServices()
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
            await fetchServices()
        }
        setLoadingItems(false)
    }

    // - Time Slots
    const getAvailableTimeSlots = useCallback(
        async (staffId: string, date: Date) => {
            let availableTime = Array.from({ length: 10 }, (_, i) => i)
            const ranges: { start: number; end: number }[] = []
            await getStaffAppointments(staffId).then((result) => {
                if (result.success && result.data.length > 0) {
                    result.data
                        // Filter Only Confirmed
                        .filter((ap: Appointment) => ap.status === "CONFIRMED")
                        // Filter Out Current Appointment
                        .filter((ap: Appointment) => ap.id !== appointment.id)
                        // Filter only within the day selected
                        .filter((ap: Appointment) => {
                            if (
                                new Date(ap.time_start).getDate() !==
                                date.getDate()
                            )
                                return false
                            return true
                        })
                        // Remove Times and collect booked ranges
                        .forEach((ap: Appointment) => {
                            // Get Start Time to Remove
                            const start =
                                new Date(ap.time_start).getHours() % 12
                            // Get End Time to Remove
                            const end = new Date(ap.time_end).getHours() % 12

                            // Store the booked range
                            ranges.push({ start, end })

                            // Remove Times
                            availableTime = availableTime.filter(
                                (t) => t < start || t > end
                            )
                        })
                }
            })
            setAvailableSlots(availableTime)
            setBookedRanges(ranges)
        },
        [appointment.id]
    )

    // - Formatting
    function returnFormattedTime(time: number) {
        const resDate = new Date(date)
        resDate.setHours(time + 12, 0, 0, 0)
        return resDate
    }

    // Check if a proposed time range conflicts with any booked ranges
    function hasConflict(proposedStart: number, proposedEnd: number): boolean {
        return bookedRanges.some(
            (range) =>
                // Overlap exists if proposed range doesn't end before booked starts
                // AND doesn't start after booked ends
                proposedStart < range.end && proposedEnd > range.start
        )
    }

    // - Get Appointment Details
    const fetchAppointmentDetails = useCallback(async () => {
        await getAppointmentDetails(
            appointment.id,
            appointment.type as AppointmentType
        ).then(async (data) => {
            if (data) {
                switch (type) {
                    case "TATTOO":
                        const tattooData = data as TattooAppointment
                        setConcept(tattooData.design_concept)
                        setPlacement(tattooData.body_placement)
                        setSizeEst(tattooData.size_estimate || 0)
                        setIsColored(tattooData.is_color)
                        setPrepTime(tattooData.artist_prep_time || 0)
                        if (tattooData.reference_image_id) {
                            const refImg = await getImage(
                                tattooData.reference_image_id
                            )
                            if (refImg) {
                                setReferenceUrl(refImg.url)
                                setReferenceThumbnailUrl(
                                    refImg.thumbnail_url || null
                                )
                                setReferenceIs3D(refImg.is_3d)
                            }
                            setReferenceId(tattooData.reference_image_id)
                        }
                        if (tattooData.final_image_id) {
                            const finImg = await getImage(
                                tattooData.final_image_id
                            )
                            if (finImg) {
                                setFinalUrl(finImg.url)
                                setFinalThumbnailUrl(
                                    finImg.thumbnail_url || null
                                )
                                setFinalIs3D(finImg.is_3d)
                            }
                            setFinalId(tattooData.final_image_id)
                        }
                        break
                    case "SHOE":
                        const shoeData = data as ShoeAppointment
                        setShoeName(shoeData.shoe_name)
                        setQuantity(shoeData.quantity || 0)
                        if (shoeData.drop_off_date) {
                            setDropOffDate(new Date(shoeData.drop_off_date))
                            setIsDropOff(true)
                        }
                        if (shoeData.pick_up_date) {
                            setPickUpDate(new Date(shoeData.pick_up_date))
                            setIsPickUp(true)
                        }
                        setCleaningService(shoeData.cleaning_service)
                        setRush(shoeData.add_on_rush)
                        setReplacement(shoeData.add_on_replacement)
                        setWaterRepellent(shoeData.add_on_water_repellent)
                        setSoleWhitening(shoeData.sole_whitening)
                        setReglueService(shoeData.reglue_service)
                        setTotalCost(shoeData.total_cost || 0)
                        break
                    case "PIERCING":
                        const piercingData = data as PiercingAppointment
                        setPiercingLocation(piercingData.piercing_location)
                        setMaterial(piercingData.jewelry_material)
                        setStyle(piercingData.jewelry_style)
                        setPrevIssues(piercingData.previous_piercing_issues)
                        setAftercare(piercingData.aftercare_instructions || "")
                        setAftercareRows(
                            piercingData.aftercare_instructions?.split("\n")
                                .length || 1
                        )
                        break
                }
                setDetailsLoading(false)
            }
        })
    }, [appointment.id, appointment.type, type])

    // Effects
    // - OnLoad
    useEffect(() => {
        if (staffInfo) {
            getAvailableTimeSlots(staffInfo.id, date)
        }
        if (appointment.type) {
            fetchAppointmentDetails()
        } else {
            setDetailsLoading(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        appointment.type,
        date,
        fetchAppointmentDetails,
        getAvailableTimeSlots,
        staffInfo?.id,
    ])

    // - Fetch Services
    useEffect(() => {
        fetchServices()
        const fetchStaff = async () => {
            const staff = await getStaffProfiles()
            setStaffList(staff)
        }
        fetchStaff()
    }, [fetchServices])
 
    // - OnChange
    useEffect(() => {
        if (staffInfo) {
            getAvailableTimeSlots(staffInfo.id, date)
        }
    }, [date, getAvailableTimeSlots, staffInfo])

    // - Notes
    useEffect(() => {
        if (notes.trim().length > 0) {
            setNoteRows(notes.split("\n").length)
        }
    }, [setNoteRows, notes])

    // - Aftercare
    useEffect(() => {
        if (aftercare.trim().length > 0) {
            setAftercareRows(aftercare.split("\n").length)
        }
    }, [setAftercareRows, aftercare])

    // -- Shoe Appointment Cost
    useEffect(() => {
        let cost = 0
        if (quantity > 0) {
            // Service
            if (cleaningService === "STANDARD") cost += 450
            if (cleaningService === "DEEP") cost += 650
            if (cleaningService === "FULL") cost += 999

            // Add-Ons
            if (rush) cost += 150
            if (replacement) cost += 2000
            if (waterRepellent) cost += 150

            // Sole Whitening
            if (soleWhitening === "MINIMAL") cost += 300
            if (soleWhitening === "MEDIUM") cost += 600
            if (soleWhitening === "FULL") cost += 1000

            // Re-Glue
            if (reglueService === "MINIMAL") cost += 650
            if (reglueService === "MAJOR") cost += 1000
            if (reglueService === "FULL") cost += 2000

            // Final Cost
            cost = cost * quantity
        }
        setTotalCost(cost)
    }, [
        setTotalCost,
        quantity,
        cleaningService,
        soleWhitening,
        reglueService,
        rush,
        replacement,
        waterRepellent,
    ])

    return (
        <>
            <motion.div
                key='appointment-edit'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className='absolute top-1/2 left-1/2 -translate-1/2 z-[1] w-full h-full md:w-[calc(100%-1rem)] md:h-[calc(100%-1rem)] bg-black/90 backdrop-blur-sm border-2 border-white/5 rounded-lg p-4 flex flex-col gap-2'
            >
                <div className='w-full flex flex-row justify-between items-start'>
                    <h1 className='text-lg font-semibold text-white/60'>
                        Edit Appointment
                    </h1>
                    <div
                        title='Cancel Editing'
                        onClick={close}
                    >
                        <MinimizeIcon
                            size={20}
                            className='hover:stroke-red-400 cursor-pointer transition-colors'
                        />
                    </div>
                </div>
                <div className='w-full min-h-0.5 bg-white/10' />
                <div className='flex-1 flex flex-col gap-2 w-full max-h-full overflow-auto [&_label]:select-none [&_input]:cursor-text [&_textarea]:cursor-text [&_select]:cursor-pointer overflow-x-clip'>
                    {/* - Appointment Base Info */}
                    <label className='w-full font-semibold text-xs capitalize text-white/60'>
                        Appointment Title
                        <input
                            type='text'
                            placeholder='Appointment Name (max 25 characters)'
                            value={title}
                            onKeyDown={(e) => {
                                if (
                                    title.length < 25 ||
                                    e.key === "Backspace" ||
                                    e.key === "Delete" ||
                                    e.key === "ArrowLeft" ||
                                    e.key === "ArrowRight" ||
                                    e.key === "Tab"
                                ) {
                                    return
                                } else {
                                    e.preventDefault()
                                }
                            }}
                            onChange={(e) => {
                                setTitle(e.target.value)
                            }}
                            className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                        />
                    </label>
                    <label className='w-full font-semibold text-xs capitalize text-white/60'>
                        Assigned Staff
                        <div className='flex flex-row gap-2 items-center bg-black/40 px-2 py-1 mt-1 rounded-sm border-2 border-white/5 focus-within:border-white/40'>
                            <UserIcon
                                size={16}
                                className='text-white/60'
                            />
                            {                            userInfo.id !== appointment.client_id ? (
                                <select
                                    value={selectedStaffId}
                                    onChange={(e) =>
                                        setSelectedStaffId(e.target.value)
                                    }
                                    className='w-full bg-transparent text-base font-normal text-white outline-none cursor-pointer'
                                >
                                    {staffList
                                        .filter((staff) =>
                                            type === "TATTOO"
                                                ? staff.access_flags?.some(
                                                      (f) =>
                                                          f.toLowerCase() ===
                                                          "artist"
                                                  )
                                                : type === "PIERCING"
                                                  ? staff.access_flags?.some(
                                                        (f) =>
                                                            f.toLowerCase() ===
                                                            "piercing"
                                                    )
                                                  : type === "SHOE"
                                                    ? staff.access_flags?.some(
                                                          (f) =>
                                                              f.toLowerCase() ===
                                                              "shoe"
                                                      )
                                                    : staff.access_flags?.some(
                                                          (f) =>
                                                              [
                                                                  "artist",
                                                                  "piercing",
                                                                  "shoe",
                                                              ].includes(
                                                                  f.toLowerCase()
                                                              )
                                                      )
                                        )
                                        .map((staff) => (
                                            <option
                                                key={staff.id}
                                                value={staff.id}
                                                className='text-black'
                                            >
                                                {staff.full_name || staff.email}
                                            </option>
                                        ))}
                                </select>
                            ) : (
                                <span className='w-full bg-transparent text-base font-normal text-white outline-none cursor-pointer'>
                                    {
                                        staffList.find(
                                            (staff) =>
                                                staff.id ===
                                                appointment.staff_id
                                        )?.full_name
                                    }
                                </span>
                            )}
                        </div>
                    </label>
                    <label className='w-full font-semibold text-xs capitalize text-white/60 group relative'>
                        Date
                        <input
                            type='date'
                            placeholder='Enter Date'
                            value={date.toISOString().split("T")[0]}
                            onChange={(e) => {
                                setDate(new Date(e.target.value))
                            }}
                            min={new Date().toISOString().split("T")[0]}
                            className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40 z-0'
                        />
                    </label>
                    <div className='font-semibold text-xs capitalize text-white/60 group relative'>
                        Availability (both required)
                        <div className='flex flex-row gap-2 justify-between items-center'>
                            <label className='flex-1 font-semibold flex flex-row gap-2 items-center bg-black/40 px-2 py-1 mt-1 rounded-md text-base text-white border-2 border-white/5 focus:border-white/40'>
                                <ClockIcon size={16} />
                                <select
                                    title='Start Time'
                                    className='w-full outline-none bg-black/10'
                                    value={startTime}
                                    onChange={(e) => {
                                        setStartTime(Number(e.target.value))
                                        setEndTime(Number(e.target.value) + 1)
                                    }}
                                >
                                    <option
                                        value={0}
                                        defaultChecked
                                        disabled
                                    >
                                        Select Time
                                    </option>
                                    {Array.from({ length: 8 }).map((_, idx) => (
                                        <option
                                            value={idx + 1}
                                            key={`start-form-${idx}`}
                                            disabled={
                                                !availableSlots.includes(
                                                    idx + 1
                                                )
                                            }
                                        >
                                            {`${idx + 1}:00 PM`}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            ---
                            <label className='flex-1 font-semibold flex flex-row gap-2 items-center bg-black/40 px-2 py-1 mt-1 rounded-md text-base text-white border-2 border-white/5 focus:border-white/40'>
                                <ClockIcon size={16} />
                                <select
                                    disabled={startTime === 0}
                                    value={endTime}
                                    title='End Time'
                                    className='w-full outline-none bg-black/10'
                                    onChange={(e) => {
                                        if (
                                            Number(e.target.value) <= startTime
                                        ) {
                                            addNotification(
                                                "End time must be after start time",
                                                "WARNING"
                                            )
                                        } else {
                                            setEndTime(Number(e.target.value))
                                        }
                                    }}
                                >
                                    <option
                                        value={0}
                                        defaultChecked
                                        disabled
                                    >
                                        Select Time
                                    </option>
                                    {Array.from({ length: 9 }).map((_, idx) => (
                                        <option
                                            value={idx + 1}
                                            defaultChecked={idx === 0}
                                            key={`end-form-${idx}`}
                                            disabled={
                                                idx + 1 <= startTime ||
                                                hasConflict(startTime, idx + 1)
                                            }
                                        >
                                            {`${idx + 1}:00 PM`}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </div>
                    <label className='w-full font-semibold text-xs capitalize text-white/60'>
                        Notes
                        <motion.textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder='Enter extra info (optional)'
                            className='resize-none w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                            rows={noteRows}
                        />
                    </label>

                    {/* - Services Section */}
                    <div className='w-full flex flex-col gap-2'>
                        <label className='w-full font-semibold text-xs capitalize text-white/60'>
                            Services
                        </label>
                        <div className='flex gap-2'>
                            <select
                                value={selectedServiceId}
                                onChange={(e) =>
                                    setSelectedServiceId(e.target.value)
                                }
                                className='flex-1 bg-black/40 px-2 py-1 rounded-sm text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                            >
                                <option
                                    value=''
                                    disabled
                                >
                                    Select a Service
                                </option>
                                {services.map((service) => (
                                    <option
                                        key={service.id}
                                        value={service.id}
                                    >
                                        {service.title} - ₱{service.price}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={handleAddService}
                                disabled={
                                    !selectedServiceId ||
                                    loadingServices ||
                                    !canEditServices
                                }
                                className='bg-blue-500/20 hover:bg-blue-500/30 border-2 border-white/10 text-white px-3 py-1 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                                title={
                                    !canEditServices
                                        ? "Only assigned staff can edit services"
                                        : "Add Service"
                                }
                            >
                                <PlusIcon size={18} />
                            </button>
                        </div>

                        {/* List of Added Services */}
                        <div className='flex flex-col gap-2 mt-2'>
                            {appointmentServices.map(
                                (appService: AppointmentService) => (
                                    <div
                                        key={
                                            appService.service_id + "-apservice"
                                        }
                                        className='flex justify-between items-center bg-white/5 p-2 rounded-md border border-white/10'
                                    >
                                        <div className='flex flex-col'>
                                            <span className='text-sm font-medium text-white'>
                                                {appService.service?.title}
                                            </span>
                                            <span className='text-xs text-white/60'>
                                                ₱{appService.service?.price}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() =>
                                                handleRemoveService(
                                                    appService.service_id
                                                )
                                            }
                                            disabled={
                                                loadingServices ||
                                                !canEditServices
                                            }
                                            className='text-red-400 hover:text-red-300 p-1 rounded-md hover:bg-red-400/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                                            title={
                                                !canEditServices
                                                    ? "Only assigned staff can remove services"
                                                    : "Remove Service"
                                            }
                                        >
                                            <TrashIcon size={16} />
                                        </button>
                                    </div>
                                )
                            )}
                            {appointmentServices.length === 0 && (
                                <div className='text-xs text-white/40 text-center py-2 italic'>
                                    No services linked
                                </div>
                            )}
                        </div>
                    </div>

                    {/* - Inventory Section */}
                    <div className='w-full flex flex-col gap-2'>
                        <label className='w-full font-semibold text-xs capitalize text-white/60'>
                            Inventory Used
                        </label>
                        <div className='flex gap-2'>
                            <select
                                value={selectedInventoryId}
                                onChange={(e) =>
                                    setSelectedInventoryId(e.target.value)
                                }
                                className='flex-1 bg-black/40 px-2 py-1 rounded-sm text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                            >
                                <option
                                    value=''
                                    disabled
                                >
                                    Add Item
                                </option>
                                {inventoryItems.map((item) => (
                                    <option
                                        key={item.id}
                                        value={item.id}
                                    >
                                        {item.name} ({item.current_stock} in
                                        stock)
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={handleAddItem}
                                disabled={
                                    !selectedInventoryId ||
                                    loadingItems ||
                                    !canEditServices
                                }
                                className='bg-blue-500/20 hover:bg-blue-500/30 border-2 border-white/10 text-white px-3 py-1 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                                title={
                                    !canEditServices
                                        ? "Only assigned staff can add items"
                                        : "Add Item"
                                }
                            >
                                <PlusIcon size={18} />
                            </button>
                        </div>

                        {/* List of Added Items */}
                        <div className='flex flex-col gap-2 mt-2'>
                            {appointmentItems.map((item) => (
                                <div
                                    key={item.id}
                                    className='flex justify-between items-center bg-white/5 p-2 rounded-md border border-white/10'
                                >
                                    <div className='flex flex-col flex-1'>
                                        <span className='text-sm font-medium text-white'>
                                            {item.inventory?.name ||
                                                "Unknown Item"}
                                        </span>
                                        <span className='text-xs text-white/60'>
                                            {item.inventory?.item_code}
                                        </span>
                                    </div>
                                    <div className='flex items-center gap-3'>
                                        <div className='flex items-center gap-2 bg-black/20 rounded-md px-2 py-1 border border-white/5'>
                                            <span className='text-xs text-white/40'>
                                                Qty:
                                            </span>
                                            <input
                                                type='number'
                                                min='1'
                                                value={item.quantity}
                                                onChange={(e) =>
                                                    handleUpdateItem(
                                                        item.id,
                                                        parseInt(
                                                            e.target.value
                                                        ) || 0
                                                    )
                                                }
                                                disabled={!canEditServices}
                                                className='w-12 bg-transparent text-right text-sm text-white outline-none disabled:opacity-50'
                                            />
                                        </div>
                                        <button
                                            onClick={() =>
                                                handleDeleteItem(
                                                    item.id
                                                )
                                            }
                                            disabled={
                                                loadingItems || !canEditServices
                                            }
                                            className='text-red-400 hover:text-red-300 p-1 rounded-md hover:bg-red-400/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                                            title={
                                                !canEditServices
                                                    ? "Only assigned staff can remove items"
                                                    : "Remove Item"
                                            }
                                        >
                                            <TrashIcon size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {appointmentItems.length === 0 && (
                                <div className='text-xs text-white/40 text-center py-2 italic'>
                                    No items used
                                </div>
                            )}
                        </div>
                    </div>

                    <label className='w-full font-semibold text-xs capitalize text-white/60'>
                        Type
                        <select
                            value={type || ""}
                            onChange={(e) =>
                                setType(
                                    (e.target.value as AppointmentType) || null
                                )
                            }
                            className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                        >
                            <option value='TATTOO'>Tattoo</option>
                            <option value='SHOE'>Shoe Cleaning</option>
                            <option value='PIERCING'>Piercing</option>
                            <option value=''>Other</option>
                        </select>
                    </label>
                    {/* - End of Base Info */}
                    {(appointment.type !== null || type !== null) &&
                        (detailsLoading ? (
                            <div
                                key='appointment-edit-details-loading'
                                className='w-full flex items-centet justify-center my-8'
                            >
                                <LoaderCircleIcon
                                    size={24}
                                    className='animate-spin ease-in-out'
                                />
                            </div>
                        ) : (
                            <>
                                <div className='w-full min-h-0.5 bg-white/10' />
                                <AnimatePresence>
                                    {/* - Tattoo Details */}
                                    {type === "TATTOO" && (
                                        <React.Fragment key='tattoo-appointment'>
                                            <motion.label
                                                key='tattoo-concept'
                                                className='w-full font-semibold text-xs capitalize text-white/60'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Design Concept
                                                <input
                                                    type='text'
                                                    placeholder='Enter design concept (25 characters max)'
                                                    value={concept}
                                                    onKeyDown={(e) => {
                                                        if (
                                                            title.length < 25 ||
                                                            e.key ===
                                                                "Backspace" ||
                                                            e.key ===
                                                                "Delete" ||
                                                            e.key ===
                                                                "ArrowLeft" ||
                                                            e.key ===
                                                                "ArrowRight" ||
                                                            e.key === "Tab"
                                                        ) {
                                                            return
                                                        } else {
                                                            e.preventDefault()
                                                        }
                                                    }}
                                                    onChange={(e) => {
                                                        setConcept(
                                                            e.target.value
                                                        )
                                                    }}
                                                    className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                />
                                            </motion.label>
                                            <motion.label
                                                key='tattoo-placement'
                                                className='w-full font-semibold text-xs capitalize text-white/60'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Body Placement
                                                <input
                                                    type='text'
                                                    placeholder='Enter body placement (25 characters max)'
                                                    value={placement}
                                                    onKeyDown={(e) => {
                                                        if (
                                                            title.length < 25 ||
                                                            e.key ===
                                                                "Backspace" ||
                                                            e.key ===
                                                                "Delete" ||
                                                            e.key ===
                                                                "ArrowLeft" ||
                                                            e.key ===
                                                                "ArrowRight" ||
                                                            e.key === "Tab"
                                                        ) {
                                                            return
                                                        } else {
                                                            e.preventDefault()
                                                        }
                                                    }}
                                                    onChange={(e) => {
                                                        setPlacement(
                                                            e.target.value
                                                        )
                                                    }}
                                                    className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                />
                                            </motion.label>
                                            <motion.label
                                                key='tattoo-size'
                                                className='w-full font-semibold text-xs capitalize text-white/60'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Size Estimate
                                                <input
                                                    type='text'
                                                    inputMode='numeric'
                                                    placeholder='Enter size estimate in Inches. Leave blank if unknown'
                                                    value={sizeEst || ""}
                                                    onKeyDown={(e) => {
                                                        const allowedKeys =
                                                            /^(Tab|Arrow(Left|Right)|\s|Backspace|[0-9])$/
                                                        if (
                                                            !allowedKeys.test(
                                                                e.key
                                                            )
                                                        ) {
                                                            e.preventDefault()
                                                        }
                                                    }}
                                                    onChange={(e) => {
                                                        setSizeEst(
                                                            Number(
                                                                e.target.value
                                                            )
                                                        )
                                                    }}
                                                    className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                />
                                            </motion.label>
                                            <motion.label
                                                key='tattoo-color'
                                                className='w-full font-semibold text-xs capitalize text-white/60'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Colored?
                                                <select
                                                    title='Is the tattoo colored'
                                                    value={
                                                        isColored ? "yes" : "no"
                                                    }
                                                    onChange={(e) =>
                                                        setIsColored(
                                                            e.target.value ===
                                                                "yes"
                                                                ? true
                                                                : false
                                                        )
                                                    }
                                                    className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                >
                                                    <option value='no'>
                                                        No
                                                    </option>
                                                    <option value='yes'>
                                                        Yes
                                                    </option>
                                                </select>
                                            </motion.label>
                                            {userInfo.role && (userInfo.role !== "admin" || userInfo.access_flags?.includes("artist")) && (
                                                <motion.label
                                                    key='tattoo-prep-time'
                                                    className='w-full font-semibold text-xs capitalize text-white/60'
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                >
                                                    Artist Prep-Time
                                                    <input
                                                        type='text'
                                                        inputMode='numeric'
                                                        placeholder='Enter artist prep-time in minutes'
                                                        value={prepTime || ""}
                                                        onKeyDown={(e) => {
                                                            const allowedKeys =
                                                                /^(Tab|Arrow(Left|Right)|\s|Backspace|[0-9])$/
                                                            if (
                                                                !allowedKeys.test(
                                                                    e.key
                                                                )
                                                            ) {
                                                                e.preventDefault()
                                                            }
                                                        }}
                                                        onChange={(e) => {
                                                            setPrepTime(
                                                                Number(
                                                                    e.target
                                                                        .value
                                                                )
                                                            )
                                                        }}
                                                        className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                    />
                                                </motion.label>
                                            )}
                                            <motion.div
                                                key='tattoo-reference'
                                                className='w-full font-semibold text-xs capitalize text-white/60 select-none'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Reference Photo
                                                <AnimatePresence mode='wait'>
                                                    {/* Upload Image */}
                                                    {!reference &&
                                                        !referenceUrl && (
                                                            <ImageUploader
                                                                key='tattoo-reference-uploader'
                                                                onFileSelect={(
                                                                    file,
                                                                    type
                                                                ) => {
                                                                    setReference(
                                                                        file
                                                                    )
                                                                    if (
                                                                        type ===
                                                                        "model"
                                                                    ) {
                                                                        setReferenceType(
                                                                            "model"
                                                                        )
                                                                        setReferenceIs3D(
                                                                            true
                                                                        )
                                                                    } else if (
                                                                        type ===
                                                                        "decal"
                                                                    ) {
                                                                        setReferenceType(
                                                                            "decal"
                                                                        )
                                                                        setReferenceIs3D(
                                                                            true
                                                                        )
                                                                    } else {
                                                                        setReferenceType(
                                                                            "image"
                                                                        )
                                                                        setReferenceIs3D(
                                                                            false
                                                                        )
                                                                    }
                                                                    if (
                                                                        type ===
                                                                        "tattoo"
                                                                    ) {
                                                                        setReferenceIsTattoo(
                                                                            true
                                                                        )
                                                                    } else {
                                                                        setReferenceIsTattoo(
                                                                            false
                                                                        )
                                                                    }
                                                                }}
                                                                accept='image/png, image/jpeg, image/jpg'
                                                                allowedTypes={["image"]}
                                                                maxSizeMB={10}
                                                            />
                                                         )}
                                                    {referenceUrl &&
                                                        !reference && (
                                                            <motion.div
                                                                key='reference-url'
                                                                className='flex flex-col gap-2'
                                                                initial={{
                                                                    opacity: 0,
                                                                }}
                                                                animate={{
                                                                    opacity: 1,
                                                                }}
                                                                exit={{
                                                                    opacity: 0,
                                                                }}
                                                            >
                                                                <div className='relative w-full h-30'>
                                                                    <Image
                                                                        src={
                                                                            referenceIs3D &&
                                                                            referenceThumbnailUrl
                                                                                ? referenceThumbnailUrl
                                                                                : referenceUrl
                                                                        }
                                                                        alt=''
                                                                        fill
                                                                        className='w-full h-auto object-contain object-center'
                                                                        onClick={() => {
                                                                            openOverlay(
                                                                                "IMAGE",
                                                                                {
                                                                                    image: referenceUrl,
                                                                                }
                                                                            )
                                                                        }}
                                                                    />
                                                                    {referenceIs3D && (
                                                                        <div className='absolute right-1 bottom-1 p-1 bg-black/60 rounded-full'>
                                                                            <BoxIcon
                                                                                size={
                                                                                    12
                                                                                }
                                                                                className='text-white/60'
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <button
                                                                    type='button'
                                                                    onClick={() => {
                                                                        setReferenceUrl(
                                                                            ""
                                                                        )
                                                                        setReferenceThumbnailUrl(
                                                                            null
                                                                        )
                                                                        setReferenceId(
                                                                            ""
                                                                        )
                                                                        setReferenceIs3D(
                                                                            false
                                                                        )
                                                                        setReferenceOverlayData(
                                                                            null
                                                                        )
                                                                    }}
                                                                    className='w-full px-2 py-1 bg-red-400/10 border-2 border-red-400/5 rounded-sm text-white font-base font-semibold hover:bg-red-400/20 active:bg-red-400/30 cursor-pointer'
                                                                >
                                                                    Clear Image
                                                                </button>
                                                            </motion.div>
                                                        )}

                                                    {/*  */}
                                                    {reference && (
                                                        <motion.div
                                                            key='reference-preview'
                                                            initial={{
                                                                opacity: 0,
                                                            }}
                                                            animate={{
                                                                opacity: 1,
                                                            }}
                                                            exit={{
                                                                opacity: 0,
                                                            }}
                                                        >
                                                            {referenceType ===
                                                            "image" ? (
                                                                <div className='relative w-full h-30'>
                                                                    <Image
                                                                        src={URL.createObjectURL(
                                                                            reference
                                                                        )}
                                                                        alt=''
                                                                        fill
                                                                        className='w-full h-auto object-contain object-center'
                                                                        onClick={() => {
                                                                            openOverlay(
                                                                                "IMAGE",
                                                                                {
                                                                                    image: URL.createObjectURL(
                                                                                        reference
                                                                                    ),
                                                                                }
                                                                            )
                                                                        }}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className='w-full h-30 bg-white/5 rounded-md flex flex-col items-center justify-center gap-2 border-2 border-white/10'>
                                                                    <BoxIcon
                                                                        size={
                                                                            32
                                                                        }
                                                                        className='text-white/60'
                                                                    />
                                                                    <span className='text-xs font-semibold text-white/60'>
                                                                        {
                                                                            reference.name
                                                                        }
                                                                    </span>
                                                                </div>
                                                            )}

                                                            <div className='flex flex-row gap-2 mt-2'>
                                                                <motion.button
                                                                    type='button'
                                                                    onClick={() =>
                                                                        setReference(
                                                                            null
                                                                        )
                                                                    }
                                                                    className='flex-1 cursor-pointer bg-red-400/10 border-2 border-red-400/5 rounded-sm px-2 py-1 text-white font-base font-semibold hover:bg-red-400/20 active:bg-red-400/30'
                                                                >
                                                                    Remove
                                                                </motion.button>
                                                                 <motion.button
                                                                     type='button'
                                                                     onClick={() =>
                                                                         openOverlay(
                                                                             "IMAGE",
                                                                             {
                                                                                 image: referencePreviewUrl || "",
                                                                             }
                                                                         )
                                                                     }
                                                                     className='flex-1 cursor-pointer bg-blue-400/10 border-2 border-blue-400/5 rounded-sm px-2 py-1 text-white font-base font-semibold hover:bg-blue-400/20 active:bg-blue-400/30 flex flex-row gap-2 items-center justify-center'
                                                                 >
                                                                     <EyeIcon
                                                                         size={
                                                                             16
                                                                         }
                                                                     />
                                                                     View
                                                                 </motion.button>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                    {/* Tattoo Details */}
                                                    {reference &&
                                                        referenceIsTattoo && (
                                                            <motion.div
                                                                key='reference-tattoo-details'
                                                                className='flex flex-col gap-2 mt-2 p-2 bg-white/5 rounded-md border border-white/10'
                                                                initial={{
                                                                    opacity: 0,
                                                                }}
                                                                animate={{
                                                                    opacity: 1,
                                                                }}
                                                                exit={{
                                                                    opacity: 0,
                                                                }}
                                                            >
                                                                <span className='text-xs font-bold text-white/80 uppercase'>
                                                                    Tattoo
                                                                    Details
                                                                </span>
                                                                <input
                                                                    type='text'
                                                                    placeholder='Size (e.g. 5x5 inches)'
                                                                    value={
                                                                        referenceTattooSize
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) =>
                                                                        setReferenceTattooSize(
                                                                            e
                                                                                .target
                                                                                .value
                                                                        )
                                                                    }
                                                                    className='w-full bg-black/40 px-2 py-1 rounded-sm text-sm text-white border border-white/10 outline-none focus:border-white/40'
                                                                />
                                                                <input
                                                                    type='text'
                                                                    placeholder='Tags (comma separated)'
                                                                    value={
                                                                        referenceTattooTags
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) =>
                                                                        setReferenceTattooTags(
                                                                            e
                                                                                .target
                                                                                .value
                                                                        )
                                                                    }
                                                                    className='w-full bg-black/40 px-2 py-1 rounded-sm text-sm text-white border border-white/10 outline-none focus:border-white/40'
                                                                />
                                                            </motion.div>
                                                        )}
                                                </AnimatePresence>
                                            </motion.div>
                                            <motion.div
                                                key='tattoo-final'
                                                className='w-full font-semibold text-xs capitalize text-white/60 select-none'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Final Photo
                                                <AnimatePresence mode='wait'>
                                                    {finalUrl && !final && (
                                                        <motion.div
                                                            key='final-url'
                                                            className='flex flex-col gap-2'
                                                            initial={{
                                                                opacity: 0,
                                                            }}
                                                            animate={{
                                                                opacity: 1,
                                                            }}
                                                            exit={{
                                                                opacity: 0,
                                                            }}
                                                        >
                                                            <div className='relative w-full h-30'>
                                                                <Image
                                                                    src={
                                                                        finalIs3D &&
                                                                        finalThumbnailUrl
                                                                            ? finalThumbnailUrl
                                                                            : finalUrl
                                                                    }
                                                                    alt=''
                                                                    fill
                                                                    className='w-full h-auto object-contain object-center'
                                                                    onClick={() => {
                                                                        openOverlay(
                                                                            "IMAGE",
                                                                            {
                                                                                image: finalUrl,
                                                                            }
                                                                        )
                                                                    }}
                                                                />
                                                                {finalIs3D && (
                                                                    <div className='absolute right-1 bottom-1 p-1 bg-black/60 rounded-full'>
                                                                        <BoxIcon
                                                                            size={
                                                                                12
                                                                            }
                                                                            className='text-white/60'
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <button
                                                                type='button'
                                                                onClick={() => {
                                                                    setFinalUrl(
                                                                        ""
                                                                    )
                                                                    setFinalThumbnailUrl(
                                                                        null
                                                                    )
                                                                    setFinalId(
                                                                        ""
                                                                    )
                                                                    setFinalIs3D(
                                                                        false
                                                                    )
                                                                    setFinalOverlayData(
                                                                        null
                                                                    )
                                                                }}
                                                                className='w-full px-2 py-1 bg-red-400/10 border-2 border-red-400/5 rounded-sm text-white font-base font-semibold hover:bg-red-400/20 active:bg-red-400/30 cursor-pointer'
                                                            >
                                                                Clear Image
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                    {!final && !finalUrl && (
                                                        <ImageUploader
                                                            key='tattoo-final-uploader'
                                                            onFileSelect={(
                                                                file,
                                                                type
                                                            ) => {
                                                                setFinal(file)
                                                                if (
                                                                    type ===
                                                                    "model"
                                                                ) {
                                                                    setFinalType(
                                                                        "model"
                                                                    )
                                                                    setFinalIs3D(
                                                                        true
                                                                    )
                                                                } else if (
                                                                    type ===
                                                                    "decal"
                                                                ) {
                                                                    setFinalType(
                                                                        "decal"
                                                                    )
                                                                    setFinalIs3D(
                                                                        true
                                                                    )
                                                                } else {
                                                                    setFinalType(
                                                                        "image"
                                                                    )
                                                                    setFinalIs3D(
                                                                        false
                                                                    )
                                                                }
                                                                if (
                                                                    type ===
                                                                    "tattoo"
                                                                ) {
                                                                    setFinalIsTattoo(
                                                                        true
                                                                    )
                                                                } else {
                                                                    setFinalIsTattoo(
                                                                        false
                                                                    )
                                                                }
                                                            }}
                                                            accept='image/png, image/jpeg, image/jpg'
                                                            allowedTypes={["image"]}
                                                            maxSizeMB={10}
                                                        />
                                                         )}
                                                    {final && (
                                                        <motion.div
                                                            key='final-preview'
                                                            initial={{
                                                                opacity: 0,
                                                            }}
                                                            animate={{
                                                                opacity: 1,
                                                            }}
                                                            exit={{
                                                                opacity: 0,
                                                            }}
                                                        >
                                                            {finalType ===
                                                            "image" ? (
                                                                <div className='relative w-full h-30'>
                                                                    <Image
                                                                        src={URL.createObjectURL(
                                                                            final
                                                                        )}
                                                                        alt=''
                                                                        fill
                                                                        className='w-full h-auto object-contain object-center'
                                                                        onClick={() => {
                                                                            openOverlay(
                                                                                "IMAGE",
                                                                                {
                                                                                    image: URL.createObjectURL(
                                                                                        final
                                                                                    ),
                                                                                }
                                                                            )
                                                                        }}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className='w-full h-30 bg-white/5 rounded-md flex flex-col items-center justify-center gap-2 border-2 border-white/10'>
                                                                    <BoxIcon
                                                                        size={
                                                                            32
                                                                        }
                                                                        className='text-white/60'
                                                                    />
                                                                    <span className='text-xs font-semibold text-white/60'>
                                                                        {
                                                                            final.name
                                                                        }
                                                                    </span>
                                                                </div>
                                                            )}

                                                            <div className='flex flex-row gap-2 mt-2'>
                                                                <motion.button
                                                                    type='button'
                                                                    onClick={() =>
                                                                        setFinal(
                                                                            null
                                                                        )
                                                                    }
                                                                    className='flex-1 cursor-pointer bg-red-400/10 border-2 border-red-400/5 rounded-sm px-2 py-1 text-white font-base font-semibold hover:bg-red-400/20 active:bg-red-400/30'
                                                                >
                                                                    Remove
                                                                 </motion.button>
                                                                 <motion.button
                                                                     type='button'
                                                                     onClick={() =>
                                                                         openOverlay(
                                                                             "IMAGE",
                                                                             {
                                                                                 image: finalPreviewUrl || "",
                                                                             }
                                                                         )
                                                                     }
                                                                     className='flex-1 cursor-pointer bg-blue-400/10 border-2 border-blue-400/5 rounded-sm px-2 py-1 text-white font-base font-semibold hover:bg-blue-400/20 active:bg-blue-400/30 flex flex-row gap-2 items-center justify-center'
                                                                 >
                                                                     <EyeIcon
                                                                         size={
                                                                             16
                                                                         }
                                                                     />
                                                                     View
                                                                 </motion.button>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                    {final && finalIsTattoo && (
                                                        <motion.div
                                                            key='final-tattoo-details'
                                                            className='flex flex-col gap-2 mt-2 p-2 bg-white/5 rounded-md border border-white/10'
                                                            initial={{
                                                                opacity: 0,
                                                            }}
                                                            animate={{
                                                                opacity: 1,
                                                            }}
                                                            exit={{
                                                                opacity: 0,
                                                            }}
                                                        >
                                                            <span className='text-xs font-bold text-white/80 uppercase'>
                                                                Tattoo Details
                                                            </span>
                                                            <input
                                                                type='text'
                                                                placeholder='Size (e.g. 5x5 inches)'
                                                                value={
                                                                    finalTattooSize
                                                                }
                                                                onChange={(e) =>
                                                                    setFinalTattooSize(
                                                                        e.target
                                                                            .value
                                                                    )
                                                                }
                                                                className='w-full bg-black/40 px-2 py-1 rounded-sm text-sm text-white border border-white/10 outline-none focus:border-white/40'
                                                            />
                                                            <input
                                                                type='text'
                                                                placeholder='Tags (comma separated)'
                                                                value={
                                                                    finalTattooTags
                                                                }
                                                                onChange={(e) =>
                                                                    setFinalTattooTags(
                                                                        e.target
                                                                            .value
                                                                    )
                                                                }
                                                                className='w-full bg-black/40 px-2 py-1 rounded-sm text-sm text-white border border-white/10 outline-none focus:border-white/40'
                                                            />
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>
                                        </React.Fragment>
                                    )}
                                    {/* - Shoe Details */}
                                    {type === "SHOE" && (
                                        <React.Fragment key='shoe-appointment'>
                                            <motion.div
                                                key='shoe-appointment-1'
                                                className='w-full grid grid-cols-4 gap-2'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                <motion.label
                                                    key='shoe-name'
                                                    className='w-full font-semibold text-xs capitalize text-white/60 col-span-3'
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                >
                                                    Shoe Name
                                                    <input
                                                        type='text'
                                                        placeholder='Shoe Name'
                                                        value={shoeName}
                                                        onChange={(e) => {
                                                            setShoeName(
                                                                e.target.value
                                                            )
                                                        }}
                                                        className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                    />
                                                </motion.label>
                                                <motion.label
                                                    key='shoe-quantity'
                                                    className='w-full font-semibold text-xs capitalize text-white/60'
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                >
                                                    Quantity
                                                    <select
                                                        title='Shoe Quantity'
                                                        value={quantity}
                                                        onChange={(e) =>
                                                            setQuantity(
                                                                Number(
                                                                    e.target
                                                                        .value
                                                                )
                                                            )
                                                        }
                                                        className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-lg font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                    >
                                                        {[...Array(11)].map(
                                                            (_, i) => (
                                                                <option
                                                                    key={`shoe-quantity-${i}`}
                                                                    value={i}
                                                                >
                                                                    {i}
                                                                </option>
                                                            )
                                                        )}
                                                    </select>
                                                </motion.label>
                                            </motion.div>
                                            {userInfo.role && (userInfo.role !== "admin" || userInfo.access_flags?.includes("shoe")) && (
                                                <motion.div
                                                    key='shoe-dates'
                                                    className='flex flex-row gap-2 items-end w-full'
                                                >
                                                    <div className='flex flex-row flex-1 items-end gap-2'>
                                                        <label
                                                            title='Set Drop Off Date'
                                                            className=''
                                                        >
                                                            <input
                                                                aria-label='Dropped Off'
                                                                type='checkbox'
                                                                checked={
                                                                    isDropOff
                                                                }
                                                                onChange={(
                                                                    e
                                                                ) => {
                                                                    setIsDropOff(
                                                                        e.target
                                                                            .checked
                                                                    )
                                                                }}
                                                                className='hidden'
                                                            />
                                                            <div className='aspect-square w-9 h-auto bg-black/80 border-2 border-white/5 rounded-sm cursor-pointer flex items-center justify-center'>
                                                                <CheckIcon
                                                                    size={16}
                                                                    className={
                                                                        isDropOff
                                                                            ? "stroke-green-400"
                                                                            : "stroke-white/30"
                                                                    }
                                                                />
                                                            </div>
                                                        </label>
                                                        <motion.label
                                                            key='shoe-dropoff'
                                                            className='w-full font-semibold text-xs capitalize text-white/60'
                                                            initial={{
                                                                opacity: 0,
                                                            }}
                                                            animate={{
                                                                opacity: 1,
                                                            }}
                                                            exit={{
                                                                opacity: 0,
                                                            }}
                                                        >
                                                            Drop Off Date
                                                            {!isDropOff ? (
                                                                <div className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white/60 border-2 border-white/5 outline-none focus:border-white/40 z-0'>
                                                                    Not Dropped
                                                                    Off
                                                                </div>
                                                            ) : (
                                                                <input
                                                                    type='date'
                                                                    placeholder='Enter Pick-up Date'
                                                                    value={
                                                                        dropOffDate
                                                                            .toISOString()
                                                                            .split(
                                                                                "T"
                                                                            )[0]
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) => {
                                                                        setDropOffDate(
                                                                            new Date(
                                                                                e.target.value
                                                                            )
                                                                        )
                                                                    }}
                                                                    min={
                                                                        new Date()
                                                                            .toISOString()
                                                                            .split(
                                                                                "T"
                                                                            )[0]
                                                                    }
                                                                    className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40 z-0'
                                                                />
                                                            )}
                                                        </motion.label>
                                                    </div>
                                                    <div className='h-9 min-w-0.5 bg-white/10'></div>
                                                    <div className='flex flex-row flex-1 items-end gap-2'>
                                                        <label title='Set Pick-up Date'>
                                                            <input
                                                                aria-label='Pick Up'
                                                                type='checkbox'
                                                                checked={
                                                                    isPickUp
                                                                }
                                                                onChange={(
                                                                    e
                                                                ) => {
                                                                    setIsPickUp(
                                                                        e.target
                                                                            .checked
                                                                    )
                                                                }}
                                                                className='hidden'
                                                            />
                                                            <div className='aspect-square w-9 h-auto bg-black/80 border-2 border-white/5 rounded-sm cursor-pointer flex items-center justify-center'>
                                                                <CheckIcon
                                                                    size={16}
                                                                    className={
                                                                        isPickUp
                                                                            ? "stroke-green-400"
                                                                            : "stroke-white/30"
                                                                    }
                                                                />
                                                            </div>
                                                        </label>
                                                        <motion.label
                                                            key='shoe-pickup'
                                                            className='w-full font-semibold text-xs capitalize text-white/60'
                                                            initial={{
                                                                opacity: 0,
                                                            }}
                                                            animate={{
                                                                opacity: 1,
                                                            }}
                                                            exit={{
                                                                opacity: 0,
                                                            }}
                                                        >
                                                            Pick Up Date
                                                            {!isPickUp ? (
                                                                <div className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white/60 border-2 border-white/5 outline-none focus:border-white/40 z-0'>
                                                                    No Pickup
                                                                    Date Set
                                                                </div>
                                                            ) : (
                                                                <input
                                                                    type='date'
                                                                    placeholder='Enter Pick-up Date'
                                                                    value={
                                                                        pickUpDate
                                                                            .toISOString()
                                                                            .split(
                                                                                "T"
                                                                            )[0]
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) => {
                                                                        setPickUpDate(
                                                                            new Date(
                                                                                e.target.value
                                                                            )
                                                                        )
                                                                    }}
                                                                    min={
                                                                        new Date(
                                                                            dropOffDate
                                                                        )
                                                                            .toISOString()
                                                                            .split(
                                                                                "T"
                                                                            )[0]
                                                                    }
                                                                    className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40 z-0'
                                                                />
                                                            )}
                                                        </motion.label>
                                                    </div>
                                                </motion.div>
                                            )}
                                            <motion.label
                                                key='shoe-service'
                                                className='w-full font-semibold text-xs capitalize text-white/60'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Cleaning Service
                                                <select
                                                    title='Shoe Cleaning Service'
                                                    value={cleaningService}
                                                    onChange={(e) =>
                                                        setCleaningService(
                                                            e.target
                                                                .value as ShoeCleaningServiceType
                                                        )
                                                    }
                                                    className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-lg font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                >
                                                    <option value='STANDARD'>
                                                        Standard - ₱450
                                                    </option>
                                                    <option value='DEEP'>
                                                        Deep - ₱650
                                                    </option>
                                                    <option value='FULL'>
                                                        Full - ₱999
                                                    </option>
                                                </select>
                                            </motion.label>
                                            <motion.div
                                                key='shoe-addons'
                                                className='w-full font-semibold text-xs capitalize text-white/60 mt-1 flex flex-col gap-2 [&_label]:ml-2 [&_label]:cursor-pointer'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Add-ons
                                                <label className='flex flex-row gap-2 text-base w-full text-white'>
                                                    <input
                                                        type='checkbox'
                                                        onChange={(e) => {
                                                            setRush(
                                                                e.target.checked
                                                            )
                                                        }}
                                                        checked={rush}
                                                    />
                                                    Rush - ₱150
                                                </label>
                                                <label className='flex flex-row gap-2 text-base w-full text-white'>
                                                    <input
                                                        type='checkbox'
                                                        onChange={(e) => {
                                                            setReplacement(
                                                                e.target.checked
                                                            )
                                                        }}
                                                        checked={replacement}
                                                    />
                                                    Sole Replacement - ₱2000
                                                </label>
                                                <label className='flex flex-row gap-2 text-base w-full text-white'>
                                                    <input
                                                        type='checkbox'
                                                        onChange={(e) => {
                                                            setWaterRepellent(
                                                                e.target.checked
                                                            )
                                                        }}
                                                        checked={waterRepellent}
                                                    />
                                                    Water Repellant Treatment -
                                                    ₱150
                                                </label>
                                            </motion.div>
                                            <motion.label
                                                key='shoe-whitening'
                                                className='w-full font-semibold text-xs capitalize text-white/60'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Sole Whitening
                                                <select
                                                    title='Sole Whitening'
                                                    value={soleWhitening}
                                                    onChange={(e) =>
                                                        setSoleWhitening(
                                                            e.target
                                                                .value as ShoeCleaningWhiteningType
                                                        )
                                                    }
                                                    className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-lg font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                >
                                                    <option value='NONE'>
                                                        None
                                                    </option>
                                                    <option value='MINIMAL'>
                                                        Minimal - ₱300
                                                    </option>
                                                    <option value='MEDIUM'>
                                                        Medium - ₱600
                                                    </option>
                                                    <option value='FULL'>
                                                        Full - ₱1000
                                                    </option>
                                                </select>
                                            </motion.label>
                                            <motion.label
                                                key='shoe-Reglue'
                                                className='w-full font-semibold text-xs capitalize text-white/60'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Sole Regluing
                                                <select
                                                    title='Sole Regluing'
                                                    value={reglueService}
                                                    onChange={(e) =>
                                                        setReglueService(
                                                            e.target
                                                                .value as ShoeCleaningReglueType
                                                        )
                                                    }
                                                    className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-lg font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                >
                                                    <option value='NONE'>
                                                        None
                                                    </option>
                                                    <option value='MINIMAL'>
                                                        Minimal - ₱650
                                                    </option>
                                                    <option value='MAJOR'>
                                                        Major - ₱1000
                                                    </option>
                                                    <option value='FULL'>
                                                        Full - ₱2000
                                                    </option>
                                                </select>
                                            </motion.label>
                                            <motion.div className='w-full font-semibold text-xs capitalize text-white/60 mt-1'>
                                                Estimated Total Price
                                                <div className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'>
                                                    ₱ {totalCost.toFixed(2)}
                                                </div>
                                            </motion.div>
                                        </React.Fragment>
                                    )}
                                    {/* - Piercing Details */}
                                    {type === "PIERCING" && (
                                        <React.Fragment key='piercing-appointment'>
                                            <motion.label
                                                key='piercing-location'
                                                className='w-full font-semibold text-xs capitalize text-white/60'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Piercing Location
                                                <input
                                                    type='text'
                                                    placeholder='Piercing Location'
                                                    value={piercingLocation}
                                                    onChange={(e) => {
                                                        setPiercingLocation(
                                                            e.target.value
                                                        )
                                                    }}
                                                    className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                />
                                            </motion.label>
                                            <motion.label
                                                key='piercing-material'
                                                className='w-full font-semibold text-xs capitalize text-white/60'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Jewelry Material
                                                <input
                                                    type='text'
                                                    placeholder='Jewelry Material'
                                                    value={material}
                                                    onChange={(e) => {
                                                        setMaterial(
                                                            e.target.value
                                                        )
                                                    }}
                                                    className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                />
                                            </motion.label>
                                            <motion.label
                                                key='piercing-style'
                                                className='w-full font-semibold text-xs capitalize text-white/60'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Jewelry Style
                                                <select
                                                    title='Jewelry Style'
                                                    value={style}
                                                    onChange={(e) =>
                                                        setStyle(
                                                            e.target
                                                                .value as PiercingJewelryType
                                                        )
                                                    }
                                                    className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-lg font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                >
                                                    <option value='STUD'>
                                                        Stud
                                                    </option>
                                                    <option value='RING'>
                                                        Ring
                                                    </option>
                                                    <option value='BARBELL'>
                                                        Barbell
                                                    </option>
                                                </select>
                                            </motion.label>
                                            <motion.label
                                                key='piercing-issues'
                                                className='w-full font-semibold text-xs capitalize text-white/60'
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                            >
                                                Previous Piercing Issues
                                                <select
                                                    title='Were there any issues with your piercing before?'
                                                    value={
                                                        prevIssues
                                                            ? "YES"
                                                            : "NO"
                                                    }
                                                    onChange={(e) =>
                                                        setPrevIssues(
                                                            e.target.value ===
                                                                "YES"
                                                        )
                                                    }
                                                    className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-lg font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                >
                                                    <option value='NO'>
                                                        No
                                                    </option>
                                                    <option value='YES'>
                                                        Yes
                                                    </option>
                                                </select>
                                            </motion.label>
                                            {userInfo.role && (userInfo.role !== "admin" || userInfo.access_flags?.includes("piercing")) && (
                                                <motion.label
                                                    key='piercing-aftercare'
                                                    className='w-full font-semibold text-xs capitalize text-white/60'
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                >
                                                    Aftercare Instructions
                                                    <motion.textarea
                                                        value={aftercare}
                                                        onChange={(e) =>
                                                            setAftercare(
                                                                e.target.value
                                                            )
                                                        }
                                                        placeholder='Aftercare Instructions'
                                                        className='resize-none w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                                        rows={aftercareRows}
                                                    />
                                                </motion.label>
                                            )}
                                        </React.Fragment>
                                    )}
                                </AnimatePresence>
                            </>
                        ))}
                    {/* End of Edit */}
                </div>
                <div className='w-full min-h-0.5 bg-white/10' />
                <button
                    type='button'
                    className='w-full flex flex-row gap-2 items-center justify-center px-2 py-1 border-2 border-white/5 bg-green-400/20 rounded-md font-semibold cursor-pointer hover:bg-green-400/40 active:bg-green-400/30'
                    onClick={async (e) => {
                        // Saving Logic
                        e.preventDefault()

                        // Validation for Tattoo
                        if (type === "TATTOO") {
                            if (!concept || !placement) {
                                addNotification(
                                    "Please fill in all required tattoo details (Concept, Placement, Size, Prep Time)",
                                    "ERROR",
                                    "Missing Fields"
                                )
                                return
                            }
                        }

                        // Validation for Shoe
                        if (type === "SHOE") {
                            if (
                                !shoeName ||
                                quantity <= 0 ||
                                !cleaningService
                            ) {
                                addNotification(
                                    "Please fill in all required shoe details (Name, Quantity > 0, Cleaning Service)",
                                    "ERROR",
                                    "Missing Fields"
                                )
                                return
                            }
                        }

                        // Validation for Piercing
                        if (type === "PIERCING") {
                            if (!piercingLocation || !material || !style) {
                                addNotification(
                                    "Please fill in all required piercing details (Location, Material, Style)",
                                    "ERROR",
                                    "Missing Fields"
                                )
                                return
                            }
                        }

                        addNotification(
                            "Saving Appointment Details",
                            "INFO",
                            "Saving"
                        )
                        const result = await updateAppointment(appointment.id, {
                            title,
                            time_start: returnFormattedTime(startTime),
                            time_end: returnFormattedTime(endTime),
                            notes,
                            type,
                            staff_id: selectedStaffId || null,
                        })
                        if (!result.success) {
                            addNotification(
                                result.error || "Failed to save appointment",
                                "ERROR",
                                "Failed"
                            )
                            return
                        }

                        if (!result.data) {
                            addNotification(
                                "Failed to save appointment",
                                "ERROR",
                                "Failed"
                            )
                            return
                        }
                        addNotification(
                            "Successfully Saved Appointment (Refresh may be required to see changes)",
                            "SUCCESS",
                            "Saved"
                        )
                        if (type) {
                            addNotification(
                                "Saving Appointment Details",
                                "INFO",
                                "Saving"
                            )
                            if (type !== appointment.type) {
                                // Handle Change of Type
                                // Delete Old Appointment Details
                                if (appointment.type) {
                                    const deleted =
                                        await deleteAppointmentDetails(
                                            appointment.id,
                                            appointment.type as AppointmentType
                                        )
                                    if (!deleted) {
                                        addNotification(
                                            "Failed to delete old appointment details",
                                            "ERROR",
                                            "Failed"
                                        )
                                        return
                                    }
                                }
                                // Create New Appointment Details
                                switch (type) {
                                    case "TATTOO":
                                        // Reference Upload
                                        let refId = ""
                                        let finId = ""
                                        if (reference) {
                                            const compressedRef =
                                                await compressImage(reference)
                                            const refRes = await uploadImage(
                                                compressedRef,
                                                userInfo.id,
                                                undefined,
                                                referenceIsTattoo,
                                                undefined,
                                                referenceIsTattoo
                                                    ? {
                                                          size: referenceTattooSize,
                                                          tags: referenceTattooTags,
                                                      }
                                                    : undefined,
                                                referenceIs3D,
                                                referenceType === "decal"
                                                    ? referenceChosenModel
                                                    : undefined,
                                                referenceType === "decal"
                                                    ? "DECAL"
                                                    : undefined,
                                                referenceOverlayData ??
                                                    undefined
                                            )
                                            if (!refRes) {
                                                addNotification(
                                                    "Failed to upload reference image",
                                                    "ERROR",
                                                    "Failed"
                                                )
                                                return
                                            }
                                            refId = refRes.id
                                        }
                                        if (final) {
                                            const compressedFin =
                                                await compressImage(final)
                                            const finRes = await uploadImage(
                                                compressedFin,
                                                userInfo.id,
                                                undefined,
                                                finalIsTattoo,
                                                undefined,
                                                finalIsTattoo
                                                    ? {
                                                          size: finalTattooSize,
                                                          tags: finalTattooTags,
                                                      }
                                                    : undefined,
                                                finalIs3D,
                                                finalType === "decal"
                                                    ? finalChosenModel
                                                    : undefined,
                                                finalType === "decal"
                                                    ? "DECAL"
                                                    : undefined,
                                                finalOverlayData ?? undefined
                                            )
                                            if (!finRes) {
                                                addNotification(
                                                    "Failed to upload final image",
                                                    "ERROR",
                                                    "Failed"
                                                )
                                                return
                                            }
                                            finId = finRes.id
                                        }
                                        // Create Tattoo Details
                                        const tatCreated =
                                            await createAppointmentDetails(
                                                "TATTOO",
                                                {
                                                    id: appointment.id,
                                                    design_concept: concept,
                                                    body_placement: placement,
                                                    size_estimate: sizeEst,
                                                    is_color: isColored,
                                                    artist_prep_time: prepTime,
                                                    reference_image_id:
                                                        refId !== ""
                                                            ? refId
                                                            : null,
                                                    final_image_id:
                                                        finId !== ""
                                                            ? finId
                                                            : null,
                                                }
                                            )
                                        if (!tatCreated) {
                                            addNotification(
                                                "Failed to create tattoo details",
                                                "ERROR",
                                                "Failed"
                                            )
                                            return
                                        }
                                    case "SHOE":
                                        // Create Shoe Details
                                        const shoeCreated =
                                            await createAppointmentDetails(
                                                "SHOE",
                                                {
                                                    id: appointment.id,
                                                    shoe_name: shoeName,
                                                    quantity,
                                                    drop_off_date: isDropOff
                                                        ? dropOffDate
                                                        : undefined,
                                                    pick_up_date: isPickUp
                                                        ? pickUpDate
                                                        : undefined,
                                                    cleaning_service:
                                                        cleaningService,
                                                    add_on_rush: rush,
                                                    add_on_replacement:
                                                        replacement,
                                                    add_on_water_repellent:
                                                        waterRepellent,
                                                    sole_whitening:
                                                        soleWhitening,
                                                    reglue_service:
                                                        reglueService,
                                                    total_cost: totalCost,
                                                }
                                            )
                                        if (!shoeCreated) {
                                            addNotification(
                                                "Failed to create shoe details",
                                                "ERROR",
                                                "Failed"
                                            )
                                            return
                                        }
                                    case "PIERCING":
                                        // Create Piercing Details
                                        const pierCreated =
                                            await createAppointmentDetails(
                                                "PIERCING",
                                                {
                                                    id: appointment.id,
                                                    piercing_location:
                                                        piercingLocation,
                                                    jewelry_material: material,
                                                    jewelry_style: style,
                                                    previous_piercing_issues:
                                                        prevIssues,
                                                    aftercare_instructions:
                                                        aftercare,
                                                }
                                            )
                                        if (!pierCreated) {
                                            addNotification(
                                                "Failed to create piercing details",
                                                "ERROR",
                                                "Failed"
                                            )
                                            return
                                        }
                                }
                            } else {
                                // Handle Update of Details
                                switch (type) {
                                    case "TATTOO":
                                        // Update Tattoo Details
                                        // If Image is uploaded, update it
                                        let refId = ""
                                        let finId = ""
                                        if (reference) {
                                            const compressedRef =
                                                await compressImage(reference)
                                            const refRes = await uploadImage(
                                                compressedRef,
                                                userInfo.id,
                                                undefined,
                                                referenceIsTattoo,
                                                undefined,
                                                referenceIsTattoo
                                                    ? {
                                                          size: referenceTattooSize,
                                                          tags: referenceTattooTags,
                                                      }
                                                    : undefined,
                                                referenceIs3D,
                                                referenceType === "decal"
                                                    ? referenceChosenModel
                                                    : undefined,
                                                referenceType === "decal"
                                                    ? "DECAL"
                                                    : undefined,
                                                referenceOverlayData ??
                                                    undefined
                                            )
                                            if (!refRes) {
                                                addNotification(
                                                    "Failed to upload reference image",
                                                    "ERROR",
                                                    "Failed"
                                                )
                                                return
                                            }
                                            refId = refRes.id
                                        }
                                        if (final) {
                                            const compressedFin =
                                                await compressImage(final)
                                            const finRes = await uploadImage(
                                                compressedFin,
                                                userInfo.id,
                                                undefined,
                                                finalIsTattoo,
                                                undefined,
                                                finalIsTattoo
                                                    ? {
                                                          size: finalTattooSize,
                                                          tags: finalTattooTags,
                                                      }
                                                    : undefined,
                                                finalIs3D,
                                                finalType === "decal"
                                                    ? finalChosenModel
                                                    : undefined,
                                                finalType === "decal"
                                                    ? "DECAL"
                                                    : undefined,
                                                finalOverlayData ?? undefined
                                            )
                                            if (!finRes) {
                                                addNotification(
                                                    "Failed to upload final image",
                                                    "ERROR",
                                                    "Failed"
                                                )
                                                return
                                            }
                                            finId = finRes.id
                                        }
                                        const tatUpdated =
                                            await updateAppointmentDetails(
                                                appointment.id,
                                                "TATTOO",
                                                {
                                                    design_concept: concept,
                                                    body_placement: placement,
                                                    size_estimate: sizeEst,
                                                    is_color: isColored,
                                                    artist_prep_time: prepTime,
                                                    reference_image_id:
                                                        reference
                                                            ? refId
                                                            : referenceId === ""
                                                              ? null
                                                              : referenceId,
                                                    final_image_id: final
                                                        ? finId
                                                        : finalId === ""
                                                          ? null
                                                          : finalId,
                                                }
                                            )
                                        if (!tatUpdated) {
                                            addNotification(
                                                "Failed to update tattoo details",
                                                "ERROR",
                                                "Failed"
                                            )
                                            return
                                        }
                                        break
                                    case "SHOE":
                                        // Update Shoe Details
                                        const shoeUpdated =
                                            await updateAppointmentDetails(
                                                appointment.id,
                                                "SHOE",
                                                {
                                                    shoe_name: shoeName,
                                                    quantity,
                                                    drop_off_date: isDropOff
                                                        ? dropOffDate
                                                        : undefined,
                                                    pick_up_date: isPickUp
                                                        ? pickUpDate
                                                        : undefined,
                                                    cleaning_service:
                                                        cleaningService,
                                                    add_on_rush: rush,
                                                    add_on_replacement:
                                                        replacement,
                                                    add_on_water_repellent:
                                                        waterRepellent,
                                                    sole_whitening:
                                                        soleWhitening,
                                                    reglue_service:
                                                        reglueService,
                                                    total_cost: totalCost,
                                                }
                                            )
                                        if (!shoeUpdated) {
                                            addNotification(
                                                "Failed to update shoe details",
                                                "ERROR",
                                                "Failed"
                                            )
                                            return
                                        }
                                        break
                                    case "PIERCING":
                                        // Update Piercing Details
                                        const pierUpdated =
                                            await updateAppointmentDetails(
                                                appointment.id,
                                                "PIERCING",
                                                {
                                                    piercing_location:
                                                        piercingLocation,
                                                    jewelry_material: material,
                                                    jewelry_style: style,
                                                    previous_piercing_issues:
                                                        prevIssues,
                                                    aftercare_instructions:
                                                        aftercare,
                                                }
                                            )
                                        if (!pierUpdated) {
                                            addNotification(
                                                "Failed to update piercing details",
                                                "ERROR",
                                                "Failed"
                                            )
                                            return
                                        }
                                        break
                                    default:
                                        break
                                }
                            }
                        }
                        refreshAppointments()
                    }}
                >
                    Save Changes
                </button>
            </motion.div>
        </>
    )
}
