import { Skeleton } from "@/components/ui/skeleton"
import { MetricCardSkeleton } from "@/components/ui/MetricCardSkeleton"
import { ChartSkeleton, PieChartSkeleton, LeaderboardSkeleton } from "@/components/ui/ChartSkeleton"

export function BusinessInsightsSkeleton() {
    return (
        <div className='w-full flex flex-col gap-6 pb-10'>
            <div className='flex flex-row justify-between items-center'>
                <Skeleton className='h-8 w-48' />
                <Skeleton className='h-9 w-24 rounded-md' />
            </div>

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
                <Skeleton className='h-6 w-52' />
                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'>
                    <MetricCardSkeleton count={3} />
                </div>
                <ChartSkeleton />
                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'>
                    <MetricCardSkeleton count={3} />
                </div>
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-36' />
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div className='grid grid-cols-2 gap-4'>
                        <MetricCardSkeleton count={2} />
                    </div>
                    <PieChartSkeleton />
                </div>
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-56' />
                <LeaderboardSkeleton count={3} />
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-40' />
                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'>
                    <MetricCardSkeleton count={3} />
                </div>
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-44' />
                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4'>
                    <MetricCardSkeleton count={4} />
                </div>
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-40' />
                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4'>
                    <MetricCardSkeleton count={4} />
                </div>
                <ChartSkeleton />
            </section>

            <section className='flex flex-col gap-4'>
                <Skeleton className='h-6 w-40' />
                <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                    <MetricCardSkeleton count={1} />
                    <div className='lg:col-span-2 bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-4'>
                        <Skeleton className='h-4 w-44' />
                        <Skeleton className='h-8 w-full' />
                        <Skeleton className='h-8 w-full' />
                    </div>
                </div>
            </section>
        </div>
    )
}
