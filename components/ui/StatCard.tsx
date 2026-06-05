"use client"

import { ReactNode } from "react"
import { TrendingUpIcon, TrendingDownIcon, MinusIcon } from "lucide-react"

interface StatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  trend?: "up" | "down" | "neutral"
  trendValue?: string
  color?: "default" | "success" | "warning" | "danger"
  className?: string
}

const colorMap = {
  default: "",
  success: "text-green-400",
  warning: "text-yellow-400",
  danger: "text-red-400",
}

const trendColorMap = {
  up: "text-green-400",
  down: "text-red-400",
  neutral: "text-white/60",
}

export default function StatCard({
  label,
  value,
  icon,
  trend,
  trendValue,
  color = "default",
  className = "",
}: StatCardProps) {
  const renderTrendIcon = () => {
    if (!trend) return null
    switch (trend) {
      case "up":
        return <TrendingUpIcon className='w-3 h-3 sm:w-4 sm:h-4' />
      case "down":
        return <TrendingDownIcon className='w-3 h-3 sm:w-4 sm:h-4' />
      case "neutral":
        return <MinusIcon className='w-3 h-3 sm:w-4 sm:h-4' />
    }
  }

  return (
    <div
      className={`bg-white/5 border border-white/10 rounded-lg p-4 ${className}`}
    >
      <div className='flex items-start justify-between gap-4'>
        <div className='flex-1 min-w-0'>
          <p className='text-xs sm:text-sm text-white/60'>{label}</p>
          <p
            className={`text-lg sm:text-2xl font-bold mt-1 ${colorMap[color] || ""} whitespace-nowrap overflow-hidden text-ellipsis min-w-0`}
          >
            {value}
          </p>
          {trend && trendValue && (
            <div
              className={`flex items-center gap-1 mt-2 text-xs sm:text-sm ${trendColorMap[trend]}`}
            >
              {renderTrendIcon()}
              <span>{trendValue}</span>
            </div>
          )}
        </div>
        {icon && (
          <div className='shrink-0 text-white/40'>{icon}</div>
        )}
      </div>
    </div>
  )
}

export type { StatCardProps }
