'use client'

import { useState, useContext } from 'react'
import { PlusIcon, ClockIcon, PlayCircleIcon, CheckCircleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ServiceWithItems } from '@/server/actions/services'
import { updateTicketStatus } from '@/server/actions/tickets'
import { NotificationContext } from '@/components/notifications'
import { CreateTicketModal } from '@/components/tickets/CreateTicketModal'
import { TicketReceiptModal } from '@/components/tickets/TicketReceiptModal'
import { ConvertTicketModal } from '@/components/tickets/ConvertTicketModal'

export function TicketsClient({ initialTickets, services }: { initialTickets: any[], services: ServiceWithItems[] }) {
    const { addNotification } = useContext(NotificationContext)
    const [tickets, setTickets] = useState(initialTickets)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [receiptTicket, setReceiptTicket] = useState<any | null>(null)
    const [convertTicket, setConvertTicket] = useState<any | null>(null)
    const [loadingId, setLoadingId] = useState<string | null>(null)
    
    const [activeTab, setActiveTab] = useState<'PENDING' | 'PROCESSING' | 'COMPLETED'>('PENDING')

    const pendingTickets = tickets.filter(t => t.status === 'PENDING')
    const processingTickets = tickets.filter(t => t.status === 'PROCESSING')
    const completedTickets = tickets.filter(t => t.status === 'COMPLETED')

    const activeTickets = activeTab === 'PENDING' ? pendingTickets : activeTab === 'PROCESSING' ? processingTickets : completedTickets

    const handleStatusChange = async (ticketId: string, newStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED') => {
        setLoadingId(ticketId)
        try {
            const res = await updateTicketStatus(ticketId, newStatus)
            if (res.success) {
                if (newStatus === 'CANCELLED') {
                    setTickets(prev => prev.filter(t => t.id !== ticketId))
                } else {
                    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus } : t))
                }
                addNotification(`Ticket updated to ${newStatus}`, 'SUCCESS')
            } else {
                addNotification(res.error || 'Failed to update status', 'ERROR')
            }
        } finally {
            setLoadingId(null)
        }
    }

    const TicketCard = ({ ticket }: { ticket: any }) => (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3 flex flex-col justify-between">
            <div>
                <div className="flex justify-between items-start mb-3">
                    <div>
                        <span className="text-xl font-bold text-gray-900">#{ticket.queueNumber}</span>
                        {ticket.customerName && (
                            <p className="text-sm font-medium text-gray-600 mt-1">{ticket.customerName}</p>
                        )}
                    </div>
                    <span className="text-sm font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded-md">
                        ${Number(ticket.totalAmount).toFixed(2)}
                    </span>
                </div>

                <div className="bg-gray-50 rounded-lg p-2 space-y-1">
                    {ticket.services.map((ts: any) => (
                        <div key={ts.id} className="text-xs text-gray-600 flex justify-between">
                            <span>{ts.quantity}x {ts.service?.title || 'Service'}</span>
                            <span>${Number(ts.price).toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex gap-2 pt-2 mt-2">
                {ticket.status === 'PENDING' && (
                    <>
                        <Button 
                            className="flex-1 text-xs py-1 h-8" 
                            variant="outline"
                            onClick={() => handleStatusChange(ticket.id, 'CANCELLED')}
                            disabled={loadingId === ticket.id}
                        >Cancel</Button>
                        <Button 
                            className="flex-1 text-xs py-1 h-8"
                            onClick={() => handleStatusChange(ticket.id, 'PROCESSING')}
                            disabled={loadingId === ticket.id}
                        >Start</Button>
                    </>
                )}
                {ticket.status === 'PROCESSING' && (
                    <>
                        <Button 
                            className="flex-1 text-xs py-1 h-8" 
                            variant="outline"
                            onClick={() => handleStatusChange(ticket.id, 'PENDING')}
                            disabled={loadingId === ticket.id}
                        >Revert</Button>
                        <Button 
                            className="flex-1 text-xs py-1 h-8"
                            onClick={() => setConvertTicket(ticket)}
                            disabled={loadingId === ticket.id}
                        >Complete</Button>
                    </>
                )}
                {ticket.status === 'COMPLETED' && (
                    <Button 
                        className="flex-1 text-xs py-1 h-8" 
                        variant="outline"
                        disabled
                    >Completed</Button>
                )}
            </div>
        </div>
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className='flex items-center gap-4 border-b border-border w-full sm:w-auto overflow-x-auto'>
                    <button
                        onClick={() => setActiveTab('PENDING')}
                        className={`pb-2 px-1 font-medium transition-colors border-b-2 whitespace-nowrap ${
                            activeTab === 'PENDING'
                                ? 'border-blue-500 text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <span className='flex items-center gap-2'>
                            <ClockIcon className='w-4 h-4' />
                            Waiting
                            <span className='px-2 py-0.5 bg-card rounded-full text-xs border'>
                                {pendingTickets.length}
                            </span>
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('PROCESSING')}
                        className={`pb-2 px-1 font-medium transition-colors border-b-2 whitespace-nowrap ${
                            activeTab === 'PROCESSING'
                                ? 'border-blue-500 text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <span className='flex items-center gap-2'>
                            <PlayCircleIcon className='w-4 h-4' />
                            Processing
                            <span className='px-2 py-0.5 bg-card rounded-full text-xs border'>
                                {processingTickets.length}
                            </span>
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('COMPLETED')}
                        className={`pb-2 px-1 font-medium transition-colors border-b-2 whitespace-nowrap ${
                            activeTab === 'COMPLETED'
                                ? 'border-blue-500 text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <span className='flex items-center gap-2'>
                            <CheckCircleIcon className='w-4 h-4' />
                            Completed
                            <span className='px-2 py-0.5 bg-card rounded-full text-xs border'>
                                {completedTickets.length}
                            </span>
                        </span>
                    </button>
                </div>
                
                <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2 w-full sm:w-auto shrink-0">
                    <PlusIcon className="w-4 h-4" />
                    New Ticket
                </Button>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 min-h-[400px]">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {activeTickets.map(t => <TicketCard key={t.id} ticket={t} />)}
                </div>
                {activeTickets.length === 0 && (
                    <div className="text-center py-20 text-gray-400">
                        No {activeTab.toLowerCase()} tickets found.
                    </div>
                )}
            </div>

            {isCreateModalOpen && (
                <CreateTicketModal
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    services={services}
                    onSuccess={(ticketId, queueNumber, newTicketObj) => {
                        setIsCreateModalOpen(false)
                        setTickets(prev => [newTicketObj, ...prev])
                        setReceiptTicket({ queueNumber, totalAmount: newTicketObj.totalAmount, services: newTicketObj.services })
                        setActiveTab('PENDING')
                    }}
                />
            )}

            {receiptTicket && (
                <TicketReceiptModal
                    isOpen={!!receiptTicket}
                    onClose={() => setReceiptTicket(null)}
                    ticket={receiptTicket}
                />
            )}

            {convertTicket && (
                <ConvertTicketModal
                    isOpen={!!convertTicket}
                    onClose={() => setConvertTicket(null)}
                    ticket={convertTicket}
                    onSuccess={() => {
                        setConvertTicket(null)
                        setTickets(prev => prev.map(t => t.id === convertTicket.id ? { ...t, status: 'COMPLETED' } : t))
                        addNotification('Ticket converted to sale successfully', 'SUCCESS')
                    }}
                />
            )}
        </div>
    )
}
