"use client"

import { ReactNode } from "react"
import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"

interface Breadcrumb {
    label: string
    href?: string
}

interface PageHeaderProps {
    title: string
    description?: string
    icon?: ReactNode
    actions?: ReactNode
    breadcrumbs?: Breadcrumb[]
    children?: ReactNode
}

export default function PageHeader({
    title,
    description,
    icon,
    actions,
    breadcrumbs,
    children
}: PageHeaderProps) {
    return (
        <div className='w-full'>
            {/* Breadcrumbs */}
            {breadcrumbs && breadcrumbs.length > 0 && (
                <nav className='mb-3'>
                    <ol className='flex flex-wrap items-center gap-1 text-sm text-white/60'>
                        {breadcrumbs.map((crumb, index) => (
                            <li
                                key={index}
                                className='flex items-center'
                            >
                                {index > 0 && (
                                    <ChevronRightIcon className='w-4 h-4 mx-1 text-white/40' />
                                )}
                                {crumb.href ? (
                                    <Link
                                        href={crumb.href}
                                        className='hover:text-white transition-colors'
                                    >
                                        {crumb.label}
                                    </Link>
                                ) : (
                                    <span
                                        className={
                                            index === breadcrumbs.length - 1
                                                ? "text-white"
                                                : ""
                                        }
                                    >
                                        {crumb.label}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ol>
                </nav>
            )}

            {/* Header Content */}
            <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                {/* Left Side: Title, Description, Icon */}
                <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-3'>
                        {icon && (
                            <span className='shrink-0 text-white/80'>
                                {icon}
                            </span>
                        )}
                        <h1 className='text-xl sm:text-2xl font-bold text-white truncate'>
                            {title}
                        </h1>
                        {children && (
                            <div className="ml-auto">
                                {children}
                            </div>
                        )}
                    </div>
                    {description && (
                        <p className='mt-1 text-sm text-white/60 sm:mt-2'>
                            {description}
                        </p>
                    )}
                </div>

                {/* Right Side: Actions */}
                {actions && (
                    <div className='grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center sm:shrink-0'>
                        {actions}
                    </div>
                )}
            </div>
        </div>
    )
}

export type { Breadcrumb, PageHeaderProps }
