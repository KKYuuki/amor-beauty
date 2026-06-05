/**
 * Design System for Sales Components
 * Ensures consistent styling across all sales-related UI
 */

export const Colors = {
    // Success states (green)
    success: {
        bg: 'bg-green-50 dark:bg-green-950/30',
        text: 'text-green-600 dark:text-green-400',
        border: 'border-green-200 dark:border-green-800',
        solid: 'bg-green-600',
    },
    // Error/Danger states (red)
    danger: {
        bg: 'bg-red-50 dark:bg-red-950/30',
        text: 'text-red-600 dark:text-red-400',
        border: 'border-red-200 dark:border-red-800',
        solid: 'bg-red-600',
    },
    // Primary actions (blue)
    primary: {
        bg: 'bg-blue-50 dark:bg-blue-950/30',
        text: 'text-blue-600 dark:text-blue-400',
        border: 'border-blue-200 dark:border-blue-800',
        solid: 'bg-blue-600',
        hover: 'hover:bg-blue-700',
    },
    // Warning states (amber)
    warning: {
        bg: 'bg-amber-50 dark:bg-amber-950/30',
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-800',
        solid: 'bg-amber-600',
    },
    // Neutral states (zinc)
    neutral: {
        bg: 'bg-zinc-50 dark:bg-zinc-800/50',
        text: 'text-zinc-600 dark:text-zinc-400',
        border: 'border-zinc-200 dark:border-zinc-700',
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

export const Glassmorphism = {
    // Standard glassmorphism card
    card: 'bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl',
    // Subtle glassmorphism
    subtle: 'bg-white/5 border border-white/10',
    // Modal overlay
    overlay: 'bg-black/50 backdrop-blur-sm',
} as const

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
