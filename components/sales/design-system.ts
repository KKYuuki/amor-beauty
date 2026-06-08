/**
 * Design System for Sales Components
 * Ensures consistent styling across all sales-related UI
 */

import { Surfaces as AppSurfaces } from '@/components/ui/design-system'

export const Colors = {
    success: {
        bg: 'bg-green-50',
        text: 'text-green-600',
        border: 'border-green-200',
        solid: 'bg-green-600',
    },
    danger: {
        bg: 'bg-red-50',
        text: 'text-red-600',
        border: 'border-red-200',
        solid: 'bg-red-600',
    },
    primary: {
        bg: 'bg-blue-50',
        text: 'text-blue-600',
        border: 'border-blue-200',
        solid: 'bg-blue-600',
        hover: 'hover:bg-blue-700',
    },
    warning: {
        bg: 'bg-amber-50',
        text: 'text-amber-600',
        border: 'border-amber-200',
        solid: 'bg-amber-600',
    },
    neutral: {
        bg: 'bg-muted',
        text: 'text-muted-foreground',
        border: 'border-border',
        solid: 'bg-zinc-600',
    },
} as const

export const Spacing = {
    modal: {
        wrapper: 'p-6',
        section: 'space-y-6',
        inner: 'space-y-4',
    },
    button: {
        sm: 'px-3 py-2',
        md: 'px-4 py-3',
        lg: 'px-6 py-4',
    },
    card: {
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
    },
} as const

export const Radius = {
    sm: 'rounded-lg',      // Buttons, inputs, small elements
    md: 'rounded-xl',      // Cards, containers
    lg: 'rounded-2xl',     // Modals
    full: 'rounded-full',  // Pills, avatars
} as const

/** @deprecated Use Surfaces instead */
export const Glassmorphism = {
    card: `${AppSurfaces.card} rounded-xl`,
    subtle: 'bg-card border border-border',
    overlay: AppSurfaces.overlay,
} as const

export { AppSurfaces as Surfaces }

export const Shadows = {
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
    glow: 'shadow-lg hover:shadow-blue-500/30',
} as const

export const Transitions = {
    default: 'transition-all duration-200',
    fast: 'transition-all duration-150',
    slow: 'transition-all duration-300',
    transform: 'transition-transform duration-200',
    colors: 'transition-colors duration-200',
} as const
