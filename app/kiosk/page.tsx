import { Metadata } from 'next'
import KioskClient from './KioskClient'

export const metadata: Metadata = {
    title: 'Self-Service Kiosk | Amor Beauty Lounge',
    description: 'Generate your queue ticket at Amor Beauty Lounge',
}

export const dynamic = 'force-dynamic'

export default function KioskPage() {
    return <KioskClient />
}
