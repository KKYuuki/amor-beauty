'use client'

import { useState, useContext } from 'react'
import { Button } from '@/components/ui/button'
import { ServiceWithItems } from '@/server/actions/services'
import { createTicket } from '@/server/actions/tickets'
import { NotificationContext } from '@/components/notifications'
import { PlusIcon, MinusIcon, TrashIcon, TicketIcon } from 'lucide-react'
import BaseModal from '@/components/inventory/BaseModal'

export function CreateTicketModal({ 
    isOpen, 
    onClose, 
    services, 
    onSuccess 
}: { 
    isOpen: boolean
    onClose: () => void
    services: ServiceWithItems[]
    onSuccess: (ticketId: string, queueNumber: number, ticketObj: any) => void
}) {
    const { addNotification } = useContext(NotificationContext)
    const [customerName, setCustomerName] = useState('')
    const [cart, setCart] = useState<{service: ServiceWithItems, quantity: number}[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)

    const addToCart = (service: ServiceWithItems) => {
        setCart(prev => {
            const existing = prev.find(item => item.service.id === service.id)
            if (existing) {
                return prev.map(item => item.service.id === service.id ? { ...item, quantity: item.quantity + 1 } : item)
            }
            return [...prev, { service, quantity: 1 }]
        })
    }

    const updateQuantity = (serviceId: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.service.id === serviceId) {
                const newQty = item.quantity + delta
                if (newQty < 1) return item
                return { ...item, quantity: newQty }
            }
            return item
        }))
    }

    const removeFromCart = (serviceId: string) => {
        setCart(prev => prev.filter(item => item.service.id !== serviceId))
    }

    const totalAmount = cart.reduce((acc, item) => acc + (item.service.price * item.quantity), 0)

    const handleGenerate = async () => {
        if (cart.length === 0) {
            addNotification('Please add at least one service', 'WARNING')
            return
        }

        setIsSubmitting(true)
        try {
            const payload = {
                customerName: customerName.trim() || undefined,
                services: cart.map(item => ({
                    serviceId: item.service.id,
                    price: item.service.price,
                    quantity: item.quantity
                }))
            }

            const res = await createTicket(payload)
            if (res.success) {
                const newTicket = {
                    id: 'temp-id-' + Date.now(),
                    queueNumber: res.data.queueNumber,
                    customerName: payload.customerName,
                    totalAmount,
                    status: 'PENDING',
                    createdAt: new Date(),
                    services: cart.map(item => ({
                        id: 'temp-ts-' + Date.now() + Math.random(),
                        service: item.service,
                        price: item.service.price,
                        quantity: item.quantity
                    }))
                }
                addNotification(res.message || 'Ticket created', 'SUCCESS')
                onSuccess('temp', res.data.queueNumber, newTicket)
            } else {
                addNotification(res.error || 'Failed to create ticket', 'ERROR')
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title="Generate New Ticket"
            icon={TicketIcon}
            size="xl"
            maxHeight="80vh"
        >
            <div className="flex flex-col md:flex-row h-full">
                {/* Left side: Service Selection */}
                <div className="flex-1 overflow-y-auto pr-6">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        {services.map(service => (
                            <button
                                key={service.id}
                                onClick={() => addToCart(service)}
                                className="bg-white p-4 rounded-xl border border-gray-200 text-left hover:border-black hover:ring-1 hover:ring-black transition-all flex flex-col justify-between min-h-[100px]"
                            >
                                <span className="font-bold text-gray-900">{service.title}</span>
                                <span className="text-gray-500 font-medium">${Number(service.price).toFixed(2)}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right side: Cart Summary */}
                <div className="w-full md:w-80 md:border-l pl-0 md:pl-6 mt-6 md:mt-0 flex flex-col">
                    <div className="mb-4">
                        <label className="text-sm font-semibold text-gray-700 block mb-1">Customer Name (Optional)</label>
                        <input 
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                            placeholder="e.g. John Doe" 
                            value={customerName}
                            onChange={(e: any) => setCustomerName(e.target.value)}
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 min-h-[200px]">
                        {cart.length === 0 ? (
                            <div className="text-center text-gray-400 py-8 text-sm">No services selected</div>
                        ) : (
                            cart.map(item => (
                                <div key={item.service.id} className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                    <div className="flex justify-between items-start">
                                        <span className="font-semibold text-sm">{item.service.title}</span>
                                        <button onClick={() => removeFromCart(item.service.id)} className="text-gray-400 hover:text-red-500">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2 bg-white rounded-md border p-1">
                                            <button onClick={() => updateQuantity(item.service.id, -1)} className="p-1 hover:bg-gray-100 rounded">
                                                <MinusIcon className="w-3 h-3" />
                                            </button>
                                            <span className="text-xs font-medium w-4 text-center">{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.service.id, 1)} className="p-1 hover:bg-gray-100 rounded">
                                                <PlusIcon className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <span className="font-semibold text-sm">${(item.service.price * item.quantity).toFixed(2)}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="pt-4 border-t mt-4">
                        <div className="flex justify-between mb-4">
                            <span className="font-bold text-gray-700">Total</span>
                            <span className="font-bold text-xl">${totalAmount.toFixed(2)}</span>
                        </div>
                        <Button 
                            className="w-full h-12 text-lg font-bold" 
                            disabled={cart.length === 0 || isSubmitting}
                            onClick={handleGenerate}
                        >
                            {isSubmitting ? 'Generating...' : 'Generate Ticket'}
                        </Button>
                    </div>
                </div>
            </div>
        </BaseModal>
    )
}
