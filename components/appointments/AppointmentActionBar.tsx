"use client"

import { useRouter } from "next/navigation"
import {
    CheckIcon, XIcon, RotateCcwIcon, PencilIcon,
    ShoppingCartIcon, LoaderCircleIcon, PlayIcon, ArrowLeftIcon
} from "lucide-react"
import { Appointment, AppointmentStatus } from "@/utils/types/general"

interface AppointmentActionBarProps {
    appointment: Appointment
    isStaff: boolean
    isAssignedStaff: boolean
    isEditing: boolean
    saving: boolean
    creatingTransaction: boolean
    existingTransactionId: string | null
    onStatusChange: (status: AppointmentStatus) => Promise<void>
    onMarkOnGoing: () => Promise<void>
    onShowCompleteModal: () => void
    onCreateTransaction: () => Promise<void>
    onEditStart: () => void
    onEditSave: () => Promise<void>
    onEditCancel: () => void
}

export default function AppointmentActionBar({
    appointment, isStaff, isAssignedStaff: _isAssignedStaff, isEditing, saving,
    creatingTransaction, existingTransactionId,
    onStatusChange, onMarkOnGoing, onShowCompleteModal,
    onCreateTransaction, onEditStart, onEditSave, onEditCancel,
}: AppointmentActionBarProps) {
    const router = useRouter()

    return (
        <div className="flex flex-wrap gap-2 items-center">
            <button
                onClick={() => router.push("/appointments")}
                className="p-2 rounded-md hover:bg-white/10 transition-colors"
                title="Back"
            >
                <ArrowLeftIcon size={20} />
            </button>

            {/* CONFIRMED → ONGOING */}
            {isStaff && appointment.status === "CONFIRMED" && (
                <button
                    onClick={onMarkOnGoing}
                    data-testid="appt-action-start-session"
                    className="px-3 py-1.5 bg-green-400/20 hover:bg-green-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors"
                >
                    <PlayIcon size={16} />
                    Start Session
                </button>
            )}

            {/* ONGOING → COMPLETED */}
            {isStaff && appointment.status === "ONGOING" && (
                <button
                    onClick={onShowCompleteModal}
                    data-testid="appt-action-complete"
                    className="px-3 py-1.5 bg-green-400/20 hover:bg-green-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors"
                >
                    <CheckIcon size={16} />
                    Complete
                </button>
            )}

            {/* PENDING actions */}
            {appointment.status === "PENDING" && isStaff && (
                <>
                    <button onClick={() => onStatusChange("CONFIRMED")}
                        data-testid="appt-action-confirm"
                        className="px-3 py-1.5 bg-green-400/20 hover:bg-green-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                        <CheckIcon size={16} /> Confirm
                    </button>
                    <button onClick={() => onStatusChange("CANCELLED")}
                        className="px-3 py-1.5 bg-red-400/20 hover:bg-red-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                        <XIcon size={16} /> Reject
                    </button>
                </>
            )}

            {/* Cancel (from CONFIRMED or ONGOING) */}
            {isStaff && (appointment.status === "CONFIRMED" || appointment.status === "ONGOING") && (
                <button onClick={() => onStatusChange("CANCELLED")}
                    data-testid="appt-action-cancel"
                    className="px-3 py-1.5 bg-red-400/20 hover:bg-red-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                    <XIcon size={16} /> Cancel
                </button>
            )}

            {/* CANCELLED recovery */}
            {appointment.status === "CANCELLED" && (
                <button onClick={() => onStatusChange("CONFIRMED")}
                    data-testid="appt-action-recover"
                    className="px-3 py-1.5 bg-orange-400/20 hover:bg-orange-400/40 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                    <RotateCcwIcon size={16} /> Recover
                </button>
            )}

            {/* Edit (CONFIRMED only) */}
            {isStaff && appointment.status === "CONFIRMED" && !isEditing && (
                <button onClick={onEditStart}
                    data-testid="appt-action-edit"
                    className="px-3 py-1.5 bg-yellow-400/20 hover:bg-yellow-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                    <PencilIcon size={16} /> Edit
                </button>
            )}

            {/* Edit mode actions */}
            {isEditing && (
                <>
                    <button onClick={onEditSave} disabled={saving}
                        className="px-3 py-1.5 bg-green-400/20 hover:bg-green-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors disabled:opacity-50">
                        {saving ? <LoaderCircleIcon className="w-4 h-4 animate-spin" /> : <CheckIcon size={16} />}
                        Save
                    </button>
                    <button onClick={onEditCancel} disabled={saving}
                        className="px-3 py-1.5 bg-red-400/20 hover:bg-red-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors">
                        <XIcon size={16} /> Cancel
                    </button>
                </>
            )}

            {/* Collect Balance (COMPLETED + DEPOSIT_PAID) */}
            {appointment.status === "COMPLETED" && appointment.payment_status === "DEPOSIT_PAID" && (
                <button onClick={onCreateTransaction} disabled={creatingTransaction}
                    data-testid="appt-action-collect-balance"
                    className="px-3 py-1.5 bg-blue-400/20 hover:bg-blue-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors disabled:opacity-50">
                    {creatingTransaction ? <LoaderCircleIcon className="w-4 h-4 animate-spin" /> : <ShoppingCartIcon size={16} />}
                    Collect Balance
                </button>
            )}

            {/* Open in Sales (COMPLETED) */}
            {appointment.status === "COMPLETED" && isStaff && appointment.payment_status !== "DEPOSIT_PAID" && (
                <button onClick={onCreateTransaction} disabled={creatingTransaction}
                    className="px-3 py-1.5 bg-blue-400/20 hover:bg-blue-400/30 rounded-md border-2 border-white/5 font-semibold text-sm flex items-center gap-2 transition-colors disabled:opacity-50">
                    {creatingTransaction ? <LoaderCircleIcon className="w-4 h-4 animate-spin" /> : <ShoppingCartIcon size={16} />}
                    {existingTransactionId ? "View in Sales" : "Open in Sales"}
                </button>
            )}
        </div>
    )
}
