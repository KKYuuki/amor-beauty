import { Metadata } from "next"
import { redirect } from "next/navigation"
import MetricsPageClient from "./metricsPage"
import { ChartAreaIcon } from "lucide-react"
import PageWrapper from "@/components/page-wrapper"
import { getCurrentUser, canViewMetrics } from "@/utils/auth/permissions"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Metrics",
    description: "Metrics Page",
}

export default async function MetricsPage() {
    const user = await getCurrentUser()
    if (!user || !(await canViewMetrics(user))) {
        redirect("/unauthorized")
    }
    return (
        <PageWrapper>
            <h1 className='text-2xl font-bold flex items-center gap-2'>
                <ChartAreaIcon className='w-6 h-6' />
                Metrics
            </h1>
            <MetricsPageClient />
        </PageWrapper>
    )
}
