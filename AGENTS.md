# Agent Guidelines for Inksight RDMD

This is a Next.js 15 + React 19 + TypeScript application using Bun as the package manager.

## Build, Lint, and Development Commands

```bash
# Development server (uses Turbopack + HTTPS)
bun run dev

# Production build
bun run build

# Start production server
bun run start

# Run ESLint
bun run lint

# Package management
bun install
bun add <package>
bun remove <package>
```

**Note:** This project uses Bun (`bun@1.1.38`) as the package manager, not npm/yarn/pnpm.

## Technology Stack

- **Framework:** Next.js 15 with App Router
- **React:** Version 19
- **Language:** TypeScript (strict mode enabled)
- **Styling:** Tailwind CSS 4 with `@theme inline` syntax
- **UI Components:** Custom components (no external UI library)
- **Icons:** Lucide React
- **Backend:** Supabase (PostgreSQL + Auth)
- **State:** React Context + useState/useReducer
- **Animations:** Motion (Framer Motion successor)
- **3D:** Three.js + React Three Fiber

## Code Style Guidelines

### TypeScript

- Use **strict TypeScript** - all types must be explicit
- Prefer `interface` over `type` for object shapes
- Use PascalCase for types/interfaces: `UserProfile`, `InventoryItem`
- Use camelCase for variables/functions: `getInventory`, `handleClick`
- Use UPPER_SNAKE_CASE for constants: `MAX_RETRY_COUNT`

### Imports

Order imports as follows:
1. React/Next.js imports
2. Third-party libraries
3. Absolute imports (`@/` alias)
4. Relative imports

```typescript
import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { createBrowserClient } from "@/utils/supabase/client"
import { UserProfile } from "@/utils/types/auth"
import { Sidebar } from "./sidebar"
```

### Component Structure

- Use function declarations for components (not arrow functions)
- Props interface named with `Props` suffix: `SidebarProps`
- Client components must start with `"use client"`
- Server actions must start with `"use server"`
- Always type the return value of server actions

```typescript
"use client"

import { useState } from "react"

interface ButtonProps {
    label: string
    onClick: () => void
}

export default function Button({ label, onClick }: ButtonProps) {
    const [isLoading, setIsLoading] = useState(false)
    // ...
}
```

### Styling (Tailwind CSS)

- Use single quotes in JSX className attributes
- Use Tailwind's arbitrary values sparingly: `w-[100px]`
- Prefer Tailwind classes over inline styles
- Dark mode is the default (no `dark:` prefix needed)

```tsx
<div className='flex items-center justify-between p-4 bg-black'>
```

### Error Handling

- Always check for errors from Supabase calls
- Use early returns for error cases
- Log errors via the logging utility: `createLogs()`

```typescript
const { data, error } = await db.from('users').select('*')
if (error) {
    createLogs({ logs: [{ level: 'ERROR', message: error.message }] })
    throw new Error(error.message)
}
```

### Naming Conventions

- **Components:** PascalCase (e.g., `Sidebar`, `UserProfile`)
- **Files:** camelCase for utilities, PascalCase for components
- **Functions:** camelCase, verb-first (e.g., `getUser`, `handleSubmit`)
- **Hooks:** camelCase with `use` prefix (e.g., `useSidebar`, `useOutsideClick`)
- **API Actions:** camelCase, verb-first (e.g., `getInventory`, `createUser`)
- **Database tables:** snake_case (e.g., `inventory_items`)
- **Database columns:** snake_case (e.g., `created_at`)

### File Organization

```
app/
  api/actions/     # Server actions
  [feature]/       # Route groups (accounting, appointments, etc.)
  page.tsx         # Main page
  layout.tsx       # Root layout
  globals.css      # Global styles
components/
  [feature]/       # Feature-specific components
  ui/              # Reusable UI components
  *.tsx            # Shared components
utils/
  supabase/        # Supabase clients
  types/           # TypeScript type definitions
  *.ts             # Utility functions
```

### Environment Variables

- Use `NEXT_PUBLIC_` prefix for client-side variables
- Never commit `.env.local` or `.env` files
- Reference: `.env.example` for required variables

### Code Quality

- Run `bun run lint` before committing
- Fix all ESLint warnings and errors
- Prefer explicit types over `any`
- Avoid `console.log` in production code (use `createLogs` instead)

### Git Workflow

```bash
# Merge workflow (handled by script)
bun run merge  # Merges dev into prod and pushes
```

## Testing

Currently, tests are manual integration tests in `/app/test/`. There is no automated test runner configured.

## Export Engine

The export engine (`utils/export-engine/`) provides functionality for exporting ledger and metrics data in multiple formats.

### Core Functions

```typescript
import {
    generateGroupedLedgerExport,
    generateGroupedMetricsExport,
    generateFlatCSVExport,
} from '@/utils/export-engine'
```

### Supported Formats

- **XLSX** - Excel workbook with grouping, charts, and summary sheets
- **CSV** - Flat or grouped CSV export
- **PDF** - Simple PDF export with basic formatting

### Grouping Dimensions

`GroupingDimension = 'branch' | 'entryType' | 'paymentMethod' | 'category'`

Configure multi-dimensional grouping:

```typescript
const groupingConfig: GroupingConfig = {
    dimensions: ['branch', 'category'], // Primary then secondary
    includeSummary: true,
    includeCharts: true,
}
```

### Adding New Groupings

1. **Add the dimension type** in `utils/export-engine/types.ts`:
   ```typescript
   export type GroupingDimension = 'branch' | 'entryType' | 'paymentMethod' | 'category' | 'newDimension'
   ```

2. **Update grouping logic** in `utils/export-engine/grouping.ts`:
   ```typescript
   export function getGroupKey(entry: LedgerExportRow, dimension: GroupingDimension): string {
       switch (dimension) {
           // ... existing cases
           case 'newDimension':
               return entry.newField || 'Unknown'
       }
   }

   export function getGroupLabel(key: string, dimension: GroupingDimension, branches?: BranchInfo[]): string {
       switch (dimension) {
           // ... existing cases
           case 'newDimension':
               return formatNewDimension(key)
       }
   }
   ```

3. **Add sorting logic** in `sortGroupKeys()` if needed

### Adding New Export Formats

1. **Define format** in `utils/export-engine/types.ts`:
   ```typescript
   export type ExportFormat = 'csv' | 'xlsx' | 'pdf' | 'newFormat'
   ```

2. **Add format handler** in `utils/export-engine/index.ts`:
   ```typescript
   if (options.format === 'newFormat') {
       return generateNewFormatOutput(data, options)
   }
   ```

3. **Implement generator function**:
   ```typescript
   function generateNewFormatOutput(data: LedgerExportRow[], options: GroupedExportOptions): ExportResult {
       // Generate and return { content, filename, mimeType }
   }
   ```

### Styling Conventions

All styling constants are centralized in `utils/export-engine/styling.ts`:

| Constant | Purpose |
|----------|---------|
| `COLORS` | Hex color values for fonts, backgrounds, borders |
| `FONTS` | Font definitions (name, size, bold, color) |
| `FILLS` | Pattern fills for Excel cells |
| `BORDERS` | Border styles (thin, medium, hair, double) |
| `ALIGNMENTS` | Horizontal/vertical text alignment |
| `NUMBER_FORMATS` | Excel number format strings |

**Color palette for dark-mode exports:**
- Primary background: `1F2937` (dark gray)
- Section headers: `3B82F6` (blue)
- Positive values: `10B981` (green)
- Negative values: `EF4444` (red)
- Neutral values: `6366F1` (indigo)

**Adding new colors:**
```typescript
export const COLORS = {
    // ... existing colors
    newColor: 'HEXCODE',
} as const
```

### Export Options

```typescript
interface GroupedExportOptions {
    format: ExportFormat
    grouping: GroupingConfig
    scope: ExportScope
    title?: string
    subtitle?: string
    generatedAt?: string
}
```

## Important Notes

- This is a **tattoo studio management application**
- Features include: inventory, appointments, payroll, accounting, messaging
- Uses Server Actions for data fetching/mutations
- Authentication is handled via Supabase Auth
- Images are stored in Supabase Storage
- Uses Turbopack for faster builds
