"use client"

import React, {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    createContext,
} from "react"
import { NotificationContext } from "@/components/notifications"

import { InventoryItem } from "@/utils/types/inventory"
import { ServiceWithItems } from "@/server/actions/services"
import {
    CreateTransactionPayload,
    CreateTransactionItemPayload,
    PaymentMethod,
    Transaction,
    AddTransactionPaymentPayload,
} from "@/utils/types/transactions"
import { getInventory } from "@/server/actions/inventory"
import { getServices } from "@/server/actions/services"
import {
    createTransaction,
    getTodaySummary,
    getTransactions,
    voidTransaction,
    addTransactionPayment,
} from "@/server/actions/transactions"
import { getSetting } from "@/server/actions/settings"
import { ActionResponse } from "@/utils/types/responses"
import { GetServicesResult } from "@/server/actions/services"
import { GetTransactionsResult, GetTodaySummaryResult, CreateTransactionResult } from "@/server/actions/transactions"
import { getStaffList } from "@/server/actions/profile"
import { CurrencyTaxValue } from "@/utils/types/settings"
import { NotificationType } from "@/utils/types/notifications"
import { SplitPayment } from "@/utils/types/transactions"
import { ServiceType } from "@/utils/types/payroll"
import { calculateDownpaymentAmount } from "@/components/sales/utils/downpayment"

const currentBranch: any = null;

export interface CartItem {
    id: string
    type: "INVENTORY" | "SERVICE"
    name: string
    unit_price: number
    original_price: number
    custom_price?: number
    quantity: number
    max_quantity?: number
    pricing_type?: "FIXED" | "HOURLY"
    hourly_rate?: number
    total_hours?: number
    service_type?: ServiceType
}

interface ConfirmModalConfig {
    title: string
    message: string
    onConfirm: () => void
    variant: "danger" | "warning" | "info"
}

interface SalesUserInfo {
    id: string
    full_name: string
    role: string
    rate_level_id?: string
    branch_id?: string
}

interface SalesContextType {
    inventory: InventoryItem[]
    services: ServiceWithItems[]
    transactions: Transaction[]
    todayStats: { totalRevenue: number; completedCount: number; pendingCount: number; itemsSold: number; servicesRendered: number }
    taxSettings: CurrencyTaxValue
    loading: boolean
    searchQuery: string
    setSearchQuery: (query: string) => void
    cart: CartItem[]
    setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
    addToCart: (
        item: InventoryItem | ServiceWithItems,
        type: "INVENTORY" | "SERVICE",
    ) => void
    removeFromCart: (id: string) => void
    updateCustomPrice: (id: string, newPrice: number) => void
    updateLineTotal: (id: string, newTotal: number) => void
    updateQuantity: (id: string, delta: number) => void
    clearCart: () => void
    grossTotal: number
    taxAmount: number
    netSubtotal: number
    total: number
    calculatedTotal: number
    totalOverride: number | null
    setTotalOverride: (value: number | null) => void
    change: number
    discountAmount: number
    appliedDiscount: number
    discountType: "PERCENTAGE" | "FIXED"
    setDiscountType: (type: "PERCENTAGE" | "FIXED") => void
    setDiscountValue: (value: string) => void
    setDiscountReason: (reason: string) => void
    setAppliedDiscount: (value: number) => void
    isCheckoutModalOpen: boolean
    setIsCheckoutModalOpen: (open: boolean) => void
    paymentMethod: PaymentMethod
    setPaymentMethod: (method: PaymentMethod) => void
    cashReceived: string
    setCashReceived: (amount: string) => void
    referenceNumber: string
    setReferenceNumber: (reference: string) => void
    isPartialPayment: boolean
    setIsPartialPayment: (partial: boolean) => void
    amountToPay: string
    setAmountToPay: (amount: string) => void
    selectedTransactionForPayment: Transaction | null
    setSelectedTransactionForPayment: (txn: Transaction | null) => void
    isAddPaymentModalOpen: boolean
    setIsAddPaymentModalOpen: (open: boolean) => void
    addPaymentAmount: string
    setAddPaymentAmount: (amount: string) => void
    addPaymentMethod: PaymentMethod
    setAddPaymentMethod: (method: PaymentMethod) => void
    addPaymentReference: string
    setAddPaymentReference: (reference: string) => void
    processing: boolean
    isTransactionsOpen: boolean
    setIsTransactionsOpen: (open: boolean) => void
    clientType: "WALKIN" | "PERSONAL"
    setClientType: (type: "WALKIN" | "PERSONAL") => void
    isDiscountModalOpen: boolean
    setIsDiscountModalOpen: (open: boolean) => void
    downpaymentType: 'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM' | null
    setDownpaymentType: (type: 'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM' | null) => void
    downpaymentAmount: number
    setDownpaymentAmount: (amount: number) => void
    downpaymentPercentageRate: number
    setDownpaymentPercentageRate: (rate: number) => void
    downpaymentEstimatedTotal: number
    setDownpaymentEstimatedTotal: (total: number) => void
    payrollSplitMode: 'PER_PAYMENT' | 'ON_COMPLETION'
    setPayrollSplitMode: (mode: 'PER_PAYMENT' | 'ON_COMPLETION') => void
    salesDescription: string
    setSalesDescription: (desc: string) => void
    itemLabels: Record<string, string>
    setItemLabels: React.Dispatch<React.SetStateAction<Record<string, string>>>
    setItemLabel: (itemId: string, label: string) => void
    discountValue: string
    discountReason: string
    customerMode: "REGISTERED" | "WALKIN"
    setCustomerMode: (mode: "REGISTERED" | "WALKIN") => void
    walkinName: string
    setWalkinName: (name: string) => void
    walkinPhone: string
    setWalkinPhone: (phone: string) => void
    walkinEmail: string
    setWalkinEmail: (email: string) => void
    staffList: Array<{
        id: string
        full_name: string
        avatar_url?: string
        access_flags?: string[]
        role?: string
        rate_level_id?: string
        rate_level_name?: string
    }>
    selectedStaffId: string
    setSelectedStaffId: (id: string) => void
    splitPayments: SplitPayment[]
    setSplitPayments: (payments: SplitPayment[]) => void
    txnPage: number
    setTxnPage: (page: number) => void
    txnPageSize: number
    setTxnPageSize: (size: number) => void
    txnHasMore: boolean
    setTxnHasMore: (hasMore: boolean) => void
    txnLoading: boolean
    setTxnLoading: (loading: boolean) => void
    txnTotal: number
    refreshTransactions: () => Promise<void>
    handleCheckout: () => Promise<ActionResponse<CreateTransactionResult> | undefined>
    handleVoid: (txnId: string) => void
    handleAddPayment: () => void
    confirmModalOpen: boolean
    setConfirmModalOpen: (open: boolean) => void
    confirmModalConfig: ConfirmModalConfig
    setConfirmModalConfig: (config: ConfirmModalConfig) => void
    addNotification: (
        message: string,
        type?: NotificationType,
        title?: string,
        ephemeral?: boolean,
    ) => void
    userInfo: SalesUserInfo
}

const SalesContext = createContext<SalesContextType | undefined>(undefined)

export function useSales() {
    const context = useContext(SalesContext)
    if (!context) {
        throw new Error("useSales must be used within a SalesProvider")
    }
    return context
}

interface SalesProviderProps {
    children: React.ReactNode
    userInfo: SalesUserInfo
}

export function SalesProvider({ children, userInfo }: SalesProviderProps) {
    const { addNotification } = useContext(NotificationContext)
    

    const [inventory, setInventory] = useState<InventoryItem[]>([])
    const [services, setServices] = useState<ServiceWithItems[]>([])
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [todayStats, setTodayStats] = useState<GetTodaySummaryResult>({
        totalRevenue: 0,
        completedCount: 0,
        pendingCount: 0,
        itemsSold: 0,
        servicesRendered: 0,
    })
    const [taxSettings, setTaxSettings] = useState<CurrencyTaxValue>({
        currency_symbol: "$",
        tax_rate: 0.12,
        tax_enabled: true,
        tax_inclusive: true,
    })

    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [cart, setCart] = useState<CartItem[]>([])
    const [totalOverride, setTotalOverride] = useState<number | null>(null)
    const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false)
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH")
    const [cashReceived, setCashReceived] = useState<string>("")
    const [referenceNumber, setReferenceNumber] = useState<string>("")
    const [isPartialPayment, setIsPartialPayment] = useState(false)
    const [amountToPay, setAmountToPay] = useState<string>("")
    const [selectedTransactionForPayment, setSelectedTransactionForPayment] =
        useState<Transaction | null>(null)
    const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false)
    const [addPaymentAmount, setAddPaymentAmount] = useState<string>("")
    const [addPaymentMethod, setAddPaymentMethod] =
        useState<PaymentMethod>("CASH")
    const [addPaymentReference, setAddPaymentReference] = useState<string>("")
    const [processing, setProcessing] = useState(false)
    const [isTransactionsOpen, setIsTransactionsOpen] = useState(false)
    const [clientType, setClientType] = useState<"WALKIN" | "PERSONAL">(
        "WALKIN",
    )

    const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false)
    const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">(
        "PERCENTAGE",
    )
    const [discountValue, setDiscountValue] = useState<string>("")
    const [discountReason, setDiscountReason] = useState<string>("")
    const [appliedDiscount, setAppliedDiscount] = useState<number>(0)

    // Sales descriptions & labels
    const [salesDescription, setSalesDescription] = useState<string>('')
    const [itemLabels, setItemLabels] = useState<Record<string, string>>({})

    const setItemLabel = useCallback((itemId: string, label: string) => {
        setItemLabels((prev) => ({ ...prev, [itemId]: label }))
    }, [])

    const [downpaymentType, setDownpaymentType] = useState<'FLAT_FEE' | 'PERCENTAGE' | 'CUSTOM' | null>(null)
    const [downpaymentAmount, setDownpaymentAmount] = useState<number>(0)
    const [downpaymentPercentageRate, setDownpaymentPercentageRate] = useState<number>(0)
    const [downpaymentEstimatedTotal, setDownpaymentEstimatedTotal] = useState<number>(0)
    const [payrollSplitMode, setPayrollSplitMode] = useState<'PER_PAYMENT' | 'ON_COMPLETION'>('PER_PAYMENT')

    const [customerMode, setCustomerMode] = useState<"REGISTERED" | "WALKIN">(
        "REGISTERED",
    )
    const [walkinName, setWalkinName] = useState<string>("")
    const [walkinPhone, setWalkinPhone] = useState<string>("")
    const [walkinEmail, setWalkinEmail] = useState<string>("")

    const [staffList, setStaffList] = useState<
        {
            id: string
            full_name: string
            avatar_url?: string
            access_flags?: string[]
            role?: string
            rate_level_id?: string
            rate_level_name?: string
        }[]
    >([])
    const [selectedStaffId, setSelectedStaffId] = useState<string>("")
    const [hasInitializedStaff, setHasInitializedStaff] = useState(false)

    const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([])

    useEffect(() => {
        if (paymentMethod !== 'SPLIT') {
            setSplitPayments([])
        }
    }, [paymentMethod])

    const [txnPage, setTxnPage] = useState(1)
    const [txnPageSize, setTxnPageSize] = useState(10)
    const [txnHasMore, setTxnHasMore] = useState(false)
    const [txnLoading, setTxnLoading] = useState(false)
    const [txnTotal, setTxnTotal] = useState(0)

    const [confirmModalOpen, setConfirmModalOpen] = useState(false)
    const [confirmModalConfig, setConfirmModalConfig] = useState<{
        title: string
        message: string
        onConfirm: () => void
        variant: "danger" | "warning" | "info"
    }>({
        title: "",
        message: "",
        onConfirm: () => {},
        variant: "warning",
    })

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Request timeout")), 15000),
            )

            const raceResult = await Promise.race([
                Promise.all([
                    getInventory({ branchId: currentBranch?.id }),
                    getServices({ branchId: currentBranch?.id }),
                    getTransactions({
                        pageSize: 20,
                        filters: { branchId: currentBranch?.id }
                    }),
                    getTodaySummary(currentBranch?.id),
                    getSetting("currency_tax"),
                ]),
                timeoutPromise,
            ])

            const [invData, servResult, txnResult, statsResult, taxResult] = raceResult as [
                InventoryItem[],
                ActionResponse<GetServicesResult>,
                ActionResponse<GetTransactionsResult>,
                ActionResponse<GetTodaySummaryResult>,
                ActionResponse<CurrencyTaxValue | null>,
            ]

            const staffData = await getStaffList()
            setStaffList(staffData || [])

            const salesInv = (invData || []).filter(
                (item) => item.show_in_sales === true || item.is_shared === true || item.branch_id === null
            )
            setInventory(salesInv || [])
            if (servResult.success) {
                // Filter services by branch
                const branchServices = (servResult.data.services || []).filter(
                    (service) => service.branch_id === currentBranch?.id || service.is_shared || service.branch_id === null
                )
                setServices(branchServices)
            }
            if (txnResult.success) {
                setTransactions(txnResult.data.data || [])
            }
            if (statsResult.success) {
                setTodayStats(statsResult.data || { totalRevenue: 0, completedCount: 0, pendingCount: 0, itemsSold: 0, servicesRendered: 0 })
            }
            if (taxResult.success && taxResult.data) {
                setTaxSettings(taxResult.data)
            }
        } catch (error) {
            console.error("Error fetching sales data:", error)
            if (error instanceof Error && error.message === "Request timeout") {
                addNotification(
                    "Data loading timed out. Please refresh.",
                    "ERROR",
                )
            } else {
                addNotification("Failed to load sales data", "ERROR")
            }
        } finally {
            setLoading(false)
        }
    }, [addNotification, currentBranch?.id])

    const refreshTransactions = useCallback(async () => {
        setTxnLoading(true)
        try {
            const result = await getTransactions({
                page: txnPage,
                pageSize: txnPageSize,
                filters: currentBranch?.id ? { branchId: currentBranch.id } : undefined,
            })
            if (result.success && result.data) {
                setTransactions(result.data.data)
                setTxnTotal(result.data.total)
                setTxnHasMore(result.data.hasMore)
            }
        } catch (error) {
            console.error('Error refreshing transactions:', error)
        } finally {
            setTxnLoading(false)
        }
    }, [currentBranch?.id, txnPage, txnPageSize])

    // Initial data fetch on mount
    useEffect(() => {
        fetchData()
    }, [fetchData])

    useEffect(() => {
        if (userInfo?.id && !hasInitializedStaff && !selectedStaffId) {
            setSelectedStaffId(userInfo.id)
            setHasInitializedStaff(true)
        }
    }, [userInfo?.id, hasInitializedStaff, selectedStaffId])

    const addToCart = (
        item: InventoryItem | ServiceWithItems,
        type: "INVENTORY" | "SERVICE",
    ) => {
        setCart((prev) => {
            const existing = prev.find((i) => i.id === item.id)
            if (existing) {
                if (type === "INVENTORY") {
                    const invItem = item as InventoryItem
                    if (existing.quantity + 1 > invItem.current_stock) {
                        addNotification("Insufficient stock", "WARNING")
                        return prev
                    }
                }
                return prev.map((i) =>
                    i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i,
                )
            }

            const newItem: CartItem = {
                id: item.id,
                type,
                name:
                    type === "INVENTORY"
                        ? (item as InventoryItem).name
                        : (item as ServiceWithItems).title,
                unit_price:
                    type === "INVENTORY"
                        ? (item as InventoryItem).selling_price || 0
                        : (item as ServiceWithItems).price,
                original_price:
                    type === "INVENTORY"
                        ? (item as InventoryItem).selling_price || 0
                        : (item as ServiceWithItems).price,
                quantity: 1,
                max_quantity:
                    type === "INVENTORY"
                        ? (item as InventoryItem).current_stock
                        : undefined,
                pricing_type:
                    type === "SERVICE"
                        ? (item as ServiceWithItems).pricing_type || "FIXED"
                        : undefined,
                hourly_rate:
                    type === "SERVICE"
                        ? (item as ServiceWithItems).hourly_rate || 0
                        : undefined,
                total_hours:
                    type === "SERVICE" &&
                    (item as ServiceWithItems).pricing_type === "HOURLY"
                        ? 1
                        : undefined,
                service_type:
                    type === "SERVICE"
                        ? (item as ServiceWithItems).service_type
                        : undefined,
            }
            return [...prev, newItem]
        })
    }

    const removeFromCart = (id: string) => {
        setCart((prev) => prev.filter((i) => i.id !== id))
    }

    const updateCustomPrice = (id: string, newPrice: number) => {
        setCart((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item
                if (newPrice < 0) return item
                return {
                    ...item,
                    custom_price: newPrice,
                    unit_price: newPrice,
                }
            }),
        )
    }

    const updateLineTotal = (id: string, newTotal: number) => {
        setCart((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item
                if (newTotal < 0) return item
                const newUnitPrice = item.quantity > 0 ? newTotal / item.quantity : 0
                return {
                    ...item,
                    unit_price: newUnitPrice,
                }
            }),
        )
    }

    const updateQuantity = (id: string, delta: number) => {
        setCart((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item

                const newQty = item.quantity + delta
                if (newQty < 1) return item
                if (item.max_quantity && newQty > item.max_quantity) {
                    addNotification("Max stock reached", "WARNING")
                    return item
                }
                return { ...item, quantity: newQty }
            }),
        )
    }

    const clearCart = () => {
        setCart([])
        setTotalOverride(null)
    }

    const grossTotal = useMemo(() => {
        return cart.reduce((sum, item) => {
            let itemTotal = item.unit_price * item.quantity

            if (
                item.type === "SERVICE" &&
                item.pricing_type === "HOURLY" &&
                item.hourly_rate &&
                item.total_hours
            ) {
                itemTotal = item.total_hours * item.hourly_rate * item.quantity
            }

            if (item.type === "INVENTORY") {
                let freeQty = 0
                cart.forEach((cItem) => {
                    if (cItem.type === "SERVICE") {
                        const service = services.find((s) => s.id === cItem.id)
                        if (service?.items) {
                            const linkedItem = service.items.find(
                                (si) => si.inventory_id === item.id,
                            )
                            if (linkedItem) {
                                freeQty +=
                                    parseInt(linkedItem.quantity) * cItem.quantity
                            }
                        }
                    }
                })

                const billableQty = Math.max(0, item.quantity - freeQty)
                itemTotal = item.unit_price * billableQty
            }

            return sum + itemTotal
        }, 0)
    }, [cart, services])

    const { taxAmount, netSubtotal, subtotalBeforeDiscount } = useMemo(() => {
        let taxAmount = 0
        let netSubtotal = grossTotal

        if (taxSettings.tax_enabled && taxSettings.tax_rate > 0) {
            if (taxSettings.tax_inclusive) {
                netSubtotal = grossTotal / (1 + taxSettings.tax_rate)
                taxAmount = grossTotal - netSubtotal
            } else {
                netSubtotal = grossTotal
                taxAmount = grossTotal * taxSettings.tax_rate
            }
        }

        const subtotalBeforeDiscount = taxSettings.tax_inclusive
            ? grossTotal
            : netSubtotal + taxAmount

        return { taxAmount, netSubtotal, subtotalBeforeDiscount }
    }, [grossTotal, taxSettings])

    const discountAmount = useMemo(() => {
        let discountAmount = 0
        if (appliedDiscount > 0) {
            if (discountType === "PERCENTAGE") {
                discountAmount = subtotalBeforeDiscount * (appliedDiscount / 100)
            } else {
                discountAmount = Math.min(appliedDiscount, subtotalBeforeDiscount)
            }
        }
        return discountAmount
    }, [appliedDiscount, discountType, subtotalBeforeDiscount])

    // Cap appliedDiscount at grossTotal for flat (non-percentage) discounts
    useEffect(() => {
        if (discountType !== "PERCENTAGE" && appliedDiscount > grossTotal && grossTotal > 0) {
            setAppliedDiscount(grossTotal)
        }
    }, [appliedDiscount, grossTotal, discountType, setAppliedDiscount])

    const calculatedTotal = useMemo(() => {
        return Math.max(0, subtotalBeforeDiscount - discountAmount)
    }, [subtotalBeforeDiscount, discountAmount])

    const total = useMemo(() => {
        return totalOverride !== null ? totalOverride : calculatedTotal
    }, [totalOverride, calculatedTotal])

    const change = useMemo(() => {
        return paymentMethod === "CASH" && cashReceived
            ? Math.max(0, parseFloat(cashReceived) - total)
            : 0
    }, [paymentMethod, cashReceived, total])

    useEffect(() => {
        if (isCheckoutModalOpen) {
            const effectiveTotal = totalOverride !== null ? totalOverride : calculatedTotal
            if (!downpaymentType) {
                setAmountToPay(effectiveTotal.toFixed(2))
            }
        }
    }, [isCheckoutModalOpen, totalOverride, calculatedTotal, downpaymentType])

    useEffect(() => {
        if (!isCheckoutModalOpen) {
            setIsPartialPayment(false)
            setAmountToPay("")
            setAppliedDiscount(0)
            setDiscountType("PERCENTAGE")
            setDiscountValue("")
            setDiscountReason("")
        }
    }, [isCheckoutModalOpen])

    useEffect(() => {
        if (!isPartialPayment) {
            const effectiveTotal = totalOverride !== null ? totalOverride : calculatedTotal
            setAmountToPay(effectiveTotal.toFixed(2))
        }
    }, [isPartialPayment, totalOverride, calculatedTotal])

    const handleCheckout = async () => {
        if (!userInfo?.id) return

        // Validate cart has items
        if (cart.length === 0) {
            addNotification("Cart is empty", "ERROR")
            return
        }

        // Validate split payment totals
        if (paymentMethod === 'SPLIT' && splitPayments.length > 0) {
            const splitTotal = splitPayments.reduce((sum, p) => sum + p.amount, 0)
            if (!isPartialPayment && Math.abs(splitTotal - total) > 0.01) {
                addNotification(`Split payment total (${splitTotal.toFixed(2)}) must equal transaction total (${total.toFixed(2)})`, "ERROR")
                return
            }
            if (isPartialPayment && splitTotal > total) {
                addNotification("Partial payment cannot exceed total", "ERROR")
                return
            }
        }

        // Validate discount doesn't exceed subtotal
        if (appliedDiscount > 0) {
            const maxDiscount = discountType === 'PERCENTAGE' ? 100 : netSubtotal
            if (appliedDiscount > maxDiscount) {
                addNotification("Discount exceeds maximum allowed", "ERROR")
                return
            }
        }

        setProcessing(true)

        try {
            const amountPaid = isPartialPayment
                ? parseFloat(amountToPay || "0")
                : total

            // Auto-set amount_paid for downpayment transactions
            let effectiveAmountPaid = amountPaid
            if (downpaymentType && !isPartialPayment) {
                const calculatedDownpayment = calculateDownpaymentAmount(
                    downpaymentType,
                    downpaymentAmount,
                    downpaymentPercentageRate,
                    downpaymentEstimatedTotal
                )
                if (calculatedDownpayment > 0) {
                    effectiveAmountPaid = calculatedDownpayment
                }
            }

            const adjustmentAmount = totalOverride !== null ? totalOverride - calculatedTotal : 0

            let staff_id: string | null = selectedStaffId || userInfo.id

            if (staff_id === "SHOP_SALE") {
                staff_id = null
            }

            const payload: CreateTransactionPayload = {
                staff_id: staff_id as string | null | undefined,
                buyer_id: undefined,
                buyer_name:
                    customerMode === "WALKIN"
                        ? walkinName
                        : undefined,
                customer_phone:
                    customerMode === "WALKIN" && walkinPhone
                        ? walkinPhone
                        : undefined,
                customer_email:
                    customerMode === "WALKIN" && walkinEmail
                        ? walkinEmail
                        : undefined,
                branch_id: currentBranch?.id ?? null,
                subtotal: netSubtotal,
                tax_amount: taxAmount,
                discount_amount: discountAmount,
                total,
                adjustment_amount: adjustmentAmount,
                amount_paid: effectiveAmountPaid,
                balance_due: isPartialPayment || downpaymentType ? total - effectiveAmountPaid : undefined,
                payment_method: paymentMethod,
                payments: paymentMethod === "SPLIT" ? splitPayments : undefined,
                cash_received:
                    paymentMethod === "CASH"
                        ? (isPartialPayment || downpaymentType)
                            ? effectiveAmountPaid
                            : parseFloat(cashReceived)
                        : undefined,
                change_given:
                    paymentMethod === "CASH" && !isPartialPayment && !downpaymentType
                        ? change
                        : undefined,
                reference_number:
                    paymentMethod !== "CASH" && referenceNumber.trim()
                        ? referenceNumber.trim()
                        : undefined,
                items: cart.flatMap((item) => {
                    // For services, return as-is
                    if (item.type === "SERVICE") {
                        return {
                            service_id: item.id,
                            item_name: item.name,
                            item_label: itemLabels[item.id] || undefined,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            service_type: item.service_type,
                        }
                    }

                    // For inventory items, calculate free quantity
                    let freeQty = 0
                    cart.forEach((cItem) => {
                        if (cItem.type === "SERVICE") {
                            const service = services.find((s) => s.id === cItem.id)
                            if (service?.items) {
                                const linkedItem = service.items.find(
                                    (si) => si.inventory_id === item.id,
                                )
                                if (linkedItem) {
                                    freeQty +=
                                        parseInt(linkedItem.quantity) * cItem.quantity
                                }
                            }
                        }
                    })

                    const billableQty = Math.max(0, item.quantity - freeQty)
                    const lineItems: CreateTransactionItemPayload[] = []

                    // Add billable item if any
                    if (billableQty > 0) {
                        lineItems.push({
                            inventory_id: item.id,
                            item_name: item.name,
                            item_label: itemLabels[item.id] || undefined,
                            quantity: billableQty,
                            unit_price: item.unit_price,
                            is_free: false,
                        })
                    }

                    // Add free item if any
                    if (freeQty > 0) {
                        lineItems.push({
                            inventory_id: item.id,
                            item_name: `${item.name} (Free with service)`,
                            item_label: itemLabels[item.id] || undefined,
                            quantity: freeQty,
                            unit_price: 0,
                            is_free: true,
                        })
                    }

                    return lineItems
                }),
                notes: discountReason
                    ? `Discount: ${discountReason}`
                    : undefined,
                sales_description: salesDescription || undefined,
                sales_labels: Object.entries(itemLabels).length > 0
                    ? Object.entries(itemLabels).map(([itemId, label]) => ({
                        itemId,
                        label,
                    }))
                    : undefined,
                client_type: cart.some((item) => item.type === "SERVICE")
                    ? clientType
                    : undefined,
                downpayment_type: downpaymentType || undefined,
                downpayment_amount: downpaymentType && downpaymentType !== 'PERCENTAGE' ? downpaymentAmount : undefined,
                downpayment_percentage_rate: downpaymentType === 'PERCENTAGE' ? downpaymentPercentageRate : undefined,
                downpayment_estimated_total: downpaymentType === 'PERCENTAGE' ? downpaymentEstimatedTotal : undefined,
                payroll_split_mode: downpaymentType ? payrollSplitMode : undefined,
            }

            const result = await createTransaction(payload)

            if (result.success) {
                if (result.data.payrollErrors && result.data.payrollErrors.length > 0) {
                    addNotification(
                        isPartialPayment
                            ? "Deposit recorded with commission warnings"
                            : "Transaction completed with commission warnings",
                        "WARNING",
                    )
                } else {
                    addNotification(
                        isPartialPayment
                            ? "Deposit recorded successfully!"
                            : "Transaction completed!",
                        "SUCCESS",
                    )
                }

                setCart([])
                setIsCheckoutModalOpen(false)
                setCashReceived("")
                setReferenceNumber("")
                setIsPartialPayment(false)
                setAmountToPay("")
                setSplitPayments([])
                setDownpaymentType(null)
                setDownpaymentAmount(0)
                setDownpaymentPercentageRate(0)
                setDownpaymentEstimatedTotal(0)
                setPayrollSplitMode('PER_PAYMENT')
                setSalesDescription('')
                setItemLabels({})
                fetchData()
            } else {
                addNotification(result.error || "Transaction failed", "ERROR")
            }
            return result
        } catch (error) {
            console.error("Checkout error:", error)
            addNotification("An unexpected error occurred", "ERROR")
        } finally {
            setProcessing(false)
        }
    }

    const executeVoid = async (txnId: string) => {
        if (!userInfo?.id) return

        try {
            const result = await voidTransaction({
                transaction_id: txnId,
                void_reason: "Manual void by staff",
                voided_by: userInfo.id,
            })

            if (result.success) {
                addNotification("Transaction voided", "SUCCESS")
                fetchData()
            } else {
                addNotification(result.error || "Void failed", "ERROR")
            }
        } catch {
            addNotification("Error voiding transaction", "ERROR")
        }
    }

    const handleVoid = (txnId: string) => {
        setConfirmModalConfig({
            title: "Void Transaction?",
            message:
                "Are you sure you want to void this transaction? This action cannot be undone.",
            onConfirm: () => executeVoid(txnId),
            variant: "danger",
        })
        setConfirmModalOpen(true)
    }

    const handleAddPayment = async () => {
        if (!selectedTransactionForPayment) return

        const amount = parseFloat(addPaymentAmount)
        if (isNaN(amount) || amount <= 0) {
            addNotification("Please enter a valid payment amount", "ERROR")
            return
        }

        if (addPaymentMethod !== "CASH" && !addPaymentReference.trim()) {
            addNotification("Please enter a reference number", "ERROR")
            return
        }

        setProcessing(true)

        try {
            const payload: AddTransactionPaymentPayload = {
                transaction_id: selectedTransactionForPayment.id,
                amount: amount,
                payment_method: addPaymentMethod,
                reference_number: addPaymentReference || undefined,
            }

            const result = await addTransactionPayment(payload)

            if (result.success) {
                addNotification("Payment added successfully", "SUCCESS")
                setIsAddPaymentModalOpen(false)
                setAddPaymentAmount("")
                setAddPaymentReference("")
                fetchData()
            } else {
                addNotification(
                    result.error || "Failed to add payment",
                    "ERROR",
                )
            }
        } catch {
            addNotification("Error adding payment", "ERROR")
        } finally {
            setProcessing(false)
        }
    }

    const value: SalesContextType = {
        inventory,
        services,
        transactions,
        todayStats,
        taxSettings,
        loading,
        searchQuery,
        setSearchQuery,
        cart,
        setCart,
        addToCart,
        removeFromCart,
        updateCustomPrice,
        updateLineTotal,
        updateQuantity,
        clearCart,
        grossTotal,
        taxAmount,
        netSubtotal,
        total,
        calculatedTotal,
        totalOverride,
        setTotalOverride,
        change,
        discountAmount,
        appliedDiscount,
        discountType,
        setDiscountType,
        setDiscountValue,
        setDiscountReason,
        setAppliedDiscount,
        isCheckoutModalOpen,
        setIsCheckoutModalOpen,
        paymentMethod,
        setPaymentMethod,
        cashReceived,
        setCashReceived,
        referenceNumber,
        setReferenceNumber,
        isPartialPayment,
        setIsPartialPayment,
        amountToPay,
        setAmountToPay,
        selectedTransactionForPayment,
        setSelectedTransactionForPayment,
        isAddPaymentModalOpen,
        setIsAddPaymentModalOpen,
        addPaymentAmount,
        setAddPaymentAmount,
        addPaymentMethod,
        setAddPaymentMethod,
        addPaymentReference,
        setAddPaymentReference,
        processing,
        isTransactionsOpen,
        setIsTransactionsOpen,
        clientType,
        setClientType,
        isDiscountModalOpen,
        setIsDiscountModalOpen,
        discountValue,
        discountReason,
        downpaymentType,
        setDownpaymentType,
        downpaymentAmount,
        setDownpaymentAmount,
        downpaymentPercentageRate,
        setDownpaymentPercentageRate,
        downpaymentEstimatedTotal,
        setDownpaymentEstimatedTotal,
        payrollSplitMode,
        setPayrollSplitMode,
        salesDescription,
        setSalesDescription,
        itemLabels,
        setItemLabels,
        setItemLabel,
        customerMode,
        setCustomerMode,
        walkinName,
        setWalkinName,
        walkinPhone,
        setWalkinPhone,
        walkinEmail,
        setWalkinEmail,
        staffList,
        selectedStaffId,
        setSelectedStaffId,
        splitPayments,
        setSplitPayments,
        txnPage,
        setTxnPage,
        txnPageSize,
        setTxnPageSize,
        txnHasMore,
        setTxnHasMore,
        txnLoading,
        setTxnLoading,
        txnTotal,
        refreshTransactions,
        handleCheckout,
        handleVoid,
        handleAddPayment,
        confirmModalOpen,
        setConfirmModalOpen,
        confirmModalConfig,
        setConfirmModalConfig,
        addNotification,
        userInfo,
    }

    return (
        <SalesContext.Provider value={value}>{children}</SalesContext.Provider>
    )
}
