"use client"

import { ReactNode } from "react"

interface ActionButtonsProps {
  children: ReactNode
  align?: "start" | "center" | "end"
  gap?: "sm" | "md" | "lg"
  className?: string
}

const alignMap = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
}

const gapMap = {
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
}

export default function ActionButtons({
  children,
  align = "start",
  gap = "md",
  className = "",
}: ActionButtonsProps) {
  return (
    <div
      className={`flex flex-col sm:flex-row flex-wrap ${alignMap[align]} ${gapMap[gap]} ${className}`}
    >
      {children}
    </div>
  )
}
