"use client"

import { SideBarContext } from "@/components/sidebar"
import { UserProfile } from "@/utils/types/auth"
import {
    Appointment,
    PiercingAppointment,
    ShoeAppointment,
    TattooAppointment,
} from "@/utils/types/general"
import { useCallback, useContext, useEffect, useState } from "react"
import { AppointmentService, AppointmentItem } from "@/utils/types/general"
import { CalendarFoldIcon, ClockIcon, CheckIcon } from "lucide-react"
import {
    getAppointmentDetails,
    getAppointmentServices,
    getAppointmentItems,
} from "@/server/actions/appointments"

interface AppointmentCardProps {
    appointment: Appointment
    clientInfo?: UserProfile
    staffInfo?: UserProfile
}

export default function AppointmentCard({
    appointment,
    clientInfo,
    staffInfo,
}: AppointmentCardProps) {
    const { userInfo } = useContext(SideBarContext)
    const [_edit, setEdit] = useState(false)
    const [services, setServices] = useState<AppointmentService[]>([])
    const [items, setItems] = useState<AppointmentItem[]>([])
    const [appointmentDetails, setAppointmentDetails] = useState<
        TattooAppointment | ShoeAppointment | PiercingAppointment | null
    >(null)

    const getAppointmentData = useCallback(async () => {
        const promises: Promise<unknown>[] = [
            getAppointmentServices(appointment.id),
            getAppointmentItems(appointment.id),
        ]
        if (appointment.type) {
            promises.push(
                getAppointmentDetails(appointment.id, appointment.type)
            )
        }
        const [appServices, appItems, details] = await Promise.all(promises)
        if (appServices)
            setServices(appServices as unknown as AppointmentService[])
        if (appItems) setItems(appItems as unknown as AppointmentItem[])
        if (details)
            setAppointmentDetails(
                details as
                    | TattooAppointment
                    | ShoeAppointment
                    | PiercingAppointment
            )
    }, [appointment.id, appointment.type])

    useEffect(() => {
        if (appointment.id === "") return
        setAppointmentDetails(null)
        getAppointmentData()
    }, [appointment.id, appointment.status, getAppointmentData])

    useEffect(() => {
        setEdit(false)
    }, [appointment.id])

    return (
        <>
            {/* Appointment Info */}
            <div className='flex flex-col md:flex-row gap-2 justify-between'>
                <div className='flex flex-col gap-1'>
                    <span className='text-xs font-semibold text-white/40 select-none'>
                        id: {appointment.id}
                    </span>
                    <div className='flex items-center gap-2'>
                        <span className='text-xl font-medium'>
                            {userInfo.id === appointment.client_id
                                ? (staffInfo?.full_name || "Unassigned")
                                : appointment.is_walkin
                                ? (appointment.client_name || "Walk-in")
                                : (clientInfo?.full_name || "Unknown")}
                        </span>
                        {appointment.is_walkin && (
                            <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-sm border border-green-400/20">
                                Walk-in
                            </span>
                        )}
                    </div>
                </div>
                <div className='flex flex-col gap-1 md:text-right text-sm'>
                    <span
                        className='font-semibold text-white flex flex-row gap-1 items-center md:justify-end'
                        title='Date'
                    >
                        <CalendarFoldIcon size={16} />
                        {new Date(appointment.time_start).toLocaleDateString()}
                    </span>
                    <span
                        className='font-semibold text-white/60 flex flex-row gap-1 items-center md:justify-end'
                        title='Time'
                    >
                        <ClockIcon size={16} />
                        {new Date(appointment.time_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(appointment.time_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
            </div>

            <div className='w-full h-0.5 bg-white/10' />

            {/* Appointment Details Section */}
            <div className='bg-white/5 p-3 rounded-md border border-white/10'>
                <h3 className='text-sm font-semibold text-white/80 mb-3'>
                    Appointment Details
                </h3>
                <div className='flex flex-col gap-2'>
                    <div className='flex justify-between'>
                        <span className='text-white/60'>Title:</span>
                        <span className='font-medium'>{appointment.title}</span>
                    </div>
                    <div className='flex justify-between'>
                        <span className='text-white/60'>Type:</span>
                        <span className='font-medium'>{appointment.type}</span>
                    </div>
                    <div className='flex justify-between'>
                        <span className='text-white/60'>Status:</span>
                        <span className={`font-medium ${appointment.status === 'COMPLETED' ? 'text-green-400' : appointment.status === 'CANCELLED' ? 'text-red-400' : 'text-yellow-400'}`}>
                            {appointment.status}
                        </span>
                    </div>
                    {appointment.notes && (
                        <div className='flex flex-col gap-1'>
                            <span className='text-white/60'>Notes:</span>
                            <span className='text-sm bg-black/40 p-2 rounded-md'>{appointment.notes}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Services Section */}
            {services.length > 0 && (
                <>
                    <div className='w-full h-0.5 bg-white/10' />
                    <div className='bg-white/5 p-3 rounded-md border border-white/10'>
                        <h3 className='text-sm font-semibold text-white/80 mb-3'>
                            Services
                        </h3>
                        <div className='flex flex-col gap-2'>
                            {services.map((service, idx) => (
                                <div key={idx} className='flex justify-between items-center bg-black/40 p-2 rounded-md'>
                                    <span>{service.service?.title || 'Unknown Service'}</span>
                                    <span className='text-white/60'>₱{service.service?.price}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Items Section */}
            {items.length > 0 && (
                <>
                    <div className='w-full h-0.5 bg-white/10' />
                    <div className='bg-white/5 p-3 rounded-md border border-white/10'>
                        <h3 className='text-sm font-semibold text-white/80 mb-3'>
                            Items
                        </h3>
                        <div className='flex flex-col gap-2'>
                            {items.map((item, idx) => (
                                <div key={idx} className='flex justify-between items-center bg-black/40 p-2 rounded-md'>
                                    <span>{item.inventory?.name || 'Unknown Item'}</span>
                                    <span className='text-white/60'>x{item.quantity}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Type-Specific Details */}
            {appointmentDetails && (
                <>
                    <div className='w-full h-0.5 bg-white/10' />
                    <div className='bg-white/5 p-3 rounded-md border border-white/10'>
                        <h3 className='text-sm font-semibold text-white/80 mb-3'>
                            {appointment.type === 'TATTOO' ? 'Tattoo Details' : 
                             appointment.type === 'PIERCING' ? 'Piercing Details' : 
                             appointment.type === 'SHOE' ? 'Shoe Cleaning Details' : 'Details'}
                        </h3>
                        <div className='flex flex-col gap-2'>
                            {appointment.type === 'TATTOO' && appointmentDetails && 'design_concept' in appointmentDetails && (
                                <>
                                    <div className='flex justify-between'>
                                        <span className='text-white/60'>Concept:</span>
                                        <span className='font-medium'>{appointmentDetails.design_concept || 'N/A'}</span>
                                    </div>
                                    <div className='flex justify-between'>
                                        <span className='text-white/60'>Placement:</span>
                                        <span className='font-medium'>{appointmentDetails.body_placement || 'N/A'}</span>
                                    </div>
                                    <div className='flex justify-between'>
                                        <span className='text-white/60'>Color:</span>
                                        <span className='font-medium'>{appointmentDetails.is_color ? 'Yes' : 'No'}</span>
                                    </div>
                                </>
                            )}
                            {appointment.type === 'PIERCING' && appointmentDetails && 'piercing_location' in appointmentDetails && (
                                <>
                                    <div className='flex justify-between'>
                                        <span className='text-white/60'>Location:</span>
                                        <span className='font-medium'>{appointmentDetails.piercing_location || 'N/A'}</span>
                                    </div>
                                    <div className='flex justify-between'>
                                        <span className='text-white/60'>Material:</span>
                                        <span className='font-medium'>{appointmentDetails.jewelry_material || 'N/A'}</span>
                                    </div>
                                    <div className='flex justify-between'>
                                        <span className='text-white/60'>Style:</span>
                                        <span className='font-medium'>{appointmentDetails.jewelry_style}</span>
                                    </div>
                                </>
                            )}
                            {appointment.type === 'SHOE' && appointmentDetails && 'shoe_name' in appointmentDetails && (
                                <>
                                    <div className='flex justify-between'>
                                        <span className='text-white/60'>Shoe:</span>
                                        <span className='font-medium'>{appointmentDetails.shoe_name || 'N/A'}</span>
                                    </div>
                                    <div className='flex justify-between'>
                                        <span className='text-white/60'>Quantity:</span>
                                        <span className='font-medium'>{appointmentDetails.quantity}</span>
                                    </div>
                                    <div className='flex justify-between'>
                                        <span className='text-white/60'>Service:</span>
                                        <span className='font-medium'>{appointmentDetails.cleaning_service}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Actions */}
            <div className='flex flex-row gap-2 mt-4'>
                <button
                    onClick={() => setEdit(false)}
                    className='flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 border-2 border-white/5 rounded-md font-semibold transition-colors'
                >
                    Close
                </button>
                {appointment.status === 'PENDING' && (
                    <button
                        className='flex-1 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border-2 border-green-400/20 rounded-md font-semibold transition-colors flex items-center justify-center gap-2'
                    >
                        <CheckIcon size={16} />
                        Complete
                    </button>
                )}
            </div>
        </>
    )
}