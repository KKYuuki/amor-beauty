"use client"

import { useState } from "react"
import NextImage from "next/image"
import { ChevronDownIcon, LoaderCircleIcon, SendIcon } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { PayrollEntry } from "@/utils/types/payroll"
import { getStaffEarningsForPeriod } from "@/server/actions/payroll"
import { useBranchContext } from "@/components/branch-context"

const STATUS_COLORS: Record<string, string> = {
    PENDING: "bg-yellow-400/20 text-yellow-300 border-yellow-400/30",
    REQUESTED: "bg-orange-400/20 text-orange-300 border-orange-400/30",
    CONFIRMED: "bg-blue-400/20 text-blue-300 border-blue-400/30",
    PAID: "bg-green-400/20 text-green-300 border-green-400/30",
}

interface StaffEarningsRowProps {
    staffId: string
    staffName: string
    avatarUrl?: string
    totalEarned: number
    pendingAmount: number
    paidAmount: number
    dateFrom: string
    dateTo: string
    currencySymbol: string
    onRequestPayout: (entries: PayrollEntry[]) => void
    // Note: totalEarned/paidAmount are approximate from the summary query.
    // Actual entry-level data is lazy-loaded on expand via getStaffEarningsForPeriod().
}

export default function StaffEarningsRow({
    staffId,
    staffName,
    avatarUrl,
    totalEarned,
    pendingAmount,
    paidAmount,
    dateFrom,
    dateTo,
    currencySymbol,
    onRequestPayout,
}: StaffEarningsRowProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [entries, setEntries] = useState<PayrollEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set())
    const { currentBranch } = useBranchContext()

    const handleToggle = async () => {
        if (isExpanded) {
            setIsExpanded(false)
            return
        }
        setIsExpanded(true)
        setLoading(true)
        setError(null)
        try {
            const result = await getStaffEarningsForPeriod(
                staffId,
                dateFrom,
                dateTo,
                currentBranch?.id ?? null
            )
            if (result.success) {
                setEntries(result.data)
            } else {
                setError(result.error || 'Failed to load entries')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load entries')
        }
        setLoading(false)
    }

    const toggleEntry = (id: string) => {
        const next = new Set(selectedEntryIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedEntryIds(next)
    }

    const selectAllPending = () => {
        const pending = entries.filter((e) => e.payment_status === "PENDING")
        if (selectedEntryIds.size === pending.length) {
            setSelectedEntryIds(new Set())
        } else {
            setSelectedEntryIds(new Set(pending.map((e) => e.id)))
        }
    }

    const selectedTotal = entries
        .filter((e) => selectedEntryIds.has(e.id))
        .reduce((s, e) => s + Number(e.staff_cut), 0)

    const hasPending = pendingAmount > 0

    return (
        <div className={`bg-white/5 rounded-lg transition-colors ${isExpanded ? "bg-white/10" : "hover:bg-white/10"}`}>
            {/* Header Row */}
            <button
                onClick={handleToggle}
                className={`w-full flex items-center justify-between p-4 text-left ${!hasPending ? "opacity-60" : ""}`}
            >
                <div className='flex items-center gap-3'>
                    <div className='w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white font-bold overflow-hidden'>
                        {avatarUrl ? (
                            <NextImage
                                src={avatarUrl}
                                alt={staffName}
                                width={40}
                                height={40}
                                className='w-full h-full rounded-full object-cover'
                            />
                        ) : (
                            staffName.charAt(0).toUpperCase()
                        )}
                    </div>
                    <div>
                        <p className='font-medium'>{staffName}</p>
                        <p className='text-xs text-white/40'>
                            Total: {currencySymbol}{totalEarned.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            {" · "}
                            <span className='text-green-400'>Paid: {currencySymbol}{paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            {" · "}
                            <span className={hasPending ? "text-yellow-300" : "text-white/40"}>
                                Pending: {currencySymbol}{pendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </p>
                    </div>
                </div>
                <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronDownIcon className='w-5 h-5 text-white/40' />
                </motion.div>
            </button>

            {/* Expanded Detail Panel */}
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className='overflow-hidden'
                    >
                        <div className='px-4 pb-4 border-t border-white/10'>
                            {loading ? (
                                <div className='flex justify-center py-4'>
                                    <LoaderCircleIcon className='w-5 h-5 animate-spin text-white/40' />
                                </div>
                            ) : error ? (
                                <p className='text-red-400/80 text-sm text-center py-4'>
                                    {error}
                                </p>
                            ) : entries.length === 0 ? (
                                <p className='text-white/40 text-sm text-center py-4'>
                                    No earnings in this period for {staffName}
                                </p>
                            ) : (
                                <>
                                    <div className='flex justify-between items-center mt-3 mb-2'>
                                        <span className='text-xs text-white/50'>
                                            {entries.filter(e => e.payment_status === "PENDING").length} pending entries
                                        </span>
                                        {entries.some(e => e.payment_status === "PENDING") && (
                                            <button
                                                onClick={selectAllPending}
                                                className='text-xs text-blue-400 hover:underline'
                                            >
                                                {selectedEntryIds.size === entries.filter(e => e.payment_status === "PENDING").length
                                                    ? "Deselect All"
                                                    : "Select All Pending"}
                                            </button>
                                        )}
                                    </div>
                                    <div className='space-y-1 max-h-64 overflow-auto'>
                                        {entries.map((entry) => (
                                            <label
                                                key={entry.id}
                                                className={`flex items-center gap-3 p-2 rounded cursor-pointer ${
                                                    entry.payment_status !== "PENDING"
                                                        ? "opacity-60"
                                                        : selectedEntryIds.has(entry.id)
                                                          ? "bg-green-500/20"
                                                          : "bg-white/5 hover:bg-white/10"
                                                }`}
                                            >
                                                {entry.payment_status === "PENDING" && (
                                                    <input
                                                        type='checkbox'
                                                        checked={selectedEntryIds.has(entry.id)}
                                                        onChange={() => toggleEntry(entry.id)}
                                                        className='accent-green-500'
                                                    />
                                                )}
                                                {entry.payment_status !== "PENDING" && (
                                                    <span className='w-4' />
                                                )}
                                                <div className='flex-1 min-w-0'>
                                                    <div className='flex items-center gap-2'>
                                                        <p className='text-sm truncate'>
                                                            {entry.service_description || "Service"}
                                                        </p>
                                                        {entry.staff_rate_snapshot?.serviceType && (
                                                            <span className='text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/60'>
                                                                {entry.staff_rate_snapshot.serviceType}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className='text-xs text-white/40'>
                                                        {new Date(entry.service_date).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <div className='text-right'>
                                                    <p className='text-sm font-bold text-green-400'>
                                                        {currencySymbol}{Number(entry.staff_cut).toFixed(2)}
                                                    </p>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[entry.payment_status] || "bg-white/10 text-white/60"}`}>
                                                        {entry.payment_status}
                                                    </span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    {selectedEntryIds.size > 0 && (
                                        <div className='flex items-center justify-between pt-3 mt-3 border-t border-white/10'>
                                            <div>
                                                <p className='text-xs text-white/50'>
                                                    {selectedEntryIds.size} entries selected
                                                </p>
                                                <p className='text-lg font-bold text-green-400'>
                                                    {currencySymbol}{selectedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const selected = entries.filter((e) =>
                                                        selectedEntryIds.has(e.id)
                                                    )
                                                    onRequestPayout(selected)
                                                }}
                                                className='flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded text-sm border border-green-500/30'
                                            >
                                                <SendIcon className='w-4 h-4' />
                                                Request
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
