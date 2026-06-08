"use client"

import { useState } from "react"
import { AlertTriangleIcon } from "lucide-react"
import { motion } from "motion/react"

interface ConfirmModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void | Promise<void>
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    variant?: "danger" | "warning" | "info"
}

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "warning",
}: ConfirmModalProps) {
    const [isLoading, setIsLoading] = useState(false)

    if (!isOpen) return null

    const handleConfirm = async () => {
        setIsLoading(true)
        await onConfirm()
        setIsLoading(false)
        onClose()
    }

    const variantStyles = {
        danger: {
            icon: "text-red-600 dark:text-red-400",
            button: "bg-red-600 hover:bg-red-700",
        },
        warning: {
            icon: "text-amber-600 dark:text-amber-400",
            button: "bg-amber-600 hover:bg-amber-700",
        },
        info: {
            icon: "text-blue-600 dark:text-blue-400",
            button: "bg-blue-600 hover:bg-blue-700",
        },
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden'
            >
                <div className='p-6 text-center'>
                    <div
                        className={`mx-auto w-12 h-12 rounded-full bg-zinc-100 dark:bg-muted flex items-center justify-center mb-4 ${variantStyles[variant].icon}`}
                    >
                        <AlertTriangleIcon className='w-6 h-6' />
                    </div>

                    <h3 className='text-lg font-bold text-foreground text-foreground mb-2'>
                        {title}
                    </h3>

                    <p className='text-sm text-muted-foreground dark:text-muted-foreground mb-6'>
                        {message}
                    </p>

                    <div className='flex gap-3'>
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className='flex-1 px-4 py-2 rounded-lg border-2 border-zinc-200 dark:border-border text-muted-foreground dark:text-foreground font-medium hover:bg-zinc-50 dark:hover:bg-muted transition-all disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isLoading}
                            className={`flex-1 px-4 py-2 rounded-lg text-foreground font-medium transition-all ${variantStyles[variant].button} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {isLoading ? "Loading..." : confirmText}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
