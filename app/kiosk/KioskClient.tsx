'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { PlusIcon, MinusIcon, TrashIcon, SparklesIcon, TicketIcon, ArrowLeftIcon, CheckCircle2Icon } from 'lucide-react'
import Image from 'next/image'

// Types
interface KioskService {
    id: string
    title: string
    price: string
    serviceType: string
}

interface CartItem {
    service: KioskService
    quantity: number
}

type KioskState = 'SELECT' | 'CONFIRM' | 'RECEIPT'

// Service type display config
const serviceTypeLabels: Record<string, { label: string; color: string }> = {
    MAKEUP: { label: 'Makeup', color: 'bg-pink-100 text-pink-700 border-pink-200' },
    HAIR: { label: 'Hair', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    NAILS: { label: 'Nails', color: 'bg-rose-100 text-rose-700 border-rose-200' },
    LASH_BROW: { label: 'Lash & Brow', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    FACIAL: { label: 'Facial', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    BODY_MASSAGE: { label: 'Body Massage', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    WAXING: { label: 'Waxing', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    OTHER: { label: 'Other', color: 'bg-gray-100 text-gray-700 border-gray-200' },
}

const AUTO_RESET_SECONDS = 15

export default function KioskClient() {
    const [services, setServices] = useState<KioskService[]>([])
    const [cart, setCart] = useState<CartItem[]>([])
    const [state, setState] = useState<KioskState>('SELECT')
    const [activeCategory, setActiveCategory] = useState<string>('ALL')
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [customerName, setCustomerName] = useState('')
    const [queueNumber, setQueueNumber] = useState<number | null>(null)
    const [countdown, setCountdown] = useState(AUTO_RESET_SECONDS)
    const countdownRef = useRef<NodeJS.Timeout | null>(null)

    // Fetch services
    useEffect(() => {
        fetch('/api/public/kiosk')
            .then(res => res.json())
            .then(data => {
                setServices(data.services || [])
                setIsLoading(false)
            })
            .catch(() => setIsLoading(false))
    }, [])

    // Get unique categories
    const categories = ['ALL', ...Array.from(new Set(services.map(s => s.serviceType)))]
    const filteredServices = activeCategory === 'ALL'
        ? services
        : services.filter(s => s.serviceType === activeCategory)

    // Cart operations
    const addToCart = useCallback((service: KioskService) => {
        setCart(prev => {
            const existing = prev.find(item => item.service.id === service.id)
            if (existing) {
                return prev.map(item =>
                    item.service.id === service.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                )
            }
            return [...prev, { service, quantity: 1 }]
        })
    }, [])

    const updateQuantity = useCallback((serviceId: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.service.id === serviceId) {
                const newQty = item.quantity + delta
                if (newQty < 1) return item
                return { ...item, quantity: newQty }
            }
            return item
        }))
    }, [])

    const removeFromCart = useCallback((serviceId: string) => {
        setCart(prev => prev.filter(item => item.service.id !== serviceId))
    }, [])

    const totalAmount = cart.reduce((acc, item) => acc + (Number(item.service.price) * item.quantity), 0)
    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0)

    // Submit ticket
    const handleSubmit = async () => {
        if (cart.length === 0) return
        setIsSubmitting(true)

        try {
            const res = await fetch('/api/public/kiosk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerName: customerName.trim() || undefined,
                    services: cart.map(item => ({
                        serviceId: item.service.id,
                        quantity: item.quantity,
                    })),
                }),
            })

            const data = await res.json()
            if (data.success) {
                setQueueNumber(data.queueNumber)
                setState('RECEIPT')
                startCountdown()
            }
        } catch {
            // Silent fail — kiosk should not show technical errors to customers
        } finally {
            setIsSubmitting(false)
        }
    }

    // Auto-reset countdown
    const startCountdown = useCallback(() => {
        setCountdown(AUTO_RESET_SECONDS)
        if (countdownRef.current) clearInterval(countdownRef.current)
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    resetKiosk()
                    return AUTO_RESET_SECONDS
                }
                return prev - 1
            })
        }, 1000)
    }, [])

    const resetKiosk = useCallback(() => {
        if (countdownRef.current) clearInterval(countdownRef.current)
        setCart([])
        setCustomerName('')
        setQueueNumber(null)
        setState('SELECT')
        setActiveCategory('ALL')
        setCountdown(AUTO_RESET_SECONDS)
    }, [])

    useEffect(() => {
        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current)
        }
    }, [])

    if (isLoading) {
        return (
            <div className="h-dvh flex items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <SparklesIcon className="w-12 h-12 text-primary animate-pulse" />
                    <p className="text-lg text-muted-foreground">Loading services...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-dvh flex flex-col bg-background select-none">
            {/* Header */}
            <header className="shrink-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <SparklesIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground tracking-tight">Amor Beauty Lounge</h1>
                        <p className="text-sm text-muted-foreground">Select your services below</p>
                    </div>
                </div>
                {cart.length > 0 && state === 'SELECT' && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-primary text-white px-4 py-2 rounded-full text-sm font-bold"
                    >
                        {totalItems} item{totalItems !== 1 ? 's' : ''} · ₱{totalAmount.toFixed(2)}
                    </motion.div>
                )}
            </header>

            {/* Main Content */}
            <AnimatePresence mode="wait">
                {state === 'SELECT' && (
                    <motion.div
                        key="select"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 flex flex-col overflow-hidden"
                    >
                        {/* Category tabs */}
                        <div className="shrink-0 px-6 py-3 bg-card/50 border-b border-border overflow-x-auto">
                            <div className="flex gap-2">
                                {categories.map(cat => {
                                    const config = serviceTypeLabels[cat]
                                    return (
                                        <button
                                            key={cat}
                                            onClick={() => setActiveCategory(cat)}
                                            className={`px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                                                activeCategory === cat
                                                    ? 'bg-primary text-white shadow-md shadow-primary/25'
                                                    : 'bg-muted text-muted-foreground hover:bg-accent'
                                            }`}
                                        >
                                            {cat === 'ALL' ? 'All Services' : config?.label || cat}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Services grid */}
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {filteredServices.map(service => {
                                    const cartItem = cart.find(item => item.service.id === service.id)
                                    const config = serviceTypeLabels[service.serviceType] || serviceTypeLabels.OTHER
                                    return (
                                        <motion.button
                                            key={service.id}
                                            whileTap={{ scale: 0.96 }}
                                            onClick={() => addToCart(service)}
                                            className={`relative p-5 rounded-2xl border-2 text-left transition-all min-h-[120px] flex flex-col justify-between ${
                                                cartItem
                                                    ? 'border-primary bg-primary/5 shadow-md'
                                                    : 'border-border bg-card hover:border-primary/40 hover:shadow-sm'
                                            }`}
                                        >
                                            <div>
                                                <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border mb-2 ${config.color}`}>
                                                    {config.label}
                                                </span>
                                                <h3 className="font-bold text-foreground text-base leading-tight">
                                                    {service.title}
                                                </h3>
                                            </div>
                                            <p className="text-lg font-black text-primary mt-2">
                                                ₱{Number(service.price).toFixed(2)}
                                            </p>
                                            {cartItem && (
                                                <motion.div
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    className="absolute -top-2 -right-2 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold shadow-lg"
                                                >
                                                    {cartItem.quantity}
                                                </motion.div>
                                            )}
                                        </motion.button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Cart summary bar */}
                        {cart.length > 0 && (
                            <motion.div
                                initial={{ y: 100 }}
                                animate={{ y: 0 }}
                                className="shrink-0 bg-card border-t-2 border-border px-6 py-4"
                            >
                                {/* Cart items (scrollable) */}
                                <div className="max-h-[140px] overflow-y-auto space-y-2 mb-4">
                                    {cart.map(item => (
                                        <div key={item.service.id} className="flex items-center justify-between bg-muted rounded-xl p-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-sm truncate">{item.service.title}</p>
                                                <p className="text-xs text-muted-foreground">₱{Number(item.service.price).toFixed(2)} each</p>
                                            </div>
                                            <div className="flex items-center gap-2 ml-3">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); updateQuantity(item.service.id, -1) }}
                                                    className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center active:bg-muted"
                                                >
                                                    <MinusIcon className="w-4 h-4" />
                                                </button>
                                                <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); updateQuantity(item.service.id, 1) }}
                                                    className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center active:bg-muted"
                                                >
                                                    <PlusIcon className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeFromCart(item.service.id) }}
                                                    className="w-9 h-9 rounded-lg bg-red-50 border border-red-200 text-red-500 flex items-center justify-center active:bg-red-100 ml-1"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Total and continue */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-muted-foreground">Total</p>
                                        <p className="text-2xl font-black text-foreground">₱{totalAmount.toFixed(2)}</p>
                                    </div>
                                    <button
                                        onClick={() => setState('CONFIRM')}
                                        className="bg-primary text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-primary/25 active:scale-95 transition-transform"
                                    >
                                        Continue →
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                )}

                {state === 'CONFIRM' && (
                    <motion.div
                        key="confirm"
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        className="flex-1 flex flex-col items-center justify-center px-6 py-8"
                    >
                        <div className="w-full max-w-lg">
                            <button
                                onClick={() => setState('SELECT')}
                                className="flex items-center gap-2 text-muted-foreground mb-6 active:text-foreground"
                            >
                                <ArrowLeftIcon className="w-5 h-5" />
                                <span className="font-medium">Back to services</span>
                            </button>

                            <h2 className="text-3xl font-black text-foreground mb-6">Confirm Your Order</h2>

                            {/* Order summary */}
                            <div className="bg-card rounded-2xl border border-border p-6 space-y-4 mb-6">
                                {cart.map(item => (
                                    <div key={item.service.id} className="flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold">{item.service.title}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {item.quantity}x ₱{Number(item.service.price).toFixed(2)}
                                            </p>
                                        </div>
                                        <p className="font-bold">₱{(Number(item.service.price) * item.quantity).toFixed(2)}</p>
                                    </div>
                                ))}
                                <div className="border-t border-border pt-4 flex justify-between">
                                    <span className="text-lg font-bold">Total</span>
                                    <span className="text-2xl font-black text-primary">₱{totalAmount.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Optional customer name */}
                            <div className="mb-6">
                                <label className="text-sm font-semibold text-muted-foreground block mb-2">
                                    Your Name (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    placeholder="e.g. Maria"
                                    className="w-full px-5 py-4 rounded-xl border-2 border-border bg-card text-lg focus:border-primary focus:ring-0 outline-none transition-colors"
                                />
                            </div>

                            {/* Generate ticket button */}
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="w-full bg-primary text-white py-5 rounded-2xl font-bold text-xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-transform disabled:opacity-60"
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center justify-center gap-3">
                                        <SparklesIcon className="w-6 h-6 animate-spin" />
                                        Generating...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-3">
                                        <TicketIcon className="w-6 h-6" />
                                        Generate Ticket
                                    </span>
                                )}
                            </button>
                        </div>
                    </motion.div>
                )}

                {state === 'RECEIPT' && queueNumber !== null && (
                    <motion.div
                        key="receipt"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 flex flex-col items-center justify-center px-6"
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', delay: 0.2 }}
                            className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mb-8"
                        >
                            <CheckCircle2Icon className="w-14 h-14 text-emerald-600" />
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="text-center"
                        >
                            <p className="text-xl text-muted-foreground mb-2">Your Queue Number</p>
                            <motion.p
                                initial={{ scale: 0.5 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', delay: 0.6 }}
                                className="text-[120px] font-black text-primary leading-none tracking-tighter"
                            >
                                #{queueNumber}
                            </motion.p>
                            <p className="text-lg text-muted-foreground mt-4 mb-2">
                                Please wait for your number to be called
                            </p>
                            <p className="text-3xl font-bold text-foreground">
                                Total: ₱{totalAmount.toFixed(2)}
                            </p>
                        </motion.div>

                        {/* Auto-reset countdown */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1 }}
                            className="mt-12 text-center"
                        >
                            <p className="text-sm text-muted-foreground mb-3">
                                Resetting in {countdown} second{countdown !== 1 ? 's' : ''}...
                            </p>
                            <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-primary rounded-full"
                                    initial={{ width: '100%' }}
                                    animate={{ width: '0%' }}
                                    transition={{ duration: AUTO_RESET_SECONDS, ease: 'linear' }}
                                />
                            </div>
                            <button
                                onClick={resetKiosk}
                                className="mt-4 px-6 py-3 rounded-xl bg-muted text-muted-foreground font-medium active:bg-accent transition-colors"
                            >
                                New Ticket
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
