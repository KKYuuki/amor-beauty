'use client'

import { ShoppingCartIcon, SearchIcon, PackageIcon } from 'lucide-react'
import { motion } from 'motion/react'

interface EmptyStateProps {
    type: 'cart' | 'search' | 'transactions'
    action?: () => void
    actionLabel?: string
}

export function EmptyState({ type, action, actionLabel }: EmptyStateProps) {
    const configs = {
        cart: {
            icon: ShoppingCartIcon,
            title: 'Your cart is empty',
            message: 'Add products or services to get started',
        },
        search: {
            icon: SearchIcon,
            title: 'No results found',
            message: 'Try adjusting your search terms',
        },
        transactions: {
            icon: PackageIcon,
            title: 'No transactions yet',
            message: 'Transactions will appear here',
        },
    }

    const config = configs[type]
    const Icon = config.icon

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className='flex flex-col items-center justify-center p-8 text-center'
        >
            <div className='w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4'>
                <Icon className='w-8 h-8 text-muted-foreground/70' />
            </div>
            <h3 className='text-lg font-medium text-muted-foreground mb-2'>
                {config.title}
            </h3>
            <p className='text-sm text-muted-foreground/70 mb-4'>
                {config.message}
            </p>
            {action && actionLabel && (
                <button
                    onClick={action}
                    className='px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm font-medium transition-colors'
                >
                    {actionLabel}
                </button>
            )}
        </motion.div>
    )
}
