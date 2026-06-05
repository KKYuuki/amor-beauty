"use client"

import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch"
import { motion } from "motion/react"
import Image from "next/image"
import { PlusIcon, MinusIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { ViewerButton, ViewerToolbar } from "./ui/viewer-controls"
import { useEffect } from "react"
import type { ReactNode } from "react"

interface ImageViewerProps {
    image: string
    close: () => void
    overlayContent?: ReactNode
}

export default function ImageViewer({
    image,
    close,
    overlayContent,
}: ImageViewerProps) {
    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") close()
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [close])

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center overflow-hidden'
        >
            {/* Main Canvas Area */}
            <div className='relative w-full h-full flex items-center justify-center flex-1 min-h-0 p-4 md:p-8'>
                <TransformWrapper
                    initialScale={1}
                    minScale={0.5}
                    maxScale={4}
                    centerOnInit={true}
                    wheel={{ step: 0.1 }}
                >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                            {/* Controls Overlay */}
                            <div className='absolute top-4 right-4 z-50 flex flex-col gap-2'>
                                <ViewerButton
                                    onClick={close}
                                    iconOnly
                                    title='Close'
                                >
                                    <XIcon size={20} />
                                </ViewerButton>
                            </div>

                            <div className='absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-4 w-full max-w-md px-4 pointer-events-none'>
                                {/* Zoom Controls */}
                                <ViewerToolbar>
                                    <ViewerButton
                                        onClick={() => zoomOut()}
                                        iconOnly
                                        title='Zoom Out'
                                    >
                                        <MinusIcon size={18} />
                                    </ViewerButton>
                                    <ViewerButton
                                        onClick={() => resetTransform()}
                                        title='Reset'
                                    >
                                        <RotateCcwIcon
                                            size={18}
                                            className='mr-1'
                                        />
                                        <span className='hidden md:inline'>
                                            Reset
                                        </span>
                                    </ViewerButton>
                                    <ViewerButton
                                        onClick={() => zoomIn()}
                                        iconOnly
                                        title='Zoom In'
                                    >
                                        <PlusIcon size={18} />
                                    </ViewerButton>
                                </ViewerToolbar>

                                {/* Generic Overlay Content (e.g., Save User Image buttons) */}
                                {overlayContent && (
                                    <div className='pointer-events-auto'>
                                        {overlayContent}
                                    </div>
                                )}
                            </div>

                            <TransformComponent
                                wrapperClass='!w-full !h-full'
                                contentClass='!w-full !h-full flex items-center justify-center'
                            >
                                <div className='relative w-full h-full max-w-[90vw] max-h-[85vh] flex items-center justify-center'>
                                    <Image
                                        src={image}
                                        alt='Full screen view'
                                        width={1920}
                                        height={1080}
                                        className='w-auto h-auto max-w-full max-h-full object-contain drop-shadow-2xl'
                                        unoptimized // Often needed for various external URLs or blob object URLs
                                        priority
                                    />
                                </div>
                            </TransformComponent>
                        </>
                    )}
                </TransformWrapper>
            </div>
        </motion.div>
    )
}
