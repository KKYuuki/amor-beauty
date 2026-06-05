export const MANILA_TIMEZONE = 'Asia/Manila'

/**
 * Convert any date to Manila timezone
 */
export function toManilaTime(date: Date | string | null | undefined): Date {
    if (!date) return new Date()
    
    const dateObj = new Date(date)
    const manilaString = dateObj.toLocaleString('en-US', { 
        timeZone: MANILA_TIMEZONE 
    })
    return new Date(manilaString)
}

/**
 * Format date for display in Manila timezone
 */
export function formatManilaTime(
    date: Date | string | null | undefined,
    format: 'time' | 'date' | 'datetime' | 'short' = 'time'
): string {
    if (!date) return ''
    
    const manilaDate = toManilaTime(date)
    
    const options: Intl.DateTimeFormatOptions = { 
        timeZone: MANILA_TIMEZONE,
    }
    
    switch(format) {
        case 'time':
            return manilaDate.toLocaleTimeString('en-US', {
                ...options,
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            })
        case 'date':
            return manilaDate.toLocaleDateString('en-PH', {
                ...options,
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            })
        case 'datetime':
            return manilaDate.toLocaleString('en-PH', {
                ...options,
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            })
        case 'short':
            return manilaDate.toLocaleDateString('en-PH', {
                ...options,
                month: 'short',
                day: 'numeric',
            })
        default:
            return manilaDate.toISOString()
    }
}

/**
 * Get current date in Manila timezone
 */
export function getManilaNow(): Date {
    return toManilaTime(new Date())
}

/**
 * Format for database storage (ISO string)
 */
export function toISOManila(date: Date | string): string {
    return toManilaTime(date).toISOString()
}
