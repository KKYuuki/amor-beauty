import { ReactNode } from 'react'

interface FilterBarProps {
  children: ReactNode
  className?: string
}

export default function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      className={`flex flex-col items-stretch gap-3 sm:flex-row sm:items-center flex-wrap ${className || ''}`}
    >
      {children}
    </div>
  )
}
