'use client'

export function SkeletonRow({ count = 5 }: { count?: number }) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <tr key={i} className='border-b border-border'>
                    <td className='px-3 py-3'><div className='h-4 bg-card rounded w-16 animate-pulse' /></td>
                    <td className='px-3 py-3'><div className='h-4 bg-card rounded w-24 animate-pulse' /></td>
                    <td className='px-3 py-3'><div className='h-4 bg-card rounded w-12 animate-pulse' /></td>
                    <td className='px-3 py-3'><div className='h-4 bg-card rounded w-20 animate-pulse' /></td>
                    <td className='px-3 py-3'><div className='h-4 bg-card rounded w-16 animate-pulse' /></td>
                    <td className='px-3 py-3'><div className='h-4 bg-card rounded w-16 animate-pulse' /></td>
                    <td className='px-3 py-3'><div className='h-4 bg-card rounded w-20 animate-pulse' /></td>
                    <td className='px-3 py-3'><div className='h-4 bg-card rounded w-24 animate-pulse' /></td>
                </tr>
            ))}
        </>
    )
}
