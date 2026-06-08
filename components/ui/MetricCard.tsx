"use client"

import React from "react"
import { Surfaces } from "@/components/ui/design-system"

interface MetricCardProps {
    title: string
    value?: number
    format?: "currency" | "number" | "percent"
    icon?: React.ReactNode
    currencySymbol?: string
    trend?: "up" | "down"
    trendValue?: string
}

export default function MetricCard({
    title,
    value,
    format = "number",
    icon,
    currencySymbol = "₱",
    trend,
    trendValue,
}: MetricCardProps) {
    const formattedValue = value === undefined
        ? "-"
        : format === "currency"
            ? `${currencySymbol}${value.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })}`
            : format === "percent"
                ? `${value.toFixed(1)}%`
                : value.toLocaleString()

    const getTrendColor = () => {
        if (value === undefined) return "text-muted-foreground/70"
        if (format === "percent") return value >= 0 ? "text-green-600" : "text-red-600"
        if (value < 0) return "text-red-600"
        return "text-foreground"
    }

    return (
        <div className={`${Surfaces.cardHover} rounded-xl p-4 flex flex-col gap-2 select-none`}>
            <div className='flex justify-between items-start'>
                <span className='text-muted-foreground font-medium text-sm'>
                    {title}
                </span>
                {icon}
            </div>
            <span
                className={`font-bold text-2xl md:text-3xl ${getTrendColor()}`}
                title={value?.toString()}
            >
                {formattedValue}
            </span>
            {trend && trendValue && (
                <div className={`flex items-center gap-1 text-xs ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                    <span>{trend === 'up' ? '↑' : '↓'}</span>
                    <span>{trendValue}</span>
                </div>
            )}
        </div>
    )
}

export type { MetricCardProps }
