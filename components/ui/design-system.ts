/**
 * App-wide design system tokens for light theme surfaces and text.
 */

export const Surfaces = {
    card: 'bg-card border border-border rounded-lg shadow-sm',
    cardHover: 'bg-card border border-border rounded-lg shadow-sm hover:bg-muted transition-colors',
    muted: 'bg-muted border border-border rounded-lg',
    input: 'bg-background border border-border rounded-md text-foreground',
    overlay: 'fixed inset-0 bg-black/40 backdrop-blur-sm',
} as const

export const Text = {
    heading: 'text-foreground font-bold',
    body: 'text-foreground',
    muted: 'text-muted-foreground',
    label: 'text-sm font-medium text-foreground/80',
} as const
