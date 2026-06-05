export interface StaffSchedule {
    id: string
    staff_id: string
    day_of_week: number // 0 = Sunday, 6 = Saturday
    start_time: string | null // HH:MM:SS format
    end_time: string | null // HH:MM:SS format
    is_off: boolean
    created_at: string
    updated_at: string
}

export interface TimeLog {
    id: string
    staff_id: string
    clock_in: string
    clock_out: string | null
    notes: string | null
    created_at: string
    updated_at: string
}

export interface ClockStatus {
    isClockedIn: boolean
    currentLog: TimeLog | null
    clockedInAt: string | null
    duration: string | null // e.g., "02:34:15"
}

export interface ScheduleInput {
    day_of_week: number
    start_time: string | null
    end_time: string | null
    is_off: boolean
}
