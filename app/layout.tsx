import type { Metadata } from "next"
import { Geist, Bodoni_Moda } from "next/font/google"
import "./globals.css"
import Sidebar from "@/components/sidebar"
import NotificationProvider from "@/components/notifications"
import OverlayProvider from "@/components/overlayProvider"
import { BranchProvider } from "@/components/branch-context"
import consMeta from "@/utils/metadata"
import { getSetting } from "@/server/actions/settings"
import { PasskeyStatusProvider } from "@/contexts/PasskeyStatusContext"
import { PasskeySessionProvider } from "@/contexts/PasskeySessionContext"
import ServiceWorkerRegistration from "@/components/service-worker-registration"

const geist = Geist({
    variable: "--font-geist",
    subsets: ["latin"],
})

const bodoni = Bodoni_Moda({
    variable: "--font-bodoni",
    subsets: ["latin"],
})

export const metadata: Metadata = consMeta()

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    const maintenanceModeResult = await getSetting("maintenance_mode")
    const maintenanceMode = maintenanceModeResult.success
        ? maintenanceModeResult.data
        : null

    return (
        <html
            lang='en'
            className='bg-black text-white scheme-dark [&_button]:cursor-pointer'
        >
            <head>
                <meta name='theme-color' content='#000000' />
                <meta name='apple-mobile-web-app-capable' content='yes' />
                <meta name='apple-mobile-web-app-status-bar-style' content='black-translucent' />
                <meta name='apple-mobile-web-app-title' content='Amor Beauty Lounge' />
                <meta name='mobile-web-app-capable' content='yes' />
                <link rel='apple-touch-icon' href='/icon-512.png' />
                <link rel='manifest' href='/manifest.webmanifest' />
            </head>
            <body
                className={`${geist.variable} ${bodoni.variable} antialiased overflow-clip overscroll-none`}
            >
                <ServiceWorkerRegistration />
                <PasskeyStatusProvider>
                    <PasskeySessionProvider>
                        <NotificationProvider>
                            <BranchProvider>
                                <OverlayProvider>
                                    <Sidebar maintenanceMode={maintenanceMode}>
                                        {children}
                                    </Sidebar>
                                </OverlayProvider>
                            </BranchProvider>
                        </NotificationProvider>
                    </PasskeySessionProvider>
                </PasskeyStatusProvider>
            </body>
        </html>
    )
}
