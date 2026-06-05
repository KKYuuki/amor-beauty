"use client"

import dynamic from "next/dynamic"

import { createContext, useCallback, useContext, useState } from "react"
import type { ReactNode } from "react"

// Dynamic imports to save bundle size
const ImageViewer = dynamic(() => import("./imageViewer"), { ssr: false })

export type OverlayType = "IMAGE" | null

export interface OverlayProps {
    image?: string
    overlayContent?: ReactNode
}

export interface OverlayContextType {
    openOverlay: (type: OverlayType, props?: OverlayProps) => void
    closeOverlay: () => void
    overlayType: OverlayType
    // Legacy support
    image: string
    setImageOverlay: (image?: string) => void
}

export const OverlayContext = createContext<OverlayContextType>({
    openOverlay: () => {},
    closeOverlay: () => {},
    overlayType: null,
    image: "",
    setImageOverlay: () => {},
})

export const useOverlay = () => useContext(OverlayContext)

// Deprecated export for backward compatibility during refactor
export const ImageOverlayContext = OverlayContext

export default function OverlayProvider({ children }: { children: ReactNode }) {
    const [type, setType] = useState<OverlayType>(null)
    const [props, setProps] = useState<OverlayProps>({})
    const [image, setImage] = useState("")

    const closeOverlay = useCallback(() => {
        setType(null)
        setProps({})
        setImage("")
    }, [])

    const openOverlay = useCallback(
        (newType: OverlayType, newProps: OverlayProps = {}) => {
            if (newType === "IMAGE" && newProps.image) {
                // If it's an image, we also list it in the legacy 'image' state
                // to reuse the existing ImageViewer logic below
                setImage(newProps.image)
            }
            setType(newType)
            setProps(newProps)
        },
        []
    )

    // Legacy support
    const setImageOverlay = useCallback((img: string | undefined) => {
        if (img) {
            setImage(img)
            setType("IMAGE")
            setProps({ image: img })
        } else {
            setImage("")
            setType(null)
            setProps({})
        }
    }, [])

    // Handler for specific viewer closes
    const handleClose = useCallback(() => {
        closeOverlay()
    }, [closeOverlay])

    return (
        <OverlayContext.Provider
            value={{
                openOverlay,
                closeOverlay,
                overlayType: type,
                image,
                setImageOverlay,
            }}
        >
            {children}

            {/* Render Overlay */}
            {(type || image) && (
                <div
                    className='fixed inset-0 z-[100] pointer-events-none'
                    // pointer-events-none allows clicks to pass through if the overlay itself is transparent
                    // BUT, the viewers usually have their own interactions.
                    // We need to enable pointer events for the children.
                >
                    {/* ImageViewer */}
                    {type === "IMAGE" && image && (
                        <div className='pointer-events-auto w-full h-full'>
                            <ImageViewer
                                image={image}
                                close={handleClose}
                                overlayContent={props.overlayContent}
                            />
                        </div>
                    )}
                </div>
            )}
        </OverlayContext.Provider>
    )
}
