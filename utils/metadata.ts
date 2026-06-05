import { Metadata } from "next"

export default function consMeta({
    title = "Amor Beauty Lounge",
    description = "Beauty and wellness management system for Amor Beauty Lounge.",
    image = '/icon-512.png',
    icons = '/icon-512.png',
    url = 'https://amorbeautylounge.com',
    noIndex = true,
    keywords = ['beauty', 'salon', 'management', 'amor', 'booking'],
    author = "Amor Beauty Lounge",
    twitterHandle = "@amorbeautylounge",
    themeColor = "#d44b6e",
}: {
    title?: string | { default: string, template: string },
    description?: string
    image?: string
    icons?: string
    url?: string
    noIndex?: boolean
    keywords?: string[]
    author?: string
    twitterHandle?: string
    themeColor?: string
} = {}): Metadata {
    return {
        title: typeof title === 'string' ? { default: title, template: `%s | Amor Beauty Lounge` } : title,
        description,
        keywords,
        authors: [{ name: author }],
        creator: author,
        openGraph: {
            title,
            description,
            siteName: "Amor Beauty Lounge",
            url,
            images: [{ url: image }],
            locale: 'en_US',
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title: typeof title === 'string' ? title : title?.default,
            description,
            images: [image],
            creator: twitterHandle,
        },
        icons: {
            icon: [
                { url: icons, type: 'image/png', sizes: '512x512' },
                { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
            ],
            shortcut: icons,
            apple: icons,
        },
        metadataBase: new URL(url),
        alternates: {
            canonical: url,
        },
        manifest: '/manifest.webmanifest',
        appleWebApp: {
            capable: true,
            statusBarStyle: 'default',
            title: "Amor Beauty Lounge",
            startupImage: image,
        },
        formatDetection: {
            telephone: false,
        },
        other: {
            'mobile-web-app-capable': 'yes',
            'theme-color': themeColor,
        },
        ...(noIndex && {
            robots: {
                index: false,
                follow: false
            }
        })
    }
}
