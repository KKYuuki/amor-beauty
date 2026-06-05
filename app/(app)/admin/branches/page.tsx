'use client'

import { useState, useEffect, useCallback } from 'react'
import { getAllBranches, createBranch, updateBranch, deleteBranch } from '@/server/actions/branches'
import { Branch, CreateBranchPayload, UpdateBranchPayload } from '@/utils/types/branch'
import { getCurrentUser, canManageBranches } from '@/utils/auth/permissions'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Pencil, Trash2, MapPin, Phone, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { BranchForm } from './branch-form'
import PageWrapper from '@/components/page-wrapper'

export default function BranchesAdminPage() {
    const [branches, setBranches] = useState<Branch[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [canManage, setCanManage] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
    const router = useRouter()

    const checkAccess = useCallback(async () => {
        const user = await getCurrentUser()
        if (!user) {
            router.push('/auth/login')
            return
        }
        const manageAccess = await canManageBranches(user)
        setCanManage(manageAccess)
        await fetchBranches()
    }, [router])

    useEffect(() => {
        checkAccess()
    }, [checkAccess])

    const fetchBranches = async () => {
        setLoading(true)
        try {
            const result = await getAllBranches()
            if (!result.success) {
                setError(result.error)
            } else {
                setBranches(result.data)
            }
        } catch (_err) {
            setError('Failed to load branches')
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = async (payload: { name: string; code: string; city: string; address?: string | null; phone?: string | null }) => {
        const result = await createBranch(payload as CreateBranchPayload)
        if (!result.success) {
            setError(result.error)
            return false
        }
        setBranches([...branches, result.data])
        setShowForm(false)
        return true
    }

    const handleUpdate = async (payload: { name: string; code: string; city: string; address?: string | null; phone?: string | null }) => {
        if (!editingBranch) return false
        const updatePayload: UpdateBranchPayload = {
            id: editingBranch.id,
            name: payload.name,
            code: payload.code,
            city: payload.city,
            address: payload.address,
            phone: payload.phone
        }
        const result = await updateBranch(editingBranch.id, updatePayload)
        if (!result.success) {
            setError(result.error)
            return false
        }
        setBranches(branches.map(b => b.id === result.data.id ? result.data : b))
        setEditingBranch(null)
        return true
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Deactivate this branch?')) return
        const result = await deleteBranch(id)
        if (!result.success) {
            setError(result.error)
            return
        }
        setBranches(branches.map(b => b.id === id ? { ...b, is_active: false } : b))
    }

    if (loading) {
        return (
            <PageWrapper>
                <div className="flex items-center justify-center h-full">
                    <RefreshCw className="w-8 h-8 animate-spin text-white/60" />
                </div>
            </PageWrapper>
        )
    }

    return (
        <PageWrapper>
            {/* Header */}
            <div className='flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                    <div className='p-2 bg-blue-500/20 rounded-lg'>
                        <Building2 className='w-6 h-6 text-blue-400' />
                    </div>
                    <div>
                        <h1 className='text-2xl font-bold'>Branch Management</h1>
                        <p className='text-white/60 text-sm'>Manage studio locations</p>
                    </div>
                </div>
                <div className='flex items-center gap-2'>
                    <button
                        onClick={fetchBranches}
                        disabled={loading}
                        className='p-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'
                        title='Refresh'
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {canManage && (
                        <button
                            onClick={() => setShowForm(true)}
                            className='flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors font-medium'
                        >
                            <Plus className='w-4 h-4' />
                            Add Branch
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className='p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400'>
                    {error}
                </div>
            )}

            {!canManage && (
                <div className='p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400'>
                    Read-only access. Contact an administrator to manage branches.
                </div>
            )}

            {/* Branch Cards */}
            <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
                <AnimatePresence>
                    {branches.map((branch) => (
                        <motion.div
                            key={branch.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className={`p-4 rounded-lg border-2 ${branch.is_active ? 'bg-white/5 border-white/10' : 'bg-white/2 border-white/5 opacity-60'}`}
                        >
                            <div className='flex items-start justify-between mb-3'>
                                <div>
                                    <h3 className='font-semibold text-lg'>{branch.name}</h3>
                                    <span className='text-sm text-white/40'>{branch.code}</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-xs ${branch.is_active ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                    {branch.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>

                            {branch.address && (
                                <div className='flex items-start gap-2 mb-2 text-sm text-white/60'>
                                    <MapPin className='w-4 h-4 shrink-0 mt-0.5' />
                                    <span>{branch.address}</span>
                                </div>
                            )}

                            {branch.city && (
                                <p className='text-sm text-white/40 mb-2'>{branch.city}</p>
                            )}

                            {branch.phone && (
                                <div className='flex items-center gap-2 mb-2 text-sm text-white/60'>
                                    <Phone className='w-4 h-4' />
                                    <span>{branch.phone}</span>
                                </div>
                            )}

                            <div className='flex items-center gap-2 mt-4 pt-4 border-t border-white/10'>
                                {canManage && (
                                    <>
                                        <button
                                            onClick={() => setEditingBranch(branch)}
                                            className='flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md transition-colors text-sm'
                                        >
                                            <Pencil className='w-3.5 h-3.5' />
                                            Edit
                                        </button>
                                        {branch.is_active && (
                                            <button
                                                onClick={() => handleDelete(branch.id)}
                                                className='flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-md transition-colors text-sm'
                                            >
                                                <Trash2 className='w-3.5 h-3.5' />
                                                Deactivate
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {branches.length === 0 && !loading && (
                <div className='text-center py-12 text-white/60'>
                    <Building2 className='w-12 h-12 mx-auto mb-4 opacity-30' />
                    <p>No branches found</p>
                    {canManage && (
                        <button
                            onClick={() => setShowForm(true)}
                            className='mt-4 text-blue-400 hover:text-blue-300'
                        >
                            Create your first branch
                        </button>
                    )}
                </div>
            )}

            {/* Form Modals */}
            <AnimatePresence>
                {showForm && (
                    <BranchForm
                        onSubmit={handleCreate}
                        onClose={() => setShowForm(false)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {editingBranch && (
                    <BranchForm
                        branch={editingBranch}
                        onSubmit={handleUpdate}
                        onClose={() => setEditingBranch(null)}
                    />
                )}
            </AnimatePresence>
        </PageWrapper>
    )
}
