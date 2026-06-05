import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Amor Beauty Lounge',
        short_name: 'Amor Beauty',
        description: 'Your dedicated Cebu tattoo and piercing booking platform. Find availability, request appointments, and track your next ink—all in one place.',
        start_url: '/',
        display: 'standalone',
        background_color: '#fffafb',
        theme_color: '#d44b6e',
        orientation: 'portrait-primary',
        categories: ['business', 'lifestyle', 'productivity'],
        lang: 'en',
        scope: '/',
        id: 'amor-beauty-pwa',
        icons: [
            {
                src: '/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
        screenshots: [
            {
                src: '/amor-banner.png',
                sizes: '1200x600',
                type: 'image/png',
                form_factor: 'wide',
                label: 'Amor Beauty Lounge Dashboard',
            },
        ],
        prefer_related_applications: false,
        display_override: ['standalone', 'minimal-ui'],
    }
}
