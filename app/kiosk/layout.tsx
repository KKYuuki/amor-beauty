import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import '../globals.css'

const geist = Geist({
    variable: "--font-geist",
    subsets: ["latin"],
})

export const metadata: Metadata = {
    title: 'Kiosk | Amor Beauty Lounge',
    description: 'Self-service ticket kiosk for Amor Beauty Lounge',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'Amor Kiosk',
    },
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

export default function KioskLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" className="bg-background text-foreground">
            <head>
                <meta name="theme-color" content="#fffafb" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                <meta name="apple-mobile-web-app-title" content="Amor Kiosk" />
                <meta name="mobile-web-app-capable" content="yes" />
            </head>
            <body className={`${geist.variable} antialiased overflow-hidden overscroll-none touch-manipulation`}>
                {children}
            </body>
        </html>
    )
}
