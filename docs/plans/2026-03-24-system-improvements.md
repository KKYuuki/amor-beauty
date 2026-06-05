# System Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement CSV import, fix branch system issues, improve appointments workflow, add branch support to sales/accounting/config, enhance time clock features, reorganize sidebar, and improve auth passkey UX.

**Architecture:** Multi-phase implementation with shared components for branch handling and CSV import. Uses existing BranchContext with enhancements, new CSV utilities, and session storage for branch persistence.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase, Tailwind CSS, Motion (Framer Motion)

---

## Overview

This plan addresses multiple interconnected improvements across the application. Each section is self-contained but shares common patterns and utilities.

### Phase Order

1. **Branch System Foundation** (Fix core issues first - affects all other features)
2. **CSV Import Infrastructure** (New feature foundation)
3. **Appointments Improvements** (Uses fixed branch system)
4. **Sales & Accounting** (Depends on branch fixes)
5. **Config Services** (Depends on branch fixes)
6. **Time Clock** (Independent feature)
7. **Sidebar Reorganization** (Quick win)
8. **Auth Improvements** (Independent feature)

---

## Phase 1: Branch System Foundation

### Task 1.1: Fix BranchContext Persistence

**Files:**
- Create: `utils/branch-storage.ts`
- Modify: `components/branch-context.tsx`

**Step 1: Create branch storage utility**

Create `utils/branch-storage.ts`:

```typescript
const BRANCH_SESSION_KEY = 'selected_branch_id'

export function getStoredBranchId(): string | null {
    if (typeof window === 'undefined') return null
    try {
        return sessionStorage.getItem(BRANCH_SESSION_KEY)
    } catch {
        return null
    }
}

export function setStoredBranchId(branchId: string | null): void {
    if (typeof window === 'undefined') return
    try {
        if (branchId) {
            sessionStorage.setItem(BRANCH_SESSION_KEY, branchId)
        } else {
            sessionStorage.removeItem(BRANCH_SESSION_KEY)
        }
    } catch {
        // Ignore storage errors
    }
}

export function clearStoredBranchId(): void {
    if (typeof window === 'undefined') return
    try {
        sessionStorage.removeItem(BRANCH_SESSION_KEY)
    } catch {
        // Ignore storage errors
    }
}
```

**Step 2: Update BranchContext to use session storage**

Modify `components/branch-context.tsx` to:
1. Import `getStoredBranchId` and `setStoredBranchId`
2. On mount, check for stored branch ID first
3. When `setCurrentBranch` is called, persist to session storage
4. Support `null` for "All Branches" selection

```typescript
// In BranchProvider, update useEffect for initial load:
useEffect(() => {
    const fetchBranches = async () => {
        try {
            setIsLoading(true)
            const response = await fetch("/api/branches")
            if (!response.ok) throw new Error("Failed to fetch branches")
            const data = await response.json()
            setBranches(data)
            
            // Check session storage first, then default to first branch
            const storedBranchId = getStoredBranchId()
            if (storedBranchId === 'all') {
                setCurrentBranch(null) // All Branches
            } else if (storedBranchId) {
                const storedBranch = data.find((b: Branch) => b.id === storedBranchId)
                if (storedBranch) {
                    setCurrentBranch(storedBranch)
                } else if (data.length > 0) {
                    setCurrentBranch(data[0])
                }
            } else if (data.length > 0) {
                setCurrentBranch(data[0])
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error")
        } finally {
            setIsLoading(false)
        }
    }
    fetchBranches()
}, [])

// Create a wrapper function for setting branch:
const handleSetBranch = useCallback((branch: Branch | null) => {
    setCurrentBranch(branch)
    setStoredBranchId(branch?.id ?? 'all')
}, [])
```

**Step 3: Verify tests**

Run: `bun run lint`
Expected: No new lint errors

**Step 4: Commit**

```bash
git add utils/branch-storage.ts components/branch-context.tsx
git commit -m "fix(branch): persist branch selection in session storage and support 'All Branches'"
```

---

### Task 1.2: Fix BranchSelector Component

**Files:**
- Modify: `components/branch-selector.tsx`

**Step 1: Fix "All Branches" selection behavior**

The current `BranchSelector` allows `showAllOption` but doesn't properly handle the `null` case for "All Branches". Fix the `handleBranchChange` function:

```typescript
const handleBranchChange = (branchId: string) => {
    if (branchId === "all") {
        setCurrentBranch(null)
        onBranchChange?.(null)
    } else {
        const branch = branches.find((b) => b.id === branchId)
        if (branch) {
            setCurrentBranch(branch)
            onBranchChange?.(branch.id)
        }
    }
}
```

**Step 2: Update the select value binding**

The select should show "All Branches" when `currentBranch` is `null`:

```typescript
<select
    value={currentBranch?.id ?? "all"}
    onChange={(e) => handleBranchChange(e.target.value)}
    // ... rest of props
>
```

**Step 3: Commit**

```bash
git add components/branch-selector.tsx
git commit -m "fix(branch-selector): properly handle 'All Branches' selection"
```

---

### Task 1.3: Add BranchSelectorInline to Forms

**Files:**
- Modify: `components/branch-selector.tsx`
- Create: `components/ui/branch-selector-inline.tsx`

**Step 1: Enhance BranchSelectorInline for form usage**

The existing `BranchSelectorInline` in `components/branch-selector.tsx` needs improvement. Create a dedicated form component:

```typescript
// In components/ui/branch-selector-inline.tsx
'use client'

import { useState, useEffect } from 'react'
import { useBranchContext } from '@/components/branch-context'
import { Building2Icon, ChevronDownIcon } from 'lucide-react'

interface BranchSelectorInlineProps {
    value: string | null | undefined
    onChange: (branchId: string | null) => void
    showAllOption?: boolean
    disabled?: boolean
    className?: string
    label?: string
}

export function BranchSelectorInline({
    value,
    onChange,
    showAllOption = true,
    disabled = false,
    className = '',
    label = 'Branch',
}: BranchSelectorInlineProps) {
    const { branches, isLoading } = useBranchContext()
    
    if (isLoading) {
        return (
            <div className={`flex flex-col gap-1 ${className}`}>
                {label && <label className='text-sm text-white/60'>{label}</label>}
                <div className='px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white/40'>
                    Loading...
                </div>
            </div>
        )
    }

    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            {label && <label className='text-sm text-white/60'>{label}</label>}
            <div className='relative'>
                <select
                    value={value ?? 'all'}
                    onChange={(e) => {
                        const newValue = e.target.value === 'all' ? null : e.target.value
                        onChange(newValue)
                    }}
                    disabled={disabled}
                    className='w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-white/30 disabled:opacity-50 appearance-none pr-8'
                >
                    {showAllOption && (
                        <option value='all'>All Branches (Shared)</option>
                    )}
                    {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                            {branch.name}
                        </option>
                    ))}
                </select>
                <ChevronDownIcon
                    size={16}
                    className='absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none'
                />
            </div>
        </div>
    )
}
```

**Step 2: Commit**

```bash
git add components/ui/branch-selector-inline.tsx
git commit -m "feat(ui): add BranchSelectorInline component for forms"
```

---

### Task 1.4: Fix Calendar Page Branch Filter

**Files:**
- Modify: `app/calendar/calendarPage.tsx`

**Step 1: Update branch filtering to support "All Branches"**

The calendar page needs to properly filter by branch when `currentBranch` is `null` (All Branches). Currently it filters but doesn't include the null case properly:

```typescript
// Update branchFilteredAppointments in calendarPage.tsx
const branchFilteredAppointments = useMemo(() => {
    // If no branch selected (All Branches), show all appointments
    if (!currentBranch) {
        return appointments
    }
    // Filter appointments: show appointments for current branch
    return appointments.filter(
        (ap) => ap.branch_id === currentBranch.id
    )
}, [appointments, currentBranch])
```

**Step 2: Remove unnecessary `|| ap.branch_id === null` logic**

Appointments without a branch should only show when "All Branches" is selected, not as a fallback:

```typescript
// Remove: || ap.branch_id === null
// The current code shows unassigned appointments for ANY selected branch, which is wrong
```

**Step 3: Commit**

```bash
git add app/calendar/calendarPage.tsx
git commit -m "fix(calendar): properly filter appointments by branch selection"
```

---

### Task 1.5: Fix Appointments Page Branch Filter

**Files:**
- Modify: `app/appointments/appointmentsPage.tsx`

**Step 1: Update branch filtering logic**

```typescript
// Update filteredAppointments in appointmentsPage.tsx
const filteredAppointments = useMemo(() => {
    let filtered = appointments

    // Filter by branch - only if a specific branch is selected
    if (currentBranch) {
        filtered = filtered.filter((a) => a.branch_id === currentBranch.id)
    }
    // If currentBranch is null (All Branches), show all appointments

    // Filter by status
    if (status !== "" && status !== "ALL") {
        filtered = filtered.filter((a) => a.status === status)
    }

    // Filter by search query
    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        filtered = filtered.filter((a) => {
            const clientName = a.is_walkin 
                ? (a.client_name || "")
                : (profilesMap.get(a.client_id || "")?.full_name || "")
            const staffName = profilesMap.get(a.staff_id || "")?.full_name || ""
            
            return (
                a.title.toLowerCase().includes(query) ||
                a.type?.toLowerCase().includes(query) ||
                clientName.toLowerCase().includes(query) ||
                staffName.toLowerCase().includes(query)
            )
        })
    }

    return filtered
}, [appointments, status, searchQuery, profilesMap, currentBranch])
```

**Step 2: Add branch column to appointments table**

Add branch display to the table:

```typescript
// In the table header, add:
<th className='text-left px-4 py-3 font-semibold text-sm text-white/80'>Branch</th>

// In the table row, add:
<td className='px-4 py-3'>
    {appointment.branch_name ? (
        <span className='text-white/80'>{appointment.branch_name}</span>
    ) : (
        <span className='text-white/40 italic'>Unassigned</span>
    )}
</td>
```

**Step 3: Update appointment type to include branch_name**

The `Appointment` type needs `branch_name` field. Check and update `utils/types/general.ts`:

```typescript
// Ensure Appointment interface includes:
branch_id?: string | null
branch_name?: string | null
```

**Step 4: Commit**

```bash
git add app/appointments/appointmentsPage.tsx utils/types/general.ts
git commit -m "fix(appointments): properly filter by branch and show branch in table"
```

---

## Phase 2: CSV Import Infrastructure

### Task 2.1: Create CSV Import Utilities

**Files:**
- Create: `utils/csv-import.ts`
- Create: `components/ui/csv-import-modal.tsx`

**Step 1: Create CSV parsing utility**

Create `utils/csv-import.ts`:

```typescript
export interface CSVImportResult<T> {
    success: boolean
    data?: T[]
    errors?: CSVRowError[]
    skippedRows?: number
}

export interface CSVRowError {
    row: number
    field: string
    message: string
}

export interface CSVColumn {
    key: string
    label: string
    required: boolean
    type: 'string' | 'number' | 'date' | 'boolean' | 'enum'
    enumValues?: string[]
    transform?: (value: string) => unknown
}

export function parseCSV<T extends Record<string, unknown>>(
    content: string,
    columns: CSVColumn[]
): CSVImportResult<T> {
    const lines = content.trim().split('\n')
    
    if (lines.length < 2) {
        return {
            success: false,
            errors: [{ row: 0, field: 'file', message: 'CSV file must have header and at least one data row' }]
        }
    }

    const headerLine = lines[0]
    const dataLines = lines.slice(1)
    
    // Parse header
    const headers = parseCSVLine(headerLine).map(h => h.trim().toLowerCase())
    
    // Validate required columns
    const missingColumns: string[] = []
    for (const col of columns) {
        if (col.required && !headers.includes(col.label.toLowerCase())) {
            missingColumns.push(col.label)
        }
    }
    
    if (missingColumns.length > 0) {
        return {
            success: false,
            errors: [{
                row: 0,
                field: 'header',
                message: `Missing required columns: ${missingColumns.join(', ')}`
            }]
        }
    }

    // Map column indices
    const columnIndices: Record<string, number> = {}
    for (const col of columns) {
        const index = headers.findIndex(h => h === col.label.toLowerCase())
        if (index !== -1) {
            columnIndices[col.key] = index
        }
    }

    const data: T[] = []
    const errors: CSVRowError[] = []
    let skippedRows = 0

    for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i]
        if (!line.trim()) {
            skippedRows++
            continue
        }

        const values = parseCSVLine(line)
        const row: Record<string, unknown> = {}
        let hasError = false

        for (const col of columns) {
            const index = columnIndices[col.key]
            if (index === undefined && col.required) {
                errors.push({
                    row: i + 2,
                    field: col.key,
                    message: `Missing required field: ${col.label}`
                })
                hasError = true
                continue
            }

            if (index === undefined) continue

            const rawValue = values[index]?.trim() ?? ''
            
            // Skip empty optional fields
            if (!rawValue && !col.required) {
                continue
            }

            // Validate required
            if (col.required && !rawValue) {
                errors.push({
                    row: i + 2,
                    field: col.key,
                    message: `${col.label} is required`
                })
                hasError = true
                continue
            }

            // Transform value
            try {
                row[col.key] = validateAndTransform(rawValue, col)
            } catch (err) {
                errors.push({
                    row: i + 2,
                    field: col.key,
                    message: `Invalid ${col.label}: ${err instanceof Error ? err.message : 'Unknown error'}`
                })
                hasError = true
            }
        }

        if (!hasError) {
            data.push(row as T)
        }
    }

    return {
        success: errors.length === 0,
        data,
        errors: errors.length > 0 ? errors : undefined,
        skippedRows
    }
}

function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i]
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"'
                i++
            } else {
                inQuotes = !inQuotes
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current)
            current = ''
        } else {
            current += char
        }
    }
    
    result.push(current)
    return result
}

function validateAndTransform(value: string, column: CSVColumn): unknown {
    switch (column.type) {
        case 'string':
            return column.transform ? column.transform(value) : value
            
        case 'number': {
            const num = parseFloat(value)
            if (isNaN(num)) throw new Error('Must be a number')
            return column.transform ? column.transform(value) : num
        }
            
        case 'date': {
            const date = new Date(value)
            if (isNaN(date.getTime())) throw new Error('Invalid date format')
            return column.transform ? column.transform(value) : date
        }
            
        case 'boolean': {
            const lower = value.toLowerCase()
            if (['true', 'yes', '1'].includes(lower)) return true
            if (['false', 'no', '0'].includes(lower)) return false
            throw new Error('Must be true/false, yes/no, or 1/0')
        }
            
        case 'enum': {
            if (!column.enumValues?.includes(value)) {
                throw new Error(`Must be one of: ${column.enumValues?.join(', ')}`)
            }
            return value
        }
        
        default:
            return value
    }
}

export function generateCSVTemplate(columns: CSVColumn[]): string {
    const header = columns.map(c => c.label).join(',')
    return header
}
```

**Step 2: Commit**

```bash
git add utils/csv-import.ts
git commit -m "feat(csv): add CSV parsing and validation utilities"
```

---

### Task 2.2: Create CSV Import Modal Component

**Files:**
- Create: `components/ui/csv-import-modal.tsx`

**Step 1: Create reusable modal component**

```typescript
'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { UploadIcon, FileIcon, XIcon, CheckIcon, AlertCircleIcon, DownloadIcon } from 'lucide-react'
import { CSVImportResult, CSVColumn, parseCSV, generateCSVTemplate } from '@/utils/csv-import'

interface CSVImportModalProps<T> {
    isOpen: boolean
    onClose: () => void
    onImport: (data: T[]) => Promise<void>
    columns: CSVColumn[]
    title: string
    description?: string
    entityName: string
}

export function CSVImportModal<T extends Record<string, unknown>>({
    isOpen,
    onClose,
    onImport,
    columns,
    title,
    description,
    entityName,
}: CSVImportModalProps<T>) {
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string[][]>([])
    const [result, setResult] = useState<CSVImportResult<T> | null>(null)
    const [importing, setImporting] = useState(false)
    const [dragActive, setDragActive] = useState(false)

    const handleFile = useCallback((file: File) => {
        if (!file.name.endsWith('.csv')) {
            setResult({
                success: false,
                errors: [{ row: 0, field: 'file', message: 'File must be a CSV' }]
            })
            return
        }

        setFile(file)
        const reader = new FileReader()
        reader.onload = (e) => {
            const content = e.target?.result as string
            const lines = content.trim().split('\n')
            const previewLines = lines.slice(0, 5).map(line => 
                line.split(',').map(cell => cell.replace(/^"|"$/g, '').trim())
            )
            setPreview(previewLines)
            
            const parsed = parseCSV<T>(content, columns)
            setResult(parsed)
        }
        reader.readAsText(file)
    }, [columns])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragActive(false)
        const droppedFile = e.dataTransfer.files[0]
        if (droppedFile) handleFile(droppedFile)
    }, [handleFile])

    const handleImport = async () => {
        if (!result?.success || !result.data) return
        
        setImporting(true)
        try {
            await onImport(result.data)
            handleClose()
        } catch (error) {
            setResult({
                success: false,
                errors: [{
                    row: 0,
                    field: 'import',
                    message: error instanceof Error ? error.message : 'Import failed'
                }]
            })
        } finally {
            setImporting(false)
        }
    }

    const handleClose = () => {
        setFile(null)
        setPreview([])
        setResult(null)
        setImporting(false)
        onClose()
    }

    const downloadTemplate = () => {
        const template = generateCSVTemplate(columns)
        const blob = new Blob([template], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${entityName.toLowerCase().replace(/\s+/g, '_')}_template.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4'
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className='bg-zinc-900 border border-white/10 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col'
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className='p-6 border-b border-white/10 flex justify-between items-center'>
                            <div>
                                <h2 className='text-xl font-bold'>{title}</h2>
                                {description && (
                                    <p className='text-sm text-white/60 mt-1'>{description}</p>
                                )}
                            </div>
                            <button
                                onClick={handleClose}
                                className='text-white/60 hover:text-white transition-colors'
                            >
                                <XIcon size={24} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className='p-6 flex-1 overflow-auto'>
                            {/* Template Download */}
                            <div className='mb-4'>
                                <button
                                    onClick={downloadTemplate}
                                    className='flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-md transition-colors'
                                >
                                    <DownloadIcon size={16} />
                                    Download CSV Template
                                </button>
                            </div>

                            {/* Drop Zone */}
                            <div
                                onDrop={handleDrop}
                                onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                                onDragLeave={() => setDragActive(false)}
                                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                                    dragActive
                                        ? 'border-blue-500 bg-blue-500/10'
                                        : 'border-white/20 hover:border-white/40'
                                }`}
                            >
                                <UploadIcon size={48} className='mx-auto mb-4 text-white/40' />
                                <p className='text-white/60 mb-2'>
                                    Drag and drop your CSV file here, or click to browse
                                </p>
                                <input
                                    type='file'
                                    accept='.csv'
                                    onChange={(e) => {
                                        const f = e.target.files?.[0]
                                        if (f) handleFile(f)
                                    }}
                                    className='hidden'
                                    id='csv-upload'
                                />
                                <label
                                    htmlFor='csv-upload'
                                    className='inline-block px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md cursor-pointer transition-colors'
                                >
                                    Browse Files
                                </label>
                            </div>

                            {/* Preview */}
                            {preview.length > 0 && (
                                <div className='mt-6'>
                                    <h3 className='text-sm font-semibold mb-2'>Preview (first 5 rows)</h3>
                                    <div className='overflow-auto max-h-48 bg-black/40 rounded-lg p-2'>
                                        <table className='min-w-full text-sm'>
                                            <thead>
                                                <tr className='text-white/40'>
                                                    {preview[0]?.map((_, i) => (
                                                        <th key={i} className='px-2 py-1 text-left'>Column {i + 1}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {preview.map((row, i) => (
                                                    <tr key={i} className='border-t border-white/5'>
                                                        {row.map((cell, j) => (
                                                            <td key={j} className='px-2 py-1 text-white/80'>{cell}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Errors */}
                            {result?.errors && result.errors.length > 0 && (
                                <div className='mt-6'>
                                    <h3 className='text-sm font-semibold mb-2 text-red-400'>Errors</h3>
                                    <div className='bg-red-500/10 border border-red-500/20 rounded-lg p-3 max-h-32 overflow-auto'>
                                        {result.errors.map((error, i) => (
                                            <p key={i} className='text-sm text-red-300'>
                                                Row {error.row}, {error.field}: {error.message}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Success Summary */}
                            {result?.success && result.data && (
                                <div className='mt-6 bg-green-500/10 border border-green-500/20 rounded-lg p-4'>
                                    <div className='flex items-center gap-2 text-green-400'>
                                        <CheckIcon size={20} />
                                        <span className='font-semibold'>
                                            Ready to import {result.data.length} {entityName.toLowerCase()}(s)
                                        </span>
                                    </div>
                                    {result.skippedRows && result.skippedRows > 0 && (
                                        <p className='text-sm text-white/60 mt-1'>
                                            {result.skippedRows} empty row(s) will be skipped
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className='p-6 border-t border-white/10 flex justify-end gap-3'>
                            <button
                                onClick={handleClose}
                                className='px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md transition-colors'
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={!result?.success || importing}
                                className='px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors font-medium flex items-center gap-2'
                            >
                                {importing ? (
                                    <>
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                            className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full'
                                        />
                                        Importing...
                                    </>
                                ) : (
                                    <>
                                        <CheckIcon size={16} />
                                        Import {result?.data?.length || 0} Items
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
```

**Step 2: Commit**

```bash
git add components/ui/csv-import-modal.tsx
git commit -m "feat(ui): add reusable CSV import modal component"
```

---

### Task 2.3: Add Inventory CSV Import

**Files:**
- Modify: `app/inventory/inventoryPage.tsx`
- Modify: `components/inventory/TransactionModal.tsx`
- Create: `server/actions/inventory-import.ts`

**Step 1: Create inventory import server action**

Create `server/actions/inventory-import.ts`:

```typescript
'use server'

import { createClient } from '@/utils/supabase/server'
import { InventoryItem } from '@/utils/types/inventory'
import { revalidatePath } from 'next/cache'

export interface InventoryImportRow {
    name: string
    item_code?: string
    description?: string
    item_category: string
    item_type: string
    unit_price?: number
    selling_price?: number
    current_stock?: number
    stock_warning_threshold?: number
    external_link?: string
}

export async function importInventoryItems(
    items: InventoryImportRow[],
    userId: string,
    branchId: string | null
): Promise<{ success: boolean; created: number; errors: string[] }> {
    const supabase = await createClient()
    const errors: string[] = []
    const created = 0

    // Check for duplicate item codes
    const itemCodes = items.filter(i => i.item_code).map(i => i.item_code as string)
    if (itemCodes.length > 0) {
        const { data: existing } = await supabase
            .from('inventory_items')
            .select('item_code')
            .in('item_code', itemCodes)
        
        if (existing && existing.length > 0) {
            const duplicateCodes = existing.map(e => e.item_code).join(', ')
            return {
                success: false,
                created: 0,
                errors: [`Duplicate item codes found: ${duplicateCodes}`]
            }
        }
    }

    // Validate categories exist
    const categories = [...new Set(items.map(i => i.item_category))]
    const { data: validCategories } = await supabase
        .from('inventory_categories')
        .select('name')
    
    const validCategoryNames = validCategories?.map(c => c.name) || []
    const invalidCategories = categories.filter(c => !validCategoryNames.includes(c))
    
    if (invalidCategories.length > 0) {
        return {
            success: false,
            created: 0,
            errors: [`Invalid categories: ${invalidCategories.join(', ')}. Valid categories: ${validCategoryNames.join(', ')}`]
        }
    }

    // Prepare items for insert
    const itemsToInsert = items.map(item => ({
        name: item.name,
        item_code: item.item_code || null,
        description: item.description || null,
        item_category: item.item_category,
        item_type: item.item_type.toUpperCase(),
        unit_price: item.unit_price || 0,
        selling_price: item.selling_price || 0,
        current_stock: item.current_stock || 0,
        stock_warning_threshold: item.stock_warning_threshold || 10,
        external_link: item.external_link || null,
        branch_id: branchId,
        is_shared: !branchId,
        created_by: userId,
        is_active: true,
    }))

    const { error } = await supabase
        .from('inventory_items')
        .insert(itemsToInsert)

    if (error) {
        return {
            success: false,
            created: 0,
            errors: [error.message]
        }
    }

    revalidatePath('/inventory')
    
    return {
        success: true,
        created: items.length,
        errors: []
    }
}
```

**Step 2: Add import button to inventory page**

In `app/inventory/inventoryPage.tsx`, add:

```typescript
// Add to imports:
import { CSVImportModal } from '@/components/ui/csv-import-modal'
import { CSVColumn } from '@/utils/csv-import'
import { importInventoryItems } from '@/server/actions/inventory-import'

// Add to component state:
const [showImportModal, setShowImportModal] = useState(false)

// Define CSV columns for inventory:
const inventoryCSVColumns: CSVColumn[] = [
    { key: 'name', label: 'Name', required: true, type: 'string' },
    { key: 'item_code', label: 'Item Code/SKU', required: false, type: 'string' },
    { key: 'description', label: 'Description', required: false, type: 'string' },
    { key: 'item_category', label: 'Category', required: true, type: 'string' },
    { key: 'item_type', label: 'Type (ITEM/FLUID)', required: true, type: 'enum', enumValues: ['ITEM', 'FLUID'] },
    { key: 'unit_price', label: 'Cost Price', required: false, type: 'number' },
    { key: 'selling_price', label: 'Selling Price', required: false, type: 'number' },
    { key: 'current_stock', label: 'Current Stock', required: false, type: 'number' },
    { key: 'stock_warning_threshold', label: 'Low Stock Threshold', required: false, type: 'number' },
    { key: 'external_link', label: 'External Link', required: false, type: 'string' },
]

// Add import handler:
const handleImport = async (items: InventoryImportRow[]) => {
    const result = await importInventoryItems(items, userId, currentBranch?.id ?? null)
    if (result.success) {
        addNotification(`Successfully imported ${result.created} items`, "SUCCESS")
        fetchData()
    } else {
        throw new Error(result.errors.join('. '))
    }
}

// Add import button in header (next to Add Item button):
<button
    onClick={() => setShowImportModal(true)}
    className='flex items-center gap-1.5 px-2 md:px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-md transition-colors border-2 border-purple-500/30 cursor-pointer'
>
    <UploadIcon className='w-4 h-4' />
    <span className='text-sm font-medium hidden sm:inline'>Import CSV</span>
</button>

// Add modal at the end of the return:
<CSVImportModal
    isOpen={showImportModal}
    onClose={() => setShowImportModal(false)}
    onImport={handleImport}
    columns={inventoryCSVColumns}
    title='Import Inventory Items'
    description='Upload a CSV file to import multiple inventory items at once. All items will be created as new records.'
    entityName='Inventory Item'
/>
```

**Step 3: Commit**

```bash
git add server/actions/inventory-import.ts app/inventory/inventoryPage.tsx
git commit -m "feat(inventory): add CSV import functionality"
```

---

### Task 2.4: Add Accounting CSV Import

**Files:**
- Modify: `app/accounting/accountingPage.tsx`
- Create: `server/actions/accounting-import.ts`

**Step 1: Create accounting import server action**

Create `server/actions/accounting-import.ts`:

```typescript
'use server'

import { createClient } from '@/utils/supabase/server'
import { LedgerEntryType } from '@/utils/types/ledger'
import { revalidatePath } from 'next/cache'

export interface AccountingImportRow {
    entry_date: string
    entry_type: string
    category?: string
    description: string
    reference?: string
    debit?: number
    credit?: number
}

export async function importAccountingEntries(
    entries: AccountingImportRow[],
    userId: string,
    branchId: string | null
): Promise<{ success: boolean; created: number; errors: string[] }> {
    const supabase = await createClient()
    const validTypes: LedgerEntryType[] = ['EXPENSE', 'REVENUE', 'ASSET', 'LIABILITY', 'EQUITY']
    const errors: string[] = []

    // Validate entry types
    for (const entry of entries) {
        if (!validTypes.includes(entry.entry_type.toUpperCase() as LedgerEntryType)) {
            errors.push(`Invalid entry type: ${entry.entry_type}. Must be one of: ${validTypes.join(', ')}`)
        }
    }

    if (errors.length > 0) {
        return { success: false, created: 0, errors }
    }

    // Prepare entries for insert
    const entriesToInsert = entries.map(entry => ({
        entry_date: new Date(entry.entry_date).toISOString().split('T')[0],
        entry_type: entry.entry_type.toUpperCase(),
        category: entry.category || null,
        description: entry.description,
        reference: entry.reference || null,
        debit: entry.debit || 0,
        credit: entry.credit || 0,
        branch_id: branchId,
        created_by: userId,
        is_voided: false,
    }))

    const { error } = await supabase
        .from('ledger_entries')
        .insert(entriesToInsert)

    if (error) {
        return {
            success: false,
            created: 0,
            errors: [error.message]
        }
    }

    revalidatePath('/accounting')
    
    return {
        success: true,
        created: entries.length,
        errors: []
    }
}
```

**Step 2: Add import to accounting page**

Similar pattern to inventory - add the import button, modal, and handler.

**Step 3: Commit**

```bash
git add server/actions/accounting-import.ts app/accounting/accountingPage.tsx
git commit -m "feat(accounting): add CSV import functionality"
```

---

## Phase 3: Appointments Improvements

### Task 3.1: Fix Appointment Validation on Update

**Files:**
- Modify: `server/actions/appointments.ts`
- Examine: `components/appointments/editAppointment.tsx`

**Step 1: Check and fix the updateAppointment server action**

The validation issue is likely in the server action. Check and fix:

```typescript
// In server/actions/appointments.ts, find updateAppointment and ensure:
// 1. All required fields are validated
// 2. Date validation (end > start)
// 3. Staff availability check
// 4. Branch exists if provided
```

**Step 2: Commit**

```bash
git add server/actions/appointments.ts
git commit -m "fix(appointments): improve validation on appointment update"
```

---

### Task 3.2: Fix Exit Animation in Appointments

**Files:**
- Modify: `app/appointments/appointmentsPage.tsx`

**Step 1: Change exit animation to simple opacity fade**

```typescript
// Find the AnimatePresence with exit animation and change:
<motion.tr
    key={appointment.id}
    layout
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}  // Simple opacity fade
    // Remove any other exit transitions
    onClick={() => router.push(`/appointments/${appointment.id}`)}
    className='border-t border-white/5 hover:bg-white/5 cursor-pointer transition-colors'
>
```

**Step 2: Update AnimatePresence mode**

```typescript
// Ensure AnimatePresence is configured correctly:
<AnimatePresence mode='popLayout'>
    {filteredAppointments.map((appointment) => (
        // ...
    ))}
</AnimatePresence>
```

**Step 3: Commit**

```bash
git add app/appointments/appointmentsPage.tsx
git commit -m "fix(appointments): simplify exit animation to opacity fade"
```

---

### Task 3.3: Add "Open in Sales" for Completed Appointments

**Files:**
- Modify: `app/appointments/appointmentDetailClient.tsx`
- Create: `server/actions/sales.ts` (if doesn't exist) or modify existing
- Create: `components/appointments/SalesConversionModal.tsx`

**Step 1: Create sales conversion server action**

In the appropriate server actions file:

```typescript
export async function createSalesRecordFromAppointment(
    appointmentId: string,
    userId: string,
    branchId: string | null
): Promise<ActionResponse<{ saleId: string }>> {
    const supabase = await createClient()
    
    // Get appointment with services and items
    const { data: appointment, error: apptError } = await supabase
        .from('appointments')
        .select(`
            *,
            appointment_services (
                service_id,
                quantity,
                services (id, title, price)
            ),
            appointment_items (
                inventory_id,
                quantity,
                inventory_items (id, name, selling_price)
            )
        `)
        .eq('id', appointmentId)
        .single()
    
    if (apptError || !appointment) {
        return { success: false, error: 'Appointment not found' }
    }
    
    // Create draft sale record
    const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
            appointment_id: appointmentId,
            branch_id: branchId,
            status: 'DRAFT',
            created_by: userId,
            total_amount: 0, // Will be calculated
        })
        .select('id')
        .single()
    
    if (saleError) {
        return { success: false, error: saleError.message }
    }
    
    // Add services as sale items
    const saleItems = []
    
    for (const service of appointment.appointment_services || []) {
        saleItems.push({
            sale_id: sale.id,
            item_type: 'SERVICE',
            item_id: service.service_id,
            item_name: service.services?.title,
            quantity: service.quantity || 1,
            unit_price: service.services?.price || 0,
        })
    }
    
    for (const item of appointment.appointment_items || []) {
        saleItems.push({
            sale_id: sale.id,
            item_type: 'INVENTORY',
            item_id: item.inventory_id,
            item_name: item.inventory_items?.name,
            quantity: item.quantity,
            unit_price: item.inventory_items?.selling_price || 0,
        })
    }
    
    if (saleItems.length > 0) {
        const { error: itemsError } = await supabase
            .from('sale_items')
            .insert(saleItems)
        
        if (itemsError) {
            // Rollback sale creation
            await supabase.from('sales').delete().eq('id', sale.id)
            return { success: false, error: itemsError.message }
        }
    }
    
    return { success: true, data: { saleId: sale.id } }
}
```

**Step 2: Add button in appointment detail client**

```typescript
// In appointmentDetailClient.tsx, add after completed status check:
{appointment.status === "COMPLETED" && isStaff && (
    <button
        onClick={handleCreateSale}
        disabled={creatingSale}
        className='px-3 py-1.5 bg-blue-400/20 hover:bg-blue-400/30 rounded-md border-2 border-white/5 font-semibold text-sm transition-colors flex items-center gap-2'
    >
        <ShoppingCartIcon size={16} />
        Open in Sales
    </button>
)}
```

**Step 3: Commit**

```bash
git add app/appointments/appointmentDetailClient.tsx server/actions/sales.ts components/appointments/SalesConversionModal.tsx
git commit -m "feat(appointments): add 'Open in Sales' option for completed appointments"
```

---

## Phase 4: Sales & Accounting Branch Support

### Task 4.1: Add Branch Selection to Sales

**Files:**
- Modify: `components/sales/context/SalesContext.tsx`
- Modify: `app/sales/salesPage.tsx`

**Step 1: Update SalesContext to use branch**

Add `branchId` to the context state and update context provider:

```typescript
// In SalesContext.tsx, add branch state
const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)

// Use BranchContext
const { currentBranch } = useBranchContext()

// Update branch when context changes
useEffect(() => {
    setSelectedBranchId(currentBranch?.id ?? null)
}, [currentBranch])
```

**Step 2: Pass branch to create/update operations**

**Step 3: Commit**

```bash
git add components/sales/context/SalesContext.tsx app/sales/salesPage.tsx
git commit -m "feat(sales): add branch selection support"
```

---

### Task 4.2: Add Branch Selection to Accounting Entry Modal

**Files:**
- Modify: `components/accounting/EntryModal.tsx`

**Step 1: Add branch selector to the modal**

```typescript
// Import:
import { useBranchContext } from '@/components/branch-context'
import { BranchSelectorInline } from '@/components/ui/branch-selector-inline'

// In component:
const { currentBranch } = useBranchContext()
const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)

// Initialize with current branch:
useEffect(() => {
    if (!entry) {
        setSelectedBranchId(currentBranch?.id ?? null)
    }
}, [entry, currentBranch])

// Add to form (after entry_type field):
<div>
    <label className='block text-sm font-medium mb-1'>Branch</label>
    <BranchSelectorInline
        value={selectedBranchId}
        onChange={(id) => setSelectedBranchId(id)}
        showAllOption={true}
    />
</div>

// Update submit handler to include branch_id
```

**Step 2: Update createLedgerEntry and updateLedgerEntry server actions to handle branch_id**

**Step 3: Commit**

```bash
git add components/accounting/EntryModal.tsx server/actions/accounting.ts
git commit -m "feat(accounting): add branch selection to entry modal"
```

---

## Phase 5: Config Services Branch Support

### Task 5.1: Add Branch Selection to Service Creation/Edit

**Files:**
- Modify: `app/config/configPage.tsx`
- Modify: `server/actions/services.ts`

**Step 1: Add branch_id to service form state**

```typescript
// In configPage.tsx:
const [serviceForm, setServiceForm] = useState({
    title: '',
    price: 0,
    items: [] as { inventory_id: string; quantity: number }[],
    branch_id: null as string | null,
})

// Add BranchSelectorInline in the form modal
```

**Step 2: Update server actions to handle branch**

**Step 3: Commit**

```bash
git add app/config/configPage.tsx server/actions/services.ts
git commit -m "feat(config): add branch selection to services"
```

---

## Phase 6: Time Clock Improvements

### Task 6.1: Create Personal Time Clock View

**Files:**
- Create: `app/my-time-clock/page.tsx`
- Modify: `utils/routes-config.ts`

**Step 1: Create personal time clock page**

Create `app/my-time-clock/page.tsx` - a simplified version of the existing time clock for regular staff to view their own entries.

**Step 2: Update routes config**

```typescript
// In utils/routes-config.ts, add to core routes:
{
    title: "My Time Clock",
    href: "/my-time-clock",
    perms: "",
    iconName: "ClockIcon",
    group: "core"
}
```

**Step 3: Update admin time clock for filtering**

In the manager's time clock calendar, add a filter to show specific user's entries.

**Step 4: Commit**

```bash
git add app/my-time-clock/page.tsx utils/routes-config.ts app/\(app\)/admin/time-clock/page.tsx
git commit -m "feat(time-clock): add personal time clock view for staff"
```

---

## Phase 7: Sidebar Reorganization

### Task 7.1: Move Time Clock Routes

**Files:**
- Modify: `utils/routes-config.ts`

**Step 1: Update route configuration**

```typescript
// In utils/routes-config.ts:
// Move "Time Clock" (admin) to management group:
{
    title: "Time Clock",
    href: "/admin/time-clock",
    perms: "time_clock_admin",
    iconName: "ClockIcon",
    group: "management"  // Changed from "admin"
}

// Already added in Phase 6:
{
    title: "My Time Clock",  // Core route
    href: "/my-time-clock",
    perms: "",
    iconName: "ClockIcon",
    group: "core"
}
```

**Step 2: Commit**

```bash
git add utils/routes-config.ts
git commit -m "refactor(sidebar): reorganize time clock routes"
```

---

## Phase 8: Auth Improvements

### Task 8.1: Improve Passkey UX

**Files:**
- Modify: `components/auth/SignIn.tsx`

**Step 1: Move passkey button below sign in form**

Restructure the auth form so passkey is a secondary option below the password form, not a tab.

**Step 2: Add conditional UI for passkey autofill**

Follow better-auth passkey plugin documentation:

```typescript
// In SignIn.tsx, add passkey autofill support:
const handlePasskeySignIn = async (autoFill: boolean = false) => {
    setError(null)
    setIsLoading(true)
    
    try {
        const result = await authClient.signIn.passkey({
            autoFill
        })
        // ... handle result
    } catch (err) {
        // ... error handling
    } finally {
        setIsLoading(false)
    }
}
```

**Step 3: Implement "Last sign in method" storage**

Store the last used method and show it prominently:

```typescript
// Add state:
const [lastSignInMethod, setLastSignInMethod] = useState<'password' | 'passkey' | null>(null)

// On mount, check localStorage:
useEffect(() => {
    const lastMethod = localStorage.getItem('lastSignInMethod')
    if (lastMethod === 'password' || lastMethod === 'passkey') {
        setLastSignInMethod(lastMethod)
        setAuthMethod(lastMethod)
    }
}, [])

// On successful sign in, store method:
const storeLastMethod = (method: 'password' | 'passkey') => {
    localStorage.setItem('lastSignInMethod', method)
}
```

**Step 4: Commit**

```bash
git add components/auth/SignIn.tsx
git commit -m "feat(auth): improve passkey UX with autofill and last method memory"
```

---

## Summary of Changes

### New Files
- `utils/branch-storage.ts` - Session storage utilities for branch persistence
- `utils/csv-import.ts` - CSV parsing and validation utilities
- `components/ui/csv-import-modal.tsx` - Reusable CSV import modal component
- `components/ui/branch-selector-inline.tsx` - Form-friendly branch selector
- `server/actions/inventory-import.ts` - Inventory CSV import server action
- `server/actions/accounting-import.ts` - Accounting CSV import server action
- `components/appointments/SalesConversionModal.tsx` - Modal for converting completed appointments to sales
- `app/my-time-clock/page.tsx` - Personal time clock view

### Modified Files
- `components/branch-context.tsx` - Session storage persistence
- `components/branch-selector.tsx` - Fix "All Branches" handling
- `app/calendar/calendarPage.tsx` - Fix branch filtering
- `app/appointments/appointmentsPage.tsx` - Fix branch filtering, add branch column, fix animation
- `app/appointments/appointmentDetailClient.tsx` - Add "Open in Sales" button
- `app/inventory/inventoryPage.tsx` - Add CSV import button
- `app/accounting/accountingPage.tsx` - Add CSV import, branch filter
- `components/accounting/EntryModal.tsx` - Add branch selection
- `app/sales/salesPage.tsx` - Add branch selection
- `components/sales/context/SalesContext.tsx` - Add branch context
- `app/config/configPage.tsx` - Add branch selection to services
- `server/actions/appointments.ts` - Fix validation
- `server/actions/sales.ts` - Add appointment conversion
- `server/actions/services.ts` - Add branch support
- `app/(app)/admin/time-clock/page.tsx` - Add user filter
- `utils/routes-config.ts` - Reorganize sidebar
- `components/auth/SignIn.tsx` - Improve passkey UX

---

## Testing Checklist

After implementation, test:
1. Branch selection persists across page reloads (same session)
2. "All Branches" shows all data correctly
3. CSV import works for inventory and accounting
4. CSV validation errors are clear
5. Appointment branch shows in table
6. Appointment update validation works
7. Completed appointment can create sales draft
8. Sales records include branch
9. Accounting entries include branch
10. Config services include branch
11. My Time Clock page shows personal entries
12. Manager time clock can filter by user
13. Sidebar shows correct sections
14. Passkey autofill works
15. Last sign-in method remembered