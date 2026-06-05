"use client"

import { NotificationContext } from "@/components/notifications"
import { UserProfile } from "@/utils/types/auth"
import { Appointment, AppointmentType, Service } from "@/utils/types/general"
import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react"
import { getStaffProfiles } from "@/server/actions/profile"
import { XIcon, LoaderCircleIcon, UserIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import {
    createWalkinAppointment,
    createAppointmentDetails,
    getStaffAppointments,
    addServiceToAppointment,
    updateAppointment,
    CreateWalkinAppointmentPayload,
} from "@/server/actions/appointments"
import { getServices } from "@/server/actions/services"
import { useBranchContext } from "@/components/branch-context"
import { createLogs } from "@/server/actions/logs"
import { getStaffSchedule } from "@/server/actions/time-clock"
import { createTransaction } from "@/server/actions/transactions"
import { PaymentMethod } from "@/utils/types/transactions"

interface WalkinAppointmentModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess?: () => void
}

// User type mapping for appointment types
const USER_TYPE_MAP: Record<AppointmentType, string[]> = {
    TATTOO: ["artist"],
    PIERCING: ["piercer"],
    SHOE: ["shoe_tech"],
    OTHER: ["artist", "piercer", "shoe_tech", "admin", "staff"],
}

const USER_ROLE_TO_TYPE: Record<string, string> = {
    artist: "Artist",
    piercer: "Piercer",
    shoe_tech: "Shoe Tech",
    admin: "Admin",
    staff: "Staff",
}

export default function WalkinAppointmentModal({
    isOpen,
    onClose,
    onSuccess,
}: WalkinAppointmentModalProps) {
    // Contexts
    const { addNotification } = useContext(NotificationContext)
    const { branches, currentBranch } = useBranchContext()

    // Refs
    const staffInputRef = useRef<HTMLInputElement>(null)

    // States
    const [isLoading, setIsLoading] = useState(false)

    // Client Info
    const [clientName, setClientName] = useState("")
    const [clientPhone, setClientPhone] = useState("")
    const [clientEmail, setClientEmail] = useState("")

    // Appointment Info
    const [title, setTitle] = useState("")
    const [staffName, setStaffName] = useState("")
    const [staffId, setStaffId] = useState("")
    const [staff, setStaff] = useState<UserProfile[]>([])
    const [date, setDate] = useState(() => {
        const now = new Date()
        if (now.getHours() >= 21) {
            const tomorrow = new Date(now)
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)
            return tomorrow
        }
        return now
    })
    const [startTime, setStartTime] = useState(0)
    const [endTime, setEndTime] = useState(0)
    const [notes, setNotes] = useState("")
    const [noteRows, setNoteRows] = useState(1)
    const [type, setType] = useState<AppointmentType | null>("TATTOO")
    const [services, setServices] = useState<Service[]>([])
    const [selectedService, setSelectedService] = useState<string>("")
    const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)

    // Time Slots
    const [availableSlots, setAvailableSlots] = useState<number[]>([])
    const [scheduleStart, setScheduleStart] = useState("13:00")

    // Downpayment
    const [collectDownpayment, setCollectDownpayment] = useState(false)
    const [estimatedTotal, setEstimatedTotal] = useState(0)
    const [downpaymentAmount, setDownpaymentAmount] = useState(0)
    const [dpPaymentMethod, setDpPaymentMethod] = useState<PaymentMethod>("CASH")

    // Calculate minimum date
    const getMinDate = () => {
        const now = new Date()
        const currentHour = now.getHours()
        if (currentHour >= 21) {
            const tomorrow = new Date(now)
            tomorrow.setDate(tomorrow.getDate() + 1)
            const year = tomorrow.getFullYear()
            const month = String(tomorrow.getMonth() + 1).padStart(2, "0")
            const day = String(tomorrow.getDate()).padStart(2, "0")
            return `${year}-${month}-${day}`
        }
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, "0")
        const day = String(now.getDate()).padStart(2, "0")
        return `${year}-${month}-${day}`
    }

    // Get initial valid date
    const getInitialValidDate = () => {
        const now = new Date()
        const currentHour = now.getHours()
        if (currentHour >= 21) {
            const tomorrow = new Date(now)
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)
            return tomorrow
        }
        return now
    }

    // Filter staff by appointment type (includes admins with hybrid capabilities)
    const filteredStaff = useMemo(() => {
        if (!type) return staff
        const allowedTypes = USER_TYPE_MAP[type]
        return staff.filter((s) => {
            if (allowedTypes.includes(s.role)) return true
            // Include admins with hybrid capabilities matching the appointment type
            if (s.role === "admin" && s.access_flags) {
                if (type === "TATTOO" && s.access_flags.includes("artist")) return true
                if (type === "PIERCING" && s.access_flags.includes("piercing")) return true
                if (type === "SHOE" && s.access_flags.includes("shoe")) return true
            }
            return false
        })
    }, [staff, type])

    // Handlers
    const resetForm = useCallback(() => {
        setClientName("")
        setClientPhone("")
        setClientEmail("")
        setTitle("")
        setStaffName("")
        setStaffId("")
        setDate(getInitialValidDate())
        setStartTime(0)
        setEndTime(0)
        setNotes("")
        setNoteRows(1)
        setType("TATTOO")
        setSelectedService("")
    }, [])

    const handleClose = () => {
        resetForm()
        onClose()
    }

    // Generate time slots (13:00 - 21:00)
    const generateSlots = () => {
        const slots = []
        for (let i = 13; i <= 21; i++) {
            slots.push(i)
        }
        return slots
    }

    // Return formatted time string
    const returnFormattedTime = (hour: number) => {
        const d = new Date(date)
        d.setHours(hour, 0, 0, 0)
        return d
    }

    // Fetch staff and services
    useEffect(() => {
        const fetchData = async () => {
            const [staffData, servicesResult] = await Promise.all([
                getStaffProfiles(),
                getServices({ branchId: currentBranch?.id }),
            ])
            setStaff(staffData)
            if (servicesResult.success) {
                setServices(servicesResult.data.services.filter((s: { is_active: boolean }) => s.is_active))
            }
        }
        fetchData()
    }, [currentBranch?.id])

    // Fetch available slots when staff or date changes (schedule-aware)
    useEffect(() => {
        const fetchSlots = async () => {
            if (!staffId || !date) {
                setAvailableSlots(generateSlots())
                return
            }

            // Fetch staff schedule for selected day

            const scheduleResult = await getStaffSchedule(staffId)
            const schedules = scheduleResult.success ? scheduleResult.data?.schedules || [] : []
            const schedule = schedules.find((s) => {
                const dayNum = new Date(date).getDay()
                return s.day_of_week === dayNum
            })

            let start = 13
            let end = 21

            if (schedule && schedule.start_time && schedule.end_time) {
                start = parseInt(schedule.start_time.split(":")[0])
                end = parseInt(schedule.end_time.split(":")[0])
                setScheduleStart(schedule.start_time)
            } else {
                // Staff not scheduled today — fall back to business hours
                setScheduleStart("13:00")
            }

            const slots = []
            for (let i = start; i < end; i++) {
                slots.push(i)
            }

            // Filter booked slots
            const appointmentsResult = await getStaffAppointments(staffId)
            const selectedDate = new Date(date).toDateString()

            if (!appointmentsResult.success) {
                setAvailableSlots(slots)
                return
            }

            const booked = appointmentsResult.data
                .filter(
                    (a: Appointment) =>
                        new Date(a.time_start).toDateString() === selectedDate,
                )
                .map((a: Appointment) => ({
                    start: new Date(a.time_start).getHours(),
                    end: new Date(a.time_end).getHours(),
                }))

            const available = slots.filter((slot) => {
                return !booked.some(
                    (range: { start: number; end: number }) => slot >= range.start && slot < range.end,
                )
            })

            setAvailableSlots(available)
        }

        fetchSlots()
    }, [staffId, date])

    // Validation
    const isValid = useMemo(() => {
        return (
            clientName.trim() !== "" &&
            title.trim() !== "" &&
            startTime !== 0 &&
            endTime !== 0 &&
            startTime < endTime &&
            type !== null
        )
    }, [clientName, title, startTime, endTime, type])

    // Handle submit
    const handleSubmit = async () => {
        if (!isValid) {
            addNotification("Please fill in all required fields", "ERROR")
            return
        }

        setIsLoading(true)

        try {
            const payload: CreateWalkinAppointmentPayload = {
                title,
                client_name: clientName,
                client_phone: clientPhone || undefined,
                client_email: clientEmail || undefined,
                staff_id: staffId || null,
                time_start: returnFormattedTime(startTime),
                time_end: returnFormattedTime(endTime),
                notes: notes || undefined,
                type,
                branch_id: selectedBranchId || currentBranch?.id || null,
            }

            const result = await createWalkinAppointment(payload)

            if (!result.success || !result.appointment) {
                addNotification(
                    result.message || "Failed to create appointment",
                    "ERROR",
                )
                setIsLoading(false)
                return
            }

            // Add service if selected
            if (selectedService) {
                const serviceResult = await addServiceToAppointment(
                    result.appointment.id,
                    selectedService,
                )
                if (!serviceResult.success) {
                    addNotification(
                        serviceResult.error || "Failed to add service",
                        "ERROR",
                    )
                }
            }

            // Create appointment details based on type
            switch (type) {
                case "TATTOO":
                    await createAppointmentDetails(type, {
                        id: result.appointment.id,
                        design_concept: "",
                        body_placement: "",
                        size_estimate: 0,
                        is_color: false,
                        artist_prep_time: 0,
                        reference_image_id: null,
                        final_image_id: null,
                    })
                    break
                case "SHOE":
                    await createAppointmentDetails(type, {
                        id: result.appointment.id,
                        shoe_name: "",
                        quantity: 0,
                        cleaning_service: "STANDARD",
                        add_on_rush: false,
                        add_on_replacement: false,
                        add_on_water_repellent: false,
                        sole_whitening: "NONE",
                        reglue_service: "NONE",
                        total_cost: 0,
                    })
                    break
                case "PIERCING":
                    await createAppointmentDetails(type, {
                        id: result.appointment.id,
                        piercing_location: "",
                        jewelry_material: "",
                        jewelry_style: "STUD",
                        previous_piercing_issues: false,
                    })
                    break
            }

            // If collecting deposit, create transaction + downpayment
            if (collectDownpayment && downpaymentAmount > 0) {
                const txnResult = await createTransaction({
                    buyer_id: null,
                    buyer_name: clientName,
                    items: [{ item_name: `Deposit: ${title}`, quantity: 1, unit_price: downpaymentAmount }],
                    amount_paid: downpaymentAmount,
                    payment_method: dpPaymentMethod,
                    total: downpaymentAmount,
                    subtotal: downpaymentAmount,
                    tax_amount: 0,
                    discount_amount: 0,
                    branch_id: selectedBranchId || currentBranch?.id || null,
                    staff_id: staffId || null,
                    downpayment_type: "FLAT_FEE",
                    downpayment_amount: downpaymentAmount,
                    payroll_split_mode: "PER_PAYMENT",
                })

                if (txnResult.success && txnResult.data) {
                    // Link downpayment to appointment
                    await updateAppointment(result.appointment.id, {
                        downpayment_id: txnResult.data.transaction.id,
                    } as Partial<Appointment>)
                }
            }

            addNotification(
                "Walk-in appointment created successfully!",
                "SUCCESS",
            )
            onSuccess?.()
            handleClose()
        } catch (error) {
            createLogs({ logs: [{ level: 'ERROR', type: 'APPOINTMENT', message: error instanceof Error ? error.message : 'Error creating walk-in appointment' }] })
            addNotification("An unexpected error occurred", "ERROR")
        } finally {
            setIsLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <motion.div
                key='walkin-appointment-modal'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className='fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm'
                onClick={(e) => {
                    if (e.target === e.currentTarget && !isLoading)
                        handleClose()
                }}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className='w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-black/95 border-2 border-white/10 rounded-lg p-4 flex flex-col gap-4 m-4'
                >
                    {/* Header */}
                    <div className='flex justify-between items-center'>
                        <h2 className='text-lg font-semibold text-white flex items-center gap-2'>
                            <UserIcon
                                size={20}
                                className='text-green-400'
                            />
                            New Walk-in Appointment
                        </h2>
                        <button
                            onClick={handleClose}
                            disabled={isLoading}
                            className='p-1 hover:bg-white/10 rounded-md transition-colors disabled:opacity-50'
                        >
                            <XIcon size={20} />
                        </button>
                    </div>

                    <div className='w-full h-0.5 bg-white/10' />

                    {/* Form Content */}
                    <div className='flex flex-col gap-4 flex-1 overflow-auto'>
                        {/* Client Information Section */}
                        <div className='bg-white/5 p-3 rounded-md border border-white/10'>
                            <h3 className='text-sm font-semibold text-white/80 mb-3'>
                                Client Information
                            </h3>
                            <div className='flex flex-col gap-3'>
                                {/* Client Name */}
                                <label className='w-full font-semibold text-xs capitalize text-white/60'>
                                    Client Name *
                                    <input
                                        type='text'
                                        placeholder='Enter walk-in client name'
                                        value={clientName}
                                        onChange={(e) =>
                                            setClientName(e.target.value)
                                        }
                                        className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                        disabled={isLoading}
                                    />
                                </label>

                                <div className='flex flex-row gap-3'>
                                    {/* Client Phone */}
                                    <label className='flex-1 font-semibold text-xs capitalize text-white/60'>
                                        Phone (Optional)
                                        <input
                                            type='tel'
                                            placeholder='Phone number'
                                            value={clientPhone}
                                            onChange={(e) =>
                                                setClientPhone(e.target.value)
                                            }
                                            className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                            disabled={isLoading}
                                        />
                                    </label>

                                    {/* Client Email */}
                                    <label className='flex-1 font-semibold text-xs capitalize text-white/60'>
                                        Email (Optional)
                                        <input
                                            type='email'
                                            placeholder='Email address'
                                            value={clientEmail}
                                            onChange={(e) =>
                                                setClientEmail(e.target.value)
                                            }
                                            className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                            disabled={isLoading}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Appointment Details Section */}
                        <div className='bg-white/5 p-3 rounded-md border border-white/10'>
                            <h3 className='text-sm font-semibold text-white/80 mb-3'>
                                Appointment Details
                            </h3>
                            <div className='flex flex-col gap-3'>
                                {/* Appointment Title */}
                                <label className='w-full font-semibold text-xs capitalize text-white/60'>
                                    Appointment Title *
                                    <input
                                        type='text'
                                        placeholder='e.g., Sleeve Tattoo Session 1'
                                        value={title}
                                        onChange={(e) =>
                                            setTitle(e.target.value)
                                        }
                                        className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                        disabled={isLoading}
                                    />
                                </label>

                                {/* Appointment Type */}
                                <label className='w-full font-semibold text-xs capitalize text-white/60'>
                                    Appointment Type *
                                    <select
                                        value={type || ""}
                                        onChange={(e) =>
                                            setType(
                                                e.target
                                                    .value as AppointmentType,
                                            )
                                        }
                                        className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                        disabled={isLoading}
                                    >
                                        <option value='TATTOO'>Tattoo</option>
                                        <option value='PIERCING'>
                                            Piercing
                                        </option>
                                        <option value='SHOE'>
                                            Shoe Cleaning
                                        </option>
                                        <option value='OTHER'>Other</option>
                                    </select>
                                </label>

                                {/* Branch Selection */}
                                <label className='w-full font-semibold text-xs capitalize text-white/60'>
                                    Branch (Optional)
                                    <select
                                        value={selectedBranchId || ""}
                                        onChange={(e) => setSelectedBranchId(e.target.value || null)}
                                        className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                        disabled={isLoading}
                                    >
                                        <option value="">Select a branch...</option>
                                        {branches.map((branch) => (
                                            <option key={branch.id} value={branch.id}>
                                                {branch.name}
                                            </option>
                                        ))}
                                    </select>
                                    {currentBranch && !selectedBranchId && (
                                        <span className='text-xs text-blue-400 mt-1 block'>
                                            Current branch: {currentBranch.name}
                                        </span>
                                    )}
                                </label>

                                {/* Staff Selection */}
                                <label className='w-full font-semibold text-xs capitalize text-white/60'>
                                    Assign to{" "}
                                    {type === "TATTOO"
                                        ? "Artist"
                                        : type === "PIERCING"
                                          ? "Piercer"
                                          : type === "SHOE"
                                            ? "Shoe Tech"
                                            : "Staff"}{" "}
                                    (Optional)
                                    <div className='relative'>
                                        <input
                                            ref={staffInputRef}
                                            type='text'
                                            placeholder={`Search ${type === "TATTOO" ? "artist" : type === "PIERCING" ? "piercer" : type === "SHOE" ? "shoe tech" : "staff"}...`}
                                            value={staffName}
                                            onChange={(e) => {
                                                setStaffName(e.target.value)
                                                if (staffId) setStaffId("")
                                            }}
                                            className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                            disabled={isLoading}
                                        />
                                        {/* Staff Dropdown */}
                                        {staffName &&
                                            !staffId &&
                                            filteredStaff.length > 0 && (
                                                <div className='absolute z-10 w-full mt-1 bg-black/95 border border-white/10 rounded-md max-h-40 overflow-y-auto'>
                                                    {filteredStaff
                                                        .filter((s) =>
                                                            s.full_name
                                                                .toLowerCase()
                                                                .includes(
                                                                    staffName.toLowerCase(),
                                                                ),
                                                        )
                                                        .map((s) => (
                                                            <button
                                                                key={s.id}
                                                                type='button'
                                                                onClick={() => {
                                                                    setStaffId(
                                                                        s.id,
                                                                    )
                                                                    setStaffName(
                                                                        s.full_name,
                                                                    )
                                                                }}
                                                                className='w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors'
                                                            >
                                                                {s.full_name} (
                                                                {USER_ROLE_TO_TYPE[
                                                                    s.role
                                                                ] ||
                                                                    s.role}
                                                                )
                                                            </button>
                                                        ))}
                                                </div>
                                            )}
                                    </div>
                                    {staffId && (
                                        <span className='text-xs text-green-400 mt-1 block'>
                                            Assigned to: {staffName}
                                        </span>
                                    )}
                                    {staffId && scheduleStart === "13:00" && (
                                        <span className='text-xs text-yellow-400 mt-1 block'>
                                            ⚠ No schedule found for this day. Times may be outside working hours.
                                        </span>
                                    )}
                                </label>

                                {/* Service Selection */}
                                <label className='w-full font-semibold text-xs capitalize text-white/60'>
                                    Service (Optional)
                                    <select
                                        value={selectedService}
                                        onChange={(e) =>
                                            setSelectedService(e.target.value)
                                        }
                                        className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                        disabled={isLoading}
                                    >
                                        <option value=''>
                                            Select a service...
                                        </option>
                                        {services.map((service) => (
                                            <option
                                                key={service.id}
                                                value={service.id}
                                            >
                                                {service.title} - ₱
                                                {service.price}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                {/* Downpayment Toggle */}
                                <div className='border-t border-white/10 pt-4 mt-2'>
                                    <label className='flex items-center gap-2 cursor-pointer'>
                                        <input
                                            type='checkbox'
                                            checked={collectDownpayment}
                                            onChange={(e) => { e.stopPropagation(); setCollectDownpayment(e.target.checked) }}
                                            className='w-4 h-4 rounded'
                                        />
                                        <span className='text-sm font-medium'>Collect deposit</span>
                                    </label>

                                    {collectDownpayment && (
                                        <div className='mt-3 space-y-3 pl-6'>
                                            <div>
                                                <label className='text-xs text-white/60 block mb-1'>Estimated Total</label>
                                                <input
                                                    type='number'
                                                    value={estimatedTotal}
                                                    onChange={(e) => setEstimatedTotal(parseFloat(e.target.value) || 0)}
                                                    className='w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-sm'
                                                    placeholder='e.g. 30000'
                                                />
                                            </div>
                                            <div>
                                                <label className='text-xs text-white/60 block mb-1'>Deposit Amount</label>
                                                <input
                                                    type='number'
                                                    value={downpaymentAmount}
                                                    onChange={(e) => setDownpaymentAmount(parseFloat(e.target.value) || 0)}
                                                    className='w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-sm'
                                                    placeholder={`${(estimatedTotal * 0.1).toFixed(0)} (10% suggested)`}
                                                />
                                                <p className='text-xs text-white/40 mt-1'>
                                                    Suggested: ₱{(estimatedTotal * 0.1).toFixed(0)} (10%)
                                                </p>
                                            </div>
                                            <div>
                                                <label className='text-xs text-white/60 block mb-1'>Payment Method</label>
                                                <select
                                                    value={dpPaymentMethod}
                                                    onChange={(e) => setDpPaymentMethod(e.target.value as PaymentMethod)}
                                                    className='w-full px-3 py-2 bg-white/10 border border-white/20 rounded-md text-sm'
                                                >
                                                    <option value='CASH'>Cash</option>
                                                    <option value='GCASH'>GCash</option>
                                                    <option value='CARD'>Card</option>
                                                    <option value='BANK_TRANSFER'>Bank Transfer</option>
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Date & Time Section */}
                        <div className='bg-white/5 p-3 rounded-md border border-white/10'>
                            <h3 className='text-sm font-semibold text-white/80 mb-3'>
                                Date & Time
                            </h3>
                            <div className='flex flex-col gap-3'>
                                {/* Date */}
                                <label className='w-full font-semibold text-xs capitalize text-white/60'>
                                    Date *
                                    <input
                                        type='date'
                                        min={getMinDate()}
                                        value={date.toISOString().split("T")[0]}
                                        onChange={(e) =>
                                            setDate(new Date(e.target.value))
                                        }
                                        className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                        disabled={isLoading}
                                    />
                                </label>

                                {/* Time Selection */}
                                <div className='flex flex-row gap-3'>
                                    <label className='flex-1 font-semibold text-xs capitalize text-white/60'>
                                        Start Time *
                                        <select
                                            value={startTime || ""}
                                            onChange={(e) => {
                                                const val = Number(
                                                    e.target.value,
                                                )
                                                setStartTime(val)
                                                if (endTime && endTime <= val) {
                                                    setEndTime(0)
                                                }
                                            }}
                                            className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                            disabled={isLoading}
                                        >
                                            <option value=''>Select...</option>
                                            {availableSlots.map((slot) => (
                                                <option
                                                    key={slot}
                                                    value={slot}
                                                >
                                                    {slot > 12
                                                        ? slot - 12
                                                        : slot}
                                                    :00{" "}
                                                    {slot >= 12 ? "PM" : "AM"}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className='flex-1 font-semibold text-xs capitalize text-white/60'>
                                        End Time *
                                        <select
                                            value={endTime || ""}
                                            onChange={(e) =>
                                                setEndTime(
                                                    Number(e.target.value),
                                                )
                                            }
                                            className='w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                            disabled={isLoading || !startTime}
                                        >
                                            <option value=''>Select...</option>
                                            {availableSlots
                                                .filter(
                                                    (slot) => slot > startTime,
                                                )
                                                .map((slot) => (
                                                    <option
                                                        key={slot}
                                                        value={slot}
                                                    >
                                                        {slot > 12
                                                            ? slot - 12
                                                            : slot}
                                                        :00{" "}
                                                        {slot >= 12
                                                            ? "PM"
                                                            : "AM"}
                                                    </option>
                                                ))}
                                        </select>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Notes */}
                        <label className='w-full font-semibold text-xs capitalize text-white/60'>
                            Notes (Optional)
                            <motion.textarea
                                placeholder='Add any special notes or requirements...'
                                className='resize-none w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40'
                                rows={noteRows}
                                value={notes}
                                onChange={(e) => {
                                    setNotes(e.target.value)
                                    setNoteRows(
                                        Math.max(
                                            3,
                                            e.target.value.split("\n").length,
                                        ),
                                    )
                                }}
                                disabled={isLoading}
                            />
                        </label>
                    </div>

                    <div className='w-full h-0.5 bg-white/10' />

                    {/* Actions */}
                    <div className='flex flex-row gap-2'>
                        <button
                            onClick={handleClose}
                            disabled={isLoading}
                            className='flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 border-2 border-white/5 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isLoading || !isValid}
                            className='flex-1 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border-2 border-green-400/20 rounded-md font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            {isLoading ? (
                                <>
                                    <LoaderCircleIcon
                                        size={16}
                                        className='animate-spin'
                                    />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <UserIcon size={16} />
                                    Create Walk-in
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
