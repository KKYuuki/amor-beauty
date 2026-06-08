"use client"

import { LoaderCircleIcon } from "lucide-react"
import { ButtonHTMLAttributes, forwardRef } from "react"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "ghost"
  size?: "sm" | "md" | "lg" | "icon"
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "md", loading = false, children, disabled, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
    
    const variants = {
      default: "bg-primary hover:bg-primary-dark border border-primary text-white",
      destructive: "bg-red-600 hover:bg-red-700 border border-red-600 text-white",
      outline: "border border-border bg-card hover:bg-muted text-foreground",
      ghost: "hover:bg-muted text-foreground",
    }
    
    const sizes = {
      sm: "h-8 px-3 text-xs",
      md: "h-10 px-4 py-2 text-sm",
      lg: "h-12 px-6 text-base",
      icon: "h-10 w-10",
    }
    
    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <LoaderCircleIcon className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    )
  }
)

Button.displayName = "Button"

export { Button }
