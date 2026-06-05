'use server'

import { createLogs } from "@/server/actions/logs"

// IT Admin email configuration
// Can be set via environment variable (comma-separated)
export async function getITAdminEmails(): Promise<string[]> {
    const envEmails = process.env.IT_ADMIN_EMAILS
    if (!envEmails) {
        // No fallback - must be configured via environment variable
        createLogs({ logs: [{ level: 'WARN', type: 'SYSTEM', message: 'IT_ADMIN_EMAILS environment variable not set' }] })
        return []
    }
    return envEmails.split(',').map(email => email.trim().toLowerCase())
}

export async function isITAdmin(email: string): Promise<boolean> {
    const itAdmins = await getITAdminEmails()
    return itAdmins.includes(email.toLowerCase())
}
