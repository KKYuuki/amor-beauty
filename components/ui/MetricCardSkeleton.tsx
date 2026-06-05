import { Skeleton } from "@/components/ui/skeleton"

interface MetricCardSkeletonProps {
    count?: number
}

export function MetricCardSkeleton({ count = 1 }: MetricCardSkeletonProps) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className='bg-white/5 border-2 border-white/5 rounded-xl p-4 flex flex-col gap-2 select-none'
                >
                    <div className='flex justify-between items-start'>
                        <Skeleton className='h-4 w-24' />
                        <Skeleton className='h-5 w-5 rounded' />
                    </div>
                    <Skeleton className='h-8 w-32' />
                </div>
            ))}
        </>
    )
}
