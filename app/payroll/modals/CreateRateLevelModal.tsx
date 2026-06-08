"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { XIcon } from "lucide-react"

interface CreateRateLevelModalProps {
    onClose: () => void
    onSave: (name: string) => Promise<void>
}

export function CreateRateLevelModal({ onClose, onSave }: CreateRateLevelModalProps) {
    const [name, setName] = useState("")
    const [loading, setLoading] = useState(false)

    const handleSave = async () => {
        setLoading(true)
        try {
            await onSave(name.trim())
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm'>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className='bg-card rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-border'
            >
                <div className='p-6 border-b border-border flex justify-between items-center'>
                    <h3 className='text-xl font-bold'>Create Rate Level</h3>
                    <button onClick={onClose} className='text-muted-foreground hover:text-foreground'>
                        <XIcon className='w-5 h-5' />
                    </button>
                </div>

                <div className='p-6 space-y-4'>
                    <div>
                        <label className='block text-sm font-medium mb-1'>Name</label>
                        <input
                            type='text'
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder='e.g. Standard, Senior, Owner'
                            className='w-full px-3 py-2 bg-card border border-border rounded-md focus:border-primary outline-none'
                        />
                    </div>

                    <div className='flex justify-end gap-3 pt-4'>
                        <button onClick={onClose} className='px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors'>Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={loading || !name.trim()}
                            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors font-medium'
                        >
                            {loading ? "Creating..." : "Create Level"}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
