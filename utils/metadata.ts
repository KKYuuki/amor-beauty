import { Metadata } from "next"

const location = process.env.LOCATION || "RDMD"

export default function consMeta({
    title = `InkSight ${location}`,
    description = `Your dedicated ${location} tattoo and piercing booking platform. Find availability, request appointments, and track your next ink—all in one place.`,
    image = '/inksight-banner.png',
    icons = '/icon-512.png',
    url = 'https://cebu.rdmdstudio.com',
    noIndex = true,
    keywords = ['tattoo', 'piercing', 'cebu', 'booking', 'inksight', 'rdmd'],
    author = "RDMD Studio",
    twitterHandle = "@rdmdstudio",
    themeColor = "#000000",
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
        title: typeof title === 'string' ? { default: title, template: `%s | InkSight ${location}` } : title,
        description,
        keywords,
        authors: [{ name: author }],
        creator: author,
        openGraph: {
            title,
            description,
            siteName: `Inksight ${location}`,
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
            statusBarStyle: 'black-translucent',
            title: `InkSight ${location}`,
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
