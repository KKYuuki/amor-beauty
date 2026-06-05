"use client"

import { useState } from "react"

interface PiercingDetailsEditProps {
    appointmentId: string
    initialData?: {
        piercing_location?: string
        jewelry_material?: string
        jewelry_style?: string
        previous_piercing_issues?: string
        aftercare_instructions?: string
    }
    onUpdate: (data: {
        piercing_location?: string
        jewelry_material?: string
        jewelry_style?: string
        previous_piercing_issues?: string
        aftercare_instructions?: string
    }) => void
}

export default function PiercingDetailsEdit({ initialData, onUpdate }: PiercingDetailsEditProps) {
    const [piercingLocation, setPiercingLocation] = useState(initialData?.piercing_location || '')
    const [jewelryMaterial, setJewelryMaterial] = useState(initialData?.jewelry_material || '')
    const [jewelryStyle, setJewelryStyle] = useState(initialData?.jewelry_style || '')
    const [previousPiercingIssues, setPreviousPiercingIssues] = useState(initialData?.previous_piercing_issues || '')
    const [aftercareInstructions, setAftercareInstructions] = useState(initialData?.aftercare_instructions || '')

    const handlePiercingLocationChange = (value: string) => {
        setPiercingLocation(value)
        onUpdate({
            piercing_location: value,
            jewelry_material: jewelryMaterial,
            jewelry_style: jewelryStyle,
            previous_piercing_issues: previousPiercingIssues,
            aftercare_instructions: aftercareInstructions,
        })
    }

    const handleJewelryMaterialChange = (value: string) => {
        setJewelryMaterial(value)
        onUpdate({
            piercing_location: piercingLocation,
            jewelry_material: value,
            jewelry_style: jewelryStyle,
            previous_piercing_issues: previousPiercingIssues,
            aftercare_instructions: aftercareInstructions,
        })
    }

    const handleJewelryStyleChange = (value: string) => {
        setJewelryStyle(value)
        onUpdate({
            piercing_location: piercingLocation,
            jewelry_material: jewelryMaterial,
            jewelry_style: value,
            previous_piercing_issues: previousPiercingIssues,
            aftercare_instructions: aftercareInstructions,
        })
    }

    const handlePreviousPiercingIssuesChange = (value: string) => {
        setPreviousPiercingIssues(value)
        onUpdate({
            piercing_location: piercingLocation,
            jewelry_material: jewelryMaterial,
            jewelry_style: jewelryStyle,
            previous_piercing_issues: value,
            aftercare_instructions: aftercareInstructions,
        })
    }

    const handleAftercareInstructionsChange = (value: string) => {
        setAftercareInstructions(value)
        onUpdate({
            piercing_location: piercingLocation,
            jewelry_material: jewelryMaterial,
            jewelry_style: jewelryStyle,
            previous_piercing_issues: previousPiercingIssues,
            aftercare_instructions: value,
        })
    }

    return (
        <div className='flex flex-col gap-3 p-3 bg-white/5 rounded-lg border border-white/10'>
            <h4 className='text-sm font-semibold text-white/80'>Piercing Details</h4>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Piercing Location</span>
                <input
                    type='text'
                    value={piercingLocation}
                    onChange={(e) => handlePiercingLocationChange(e.target.value)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white'
                    placeholder='e.g., Ear lobe, Nostril'
                />
            </label>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Jewelry Material</span>
                <input
                    type='text'
                    value={jewelryMaterial}
                    onChange={(e) => handleJewelryMaterialChange(e.target.value)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white'
                    placeholder='e.g., Titanium, Surgical Steel'
                />
            </label>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Jewelry Style</span>
                <input
                    type='text'
                    value={jewelryStyle}
                    onChange={(e) => handleJewelryStyleChange(e.target.value)}
                className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white'
                    placeholder='e.g., Stud, Hoop, Barbell'
                />
            </label>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Previous Piercing Issues</span>
                <textarea
                    value={previousPiercingIssues}
                    onChange={(e) => handlePreviousPiercingIssuesChange(e.target.value)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white min-h-[80px] resize-y'
                    placeholder='e.g., Infections, migration, rejection...'
                />
            </label>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Aftercare Instructions</span>
                <textarea
                    value={aftercareInstructions}
                    onChange={(e) => handleAftercareInstructionsChange(e.target.value)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white min-h-[100px] resize-y'
                    placeholder='e.g., Clean twice daily with saline solution...'
                />
            </label>
        </div>
    )
}
