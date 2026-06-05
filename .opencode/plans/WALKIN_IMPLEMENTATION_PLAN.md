# Walk-in Appointment Implementation Plan

## Master Checklist

### Pre-Implementation
- [ ] Review this entire plan
- [ ] Verify current database state
- [ ] Ensure all dependencies are installed

### Phase 1: Database Schema Updates
- [ ] Create migration file
- [ ] Add walk-in client fields to appointments table
- [ ] Run migration in Supabase
- [ ] Verify columns exist
- [ ] **STOP & TEST**: Run `bun run lint` and `bun run build`

### Phase 2: Backend Type Definitions
- [ ] Update `Appointment` interface in `utils/types/general.ts`
- [ ] Add walk-in client fields to types
- [ ] **STOP & TEST**: Run `bun run lint` and `bun run build`

### Phase 3: Backend API Updates
- [ ] Create `createWalkinAppointment` server action
- [ ] Update `updateAppointment` to handle walk-in fields
- [ ] Add `getAppointmentWithWalkinDetails` helper
- [ ] **STOP & TEST**: Run `bun run lint` and `bun run build`

### Phase 4: WalkinAppointmentModal Component
- [ ] Create `WalkinAppointmentModal.tsx`
- [ ] Implement form with client info fields
- [ ] Add appointment type selector with staff filtering
- [ ] Add service selection
- [ ] Add date/time picker
- [ ] Follow all styling conventions (glassmorphism, animations)
- [ ] **STOP & TEST**: Run `bun run lint` and `bun run build`

### Phase 5: Update CompleteAppointmentModal
- [ ] Add "Go to Sales" button
- [ ] Implement navigation with query params
- [ ] Add conditional display for walk-in appointments
- [ ] **STOP & TEST**: Run `bun run lint` and `bun run build`

### Phase 6: Update AppointmentsPage
- [ ] Add "+ Walk-in" button alongside "Request Appointment"
- [ ] Wire up modal opening
- [ ] Handle walk-in appointment creation success
- [ ] **STOP & TEST**: Run `bun run lint` and `bun run build`

### Phase 7: Sales Page Integration
- [ ] Update SalesContext to handle walk-in appointment data
- [ ] Auto-populate cart from appointment query param
- [ ] Set walk-in customer info
- [ ] Handle missing client_id gracefully
- [ ] **STOP & TEST**: Run `bun run lint` and `bun run build`

### Phase 8: Update AppointmentBox
- [ ] Display walk-in client name
- [ ] Show walk-in indicator badge
- [ ] Handle missing client profile gracefully
- [ ] **STOP & TEST**: Run `bun run lint` and `bun run build`

### Phase 9: Final Testing & Verification
- [ ] Test complete walk-in flow end-to-end
- [ ] Test all appointment types (Tattoo, Piercing, Shoe)
- [ ] Test staff assignment scenarios
- [ ] Test edge cases (no staff, no services)
- [ ] Verify all builds pass
- [ ] **STOP & FINALIZE**

---

## Phase 1: Database Schema Updates

**Priority**: CRITICAL - Must complete first
**Estimated Time**: 10 minutes
**Files**: 1 file

### 1.1 Create Migration File

**File**: `supabase/migrations/add_walkin_client_details.sql`

```sql
-- Migration: Add walk-in client details to appointments table
-- Purpose: Enable storing client information for walk-in appointments without accounts

-- Add walk-in client detail columns
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS client_name TEXT,
ADD COLUMN IF NOT EXISTS client_phone TEXT,
ADD COLUMN IF NOT EXISTS client_email TEXT;

-- Add comments for documentation
COMMENT ON COLUMN appointments.client_name IS 'Walk-in client name (no registered account)';
COMMENT ON COLUMN appointments.client_phone IS 'Walk-in client phone number';
COMMENT ON COLUMN appointments.client_email IS 'Walk-in client email address';

-- Verification query
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'appointments'
AND column_name IN ('client_name', 'client_phone', 'client_email', 'is_walkin')
ORDER BY column_name;
```

### 1.2 Run Migration

1. Open Supabase SQL Editor
2. Copy and paste the migration SQL
3. Execute the migration
4. Verify the columns were added successfully

### Testing This Phase

```bash
# Verify no TypeScript errors from missing columns
bun run lint
bun run build
```

**STOP HERE - DO NOT PROCEED UNTIL:**
- [ ] Migration file created
- [ ] Migration executed in Supabase
- [ ] Columns verified in database
- [ ] `bun run lint` passes
- [ ] `bun run build` passes
- [ ] Phase 1 marked complete in checklist

---

## Phase 2: Backend Type Definitions

**Priority**: HIGH
**Estimated Time**: 5 minutes
**Files**: 1 file

### 2.1 Update Appointment Interface

**File**: `utils/types/general.ts`

**Add to Appointment interface** (around line 36):

```typescript
export interface Appointment {
    id: string
    created_at: Date
    title: string
    client_id?: string  // Optional for walk-in appointments
    staff_id?: string | null  // Optional - null for unassigned/walk-in appointments
    time_start: Date
    time_end: Date
    actual_time_start?: Date
    actual_time_end?: Date
    status: AppointmentStatus
    notes?: string
    type: AppointmentType | null
    is_active: boolean
    is_walkin: boolean  // True for walk-in appointments without a client account
    // NEW: Walk-in client details
    client_name?: string
    client_phone?: string
    client_email?: string
}
```

### Testing This Phase

```bash
bun run lint
bun run build
```

**STOP HERE - DO NOT PROCEED UNTIL:**
- [ ] Type interface updated
- [ ] `bun run lint` passes
- [ ] `bun run build` passes
- [ ] Phase 2 marked complete in checklist

---

## Phase 3: Backend API Updates

**Priority**: HIGH
**Estimated Time**: 20 minutes
**Files**: 1 file

### 3.1 Create Walk-in Appointment Server Action

**File**: `app/api/actions/appointments.ts`

**Add at the end of the file** (after line 823):

```typescript
// --- Walk-in Appointment Functions ---

export interface CreateWalkinAppointmentPayload {
    title: string
    client_name: string
    client_phone?: string
    client_email?: string
    staff_id?: string | null
    time_start: Date
    time_end: Date
    notes?: string
    type: AppointmentType | null
    status?: AppointmentStatus
}

export async function createWalkinAppointment(
    payload: CreateWalkinAppointmentPayload
): Promise<{ success: boolean; appointment?: Appointment; message?: string }> {
    // Server-side authorization check - staff only
    const { authorized, userId } = await requireStaffAuth()
    if (!authorized) {
        createLogs({
            logs: [{
                level: 'WARN',
                type: 'APPOINTMENT',
                message: 'Unauthorized createWalkinAppointment attempt'
            }]
        })
        return { success: false, message: 'Unauthorized' }
    }

    const db = await createServerClient()

    try {
        const { data, error } = await db
            .from('appointments')
            .insert({
                title: payload.title,
                client_id: null, // Walk-in has no registered client
                client_name: payload.client_name,
                client_phone: payload.client_phone || null,
                client_email: payload.client_email || null,
                staff_id: payload.staff_id || null,
                time_start: payload.time_start.toISOString(),
                time_end: payload.time_end.toISOString(),
                notes: payload.notes || null,
                type: payload.type,
                status: payload.status || 'PENDING',
                is_active: true,
                is_walkin: true
            })
            .select('*')
            .single()

        if (error) {
            createLogs({
                logs: [{
                    level: 'ERROR',
                    type: 'APPOINTMENT',
                    message: `Error creating walk-in appointment: ${error.message}`
                }]
            })
            return { success: false, message: `Failed to create appointment: ${error.message}` }
        }

        createLogs({
            logs: [{
                level: 'INFO',
                type: 'APPOINTMENT',
                message: `Created walk-in appointment: ${payload.title} by ${userId}`
            }]
        })

        return { success: true, appointment: data as Appointment }
    } catch (err) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'APPOINTMENT',
                message: `Exception creating walk-in appointment: ${err}`
            }]
        })
        return { success: false, message: 'An unexpected error occurred' }
    }
}

// Get appointment with walk-in details for sales integration
export async function getAppointmentWithDetails(appointmentId: string) {
    const db = await createServerClient()
    
    const { data, error } = await db
        .from('appointments')
        .select(`
            *,
            appointment_services(
                service:services(*)
            ),
            appointment_items(
                quantity,
                inventory:inventory(*)
            )
        `)
        .eq('id', appointmentId)
        .eq('is_active', true)
        .single()

    if (error) {
        createLogs({
            logs: [{
                level: 'ERROR',
                type: 'SYSTEM',
                message: `Error fetching appointment details: ${error.message}`
            }]
        })
        return null
    }

    return data
}
```

### Testing This Phase

```bash
bun run lint
bun run build
```

**STOP HERE - DO NOT PROCEED UNTIL:**
- [ ] Server actions created
- [ ] `bun run lint` passes
- [ ] `bun run build` passes
- [ ] Phase 3 marked complete in checklist

---

## Phase 4: WalkinAppointmentModal Component

**Priority**: HIGH
**Estimated Time**: 60 minutes
**Files**: 1 new file

### 4.1 Create WalkinAppointmentModal Component

**File**: `components/appointments/WalkinAppointmentModal.tsx`

**Full Implementation:**

```typescript
"use client"

import { NotificationContext } from "@/components/notifications"
import { SideBarContext } from "@/components/sidebar"
import { UserProfile } from "@/utils/types/auth"
import {
    AppointmentType,
    Service,
} from "@/utils/types/general"
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { getStaffProfiles } from "@/app/api/actions/profile"
import { ClockIcon, XIcon, LoaderCircleIcon, UserIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import {
    createWalkinAppointment,
    createAppointmentDetails,
    getStaffAppointments,
    addServiceToAppointment,
    CreateWalkinAppointmentPayload,
} from "@/app/api/actions/appointments"
import { getServices } from "@/app/api/actions/services"

interface WalkinAppointmentModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess?: () => void
}

// User type mapping for appointment types
const USER_TYPE_MAP: Record<AppointmentType, string[]> = {
    TATTOO: ["ARTIST"],
    PIERCING: ["PIERCER"],
    SHOE: ["SHOE_TECH"],
    OTHER: ["ARTIST", "PIERCER", "SHOE_TECH", "ADMIN", "STAFF"],
}

export default function WalkinAppointmentModal({
    isOpen,
    onClose,
    onSuccess,
}: WalkinAppointmentModalProps) {
    // Contexts
    const { addNotification } = useContext(NotificationContext)
    const { userInfo } = useContext(SideBarContext)

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
    
    // Time Slots
    const [availableSlots, setAvailableSlots] = useState<number[]>([])
    const [bookedRanges, setBookedRanges] = useState<
        { start: number; end: number }[]
    >([])

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

    // Filter staff by appointment type
    const filteredStaff = useMemo(() => {
        if (!type) return staff
        const allowedTypes = USER_TYPE_MAP[type]
        return staff.filter((s) => allowedTypes.includes(s.user_type))
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
            const [staffData, servicesData] = await Promise.all([
                getStaffProfiles(),
                getServices(),
            ])
            setStaff(staffData)
            setServices(servicesData.filter((s) => s.is_active))
        }
        fetchData()
    }, [])

    // Fetch available slots when staff or date changes
    useEffect(() => {
        const fetchSlots = async () => {
            if (!staffId || !date) {
                setAvailableSlots(generateSlots())
                return
            }

            const staffAppointments = await getStaffAppointments(staffId)
            const selectedDate = new Date(date).toDateString()
            
            const booked = staffAppointments
                .filter((a) => new Date(a.time_start).toDateString() === selectedDate)
                .map((a) => ({
                    start: new Date(a.time_start).getHours(),
                    end: new Date(a.time_end).getHours(),
                }))
            
            setBookedRanges(booked)
            
            const allSlots = generateSlots()
            const available = allSlots.filter((slot) => {
                return !booked.some((range) => slot >= range.start && slot < range.end)
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
                status: "PENDING",
            }

            const result = await createWalkinAppointment(payload)

            if (!result.success || !result.appointment) {
                addNotification(result.message || "Failed to create appointment", "ERROR")
                setIsLoading(false)
                return
            }

            // Add service if selected
            if (selectedService) {
                const serviceResult = await addServiceToAppointment(
                    result.appointment.id,
                    selectedService
                )
                if (!serviceResult.success) {
                    addNotification(serviceResult.message || "Failed to add service", "WARN")
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

            addNotification("Walk-in appointment created successfully!", "SUCCESS")
            onSuccess?.()
            handleClose()
        } catch (error) {
            console.error("Error creating walk-in appointment:", error)
            addNotification("An unexpected error occurred", "ERROR")
        } finally {
            setIsLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <motion.div
                key="walkin-appointment-modal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onClick={(e) => {
                    if (e.target === e.currentTarget && !isLoading) handleClose()
                }}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-black/95 border-2 border-white/10 rounded-lg p-4 flex flex-col gap-4 m-4"
                >
                    {/* Header */}
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <UserIcon size={20} className="text-green-400" />
                            New Walk-in Appointment
                        </h2>
                        <button
                            onClick={handleClose}
                            disabled={isLoading}
                            className="p-1 hover:bg-white/10 rounded-md transition-colors disabled:opacity-50"
                        >
                            <XIcon size={20} />
                        </button>
                    </div>

                    <div className="w-full h-0.5 bg-white/10" />

                    {/* Form Content */}
                    <div className="flex flex-col gap-4 flex-1 overflow-auto">
                        
                        {/* Client Information Section */}
                        <div className="bg-white/5 p-3 rounded-md border border-white/10">
                            <h3 className="text-sm font-semibold text-white/80 mb-3">
                                Client Information
                            </h3>
                            <div className="flex flex-col gap-3">
                                {/* Client Name */}
                                <label className="w-full font-semibold text-xs capitalize text-white/60">
                                    Client Name *
                                    <input
                                        type="text"
                                        placeholder="Enter walk-in client name"
                                        value={clientName}
                                        onChange={(e) => setClientName(e.target.value)}
                                        className="w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40"
                                        disabled={isLoading}
                                    />
                                </label>

                                <div className="flex flex-row gap-3">
                                    {/* Client Phone */}
                                    <label className="flex-1 font-semibold text-xs capitalize text-white/60">
                                        Phone (Optional)
                                        <input
                                            type="tel"
                                            placeholder="Phone number"
                                            value={clientPhone}
                                            onChange={(e) => setClientPhone(e.target.value)}
                                            className="w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40"
                                            disabled={isLoading}
                                        />
                                    </label>

                                    {/* Client Email */}
                                    <label className="flex-1 font-semibold text-xs capitalize text-white/60">
                                        Email (Optional)
                                        <input
                                            type="email"
                                            placeholder="Email address"
                                            value={clientEmail}
                                            onChange={(e) => setClientEmail(e.target.value)}
                                            className="w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40"
                                            disabled={isLoading}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Appointment Details Section */}
                        <div className="bg-white/5 p-3 rounded-md border border-white/10">
                            <h3 className="text-sm font-semibold text-white/80 mb-3">
                                Appointment Details
                            </h3>
                            <div className="flex flex-col gap-3">
                                {/* Appointment Title */}
                                <label className="w-full font-semibold text-xs capitalize text-white/60">
                                    Appointment Title *
                                    <input
                                        type="text"
                                        placeholder="e.g., Sleeve Tattoo Session 1"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40"
                                        disabled={isLoading}
                                    />
                                </label>

                                {/* Appointment Type */}
                                <label className="w-full font-semibold text-xs capitalize text-white/60">
                                    Appointment Type *
                                    <select
                                        value={type || ""}
                                        onChange={(e) => setType(e.target.value as AppointmentType)}
                                        className="w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40"
                                        disabled={isLoading}
                                    >
                                        <option value="TATTOO">Tattoo</option>
                                        <option value="PIERCING">Piercing</option>
                                        <option value="SHOE">Shoe Cleaning</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </label>

                                {/* Staff Selection */}
                                <label className="w-full font-semibold text-xs capitalize text-white/60">
                                    Assign to {type === "TATTOO" ? "Artist" : type === "PIERCING" ? "Piercer" : type === "SHOE" ? "Shoe Tech" : "Staff"} (Optional)
                                    <div className="relative">
                                        <input
                                            ref={staffInputRef}
                                            type="text"
                                            placeholder={`Search ${type === "TATTOO" ? "artist" : type === "PIERCING" ? "piercer" : type === "SHOE" ? "shoe tech" : "staff"}...`}
                                            value={staffName}
                                            onChange={(e) => {
                                                setStaffName(e.target.value)
                                                if (staffId) setStaffId("")
                                            }}
                                            className="w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40"
                                            disabled={isLoading}
                                        />
                                        {/* Staff Dropdown */}
                                        {staffName && !staffId && filteredStaff.length > 0 && (
                                            <div className="absolute z-10 w-full mt-1 bg-black/95 border border-white/10 rounded-md max-h-40 overflow-y-auto">
                                                {filteredStaff
                                                    .filter((s) =>
                                                        s.full_name
                                                            .toLowerCase()
                                                            .includes(staffName.toLowerCase())
                                                    )
                                                    .map((s) => (
                                                        <button
                                                            key={s.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setStaffId(s.id)
                                                                setStaffName(s.full_name)
                                                            }}
                                                            className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors"
                                                        >
                                                            {s.full_name} ({s.user_type})
                                                        </button>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                    {staffId && (
                                        <span className="text-xs text-green-400 mt-1 block">
                                            Assigned to: {staffName}
                                        </span>
                                    )}
                                </label>

                                {/* Service Selection */}
                                <label className="w-full font-semibold text-xs capitalize text-white/60">
                                    Service (Optional)
                                    <select
                                        value={selectedService}
                                        onChange={(e) => setSelectedService(e.target.value)}
                                        className="w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40"
                                        disabled={isLoading}
                                    >
                                        <option value="">Select a service...</option>
                                        {services.map((service) => (
                                            <option key={service.id} value={service.id}>
                                                {service.title} - ₱{service.price}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </div>

                        {/* Date & Time Section */}
                        <div className="bg-white/5 p-3 rounded-md border border-white/10">
                            <h3 className="text-sm font-semibold text-white/80 mb-3">
                                Date & Time
                            </h3>
                            <div className="flex flex-col gap-3">
                                {/* Date */}
                                <label className="w-full font-semibold text-xs capitalize text-white/60">
                                    Date *
                                    <input
                                        type="date"
                                        min={getMinDate()}
                                        value={date.toISOString().split("T")[0]}
                                        onChange={(e) => setDate(new Date(e.target.value))}
                                        className="w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40"
                                        disabled={isLoading}
                                    />
                                </label>

                                {/* Time Selection */}
                                <div className="flex flex-row gap-3">
                                    <label className="flex-1 font-semibold text-xs capitalize text-white/60">
                                        Start Time *
                                        <select
                                            value={startTime || ""}
                                            onChange={(e) => {
                                                const val = Number(e.target.value)
                                                setStartTime(val)
                                                if (endTime && endTime <= val) {
                                                    setEndTime(0)
                                                }
                                            }}
                                            className="w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40"
                                            disabled={isLoading}
                                        >
                                            <option value="">Select...</option>
                                            {availableSlots.map((slot) => (
                                                <option key={slot} value={slot}>
                                                    {slot > 12 ? slot - 12 : slot}:00 {slot >= 12 ? "PM" : "AM"}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className="flex-1 font-semibold text-xs capitalize text-white/60">
                                        End Time *
                                        <select
                                            value={endTime || ""}
                                            onChange={(e) => setEndTime(Number(e.target.value))}
                                            className="w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40"
                                            disabled={isLoading || !startTime}
                                        >
                                            <option value="">Select...</option>
                                            {availableSlots
                                                .filter((slot) => slot > startTime)
                                                .map((slot) => (
                                                    <option key={slot} value={slot}>
                                                        {slot > 12 ? slot - 12 : slot}:00 {slot >= 12 ? "PM" : "AM"}
                                                    </option>
                                                ))}
                                        </select>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Notes */}
                        <label className="w-full font-semibold text-xs capitalize text-white/60">
                            Notes (Optional)
                            <motion.textarea
                                placeholder="Add any special notes or requirements..."
                                className="resize-none w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40"
                                rows={noteRows}
                                value={notes}
                                onChange={(e) => {
                                    setNotes(e.target.value)
                                    setNoteRows(Math.max(3, e.target.value.split("\n").length))
                                }}
                                disabled={isLoading}
                            />
                        </label>
                    </div>

                    <div className="w-full h-0.5 bg-white/10" />

                    {/* Actions */}
                    <div className="flex flex-row gap-2">
                        <button
                            onClick={handleClose}
                            disabled={isLoading}
                            className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 border-2 border-white/5 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isLoading || !isValid}
                            className="flex-1 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border-2 border-green-400/20 rounded-md font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <LoaderCircleIcon size={16} className="animate-spin" />
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
```

### Testing This Phase

```bash
bun run lint
bun run build
```

**STOP HERE - DO NOT PROCEED UNTIL:**
- [ ] WalkinAppointmentModal component created
- [ ] All form fields implemented
- [ ] Staff filtering by type working
- [ ] Animations and styling match project conventions
- [ ] `bun run lint` passes
- [ ] `bun run build` passes
- [ ] Phase 4 marked complete in checklist

---

## Phase 5: Update CompleteAppointmentModal

**Priority**: MEDIUM
**Estimated Time**: 15 minutes
**Files**: 1 file

### 5.1 Add "Go to Sales" Button

**File**: `components/appointments/completeAppointmentModal.tsx`

**Add imports** (around line 20):
```typescript
import { useRouter } from "next/navigation"
import { ShoppingCartIcon } from "lucide-react"
```

**Add router hook** (after line 43):
```typescript
const router = useRouter()
```

**Add "Go to Sales" button to actions** (replace line 398-425):

```tsx
{/* Actions */}
<div className="flex flex-row gap-2">
    <button
        onClick={onClose}
        disabled={isLoading}
        className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 border-2 border-white/5 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
        Close
    </button>
    
    {/* Show "Go to Sales" for walk-in appointments */}
    {appointment.is_walkin && (
        <button
            onClick={() => {
                router.push(`/sales?appointment=${appointment.id}`)
                onClose()
            }}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border-2 border-blue-400/20 rounded-md font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            <ShoppingCartIcon size={16} />
            Go to Sales
        </button>
    )}
</div>
```

### Testing This Phase

```bash
bun run lint
bun run build
```

**STOP HERE - DO NOT PROCEED UNTIL:**
- [ ] "Go to Sales" button added
- [ ] Router navigation working
- [ ] Button only shows for walk-in appointments
- [ ] `bun run lint` passes
- [ ] `bun run build` passes
- [ ] Phase 5 marked complete in checklist

---

## Phase 6: Update AppointmentsPage

**Priority**: MEDIUM
**Estimated Time**: 20 minutes
**Files**: 1 file

### 6.1 Add Walk-in Modal Integration

**File**: `app/appointments/appointmentsPage.tsx`

**Add import** (around line 40):
```typescript
import WalkinAppointmentModal from "@/components/appointments/WalkinAppointmentModal"
```

**Add state** (around line 76):
```typescript
const [showWalkinModal, setShowWalkinModal] = useState(false)
```

**Update the button section** (around line 275-283):

```tsx
<div className="flex flex-col gap-2">
    <div className="flex flex-row gap-2">
        <div
            className="flex-1 border-2 border-white/10 border-dashed cursor-pointer transition-colors hover:bg-white/10 px-2 py-2 rounded-md text-center font-semibold active:bg-white/20 select-none"
            onClick={() => {
                setSelectedAppointment(null)
                if (isMobile) setIsMobileOpen(true)
            }}
        >
            Request Appointment
        </div>
        <div
            className="flex-1 border-2 border-green-500/20 border-dashed cursor-pointer transition-colors hover:bg-green-500/10 px-2 py-2 rounded-md text-center font-semibold active:bg-green-500/20 select-none"
            onClick={() => {
                setShowWalkinModal(true)
            }}
        >
            + Walk-in
        </div>
    </div>
```

**Add modal to JSX** (before the closing `</Suspense>` tag):

```tsx
{/* Walk-in Appointment Modal */}
<AnimatePresence>
    {showWalkinModal && (
        <WalkinAppointmentModal
            isOpen={showWalkinModal}
            onClose={() => setShowWalkinModal(false)}
            onSuccess={() => {
                getAppointments()
                addNotification("Walk-in appointment created", "SUCCESS")
            }}
        />
    )}
</AnimatePresence>
```

### Testing This Phase

```bash
bun run lint
bun run build
```

**STOP HERE - DO NOT PROCEED UNTIL:**
- [ ] "+ Walk-in" button added
- [ ] Modal opens/closes correctly
- [ ] onSuccess callback refreshes appointments
- [ ] `bun run lint` passes
- [ ] `bun run build` passes
- [ ] Phase 6 marked complete in checklist

---

## Phase 7: Sales Page Integration

**Priority**: MEDIUM
**Estimated Time**: 30 minutes
**Files**: 1 file

### 7.1 Update SalesContext to Handle Walk-in Appointments

**File**: `components/sales/context/SalesContext.tsx`

**Add import** (around line 5):
```typescript
import { getAppointmentWithDetails } from "@/app/api/actions/appointments"
```

**Add effect to load appointment from URL** (after existing effects, around line 700):

```typescript
// Load appointment from URL query param (for walk-in flow)
useEffect(() => {
    const loadAppointmentFromUrl = async () => {
        const urlParams = new URLSearchParams(window.location.search)
        const appointmentId = urlParams.get("appointment")
        
        if (appointmentId) {
            try {
                const appointment = await getAppointmentWithDetails(appointmentId)
                
                if (appointment && appointment.is_walkin) {
                    // Load into cart
                    const newCart: CartItem[] = []
                    
                    appointment.appointment_services?.forEach((as: any) => {
                        if (as.service) {
                            newCart.push({
                                id: as.service.id,
                                type: "SERVICE",
                                name: as.service.title,
                                unit_price: as.service.price,
                                quantity: 1,
                            })
                        }
                    })
                    
                    appointment.appointment_items?.forEach((ai: any) => {
                        if (ai.inventory) {
                            newCart.push({
                                id: ai.inventory.id,
                                type: "INVENTORY",
                                name: ai.inventory.name,
                                unit_price: ai.inventory.unit_price || 0,
                                quantity: ai.quantity,
                                max_quantity: ai.inventory.current_stock,
                            })
                        }
                    })
                    
                    setCart(newCart)
                    setSelectedAppointmentId(appointment.id)
                    
                    // Set walk-in client info
                    if (appointment.client_name) {
                        setCustomerMode("WALKIN")
                        setWalkinName(appointment.client_name)
                        setWalkinPhone(appointment.client_phone || "")
                        setWalkinEmail(appointment.client_email || "")
                    }
                    
                    // Set staff if assigned
                    if (appointment.staff_id) {
                        setSelectedStaff(appointment.staff_id)
                    }
                    
                    addNotification(
                        `Loaded walk-in appointment for ${appointment.client_name || "Client"}`,
                        "SUCCESS"
                    )
                    
                    // Clear URL param
                    window.history.replaceState({}, "", "/sales")
                }
            } catch (error) {
                console.error("Error loading appointment:", error)
                addNotification("Failed to load appointment", "ERROR")
            }
        }
    }
    
    loadAppointmentFromUrl()
}, [])
```

### Testing This Phase

```bash
bun run lint
bun run build
```

**STOP HERE - DO NOT PROCEED UNTIL:**
- [ ] URL query param parsing working
- [ ] Appointment data loads into cart
- [ ] Walk-in client info populated correctly
- [ ] Staff selection updated
- [ ] URL param cleared after loading
- [ ] `bun run lint` passes
- [ ] `bun run build` passes
- [ ] Phase 7 marked complete in checklist

---

## Phase 8: Update AppointmentBox

**Priority**: LOW
**Estimated Time**: 10 minutes
**Files**: 1 file

### 8.1 Display Walk-in Client Name

**File**: `components/appointments/appointmentBox.tsx`

**Update client display** (around line 89-94):

```tsx
<span className="text-xl font-medium">
    {userInfo.id === appointment.client_id
        ? (staffInfo?.full_name || "Unassigned")
        : appointment.is_walkin
        ? (appointment.client_name || "Walk-in")
        : (clientInfo?.full_name || "Unknown")}
</span>
```

**Add walk-in badge** (around line 96-100):

```tsx
{appointment.is_walkin && (
    <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-sm border border-green-400/20">
        Walk-in
    </span>
)}
```

### Testing This Phase

```bash
bun run lint
bun run build
```

**STOP HERE - DO NOT PROCEED UNTIL:**
- [ ] Walk-in client name displays correctly
- [ ] Walk-in badge visible
- [ ] Fallback to "Walk-in" if no name
- [ ] `bun run lint` passes
- [ ] `bun run build` passes
- [ ] Phase 8 marked complete in checklist

---

## Phase 9: Final Testing & Verification

**Priority**: CRITICAL
**Estimated Time**: 45 minutes

### 9.1 Test Complete Walk-in Flow

**Test Case A: Create Walk-in Tattoo Appointment**
1. Go to Appointments page
2. Click "+ Walk-in" button
3. Fill in:
   - Client Name: "John Doe"
   - Phone: "09123456789"
   - Email: "john@example.com"
   - Title: "Sleeve Tattoo"
   - Type: "Tattoo"
   - Assign to Artist: [Select artist]
   - Service: [Select tattoo service]
   - Date/Time: [Select available slot]
4. Click "Create Walk-in"
5. **Verify**: Success notification, appointment appears in list

**Test Case B: Complete and Send to Sales**
1. Find the walk-in appointment
2. Open it
3. Click "Complete"
4. Add final photo (if tattoo)
5. Click "Complete" again
6. **Verify**: "Go to Sales" button appears
7. Click "Go to Sales"
8. **Verify**: Redirects to sales page
9. **Verify**: Cart auto-populated with services/items
10. **Verify**: Walk-in client name pre-filled

**Test Case C: Process Payment**
1. In sales page, verify walk-in client name shown
2. Add any additional items if needed
3. Process payment (Cash/Card/GCash)
4. Complete transaction
5. **Verify**: Transaction created successfully
6. **Verify**: No payroll entry created (walk-in staff optional)

### 9.2 Test Edge Cases

**Test Case D: Walk-in Without Staff Assignment**
1. Create walk-in appointment without selecting staff
2. Complete it
3. Go to sales
4. **Verify**: Can process payment without staff commission

**Test Case E: Walk-in Piercing**
1. Create walk-in with type "Piercing"
2. **Verify**: Only piercers shown in staff dropdown
3. Complete and test sales flow

**Test Case F: Walk-in Shoe Cleaning**
1. Create walk-in with type "Shoe"
2. **Verify**: Only shoe techs shown in staff dropdown
3. Complete and test sales flow

**Test Case G: Missing Client Name**
1. Try to create walk-in without name
2. **Verify**: Validation error, cannot submit

**Test Case H: Overlapping Time Slots**
1. Create walk-in at specific time
2. Try to create another at same time with same staff
3. **Verify**: Time slot not available in dropdown

### 9.3 Verify Database State

```sql
-- Check walk-in appointments
SELECT 
    id, 
    title, 
    client_name, 
    client_phone, 
    is_walkin, 
    status,
    staff_id
FROM appointments 
WHERE is_walkin = true
ORDER BY created_at DESC
LIMIT 5;
```

### 9.4 Final Build Check

```bash
bun run lint
bun run build
```

**STOP HERE - DO NOT PROCEED UNTIL:**
- [ ] All test cases pass
- [ ] Database state verified
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] `bun run lint` passes
- [ ] `bun run build` passes
- [ ] Phase 9 marked complete in checklist

---

## Summary of Changes

### New Files Created:
1. `supabase/migrations/add_walkin_client_details.sql` - Database migration
2. `components/appointments/WalkinAppointmentModal.tsx` - Walk-in appointment creation modal

### Files Modified:
1. `utils/types/general.ts` - Added walk-in fields to Appointment interface
2. `app/api/actions/appointments.ts` - Added `createWalkinAppointment` and `getAppointmentWithDetails`
3. `components/appointments/completeAppointmentModal.tsx` - Added "Go to Sales" button
4. `app/appointments/appointmentsPage.tsx` - Added "+ Walk-in" button and modal integration
5. `components/sales/context/SalesContext.tsx` - Added URL param handling for walk-in flow
6. `components/appointments/appointmentBox.tsx` - Added walk-in display enhancements

### Database Schema Changes:
- Added `client_name` (TEXT) to appointments table
- Added `client_phone` (TEXT) to appointments table
- Added `client_email` (TEXT) to appointments table

### Flow Summary:
```
Walk-in client arrives
  → Staff clicks "+ Walk-in" button
  → Fills client info (name*, phone, email)
  → Selects appointment type (filters staff dropdown)
  → Assigns to appropriate staff (optional)
  → Selects service (optional)
  → Sets date/time
  → Creates appointment (is_walkin=true, client_id=null)
  → Staff completes service
  → Clicks "Complete" → "Go to Sales"
  → Auto-navigates to sales page
  → Cart pre-populated with services/items
  → Client info pre-filled
  → Processes payment
  → Transaction completed
```

---

## Styling Conventions Reference

### Modal Structure:
```tsx
<motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <motion.div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-black/95 border-2 border-white/10 rounded-lg p-4 flex flex-col gap-4 m-4">
```

### Form Inputs:
```tsx
<label className="w-full font-semibold text-xs capitalize text-white/60">
    Label
    <input className="w-full bg-black/40 px-2 py-1 mt-1 rounded-sm overflow-clip text-base font-normal text-white border-2 border-white/5 outline-none focus:border-white/40" />
</label>
```

### Buttons:
```tsx
// Primary (Success)
<button className="flex-1 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border-2 border-green-400/20 rounded-md font-semibold transition-colors">

// Secondary
<button className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 border-2 border-white/5 rounded-md font-semibold transition-colors">

// Action (Blue)
<button className="flex-1 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border-2 border-blue-400/20 rounded-md font-semibold transition-colors">
```

### Info Boxes:
```tsx
<div className="bg-white/5 p-3 rounded-md border border-white/10">
```

### Animations:
```tsx
<motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9 }}
>
```

---

## Ready to Start?

**Begin with Phase 1: Database Schema Updates**

Remember:
- **STOP after each phase** and run tests
- **Mark checklist items** as you complete them
- **Ask for help** if any phase takes longer than estimated
- **Keep styling consistent** with existing glassmorphism patterns

Good luck! 🚀
