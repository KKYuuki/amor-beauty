"use client"

import React from "react"

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
        if (value === undefined) return "text-white/40"
        if (format === "percent") return value >= 0 ? "text-green-400" : "text-red-400"
        if (value < 0) return "text-red-400"
        return "text-white"
    }

    return (
        <div className='bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-2 select-none hover:bg-white/10 transition-colors'>
            <div className='flex justify-between items-start'>
                <span className='text-white/60 font-medium text-sm'>
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
                <div className={`flex items-center gap-1 text-xs ${trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                    <span>{trend === 'up' ? '↑' : '↓'}</span>
                    <span>{trendValue}</span>
                </div>
            )}
        </div>
    )
}

export type { MetricCardProps }
