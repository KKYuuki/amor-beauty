import { Skeleton } from "@/components/ui/skeleton"

interface ChartSkeletonProps {
    className?: string
}

export function ChartSkeleton({ className = "" }: ChartSkeletonProps) {
    return (
        <div className={`w-full h-60 sm:h-80 bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-2 ${className}`}>
            <Skeleton className='h-4 w-40' />
            <div className='flex-1 flex items-end gap-1'>
                {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton
                        key={i}
                        className='flex-1'
                        style={{ height: `${30 + Math.random() * 60}%` }}
                    />
                ))}
            </div>
        </div>
    )
}

interface PieChartSkeletonProps {
    className?: string
    showLegend?: boolean
}

export function PieChartSkeleton({ className = "", showLegend = true }: PieChartSkeletonProps) {
    return (
        <div className={`bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-2 ${className}`}>
            <Skeleton className='h-4 w-36' />
            <div className='flex-1 flex items-center justify-center'>
                <Skeleton className='w-28 h-28 sm:w-32 sm:h-32 rounded-full' />
            </div>
            {showLegend && (
                <div className='flex justify-center gap-4'>
                    <Skeleton className='h-3 w-16' />
                    <Skeleton className='h-3 w-16' />
                </div>
            )}
        </div>
    )
}

interface LeaderboardSkeletonProps {
    count?: number
}

export function LeaderboardSkeleton({ count = 3 }: LeaderboardSkeletonProps) {
    return (
        <div className='space-y-2'>
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className='bg-white/5 rounded-lg p-4 flex items-center justify-between'
                >
                    <div className='flex items-center gap-3'>
                        <Skeleton className='w-8 h-8 rounded-full' />
                        <Skeleton className='w-10 h-10 rounded-full' />
                        <div className='flex flex-col gap-1'>
                            <Skeleton className='h-4 w-24' />
                            <Skeleton className='h-3 w-16' />
                        </div>
                    </div>
                    <div className='flex flex-col items-end gap-1'>
                        <Skeleton className='h-5 w-20' />
                        <Skeleton className='h-3 w-24' />
                    </div>
                </div>
            ))}
        </div>
    )
}
