import React, {
    useRef,
    useState,
    useCallback,
    ChangeEvent,
    DragEvent,
    useContext,
} from "react"
import Cropper from "react-easy-crop"
import { Area } from "react-easy-crop"

import { NotificationContext } from "./notifications"
import { getCroppedImage } from "./canvasUtils"

// --- TYPES ---
interface ImageUploaderProps {
    onFileSelect: (file: File, type?: string) => void
    maxSizeMB?: number // Maximum file size in MB
    accept?: string // Accepted file types
    title?: string
    squareOnly?: boolean
    allowedTypes?: ("image")[]
}

// --- CORE COMPONENT ---
export const ImageUploader: React.FC<ImageUploaderProps> = ({
    onFileSelect,
    maxSizeMB = 1,
    accept = "image/png, image/jpeg, image/jpg",
    title = "JPG or PNG",
    squareOnly = false,
    allowedTypes = ["image"],
}) => {
    // State for drag-and-drop UI
    const [isDragging, setIsDragging] = useState(false)
    const [uploadType, setUploadType] = useState<"image">(allowedTypes[0])
    // State for Cropping Modal
    const [imageSrc, setImageSrc] = useState<string | null>(null) // URL of the image to be cropped
    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(
        null
    )

    // Refs and Context
    const fileInputRef = useRef<HTMLInputElement>(null)
    const { addNotification } = useContext(NotificationContext)

    const maxBytes = maxSizeMB * 1024 * 1024

    // Utility to convert File to Data URL for the cropper
    const readFile = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = (error) => reject(error)
            reader.readAsDataURL(file)
        })
    }

    // --- CENTRAL FILE UPLOAD/VALIDATION ---

    const handleFileUpload = (file: File) => {
        // 1. File Type and Size Validation
        const acceptedTypes = accept
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean) // Filter out empty strings

        if (
            acceptedTypes.length > 0 &&
            !acceptedTypes.includes(file.type) &&
            file.type !== ""
        ) {
            addNotification(
                `Invalid file type. Please use ${title}.`,
                "ERROR",
                "File Type Error"
            )
            return
        }

        if (file.size > maxBytes) {
            addNotification(
                `File size exceeds the maximum limit of ${maxSizeMB}MB.`,
                "ERROR",
                "File Size Error"
            )
            return
        }

        if (squareOnly) {
            // 2. Square Check & Cropping Logic
            const image = new Image()
            image.onload = async () => {
                const width = image.width
                const height = image.height

                // If not square, open the cropper
                if (width !== height) {
                    const dataUrl = await readFile(file)
                    setImageSrc(dataUrl)
                } else {
                    // If it is square, upload immediately
                    onFileSelect(file, uploadType)
                }
            }
            // Start loading the image to check dimensions
            image.src = URL.createObjectURL(file)
        } else {
            // 3. If squareOnly is false, upload immediately
            onFileSelect(file, uploadType)
        }
    }

    // --- CROPPER HANDLERS ---

    const onCropComplete = useCallback(
        (_croppedArea: Area, croppedAreaPixels: Area) => {
            setCroppedAreaPixels(croppedAreaPixels)
        },
        []
    )

    const handleCropDone = async () => {
        if (!imageSrc || !croppedAreaPixels) return

        try {
            // Use the utility to get the cropped image as a Blob
            const croppedBlob = await getCroppedImage(
                imageSrc,
                croppedAreaPixels
            )

            // Convert the Blob back to a File object
            const croppedFile = new File([croppedBlob], "profile_crop.jpg", {
                type: croppedBlob.type,
            })

            onFileSelect(croppedFile, uploadType) // Final upload
            setImageSrc(null) // Close the cropper
            setZoom(1)
            setCrop({ x: 0, y: 0 }) // Reset crop position
        } catch (e) {
            addNotification("Failed to crop image.", "ERROR", "Crop Error")
            console.error("Crop error:", e)
        }
    }

    const handleCropCancel = () => {
        setImageSrc(null) // Close the cropper without saving
        setZoom(1)
        setCrop({ x: 0, y: 0 }) // Reset crop position
    }

    // --- DRAG/DROP & CLICK HANDLERS (Unchanged) ---
    const handleDivClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (file) {
            handleFileUpload(file)
        }
    }

    const handleDragPrevent = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
        handleDragPrevent(e)
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0)
            setIsDragging(true)
    }

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        handleDragPrevent(e)
        setIsDragging(false)
    }

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        handleDragPrevent(e)
        setIsDragging(false)
        const files = e.dataTransfer.files
        if (files && files.length > 0) {
            handleFileUpload(files[0])
        }
    }

    // --- RENDER ---

    const renderDropZone = () => (
        <div
            className={`w-full py-10 h-auto border-2 border-dashed rounded-md flex flex-col items-center justify-center gap-1 font-semibold text-center select-none cursor-pointer transition-colors ${
                isDragging
                    ? "border-blue-500/80 bg-blue-500/10 cursor-grab"
                    : "border-border hover:text-foreground"
            }`}
            onClick={handleDivClick}
            onDragOver={handleDragPrevent}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <input
                aria-label='Upload File'
                id='fileInput'
                type='file'
                ref={fileInputRef}
                onChange={handleFileChange}
                accept={accept}
                className='hidden'
            />
            {allowedTypes.length > 1 && (
                <div className='flex flex-row gap-2 mb-2 bg-card p-1 rounded-md z-10'>
                    {allowedTypes.map((type) => (
                        <button
                            key={type}
                            type='button'
                            onClick={(e) => {
                                e.stopPropagation()
                                setUploadType(type)
                            }}
                            className={`px-3 py-1 rounded-sm text-xs font-bold uppercase transition-colors ${
                                uploadType === type
                                    ? "bg-white text-black"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            )}
            {title}
            <span className='text-sm font-semibold text-muted-foreground'>
                Max Size: {maxSizeMB}MB
            </span>
            Drag or Click to Select
        </div>
    )

    const renderCropperModal = () => (
        <div className='fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4'>
            {" "}
            {/* Increased z-index, slightly less opaque background */}
            <div className='bg-muted p-6 rounded-lg shadow-xl w-full max-w-xl h-[90vh] md:h-[75vh] flex flex-col border border-border'>
                {" "}
                {/* Adjusted background, padding, height, border */}
                <h2 className='text-xl font-bold text-foreground mb-4'>
                    Crop Image to Square
                </h2>
                {/* Cropper container */}
                <div className='relative flex-1 w-full bg-card rounded overflow-hidden mb-4'>
                    {" "}
                    {/* Darker background for cropper, added rounded corners */}
                    <Cropper
                        image={imageSrc!}
                        crop={crop}
                        zoom={zoom}
                        aspect={1 / 1} // Enforce a perfect square
                        onCropChange={setCrop}
                        onCropComplete={onCropComplete}
                        onZoomChange={setZoom}
                        // Tailwind classes for the cropper container/media for better sizing
                        classes={{
                            containerClassName: "w-full h-full", // Ensure cropper uses full container size
                            mediaClassName: "object-contain", // Adjusts image to fit
                        }}
                    />
                </div>
                {/* Controls and Actions */}
                <div className='flex flex-col gap-4'>
                    {" "}
                    {/* Increased gap for better spacing */}
                    <input
                        type='range'
                        value={zoom}
                        min={1}
                        max={3}
                        step={0.01} // Finer control for zoom
                        aria-label='Zoom slider'
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        // Tailwind styling for a custom range input
                        className='w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted dark:bg-gray-700 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:shadow'
                    />
                    <div className='flex justify-end gap-2'>
                        <button
                            onClick={handleCropCancel}
                            className='px-6 py-2 border border-red-500 text-red-500 rounded-md hover:bg-red-500 hover:text-foreground transition-colors duration-200 text-sm font-medium'
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCropDone}
                            className='px-6 py-2 bg-blue-600 text-foreground rounded-md hover:bg-blue-700 transition-colors duration-200 text-sm font-medium'
                        >
                            Crop & Upload
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )

    return (
        <>
            {renderDropZone()}
            {imageSrc && renderCropperModal()}
        </>
    )
}
