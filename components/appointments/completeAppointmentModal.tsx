"use client"

import { NotificationContext } from "@/components/notifications"
import { SideBarContext } from "@/components/sidebar"
import { Appointment } from "@/utils/types/general"
import {
    CheckIcon,
    LoaderCircleIcon,
    XIcon,
    EyeIcon,
    ShoppingCartIcon,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useContext, useState } from "react"
import {
    updateAppointment,
    getAppointmentDetails,
    updateAppointmentDetails,
} from "@/server/actions/appointments"

import { uploadImage as uploadImageServer } from "@/server/actions/storage"
import { compressImage } from "@/utils/compressImage"

// Wrapper for uploadImage to maintain backward compatibility
const uploadImage = async (
    file: File,
    userId: string,
    _existingId?: string,
    _isTattoo?: boolean,
    _isWebsite?: boolean,
    _tattooData?: { size: string; tags: string }
): Promise<{ id: string } | null> => {
    const result = await uploadImageServer(file, userId)
    if (result.success && result.data) {
        return {
            id: result.data.id,
        }
    }
    return null
}
import { ImageUploader } from "@/components/draganddrop"
import Image from "next/image"
import { useOverlay } from "@/components/overlayProvider"
import { useRouter } from "next/navigation"
import { TattooAppointment } from "@/utils/types/general"

interface CompleteAppointmentModalProps {
    appointment: Appointment
    onClose: () => void
    onComplete: (updated: Appointment) => void
}

export default function CompleteAppointmentModal({
    appointment,
    onClose,
    onComplete,
}: CompleteAppointmentModalProps) {
    // Contexts
    const { addNotification } = useContext(NotificationContext)
    const { openOverlay } = useOverlay()
    const { userInfo } = useContext(SideBarContext)

    // Router
    const router = useRouter()

    // States
    const [isLoading, setIsLoading] = useState(false)
    const [isCompleted, setIsCompleted] = useState(false)
    const [completedAppointment, setCompletedAppointment] = useState<Appointment | null>(null)

    // - Final Photo States
    const [final, setFinal] = useState<File | null>(null)
    const [finalTattooSize, setFinalTattooSize] = useState("")
    const [finalTattooTags, setFinalTattooTags] = useState("")

    // const finalPreviewUrl = useMemo(() => {
    //     if (final) return URL.createObjectURL(final)
    //     return null
    // }, [final])

    // Handle Complete
    const handleComplete = useCallback(async () => {
        setIsLoading(true)

        try {
            let finId = ""

            // Upload final image if provided
            if (final) {
                addNotification("Uploading final photo...", "INFO")
                const compressedFin = await compressImage(final)
                const finRes = await uploadImage(
                    compressedFin,
                    userInfo.id,
                    undefined,
                    true,
                    undefined,
                    finalTattooSize || finalTattooTags
                        ? {
                              size: finalTattooSize,
                              tags: finalTattooTags,
                          }
                        : undefined
                )
                if (!finRes) {
                    addNotification("Failed to upload final image", "ERROR")
                    setIsLoading(false)
                    return
                }
                finId = finRes.id
            }

            // Update appointment details with final image if type is TATTOO
            if (appointment.type === "TATTOO" && finId) {
                // Get current tattoo details first
                const details = (await getAppointmentDetails(
                    appointment.id,
                    "TATTOO"
                )) as TattooAppointment | null

                if (details) {
                    const updated = await updateAppointmentDetails(
                        appointment.id,
                        "TATTOO",
                        {
                            ...details,
                            final_image_id: finId,
                        }
                    )
                    if (!updated) {
                        addNotification(
                            "Failed to update appointment details",
                            "ERROR"
                        )
                        setIsLoading(false)
                        return
                    }
                }
            }

            // Mark appointment as completed
            addNotification("Marking as completed...", "INFO")
            const result = await updateAppointment(appointment.id, {
                status: "COMPLETED",
                actual_time_end: new Date(),
            })

            if (!result.success) {
                addNotification(result.error || "Error marking appointment as done", "ERROR")
                return
            }

            if (result.data) {
                addNotification("Appointment marked as done", "SUCCESS")
                setCompletedAppointment(result.data)
                setIsCompleted(true)
                onComplete(result.data)
            }
        } catch {
            addNotification("An error occurred", "ERROR")
        } finally {
            setIsLoading(false)
        }
    }, [
        addNotification,
        appointment.id,
        appointment.type,
        final,
        finalTattooSize,
        finalTattooTags,
        onComplete,
        userInfo.id,
    ])

    return (
        <motion.div
            key='complete-appointment-modal'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm'
            onClick={(e) => {
                if (e.target === e.currentTarget && !isLoading) onClose()
            }}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className='w-full max-w-md max-h-[90vh] overflow-y-auto bg-black/95 border-2 border-white/10 rounded-lg p-4 flex flex-col gap-4 m-4'
            >
                {/* Header */}
                <div className='flex justify-between items-center'>
                    <h2 className='text-lg font-semibold text-white'>
                        {isCompleted ? 'Appointment Completed' : 'Complete Appointment'}
                    </h2>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className='p-1 hover:bg-white/10 rounded-md transition-colors disabled:opacity-50'
                    >
                        <XIcon size={20} />
                    </button>
                </div>

                <div className='w-full h-0.5 bg-white/10' />

                {!isCompleted ? (
                    <>
                        {/* Info */}
                        <div className='bg-white/5 p-3 rounded-md border border-white/10'>
                            <p className='text-sm text-white/80'>
                                <span className='font-semibold'>
                                    {appointment.title}
                                </span>
                            </p>
                            <p className='text-xs text-white/60 mt-1'>
                                Add a final photo before completing this appointment
                                (optional)
                            </p>
                        </div>

                        {/* Final Photo Upload - Only for TATTOO type */}
                        {appointment.type === "TATTOO" && (
                            <div className='flex flex-col gap-2'>
                                <label className='w-full font-semibold text-xs capitalize text-white/60 select-none'>
                                    Final Photo (Optional)
                                </label>
                                <AnimatePresence mode='wait'>
                                    {!final && (
                                        <>
                                            <ImageUploader
                                                key='complete-final-uploader'
                                                onFileSelect={(file) => {
                                                    setFinal(file)
                                                }}
                                                accept='image/png, image/jpeg, image/jpg'
                                                allowedTypes={["image"]}
                                                maxSizeMB={10}
                                            />
                                        </>
                                    )}
                                    {final && (
                                        <motion.div
                                            key='final-preview'
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                        >
                                            <div className='relative w-full h-40'>
                                                <Image
                                                    src={URL.createObjectURL(final)}
                                                    alt=''
                                                    fill
                                                    className='w-full h-auto object-contain object-center rounded-md'
                                                    onClick={() => {
                                                        openOverlay("IMAGE", {
                                                            image: URL.createObjectURL(
                                                                final
                                                            ),
                                                        })
                                                    }}
                                                />
                                            </div>

                                            <div className='flex flex-row gap-2 mt-2'>
                                                <motion.button
                                                    type='button'
                                                    onClick={() => setFinal(null)}
                                                    className='flex-1 cursor-pointer bg-red-400/10 border-2 border-red-400/5 rounded-sm px-2 py-1 text-white font-base font-semibold hover:bg-red-400/20 active:bg-red-400/30'
                                                >
                                                    Remove
                                                </motion.button>
                                                <motion.button
                                                    type='button'
                                                    onClick={() =>
                                                        openOverlay(
                                                            "IMAGE",
                                                            {
                                                                image: URL.createObjectURL(final),
                                                            }
                                                        )
                                                    }
                                                    className='flex-1 cursor-pointer bg-blue-400/10 border-2 border-blue-400/5 rounded-sm px-2 py-1 text-white font-base font-semibold hover:bg-blue-400/20 active:bg-blue-400/30 flex flex-row gap-2 items-center justify-center'
                                                >
                                                    <EyeIcon size={16} />
                                                    View
                                                </motion.button>
                                            </div>
                                        </motion.div>
                                    )}
                                    {/* Tattoo Details */}
                                    {final && (
                                        <motion.div
                                            key='final-tattoo-details'
                                            className='flex flex-col gap-2 mt-2 p-2 bg-white/5 rounded-md border border-white/10'
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                        >
                                            <span className='text-xs font-bold text-white/80 uppercase'>
                                                Tattoo Details
                                            </span>
                                            <input
                                                type='text'
                                                placeholder='Size (e.g. 5x5 inches)'
                                                value={finalTattooSize}
                                                onChange={(e) =>
                                                    setFinalTattooSize(e.target.value)
                                                }
                                                className='w-full bg-black/40 px-2 py-1 rounded-sm text-sm text-white border border-white/10 outline-none focus:border-white/40'
                                            />
                                            <input
                                                type='text'
                                                placeholder='Tags (comma separated)'
                                                value={finalTattooTags}
                                                onChange={(e) =>
                                                    setFinalTattooTags(e.target.value)
                                                }
                                                className='w-full bg-black/40 px-2 py-1 rounded-sm text-sm text-white border border-white/10 outline-none focus:border-white/40'
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Non-tattoo appointment info */}
                        {appointment.type !== "TATTOO" && (
                            <div className='bg-yellow-400/10 border border-yellow-400/20 p-3 rounded-md'>
                                <p className='text-sm text-yellow-200/80'>
                                    Final photo upload is only available for tattoo
                                    appointments.
                                </p>
                            </div>
                        )}

                        <div className='w-full h-0.5 bg-white/10' />

                        {/* Actions */}
                        <div className='flex flex-row gap-2'>
                            <button
                                onClick={onClose}
                                disabled={isLoading}
                                className='flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 border-2 border-white/5 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                            >
                                Close
                            </button>
                            
                            {/* Complete button for ALL appointments */}
                            <button
                                onClick={handleComplete}
                                disabled={isLoading}
                                className='flex-1 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border-2 border-green-400/20 rounded-md font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed'
                            >
                                {isLoading ? (
                                    <>
                                        <LoaderCircleIcon
                                            size={16}
                                            className='animate-spin'
                                        />
                                        Completing...
                                    </>
                                ) : (
                                    <>
                                        <CheckIcon size={16} />
                                        Complete
                                    </>
                                )}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Completed State */}
                        <div className='flex flex-col items-center gap-4 py-8'>
                            <div className='w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center'>
                                <CheckIcon size={32} className='text-green-400' />
                            </div>
                            <div className='text-center'>
                                <p className='text-lg font-semibold text-white'>
                                    Appointment Completed!
                                </p>
                                <p className='text-sm text-white/60 mt-1'>
                                    {appointment.title}
                                </p>
                            </div>
                        </div>

                        <div className='w-full h-0.5 bg-white/10' />

                        {/* Actions after completion */}
                        <div className='flex flex-col gap-2'>
                            <button
                                onClick={() => {
                                    router.push(`/sales?appointment=${completedAppointment?.id || appointment.id}`)
                                    onClose()
                                }}
                                className='w-full px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 border-2 border-blue-400/20 rounded-md font-semibold transition-colors flex items-center justify-center gap-2'
                            >
                                <ShoppingCartIcon size={18} />
                                Open in Sales
                            </button>
                            
                            <button
                                onClick={onClose}
                                className='w-full px-4 py-2 bg-white/10 hover:bg-white/20 border-2 border-white/5 rounded-md font-semibold transition-colors'
                            >
                                Close
                            </button>
                        </div>
                    </>
                )}
            </motion.div>
        </motion.div>
    )
}
