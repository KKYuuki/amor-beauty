import { createAuthClient } from 'better-auth/react';
import { passkeyClient } from '@better-auth/passkey/client';

// Dynamically determine the base URL with protocol detection
// This ensures HTTPS is used when running on HTTPS (required for passkeys)
const getBaseURL = () => {
    if (process.env.NEXT_PUBLIC_BETTER_AUTH_URL) {
        return process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    }

    // Client-side: detect current protocol
    if (typeof window !== 'undefined') {
        const protocol = window.location.protocol;
        const host = window.location.host;
        return `${protocol}//${host}`;
    }

    // Server-side fallback
    return 'http://localhost:3000';
};

export const authClient = createAuthClient({
    baseURL: getBaseURL(),
    plugins: [
        passkeyClient(),
    ],
    sessionOptions: {
        // Poll every 60 seconds to pick up access flag / role changes made by admins
        refetchInterval: 60,
        refetchOnWindowFocus: true,
    },
});

// Helper to check if WebAuthn/Passkeys are available
export async function isPasskeyAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    
    // Check if WebAuthn is supported
    if (!window.PublicKeyCredential) return false;
    
    // Check if conditional UI is available
    try {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

// Helper to check if user has registered passkeys
export async function hasRegisteredPasskey(): Promise<boolean> {
    // This function should be called from a component with session context
    // For now, return false - the component will handle the actual check
    return false;
}

export type AuthClient = typeof authClient;
export type Session = typeof authClient.$Infer.Session;
export type User = typeof authClient.$Infer.Session.user;

export interface Passkey {
    id: string
    name?: string
    createdAt?: Date
    deviceType?: string
    backedUp?: boolean
}
