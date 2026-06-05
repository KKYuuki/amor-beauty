export interface DeviceInfo {
    platform: string
    suggestedName: string
    icon: 'laptop' | 'smartphone' | 'tablet' | 'key'
}

export function detectDevice(): DeviceInfo {
    if (typeof window === 'undefined') {
        return { platform: 'Unknown', suggestedName: 'My Device', icon: 'key' }
    }

    const ua = navigator.userAgent

    // iOS detection
    if (/iPhone/.test(ua)) {
        return { platform: 'iOS', suggestedName: 'iPhone', icon: 'smartphone' }
    }
    if (/iPad/.test(ua)) {
        return { platform: 'iPadOS', suggestedName: 'iPad', icon: 'tablet' }
    }

    // Android detection
    if (/Android/.test(ua)) {
        if (/Mobile/.test(ua)) {
            return { platform: 'Android', suggestedName: 'Android Phone', icon: 'smartphone' }
        }
        return { platform: 'Android', suggestedName: 'Android Tablet', icon: 'tablet' }
    }

    // macOS detection
    if (/Mac/.test(ua)) {
        return { platform: 'macOS', suggestedName: 'MacBook', icon: 'laptop' }
    }

    // Windows detection
    if (/Windows/.test(ua)) {
        return { platform: 'Windows', suggestedName: 'Windows PC', icon: 'laptop' }
    }

    // ChromeOS detection
    if (/CrOS/.test(ua)) {
        return { platform: 'ChromeOS', suggestedName: 'Chromebook', icon: 'laptop' }
    }

    // Linux detection
    if (/Linux/.test(ua)) {
        return { platform: 'Linux', suggestedName: 'Linux PC', icon: 'laptop' }
    }

    return { platform: 'Desktop', suggestedName: 'My Device', icon: 'laptop' }
}
