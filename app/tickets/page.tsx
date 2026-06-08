import { Metadata } from 'next'
import { getActiveTickets } from '@/server/actions/tickets'
import { getServices } from '@/server/actions/services'
import { TicketsClient } from './TicketsClient'
import { getCurrentUser } from '@/utils/auth/permissions'
import { redirect } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'

export const metadata: Metadata = {
    title: 'Tickets | Amor Beauty Lounge',
    description: 'Manage active ticketing queue',
}

export default async function TicketsPage() {
    const user = await getCurrentUser()
    if (!user) {
        redirect('/auth')
    }

    const activeTickets = await getActiveTickets()
    const servicesResult = await getServices()
    const services = servicesResult.success && servicesResult.data?.services ? servicesResult.data.services : []

    return (
        <div className="space-y-6">
            <PageHeader
                title="Ticketing Queue"
                description="Manage active tickets and customer flow"
            />
            
            <TicketsClient 
                initialTickets={activeTickets} 
                services={services} 
            />
        </div>
    )
}
