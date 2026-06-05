import { getTransactionById } from "@/server/actions/transactions"
import { getCurrentUser, canAccessTransactions } from "@/utils/auth/permissions"
import { notFound } from "next/navigation"
import TransactionDetailClient from "../transactionDetailClient"

interface TransactionDetailPageProps {
    params: Promise<{ id: string }>
}

export default async function TransactionDetailPage({ params }: TransactionDetailPageProps) {
    const { id } = await params

    const [result, user] = await Promise.all([
        getTransactionById(id),
        getCurrentUser(),
    ])

    if (!result.success || !result.data) {
        notFound()
    }

    const { transaction, items, payments } = result.data
    const canManage = user ? await canAccessTransactions(user) : false

    return (
        <TransactionDetailClient
            transaction={transaction}
            items={items}
            payments={payments}
            canManage={canManage}
        />
    )
}