import DOMPurify from 'isomorphic-dompurify'

/**
 * Sanitization utility for user inputs
 * 
 * sanitizeText() - Aggressive HTML stripping for user-facing text (names, descriptions, notes, comments, addresses)
 * sanitizeMinimal() - Just trim whitespace for phone numbers, simple strings
 * sanitizeFileName() - Path-safe cleaning for uploaded file names
 */

/**
 * Aggressive HTML stripping for user-facing text
 * Use for: names, descriptions, notes, comments, addresses
 */
export function sanitizeText(input: string | null | undefined): string {
    if (!input) return ''
    
    // First, strip all HTML tags
    const withoutHtml = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] })
    
    // Decode HTML entities
    const decoded = withoutHtml
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
    
    // Trim whitespace and normalize
    return decoded.trim()
}

/**
 * Minimal sanitization - just trim whitespace
 * Use for: phone numbers, simple strings
 */
export function sanitizeMinimal(input: string | null | undefined): string {
    if (!input) return ''
    return input.trim()
}

/**
 * Path-safe cleaning for uploaded file names
 * Removes path traversal characters and ensures safe filename
 */
export function sanitizeFileName(input: string | null | undefined): string {
    if (!input) return ''
    
    // Remove path traversal characters and control characters
    let sanitized = input
        .replace(/[\\/:*?"<>|]/g, '') // Remove Windows forbidden chars
        .replace(/\x00-\x1f/g, '') // Remove control characters
        .replace(/^(\.\.)?\//g, '') // Remove leading ./ or ../
        .replace(/\.{2,}/g, '.') // Replace multiple dots with single
    
    // Ensure the filename isn't empty
    if (!sanitized.trim()) {
        sanitized = 'file'
    }
    
    return sanitized.trim()
}
