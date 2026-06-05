'use server'
import {
    AppointmentCreatedTemplate,
    AppointmentReminderTemplate,
    AppointmentStatusTemplate,
    BaseEmailTemplate,
    GenericMessageTemplate,
    InventoryLowTemplate,
    InventoryRestockRequestTemplate,
    NotificationTemplate,
    PasswordResetTemplate,
    SendInvitationTemplate,
} from "@/components/email/templates"
import { render } from "@react-email/components"
import { Resend } from "resend"
import { createLogs } from "./logs"
import { ActionResponse, success, failure } from "@/utils/types/responses"

// Create a Resend client
const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail(
    to: string,
    subject: string,
    mail: React.ReactNode
): Promise<ActionResponse<string>> {
    // Check if email is valid
    const emailRegex =
        /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    if (!emailRegex.test(to)) {
        return failure('Invalid Email Address')
    }

    // Generate Email
    const html = await render(mail, { pretty: true })
    const text = await render(mail, { plainText: true })

    // Send Email
    const { error:   mail_err } = await resend.emails.send({
        from: "InkSight <inksight@rdmdstudio.com>",
        to: to,
        subject: subject,
        html,
        text,
    })

    // Check for errors
    if (mail_err) {
        await createLogs({
            logs: [
                {
                    level: 'ERROR',
                    type: 'SYSTEM',
                    message: `Failed to send email to ${to}: ${mail_err.message}`,
                },
            ],
        })
        return failure(mail_err.message)
    }

    return success('Email Sent!')
}

export interface TestEmailResult {
    success: number
    failed: number
    total: number
}

export async function testEmail(
    to: string,
    test: boolean = false,
    type?:
        | "reset"
        | "invite"
        | "appointment_created"
        | "appointment_accepted"
        | "appointment_rejected"
        | "appointment_reminder"
        | "inventory_low"
        | "inventory_restock"
        | "generic"
        | "notification"
): Promise<ActionResponse<TestEmailResult>> {
    let email: React.ReactNode
    let subject = "Test Email"

    switch (type) {
        case "reset":
            email = PasswordResetTemplate({
                link: "https://inksight.rdmdstudio.com/reset-password",
            })
            subject = "Password Reset"
            break
        case "invite":
            email = SendInvitationTemplate({
                link: "https://inksight.rdmdstudio.com/invite",
                email: to,
            })
            subject = "Invitation"
            break
        case "appointment_created":
            email = AppointmentCreatedTemplate({
                clientName: "John Doe",
                appointmentDate: "October 24, 2024",
                appointmentTime: "2:00 PM",
                serviceName: "Tattoo Session",
                link: "https://inksight.rdmdstudio.com/appointments/123",
            })
            subject = "Appointment Created"
            break
        case "appointment_accepted":
            email = AppointmentStatusTemplate({
                clientName: "John Doe",
                appointmentDate: "October 24, 2024",
                status: "ACCEPTED",
                link: "https://inksight.rdmdstudio.com/appointments/123",
            })
            subject = "Appointment Accepted"
            break
        case "appointment_rejected":
            email = AppointmentStatusTemplate({
                clientName: "John Doe",
                appointmentDate: "October 24, 2024",
                status: "REJECTED",
                reason: "Artist unavailable",
                link: "https://inksight.rdmdstudio.com/appointments/123",
            })
            subject = "Appointment Rejected"
            break
        case "appointment_reminder":
            email = AppointmentReminderTemplate({
                clientName: "John Doe",
                appointmentDate: "October 24, 2024",
                appointmentTime: "2:00 PM",
                serviceName: "Tattoo Session",
                link: "https://inksight.rdmdstudio.com/appointments/123",
            })
            subject = "Appointment Reminder"
            break
        case "inventory_low":
            email = InventoryLowTemplate({
                itemName: "Black Ink",
                currentStock: 2,
                threshold: 5,
                link: "https://inksight.rdmdstudio.com/inventory/123",
            })
            subject = "Low Stock Alert"
            break
        case "inventory_restock":
            email = InventoryRestockRequestTemplate({
                requesterName: "Jane Smith",
                itemName: "Needles 5RL",
                quantity: 50,
                link: "https://inksight.rdmdstudio.com/inventory/requests/123",
            })
            subject = "Restock Request"
            break
        case "generic":
            email = GenericMessageTemplate({
                title: "Important Update",
                message: "This is a generic message to inform you about system maintenance.",
                link: "https://inksight.rdmdstudio.com",
            })
            subject = "Generic Message"
            break
        case "notification":
            email = NotificationTemplate({
                title: "New Comment",
                content: "Someone commented on your post.",
                link: "https://inksight.rdmdstudio.com/notifications/123",
            })
            subject = "New Notification"
            break
        default:
            email = BaseEmailTemplate({
                subject: "Test Email",
                preview: "This is a test email",
            })
            break
    }

    const result = await sendEmail(
        test ? "delivered@resend.dev" : to,
        subject,
        email
    )

    if (!result.success) {
        return failure(result.error)
    }

    return success({ success: 1, failed: 0, total: 1 })
}

// Appointments
export async function sendAppointmentCreatedEmail(
    email: string,
    clientName: string,
    appointmentDate: string,
    appointmentTime: string,
    serviceName: string,
    appointmentId: string
): Promise<ActionResponse<string>> {
    const link = `https://inksight.rdmdstudio.com/appointments?id=${appointmentId}`
    const content = AppointmentCreatedTemplate({
        clientName,
        appointmentDate,
        appointmentTime,
        serviceName,
        link,
    })
    return await sendEmail(email, "Appointment Scheduled", content)
}

export async function sendAppointmentStatusEmail(
    email: string,
    clientName: string,
    appointmentDate: string,
    status: "ACCEPTED" | "REJECTED",
    appointmentId: string,
    reason?: string
): Promise<ActionResponse<string>> {
    const link = `https://inksight.rdmdstudio.com/appointments?id=${appointmentId}`
    const content = AppointmentStatusTemplate({
        clientName,
        appointmentDate,
        status,
        reason,
        link,
    })
    const subject =
        status === "ACCEPTED" ? "Appointment Confirmed" : "Appointment Update"
    return await sendEmail(email, subject, content)
}

export async function sendAppointmentReminderEmail(
    email: string,
    clientName: string,
    appointmentDate: string,
    appointmentTime: string,
    serviceName: string,
    appointmentId: string
): Promise<ActionResponse<string>> {
    const link = `https://inksight.rdmdstudio.com/appointments?id=${appointmentId}`
    const content = AppointmentReminderTemplate({
        clientName,
        appointmentDate,
        appointmentTime,
        serviceName,
        link,
    })
    return await sendEmail(email, "Appointment Reminder", content)
}

// Inventory
export async function sendInventoryLowEmail(
    email: string,
    itemName: string,
    currentStock: number,
    threshold: number,
    inventoryId: string
): Promise<ActionResponse<string>> {
    const link = `https://inksight.rdmdstudio.com/inventory?id=${inventoryId}`
    const content = InventoryLowTemplate({
        itemName,
        currentStock,
        threshold,
        link,
    })
    return await sendEmail(email, `Low Stock Alert: ${itemName}`, content)
}

export async function sendInventoryRestockRequestEmail(
    email: string,
    requesterName: string,
    itemName: string,
    quantity: number,
    inventoryId: string
): Promise<ActionResponse<string>> {
    const link = `https://inksight.rdmdstudio.com/inventory?id=${inventoryId}`
    const content = InventoryRestockRequestTemplate({
        requesterName,
        itemName,
        quantity,
        link,
    })
    return await sendEmail(email, "Inventory Restock Request", content)
}

// General
export async function sendGenericMessageEmail(
    email: string,
    title: string,
    message: string,
    link?: string,
    buttonText?: string
): Promise<ActionResponse<string>> {
    const content = GenericMessageTemplate({
        title,
        message,
        link,
        buttonText,
    })
    return await sendEmail(email, title, content)
}

export async function sendNotificationEmail(
    email: string,
    title: string,
    content: string,
    link?: string
): Promise<ActionResponse<string>> {
    const emailContent = NotificationTemplate({
        title,
        content,
        link,
    })
    return await sendEmail(email, title, emailContent)
}

// Password Reset
export async function requestPasswordResetEmail(email: string, authkey: string): Promise<ActionResponse<string>> {
    const link = `https://inksight.rdmdstudio.com/auth?action=reset&key=${authkey}`
    const content = PasswordResetTemplate({ link })
    return await sendEmail(email, 'Password Reset', content)
}

export async function sendInviteEmail(email: string, authkey: string): Promise<ActionResponse<string>> {
    const link = `https://inksight.rdmdstudio.com/auth?action=user_type&key=${authkey}`
    const content = SendInvitationTemplate({ link, email })
    return await sendEmail(email, 'InkSight Invitation', content)
}

export interface BulkEmailResult {
    successful: number
    failed: number
    total: number
}

export async function sendBulkNotificationEmail(
    recipients: { email: string; name?: string }[],
    subject: string,
    message: string,
    templateType: "generic" | "notification" = "generic",
    link?: string,
    buttonText?: string
): Promise<ActionResponse<BulkEmailResult>> {
    const results = await Promise.allSettled(
        recipients.map((recipient) => {
            if (templateType === "notification") {
                return sendNotificationEmail(
                    recipient.email,
                    subject,
                    message,
                    link
                )
            } else {
                return sendGenericMessageEmail(
                    recipient.email,
                    subject,
                    message,
                    link,
                    buttonText
                )
            }
        })
    )

    // Return success/failure summary
    const successful = results.filter((r) => r.status === "fulfilled" && (r.value as ActionResponse<string>).success).length
    const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !(r.value as ActionResponse<string>).success)).length

    return success({ successful, failed, total: recipients.length })
}

// ============ Payroll Notifications ============

export interface PayrollNotificationResult {
    successful: number
    failed: number
}

/**
 * Notify managers that a staff member has submitted a payment request
 */
export async function sendPayrollRequestNotification(
    managerEmails: string[],
    staffName: string,
    requestAmount: number,
    periodStart: string,
    periodEnd: string,
    currencySymbol: string = '₱'
): Promise<ActionResponse<PayrollNotificationResult>> {
    const results = await Promise.allSettled(
        managerEmails.map((email) =>
            sendGenericMessageEmail(
                email,
                'New Payment Request',
                `${staffName} has submitted a payment request for ${currencySymbol}${requestAmount.toFixed(2)} covering the period ${periodStart} to ${periodEnd}. Please review and process this request.`,
                'https://inksight.rdmdstudio.com/payroll',
                'View Request'
            )
        )
    )

    const successful = results.filter((r) => r.status === "fulfilled" && (r.value as ActionResponse<string>).success).length
    const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !(r.value as ActionResponse<string>).success)).length

    return success({ successful, failed })
}

/**
 * Notify staff that their payment request has been confirmed
 */
export async function sendPayrollConfirmedNotification(
    staffEmail: string,
    staffName: string,
    requestAmount: number,
    currencySymbol: string = '₱'
): Promise<ActionResponse<string>> {
    return await sendGenericMessageEmail(
        staffEmail,
        'Payment Request Confirmed',
        `Hi ${staffName}, your payment request for ${currencySymbol}${requestAmount.toFixed(2)} has been confirmed and is being processed. You will be notified when the payment is complete.`,
        'https://inksight.rdmdstudio.com/my-payroll',
        'View Status'
    )
}

/**
 * Notify staff that their payment has been completed
 */
export async function sendPayrollCompletedNotification(
    staffEmail: string,
    staffName: string,
    requestAmount: number,
    paymentMethod: string,
    currencySymbol: string = '₱'
): Promise<ActionResponse<string>> {
    return await sendGenericMessageEmail(
        staffEmail,
        'Payment Complete',
        `Hi ${staffName}, your payment of ${currencySymbol}${requestAmount.toFixed(2)} has been completed via ${paymentMethod}. Thank you for your hard work!`,
        'https://inksight.rdmdstudio.com/my-payroll',
        'View Payment History'
    )
}

/**
 * Notify staff that their payment request has been cancelled
 */
export async function sendPayrollCancelledNotification(
    staffEmail: string,
    staffName: string,
    requestAmount: number,
    reason: string,
    currencySymbol: string = '₱'
): Promise<ActionResponse<string>> {
    return await sendGenericMessageEmail(
        staffEmail,
        'Payment Request Cancelled',
        `Hi ${staffName}, your payment request for ${currencySymbol}${requestAmount.toFixed(2)} has been cancelled. ${reason ? `Reason: ${reason}` : 'Please contact your manager for more details.'}`,
        'https://inksight.rdmdstudio.com/my-payroll',
        'View My Payroll'
    )
}
