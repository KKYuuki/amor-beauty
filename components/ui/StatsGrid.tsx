"use client"

import { ReactNode } from "react"

interface StatsGridProps {
  children: ReactNode
  columns?: {
    mobile?: 1 | 2
    tablet?: 2 | 3 | 4
    desktop?: 3 | 4 | 5 | 6
  }
  className?: string
}

export const gridColsMap = {
  mobile: {
    1: "grid-cols-1",
    2: "grid-cols-2",
  },
  tablet: {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-4",
  },
  desktop: {
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
    6: "lg:grid-cols-6",
  },
}

export default function StatsGrid({
  children,
  columns = {},
  className = "",
}: StatsGridProps) {
  const mobileCols = columns.mobile ?? 1
  const tabletCols = columns.tablet ?? 2
  const desktopCols = columns.desktop ?? 4

  const gridClasses = `
    ${gridColsMap.mobile[mobileCols]}
    ${gridColsMap.tablet[tabletCols]}
    ${gridColsMap.desktop[desktopCols]}
    grid
    gap-3
    sm:gap-4
  `

  return <div className={`${gridClasses} ${className}`}>{children}</div>
}

export type { StatsGridProps }
