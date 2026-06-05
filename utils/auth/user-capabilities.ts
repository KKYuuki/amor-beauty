/**
 * Returns true if the user has artist capability — either via the "artist" role
 * or via a hybrid admin with "artist" capability flag.
 */
export function isArtistCapable(user: { role?: string | null; access_flags?: string[] | null }): boolean {
    return user.role === "artist" || (user.role === "admin" && (user.access_flags?.includes("artist") ?? false))
}

/**
 * Returns true if the user has any work capability that requires rate_level_id
 * (artist, piercing as hybrid, or shoe as hybrid).
 */
export function hasWorkCapability(user: { role?: string | null; access_flags?: string[] | null }): boolean {
    if (user.role === "artist" || user.role === "piercer" || user.role === "shoe_tech" || user.role === "staff") {
        return true
    }
    if (user.role === "admin" && user.access_flags) {
        return user.access_flags.some(f => ["artist", "piercing", "shoe"].includes(f))
    }
    return false
}

/**
 * Returns true if the user should have a rate_level_id set.
 */
export function shouldHaveRateLevel(user: { role?: string | null; access_flags?: string[] | null }): boolean {
    return user.role === "artist" || user.role === "staff" || (user.role === "admin" && (user.access_flags?.includes("artist") ?? false))
}
