export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG" | "FATAL"

export type LogType = "APPOINTMENT" | "INVENTORY" | "SYSTEM" | "AUTH" | "ACCOUNTING" | "PAYROLL" | "STORAGE" | "METRICS" | "OTHER" | "PUSH"

export interface LogEntry {
    id: string
    date: string
    level: LogLevel
    type: LogType
    user_id?: string
    user_name?: string
    branch_id?: string
    branch_name?: string
    message?: string
}

export interface CreateLogEntryPayload {
    level: LogLevel
    type: LogType
    user_id?: string
    branch_id?: string
    message?: string
}