import { Skeleton } from "@/components/ui/skeleton"
import { MetricCardSkeleton } from "@/components/ui/MetricCardSkeleton"
import { ChartSkeleton, PieChartSkeleton } from "@/components/ui/ChartSkeleton"

export function ExecutiveAccountingSkeleton() {
    return (
        <div className='w-full flex flex-col gap-6 pb-10'>
            <div className='flex flex-col gap-4'>
                <div className='flex items-center justify-between flex-wrap gap-4'>
                    <div className='flex gap-2 p-1 bg-white/5 w-fit rounded-lg border border-white/5'>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className='h-8 w-20 rounded-md' />
                        ))}
                    </div>
                    <div className='flex flex-col gap-1 items-end'>
                        <Skeleton className='h-3 w-24' />
                        <Skeleton className='h-4 w-36' />
                    </div>
                </div>
            </div>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-48' />
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
                    <MetricCardSkeleton count={4} />
                </div>
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-56' />
                <ChartSkeleton />
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-44' />
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                    <PieChartSkeleton showLegend={false} />
                    <div className='bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-4'>
                        <Skeleton className='h-4 w-32' />
                        <div className='space-y-3'>
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className='flex items-center justify-between p-3 bg-white/5 rounded-lg'>
                                    <div className='flex items-center gap-3'>
                                        <Skeleton className='w-3 h-3 rounded-full' />
                                        <Skeleton className='h-4 w-20' />
                                    </div>
                                    <div className='text-right flex flex-col gap-1 items-end'>
                                        <Skeleton className='h-4 w-20' />
                                        <Skeleton className='h-3 w-10' />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-40' />
                <ChartSkeleton />
            </section>
        </div>
    )
}
