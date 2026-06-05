# Accounting Metrics Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Overhaul the accounting metrics system to display proper debit/credit signage, enable drill-down from payment method to category to individual entries, enhance the ExecutiveAccounting dashboard for accounting professionals, and fix all lint/build issues.

**Architecture:** Extend the existing `LedgerSummary` server action to return hierarchical data (payment method -> category breakdown with entry-level details). Build a new `PaymentMethodDrilldown` component with collapsible sections. Enhance the `ExecutiveAccounting` dashboard with proper accounting terminology, net calculations per account type, and comparative features. All changes follow the existing pattern of server actions returning typed data to client components.

**Tech Stack:** Next.js 15, React 19, TypeScript, Drizzle ORM, Supabase (PostgreSQL), Tailwind CSS 4, Motion, Recharts

---

## Phase 1: Fix Payment Method Display (+ / - Signage)

### Task 1.1: Fix payment method debit/credit signage on Accounting page

**Files:**
- Modify: `app/accounting/accountingPage.tsx:665-678`

**Problem:** The payment method breakdown shows `debit - credit` as a raw number without +/- prefix. For example, `₱5,000` should show as `+₱5,000` (net debit) or `-₱2,000` (net credit). The trend value also needs clearer formatting.

**Step 1: Update the payment method StatCard to show + / - prefix and use proper accounting color coding**

In `app/accounting/accountingPage.tsx`, locate the payment method breakdown StatsGrid (~line 657-678). Replace the StatCard rendering:

```tsx
{summary.by_payment_method
    .filter((m) => m.method !== null)
    .map((pm) => {
        const net = pm.debit - pm.credit
        const isDebit = net >= 0
        return (
            <StatCard
                key={pm.method}
                label={pm.method_label}
                value={`${isDebit ? '+' : '-'}${currencySymbol}${Math.abs(net).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                trend={isDebit ? 'up' : 'down'}
                trendValue={`DR ${currencySymbol}${pm.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })} | CR ${currencySymbol}${pm.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                color={isDebit ? 'danger' : 'success'}
            />
        )
    })}
```

**Step 2: Verify the accounting page loads correctly**

Run: `bun run build 2>&1 | tail -20`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "fix(accounting): show +/- prefix on payment method net amounts"
```

---

### Task 1.2: Fix payment method net display on ExecutiveAccounting

**Files:**
- Modify: `components/metrics/ExecutiveAccounting.tsx:241-256`

**Problem:** The ExecutiveAccounting payment method cards show `₱{debit - credit}` without +/- prefix and hardcode the `₱` symbol instead of using `currencySymbol`.

**Step 1: Fix the payment method breakdown cards to show +/- and use currencySymbol**

In `components/metrics/ExecutiveAccounting.tsx`, locate the payment method breakdown section (~line 241-256). Replace the card rendering:

```tsx
{paymentMethodBreakdown.filter(m => m.method !== null).map((pm) => {
    const net = pm.debit - pm.credit
    const isDebit = net >= 0
    return (
        <div key={pm.method} className='bg-white/5 border border-white/10 rounded-lg p-3'>
            <p className='text-xs text-white/50 mb-1'>{pm.method_label}</p>
            <p className={`text-lg font-bold ${isDebit ? 'text-red-300' : 'text-green-300'}`}>
                {isDebit ? '+' : '-'}{currencySymbol}{Math.abs(net).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <p className='text-xs text-white/40 mt-1'>
                DR {currencySymbol}{pm.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })} | CR {currencySymbol}{pm.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <p className='text-xs text-white/40'>{pm.count} entries</p>
        </div>
    )
})}
```

**Step 2: Verify build**

Run: `bun run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add components/metrics/ExecutiveAccounting.tsx
git commit -m "fix(metrics): show +/- prefix and proper currency symbol in payment method cards"
```

---

### Task 1.3: Fix accounting type summary balance display with +/- signage

**Files:**
- Modify: `app/accounting/accountingPage.tsx:632-654`

**Problem:** The summary cards show `Credits`, `Debits`, and `Balance` but don't use proper accounting signage. The balance should clearly indicate DR/CR direction with a +/- prefix.

**Step 1: Update the summary card section to show balance with +/- sign**

In `app/accounting/accountingPage.tsx`, locate the summary StatsGrid (~line 632-654). Replace it:

```tsx
<StatsGrid columns={{ mobile: 2, tablet: 2, desktop: 4 }}>
    <StatCard
        label='Total Credits'
        value={`${currencySymbol}${summary.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
        color='success'
    />
    <StatCard
        label='Total Debits'
        value={`${currencySymbol}${summary.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
        color='danger'
    />
    <StatCard
        label={summary.balance >= 0 ? 'Balance (DR)' : 'Balance (CR)'}
        value={`${summary.balance >= 0 ? '+' : '-'}${currencySymbol}${Math.abs(summary.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
        color={summary.balance >= 0 ? 'danger' : 'success'}
    />
    <StatCard
        label='Total Entries'
        value={total}
    />
</StatsGrid>
```

**Step 2: Verify build**

Run: `bun run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "fix(accounting): improve balance display with DR/CR labels and +/- signage"
```

---

## Phase 2: Drill-Down by Payment Type -> Category -> Entries

### Task 2.1: Create the `LedgerDetailBreakdown` server action

**Files:**
- Modify: `server/actions/accounting.ts` (add new function)
- Modify: `utils/types/ledger.ts` (add new types)

**Step 1: Add new types to `utils/types/ledger.ts`**

Append to the end of the file:

```ts
export interface PaymentMethodCategoryBreakdown {
    method: string
    method_label: string
    total_debit: number
    total_credit: number
    net: number
    count: number
    categories: {
        category: string
        entry_type: LedgerEntryType
        total_debit: number
        total_credit: number
        net: number
        count: number
    }[]
}

export interface LedgerDetailBreakdown {
    by_payment_method: PaymentMethodCategoryBreakdown[]
}
```

**Step 2: Add the server action in `server/actions/accounting.ts`**

Add a new function `getLedgerDetailBreakdown` after the `getLedgerSummary` function (after ~line 1028). This function returns a hierarchical breakdown: payment method -> category with totals and counts.

```ts
export async function getLedgerDetailBreakdown(
    datePreset?: DateRangePreset,
    startDate?: string,
    endDate?: string,
    branchId?: string,
    filters?: {
        entry_type?: LedgerEntryType
        category?: string
        payment_method?: AccountingPaymentMethod
    }
): Promise<ActionResponse<LedgerDetailBreakdown>> {
    const user = await getCurrentUser()
    if (!user) {
        return failure('Unauthorized')
    }

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) {
        return failure('Access denied')
    }

    try {
        let dateFrom: Date | undefined
        let dateTo: Date | undefined

        if (datePreset && datePreset !== 'all') {
            const dateRange = getDateRangeFromPreset(datePreset)
            if (dateRange) {
                dateFrom = dateRange.start
                dateTo = dateRange.end
            }
        } else if (startDate && endDate) {
            dateFrom = new Date(startDate)
            dateTo = new Date(endDate)
        }

        const conditions: SQL<unknown>[] = [eq(generalLedger.isVoided, false)]

        if (dateFrom) conditions.push(gte(generalLedger.entryDate, dateFrom!))
        if (dateTo) conditions.push(lte(generalLedger.entryDate, dateTo!))
        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }
        if (filters?.entry_type) conditions.push(eq(generalLedger.entryType, filters.entry_type))
        if (filters?.category) conditions.push(eq(generalLedger.category, filters.category))
        if (filters?.payment_method) conditions.push(eq(generalLedger.paymentMethod, filters.payment_method))

        const whereClause = and(...conditions)

        const results = await db
            .select({
                method: generalLedger.paymentMethod,
                category: generalLedger.category,
                entryType: generalLedger.entryType,
                debit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
                credit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
                count: count(),
            })
            .from(generalLedger)
            .where(whereClause)
            .groupBy(generalLedger.paymentMethod, generalLedger.category, generalLedger.entryType)

        const methodMap = new Map<string, PaymentMethodCategoryBreakdown>()

        for (const row of results) {
            const methodKey = row.method || 'UNSPECIFIED'
            const methodLabel = row.method ? getAccountingPaymentMethodLabel(row.method) : 'Unspecified'
            const rowDebit = Number(row.debit || 0)
            const rowCredit = Number(row.credit || 0)

            if (!methodMap.has(methodKey)) {
                methodMap.set(methodKey, {
                    method: methodKey,
                    method_label: methodLabel,
                    total_debit: 0,
                    total_credit: 0,
                    net: 0,
                    count: 0,
                    categories: [],
                })
            }

            const methodData = methodMap.get(methodKey)!
            methodData.total_debit += rowDebit
            methodData.total_credit += rowCredit
            methodData.net += rowDebit - rowCredit
            methodData.count += Number(row.count)

            methodData.categories.push({
                category: row.category || 'Uncategorized',
                entry_type: row.entryType as LedgerEntryType,
                total_debit: rowDebit,
                total_credit: rowCredit,
                net: rowDebit - rowCredit,
                count: Number(row.count),
            })
        }

        const breakdown: LedgerDetailBreakdown = {
            by_payment_method: Array.from(methodMap.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
        }

        return success(breakdown)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error fetching ledger detail breakdown: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to fetch ledger detail breakdown')
    }
}
```

**Step 3: Add the import for `PaymentMethodCategoryBreakdown` and `LedgerDetailBreakdown` to the type exports**

In `server/actions/accounting.ts`, ensure the new type is re-exported. The existing pattern already re-exports types from the function. Add the type imports at the top of the file:

```ts
import { LedgerEntry, LedgerEntryType, LedgerSourceType, CreateLedgerEntryPayload, UpdateLedgerEntryPayload, LedgerFilters, LedgerExportType, PaymentMethodCategoryBreakdown, LedgerDetailBreakdown } from '@/utils/types/ledger'
```

**Step 4: Verify build**

Run: `bun run build 2>&1 | tail -20`

**Step 5: Commit**

```bash
git add utils/types/ledger.ts server/actions/accounting.ts
git commit -m "feat(accounting): add LedgerDetailBreakdown server action with payment method category drill-down"
```

---

### Task 2.2: Create the `PaymentMethodDrilldown` component

**Files:**
- Create: `components/accounting/PaymentMethodDrilldown.tsx`

**Step 1: Create the drill-down component**

Create `components/accounting/PaymentMethodDrilldown.tsx`:

```tsx
"use client"

import { useState } from "react"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import {
    ACCOUNTING_PAYMENT_METHOD_COLORS,
    LedgerEntryType,
    PaymentMethodCategoryBreakdown,
} from "@/utils/types/ledger"
import { getAccountingPaymentMethodLabel } from "@/utils/types/payment"

interface PaymentMethodDrilldownProps {
    breakdown: PaymentMethodCategoryBreakdown[]
    currencySymbol: string
    onCategoryClick?: (method: string, category: string, entryType: LedgerEntryType) => void
}

const ENTRY_TYPE_COLORS: Record<LedgerEntryType, string> = {
    EXPENSE: "bg-red-400/20 text-red-300 border-red-400/30",
    REVENUE: "bg-green-400/20 text-green-300 border-green-400/30",
    ASSET: "bg-blue-400/20 text-blue-300 border-blue-400/30",
    LIABILITY: "bg-orange-400/20 text-orange-300 border-orange-400/30",
    EQUITY: "bg-purple-400/20 text-purple-300 border-purple-400/30",
}

function formatAmount(value: number, currencySymbol: string): string {
    const prefix = value >= 0 ? "+" : "-"
    return `${prefix}${currencySymbol}${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

export default function PaymentMethodDrilldown({
    breakdown,
    currencySymbol,
    onCategoryClick,
}: PaymentMethodDrilldownProps) {
    const [expandedMethods, setExpandedMethods] = useState<Set<string>>(new Set())
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

    const toggleMethod = (method: string) => {
        setExpandedMethods((prev) => {
            const next = new Set(prev)
            if (next.has(method)) {
                next.delete(method)
            } else {
                next.add(method)
            }
            return next
        })
    }

    const toggleCategory = (key: string) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev)
            if (next.has(key)) {
                next.delete(key)
            } else {
                next.add(key)
            }
            return next
        })
    }

    return (
        <div className='space-y-2'>
            <h3 className='text-sm font-semibold text-white/60 uppercase tracking-wider'>
                Payment Method Breakdown
            </h3>
            {breakdown.map((pm) => {
                const isExpanded = expandedMethods.has(pm.method)
                const methodColorClass = pm.method !== 'UNSPECIFIED' && pm.method !== null
                    ? (ACCOUNTING_PAYMENT_METHOD_COLORS as Record<string, string>)[pm.method] || 'bg-white/20 text-white/70 border-white/30'
                    : 'bg-white/10 text-white/50 border-white/20'

                return (
                    <div
                        key={pm.method}
                        className='bg-white/5 border border-white/10 rounded-lg overflow-hidden'
                    >
                        <button
                            onClick={() => toggleMethod(pm.method)}
                            className='w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors cursor-pointer'
                        >
                            <div className='flex items-center gap-3'>
                                {isExpanded ? (
                                    <ChevronDownIcon className='w-4 h-4 text-white/60' />
                                ) : (
                                    <ChevronRightIcon className='w-4 h-4 text-white/60' />
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded border ${methodColorClass}`}>
                                    {pm.method_label}
                                </span>
                                <span className='text-sm text-white/60'>
                                    {pm.count} entries
                                </span>
                            </div>
                            <div className='flex items-center gap-4'>
                                <span className='text-xs text-white/40'>
                                    DR {currencySymbol}{pm.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                                <span className='text-xs text-white/40'>
                                    CR {currencySymbol}{pm.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                                <span className={`text-sm font-bold ${pm.net >= 0 ? 'text-red-300' : 'text-green-300'}`}>
                                    {formatAmount(pm.net, currencySymbol)}
                                </span>
                            </div>
                        </button>

                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className='overflow-hidden'
                                >
                                    <div className='px-4 pb-4 space-y-2'>
                                        {pm.categories
                                            .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
                                            .map((cat) => {
                                                const catKey = `${pm.method}-${cat.category}-${cat.entry_type}`
                                                const isCatExpanded = expandedCategories.has(catKey)

                                                return (
                                                    <div
                                                        key={catKey}
                                                        className='bg-white/5 rounded-md border border-white/5'
                                                    >
                                                        <button
                                                            onClick={() => toggleCategory(catKey)}
                                                            className='w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors cursor-pointer'
                                                        >
                                                            <div className='flex items-center gap-2'>
                                                                {isCatExpanded ? (
                                                                    <ChevronDownIcon className='w-3 h-3 text-white/40' />
                                                                ) : (
                                                                    <ChevronRightIcon className='w-3 h-3 text-white/40' />
                                                                )}
                                                                <span className={`text-xs px-1.5 py-0.5 rounded border ${ENTRY_TYPE_COLORS[cat.entry_type]}`}>
                                                                    {cat.entry_type}
                                                                </span>
                                                                <span className='text-sm text-white/80'>
                                                                    {cat.category}
                                                                </span>
                                                                <span className='text-xs text-white/40'>
                                                                    ({cat.count})
                                                                </span>
                                                            </div>
                                                            <div className='flex items-center gap-3'>
                                                                <span className='text-xs text-white/40'>
                                                                    DR {currencySymbol}{cat.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                </span>
                                                                <span className='text-xs text-white/40'>
                                                                    CR {currencySymbol}{cat.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                </span>
                                                                <span className={`text-sm font-semibold ${cat.net >= 0 ? 'text-red-300' : 'text-green-300'}`}>
                                                                    {formatAmount(cat.net, currencySymbol)}
                                                                </span>
                                                            </div>
                                                        </button>

                                                        <AnimatePresence>
                                                            {isCatExpanded && onCategoryClick && (
                                                                <motion.div
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: 'auto', opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    transition={{ duration: 0.15 }}
                                                                    className='overflow-hidden'
                                                                >
                                                                    <div className='px-3 pb-3'>
                                                                        <button
                                                                            onClick={() => onCategoryClick(pm.method, cat.category, cat.entry_type)}
                                                                            className='text-xs text-blue-400 hover:text-blue-300 underline cursor-pointer'
                                                                        >
                                                                            View entries for {cat.category} ({cat.count} entries)
                                                                        </button>
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                )
                                            })}

                                        <div className='flex items-center justify-between pt-2 border-t border-white/10'>
                                            <span className='text-xs font-semibold text-white/50 uppercase'>
                                                Subtotal
                                            </span>
                                            <div className='flex items-center gap-3'>
                                                <span className='text-xs text-white/40'>
                                                    DR {currencySymbol}{pm.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                                <span className='text-xs text-white/40'>
                                                    CR {currencySymbol}{pm.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                                <span className={`text-sm font-bold ${pm.net >= 0 ? 'text-red-300' : 'text-green-300'}`}>
                                                    {formatAmount(pm.net, currencySymbol)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )
            })}
        </div>
    )
}
```

**Step 2: Verify build**

Run: `bun run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add components/accounting/PaymentMethodDrilldown.tsx
git commit -m "feat(accounting): add PaymentMethodDrilldown component with collapsible payment->category drill-down"
```

---

### Task 2.3: Integrate drill-down into the Accounting page

**Files:**
- Modify: `app/accounting/accountingPage.tsx`

**Step 1: Import the new component and server action**

At the top of `app/accounting/accountingPage.tsx`, add imports:

```ts
import PaymentMethodDrilldown from "@/components/accounting/PaymentMethodDrilldown"
import { getLedgerDetailBreakdown, LedgerDetailBreakdown } from "@/server/actions/accounting"
```

**Step 2: Add state for the breakdown data**

After the existing state declarations (~line 156), add:

```ts
const [detailBreakdown, setDetailBreakdown] = useState<LedgerDetailBreakdown | null>(null)
```

**Step 3: Fetch breakdown data alongside existing fetches**

In the `fetchData` callback (~line 171), add a new parallel fetch:

```ts
const [entriesResult, summaryResult, categoriesResult, taxData, breakdownResult] =
    await Promise.all([
        getLedgerEntries({ ... }),
        getLedgerSummary(...),
        getAccountingCategories(false),
        getSetting("currency_tax"),
        getLedgerDetailBreakdown(
            datePreset,
            customStartDate,
            customEndDate,
            currentBranch?.id,
            {
                entry_type: typeFilter || undefined,
                category: categoryFilter || undefined,
                payment_method: paymentMethodFilter || undefined,
            }
        ),
    ])
```

And handle the result (after the summaryResult handling):

```ts
if (breakdownResult.success && breakdownResult.data) {
    setDetailBreakdown(breakdownResult.data)
}
```

**Step 4: Replace the existing payment method breakdown section with the drill-down component**

Replace the entire payment method StatsGrid section (~lines 657-678) with:

```tsx
{detailBreakdown && detailBreakdown.by_payment_method.length > 0 && (
    <PaymentMethodDrilldown
        breakdown={detailBreakdown.by_payment_method}
        currencySymbol={currencySymbol}
        onCategoryClick={(method, category, entryType) => {
            setPaymentMethodFilter(method === 'UNSPECIFIED' ? '' : (method as AccountingPaymentMethod | ''))
            setCategoryFilter(category === 'Uncategorized' ? '' : category)
            setTypeFilter(entryType)
            setPage(1)
        }}
    />
)}
```

**Step 5: Verify build**

Run: `bun run build 2>&1 | tail -20`

**Step 6: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "feat(accounting): integrate PaymentMethodDrilldown component into accounting page"
```

---

## Phase 3: Enhance ExecutiveAccounting Metrics Dashboard

### Task 3.1: Enhance P&L summary with proper accounting format and net income calculation

**Files:**
- Modify: `server/actions/metrics.ts` (extend `PLMetrics` type)
- Modify: `components/metrics/ExecutiveAccounting.tsx`

**Step 1: Extend `PLMetrics` type in `server/actions/metrics.ts`**

Locate the `PLMetrics` type (~line 896) and update:

```ts
export type PLMetrics = {
    revenue: number
    expenses: number
    netProfit: number
    profitMargin: number
    totalDebits: number
    totalCredits: number
    assetTotal: number
    liabilityTotal: number
    equityTotal: number
}
```

**Step 2: Update `getPLMetrics` to compute additional fields**

In the `getPLMetrics` function (~line 903), after the existing `entries.forEach` loop (~line 953-962), add tracking for other account types:

```ts
let revenue = 0
let expenses = 0
let totalDebits = 0
let totalCredits = 0
let assetTotal = 0
let liabilityTotal = 0
let equityTotal = 0

entries.forEach((entry) => {
    const debit = Number(entry.debit) || 0
    const credit = Number(entry.credit) || 0
    totalDebits += debit
    totalCredits += credit

    if (entry.entryType === 'REVENUE') {
        revenue += credit
    } else if (entry.entryType === 'EXPENSE') {
        expenses += debit
    } else if (entry.entryType === 'ASSET') {
        assetTotal += debit - credit
    } else if (entry.entryType === 'LIABILITY') {
        liabilityTotal += credit - debit
    } else if (entry.entryType === 'EQUITY') {
        equityTotal += credit - debit
    }
})

const netProfit = revenue - expenses
const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0

const metrics: PLMetrics = {
    revenue,
    expenses,
    netProfit,
    profitMargin,
    totalDebits,
    totalCredits,
    assetTotal,
    liabilityTotal,
    equityTotal,
}
```

**Step 3: Update `getExecutiveAccountingMetrics` to include the new fields**

In the `getExecutiveAccountingMetrics` function, locate where it constructs the PL data (~line 1250) and ensure the new fields are included. The function already calls `getPLMetrics` and returns its data, so it should automatically include the new fields.

**Step 4: Update the ExecutiveAccounting component to display the enhanced P&L**

In `components/metrics/ExecutiveAccounting.tsx`, add additional MetricCards for the new fields. After the existing 4 MetricCards (~line 199-237), add a second row:

```tsx
<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
    <MetricCard
        title='Total Debits'
        value={plMetrics?.totalDebits ?? 0}
        format='currency'
        icon={<TrendingDownIcon className='text-red-400' size={20} />}
        currencySymbol={currencySymbol}
    />
    <MetricCard
        title='Total Credits'
        value={plMetrics?.totalCredits ?? 0}
        format='currency'
        icon={<TrendingUpIcon className='text-green-400' size={20} />}
        currencySymbol={currencySymbol}
    />
    <MetricCard
        title='Assets (Net)'
        value={plMetrics?.assetTotal ?? 0}
        format='currency'
        icon={<DollarSignIcon className='text-blue-400' size={20} />}
        currencySymbol={currencySymbol}
    />
    <MetricCard
        title='Liabilities (Net)'
        value={plMetrics?.liabilityTotal ?? 0}
        format='currency'
        icon={<DollarSignIcon className='text-orange-400' size={20} />}
        currencySymbol={currencySymbol}
    />
</div>
```

**Step 5: Verify build**

Run: `bun run build 2>&1 | tail -20`

**Step 6: Commit**

```bash
git add server/actions/metrics.ts components/metrics/ExecutiveAccounting.tsx
git commit -m "feat(metrics): enhance P&L with total debits/credits, assets, and liabilities"
```

---

### Task 3.2: Add payment method drill-down to ExecutiveAccounting

**Files:**
- Modify: `server/actions/accounting.ts` (re-export new types)
- Modify: `components/metrics/ExecutiveAccounting.tsx`

**Step 1: Import and use PaymentMethodDrilldown in ExecutiveAccounting**

In `components/metrics/ExecutiveAccounting.tsx`, add imports:

```ts
import PaymentMethodDrilldown from "@/components/accounting/PaymentMethodDrilldown"
import { getLedgerDetailBreakdown, LedgerDetailBreakdown } from "@/server/actions/accounting"
```

**Step 2: Add state for the detail breakdown**

After the existing state declarations (~line 79), add:

```ts
const [detailBreakdown, setDetailBreakdown] = useState<LedgerDetailBreakdown | null>(null)
```

**Step 3: Fetch the breakdown data alongside existing fetches**

In the `fetchData` callback, add the breakdown fetch:

```ts
const [metricsResult, summaryResult, breakdownResult] = await Promise.allSettled([
    getExecutiveAccountingMetrics(startDate, endDate, branchId),
    getLedgerSummary(timeframe, startDate, endDate, branchId),
    getLedgerDetailBreakdown(
        timeframe === 'custom' ? undefined : timeframe,
        timeframe === 'custom' ? startDate : undefined,
        timeframe === 'custom' ? endDate : undefined,
        branchId
    ),
])
```

And handle the result:

```ts
if (breakdownResult.status === "fulfilled" && breakdownResult.value.success && breakdownResult.value.data) {
    setDetailBreakdown(breakdownResult.value.data)
}
```

**Step 4: Replace the existing payment method breakdown with the drill-down**

Replace the existing "By Payment Method" section (~lines 240-256) with:

```tsx
{detailBreakdown && detailBreakdown.by_payment_method.length > 0 && (
    <PaymentMethodDrilldown
        breakdown={detailBreakdown.by_payment_method}
        currencySymbol={currencySymbol}
    />
)}
```

**Step 5: Verify build**

Run: `bun run build 2>&1 | tail -20`

**Step 6: Commit**

```bash
git add components/metrics/ExecutiveAccounting.tsx
git commit -m "feat(metrics): replace static payment method cards with interactive drill-down in ExecutiveAccounting"
```

---

### Task 3.3: Add accounting type breakdown section with proper +/- formatting

**Files:**
- Modify: `app/accounting/accountingPage.tsx`

**Step 1: Add an account type breakdown section after the summary stats**

After the summary StatsGrid (~line 654), add a new section showing each account type with +/- signage:

```tsx
{summary && summary.by_type && summary.by_type.length > 0 && (
    <div className='bg-white/5 border border-white/10 rounded-lg p-4'>
        <h3 className='text-sm font-semibold text-white/60 uppercase tracking-wider mb-3'>
            Breakdown by Account Type
        </h3>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3'>
            {summary.by_type.map((bt) => {
                const net = bt.debit - bt.credit
                const isDebit = net >= 0
                return (
                    <div key={bt.type} className='bg-white/5 rounded-md p-3'>
                        <span className={`text-xs px-2 py-0.5 rounded border ${ENTRY_TYPE_COLORS[bt.type]}`}>
                            {bt.type}
                        </span>
                        <p className={`text-lg font-bold mt-2 ${isDebit ? 'text-red-300' : 'text-green-300'}`}>
                            {isDebit ? '+' : '-'}{currencySymbol}{Math.abs(net).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                        <p className='text-xs text-white/40 mt-1'>
                            DR {currencySymbol}{bt.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })} | CR {currencySymbol}{bt.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                )
            })}
        </div>
    </div>
)}
```

**Step 2: Verify build**

Run: `bun run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add app/accounting/accountingPage.tsx
git commit -m "feat(accounting): add account type breakdown section with proper +/- signage"
```

---

## Phase 4: Accounting Professional Improvements

### Task 4.1: Add accounting period period-to-period comparison support

**Files:**
- Modify: `server/actions/metrics.ts` (add comparison function)
- Modify: `components/metrics/ExecutiveAccounting.tsx`

**Step 1: Add period-over-period comparison to PLMetrics**

In `server/actions/metrics.ts`, update the `PLMetrics` type to include previous period:

```ts
export type PLMetrics = {
    revenue: number
    expenses: number
    netProfit: number
    profitMargin: number
    totalDebits: number
    totalCredits: number
    assetTotal: number
    liabilityTotal: number
    equityTotal: number
    previousPeriod?: {
        revenue: number
        expenses: number
        netProfit: number
    }
}
```

**Step 2: Compute previous period in `getPLMetrics`**

After computing the current period metrics, compute the same period shifted back by one interval:

```ts
const previousStart = new Date(start)
const previousEnd = new Date(end)
const duration = end.getTime() - start.getTime()
previousStart.setTime(previousStart.getTime() - duration)
previousEnd.setTime(previousEnd.getTime() - duration)

const prevConditions: SQL<unknown>[] = [
    eq(generalLedger.isVoided, false),
    gte(generalLedger.entryDate, previousStart),
    lte(generalLedger.entryDate, previousEnd),
]

if (branchId) {
    const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
    if (branchCondition) prevConditions.push(branchCondition)
}

const prevEntries = await db
    .select({
        entryType: generalLedger.entryType,
        debit: generalLedger.debit,
        credit: generalLedger.credit,
    })
    .from(generalLedger)
    .where(and(...prevConditions))

let prevRevenue = 0
let prevExpenses = 0

prevEntries.forEach((entry) => {
    const debit = Number(entry.debit) || 0
    const credit = Number(entry.credit) || 0
    if (entry.entryType === 'REVENUE') prevRevenue += credit
    else if (entry.entryType === 'EXPENSE') prevExpenses += debit
})

const previousPeriod = {
    revenue: prevRevenue,
    expenses: prevExpenses,
    netProfit: prevRevenue - prevExpenses,
}
```

Then include `previousPeriod` in the returned metrics object.

**Step 3: Display comparison in ExecutiveAccounting**

In `components/metrics/ExecutiveAccounting.tsx`, add trend values to the P&L MetricCards. For each card, compute the change from previous period:

```tsx
<MetricCard
    title='Total Revenue'
    value={plMetrics?.revenue ?? 0}
    format='currency'
    icon={<TrendingUpIcon className='text-green-400' size={20} />}
    currencySymbol={currencySymbol}
    trend={((plMetrics?.revenue ?? 0) >= (plMetrics?.previousPeriod?.revenue ?? 0)) ? 'up' : 'down'}
    trendValue={plMetrics?.previousPeriod ? `${((plMetrics?.revenue ?? 0) - (plMetrics.previousPeriod.revenue)) >= 0 ? '+' : ''}${currencySymbol}${Math.abs((plMetrics?.revenue ?? 0) - (plMetrics.previousPeriod.revenue)).toLocaleString(undefined, { minimumFractionDigits: 2 })} vs prev` : undefined}
/>
```

Similarly for Total Expenses and Net Profit.

**Step 4: Verify build**

Run: `bun run build 2>&1 | tail -20`

**Step 5: Commit**

```bash
git add server/actions/metrics.ts components/metrics/ExecutiveAccounting.tsx
git commit -m "feat(metrics): add period-over-period comparison for P&L metrics"
```

---

### Task 4.2: Add trial balance view to the accounting page

**Files:**
- Create: `components/accounting/TrialBalance.tsx`
- Modify: `app/accounting/accountingPage.tsx`

**Step 1: Create the TrialBalance component**

Create `components/accounting/TrialBalance.tsx`:

```tsx
"use client"

import { useState } from "react"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { LedgerEntryType } from "@/utils/types/ledger"

interface TrialBalanceRow {
    type: LedgerEntryType
    category: string
    total_debit: number
    total_credit: number
}

interface TrialBalanceProps {
    data: TrialBalanceRow[]
    currencySymbol: string
}

const ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
    EXPENSE: "Expenses",
    REVENUE: "Revenue",
    ASSET: "Assets",
    LIABILITY: "Liabilities",
    EQUITY: "Equity",
}

const ENTRY_TYPE_COLORS: Record<LedgerEntryType, string> = {
    EXPENSE: "bg-red-400/20 text-red-300 border-red-400/30",
    REVENUE: "bg-green-400/20 text-green-300 border-green-400/30",
    ASSET: "bg-blue-400/20 text-blue-300 border-blue-400/30",
    LIABILITY: "bg-orange-400/20 text-orange-300 border-orange-400/30",
    EQUITY: "bg-purple-400/20 text-purple-300 border-purple-400/30",
}

export default function TrialBalance({ data, currencySymbol }: TrialBalanceProps) {
    const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())

    const toggleType = (type: string) => {
        setExpandedTypes((prev) => {
            const next = new Set(prev)
            if (next.has(type)) next.delete(type)
            else next.add(type)
            return next
        })
    }

    const grouped = Object.groupBy(data, (row) => row.type)
    const typeOrder: LedgerEntryType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']

    const totalDebits = data.reduce((sum, row) => sum + row.total_debit, 0)
    const totalCredits = data.reduce((sum, row) => sum + row.total_credit, 0)
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

    return (
        <div className='bg-white/5 border border-white/10 rounded-lg overflow-hidden'>
            <div className='px-4 py-3 bg-white/5 border-b border-white/10 flex items-center justify-between'>
                <h3 className='text-sm font-semibold text-white/60 uppercase tracking-wider'>
                    Trial Balance
                </h3>
                <span className={`text-xs px-2 py-1 rounded ${isBalanced ? 'bg-green-400/20 text-green-300' : 'bg-red-400/20 text-red-300'}`}>
                    {isBalanced ? 'Balanced' : `Difference: ${currencySymbol}${Math.abs(totalDebits - totalCredits).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                </span>
            </div>

            <table className='w-full'>
                <thead>
                    <tr className='text-xs text-white/50 border-b border-white/10'>
                        <th className='text-left px-4 py-2'>Account</th>
                        <th className='text-right px-4 py-2'>Debit</th>
                        <th className='text-right px-4 py-2'>Credit</th>
                    </tr>
                </thead>
                <tbody>
                    {typeOrder.map((type) => {
                        const rows = grouped[type]
                        if (!rows || rows.length === 0) return null

                        const typeDebit = rows.reduce((sum, r) => sum + r.total_debit, 0)
                        const typeCredit = rows.reduce((sum, r) => sum + r.total_credit, 0)
                        const isExpanded = expandedTypes.has(type)

                        return (
                            <tbody key={type}>
                                <tr
                                    onClick={() => toggleType(type)}
                                    className='bg-white/5 cursor-pointer hover:bg-white/10 transition-colors'
                                >
                                    <td className='px-4 py-2'>
                                        <div className='flex items-center gap-2'>
                                            {isExpanded ? (
                                                <ChevronDownIcon className='w-3 h-3 text-white/40' />
                                            ) : (
                                                <ChevronRightIcon className='w-3 h-3 text-white/40' />
                                            )}
                                            <span className={`text-xs px-2 py-0.5 rounded border ${ENTRY_TYPE_COLORS[type]}`}>
                                                {ENTRY_TYPE_LABELS[type]}
                                            </span>
                                        </div>
                                    </td>
                                    <td className='text-right px-4 py-2 text-sm font-mono text-red-300'>
                                        {currencySymbol}{typeDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className='text-right px-4 py-2 text-sm font-mono text-green-300'>
                                        {currencySymbol}{typeCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                                {isExpanded && rows
                                    .sort((a, b) => Math.abs(b.total_debit + b.total_credit) - Math.abs(a.total_debit + a.total_credit))
                                    .map((row) => (
                                        <tr key={`${row.type}-${row.category}`} className='border-b border-white/5 hover:bg-white/5'>
                                            <td className='px-4 py-1.5 pl-10 text-sm text-white/70'>
                                                {row.category}
                                            </td>
                                            <td className='text-right px-4 py-1.5 text-sm font-mono text-red-300/70'>
                                                {row.total_debit > 0 ? `${currencySymbol}${row.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                            </td>
                                            <td className='text-right px-4 py-1.5 text-sm font-mono text-green-300/70'>
                                                {row.total_credit > 0 ? `${currencySymbol}${row.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        )
                    })}
                </tbody>
                <tfoot>
                    <tr className='bg-white/10 border-t-2 border-white/20 font-bold'>
                        <td className='px-4 py-2 text-sm'>Total</td>
                        <td className='text-right px-4 py-2 text-sm font-mono text-red-300'>
                            {currencySymbol}{totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className='text-right px-4 py-2 text-sm font-mono text-green-300'>
                            {currencySymbol}{totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    )
}
```

**Step 2: Add server action for trial balance data**

In `server/actions/accounting.ts`, add a new function after `getLedgerDetailBreakdown`:

```ts
export interface TrialBalanceRow {
    type: LedgerEntryType
    category: string
    total_debit: number
    total_credit: number
}

export async function getTrialBalance(
    datePreset?: DateRangePreset,
    startDate?: string,
    endDate?: string,
    branchId?: string
): Promise<ActionResponse<TrialBalanceRow[]>> {
    const user = await getCurrentUser()
    if (!user) return failure('Unauthorized')

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) return failure('Access denied')

    try {
        let dateFrom: Date | undefined
        let dateTo: Date | undefined

        if (datePreset && datePreset !== 'all') {
            const dateRange = getDateRangeFromPreset(datePreset)
            if (dateRange) {
                dateFrom = dateRange.start
                dateTo = dateRange.end
            }
        } else if (startDate && endDate) {
            dateFrom = new Date(startDate)
            dateTo = new Date(endDate)
        }

        const conditions: SQL<unknown>[] = [eq(generalLedger.isVoided, false)]
        if (dateFrom) conditions.push(gte(generalLedger.entryDate, dateFrom!))
        if (dateTo) conditions.push(lte(generalLedger.entryDate, dateTo!))
        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        const results = await db
            .select({
                type: generalLedger.entryType,
                category: generalLedger.category,
                debit: sql<number>`COALESCE(SUM(CAST(${generalLedger.debit} AS NUMERIC)), 0)`,
                credit: sql<number>`COALESCE(SUM(CAST(${generalLedger.credit} AS NUMERIC)), 0)`,
            })
            .from(generalLedger)
            .where(and(...conditions))
            .groupBy(generalLedger.entryType, generalLedger.category)

        const rows: TrialBalanceRow[] = results.map((row) => ({
            type: row.type as LedgerEntryType,
            category: row.category || 'Uncategorized',
            total_debit: Number(row.debit || 0),
            total_credit: Number(row.credit || 0),
        }))

        return success(rows)
    } catch (error) {
        await logError({
            type: 'ACCOUNTING',
            message: `Error fetching trial balance: ${error instanceof Error ? error.message : String(error)}`
        })
        return failure('Failed to fetch trial balance')
    }
}
```

**Step 3: Integrate TrialBalance into the accounting page**

In `app/accounting/accountingPage.tsx`, add the import and state:

```ts
import TrialBalance from "@/components/accounting/TrialBalance"
import { getTrialBalance, TrialBalanceRow } from "@/server/actions/accounting"
```

Add state:
```ts
const [trialBalanceData, setTrialBalanceData] = useState<TrialBalanceRow[]>([])
```

Add to the parallel fetch in `fetchData`:
```ts
const [entriesResult, summaryResult, categoriesResult, taxData, breakdownResult, trialResult] =
    await Promise.all([
        // ... existing fetches ...,
        getTrialBalance(datePreset, customStartDate, customEndDate, currentBranch?.id),
    ])
```

Handle result:
```ts
if (trialResult.success && trialResult.data) {
    setTrialBalanceData(trialResult.data)
}
```

Render below the drill-down section:
```tsx
{trialBalanceData.length > 0 && (
    <TrialBalance data={trialBalanceData} currencySymbol={currencySymbol} />
)}
```

**Step 4: Verify build**

Run: `bun run build 2>&1 | tail -20`

**Step 5: Commit**

```bash
git add components/accounting/TrialBalance.tsx server/actions/accounting.ts app/accounting/accountingPage.tsx
git commit -m "feat(accounting): add Trial Balance view with collapsible account type grouping"
```

---

### Task 4.3: Add revenue breakdown by category (like expense breakdown, but for revenue)

**Files:**
- Modify: `server/actions/metrics.ts` (add revenue breakdown)
- Modify: `components/metrics/ExecutiveAccounting.tsx`

**Step 1: Add revenue breakdown type and function in `server/actions/metrics.ts`**

After `ExpenseBreakdownItem` (line ~988), add:

```ts
export type RevenueBreakdownItem = {
    category: string
    amount: number
    percentage: number
}

export async function getRevenueBreakdown(
    startDate: string,
    endDate: string,
    branchId?: string
): Promise<ActionResponse<RevenueBreakdownItem[]>> {
    const user = await getCurrentUser()
    if (!user) return failure('Not authenticated')

    const hasAccess = await canAccessAccounting(user)
    if (!hasAccess) return failure('Access denied')

    try {
        const cacheKey = `revenue_breakdown:${startDate}:${endDate}:${branchId || 'all'}`
        const cached = cache.get<RevenueBreakdownItem[]>(cacheKey)
        if (cached) return success(cached)

        const start = new Date(startDate)
        const end = new Date(endDate)

        const conditions: SQL<unknown>[] = [
            eq(generalLedger.isVoided, false),
            eq(generalLedger.entryType, 'REVENUE'),
            gte(generalLedger.entryDate, start),
            lte(generalLedger.entryDate, end),
        ]

        if (branchId) {
            const branchCondition = or(eq(generalLedger.branchId, branchId!), isNull(generalLedger.branchId))
            if (branchCondition) conditions.push(branchCondition)
        }

        const entries = await db
            .select({
                category: generalLedger.category,
                credit: sql<number>`SUM(CAST(${generalLedger.credit} AS NUMERIC))`,
            })
            .from(generalLedger)
            .where(and(...conditions))
            .groupBy(generalLedger.category)

        const totalRevenue = entries.reduce((sum, entry) => sum + Number(entry.credit || 0), 0)

        const breakdown: RevenueBreakdownItem[] = entries.map((entry) => ({
            category: entry.category || 'Uncategorized',
            amount: Number(entry.credit || 0),
            percentage: totalRevenue > 0 ? (Number(entry.credit || 0) / totalRevenue) * 100 : 0,
        })).sort((a, b) => b.amount - a.amount)

        cache.set(cacheKey, breakdown, METRICS_CACHE_TTL)
        return success(breakdown)
    } catch (error) {
        createLogs({ logs: [{ level: 'ERROR', type: 'SYSTEM', message: `Error fetching revenue breakdown: ${error}` }] })
        return failure(error instanceof Error ? error.message : 'Failed to fetch revenue breakdown')
    }
}
```

**Step 2: Add revenue breakdown to ExecutiveAccounting dashboard**

In `components/metrics/ExecutiveAccounting.tsx`:
1. Import `getRevenueBreakdown`
2. Add state: `const [revenueBreakdown, setRevenueBreakdown] = useState<RevenueBreakdownItem[]>([])`
3. Fetch in `fetchData`
4. Add a revenue breakdown section (similar to expense breakdown) with a pie chart and detail list

**Step 3: Verify build**

Run: `bun run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add server/actions/metrics.ts components/metrics/ExecutiveAccounting.tsx
git commit -m "feat(metrics): add revenue breakdown by category with pie chart"
```

---

### Task 4.4: Add cash flow summary section

**Files:**
- Modify: `components/metrics/ExecutiveAccounting.tsx`
- Modify: `server/actions/metrics.ts`

**Step 1: Add cash flow calculation to `getExecutiveAccountingMetrics`**

In the return type of `getExecutiveAccountingMetrics`, add:

```ts
export type ExecutiveAccountingData = {
    pl: PLMetrics
    expenseBreakdown: ExpenseBreakdownItem[]
    revenueBreakdown: RevenueBreakdownItem[]
    trend: RevenueExpenseTrendItem[]
    cashFlow: {
        cashIn: number
        cashOut: number
        netCashFlow: number
    }
}
```

In the function, compute:
```ts
const cashIn = plMetrics.revenue + (plMetrics.assetTotal > 0 ? 0 : Math.abs(plMetrics.assetTotal))
const cashOut = plMetrics.expenses + plMetrics.liabilityTotal
const netCashFlow = cashIn - cashOut

const data: ExecutiveAccountingData = {
    pl: plMetrics,
    expenseBreakdown,
    revenueBreakdown,
    trend,
    cashFlow: { cashIn, cashOut, netCashFlow },
}
```

**Step 2: Display cash flow in ExecutiveAccounting**

Add 3 MetricCards for Cash In, Cash Out, Net Cash Flow:

```tsx
<section className='flex flex-col gap-4'>
    <h2 className='text-xl font-bold flex items-center gap-2'>
        <DollarSignIcon className='text-emerald-400' /> Cash Flow Summary
    </h2>
    <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        <MetricCard title='Cash In' value={data.cashFlow.cashIn} format='currency' icon={<TrendingUpIcon className='text-green-400' size={20} />} currencySymbol={currencySymbol} />
        <MetricCard title='Cash Out' value={data.cashFlow.cashOut} format='currency' icon={<TrendingDownIcon className='text-red-400' size={20} />} currencySymbol={currencySymbol} />
        <MetricCard title='Net Cash Flow' value={data.cashFlow.netCashFlow} format='currency' icon={<DollarSignIcon className={data.cashFlow.netCashFlow >= 0 ? 'text-green-400' : 'text-red-400'} size={20} />} currencySymbol={currencySymbol} />
    </div>
</section>
```

**Step 3: Verify build**

Run: `bun run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add server/actions/metrics.ts components/metrics/ExecutiveAccounting.tsx
git commit -m "feat(metrics): add cash flow summary cards to ExecutiveAccounting"
```

---

## Phase 5: Fix All Lint, Build Errors, Issues, and Warnings

### Task 5.1: Run full lint and fix all issues

**Step 1: Run lint**

Run: `bun run lint 2>&1`

**Step 2: Fix any lint errors found**

If there are lint errors, fix them. Common issues:
- Unused imports (remove them)
- Unused variables (remove or prefix with `_`)
- Missing return type annotations (add explicit types)
- `console.log` statements (remove or replace with `createLogs`)

**Step 3: Run lint again to confirm clean**

Run: `bun run lint 2>&1`
Expected: No errors

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix all lint errors and warnings"
```

---

### Task 5.2: Run full build and fix all build issues

**Step 1: Run build**

Run: `bun run build 2>&1`

**Step 2: Fix any build errors**

Common issues:
- Type mismatches from new fields
- Missing imports
- Incorrect prop types from new components

**Step 3: Run build again to confirm clean**

Run: `bun run build 2>&1`
Expected: Build succeeds with no errors

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix all build errors and type issues"
```

---

### Task 5.3: Final verification - full lint + build + typecheck

**Step 1: Run lint**

Run: `bun run lint 2>&1`

**Step 2: Run build**

Run: `bun run build 2>&1`

**Step 3: Verify all pages load correctly**

Check that:
- `/accounting` page loads with the new drill-down and trial balance
- `/accounting/categories` page still works
- `/metrics` page loads with the enhanced ExecutiveAccounting

**Step 4: Final commit if any remaining issues**

```bash
git add -A
git commit -m "chore: final verification and cleanup"
```

---

## Summary of All Changes

| Phase | Description | Key Files |
|-------|-------------|-----------|
| 1.1 | Fix payment method +/- signage on accounting page | `app/accounting/accountingPage.tsx` |
| 1.2 | Fix payment method +/- on ExecutiveAccounting | `components/metrics/ExecutiveAccounting.tsx` |
| 1.3 | Fix balance display with DR/CR labels | `app/accounting/accountingPage.tsx` |
| 2.1 | Create LeadgerDetailBreakdown server action | `server/actions/accounting.ts`, `utils/types/ledger.ts` |
| 2.2 | Create PaymentMethodDrilldown component | `components/accounting/PaymentMethodDrilldown.tsx` |
| 2.3 | Integrate drill-down into accounting page | `app/accounting/accountingPage.tsx` |
| 3.1 | Enhance P&L with new fields | `server/actions/metrics.ts`, `components/metrics/ExecutiveAccounting.tsx` |
| 3.2 | Add drill-down to ExecutiveAccounting | `components/metrics/ExecutiveAccounting.tsx` |
| 3.3 | Add account type breakdown section | `app/accounting/accountingPage.tsx` |
| 4.1 | Period-over-period comparison | `server/actions/metrics.ts`, `components/metrics/ExecutiveAccounting.tsx` |
| 4.2 | Trial balance view | `components/accounting/TrialBalance.tsx`, `server/actions/accounting.ts`, `app/accounting/accountingPage.tsx` |
| 4.3 | Revenue breakdown by category | `server/actions/metrics.ts`, `components/metrics/ExecutiveAccounting.tsx` |
| 4.4 | Cash flow summary | `server/actions/metrics.ts`, `components/metrics/ExecutiveAccounting.tsx` |
| 5.1-5.3 | Lint/build fixes and verification | Various files |