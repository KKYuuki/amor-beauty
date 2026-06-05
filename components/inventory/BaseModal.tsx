"use client"

import { ReactNode } from "react"
import { motion } from "motion/react"
import { XIcon, LucideIcon } from "lucide-react"

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
    iconColor = "text-blue-400",
    iconBgColor = "bg-blue-500/10",
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`bg-zinc-900 rounded-xl shadow-2xl w-full ${sizeClasses[size]} overflow-hidden border border-white/10 ${maxHeight ? "flex flex-col" : ""}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`p-6 border-b border-white/10 flex justify-between items-center ${maxHeight ? "flex-shrink-0" : ""}`}>
                    <div className="flex items-center gap-3">
                        {Icon && (
                            <div className={`p-2 ${iconBgColor} rounded-lg`}>
                                <Icon className={`w-5 h-5 ${iconColor}`} />
                            </div>
                        )}
                        <div>
                            <h3 className="text-xl font-bold">{title}</h3>
                            {description && (
                                <p className="text-sm text-white/60">{description}</p>
                            )}
                        </div>
                    </div>
                    {showCloseButton && (
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="text-white/60 hover:text-white transition-colors disabled:opacity-50"
                        >
                            <XIcon className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className={`p-6 ${maxHeight ? "flex-1 overflow-auto" : ""}`}>
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className={`p-6 border-t border-white/10 ${maxHeight ? "flex-shrink-0" : ""}`}>
                        {footer}
                    </div>
                )}
            </motion.div>
        </div>
    )
}
