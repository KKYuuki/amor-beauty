'use client'

import { motion } from 'motion/react'

interface SkeletonCardProps {
    count?: number
}

export function SkeletonCard({ count = 8 }: SkeletonCardProps) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className='p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700'
                >
                    {/* Title placeholder */}
                    <div className='h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4 animate-pulse mb-2' />
                    {/* Price placeholder */}
                    <div className='h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-1/3 animate-pulse' />
                    {/* Stock badge placeholder (for inventory items) */}
                    <div className='flex justify-end mt-2'>
                        <div className='h-5 bg-zinc-200 dark:bg-zinc-700 rounded-full w-16 animate-pulse' />
                    </div>
                </motion.div>
            ))}
        </>
    )
}
