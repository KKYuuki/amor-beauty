'use client'

import { useState, useContext } from 'react'
import { Button } from '@/components/ui/button'
import { updateTicketStatus } from '@/server/actions/tickets'
import { createTransaction } from '@/server/actions/transactions'
import { NotificationContext } from '@/components/notifications'
import { CheckCircleIcon } from 'lucide-react'
import BaseModal from '@/components/inventory/BaseModal'

export function ConvertTicketModal({ 
    isOpen, 
    onClose, 
    ticket,
    onSuccess
}: { 
    isOpen: boolean
    onClose: () => void
    ticket: any
    onSuccess: () => void
}) {
    const { addNotification } = useContext(NotificationContext)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [paymentMethod, setPaymentMethod] = useState('CASH')
    const [cashReceived, setCashReceived] = useState('')

    const total = Number(ticket.totalAmount)
    const change = paymentMethod === 'CASH' && cashReceived ? Math.max(0, parseFloat(cashReceived) - total) : 0

    const handleComplete = async () => {
        if (paymentMethod === 'CASH' && (!cashReceived || parseFloat(cashReceived) < total)) {
            addNotification('Insufficient cash received', 'WARNING')
            return
        }

        setIsSubmitting(true)
        try {
            // First mark ticket as completed
            const ticketRes = await updateTicketStatus(ticket.id, 'COMPLETED')
            if (!ticketRes.success) {
                addNotification(ticketRes.error || 'Failed to update ticket status', 'ERROR')
                setIsSubmitting(false)
                return
            }

            // Create Transaction
            const items = ticket.services.map((ts: any) => ({
                service_id: ts.service.id,
                item_name: ts.service.title,
                quantity: ts.quantity,
                unit_price: Number(ts.price),
                service_type: ts.service.serviceType,
            }))

            const payload = {
                buyer_name: ticket.customerName || 'Walk-in (Queue #' + ticket.queueNumber + ')',
                subtotal: total,
                tax_amount: 0,
                discount_amount: 0,
                total: total,
                amount_paid: total,
                payment_method: paymentMethod,
                cash_received: paymentMethod === 'CASH' ? parseFloat(cashReceived) : undefined,
                change_given: change,
                items
            }

            const res = await createTransaction(payload as any)

            if (res.success) {
                onSuccess()
            } else {
                addNotification(res.error || 'Failed to create sales transaction', 'ERROR')
            }
        } catch (err) {
            addNotification('Unexpected error', 'ERROR')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            title={`Complete & Checkout Ticket #${ticket.queueNumber}`}
            icon={CheckCircleIcon}
            size="md"
        >
            <div className="space-y-4 pt-4">
                <div className="bg-gray-50 p-4 rounded-lg flex justify-between items-center border border-gray-100">
                    <span className="font-semibold text-gray-700">Total Amount</span>
                    <span className="text-2xl font-black">${total.toFixed(2)}</span>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Payment Method</label>
                    <select 
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                        value={paymentMethod} 
                        onChange={(e: any) => setPaymentMethod(e.target.value)}
                    >
                        <option value="CASH">Cash</option>
                        <option value="CREDIT_CARD">Credit Card</option>
                        <option value="DEBIT_CARD">Debit Card</option>
                        <option value="BANK_TRANSFER">Bank Transfer</option>
                        <option value="E_WALLET">E-Wallet (GCash/PayMaya)</option>
                    </select>
                </div>

                {paymentMethod === 'CASH' && (
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700">Cash Received</label>
                        <input 
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-black outline-none"
                            type="number" 
                            value={cashReceived}
                            onChange={(e: any) => setCashReceived(e.target.value)}
                            placeholder="0.00"
                        />
                        {cashReceived && parseFloat(cashReceived) >= total && (
                            <p className="text-sm font-bold text-green-600 pt-1">
                                Change: ${change.toFixed(2)}
                            </p>
                        )}
                    </div>
                )}

                <Button 
                    className="w-full h-12 font-bold mt-6" 
                    onClick={handleComplete}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? 'Processing...' : 'Complete Transaction'}
                </Button>
            </div>
        </BaseModal>
    )
}
