"use client"

import { useState } from "react"

interface TattooDetailsEditProps {
    appointmentId: string
    initialData?: {
        design_concept?: string
        body_placement?: string
        size_estimate?: string
        is_color?: boolean
        artist_prep_time?: number
        reference_image_id?: string
    }
    onUpdate: (data: {
        design_concept?: string
        body_placement?: string
        size_estimate?: string
        is_color?: boolean
        artist_prep_time?: number
        reference_image_id?: string
    }) => void
}

export default function TattooDetailsEdit({ initialData, onUpdate }: TattooDetailsEditProps) {
    const [designConcept, setDesignConcept] = useState(initialData?.design_concept || '')
    const [bodyPlacement, setBodyPlacement] = useState(initialData?.body_placement || '')
    const [sizeEstimate, setSizeEstimate] = useState(initialData?.size_estimate || '')
    const [isColor, setIsColor] = useState(initialData?.is_color || false)
    const [artistPrepTime, setArtistPrepTime] = useState(initialData?.artist_prep_time || 0)
    const [referenceImageId, setReferenceImageId] = useState(initialData?.reference_image_id || '')

    const handleDesignConceptChange = (value: string) => {
        setDesignConcept(value)
        onUpdate({
            design_concept: value,
            body_placement: bodyPlacement,
            size_estimate: sizeEstimate,
            is_color: isColor,
            artist_prep_time: artistPrepTime,
            reference_image_id: referenceImageId,
        })
    }

    const handleBodyPlacementChange = (value: string) => {
        setBodyPlacement(value)
        onUpdate({
            design_concept: designConcept,
            body_placement: value,
            size_estimate: sizeEstimate,
            is_color: isColor,
            artist_prep_time: artistPrepTime,
            reference_image_id: referenceImageId,
        })
    }

    const handleSizeEstimateChange = (value: string) => {
        setSizeEstimate(value)
        onUpdate({
            design_concept: designConcept,
            body_placement: bodyPlacement,
            size_estimate: value,
            is_color: isColor,
            artist_prep_time: artistPrepTime,
            reference_image_id: referenceImageId,
        })
    }

    const handleIsColorChange = (value: boolean) => {
        setIsColor(value)
        onUpdate({
            design_concept: designConcept,
            body_placement: bodyPlacement,
            size_estimate: sizeEstimate,
            is_color: value,
            artist_prep_time: artistPrepTime,
            reference_image_id: referenceImageId,
        })
    }

    const handleArtistPrepTimeChange = (value: number) => {
        setArtistPrepTime(value)
        onUpdate({
            design_concept: designConcept,
            body_placement: bodyPlacement,
            size_estimate: sizeEstimate,
            is_color: isColor,
            artist_prep_time: value,
            reference_image_id: referenceImageId,
        })
    }

    const handleReferenceImageIdChange = (value: string) => {
        setReferenceImageId(value)
        onUpdate({
            design_concept: designConcept,
            body_placement: bodyPlacement,
            size_estimate: sizeEstimate,
            is_color: isColor,
            artist_prep_time: artistPrepTime,
            reference_image_id: value,
        })
    }

    return (
        <div className='flex flex-col gap-3 p-3 bg-white/5 rounded-lg border border-white/10'>
            <h4 className='text-sm font-semibold text-white/80'>Tattoo Details</h4>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Design Concept</span>
                <input
                    type='text'
                    value={designConcept}
                    onChange={(e) => handleDesignConceptChange(e.target.value)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white'
                    placeholder='e.g., Rose with vines'
                />
            </label>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Body Placement</span>
                <input
                    type='text'
                    value={bodyPlacement}
                    onChange={(e) => handleBodyPlacementChange(e.target.value)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white'
                    placeholder='e.g., Left forearm'
                />
            </label>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Size Estimate</span>
                <input
                    type='text'
                    value={sizeEstimate}
                    onChange={(e) => handleSizeEstimateChange(e.target.value)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white'
                    placeholder='e.g., 6x4 inches'
                />
            </label>
            <label className='flex items-center gap-2'>
                <input
                    type='checkbox'
                    checked={isColor}
                    onChange={(e) => handleIsColorChange(e.target.checked)}
                    className='w-4 h-4 rounded border border-white/10 bg-black/40'
                />
                <span className='text-xs text-white/60'>Color Tattoo</span>
            </label>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Artist Prep Time (minutes)</span>
                <input
                    type='number'
                    min={0}
                    step={5}
                    value={artistPrepTime}
                    onChange={(e) => handleArtistPrepTimeChange(parseInt(e.target.value) || 0)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white'
                    placeholder='e.g., 30'
                />
            </label>
            <label className='flex flex-col gap-1'>
                <span className='text-xs text-white/60'>Reference Image ID</span>
                <input
                    type='text'
                    value={referenceImageId}
                    onChange={(e) => handleReferenceImageIdChange(e.target.value)}
                    className='bg-black/40 px-3 py-2 rounded-md border border-white/10 text-white'
                    placeholder='Enter image ID or upload reference'
                />
            </label>
        </div>
    )
}
