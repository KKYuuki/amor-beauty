import { getAppointmentWithDetails } from "@/server/actions/appointments"
import { notFound } from "next/navigation"
import AppointmentDetailClient from "../appointmentDetailClient"

interface AppointmentDetailPageProps {
    params: Promise<{ id: string }>
}

export default async function AppointmentDetailPage({ params }: AppointmentDetailPageProps) {
    const { id } = await params

    const result = await getAppointmentWithDetails(id)

    if (!result.success || !result.data || !result.data.appointment) {
        notFound()
    }

    const { appointment, details } = result.data

    return (
        <AppointmentDetailClient
            appointment={appointment}
            appointmentDetails={details}
        />
    )
}
