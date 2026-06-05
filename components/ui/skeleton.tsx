"use client"

import { CSSProperties } from "react"

interface SkeletonProps {
    className?: string
    style?: CSSProperties
}

export function Skeleton({ className = "", style }: SkeletonProps) {
    return (
        <div
            className={`animate-pulse bg-white/10 rounded-md ${className}`}
            style={style}
            aria-hidden="true"
        />
    )
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
                />
            ))}
        </div>
    )
}
