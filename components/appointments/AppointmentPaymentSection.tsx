"use client"

import { Appointment } from "@/utils/types/general"

interface AppointmentPaymentSectionProps {
    appointment: Appointment
    downpaymentId: string | null | undefined
    downpaymentAmount: number | null | undefined
}

function getPaymentStatusBadge(status: string | undefined) {
    switch (status) {
        case "DEPOSIT_PAID":
            return { label: "Deposit Paid", color: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30" }
        case "PAID_IN_FULL":
            return { label: "Paid in Full", color: "bg-green-400/20 text-green-300 border-green-400/30" }
        case "REFUNDED":
            return { label: "Refunded", color: "bg-red-400/20 text-red-300 border-red-400/30" }
        default:
            return { label: "Unpaid", color: "bg-white/10 text-white/60 border-white/10" }
    }
}

export default function AppointmentPaymentSection({
    appointment, downpaymentAmount,
}: AppointmentPaymentSectionProps) {
    const badge = getPaymentStatusBadge(appointment.payment_status)

    return (
        <div className="bg-white/5 p-6 rounded-lg border border-white/10">
            <h3 className="text-lg font-semibold mb-4">Payment</h3>

            <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-white/60">Status:</span>
                <span className={`px-2 py-0.5 rounded-sm text-xs font-semibold border ${badge.color}`}>
                    {badge.label}
                </span>
            </div>

            {downpaymentAmount && downpaymentAmount > 0 && (
                <div className="flex items-center gap-3">
                    <span className="text-sm text-white/60">Deposit:</span>
                    <span className="text-green-300 font-semibold">
                        ₱{downpaymentAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                </div>
            )}

            {appointment.payment_status === "UNPAID" && !downpaymentAmount && (
                <p className="text-sm text-white/40 italic">No payments collected yet.</p>
            )}
        </div>
    )
}
