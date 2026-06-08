"use client"

import { useState, useEffect } from "react"
import { motion } from "motion/react"
import { XIcon, SendIcon, LoaderCircleIcon } from "lucide-react"
import { PayrollEntry, PayoutPeriod } from "@/utils/types/payroll"
import { createPayrollRequest, getPendingEntries } from "@/server/actions/payroll"

interface StaffRequestModalProps {
    staffId: string
    staffName: string
    currencySymbol: string
    pendingEntries: PayrollEntry[]
    staffList: Array<{ id: string; full_name: string }>
    onClose: () => void
    onSuccess: () => void
    addNotification: (message: string, type: 'SUCCESS' | 'ERROR') => void
}

export function StaffRequestModal({
    staffId,
    staffName,
    currencySymbol,
    pendingEntries,
    staffList,
    onClose,
    onSuccess,
    addNotification,
}: StaffRequestModalProps) {
    const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set())
    const [submittingRequest, setSubmittingRequest] = useState(false)
    const [selectedStaffId, setSelectedStaffId] = useState(staffId || "")
    const [loadingPending, setLoadingPending] = useState(false)
    // Local entries state — populated from prop initially, or fetched when staff is selected from list
    const [localEntries, setLocalEntries] = useState<PayrollEntry[]>(pendingEntries)

    // Sync when prop changes (e.g., from StaffEarningsRow "Request" button)
    useEffect(() => {
        if (pendingEntries.length > 0) {
            setLocalEntries(pendingEntries)
        }
    }, [pendingEntries])

    // Fetch pending entries when a staff is selected from the list
    useEffect(() => {
        if (selectedStaffId && selectedStaffId !== staffId) {
            setLoadingPending(true)
            setLocalEntries([])
            getPendingEntries(selectedStaffId).then((result) => {
                if (result.success) {
                    setLocalEntries(result.data)
                }
            }).finally(() => {
                setLoadingPending(false)
            })
        }
    }, [selectedStaffId, staffId])

    const handleSubmit = async () => {
        if (selectedEntryIds.size === 0) return
        setSubmittingRequest(true)
        try {
            const selectedEntries = localEntries.filter(
                (e) => selectedEntryIds.has(e.id)
            )
            const dates = selectedEntries.map(
                (e) => new Date(e.service_date)
            )
            const minDate = new Date(
                Math.min(...dates.map((d) => d.getTime()))
            )
            const maxDate = new Date(
                Math.max(...dates.map((d) => d.getTime()))
            )

            const result = await createPayrollRequest({
                staff_id: staffId,
                entry_ids: Array.from(selectedEntryIds),
                period_type: "DAILY" as PayoutPeriod,
                period_start: minDate,
                period_end: maxDate,
            })

            if (result.success) {
                addNotification("Payment request submitted", "SUCCESS")
                onSuccess()
            } else {
                addNotification(
                    result.error || "Failed to submit request",
                    "ERROR"
                )
            }
        } catch {
            addNotification("Failed to submit request", "ERROR")
        } finally {
            setSubmittingRequest(false)
        }
    }

    const totalAmount = localEntries
        .filter((e) => selectedEntryIds.has(e.id))
        .reduce((s, e) => s + Number(e.staff_cut), 0)

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-card rounded-xl w-full max-w-md border border-border flex flex-col max-h-[80vh]'
            >
                <div className='p-6 border-b border-border flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>
                        Request Payout for {staffName}
                    </h3>
                    <button
                        onClick={onClose}
                        className='text-muted-foreground hover:text-foreground'
                    >
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>
                <div className='p-4 max-h-[60vh] overflow-y-auto'>
                    {!selectedStaffId ? (
                        <div className='space-y-2'>
                            <p className='text-sm text-muted-foreground mb-3'>Select a staff member to request payout for:</p>
                            {staffList.length === 0 ? (
                                <p className='text-sm text-muted-foreground/70 text-center py-4'>No staff available</p>
                            ) : (
                                <div className='grid gap-2'>
                                    {staffList.map((staff) => (
                                        <button
                                            key={staff.id}
                                            onClick={() => {
                                                setSelectedStaffId(staff.id)
                                            }}
                                            className='w-full text-left p-3 bg-muted hover:bg-muted rounded-lg transition-colors border border-border'
                                        >
                                            <p className='text-sm font-medium text-foreground'>{staff.full_name}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {loadingPending ? (
                                <div className='flex justify-center py-8'>
                                    <LoaderCircleIcon className='w-5 h-5 animate-spin text-muted-foreground/70' />
                                </div>
                            ) : localEntries.length === 0 ? (
                                <div className='text-center py-8'>
                                    <p className='text-muted-foreground/70 text-sm'>No pending entries found for this staff member</p>
                                </div>
                            ) : (
                                <div className='space-y-3'>
                                    <p className='text-sm text-muted-foreground'>
                                        Select entries to include in the payout request
                                    </p>
                                    {localEntries.map((entry) => (
                                        <label
                                            key={entry.id}
                                            className='flex items-center gap-3 p-3 bg-muted rounded-lg cursor-pointer hover:bg-muted transition-colors'
                                        >
                                            <input
                                                type='checkbox'
                                                checked={selectedEntryIds.has(entry.id)}
                                                onChange={(e) => {
                                                    const newSet = new Set(selectedEntryIds)
                                                    if (e.target.checked) {
                                                        newSet.add(entry.id)
                                                    } else {
                                                        newSet.delete(entry.id)
                                                    }
                                                    setSelectedEntryIds(newSet)
                                                }}
                                                className='w-4 h-4'
                                            />
                                            <div className='flex-1 min-w-0'>
                                                <p className='text-sm text-foreground truncate'>
                                                    {entry.service_description || 'Service'}
                                                </p>
                                                <p className='text-xs text-muted-foreground/70'>
                                                    {new Date(entry.service_date).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <p className='text-sm text-green-400 font-medium'>
                                                {currencySymbol}{Number(entry.staff_cut).toFixed(2)}
                                            </p>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
                <div className='p-4 border-t border-border flex items-center justify-between'>
                    {selectedStaffId ? (
                        <>
                            <button
                                onClick={() => setSelectedStaffId("")}
                                className='px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors'
                            >
                                ← Back
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={selectedEntryIds.size === 0 || submittingRequest}
                                className='px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-foreground rounded text-sm font-medium transition-colors flex items-center gap-2'
                            >
                                {submittingRequest ? (
                                    <>
                                        <LoaderCircleIcon className='w-4 h-4 animate-spin' />
                                        Submitting...
                                    </>
                                ) : (
                                    <>
                                        <SendIcon className='w-4 h-4' />
                                        Submit Request ({currencySymbol}{totalAmount.toFixed(2)})
                                    </>
                                )}
                            </button>
                        </>
                    ) : (
                        <div />
                    )}
                </div>
            </motion.div>
        </div>
    )
}
