"use client"
import BusinessInsights from "@/components/metrics/businessInsights"
import ExecutiveAccounting from "@/components/metrics/ExecutiveAccounting"

import MetricsExportModal from "@/components/metrics/MetricsExportModal"
import {
    BarChart3Icon,
    BriefcaseIcon,
    DownloadIcon,
} from "lucide-react"
import { useState, useEffect } from "react"
import { getSetting } from "@/server/actions/settings"
import { exportGroupedMetrics } from "@/server/actions/metrics"
import { getDateRangeFromPreset } from "@/utils/date-utils"

const currentBranch: any = null;

export default function MetricsPageClient() {
    const [activeTab, setActiveTab] = useState<
        "insights" | "accounting"
    >("insights")
    const [showExportModal, setShowExportModal] = useState(false)
    
    const [currencySymbol, setCurrencySymbol] = useState("₱")

    useEffect(() => {
        getSetting("currency_tax").then(res => {
            if (res.success && res.data) {
                setCurrencySymbol(res.data.currency_symbol)
            }
        })
    }, [])

    return (
        <div className='flex flex-col gap-4'>
            {/* Tabs */}
            <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 border-b-2 border-border pb-2'>
                <div className='flex flex-row items-center gap-2'>
                    <button
                        onClick={() => setActiveTab("insights")}
                        className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
                            activeTab === "insights"
                                ? "bg-card text-foreground"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                        <BarChart3Icon size={18} />
                        Insights
                    </button>
                    <button
                        onClick={() => setActiveTab("accounting")}
                        className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
                            activeTab === "accounting"
                                ? "bg-card text-foreground"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                        <BriefcaseIcon size={18} />
                        Accounting
                    </button>
                </div>

                <div className='sm:ml-auto flex items-center gap-2'>
                    <button
                        onClick={() => setShowExportModal(true)}
                        className='flex items-center gap-2 px-3 py-2 bg-card hover:bg-muted rounded-lg transition-colors text-sm'
                    >
                        <DownloadIcon size={16} />
                        Export
                    </button>
                </div>
            </div>

            {/* Content */}
            {activeTab === "insights" && <BusinessInsights branchId={currentBranch?.id} currencySymbol={currencySymbol} />}
            {activeTab === "accounting" && <ExecutiveAccounting branchId={currentBranch?.id} currencySymbol={currencySymbol} />}

            <MetricsExportModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                onExport={async (config) => {
                    const dateRange = config.datePreset === "custom"
                        ? { start: config.startDate!, end: config.endDate! }
                        : getDateRangeFromPreset(config.datePreset)

                    if (!dateRange) {
                        throw new Error("Invalid date range")
                    }

                    const result = await exportGroupedMetrics({
                        format: config.format,
                        grouping: {
                            dimensions: ["branch"] as const,
                            includeSummary: config.includeSummarySheet,
                            includeCharts: config.includeCharts,
                        },
                        startDate: dateRange.start.toISOString(),
                        endDate: dateRange.end.toISOString(),
                        branchId: currentBranch?.id || undefined,
                    })

                    if (!result.success) {
                        throw new Error(result.error || "Export failed")
                    }
                }}
            />
        </div>
    )
}
