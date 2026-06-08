"use client"

import { ReactNode } from "react"
import { motion } from "motion/react"
import { XIcon, LucideIcon } from "lucide-react"
import { Surfaces } from "@/components/ui/design-system"

interface BaseModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    description?: string
    icon?: LucideIcon
    iconColor?: string
    iconBgColor?: string
    children: ReactNode
    footer?: ReactNode
    size?: "sm" | "md" | "lg" | "xl" | "full"
    maxHeight?: string
    showCloseButton?: boolean
    loading?: boolean
}

const sizeClasses = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-full mx-4",
}

export default function BaseModal({
    isOpen,
    onClose,
    title,
    description,
    icon: Icon,
    iconColor = "text-blue-600",
    iconBgColor = "bg-blue-50",
    children,
    footer,
    size = "md",
    maxHeight,
    showCloseButton = true,
    loading = false,
}: BaseModalProps) {
    if (!isOpen) return null

    return (
        <div
            className={`${Surfaces.overlay} z-50 flex items-center justify-center p-4`}
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`bg-card rounded-xl shadow-2xl w-full ${sizeClasses[size]} overflow-hidden border border-border ${maxHeight ? "flex flex-col" : ""}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`p-6 border-b border-border flex justify-between items-center ${maxHeight ? "flex-shrink-0" : ""}`}>
                    <div className="flex items-center gap-3">
                        {Icon && (
                            <div className={`p-2 ${iconBgColor} rounded-lg`}>
                                <Icon className={`w-5 h-5 ${iconColor}`} />
                            </div>
                        )}
                        <div>
                            <h3 className="text-xl font-bold text-foreground">{title}</h3>
                            {description && (
                                <p className="text-sm text-muted-foreground">{description}</p>
                            )}
                        </div>
                    </div>
                    {showCloseButton && (
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        >
                            <XIcon className="w-5 h-5" />
                        </button>
                    )}
                </div>

                <div className={`p-6 ${maxHeight ? "flex-1 overflow-auto" : ""}`}>
                    {children}
                </div>

                {footer && (
                    <div className={`p-6 border-t border-border ${maxHeight ? "flex-shrink-0" : ""}`}>
                        {footer}
                    </div>
                )}
            </motion.div>
        </div>
    )
}
