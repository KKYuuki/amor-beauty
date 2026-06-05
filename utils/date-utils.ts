export type DateRangePreset =
    | 'today'
    | 'this_week'
    | 'this_month'
    | 'this_year'
    | 'last_year'
    | 'custom'
    | 'all';

export interface DateRange {
    start: Date;
    end: Date;
    label: string;
}

export function getStartOfDay(date: Date = new Date()): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function getEndOfDay(date: Date = new Date()): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

export function getStartOfWeek(date: Date = new Date()): Date {
    const d = new Date(date);
    const day = d.getDay(); // 0 is Sunday
    const diff = d.getDate() - day; // Adjust to Sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function getEndOfWeek(date: Date = new Date()): Date {
    const d = getStartOfWeek(date);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
}

export function getStartOfMonth(date: Date = new Date()): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function getEndOfMonth(date: Date = new Date()): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function getStartOfYear(date: Date = new Date()): Date {
    return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
}

export function getEndOfYear(date: Date = new Date()): Date {
    return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

export function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateRange(start: Date, end: Date): string {
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr} - ${endStr}`;
}

export function getDateRangeFromPreset(preset: DateRangePreset, customStart?: string, customEnd?: string): DateRange | null {
    const now = new Date();

    switch (preset) {
        case 'today':
            const todayStart = getStartOfDay(now);
            const todayEnd = getEndOfDay(now);
            return { start: todayStart, end: todayEnd, label: formatDate(todayStart) };

        case 'this_week':
            const weekStart = getStartOfWeek(now);
            const weekEnd = getEndOfWeek(now);
            return { start: weekStart, end: weekEnd, label: formatDateRange(weekStart, weekEnd) };

        case 'this_month':
            const monthStart = getStartOfMonth(now);
            const monthEnd = getEndOfMonth(now);
            return { start: monthStart, end: monthEnd, label: formatDateRange(monthStart, monthEnd) };

        case 'this_year':
            const yearStart = getStartOfYear(now);
            const yearEnd = getEndOfYear(now);
            return { start: yearStart, end: yearEnd, label: formatDateRange(yearStart, yearEnd) };

        case 'last_year':
            const lastYear = new Date(now.getFullYear() - 1, 0, 1);
            const lastYearStart = getStartOfYear(lastYear);
            const lastYearEnd = getEndOfYear(lastYear);
            return { start: lastYearStart, end: lastYearEnd, label: formatDateRange(lastYearStart, lastYearEnd) };

        case 'custom':
            if (customStart && customEnd) {
                const start = getStartOfDay(new Date(customStart));
                const end = getEndOfDay(new Date(customEnd));
                return { start, end, label: formatDateRange(start, end) };
            }
            return null;

        case 'all':
            const allStart = new Date('2000-01-01');
            const allEnd = new Date();
            return { start: allStart, end: allEnd, label: 'All time' };

        default:
            return null;
    }
}

/**
 * Check if a value is a valid Date object (not Invalid Date).
 * Returns false for null, undefined, non-Date objects, and Invalid Date.
 *
 * @param value - The value to check
 * @returns True if the value is a valid Date, false otherwise
 */
export function isValidDate(value: unknown): value is Date {
    return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Safely convert a value to a Date object.
 * Returns the provided fallback (default: current date) if the input is invalid.
 *
 * Handles: Date objects, ISO strings, date-only strings ("2026-04-15"),
 * timestamps (numbers), null, undefined, and empty strings.
 *
 * @param value - The value to convert
 * @param fallback - Fallback Date to return if input is invalid, or null to allow null returns
 * @returns A Date object, or null if fallback was null and input was invalid
 */
export function safeToDate(value: unknown): Date;
export function safeToDate(value: unknown, fallback: Date): Date;
export function safeToDate(value: unknown, fallback: null): Date | null;
export function safeToDate(value: unknown, fallback: Date | null = new Date()): Date | null {
    if (value instanceof Date) {
        return isNaN(value.getTime()) ? fallback : value;
    }
    if (typeof value === 'number') {
        const d = new Date(value);
        return isNaN(d.getTime()) ? fallback : d;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const d = new Date(value);
        return isNaN(d.getTime()) ? fallback : d;
    }
    return fallback;
}

/**
 * Safely format a date value to a locale string.
 * Returns the fallback string if the input is invalid.
 *
 * @param value - Any date-like value (Date, string, number, null, undefined)
 * @param options - Intl.DateTimeFormatOptions (optional)
 * @param fallback - String to return if date is invalid (default: "—")
 * @returns A formatted date string or the fallback value
 */
export function safeFormatDate(
    value: unknown,
    options?: Intl.DateTimeFormatOptions,
    fallback: string = "—"
): string {
    const date = safeToDate(value, null);
    if (!date) return fallback;
    try {
        return date.toLocaleDateString('en-US', options);
    } catch {
        return fallback;
    }
}

/**
 * Safely convert a date value to an ISO date string (YYYY-MM-DD).
 * Returns the fallback string if the input is invalid.
 *
 * @param value - Any date-like value (Date, string, number, null, undefined)
 * @param fallback - String to return if date is invalid (default: "")
 * @returns An ISO date string or the fallback value
 */
export function safeToISOString(
    value: unknown,
    fallback: string = ""
): string {
    const date = safeToDate(value, null);
    if (!date) return fallback;
    try {
        return date.toISOString().split("T")[0];
    } catch {
        return fallback;
    }
}
