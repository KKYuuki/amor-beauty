# Mobile Responsiveness Guidelines

## Overview

This document outlines the mobile-first responsive design system implemented in Inksight RDMD to ensure all pages work properly on mobile devices without horizontal overflow.

## Components

### ResponsiveTable

Converts tables to card view on mobile automatically.

**Usage:**
```tsx
import ResponsiveTable from '@/components/ui/ResponsiveTable'

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
  rowKey="id"
  onRowClick={(row) => handleRowClick(row)}
  loading={isLoading}
  emptyMessage="No customers found"
/>
```

**Features:**
- Desktop: Standard HTML table with sticky header
- Mobile: Card-based layout with priority-based field organization
- Custom render functions per column
- Loading and empty states
- Row click handlers with keyboard accessibility

### StatsGrid & StatCard

Responsive grid for displaying statistics.

**Usage:**
```tsx
import StatsGrid from '@/components/ui/StatsGrid'
import StatCard from '@/components/ui/StatCard'

<StatsGrid columns={{ mobile: 1, tablet: 2, desktop: 4 }}>
  <StatCard
    label="Total Sales"
    value="$10,000"
    icon={<DollarSignIcon />}
    trend="up"
    trendValue="15%"
    color="success"
  />
</StatsGrid>
```

**Features:**
- Responsive column configuration
- Optional icons, trends, and color variants
- Mobile-first grid layout

### PageHeader

Standardized page header with responsive layout.

**Usage:**
```tsx
import PageHeader from '@/components/ui/PageHeader'

<PageHeader
  title="Page Title"
  description="Optional description"
  icon={<IconName />}
  actions={
    <>
      <button>
        <PlusIcon />
        <span className="hidden sm:inline">Add Item</span>
      </button>
    </>
  }
/>
```

**Features:**
- Stacks vertically on mobile, side-by-side on desktop
- Breadcrumbs support
- Responsive action buttons

### FilterBar

Responsive layout for filter controls.

**Usage:**
```tsx
import FilterBar from '@/components/ui/FilterBar'

<FilterBar>
  <input placeholder="Search..." />
  <select>
    <option>Filter</option>
  </select>
</FilterBar>
```

**Features:**
- Stacks vertically on mobile
- Horizontal layout on tablet/desktop
- Flexible wrapping

### ActionButtons

Responsive button group wrapper.

**Usage:**
```tsx
import ActionButtons from '@/components/ui/ActionButtons'

<ActionButtons align="end" gap="md">
  <button>Save</button>
  <button>Cancel</button>
</ActionButtons>
```

**Features:**
- Vertical stacking on mobile
- Horizontal inline on desktop
- Configurable alignment and spacing

## Best Practices

### 1. Mobile-First Approach

Always design for mobile first, then enhance for larger screens:

```tsx
// Mobile base styles
className="flex-col"
// Desktop enhancement
className="flex-col sm:flex-row"
```

### 2. Responsive Padding

Reduce padding on mobile to maximize usable space:

```tsx
className="p-4 sm:p-6"
```

### 3. Hide Text on Mobile

For action buttons, hide text labels on mobile, show only icons:

```tsx
<button>
  <PlusIcon />
  <span className="hidden sm:inline">Add Item</span>
</button>
```

### 4. Flexible Min-Widths

Use responsive min-widths to prevent overflow:

```tsx
// Instead of fixed min-width
className="min-w-0 sm:min-w-[200px]"
```

### 5. Touch Targets

Ensure all interactive elements are at least 44x44px for touch:

```tsx
className="px-4 py-2" // At least 44px tall with text
```

### 6. Text Truncation

Prevent text overflow with truncation:

```tsx
className="truncate"
```

### 7. Grid Responsiveness

Always use responsive grid classes:

```tsx
// Bad
className="grid grid-cols-4"

// Good
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
```

## Breakpoints

- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

## Common Patterns

### Page Structure

```tsx
export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Page Title"
        icon={<Icon />}
        actions={<ActionButtons>...</ActionButtons>}
      />
      
      <StatsGrid columns={{ mobile: 1, tablet: 2, desktop: 4 }}>
        <StatCard label="Stat 1" value={100} />
      </StatsGrid>
      
      <FilterBar>
        <input placeholder="Search..." />
        <select>...</select>
      </FilterBar>
      
      <ResponsiveTable
        columns={[...]}
        data={data}
      />
    </div>
  )
}
```

### Responsive Form Layout

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <input className="..." />
  <input className="..." />
</div>
```

### Responsive Card Layout

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map(item => (
    <div key={item.id} className="bg-white/5 p-4 rounded-lg">
      {/* Card content */}
    </div>
  ))}
</div>
```

## Testing Checklist

When adding new pages or components:

- [ ] Test at 375px (mobile) - no horizontal overflow
- [ ] Test at 768px (tablet) - layout adapts
- [ ] Test at 1024px+ (desktop) - full layout
- [ ] Verify touch targets are at least 44px
- [ ] Check text is readable (min 14px)
- [ ] Test table/card switching on mobile
- [ ] Verify buttons are usable on mobile
- [ ] Run `bun run lint` - no errors

## Migration Guide

### Converting Existing Tables

```tsx
// Before
<table className="w-full min-w-[800px]">
  {/* ... */}
</table>

// After
<ResponsiveTable
  columns={[...]}
  data={data}
  rowKey="id"
/>
```

### Converting Existing Stats

```tsx
// Before
<div className="grid grid-cols-3 gap-4">
  <div className="p-4 bg-white/5 rounded">
    <p>Label</p>
    <p>Value</p>
  </div>
</div>

// After
<StatsGrid columns={{ mobile: 1, tablet: 3, desktop: 3 }}>
  <StatCard label="Label" value={value} />
</StatsGrid>
```

## Troubleshooting

### Horizontal Overflow

If you see horizontal scrollbars on mobile:
1. Check for `min-w-[...]` with fixed values
2. Check for `grid-cols-X` without responsive prefixes
3. Check tables - convert to ResponsiveTable
4. Check images - ensure they have `max-w-full`

### Touch Targets Too Small

Increase padding or use larger elements:
```tsx
// Too small
className="px-2 py-1"

// Good
className="px-4 py-2"
```

### Text Too Small on Mobile

Use responsive text sizes:
```tsx
className="text-sm sm:text-base"
```

## Related Files

- `components/ui/ResponsiveTable.tsx`
- `components/ui/MobileCard.tsx`
- `components/ui/StatsGrid.tsx`
- `components/ui/StatCard.tsx`
- `components/ui/PageHeader.tsx`
- `components/ui/FilterBar.tsx`
- `components/ui/ActionButtons.tsx`
- `components/page-wrapper.tsx`
