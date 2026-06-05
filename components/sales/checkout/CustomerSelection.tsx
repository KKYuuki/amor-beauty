'use client'

export default function CustomerSelection({
    customerMode,
    setCustomerMode,
    walkinName,
    setWalkinName,
    walkinPhone,
    setWalkinPhone,
    walkinEmail,
    setWalkinEmail,
}: {
    customerMode: 'REGISTERED' | 'WALKIN'
    setCustomerMode: (mode: 'REGISTERED' | 'WALKIN') => void
    walkinName: string
    setWalkinName: (name: string) => void
    walkinPhone: string
    setWalkinPhone: (phone: string) => void
    walkinEmail: string
    setWalkinEmail: (email: string) => void
}) {
    return (
        <div className='bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 space-y-4'>
            <div className='flex gap-2'>
                <button
                    type='button'
                    onClick={() => setCustomerMode('WALKIN')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all border-2 ${
                        customerMode === 'WALKIN'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                            : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                >
                    Walk-in Customer
                </button>
                <button
                    type='button'
                    onClick={() => setCustomerMode('REGISTERED')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all border-2 ${
                        customerMode === 'REGISTERED'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                            : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                >
                    Personal
                </button>
            </div>

            {customerMode === 'WALKIN' && (
                <div className='space-y-3'>
                    <div>
                        <label htmlFor='walkinName' className='text-sm font-medium text-zinc-700 dark:text-zinc-300'>
                            Customer Name <span className='text-red-500'>*</span>
                        </label>
                        <input
                            id='walkinName'
                            type='text'
                            value={walkinName}
                            onChange={(e) => setWalkinName(e.target.value)}
                            placeholder='Enter customer name'
                            className='mt-1 w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        />
                    </div>

                    <div>
                        <label htmlFor='walkinPhone' className='text-sm font-medium text-zinc-700 dark:text-zinc-300'>
                            Phone Number
                        </label>
                        <input
                            id='walkinPhone'
                            type='text'
                            value={walkinPhone}
                            onChange={(e) => setWalkinPhone(e.target.value)}
                            placeholder='Enter phone number'
                            className='mt-1 w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        />
                    </div>

                    <div>
                        <label htmlFor='walkinEmail' className='text-sm font-medium text-zinc-700 dark:text-zinc-300'>
                            Email Address
                        </label>
                        <input
                            id='walkinEmail'
                            type='email'
                            value={walkinEmail}
                            onChange={(e) => setWalkinEmail(e.target.value)}
                            placeholder='Enter email address'
                            className='mt-1 w-full px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
