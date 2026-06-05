"use client"

import { useContext } from "react"
import { AnimatePresence } from "motion/react"
import { SideBarContext } from "@/components/sidebar"
import { useBranchContext } from "@/components/branch-context"
import {
    SalesProvider,
    useSales,
} from "@/components/sales/context/SalesContext"
import SalesHeader from "@/components/sales/layout/SalesHeader"
import ProductGrid from "@/components/sales/layout/ProductGrid"
import RecentTransactions from "@/components/sales/layout/RecentTransactions"
import CartPanel from "@/components/sales/layout/CartPanel"
import CheckoutModal from "@/components/sales/modals/CheckoutModal"
import AddPaymentModal from "@/components/sales/modals/AddPaymentModal"
import DiscountModal from "@/components/sales/modals/DiscountModal"
import ConfirmModal from "@/components/sales/modals/ConfirmModal"

function SalesContent() {
    const { branches } = useBranchContext()

    const { totalOverride, setTotalOverride, calculatedTotal, ...sales } =
        useSales()

    const filteredInventory = sales.inventory.filter(
        (item) =>
            item.name.toLowerCase().includes(sales.searchQuery.toLowerCase()) &&
            item.current_stock > 0,
    )

    const filteredServices = sales.services.filter((service) =>
        service.title.toLowerCase().includes(sales.searchQuery.toLowerCase()),
    )

    return (
        <AnimatePresence>
            <div
                key='sales-content'
                className='flex-1 w-full flex flex-col lg:flex-row overflow-hidden gap-4 z-0'
            >
                {/* LEFT SIDE: Product Selection */}
                <div className='flex-1 flex-col h-full overflow-hidden relative'>
                    <SalesHeader {...sales}>
                    </SalesHeader>
                    <ProductGrid
                        {...sales}
                        filteredInventory={filteredInventory}
                        filteredServices={filteredServices}
                    />
                    <RecentTransactions
                        {...sales}
                        branches={branches}
                        refreshTransactions={sales.refreshTransactions}
                    />
                </div>

                {/* RIGHT SIDE: Cart & Checkout */}
                <CartPanel
                    {...sales}
                    totalOverride={totalOverride}
                    setTotalOverride={setTotalOverride}
                    calculatedTotal={calculatedTotal}
                />
            </div>

            {/* Modals */}
            <CheckoutModal
                key='checkout-modal'
                {...sales}
                totalOverride={totalOverride}
                calculatedTotal={calculatedTotal}
                isOpen={sales.isCheckoutModalOpen}
                onClose={() => sales.setIsCheckoutModalOpen(false)}
            />
            <AddPaymentModal
                key='add-payment-modal'
                isOpen={sales.isAddPaymentModalOpen}
                onClose={() => sales.setIsAddPaymentModalOpen(false)}
                selectedTransaction={sales.selectedTransactionForPayment}
                paymentMethod={
                    sales.addPaymentMethod as Exclude<
                        typeof sales.addPaymentMethod,
                        "SPLIT"
                    >
                }
                setPaymentMethod={sales.setAddPaymentMethod}
                paymentAmount={sales.addPaymentAmount}
                setPaymentAmount={sales.setAddPaymentAmount}
                referenceNumber={sales.addPaymentReference}
                setReferenceNumber={sales.setAddPaymentReference}
                processing={sales.processing}
                onAddPayment={sales.handleAddPayment}
                taxSettings={sales.taxSettings}
            />
            <DiscountModal
                key='discount-modal'
                {...sales}
                isOpen={sales.isDiscountModalOpen}
                onClose={() => sales.setIsDiscountModalOpen(false)}
            />
            <ConfirmModal
                key='confirm-modal'
                isOpen={sales.confirmModalOpen}
                onClose={() => sales.setConfirmModalOpen(false)}
                onConfirm={sales.confirmModalConfig.onConfirm}
                title={sales.confirmModalConfig.title}
                message={sales.confirmModalConfig.message}
                confirmText='Confirm'
                cancelText='Cancel'
                variant={sales.confirmModalConfig.variant}
            />
        </AnimatePresence>
    )
}

// --- Components ---

export default function SalesPageClientComponent() {
    const { userInfo } = useContext(SideBarContext)

    return (
        <SalesProvider userInfo={userInfo}>
            <SalesContent />
        </SalesProvider>
    )
}
