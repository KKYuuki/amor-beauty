const BRANCH_SESSION_KEY = 'selected_branch_id'

export function getStoredBranchId(): string | null {
    if (typeof window === 'undefined') return null
    try {
        return sessionStorage.getItem(BRANCH_SESSION_KEY)
    } catch {
        return null
    }
}

export function setStoredBranchId(branchId: string | null): void {
    if (typeof window === 'undefined') return
    try {
        if (branchId) {
            sessionStorage.setItem(BRANCH_SESSION_KEY, branchId)
        } else {
            sessionStorage.removeItem(BRANCH_SESSION_KEY)
        }
    } catch {
        // Ignore storage errors
    }
}

export function clearStoredBranchId(): void {
    if (typeof window === 'undefined') return
    try {
        sessionStorage.removeItem(BRANCH_SESSION_KEY)
    } catch {
        // Ignore storage errors
    }
}
