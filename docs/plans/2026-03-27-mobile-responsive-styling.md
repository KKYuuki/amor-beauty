# Mobile Responsive Styling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all mobile overflow and styling issues across the entire application by creating a reusable mobile-first responsive component system and systematically updating all pages.

**Architecture:** Create reusable responsive components (ResponsiveTable, MobileCard, ActionButtons, PageHeader) that automatically adapt between desktop and mobile layouts. Each component will use Tailwind's responsive prefixes and container queries. Pages will be updated to use these components, and we'll establish mobile-first design patterns throughout the app.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Motion (Framer Motion)

## Overview

This plan addresses mobile responsiveness issues across all pages in the Inksight RDMD application. We'll create a consistent design system with reusable components, then systematically update each page to ensure proper mobile layout without horizontal overflow.

### Key Issues Identified

1. **Tables with fixed minimum widths** cause horizontal overflow (e.g., `min-w-[800px]`)
2. **Fixed grid layouts** without mobile breakpoints (`grid-cols-2`, `grid-cols-3`)
3. **Action button groups** not wrapping properly on mobile
4. **Filter controls** horizontally cramped on small screens
5. **Stat cards** with too many columns on mobile (`grid-cols-3`)
6. **Header sections** with poor mobile spacing

### Solution Approach

1. Create reusable responsive components
2. Establish mobile-first design patterns
3. Update all pages systematically
4. Add proper touch targets and spacing
5. Test across breakpoints (sm: 640px, md: 768px, lg: 1024px, xl: 1280px)

---

## Task 1: Create ResponsiveTable Component

**Files:**
- Create: `components/ui/ResponsiveTable.tsx`
- Create: `components/ui/MobileCard.tsx`

**Description:**
Create a table component that automatically converts to card view on mobile screens. This prevents horizontal overflow while maintaining data accessibility.

**Step 1: Analyze current table patterns**

Examine existing tables to identify common patterns:
- Appointments table (appointmentsPage.tsx:246)
- Inventory table (InventoryTable.tsx)
- Transactions page
- Calendar grid

Key patterns:
- Header with column names
- Row data with multiple cells
- Action buttons in rows
- Status badges and tags

**Step 2: Design component API**

```typescript
interface ResponsiveTableProps {
  columns: Array<{
    key: string
    header: string
    mobileCard?: {
      label: string
      priority?: 'primary' | 'secondary' | 'tertiary'
      render?: (value: any, row: any) => ReactNode
    }
    hideOnMobile?: boolean
  }>
  data: any[]
  onRowClick?: (row: any) => void
  emptyMessage?: string
  loading?: boolean
  mobileCardClassName?: string
}
```

**Step 3: Create ResponsiveTable component**

```typescript
// components/ui/ResponsiveTable.tsx
"use client"

import { ReactNode } from "react"
import MobileCard from "./MobileCard"
import { LoaderCircleIcon } from "lucide-react"

interface Column {
  key: string
  header: string
  mobileCard?: {
    label: string
    priority?: 'primary' | 'secondary' | 'tertiary'
    render?: (value: any, row: any) => ReactNode
  }
  hideOnMobile?: boolean
}

interface ResponsiveTableProps {
  columns: Column[]
  data: any[]
  onRowClick?: (row: any) => void
  emptyMessage?: string
  loading?: boolean
  mobileCardClassName?: string
  desktopMinWidth?: string
}

export default function ResponsiveTable({
  columns,
  data,
  onRowClick,
  emptyMessage = "No data available",
  loading = false,
  mobileCardClassName = "",
  desktopMinWidth = "800px"
}: ResponsiveTableProps) {
  if (loading) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <LoaderCircleIcon className="animate-spin" size={32} />
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center text-white/60">
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <>
      {/* Desktop view - hidden on mobile */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full" style={{ minWidth: desktopMinWidth }}>
          <thead className="bg-white/5 sticky top-0">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-left px-4 py-3 font-semibold text-sm text-white/80"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr
                key={row.id || idx}
                onClick={() => onRowClick?.(row)}
                className={`
                  border-t border-white/5 
                  ${onRowClick ? 'hover:bg-white/5 cursor-pointer' : ''}
                  transition-colors
                `}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    {col.mobileCard?.render
                      ? col.mobileCard.render(row[col.key], row)
                      : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile view - hidden on desktop */}
      <div className="md:hidden flex flex-col gap-3">
        {data.map((row, idx) => (
          <MobileCard
            key={row.id || idx}
            columns={columns}
            data={row}
            onClick={() => onRowClick?.(row)}
            className={mobileCardClassName}
          />
        ))}
      </div>
    </>
  )
}
```

**Step 4: Create MobileCard component**

```typescript
// components/ui/MobileCard.tsx
"use client"

import { ReactNode } from "react"
import { motion } from "motion/react"

interface MobileCardProps {
  columns: any[]
  data: any
  onClick?: () => void
  className?: string
}

export default function MobileCard({
  columns,
  data,
  onClick,
  className = ""
}: MobileCardProps) {
  const primaryFields = columns.filter(
    (col) => col.mobileCard?.priority === 'primary' || !col.mobileCard?.priority
  )
  const secondaryFields = columns.filter(
    (col) => col.mobileCard?.priority === 'secondary'
  )
  const tertiaryFields = columns.filter(
    (col) => col.mobileCard?.priority === 'tertiary'
  )

  const renderField = (col: any) => {
    const value = data[col.key]
    const rendered = col.mobileCard?.render?.(value, data) ?? value
    
    return (
      <div key={col.key} className="flex flex-col gap-1">
        <span className="text-xs text-white/60 font-medium">
          {col.mobileCard?.label || col.header}
        </span>
        <span className="text-sm font-medium">{rendered}</span>
      </div>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClick}
      className={`
        bg-white/5 
        border 
        border-white/10 
        rounded-lg 
        p-4 
        ${onClick ? 'cursor-pointer hover:bg-white/10 active:bg-white/15' : ''}
        transition-colors
        ${className}
      `}
    >
      {/* Primary fields - always visible */}
      <div className="flex flex-col gap-3 mb-3">
        {primaryFields.filter(col => !col.hideOnMobile).map(renderField)}
      </div>

      {/* Secondary fields - smaller text */}
      {secondaryFields.length > 0 && (
        <div className="flex flex-wrap gap-3 pt-3 border-t border-white/10">
          {secondaryFields.filter(col => !col.hideOnMobile).map(renderField)}
        </div>
      )}

      {/* Tertiary fields - metadata */}
      {tertiaryFields.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-3 mt-3 border-t border-white/5">
          {tertiaryFields.filter(col => !col.hideOnMobile).map(renderField)}
        </div>
      )}
    </motion.div>
  )
}
```

**Step 5: Commit responsive table components**

```bash
git add components/ui/ResponsiveTable.tsx components/ui/MobileCard.tsx
git commit -m "feat: add ResponsiveTable and MobileCard components for mobile-friendly data display"
```

---

## Task 2: Create ActionButtons Component

**Files:**
- Create: `components/ui/ActionButtons.tsx`

**Description:**
Create a component that automatically wraps action buttons on mobile while keeping them inline on desktop. This prevents overflow in header sections.

**Step 1: Design component API**

```typescript
interface ActionButtonsProps {
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  gap?: 'sm' | 'md' | 'lg'
  className?: string
}
```

**Step 2: Implement ActionButtons**

```typescript
// components/ui/ActionButtons.tsx
"use client"

import { ReactNode } from "react"

interface ActionButtonsProps {
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  gap?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function ActionButtons({
  children,
  align = 'end',
  gap = 'md',
  className = ''
}: ActionButtonsProps) {
  const alignClass = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end'
  }[align]

  const gapClass = {
    sm: 'gap-2',
    md: 'gap-3',
    lg: 'gap-4'
  }[gap]

  return (
    <div className={`
      flex 
      flex-col 
      sm:flex-row
      flex-wrap
      ${alignClass}
      ${gapClass}
      ${className}
    `}>
      {children}
    </div>
  )
}
```

**Step 3: Commit ActionButtons component**

```bash
git add components/ui/ActionButtons.tsx
git commit -m "feat: add ActionButtons component for responsive button layouts"
```

---

## Task 3: Create PageHeader Component

**Files:**
- Create: `components/ui/PageHeader.tsx`

**Description:**
Standardize page header layouts across the application with proper mobile spacing and flexibility.

**Step 1: Design component API**

```typescript
interface PageHeaderProps {
  title: string
  description?: string
  icon?: ReactNode
  actions?: ReactNode
  breadcrumbs?: Array<{ label: string; href?: string }>
}
```

**Step 2: Implement PageHeader**

```typescript
// components/ui/PageHeader.tsx
"use client"

import { ReactNode } from "react"
import Link from "next/link"

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
}

export default function PageHeader({
  title,
  description,
  icon,
  actions,
  breadcrumbs
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 mb-4">
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-white/60">
          {breadcrumbs.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-2">
              {idx > 0 && <span>/</span>}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="hover:text-white transition-colors"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            {icon}
            {title}
          </h1>
          {description && (
            <p className="text-sm text-white/60">{description}</p>
          )}
        </div>

        {/* Actions - wraps on mobile */}
        {actions && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 3: Commit PageHeader component**

```bash
git add components/ui/PageHeader.tsx
git commit -m "feat: add PageHeader component for consistent page headers"
```

---

## Task 4: Create FilterBar Component

**Files:**
- Create: `components/ui/FilterBar.tsx`

**Description:**
Create a responsive filter bar that collapses or reorganizes on mobile to prevent horizontal overflow.

**Step 1: Design component API**

```typescript
interface FilterBarProps {
  children: ReactNode
  className?: string
}
```

**Step 2: Implement FilterBar**

```typescript
// components/ui/FilterBar.tsx
"use client"

import { ReactNode } from "react"

interface FilterBarProps {
  children: ReactNode
  className?: string
}

export default function FilterBar({ children, className = "" }: FilterBarProps) {
  return (
    <div className={`
      flex 
      flex-col 
      sm:flex-row 
      flex-wrap 
      gap-3 
      items-stretch 
      sm:items-center
      ${className}
    `}>
      {children}
    </div>
  )
}
```

**Step 3: Commit FilterBar component**

```bash
git add components/ui/FilterBar.tsx
git commit -m "feat: add FilterBar component for responsive filter controls"
```

---

## Task 5: Create StatsGrid Component

**Files:**
- Create: `components/ui/StatsGrid.tsx`
- Create: `components/ui/StatCard.tsx`

**Description:**
Create a stats grid component that adapts columns based on screen size.

**Step 1: Design component API**

```typescript
interface StatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  color?: 'default' | 'success' | 'warning' | 'danger'
}

interface StatsGridProps {
  children: ReactNode
  columns?: {
    mobile?: 1 | 2
    tablet?: 2 | 3 | 4
    desktop?: 3 | 4 | 5 | 6
  }
}
```

**Step 2: Implement StatCard**

```typescript
// components/ui/StatCard.tsx
"use client"

import { ReactNode } from "react"

interface StatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  color?: 'default' | 'success' | 'warning' | 'danger'
  className?: string
}

export default function StatCard({
  label,
  value,
  icon,
  trend,
  trendValue,
  color = 'default',
  className = ''
}: StatCardProps) {
  const colorClasses = {
    default: '',
    success: 'text-green-400',
    warning: 'text-yellow-400',
    danger: 'text-red-400'
  }

  return (
    <div className={`
      bg-white/5 
      border 
      border-white/10 
      rounded-lg 
      p-4
      ${className}
    `}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-xs sm:text-sm text-white/60">{label}</p>
          <p className={`
            text-lg sm:text-2xl 
            font-bold 
            ${colorClasses[color]}
          `}>
            {value}
          </p>
          {trend && trendValue && (
            <p className="text-xs text-white/40 flex items-center gap-1">
              {trend === 'up' && '↑'}
              {trend === 'down' && '↓'}
              {trendValue}
            </p>
          )}
        </div>
        {icon && (
          <div className="text-white/40">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 3: Implement StatsGrid**

```typescript
// components/ui/StatsGrid.tsx
"use client"

import { ReactNode } from "react"

interface StatsGridProps {
  children: ReactNode
  columns?: {
    mobile?: 1 | 2
    tablet?: 2 | 3 | 4
    desktop?: 3 | 4 | 5 | 6
  }
  className?: string
}

export default function StatsGrid({
  children,
  columns = {
    mobile: 1,
    tablet: 2,
    desktop: 4
  },
  className = ''
}: StatsGridProps) {
  const mobileCols = columns.mobile || 1
  const tabletCols = columns.tablet || 2
  const desktopCols = columns.desktop || 4

  return (
    <div className={`
      grid 
      grid-cols-${mobileCols}
      sm:grid-cols-${tabletCols}
      lg:grid-cols-${desktopCols}
      gap-3 sm:gap-4
      ${className}
    `}>
      {children}
    </div>
  )
}
```

**Step 4: Commit StatsGrid components**

```bash
git add components/ui/StatsGrid.tsx components/ui/StatCard.tsx
git commit -m "feat: add StatsGrid and StatCard components for responsive stat displays"
```

---

## Task 6: Update Inventory Page

**Files:**
- Modify: `app/inventory/inventoryPage.tsx`
- Modify: `components/inventory/InventoryTable.tsx` (if exists)

**Description:**
Update the inventory page to use the new responsive components and fix mobile layout issues.

**Step 1: Update inventory page header**

Replace the header section (lines 315-352) with PageHeader component:

```typescript
// OLD (lines 315-352)
<div className='flex items-start justify-between'>
  <div>
    <h1 className='text-2xl font-bold flex items-center gap-2'>
      <PackageIcon className='w-6 h-6' />
      Inventory Management
    </h1>
    <p className='text-white/60 text-sm mt-1'>
      Manage your inventory items and stock levels
    </p>
  </div>
  <div className='flex items-center gap-2 text-sm font-semibold'>
    {/* buttons */}
  </div>
</div>

// NEW
<PageHeader
  title="Inventory Management"
  description="Manage your inventory items and stock levels"
  icon={<PackageIcon className='w-6 h-6' />}
  actions={
    <>
      <BranchSelector showAllOption={true} />
      <button
        onClick={() => setShowImportModal(true)}
        className='flex items-center gap-1.5 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-md transition-colors border-2 border-purple-500/30'
      >
        <UploadIcon className='w-4 h-4' />
        <span className='hidden sm:inline'>Import CSV</span>
      </button>
      <button
        onClick={() => setShowFluidModal(true)}
        className='flex items-center gap-1.5 px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-md transition-colors border-2 border-cyan-500/30'
      >
        <DropletsIcon className='w-4 h-4' />
        <span className='hidden sm:inline'>Modify Fluid</span>
      </button>
      <button
        onClick={() => setShowCreateModal(true)}
        className='flex items-center gap-1.5 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-md transition-colors border-2 border-blue-500/30'
      >
        <PlusIcon className='w-4 h-4' />
        <span className='hidden sm:inline'>Add Item</span>
      </button>
    </>
  }
/>
```

**Step 2: Update stats section**

Replace stats grid (lines 391-408) with StatsGrid:

```typescript
// OLD
<div className='grid grid-cols-3 gap-4'>
  {/* stat cards */}
</div>

// NEW
<StatsGrid columns={{ mobile: 1, tablet: 3, desktop: 3 }}>
  <StatCard
    label="Total Items"
    value={stats.total}
  />
  <StatCard
    label="Low Stock"
    value={stats.lowStock}
    color={stats.lowStock > 0 ? 'danger' : 'default'}
  />
  <StatCard
    label="Fluids"
    value={stats.fluids}
  />
</StatsGrid>
```

**Step 3: Update filters section**

Replace filters (lines 411-517) with FilterBar:

```typescript
// OLD
<div className='flex flex-wrap items-center gap-3'>
  {/* search, filters, export */}
</div>

// NEW
<FilterBar>
  {/* Search */}
  <div className='relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-xs'>
    <SearchIcon className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40' />
    <input
      type='text'
      placeholder='Search items...'
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className='w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500/50 outline-none transition-colors'
    />
  </div>

  {/* Category Filter */}
  <select
    value={categoryFilter}
    onChange={(e) => setCategoryFilter(e.target.value)}
    className='px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500/50 outline-none transition-colors'
  >
    <option value=''>All Categories</option>
    {categories.map((cat) => (
      <option key={cat} value={cat}>
        {cat.charAt(0) + cat.slice(1).toLowerCase()}
      </option>
    ))}
  </select>

  {/* Type Filter */}
  <select
    value={typeFilter}
    onChange={(e) => setTypeFilter(e.target.value)}
    className='px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:border-blue-500/50 outline-none transition-colors'
  >
    <option value=''>All Types</option>
    <option value='ITEM'>Item</option>
    <option value='FLUID'>Fluid</option>
  </select>

  {/* Low Stock Toggle */}
  <label className='flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg cursor-pointer hover:bg-white/10 transition-colors'>
    <input
      type='checkbox'
      checked={lowStockOnly}
      onChange={(e) => setLowStockOnly(e.target.checked)}
      className='rounded border-white/20'
    />
    <span className='text-sm'>Low Stock Only</span>
  </label>

  {/* Export Dropdown */}
  <div className='relative ml-auto' ref={exportDropdownRef}>
    {/* export dropdown */}
  </div>
</FilterBar>
```

**Step 4: Update InventoryTable to use ResponsiveTable pattern**

If InventoryTable exists, update it to use the mobile card pattern. Otherwise, create a new table component.

**Step 5: Run lint check**

```bash
bun run lint
```

Expected: No linting errors

**Step 6: Commit inventory page changes**

```bash
git add app/inventory/inventoryPage.tsx
git commit -m "refactor: update inventory page with responsive components"
```

---

## Task 7: Update Appointments Page

**Files:**
- Modify: `app/appointments/appointmentsPage.tsx`

**Description:**
Update appointments page to use ResponsiveTable and fix mobile overflow issues.

**Step 1: Update page header**

Replace header (lines 182-197) with PageHeader:

```typescript
<PageHeader
  title="Appointments"
  icon={<ClipboardListIcon className='w-6 h-6' />}
  actions={
    <>
      <BranchSelector showAllOption={true} />
      <button
        onClick={() => setShowWalkinModal(true)}
        className='flex items-center gap-2 px-3 sm:px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-md border-2 border-green-400/20 font-semibold transition-colors'
      >
        <PlusIcon size={18} />
        <span className='hidden sm:inline'>Add Walk-in</span>
      </button>
    </>
  }
/>
```

**Step 2: Update filters**

Replace filter section (lines 200-226) with FilterBar:

```typescript
<FilterBar>
  <div className='relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-xs'>
    <SearchIcon className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40' />
    <input
      type='text'
      placeholder='Search appointments...'
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className='w-full pl-10 pr-4 py-2 bg-white/5 border-2 border-white/10 rounded-md text-sm focus:outline-none focus:border-white/20 transition-colors'
    />
  </div>
  
  <select
    title='Filter by Status'
    aria-label='Filter by Status'
    onChange={(e) => setStatus(e.target.value as AppointmentStatus | "" | "ALL")}
    value={status}
    className='px-4 py-2 bg-white/5 border-2 border-white/10 rounded-md text-sm font-medium cursor-pointer hover:bg-white/10 transition-colors focus:outline-none focus:border-white/20'
  >
    <option value='CONFIRMED'>Confirmed</option>
    <option value='PENDING'>Pending</option>
    <option value='COMPLETED'>Completed</option>
    <option value='CANCELLED'>Cancelled</option>
    <option value='ALL'>View All</option>
  </select>
</FilterBar>
```

**Step 3: Replace table with ResponsiveTable**

Replace the table section (lines 245-350) with ResponsiveTable:

```typescript
<div className='flex-1 overflow-hidden rounded-lg border border-white/10 bg-white/5'>
  <ResponsiveTable
    columns={[
      {
        key: 'title',
        header: 'Appointment',
        mobileCard: {
          label: 'Title',
          priority: 'primary',
          render: (value, appointment) => (
            <div className='flex flex-col gap-1'>
              <span className='font-medium'>{value}</span>
              {formattedDates.get(appointment.id)?.isLate && (
                <span className='inline-block text-xs font-semibold px-1.5 py-0.5 bg-red-400/20 text-red-400 rounded-sm border border-red-400/20'>
                  Late
                </span>
              )}
            </div>
          )
        }
      },
      {
        key: 'client_id',
        header: 'Client',
        mobileCard: {
          label: 'Client',
          priority: 'secondary',
          render: (_, appointment) => (
            <span className='text-white/80'>
              {appointment.is_walkin
                ? (appointment.client_name || 'Walk-in')
                : (profilesMap.get(appointment.client_id || '')?.full_name || 'Unknown')}
            </span>
          )
        }
      },
      {
        key: 'staff_id',
        header: 'Staff',
        mobileCard: {
          label: 'Staff',
          priority: 'secondary',
          render: (_, appointment) => (
            profilesMap.get(appointment.staff_id || '')?.full_name || 'Unassigned'
          )
        }
      },
      {
        key: 'time_start',
        header: 'Date & Time',
        mobileCard: {
          label: 'Date & Time',
          priority: 'primary',
          render: (_, appointment) => {
            const dateInfo = formattedDates.get(appointment.id)
            return (
              <div className='flex flex-col gap-1'>
                <span className='text-white/80 flex items-center gap-1'>
                  <CalendarFoldIcon size={14} />
                  {dateInfo?.date}
                  {dateInfo?.isToday && (
                    <span className='text-xs px-1.5 py-0.5 bg-green-400/20 text-green-400 rounded-sm'>
                      Today
                    </span>
                  )}
                </span>
                <span className='text-white/60 text-sm flex items-center gap-1'>
                  <ClockIcon size={14} />
                  {dateInfo?.startTime} - {dateInfo?.endTime}
                </span>
              </div>
            )
          }
        }
      },
      {
        key: 'status',
        header: 'Status',
        mobileCard: {
          label: 'Status',
          priority: 'tertiary',
          render: (value) => (
            <span className={`inline-block px-2 py-0.5 rounded-sm text-xs font-semibold border capitalize ${getStatusBadgeClasses(value)}`}>
              {value.toLowerCase()}
            </span>
          )
        }
      },
      {
        key: 'branch_name',
        header: 'Branch',
        mobileCard: {
          label: 'Branch',
          priority: 'tertiary',
          render: (value) => (
            <span className='text-white/80 text-sm'>
              {value || 'All Branches'}
            </span>
          )
        }
      },
      {
        key: 'type',
        header: 'Type',
        mobileCard: {
          label: 'Type',
          priority: 'tertiary',
          render: (value, appointment) => (
            <div className='flex items-center gap-1'>
              <span className={`inline-block px-2 py-0.5 rounded-sm text-xs font-semibold border capitalize ${getTypeBadgeClasses(value)}`}>
                {value?.toLowerCase() || 'other'}
              </span>
              {appointment.is_walkin && (
                <span className='inline-block px-2 py-0.5 bg-green-500/20 text-green-400 rounded-sm text-xs font-semibold border border-green-400/20'>
                  Walk-in
                </span>
              )}
            </div>
          )
        }
      }
    ]}
    data={filteredAppointments}
    onRowClick={(appointment) => router.push(`/appointments/${appointment.id}`)}
    emptyMessage={
      searchQuery
        ? "No appointments match your search criteria."
        : "No appointments in this category. Click \"+ Add Walk-in\" to create one."
    }
    loading={loading}
  />
</div>
```

**Step 4: Run lint check**

```bash
bun run lint
```

Expected: No linting errors

**Step 5: Commit appointments page changes**

```bash
git add app/appointments/appointmentsPage.tsx
git commit -m "refactor: update appointments page with ResponsiveTable for mobile support"
```

---

## Task 8: Update Dashboard

**Files:**
- Modify: `app/dashboardClient.tsx`

**Description:**
Update dashboard to use StatsGrid and improve mobile card layouts.

**Step 1: Update StatsGrid in StaffDashboard**

Replace stat cards (lines 242-259) with StatsGrid:

```typescript
<StatsGrid columns={{ mobile: 1, tablet: 2, desktop: 4 }}>
  <StatCard
    label="Appointments"
    value={appointments.length}
    icon={<ClipboardClockIcon size={42} className='stroke-white' />}
  />
  {/* Quick Actions */}
  <div className='col-span-2 flex flex-col gap-2 bg-white/10 p-4 border-2 border-white/5 rounded-lg'>
    {/* Quick action buttons */}
  </div>
  {/* Upcoming appointments */}
  <div className='col-span-2 md:col-span-4 lg:col-span-4'>
    {/* Upcoming appointments card */}
  </div>
  {/* Inventory alerts */}
  {userInfo.access_flags?.includes("inventory") && (
    <div className='col-span-2 md:col-span-4 lg:col-span-4'>
      {/* Inventory alerts */}
    </div>
  )}
</StatsGrid>
```

**Step 2: Update AdminDashboard similarly**

Apply the same StatsGrid pattern to the admin dashboard section.

**Step 3: Update appointment card layout**

Make appointment cards more compact on mobile:

```typescript
<motion.a
  className='flex flex-col gap-2 p-3 sm:p-4 border-2 border-transparent hover:border-white/5 rounded-md cursor-pointer hover:bg-white/10'
>
  <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2'>
    <div className='flex flex-col gap-1 flex-1 min-w-0'>
      <span className='font-medium truncate'>{appointment.title}</span>
      {/* status badges */}
    </div>
    {/* type badge */}
  </div>
  <div className='flex flex-col sm:flex-row sm:justify-between gap-2 text-xs'>
    {/* date and time info */}
  </div>
</motion.a>
```

**Step 4: Run lint check**

```bash
bun run lint
```

Expected: No linting errors

**Step 5: Commit dashboard changes**

```bash
git add app/dashboardClient.tsx
git commit -m "refactor: update dashboard with StatsGrid and responsive layouts"
```

---

## Task 9: Update Accounting Page

**Files:**
- Modify: `app/accounting/accountingPage.tsx`

**Description:**
Update accounting page to use responsive components and fix grid layouts.

**Step 1: Read current accounting page**

Examine the existing accounting page structure to understand what needs to be updated.

**Step 2: Update grid layouts**

Replace fixed grid layouts with responsive StatsGrid and update headers with PageHeader.

**Step 3: Run lint check**

```bash
bun run lint
```

**Step 4: Commit accounting changes**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "refactor: update accounting page with responsive layouts"
```

---

## Task 10: Update Remaining Pages

**Files:**
- Modify: `app/sales/salesPage.tsx`
- Modify: `app/transactions/transactionsPage.tsx`
- Modify: `app/my-payroll/myPayrollPage.tsx`
- Modify: `app/profile/profilePage.tsx`
- Modify: `app/calendar/calendarPage.tsx`
- Modify: `app/notify/notifyPage.tsx`
- Modify: `app/config/configPage.tsx`

**Description:**
Systematically update all remaining pages with responsive components and mobile-friendly layouts.

**Step 1: Update sales page**

Apply PageHeader, StatsGrid, and ResponsiveTable patterns.

**Step 2: Update transactions page**

Apply same responsive patterns.

**Step 3: Update payroll page**

Apply responsive grid layouts.

**Step 4: Update profile page**

Apply responsive grid layouts.

**Step 5: Update calendar page**

Ensure calendar grid adapts properly to mobile.

**Step 6: Update notifications page**

Apply responsive layouts.

**Step 7: Update config page**

Apply responsive layouts.

**Step 8: Run lint check**

```bash
bun run lint
```

Expected: No linting errors

**Step 9: Commit all page updates**

```bash
git add app/
git commit -m "refactor: update all pages with responsive mobile layouts"
```

---

## Task 11: Update PageWrapper Component

**Files:**
- Modify: `components/page-wrapper.tsx`

**Description:**
Update PageWrapper to have better mobile padding and spacing.

**Step 1: Update PageWrapper padding**

```typescript
// OLD
<div className={`w-full h-full flex flex-col gap-4 p-6 ${className}`}>

// NEW
<div className={`w-full h-full flex flex-col gap-4 p-4 sm:p-6 ${className}`}>
```

This reduces padding on mobile (16px instead of 24px).

**Step 2: Commit PageWrapper changes**

```bash
git add components/page-wrapper.tsx
git commit -m "fix: reduce page padding on mobile for better space usage"
```

---

## Task 12: Update Sidebar for Better Mobile UX

**Files:**
- Modify: `components/sidebar.tsx`

**Description:**
Review and improve sidebar mobile experience if needed.

**Step 1: Review current sidebar**

The sidebar already has good mobile support (lines 291-316, 427-438). Check if any improvements are needed.

**Step 2: Verify mobile navigation**

Ensure focus trap and accessibility are working correctly.

**Step 3: Test on mobile breakpoint**

Test sidebar behavior at different screen sizes.

**Step 4: Commit any improvements**

```bash
git add components/sidebar.tsx
git commit -m "improve: enhance sidebar mobile UX"
```

---

## Task 13: Add Container Query Support

**Files:**
- Modify: `app/globals.css`

**Description:**
Add container query support for better responsive components.

**Step 1: Add container query classes**

Add to globals.css:

```css
@theme inline {
  --font-sans: var(--font-geist);
  --font-bodoni: var(--font-bodoni);
  
  /* Container query support */
  @container {
    .container-sm { container-type: inline-size; }
    .container-md { container-type: inline-size; }
    .container-lg { container-type: inline-size; }
  }
}
```

**Step 2: Use container queries in components**

Update components to use `@container` where appropriate for better responsiveness.

**Step 3: Commit container query additions**

```bash
git add app/globals.css
git commit -m "feat: add container query support for better responsive layouts"
```

---

## Task 14: Create Responsive Utilities

**Files:**
- Create: `utils/responsive.ts`

**Description:**
Create utility functions for responsive handling.

**Step 1: Create utility functions**

```typescript
// utils/responsive.ts

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const

export function isMobile(width: number): boolean {
  return width < breakpoints.md
}

export function isTablet(width: number): boolean {
  return width >= breakpoints.md && width < breakpoints.lg
}

export function isDesktop(width: number): boolean {
  return width >= breakpoints.lg
}

export function getBreakpoint(width: number): 'mobile' | 'tablet' | 'desktop' {
  if (isMobile(width)) return 'mobile'
  if (isTablet(width)) return 'tablet'
  return 'desktop'
}
```

**Step 2: Export utilities**

Make sure utilities are exported and available for use.

**Step 3: Commit utilities**

```bash
git add utils/responsive.ts
git commit -m "feat: add responsive utility functions"
```

---

## Task 15: Mobile Testing and Validation

**Description:**
Test all pages on mobile breakpoints to ensure proper rendering.

**Step 1: Test on mobile viewport (375px)**

Test each page:
- Dashboard
- Inventory
- Appointments
- Accounting
- Sales
- Transactions
- Profile
- Calendar

Check for:
- Horizontal overflow (should be none)
- Touch targets (minimum 44x44px)
- Readable text sizes
- Proper spacing
- Button wrapping

**Step 2: Test on tablet viewport (768px)**

Repeat testing on tablet viewport.

**Step 3: Test on desktop viewport (1024px+)**

Verify desktop experience is maintained.

**Step 4: Test touch interactions**

- Button taps
- Scroll behavior
- Drop-down interactions
- Modal interactions

**Step 5: Document any fixes needed**

Document any issues found and create additional commits to fix them.

**Step 6: Final commit**

```bash
git add .
git commit -m "test: validate mobile responsiveness across all pages"
```

---

## Task 16: Create Documentation

**Files:**
- Create: `docs/mobile-responsiveness.md`

**Description:**
Document the responsive design system and best practices.

**Step 1: Create documentation**

```markdown
# Mobile Responsiveness Guidelines

## Overview

This document outlines the mobile-first responsive design system used in Inksight RDMD.

## Components

### ResponsiveTable

Converts tables to card view on mobile.

\`\`\`tsx
<ResponsiveTable
  columns={[
    {
      key: 'name',
      header: 'Name',
      mobileCard: {
        label: 'Customer Name',
        priority: 'primary'
      }
    }
  ]}
  data={customers}
  onRowClick={(row) => handleRowClick(row)}
/>
\`\`\`

### StatsGrid

Responsive grid for stat cards.

\`\`\`tsx
<StatsGrid columns={{ mobile: 1, tablet: 2, desktop: 4 }}>
  <StatCard label="Total Sales" value="$10,000" />
</StatsGrid>
\`\`\`

### FilterBar

Responsive filter controls.

\`\`\`tsx
<FilterBar>
  <input /* ... */ />
  <select /* ... */ />
</FilterBar>
\`\`\`

## Best Practices

1. Always use responsive components for data tables
2. Use `hidden sm:flex` for larger screens
3. Use `flex-col sm:flex-row` for button groups
4. Reduce padding on mobile: `p-4 sm:p-6`
5. Use `min-w-0` on flex children to allow text truncation
6. Keep touch targets at least 44x44px
7. Test at 375px, 768px, and 1024px viewports

## Breakpoints

- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
```

**Step 2: Commit documentation**

```bash
git add docs/mobile-responsiveness.md
git commit -m "docs: add mobile responsiveness guidelines and component documentation"
```

---

## Summary

This comprehensive plan addresses all mobile responsiveness issues across the Inksight RDMD application by:

1. Creating a reusable responsive component system (Tasks 1-5)
2. Systematically updating all pages (Tasks 6-10)
3. Improving base layouts and padding (Tasks 11-12)
4. Adding container query support (Task 13)
5. Creating utility functions (Task 14)
6. Testing and validation (Task 15)
7. Documenting the design system (Task 16)

### Expected Outcomes

- No horizontal overflow on any page at any screen size
- Consistent mobile-first design patterns
- Reusable components for future development
- Improved touch targets and spacing
- Better user experience on mobile devices
- Maintainable and documented code

### Testing Checklist

- [ ] All pages render correctly at 375px (mobile)
- [ ] All pages render correctly at 768px (tablet)
- [ ] All pages render correctly at 1024px+ (desktop)
- [ ] No horizontal overflow on any page
- [ ] All touch targets are at least 44x44px
- [ ] Tables convert to cards on mobile
- [ ] Button groups wrap properly
- [ ] Filter controls stack vertically on mobile
- [ ] Stats grids adapt to screen size
- [ ] Sidebar navigation works on mobile
- [ ] All interactive elements are accessible

---

**Plan complete and saved to `docs/plans/2026-03-27-mobile-responsive-styling.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**