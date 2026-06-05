"use client"

import { useState, useEffect } from "react"

interface ShoeDetailsEditProps {
    appointmentId: string
    initialData?: {
        shoe_name?: string
        quantity?: number
        cleaning_service?: string
        drop_off_date?: string
        pick_up_date?: string
        add_ons?: string[]
        sole_whitening?: boolean
        reglue_service?: boolean
        total_cost?: number
    }
    onUpdate: (data: {
        shoe_name?: string
        quantity?: number
        cleaning_service?: string
        drop_off_date?: string
        pick_up_date?: string
        add_ons?: string[]
        sole_whitening?: boolean
        reglue_service?: boolean
        total_cost?: number
    }) => void
}

const ADD_ON_OPTIONS = [
    { value: 'rush', label: 'Rush Service' },
    { value: 'replacement', label: 'Replacement Parts' },
    { value: 'water_repellent', label: 'Water Repellent' },
]

export default function ShoeDetailsEdit({ initialData, onUpdate }: ShoeDetailsEditProps) {
    const [shoeName, setShoeName] = useState(initialData?.shoe_name || '')
    const [quantity, setQuantity] = useState(initialData?.quantity || 1)
    const [cleaningService, setCleaningService] = useState(initialData?.cleaning_service || '')
    const [dropOffDate, setDropOffDate] = useState(initialData?.drop_off_date || '')
    const [pickUpDate, setPickUpDate] = useState(initialData?.pick_up_date || '')
    const [addOns, setAddOns] = useState<string[]>(initialData?.add_ons || [])
    const [soleWhitening, setSoleWhitening] = useState(initialData?.sole_whitening || false)
    const [reglueService, setReglueService] = useState(initialData?.reglue_service || false)
    const [totalCost, setTotalCost] = useState(initialData?.total_cost || 0)

    // Calculate total cost based on services
    useEffect(() => {
        let baseCost = quantity * 25 // Base cleaning cost
        if (soleWhitening) baseCost += quantity * 15
        if (reglueService) baseCost += quantity * 20
        if (addOns.includes('rush')) baseCost += 30
        if (addOns.includes('replacement')) baseCost += quantity * 10
        if (addOns.includes('water_repellent')) baseCost += quantity * 8
        setTotalCost(baseCost)
    }, [quantity, soleWhitening, reglueService, addOns])

    const handleShoeNameChange = (value: string) => {
        setShoeName(value)
        onUpdate({
            shoe_name: value,
            quantity: quantity,
            cleaning_service: cleaningService,
            drop_off_date: dropOffDate,
            pick_up_date: pickUpDate,
            add_ons: addOns,
            sole_whitening: soleWhitening,
            reglue_service: reglueService,
            total_cost: totalCost,
        })
    }

    const handleQuantityChange = (value: number) => {
        setQuantity(value)
        onUpdate({
            shoe_name: shoeName,
            quantity: value,
            cleaning_service: cleaningService,
            drop_off_date: dropOffDate,
            pick_up_date: pickUpDate,
            add_ons: addOns,
            sole_whitening: soleWhitening,
            reglue_service: reglueService,
            total_cost: totalCost,
        })
    }

    const handleCleaningServiceChange = (value: string) => {
        setCleaningService(value)
        onUpdate({
            shoe_name: shoeName,
            quantity: quantity,
            cleaning_service: value,
            drop_off_date: dropOffDate,
            pick_up_date: pickUpDate,
            add_ons: addOns,
            sole_whitening: soleWhitening,
            reglue_service: reglueService,
            total_cost: totalCost,
        })
    }

    const handleDropOffDateChange = (value: string) => {
        setDropOffDate(value)
        onUpdate({
            shoe_name: shoeName,
            quantity: quantity,
            cleaning_service: cleaningService,
            drop_off_date: value,
            pick_up_date: pickUpDate,
            add_ons: addOns,
            sole_whitening: soleWhitening,
            reglue_service: reglueService,
            total_cost: totalCost,
        })
    }

    const handlePickUpDateChange = (value: string) => {
        setPickUpDate(value)
        onUpdate({
            shoe_name: shoeName,
            quantity: quantity,
            cleaning_service: cleaningService,
            drop_off_date: dropOffDate,
            pick_up_date: value,
            add_ons: addOns,
            sole_whitening: soleWhitening,
            reglue_service: reglueService,
            total_cost: totalCost,
        })
    }

    const handleAddOnToggle = (value: string) => {
        const newAddOns = addOns.includes(value)
            ? addOns.filter(a => a !== value)
            : [...addOns, value]
        setAddOns(newAddOns)
        onUpdate({
            shoe_name: shoeName,
            quantity: quantity,
            cleaning_service: cleaningService,
            drop_off_date: dropOffDate,
            pick_up_date: pickUpDate,
            add_ons: newAddOns,
            sole_whitening: soleWhitening,
            reglue_service: reglueService,
            total_cost: totalCost,
        })
    }

    const handleSoleWhiteningChange = (value: boolean) => {
        setSoleWhitening(value)
        onUpdate({
            shoe_name: shoeName,
            quantity: quantity,
            cleaning_service: cleaningService,
            drop_off_date: dropOffDate,
            pick_up_date: pickUpDate,
            add_ons: addOns,
            sole_whitening: value,
            reglue_service: reglueService,
            total_cost: totalCost,
        })
    }

    const handleReglueServiceChange = (value: boolean) => {
        setReglueService(value)
        onUpdate({
            shoe_name: shoeName,
            quantity: quantity,
            cleaning_service: cleaningService,
            drop_off_date: dropOffDate,
            pick_up_date: pickUpDate,
            add_ons: addOns,
            sole_whitening: soleWhitening,
            reglue_service: value,
            total_cost: totalCost,
        })
    }

    return (
        <div className='flex flex-col gap-3 p-3 bg-white/5 rounded-lg border border-white/10'>
            <h4 className='text-sm font-semibold text-white/80'>Shoe Cleaning Details</h4>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Shoe Name</span>
                <input
                    type='text'
                    value={shoeName}
                    onChange={(e) => handleShoeNameChange(e.target.value)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white'
                    placeholder='e.g., Nike Air Jordan 1'
                />
            </label>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Quantity</span>
                <input
                    type='number'
                    min={1}
                    value={quantity}
                    onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white'
                />
            </label>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Cleaning Service</span>
                <input
                    type='text'
                    value={cleaningService}
                    onChange={(e) => handleCleaningServiceChange(e.target.value)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white'
                    placeholder='e.g., Deep Clean, Restoration'
                />
            </label>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Drop-off Date</span>
                <input
                    type='date'
                    value={dropOffDate}
                    onChange={(e) => handleDropOffDateChange(e.target.value)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white'
                />
            </label>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Pick-up Date</span>
                <input
                    type='date'
                    value={pickUpDate}
                    onChange={(e) => handlePickUpDateChange(e.target.value)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white'
                />
            </label>
            <div className='flex flex-col gap-2'>
                <span className='text-xs text-white/60'>Add-ons</span>
                <div className='flex flex-col gap-2'>
                    {ADD_ON_OPTIONS.map((option) => (
                        <label key={option.value} className='flex items-center gap-2'>
                            <input
                                type='checkbox'
                                checked={addOns.includes(option.value)}
                                onChange={() => handleAddOnToggle(option.value)}
                                className='w-4 h-4 rounded border border-white/10 bg-black/40'
                            />
                            <span className='text-xs text-white/60'>{option.label}</span>
                        </label>
                    ))}
                </div>
            </div>
            <label className='flex items-center gap-2'>
                <input
                    type='checkbox'
                    checked={soleWhitening}
                    onChange={(e) => handleSoleWhiteningChange(e.target.checked)}
                    className='w-4 h-4 rounded border border-white/10 bg-black/40'
                />
                <span className='text-xs text-white/60'>Sole Whitening</span>
            </label>
            <label className='flex items-center gap-2'>
                <input
                    type='checkbox'
                    checked={reglueService}
                    onChange={(e) => handleReglueServiceChange(e.target.checked)}
                    className='w-4 h-4 rounded border border-white/10 bg-black/40'
                />
                <span className='text-xs text-white/60'>Reglue Service</span>
            </label>
            <div className='flex items-center gap-2 p-2 bg-black/20 rounded-md'>
                <span className='text-xs text-white/60'>Total Cost:</span>
                <span className='text-sm font-semibold text-white'>${totalCost.toFixed(2)}</span>
            </div>
        </div>
    )
}
