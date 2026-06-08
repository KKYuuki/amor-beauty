'use client'

import { Button } from '@/components/ui/button'
import { TicketIcon } from 'lucide-react'
import BaseModal from '@/components/inventory/BaseModal'

export function TicketReceiptModal({ 
    isOpen, 
    onClose, 
    ticket 
}: { 
    isOpen: boolean
    onClose: () => void
    ticket: any
}) {
    if (!ticket) return null

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title={`Ticket #${ticket.queueNumber}`}
            icon={TicketIcon}
            size="sm"
        >
            <div className="flex flex-col items-center text-center space-y-6">
                <div className="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center">
                    <TicketIcon className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Queue Number</p>
                    <h1 className="text-6xl font-black tracking-tighter text-gray-900">
                        #{ticket.queueNumber}
                    </h1>
                </div>

                <div className="w-full border-t border-dashed border-gray-300 my-4"></div>

                <div className="w-full space-y-2 text-left">
                    {ticket.services.map((ts: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-sm text-gray-600">
                            <span>{ts.quantity}x {ts.service?.title}</span>
                            <span>${(ts.price * ts.quantity).toFixed(2)}</span>
                        </div>
                    ))}
                </div>

                <div className="w-full border-t border-dashed border-gray-300 my-4"></div>

                <div className="w-full flex justify-between items-center text-lg font-bold text-gray-900">
                    <span>Estimated Total</span>
                    <span>${Number(ticket.totalAmount).toFixed(2)}</span>
                </div>

                <Button 
                    className="w-full h-12 text-lg font-bold mt-4" 
                    onClick={onClose}
                >
                    Done
                </Button>
            </div>
        </BaseModal>
    )
}
