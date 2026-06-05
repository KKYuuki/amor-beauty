import { ChevronDownIcon } from "lucide-react"
import { forwardRef } from "react"
import type {
    ButtonHTMLAttributes,
    InputHTMLAttributes,
    SelectHTMLAttributes,
} from "react"

// --- Glassy Container Base ---
const glassBase =
    "bg-black/60 backdrop-blur-md border border-white/10 shadow-xl"

// --- Button ---
export interface ViewerButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement> {
    isActive?: boolean
    iconOnly?: boolean
}

export const ViewerButton = forwardRef<HTMLButtonElement, ViewerButtonProps>(
    ({ className = "", isActive, iconOnly, children, ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={`
                    ${glassBase}
                    rounded-full
                    flex items-center justify-center gap-2
                    transition-all duration-200
                    hover:bg-white/10 hover:border-white/20 active:scale-95
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
                    text-white/90 font-medium text-sm
                    ${isActive ? "bg-white/20 border-white/30 text-white" : ""}
                    ${iconOnly ? "p-2 aspect-square" : "px-4 py-2"}
                    ${className}
                `}
                {...props}
            >
                {children}
            </button>
        )
    }
)
ViewerButton.displayName = "ViewerButton"

// --- Select ---
export interface ViewerSelectProps
    extends SelectHTMLAttributes<HTMLSelectElement> {
    containerClassName?: string
}

export const ViewerSelect = forwardRef<HTMLSelectElement, ViewerSelectProps>(
    ({ className = "", containerClassName = "", children, ...props }, ref) => {
        return (
            <div className={`relative group ${containerClassName}`}>
                <select
                    ref={ref}
                    className={`
                        ${glassBase}
                        appearance-none
                        rounded-full
                        pl-4 pr-10 py-2
                        text-white/90 text-sm font-medium
                        hover:bg-white/10 hover:border-white/20
                        focus:outline-none focus:ring-2 focus:ring-white/20
                        cursor-pointer
                        w-full
                        transition-all duration-200
                        ${className}
                    `}
                    {...props}
                >
                    {children}
                </select>
                <div className='absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/50 group-hover:text-white/80 transition-colors'>
                    <ChevronDownIcon size={16} />
                </div>
            </div>
        )
    }
)
ViewerSelect.displayName = "ViewerSelect"

// --- Slider ---
export interface ViewerSliderProps
    extends InputHTMLAttributes<HTMLInputElement> {
    label?: string
    valueDisplay?: string | number
}

export const ViewerSlider = forwardRef<HTMLInputElement, ViewerSliderProps>(
    ({ className = "", label, valueDisplay, ...props }, ref) => {
        return (
            <div
                className={`flex items-center gap-3 ${glassBase} rounded-full px-4 py-2 ${className}`}
            >
                {label && (
                    <span className='text-white/70 text-xs font-semibold uppercase tracking-wider'>
                        {label}
                    </span>
                )}
                <input
                    ref={ref}
                    type='range'
                    className='
                        w-24 md:w-32 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer
                        accent-white
                        hover:accent-blue-400
                        focus:outline-none focus:ring-0
                    '
                    {...props}
                />
                {valueDisplay !== undefined && (
                    <span className='text-white/90 text-xs font-mono min-w-[3ch] text-right'>
                        {valueDisplay}
                    </span>
                )}
            </div>
        )
    }
)
ViewerSlider.displayName = "ViewerSlider"

// --- Toolbar Container ---
export const ViewerToolbar = ({
    children,
    className = "",
}: {
    children: React.ReactNode
    className?: string
}) => {
    return (
        <div
            className={`flex items-center gap-2 pointer-events-auto ${className}`}
        >
            {children}
        </div>
    )
}
