import { Metadata } from 'next'
import { Building2, ConstructionIcon } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'

export const metadata: Metadata = {
    title: 'Branches | Amor Beauty Lounge',
    description: 'Manage studio branch locations',
}

export default function BranchesPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Branch Management"
                description="Manage studio locations"
            />
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-6">
                    <ConstructionIcon className="w-10 h-10 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Coming Soon</h2>
                <p className="text-muted-foreground max-w-md">
                    Branch management is currently under development. 
                    You&apos;ll be able to manage multiple studio locations, assign staff, 
                    and track per-branch analytics here.
                </p>
            </div>
        </div>
    )
}
