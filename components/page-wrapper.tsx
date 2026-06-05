"use client"

import { ReactNode } from "react"

interface PageWrapperProps {
    children: ReactNode
    className?: string
}

export default function PageWrapper({ children, className = "" }: PageWrapperProps) {
    return (
        <div className={`w-full h-full flex flex-col gap-4 p-4 sm:p-6 ${className}`}>
            {children}
        </div>
    )
}
